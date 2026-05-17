use axum::{
    extract::{Path, Query},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use std::collections::HashSet;
use std::sync::OnceLock;
use tokio::sync::Mutex as TokioMutex;

use crate::{error::ApiError, executor};
use tracing::{error, info};

fn active_rewrites() -> &'static TokioMutex<HashSet<String>> {
    static REWRITES: OnceLock<TokioMutex<HashSet<String>>> = OnceLock::new();
    REWRITES.get_or_init(|| TokioMutex::new(HashSet::new()))
}

pub fn router() -> Router {
    Router::new()
        // Collection
        .route("/api/v1/datasets", get(list_datasets).post(create_dataset))
        // Single item  – GET/DELETE by wildcard name (e.g. "tank/data")
        .route("/api/v1/datasets/*name", get(get_dataset).delete(destroy_dataset))
        // Actions – name is passed in the request body
        .route("/api/v1/datasets/mount",  post(mount_dataset))
        .route("/api/v1/datasets/unmount", post(unmount_dataset))
        .route("/api/v1/datasets/rename", post(rename_dataset))
        .route("/api/v1/datasets/space",  get(dataset_space))
        .route("/api/v1/datasets/rewrite", post(rewrite_dataset))
        .route("/api/v1/datasets/rewrite/status", get(rewrite_status))
}

// ── Bodies ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateDatasetBody {
    pub name: String,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Deserialize)]
pub struct NameBody {
    pub name: String,
}

#[derive(Deserialize)]
pub struct RenameBody {
    pub name: String,
    pub new_name: String,
    #[serde(default)]
    pub recursive: bool,
}

#[derive(Deserialize)]
pub struct SpaceQuery {
    pub name: String,
}

#[derive(Deserialize, Default)]
pub struct DestroyQuery {
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub recursive: bool,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn list_datasets() -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&[
        "list", "-H", "-p", "-t", "filesystem",
        "-o", "name,used,avail,refer,mountpoint,compression,dedup,readonly",
    ])
    .await?;
    let datasets: Vec<Value> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            let name = c.first().unwrap_or(&"");

            if name.contains("/.system") || name.contains("/ix-apps") {
                return None;
            }

            Some(json!({
                "name":        name,
                "used":        c.get(1).unwrap_or(&""),
                "available":   c.get(2).unwrap_or(&""),
                "refer":       c.get(3).unwrap_or(&""),
                "mountpoint":  c.get(4).unwrap_or(&""),
                "compression": c.get(5).unwrap_or(&"off"),
                "dedup":       c.get(6).unwrap_or(&"off"),
                "readonly":    c.get(7).unwrap_or(&"off"),
            }))
        })
        .collect();
    Ok(Json(json!({ "datasets": datasets })))
}

async fn create_dataset(Json(body): Json<CreateDatasetBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    executor::validate_zfs_name(&body.name, "dataset")?;
    let mut args = vec!["create".to_string()];
    args.extend(body.options);
    args.push(body.name.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&refs).await?;
    Ok(Json(json!({ "message": format!("Dataset '{}' created", body.name) })))
}

async fn get_dataset(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "dataset")?;
    let raw = executor::zfs(&[
        "list", "-H", "-p",
        "-o", "name,used,avail,refer,mountpoint",
        &name,
    ])
    .await?;
    let line = raw
        .lines()
        .next()
        .ok_or_else(|| ApiError::NotFound(format!("Dataset '{name}' not found")))?;
    let c: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "name":       c.first().unwrap_or(&""),
        "used":       c.get(1).unwrap_or(&""),
        "available":  c.get(2).unwrap_or(&""),
        "refer":      c.get(3).unwrap_or(&""),
        "mountpoint": c.get(4).unwrap_or(&""),
    })))
}

async fn destroy_dataset(
    Path(name): Path<String>,
    Query(q): Query<DestroyQuery>,
) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "dataset")?;
    // When force is requested, try to unmount first (handles busy datasets)
    if q.force {
        if q.recursive {
            let _ = executor::zfs(&["unmount", "-r", &name]).await;
        } else {
            let _ = executor::zfs(&["unmount", &name]).await;
        }
    }

    let mut args = vec!["destroy".to_string()];
    if q.recursive { args.push("-r".to_string()); }
    if q.force     { args.push("-f".to_string()); }
    args.push(name.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    match executor::zfs(&refs).await {
        Ok(_) => Ok(Json(json!({ "message": format!("Dataset '{name}' destroyed") }))),
        Err(ApiError::CommandFailed { ref stderr, .. })
            if (stderr.contains("has children") || stderr.contains("filesystem has children"))
               && !q.recursive =>
        {
            Err(ApiError::BadRequest(
                "Dataset has children. Enable 'Recursive' to delete all child datasets.".into()
            ))
        }
        Err(ApiError::CommandFailed { ref stderr, .. })
            if stderr.contains("dataset is busy") && !q.force =>
        {
            Err(ApiError::BadRequest(
                "Dataset is busy (mounted). Enable 'Force' to unmount and delete.".into()
            ))
        }
        Err(e) => Err(e),
    }
}

async fn mount_dataset(Json(body): Json<NameBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    executor::zfs(&["mount", &body.name]).await?;
    Ok(Json(json!({ "message": format!("Dataset '{}' mounted", body.name) })))
}

async fn unmount_dataset(Json(body): Json<NameBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    executor::zfs(&["unmount", &body.name]).await?;
    Ok(Json(json!({ "message": format!("Dataset '{}' unmounted", body.name) })))
}

async fn rename_dataset(Json(body): Json<RenameBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() || body.new_name.is_empty() {
        return Err(ApiError::BadRequest("'name' and 'new_name' are required".into()));
    }
    let mut args = vec!["rename".to_string()];
    if body.recursive {
        args.push("-r".to_string());
    }
    args.push(body.name.clone());
    args.push(body.new_name.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&refs).await?;
    Ok(Json(json!({ "message": format!("Renamed '{}' -> '{}'", body.name, body.new_name) })))
}

async fn dataset_space(Query(q): Query<SpaceQuery>) -> Result<Json<Value>, ApiError> {
    if q.name.is_empty() {
        return Err(ApiError::BadRequest("query param 'name' is required".into()));
    }
    let raw = executor::zfs(&[
        "list", "-H", "-p",
        "-o", "name,used,avail,refer,quota,reservation",
        &q.name,
    ])
    .await?;
    let line = raw
        .lines()
        .next()
        .ok_or_else(|| ApiError::NotFound(format!("Dataset '{}' not found", q.name)))?;
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

async fn rewrite_dataset(Json(body): Json<NameBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    
    executor::validate_zfs_name(&body.name, "dataset")?;

    // Get the mountpoint of the dataset
    let raw = match executor::zfs(&[
        "list", "-H", "-p",
        "-o", "mountpoint",
        &body.name,
    ]).await {
        Ok(out) => out,
        Err(e) => return Err(e),
    };

    let mountpoint = raw.trim().to_string();
    if mountpoint.is_empty() || mountpoint == "none" || mountpoint == "legacy" {
        return Err(ApiError::BadRequest(format!(
            "Dataset '{}' does not have a valid active mountpoint (mountpoint='{}')",
            body.name, mountpoint
        )));
    }

    let mut lock = active_rewrites().lock().await;
    if lock.contains(&body.name) {
        return Ok(Json(json!({ "message": format!("Rewrite already running for '{}'", body.name) })));
    }
    lock.insert(body.name.clone());
    drop(lock);

    let ds_name = body.name.clone();
    let mount_path = mountpoint.clone();
    
    // Spawn background task running on the mountpoint path!
    tokio::spawn(async move {
        // Try running via nsenter first (to access host mount namespace)
        let res = executor::command("nsenter", &["-t", "1", "-m", "--", "zfs", "rewrite", "-r", &mount_path]).await;
        if let Err(e) = res {
            error!("Failed to run zfs rewrite via nsenter: {:?}. Falling back to direct execution.", e);
            // Fallback: run directly inside the container (if mountpoints are mapped)
            let fallback_res = executor::command("zfs", &["rewrite", "-r", &mount_path]).await;
            if let Err(fe) = fallback_res {
                error!("Failed to run zfs rewrite directly: {:?}", fe);
            } else {
                info!("Direct zfs rewrite completed successfully for '{}'", ds_name);
            }
        } else {
            info!("Nsenter zfs rewrite completed successfully for '{}'", ds_name);
        }
        let mut lock = active_rewrites().lock().await;
        lock.remove(&ds_name);
    });

    Ok(Json(json!({ "message": format!("Rewrite started in background for '{}' at '{}'", body.name, mountpoint) })))
}

#[derive(Deserialize)]
pub struct StatusQuery {
    pub name: String,
}

async fn rewrite_status(Query(q): Query<StatusQuery>) -> Result<Json<Value>, ApiError> {
    if q.name.is_empty() {
        return Err(ApiError::BadRequest("query param 'name' is required".into()));
    }
    let lock = active_rewrites().lock().await;
    let is_running = lock.contains(&q.name);
    
    Ok(Json(json!({
        "in_progress": is_running,
        "name": q.name,
    })))
}
