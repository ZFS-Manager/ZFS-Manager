use std::sync::atomic::Ordering;
use redis::AsyncCommands;
use tokio::time::{interval, Duration, Instant};
use tracing::{info, warn};

async fn check_and_trigger_notifications(state: &crate::state::AppState) {
    let _pg = match &state.pg {
        Some(pg) => pg,
        None => return,
    };

    // Very basic placeholder logic for periodic checks.
    // In a full implementation, you would:
    // 1. Check zpool status for unhealthy pools.
    // 2. Fetch active notification rules from pg.
    // 3. If a rule condition is met, insert a notification log and trigger webhook/discord channels.
}

fn read_cpu_jiffies() -> (u64, u64) {
    let content = std::fs::read_to_string("/proc/stat").unwrap_or_default();
    for line in content.lines() {
        if line.starts_with("cpu ") {
            let vals: Vec<u64> = line
                .split_whitespace()
                .skip(1)
                .map(|s| s.parse().unwrap_or(0))
                .collect();
            let idle = vals.get(3).copied().unwrap_or(0)
                + vals.get(4).copied().unwrap_or(0);
            let total: u64 = vals.iter().sum();
            return (total, idle);
        }
    }
    (0, 0)
}

fn read_arc_hit_ratio() -> f64 {
    let raw = std::fs::read_to_string("/proc/spl/kstat/zfs/arcstats").unwrap_or_default();
    let mut hits: u64 = 0;
    let mut misses: u64 = 0;
    for line in raw.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            match parts[0] {
                "hits"   => hits   = parts[2].parse().unwrap_or(0),
                "misses" => misses = parts[2].parse().unwrap_or(0),
                _ => {}
            }
        }
    }
    let total = hits + misses;
    if total > 0 { (hits as f64 / total as f64) * 100.0 } else { 0.0 }
}

async fn get_pool_names() -> Vec<String> {
    let output = tokio::process::Command::new("zpool")
        .args(["list", "-H", "-o", "name"])
        .output()
        .await;
    match output {
        Ok(out) if out.status.success() => {
            String::from_utf8_lossy(&out.stdout)
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        }
        Ok(out) => {
            warn!("zpool list failed: {}", String::from_utf8_lossy(&out.stderr).trim());
            vec![]
        }
        Err(e) => {
            warn!("zpool command not found or failed: {e}");
            vec![]
        }
    }
}

/// Returns (alloc_gb, free_gb, iops, read_bw_mb, write_bw_mb, read_bw_bytes, write_bw_bytes)
async fn get_pool_iostat(pool: &str) -> Option<(f64, f64, f64, f64, f64, f64, f64)> {
    let output = tokio::process::Command::new("zpool")
        .args(["iostat", "-H", "-p", pool, "1", "2"])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let last_line = stdout
                .lines()
                .rfind(|l| !l.trim().is_empty())?
                .to_string();

            let cols: Vec<&str> = last_line.split('\t').collect();
            if cols.len() < 7 {
                return None;
            }
            let alloc_bytes: f64     = cols[1].parse().unwrap_or(0.0);
            let free_bytes: f64      = cols[2].parse().unwrap_or(0.0);
            let read_ops: f64        = cols[3].parse().unwrap_or(0.0);
            let write_ops: f64       = cols[4].parse().unwrap_or(0.0);
            let read_bw_bytes: f64   = cols[5].parse().unwrap_or(0.0);
            let write_bw_bytes: f64  = cols[6].parse().unwrap_or(0.0);

            let alloc_gb   = alloc_bytes / 1_073_741_824.0;
            let free_gb    = free_bytes  / 1_073_741_824.0;
            let iops       = read_ops + write_ops;
            let read_bw_mb = read_bw_bytes  / 1_048_576.0;
            let write_bw_mb= write_bw_bytes / 1_048_576.0;

            Some((alloc_gb, free_gb, iops, read_bw_mb, write_bw_mb, read_bw_bytes, write_bw_bytes))
        }
        Ok(out) => {
            warn!("zpool iostat failed for {pool}: {}", String::from_utf8_lossy(&out.stderr).trim());
            None
        }
        Err(e) => {
            warn!("zpool iostat error for {pool}: {e}");
            None
        }
    }
}

async fn push_to_redis(
    redis: &mut redis::aio::ConnectionManager,
    key_pending: &str,
    key_latest: &str,
    payload: &str,
) {
    let rpush_result: redis::RedisResult<i64> = redis.rpush(key_pending, payload).await;
    if let Err(e) = rpush_result {
        warn!("Redis RPUSH failed: {e}");
        return;
    }
    let ltrim_result: redis::RedisResult<()> = redis.ltrim(key_pending, -2000, -1).await;
    if let Err(e) = ltrim_result {
        warn!("Redis LTRIM failed: {e}");
    }
    let set_result: redis::RedisResult<()> = redis.set_ex(key_latest, payload, 30u64).await;
    if let Err(e) = set_result {
        warn!("Redis SET failed for latest key: {e}");
    }
}

async fn sync_redis_to_postgres(
    redis: &mut redis::aio::ConnectionManager,
    pg: &tokio_postgres::Client,
    key_pending: &str,
    write_counter: &mut u64,
) {
    let count_result: redis::RedisResult<i64> = redis.llen(key_pending).await;
    let count = match count_result {
        Ok(n) => n,
        Err(e) => { warn!("Redis LLEN failed: {e}"); return; }
    };
    if count == 0 {
        return;
    }

    let items_result: redis::RedisResult<Vec<String>> =
        redis.lrange(key_pending, 0, (count - 1) as isize).await;
    let items = match items_result {
        Ok(v) => v,
        Err(e) => { warn!("Redis LRANGE failed: {e}"); return; }
    };

    // Batch insert: collect all valid rows, then insert in one statement
    struct MetricRow {
        pool_name: String,
        read_bw_mb: f64,
        write_bw_mb: f64,
        iops: f64,
        alloc_gb: f64,
        free_gb: f64,
        cpu_percent: f64,
        arc_hit_ratio: f64,
    }

    let mut rows: Vec<MetricRow> = Vec::with_capacity(items.len());
    for item in &items {
        let v: serde_json::Value = match serde_json::from_str(item) {
            Ok(val) => val,
            Err(e)  => { warn!("Failed to parse metric JSON: {e}"); continue; }
        };
        rows.push(MetricRow {
            pool_name:     v["pool_name"].as_str().unwrap_or("").to_string(),
            read_bw_mb:    v["read_bw_mb"].as_f64().unwrap_or(0.0),
            write_bw_mb:   v["write_bw_mb"].as_f64().unwrap_or(0.0),
            iops:          v["iops"].as_f64().unwrap_or(0.0),
            alloc_gb:      v["alloc_gb"].as_f64().unwrap_or(0.0),
            free_gb:       v["free_gb"].as_f64().unwrap_or(0.0),
            cpu_percent:   v["cpu_percent"].as_f64().unwrap_or(0.0),
            arc_hit_ratio: v["arc_hit_ratio"].as_f64().unwrap_or(0.0),
        });
    }

    if rows.is_empty() {
        return;
    }

    // Build a single parameterised multi-row INSERT
    let mut param_idx = 1usize;
    let mut placeholders: Vec<String> = Vec::with_capacity(rows.len());
    for _ in &rows {
        placeholders.push(format!(
            "(${}, ${}, ${}, ${}, ${}, ${}, ${}, ${})",
            param_idx, param_idx+1, param_idx+2, param_idx+3,
            param_idx+4, param_idx+5, param_idx+6, param_idx+7
        ));
        param_idx += 8;
    }

    let sql = format!(
        "INSERT INTO zfs_metrics \
         (pool_name, read_bw_mb, write_bw_mb, iops, alloc_gb, free_gb, cpu_percent, arc_hit_ratio) \
         VALUES {}",
        placeholders.join(", ")
    );

    // Build dynamic param list (tokio-postgres requires &dyn ToSql)
    let mut params: Vec<Box<dyn tokio_postgres::types::ToSql + Sync + Send>> = Vec::with_capacity(rows.len() * 8);
    for r in &rows {
        params.push(Box::new(r.pool_name.clone()));
        params.push(Box::new(r.read_bw_mb));
        params.push(Box::new(r.write_bw_mb));
        params.push(Box::new(r.iops));
        params.push(Box::new(r.alloc_gb));
        params.push(Box::new(r.free_gb));
        params.push(Box::new(r.cpu_percent));
        params.push(Box::new(r.arc_hit_ratio));
    }

    let param_refs: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> =
        params.iter().map(|b| b.as_ref() as &(dyn tokio_postgres::types::ToSql + Sync)).collect();

    match pg.execute(sql.as_str(), param_refs.as_slice()).await {
        Ok(n) => {
            *write_counter += n as u64;
            info!("Batch-inserted {n} metric rows (total writes: {})", write_counter);
        }
        Err(e) => warn!("Batch INSERT into zfs_metrics failed: {e}"),
    }

    let ltrim_result: redis::RedisResult<()> = redis.ltrim(key_pending, count as isize, -1).await;
    if let Err(e) = ltrim_result {
        warn!("Redis LTRIM after sync failed: {e}");
    }
}

/// Delete metrics older than 30 days and warn if the table is unexpectedly large.
async fn enforce_retention(pg: &tokio_postgres::Client) {
    match pg.execute(
        "DELETE FROM zfs_metrics WHERE collected_at < NOW() - INTERVAL '30 days'",
        &[],
    ).await {
        Ok(deleted) if deleted > 0 => info!("Retention: removed {deleted} expired metric rows"),
        Ok(_) => {}
        Err(e) => warn!("Retention DELETE failed: {e}"),
    }

    match pg.query_one("SELECT COUNT(*) FROM zfs_metrics", &[]).await {
        Ok(row) => {
            let count: i64 = row.get(0);
            if count > 500_000 {
                warn!("zfs_metrics table has {count} rows — consider shortening retention or the collection interval");
            }
        }
        Err(e) => warn!("Failed to check zfs_metrics row count: {e}"),
    }
}

/// Fast 500ms loop: reads CPU% and ARC hit-ratio from /proc, computes cumulative
/// I/O totals from atomic counters, writes to `zfs:live:snapshot` in Redis.
async fn run_live_loop(state: crate::state::AppState) {
    let mut ticker = interval(Duration::from_millis(500));
    let mut t1 = (0u64, 0u64);

    loop {
        ticker.tick().await;

        let t2 = read_cpu_jiffies();
        let cpu_percent = if t2.0 > t1.0 {
            let dt = (t2.0 - t1.0) as f64;
            let di = t2.1.saturating_sub(t1.1) as f64;
            ((dt - di) / dt * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };
        t1 = t2;

        let arc_hit_ratio = read_arc_hit_ratio();

        let total_read_bytes  = state.total_read_bytes.load(Ordering::Relaxed);
        let total_write_bytes = state.total_write_bytes.load(Ordering::Relaxed);
        let total_read_mb  = total_read_bytes  as f64 / 1_048_576.0;
        let total_write_mb = total_write_bytes as f64 / 1_048_576.0;

        let payload = serde_json::json!({
            "cpu_percent":    cpu_percent,
            "arc_hit_ratio":  arc_hit_ratio,
            "total_read_mb":  total_read_mb,
            "total_write_mb": total_write_mb,
        });

        if let Some(ref redis_conn) = state.redis {
            let mut conn = redis_conn.clone();
            if let Ok(json_str) = serde_json::to_string(&payload) {
                let set_result: redis::RedisResult<()> =
                    conn.set_ex("zfs:live:snapshot", json_str, 5u64).await;
                if let Err(e) = set_result {
                    warn!("Redis SET zfs:live:snapshot failed: {e}");
                }
            }
        }
    }
}

/// Slow 5s loop: collects iostat per pool, pushes to Redis list + syncs to Postgres,
/// and accumulates bytes into AppState atomics so the fast loop can report totals.
///
/// Database efficiency rules:
///   - zfs_metrics: batch insert, at most every 5 s (one INSERT per tick instead of N)
///   - global_stats: written at most every 60 s, skipped when unchanged
///   - Retention: old rows pruned hourly; warns if table exceeds 500 k rows
///   - Write counter logged on every successful batch write
async fn run_slow_loop(state: crate::state::AppState) {
    const KEY_PENDING: &str = "zfs:metrics:pending";
    const KEY_LATEST:  &str = "zfs:metrics:latest";
    const TOTALS_INTERVAL: Duration = Duration::from_secs(60);
    const RETENTION_INTERVAL: Duration = Duration::from_secs(3600);

    let mut ticker = interval(Duration::from_secs(5));

    let mut t1 = read_cpu_jiffies();
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Track last-written totals to skip duplicate DB writes
    let mut prev_tr: u64 = 0;
    let mut prev_tw: u64 = 0;
    let mut last_totals_write = Instant::now() - TOTALS_INTERVAL;

    // Metrics write counter for logging
    let mut write_counter: u64 = 0;

    // Retention enforcement cadence
    let mut last_retention = Instant::now() - RETENTION_INTERVAL;

    loop {
        ticker.tick().await;

        let t2 = read_cpu_jiffies();
        let cpu_percent = if t2.0 > t1.0 {
            let dt = (t2.0 - t1.0) as f64;
            let di = t2.1.saturating_sub(t1.1) as f64;
            ((dt - di) / dt * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };
        t1 = t2;

        let arc_hit_ratio = read_arc_hit_ratio();
        let pools = get_pool_names().await;

        let entries: Vec<serde_json::Value> = if pools.is_empty() {
            vec![serde_json::json!({
                "pool_name":    "",
                "read_bw_mb":   0.0,
                "write_bw_mb":  0.0,
                "iops":         0.0,
                "alloc_gb":     0.0,
                "free_gb":      0.0,
                "cpu_percent":  cpu_percent,
                "arc_hit_ratio":arc_hit_ratio,
            })]
        } else {
            let mut result = Vec::new();
            for pool in &pools {
                let (alloc_gb, free_gb, iops, read_bw_mb, write_bw_mb, read_bw_bytes, write_bw_bytes) =
                    get_pool_iostat(pool).await.unwrap_or((0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0));

                state.total_read_bytes.fetch_add(read_bw_bytes as u64, Ordering::Relaxed);
                state.total_write_bytes.fetch_add(write_bw_bytes as u64, Ordering::Relaxed);

                result.push(serde_json::json!({
                    "pool_name":    pool,
                    "read_bw_mb":   read_bw_mb,
                    "write_bw_mb":  write_bw_mb,
                    "iops":         iops,
                    "alloc_gb":     alloc_gb,
                    "free_gb":      free_gb,
                    "cpu_percent":  cpu_percent,
                    "arc_hit_ratio":arc_hit_ratio,
                }));
            }
            result
        };

        if let Some(ref mut redis_conn) = state.redis.clone() {
            let mut conn = redis_conn.clone();
            for entry in &entries {
                let payload = match serde_json::to_string(entry) {
                    Ok(s)  => s,
                    Err(e) => { warn!("Failed to serialize metric: {e}"); continue; }
                };
                push_to_redis(&mut conn, KEY_PENDING, KEY_LATEST, &payload).await;
            }

            if let Some(ref pg_client) = state.pg {
                sync_redis_to_postgres(&mut conn, pg_client, KEY_PENDING, &mut write_counter).await;
            }
        } else if let Some(ref pg_client) = state.pg {
            // No Redis — direct batch insert
            struct DirectRow {
                pool_name: String,
                read_bw_mb: f64,
                write_bw_mb: f64,
                iops: f64,
                alloc_gb: f64,
                free_gb: f64,
                cpu_v: f64,
                arc_v: f64,
            }

            let rows: Vec<DirectRow> = entries.iter().map(|e| DirectRow {
                pool_name:   e["pool_name"].as_str().unwrap_or("").to_string(),
                read_bw_mb:  e["read_bw_mb"].as_f64().unwrap_or(0.0),
                write_bw_mb: e["write_bw_mb"].as_f64().unwrap_or(0.0),
                iops:        e["iops"].as_f64().unwrap_or(0.0),
                alloc_gb:    e["alloc_gb"].as_f64().unwrap_or(0.0),
                free_gb:     e["free_gb"].as_f64().unwrap_or(0.0),
                cpu_v:       e["cpu_percent"].as_f64().unwrap_or(0.0),
                arc_v:       e["arc_hit_ratio"].as_f64().unwrap_or(0.0),
            }).collect();

            if !rows.is_empty() {
                let mut idx = 1usize;
                let mut placeholders: Vec<String> = Vec::with_capacity(rows.len());
                for _ in &rows {
                    placeholders.push(format!(
                        "(${}, ${}, ${}, ${}, ${}, ${}, ${}, ${})",
                        idx, idx+1, idx+2, idx+3, idx+4, idx+5, idx+6, idx+7
                    ));
                    idx += 8;
                }
                let sql = format!(
                    "INSERT INTO zfs_metrics \
                     (pool_name, read_bw_mb, write_bw_mb, iops, alloc_gb, free_gb, cpu_percent, arc_hit_ratio) \
                     VALUES {}",
                    placeholders.join(", ")
                );
                let mut params: Vec<Box<dyn tokio_postgres::types::ToSql + Sync + Send>> =
                    Vec::with_capacity(rows.len() * 8);
                for r in &rows {
                    params.push(Box::new(r.pool_name.clone()));
                    params.push(Box::new(r.read_bw_mb));
                    params.push(Box::new(r.write_bw_mb));
                    params.push(Box::new(r.iops));
                    params.push(Box::new(r.alloc_gb));
                    params.push(Box::new(r.free_gb));
                    params.push(Box::new(r.cpu_v));
                    params.push(Box::new(r.arc_v));
                }
                let param_refs: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> =
                    params.iter().map(|b| b.as_ref() as &(dyn tokio_postgres::types::ToSql + Sync)).collect();
                match pg_client.execute(sql.as_str(), param_refs.as_slice()).await {
                    Ok(n) => {
                        write_counter += n as u64;
                        info!("Direct batch-inserted {n} metric rows (total writes: {write_counter})");
                    }
                    Err(e) => warn!("Direct batch INSERT failed: {e}"),
                }
            }
        }

        // Persist cumulative totals — at most every 60 s, skip if unchanged
        let tr = state.total_read_bytes.load(Ordering::Relaxed);
        let tw = state.total_write_bytes.load(Ordering::Relaxed);

        let totals_due     = last_totals_write.elapsed() >= TOTALS_INTERVAL;
        let totals_changed = tr != prev_tr || tw != prev_tw;

        if totals_due && totals_changed {
            let db_backend = std::env::var("DB_BACKEND").unwrap_or_else(|_| "postgres".to_string());
            if db_backend == "redis" {
                if let Some(ref redis_conn) = state.redis {
                    let mut conn = redis_conn.clone();
                    let _: redis::RedisResult<()> = conn.set("zfs:totals:read_bytes",  tr.to_string()).await;
                    let _: redis::RedisResult<()> = conn.set("zfs:totals:write_bytes", tw.to_string()).await;
                    info!("Persisted cumulative totals to Redis (read={tr}, write={tw})");
                }
            } else if let Some(ref pg_client) = state.pg {
                let tr_i = tr as i64;
                let tw_i = tw as i64;
                let result = pg_client.execute(
                    "UPDATE global_stats SET total_read_bytes = $1, total_write_bytes = $2 WHERE id = 1",
                    &[&tr_i, &tw_i]
                ).await;
                match result {
                    Ok(_) => info!("Persisted cumulative totals to PostgreSQL (read={tr}, write={tw})"),
                    Err(e) => warn!("Failed to update global_stats: {e}"),
                }
            }
            prev_tr = tr;
            prev_tw = tw;
            last_totals_write = Instant::now();
        }

        // Hourly retention: prune old rows and check table size
        if last_retention.elapsed() >= RETENTION_INTERVAL {
            if let Some(ref pg_client) = state.pg {
                enforce_retention(pg_client).await;
            }
            last_retention = Instant::now();
        }
    }
}

/// Periodically evaluates notification rules and triggers actions.
async fn run_notifications_loop(state: crate::state::AppState) {
    let mut ticker = interval(Duration::from_secs(60));
    loop {
        ticker.tick().await;
        check_and_trigger_notifications(&state).await;
    }
}

/// Spawn all workers
pub async fn run_metrics_worker(state: crate::state::AppState) {
    let state_live = state.clone();
    let state_slow = state.clone();
    let state_notify = state;

    tokio::join!(
        run_live_loop(state_live),
        run_slow_loop(state_slow),
        run_notifications_loop(state_notify),
    );
}
