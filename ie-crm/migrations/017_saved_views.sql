-- migrations/017_saved_views.sql
-- Custom Saved Views — stores filter/sort/column state per entity tab

CREATE TABLE IF NOT EXISTS saved_views (
  view_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL,
  view_name       TEXT NOT NULL,
  filters         JSONB NOT NULL DEFAULT '[]',
  filter_logic    TEXT NOT NULL DEFAULT 'AND',
  sort_column     TEXT,
  sort_direction  TEXT DEFAULT 'DESC',
  visible_columns JSONB,
  is_default      BOOLEAN DEFAULT FALSE,
  position        INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_entity
  ON saved_views (entity_type, position);

CREATE UNIQUE INDEX IF NOT EXISTS idx_saved_views_one_default_per_entity
  ON saved_views (entity_type) WHERE is_default = TRUE;
