-- Migration 040: Data Gap Backfills
-- Fills missing data that can be derived from existing relationships.
-- All operations are idempotent (safe to re-run).

-- ============================================================
-- PART 1: Backfill lease_comps.city from linked properties
-- Houston found 8,985 of 9,003 lease comps missing city (99.8%)
-- ============================================================

UPDATE lease_comps lc
SET city = p.city
FROM properties p
WHERE lc.property_id = p.property_id
  AND (lc.city IS NULL OR lc.city = '')
  AND p.city IS NOT NULL AND p.city != '';

-- Also backfill property_address on lease_comps if missing
UPDATE lease_comps lc
SET property_address = p.property_address
FROM properties p
WHERE lc.property_id = p.property_id
  AND (lc.property_address IS NULL OR lc.property_address = '')
  AND p.property_address IS NOT NULL AND p.property_address != '';

-- ============================================================
-- PART 2: Backfill sale_comps.city from linked properties
-- Houston found 99.9% missing city
-- ============================================================

UPDATE sale_comps sc
SET city = p.city
FROM properties p
WHERE sc.property_id = p.property_id
  AND (sc.city IS NULL OR sc.city = '')
  AND p.city IS NOT NULL AND p.city != '';

-- Also backfill property_address on sale_comps if missing
UPDATE sale_comps sc
SET property_address = p.property_address
FROM properties p
WHERE sc.property_id = p.property_id
  AND (sc.property_address IS NULL OR sc.property_address = '')
  AND p.property_address IS NOT NULL AND p.property_address != '';

-- ============================================================
-- PART 3: Flag junk company names
-- 2,257 companies named just "Inc.", "LLC", "LP", etc.
-- Tag them for review rather than deleting (may have linked records)
-- ============================================================

-- Add a flag column if not exists
ALTER TABLE companies ADD COLUMN IF NOT EXISTS data_quality_flag TEXT;

-- Flag companies with junk names
UPDATE companies
SET data_quality_flag = 'junk_name'
WHERE data_quality_flag IS NULL
  AND (
    -- Exact suffix matches
    trim(company_name) IN ('Inc.', 'Inc', 'LLC', 'LP', 'Corp.', 'Corp', 'Co.', 'Co', 'LLP', 'Ltd', 'Ltd.')
    -- Names 3 chars or less
    OR length(trim(company_name)) <= 3
  );

-- Check if junk companies have real names in overflow
-- (This SELECT is for analysis — the UPDATE below copies overflow names if found)
UPDATE companies
SET company_name = overflow->>'company_name',
    data_quality_flag = 'name_recovered_from_overflow'
WHERE data_quality_flag = 'junk_name'
  AND overflow IS NOT NULL
  AND overflow->>'company_name' IS NOT NULL
  AND length(trim(overflow->>'company_name')) > 3;

-- ============================================================
-- PART 4: Populate deal_properties from address matching
-- Houston found deal_properties is completely empty
-- Try to link deals to properties by matching addresses
-- ============================================================

INSERT INTO deal_properties (deal_id, property_id)
SELECT DISTINCT d.deal_id, p.property_id
FROM deals d
JOIN properties p ON (
  -- Match on normalized address if available
  (d.property_address IS NOT NULL AND p.normalized_address IS NOT NULL
   AND lower(trim(d.property_address)) = lower(p.normalized_address))
  OR
  -- Fallback: match on raw property_address
  (d.property_address IS NOT NULL AND p.property_address IS NOT NULL
   AND lower(trim(d.property_address)) = lower(trim(p.property_address)))
)
WHERE d.property_address IS NOT NULL AND d.property_address != ''
  AND NOT EXISTS (
    SELECT 1 FROM deal_properties dp
    WHERE dp.deal_id = d.deal_id AND dp.property_id = p.property_id
  );

-- ============================================================
-- PART 5: Match contacts to companies by email domain
-- Houston found 373 contacts with email but no company link
-- ============================================================

-- This is a best-effort match: extract domain from contact email,
-- find companies where any existing linked contact shares that domain.
-- Only creates links where there's a single matching company (high confidence).

WITH contact_domains AS (
  SELECT c.contact_id,
         lower(split_part(c.email_1, '@', 2)) AS domain
  FROM contacts c
  WHERE c.email_1 IS NOT NULL AND c.email_1 LIKE '%@%'
    AND NOT EXISTS (
      SELECT 1 FROM contact_companies cc WHERE cc.contact_id = c.contact_id
    )
),
company_domains AS (
  SELECT DISTINCT cc.company_id,
         lower(split_part(c2.email, '@', 2)) AS domain
  FROM contact_companies cc
  JOIN contacts c2 ON c2.contact_id = cc.contact_id
  WHERE c2.email IS NOT NULL AND c2.email LIKE '%@%'
    AND lower(split_part(c2.email, '@', 2)) NOT IN (
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com',
      'icloud.com', 'me.com', 'msn.com', 'live.com', 'comcast.net',
      'sbcglobal.net', 'att.net', 'verizon.net', 'cox.net'
    )
),
single_company_match AS (
  SELECT cd.contact_id, cd.domain, (array_agg(cmd.company_id))[1] AS company_id
  FROM contact_domains cd
  JOIN company_domains cmd ON cd.domain = cmd.domain
  GROUP BY cd.contact_id, cd.domain
  HAVING COUNT(DISTINCT cmd.company_id) = 1  -- only match if exactly one company
)
INSERT INTO contact_companies (contact_id, company_id)
SELECT contact_id, company_id
FROM single_company_match
ON CONFLICT DO NOTHING;
