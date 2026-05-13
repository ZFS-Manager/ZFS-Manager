use redis::AsyncCommands;
use tokio::time::{interval, Duration};
use tracing::{info, warn};

/// Read two /proc/stat samples 500ms apart and return CPU busy percent.
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
                + vals.get(4).copied().unwrap_or(0); // idle + iowait
            let total: u64 = vals.iter().sum();
            return (total, idle);
        }
    }
    (0, 0)
}

async fn sample_cpu_percent() -> f64 {
    let (t1, i1) = read_cpu_jiffies();
    tokio::time::sleep(Duration::from_millis(500)).await;
    let (t2, i2) = read_cpu_jiffies();
    if t2 > t1 {
        let dt = (t2 - t1) as f64;
        let di = i2.saturating_sub(i1) as f64;
        ((dt - di) / dt * 100.0).clamp(0.0, 100.0)
    } else {
        0.0
    }
}

fn read_arc_hit_ratio() -> f64 {
    let raw = std::fs::read_to_string("/proc/spl/kstat/zfs/arcstats").unwrap_or_default();
    let mut hits: u64 = 0;
    let mut misses: u64 = 0;
    for line in raw.lines() {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 3 {
            match parts[0] {
                "hits" => hits = parts[2].parse().unwrap_or(0),
                "misses" => misses = parts[2].parse().unwrap_or(0),
                _ => {}
            }
        }
    }
    let total = hits + misses;
    if total > 0 {
        (hits as f64 / total as f64) * 100.0
    } else {
        0.0
    }
}

async fn get_pool_names() -> Vec<String> {
    let output = tokio::process::Command::new("zpool")
        .args(["list", "-H", "-o", "name"])
        .output()
        .await;
    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            stdout
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect()
        }
        Ok(out) => {
            warn!(
                "zpool list failed: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            );
            vec![]
        }
        Err(e) => {
            warn!("zpool command not found or failed: {e}");
            vec![]
        }
    }
}

/// Run `zpool iostat -H -p <pool> 1 2` and parse the last data row.
/// Columns: name, alloc, free, read_ops, write_ops, read_bw, write_bw
async fn get_pool_iostat(pool: &str) -> Option<(f64, f64, f64, f64, f64)> {
    let output = tokio::process::Command::new("zpool")
        .args(["iostat", "-H", "-p", pool, "1", "2"])
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            // Take the last non-empty line (second interval)
            let last_line = stdout
                .lines()
                .filter(|l| !l.trim().is_empty())
                .last()?
                .to_string();

            let cols: Vec<&str> = last_line.split('\t').collect();
            // name alloc free read_ops write_ops read_bw write_bw
            if cols.len() < 7 {
                return None;
            }
            let alloc_bytes: f64 = cols[1].parse().unwrap_or(0.0);
            let free_bytes: f64 = cols[2].parse().unwrap_or(0.0);
            let read_ops: f64 = cols[3].parse().unwrap_or(0.0);
            let write_ops: f64 = cols[4].parse().unwrap_or(0.0);
            let read_bw_bytes: f64 = cols[5].parse().unwrap_or(0.0);
            let write_bw_bytes: f64 = cols[6].parse().unwrap_or(0.0);

            let alloc_gb = alloc_bytes / 1_073_741_824.0;
            let free_gb = free_bytes / 1_073_741_824.0;
            let iops = read_ops + write_ops;
            let read_bw_mb = read_bw_bytes / 1_048_576.0;
            let write_bw_mb = write_bw_bytes / 1_048_576.0;

            Some((alloc_gb, free_gb, iops, read_bw_mb, write_bw_mb))
        }
        Ok(out) => {
            warn!(
                "zpool iostat failed for {pool}: {}",
                String::from_utf8_lossy(&out.stderr).trim()
            );
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
    // RPUSH to pending list, then trim to last 2000
    let rpush_result: redis::RedisResult<i64> = redis.rpush(key_pending, payload).await;
    if let Err(e) = rpush_result {
        warn!("Redis RPUSH failed: {e}");
        return;
    }
    let ltrim_result: redis::RedisResult<()> = redis.ltrim(key_pending, -2000, -1).await;
    if let Err(e) = ltrim_result {
        warn!("Redis LTRIM failed: {e}");
    }

    // Also update latest key with 30s expiry
    let set_result: redis::RedisResult<()> = redis.set_ex(key_latest, payload, 30usize).await;
    if let Err(e) = set_result {
        warn!("Redis SET failed for latest key: {e}");
    }
}

async fn sync_redis_to_postgres(
    redis: &mut redis::aio::ConnectionManager,
    pg: &tokio_postgres::Client,
    key_pending: &str,
) {
    // Get count first
    let count_result: redis::RedisResult<i64> = redis.llen(key_pending).await;
    let count = match count_result {
        Ok(n) => n,
        Err(e) => {
            warn!("Redis LLEN failed: {e}");
            return;
        }
    };
    if count == 0 {
        return;
    }

    // Read all items
    let items_result: redis::RedisResult<Vec<String>> =
        redis.lrange(key_pending, 0, count - 1).await;
    let items = match items_result {
        Ok(v) => v,
        Err(e) => {
            warn!("Redis LRANGE failed: {e}");
            return;
        }
    };

    let mut inserted = 0usize;
    for item in &items {
        let v: serde_json::Value = match serde_json::from_str(item) {
            Ok(val) => val,
            Err(e) => {
                warn!("Failed to parse metric JSON: {e}");
                continue;
            }
        };

        let pool_name = v["pool_name"].as_str().unwrap_or("").to_string();
        let read_bw_mb = v["read_bw_mb"].as_f64().unwrap_or(0.0);
        let write_bw_mb = v["write_bw_mb"].as_f64().unwrap_or(0.0);
        let iops = v["iops"].as_f64().unwrap_or(0.0);
        let alloc_gb = v["alloc_gb"].as_f64().unwrap_or(0.0);
        let free_gb = v["free_gb"].as_f64().unwrap_or(0.0);
        let cpu_percent = v["cpu_percent"].as_f64().unwrap_or(0.0);
        let arc_hit_ratio = v["arc_hit_ratio"].as_f64().unwrap_or(0.0);

        let result = pg.execute(
            "INSERT INTO zfs_metrics \
             (pool_name, read_bw_mb, write_bw_mb, iops, alloc_gb, free_gb, cpu_percent, arc_hit_ratio) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            &[
                &pool_name,
                &read_bw_mb,
                &write_bw_mb,
                &iops,
                &alloc_gb,
                &free_gb,
                &cpu_percent,
                &arc_hit_ratio,
            ],
        ).await;

        match result {
            Ok(_) => inserted += 1,
            Err(e) => warn!("Failed to INSERT metric into postgres: {e}"),
        }
    }

    // Delete the processed items (LTRIM from count onwards)
    let ltrim_result: redis::RedisResult<()> = redis.ltrim(key_pending, count, -1).await;
    if let Err(e) = ltrim_result {
        warn!("Redis LTRIM after sync failed: {e}");
    }

    if inserted > 0 {
        info!("Synced {inserted} metrics from Redis to PostgreSQL");
    }
}

pub async fn run_metrics_worker(state: crate::state::AppState) {
    const KEY_PENDING: &str = "zfs:metrics:pending";
    const KEY_LATEST: &str = "zfs:metrics:latest";

    let mut ticker = interval(Duration::from_secs(5));

    loop {
        ticker.tick().await;

        // Collect CPU and ARC
        let cpu_percent = sample_cpu_percent().await;
        let arc_hit_ratio = read_arc_hit_ratio();

        // Get pool names
        let pools = get_pool_names().await;

        // Build metric entries – one per pool (or one global entry if no pools)
        let entries: Vec<serde_json::Value> = if pools.is_empty() {
            vec![serde_json::json!({
                "pool_name": "",
                "read_bw_mb": 0.0,
                "write_bw_mb": 0.0,
                "iops": 0.0,
                "alloc_gb": 0.0,
                "free_gb": 0.0,
                "cpu_percent": cpu_percent,
                "arc_hit_ratio": arc_hit_ratio,
            })]
        } else {
            let mut result = Vec::new();
            for pool in &pools {
                let (alloc_gb, free_gb, iops, read_bw_mb, write_bw_mb) =
                    get_pool_iostat(pool).await.unwrap_or((0.0, 0.0, 0.0, 0.0, 0.0));

                result.push(serde_json::json!({
                    "pool_name": pool,
                    "read_bw_mb": read_bw_mb,
                    "write_bw_mb": write_bw_mb,
                    "iops": iops,
                    "alloc_gb": alloc_gb,
                    "free_gb": free_gb,
                    "cpu_percent": cpu_percent,
                    "arc_hit_ratio": arc_hit_ratio,
                }));
            }
            result
        };

        // Push to Redis
        if let Some(ref mut redis_conn) = state.redis.clone() {
            let mut conn = redis_conn.clone();
            for entry in &entries {
                let payload = match serde_json::to_string(entry) {
                    Ok(s) => s,
                    Err(e) => {
                        warn!("Failed to serialize metric: {e}");
                        continue;
                    }
                };
                push_to_redis(&mut conn, KEY_PENDING, KEY_LATEST, &payload).await;
            }

            // Sync to Postgres
            if let Some(ref pg_client) = state.pg {
                sync_redis_to_postgres(&mut conn, pg_client, KEY_PENDING).await;
            }
        } else if let Some(ref pg_client) = state.pg {
            // No Redis – insert directly
            for entry in &entries {
                let pool_name = entry["pool_name"].as_str().unwrap_or("").to_string();
                let read_bw_mb = entry["read_bw_mb"].as_f64().unwrap_or(0.0);
                let write_bw_mb = entry["write_bw_mb"].as_f64().unwrap_or(0.0);
                let iops = entry["iops"].as_f64().unwrap_or(0.0);
                let alloc_gb = entry["alloc_gb"].as_f64().unwrap_or(0.0);
                let free_gb = entry["free_gb"].as_f64().unwrap_or(0.0);
                let cpu_percent_val = entry["cpu_percent"].as_f64().unwrap_or(0.0);
                let arc_hit_ratio_val = entry["arc_hit_ratio"].as_f64().unwrap_or(0.0);

                let result = pg_client.execute(
                    "INSERT INTO zfs_metrics \
                     (pool_name, read_bw_mb, write_bw_mb, iops, alloc_gb, free_gb, cpu_percent, arc_hit_ratio) \
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                    &[
                        &pool_name,
                        &read_bw_mb,
                        &write_bw_mb,
                        &iops,
                        &alloc_gb,
                        &free_gb,
                        &cpu_percent_val,
                        &arc_hit_ratio_val,
                    ],
                ).await;
                if let Err(e) = result {
                    warn!("Direct PG insert failed: {e}");
                }
            }
        }
    }
}
