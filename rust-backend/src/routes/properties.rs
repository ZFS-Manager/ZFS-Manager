use axum::{
    extract::{Path, Query},
    routing::{get, put},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{error::ApiError, executor};

pub fn router() -> Router {
    Router::new()
        // GET all properties for a dataset: GET /api/v1/properties/*dataset
        // GET one property:                 GET /api/v1/properties/*dataset?prop=compression
        .route("/api/v1/properties/*dataset", get(get_properties))
        // Set property:   PUT  /api/v1/properties/*dataset  body: {prop, value}
        // Reset/inherit:  DELETE /api/v1/properties/*dataset  body: {prop}
        .route("/api/v1/properties/*dataset", put(set_property).delete(inherit_property))
}

// ── Bodies / Queries ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct PropQuery {
    pub prop: Option<String>,
}

#[derive(Deserialize)]
pub struct SetPropertyBody {
    pub prop: String,
    pub value: String,
}

#[derive(Deserialize)]
pub struct InheritBody {
    pub prop: String,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/// GET /api/v1/properties/*dataset          → all properties
/// GET /api/v1/properties/*dataset?prop=X   → single property
async fn get_properties(
    Path(dataset): Path<String>,
    Query(q): Query<PropQuery>,
) -> Result<Json<Value>, ApiError> {
    let prop_arg = q.prop.as_deref().unwrap_or("all");
    let raw = executor::zfs(&["get", "-H", "-p", prop_arg, &dataset]).await?;

    let properties: Vec<Value> = raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|line| {
            let c: Vec<&str> = line.split('\t').collect();
            json!({
                "dataset": c.first().unwrap_or(&""),
                "name":    c.get(1).unwrap_or(&""),
                "value":   c.get(2).unwrap_or(&""),
                "source":  c.get(3).unwrap_or(&""),
            })
        })
        .collect();

    if properties.len() == 1 && q.prop.is_some() {
        let prop = properties.into_iter().next()
            .ok_or_else(|| ApiError::NotFound(format!("Property '{}' not found on '{dataset}'", q.prop.as_deref().unwrap_or(""))))?;
        Ok(Json(json!({ "property": prop })))
    } else {
        Ok(Json(json!({ "dataset": dataset, "properties": properties })))
    }
}

/// PUT /api/v1/properties/*dataset  body: { "prop": "compression", "value": "lz4" }
async fn set_property(
    Path(dataset): Path<String>,
    Json(body): Json<SetPropertyBody>,
) -> Result<Json<Value>, ApiError> {
    if body.prop.is_empty() || body.value.is_empty() {
        return Err(ApiError::BadRequest("'prop' and 'value' are required".into()));
    }
    if body.prop.contains(['=', ' ', '\t', '\n']) {
        return Err(ApiError::BadRequest("Invalid characters in property name".into()));
    }
    let kv = format!("{}={}", body.prop, body.value);
    executor::zfs(&["set", &kv, &dataset]).await?;
    Ok(Json(json!({ "message": format!("Set {} on '{dataset}'", kv) })))
}

/// DELETE /api/v1/properties/*dataset  body: { "prop": "compression" }
async fn inherit_property(
    Path(dataset): Path<String>,
    Json(body): Json<InheritBody>,
) -> Result<Json<Value>, ApiError> {
    if body.prop.is_empty() {
        return Err(ApiError::BadRequest("'prop' is required".into()));
    }
    executor::zfs(&["inherit", &body.prop, &dataset]).await?;
    Ok(Json(json!({ "message": format!("Property '{}' inherited on '{dataset}'", body.prop) })))
}
