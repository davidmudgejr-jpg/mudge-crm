-- Migration 036: Enrichment Schema Fixes
-- Per Houston Command review + Claude Code recommendations
-- 1. Convert enriched_by from TEXT to ENUM for clean filtering
-- 2. Add composite index for enrichment queue queries
-- 3. Enhance auto-promote trigger for high-confidence contacts
-- 4. Add opted_out columns for CAN-SPAM compliance

-- ============================================================
-- 0. DROP TRIGGERS that reference enriched_by before altering type
-- ============================================================
DROP TRIGGER IF EXISTS trg_auto_campaign_ready ON contacts;

-- ============================================================
-- 1. CONVERT enriched_by TEXT → ENUM
-- ============================================================
DO $$ BEGIN
  CREATE TYPE enriched_by_enum AS ENUM ('ralph_gpt', 'ralph_gemini', 'houston_command', 'manual', 'skip_trace', 'bulk_import');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Migrate existing data then swap column type
ALTER TABLE contacts
  ALTER COLUMN enriched_by TYPE enriched_by_enum
  USING enriched_by::enriched_by_enum;

-- ============================================================
-- 2. ADD opted_out COLUMNS (before trigger that references them)
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opted_out BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_contacts_opted_out
  ON contacts (opted_out)
  WHERE opted_out = TRUE;

-- ============================================================
-- 3. COMPOSITE INDEXES for enrichment queue + decay checking
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contacts_enrichment_decay
  ON contacts (campaign_ready, enrichment_decay_check)
  WHERE campaign_ready = TRUE;

-- ============================================================
-- 4. ENHANCED AUTO-PROMOTE TRIGGER
--    Auto-sets campaign_ready AND auto-sets enrichment_decay_check
--    when email_1 is verified with high confidence.
--    Skips if contact is opted_out.
-- ============================================================
CREATE OR REPLACE FUNCTION fn_auto_campaign_ready()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-promote: high confidence + verified = campaign ready
  IF NEW.email_1_verified = TRUE AND NEW.email_1_confidence = 'high' THEN
    -- Don't promote if opted out
    IF COALESCE(NEW.opted_out, FALSE) = FALSE THEN
      NEW.campaign_ready := TRUE;
    END IF;
  END IF;

  -- Auto-set decay check date when enrichment happens
  IF NEW.enriched_by IS NOT NULL AND (OLD IS NULL OR OLD.enriched_by IS NULL) THEN
    -- Owners get 180 days, everyone else gets 90 days
    IF NEW.type = 'owner' THEN
      NEW.enrichment_decay_check := CURRENT_DATE + INTERVAL '180 days';
    ELSE
      NEW.enrichment_decay_check := CURRENT_DATE + INTERVAL '90 days';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger with expanded column watch list
CREATE TRIGGER trg_auto_campaign_ready
  BEFORE INSERT OR UPDATE OF email_1_verified, email_1_confidence, enriched_by ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_campaign_ready();
