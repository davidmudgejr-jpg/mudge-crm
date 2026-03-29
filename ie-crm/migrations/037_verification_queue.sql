-- Migration 037: Verification Queue (Human-in-the-Loop)
-- Enables Houston/Ralph to flag contacts for David's manual verification
-- Tracks confirmation rates to measure enrichment quality over time

-- ============================================================
-- 0. ENSURE contacts.enriched_at EXISTS
-- fn_verification_auto_promote (below) writes to this column.
-- Must be present before the function is defined so the migration
-- chain is replay-safe on a clean database (migration 038 also adds
-- it as a safety net, but this guarantees correct ordering).
-- ============================================================
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;

-- ============================================================
-- 1. VERIFICATION REQUESTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(contact_id) ON DELETE CASCADE,
  property_id UUID,  -- optional context, no FK constraint (properties table PK varies)

  -- Request info
  requested_by TEXT NOT NULL CHECK (requested_by IN ('ralph_gpt', 'houston_command', 'claude_code')),
  request_type TEXT NOT NULL CHECK (request_type IN (
    'verify_email', 'verify_phone', 'verify_identity',
    'check_zoominfo', 'confirm_decision_maker', 'verify_address', 'other'
  )),
  request_details TEXT NOT NULL,
  suggested_data JSONB,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Response
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'confirmed', 'rejected', 'updated', 'not_found', 'expired'
  )),
  david_response TEXT,
  updated_data JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  viewed_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),

  -- Tracking
  resolution_time_seconds INTEGER,
  confidence_before TEXT,
  confidence_after TEXT
);

-- ============================================================
-- 2. INDEXES
-- ============================================================
CREATE INDEX idx_verification_status ON verification_requests(status);
CREATE INDEX idx_verification_contact ON verification_requests(contact_id);
CREATE INDEX idx_verification_pending_created ON verification_requests(created_at DESC) WHERE status IN ('pending', 'in_progress');
CREATE INDEX idx_verification_expires ON verification_requests(expires_at) WHERE status = 'pending';

-- ============================================================
-- 3. AUTO-EXPIRE TRIGGER
-- Marks pending requests as 'expired' after 7 days
-- Called on any query to the queue (lazy expiration)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_expire_verification_requests()
RETURNS TRIGGER AS $$
BEGIN
  -- Expire any pending requests past their expiration date
  UPDATE verification_requests
  SET status = 'expired', resolved_at = NOW()
  WHERE status = 'pending' AND expires_at < NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 4. AUTO-PROMOTE ON RESOLVE TRIGGER
-- When David confirms/updates, promote data to Gold tier
-- ============================================================
CREATE OR REPLACE FUNCTION fn_verification_auto_promote()
RETURNS TRIGGER AS $$
DECLARE
  promote_data JSONB;
  contact_rec RECORD;
BEGIN
  -- Only fire on status change to confirmed/updated
  IF NEW.status NOT IN ('confirmed', 'updated') THEN
    RETURN NEW;
  END IF;

  -- Auto-calculate resolution time
  IF NEW.resolved_at IS NOT NULL AND NEW.created_at IS NOT NULL THEN
    NEW.resolution_time_seconds := EXTRACT(EPOCH FROM (NEW.resolved_at - NEW.created_at))::INTEGER;
  END IF;

  -- Determine which data to promote
  IF NEW.status = 'confirmed' THEN
    promote_data := NEW.suggested_data;
    NEW.confidence_after := 'high';
  ELSIF NEW.status = 'updated' THEN
    promote_data := NEW.updated_data;
    NEW.confidence_after := 'high';
  END IF;

  -- Promote fields to the contact record as Gold data
  IF promote_data IS NOT NULL AND NEW.contact_id IS NOT NULL THEN
    -- Get current contact state
    SELECT * INTO contact_rec FROM contacts WHERE contact_id = NEW.contact_id;

    -- Update email if provided
    IF promote_data->>'email' IS NOT NULL THEN
      IF contact_rec.email_1 IS NULL OR contact_rec.email_1 = '' OR contact_rec.data_source != 'manual' THEN
        UPDATE contacts SET
          email_1 = promote_data->>'email',
          email_1_confidence = 'high',
          email_1_verified = TRUE,
          email_1_source = 'manual_verification',
          data_source = 'manual',
          enriched_by = 'manual',
          enriched_at = NOW()
        WHERE contact_id = NEW.contact_id;
      ELSE
        -- Gold data exists on email_1, add to email_2
        UPDATE contacts SET
          email_2 = promote_data->>'email',
          email_2_confidence = 'high',
          email_2_verified = TRUE,
          email_2_source = 'manual_verification'
        WHERE contact_id = NEW.contact_id;
      END IF;
    END IF;

    -- Update phone if provided
    IF promote_data->>'phone' IS NOT NULL THEN
      IF contact_rec.phone_1 IS NULL OR contact_rec.phone_1 = '' THEN
        UPDATE contacts SET
          phone_1 = promote_data->>'phone',
          phone_1_verified = TRUE,
          phone_1_source = 'manual_verification'
        WHERE contact_id = NEW.contact_id;
      ELSE
        UPDATE contacts SET
          phone_2 = promote_data->>'phone',
          phone_2_verified = TRUE,
          phone_2_source = 'manual_verification'
        WHERE contact_id = NEW.contact_id;
      END IF;
    END IF;

    -- Update name/position if provided
    IF promote_data->>'name' IS NOT NULL THEN
      UPDATE contacts SET full_name = promote_data->>'name' WHERE contact_id = NEW.contact_id;
    END IF;

    -- Update DOB if provided
    IF promote_data->>'dob' IS NOT NULL THEN
      UPDATE contacts SET date_of_birth = (promote_data->>'dob')::DATE WHERE contact_id = NEW.contact_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_verification_auto_promote
  BEFORE UPDATE ON verification_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('confirmed', 'updated'))
  EXECUTE FUNCTION fn_verification_auto_promote();
