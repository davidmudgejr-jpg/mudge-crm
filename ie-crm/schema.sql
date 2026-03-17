-- IE CRM Schema (auto-generated from live Neon DB)
-- Generated: 2026-03-17
-- Reflects migrations 001-018

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---- action_item_companies ----
CREATE TABLE IF NOT EXISTS action_item_companies (
  action_item_id UUID NOT NULL,
  company_id UUID NOT NULL
);

-- ---- action_item_contacts ----
CREATE TABLE IF NOT EXISTS action_item_contacts (
  action_item_id UUID NOT NULL,
  contact_id UUID NOT NULL
);

-- ---- action_item_deals ----
CREATE TABLE IF NOT EXISTS action_item_deals (
  action_item_id UUID NOT NULL,
  deal_id UUID NOT NULL
);

-- ---- action_item_properties ----
CREATE TABLE IF NOT EXISTS action_item_properties (
  action_item_id UUID NOT NULL,
  property_id UUID NOT NULL
);

-- ---- action_items ----
CREATE TABLE IF NOT EXISTS action_items (
  action_item_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  notes_on_date TEXT,
  responsibility TEXT[],
  high_priority BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'Todo'::text,
  due_date DATE,
  date_completed TIMESTAMP,
  source TEXT DEFAULT 'manual'::text,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ---- agent_escalations ----
CREATE TABLE IF NOT EXISTS agent_escalations (
  id INTEGER DEFAULT nextval('agent_escalations_id_seq'::regclass) NOT NULL,
  sandbox_table TEXT NOT NULL,
  sandbox_id INTEGER NOT NULL,
  escalated_by TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal'::text NOT NULL,
  reason TEXT NOT NULL,
  recommendation TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  decision TEXT,
  decision_reasoning TEXT,
  action_taken TEXT,
  instruction_update TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---- agent_heartbeats ----
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id INTEGER DEFAULT nextval('agent_heartbeats_id_seq'::regclass) NOT NULL,
  agent_name TEXT NOT NULL,
  tier INTEGER NOT NULL,
  status TEXT DEFAULT 'idle'::text NOT NULL,
  current_task TEXT,
  items_processed_today INTEGER DEFAULT 0,
  items_in_queue INTEGER DEFAULT 0,
  last_error TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---- agent_logs ----
CREATE TABLE IF NOT EXISTS agent_logs (
  id INTEGER DEFAULT nextval('agent_logs_id_seq'::regclass) NOT NULL,
  agent_name TEXT NOT NULL,
  log_type TEXT DEFAULT 'activity'::text NOT NULL,
  content TEXT NOT NULL,
  metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---- agent_priority_board ----
CREATE TABLE IF NOT EXISTS agent_priority_board (
  id INTEGER DEFAULT nextval('agent_priority_board_id_seq'::regclass) NOT NULL,
  source_agent TEXT NOT NULL,
  source_context TEXT,
  target_agent TEXT NOT NULL,
  priority_type TEXT NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb NOT NULL,
  reason TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal'::text NOT NULL,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  picked_up_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_notes TEXT,
  expires_at TIMESTAMPTZ DEFAULT (now() + '72:00:00'::interval),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---- ai_api_keys ----
CREATE TABLE IF NOT EXISTS ai_api_keys (
  id INTEGER DEFAULT nextval('ai_api_keys_id_seq'::regclass) NOT NULL,
  agent_name TEXT NOT NULL,
  api_key TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  tier INTEGER NOT NULL,
  permissions TEXT[] DEFAULT '{}'::text[] NOT NULL,
  active BOOLEAN DEFAULT true NOT NULL,
  last_used_at TIMESTAMPTZ,
  rate_limit_per_minute INTEGER DEFAULT 60,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---- ai_usage_tracking ----
CREATE TABLE IF NOT EXISTS ai_usage_tracking (
  id INTEGER DEFAULT nextval('ai_usage_tracking_id_seq'::regclass) NOT NULL,
  service TEXT NOT NULL,
  agent_name TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_cost NUMERIC,
  contact_id UUID,
  deal_id UUID,
  property_id UUID,
  request_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---- app_settings ----
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT now()
);

-- ---- campaign_contacts ----
CREATE TABLE IF NOT EXISTS campaign_contacts (
  campaign_id UUID NOT NULL,
  contact_id UUID NOT NULL
);

-- ---- campaigns ----
CREATE TABLE IF NOT EXISTS campaigns (
  campaign_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  airtable_id TEXT,
  name TEXT,
  type TEXT,
  status TEXT,
  notes TEXT,
  sent_date DATE,
  modified TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now(),
  overflow JSONB DEFAULT '{}'::jsonb,
  assignee TEXT,
  day_time_hits TEXT
);

-- ---- companies ----
CREATE TABLE IF NOT EXISTS companies (
  company_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  airtable_id TEXT,
  company_name TEXT,
  company_type TEXT,
  industry_type TEXT,
  website TEXT,
  sf NUMERIC,
  employees INTEGER,
  revenue NUMERIC,
  company_growth TEXT,
  company_hq TEXT,
  lease_exp DATE,
  lease_months_left INTEGER,
  move_in_date DATE,
  notes TEXT,
  city TEXT,
  modified TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now(),
  tags TEXT[],
  overflow JSONB DEFAULT '{}'::jsonb,
  tenant_sic TEXT,
  tenant_naics TEXT,
  suite TEXT
);

-- ---- contact_companies ----
CREATE TABLE IF NOT EXISTS contact_companies (
  contact_id UUID NOT NULL,
  company_id UUID NOT NULL
);

-- ---- contacts ----
CREATE TABLE IF NOT EXISTS contacts (
  contact_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  airtable_id TEXT,
  full_name TEXT,
  first_name TEXT,
  type TEXT,
  title TEXT,
  email TEXT,
  email_2 TEXT,
  email_3 TEXT,
  phone_1 TEXT,
  phone_2 TEXT,
  phone_3 TEXT,
  phone_hot BOOLEAN,
  email_hot BOOLEAN,
  home_address TEXT,
  work_address TEXT,
  work_city TEXT,
  work_state TEXT,
  work_zip TEXT,
  born DATE,
  age INTEGER,
  client_level TEXT,
  active_need TEXT,
  notes TEXT,
  linkedin TEXT,
  follow_up DATE,
  last_contacted DATE,
  data_source TEXT,
  created_at TIMESTAMP DEFAULT now(),
  modified TIMESTAMP DEFAULT now(),
  tags TEXT[],
  overflow JSONB DEFAULT '{}'::jsonb,
  email_kickback BOOLEAN DEFAULT false,
  white_pages_url TEXT,
  been_verified_url TEXT,
  zoom_info_url TEXT,
  property_type_interest TEXT,
  lease_months_left INTEGER,
  tenant_space_fit TEXT,
  tenant_ownership_intent TEXT,
  business_trajectory TEXT,
  last_call_outcome TEXT,
  follow_up_behavior TEXT,
  decision_authority TEXT,
  price_cost_awareness TEXT,
  frustration_signals TEXT,
  exit_trigger_events TEXT,
  do_not_email BOOLEAN DEFAULT false,
  do_not_email_reason TEXT,
  do_not_email_at TIMESTAMPTZ,
  date_of_birth DATE
);

-- ---- deal_companies ----
CREATE TABLE IF NOT EXISTS deal_companies (
  deal_id UUID NOT NULL,
  company_id UUID NOT NULL
);

-- ---- deal_contacts ----
CREATE TABLE IF NOT EXISTS deal_contacts (
  deal_id UUID NOT NULL,
  contact_id UUID NOT NULL
);

-- ---- deal_properties ----
CREATE TABLE IF NOT EXISTS deal_properties (
  deal_id UUID NOT NULL,
  property_id UUID NOT NULL
);

-- ---- deals ----
CREATE TABLE IF NOT EXISTS deals (
  deal_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  airtable_id TEXT,
  deal_name TEXT,
  deal_type TEXT,
  deal_source TEXT[],
  status TEXT,
  repping TEXT[],
  term INTEGER,
  rate NUMERIC,
  sf NUMERIC,
  price NUMERIC,
  commission_rate NUMERIC,
  gross_fee_potential NUMERIC,
  net_potential NUMERIC,
  close_date DATE,
  important_date TIMESTAMP,
  deal_dead_reason TEXT[],
  notes TEXT,
  priority_deal BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  modified TIMESTAMP DEFAULT now(),
  overflow JSONB DEFAULT '{}'::jsonb,
  increases NUMERIC,
  escrow_url TEXT,
  surveys_brochures_url TEXT,
  run_by TEXT[],
  other_broker TEXT,
  industry TEXT,
  deadline DATE,
  fell_through_reason TEXT
);

-- ---- debt_stress ----
CREATE TABLE IF NOT EXISTS debt_stress (
  id UUID DEFAULT uuid_generate_v4() NOT NULL,
  property_id UUID,
  lender TEXT,
  loan_type TEXT,
  interest_rate NUMERIC,
  rate_type TEXT,
  origination_date DATE,
  origination_amount NUMERIC,
  balloon_5yr DATE,
  balloon_7yr DATE,
  balloon_10yr DATE,
  balloon_confidence TEXT,
  notes TEXT,
  source TEXT DEFAULT 'Manual'::text,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  months_to_5yr INTEGER,
  months_to_7yr INTEGER,
  months_to_10yr INTEGER
);

-- ---- formula_columns ----
CREATE TABLE IF NOT EXISTS formula_columns (
  formula_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  display_name TEXT,
  expression TEXT NOT NULL,
  column_type TEXT DEFAULT 'text'::text,
  created_by TEXT DEFAULT 'Claude'::text,
  created_at TIMESTAMP DEFAULT now()
);

-- ---- interaction_companies ----
CREATE TABLE IF NOT EXISTS interaction_companies (
  interaction_id UUID NOT NULL,
  company_id UUID NOT NULL
);

-- ---- interaction_contacts ----
CREATE TABLE IF NOT EXISTS interaction_contacts (
  interaction_id UUID NOT NULL,
  contact_id UUID NOT NULL
);

-- ---- interaction_deals ----
CREATE TABLE IF NOT EXISTS interaction_deals (
  interaction_id UUID NOT NULL,
  deal_id UUID NOT NULL
);

-- ---- interaction_properties ----
CREATE TABLE IF NOT EXISTS interaction_properties (
  interaction_id UUID NOT NULL,
  property_id UUID NOT NULL
);

-- ---- interactions ----
CREATE TABLE IF NOT EXISTS interactions (
  interaction_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  airtable_id TEXT,
  type TEXT,
  subject TEXT,
  date TIMESTAMP,
  notes TEXT,
  email_heading TEXT,
  email_body TEXT,
  follow_up DATE,
  follow_up_notes TEXT,
  lead_source TEXT,
  team_member TEXT,
  created_at TIMESTAMP DEFAULT now(),
  overflow JSONB DEFAULT '{}'::jsonb,
  email_url TEXT,
  email_id TEXT,
  lead_status TEXT,
  lead_interest TEXT
);

-- ---- lease_comps ----
CREATE TABLE IF NOT EXISTS lease_comps (
  id UUID DEFAULT uuid_generate_v4() NOT NULL,
  property_id UUID,
  company_id UUID,
  tenant_name TEXT,
  property_type TEXT,
  space_use TEXT,
  space_type TEXT,
  sf NUMERIC,
  building_rba NUMERIC,
  floor_suite TEXT,
  sign_date DATE,
  commencement_date DATE,
  move_in_date DATE,
  expiration_date DATE,
  term_months INTEGER,
  rate NUMERIC,
  escalations TEXT,
  rent_type TEXT,
  lease_type TEXT,
  concessions TEXT,
  free_rent_months NUMERIC,
  ti_psf NUMERIC,
  tenant_rep_company TEXT,
  tenant_rep_agents TEXT,
  landlord_rep_company TEXT,
  landlord_rep_agents TEXT,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  cam_expenses NUMERIC,
  zoning TEXT,
  doors_with_lease INTEGER
);

-- ---- loan_maturities ----
CREATE TABLE IF NOT EXISTS loan_maturities (
  id UUID DEFAULT uuid_generate_v4() NOT NULL,
  property_id UUID,
  lender TEXT,
  loan_amount NUMERIC,
  maturity_date DATE,
  ltv NUMERIC,
  loan_purpose TEXT,
  loan_duration_years INTEGER,
  interest_rate NUMERIC,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  loan_type TEXT,
  rate_type TEXT,
  months_past_due NUMERIC,
  origination_date DATE,
  est_value NUMERIC,
  portfolio TEXT
);

-- ---- notes ----
CREATE TABLE IF NOT EXISTS notes (
  note_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  content TEXT NOT NULL,
  contact_id UUID,
  company_id UUID,
  property_id UUID,
  deal_id UUID,
  created_at TIMESTAMP DEFAULT now()
);

-- ---- outbound_email_queue ----
CREATE TABLE IF NOT EXISTS outbound_email_queue (
  id INTEGER DEFAULT nextval('outbound_email_queue_id_seq'::regclass) NOT NULL,
  sandbox_outreach_id INTEGER,
  to_email TEXT NOT NULL,
  to_name TEXT,
  from_email TEXT DEFAULT 'david@mudgeteamcre.com'::text NOT NULL,
  from_name TEXT DEFAULT 'David Mudge'::text NOT NULL,
  reply_to TEXT DEFAULT 'david@mudgeteamcre.com'::text NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  status TEXT DEFAULT 'queued'::text NOT NULL,
  scheduled_for TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  postmark_message_id TEXT,
  postmark_error TEXT,
  opened_at TIMESTAMPTZ,
  opened_count INTEGER DEFAULT 0,
  clicked_at TIMESTAMPTZ,
  clicked_count INTEGER DEFAULT 0,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_type TEXT,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---- playing_with_neon ----
CREATE TABLE IF NOT EXISTS playing_with_neon (
  id INTEGER DEFAULT nextval('playing_with_neon_id_seq'::regclass) NOT NULL,
  name TEXT NOT NULL,
  value REAL
);

-- ---- properties ----
CREATE TABLE IF NOT EXISTS properties (
  property_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  airtable_id TEXT,
  property_address TEXT,
  property_name TEXT,
  city TEXT,
  county TEXT,
  state TEXT DEFAULT 'CA'::text,
  zip TEXT,
  rba NUMERIC,
  land_area_ac NUMERIC,
  land_sf NUMERIC,
  far NUMERIC,
  property_type TEXT,
  building_class TEXT,
  building_status TEXT,
  year_built INTEGER,
  year_renovated INTEGER,
  ceiling_ht NUMERIC,
  clear_ht NUMERIC,
  number_of_loading_docks INTEGER,
  drive_ins INTEGER,
  column_spacing TEXT,
  sprinklers TEXT,
  power TEXT,
  construction_material TEXT,
  zoning TEXT,
  features TEXT,
  last_sale_date DATE,
  last_sale_price NUMERIC,
  price_psf NUMERIC,
  plsf NUMERIC,
  loan_amount NUMERIC,
  debt_date DATE,
  holding_period_years NUMERIC,
  rent_psf_mo NUMERIC,
  cap_rate NUMERIC,
  vacancy_pct NUMERIC,
  percent_leased NUMERIC,
  owner_name TEXT,
  owner_phone TEXT,
  owner_address TEXT,
  owner_city_state_zip TEXT,
  recorded_owner_name TEXT,
  true_owner_name TEXT,
  contacted TEXT[],
  priority TEXT,
  off_market_deal BOOLEAN DEFAULT false,
  target TEXT,
  target_for TEXT,
  building_park TEXT,
  market_name TEXT,
  submarket_name TEXT,
  submarket_cluster TEXT,
  tenancy TEXT,
  lease_type TEXT,
  notes TEXT,
  costar_url TEXT,
  num_properties_owned INTEGER,
  data_confirmed BOOLEAN DEFAULT false,
  last_modified TIMESTAMP DEFAULT now(),
  created_at TIMESTAMP DEFAULT now(),
  tags TEXT[],
  overflow JSONB DEFAULT '{}'::jsonb,
  parking_ratio NUMERIC,
  owner_type TEXT,
  owner_contact TEXT,
  building_tax TEXT,
  building_opex TEXT,
  leasing_company TEXT,
  broker_contact TEXT,
  for_sale_price NUMERIC,
  ops_expense_psf NUMERIC,
  sewer TEXT,
  water TEXT,
  gas TEXT,
  heating TEXT,
  total_available_sf NUMERIC,
  direct_available_sf NUMERIC,
  direct_vacant_space NUMERIC,
  number_of_cranes INTEGER,
  rail_lines TEXT,
  parcel_number TEXT,
  landvision_url TEXT,
  sb_county_zoning TEXT,
  google_maps_url TEXT,
  zoning_map_url TEXT,
  listing_url TEXT,
  avg_weighted_rent NUMERIC,
  building_image_path TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  owner_user_or_investor TEXT,
  out_of_area_owner BOOLEAN DEFAULT false,
  office_courtesy BOOLEAN DEFAULT false,
  units INTEGER,
  stories INTEGER,
  parking_spaces INTEGER,
  price_per_sqft NUMERIC,
  noi NUMERIC,
  owner_email TEXT,
  owner_mailing_address TEXT,
  owner_entity_type TEXT,
  owner_call_status TEXT,
  tenant_call_status TEXT,
  has_lien_or_delinquency BOOLEAN DEFAULT false,
  costar_star_rating INTEGER,
  normalized_address TEXT
);

-- ---- property_companies ----
CREATE TABLE IF NOT EXISTS property_companies (
  property_id UUID NOT NULL,
  company_id UUID NOT NULL,
  role TEXT DEFAULT 'unknown'::text NOT NULL
);

-- ---- property_contacts ----
CREATE TABLE IF NOT EXISTS property_contacts (
  property_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  role TEXT DEFAULT 'unknown'::text NOT NULL
);

-- ---- property_distress ----
CREATE TABLE IF NOT EXISTS property_distress (
  id UUID DEFAULT uuid_generate_v4() NOT NULL,
  property_id UUID,
  distress_type TEXT,
  filing_date DATE,
  amount NUMERIC,
  trustee TEXT,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  auction_date DATE,
  opening_bid NUMERIC,
  default_amount NUMERIC,
  delinquent_tax_year INTEGER,
  delinquent_tax_amount NUMERIC,
  owner_type TEXT
);

-- ---- sale_comps ----
CREATE TABLE IF NOT EXISTS sale_comps (
  id UUID DEFAULT uuid_generate_v4() NOT NULL,
  property_id UUID,
  sale_date DATE,
  sale_price NUMERIC,
  price_psf NUMERIC,
  price_plsf NUMERIC,
  cap_rate NUMERIC,
  sf NUMERIC,
  land_sf NUMERIC,
  buyer_name TEXT,
  seller_name TEXT,
  property_type TEXT,
  notes TEXT,
  source TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ---- sandbox_contacts ----
CREATE TABLE IF NOT EXISTS sandbox_contacts (
  id INTEGER DEFAULT nextval('sandbox_contacts_id_seq'::regclass) NOT NULL,
  full_name TEXT,
  first_name TEXT,
  email TEXT,
  email_2 TEXT,
  email_3 TEXT,
  phone_1 TEXT,
  phone_2 TEXT,
  phone_3 TEXT,
  home_address TEXT,
  work_address TEXT,
  work_city TEXT,
  work_state TEXT,
  work_zip TEXT,
  title TEXT,
  type TEXT,
  company_name TEXT,
  linkedin TEXT,
  data_source TEXT,
  agent_name TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0,
  sources TEXT[],
  source_urls JSONB DEFAULT '{}'::jsonb,
  notes TEXT,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  promoted_at TIMESTAMPTZ,
  promoted_to_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---- sandbox_enrichments ----
CREATE TABLE IF NOT EXISTS sandbox_enrichments (
  id INTEGER DEFAULT nextval('sandbox_enrichments_id_seq'::regclass) NOT NULL,
  contact_id UUID,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0,
  source TEXT,
  source_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---- sandbox_outreach ----
CREATE TABLE IF NOT EXISTS sandbox_outreach (
  id INTEGER DEFAULT nextval('sandbox_outreach_id_seq'::regclass) NOT NULL,
  contact_id UUID,
  contact_name TEXT,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  property_address TEXT,
  property_details JSONB DEFAULT '{}'::jsonb,
  match_reason TEXT,
  air_report_source TEXT,
  dedup_key TEXT,
  agent_name TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---- sandbox_signals ----
CREATE TABLE IF NOT EXISTS sandbox_signals (
  id INTEGER DEFAULT nextval('sandbox_signals_id_seq'::regclass) NOT NULL,
  signal_type TEXT NOT NULL,
  headline TEXT NOT NULL,
  details TEXT,
  source_url TEXT,
  source_name TEXT,
  companies_mentioned TEXT[],
  properties_mentioned TEXT[],
  crm_company_ids ARRAY,
  crm_property_ids ARRAY,
  crm_match BOOLEAN DEFAULT false,
  relevance TEXT DEFAULT 'medium'::text,
  agent_name TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0,
  notes TEXT,
  status TEXT DEFAULT 'pending'::text NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  promoted_at TIMESTAMPTZ,
  promoted_interaction_id UUID,
  promoted_action_item_id UUID,
  timestamp_found TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---- saved_views ----
CREATE TABLE IF NOT EXISTS saved_views (
  view_id UUID DEFAULT gen_random_uuid() NOT NULL,
  entity_type TEXT NOT NULL,
  view_name TEXT NOT NULL,
  filters JSONB DEFAULT '[]'::jsonb NOT NULL,
  filter_logic TEXT DEFAULT 'AND'::text NOT NULL,
  sort_column TEXT,
  sort_direction TEXT DEFAULT 'DESC'::text,
  visible_columns JSONB,
  is_default BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ---- tenant_growth ----
CREATE TABLE IF NOT EXISTS tenant_growth (
  id UUID DEFAULT uuid_generate_v4() NOT NULL,
  company_id UUID,
  headcount_current INTEGER,
  headcount_previous INTEGER,
  growth_rate NUMERIC,
  revenue_current NUMERIC,
  revenue_previous NUMERIC,
  data_date DATE,
  source TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  property_id UUID,
  sf_occupied INTEGER,
  sf_per_employee NUMERIC,
  occupancy_type TEXT,
  time_in_building TEXT,
  growth_score INTEGER,
  industry TEXT,
  best_contact TEXT
);

-- ---- tpe_config ----
CREATE TABLE IF NOT EXISTS tpe_config (
  id INTEGER DEFAULT nextval('tpe_config_id_seq'::regclass) NOT NULL,
  config_category TEXT NOT NULL,
  config_key TEXT NOT NULL,
  config_value NUMERIC NOT NULL,
  description TEXT
);

-- ---- undo_log ----
CREATE TABLE IF NOT EXISTS undo_log (
  undo_id UUID DEFAULT uuid_generate_v4() NOT NULL,
  action_description TEXT,
  sql_executed TEXT,
  reverse_sql TEXT,
  rows_affected INTEGER,
  executed_at TIMESTAMP DEFAULT now(),
  undone BOOLEAN DEFAULT false
);

-- ---- Indexes ----
CREATE INDEX idx_action_items_due_date ON public.action_items USING btree (due_date);
CREATE INDEX idx_action_items_high_priority ON public.action_items USING btree (high_priority) WHERE (high_priority = true);
CREATE INDEX idx_action_items_responsibility ON public.action_items USING gin (responsibility);
CREATE INDEX idx_action_items_source ON public.action_items USING btree (source);
CREATE INDEX idx_action_items_status ON public.action_items USING btree (status);
CREATE INDEX idx_escalations_created ON public.agent_escalations USING btree (created_at);
CREATE INDEX idx_escalations_status ON public.agent_escalations USING btree (status);
CREATE INDEX idx_escalations_urgency ON public.agent_escalations USING btree (urgency, status);
CREATE UNIQUE INDEX idx_agent_heartbeats_name ON public.agent_heartbeats USING btree (agent_name);
CREATE INDEX idx_agent_heartbeats_status ON public.agent_heartbeats USING btree (status);
CREATE INDEX idx_agent_logs_agent ON public.agent_logs USING btree (agent_name);
CREATE INDEX idx_agent_logs_created ON public.agent_logs USING btree (created_at);
CREATE INDEX idx_agent_logs_type ON public.agent_logs USING btree (log_type);
CREATE INDEX idx_priority_board_created ON public.agent_priority_board USING btree (created_at);
CREATE INDEX idx_priority_board_expires ON public.agent_priority_board USING btree (expires_at);
CREATE INDEX idx_priority_board_target ON public.agent_priority_board USING btree (target_agent, status);
CREATE INDEX idx_priority_board_urgency ON public.agent_priority_board USING btree (urgency, status);
CREATE UNIQUE INDEX ai_api_keys_api_key_key ON public.ai_api_keys USING btree (api_key);
CREATE INDEX idx_ai_api_keys_active ON public.ai_api_keys USING btree (active);
CREATE INDEX idx_ai_api_keys_agent ON public.ai_api_keys USING btree (agent_name);
CREATE UNIQUE INDEX idx_ai_api_keys_key ON public.ai_api_keys USING btree (api_key);
CREATE INDEX idx_ai_usage_agent ON public.ai_usage_tracking USING btree (agent_name);
CREATE INDEX idx_ai_usage_cost ON public.ai_usage_tracking USING btree (total_cost);
CREATE INDEX idx_ai_usage_created ON public.ai_usage_tracking USING btree (created_at);
CREATE INDEX idx_ai_usage_service ON public.ai_usage_tracking USING btree (service);
CREATE INDEX idx_companies_airtable_id ON public.companies USING btree (airtable_id);
CREATE INDEX idx_companies_name ON public.companies USING btree (company_name);
CREATE INDEX idx_contacts_airtable_id ON public.contacts USING btree (airtable_id);
CREATE INDEX idx_contacts_do_not_email ON public.contacts USING btree (do_not_email) WHERE (do_not_email = true);
CREATE INDEX idx_contacts_full_name ON public.contacts USING btree (full_name);
CREATE INDEX idx_contacts_tags ON public.contacts USING gin (tags);
CREATE INDEX idx_contacts_type ON public.contacts USING btree (type);
CREATE INDEX idx_deals_airtable_id ON public.deals USING btree (airtable_id);
CREATE INDEX idx_deals_status ON public.deals USING btree (status);
CREATE INDEX idx_debt_stress_balloon_10yr ON public.debt_stress USING btree (balloon_10yr);
CREATE INDEX idx_debt_stress_balloon_5yr ON public.debt_stress USING btree (balloon_5yr);
CREATE INDEX idx_debt_stress_balloon_7yr ON public.debt_stress USING btree (balloon_7yr);
CREATE INDEX idx_debt_stress_confidence ON public.debt_stress USING btree (balloon_confidence);
CREATE INDEX idx_debt_stress_property ON public.debt_stress USING btree (property_id);
CREATE UNIQUE INDEX formula_columns_table_name_column_name_key ON public.formula_columns USING btree (table_name, column_name);
CREATE INDEX idx_interactions_airtable_id ON public.interactions USING btree (airtable_id);
CREATE INDEX idx_interactions_date ON public.interactions USING btree (date);
CREATE INDEX idx_interactions_lead_type ON public.interactions USING btree (type) WHERE (type = 'Lead'::text);
CREATE INDEX idx_interactions_type ON public.interactions USING btree (type);
CREATE INDEX idx_lease_comps_commencement ON public.lease_comps USING btree (commencement_date);
CREATE INDEX idx_lease_comps_company ON public.lease_comps USING btree (company_id);
CREATE INDEX idx_lease_comps_expiration ON public.lease_comps USING btree (expiration_date);
CREATE INDEX idx_lease_comps_property ON public.lease_comps USING btree (property_id);
CREATE INDEX idx_lease_comps_sf ON public.lease_comps USING btree (sf);
CREATE INDEX idx_loan_maturities_maturity ON public.loan_maturities USING btree (maturity_date);
CREATE INDEX idx_loan_maturities_maturity_date ON public.loan_maturities USING btree (maturity_date);
CREATE INDEX idx_loan_maturities_property ON public.loan_maturities USING btree (property_id);
CREATE INDEX idx_notes_company ON public.notes USING btree (company_id) WHERE (company_id IS NOT NULL);
CREATE INDEX idx_notes_contact ON public.notes USING btree (contact_id) WHERE (contact_id IS NOT NULL);
CREATE INDEX idx_notes_created ON public.notes USING btree (created_at DESC);
CREATE INDEX idx_notes_deal ON public.notes USING btree (deal_id) WHERE (deal_id IS NOT NULL);
CREATE INDEX idx_notes_property ON public.notes USING btree (property_id) WHERE (property_id IS NOT NULL);
CREATE INDEX idx_email_queue_postmark ON public.outbound_email_queue USING btree (postmark_message_id);
CREATE INDEX idx_email_queue_sandbox ON public.outbound_email_queue USING btree (sandbox_outreach_id);
CREATE INDEX idx_email_queue_scheduled ON public.outbound_email_queue USING btree (scheduled_for);
CREATE INDEX idx_email_queue_status ON public.outbound_email_queue USING btree (status);
CREATE INDEX idx_properties_airtable_id ON public.properties USING btree (airtable_id);
CREATE INDEX idx_properties_city ON public.properties USING btree (city);
CREATE INDEX idx_properties_county ON public.properties USING btree (county);
CREATE INDEX idx_properties_normalized_address ON public.properties USING btree (normalized_address);
CREATE INDEX idx_properties_priority ON public.properties USING btree (priority);
CREATE INDEX idx_properties_property_type ON public.properties USING btree (property_type);
CREATE INDEX idx_properties_tags ON public.properties USING gin (tags);
CREATE INDEX idx_property_distress_property ON public.property_distress USING btree (property_id);
CREATE INDEX idx_property_distress_type ON public.property_distress USING btree (distress_type);
CREATE INDEX idx_sale_comps_property ON public.sale_comps USING btree (property_id);
CREATE INDEX idx_sale_comps_sale_date ON public.sale_comps USING btree (sale_date);
CREATE INDEX idx_sale_comps_sf ON public.sale_comps USING btree (sf);
CREATE INDEX idx_sandbox_contacts_agent ON public.sandbox_contacts USING btree (agent_name);
CREATE INDEX idx_sandbox_contacts_confidence ON public.sandbox_contacts USING btree (confidence_score);
CREATE INDEX idx_sandbox_contacts_created ON public.sandbox_contacts USING btree (created_at);
CREATE INDEX idx_sandbox_contacts_status ON public.sandbox_contacts USING btree (status);
CREATE INDEX idx_sandbox_enrichments_agent ON public.sandbox_enrichments USING btree (agent_name);
CREATE INDEX idx_sandbox_enrichments_contact ON public.sandbox_enrichments USING btree (contact_id);
CREATE INDEX idx_sandbox_enrichments_created ON public.sandbox_enrichments USING btree (created_at);
CREATE INDEX idx_sandbox_enrichments_status ON public.sandbox_enrichments USING btree (status);
CREATE INDEX idx_sandbox_outreach_agent ON public.sandbox_outreach USING btree (agent_name);
CREATE INDEX idx_sandbox_outreach_contact ON public.sandbox_outreach USING btree (contact_id);
CREATE INDEX idx_sandbox_outreach_created ON public.sandbox_outreach USING btree (created_at);
CREATE INDEX idx_sandbox_outreach_dedup ON public.sandbox_outreach USING btree (dedup_key);
CREATE INDEX idx_sandbox_outreach_status ON public.sandbox_outreach USING btree (status);
CREATE INDEX idx_sandbox_signals_agent ON public.sandbox_signals USING btree (agent_name);
CREATE INDEX idx_sandbox_signals_created ON public.sandbox_signals USING btree (created_at);
CREATE INDEX idx_sandbox_signals_crm_match ON public.sandbox_signals USING btree (crm_match);
CREATE INDEX idx_sandbox_signals_relevance ON public.sandbox_signals USING btree (relevance);
CREATE INDEX idx_sandbox_signals_status ON public.sandbox_signals USING btree (status);
CREATE INDEX idx_sandbox_signals_type ON public.sandbox_signals USING btree (signal_type);
CREATE INDEX idx_saved_views_entity ON public.saved_views USING btree (entity_type, "position");
CREATE UNIQUE INDEX idx_saved_views_one_default_per_entity ON public.saved_views USING btree (entity_type) WHERE (is_default = true);
CREATE INDEX idx_tenant_growth_company ON public.tenant_growth USING btree (company_id);
CREATE INDEX idx_tenant_growth_date ON public.tenant_growth USING btree (data_date);
CREATE INDEX idx_tenant_growth_growth_score ON public.tenant_growth USING btree (growth_score);
CREATE INDEX idx_tenant_growth_property ON public.tenant_growth USING btree (property_id);
CREATE INDEX idx_tpe_config_key ON public.tpe_config USING btree (config_key);
CREATE UNIQUE INDEX tpe_config_config_key_key ON public.tpe_config USING btree (config_key);

-- ---- Triggers ----
-- trg_resync_lease_exp_on_delete ON lease_comps (AFTER DELETE)
-- EXECUTE FUNCTION resync_lease_exp_on_delete()
-- trg_sync_lease_exp ON lease_comps (AFTER INSERT)
-- EXECUTE FUNCTION sync_lease_exp_from_comp()
-- trg_sync_lease_exp ON lease_comps (AFTER UPDATE)
-- EXECUTE FUNCTION sync_lease_exp_from_comp()
-- trg_normalize_address ON properties (BEFORE UPDATE)
-- EXECUTE FUNCTION compute_normalized_address()
-- trg_normalize_address ON properties (BEFORE INSERT)
-- EXECUTE FUNCTION compute_normalized_address()
-- trg_resync_sale_data_on_delete ON sale_comps (AFTER DELETE)
-- EXECUTE FUNCTION resync_sale_data_on_delete()
-- trg_sync_sale_data ON sale_comps (AFTER UPDATE)
-- EXECUTE FUNCTION sync_sale_data_from_comp()
-- trg_sync_sale_data ON sale_comps (AFTER INSERT)
-- EXECUTE FUNCTION sync_sale_data_from_comp()

-- ---- Functions ----
-- compute_normalized_address()
-- daitch_mokotoff()
-- difference()
-- dmetaphone()
-- dmetaphone_alt()
-- levenshtein()
-- levenshtein()
-- levenshtein_less_equal()
-- levenshtein_less_equal()
-- metaphone()
-- resync_lease_exp_on_delete()
-- resync_sale_data_on_delete()
-- soundex()
-- sync_lease_exp_from_comp()
-- sync_sale_data_from_comp()
-- text_soundex()
-- uuid_generate_v1()
-- uuid_generate_v1mc()
-- uuid_generate_v3()
-- uuid_generate_v4()
-- uuid_generate_v5()
-- uuid_nil()
-- uuid_ns_dns()
-- uuid_ns_oid()
-- uuid_ns_url()
-- uuid_ns_x500()
