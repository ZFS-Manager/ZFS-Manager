use axum::Router;
use tower_http::{
    cors::{Any, CorsLayer},
    trace::TraceLayer,
};
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

mod error;
mod executor;
mod routes;

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
        .layer(cors)
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("Failed to bind port");

    info!("🚀 zfs-manager listening on http://0.0.0.0:{port}");
    info!("   API base: http://0.0.0.0:{port}/api/v1");
    axum::serve(listener, app).await.expect("Server error");
}
