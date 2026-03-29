-- Migration 039: Data Consistency Normalization
-- Fixes critical issues identified in Houston Command's March 28 database audit.
-- All operations are idempotent (safe to re-run).

-- ============================================================
-- PART 1: Contact type normalization → Title Case
-- ============================================================

-- Normalize single-value types to Title Case
UPDATE contacts SET type = 'Owner'     WHERE type = 'owner';
UPDATE contacts SET type = 'Tenant'    WHERE type = 'tenant';
UPDATE contacts SET type = 'Broker'    WHERE type = 'broker';
UPDATE contacts SET type = 'Investor'  WHERE type = 'investor';
UPDATE contacts SET type = 'Developer' WHERE type = 'developer';
UPDATE contacts SET type = 'Vendor'    WHERE type = 'vendor';
UPDATE contacts SET type = 'Attorney'  WHERE type = 'attorney';
UPDATE contacts SET type = 'Lender'    WHERE type = 'lender';
UPDATE contacts SET type = 'Other'     WHERE type = 'other';

-- Normalize multi-value types: sort alphabetically so "Owner,Tenant" == "Tenant,Owner"
-- Step 1: Title-case each part, then sort alphabetically
UPDATE contacts
SET type = (
  SELECT string_agg(part, ',' ORDER BY part)
  FROM unnest(string_to_array(type, ',')) AS part
)
WHERE type LIKE '%,%';

-- Step 2: Title-case each part of the now-sorted multi-values
UPDATE contacts
SET type = (
  SELECT string_agg(initcap(trim(part)), ',' ORDER BY initcap(trim(part)))
  FROM unnest(string_to_array(type, ',')) AS part
)
WHERE type LIKE '%,%';

-- ============================================================
-- PART 2: Company type normalization
-- Move property-type values to industry_type, set company_type to role
-- ============================================================

-- Move property-type values from company_type to industry_type (only if industry_type is null)
UPDATE companies SET industry_type = company_type, company_type = 'Tenant'
WHERE company_type IN ('Office', 'Industrial', 'Retail', 'Flex', 'NNN', 'Mixed-Use', 'Multifamily', 'Land')
  AND (industry_type IS NULL OR industry_type = '');

-- Move property-type values but preserve existing industry_type
UPDATE companies SET company_type = 'Tenant'
WHERE company_type IN ('Office', 'Industrial', 'Retail', 'Flex', 'NNN', 'Mixed-Use', 'Multifamily', 'Land')
  AND industry_type IS NOT NULL AND industry_type != '';

-- Move industry values from company_type to industry_type
UPDATE companies SET industry_type = company_type, company_type = 'Other'
WHERE company_type IN ('Trucking', 'Manufacturing', 'Logistics', 'Construction', 'Technology')
  AND (industry_type IS NULL OR industry_type = '');

UPDATE companies SET company_type = 'Other'
WHERE company_type IN ('Trucking', 'Manufacturing', 'Logistics', 'Construction', 'Technology')
  AND industry_type IS NOT NULL AND industry_type != '';

-- Normalize company_type case to Title Case (matching quickAddFields.js)
UPDATE companies SET company_type = 'Tenant'        WHERE lower(company_type) = 'tenant';
UPDATE companies SET company_type = 'Brokerage'     WHERE lower(company_type) = 'brokerage';
UPDATE companies SET company_type = 'Owner/Operator' WHERE lower(company_type) = 'owner' OR lower(company_type) = 'owner/operator';
UPDATE companies SET company_type = 'Investor'      WHERE lower(company_type) = 'investor' OR lower(company_type) = 'investment';
UPDATE companies SET company_type = 'Developer'     WHERE lower(company_type) = 'developer';
UPDATE companies SET company_type = 'Lender'        WHERE lower(company_type) = 'lender';
UPDATE companies SET company_type = 'Vendor'        WHERE lower(company_type) = 'vendor';

-- ============================================================
-- PART 3: Interaction type normalization → Title Case
-- ============================================================

UPDATE interactions SET type = 'Note'       WHERE type = 'note';
UPDATE interactions SET type = 'Meeting'    WHERE type = 'meeting';
UPDATE interactions SET type = 'Phone Call' WHERE type = 'phone call';
UPDATE interactions SET type = 'Cold Call'  WHERE type = 'cold call';
UPDATE interactions SET type = 'Drive By'   WHERE type = 'drive by';
UPDATE interactions SET type = 'Lead'       WHERE type = 'lead';
UPDATE interactions SET type = 'Tour'       WHERE type = 'tour';
UPDATE interactions SET type = 'Text'       WHERE type = 'text';

-- ============================================================
-- PART 4: Action item status normalization → Title Case
-- ============================================================

UPDATE action_items SET status = 'Pending'     WHERE status = 'pending';
UPDATE action_items SET status = 'Todo'        WHERE status = 'todo';
UPDATE action_items SET status = 'Done'        WHERE status = 'done';
UPDATE action_items SET status = 'In progress' WHERE status = 'in progress';
UPDATE action_items SET status = 'Dead'        WHERE status = 'dead';

-- ============================================================
-- PART 5: Lease comp rent_type consolidation
-- ============================================================

UPDATE lease_comps SET rent_type = 'GRS' WHERE rent_type IN ('G', 'FSG');
UPDATE lease_comps SET rent_type = 'MGR' WHERE rent_type = 'MG';
-- Keep IG as-is until David confirms what it means

-- ============================================================
-- PART 6: Client level multi-value normalization (sort alphabetically)
-- ============================================================

UPDATE contacts
SET client_level = (
  SELECT string_agg(trim(part), ',' ORDER BY trim(part))
  FROM unnest(string_to_array(client_level, ',')) AS part
)
WHERE client_level LIKE '%,%';
