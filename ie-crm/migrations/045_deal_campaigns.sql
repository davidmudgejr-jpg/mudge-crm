-- 045_deal_campaigns.sql
-- Junction table linking deals to campaigns for email campaign tracking.
-- Follows same pattern as deal_contacts, deal_properties, deal_companies.

CREATE TABLE IF NOT EXISTS deal_campaigns (
  deal_id      UUID NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
  campaign_id  UUID NOT NULL REFERENCES campaigns(campaign_id) ON DELETE CASCADE,
  PRIMARY KEY (deal_id, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_campaigns_deal     ON deal_campaigns(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_campaigns_campaign ON deal_campaigns(campaign_id);

-- Drop the simple text column if it exists (replaced by junction table)
ALTER TABLE deals DROP COLUMN IF EXISTS email_campaign;
