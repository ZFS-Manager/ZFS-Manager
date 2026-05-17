use axum::{
    extract::State,
    http::HeaderMap,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Sha256, Digest};
use rand::Rng;
use tracing::warn;

use crate::state::AppState;
use crate::error::ApiError;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/auth/login",  post(login))
        .route("/api/v1/auth/logout", post(logout))
        .route("/api/v1/auth/me",     get(me))
        .with_state(state)
}

fn hash_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

fn generate_token() -> String {
    let bytes: [u8; 32] = rand::thread_rng().gen();
    hex::encode(bytes)
}

fn get_client_ip(headers: &HeaderMap) -> String {
    if let Some(fwd) = headers.get("x-forwarded-for") {
        if let Ok(s) = fwd.to_str() {
            return s.split(',').next().unwrap_or("unknown").trim().to_string();
        }
    }
    if let Some(real) = headers.get("x-real-ip") {
        if let Ok(s) = real.to_str() {
            return s.to_string();
        }
    }
    "unknown".to_string()
}

#[derive(Deserialize)]
struct LoginBody {
    password: String,
}

async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<LoginBody>,
) -> Result<Json<Value>, ApiError> {
    let ip = get_client_ip(&headers);

    // Rate limiting: 10 attempts per minute per IP
    {
        let mut map = state.rate_limit.lock().unwrap();
        let now = std::time::Instant::now();
        let attempts = map.entry(ip.clone()).or_insert_with(Vec::new);
        // Remove attempts older than 60 seconds
        attempts.retain(|t| now.duration_since(*t).as_secs() < 60);
        if attempts.len() >= 10 {
            return Err(ApiError::BadRequest("Too many login attempts. Please wait.".into()));
        }
        attempts.push(now);
    }

    let mut authenticated = false;
    let mut is_default_password = false;

    // Authenticate only via the database — never via environment variables
    if let Some(ref pg) = state.pg {
        let result = pg.query_opt(
            "SELECT password_hash, is_default_password FROM users WHERE username = 'admin'",
            &[],
        ).await;

        if let Ok(Some(row)) = result {
            let stored_hash: String = row.get(0);
            let is_default: bool = row.get(1);
            let pw = body.password.clone();
            let verified = tokio::task::spawn_blocking(move || {
                bcrypt::verify(&pw, &stored_hash).unwrap_or(false)
            }).await.unwrap_or(false);

            if verified {
                authenticated = true;
                is_default_password = is_default;
            }
        }
    }

    if !authenticated {
        // Log failed attempt
        if let Some(ref pg) = state.pg {
            let pg_clone = pg.clone();
            let ip_clone = ip.clone();
            let state_clone = state.clone();
            tokio::spawn(async move {
                let _ = pg_clone.execute(
                    "INSERT INTO login_attempts(ip_address, success) VALUES($1, false)",
                    &[&ip_clone],
                ).await;
                crate::routes::notifications::trigger_rules_for_event(
                    &state_clone,
                    "login_failed",
                    &format!("Failed login attempt from IP: {}", ip_clone),
                ).await;
            });
        }
        warn!("Failed login attempt from {ip}");
        return Err(ApiError::BadRequest("Invalid password".into()));
    }

    // Log successful attempt
    if let Some(ref pg) = state.pg {
        let pg_clone = pg.clone();
        let ip_clone = ip.clone();
        tokio::spawn(async move {
            let _ = pg_clone.execute(
                "INSERT INTO login_attempts(ip_address, success) VALUES($1, true)",
                &[&ip_clone],
            ).await;
        });
    }

    // Generate session token
    let token = generate_token();
    let token_hash = hash_token(&token);

    // Store in DB sessions
    if let Some(ref pg) = state.pg {
        let _ = pg.execute(
            "INSERT INTO sessions(token_hash) VALUES($1) ON CONFLICT DO NOTHING",
            &[&token_hash],
        ).await;
    }

    // Cache in Redis
    if let Some(ref redis_conn) = state.redis {
        use redis::AsyncCommands;
        let mut conn = redis_conn.clone();
        let session_key = format!("zfs:session:{}", token_hash);
        let _: redis::RedisResult<()> = conn.set_ex(&session_key, "admin", 86400u64).await;
    }

    Ok(Json(json!({
        "token": token,
        "is_default_password": is_default_password,
    })))
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let token_opt = headers
        .get("x-api-key")
        .or_else(|| headers.get("Authorization"))
        .and_then(|h| h.to_str().ok())
        .map(|s| s.strip_prefix("Bearer ").unwrap_or(s).to_string());

    if let Some(token) = token_opt {
        let token_hash = hash_token(&token);

        // Delete from DB
        if let Some(ref pg) = state.pg {
            let _ = pg.execute(
                "DELETE FROM sessions WHERE token_hash = $1",
                &[&token_hash],
            ).await;
        }

        // Delete from Redis
        if let Some(ref redis_conn) = state.redis {
            use redis::AsyncCommands;
            let mut conn = redis_conn.clone();
            let session_key = format!("zfs:session:{}", token_hash);
            let _: redis::RedisResult<()> = conn.del(&session_key).await;
        }
    }

    Ok(Json(json!({ "ok": true })))
}

async fn me(
    State(state): State<AppState>,
) -> Result<Json<Value>, ApiError> {
    let mut is_default = false;
    if let Some(ref pg) = state.pg {
        if let Ok(Some(row)) = pg.query_opt(
            "SELECT is_default_password FROM users WHERE username = 'admin'",
            &[],
        ).await {
            is_default = row.get(0);
        }
    }
    Ok(Json(json!({
        "username": "admin",
        "is_default_password": is_default,
    })))
}
