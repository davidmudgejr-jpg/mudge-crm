-- Migration 041: Add CHECK constraints on enum-like columns
-- Prevents future data inconsistency at the database level.
-- Run AFTER migration 039 (normalization) to ensure existing data is clean.

-- ============================================================
-- Contact type constraint
-- Allows single values or comma-separated sorted combos
-- ============================================================

-- Drop if exists (idempotent)
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS chk_contact_type;

-- We can't use a simple IN check for multi-value fields,
-- but we CAN ensure each part is a valid Title Case value.
-- Using a function for reusability:
CREATE OR REPLACE FUNCTION fn_valid_contact_types(val TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN TRUE; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM unnest(string_to_array(val, ',')) AS part
    WHERE trim(part) NOT IN (
      'Owner', 'Broker', 'Tenant', 'Investor', 'Developer',
      'Vendor', 'Attorney', 'Lender', 'Buyer', 'Other',
      'Property Manager', 'Investment Banker', 'Lawyer', 'Title Rep'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

ALTER TABLE contacts ADD CONSTRAINT chk_contact_type
  CHECK (fn_valid_contact_types(type));

-- ============================================================
-- Company type constraint
-- ============================================================

ALTER TABLE companies DROP CONSTRAINT IF EXISTS chk_company_type;
ALTER TABLE companies ADD CONSTRAINT chk_company_type
  CHECK (company_type IS NULL OR company_type IN (
    'Owner/Operator', 'Tenant', 'Brokerage', 'Developer',
    'Investor', 'Lender', 'Vendor', 'Other'
  ));

-- ============================================================
-- Interaction type constraint
-- ============================================================

ALTER TABLE interactions DROP CONSTRAINT IF EXISTS chk_interaction_type;
ALTER TABLE interactions ADD CONSTRAINT chk_interaction_type
  CHECK (type IS NULL OR type IN (
    'Lead', 'Phone Call', 'Cold Call', 'Voicemail',
    'Outbound Email', 'Inbound Email', 'Cold Email', 'Check in Email',
    'Email Campaign', 'Text', 'Meeting', 'Tour', 'Door Knock',
    'Drive By', 'Snail Mail', 'Offer Sent', 'Survey Sent', 'BOV Sent',
    -- Legacy types (still valid in existing data)
    'Call', 'Email', 'Note', 'LinkedIn', 'Other',
    -- Generic (890 existing records — will be reclassified later)
    'interaction'
  ));

-- ============================================================
-- Action item status constraint
-- ============================================================

ALTER TABLE action_items DROP CONSTRAINT IF EXISTS chk_action_item_status;
ALTER TABLE action_items ADD CONSTRAINT chk_action_item_status
  CHECK (status IS NULL OR status IN (
    'Todo', 'Reminders', 'In progress', 'Done', 'Dead',
    'Email', 'Needs and Wants', 'Pending'
  ));

-- ============================================================
-- Deal status constraint
-- ============================================================

ALTER TABLE deals DROP CONSTRAINT IF EXISTS chk_deal_status;
ALTER TABLE deals ADD CONSTRAINT chk_deal_status
  CHECK (status IS NULL OR status IN (
    'Lead', 'Prospect', 'Active', 'Under Contract', 'Closed',
    'Dead', 'On Hold', 'Pending', 'Dead Lead', 'Deal fell through', 'Long Leads'
  ));

-- ============================================================
-- Deal type constraint
-- ============================================================

ALTER TABLE deals DROP CONSTRAINT IF EXISTS chk_deal_type;
ALTER TABLE deals ADD CONSTRAINT chk_deal_type
  CHECK (deal_type IS NULL OR deal_type IN (
    'Lease', 'Sale', 'Buy', 'Sublease', 'Investment', 'Other'
  ));

-- ============================================================
-- Lease comp rent_type constraint
-- ============================================================

ALTER TABLE lease_comps DROP CONSTRAINT IF EXISTS chk_rent_type;
ALTER TABLE lease_comps ADD CONSTRAINT chk_rent_type
  CHECK (rent_type IS NULL OR rent_type IN (
    'GRS', 'NNN', 'MGR', 'IG', 'FSG'
  ));
