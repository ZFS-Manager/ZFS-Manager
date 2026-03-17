use axum::{
    extract::{Path, Query},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::ApiError, executor};

pub fn router() -> Router {
    Router::new()
        // Collection
        .route("/api/v1/snapshots", get(list_snapshots).post(create_snapshot))
        // Single item
        .route("/api/v1/snapshots/*name", get(get_snapshot).delete(destroy_snapshot))
        // Actions – snapshot name in request body
        .route("/api/v1/snapshots/rollback", post(rollback))
        .route("/api/v1/snapshots/clone",    post(clone_snapshot))
        .route("/api/v1/snapshots/hold",     post(add_hold).delete(release_hold))
        .route("/api/v1/snapshots/holds",    get(list_holds))
        .route("/api/v1/snapshots/diff",     get(diff_snapshot))
        .route("/api/v1/snapshots/send",     post(send_recv))
}

// ── Bodies ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateSnapshotBody {
    pub name: String,
    #[serde(default)]
    pub recursive: bool,
}

#[derive(Deserialize)]
pub struct RollbackBody {
    pub name: String,
    #[serde(default)]
    pub force: bool,
}

#[derive(Deserialize)]
pub struct CloneBody {
    pub name: String,
    pub target: String,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Deserialize)]
pub struct HoldBody {
    pub name: String,
    pub tag: String,
}

#[derive(Deserialize)]
pub struct NameQuery {
    pub name: String,
}

#[derive(Deserialize)]
pub struct SendRecvBody {
    pub snapshot: String,
    pub destination: String,
    pub from_snapshot: Option<String>,
    #[serde(default)]
    pub replicate: bool,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn list_snapshots() -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&[
        "list", "-H", "-p", "-t", "snapshot",
        "-o", "name,used,refer,creation",
    ])
    .await?;
    let snaps: Vec<Value> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            json!({
                "name":     c.first().unwrap_or(&""),
                "used":     c.get(1).unwrap_or(&""),
                "refer":    c.get(2).unwrap_or(&""),
                "creation": c.get(3).unwrap_or(&""),
            })
        })
        .collect();
    Ok(Json(json!({ "snapshots": snaps })))
}

async fn create_snapshot(Json(body): Json<CreateSnapshotBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required (e.g. 'tank/data@snap1')".into()));
    }
    let mut args = vec!["snapshot"];
    if body.recursive {
        args.push("-r");
    }
    args.push(&body.name);
    executor::zfs(&args).await?;
    Ok(Json(json!({ "message": format!("Snapshot '{}' created", body.name) })))
}

async fn get_snapshot(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&[
        "list", "-H", "-p", "-t", "snapshot",
        "-o", "name,used,refer,creation",
        &name,
    ])
    .await?;
    let line = raw
        .lines()
        .next()
        .ok_or_else(|| ApiError::NotFound(format!("Snapshot '{name}' not found")))?;
    let c: Vec<&str> = line.split('\t').collect();
    Ok(Json(json!({
        "name":     c.first().unwrap_or(&""),
        "used":     c.get(1).unwrap_or(&""),
        "refer":    c.get(2).unwrap_or(&""),
        "creation": c.get(3).unwrap_or(&""),
    })))
}

async fn destroy_snapshot(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zfs(&["destroy", &name]).await?;
    Ok(Json(json!({ "message": format!("Snapshot '{name}' destroyed") })))
}

async fn rollback(Json(body): Json<RollbackBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    let mut args = vec!["rollback"];
    if body.force {
        args.push("-f");
    }
    args.push(&body.name);
    executor::zfs(&args).await?;
    Ok(Json(json!({ "message": format!("Rolled back to snapshot '{}'", body.name) })))
}

async fn clone_snapshot(Json(body): Json<CloneBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() || body.target.is_empty() {
        return Err(ApiError::BadRequest("'name' and 'target' are required".into()));
    }
    let mut args = vec!["clone".to_string()];
    args.extend(body.options);
    args.push(body.name.clone());
    args.push(body.target.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&refs).await?;
    Ok(Json(json!({ "message": format!("Cloned '{}' → '{}'", body.name, body.target) })))
}

async fn list_holds(Query(q): Query<NameQuery>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["holds", "-H", &q.name]).await?;
    let holds: Vec<Value> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            json!({
                "name":      c.first().unwrap_or(&""),
                "tag":       c.get(1).unwrap_or(&""),
                "timestamp": c.get(2).unwrap_or(&""),
            })
        })
        .collect();
    Ok(Json(json!({ "holds": holds })))
}

async fn add_hold(Json(body): Json<HoldBody>) -> Result<Json<Value>, ApiError> {
    if body.tag.is_empty() || body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' and 'tag' are required".into()));
    }
    executor::zfs(&["hold", &body.tag, &body.name]).await?;
    Ok(Json(json!({ "message": format!("Hold '{}' added to '{}'", body.tag, body.name) })))
}

async fn release_hold(Json(body): Json<HoldBody>) -> Result<Json<Value>, ApiError> {
    if body.tag.is_empty() || body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' and 'tag' are required".into()));
    }
    executor::zfs(&["release", &body.tag, &body.name]).await?;
    Ok(Json(json!({ "message": format!("Hold '{}' released from '{}'", body.tag, body.name) })))
}

async fn diff_snapshot(Query(q): Query<NameQuery>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["diff", &q.name]).await?;
    let lines: Vec<&str> = raw.lines().collect();
    Ok(Json(json!({ "name": q.name, "diff": lines })))
}

async fn send_recv(Json(body): Json<SendRecvBody>) -> Result<Json<Value>, ApiError> {
    if body.snapshot.is_empty() || body.destination.is_empty() {
        return Err(ApiError::BadRequest("'snapshot' and 'destination' are required".into()));
    }
    let mut send_parts = vec!["send".to_string()];
    if body.replicate {
        send_parts.push("-R".to_string());
    }
    if let Some(ref from) = body.from_snapshot {
        send_parts.push("-i".to_string());
        send_parts.push(from.clone());
    }
    send_parts.push(body.snapshot.clone());

    let script = format!(
        "zfs {} | zfs recv {}",
        send_parts[..].join(" "),
        body.destination
    );
    let output = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(&script)
        .output()
        .await?;

    if output.status.success() {
        Ok(Json(json!({ "message": format!("Send/recv '{}' → '{}' completed", body.snapshot, body.destination) })))
    } else {
        Err(ApiError::CommandFailed {
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            code: output.status.code(),
        })
    }
}
