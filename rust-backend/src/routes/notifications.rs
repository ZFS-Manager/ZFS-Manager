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
