-- Migration 050: Campaigns with contact counts VIEW
-- Fixes campaigns page showing 0 contacts for all campaigns.
-- queryWithFilters('campaigns') now hits this view via TABLE_VIEW_MAP.

CREATE OR REPLACE VIEW campaigns_with_counts AS
SELECT c.*, COUNT(cc.contact_id)::int AS contact_count
FROM campaigns c
LEFT JOIN campaign_contacts cc ON c.campaign_id = cc.campaign_id
GROUP BY c.campaign_id;
