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
