-- IE CRM — Full PostgreSQL Schema
-- Commercial Real Estate CRM for the Inland Empire

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROPERTIES
-- ============================================================
CREATE TABLE properties (
    property_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    airtable_id TEXT,
    property_address TEXT,
    property_name TEXT,
    city TEXT,
    county TEXT,
    state TEXT DEFAULT 'CA',
    zip TEXT,
    rba NUMERIC,
    land_area_ac NUMERIC,
    land_sf NUMERIC,
    far NUMERIC,
    property_type TEXT,
    building_class TEXT,
    building_status TEXT,
    year_built INT,
    year_renovated INT,
    ceiling_ht NUMERIC,
    clear_ht NUMERIC,
    number_of_loading_docks INT,
    drive_ins INT,
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
    contacted BOOLEAN DEFAULT FALSE,
    priority TEXT,
    off_market_deal BOOLEAN DEFAULT FALSE,
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
    num_properties_owned INT,
    data_confirmed BOOLEAN DEFAULT FALSE,
    last_modified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    tags TEXT[],
    overflow JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_properties_county ON properties(county);
CREATE INDEX idx_properties_priority ON properties(priority);
CREATE INDEX idx_properties_contacted ON properties(contacted);
CREATE INDEX idx_properties_property_type ON properties(property_type);
CREATE INDEX idx_properties_airtable_id ON properties(airtable_id);
CREATE INDEX idx_properties_tags ON properties USING GIN(tags);

-- ============================================================
-- CONTACTS
-- ============================================================
CREATE TABLE contacts (
    contact_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    phone_hot TEXT,
    email_hot TEXT,
    home_address TEXT,
    work_address TEXT,
    work_city TEXT,
    work_state TEXT,
    work_zip TEXT,
    born DATE,
    age INT,
    client_level TEXT,
    active_need TEXT,
    notes TEXT,
    linkedin TEXT,
    follow_up DATE,
    last_contacted DATE,
    contact_verified BOOLEAN DEFAULT FALSE,
    data_source TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    modified TIMESTAMP DEFAULT NOW(),
    tags TEXT[],
    overflow JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_contacts_type ON contacts(type);
CREATE INDEX idx_contacts_full_name ON contacts(full_name);
CREATE INDEX idx_contacts_airtable_id ON contacts(airtable_id);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);

-- ============================================================
-- COMPANIES
-- ============================================================
CREATE TABLE companies (
    company_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    airtable_id TEXT,
    company_name TEXT,
    company_type TEXT,
    industry_type TEXT,
    website TEXT,
    sf NUMERIC,
    employees INT,
    revenue NUMERIC,
    company_growth TEXT,
    company_hq TEXT,
    lease_exp DATE,
    lease_months_left INT,
    move_in_date DATE,
    notes TEXT,
    city TEXT,
    modified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    tags TEXT[],
    overflow JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_companies_name ON companies(company_name);
CREATE INDEX idx_companies_airtable_id ON companies(airtable_id);

-- ============================================================
-- DEALS
-- ============================================================
CREATE TABLE deals (
    deal_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    airtable_id TEXT,
    deal_name TEXT,
    deal_type TEXT,
    deal_source TEXT,
    status TEXT,
    repping TEXT,
    term TEXT,
    rate NUMERIC,
    sf NUMERIC,
    price NUMERIC,
    commission_rate NUMERIC,
    gross_fee_potential NUMERIC,
    net_potential NUMERIC,
    close_date DATE,
    important_date DATE,
    deal_dead_reason TEXT,
    notes TEXT,
    priority_deal BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    modified TIMESTAMP DEFAULT NOW(),
    overflow JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_deals_status ON deals(status);
CREATE INDEX idx_deals_airtable_id ON deals(airtable_id);

-- ============================================================
-- INTERACTIONS
-- ============================================================
CREATE TABLE interactions (
    interaction_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
    created_at TIMESTAMP DEFAULT NOW(),
    overflow JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_interactions_type ON interactions(type);
CREATE INDEX idx_interactions_date ON interactions(date);
CREATE INDEX idx_interactions_airtable_id ON interactions(airtable_id);

-- ============================================================
-- CAMPAIGNS
-- ============================================================
CREATE TABLE campaigns (
    campaign_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    airtable_id TEXT,
    name TEXT,
    type TEXT,
    status TEXT,
    notes TEXT,
    sent_date DATE,
    modified TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    overflow JSONB DEFAULT '{}'::jsonb
);

-- ============================================================
-- JUNCTION TABLES (Connected Fields)
-- ============================================================
CREATE TABLE property_contacts (
    property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(contact_id) ON DELETE CASCADE,
    role TEXT,
    PRIMARY KEY (property_id, contact_id)
);

CREATE TABLE property_companies (
    property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
    role TEXT,
    PRIMARY KEY (property_id, company_id)
);

CREATE TABLE contact_companies (
    contact_id UUID REFERENCES contacts(contact_id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
    PRIMARY KEY (contact_id, company_id)
);

CREATE TABLE deal_properties (
    deal_id UUID REFERENCES deals(deal_id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    PRIMARY KEY (deal_id, property_id)
);

CREATE TABLE deal_contacts (
    deal_id UUID REFERENCES deals(deal_id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(contact_id) ON DELETE CASCADE,
    PRIMARY KEY (deal_id, contact_id)
);

CREATE TABLE deal_companies (
    deal_id UUID REFERENCES deals(deal_id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
    PRIMARY KEY (deal_id, company_id)
);

CREATE TABLE interaction_contacts (
    interaction_id UUID REFERENCES interactions(interaction_id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(contact_id) ON DELETE CASCADE,
    PRIMARY KEY (interaction_id, contact_id)
);

CREATE TABLE interaction_properties (
    interaction_id UUID REFERENCES interactions(interaction_id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    PRIMARY KEY (interaction_id, property_id)
);

CREATE TABLE interaction_deals (
    interaction_id UUID REFERENCES interactions(interaction_id) ON DELETE CASCADE,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE CASCADE,
    PRIMARY KEY (interaction_id, deal_id)
);

CREATE TABLE interaction_companies (
    interaction_id UUID REFERENCES interactions(interaction_id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
    PRIMARY KEY (interaction_id, company_id)
);

-- ============================================================
-- FORMULA COLUMNS (Claude-created live formulas)
-- ============================================================
CREATE TABLE formula_columns (
    formula_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name TEXT NOT NULL,
    column_name TEXT NOT NULL,
    display_name TEXT,
    expression TEXT NOT NULL,
    column_type TEXT DEFAULT 'text',
    created_by TEXT DEFAULT 'Claude',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(table_name, column_name)
);

-- ============================================================
-- UNDO LOG (Claude action undo)
-- ============================================================
CREATE TABLE undo_log (
    undo_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_description TEXT,
    sql_executed TEXT,
    reverse_sql TEXT,
    rows_affected INT,
    executed_at TIMESTAMP DEFAULT NOW(),
    undone BOOLEAN DEFAULT FALSE
);

-- ============================================================
-- APP SETTINGS
-- ============================================================
CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (key, value) VALUES
    ('airtable_base_id', 'appQaZNM0Mt4Zul3q'),
    ('auto_sync_enabled', 'false'),
    ('sync_interval_hours', '6'),
    ('last_sync', NULL),
    ('claude_auto_execute', 'true'),
    ('claude_execute_delay_ms', '1500');

-- ============================================================
-- NOTES (dedicated table, replaces per-entity notes columns)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
    note_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL,
    contact_id UUID REFERENCES contacts(contact_id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    deal_id UUID REFERENCES deals(deal_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_company ON notes(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_property ON notes(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_deal ON notes(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
