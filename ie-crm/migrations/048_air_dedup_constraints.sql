-- 048: Add UNIQUE constraints on air_entry_number to prevent AIR ingest duplicates
-- Root cause: dedup queries used air_sheet_date (changes daily) instead of air_entry_number

-- Lease comps: air_entry_number should be unique per record
-- (NOT unique alone — same entry number could appear across different AIR systems,
--  so we scope it to source='air_sheet')
CREATE UNIQUE INDEX IF NOT EXISTS idx_lease_comps_air_entry
  ON lease_comps (air_entry_number)
  WHERE air_entry_number IS NOT NULL AND source = 'air_sheet';

-- Sale comps: same pattern
CREATE UNIQUE INDEX IF NOT EXISTS idx_sale_comps_air_entry
  ON sale_comps (air_entry_number)
  WHERE air_entry_number IS NOT NULL;

-- Market tracking: unique per entry number + market status
-- (same property could have a for_lease AND for_sale entry with different air_entry_numbers)
CREATE UNIQUE INDEX IF NOT EXISTS idx_market_tracking_air_entry
  ON market_tracking (air_entry_number, market_status)
  WHERE air_entry_number IS NOT NULL AND first_seen_source = 'air_sheet';
