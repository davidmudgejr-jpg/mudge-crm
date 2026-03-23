-- Migration 011: Add missing columns for TPE data import
-- Supports: Distressed, Loan Maturity, Tenant Growth, Debt & Stress sheets
BEGIN;

-- ============================================================
-- 🚨 property_distress — 6 new columns
-- ============================================================
ALTER TABLE property_distress ADD COLUMN IF NOT EXISTS auction_date DATE;
ALTER TABLE property_distress ADD COLUMN IF NOT EXISTS opening_bid NUMERIC;
ALTER TABLE property_distress ADD COLUMN IF NOT EXISTS default_amount NUMERIC;
ALTER TABLE property_distress ADD COLUMN IF NOT EXISTS delinquent_tax_year INTEGER;
ALTER TABLE property_distress ADD COLUMN IF NOT EXISTS delinquent_tax_amount NUMERIC;
ALTER TABLE property_distress ADD COLUMN IF NOT EXISTS owner_type TEXT;

-- ============================================================
-- 🏦 loan_maturities — 6 new columns
-- ============================================================
ALTER TABLE loan_maturities ADD COLUMN IF NOT EXISTS loan_type TEXT;
ALTER TABLE loan_maturities ADD COLUMN IF NOT EXISTS rate_type TEXT;
ALTER TABLE loan_maturities ADD COLUMN IF NOT EXISTS months_past_due NUMERIC;
ALTER TABLE loan_maturities ADD COLUMN IF NOT EXISTS origination_date DATE;
ALTER TABLE loan_maturities ADD COLUMN IF NOT EXISTS est_value NUMERIC;
ALTER TABLE loan_maturities ADD COLUMN IF NOT EXISTS portfolio TEXT;

-- ============================================================
-- 📈 tenant_growth — 8 new columns (including property link)
-- ============================================================
ALTER TABLE tenant_growth ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(property_id);
ALTER TABLE tenant_growth ADD COLUMN IF NOT EXISTS sf_occupied INTEGER;
ALTER TABLE tenant_growth ADD COLUMN IF NOT EXISTS sf_per_employee NUMERIC;
ALTER TABLE tenant_growth ADD COLUMN IF NOT EXISTS occupancy_type TEXT;
ALTER TABLE tenant_growth ADD COLUMN IF NOT EXISTS time_in_building TEXT;
ALTER TABLE tenant_growth ADD COLUMN IF NOT EXISTS growth_score INTEGER;
ALTER TABLE tenant_growth ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE tenant_growth ADD COLUMN IF NOT EXISTS best_contact TEXT;

-- ============================================================
-- 💰 debt_stress — 3 new columns (months to balloon)
-- ============================================================
ALTER TABLE debt_stress ADD COLUMN IF NOT EXISTS months_to_5yr INTEGER;
ALTER TABLE debt_stress ADD COLUMN IF NOT EXISTS months_to_7yr INTEGER;
ALTER TABLE debt_stress ADD COLUMN IF NOT EXISTS months_to_10yr INTEGER;

-- ============================================================
-- Indexes for common query patterns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_property_distress_type ON property_distress(distress_type);
CREATE INDEX IF NOT EXISTS idx_loan_maturities_maturity_date ON loan_maturities(maturity_date);
CREATE INDEX IF NOT EXISTS idx_debt_stress_balloon_5yr ON debt_stress(balloon_5yr);
CREATE INDEX IF NOT EXISTS idx_debt_stress_balloon_7yr ON debt_stress(balloon_7yr);
CREATE INDEX IF NOT EXISTS idx_debt_stress_balloon_10yr ON debt_stress(balloon_10yr);
CREATE INDEX IF NOT EXISTS idx_tenant_growth_property ON tenant_growth(property_id);
CREATE INDEX IF NOT EXISTS idx_tenant_growth_growth_score ON tenant_growth(growth_score);

COMMIT;
