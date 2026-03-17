# Schema Refresh & Auto-Sync Triggers Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the stale schema.sql to reflect all 17 migrations, add DB triggers so lease comps auto-update `companies.lease_exp` and sale comps auto-update `properties.last_sale_date/last_sale_price`, and add `costar_star_rating` to the Properties page columns.

**Architecture:** Migration 018 adds two PostgreSQL trigger functions + triggers on `lease_comps` and `sale_comps` tables. Schema.sql is regenerated via `pg_dump --schema-only` from the live Neon DB. CoStar Star Rating is a frontend-only change (column already exists in DB and ALLOWED_COLS).

**Tech Stack:** PostgreSQL 17 (Neon), Express/Node.js, React (Vite)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `ie-crm/migrations/018_comp_auto_sync.sql` | Create | DB triggers for lease comp → company and sale comp → property sync |
| `ie-crm/schema.sql` | Replace | Full schema dump from live Neon DB (reflects migrations 001-017 + 018) |
| `ie-crm/src/pages/Properties.jsx` | Modify (line ~86) | Add `costar_star_rating` column to ALL_COLUMNS array |

---

## Task 1: Write Migration 018 — Comp Auto-Sync Triggers

**Files:**
- Create: `ie-crm/migrations/018_comp_auto_sync.sql`

- [ ] **Step 1: Create the migration file with lease comp trigger**

```sql
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
```

- [ ] **Step 2: Run the migration against Neon**

Run: `psql "$DATABASE_URL" -f ie-crm/migrations/018_comp_auto_sync.sql`
Expected: `CREATE FUNCTION` x4, `DROP TRIGGER` x4, `CREATE TRIGGER` x4 — no errors.

- [ ] **Step 3: Verify triggers exist**

Run: `psql "$DATABASE_URL" -c "SELECT trigger_name, event_manipulation, event_object_table FROM information_schema.triggers WHERE trigger_name LIKE 'trg_%comp%' OR trigger_name LIKE 'trg_%lease%sale%' ORDER BY trigger_name;"`
Expected: 4 triggers listed (trg_sync_lease_exp, trg_resync_lease_exp_on_delete, trg_sync_sale_data, trg_resync_sale_data_on_delete)

---

## Task 2: Refresh schema.sql from Live DB

**Files:**
- Replace: `ie-crm/schema.sql`

- [ ] **Step 1: Dump the live schema**

Run: `pg_dump "$DATABASE_URL" --schema-only --no-owner --no-privileges --no-comments > ie-crm/schema.sql.new`
Expected: File created with full schema including all migrations + new triggers.

- [ ] **Step 2: Review the dump for secrets/connection info**

Verify the dump doesn't contain any connection strings or passwords. `pg_dump --schema-only` should be clean, but check the header comments.

- [ ] **Step 3: Replace the old schema.sql**

Run: `mv ie-crm/schema.sql.new ie-crm/schema.sql`

- [ ] **Step 4: Verify schema.sql contains new triggers**

Run: `grep -c 'sync_lease_exp\|sync_sale_data' ie-crm/schema.sql`
Expected: At least 4 matches (the function + trigger definitions).

---

## Task 3: Add CoStar Star Rating to Properties Page

**Files:**
- Modify: `ie-crm/src/pages/Properties.jsx` (~line 86, after the `building_opex` column)

- [ ] **Step 1: Add `costar_star_rating` column to ALL_COLUMNS**

In `ie-crm/src/pages/Properties.jsx`, add after the `building_opex` entry (around line 84):

```javascript
  { key: 'costar_star_rating', label: 'CoStar Rating', defaultWidth: 100, format: 'number', defaultVisible: false },
```

Place it in the Financial section, after `ops_expense_psf` / before `loan_amount`.

- [ ] **Step 2: Verify in browser**

Open Properties page → Column menu (⋮) → scroll to find "CoStar Rating" → toggle visible → confirm it renders values (numbers 1-5 or `—` for null).

---

## Task 4: Commit

- [ ] **Step 1: Stage and commit all changes**

```bash
git add ie-crm/migrations/018_comp_auto_sync.sql ie-crm/schema.sql ie-crm/src/pages/Properties.jsx
git commit -m "feat: add comp auto-sync triggers + refresh schema + CoStar rating on Properties

- Migration 018: DB triggers sync lease comp expiration → companies.lease_exp
  and sale comp sale date/price → properties.last_sale_date/last_sale_price
- Delete triggers recalculate on comp removal
- schema.sql refreshed from live Neon DB (reflects migrations 001-018)
- CoStar Star Rating column added to Properties page (hidden by default)"
```
