-- Module system: registries, installed modules, configs, runs, metrics, audit log.
CREATE TABLE module_registries (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE modules (
    -- Manifest id, e.g. "immich"
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    author TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '',
    repository_url TEXT NOT NULL DEFAULT '',
    -- 'registry' or 'sideload'
    source TEXT NOT NULL,
    registry_url TEXT,
    wasm_sha256 TEXT NOT NULL,
    -- Full parsed module.toml (permissions, config_schema, ...)
    manifest JSONB NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE module_configs (
    module_id TEXT PRIMARY KEY REFERENCES modules(id) ON DELETE CASCADE,
    -- Non-secret config values, including the schedule
    config JSONB NOT NULL DEFAULT '{}',
    -- AES-256-GCM encrypted JSON object {key: value}; nonce is prepended
    secrets BYTEA,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE module_runs (
    id BIGSERIAL PRIMARY KEY,
    module_id TEXT NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    -- NULL while the run is still in progress
    success BOOLEAN,
    message TEXT NOT NULL DEFAULT '',
    metrics_written INTEGER NOT NULL DEFAULT 0,
    -- 'schedule' or 'manual'
    trigger TEXT NOT NULL DEFAULT 'schedule'
);
CREATE INDEX idx_module_runs_module_time ON module_runs(module_id, started_at DESC);

-- Metrics written by modules via the db_write_metric host capability.
CREATE TABLE module_metrics (
    id BIGSERIAL PRIMARY KEY,
    module_id TEXT NOT NULL,
    metric_name TEXT NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_module_metrics_lookup ON module_metrics(module_id, metric_name, collected_at DESC);

CREATE TABLE module_audit_log (
    id BIGSERIAL PRIMARY KEY,
    -- 'admin' for session tokens, 'api-key:<name>' for API keys
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    module_id TEXT,
    details JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
