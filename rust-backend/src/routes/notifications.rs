use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post, delete},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use crate::state::AppState;

#[derive(Serialize)]
pub struct Notification {
    pub id: i32,
    pub ntype: String,
    pub message: String,
    pub level: String,
    pub is_read: bool,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct NotificationChannel {
    pub id: Option<i32>,
    pub name: String,
    pub ctype: String, // "webhook", "discord", "gotify"
    pub config: serde_json::Value,
}

#[derive(Serialize, Deserialize)]
pub struct NotificationRule {
    pub id: Option<i32>,
    pub name: String,
    pub trigger_type: String, // "pool_unhealthy", "hdd_temp", "smart_error"
    pub threshold_value: Option<f64>,
    pub channel_ids: Vec<i32>,
    pub is_active: bool,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/api/v1/notifications", get(list_notifications))
        .route("/api/v1/notifications/read", post(mark_all_read))
        .route("/api/v1/notifications/:id/read", post(mark_read))
        .route("/api/v1/notifications/channels", get(list_channels).post(create_channel))
        .route("/api/v1/notifications/channels/:id", delete(delete_channel))
        .route("/api/v1/notifications/channels/:id/test", post(test_channel))
        .route("/api/v1/notifications/rules", get(list_rules).post(create_rule))
        .route("/api/v1/notifications/rules/:id", delete(delete_rule))
        .with_state(state)
}

// -- Notifications Log --

async fn list_notifications(State(state): State<AppState>) -> impl IntoResponse {
    let pg = match &state.pg {
        Some(pg) => pg,
        None => return (StatusCode::SERVICE_UNAVAILABLE, Json(Vec::<Notification>::new())).into_response(),
    };

    let rows = pg.query("SELECT id, type, message, level, is_read, created_at::text FROM notifications ORDER BY created_at DESC LIMIT 100", &[]).await;
    match rows {
        Ok(rows) => {
            let n: Vec<Notification> = rows.iter().map(|r| Notification {
                id: r.get(0),
                ntype: r.get(1),
                message: r.get(2),
                level: r.get(3),
                is_read: r.get(4),
                created_at: r.get(5),
            }).collect();
            (StatusCode::OK, Json(n)).into_response()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(Vec::<Notification>::new())).into_response(),
    }
}

async fn mark_all_read(State(state): State<AppState>) -> impl IntoResponse {
    if let Some(ref pg) = state.pg {
        let _ = pg.execute("UPDATE notifications SET is_read = true WHERE is_read = false", &[]).await;
    }
    StatusCode::OK
}

async fn mark_read(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> impl IntoResponse {
    if let Some(ref pg) = state.pg {
        let _ = pg.execute("UPDATE notifications SET is_read = true WHERE id = $1", &[&id]).await;
    }
    StatusCode::OK
}

// -- Channels --

async fn list_channels(State(state): State<AppState>) -> impl IntoResponse {
    let pg = match &state.pg {
        Some(pg) => pg,
        None => return (StatusCode::SERVICE_UNAVAILABLE, Json(Vec::<NotificationChannel>::new())).into_response(),
    };

    let rows = pg.query("SELECT id, name, type, config FROM notification_channels ORDER BY name ASC", &[]).await;
    match rows {
        Ok(rows) => {
            let n: Vec<NotificationChannel> = rows.iter().map(|r| NotificationChannel {
                id: Some(r.get(0)),
                name: r.get(1),
                ctype: r.get(2),
                config: r.get(3),
            }).collect();
            (StatusCode::OK, Json(n)).into_response()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(Vec::<NotificationChannel>::new())).into_response(),
    }
}

async fn create_channel(
    State(state): State<AppState>,
    Json(payload): Json<NotificationChannel>,
) -> impl IntoResponse {
    let pg = match &state.pg {
        Some(pg) => pg,
        None => return StatusCode::SERVICE_UNAVAILABLE,
    };

    let res = if let Some(id) = payload.id {
        pg.execute("UPDATE notification_channels SET name=$1, type=$2, config=$3 WHERE id=$4", &[&payload.name, &payload.ctype, &payload.config, &id]).await
    } else {
        pg.execute("INSERT INTO notification_channels (name, type, config) VALUES ($1, $2, $3)", &[&payload.name, &payload.ctype, &payload.config]).await
    };

    match res {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn delete_channel(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> impl IntoResponse {
    if let Some(ref pg) = state.pg {
        let _ = pg.execute("DELETE FROM notification_channels WHERE id = $1", &[&id]).await;
    }
    StatusCode::OK
}

async fn test_channel(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> impl IntoResponse {
    let pg = match &state.pg {
        Some(pg) => pg,
        None => return (StatusCode::SERVICE_UNAVAILABLE, "Database offline").into_response(),
    };

    let row = match pg.query_one("SELECT type, config FROM notification_channels WHERE id = $1", &[&id]).await {
        Ok(r) => r,
        Err(_) => return (StatusCode::NOT_FOUND, "Channel not found").into_response(),
    };

    let ctype: String = row.get(0);
    let config: serde_json::Value = row.get(1);

    let test_msg = "Hello! This is a test notification from your ZFS-Manager alert diagnostics.";
    match dispatch_notification(&ctype, &config, test_msg).await {
        Ok(_) => (StatusCode::OK, "Test notification dispatched successfully!").into_response(),
        Err(e) => (StatusCode::BAD_REQUEST, format!("Failed to dispatch: {}", e)).into_response(),
    }
}

pub async fn dispatch_notification(ctype: &str, config: &serde_json::Value, message: &str) -> Result<(), String> {
    let client = reqwest::Client::new();
    match ctype {
        "webhook" => {
            let url = config.get("url").and_then(|v| v.as_str()).ok_or("Missing url")?;
            let method = config.get("method").and_then(|v| v.as_str()).unwrap_or("POST");
            let headers_val = config.get("headers");
            
            let mut req = match method {
                "PUT" => client.put(url),
                "GET" => client.get(url),
                _ => client.post(url),
            };

            if let Some(headers_obj) = headers_val.and_then(|h| h.as_object()) {
                for (k, v) in headers_obj {
                    if let Some(val_str) = v.as_str() {
                        if let Ok(hname) = reqwest::header::HeaderName::from_bytes(k.as_bytes()) {
                            if let Ok(hval) = reqwest::header::HeaderValue::from_str(val_str) {
                                req = req.header(hname, hval);
                            }
                        }
                    }
                }
            }

            let body = serde_json::json!({
                "message": message,
                "level": "info",
                "timestamp": chrono::Utc::now().to_rfc3339()
            });

            let res = req.json(&body).send().await.map_err(|e| e.to_string())?;
            if res.status().is_success() {
                Ok(())
            } else {
                Err(format!("HTTP status {}", res.status()))
            }
        }
        "discord" => {
            let url = config.get("url").and_then(|v| v.as_str()).ok_or("Missing url")?;
            let username = config.get("username").and_then(|v| v.as_str()).unwrap_or("ZFS-Manager");
            let avatar_url = config.get("avatar_url").and_then(|v| v.as_str()).unwrap_or("");

            let mut body = serde_json::json!({
                "content": message,
                "username": username
            });
            if !avatar_url.is_empty() {
                body["avatar_url"] = serde_json::Value::String(avatar_url.to_string());
            }

            let res = client.post(url).json(&body).send().await.map_err(|e| e.to_string())?;
            if res.status().is_success() {
                Ok(())
            } else {
                Err(format!("Discord HTTP status {}", res.status()))
            }
        }
        "gotify" => {
            let base_url = config.get("url").and_then(|v| v.as_str()).ok_or("Missing url")?;
            let token = config.get("token").and_then(|v| v.as_str()).ok_or("Missing token")?;
            let priority = config.get("priority").and_then(|v| v.as_i64()).unwrap_or(5);

            let url = format!("{}/message?token={}", base_url.trim_end_matches('/'), token);
            let body = serde_json::json!({
                "title": "ZFS Manager",
                "message": message,
                "priority": priority
            });

            let res = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
            if res.status().is_success() {
                Ok(())
            } else {
                Err(format!("Gotify HTTP status {}", res.status()))
            }
        }
        "telegram" => {
            let bot_token = config.get("bot_token").and_then(|v| v.as_str()).ok_or("Missing bot_token")?;
            let chat_id = config.get("chat_id").and_then(|v| v.as_str()).ok_or("Missing chat_id")?;

            let url = format!("https://api.telegram.org/bot{}/sendMessage", bot_token);
            let body = serde_json::json!({
                "chat_id": chat_id,
                "text": message
            });

            let res = client.post(&url).json(&body).send().await.map_err(|e| e.to_string())?;
            if res.status().is_success() {
                Ok(())
            } else {
                Err(format!("Telegram HTTP status {}", res.status()))
            }
        }
        "email" => {
            tracing::info!("Simulated email SMTP dispatch to recipient: {:?}", config.get("to"));
            Ok(())
        }
        _ => Err(format!("Unsupported channel type: {}", ctype)),
    }
}

pub async fn trigger_rules_for_event(state: &AppState, trigger_type: &str, message: &str) {
    let pg = match &state.pg {
        Some(pg) => pg,
        None => return,
    };

    let level = if trigger_type == "login_failed" || trigger_type == "pool_unhealthy" {
        "error"
    } else {
        "warning"
    };

    let _ = pg.execute(
        "INSERT INTO notifications (type, message, level) VALUES ($1, $2, $3)",
        &[&trigger_type, &message, &level],
    ).await;

    // Fetch all active rules matching this trigger type or (for quota reached) where trigger type starts with "quota_reached:"
    let rows = if trigger_type.starts_with("quota_reached:") {
        pg.query(
            "SELECT id, name, channel_ids FROM notification_rules WHERE is_active = true AND (trigger_type = 'quota_reached' OR trigger_type = $1)",
            &[&trigger_type],
        ).await
    } else {
        pg.query(
            "SELECT id, name, channel_ids FROM notification_rules WHERE is_active = true AND trigger_type = $1",
            &[&trigger_type],
        ).await
    };

    let matched_rows = match rows {
        Ok(r) => r,
        Err(_) => return,
    };

    for row in matched_rows {
        let rule_name: String = row.get(1);
        let channel_ids: Vec<i32> = row.get(2);

        for channel_id in channel_ids {
            if let Ok(ch_row) = pg.query_one("SELECT type, config FROM notification_channels WHERE id = $1", &[&channel_id]).await {
                let ctype: String = ch_row.get(0);
                let config: serde_json::Value = ch_row.get(1);

                let full_msg = format!("[Rule: {}] {}", rule_name, message);
                let _ = dispatch_notification(&ctype, &config, &full_msg).await;
            }
        }
    }
}

// -- Rules --

async fn list_rules(State(state): State<AppState>) -> impl IntoResponse {
    let pg = match &state.pg {
        Some(pg) => pg,
        None => return (StatusCode::SERVICE_UNAVAILABLE, Json(Vec::<NotificationRule>::new())).into_response(),
    };

    let rows = pg.query("SELECT id, name, trigger_type, threshold_value, channel_ids, is_active FROM notification_rules ORDER BY name ASC", &[]).await;
    match rows {
        Ok(rows) => {
            let n: Vec<NotificationRule> = rows.iter().map(|r| NotificationRule {
                id: Some(r.get(0)),
                name: r.get(1),
                trigger_type: r.get(2),
                threshold_value: r.get(3),
                channel_ids: r.get(4),
                is_active: r.get(5),
            }).collect();
            (StatusCode::OK, Json(n)).into_response()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, Json(Vec::<NotificationRule>::new())).into_response(),
    }
}

async fn create_rule(
    State(state): State<AppState>,
    Json(payload): Json<NotificationRule>,
) -> impl IntoResponse {
    let pg = match &state.pg {
        Some(pg) => pg,
        None => return StatusCode::SERVICE_UNAVAILABLE,
    };

    let channels: Vec<i32> = payload.channel_ids;

    let res = if let Some(id) = payload.id {
        pg.execute("UPDATE notification_rules SET name=$1, trigger_type=$2, threshold_value=$3, channel_ids=$4, is_active=$5 WHERE id=$6", 
            &[&payload.name, &payload.trigger_type, &payload.threshold_value, &channels, &payload.is_active, &id]).await
    } else {
        pg.execute("INSERT INTO notification_rules (name, trigger_type, threshold_value, channel_ids, is_active) VALUES ($1, $2, $3, $4, $5)", 
            &[&payload.name, &payload.trigger_type, &payload.threshold_value, &channels, &payload.is_active]).await
    };

    match res {
        Ok(_) => StatusCode::OK,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

async fn delete_rule(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<i32>,
) -> impl IntoResponse {
    if let Some(ref pg) = state.pg {
        let _ = pg.execute("DELETE FROM notification_rules WHERE id = $1", &[&id]).await;
    }
    StatusCode::OK
}
