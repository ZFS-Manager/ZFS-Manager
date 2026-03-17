use axum::{
    extract::Path,
    routing::{delete, get, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::ApiError, executor};

pub fn router() -> Router {
    Router::new()
        .route("/api/v1/properties/*dataset", get(get_all_properties))
        .route(
            "/api/v1/properties/*dataset/:prop",
            get(get_property).put(set_property).delete(inherit_property),
        )
}

// ── Bodies ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct SetPropertyBody {
    pub value: String,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn get_all_properties(Path(dataset): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["get", "-H", "-p", "all", &dataset]).await?;
    let properties: Vec<Value> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            json!({
                "dataset": c.first().unwrap_or(&""),
                "name":    c.get(1).unwrap_or(&""),
                "value":   c.get(2).unwrap_or(&""),
                "source":  c.get(3).unwrap_or(&""),
            })
        })
        .collect();
    Ok(Json(json!({ "dataset": dataset, "properties": properties })))
}

async fn get_property(
    Path((dataset, prop)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["get", "-H", "-p", &prop, &dataset]).await?;
    let line = raw.lines().next().ok_or_else(|| ApiError::NotFound(format!("Property '{prop}' not found on '{dataset}'")))?;
    let c: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "dataset": c.first().unwrap_or(&""),
        "name":    c.get(1).unwrap_or(&""),
        "value":   c.get(2).unwrap_or(&""),
        "source":  c.get(3).unwrap_or(&""),
    })))
}

async fn set_property(
    Path((dataset, prop)): Path<(String, String)>,
    Json(body): Json<SetPropertyBody>,
) -> Result<Json<Value>, ApiError> {
    if body.value.is_empty() {
        return Err(ApiError::BadRequest("'value' is required".into()));
    }
    let kv = format!("{prop}={}", body.value);
    executor::zfs(&["set", &kv, &dataset]).await?;
    Ok(Json(json!({ "message": format!("Set {kv} on '{dataset}'") })))
}

async fn inherit_property(
    Path((dataset, prop)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    executor::zfs(&["inherit", &prop, &dataset]).await?;
    Ok(Json(json!({ "message": format!("Property '{prop}' inherited on '{dataset}'") })))
}
