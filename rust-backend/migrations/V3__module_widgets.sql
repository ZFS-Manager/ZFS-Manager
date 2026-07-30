-- Custom tabs: user-created dashboard pages that contain module widgets.
CREATE TABLE IF NOT EXISTS custom_tabs (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT NOT NULL DEFAULT 'layout',
    sort_order INTEGER NOT NULL DEFAULT 0,
    -- Widget layout for this tab (JSON array of widget placements)
    layout JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
