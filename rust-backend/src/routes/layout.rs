use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};

use crate::state::AppState;
use crate::error::ApiError;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/layout/:page", get(get_layout).post(save_layout))
        .with_state(state)
}

fn default_layout(page: &str) -> Value {
    match page {
        "dashboard" => json!({
            "page": "dashboard",
            "widgets": [
                { "id": "stats-row",        "visible": true, "order": 0 },
                { "id": "storage-timeline", "visible": true, "order": 1 },
                { "id": "io-activity",      "visible": true, "order": 2 },
                { "id": "pool-cards",       "visible": true, "order": 3 },
                { "id": "system-resources", "visible": true, "order": 4 },
                { "id": "activity-log",     "visible": true, "order": 5 }
            ]
        }),
        "performance" => json!({
            "page": "performance",
            "widgets": [
                { "id": "live-gauges",     "visible": true, "order": 0 },
                { "id": "io-chart",        "visible": true, "order": 1 },
                { "id": "throughput",      "visible": true, "order": 2 },
                { "id": "storage-history", "visible": true, "order": 3 },
                { "id": "smart-health",    "visible": true, "order": 4 }
            ]
        }),
        _ => json!({ "page": page, "widgets": [] }),
    }
}

async fn get_layout(
    Path(page): Path<String>,
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    if let Some(pg) = &state.pg {
        if let Ok(Some(row)) = pg.query_opt(
            "SELECT layout FROM ui_layouts WHERE page = $1",
            &[&page],
        ).await {
            let layout_str: String = row.get(0);
            if let Ok(v) = serde_json::from_str::<Value>(&layout_str) {
                return Ok(Json(v));
            }
        }
    }
    Ok(Json(default_layout(&page)))
}

async fn save_layout(
    Path(page): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    if let Some(pg) = &state.pg {
        let layout_str = serde_json::to_string(&body).unwrap_or_default();
        let _ = pg.execute(
            "INSERT INTO ui_layouts(page, layout) VALUES($1, $2) \
             ON CONFLICT(page) DO UPDATE SET layout = EXCLUDED.layout",
            &[&page, &layout_str],
        ).await;
    }
    Ok(Json(json!({ "ok": true })))
}
