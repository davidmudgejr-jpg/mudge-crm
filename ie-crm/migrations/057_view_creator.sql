-- Add created_by column to saved_views for creator attribution
ALTER TABLE saved_views ADD COLUMN IF NOT EXISTS created_by TEXT;
