-- Migration 004: Add 7 missing columns referenced in Properties UI but absent from schema
-- The other 2 phantom columns (apn, asking_price) were key-name mismatches —
-- parcel_number and for_sale_price already exist. Those are fixed in the UI only.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS units              INT,
  ADD COLUMN IF NOT EXISTS stories            INT,
  ADD COLUMN IF NOT EXISTS parking_spaces     INT,
  ADD COLUMN IF NOT EXISTS price_per_sqft     NUMERIC,
  ADD COLUMN IF NOT EXISTS noi                NUMERIC,
  ADD COLUMN IF NOT EXISTS owner_email        TEXT,
  ADD COLUMN IF NOT EXISTS owner_mailing_address TEXT;
