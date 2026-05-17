use axum::{
    extract::Path,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::ApiError, executor};

pub fn router() -> Router {
    Router::new()
        .route("/api/v1/volumes", get(list_volumes).post(create_volume))
        .route(
            "/api/v1/volumes/*name",
            get(get_volume).delete(destroy_volume),
        )
}

// ── Bodies ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateVolumeBody {
    pub name: String,
    /// Size string, e.g. "10G", "500M"
    pub size: String,
    /// Optional block size, e.g. "512" or "4096"
    pub volblocksize: Option<String>,
    #[serde(default)]
    pub options: Vec<String>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn list_volumes() -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["list", "-H", "-p", "-t", "volume", "-o", "name,used,avail,refer,volsize"]).await?;
    let volumes: Vec<Value> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            json!({
                "name":    c.first().unwrap_or(&""),
                "used":    c.get(1).unwrap_or(&""),
                "avail":   c.get(2).unwrap_or(&""),
                "refer":   c.get(3).unwrap_or(&""),
                "volsize": c.get(4).unwrap_or(&""),
            })
        })
        .collect();
    Ok(Json(json!({ "volumes": volumes })))
}

async fn create_volume(Json(body): Json<CreateVolumeBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    if body.size.is_empty() {
        return Err(ApiError::BadRequest("'size' is required (e.g. '10G')".into()));
    }
    executor::validate_zfs_name(&body.name, "volume")?;
    let mut args = vec!["create".to_string(), "-V".to_string(), body.size.clone()];
    if let Some(bs) = body.volblocksize {
        args.push("-b".to_string());
        args.push(bs);
    }
    args.extend(body.options);
    args.push(body.name.clone());
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&args_ref).await?;
    Ok(Json(json!({ "message": format!("Volume '{}' ({}) created", body.name, body.size) })))
}

async fn get_volume(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["list", "-H", "-p", "-t", "volume", "-o", "name,used,avail,refer,volsize", &name]).await?;
    let line = raw.lines().next().ok_or_else(|| ApiError::NotFound(format!("Volume '{name}' not found")))?;
    let c: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "name":    c.first().unwrap_or(&""),
        "used":    c.get(1).unwrap_or(&""),
        "avail":   c.get(2).unwrap_or(&""),
        "refer":   c.get(3).unwrap_or(&""),
        "volsize": c.get(4).unwrap_or(&""),
    })))
}

async fn destroy_volume(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "volume")?;
    executor::zfs(&["destroy", &name]).await?;
    Ok(Json(json!({ "message": format!("Volume '{name}' destroyed") })))
}
