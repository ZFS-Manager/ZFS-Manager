use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

pub fn router() -> Router {
    Router::new().route("/api/v1/health", get(health))
}

async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "zfs-manager",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
