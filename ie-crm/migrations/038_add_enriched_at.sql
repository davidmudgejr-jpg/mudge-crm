-- Migration 038: Add enriched_at column to contacts (safety net)
-- This column is now added at the top of migration 037 to ensure the
-- fn_verification_auto_promote trigger can reference it on a fresh DB.
-- This migration is kept as an idempotent no-op for any environment
-- that ran an earlier version of 037 before the fix was applied.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
