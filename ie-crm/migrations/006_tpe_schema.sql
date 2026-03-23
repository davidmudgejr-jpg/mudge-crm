-- Migration 006: TPE Schema — missing tables + properties columns
-- Adds: debt_stress table, tpe_config table (seeded), 4 missing properties columns
-- Safe to re-run: all statements use IF NOT EXISTS / ADD COLUMN IF NOT EXISTS guards

BEGIN;

-- ============================================================
-- SECTION 1: MISSING PROPERTIES COLUMNS (for TPE scoring)
-- ============================================================

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS owner_entity_type      TEXT,
  ADD COLUMN IF NOT EXISTS owner_call_status      TEXT,
  ADD COLUMN IF NOT EXISTS tenant_call_status     TEXT,
  ADD COLUMN IF NOT EXISTS has_lien_or_delinquency BOOLEAN DEFAULT FALSE;

-- ============================================================
-- SECTION 2: debt_stress TABLE
-- Estimated balloon scenarios from Title Rep deed/UCC data.
-- Separate from loan_maturities (which stores confirmed RCA data).
-- ============================================================

CREATE TABLE IF NOT EXISTS debt_stress (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id         UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    lender              TEXT,
    loan_type           TEXT,                   -- Conventional, SBA, etc.
    interest_rate       NUMERIC,
    rate_type           TEXT,                   -- Fixed, Variable
    origination_date    DATE,
    origination_amount  NUMERIC,
    balloon_5yr         DATE,                   -- Estimated 5-year balloon date
    balloon_7yr         DATE,                   -- Estimated 7-year balloon date
    balloon_10yr        DATE,                   -- Estimated 10-year balloon date
    balloon_confidence  TEXT,                   -- HIGH, MEDIUM, LOW
    notes               TEXT,
    source              TEXT DEFAULT 'Manual',  -- 'Title Rep', 'Manual'
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debt_stress_property    ON debt_stress(property_id);
CREATE INDEX IF NOT EXISTS idx_debt_stress_confidence  ON debt_stress(balloon_confidence);

-- ============================================================
-- SECTION 3: tpe_config TABLE + SEED DATA
-- All scoring weights, thresholds, and market assumptions.
-- The property_tpe_scores VIEW reads from this table.
-- Change a value here → every TPE score recalculates instantly.
-- ============================================================

CREATE TABLE IF NOT EXISTS tpe_config (
    id               SERIAL PRIMARY KEY,
    config_category  TEXT NOT NULL,
    config_key       TEXT NOT NULL UNIQUE,
    config_value     NUMERIC NOT NULL,
    description      TEXT
);

CREATE INDEX IF NOT EXISTS idx_tpe_config_key ON tpe_config(config_key);

-- Seed default values (INSERT ... ON CONFLICT DO NOTHING so re-runs are safe)
INSERT INTO tpe_config (config_category, config_key, config_value, description) VALUES

  -- Lease Expiration (Category 1 — 30 pts max)
  ('lease', 'lease_12mo_points',  30, 'Score when lease expires ≤12 months'),
  ('lease', 'lease_18mo_points',  22, 'Score when lease expires 12–18 months'),
  ('lease', 'lease_24mo_points',  15, 'Score when lease expires 18–24 months'),
  ('lease', 'lease_36mo_points',   8, 'Score when lease expires 24–36 months'),

  -- Ownership Profile (Category 2 — 25 pts max, stacking)
  ('ownership', 'entity_individual_points', 8,  'Individual/Private/Partnership entity type'),
  ('ownership', 'entity_trust_points',      10, 'Trust entity type'),
  ('ownership', 'hold_15yr_points',         10, 'Hold duration ≥15 years'),
  ('ownership', 'hold_10yr_points',          7, 'Hold duration ≥10 years'),
  ('ownership', 'hold_7yr_points',           4, 'Hold duration ≥7 years'),
  ('ownership', 'owner_user_bonus',          7, 'Owner-User (occupant) bonus'),
  ('ownership', 'ownership_cap',            25, 'Maximum combined ownership score'),

  -- Owner Age (Category 3 — 20 pts max)
  ('owner_age', 'age_70_points', 20, 'Owner age 70+'),
  ('owner_age', 'age_65_points', 15, 'Owner age 65–70'),
  ('owner_age', 'age_60_points', 10, 'Owner age 60–65'),
  ('owner_age', 'age_55_points',  5, 'Owner age 55–60'),

  -- Tenant Growth (Category 4 — 15 pts max)
  ('growth', 'growth_30pct_points', 15, 'Headcount growth ≥30%'),
  ('growth', 'growth_20pct_points', 10, 'Headcount growth 20–30%'),
  ('growth', 'growth_10pct_points',  5, 'Headcount growth 10–20%'),

  -- Debt / Stress (Category 5 — 10 pts max, stacking)
  ('stress', 'balloon_high_points',   10, 'Balloon Confidence HIGH'),
  ('stress', 'balloon_medium_points',  7, 'Balloon Confidence MEDIUM'),
  ('stress', 'balloon_low_points',     4, 'Balloon Confidence LOW'),
  ('stress', 'lien_points',            5, 'Lien/delinquency flag'),
  ('stress', 'stress_cap',            10, 'Maximum combined stress score'),

  -- ECV Market Assumptions (Model 2)
  ('ecv', 'sale_price_psf',              250,  'Sale price per SF assumption (IE industrial avg)'),
  ('ecv', 'lease_rate_small',            1.15, 'Lease rate $/SF/mo — 10–30K SF'),
  ('ecv', 'lease_rate_mid',              1.00, 'Lease rate $/SF/mo — 30–50K SF'),
  ('ecv', 'lease_rate_large',            0.90, 'Lease rate $/SF/mo — 50K+ SF'),
  ('ecv', 'lease_term_months',           60,   'Average lease term (months)'),
  ('ecv', 'sale_commission_5m',          0.03, 'Sale commission rate — value ≤$5M'),
  ('ecv', 'sale_commission_10m',         0.02, 'Sale commission rate — value $5M–$10M'),
  ('ecv', 'sale_commission_over10m',     0.01, 'Sale commission rate — value >$10M'),
  ('ecv', 'lease_new_commission_rate',   0.04, 'New lease commission rate'),
  ('ecv', 'lease_renewal_commission_rate', 0.02, 'Renewal commission rate'),
  ('ecv', 'commission_divisor',          2500, 'Divide commission by this for 0–100 scale ($250K=100)'),

  -- Time Multiplier (used in ECV w/ Maturity Boost only)
  ('time', 'time_mult_6mo',  1.20, 'Time multiplier — lease expiring ≤6 months'),
  ('time', 'time_mult_12mo', 1.10, 'Time multiplier — lease expiring 6–12 months'),
  ('time', 'time_mult_24mo', 1.00, 'Time multiplier — lease expiring 12–24 months'),
  ('time', 'time_mult_sale', 0.85, 'Time multiplier — sale or no lease data'),

  -- Blended Priority weights (Model 3)
  ('blended', 'tpe_weight', 0.70, 'TPE score weight in blended priority'),
  ('blended', 'ecv_weight', 0.30, 'Commission weight in blended priority'),

  -- Confirmed Loan Maturity (Model 4 — base scores)
  ('maturity', 'matured_points',       25, 'Confirmed loan already matured (past due)'),
  ('maturity', 'mature_30d_points',    20, 'Confirmed maturing ≤30 days'),
  ('maturity', 'mature_90d_points',    15, 'Confirmed maturing ≤90 days'),
  ('maturity', 'mature_over90d_points', 10, 'Confirmed maturing >90 days'),

  -- Enhanced Maturity Bonuses (v2.16)
  ('maturity_bonus', 'ltv_85_bonus',               5, 'LTV ≥85% bonus — underwater risk'),
  ('maturity_bonus', 'ltv_75_bonus',               3, 'LTV 75–84% bonus — tight equity'),
  ('maturity_bonus', 'ltv_65_bonus',               1, 'LTV 65–74% bonus — moderate pressure'),
  ('maturity_bonus', 'duration_25yr_bonus',         3, 'Loan ≤2.5 year — bridge loan, plan failed'),
  ('maturity_bonus', 'duration_4yr_bonus',          1, 'Loan 2.5–4 year — transitional stress'),
  ('maturity_bonus', 'purpose_acquisition_bonus',   2, 'Acquisition loan — bought at peak'),
  ('maturity_bonus', 'purpose_construction_bonus',  2, 'Construction loan — needs takeout'),

  -- Distress Scoring (Model 5)
  ('distress', 'auction_points',          25, 'Auction distress score'),
  ('distress', 'matured_distress_points', 25, 'Past-due matured loan'),
  ('distress', 'nod_points',             20, 'Notice of Default'),
  ('distress', 'mature_1mo_points',      22, 'Maturing ≤1 month'),
  ('distress', 'mature_3mo_points',      18, 'Maturing 1–3 months'),
  ('distress', 'mature_6mo_points',      15, 'Maturing 3–6 months'),
  ('distress', 'mature_9mo_points',      12, 'Maturing 6–9 months'),
  ('distress', 'mature_12mo_points',     10, 'Maturing 9–12 months')

ON CONFLICT (config_key) DO NOTHING;

COMMIT;
