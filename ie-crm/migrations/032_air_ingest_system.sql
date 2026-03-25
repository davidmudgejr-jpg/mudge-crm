-- Migration 032: AIR Ingest System
-- Change history for market_tracking + AIR parsing metadata
-- Supports: new listings, comps, updated listings from AIR super sheets

-- 1. MARKET TRACKING CHANGES — tracks every update to a listing
-- When a listing price changes, status changes, or any field updates,
-- we log the old and new values. Oracle uses this for pattern analysis.
CREATE TABLE IF NOT EXISTS market_tracking_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_tracking_id UUID REFERENCES market_tracking(id) ON DELETE CASCADE,
    property_address TEXT NOT NULL,

    -- What changed
    field_changed TEXT NOT NULL,              -- 'asking_lease_rate', 'asking_price', 'market_status', 'available_sf', etc.
    previous_value TEXT,                       -- Old value (as text for flexibility)
    new_value TEXT,                            -- New value
    change_type TEXT DEFAULT 'update',         -- 'update', 'status_change', 'price_reduction', 'price_increase', 'withdrawn'

    -- Source
    air_sheet_date DATE,                       -- Which AIR sheet this came from
    source TEXT DEFAULT 'air_sheet',           -- 'air_sheet', 'manual', 'costar'
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mtc_tracking_id ON market_tracking_changes(market_tracking_id);
CREATE INDEX IF NOT EXISTS idx_mtc_address ON market_tracking_changes(property_address);
CREATE INDEX IF NOT EXISTS idx_mtc_field ON market_tracking_changes(field_changed);
CREATE INDEX IF NOT EXISTS idx_mtc_date ON market_tracking_changes(air_sheet_date);

-- 2. AIR PARSE RUNS — tracks each time we parse an AIR sheet
-- So we can see: how many entries per sheet, success rate, what was ingested
CREATE TABLE IF NOT EXISTS air_parse_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_file TEXT NOT NULL,                 -- 'IE-super-sheet-2026-03-24.pdf'
    parsed_date DATE NOT NULL,                 -- Date of the AIR sheet
    parsed_at TIMESTAMPTZ DEFAULT NOW(),       -- When we actually ran the parser

    -- Counts by category
    new_listings_lease INT DEFAULT 0,
    new_listings_sale INT DEFAULT 0,
    lease_comps_found INT DEFAULT 0,
    sale_comps_found INT DEFAULT 0,
    updated_listings INT DEFAULT 0,
    total_entries INT DEFAULT 0,

    -- Ingestion results
    properties_created INT DEFAULT 0,          -- New properties added to CRM
    properties_updated INT DEFAULT 0,          -- Existing properties updated
    lease_comps_created INT DEFAULT 0,         -- New lease comps added
    sale_comps_created INT DEFAULT 0,          -- New sale comps added
    market_tracking_created INT DEFAULT 0,     -- New market_tracking rows
    market_tracking_updated INT DEFAULT 0,     -- Updated market_tracking rows
    errors INT DEFAULT 0,                      -- Entries that failed to process

    -- Status
    status TEXT DEFAULT 'completed',           -- 'completed', 'partial', 'failed'
    error_log JSONB DEFAULT '[]',              -- Array of error messages per failed entry
    agent_name TEXT DEFAULT 'matcher',         -- Which agent ran this

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apr_date ON air_parse_runs(parsed_date);

-- 3. Add AIR-specific fields to market_tracking if not already there
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS listing_broker TEXT;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS listing_agents TEXT;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS available_sf NUMERIC;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS office_sf NUMERIC;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS clear_height NUMERIC;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS dock_high_doors INT;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS grade_level_doors INT;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS construction_status TEXT;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS property_name TEXT;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS air_entry_number INT;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS last_air_sheet_date DATE;
ALTER TABLE market_tracking ADD COLUMN IF NOT EXISTS change_count INT DEFAULT 0;

-- 4. Add source tracking to lease_comps and sale_comps
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS air_sheet_date DATE;
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS air_entry_number INT;
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS property_address TEXT;
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS city TEXT;

ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS air_sheet_date DATE;
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS air_entry_number INT;
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS property_address TEXT;
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS building_sf NUMERIC;
