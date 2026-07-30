-- Baseline schema. Matches the tables previously created inline at startup,
-- so it is a no-op on existing deployments (IF NOT EXISTS everywhere).
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
CREATE INDEX IF NOT EXISTS idx_zfs_metrics_pool_time_asc ON zfs_metrics(pool_name, collected_at ASC);
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
CREATE TABLE IF NOT EXISTS global_stats (
    id INTEGER PRIMARY KEY DEFAULT 1,
    total_read_bytes BIGINT NOT NULL DEFAULT 0,
    total_write_bytes BIGINT NOT NULL DEFAULT 0,
    CHECK (id = 1)
);
CREATE TABLE IF NOT EXISTS notification_channels (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notification_rules (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    threshold_value DOUBLE PRECISION,
    channel_ids INTEGER[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS disk_stats (
    pool_name TEXT NOT NULL,
    disk_name TEXT NOT NULL,
    total_read_bytes BIGINT NOT NULL DEFAULT 0,
    total_write_bytes BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (pool_name, disk_name)
);
