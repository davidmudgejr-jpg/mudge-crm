-- Migration 043: Link Orphan Interactions + Reclassify
-- Fixes two Houston audit items:
-- 1. Reclassifies 890 "interaction" typed records as "Note" (already applied live)
-- 2. Links orphan interactions to contacts via company and property paths
-- Idempotent (safe to re-run).

-- ============================================================
-- PART 1: Reclassify "interaction" → "Note"
-- ============================================================

UPDATE interactions SET type = 'Note' WHERE type = 'interaction';

-- Tighten CHECK constraint (remove temporary "interaction" allowance)
ALTER TABLE interactions DROP CONSTRAINT IF EXISTS chk_interaction_type;
ALTER TABLE interactions ADD CONSTRAINT chk_interaction_type
  CHECK (type IS NULL OR type IN (
    'Lead', 'Phone Call', 'Cold Call', 'Voicemail',
    'Outbound Email', 'Inbound Email', 'Cold Email', 'Check in Email',
    'Email Campaign', 'Text', 'Meeting', 'Tour', 'Door Knock',
    'Drive By', 'Snail Mail', 'Offer Sent', 'Survey Sent', 'BOV Sent',
    'Call', 'Email', 'Note', 'LinkedIn', 'Other'
  ));

-- ============================================================
-- PART 2: Link orphan interactions via company → contact path
-- If an interaction is linked to a company, and that company has
-- exactly 1 linked contact, link the interaction to that contact.
-- (Single-contact companies = high confidence)
-- ============================================================

INSERT INTO interaction_contacts (interaction_id, contact_id)
SELECT DISTINCT i.interaction_id, sc.contact_id
FROM interactions i
JOIN interaction_companies ico ON ico.interaction_id = i.interaction_id
JOIN (
  -- Companies with exactly 1 linked contact (high confidence)
  SELECT cc.company_id, (array_agg(cc.contact_id))[1] AS contact_id
  FROM contact_companies cc
  GROUP BY cc.company_id
  HAVING count(*) = 1
) sc ON sc.company_id = ico.company_id
WHERE NOT EXISTS (
  SELECT 1 FROM interaction_contacts ic
  WHERE ic.interaction_id = i.interaction_id
)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 3: Link orphan interactions via property → contact path
-- If an interaction is linked to a property, and that property has
-- exactly 1 linked contact with role='owner', link to that contact.
-- ============================================================

INSERT INTO interaction_contacts (interaction_id, contact_id)
SELECT DISTINCT i.interaction_id, pc.contact_id
FROM interactions i
JOIN interaction_properties ip ON ip.interaction_id = i.interaction_id
JOIN (
  -- Properties with exactly 1 owner contact
  SELECT pc2.property_id, (array_agg(pc2.contact_id))[1] AS contact_id
  FROM property_contacts pc2
  WHERE pc2.role = 'owner'
  GROUP BY pc2.property_id
  HAVING count(*) = 1
) pc ON pc.property_id = ip.property_id
WHERE NOT EXISTS (
  SELECT 1 FROM interaction_contacts ic
  WHERE ic.interaction_id = i.interaction_id
)
ON CONFLICT DO NOTHING;
