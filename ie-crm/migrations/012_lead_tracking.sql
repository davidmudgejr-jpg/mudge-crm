BEGIN;
-- lead_source already exists on interactions table
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS lead_status TEXT;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS lead_interest TEXT;
-- Partial index for fast lead queries
CREATE INDEX IF NOT EXISTS idx_interactions_lead_type ON interactions(type) WHERE type = 'Lead';
COMMIT;
