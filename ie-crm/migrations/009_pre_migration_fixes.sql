-- Migration 009: Pre-migration fixes for lease comp engine
-- 1. lease_comps.escalations NUMERIC → TEXT (CoStar sends "2.00%", "$0.03/sf/yr")
-- 2. property_companies PK adds role (allows same company as tenant + leasing on same property)
-- 3. normalized_address trigger aligned with JS normalizer (~20 abbreviations)

BEGIN;

-- 1. escalations: NUMERIC → TEXT
ALTER TABLE lease_comps ALTER COLUMN escalations TYPE TEXT;

-- 2. property_companies: expand PK to include role
-- MUST update NULLs and dedup BEFORE changing PK (NOT NULL constraint would fail otherwise)
UPDATE property_companies SET role = 'unknown' WHERE role IS NULL;
-- Remove duplicates that would collide under new composite PK (keep one)
DELETE FROM property_companies a USING property_companies b
  WHERE a.ctid < b.ctid
    AND a.property_id = b.property_id
    AND a.company_id = b.company_id
    AND a.role = b.role;
ALTER TABLE property_companies ALTER COLUMN role SET NOT NULL;
ALTER TABLE property_companies ALTER COLUMN role SET DEFAULT 'unknown';
ALTER TABLE property_companies DROP CONSTRAINT property_companies_pkey;
ALTER TABLE property_companies ADD PRIMARY KEY (property_id, company_id, role);

-- 3. Ensure normalized_address column + trigger exist and are aligned with JS normalizer
ALTER TABLE properties ADD COLUMN IF NOT EXISTS normalized_address TEXT;
CREATE INDEX IF NOT EXISTS idx_properties_normalized_address ON properties(normalized_address);
CREATE OR REPLACE FUNCTION compute_normalized_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.property_address IS NOT NULL THEN
    NEW.normalized_address := TRIM(REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                LOWER(SPLIT_PART(NEW.property_address, ',', 1)),
                '[.,#]', ' ', 'g'
              ),
              '\s+', ' ', 'g'
            ),
            '\s+(suite|ste|unit|apt|apartment|bldg|building|fl|floor|rm|room)\s.*$', '', 'i'
          ),
          '\m(street)\M', 'st', 'gi'
        ),
        '\m(avenue)\M', 'ave', 'gi'
      ),
      '\m(boulevard)\M', 'blvd', 'gi'
    ));
    -- Additional abbreviations via sequential replaces
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(drive)\M', 'dr', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(road)\M', 'rd', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(lane)\M', 'ln', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(circle)\M', 'cir', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(court)\M', 'ct', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(place)\M', 'pl', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(terrace)\M', 'ter', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(trail)\M', 'trl', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(parkway)\M', 'pkwy', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(highway)\M', 'hwy', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(freeway)\M', 'fwy', 'gi');
    -- Directional abbreviations
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(north)\M', 'n', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(south)\M', 's', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(east)\M', 'e', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(west)\M', 'w', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(northeast)\M', 'ne', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(northwest)\M', 'nw', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(southeast)\M', 'se', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(southwest)\M', 'sw', 'gi');
    -- Collapse whitespace one more time after all replacements
    NEW.normalized_address := TRIM(REGEXP_REPLACE(NEW.normalized_address, '\s+', ' ', 'g'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Install trigger
DROP TRIGGER IF EXISTS trg_normalize_address ON properties;
CREATE TRIGGER trg_normalize_address
  BEFORE INSERT OR UPDATE OF property_address ON properties
  FOR EACH ROW
  EXECUTE FUNCTION compute_normalized_address();

-- Re-normalize all existing properties with the updated trigger logic
UPDATE properties SET property_address = property_address WHERE property_address IS NOT NULL;

COMMIT;
