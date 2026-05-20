use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::{json, Value};
use tracing::{debug, warn};

use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/metrics/history",         get(get_metrics_history))
        .route("/api/v1/metrics/live",             get(get_live_metrics))
        .route("/api/v1/metrics/fill-prediction",  get(get_fill_prediction))
        .route("/api/v1/pools/:pool/disks",        get(get_pool_disk_metrics))
        .with_state(state)
}

#[derive(Deserialize)]
struct HistoryParams {
    interval: Option<String>,
}

// Redis TTL per interval: shorter windows expire faster so fresh data shows quickly
fn cache_ttl(interval: &str) -> u64 {
    match interval {
        "1h" => 20,   // 20s — data changes every 5s, keep brief
        "1d" => 60,   // 1 min
        "1w" => 180,  // 3 min
        "1m" => 300,  // 5 min
        "1y" => 600,  // 10 min
        _ => 20,
    }
}

fn build_query(interval: &str) -> String {
    match interval {
        "1h" => "SELECT collected_at, pool_name, \
                 read_bw_mb, write_bw_mb, iops, alloc_gb, free_gb, cpu_percent, arc_hit_ratio \
                 FROM zfs_metrics \
                 WHERE collected_at > NOW() - INTERVAL '1 hour' \
                 ORDER BY collected_at ASC LIMIT 720"
            .to_string(),

        "1d" => "SELECT to_timestamp(floor(extract(epoch from collected_at) / 300) * 300) AS collected_at, \
                 pool_name, \
                 AVG(read_bw_mb) AS read_bw_mb, AVG(write_bw_mb) AS write_bw_mb, \
                 AVG(iops) AS iops, AVG(alloc_gb) AS alloc_gb, AVG(free_gb) AS free_gb, \
                 AVG(cpu_percent) AS cpu_percent, AVG(arc_hit_ratio) AS arc_hit_ratio \
                 FROM zfs_metrics \
                 WHERE collected_at > NOW() - INTERVAL '24 hours' \
                 GROUP BY 1, 2 ORDER BY 1 ASC LIMIT 576"
            .to_string(),

        "1w" => "SELECT to_timestamp(floor(extract(epoch from collected_at) / 1800) * 1800) AS collected_at, \
                 pool_name, \
                 AVG(read_bw_mb) AS read_bw_mb, AVG(write_bw_mb) AS write_bw_mb, \
                 AVG(iops) AS iops, AVG(alloc_gb) AS alloc_gb, AVG(free_gb) AS free_gb, \
                 AVG(cpu_percent) AS cpu_percent, AVG(arc_hit_ratio) AS arc_hit_ratio \
                 FROM zfs_metrics \
                 WHERE collected_at > NOW() - INTERVAL '7 days' \
                 GROUP BY 1, 2 ORDER BY 1 ASC LIMIT 336"
            .to_string(),

        "1m" => "SELECT to_timestamp(floor(extract(epoch from collected_at) / 7200) * 7200) AS collected_at, \
                 pool_name, \
                 AVG(read_bw_mb) AS read_bw_mb, AVG(write_bw_mb) AS write_bw_mb, \
                 AVG(iops) AS iops, AVG(alloc_gb) AS alloc_gb, AVG(free_gb) AS free_gb, \
                 AVG(cpu_percent) AS cpu_percent, AVG(arc_hit_ratio) AS arc_hit_ratio \
                 FROM zfs_metrics \
                 WHERE collected_at > NOW() - INTERVAL '30 days' \
                 GROUP BY 1, 2 ORDER BY 1 ASC LIMIT 360"
            .to_string(),

        "1y" => "SELECT to_timestamp(floor(extract(epoch from collected_at) / 86400) * 86400) AS collected_at, \
                 pool_name, \
                 AVG(read_bw_mb) AS read_bw_mb, AVG(write_bw_mb) AS write_bw_mb, \
                 AVG(iops) AS iops, AVG(alloc_gb) AS alloc_gb, AVG(free_gb) AS free_gb, \
                 AVG(cpu_percent) AS cpu_percent, AVG(arc_hit_ratio) AS arc_hit_ratio \
                 FROM zfs_metrics \
                 WHERE collected_at > NOW() - INTERVAL '365 days' \
                 GROUP BY 1, 2 ORDER BY 1 ASC LIMIT 365"
            .to_string(),

        _ => "SELECT collected_at, pool_name, \
              read_bw_mb, write_bw_mb, iops, alloc_gb, free_gb, cpu_percent, arc_hit_ratio \
              FROM zfs_metrics \
              WHERE collected_at > NOW() - INTERVAL '1 hour' \
              ORDER BY collected_at ASC LIMIT 720"
            .to_string(),
    }
}

async fn get_metrics_history(
    State(state): State<AppState>,
    Query(params): Query<HistoryParams>,
) -> Json<Value> {
    let interval = params.interval.as_deref().unwrap_or("1h");
    let cache_key = format!("zfs:history:{interval}");

    // ── Redis cache check ──────────────────────────────────────────────────
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let cached: redis::RedisResult<Option<String>> = conn.get(&cache_key).await;
        match cached {
            Ok(Some(hit)) => {
                if let Ok(val) = serde_json::from_str::<Value>(&hit) {
                    debug!("cache hit: {cache_key}");
                    return Json(val);
                }
            }
            Ok(None) => debug!("cache miss: {cache_key}"),
            Err(e) => warn!("Redis GET error for {cache_key}: {e}"),
        }
    }

    // ── PostgreSQL query ───────────────────────────────────────────────────
    let pg = match state.pg {
        Some(ref client) => client.clone(),
        None => {
            return Json(json!({ "metrics": [], "interval": interval, "count": 0 }));
        }
    };

    let query = build_query(interval);

    let rows = match pg.query(&query, &[]).await {
        Ok(r) => r,
        Err(e) => {
            warn!("PG query failed ({interval}): {e}");
            return Json(json!({ "metrics": [], "interval": interval, "count": 0 }));
        }
    };

    let metrics: Vec<Value> = rows
        .iter()
        .map(|row| {
            let collected_at: chrono::DateTime<chrono::Utc> = row.get(0);
            let pool_name: String = row.get(1);
            let read_bw_mb: f64 = row.get(2);
            let write_bw_mb: f64 = row.get(3);
            let iops: f64 = row.get(4);
            let alloc_gb: f64 = row.get(5);
            let free_gb: f64 = row.get(6);
            let cpu_percent: f64 = row.get(7);
            let arc_hit_ratio: f64 = row.get(8);

            json!({
                "collected_at": collected_at.to_rfc3339(),
                "pool_name": pool_name,
                "read_bw_mb": read_bw_mb,
                "write_bw_mb": write_bw_mb,
                "iops": iops,
                "alloc_gb": alloc_gb,
                "free_gb": free_gb,
                "cpu_percent": cpu_percent,
                "arc_hit_ratio": arc_hit_ratio,
            })
        })
        .collect();

    let count = metrics.len();
    let result = json!({ "metrics": metrics, "interval": interval, "count": count });

    // ── Write to Redis cache ───────────────────────────────────────────────
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        if let Ok(json_str) = serde_json::to_string(&result) {
            let ttl = cache_ttl(interval);
            let set_result: redis::RedisResult<()> = conn.set_ex(&cache_key, json_str, ttl).await;
            if let Err(e) = set_result {
                warn!("Redis SET failed for {cache_key}: {e}");
            }
        }
    }

    Json(result)
}

async fn get_live_metrics(
    State(state): State<AppState>,
) -> Json<Value> {
    // Fast path: Redis snapshot written every 1s by the live loop.
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let snapshot: redis::RedisResult<Option<String>> = conn.get("zfs:live:snapshot").await;
        if let Ok(Some(hit)) = snapshot {
            if let Ok(val) = serde_json::from_str::<Value>(&hit) {
                return Json(val);
            }
        }
    }

    // Fallback: Redis unavailable or key expired — read from in-memory state (no syscall).
    use std::sync::atomic::Ordering;
    let (read_bw_mb, write_bw_mb, read_iops, write_iops) = {
        let cache = state.io_cache.read().await;
        (cache.read_bw_mb, cache.write_bw_mb, cache.read_iops, cache.write_iops)
    };
    let total_read_mb  = state.total_read_bytes.load(Ordering::Relaxed)  as f64 / 1_048_576.0;
    let total_write_mb = state.total_write_bytes.load(Ordering::Relaxed) as f64 / 1_048_576.0;

    Json(json!({
        "cpu_percent":    0.0,
        "arc_hit_ratio":  0.0,
        "total_read_mb":  total_read_mb,
        "total_write_mb": total_write_mb,
        "read_bw_mb":     read_bw_mb,
        "write_bw_mb":    write_bw_mb,
        "read_iops":      read_iops,
        "write_iops":     write_iops,
    }))
}

/// GET /api/v1/pools/:pool/disks
///
/// Returns the most recent per-disk I/O metrics for every leaf vdev in the pool,
/// read from the Redis key written by the 1s slow loop.
async fn get_pool_disk_metrics(
    State(state): State<AppState>,
    Path(pool): Path<String>,
) -> Json<Value> {
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let key = format!("zfs:disks:{}:latest", pool);
        let cached: redis::RedisResult<Option<String>> = conn.get(&key).await;
        if let Ok(Some(hit)) = cached {
            if let Ok(val) = serde_json::from_str::<Value>(&hit) {
                return Json(json!({ "pool": pool, "disks": val }));
            }
        }
    }
    Json(json!({ "pool": pool, "disks": [] }))
}

// ── Fill prediction ───────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct FillPredictionParams {
    window: Option<String>,
}

async fn get_fill_prediction(
    State(state): State<AppState>,
    Query(params): Query<FillPredictionParams>,
) -> Json<Value> {
    let window = params.window.as_deref().unwrap_or("auto");

    let pg = match state.pg {
        Some(ref client) => client.clone(),
        None => return Json(json!({ "predictions": [], "window_used": null, "window_key": null })),
    };

    // Single query: latest free/alloc per pool + avg write rates across all windows
    // write_bw_mb is in MB/s; daily rate = avg_mb_s * 86400 / 1024 GB/day
    let query = "
        WITH latest_pool AS (
            SELECT DISTINCT ON (pool_name) pool_name, alloc_gb, free_gb
            FROM zfs_metrics WHERE pool_name != ''
            ORDER BY pool_name, collected_at DESC
        ), rates AS (
            SELECT pool_name,
                AVG(CASE WHEN collected_at > NOW() - INTERVAL '30 days' THEN write_bw_mb END) as avg_30d,
                COUNT(CASE WHEN collected_at > NOW() - INTERVAL '30 days' THEN 1 END) as cnt_30d,
                AVG(CASE WHEN collected_at > NOW() - INTERVAL '7 days'  THEN write_bw_mb END) as avg_7d,
                COUNT(CASE WHEN collected_at > NOW() - INTERVAL '7 days'  THEN 1 END) as cnt_7d,
                AVG(CASE WHEN collected_at > NOW() - INTERVAL '24 hours' THEN write_bw_mb END) as avg_1d,
                COUNT(CASE WHEN collected_at > NOW() - INTERVAL '24 hours' THEN 1 END) as cnt_1d,
                AVG(CASE WHEN collected_at > NOW() - INTERVAL '6 hours'  THEN write_bw_mb END) as avg_6h,
                COUNT(CASE WHEN collected_at > NOW() - INTERVAL '6 hours'  THEN 1 END) as cnt_6h,
                AVG(CASE WHEN collected_at > NOW() - INTERVAL '1 hour'   THEN write_bw_mb END) as avg_1h,
                COUNT(CASE WHEN collected_at > NOW() - INTERVAL '1 hour'   THEN 1 END) as cnt_1h
            FROM zfs_metrics
            WHERE pool_name != '' AND collected_at > NOW() - INTERVAL '30 days'
            GROUP BY pool_name
        )
        SELECT l.pool_name, l.alloc_gb, l.free_gb,
               r.avg_30d, r.cnt_30d, r.avg_7d, r.cnt_7d,
               r.avg_1d,  r.cnt_1d,  r.avg_6h, r.cnt_6h,
               r.avg_1h,  r.cnt_1h
        FROM latest_pool l LEFT JOIN rates r ON l.pool_name = r.pool_name
    ";

    let rows = match pg.query(query, &[]).await {
        Ok(r) => r,
        Err(e) => {
            warn!("fill-prediction query failed: {e}");
            return Json(json!({ "predictions": [], "window_used": null, "window_key": null }));
        }
    };

    if rows.is_empty() {
        return Json(json!({ "predictions": [], "window_used": null, "window_key": null }));
    }

    // Windows ordered longest to shortest: (key, label, avg_col, cnt_col)
    let all_windows: &[(&str, &str, usize, usize)] = &[
        ("30d", "30 days",  3,  4),
        ("7d",  "7 days",   5,  6),
        ("1d",  "24 hours", 7,  8),
        ("6h",  "6 hours",  9,  10),
        ("1h",  "1 hour",   11, 12),
    ];

    // Start index for the preferred window based on the requested window param
    let preferred_start: usize = match window {
        "auto" | "30d" | "1m" | "1y" => 0,
        "7d" | "1w"                  => 1,
        "1d"                         => 2,
        "6h"                         => 3,
        "1h"                         => 4,
        _                            => 0,
    };

    let today = chrono::Local::now();
    let mut predictions: Vec<Value> = Vec::new();
    let mut overall_key:   Option<&str> = None;
    let mut overall_label: Option<&str> = None;

    for row in &rows {
        let pool_name: String      = row.get(0);
        let alloc_gb:  f64         = row.get(1);
        let free_gb:   f64         = row.get(2);

        // Find the best (longest) window with ≥1 data point
        let mut best_avg:   f64   = 0.0;
        let mut best_cnt:   i64   = 0;
        let mut best_key:   &str  = "";
        let mut best_label: &str  = "";

        for &(key, label, avg_col, cnt_col) in &all_windows[preferred_start..] {
            let cnt: i64 = row.get::<_, Option<i64>>(cnt_col).unwrap_or(0);
            if cnt > 0 {
                let avg: f64 = row.get::<_, Option<f64>>(avg_col).unwrap_or(0.0);
                best_avg   = avg;
                best_cnt   = cnt;
                best_key   = key;
                best_label = label;
                break;
            }
        }

        if best_cnt == 0 {
            continue; // No write data for this pool in any window — skip
        }

        // rate_gb_day = avg MB/s * 86400 s/day / 1024 MB/GB
        let rate_gb_day = best_avg * 86400.0 / 1024.0;
        let single_point = best_cnt == 1;

        let (fill_date, color) = if rate_gb_day <= 0.0 || free_gb <= 0.0 {
            ("–".to_string(), "muted")
        } else {
            let days = free_gb / rate_gb_day;
            let fill_dt = today + chrono::Duration::seconds((days * 86400.0) as i64);
            let date_str = if single_point {
                format!("~{}", fill_dt.format("%d.%m.%Y"))
            } else {
                fill_dt.format("%d.%m.%Y").to_string()
            };
            let c = if days < 14.0 { "danger" }
                    else if days < 90.0 { "warning" }
                    else { "secondary" };
            (date_str, c)
        };

        if overall_key.is_none() {
            overall_key   = Some(best_key);
            overall_label = Some(best_label);
        }

        predictions.push(json!({
            "pool":        pool_name,
            "fill_date":   fill_date,
            "color":       color,
            "rate_gb_day": format!("{:.4}", rate_gb_day),
            "window_used": best_label,
            "window_key":  best_key,
            "alloc_gb":    alloc_gb,
            "free_gb":     free_gb,
            "points":      best_cnt,
            "fallback":    single_point,
        }));
    }

    Json(json!({
        "predictions": predictions,
        "window_used": overall_label,
        "window_key":  overall_key,
    }))
}
