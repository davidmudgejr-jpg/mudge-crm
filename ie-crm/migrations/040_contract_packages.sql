-- 040_contract_packages.sql
-- Multi-form contract packages: a package groups multiple AIR CRE forms
-- (e.g., OFA + BBE + AD) linked to a single deal.

CREATE TABLE IF NOT EXISTS contract_packages (
  package_id   SERIAL PRIMARY KEY,
  deal_id      UUID NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Draft',
  author       TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contract_packages_deal ON contract_packages(deal_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_contract_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contract_packages_set_updated ON contract_packages;
CREATE TRIGGER trg_contract_packages_set_updated
  BEFORE UPDATE ON contract_packages
  FOR EACH ROW
  EXECUTE FUNCTION trg_contract_packages_updated_at();

-- Add package_id + form_order to contracts (individual forms within a package)
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS package_id INTEGER REFERENCES contract_packages(package_id) ON DELETE CASCADE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS form_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contracts_package ON contracts(package_id);

-- Backfill: create a package for each existing orphan contract (no package_id)
DO $$
DECLARE
  r RECORD;
  new_pkg_id INTEGER;
BEGIN
  FOR r IN SELECT * FROM contracts WHERE package_id IS NULL ORDER BY contract_id
  LOOP
    INSERT INTO contract_packages (deal_id, name, status, author, created_at, updated_at)
    VALUES (r.deal_id, r.name, r.status, r.author, r.created_at, r.updated_at)
    RETURNING package_id INTO new_pkg_id;

    UPDATE contracts SET package_id = new_pkg_id, form_order = 0 WHERE contract_id = r.contract_id;
  END LOOP;
END;
$$;
