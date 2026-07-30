use axum::{
    extract::{Path, State},
    http::HeaderMap,
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::error::ApiError;
use crate::modules::audit::{actor_from_headers, audit};
use crate::state::AppState;
use super::module_store::mgmt_rate_limit;

pub fn router(state: AppState) -> Router {
    Router::new()
        .route(
            "/api/v1/custom-tabs",
            get(list_tabs).post(create_tab),
        )
        .route(
            "/api/v1/custom-tabs/:slug",
            get(get_tab).put(update_tab).delete(delete_tab),
        )
        .route(
            "/api/v1/custom-tabs/:slug/layout",
            axum::routing::put(save_tab_layout),
        )
        .with_state(state)
}

fn db(state: &AppState) -> Result<&std::sync::Arc<tokio_postgres::Client>, ApiError> {
    state.pg.as_ref().ok_or(ApiError::InternalError("database unavailable".into()))
}

fn slugify(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

async fn list_tabs(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let pg = db(&state)?;
    let rows = pg
        .query("SELECT id, name, slug, icon, sort_order, layout, created_at FROM custom_tabs ORDER BY sort_order, id", &[])
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;

    let tabs: Vec<Value> = rows.iter().map(|row| {
        json!({
            "id": row.get::<_, i32>(0),
            "name": row.get::<_, String>(1),
            "slug": row.get::<_, String>(2),
            "icon": row.get::<_, String>(3),
            "sort_order": row.get::<_, i32>(4),
            "layout": row.get::<_, Value>(5),
            "created_at": row.get::<_, chrono::DateTime<chrono::Utc>>(6),
        })
    }).collect();

    Ok(Json(json!({ "tabs": tabs })))
}

async fn get_tab(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let pg = db(&state)?;
    let row = pg
        .query_opt(
            "SELECT id, name, slug, icon, sort_order, layout, created_at FROM custom_tabs WHERE slug = $1",
            &[&slug],
        )
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?
        .ok_or_else(|| ApiError::NotFound(format!("tab {slug:?} not found")))?;

    Ok(Json(json!({
        "id": row.get::<_, i32>(0),
        "name": row.get::<_, String>(1),
        "slug": row.get::<_, String>(2),
        "icon": row.get::<_, String>(3),
        "sort_order": row.get::<_, i32>(4),
        "layout": row.get::<_, Value>(5),
        "created_at": row.get::<_, chrono::DateTime<chrono::Utc>>(6),
    })))
}

#[derive(Deserialize)]
struct CreateTabBody {
    name: String,
    #[serde(default = "default_icon")]
    icon: String,
}

fn default_icon() -> String { "layout".to_string() }

async fn create_tab(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<CreateTabBody>,
) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(&state, &headers)?;
    let name = body.name.trim();
    if name.is_empty() || name.len() > 64 {
        return Err(ApiError::BadRequest("tab name must be 1-64 chars".into()));
    }
    let slug = slugify(name);
    if slug.is_empty() {
        return Err(ApiError::BadRequest("tab name produces an empty slug".into()));
    }

    let pg = db(&state)?;
    let max_order: i32 = pg
        .query_one("SELECT COALESCE(MAX(sort_order), 0) FROM custom_tabs", &[])
        .await
        .map(|r| r.get(0))
        .unwrap_or(0);

    let row = pg
        .query_one(
            "INSERT INTO custom_tabs(name, slug, icon, sort_order) VALUES($1, $2, $3, $4) RETURNING id",
            &[&name, &slug, &body.icon, &(max_order + 1)],
        )
        .await
        .map_err(|e| {
            if e.to_string().contains("unique") || e.to_string().contains("duplicate") {
                ApiError::BadRequest(format!("a tab with slug {slug:?} already exists"))
            } else {
                ApiError::InternalError(e.to_string())
            }
        })?;

    let id: i32 = row.get(0);
    let actor = actor_from_headers(&state, &headers).await;
    audit(&state, &actor, "custom_tab_created", None, json!({ "name": name, "slug": slug })).await;
    Ok(Json(json!({ "id": id, "slug": slug, "name": name, "icon": body.icon })))
}

#[derive(Deserialize)]
struct UpdateTabBody {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    sort_order: Option<i32>,
}

async fn update_tab(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(body): Json<UpdateTabBody>,
) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(&state, &headers)?;
    let pg = db(&state)?;

    if let Some(ref name) = body.name {
        let name = name.trim();
        if name.is_empty() || name.len() > 64 {
            return Err(ApiError::BadRequest("tab name must be 1-64 chars".into()));
        }
        pg.execute("UPDATE custom_tabs SET name = $1 WHERE slug = $2", &[&name, &slug])
            .await
            .map_err(|e| ApiError::InternalError(e.to_string()))?;
    }
    if let Some(ref icon) = body.icon {
        pg.execute("UPDATE custom_tabs SET icon = $1 WHERE slug = $2", &[&icon, &slug])
            .await
            .map_err(|e| ApiError::InternalError(e.to_string()))?;
    }
    if let Some(order) = body.sort_order {
        pg.execute("UPDATE custom_tabs SET sort_order = $1 WHERE slug = $2", &[&order, &slug])
            .await
            .map_err(|e| ApiError::InternalError(e.to_string()))?;
    }

    let actor = actor_from_headers(&state, &headers).await;
    audit(&state, &actor, "custom_tab_updated", None, json!({ "slug": slug })).await;
    Ok(Json(json!({ "ok": true })))
}

async fn save_tab_layout(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Json(layout): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(&state, &headers)?;
    let pg = db(&state)?;
    let updated = pg
        .execute("UPDATE custom_tabs SET layout = $1 WHERE slug = $2", &[&layout, &slug])
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;
    if updated == 0 {
        return Err(ApiError::NotFound(format!("tab {slug:?} not found")));
    }
    Ok(Json(json!({ "ok": true })))
}

async fn delete_tab(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<Json<Value>, ApiError> {
    mgmt_rate_limit(&state, &headers)?;
    let pg = db(&state)?;
    let deleted = pg
        .execute("DELETE FROM custom_tabs WHERE slug = $1", &[&slug])
        .await
        .map_err(|e| ApiError::InternalError(e.to_string()))?;
    if deleted == 0 {
        return Err(ApiError::NotFound(format!("tab {slug:?} not found")));
    }
    let actor = actor_from_headers(&state, &headers).await;
    audit(&state, &actor, "custom_tab_deleted", None, json!({ "slug": slug })).await;
    Ok(Json(json!({ "ok": true })))
}
