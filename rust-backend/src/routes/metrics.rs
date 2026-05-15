use axum::{
    extract::{Query, State},
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
        .route("/api/v1/metrics/history", get(get_metrics_history))
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
