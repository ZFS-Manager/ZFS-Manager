use axum::{
    extract::Path,
    routing::{delete, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::ApiError, executor};

pub fn router() -> Router {
    Router::new()
        .route("/api/v1/clones",         post(create_clone))
        .route("/api/v1/clones/promote", post(promote_clone))
        .route("/api/v1/clones/*name",   delete(destroy_clone))
}

// ── Bodies ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct CreateCloneBody {
    pub snapshot: String,
    pub target: String,
    #[serde(default)]
    pub options: Vec<String>,
}

#[derive(Deserialize)]
pub struct PromoteBody {
    pub name: String,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async fn create_clone(Json(body): Json<CreateCloneBody>) -> Result<Json<Value>, ApiError> {
    if body.snapshot.is_empty() || body.target.is_empty() {
        return Err(ApiError::BadRequest("'snapshot' and 'target' are required".into()));
    }
    let mut args = vec!["clone".to_string()];
    args.extend(body.options);
    args.push(body.snapshot.clone());
    args.push(body.target.clone());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    executor::zfs(&refs).await?;
    Ok(Json(json!({ "message": format!("Clone '{}' created from '{}'", body.target, body.snapshot) })))
}

async fn promote_clone(Json(body): Json<PromoteBody>) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    executor::zfs(&["promote", &body.name]).await?;
    Ok(Json(json!({ "message": format!("Clone '{}' promoted", body.name) })))
}

async fn destroy_clone(Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::zfs(&["destroy", &name]).await?;
    Ok(Json(json!({ "message": format!("Clone '{name}' destroyed") })))
}
