use std::collections::HashMap;

use axum::{
    extract::{DefaultBodyLimit, Path, Query, State},
    http::HeaderMap,
    routing::{get, post, put},
    Json, Router,
};
use base64::Engine as _;
use serde::Deserialize;
use serde_json::{json, Value};

use super::module_store::mgmt_rate_limit;
use crate::error::ApiError;
use crate::modules::audit::{actor_from_headers, audit};
use crate::modules::manifest::{Manifest, MAX_WASM_BYTES};
use crate::modules::registry;
use crate::modules::runner::{execute_module, parse_schedule};
use crate::modules::secrets;
use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/modules/install", post(install_from_registry))
        .route("/api/v1/modules/sideload", post(sideload))
        .route("/api/v1/modules/active", get(list_active))
        .route("/api/v1/modules/:id", axum::routing::delete(uninstall))
        .route("/api/v1/modules/:id/config", put(update_config))
        .route("/api/v1/modules/:id/enable", post(enable))
        .route("/api/v1/modules/:id/disable", post(disable))
        .route("/api/v1/modules/:id/run", post(trigger_run))
        .route("/api/v1/modules/:id/runs", get(run_history))
        // Sideload payloads carry a base64 wasm artifact (up to 32 MiB raw).
        .layer(DefaultBodyLimit::max(48 * 1024 * 1024))
        .with_state(state)
}

fn db(state: &AppState) -> Result<&std::sync::Arc<tokio_postgres::Client>, ApiError> {
    state.pg.as_ref().ok_or(ApiError::InternalError("database unavailable".into()))
}

/// Persists a validated package: wasm to disk, module + empty config to DB.
async fn register_module(
    state: &AppState,
    package: registry::ModulePackage,
    source: &str,
    registry_url: Option<&str>,
) -> Result<(), ApiError> {
    let runtime = state
        .module_runtime
        .as_ref()
        .ok_or(ApiError::InternalError("module runtime unavailable".into()))?;
    runtime
        .validate_component(&package.wasm)
        .map_err(ApiError::BadRequest)?;

    tokio::fs::create_dir_all(registry::modules_dir())
        .await
        .map_err(|e| ApiError::InternalError(format!("cannot create modules dir: {e}")))?;
    let wasm_path = registry::wasm_path(&package.manifest.id)
        .ok_or(ApiError::BadRequest("invalid module id".into()))?;
    tokio::fs::write(&wasm_path, &package.wasm)
        .await
        .map_err(|e| ApiError::InternalError(format!("cannot store wasm: {e}")))?;

    let manifest_json = serde_json::to_value(&package.manifest)
        .map_err(|e| ApiError::InternalError(e.to_string()))?;
    let m = &package.manifest;
    let pg = db(state)?;
    pg.execute(
        "INSERT INTO modules(id, name, version, author, description, icon, repository_url, source, registry_url, wasm_sha256, manifest)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name, version = EXCLUDED.version, author = EXCLUDED.author,
             description = EXCLUDED.description, icon = EXCLUDED.icon,
             repository_url = EXCLUDED.repository_url, source = EXCLUDED.source,
             registry_url = EXCLUDED.registry_url, wasm_sha256 = EXCLUDED.wasm_sha256,
             manifest = EXCLUDED.manifest",
        &[
            &m.id, &m.name, &m.version, &m.author, &m.description, &m.icon,
            &m.repository_url, &source, &registry_url, &package.wasm_sha256, &manifest_json,
        ],
    )
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?;
    pg.execute(
        "INSERT INTO module_configs(module_id) VALUES($1) ON CONFLICT DO NOTHING",
        &[&m.id],
    )
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?;
    Ok(())
}

#[derive(Deserialize)]
struct InstallBody {
    registry_url: String,
    id: String,
    version: Option<String>,
    wasm_url: Option<String>,
}

async fn install_from_registry(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<InstallBody>,
) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(&state, &headers)?;
    // Only registries the user has configured are valid install sources.
    let known = super::module_store::configured_registries(&state)
        .await?
        .into_iter()
        .any(|(_, url, _)| url == body.registry_url);
    if !known {
        return Err(ApiError::BadRequest("unknown registry".into()));
    }

    let index = registry::fetch_index(&body.registry_url)
        .await
        .map_err(ApiError::BadRequest)?;
    let entry = index
        .modules
        .iter()
        .find(|m| m.id == body.id)
        .ok_or_else(|| ApiError::NotFound(format!("module {:?} not in registry", body.id)))?;
    let package = registry::download_package_custom(entry, body.version, body.wasm_url)
        .await
        .map_err(ApiError::BadRequest)?;

    let module_id = package.manifest.id.clone();
    let version = package.manifest.version.clone();
    register_module(&state, package, "registry", Some(&body.registry_url)).await?;

    let actor = actor_from_headers(&state, &headers).await;
    audit(&state, &actor, "module_installed", Some(&module_id),
          json!({ "version": version, "registry_url": body.registry_url })).await;
    Ok(Json(json!({ "id": module_id, "version": version })))
}

#[derive(Deserialize)]
struct SideloadBody {
    manifest_toml: String,
    wasm_base64: String,
}

async fn sideload(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<SideloadBody>,
) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(&state, &headers)?;
    let manifest = Manifest::parse(&body.manifest_toml).map_err(ApiError::BadRequest)?;
    let wasm = base64::engine::general_purpose::STANDARD
        .decode(body.wasm_base64.as_bytes())
        .map_err(|e| ApiError::BadRequest(format!("invalid wasm_base64: {e}")))?;
    if wasm.len() > MAX_WASM_BYTES {
        return Err(ApiError::BadRequest(format!("wasm exceeds {MAX_WASM_BYTES} bytes")));
    }

    let module_id = manifest.id.clone();
    let version = manifest.version.clone();
    let package = registry::ModulePackage {
        wasm_sha256: registry::sha256_hex(&wasm),
        manifest,
        wasm,
    };
    register_module(&state, package, "sideload", None).await?;

    let actor = actor_from_headers(&state, &headers).await;
    audit(&state, &actor, "module_sideloaded", Some(&module_id), json!({ "version": version })).await;
    Ok(Json(json!({ "id": module_id, "version": version })))
}

async fn list_active(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let pg = db(&state)?;
    let rows = pg
        .query(
            "SELECT m.id, m.name, m.version, m.author, m.description, m.icon,
                    m.repository_url, m.source, m.registry_url, m.enabled,
                    m.installed_at, m.manifest, c.config, c.secrets,
                    r.started_at, r.finished_at, r.success, r.message
             FROM modules m
             LEFT JOIN module_configs c ON c.module_id = m.id
             LEFT JOIN LATERAL (
                 SELECT started_at, finished_at, success, message
                 FROM module_runs WHERE module_id = m.id
                 ORDER BY started_at DESC LIMIT 1
             ) r ON TRUE
             ORDER BY m.installed_at",
            &[],
        )
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;

    let master_key = state.master_key;
    let modules: Vec<Value> = rows
        .iter()
        .map(|row| {
            let manifest: Value = row.get(11);
            let secrets_blob: Option<Vec<u8>> = row.get(13);
            // Never return secret values — only which keys are set.
            let secret_keys_set: Vec<String> = match (master_key, secrets_blob) {
                (Some(key), Some(blob)) => secrets::decrypt_secrets(&key, &blob)
                    .map(|m| m.keys().cloned().collect())
                    .unwrap_or_default(),
                _ => Vec::new(),
            };
            json!({
                "id": row.get::<_, String>(0),
                "name": row.get::<_, String>(1),
                "version": row.get::<_, String>(2),
                "author": row.get::<_, String>(3),
                "description": row.get::<_, String>(4),
                "icon": row.get::<_, String>(5),
                "repository_url": row.get::<_, String>(6),
                "source": row.get::<_, String>(7),
                "registry_url": row.get::<_, Option<String>>(8),
                "enabled": row.get::<_, bool>(9),
                "installed_at": row.get::<_, chrono::DateTime<chrono::Utc>>(10),
                "config_schema": manifest.get("config_schema").cloned().unwrap_or(json!([])),
                "config": row.get::<_, Option<Value>>(12).unwrap_or(json!({})),
                "secret_keys_set": secret_keys_set,
                "last_run": row.get::<_, Option<chrono::DateTime<chrono::Utc>>>(14).map(|started| json!({
                    "started_at": started,
                    "finished_at": row.get::<_, Option<chrono::DateTime<chrono::Utc>>>(15),
                    "success": row.get::<_, Option<bool>>(16),
                    "message": row.get::<_, Option<String>>(17),
                })),
            })
        })
        .collect();
    Ok(Json(json!({ "modules": modules })))
}

async fn uninstall(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(&state, &headers)?;
    let pg = db(&state)?;
    let deleted = pg
        .execute("DELETE FROM modules WHERE id = $1", &[&id])
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;
    if deleted == 0 {
        return Err(ApiError::NotFound(format!("module {id:?} not installed")));
    }
    if let Some(path) = registry::wasm_path(&id) {
        let _ = tokio::fs::remove_file(path).await;
    }

    let actor = actor_from_headers(&state, &headers).await;
    audit(&state, &actor, "module_uninstalled", Some(&id), json!({})).await;
    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct ConfigBody {
    #[serde(default)]
    config: serde_json::Map<String, Value>,
    /// Secret updates: value = set/replace, null = remove.
    #[serde(default)]
    secrets: HashMap<String, Option<String>>,
}

async fn update_config(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(body): Json<ConfigBody>,
) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(&state, &headers)?;
    let pg = db(&state)?;
    let row = pg
        .query_opt("SELECT manifest, (SELECT secrets FROM module_configs WHERE module_id = id) FROM modules WHERE id = $1", &[&id])
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?
        .ok_or_else(|| ApiError::NotFound(format!("module {id:?} not installed")))?;
    let manifest: Manifest = serde_json::from_value(row.get(0))
        .map_err(|e| ApiError::InternalError(format!("stored manifest invalid: {e}")))?;

    // Config keys must exist in the schema (secrets go through `secrets`).
    let allowed: Vec<&str> = manifest
        .config_schema
        .iter()
        .filter(|f| f.field_type != "secret")
        .map(|f| f.key.as_str())
        .collect();
    for key in body.config.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(ApiError::BadRequest(format!("unknown config key {key:?}")));
        }
    }
    if let Some(schedule) = body.config.get("schedule").and_then(|v| v.as_str()) {
        parse_schedule(schedule).map_err(ApiError::BadRequest)?;
    }

    let secret_keys = manifest.secret_keys();
    for key in body.secrets.keys() {
        if !secret_keys.contains(&key.as_str()) {
            return Err(ApiError::BadRequest(format!("unknown secret key {key:?}")));
        }
    }

    let secrets_blob = if body.secrets.is_empty() {
        row.get::<_, Option<Vec<u8>>>(1)
    } else {
        let master_key = state
            .master_key
            .ok_or(ApiError::InternalError("secrets master key unavailable".into()))?;
        let mut current = match row.get::<_, Option<Vec<u8>>>(1) {
            Some(blob) => secrets::decrypt_secrets(&master_key, &blob)
                .map_err(ApiError::InternalError)?,
            None => HashMap::new(),
        };
        for (key, value) in body.secrets {
            match value {
                Some(v) => { current.insert(key, v); }
                None => { current.remove(&key); }
            }
        }
        Some(secrets::encrypt_secrets(&master_key, &current).map_err(ApiError::InternalError)?)
    };

    let config_value = Value::Object(body.config);
    pg.execute(
        "INSERT INTO module_configs(module_id, config, secrets, updated_at) VALUES($1, $2, $3, NOW())
         ON CONFLICT (module_id) DO UPDATE SET config = $2, secrets = $3, updated_at = NOW()",
        &[&id, &config_value, &secrets_blob],
    )
    .await
    .map_err(|e| ApiError::InternalError(e.to_string()))?;

    let actor = actor_from_headers(&state, &headers).await;
    audit(&state, &actor, "module_config_updated", Some(&id), json!({})).await;
    Ok(Json(json!({ "ok": true })))
}

async fn set_enabled(state: &AppState, headers: &HeaderMap, id: &str, enabled: bool) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(state, headers)?;
    let pg = db(state)?;
    let updated = pg
        .execute("UPDATE modules SET enabled = $1 WHERE id = $2", &[&enabled, &id])
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;
    if updated == 0 {
        return Err(ApiError::NotFound(format!("module {id:?} not installed")));
    }
    let actor = actor_from_headers(state, headers).await;
    let action = if enabled { "module_enabled" } else { "module_disabled" };
    audit(state, &actor, action, Some(id), json!({})).await;
    Ok(Json(json!({ "ok": true, "enabled": enabled })))
}

async fn enable(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    set_enabled(&state, &headers, &id, true).await
}

async fn disable(State(state): State<AppState>, headers: HeaderMap, Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    set_enabled(&state, &headers, &id, false).await
}

async fn trigger_run(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(&state, &headers)?;
    let actor = actor_from_headers(&state, &headers).await;
    audit(&state, &actor, "module_run_triggered", Some(&id), json!({})).await;

    let (run_id, outcome) = execute_module(&state, &id, "manual")
        .await
        .map_err(ApiError::BadRequest)?;
    Ok(Json(json!({
        "run_id": run_id,
        "success": outcome.success,
        "message": outcome.message,
        "metrics_written": outcome.metrics_written,
        "error": outcome.error,
    })))
}

#[derive(Deserialize)]
struct RunsQuery {
    #[serde(default)]
    limit: Option<i64>,
}

async fn run_history(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<RunsQuery>,
) -> Result<Json<Value>, ApiError> {
    let pg = db(&state)?;
    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let rows = pg
        .query(
            "SELECT id, started_at, finished_at, success, message, metrics_written, trigger
             FROM module_runs WHERE module_id = $1 ORDER BY started_at DESC LIMIT $2",
            &[&id, &limit],
        )
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;
    let runs: Vec<Value> = rows
        .iter()
        .map(|row| {
            json!({
                "id": row.get::<_, i64>(0),
                "started_at": row.get::<_, chrono::DateTime<chrono::Utc>>(1),
                "finished_at": row.get::<_, Option<chrono::DateTime<chrono::Utc>>>(2),
                "success": row.get::<_, Option<bool>>(3),
                "message": row.get::<_, String>(4),
                "metrics_written": row.get::<_, i32>(5),
                "trigger": row.get::<_, String>(6),
            })
        })
        .collect();
    Ok(Json(json!({ "runs": runs })))
}
