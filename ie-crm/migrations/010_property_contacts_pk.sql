-- Migration 010: Expand property_contacts PK to include role
-- Same pattern as migration 009 for property_companies
-- Allows same contact to be linked as both owner and broker on same property

BEGIN;

-- 1. Fill NULL roles
UPDATE property_contacts SET role = 'unknown' WHERE role IS NULL;

-- 2. Remove exact duplicates (same property + contact + role)
DELETE FROM property_contacts a USING property_contacts b
  WHERE a.ctid < b.ctid
    AND a.property_id = b.property_id
    AND a.contact_id = b.contact_id
    AND a.role = b.role;

-- 3. Make role NOT NULL with default
ALTER TABLE property_contacts ALTER COLUMN role SET NOT NULL;
ALTER TABLE property_contacts ALTER COLUMN role SET DEFAULT 'unknown';

-- 4. Replace PK
ALTER TABLE property_contacts DROP CONSTRAINT property_contacts_pkey;
ALTER TABLE property_contacts ADD PRIMARY KEY (property_id, contact_id, role);

COMMIT;
