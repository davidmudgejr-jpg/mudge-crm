-- Migration 025: Oracle Prediction Engine Schema
-- Adds Oracle scoring fields to properties, transaction outcome tracking to comps,
-- market tracking for AIR listings, owner personas, and relationship graph tables.
--
-- PURPOSE: Start collecting Oracle's training data NOW, before the Mac Studio arrives.
-- Every comp, deal, and AIR listing logged from this point forward becomes
-- Oracle's ground truth for calibration.
--
-- Date: 2026-03-23

-- ============================================================
-- 1. ORACLE SCORING FIELDS ON PROPERTIES
-- These store Oracle's current prediction for each property.
-- Updated every time Oracle reruns simulations.
-- ============================================================

-- Core Oracle scores
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_score NUMERIC;                      -- 0-100 transaction probability
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_confidence TEXT;                     -- 'high', 'medium', 'low'
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_primary_driver TEXT;                 -- Top reason for score
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_last_run TIMESTAMPTZ;                -- When last simulated
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_timing_0_6mo NUMERIC;                -- % chance in 0-6 months
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_timing_6_12mo NUMERIC;               -- % chance in 6-12 months
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_timing_12_24mo NUMERIC;              -- % chance in 12-24 months
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_timing_24_plus NUMERIC;              -- % chance in 24+ months
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_recommended_action TEXT;              -- 'call_this_week', 'send_bov', 'monitor', etc.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_next_reassessment DATE;              -- When Oracle will re-score
ALTER TABLE properties ADD COLUMN IF NOT EXISTS oracle_score_history JSONB DEFAULT '[]';    -- Array of {date, score, driver} for trend tracking

-- Additional property signals not yet captured
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ownership_start_date DATE;                  -- When current owner acquired (may differ from last_sale_date for inherited/transferred)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS in_place_rent_psf NUMERIC;                  -- Current rent per SF (gap vs market = motivation signal)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS last_vacancy_change_date DATE;              -- When vacancy status last changed
ALTER TABLE properties ADD COLUMN IF NOT EXISTS vacancy_duration_months INT;                -- How long current vacancy has persisted

-- Index for Oracle score queries (ranked property lists, dashboard)
CREATE INDEX IF NOT EXISTS idx_properties_oracle_score ON properties(oracle_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_properties_oracle_confidence ON properties(oracle_confidence);

-- ============================================================
-- 2. TRANSACTION OUTCOME FIELDS ON COMPS
-- THIS IS ORACLE'S GROUND TRUTH — the most important data.
-- Every comp needs an outcome logged. Start today.
-- ============================================================

-- Sale comps: was this OUR deal, a competitor's, or just a market comp?
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS transaction_outcome TEXT DEFAULT 'market_comp';  -- 'our_deal', 'lost_to_competitor', 'market_comp'
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS transaction_outcome_notes TEXT;                    -- Why it happened (or didn't)
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS oracle_predicted_score NUMERIC;                    -- What Oracle scored this property BEFORE the sale
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS oracle_predicted_timing TEXT;                      -- What Oracle predicted for timing
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS oracle_calibration_complete BOOLEAN DEFAULT false;  -- Has Oracle run calibration against this?
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS oracle_calibration_date TIMESTAMPTZ;               -- When calibration happened
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS days_on_market INT;                                -- From listing to close (if known)
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS listing_broker TEXT;                               -- Who listed it
ALTER TABLE sale_comps ADD COLUMN IF NOT EXISTS buying_broker TEXT;                                -- Who represented the buyer

-- Lease comps: same outcome tracking
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS transaction_outcome TEXT DEFAULT 'market_comp';
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS transaction_outcome_notes TEXT;
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS oracle_predicted_score NUMERIC;
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS oracle_calibration_complete BOOLEAN DEFAULT false;
ALTER TABLE lease_comps ADD COLUMN IF NOT EXISTS days_on_market INT;

-- ============================================================
-- 3. MARKET TRACKING TABLE
-- Tracks every property Oracle sees listed in AIR reports.
-- When a comp appears later, Oracle compares prediction vs reality.
-- This is the VOLUME calibration data that makes Oracle learn fast.
-- ============================================================

CREATE TABLE IF NOT EXISTS market_tracking (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Property identification
    property_id UUID REFERENCES properties(property_id) ON DELETE SET NULL,
    property_address TEXT NOT NULL,
    submarket TEXT,
    property_type TEXT,
    building_sf NUMERIC,

    -- Listing info
    market_status TEXT NOT NULL DEFAULT 'listed',    -- 'for_sale', 'for_lease', 'sold', 'leased', 'withdrawn', 'expired'
    first_seen_date DATE NOT NULL,                   -- When AIR first showed it
    first_seen_source TEXT DEFAULT 'air_sheet',      -- 'air_sheet', 'costar', 'manual', 'researcher'

    -- Pricing (often NULL — that's okay)
    asking_price NUMERIC,
    asking_price_psf NUMERIC,
    asking_lease_rate NUMERIC,

    -- Outcome (filled when comp appears or listing expires)
    outcome_date DATE,
    outcome_type TEXT,                               -- 'transacted', 'no_transaction', 'withdrawn', 'pending'
    sale_price NUMERIC,
    sale_price_psf NUMERIC,
    lease_rate NUMERIC,
    price_source TEXT,                               -- 'air_sheet', 'internal_comp', 'costar', 'manual'
    price_backfilled_date DATE,                      -- When price was added after the fact
    days_on_market INT,                              -- Calculated: outcome_date - first_seen_date

    -- Oracle's prediction AT TIME OF LISTING (snapshot — never updated after creation)
    oracle_prediction_at_listing NUMERIC,            -- Oracle's score when it first saw this
    oracle_timing_prediction TEXT,                   -- What Oracle predicted for timing
    oracle_signals_snapshot JSONB DEFAULT '{}',      -- Full signal breakdown at prediction time

    -- Calibration
    oracle_calibration_complete BOOLEAN DEFAULT false,
    oracle_calibration_date TIMESTAMPTZ,
    oracle_calibration_error JSONB DEFAULT '{}',     -- Per-signal error analysis

    -- Comp link (when the comp appears, link it)
    sale_comp_id UUID REFERENCES sale_comps(id) ON DELETE SET NULL,
    lease_comp_id UUID REFERENCES lease_comps(id) ON DELETE SET NULL,

    -- Metadata
    air_report_date DATE,                            -- Which AIR report this came from
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_tracking_status ON market_tracking(market_status);
CREATE INDEX IF NOT EXISTS idx_market_tracking_property ON market_tracking(property_id);
CREATE INDEX IF NOT EXISTS idx_market_tracking_submarket ON market_tracking(submarket);
CREATE INDEX IF NOT EXISTS idx_market_tracking_first_seen ON market_tracking(first_seen_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_tracking_outcome ON market_tracking(outcome_type);
CREATE INDEX IF NOT EXISTS idx_market_tracking_calibration ON market_tracking(oracle_calibration_complete) WHERE oracle_calibration_complete = false;

-- ============================================================
-- 4. OWNER PERSONAS TABLE
-- Oracle builds behavioral profiles for every property owner.
-- Evolves over time as new transcripts, emails, and engagement arrive.
-- ============================================================

CREATE TABLE IF NOT EXISTS owner_personas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Link to CRM entities
    contact_id UUID REFERENCES contacts(contact_id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(property_id) ON DELETE SET NULL,

    -- Persona summary
    persona_text TEXT,                              -- Full narrative persona (2000 words, generated by Oracle 70B)
    persona_summary TEXT,                           -- Short summary for quick reference

    -- Structured attributes
    entity_type TEXT,                               -- 'long_term_holder', 'investor', 'estate', 'partnership'
    financial_profile TEXT,                          -- 'conservative', 'aggressive', 'distressed', etc.
    communication_style TEXT,                        -- 'phone_preferred', 'email_preferred', 'slow_responder', etc.
    decision_pattern TEXT,                           -- 'needs_attorney', 'quick_decider', 'committee_decision', etc.
    engagement_arc TEXT,                             -- 'dormant', 'warming', 'active_evaluation', 'late_stage', 'cold'
    predicted_motivation TEXT,                       -- 'retirement', 'portfolio_rebalance', 'distress', 'opportunistic', etc.
    recommended_approach TEXT,                       -- How David should approach this person

    -- Personality indicators (from transcripts)
    risk_tolerance TEXT,                             -- 'risk_averse', 'moderate', 'risk_seeking'
    values_priority TEXT,                            -- 'relationship_over_price', 'price_driven', 'speed_driven'

    -- Longitudinal voice profile (language evolution over time)
    voice_profile JSONB DEFAULT '[]',               -- Array of {date, call_id, key_phrases, sentiment, intent_level}
    sentiment_trajectory TEXT,                       -- 'improving', 'stable', 'declining'

    -- Version tracking
    version INT DEFAULT 1,
    last_updated_by TEXT DEFAULT 'oracle',           -- 'oracle', 'houston_command', 'manual'
    last_transcript_analyzed TEXT,                   -- Fireflies transcript ID

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_personas_contact ON owner_personas(contact_id);
CREATE INDEX IF NOT EXISTS idx_owner_personas_property ON owner_personas(property_id);
CREATE INDEX IF NOT EXISTS idx_owner_personas_arc ON owner_personas(engagement_arc);
CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_personas_unique ON owner_personas(contact_id, property_id);

-- ============================================================
-- 5. RELATIONSHIP GRAPH TABLES
-- Oracle maintains a knowledge graph of entity relationships.
-- All agents can query these tables for intelligence.
-- ============================================================

-- Graph nodes: entities in the relationship network
CREATE TABLE IF NOT EXISTS graph_entities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Entity identification
    entity_type TEXT NOT NULL,                       -- 'owner', 'property', 'company', 'attorney', 'broker', 'tenant', 'llc'
    entity_name TEXT NOT NULL,

    -- Link to CRM records (one will be set depending on type)
    contact_id UUID REFERENCES contacts(contact_id) ON DELETE SET NULL,
    property_id UUID REFERENCES properties(property_id) ON DELETE SET NULL,
    company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL,

    -- Entity attributes
    attributes JSONB DEFAULT '{}',                  -- Flexible key-value attributes
    summary TEXT,                                    -- Oracle-generated summary of this entity
    influence_score NUMERIC DEFAULT 50,             -- 0-100, how influential in the network

    -- Metadata
    created_by TEXT DEFAULT 'oracle',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_entities_type ON graph_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_graph_entities_contact ON graph_entities(contact_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_property ON graph_entities(property_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_company ON graph_entities(company_id);
CREATE INDEX IF NOT EXISTS idx_graph_entities_name ON graph_entities(entity_name);

-- Graph edges: relationships between entities
CREATE TABLE IF NOT EXISTS graph_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Relationship endpoints
    source_entity_id UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,
    target_entity_id UUID NOT NULL REFERENCES graph_entities(id) ON DELETE CASCADE,

    -- Relationship info
    relationship_type TEXT NOT NULL,                 -- 'OWNS', 'PARTNER_OF', 'ATTORNEY_FOR', 'TENANT_AT', 'COMP_NEAR', 'CALLED_BY', etc.
    relationship_strength NUMERIC DEFAULT 50,       -- 0-100, how strong/relevant this connection is
    relationship_details JSONB DEFAULT '{}',         -- Additional context

    -- Temporal tracking
    first_observed DATE,                             -- When Oracle first saw this relationship
    last_confirmed DATE,                             -- When last verified/reinforced
    is_active BOOLEAN DEFAULT true,                  -- Can be deactivated without deleting

    -- Metadata
    source TEXT DEFAULT 'oracle',                    -- 'oracle', 'crm_import', 'manual', 'fireflies'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON graph_edges(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON graph_edges(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON graph_edges(relationship_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_active ON graph_edges(is_active) WHERE is_active = true;
-- Prevent duplicate edges
CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_edges_unique
    ON graph_edges(source_entity_id, target_entity_id, relationship_type);

-- ============================================================
-- 6. ORACLE CALIBRATION LOG
-- Every calibration event is stored for Houston Command review.
-- ============================================================

CREATE TABLE IF NOT EXISTS oracle_calibration_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What was calibrated
    property_id UUID REFERENCES properties(property_id) ON DELETE SET NULL,
    market_tracking_id UUID REFERENCES market_tracking(id) ON DELETE SET NULL,
    sale_comp_id UUID REFERENCES sale_comps(id) ON DELETE SET NULL,
    lease_comp_id UUID REFERENCES lease_comps(id) ON DELETE SET NULL,

    -- Prediction vs. Reality
    predicted_score NUMERIC,                         -- What Oracle predicted
    predicted_timing TEXT,                            -- When Oracle said it would happen
    actual_outcome TEXT,                              -- What actually happened
    actual_timing_months NUMERIC,                    -- How long it actually took

    -- Error analysis
    overall_error NUMERIC,                           -- Absolute error (predicted - actual)
    signal_errors JSONB DEFAULT '{}',                -- Per-signal error breakdown
    -- Example: {"loan_maturity": +5, "engagement": -3, "submarket": +2}

    -- Learning
    weight_adjustments_suggested JSONB DEFAULT '{}', -- What Oracle thinks weights should change to
    calibration_notes TEXT,                           -- Oracle's written analysis

    -- Houston Command review
    reviewed_by_command BOOLEAN DEFAULT false,
    command_review_date TIMESTAMPTZ,
    command_notes TEXT,
    weights_updated BOOLEAN DEFAULT false,            -- Did this calibration result in a weight change?

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calibration_property ON oracle_calibration_log(property_id);
CREATE INDEX IF NOT EXISTS idx_calibration_reviewed ON oracle_calibration_log(reviewed_by_command) WHERE reviewed_by_command = false;
CREATE INDEX IF NOT EXISTS idx_calibration_date ON oracle_calibration_log(created_at DESC);

-- ============================================================
-- 7. ORACLE SIGNAL WEIGHTS TABLE
-- Stores the current weights Oracle uses for scoring.
-- Houston Command updates these monthly after calibration review.
-- Version-tracked so we can see how weights evolve over time.
-- ============================================================

CREATE TABLE IF NOT EXISTS oracle_signal_weights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Signal identification
    signal_category TEXT NOT NULL,                    -- 'property', 'engagement', 'transcript', etc. (12 categories)
    signal_name TEXT NOT NULL,                        -- 'loan_maturity_18mo', 'first_call_after_dormancy', etc.

    -- Weight configuration
    weight NUMERIC NOT NULL DEFAULT 50,              -- 0-100 importance
    weight_direction TEXT DEFAULT 'positive',         -- 'positive' (increases score) or 'negative' (decreases score)

    -- Submarket overrides (IE-specific patterns)
    submarket_overrides JSONB DEFAULT '{}',           -- {"fontana": 60, "ontario": 45, "perris": 70}

    -- Calibration history
    times_calibrated INT DEFAULT 0,
    last_calibrated_date TIMESTAMPTZ,
    calibration_trend TEXT,                           -- 'increasing', 'stable', 'decreasing'

    -- Version tracking
    version INT DEFAULT 1,
    updated_by TEXT DEFAULT 'initial_setup',          -- 'initial_setup', 'houston_command', 'oracle_auto'
    previous_weight NUMERIC,                          -- What it was before last change
    change_reason TEXT,                                -- Why it was changed

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signal_weights_unique ON oracle_signal_weights(signal_category, signal_name);

-- ============================================================
-- 8. INSERT INITIAL SIGNAL WEIGHTS
-- Based on David's industry experience + the v2 architecture doc.
-- These are starting points — Oracle and Houston Command will tune them.
-- ============================================================

INSERT INTO oracle_signal_weights (signal_category, signal_name, weight, weight_direction) VALUES
    -- Property signals
    ('property', 'loan_maturity_18mo', 90, 'positive'),
    ('property', 'ownership_duration_7_12yr', 75, 'positive'),
    ('property', 'vacancy_6mo_plus', 70, 'positive'),
    ('property', 'rent_gap_vs_market', 65, 'positive'),
    ('property', 'owner_entity_llc', 55, 'positive'),
    ('property', 'building_age_deferred_maintenance', 40, 'positive'),

    -- Engagement signals
    ('engagement', 'first_call_after_dormancy', 85, 'positive'),
    ('engagement', 'owner_initiates_callback', 95, 'positive'),
    ('engagement', 'call_duration_increasing', 70, 'positive'),
    ('engagement', 'email_reply', 80, 'positive'),
    ('engagement', 'agreed_to_tour', 95, 'positive'),
    ('engagement', 'asked_for_comps', 85, 'positive'),
    ('engagement', 'introduced_attorney', 98, 'positive'),

    -- Transcript signals
    ('transcript', 'thinking_about_options', 75, 'positive'),
    ('transcript', 'mentions_debt_retirement', 85, 'positive'),
    ('transcript', 'partner_discussing', 70, 'positive'),
    ('transcript', 'asking_market_questions', 80, 'positive'),
    ('transcript', 'how_long_does_sale_take', 85, 'positive'),
    ('transcript', 'sentiment_improving', 65, 'positive'),

    -- Negative signals
    ('negative', 'do_not_call', 100, 'negative'),
    ('negative', 'dormancy_12mo_plus', 60, 'negative'),
    ('negative', 'recently_refinanced', 70, 'negative'),
    ('negative', 'not_interested_cold', 45, 'negative'),

    -- Market signals
    ('market', 'nearby_comp_sold', 70, 'positive'),
    ('market', 'submarket_velocity_high', 60, 'positive'),
    ('market', 'days_on_market_low', 55, 'positive'),

    -- Broker activity signals
    ('broker_activity', 'competing_broker_pursuing', 65, 'positive'),
    ('broker_activity', 'exclusive_listing_another_firm', 75, 'positive'),

    -- Tax/assessment signals
    ('tax_assessment', 'tax_increase_15pct', 55, 'positive'),
    ('tax_assessment', 'nearby_ownership_change', 40, 'positive'),

    -- Tenant health signals
    ('tenant_health', 'lease_expiring_18mo', 85, 'positive'),
    ('tenant_health', 'tenant_downsizing', 70, 'positive'),
    ('tenant_health', 'tenant_expanding', 45, 'negative'),

    -- Life event signals
    ('life_event', 'retirement_age', 70, 'positive'),
    ('life_event', 'entity_restructuring', 65, 'positive'),
    ('life_event', 'owner_death', 90, 'positive'),
    ('life_event', 'divorce_filing', 85, 'positive'),

    -- Macro signals
    ('macro', 'interest_rate_dropping', 60, 'positive'),
    ('macro', 'vacancy_rate_rising', 55, 'positive'),
    ('macro', 'construction_pipeline_heavy', 50, 'positive'),
    ('macro', 'cap_rate_compressing', 55, 'positive'),

    -- Seasonal signals
    ('seasonal', 'q2_listing_season', 60, 'positive'),
    ('seasonal', 'q3_transaction_season', 65, 'positive'),
    ('seasonal', 'q4_holiday_slowdown', 40, 'negative'),
    ('seasonal', 'tax_year_end', 50, 'positive'),

    -- Network cascade signals
    ('network', 'connected_owner_sold', 70, 'positive'),
    ('network', 'shared_attorney_active', 60, 'positive'),
    ('network', 'portfolio_domino', 75, 'positive'),
    ('network', 'partner_activity', 65, 'positive')
ON CONFLICT (signal_category, signal_name) DO NOTHING;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New columns added to: properties (12), sale_comps (8), lease_comps (5)
-- New tables created: market_tracking, owner_personas, graph_entities,
--                     graph_edges, oracle_calibration_log, oracle_signal_weights
-- Initial signal weights seeded: 48 signals across 12 categories
--
-- NEXT STEPS:
-- 1. Start logging transaction_outcome on every new comp
-- 2. Start populating market_tracking from AIR hot sheets
-- 3. Begin building owner_personas from existing CRM data
-- 4. Build graph_entities from existing contacts/properties/companies
-- 5. Oracle will use all of this when Mac Studio arrives
