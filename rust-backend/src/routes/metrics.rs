use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tracing::warn;

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

async fn get_metrics_history(
    State(state): State<AppState>,
    Query(params): Query<HistoryParams>,
) -> Json<Value> {
    let interval = params.interval.as_deref().unwrap_or("1h");

    let interval_clause = match interval {
        "1d" => "24 hours",
        "1w" => "168 hours",
        _ => "1 hours",   // default: 1h
    };

    let pg = match state.pg {
        Some(ref client) => client.clone(),
        None => {
            return Json(json!({
                "metrics": [],
                "interval": interval,
                "count": 0,
            }));
        }
    };

    let query = format!(
        "SELECT collected_at, pool_name, read_bw_mb, write_bw_mb, iops, \
         alloc_gb, free_gb, cpu_percent, arc_hit_ratio \
         FROM zfs_metrics \
         WHERE collected_at > NOW() - INTERVAL '{interval_clause}' \
         ORDER BY collected_at DESC \
         LIMIT 1000"
    );

    let rows = match pg.query(&query, &[]).await {
        Ok(r) => r,
        Err(e) => {
            warn!("Failed to query zfs_metrics: {e}");
            return Json(json!({
                "metrics": [],
                "interval": interval,
                "count": 0,
            }));
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
    Json(json!({
        "metrics": metrics,
        "interval": interval,
        "count": count,
    }))
}
