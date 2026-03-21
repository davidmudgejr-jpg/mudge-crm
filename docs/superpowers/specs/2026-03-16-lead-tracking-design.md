# Lead Tracking for Deals — Design Spec

**Date:** 2026-03-16
**Status:** Approved

## Overview

Add lead tracking to deals so brokers can log incoming leads on listings (who called, from where, how interested) and filter them by interest level. Leads are stored as interactions with `type = 'Lead'` — no new tables needed.

## Section 1: Data Model

### New columns on `interactions` table

`lead_source` already exists on the interactions table. Two new columns need to be added:

```sql
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS lead_status TEXT;    -- New, Contacted, Qualified, Dead
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS lead_interest TEXT;  -- Hot, Warm, Cold
```

All lead columns are nullable. Only populated when `type = 'Lead'`. Existing interactions are unaffected.

### Relationships

Leads link to deals and contacts through existing junction tables:
- `interaction_deals` — links a lead to the deal it's for
- `interaction_contacts` — links a lead to the contact who inquired

No new junction tables needed.

### Valid values

| Column | Options |
|--------|---------|
| `lead_source` | CoStar, Loopnet, Sign Call, Referral, Website, Other |
| `lead_status` | New, Contacted, Qualified, Dead |
| `lead_interest` | Hot, Warm, Cold |

## Section 2: UI Components

### LeadsSection.jsx (`src/components/shared/LeadsSection.jsx`)

New component rendered on `DealDetail.jsx`, placed after `ActivitySection` (before `TasksSection`).

**Layout:**
- Section header: "LEADS" with count badge + "+ Lead" button
- Interest filter pills: Hot (🔥) | Warm (🟢) | Cold (❄️) — click to filter, click again to clear
- Lead cards showing:
  - Contact name (clickable to open contact detail)
  - Date
  - Source tag (colored pill)
  - Note preview (truncated)
  - Interest pill (Hot=yellow, Warm=green, Cold=blue)
  - Status pill (New, Contacted, Qualified, Dead)
- Left border color-coded by interest level:
  - Hot: yellow (#facc15)
  - Warm: green (#4ade80)
  - Cold: blue (#60a5fa)

### "+ Lead" modal

Extends `NewInteractionModal` with `type` pre-set to "Lead". When type is "Lead", three additional fields appear:
- **Lead Source** — dropdown (CoStar, Loopnet, Sign Call, Referral, Website, Other)
- **Lead Status** — dropdown, defaults to "New"
- **Lead Interest** — dropdown, defaults to "Warm"
- **Contact** — contact picker (link existing or quick-add new)
- **Note** — text area for details about the inquiry

The modal's `handleSubmit` must be extended to include `lead_source`, `lead_status`, and `lead_interest` in the `fields` object passed to `createInteraction`.

### typeIcons.js changes

Add `'Lead'` to the `INTERACTION_TYPES` array so it appears in type dropdowns and has an icon.

### DealDetail.jsx changes

- Import and render `LeadsSection` after `ActivitySection` (before `TasksSection`)
- Pass `dealId` prop so it can fetch leads for this deal

### Deals table

- Add `lead_count` as a computed column in the deals list query (subquery counting interactions where type='Lead' linked to each deal)
- Display as a column in the Deals table view

## Section 3: API & Backend

### New endpoint

**`GET /api/deals/:id/leads`**
- Returns interactions where `type = 'Lead'` linked to the deal via `interaction_deals`
- Joins `interaction_contacts` + `contacts` to include contact name
- Ordered by `interaction_date DESC`
- Response shape: `{ leads: [{ interaction_id, interaction_date, notes, lead_source, lead_status, lead_interest, contact_name, contact_id }] }`
- Note: This is a dedicated endpoint — most CRUD goes through the generic `/api/db/query`, but leads need the join logic

### Extended endpoints

The generic CRUD system (`/api/db/query`) already handles INSERT and UPDATE on the interactions table. The `lead_source`, `lead_status`, and `lead_interest` columns will be included automatically since the CRUD system passes through all field keys. No endpoint changes needed for basic create/update.

### Deals list query

Add a subquery to the deals list endpoint:
```sql
(SELECT COUNT(*) FROM interaction_deals id2
 JOIN interactions i2 ON i2.interaction_id = id2.interaction_id
 WHERE id2.deal_id = d.deal_id AND i2.type = 'Lead') AS lead_count
```

## Migration

File: `ie-crm/migrations/012_lead_tracking.sql`

```sql
BEGIN;
-- lead_source already exists on interactions table
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS lead_status TEXT;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS lead_interest TEXT;
-- Partial index for fast lead queries
CREATE INDEX IF NOT EXISTS idx_interactions_lead_type ON interactions(type) WHERE type = 'Lead';
COMMIT;
```

Partial index on `type = 'Lead'` keeps the leads query fast without indexing every interaction.
