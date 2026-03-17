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
        .route("/api/v1/snapshots", get(list_snapshots).post(create_snapshot))
        .route(
            "/api/v1/snapshots/*name",
            get(get_snapshot).delete(destroy_snapshot),
        )
        .route("/api/v1/snapshots/*name/rollback", post(rollback))
        .route("/api/v1/snapshots/*name/clone", post(clone_snapshot))
        .route("/api/v1/snapshots/*name/holds", get(list_holds).post(add_hold).delete(release_hold))
        .route("/api/v1/snapshots/*name/diff", get(diff_snapshot))
        .route("/api/v1/snapshots/send", post(send_recv))
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
    #[serde(default)]
    pub force: bool,
}

#[derive(Deserialize)]
pub struct CloneBody {
    pub target: String,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Deserialize)]
pub struct HoldBody {
    pub tag: String,
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
    let raw = executor::zfs(&["list", "-H", "-p", "-t", "snapshot", "-o", "name,used,refer,creation"]).await?;
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
    if body.recursive { args.push("-r"); }
    args.push(&body.name);
    executor::zfs(&args).await?;
    Ok(Json(json!({ "message": format!("Snapshot '{}' created", body.name) })))
}

async fn get_snapshot(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["list", "-H", "-p", "-t", "snapshot", "-o", "name,used,refer,creation", &name]).await?;
    let line = raw.lines().next().ok_or_else(|| ApiError::NotFound(format!("Snapshot '{name}' not found")))?;
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

async fn rollback(
    Path(name): Path<String>,
    body: Option<Json<RollbackBody>>,
) -> Result<Json<Value>, ApiError> {
    let force = body.map(|b| b.force).unwrap_or(false);
    let mut args = vec!["rollback"];
    if force { args.push("-f"); }
    args.push(&name);
    executor::zfs(&args).await?;
    Ok(Json(json!({ "message": format!("Rolled back to snapshot '{name}'") })))
}

async fn clone_snapshot(
    Path(name): Path<String>,
    Json(body): Json<CloneBody>,
) -> Result<Json<Value>, ApiError> {
    if body.target.is_empty() {
        return Err(ApiError::BadRequest("'target' is required".into()));
    }
    let mut args = vec!["clone".to_string()];
    args.extend(body.options);
    args.push(name.clone());
    args.push(body.target.clone());
    let args_ref: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&args_ref).await?;
    Ok(Json(json!({ "message": format!("Cloned '{name}' → '{}'", body.target) })))
}

async fn list_holds(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["holds", "-H", &name]).await?;
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

async fn add_hold(
    Path(name): Path<String>,
    Json(body): Json<HoldBody>,
) -> Result<Json<Value>, ApiError> {
    if body.tag.is_empty() {
        return Err(ApiError::BadRequest("'tag' is required".into()));
    }
    executor::zfs(&["hold", &body.tag, &name]).await?;
    Ok(Json(json!({ "message": format!("Hold '{}' added to '{name}'", body.tag) })))
}

async fn release_hold(
    Path(name): Path<String>,
    Json(body): Json<HoldBody>,
) -> Result<Json<Value>, ApiError> {
    if body.tag.is_empty() {
        return Err(ApiError::BadRequest("'tag' is required".into()));
    }
    executor::zfs(&["release", &body.tag, &name]).await?;
    Ok(Json(json!({ "message": format!("Hold '{}' released from '{name}'", body.tag) })))
}

async fn diff_snapshot(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    let raw = executor::zfs(&["diff", &name]).await?;
    let lines: Vec<&str> = raw.lines().collect();
    Ok(Json(json!({ "name": name, "diff": lines })))
}

async fn send_recv(Json(body): Json<SendRecvBody>) -> Result<Json<Value>, ApiError> {
    if body.snapshot.is_empty() || body.destination.is_empty() {
        return Err(ApiError::BadRequest("'snapshot' and 'destination' are required".into()));
    }

    // Build: zfs send [-i from] [-R] snapshot | zfs recv destination
    let mut send_args = vec!["send".to_string()];
    if body.replicate { send_args.push("-R".to_string()); }
    if let Some(ref from) = body.from_snapshot {
        send_args.push("-i".to_string());
        send_args.push(from.clone());
    }
    send_args.push(body.snapshot.clone());

    // We pipe via shell
    let script = format!(
        "zfs send {} | zfs recv {}",
        send_args[1..].join(" "),
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
