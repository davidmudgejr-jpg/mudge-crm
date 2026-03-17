-- Migration 018: Comp Auto-Sync Triggers
-- Lease comp insert/update → updates companies.lease_exp to latest expiration
-- Sale comp insert/update → updates properties.last_sale_date/last_sale_price if more recent

-- ============================================================
-- 1. Lease Comp → Company lease_exp sync
-- ============================================================

CREATE OR REPLACE FUNCTION sync_lease_exp_from_comp()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire if the comp has a company_id and an expiration_date
  IF NEW.company_id IS NOT NULL AND NEW.expiration_date IS NOT NULL THEN
    UPDATE companies
    SET lease_exp = (
      SELECT MAX(expiration_date)
      FROM lease_comps
      WHERE company_id = NEW.company_id
        AND expiration_date IS NOT NULL
    ),
    updated_at = NOW()
    WHERE company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_lease_exp ON lease_comps;
CREATE TRIGGER trg_sync_lease_exp
  AFTER INSERT OR UPDATE OF expiration_date, company_id
  ON lease_comps
  FOR EACH ROW
  EXECUTE FUNCTION sync_lease_exp_from_comp();

-- ============================================================
-- 2. Sale Comp → Property last_sale_date / last_sale_price sync
-- ============================================================

CREATE OR REPLACE FUNCTION sync_sale_data_from_comp()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire if the comp has a property_id and a sale_date
  IF NEW.property_id IS NOT NULL AND NEW.sale_date IS NOT NULL THEN
    UPDATE properties
    SET last_sale_date = NEW.sale_date,
        last_sale_price = NEW.sale_price,
        updated_at = NOW()
    WHERE property_id = NEW.property_id
      AND (last_sale_date IS NULL OR NEW.sale_date > last_sale_date);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_sale_data ON sale_comps;
CREATE TRIGGER trg_sync_sale_data
  AFTER INSERT OR UPDATE OF sale_date, sale_price, property_id
  ON sale_comps
  FOR EACH ROW
  EXECUTE FUNCTION sync_sale_data_from_comp();

-- ============================================================
-- 3. Handle DELETE — recalculate on comp removal
-- ============================================================

CREATE OR REPLACE FUNCTION resync_lease_exp_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.company_id IS NOT NULL THEN
    UPDATE companies
    SET lease_exp = (
      SELECT MAX(expiration_date)
      FROM lease_comps
      WHERE company_id = OLD.company_id
        AND expiration_date IS NOT NULL
    ),
    updated_at = NOW()
    WHERE company_id = OLD.company_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resync_lease_exp_on_delete ON lease_comps;
CREATE TRIGGER trg_resync_lease_exp_on_delete
  AFTER DELETE ON lease_comps
  FOR EACH ROW
  EXECUTE FUNCTION resync_lease_exp_on_delete();

CREATE OR REPLACE FUNCTION resync_sale_data_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.property_id IS NOT NULL THEN
    UPDATE properties
    SET last_sale_date = sub.sale_date,
        last_sale_price = sub.sale_price,
        updated_at = NOW()
    FROM (
      SELECT sale_date, sale_price
      FROM sale_comps
      WHERE property_id = OLD.property_id
        AND sale_date IS NOT NULL
      ORDER BY sale_date DESC
      LIMIT 1
    ) sub
    WHERE property_id = OLD.property_id;

    -- If no comps remain, null out the fields
    IF NOT FOUND THEN
      UPDATE properties
      SET last_sale_date = NULL,
          last_sale_price = NULL,
          updated_at = NOW()
      WHERE property_id = OLD.property_id
        AND NOT EXISTS (
          SELECT 1 FROM sale_comps
          WHERE property_id = OLD.property_id
            AND sale_date IS NOT NULL
        );
    END IF;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resync_sale_data_on_delete ON sale_comps;
CREATE TRIGGER trg_resync_sale_data_on_delete
  AFTER DELETE ON sale_comps
  FOR EACH ROW
  EXECUTE FUNCTION resync_sale_data_on_delete();
