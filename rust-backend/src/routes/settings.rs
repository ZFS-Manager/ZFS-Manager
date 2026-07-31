use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Sha256, Digest};
use rand::Rng;
use std::collections::HashMap;
use base64::Engine as _;

use crate::state::AppState;
use crate::error::ApiError;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/settings/api-keys",     get(list_api_keys).post(create_api_key))
        .route("/api/v1/settings/api-keys/:id", delete(revoke_api_key))
        .route("/api/v1/settings/password",     post(change_password))
        .route("/api/v1/settings/module-db",    get(get_module_db).put(update_module_db))
        .route("/api/v1/settings/module-db/test", post(test_module_db))
        .with_state(state)
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn generate_key() -> String {
    let bytes: [u8; 32] = rand::thread_rng().gen();
    hex::encode(bytes)
}

async fn list_api_keys(
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    let pg = state.pg.as_ref().ok_or_else(|| ApiError::InternalError("Database unavailable".into()))?;

    let rows = pg.query(
        "SELECT id, name, key_prefix, permissions, created_at, last_used_at FROM api_keys ORDER BY created_at DESC",
        &[],
    ).await.map_err(|e| ApiError::InternalError(format!("DB error: {e}")))?;

    let keys: Vec<Value> = rows.iter().map(|row| {
        let id: i32 = row.get(0);
        let name: String = row.get(1);
        let prefix: String = row.get(2);
        let permissions: String = row.get(3);
        let created_at: chrono::DateTime<chrono::Utc> = row.get(4);
        let last_used_at: Option<chrono::DateTime<chrono::Utc>> = row.get(5);
        json!({
            "id": id,
            "name": name,
            "key_prefix": prefix,
            "permissions": permissions,
            "created_at": created_at.to_rfc3339(),
            "last_used_at": last_used_at.map(|t| t.to_rfc3339()),
        })
    }).collect();

    Ok(Json(json!({ "keys": keys })))
}

#[derive(Deserialize)]
struct CreateApiKeyBody {
    name: String,
    permissions: String,
}

async fn create_api_key(
    State(state): State<AppState>,
    Json(body): Json<CreateApiKeyBody>,
) -> Result<Json<Value>, ApiError> {
    if body.name.is_empty() {
        return Err(ApiError::BadRequest("'name' is required".into()));
    }
    if body.name.len() > 64 {
        return Err(ApiError::BadRequest("'name' must be at most 64 characters".into()));
    }
    let valid_perms = ["read", "readwrite", "admin"];
    if !valid_perms.contains(&body.permissions.as_str()) {
        return Err(ApiError::BadRequest("'permissions' must be one of: read, readwrite, admin".into()));
    }

    let pg = state.pg.as_ref().ok_or_else(|| ApiError::InternalError("Database unavailable".into()))?;

    let key = generate_key();
    let prefix = key[..8].to_string();
    let key_hash = hash_token(&key);

    let row = pg.query_one(
        "INSERT INTO api_keys(name, key_hash, key_prefix, permissions) VALUES($1,$2,$3,$4) RETURNING id",
        &[&body.name, &key_hash, &prefix, &body.permissions],
    ).await.map_err(|e| ApiError::InternalError(format!("DB error: {e}")))?;

    let id: i32 = row.get(0);

    Ok(Json(json!({
        "key": key,
        "prefix": prefix,
        "id": id,
    })))
}

async fn revoke_api_key(
    State(state): State<AppState>,
    Path(id): Path<i32>,
) -> Result<Json<Value>, ApiError> {
    let pg = state.pg.as_ref().ok_or_else(|| ApiError::InternalError("Database unavailable".into()))?;

    pg.execute("DELETE FROM api_keys WHERE id = $1", &[&id])
        .await
        .map_err(|e| ApiError::InternalError(format!("DB error: {e}")))?;

    Ok(Json(json!({ "ok": true })))
}

#[derive(Deserialize)]
struct ChangePasswordBody {
    current_password: String,
    new_password: String,
    confirm_password: String,
}

async fn change_password(
    State(state): State<AppState>,
    Json(body): Json<ChangePasswordBody>,
) -> Result<Json<Value>, ApiError> {
    if body.new_password.len() < 12 {
        return Err(ApiError::BadRequest("New password must be at least 12 characters".into()));
    }
    if body.new_password != body.confirm_password {
        return Err(ApiError::BadRequest("New password and confirmation do not match".into()));
    }

    let pg = state.pg.as_ref().ok_or_else(|| ApiError::InternalError("Database unavailable".into()))?;

    // Verify current password
    let mut verified = false;
    let result = pg.query_opt(
        "SELECT password_hash FROM users WHERE username = 'admin'",
        &[],
    ).await.map_err(|e| ApiError::InternalError(format!("DB error: {e}")))?;

    if let Some(row) = result {
        let stored_hash: String = row.get(0);
        let pw = body.current_password.clone();
        verified = tokio::task::spawn_blocking(move || {
            bcrypt::verify(&pw, &stored_hash).unwrap_or(false)
        }).await.unwrap_or(false);
    }

    if !verified {
        return Err(ApiError::BadRequest("Current password is incorrect".into()));
    }

    // Hash new password
    let new_pw = body.new_password.clone();
    let new_hash = tokio::task::spawn_blocking(move || {
        bcrypt::hash(new_pw, 12)
    }).await
        .map_err(|e| ApiError::InternalError(format!("Spawn error: {e}")))?
        .map_err(|e| ApiError::InternalError(format!("Bcrypt error: {e}")))?;

    pg.execute(
        "UPDATE users SET password_hash = $1, is_default_password = false WHERE username = 'admin'",
        &[&new_hash],
    ).await.map_err(|e| ApiError::InternalError(format!("DB error: {e}")))?;

    // Invalidate all sessions so every active browser session must re-login
    pg.execute("DELETE FROM sessions", &[])
        .await
        .map_err(|e| ApiError::InternalError(format!("DB error: {e}")))?;

    // Purge session cache from Redis so cached sessions can't bypass the DB check
    if let Some(ref redis_conn) = state.redis {
        use redis::AsyncCommands;
        let mut conn = redis_conn.clone();
        let mut cursor = 0u64;
        loop {
            let (next_cursor, keys): (u64, Vec<String>) = redis::cmd("SCAN")
                .arg(cursor)
                .arg("MATCH")
                .arg("zfs:session:*")
                .arg("COUNT")
                .arg(100u64)
                .query_async(&mut conn)
                .await
                .unwrap_or((0, vec![]));
            if !keys.is_empty() {
                let _: redis::RedisResult<()> = conn.del(keys).await;
            }
            cursor = next_cursor;
            if cursor == 0 { break; }
        }
    }

    Ok(Json(json!({ "ok": true })))
}

// ── Module database selection (internal PostgreSQL vs. external server) ──────

const MODULE_DB_KEY: &str = "module_db";

async fn read_module_db_raw(pg: &tokio_postgres::Client) -> Value {
    pg.query_opt("SELECT value FROM app_settings WHERE key = $1", &[&MODULE_DB_KEY])
        .await
        .ok()
        .flatten()
        .map(|row| row.get::<_, Value>(0))
        .unwrap_or_else(|| json!({}))
}

async fn write_module_db_raw(pg: &tokio_postgres::Client, value: &Value) -> Result<(), ApiError> {
    pg.execute(
        "INSERT INTO app_settings(key, value, updated_at) VALUES($1, $2, NOW()) \
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()",
        &[&MODULE_DB_KEY, value],
    )
    .await
    .map_err(|e| ApiError::InternalError(format!("DB error: {e}")))?;
    Ok(())
}

fn public_module_db(stored: &Value) -> Value {
    let mode = stored.get("mode").and_then(|v| v.as_str()).unwrap_or("internal");
    let ext = stored.get("external").cloned().unwrap_or_else(|| json!({}));
    let has_password = ext
        .get("password_enc")
        .and_then(|v| v.as_str())
        .map(|s| !s.is_empty())
        .unwrap_or(false);
    json!({
        "mode": mode,
        "external": {
            "host": ext.get("host").and_then(|v| v.as_str()).unwrap_or(""),
            "port": ext.get("port").and_then(|v| v.as_i64()).unwrap_or(5432),
            "username": ext.get("username").and_then(|v| v.as_str()).unwrap_or(""),
            "database": ext.get("database").and_then(|v| v.as_str()).unwrap_or(""),
            "has_password": has_password,
        }
    })
}

async fn get_module_db(
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    let pg = state.pg.as_ref().ok_or_else(|| ApiError::InternalError("Database unavailable".into()))?;
    let stored = read_module_db_raw(pg).await;
    Ok(Json(public_module_db(&stored)))
}

#[derive(Deserialize)]
struct ModuleDbExternalBody {
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    database: Option<String>,
    /// None = keep stored password, Some("") = clear it, Some(pw) = replace it
    password: Option<String>,
}

#[derive(Deserialize)]
struct ModuleDbBody {
    mode: String,
    external: Option<ModuleDbExternalBody>,
}

async fn update_module_db(
    State(state): State<AppState>,
    Json(body): Json<ModuleDbBody>,
) -> Result<Json<Value>, ApiError> {
    if body.mode != "internal" && body.mode != "external" {
        return Err(ApiError::BadRequest("'mode' must be 'internal' or 'external'".into()));
    }

    let pg = state.pg.as_ref().ok_or_else(|| ApiError::InternalError("Database unavailable".into()))?;
    let mut stored = read_module_db_raw(pg).await;
    if stored.get("external").is_none() {
        stored["external"] = json!({});
    }

    if body.mode == "external" {
        let ext = body.external.as_ref()
            .ok_or_else(|| ApiError::BadRequest("'external' configuration is required".into()))?;
        let host = ext.host.as_deref().unwrap_or("").trim().to_string();
        let username = ext.username.as_deref().unwrap_or("").trim().to_string();
        let database = ext.database.as_deref().unwrap_or("").trim().to_string();
        if host.is_empty() || username.is_empty() || database.is_empty() {
            return Err(ApiError::BadRequest("'host', 'username' and 'database' are required for an external database".into()));
        }
        let port = ext.port.unwrap_or(5432);

        let password_enc = match &ext.password {
            None => stored
                .pointer("/external/password_enc")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            Some(p) if p.is_empty() => None,
            Some(p) => {
                let key = state.master_key
                    .ok_or_else(|| ApiError::InternalError("Secrets master key unavailable".into()))?;
                let mut map = HashMap::new();
                map.insert("password".to_string(), p.clone());
                let blob = crate::modules::secrets::encrypt_secrets(&key, &map)
                    .map_err(ApiError::InternalError)?;
                Some(base64::engine::general_purpose::STANDARD.encode(blob))
            }
        };

        stored["mode"] = json!("external");
        stored["external"] = json!({
            "host": host,
            "port": port,
            "username": username,
            "database": database,
            "password_enc": password_enc,
        });
    } else {
        // Switching back to internal keeps the external config stored for later.
        stored["mode"] = json!("internal");
    }

    write_module_db_raw(pg, &stored).await?;
    Ok(Json(public_module_db(&stored)))
}

#[derive(Deserialize)]
struct ModuleDbTestBody {
    host: Option<String>,
    port: Option<u16>,
    username: Option<String>,
    database: Option<String>,
    /// Explicit password wins; when None, the stored password is used.
    password: Option<String>,
}

async fn test_module_db(
    State(state): State<AppState>,
    Json(body): Json<ModuleDbTestBody>,
) -> Result<Json<Value>, ApiError> {
    let pg = state.pg.as_ref().ok_or_else(|| ApiError::InternalError("Database unavailable".into()))?;
    let stored = read_module_db_raw(pg).await;
    let stored_ext = stored.get("external").cloned().unwrap_or_else(|| json!({}));
    let stored_str = |k: &str| stored_ext.get(k).and_then(|v| v.as_str()).map(|s| s.to_string());

    let host = body.host.as_deref().map(str::trim).filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| stored_str("host"))
        .ok_or_else(|| ApiError::BadRequest("'host' is required".into()))?;
    let username = body.username.as_deref().map(str::trim).filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| stored_str("username"))
        .ok_or_else(|| ApiError::BadRequest("'username' is required".into()))?;
    let database = body.database.as_deref().map(str::trim).filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| stored_str("database"))
        .ok_or_else(|| ApiError::BadRequest("'database' is required".into()))?;
    let port = body.port
        .or_else(|| stored_ext.get("port").and_then(|v| v.as_i64()).map(|p| p as u16))
        .unwrap_or(5432);

    let password = match body.password {
        Some(p) if !p.is_empty() => Some(p),
        _ => {
            // Fall back to the stored (encrypted) password
            match stored_str("password_enc") {
                Some(enc) => {
                    let key = state.master_key
                        .ok_or_else(|| ApiError::InternalError("Secrets master key unavailable".into()))?;
                    let blob = base64::engine::general_purpose::STANDARD
                        .decode(enc)
                        .map_err(|e| ApiError::InternalError(format!("Stored password is corrupt: {e}")))?;
                    let map = crate::modules::secrets::decrypt_secrets(&key, &blob)
                        .map_err(ApiError::InternalError)?;
                    map.get("password").cloned()
                }
                None => None,
            }
        }
    };

    let mut cfg = tokio_postgres::Config::new();
    cfg.host(&host).port(port).user(&username).dbname(&database);
    if let Some(ref pw) = password {
        cfg.password(pw);
    }

    let connect = cfg.connect(tokio_postgres::NoTls);
    match tokio::time::timeout(std::time::Duration::from_secs(5), connect).await {
        Ok(Ok((client, connection))) => {
            tokio::spawn(async move { let _ = connection.await; });
            match client.simple_query("SELECT 1").await {
                Ok(_) => Ok(Json(json!({ "ok": true, "message": "Verbindung erfolgreich" }))),
                Err(e) => Ok(Json(json!({ "ok": false, "message": format!("Query failed: {e}") }))),
            }
        }
        Ok(Err(e)) => Ok(Json(json!({ "ok": false, "message": format!("Connection failed: {e}") }))),
        Err(_) => Ok(Json(json!({ "ok": false, "message": "Connection timed out after 5s" }))),
    }
}
