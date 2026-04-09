-- Add updated_data column to suggested_updates for storing edited values
-- When a reviewer corrects a suggested value before accepting, we store both
-- the original suggestion and the applied value for audit trail.
ALTER TABLE suggested_updates ADD COLUMN IF NOT EXISTS updated_data JSONB;
