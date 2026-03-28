-- 039_contracts.sql
-- AIR CRE Contracts module: stores contract packages linked to deals

CREATE TABLE IF NOT EXISTS contracts (
  contract_id    SERIAL PRIMARY KEY,
  deal_id        UUID NOT NULL REFERENCES deals(deal_id) ON DELETE CASCADE,
  form_code      TEXT NOT NULL,           -- 'OFA', 'STN', 'BBE', etc.
  template_id    INTEGER NOT NULL,        -- AireaDocTemplateID from AIR CRE
  name           TEXT NOT NULL,           -- User-assigned name (e.g., "23447 Cajalco Rd Purchase")
  status         TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Final')),
  field_values   JSONB NOT NULL DEFAULT '{}',  -- { "7": "23447 Cajalco Road" } keyed by AnnotationID
  author         TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_deal   ON contracts(deal_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_form   ON contracts(form_code);

-- Auto-update updated_at on changes
CREATE OR REPLACE FUNCTION trg_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contracts_set_updated ON contracts;
CREATE TRIGGER trg_contracts_set_updated
  BEFORE UPDATE ON contracts
  FOR EACH ROW
  EXECUTE FUNCTION trg_contracts_updated_at();
