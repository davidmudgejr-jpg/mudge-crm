-- ============================================================
-- Migration 001: Full Schema Alignment
-- Source: HANDOFF.md column mapping (all tabs)
-- ============================================================
-- Run with: psql -d ie_crm -f migrations/001_schema_alignment.sql
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS guards

BEGIN;

-- ============================================================
-- SECTION 1: COLUMN TYPE CHANGES (existing tables)
-- ============================================================

-- Properties: contacted BOOLEAN → TEXT[] (multi-select)
ALTER TABLE properties
  ALTER COLUMN contacted DROP DEFAULT,
  ALTER COLUMN contacted TYPE TEXT[]
    USING CASE
      WHEN contacted = TRUE THEN ARRAY['Contacted Owner']
      WHEN contacted = FALSE THEN NULL
      ELSE NULL
    END,
  ALTER COLUMN contacted SET DEFAULT NULL;

-- Contacts: email_hot TEXT → BOOLEAN
ALTER TABLE contacts
  ALTER COLUMN email_hot TYPE BOOLEAN
    USING CASE
      WHEN email_hot IS NOT NULL AND email_hot != '' THEN TRUE
      ELSE FALSE
    END;

-- Contacts: phone_hot TEXT → BOOLEAN
ALTER TABLE contacts
  ALTER COLUMN phone_hot TYPE BOOLEAN
    USING CASE
      WHEN phone_hot IS NOT NULL AND phone_hot != '' THEN TRUE
      ELSE FALSE
    END;

-- Contacts: drop contact_verified (not needed)
ALTER TABLE contacts DROP COLUMN IF EXISTS contact_verified;

-- Deals: deal_source TEXT → TEXT[]
ALTER TABLE deals
  ALTER COLUMN deal_source TYPE TEXT[]
    USING CASE
      WHEN deal_source IS NOT NULL AND deal_source != '' THEN ARRAY[deal_source]
      ELSE NULL
    END;

-- Deals: repping TEXT → TEXT[]
ALTER TABLE deals
  ALTER COLUMN repping TYPE TEXT[]
    USING CASE
      WHEN repping IS NOT NULL AND repping != '' THEN ARRAY[repping]
      ELSE NULL
    END;

-- Deals: term TEXT → INT
ALTER TABLE deals
  ALTER COLUMN term TYPE INT
    USING NULLIF(term, '')::INT;

-- Deals: deal_dead_reason TEXT → TEXT[]
ALTER TABLE deals
  ALTER COLUMN deal_dead_reason TYPE TEXT[]
    USING CASE
      WHEN deal_dead_reason IS NOT NULL AND deal_dead_reason != '' THEN ARRAY[deal_dead_reason]
      ELSE NULL
    END;

-- Deals: important_date DATE → TIMESTAMP
ALTER TABLE deals
  ALTER COLUMN important_date TYPE TIMESTAMP
    USING important_date::TIMESTAMP;


-- ============================================================
-- SECTION 2: NEW COLUMNS ON EXISTING TABLES
-- ============================================================

-- ---- Properties (~28 new columns) ----
ALTER TABLE properties ADD COLUMN IF NOT EXISTS parking_ratio NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_type TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_contact TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS building_tax TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS building_opex TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS leasing_company TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS broker_contact TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS for_sale_price NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ops_expense_psf NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sewer TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS water TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS gas TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS heating TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_available_sf NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS direct_available_sf NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS direct_vacant_space NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS number_of_cranes INT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rail_lines TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS parcel_number TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS landvision_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS sb_county_zoning TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS zoning_map_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS listing_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS avg_weighted_rent NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS building_image_path TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude NUMERIC;
-- TPE-specific property columns
ALTER TABLE properties ADD COLUMN IF NOT EXISTS owner_user_or_investor TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS out_of_area_owner BOOLEAN DEFAULT FALSE;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS office_courtesy BOOLEAN DEFAULT FALSE;

-- ---- Contacts (~15 new columns) ----
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_kickback BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS white_pages_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS been_verified_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zoom_info_url TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS property_type_interest TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lease_months_left INT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_space_fit TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_ownership_intent TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS business_trajectory TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_call_outcome TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS follow_up_behavior TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS decision_authority TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS price_cost_awareness TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS frustration_signals TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS exit_trigger_events TEXT;

-- ---- Companies (3 new columns) ----
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tenant_sic TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tenant_naics TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS suite TEXT;

-- ---- Deals (8 new columns) ----
ALTER TABLE deals ADD COLUMN IF NOT EXISTS increases NUMERIC;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS escrow_url TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS surveys_brochures_url TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS run_by TEXT[];
ALTER TABLE deals ADD COLUMN IF NOT EXISTS other_broker TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS deadline DATE;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS fell_through_reason TEXT;

-- ---- Campaigns (2 new columns) ----
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS assignee TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS day_time_hits TEXT;

-- ---- Interactions (2 new columns) ----
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS email_url TEXT;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS email_id TEXT;


-- ============================================================
-- SECTION 3: NEW TABLES
-- ============================================================

-- ---- Action Items ----
CREATE TABLE IF NOT EXISTS action_items (
    action_item_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    notes TEXT,
    notes_on_date TEXT,
    responsibility TEXT[],
    high_priority BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'Todo',
    due_date DATE,
    date_completed TIMESTAMP,
    source TEXT DEFAULT 'manual',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_action_items_status ON action_items(status);
CREATE INDEX IF NOT EXISTS idx_action_items_due_date ON action_items(due_date);
CREATE INDEX IF NOT EXISTS idx_action_items_responsibility ON action_items USING GIN(responsibility);
CREATE INDEX IF NOT EXISTS idx_action_items_source ON action_items(source);
CREATE INDEX IF NOT EXISTS idx_action_items_high_priority ON action_items(high_priority) WHERE high_priority = TRUE;

-- ---- Lease Comps ----
CREATE TABLE IF NOT EXISTS lease_comps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(property_id) ON DELETE SET NULL,
    company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL,
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
    term_months INT,
    rate NUMERIC,
    escalations NUMERIC,
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lease_comps_property ON lease_comps(property_id);
CREATE INDEX IF NOT EXISTS idx_lease_comps_company ON lease_comps(company_id);
CREATE INDEX IF NOT EXISTS idx_lease_comps_expiration ON lease_comps(expiration_date);
CREATE INDEX IF NOT EXISTS idx_lease_comps_commencement ON lease_comps(commencement_date);
CREATE INDEX IF NOT EXISTS idx_lease_comps_sf ON lease_comps(sf);

-- ---- Sale Comps ----
CREATE TABLE IF NOT EXISTS sale_comps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(property_id) ON DELETE SET NULL,
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
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_comps_property ON sale_comps(property_id);
CREATE INDEX IF NOT EXISTS idx_sale_comps_sale_date ON sale_comps(sale_date);
CREATE INDEX IF NOT EXISTS idx_sale_comps_sf ON sale_comps(sf);

-- ---- Loan Maturities (TPE) ----
CREATE TABLE IF NOT EXISTS loan_maturities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    lender TEXT,
    loan_amount NUMERIC,
    maturity_date DATE,
    ltv NUMERIC,
    loan_purpose TEXT,
    loan_duration_years INT,
    interest_rate NUMERIC,
    notes TEXT,
    source TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_maturities_property ON loan_maturities(property_id);
CREATE INDEX IF NOT EXISTS idx_loan_maturities_maturity ON loan_maturities(maturity_date);

-- ---- Property Distress (TPE) ----
CREATE TABLE IF NOT EXISTS property_distress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    distress_type TEXT,
    filing_date DATE,
    amount NUMERIC,
    trustee TEXT,
    notes TEXT,
    source TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_property_distress_property ON property_distress(property_id);
CREATE INDEX IF NOT EXISTS idx_property_distress_type ON property_distress(distress_type);

-- ---- Tenant Growth (TPE) ----
CREATE TABLE IF NOT EXISTS tenant_growth (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
    headcount_current INT,
    headcount_previous INT,
    growth_rate NUMERIC,
    revenue_current NUMERIC,
    revenue_previous NUMERIC,
    data_date DATE,
    source TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_growth_company ON tenant_growth(company_id);
CREATE INDEX IF NOT EXISTS idx_tenant_growth_date ON tenant_growth(data_date);


-- ============================================================
-- SECTION 4: NEW JUNCTION TABLES (Action Items)
-- ============================================================

CREATE TABLE IF NOT EXISTS action_item_contacts (
    action_item_id UUID REFERENCES action_items(action_item_id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(contact_id) ON DELETE CASCADE,
    PRIMARY KEY (action_item_id, contact_id)
);

CREATE TABLE IF NOT EXISTS action_item_properties (
    action_item_id UUID REFERENCES action_items(action_item_id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    PRIMARY KEY (action_item_id, property_id)
);

CREATE TABLE IF NOT EXISTS action_item_deals (
    action_item_id UUID REFERENCES action_items(action_item_id) ON DELETE CASCADE,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE CASCADE,
    PRIMARY KEY (action_item_id, deal_id)
);

CREATE TABLE IF NOT EXISTS action_item_companies (
    action_item_id UUID REFERENCES action_items(action_item_id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
    PRIMARY KEY (action_item_id, company_id)
);


-- ============================================================
-- SECTION 5: DROP STALE INDEX (contacted type changed)
-- ============================================================
DROP INDEX IF EXISTS idx_properties_contacted;


COMMIT;

-- ============================================================
-- Post-migration verification (run manually)
-- ============================================================
-- \d properties
-- \d contacts
-- \d companies
-- \d deals
-- \d campaigns
-- \d interactions
-- \d action_items
-- \d lease_comps
-- \d sale_comps
-- \d loan_maturities
-- \d property_distress
-- \d tenant_growth
-- \d action_item_contacts
-- \d action_item_properties
-- \d action_item_deals
-- \d action_item_companies
