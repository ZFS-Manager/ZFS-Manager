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
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::collections::HashMap;
use std::sync::Mutex;

static UI_FIRST_CONTACT: AtomicBool = AtomicBool::new(false);

mod error;
mod executor;
mod routes;
mod state;
mod startup;
mod worker;

use state::AppState;

fn get_client_ip(req: &Request) -> String {
    if let Some(fwd) = req.headers().get("x-forwarded-for") {
        if let Ok(s) = fwd.to_str() {
            return s.split(',').next().unwrap_or("unknown").trim().to_string();
        }
    }
    if let Some(real) = req.headers().get("x-real-ip") {
        if let Ok(s) = real.to_str() {
            return s.to_string();
        }
    }
    "unknown".to_string()
}

fn hash_token(token: &str) -> String {
    use sha2::{Sha256, Digest};
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

async fn auth_middleware(
    axum::extract::State(state): axum::extract::State<AppState>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let path = req.uri().path().to_string();

    // Allow health and login without auth
    if path.ends_with("/health") || path.ends_with("/auth/login") {
        return Ok(next.run(req).await);
    }

    let token_opt = req.headers()
        .get("x-api-key")
        .or_else(|| req.headers().get("Authorization"))
        .and_then(|h| h.to_str().ok())
        .map(|s| s.strip_prefix("Bearer ").unwrap_or(s).to_string());

    if let Some(ref token) = token_opt {
        let token_hash = hash_token(token);

        // Check Redis session first (fast path)
        if let Some(ref redis_conn) = state.redis {
            use redis::AsyncCommands;
            let mut conn = redis_conn.clone();
            let session_key = format!("zfs:session:{}", token_hash);
            let cached: redis::RedisResult<Option<String>> = conn.get(&session_key).await;
            if let Ok(Some(_)) = cached {
                return Ok(next.run(req).await);
            }
        }

        // Check DB sessions table
        if let Some(ref pg) = state.pg {
            let result = pg.query_opt(
                "SELECT token_hash FROM sessions WHERE token_hash = $1 AND expires_at > NOW()",
                &[&token_hash],
            ).await;
            if let Ok(Some(_)) = result {
                // Refresh Redis cache
                if let Some(ref redis_conn) = state.redis {
                    use redis::AsyncCommands;
                    let mut conn = redis_conn.clone();
                    let session_key = format!("zfs:session:{}", token_hash);
                    let _: redis::RedisResult<()> = conn.set_ex(&session_key, "admin", 86400u64).await;
                }
                return Ok(next.run(req).await);
            }
        }

        // Check API keys
        if let Some(ref pg) = state.pg {
            let result = pg.query_opt(
                "SELECT id FROM api_keys WHERE key_hash = $1",
                &[&token_hash],
            ).await;
            if let Ok(Some(row)) = result {
                let key_id: i32 = row.get(0);
                // Update last_used_at non-blocking
                let pg_clone = pg.clone();
                tokio::spawn(async move {
                    let _ = pg_clone.execute(
                        "UPDATE api_keys SET last_used_at = NOW() WHERE id = $1",
                        &[&key_id],
                    ).await;
                });
                return Ok(next.run(req).await);
            }
        }
    }

    if !UI_FIRST_CONTACT.load(Ordering::Relaxed) {
        if let Some(agent) = req.headers().get("user-agent") {
            let agent_str = agent.to_str().unwrap_or("unknown");
            if agent_str.contains("Mozilla") || agent_str.contains("Chrome") || agent_str.contains("Safari") {
                info!("UI: First contact established from {}", req.uri());
                UI_FIRST_CONTACT.store(true, Ordering::Relaxed);
            }
        }
    }

    // Log failed attempt
    let ip = get_client_ip(&req);
    if let Some(ref pg) = state.pg {
        let pg_clone = pg.clone();
        let ip_clone = ip.clone();
        tokio::spawn(async move {
            let _ = pg_clone.execute(
                "INSERT INTO login_attempts(ip_address, success) VALUES($1, false)",
                &[&ip_clone],
            ).await;
        });
    }
    warn!("Unauthorized access attempt from {ip}");

    Err(StatusCode::UNAUTHORIZED)
}

async fn security_headers(req: Request, next: Next) -> Response {
    let mut res = next.run(req).await;
    let h = res.headers_mut();
    use axum::http::HeaderValue;
    h.insert("X-Content-Type-Options", HeaderValue::from_static("nosniff"));
    h.insert("X-Frame-Options",        HeaderValue::from_static("DENY"));
    h.insert("X-XSS-Protection",       HeaderValue::from_static("1; mode=block"));
    h.insert("Content-Security-Policy", HeaderValue::from_static("default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * data:;"));
    h.insert("Referrer-Policy",        HeaderValue::from_static("same-origin"));
    res
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
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_default_password BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
        );
        CREATE TABLE IF NOT EXISTS api_keys (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            key_hash TEXT NOT NULL,
            key_prefix TEXT NOT NULL,
            permissions TEXT NOT NULL DEFAULT 'read',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_used_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS login_attempts (
            id BIGSERIAL PRIMARY KEY,
            ip_address TEXT NOT NULL,
            attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            success BOOLEAN NOT NULL DEFAULT FALSE
        );
    ";

    match client.batch_execute(sql).await {
        Ok(_) => info!("PostgreSQL schema initialized successfully"),
        Err(e) => warn!("Failed to initialize PostgreSQL schema: {e}"),
    }
}

async fn seed_admin_user(client: &tokio_postgres::Client, api_key: &str) {
    let count: i64 = client.query_one("SELECT COUNT(*) FROM users", &[]).await
        .map(|r| r.get(0)).unwrap_or(0);
    if count == 0 {
        let hash = tokio::task::spawn_blocking({
            let key = api_key.to_string();
            move || bcrypt::hash(key, 12)
        }).await.ok().and_then(|r| r.ok());
        if let Some(h) = hash {
            let is_default = api_key == "admin123";
            let _ = client.execute(
                "INSERT INTO users(username, password_hash, is_default_password) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
                &[&"admin", &h, &is_default],
            ).await;
        }
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
            let admin_password = {
                let v = std::env::var("ADMIN_PASSWORD").unwrap_or_default();
                if v.is_empty() { "admin123".to_string() } else { v }
            };
            seed_admin_user(&client, &admin_password).await;
            Some(Arc::new(client))
        }
        Err(e) => {
            warn!("PostgreSQL connection failed: {e}");
            None
        }
    };

    let rate_limit: state::RateLimitMap = Arc::new(Mutex::new(HashMap::new()));

    let app_state = AppState {
        redis: redis_conn,
        pg: pg_client,
        rate_limit,
        total_read_bytes: Arc::new(AtomicU64::new(0)),
        total_write_bytes: Arc::new(AtomicU64::new(0)),
    };

    tokio::spawn(worker::run_metrics_worker(app_state.clone()));

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .merge(routes::health::router())
        .merge(routes::auth::router(app_state.clone()))
        .merge(routes::settings::router(app_state.clone()))
        .merge(routes::pools::router())
        .merge(routes::datasets::router())
        .merge(routes::snapshots::router())
        .merge(routes::stats::router(app_state.clone()))
        .merge(routes::volumes::router())
        .merge(routes::clones::router())
        .merge(routes::properties::router())
        .merge(routes::metrics::router(app_state.clone()))
        .merge(routes::layout::router(app_state.clone()))
        .layer(middleware::from_fn_with_state(app_state.clone(), auth_middleware))
        .layer(middleware::from_fn(security_headers))
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
