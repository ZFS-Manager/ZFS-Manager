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
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

static UI_FIRST_CONTACT: AtomicBool = AtomicBool::new(false);

mod error;
mod executor;
mod routes;
mod state;
mod startup;
mod worker;

use state::AppState;

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

    if !UI_FIRST_CONTACT.load(Ordering::Relaxed) {
        if let Some(agent) = req.headers().get("user-agent") {
            let agent_str = agent.to_str().unwrap_or("unknown");
            if agent_str.contains("Mozilla") || agent_str.contains("Chrome") || agent_str.contains("Safari") {
                info!("🌐 UI: First contact established from {}", req.uri());
                UI_FIRST_CONTACT.store(true, Ordering::Relaxed);
            }
        }
    }

    Err(StatusCode::UNAUTHORIZED)
}

async fn init_schema(client: &tokio_postgres::Client) {
    let sql = "
        CREATE TABLE IF NOT EXISTS zfs_metrics (
            id BIGSERIAL PRIMARY KEY,
            collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            pool_name TEXT NOT NULL DEFAULT '',
            read_bw_mb DOUBLE PRECISION DEFAULT 0,
            write_bw_mb DOUBLE PRECISION DEFAULT 0,
            iops DOUBLE PRECISION DEFAULT 0,
            alloc_gb DOUBLE PRECISION DEFAULT 0,
            free_gb DOUBLE PRECISION DEFAULT 0,
            cpu_percent DOUBLE PRECISION DEFAULT 0,
            arc_hit_ratio DOUBLE PRECISION DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS idx_zfs_metrics_time ON zfs_metrics(collected_at DESC);
        CREATE INDEX IF NOT EXISTS idx_zfs_metrics_pool_time ON zfs_metrics(pool_name, collected_at DESC);
        CREATE TABLE IF NOT EXISTS ui_layouts (
            page TEXT PRIMARY KEY,
            layout TEXT NOT NULL
        );
    ";

    match client.batch_execute(sql).await {
        Ok(_) => info!("PostgreSQL schema initialized successfully"),
        Err(e) => warn!("Failed to initialize PostgreSQL schema: {e}"),
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .with(tracing_subscriber::fmt::layer())
        .init();

    startup::run_startup_checks().await;

    let port: u16 = std::env::var("ZFS_API_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());

    let redis_conn = match redis::Client::open(redis_url.as_str()) {
        Ok(client) => match redis::aio::ConnectionManager::new(client).await {
            Ok(mgr) => {
                info!("Redis connected at {redis_url}");
                Some(mgr)
            }
            Err(e) => {
                warn!("Redis connection manager failed: {e}");
                None
            }
        },
        Err(e) => {
            warn!("Redis client open failed: {e}");
            None
        }
    };

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://zfs:zfs_secret@127.0.0.1:5432/zfs_metrics".to_string());

    let pg_client = match tokio_postgres::connect(&db_url, tokio_postgres::NoTls).await {
        Ok((client, connection)) => {
            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    warn!("PostgreSQL connection error: {e}");
                }
            });
            info!("PostgreSQL connected");
            init_schema(&client).await;
            Some(Arc::new(client))
        }
        Err(e) => {
            warn!("PostgreSQL connection failed: {e}");
            None
        }
    };

    let app_state = AppState {
        redis: redis_conn,
        pg: pg_client,
    };

    tokio::spawn(worker::run_metrics_worker(app_state.clone()));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(routes::health::router())
        .merge(routes::pools::router())
        .merge(routes::datasets::router())
        .merge(routes::snapshots::router())
        .merge(routes::stats::router())
        .merge(routes::volumes::router())
        .merge(routes::clones::router())
        .merge(routes::properties::router())
        .merge(routes::metrics::router(app_state.clone()))
        .merge(routes::layout::router(app_state.clone()))
        .layer(middleware::from_fn(auth_middleware))
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(axum::Extension(app_state));

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("Failed to bind port");

    info!("zfs-manager listening on http://0.0.0.0:{port}");
    info!("   API base: http://0.0.0.0:{port}/api/v1");
    if std::env::var("ZFS_API_KEY").is_ok() {
        info!("API Key Authentication enabled!");
    } else {
        info!("API Key is NOT set. API is accessible to everyone.");
    }

    axum::serve(listener, app).await.expect("Server error");
}
