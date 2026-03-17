use axum::{
    extract::Path,
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::ApiError, executor};

pub fn router() -> Router {
    Router::new()
        .route("/api/v1/datasets", get(list_datasets).post(create_dataset))
        .route(
            "/api/v1/datasets/*name",
            get(get_dataset).delete(destroy_dataset),
        )
        .route("/api/v1/datasets/*name/mount", post(mount_dataset).delete(unmount_dataset))
        .route("/api/v1/datasets/*name/rename", post(rename_dataset))
        .route("/api/v1/datasets/*name/space", get(dataset_space))
}

// ── Bodies ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateDatasetBody {
    pub name: String,
    /// Optional zfs-create options, e.g. ["-o", "compression=lz4"]
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Deserialize)]
pub struct RenameBody {
    pub new_name: String,
    #[serde(default)]
    pub recursive: bool,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn list_datasets() -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["list", "-H", "-p", "-t", "filesystem", "-o", "name,used,avail,refer,mountpoint"]).await?;
    let datasets: Vec<Value> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            json!({
                "name":       c.first().unwrap_or(&""),
                "used":       c.get(1).unwrap_or(&""),
                "available":  c.get(2).unwrap_or(&""),
                "refer":      c.get(3).unwrap_or(&""),
                "mountpoint": c.get(4).unwrap_or(&""),
            })
        })
        .collect();
    Ok(Json(json!({ "datasets": datasets })))
}

async fn create_dataset(Json(body): Json<CreateDatasetBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    let mut args = vec!["create".to_string()];
    args.extend(body.options);
    args.push(body.name.clone());
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&args_ref).await?;
    Ok(Json(json!({ "message": format!("Dataset '{}' created", body.name) })))
}

async fn get_dataset(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["list", "-H", "-p", "-o", "name,used,avail,refer,mountpoint", &name]).await?;
    let line = raw.lines().next().ok_or_else(|| ApiError::NotFound(format!("Dataset '{name}' not found")))?;
    let c: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "name":       c.first().unwrap_or(&""),
        "used":       c.get(1).unwrap_or(&""),
        "available":  c.get(2).unwrap_or(&""),
        "refer":      c.get(3).unwrap_or(&""),
        "mountpoint": c.get(4).unwrap_or(&""),
    })))
}

async fn destroy_dataset(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zfs(&["destroy", &name]).await?;
    Ok(Json(json!({ "message": format!("Dataset '{name}' destroyed") })))
}

async fn mount_dataset(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zfs(&["mount", &name]).await?;
    Ok(Json(json!({ "message": format!("Dataset '{name}' mounted") })))
}

async fn unmount_dataset(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zfs(&["unmount", &name]).await?;
    Ok(Json(json!({ "message": format!("Dataset '{name}' unmounted") })))
}

async fn rename_dataset(
    Path(name): Path<String>,
    Json(body): Json<RenameBody>,
) -> Result<Json<Value>, ApiError> {
    if body.new_name.is_empty() {
        return Err(ApiError::BadRequest("'new_name' is required".into()));
    }
    let mut args = vec!["rename".to_string()];
    if body.recursive {
        args.push("-r".to_string());
    }
    args.push(name.clone());
    args.push(body.new_name.clone());
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&args_ref).await?;
    Ok(Json(json!({ "message": format!("Renamed '{name}' → '{}'", body.new_name) })))
}

async fn dataset_space(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["list", "-H", "-p", "-o", "name,used,avail,refer,quota,reservation", &name]).await?;
    let line = raw.lines().next().ok_or_else(|| ApiError::NotFound(format!("Dataset '{name}' not found")))?;
    let c: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "name":        c.first().unwrap_or(&""),
        "used":        c.get(1).unwrap_or(&""),
        "available":   c.get(2).unwrap_or(&""),
        "refer":       c.get(3).unwrap_or(&""),
        "quota":       c.get(4).unwrap_or(&""),
        "reservation": c.get(5).unwrap_or(&""),
    })))
}
