-- Migration 065: Add updated_at audit trail to 3 tables that lack one
-- QA audit 2026-04-15 P2-08.
--
-- Background: During the Phase 2 DB audit we found that 5 of 6 core entity
-- tables already have update tracking under a non-standard column name
-- (`modified` on contacts/companies/deals/campaigns, `last_modified` on
-- properties). The one core table that truly lacks update tracking is
-- `interactions`. Three auxiliary tables also lack timestamps entirely:
--   - dedup_merge_audit  (merge events untraceable)
--   - tpe_config         (model-weight changes unauditable)
--   - verification_requests has only created_at, no updated_at
--
-- This migration adds `updated_at TIMESTAMPTZ DEFAULT now()` and a single
-- shared BEFORE-UPDATE trigger function to each table. Existing rows are
-- backfilled to their `created_at` value (or NOW() if created_at is also
-- missing). Per the user decision during remediation (2026-04-15), the
-- existing `modified` / `last_modified` columns on the 5 core tables are
-- LEFT ALONE — they work, and renaming on live production data is riskier
-- than the consistency benefit.

BEGIN;

-- 1. Shared trigger function (idempotent create)
CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. interactions — only core entity lacking update tracking
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE interactions
  SET updated_at = COALESCE(created_at, now())
  WHERE updated_at IS NULL OR updated_at = '0001-01-01'::timestamptz;

DROP TRIGGER IF EXISTS trg_interactions_updated_at ON interactions;
CREATE TRIGGER trg_interactions_updated_at
  BEFORE UPDATE ON interactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- 3. dedup_merge_audit — merge events were fully untraceable before this
ALTER TABLE dedup_merge_audit
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE dedup_merge_audit
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_dedup_merge_audit_updated_at ON dedup_merge_audit;
CREATE TRIGGER trg_dedup_merge_audit_updated_at
  BEFORE UPDATE ON dedup_merge_audit
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- 4. tpe_config — model weight changes need an audit trail
ALTER TABLE tpe_config
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE tpe_config
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS trg_tpe_config_updated_at ON tpe_config;
CREATE TRIGGER trg_tpe_config_updated_at
  BEFORE UPDATE ON tpe_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

-- 5. verification_requests — had created_at but no updated_at
ALTER TABLE verification_requests
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE verification_requests
  SET updated_at = COALESCE(created_at, now())
  WHERE updated_at IS NULL OR updated_at = '0001-01-01'::timestamptz;

DROP TRIGGER IF EXISTS trg_verification_requests_updated_at ON verification_requests;
CREATE TRIGGER trg_verification_requests_updated_at
  BEFORE UPDATE ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();

COMMIT;
