-- Migration 042: Campaign Ready Flag Logic
-- A contact is campaign_ready when they have: email + name + type + not opted out.
-- This migration backfills existing contacts and adds a trigger to auto-maintain.
-- Idempotent (safe to re-run).

-- ============================================================
-- PART 1: Backfill campaign_ready on all existing contacts
-- ============================================================

UPDATE contacts
SET campaign_ready = (
  email_1 IS NOT NULL AND email_1 != ''
  AND full_name IS NOT NULL AND full_name != ''
  AND type IS NOT NULL AND type != ''
  AND (opted_out IS NULL OR opted_out = false)
);

-- ============================================================
-- PART 2: Create trigger function to auto-maintain campaign_ready
-- Fires on INSERT or UPDATE so the flag stays current as data changes.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_sync_campaign_ready()
RETURNS TRIGGER AS $$
BEGIN
  NEW.campaign_ready := (
    NEW.email_1 IS NOT NULL AND NEW.email_1 != ''
    AND NEW.full_name IS NOT NULL AND NEW.full_name != ''
    AND NEW.type IS NOT NULL AND NEW.type != ''
    AND (NEW.opted_out IS NULL OR NEW.opted_out = false)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if present (idempotent)
DROP TRIGGER IF EXISTS trg_sync_campaign_ready ON contacts;

CREATE TRIGGER trg_sync_campaign_ready
  BEFORE INSERT OR UPDATE OF email_1, full_name, type, opted_out
  ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_campaign_ready();
