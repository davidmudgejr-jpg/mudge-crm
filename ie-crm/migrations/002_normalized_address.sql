-- Migration 002: Add normalized_address column for import matching
-- This column stores a pre-computed normalized version of property_address
-- for fast address-based matching during CSV imports.

-- Add the column
ALTER TABLE properties ADD COLUMN IF NOT EXISTS normalized_address TEXT;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_properties_normalized_address ON properties(normalized_address);

-- Backfill existing properties with normalized addresses
-- Uses the same normalization logic as server/utils/addressNormalizer.js:
--   lowercase, strip periods/commas, abbreviate street types, remove suite/unit suffixes
UPDATE properties
SET normalized_address = (
  SELECT TRIM(REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              LOWER(SPLIT_PART(property_address, ',', 1)),
              '[.,#]', ' ', 'g'
            ),
            '\s+', ' ', 'g'
          ),
          '\s+(suite|ste|unit|apt|apartment|bldg|building|fl|floor|rm|room)\s.*$', '', 'i'
        ),
        '\mstreet\M', 'st', 'gi'
      ),
      '\mavenue\M', 'ave', 'gi'
    ),
    '\mboulevard\M', 'blvd', 'gi'
  ))
)
WHERE property_address IS NOT NULL AND normalized_address IS NULL;

-- Create trigger function to auto-compute on insert/update
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
          '\mstreet\M', 'st', 'gi'
        ),
        '\mavenue\M', 'ave', 'gi'
      ),
      '\mboulevard\M', 'blvd', 'gi'
    ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it already exists, then create
DROP TRIGGER IF EXISTS trg_normalize_address ON properties;
CREATE TRIGGER trg_normalize_address
  BEFORE INSERT OR UPDATE OF property_address ON properties
  FOR EACH ROW
  EXECUTE FUNCTION compute_normalized_address();
