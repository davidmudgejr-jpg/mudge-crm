-- Migration 051: Add column_order to saved_views
-- Allows each saved view to persist its own column arrangement.
-- Falls back to localStorage global order when NULL (no view active).

ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS column_order JSONB;
