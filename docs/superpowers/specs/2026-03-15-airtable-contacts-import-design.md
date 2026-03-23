# Airtable Contacts CSV Import — Design Spec

**Date:** 2026-03-15
**Source:** `/Users/davidmudgejr/Downloads/Contacts-All (DON'T DELETE) (1).csv`
**Rows:** 13,255 real contacts (2 test rows skipped)
**Existing DB:** 6,564 contacts, 16,427 companies, 10,051 properties, 57 campaigns

## Section 1: Architecture

Same proven pattern as lease comp and Airtable property imports:

- **`airtableContactParser.js`** — Parse CSV rows into canonical shape
- **`airtableContactEngine.js`** — Core engine (match/create/enrich contacts, link to properties + companies + campaigns)
- **`migrate-airtable-contacts.js`** — CLI with `--dry-run`, `--live`, `--start-row=N`

Batch commits every 500 rows with SAVEPOINT-per-row inside each batch. Resume support via `--start-row`.

### Fan-out per row

One CSV row touches up to 6 tables:

```
CSV Row → contacts (create or enrich)
        → companies (fuzzy match, link via contact_companies)
        → properties (fuzzy match Owner Properties addresses, link via property_contacts role='owner')
        → campaigns (find or create, link via campaign_contacts)
        → interactions (Notes + Interactions → activity records, link via interaction_contacts)
        → action_items (Action Items → tasks, link via action_item_contacts)
```

## Section 2: Column Mapping

### → contacts table (create or enrich)

| CSV Column | DB Column | Transform |
|-----------|-----------|-----------|
| Full Name | full_name | cleanStr, primary match key |
| First Name | first_name | cleanStr |
| Type | type | cleanStr, multi-value kept as-is ("Owner,Tenant") |
| Title | title | cleanStr |
| Born | born | cleanDate (maps to `born` column, NOT `date_of_birth` which is TPE-only) |
| Work Address | work_address | cleanStr |
| Home Address | home_address | cleanStr |
| Email | email | cleanStr, lowercase |
| 2nd Email | email_2 | cleanStr, lowercase |
| 3rd Email | email_3 | cleanStr, lowercase |
| Email HOT | email_hot | Boolean (BOOLEAN in DB) — parser must emit JS `true`/`false`; any truthy value including emoji = `true` |
| Email Kickback? | email_kickback | Boolean |
| Phone 1 | phone_1 | cleanStr |
| Phone 2 | phone_2 | cleanStr |
| Phone 3 | phone_3 | cleanStr |
| Phone HOT | phone_hot | Boolean (BOOLEAN in DB) — parser must emit JS `true`/`false`; any truthy value including emoji = `true` |
| LinkedIn | linkedin | cleanStr (URL) |
| Office/Ind | property_type_interest | cleanStr ("Industrial" or "Office") |
| Client Level | client_level | cleanStr ("Dave Top 100", "Jr Top 100", etc.) |
| Data Source | data_source | cleanStr |
| Contact Verified | overflow.contact_verified | Boolean — column was dropped in migration 001, stored in JSONB overflow via `jsonb_set()` |
| Last contacted | last_contacted | cleanDate |
| Follow up | follow_up | cleanDate |
| White Pages Link | white_pages_url | cleanStr (URL) |
| Been Verified Link | been_verified_url | cleanStr (URL) |
| Zoom Info Link | zoom_info_url | cleanStr (URL) |

### → companies (fuzzy match + link)

| CSV Column | Action |
|-----------|--------|
| Companies | Split comma-separated, normalizeCompanyName(), fuzzy match against 16,427 existing companies (≥85%), create if no match, link via contact_companies junction |

### → properties (fuzzy match Owner Properties + link)

| CSV Column | Action |
|-----------|--------|
| Owner Properties | Split comma-separated addresses, normalizeAddress(), fuzzy match against 10,051 existing properties (≥95% auto, 90-94% review), link via property_contacts with role='owner' |

### → campaigns (find or create + link)

| CSV Column | Action |
|-----------|--------|
| Campaigns | Split comma-separated, case-insensitive exact match first, then fuzzy ≥90%, create new if no match (status='imported'), link via campaign_contacts junction |

### → interactions

| CSV Column | DB Table | Notes |
|-----------|----------|-------|
| Notes | interactions | Parse dates, type='note', source='airtable_contact_import', link via interaction_contacts |
| Interactions | interactions | Parse dates, type='interaction', source='airtable_contact_import', link via interaction_contacts |

### → action_items

| CSV Column | DB Table | Notes |
|-----------|----------|-------|
| Action Items | action_items | Parse text, link via action_item_contacts, status='pending' |

### Skipped columns

| Column | Reason |
|--------|--------|
| Phone (col 34) | Duplicate of Phone 1 |
| Target for | Unclear usage, low data |
| JR Deals | Linked field reference to deals — skip (same as BP Junior Deals) |

## Section 3: Matching & Dedup Strategy

### Contact Matching (primary)

- `normalizeContactName()` strips CRE designations (SIOR, CCIM, etc.)
- Levenshtein similarity: ≥90% → auto-match, 85-89% → match but flag ⚠️ REVIEW
- **Disambiguation:** If multiple contacts share same normalized name, prefer the one linked to the same company (from CSV "Companies" field)
- **Dedup within CSV:** Same full name appearing multiple times → process first occurrence, enrich on subsequent

### Company Matching

- `normalizeCompanyName()` strips Inc/LLC/Corp
- ≥85% similarity → match against existing 16,427 companies
- Create if no match

### Property Matching (Owner Properties)

- Split comma-separated addresses
- `normalizeAddress()` + Levenshtein against 10,051 existing properties
- ≥95% → auto-match, 90-94% → match + flag ⚠️ REVIEW
- Link via `property_contacts` with role='owner'

### Campaign Matching

- Case-insensitive exact match first (fastest)
- Then fuzzy match ≥90% for slight variations
- Create new campaign if no match — set `status: 'imported'`
- Clean up formatting quirks (quotes spanning CSV cells)

### Enrich-only rule

Fill blanks on existing contacts, never overwrite. If a contact already has a phone number from a previous import, the CSV phone doesn't replace it. This CSV is the richest source of contact details (phone, email, LinkedIn, title), so most fields will be fills since previous imports only created contacts by name.

## Section 4: Notes & Interactions

### Notes field → interactions table

- Parse dates if present in text (patterns: M/D/YY, MM/DD/YYYY, Mon DD YYYY)
- Two-digit year expansion: 24→2024, 99→1999
- If no date found, use import timestamp
- `type = 'note'`, `lead_source = 'airtable_contact_import'`
- Link to contact via `interaction_contacts` junction
- Dedup: skip if exact same notes text already exists for this contact

### Interactions field → interactions table

- Same date parsing as Notes
- `type = 'interaction'`, `lead_source = 'airtable_contact_import'`
- Link to contact via `interaction_contacts` junction
- Dedup: skip if exact same notes text already exists for this contact

### Action Items field → action_items table

- Parse text content into `name` field
- Parse dates if present for `due_date`
- `status = 'pending'`
- Link to contact via `action_item_contacts` junction

## Section 5: Schema Considerations

### Columns that may need migration

Check if these columns exist on the contacts table:
- `work_address` — exists (added in migration 001)
- `home_address` — exists (added in migration 001)
- `date_of_birth` — exists (added in migration 001)
- `email_kickback` — exists (added in migration 001, BOOLEAN)
- `white_pages_url` — exists (added in migration 001)
- `been_verified_url` — exists (added in migration 001)
- `zoom_info_url` — exists (added in migration 001)
- `property_type_interest` — exists (added in migration 001)
- `email_hot` — exists as BOOLEAN (converted in migration 001)
- `phone_hot` — exists as BOOLEAN (converted in migration 001)

### Migration 010: property_contacts PK expansion

The `property_contacts` PK is currently `(property_id, contact_id)` without `role`. Same issue that was fixed for `property_companies` in migration 009. A contact who is both an owner and a broker on the same property would fail. Migration 010 expands the PK:

```sql
BEGIN;
UPDATE property_contacts SET role = 'unknown' WHERE role IS NULL;
DELETE FROM property_contacts a USING property_contacts b
  WHERE a.ctid < b.ctid AND a.property_id = b.property_id AND a.contact_id = b.contact_id AND a.role = b.role;
ALTER TABLE property_contacts ALTER COLUMN role SET NOT NULL;
ALTER TABLE property_contacts ALTER COLUMN role SET DEFAULT 'unknown';
ALTER TABLE property_contacts DROP CONSTRAINT property_contacts_pkey;
ALTER TABLE property_contacts ADD PRIMARY KEY (property_id, contact_id, role);
COMMIT;
```

### Column corrections

- `born` — exists in base schema.sql (NOT `date_of_birth` which is a separate TPE column from migration 008)
- `work_address`, `home_address` — exist in base schema.sql (not migration 001)
- `contact_verified` — was DROPPED in migration 001; use `overflow` JSONB instead
- `email_hot`, `phone_hot` — converted to BOOLEAN in migration 001
- All other columns verified present

### Junction tables

- `contact_companies` (contact_id, company_id) — exists
- `property_contacts` (property_id, contact_id, role) — exists
- `campaign_contacts` (campaign_id, contact_id) — exists
- `interaction_contacts` (interaction_id, contact_id) — exists
- `action_item_contacts` (action_item_id, contact_id) — exists (migration 001)

All junction tables exist. No schema changes required.
