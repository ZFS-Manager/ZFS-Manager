use axum::{
    extract::Request,
    middleware::{self, Next},
    response::Response,
    http::StatusCode,
    Router,
};
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod error;
mod executor;
mod routes;

async fn auth_middleware(req: Request, next: Next) -> Result<Response, StatusCode> {
    if req.uri().path().ends_with("/health") {
        return Ok(next.run(req).await);
    }

    let api_key = std::env::var("ZFS_API_KEY").unwrap_or_default();
    if api_key.is_empty() {
        return Ok(next.run(req).await);
    }

    if let Some(auth_header) = req.headers().get("Authorization").or_else(|| req.headers().get("x-api-key")) {
        let auth_str = auth_header.to_str().unwrap_or_default();
        let token = auth_str.strip_prefix("Bearer ").unwrap_or(auth_str);
        if token == api_key {
            return Ok(next.run(req).await);
        }
    }
    
    Err(StatusCode::UNAUTHORIZED)
}

#[tokio::main]
async fn main() {
    // Logging – override with RUST_LOG env var
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let port: u16 = std::env::var("ZFS_API_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(routes::health::router())
        .merge(routes::pools::router())
        .merge(routes::datasets::router())
        .merge(routes::snapshots::router())
        .merge(routes::volumes::router())
        .merge(routes::clones::router())
        .merge(routes::properties::router())
        .layer(middleware::from_fn(auth_middleware))
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("Failed to bind port");

    info!("🚀 zfs-manager listening on http://0.0.0.0:{port}");
    info!("   API base: http://0.0.0.0:{port}/api/v1");
    if std::env::var("ZFS_API_KEY").is_ok() {
        info!("🔐 API Key Authentication enabled!");
    } else {
        info!("🔓 API Key is NOT set. API is accessible to everyone.");
    }
    
    axum::serve(listener, app).await.expect("Server error");
}
