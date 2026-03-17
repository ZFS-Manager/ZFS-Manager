use axum::{
    extract::Path,
    routing::{delete, get, post, put},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::{error::ApiError, executor};

pub fn router() -> Router {
    Router::new()
        .route("/api/v1/pools", get(list_pools).post(create_pool))
        .route(
            "/api/v1/pools/:name",
            get(get_pool).delete(destroy_pool),
        )
        .route("/api/v1/pools/:name/status", get(pool_status))
        .route(
            "/api/v1/pools/:name/scrub",
            post(start_scrub).delete(stop_scrub),
        )
        .route("/api/v1/pools/:name/export", post(export_pool))
        .route("/api/v1/pools/:name/import", post(import_pool))
        .route("/api/v1/pools/:name/history", get(pool_history))
        .route("/api/v1/pools/:name/iostat", get(pool_iostat))
        .route("/api/v1/pools/:name/upgrade", post(upgrade_pool))
}

// ── Bodies ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreatePoolBody {
    /// Pool name
    pub name: String,
    /// vdev specification, e.g. ["mirror", "sda", "sdb"]
    pub vdevs: Vec<String>,
    /// Optional extra zpool-create flags, e.g. ["-o", "ashift=12"]
    #[serde(default)]
    pub options: Vec<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn list_pools() -> Result<Json<Value>, ApiError> {
    let raw = executor::zpool(&["list", "-H", "-p", "-o", "name,size,alloc,free,frag,cap,dedup,health,altroot"]).await?;
    let pools: Vec<Value> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let cols: Vec<&str> = line.split('\t').collect();
            json!({
                "name":    cols.first().unwrap_or(&""),
                "size":    cols.get(1).unwrap_or(&""),
                "alloc":   cols.get(2).unwrap_or(&""),
                "free":    cols.get(3).unwrap_or(&""),
                "frag":    cols.get(4).unwrap_or(&""),
                "cap":     cols.get(5).unwrap_or(&""),
                "dedup":   cols.get(6).unwrap_or(&""),
                "health":  cols.get(7).unwrap_or(&""),
                "altroot": cols.get(8).unwrap_or(&""),
            })
        })
        .collect();
    Ok(Json(json!({ "pools": pools })))
}

async fn create_pool(Json(body): Json<CreatePoolBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    if body.vdevs.is_empty() {
        return Err(ApiError::BadRequest("'vdevs' must not be empty".into()));
    }

    let mut args = vec!["create".to_string()];
    args.extend(body.options);
    args.push(body.name.clone());
    args.extend(body.vdevs);

    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zpool(&args_ref).await?;
    Ok(Json(json!({ "message": format!("Pool '{}' created", body.name) })))
}

async fn get_pool(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zpool(&[
        "list", "-H", "-p", "-o",
        "name,size,alloc,free,frag,cap,dedup,health,altroot",
        &name,
    ])
    .await?;
    let line = raw.lines().next().ok_or_else(|| ApiError::NotFound(format!("Pool '{name}' not found")))?;
    let cols: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "name":    cols.first().unwrap_or(&""),
        "size":    cols.get(1).unwrap_or(&""),
        "alloc":   cols.get(2).unwrap_or(&""),
        "free":    cols.get(3).unwrap_or(&""),
        "frag":    cols.get(4).unwrap_or(&""),
        "cap":     cols.get(5).unwrap_or(&""),
        "dedup":   cols.get(6).unwrap_or(&""),
        "health":  cols.get(7).unwrap_or(&""),
        "altroot": cols.get(8).unwrap_or(&""),
    })))
}

async fn destroy_pool(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zpool(&["destroy", &name]).await?;
    Ok(Json(json!({ "message": format!("Pool '{name}' destroyed") })))
}

async fn pool_status(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zpool(&["status", &name]).await?;
    Ok(Json(json!({ "name": name, "status": raw })))
}

async fn start_scrub(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zpool(&["scrub", &name]).await?;
    Ok(Json(json!({ "message": format!("Scrub started on pool '{name}'") })))
}

async fn stop_scrub(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zpool(&["scrub", "-s", &name]).await?;
    Ok(Json(json!({ "message": format!("Scrub stopped on pool '{name}'") })))
}

async fn export_pool(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zpool(&["export", &name]).await?;
    Ok(Json(json!({ "message": format!("Pool '{name}' exported") })))
}

async fn import_pool(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zpool(&["import", &name]).await?;
    Ok(Json(json!({ "message": format!("Pool '{name}' imported") })))
}

async fn pool_history(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zpool(&["history", &name]).await?;
    let lines: Vec<&str> = raw.lines().collect();
    Ok(Json(json!({ "name": name, "history": lines })))
}

async fn pool_iostat(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zpool(&["iostat", "-H", "-p", &name]).await?;
    let rows: Vec<Vec<&str>> = raw.lines().map(|l| l.split('\t').collect()).collect();
    Ok(Json(json!({ "name": name, "iostat": rows })))
}

async fn upgrade_pool(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zpool(&["upgrade", &name]).await?;
    Ok(Json(json!({ "message": format!("Pool '{name}' upgraded") })))
}
