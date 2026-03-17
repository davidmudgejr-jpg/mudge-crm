-- Migration 018: Bi-Directional Comp Auto-Sync Triggers
-- Lease comp insert/update → updates companies.lease_exp to latest expiration
-- Sale comp insert/update → updates properties.last_sale_date/last_sale_price if more recent
-- Property sale data update → creates/updates sale comp (reverse sync)
-- Loop guards prevent infinite trigger recursion

-- ============================================================
-- 1. Lease Comp → Company lease_exp sync
-- ============================================================

CREATE OR REPLACE FUNCTION sync_lease_exp_from_comp()
RETURNS TRIGGER AS $$
BEGIN
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
  IF NEW.property_id IS NOT NULL AND NEW.sale_date IS NOT NULL THEN
    -- Only update if more recent (properties has no updated_at column)
    UPDATE properties
    SET last_sale_date = NEW.sale_date,
        last_sale_price = NEW.sale_price
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
-- 3. Property → Sale Comp reverse sync (bi-directional)
-- When property sale data changes, create or update matching sale comp
-- ============================================================

CREATE OR REPLACE FUNCTION sync_sale_comp_from_property()
RETURNS TRIGGER AS $$
BEGIN
  -- Guard: skip if sale data hasn't actually changed (prevents trigger loops)
  IF TG_OP = 'UPDATE'
     AND OLD.last_sale_date IS NOT DISTINCT FROM NEW.last_sale_date
     AND OLD.last_sale_price IS NOT DISTINCT FROM NEW.last_sale_price THEN
    RETURN NEW;
  END IF;

  IF NEW.last_sale_date IS NOT NULL AND NEW.last_sale_price IS NOT NULL AND NEW.last_sale_price > 0 THEN
    IF EXISTS (
      SELECT 1 FROM sale_comps
      WHERE property_id = NEW.property_id
        AND sale_date = NEW.last_sale_date
    ) THEN
      -- Update existing comp
      UPDATE sale_comps
      SET sale_price = NEW.last_sale_price,
          sf = COALESCE(NEW.rba, sf),
          price_psf = CASE WHEN COALESCE(NEW.rba, 0) > 0
                      THEN ROUND(NEW.last_sale_price / NEW.rba, 2)
                      ELSE price_psf END,
          property_type = COALESCE(NEW.property_type, property_type),
          updated_at = NOW()
      WHERE property_id = NEW.property_id
        AND sale_date = NEW.last_sale_date;
    ELSE
      -- Create new sale comp with price_psf auto-calculated
      INSERT INTO sale_comps (
        id, property_id, sale_date, sale_price, sf, price_psf,
        property_type, source, created_at, updated_at
      ) VALUES (
        uuid_generate_v4(),
        NEW.property_id,
        NEW.last_sale_date,
        NEW.last_sale_price,
        NEW.rba,
        CASE WHEN COALESCE(NEW.rba, 0) > 0
             THEN ROUND(NEW.last_sale_price / NEW.rba, 2)
             ELSE NULL END,
        NEW.property_type,
        'Property Sync',
        NOW(),
        NOW()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_sale_comp_from_property ON properties;
CREATE TRIGGER trg_sync_sale_comp_from_property
  AFTER INSERT OR UPDATE OF last_sale_date, last_sale_price
  ON properties
  FOR EACH ROW
  EXECUTE FUNCTION sync_sale_comp_from_property();

-- ============================================================
-- 4. Handle DELETE — recalculate on comp removal
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
        last_sale_price = sub.sale_price
    FROM (
      SELECT sale_date, sale_price
      FROM sale_comps
      WHERE property_id = OLD.property_id
        AND sale_date IS NOT NULL
      ORDER BY sale_date DESC
      LIMIT 1
    ) sub
    WHERE property_id = OLD.property_id;

    IF NOT FOUND THEN
      UPDATE properties
      SET last_sale_date = NULL,
          last_sale_price = NULL
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

-- ============================================================
-- 5. Seed sale comps from existing property data (one-time)
-- ============================================================
-- Run separately after triggers are created:
-- INSERT INTO sale_comps (id, property_id, sale_date, sale_price, sf, price_psf, property_type, source, created_at, updated_at)
-- SELECT uuid_generate_v4(), p.property_id, p.last_sale_date, p.last_sale_price, p.rba,
--        CASE WHEN COALESCE(p.rba, 0) > 0 THEN ROUND(p.last_sale_price / p.rba, 2) ELSE NULL END,
--        p.property_type, 'Property Sync', NOW(), NOW()
-- FROM properties p
-- WHERE p.last_sale_date IS NOT NULL AND p.last_sale_price IS NOT NULL AND p.last_sale_price > 0
--   AND NOT EXISTS (SELECT 1 FROM sale_comps sc WHERE sc.property_id = p.property_id AND sc.sale_date = p.last_sale_date);
