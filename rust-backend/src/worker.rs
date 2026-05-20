use std::sync::atomic::Ordering;
use redis::AsyncCommands;
use tokio::time::{interval, Duration, Instant, MissedTickBehavior};
use tracing::{info, warn};

use crate::state::DiskMetric;

async fn check_and_trigger_notifications(state: &crate::state::AppState) {
    let _pg = match &state.pg {
        Some(pg) => pg,
        None => return,
    };
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

// Vdev group type prefixes — lines starting with these are NOT leaf disks.
const VDEV_GROUP_PREFIXES: &[&str] = &[
    "mirror", "raidz", "draid", "spare", "log", "cache",
    "replacing", "removed", "indirect",
];

fn is_vdev_group(name: &str) -> bool {
    VDEV_GROUP_PREFIXES.iter().any(|p| name.starts_with(p))
}

/// Returned by get_pool_iostat_with_disks.
struct IostatResult {
    alloc_gb: f64,
    free_gb: f64,
    iops: f64,
    read_bw_mb: f64,
    write_bw_mb: f64,
    read_bw_bytes: f64,
    write_bw_bytes: f64,
    read_iops: f64,
    write_iops: f64,
    disks: Vec<DiskMetric>,
}

/// Runs `zpool iostat -v -H -p <pool> 1 2` (takes ~1 s).
/// Parses both pool-level summary and individual leaf-disk metrics.
/// The FIRST block contains cumulative nread/nwritten since pool import — used for total_read_gb/total_write_gb.
/// The SECOND block contains the 1s delta — used for live bandwidth/IOPS rates.
async fn get_pool_iostat_with_disks(pool: &str) -> Option<IostatResult> {
    let output = tokio::process::Command::new("zpool")
        .args(["iostat", "-v", "-H", "-p", pool, "1", "2"])
        .output()
        .await;

    let out = match output {
        Ok(o) if o.status.success() => o,
        Ok(o) => {
            warn!("zpool iostat -v failed for {pool}: {}", String::from_utf8_lossy(&o.stderr).trim());
            return None;
        }
        Err(e) => {
            warn!("zpool iostat -v error for {pool}: {e}");
            return None;
        }
    };

    let stdout = String::from_utf8_lossy(&out.stdout);
    let all_lines: Vec<&str> = stdout.lines()
        .filter(|l| !l.trim().is_empty())
        .collect();

    if all_lines.is_empty() { return None; }

    // Locate the two pool-level lines (first tab-field == pool name).
    let pool_line_pos = |start: usize| -> Option<usize> {
        all_lines[start..].iter().position(|l| {
            l.split('\t').next().map(|s| s.trim()) == Some(pool)
        }).map(|rel| start + rel)
    };
    let first_block_start  = pool_line_pos(0)?;
    let second_block_start = pool_line_pos(first_block_start + 1).unwrap_or(first_block_start);

    // ── First block: cumulative nread/nwritten per disk since pool import ──────
    let first_block = &all_lines[first_block_start..second_block_start];
    let mut cumulative: std::collections::HashMap<String, (f64, f64)> =
        std::collections::HashMap::new();
    for line in first_block.iter().skip(1) {
        let trimmed = line.trim_start();
        let cols: Vec<&str> = trimmed.splitn(8, '\t').collect();
        if cols.len() < 7 { continue; }
        let name = cols[0].trim().to_string();
        if name.is_empty() || name == pool || is_vdev_group(&name) { continue; }
        let nread:  f64 = cols[5].parse().unwrap_or(0.0);
        let nwrite: f64 = cols[6].parse().unwrap_or(0.0);
        cumulative.insert(name, (nread / 1_073_741_824.0, nwrite / 1_073_741_824.0));
    }

    // ── Second block: 1s delta — pool summary + per-disk rates ────────────────
    let second_block = &all_lines[second_block_start..];
    if second_block.is_empty() { return None; }

    let pool_line = second_block[0];
    let cols: Vec<&str> = pool_line.split('\t').collect();
    if cols.len() < 7 { return None; }

    let alloc_bytes: f64    = cols[1].parse().unwrap_or(0.0);
    let free_bytes: f64     = cols[2].parse().unwrap_or(0.0);
    let read_ops: f64       = cols[3].parse().unwrap_or(0.0);
    let write_ops: f64      = cols[4].parse().unwrap_or(0.0);
    let read_bw_bytes: f64  = cols[5].parse().unwrap_or(0.0);
    let write_bw_bytes: f64 = cols[6].parse().unwrap_or(0.0);

    let mut disks: Vec<DiskMetric> = Vec::new();
    for line in second_block.iter().skip(1) {
        let trimmed = line.trim_start();
        let dcols: Vec<&str> = trimmed.splitn(8, '\t').collect();
        if dcols.len() < 7 { continue; }

        let name = dcols[0].trim().to_string();
        if name.is_empty() || name == pool || is_vdev_group(&name) { continue; }

        let parse = |s: &str| -> f64 { s.parse().unwrap_or(0.0) };
        let d_read_ops:  f64 = parse(dcols[3]);
        let d_write_ops: f64 = parse(dcols[4]);
        let d_read_bw:   f64 = parse(dcols[5]);
        let d_write_bw:  f64 = parse(dcols[6]);

        // Cumulative totals come from the first block (nread/nwritten since import).
        let (total_read_gb, total_write_gb) = cumulative.get(&name).copied().unwrap_or((0.0, 0.0));

        disks.push(DiskMetric {
            name,
            read_bw_mb:  d_read_bw  / 1_048_576.0,
            write_bw_mb: d_write_bw / 1_048_576.0,
            read_iops:   d_read_ops,
            write_iops:  d_write_ops,
            total_read_gb,
            total_write_gb,
        });
    }

    Some(IostatResult {
        alloc_gb:      alloc_bytes  / 1_073_741_824.0,
        free_gb:       free_bytes   / 1_073_741_824.0,
        iops:          read_ops + write_ops,
        read_bw_mb:    read_bw_bytes  / 1_048_576.0,
        write_bw_mb:   write_bw_bytes / 1_048_576.0,
        read_bw_bytes,
        write_bw_bytes,
        read_iops:     read_ops,
        write_iops:    write_ops,
        disks,
    })
}

/// Queries RAID-aware pool capacity via `zpool list`.
/// Returns (alloc_gb, free_gb) that account for RAID parity overhead.
async fn get_pool_capacity(pool: &str) -> Option<(f64, f64)> {
    let output = tokio::process::Command::new("zpool")
        .args(["list", "-H", "-p", "-o", "name,size,alloc,free", pool])
        .output()
        .await;

    let out = match output {
        Ok(o) if o.status.success() => o,
        _ => return None,
    };

    let stdout = String::from_utf8_lossy(&out.stdout);
    for line in stdout.lines() {
        let cols: Vec<&str> = line.split('\t').collect();
        if cols.len() < 4 { continue; }
        let alloc: f64 = cols[2].parse().unwrap_or(0.0);
        let free:  f64 = cols[3].parse().unwrap_or(0.0);
        return Some((alloc / 1_073_741_824.0, free / 1_073_741_824.0));
    }
    None
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
    if count == 0 { return; }

    let items_result: redis::RedisResult<Vec<String>> =
        redis.lrange(key_pending, 0, (count - 1) as isize).await;
    let items = match items_result {
        Ok(v) => v,
        Err(e) => { warn!("Redis LRANGE failed: {e}"); return; }
    };

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

    if rows.is_empty() { return; }

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

    let mut params: Vec<Box<dyn tokio_postgres::types::ToSql + Sync + Send>> =
        Vec::with_capacity(rows.len() * 8);
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

/// Fast 1s loop — no iostat syscall.
///
/// Reads CPU% and ARC from /proc, reads cached IO snapshot from AppState,
/// then writes a combined payload to `zfs:live:snapshot` in Redis.
async fn run_live_loop(state: crate::state::AppState) {
    let mut ticker = interval(Duration::from_secs(1));
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    let mut t1 = read_cpu_jiffies();

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

        // Read cached iostat values — zero-cost, no syscall.
        let (read_bw_mb, write_bw_mb, read_iops, write_iops) = {
            let cache = state.io_cache.read().await;
            (cache.read_bw_mb, cache.write_bw_mb, cache.read_iops, cache.write_iops)
        };

        let total_read_bytes  = state.total_read_bytes.load(Ordering::Relaxed);
        let total_write_bytes = state.total_write_bytes.load(Ordering::Relaxed);
        let total_read_mb  = total_read_bytes  as f64 / 1_048_576.0;
        let total_write_mb = total_write_bytes as f64 / 1_048_576.0;

        let payload = serde_json::json!({
            "cpu_percent":    cpu_percent,
            "arc_hit_ratio":  arc_hit_ratio,
            "total_read_mb":  total_read_mb,
            "total_write_mb": total_write_mb,
            "read_bw_mb":     read_bw_mb,
            "write_bw_mb":    write_bw_mb,
            "read_iops":      read_iops,
            "write_iops":     write_iops,
        });

        if let Some(ref redis_conn) = state.redis {
            let mut conn = redis_conn.clone();
            if let Ok(json_str) = serde_json::to_string(&payload) {
                let _: redis::RedisResult<()> =
                    conn.set_ex("zfs:live:snapshot", json_str, 5u64).await;
            }
        }
    }
}

/// Slow 1s loop — does the actual `zpool iostat -v` syscall.
///
/// Cadence breakdown:
///   - Every tick (1 s): iostat syscall, update in-memory cache, accumulate byte totals,
///     push to Redis pending + per-disk key, update zfs:metrics:latest for charts.
///   - Every 6th tick (~6 s): batch-sync Redis pending → PostgreSQL.
///   - Every 15 s: persist cumulative totals to global_stats.
///   - Every 3600 s: prune old rows, check table size.
async fn run_slow_loop(state: crate::state::AppState) {
    const KEY_PENDING: &str = "zfs:metrics:pending";
    const KEY_LATEST:  &str = "zfs:metrics:latest";
    const TOTALS_INTERVAL:    Duration = Duration::from_secs(15);
    const RETENTION_INTERVAL: Duration = Duration::from_secs(3600);
    // Each iostat call measures 1 s of bandwidth; the loop runs every 1 s.
    const TICK_SECS: f64 = 1.0;

    let mut ticker = interval(Duration::from_secs(1));
    // If the iostat call overruns 1 s, wait for the full interval rather than bursting.
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);

    let mut pg_tick: u8 = 0;
    let mut prev_tr: u64 = 0;
    let mut prev_tw: u64 = 0;
    let mut last_totals_write = Instant::now() - TOTALS_INTERVAL;
    let mut write_counter: u64 = 0;
    let mut last_retention = Instant::now() - RETENTION_INTERVAL;

    loop {
        ticker.tick().await;
        pg_tick = pg_tick.wrapping_add(1);
        let do_pg_sync = pg_tick >= 6;
        if do_pg_sync { pg_tick = 0; }

        let pools = get_pool_names().await;

        // ── Collect metrics per pool ──────────────────────────────────────────
        let mut agg_read_bw_mb:  f64 = 0.0;
        let mut agg_write_bw_mb: f64 = 0.0;
        let mut agg_read_iops:   f64 = 0.0;
        let mut agg_write_iops:  f64 = 0.0;

        // cpu_percent / arc are read by the fast loop from /proc; the slow loop
        // also needs them to store in the metrics DB row.
        let t_now = read_cpu_jiffies();
        let arc_now = read_arc_hit_ratio();
        // We don't maintain a delta here — the fast loop owns that.
        // For DB storage a 0 is acceptable; the dashboard reads cpu from live snapshot.
        let cpu_for_db = 0.0f64;
        let _ = t_now; // suppress unused warning

        let mut pool_entries: Vec<serde_json::Value> = Vec::new();
        let mut new_pool_disks: std::collections::HashMap<String, Vec<DiskMetric>> =
            std::collections::HashMap::new();

        if pools.is_empty() {
            pool_entries.push(serde_json::json!({
                "pool_name":    "",
                "read_bw_mb":   0.0,
                "write_bw_mb":  0.0,
                "iops":         0.0,
                "alloc_gb":     0.0,
                "free_gb":      0.0,
                "cpu_percent":  cpu_for_db,
                "arc_hit_ratio":arc_now,
            }));
        } else {
            for pool in &pools {
                let res = match get_pool_iostat_with_disks(pool).await {
                    Some(r) => r,
                    None    => continue,
                };

                // Accumulate all-time byte totals (bytes/sec × 1 s = bytes)
                state.total_read_bytes .fetch_add((res.read_bw_bytes  * TICK_SECS) as u64, Ordering::Relaxed);
                state.total_write_bytes.fetch_add((res.write_bw_bytes * TICK_SECS) as u64, Ordering::Relaxed);

                agg_read_bw_mb  += res.read_bw_mb;
                agg_write_bw_mb += res.write_bw_mb;
                agg_read_iops   += res.read_iops;
                agg_write_iops  += res.write_iops;

                // Use RAID-aware alloc/free from zpool list for accurate capacity.
                let (cap_alloc_gb, cap_free_gb) = get_pool_capacity(pool).await
                    .unwrap_or((res.alloc_gb, res.free_gb));

                pool_entries.push(serde_json::json!({
                    "pool_name":     pool,
                    "read_bw_mb":    res.read_bw_mb,
                    "write_bw_mb":   res.write_bw_mb,
                    "iops":          res.iops,
                    "alloc_gb":      cap_alloc_gb,
                    "free_gb":       cap_free_gb,
                    "cpu_percent":   cpu_for_db,
                    "arc_hit_ratio": arc_now,
                }));

                // Per-disk data for Redis + API (totals already populated from first iostat block)
                if !res.disks.is_empty() {
                    new_pool_disks.insert(pool.clone(), res.disks.clone());

                    if let Some(ref redis_conn) = state.redis {
                        let mut conn = redis_conn.clone();
                        let disk_json: Vec<serde_json::Value> = res.disks.iter().map(|d| {
                            serde_json::json!({
                                "name":           d.name,
                                "read_bw_mb":     d.read_bw_mb,
                                "write_bw_mb":    d.write_bw_mb,
                                "read_iops":      d.read_iops,
                                "write_iops":     d.write_iops,
                                "total_read_gb":  d.total_read_gb,
                                "total_write_gb": d.total_write_gb,
                            })
                        }).collect();
                        let redis_key = format!("zfs:disks:{}:latest", pool);
                        if let Ok(s) = serde_json::to_string(&disk_json) {
                            let _: redis::RedisResult<()> = conn.set_ex(&redis_key, s, 10u64).await;
                        }
                    }
                }
            }
        }

        // ── Update in-memory cache (read by fast loop, no syscall) ────────────
        {
            let mut cache = state.io_cache.write().await;
            cache.read_bw_mb  = agg_read_bw_mb;
            cache.write_bw_mb = agg_write_bw_mb;
            cache.read_iops   = agg_read_iops;
            cache.write_iops  = agg_write_iops;
            if !new_pool_disks.is_empty() {
                cache.pool_disks = new_pool_disks;
            }
        }

        // ── Redis: push pending metrics + update latest key ───────────────────
        if let Some(ref redis_conn) = state.redis {
            let mut conn = redis_conn.clone();
            for entry in &pool_entries {
                if let Ok(payload) = serde_json::to_string(entry) {
                    push_to_redis(&mut conn, KEY_PENDING, KEY_LATEST, &payload).await;
                }
            }
            if do_pg_sync {
                if let Some(ref pg_client) = state.pg {
                    sync_redis_to_postgres(&mut conn, pg_client, KEY_PENDING, &mut write_counter).await;
                }
            }
        } else if do_pg_sync {
            // No Redis — direct batch insert every 6th tick (~6 s)
            if let Some(ref pg_client) = state.pg {
                struct DirectRow {
                    pool_name: String, read_bw_mb: f64, write_bw_mb: f64,
                    iops: f64, alloc_gb: f64, free_gb: f64, cpu_v: f64, arc_v: f64,
                }
                let rows: Vec<DirectRow> = pool_entries.iter().map(|e| DirectRow {
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
                         VALUES {}", placeholders.join(", ")
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
        }

        // ── Persist cumulative totals every 15 s ─────────────────────────────
        let tr = state.total_read_bytes .load(Ordering::Relaxed);
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
                }
            } else if let Some(ref pg_client) = state.pg {
                let tr_i = tr as i64;
                let tw_i = tw as i64;
                match pg_client.execute(
                    "UPDATE global_stats SET total_read_bytes = $1, total_write_bytes = $2 WHERE id = 1",
                    &[&tr_i, &tw_i],
                ).await {
                    Ok(_) => info!("Persisted cumulative totals (read={tr}, write={tw})"),
                    Err(e) => warn!("Failed to update global_stats: {e}"),
                }
            }
            prev_tr = tr;
            prev_tw = tw;
            last_totals_write = Instant::now();
        }

        // ── Hourly retention ─────────────────────────────────────────────────
        if last_retention.elapsed() >= RETENTION_INTERVAL {
            if let Some(ref pg_client) = state.pg {
                enforce_retention(pg_client).await;
            }
            last_retention = Instant::now();
        }
    }
}

async fn run_notifications_loop(state: crate::state::AppState) {
    let mut ticker = interval(Duration::from_secs(60));
    loop {
        ticker.tick().await;
        check_and_trigger_notifications(&state).await;
    }
}

pub async fn run_metrics_worker(state: crate::state::AppState) {
    let state_live   = state.clone();
    let state_slow   = state.clone();
    let state_notify = state;

    tokio::join!(
        run_live_loop(state_live),
        run_slow_loop(state_slow),
        run_notifications_loop(state_notify),
    );
}
