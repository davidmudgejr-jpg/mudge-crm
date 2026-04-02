-- Fix deal_type CHECK constraint to match all valid deal types used in the CRM
-- Previous constraint was missing Renewal and had mismatches with frontend options

ALTER TABLE deals DROP CONSTRAINT IF EXISTS chk_deal_type;
ALTER TABLE deals ADD CONSTRAINT chk_deal_type
  CHECK (deal_type IS NULL OR deal_type IN (
    'Lease', 'Sale', 'Buy', 'Sublease', 'Renewal', 'Investment', 'Other'
  ));

-- Also fix any existing data that used old names
UPDATE deals SET deal_type = 'Buy' WHERE deal_type = 'Purchase';
UPDATE deals SET deal_type = 'Sublease' WHERE deal_type IN ('Sub-Lease', 'Sub Lease');
