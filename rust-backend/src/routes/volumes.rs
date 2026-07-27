use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use redis::AsyncCommands;
use serde::Deserialize;
use serde_json::{json, Value};
use tracing::warn;

use crate::{error::ApiError, executor, state::AppState};

const CACHE_KEY: &str = "zfs:volumes";
const CACHE_TTL: u64 = 30;

async fn bust_cache(state: &AppState) {
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let _: redis::RedisResult<()> = conn.del(CACHE_KEY).await;
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/volumes", get(list_volumes).post(create_volume))
        .route(
            "/api/v1/volumes/*name",
            get(get_volume).delete(destroy_volume),
        )
        .with_state(state)
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

async fn list_volumes(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        let cached: redis::RedisResult<Option<String>> = conn.get(CACHE_KEY).await;
        if let Ok(Some(hit)) = cached {
            if let Ok(val) = serde_json::from_str::<Value>(&hit) {
                return Ok(Json(val));
            }
        }
    }

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

    let result = json!({ "volumes": volumes });
    if let Some(ref redis_conn) = state.redis {
        let mut conn = redis_conn.clone();
        if let Ok(json_str) = serde_json::to_string(&result) {
            let set_res: redis::RedisResult<()> = conn.set_ex(CACHE_KEY, json_str, CACHE_TTL).await;
            if let Err(e) = set_res { warn!("Redis SET failed for {CACHE_KEY}: {e}"); }
        }
    }
    Ok(Json(result))
}

async fn create_volume(State(state): State<AppState>, Json(body): Json<CreateVolumeBody>) -> Result<Json<Value>, ApiError> {
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
    bust_cache(&state).await;
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

async fn destroy_volume(State(state): State<AppState>, Path(name): Path<String>) -> Result<Json<Value>, ApiError> {
    executor::validate_zfs_name(&name, "volume")?;
    executor::zfs(&["destroy", &name]).await?;
    bust_cache(&state).await;
    Ok(Json(json!({ "message": format!("Volume '{name}' destroyed") })))
}
