use axum::http::HeaderMap;
use serde_json::Value;
use tracing::warn;

use crate::state::AppState;

/// Resolves the acting identity from the request token: `admin` for session
/// tokens, `api-key:<name>` for API keys.
pub async fn actor_from_headers(state: &AppState, headers: &HeaderMap) -> String {
    let token = headers
        .get("x-api-key")
        .or_else(|| headers.get("authorization"))
        .and_then(|h| h.to_str().ok())
        .map(|s| s.strip_prefix("Bearer ").unwrap_or(s).to_string());

    let (Some(token), Some(pg)) = (token, state.pg.as_ref()) else {
        return "unknown".to_string();
    };
    let token_hash = {
        use sha2::{Digest, Sha256};
        hex::encode(Sha256::digest(token.as_bytes()))
    };

    if let Ok(Some(_)) = pg
        .query_opt("SELECT 1 FROM sessions WHERE token_hash = $1 AND expires_at > NOW()", &[&token_hash])
        .await
    {
        return "admin".to_string();
    }
    if let Ok(Some(row)) = pg
        .query_opt("SELECT name FROM api_keys WHERE key_hash = $1", &[&token_hash])
        .await
    {
        let name: String = row.get(0);
        return format!("api-key:{name}");
    }
    "unknown".to_string()
}

/// Writes one audit log entry. Failures are logged, never fatal.
pub async fn audit(state: &AppState, actor: &str, action: &str, module_id: Option<&str>, details: Value) {
    let Some(pg) = state.pg.as_ref() else { return };
    if let Err(e) = pg
        .execute(
            "INSERT INTO module_audit_log(actor, action, module_id, details) VALUES($1, $2, $3, $4)",
            &[&actor, &action, &module_id, &details],
        )
        .await
    {
        warn!("audit log write failed ({action} by {actor}): {e}");
    }
}
