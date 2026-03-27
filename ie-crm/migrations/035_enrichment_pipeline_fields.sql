-- Migration 035: Enrichment Pipeline Fields
-- Requested by Houston Command for Ralph GPT enrichment workflow
-- Adds email/phone quality metadata, enrichment tracking, campaign tracking
-- Consolidates DOB fields, renames email→email_1, updates last_call_outcome

-- ============================================================
-- 1. CONSOLIDATE DOB FIELDS
--    Keep date_of_birth as canonical. Migrate data from 'born' if date_of_birth is null.
-- ============================================================
UPDATE contacts
SET date_of_birth = born
WHERE date_of_birth IS NULL AND born IS NOT NULL;

ALTER TABLE contacts DROP COLUMN IF EXISTS born;

-- Add DOB alias for Houston Command's workflow
-- (date_of_birth is the canonical column, 'dob' is a convenience alias via app layer)

-- ============================================================
-- 2. AUTO-COMPUTE AGE FROM date_of_birth VIA TRIGGER
--    (Generated columns can't use age() since it depends on current_date)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_compute_age()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.date_of_birth IS NOT NULL THEN
    NEW.age := EXTRACT(YEAR FROM age(NEW.date_of_birth))::INTEGER;
  ELSE
    NEW.age := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_compute_age ON contacts;
CREATE TRIGGER trg_compute_age
  BEFORE INSERT OR UPDATE OF date_of_birth ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION fn_compute_age();

-- ============================================================
-- 3. RENAME email → email_1
-- ============================================================
ALTER TABLE contacts RENAME COLUMN email TO email_1;

-- ============================================================
-- 4. UPDATE last_call_outcome → last_call_result (enum)
-- ============================================================
-- Create the enum type
DO $$ BEGIN
  CREATE TYPE call_result_enum AS ENUM ('connected', 'voicemail', 'no_answer', 'disconnected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drop old free-text column and add enum version
ALTER TABLE contacts DROP COLUMN IF EXISTS last_call_outcome;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_call_result call_result_enum;

-- ============================================================
-- 5. CREATE ENUM TYPES FOR NEW FIELDS
-- ============================================================
DO $$ BEGIN
  CREATE TYPE confidence_level AS ENUM ('high', 'medium', 'low');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE phone_type_enum AS ENUM ('mobile', 'landline', 'voip');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE outreach_stage_enum AS ENUM (
    'not_started', 'email_sent', 'email_opened', 'text_sent',
    'call_attempted', 'engaged', 'opted_out'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 6. CORE IDENTITY
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS owner_name_verified BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 7. EMAIL ENRICHMENT METADATA
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_1_confidence confidence_level;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_2_confidence confidence_level;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_1_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_2_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_1_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_2_verified BOOLEAN DEFAULT FALSE;

-- ============================================================
-- 8. PHONE ENRICHMENT METADATA
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_1_type phone_type_enum;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_2_type phone_type_enum;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_1_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_2_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_1_source TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_2_source TEXT;

-- ============================================================
-- 9. ENRICHMENT METADATA
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_source_trail TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS campaign_ready BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enriched_by TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enrichment_decay_check DATE;

-- ============================================================
-- 10. CAMPAIGN TRACKING
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_email_sent TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_email_opened TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_email_replied TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_bounce_count INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_text_sent TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_text_replied TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_call_attempted TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS outreach_stage outreach_stage_enum DEFAULT 'not_started';

-- ============================================================
-- 11. AUTO-SET campaign_ready TRIGGER
--     Sets campaign_ready = true when email_1_verified = true
--     AND email_1_confidence = 'high'
-- ============================================================
CREATE OR REPLACE FUNCTION fn_auto_campaign_ready()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_1_verified = TRUE AND NEW.email_1_confidence = 'high' THEN
    NEW.campaign_ready := TRUE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_campaign_ready ON contacts;
CREATE TRIGGER trg_auto_campaign_ready
  BEFORE INSERT OR UPDATE OF email_1_verified, email_1_confidence ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION fn_auto_campaign_ready();

-- ============================================================
-- 12. INDEX for enrichment queue queries
--     (contacts missing email, sorted by enrichment priority)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_contacts_enrichment_queue
  ON contacts (enrichment_status, campaign_ready)
  WHERE email_1 IS NULL OR email_1 = '';

CREATE INDEX IF NOT EXISTS idx_contacts_campaign_ready
  ON contacts (campaign_ready)
  WHERE campaign_ready = TRUE;

CREATE INDEX IF NOT EXISTS idx_contacts_outreach_stage
  ON contacts (outreach_stage);
