-- Migration 052: PDF export templates — shared across team
-- Templates persist field selections for PDF exports per entity type.

CREATE TABLE IF NOT EXISTS pdf_templates (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  primary_fields JSONB NOT NULL DEFAULT '[]',
  linked_types JSONB NOT NULL DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pdf_templates_entity ON pdf_templates(entity_type);
