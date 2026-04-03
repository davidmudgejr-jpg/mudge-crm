-- Performance indexes based on pg_stat_user_tables audit
-- Tables with high seq_scan counts and low/zero index usage

-- chat_messages: 91K seq scans, 9.4% index usage
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_id ON chat_messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);
-- action_items: 7.4K seq scans, 1.1% index usage
CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
CREATE INDEX IF NOT EXISTS idx_action_items_due_date ON action_items(due_date);

-- action_item_companies: 7.9K seq scans, 0.6% index usage
CREATE INDEX IF NOT EXISTS idx_action_item_companies_action_item_id ON action_item_companies(action_item_id);
CREATE INDEX IF NOT EXISTS idx_action_item_companies_company_id ON action_item_companies(company_id);

-- action_item_contacts: low index usage
CREATE INDEX IF NOT EXISTS idx_action_item_contacts_action_item_id ON action_item_contacts(action_item_id);
CREATE INDEX IF NOT EXISTS idx_action_item_contacts_contact_id ON action_item_contacts(contact_id);

-- action_item_properties: low index usage
CREATE INDEX IF NOT EXISTS idx_action_item_properties_action_item_id ON action_item_properties(action_item_id);
CREATE INDEX IF NOT EXISTS idx_action_item_properties_property_id ON action_item_properties(property_id);

-- action_item_deals: low index usage
CREATE INDEX IF NOT EXISTS idx_action_item_deals_action_item_id ON action_item_deals(action_item_id);
CREATE INDEX IF NOT EXISTS idx_action_item_deals_deal_id ON action_item_deals(deal_id);

-- outbound_email_queue: 3.9K seq scans, 0% index usage
CREATE INDEX IF NOT EXISTS idx_outbound_email_queue_status ON outbound_email_queue(status);

-- deal_companies: 9.4K seq scans, 10.5% index usage
CREATE INDEX IF NOT EXISTS idx_deal_companies_deal_id ON deal_companies(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_companies_company_id ON deal_companies(company_id);

-- deal_contacts: 3K seq scans
CREATE INDEX IF NOT EXISTS idx_deal_contacts_deal_id ON deal_contacts(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_contacts_contact_id ON deal_contacts(contact_id);

-- deal_properties: 5.3K seq scans
CREATE INDEX IF NOT EXISTS idx_deal_properties_deal_id ON deal_properties(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_properties_property_id ON deal_properties(property_id);

-- tenant_growth: 7.4K seq scans, 7.9% index usage
CREATE INDEX IF NOT EXISTS idx_tenant_growth_company_id ON tenant_growth(company_id);

-- campaigns: 4.5K seq scans, 20.8% index usage
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- campaign_contacts junction
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_campaign_id ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_contact_id ON campaign_contacts(contact_id);

-- interaction junction tables
CREATE INDEX IF NOT EXISTS idx_interaction_contacts_interaction_id ON interaction_contacts(interaction_id);
CREATE INDEX IF NOT EXISTS idx_interaction_contacts_contact_id ON interaction_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_interaction_companies_interaction_id ON interaction_companies(interaction_id);
CREATE INDEX IF NOT EXISTS idx_interaction_companies_company_id ON interaction_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_interaction_deals_interaction_id ON interaction_deals(interaction_id);
CREATE INDEX IF NOT EXISTS idx_interaction_deals_deal_id ON interaction_deals(deal_id);
CREATE INDEX IF NOT EXISTS idx_interaction_properties_interaction_id ON interaction_properties(interaction_id);
CREATE INDEX IF NOT EXISTS idx_interaction_properties_property_id ON interaction_properties(property_id);

-- Run VACUUM ANALYZE on tables with high dead tuple ratios
VACUUM ANALYZE users;
VACUUM ANALYZE saved_views;
VACUUM ANALYZE campaigns;
VACUUM ANALYZE deals;
VACUUM ANALYZE interaction_companies;
VACUUM ANALYZE action_items;
