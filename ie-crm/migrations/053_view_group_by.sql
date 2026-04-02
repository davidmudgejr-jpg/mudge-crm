-- Add group_by_column to saved_views for row grouping
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS group_by_column TEXT;
