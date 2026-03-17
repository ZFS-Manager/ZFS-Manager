use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug)]
pub enum ApiError {
    NotFound(String),
    BadRequest(String),
    InternalError(String),
    CommandFailed { stderr: String, code: Option<i32> },
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg.clone()),
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg.clone()),
            ApiError::InternalError(msg) => (StatusCode::INTERNAL_SERVER_ERROR, msg.clone()),
            ApiError::CommandFailed { stderr, code } => {
                let msg = format!(
                    "ZFS command failed (exit code {:?}): {}",
                    code,
                    stderr.trim()
                );
                (StatusCode::INTERNAL_SERVER_ERROR, msg)
            }
        };
        let body = Json(json!({ "error": message, "code": status.as_u16() }));
        (status, body).into_response()
    }
}

impl From<std::io::Error> for ApiError {
    fn from(e: std::io::Error) -> Self {
        ApiError::InternalError(format!("IO error: {e}"))
    }
}
