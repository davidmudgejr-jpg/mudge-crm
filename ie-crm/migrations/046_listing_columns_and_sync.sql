-- 046_listing_columns_and_sync.sql
-- Market intelligence on properties: rename rent_psf_mo, add listing columns, backfill from market_tracking

-- 1. Rename rent_psf_mo → listing_asking_lease_rate (instant, metadata-only)
ALTER TABLE properties RENAME COLUMN rent_psf_mo TO listing_asking_lease_rate;

-- 2. Add new listing columns
ALTER TABLE properties ADD COLUMN IF NOT EXISTS listing_status TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS listing_first_seen_date DATE;

-- 3. Backfill from most recent active market_tracking entry per property
--    Uses DISTINCT ON to pick the latest entry per property_id
UPDATE properties p
SET
  listing_status           = mt.market_status,
  listing_asking_lease_rate = COALESCE(mt.asking_lease_rate, p.listing_asking_lease_rate),
  for_sale_price           = COALESCE(mt.asking_price, p.for_sale_price),
  total_available_sf       = COALESCE(mt.available_sf, p.total_available_sf),
  listing_first_seen_date  = mt.first_seen_date
FROM (
  SELECT DISTINCT ON (property_id)
    property_id, market_status, asking_lease_rate, asking_price,
    available_sf, first_seen_date
  FROM market_tracking
  WHERE property_id IS NOT NULL
    AND outcome_type IS NULL
  ORDER BY property_id, last_air_sheet_date DESC NULLS LAST, created_at DESC
) mt
WHERE p.property_id = mt.property_id;

-- 4. Add deal_campaigns to junction tables if not exists (already created in 045, this is a safety net)
CREATE TABLE IF NOT EXISTS deal_campaigns (
  deal_id      UUID NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_deal_campaigns_deal     ON deal_campaigns(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_campaigns_campaign ON deal_campaigns(campaign_id);
