# Session Handoff — Column Mapping & Schema Alignment

> Written: 2026-03-06
> Previous session: "Set up development environment for React and server"
> Next task: **Deals tab column mapping**, then batch ALTER TABLE for all tabs

---

## What We're Doing

Walking through every Airtable tab, screenshotting columns, cross-referencing against `schema.sql` and each page's `ALL_COLUMNS` array, identifying gaps, then doing one clean batch `ALTER TABLE` session to add all missing columns at once. After schema changes, update `ALL_COLUMNS` arrays and UI wiring in each page component.

### Architecture Decision (locked in)

**Hardcoded Postgres schema** — NOT Airtable-style EAV. Reasons:
- Real data types with proper indexing
- Native SQL math for formulas
- Custom rendering in React
- Developer on call (Claude) means no need for runtime schema flexibility
- Keep current custom fields system for quick ad-hoc experiments only
- Option C (EAV migration) parked as future consideration for CSV import feature

---

## Completed Work (uncommitted — 8 files changed)

### Column Menu Fix (ready to commit)

Files modified:
- `ie-crm/src/components/shared/CrmTable.jsx` — ColumnHeader always renders Rename/Hide/Delete. `deleteDisabled` prop greys out Delete with tooltip "System fields cannot be deleted". System columns get `deleteDisabled`, custom columns get `onHide` + `onDelete`.
- `ie-crm/src/hooks/useCustomFields.js` — Added `hideField`, `showField`, `toggleCustomFieldVisibility` with localStorage persistence. `customColumns` now filters out hidden fields; `allCustomColumns` returns all for the toggle menu.
- `ie-crm/src/components/shared/ColumnToggleMenu.jsx` — Added "Custom Fields" section showing custom columns with checkbox toggles. Counter includes both regular + custom columns.
- `ie-crm/src/pages/Properties.jsx` — Wired up new exports
- `ie-crm/src/pages/Contacts.jsx` — Wired up new exports
- `ie-crm/src/pages/Companies.jsx` — Wired up new exports
- `ie-crm/src/pages/Deals.jsx` — Wired up new exports
- `ie-crm/src/pages/Campaigns.jsx` — Wired up new exports

**Verified:** No build errors, all 5 tabs tested, consistent 3-option menu, delete disabled for system fields, hide/restore roundtrip works.

---

## Tab Mapping Status

### Properties — FULLY MAPPED

**Already in Schema (29 columns):**
property_address, property_name, year_built, features, zoning, last_sale_date, last_sale_price, rba, building_class, land_area_ac, land_sf, far, city, county, state, zip, property_type, contacted (BOOLEAN — needs change to TEXT[]), percent_leased, column_spacing, sprinklers, construction_material, power, ceiling_ht, number_of_loading_docks, drive_ins, debt_date, loan_amount, plsf, cap_rate, vacancy_pct, tenancy, off_market_deal, market_name, submarket_name, submarket_cluster, building_park, notes, costar_url, owner_name

**Schema Changes:**
- `contacted` → change from BOOLEAN to TEXT[] (multi-select with 14 options)
  - Options: Contacted Owner, Not Contacted, Broker/Not worth it, Emailed Owner/Tenant, Cold called, Left VM, Contacted Tenant, Contacted Owner & Tenant, Listing, Doorknocked, BOV Sent, Offer Sent, Letter Sent, Met with Owner

**~25 New Columns to Add:**

| Airtable Column | Schema Name | Type | Notes |
|---|---|---|---|
| Parking Ratio | `parking_ratio` | NUMERIC | e.g. 2.25 |
| Owner Type | `owner_type` | TEXT | "Owner User" etc. |
| Owner Contact | `owner_contact` | TEXT | Name of contact at owner company |
| Building Tax | `building_tax` | TEXT | "2021 Tax @ $0.58/sf" format (also has Prop 13 formula — see Formulas) |
| Building Operating Expenses | `building_opex` | TEXT | Same format as tax |
| Leasing Company | `leasing_company` | TEXT | Broker company name |
| Broker Contact | `broker_contact` | TEXT | Broker person name |
| For Sale Price | `for_sale_price` | NUMERIC | Currency |
| Ops Expense Per SF | `ops_expense_psf` | NUMERIC | Currency |
| Sewer | `sewer` | TEXT | |
| Water | `water` | TEXT | |
| Gas | `gas` | TEXT | |
| Heating | `heating` | TEXT | |
| Total Available SF | `total_available_sf` | NUMERIC | |
| Direct Available SF | `direct_available_sf` | NUMERIC | |
| Direct Vacant Space | `direct_vacant_space` | NUMERIC | |
| Number of Cranes | `number_of_cranes` | INT | |
| Rail Lines | `rail_lines` | TEXT | |
| Parcel Number | `parcel_number` | TEXT | APN format "0209-151-50" |
| Landvision | `landvision_url` | TEXT | URL |
| SB County Zoning | `sb_county_zoning` | TEXT | |
| Google Maps link | `google_maps_url` | TEXT | URL |
| Zoning Map | `zoning_map_url` | TEXT | URL |
| Listing | `listing_url` | TEXT | URL |
| Average Weighted Rent | `avg_weighted_rent` | NUMERIC | Raw Costar number |
| Building Image Path | `building_image_path` | TEXT | Phase 1: placeholder. Phase 2: Costar PDF extraction |
| Latitude | `latitude` | NUMERIC | For distance-based comp queries, pullable from CoStar |
| Longitude | `longitude` | NUMERIC | For distance-based comp queries, pullable from CoStar |

**Column Aliases (not new columns — just mappings):**
- `building_sqft` in ALL_COLUMNS → maps to `rba` in schema (same thing, Costar calls it RBA)
- `lot_sqft` in ALL_COLUMNS → maps to `land_sf` in schema

**Linked Record Roles (junction tables, NOT new columns):**
- Company Tenants → `property_companies` role='tenant'
- Company Owner → `property_companies` role='owner'
- Leasing Company → `property_companies` role='leasing'
- Owner Contact → `property_contacts` role='owner'
- Broker Contact → `property_contacts` role='broker'

**Formulas / Computed Columns:**
- `google_address` = concatenation of `address, city, state, zip`
- PLSF = `last_sale_price / land_sf` (already exists as `plsf`, could be live formula)
- Building Tax (Prop 13): `assessed_value = last_sale_price * (1.02 ^ years_since_sale)`, `annual_tax = assessed_value * tax_rate`, `tax_psf_month = annual_tax / rba / 12`. Tax rate stored as a setting (varies by city/county).

**Attachments (future — not DB columns):**
- Image → local file storage at `~/ie-crm-files/properties/{id}/`
- Files → multiple file attachments, needs file storage approach (local filesystem or S3)

---

### Contacts — FULLY MAPPED

**Already in Schema (well covered):**
Full Name, First Name, Type, Title, Email, 2nd Email, 3rd Email, Phone 1/2/3, Home Address, Work Address, Born, Age, Notes, LinkedIn, Follow up, Last contacted, Tags

**Linked Records (junction tables already exist):**
- Interactions → `interaction_contacts`
- Companies → `contact_companies`
- Campaigns → `campaign_contacts`
- Owner Properties → `property_contacts`
- JR Deals → `deal_contacts`

**New Columns to Add:**

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| Email Kickback? | `email_kickback` | BOOLEAN | Email bounced — don't email again |
| White Pages Link | `white_pages_url` | TEXT | URL |
| Been Verified Link | `been_verified_url` | TEXT | URL |
| Zoom Info Link | `zoom_info_url` | TEXT | URL |

**Schema Changes:**
- `email_hot` → change from TEXT to BOOLEAN (fire emoji = confirmed correct email)
- `phone_hot` → change from TEXT to BOOLEAN (fire emoji = confirmed correct phone)
- Remove `contact_verified` column (not needed)

**New Table Needed:**
- `action_items` — see full mapping below in Action Items section

---

### Action Items — FULLY MAPPED

Airtable table: "Action Items" (121 records)

**Verified via Airtable API** — all 19 fields inspected, field types confirmed.

**Team Members (Responsibility options):**
- Dave Mudge (dmudge@leeriverside.com)
- Missy (sarahmudgie@gmail.com — Sarah Mudge, nickname = Missy)
- David Mudge Jr (dmudgejr@leeriverside.com)
- Houston (future — Claude as team member for automated tasks)

**Schema — `action_items` table:**

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| Name | `name` | TEXT NOT NULL | Task description |
| Notes | `notes` | TEXT | Freeform rich text |
| Notes on Date | `notes_on_date` | TEXT | Context about the date/timeline (e.g., "3/19/24 called him - see interactions") |
| Responsibility | `responsibility` | TEXT[] | Multi-select: Dave Mudge, Missy, David Mudge Jr, Houston |
| High Priority | `high_priority` | BOOLEAN DEFAULT false | Checkbox |
| Status | `status` | TEXT DEFAULT 'Todo' | 7 options (see below) |
| Due Date | `due_date` | DATE | Calendar views use this as "Action Date" |
| Date Completed | `date_completed` | TIMESTAMP | Stored when status→Done (NOT recomputed like Airtable's broken formula) |
| — | `created_at` | TIMESTAMP DEFAULT NOW() | Proper created time (Airtable's was a hack) |
| Source | `source` | TEXT DEFAULT 'manual' | 'manual', 'houston_tpe', 'houston_lease', 'houston_general' |
| — | `updated_at` | TIMESTAMP DEFAULT NOW() | |

**Status Options (7):**

| Status | Color | Use |
|---|---|---|
| Todo | red | Default tasks |
| Reminders | blue | Recurring/reminder items |
| In progress | yellow | Currently working on |
| Done | green | Completed |
| Dead | green-alt | Abandoned |
| Email | cyan | Email-related tasks |
| Needs and Wants | purple | Client requirement tracking |

**Junction Tables (4 new):**
- `action_item_contacts` (action_item_id, contact_id) — replaces Airtable "Contact" link
- `action_item_properties` (action_item_id, property_id) — replaces "Properties" link
- `action_item_deals` (action_item_id, deal_id) — replaces 3 separate Airtable links: Dave Deals, JR Deals, SD Deals (all consolidated into one deals table)
- `action_item_companies` (action_item_id, company_id) — replaces "Companies" link

**Lookups (computed at query time, not stored):**
- Listing (from Properties) → pulled via `action_item_properties` JOIN

**Dropped (not needed in Postgres):**
- `REcord Id` — we have UUIDs
- `Last Modified Time` — `updated_at` covers this
- `Jr Deals copy` — junk/leftover field

**Airtable Data Quality Issues Found:**
- "Created" field = `LAST_MODIFIED_TIME({Name})` — not real created time, just when name was last edited
- "Date Completed" = `IF(Status='Done', TODAY(), BLANK())` — resets to today every time you view it, never stores actual completion date
- Three separate deal links (Dave Deals, JR Deals, SD Deals) because Airtable has 3 deal tables — we consolidate to one

**UI Inspiration:** Apple Reminders app — clean list UI with checkboxes, due dates, priority flags, grouped by status. Shared across family team members with filtered views per person.

**Views to Replicate:**
- Today's Items (due_date = today or overdue)
- All Action Items (unfiltered)
- Per-person filtered views (Dave, Missy, David Jr, Houston)
- Calendar view (using due_date)

---

### Companies — FULLY MAPPED

**Already in Schema (nearly everything):**
Company Name, Company Type, Industry Type, Website, SF, Employees, Revenue, Company Growth, Company HQ, Lease Exp, Lease Months Left, Move In Date, Notes, City

**Linked Records (junction tables already exist):**
- Contacts → `contact_companies`
- Jr Deals → `deal_companies`
- Property (TENANT) → `property_companies` role='tenant'
- Property (OWNER) → `property_companies` role='owner'
- Interactions → `interaction_companies`
- Action Items → new table (same one from Contacts)

**Lookups (computed from linked records, not stored):**
- City (from Property) → pulled via junction at query time
- RBA (from Property TENANT) → pulled via junction at query time

**New Columns to Add:**

| Column | Schema Name | Type |
|---|---|---|
| Tenant SIC | `tenant_sic` | TEXT |
| Tenant NAICS | `tenant_naics` | TEXT |
| Suite | `suite` | TEXT |

---

### Deals — FULLY MAPPED

Airtable table: "Jr Deal Tracker" (207 records)

**Already in Schema (17 columns):**
deal_name, deal_type, status, deal_source (needs TEXT[]), repping (needs TEXT[]), term (needs INT), rate, sf, price, commission_rate, gross_fee_potential, net_potential, close_date, important_date (needs TIMESTAMP), deal_dead_reason (needs TEXT[]), notes, priority_deal

**Schema Type Changes (5):**

| Column | Current | New | Reason |
|---|---|---|---|
| `deal_source` | TEXT | TEXT[] | 22-option multiselect: Sarah, Mat/Ryan, Dave, Doorknock, Relationship, Referral, Loopnet, Email Campaign, Cold Email, Cold Call, Outside Broker, Creativity, Snailmail, Existing Tenant, Previous Deal, Sign Call, Sent Purchase Offer, Walk In, Reid, Listing, BOV, Lease vs Buy Analysis |
| `repping` | TEXT | TEXT[] | Multiselect: Tenant, Landlord, Buyer, Seller |
| `term` | TEXT | INT | Months |
| `deal_dead_reason` | TEXT | TEXT[] | 14-option multiselect: Unqualified, Unlucky, Client renewed, Radio Silent, Never got ahold of, Found Space w/o our help, Working with another broker, Not Interested, Lost listing to another broker, Didn't want to pay commission, No Money, Fired off listing, Deal didn't make sense for client, Too difficult of requirement |
| `important_date` | DATE | TIMESTAMP | Has time component in Airtable |

**New Columns to Add (3):**

| Column | Type | Notes |
|---|---|---|
| `increases` | NUMERIC | Annual rent escalation % (e.g. 0.03 = 3%) |
| `escrow_url` | TEXT | URL to escrow docs |
| `surveys_brochures_url` | TEXT | URL |

**Status Options (update STATUS_COLORS in Deals.jsx):**
Active, Lead, Prospect, Long Leads, Closed, Deal fell through, Dead Lead
(replaces: Prospecting, Active, Under Contract, Closed, Dead)

**Formulas — Compute Live (not stored):**

Decision: **Compute live in SQL** — all formulas are deterministic, 207 rows = zero perf concern.
Inputs stored: `sf`, `rate`, `term`, `increases`, `commission_rate`, `deal_type`

| Display Name | Calculation |
|---|---|
| Price | SF × rate (for sale/buy; rate = price per SF) |
| Team Gross (Lease) | SF × commission_rate × total_lease_value. Total lease value = rate × 12 × geometric series for annual escalations over term months. Each full year: rate escalates by `increases` %. Remaining months at final escalated rate. |
| Team Gross (Sale/Buy) | price × commission_rate |
| Individual Member Gross | team_gross / 3 (3-person team) |
| Individual Member Net | team_gross / 3 × 0.75 (user + sister's net share) |

Existing `gross_fee_potential` and `net_potential` columns can stay in schema for caching/override but primary display should be computed. `price` column stays for same reason.

**Linked Records:**
- Contact link (multi) → `deal_contacts` ✅ exists
- Company → `deal_companies` ✅ exists
- Properties → `deal_properties` ✅ exists
- Interactions → wired via `getDealInteractions()` ✅ exists
- Action Items → `action_item_deals` ✅ mapped (see Action Items section)

**Removed from mapping (user confirmed not needed):**
- ~~Important notes~~ (separate column) — not needed
- ~~Sarah Action Items~~ — redundant with Action Items linked record
- ~~Working With~~ (2nd contact link) — not needed
- ~~Contacts~~ (3rd contact link) — not needed

**Notes/Updates → Interactions:**
The Airtable "Notes/Updates" field (running dated journal) maps conceptually to Interaction records. The `notes` column stays for freeform text.

**Attachments (future):**
- Photo, Documents, Brochure → file storage at `~/ie-crm-files/deals/{id}/`

---

### Campaigns — FULLY MAPPED

Airtable table: "Campaigns" (155 records)

**Already in Schema (6 columns):**
name, notes, type, status, sent_date, modified

**New Columns to Add (2):**

| Column | Type | Notes |
|---|---|---|
| `assignee` | TEXT | Team member running campaign ("Sarah Mudge", "David Mudge Jr") |
| `day_time_hits` | TEXT | Email performance / open tracking notes |

**Status Options:** Not sent, Sent (plus null/empty)
**Type Options:** Email, Snail Mail, Calls

**Formulas (compute live):**
- Days Since: `CURRENT_DATE - sent_date` (only when status = 'Sent')

**Linked Records:**
- Contacts (multi) → `campaign_contacts` ✅ exists
- ~~Interactions~~ — not needed, campaigns are for contact list organization

**Lookups (computed from junction, not stored):**
- Email (from Contacts) → pulled via `campaign_contacts` JOIN
- Work Address (from Contacts) → same

**Attachments (future):**
- File → file storage at `~/ie-crm-files/campaigns/{id}/`

---

### Interactions — REVIEWED (schema mostly complete, minor additions)

Airtable table: "Interactions" (7,271 records)

**Already in Schema (covers core well):**
type, subject, date, notes, email_heading, email_body, follow_up, follow_up_notes, lead_source, team_member, created_at

**Junction tables all exist:**
interaction_contacts, interaction_properties, interaction_deals, interaction_companies

**New Columns to Add (2):**

| Column | Type | Notes |
|---|---|---|
| `email_url` | TEXT | URL link back to email in Outlook/365 |
| `email_id` | TEXT | Email address used for the interaction |

**Schema Type Change (1):**
- `type` stays TEXT but should support multiselect (TEXT[]? or keep single?) — Airtable has it as multiselect but most entries use a single type. Recommend keeping as TEXT (single select) for simplicity.

**Type Options (17 — expanded from current 7):**
Phone Call, Cold Call, Voicemail, Outbound Email, Inbound Email, Cold Email, Check in Email, Email Campaign, Text, Meeting, Tour, Door Knock, Drive By, Snail Mail, Offer Sent, Survey Sent, BOV Sent

Dropped: Lead (status not action), Christmas Card (use Snail Mail + note)

**Team Member Attribution:**
- `team_member` already in schema ✅
- Decision: team_member on Interactions + `assignee` on Campaigns. No team tracking on entities (Contacts, Properties, Companies, Deals) — keep it clean.

**Future: Email Automation**
- Webhook-based email capture: automatically log inbound/outbound emails as Interactions, linked to Contact by email address match. Full email history per contact. High-value feature for later.

---

### Comps — FULLY MAPPED (NEW TABLES)

**Two tables backing one "Comps" page** — Lease Comps and Sale Comps have fundamentally different data shapes, so they're separate tables. UI shows a toggle: "Lease Comps | Sale Comps" within one tab.

**Verified against:** Company database CSV export (Lee & Associates internal) and CoStar PowerBroker Lease comp exports. ~48+ rows per export, all IE industrial market.

#### `lease_comps` table

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| — | `id` | UUID PK | |
| — | `property_id` | FK → properties | Match by address on CSV import |
| — | `company_id` | FK → companies | Tenant company link |
| Tenant Name | `tenant_name` | TEXT | Raw name from CSV (kept even if company linked) |
| Property Type | `property_type` | TEXT | Industrial, Office — snapshot at time of lease |
| Space Use | `space_use` | TEXT | Mfg/Dist, Multi, etc. |
| Space Type | `space_type` | TEXT | Direct, Sublease, Relet |
| Square Footage Leased | `sf` | NUMERIC | |
| Lease RBA | `building_rba` | NUMERIC | Total building SF at time of lease |
| Floor/Suite # | `floor_suite` | TEXT | Ste B, Ste 103 & 104, etc. |
| Sign Date | `sign_date` | DATE | When lease was signed |
| Commencement Date | `commencement_date` | DATE | When lease starts |
| Move-In Date | `move_in_date` | DATE | Actual move-in (can differ) |
| Expiration Date | `expiration_date` | DATE | When lease ends |
| Lease Term | `term_months` | INT | 12, 24, 36, 60, 84 months |
| Contract Rent | `rate` | NUMERIC | $/SF/month (e.g. 1.25) |
| Escalations | `escalations` | NUMERIC | Annual % (e.g. 0.03 = 3%) |
| Rent Type | `rent_type` | TEXT | NNN, GRS (Gross), MGR (Modified Gross) |
| Lease Type | `lease_type` | TEXT | New, Renewal, Sublease |
| Concessions | `concessions` | TEXT | Raw: "2.00 months free rent, $6 TI Allowance" |
| Free Rent Months | `free_rent_months` | NUMERIC | Parsed from concessions |
| TI Allowance | `ti_psf` | NUMERIC | Parsed from concessions ($/SF) |
| Tenant Rep Company | `tenant_rep_company` | TEXT | |
| Tenant Rep Agents | `tenant_rep_agents` | TEXT | |
| Landlord Rep Company | `landlord_rep_company` | TEXT | |
| Landlord Rep Agents | `landlord_rep_agents` | TEXT | |
| Notes | `notes` | TEXT | |
| Source | `source` | TEXT | "Company DB", "CoStar", "IAR Hot Sheet", "Manual" |
| — | `created_at` | TIMESTAMP | |
| — | `updated_at` | TIMESTAMP | |

**Key relationships:**
- `property_id` → direct FK to properties (one property, many lease comps over time)
- `company_id` → direct FK to companies (tenant). One company can have comps at multiple properties.
- NOT junction tables — a lease comp is always exactly one property + one tenant

**Lease Expiration Strategy:**
- `lease_comps.expiration_date` = historical record of when THIS lease expires (comp data)
- `companies.lease_exp` = convenience field for current active lease. Auto-updated when importing the most recent lease comp for a tenant.
- Company detail view shows all lease comps for that tenant across all properties

#### `sale_comps` table

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| — | `id` | UUID PK | |
| — | `property_id` | FK → properties | |
| Sale Date | `sale_date` | DATE | |
| Sale Price | `sale_price` | NUMERIC | |
| Price PSF | `price_psf` | NUMERIC | sale_price / sf |
| Price PLSF | `price_plsf` | NUMERIC | sale_price / land_sf |
| Cap Rate | `cap_rate` | NUMERIC | |
| SF | `sf` | NUMERIC | Building SF at time of sale |
| Land SF | `land_sf` | NUMERIC | |
| Buyer | `buyer_name` | TEXT | Text, not FK — often won't match Companies |
| Seller | `seller_name` | TEXT | |
| Property Type | `property_type` | TEXT | At time of sale |
| Notes | `notes` | TEXT | |
| Source | `source` | TEXT | "Company DB", "CoStar", "IAR Hot Sheet", "Manual" |
| — | `created_at` | TIMESTAMP | |
| — | `updated_at` | TIMESTAMP | |

**Sale comp ↔ Properties sync:**
- `sale_comp.property_id` → direct FK to properties
- When a new sale comp is created, auto-update property's `last_sale_date` and `last_sale_price` if this sale is more recent
- Hold Period = computed live: `EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM last_sale_date)` — not stored

#### Properties Table Additions (for comp queries)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| Latitude | `latitude` | NUMERIC | For distance-based comp queries |
| Longitude | `longitude` | NUMERIC | Pullable from CoStar |

#### Three Data Pipelines (build order)

1. **CSV Import** (build first) — upload lease comp or sale comp CSVs, auto-match properties by address, auto-match tenant companies by name, parse concessions text into free_rent_months + ti_psf
2. **Manual Entry** — add individual comps through the UI
3. **IAR Hot Sheet Automation** (future) — daily PDF from email → parse → create new comp records + update property availability fields

#### Report Connection (future)
Comp queries power BOV reports:
```sql
-- "Lease comps within 2 miles, industrial, 5k-20k SF, last 2 years"
SELECT * FROM lease_comps lc
JOIN properties p ON lc.property_id = p.id
WHERE p.property_type = 'Industrial'
  AND lc.sf BETWEEN 5000 AND 20000
  AND lc.commencement_date > NOW() - INTERVAL '2 years'
  -- + geography filter using lat/lng
```

---

### Transaction Probability Engine (TPE) — COMPLETE MODEL (from actual Excel formulas)

**Source:** TPE Excel file (`docs/TPE_Master_List_v2_20_11.xlsx`) — 9 sheets, 3,700 properties scored.
**Reference:** The Excel is in `docs/` for reference. This section IS the implementation spec. **Values match the actual Excel formulas (row 4+), NOT the Score Weights documentation tab** — the two diverge in several places. Where they differ, formulas win because they're what actually scored 3,700 properties. Differences are noted inline so you can adjust via `tpe_config` later.
**Decision:** DISCARD the Airtable lead scoring fields. Use the TPE Excel model instead — it's far more sophisticated.

**Architecture:** TPE scores are **not stored** — they're a **SQL VIEW** on top of `properties`, joining against supporting data tables. All scoring weights live in a `tpe_config` table so they're adjustable without changing SQL. Scores recompute live on every query (3,700 rows = milliseconds). No stale data.

---

#### MODEL 1: Transaction Probability Score (100 points max)

##### Category 1: LEASE EXPIRATION (30 pts max)
Source: `lease_comps.expiration_date` → nearest expiration per property

| Signal | Points | Logic |
|---|---|---|
| Expiring ≤ 12 months | 30 | Hard deadline — highest urgency |
| Expiring 12–18 months | 22 | Inside decision window |
| Expiring 18–24 months | 15 | Approaching window |
| Expiring 24–36 months | 8 | Long-range signal |
| No expiration data or > 36 months | 0 | |

*Note: Score Weights tab only lists 3 tiers. The actual formula includes a 4th tier (≤36mo = 8).*

Data path: `properties` → `lease_comps` (via property_id) → `expiration_date`. Also check `companies.lease_exp` (via lease_comps.company_id) as fallback.

##### Category 2: OWNERSHIP PROFILE (25 pts max — capped)
Source: `properties` (owner entity type, hold duration, owner-user status)

Three factors that **stack** (all can apply to same property), capped at 25:

| Factor | Signal | Points | Logic |
|---|---|---|---|
| Entity type | Individual / Private / Partnership | 8 | Non-institutional = higher sell probability |
| Entity type | Trust | 10 | Estate/succession planning likely |
| Hold duration | ≥ 15 years | 10 | Strong equity position, maximum motivation |
| Hold duration | ≥ 10 years | 7 | Building equity |
| Hold duration | ≥ 7 years | 4 | Some equity |
| Owner-User bonus | Owner-User (occupant, not investor) | 7 | Owner-occupants have different exit triggers than investors |

Max 25 = entity Trust (10) + hold 15yr (10) + owner-user (7) = 27 → capped at 25.

Hold duration computed from: `EXTRACT(YEAR FROM AGE(NOW(), properties.last_sale_date))` or imported directly as `hold_duration_years`.

*Note: Score Weights tab says "Individual/Family LLC = 10, Out-of-area = 5." The actual formula uses Individual/Private/Partnership = 8, Trust = 10, Owner-User = 7 instead of out-of-area. The `out_of_area` column exists in the data but is NOT used in the scoring formula. Both values are in `tpe_config` — you can switch to the Score Weights version later if preferred.*

##### Category 3: OWNER AGE (20 pts max)
Source: `properties.owner_age_est` (estimated owner age)

| Signal | Points | Logic |
|---|---|---|
| Age 70+ | 20 | Estate/succession pressure highest |
| Age 65–70 | 15 | Retirement planning window |
| Age 60–65 | 10 | Beginning to think about exit |
| Age 55–60 | 5 | On the horizon |
| Under 55 or unknown | 0 | |

Requires `owner_age_est` column on properties (INT, nullable).

##### Category 4: TENANT GROWTH (15 pts max)
Source: `tenant_growth.growth_rate` (via lease_comps → companies → tenant_growth)

| Signal | Points | Logic |
|---|---|---|
| Headcount growth ≥ 30% | 15 | Space pressure near-certain |
| Headcount growth 20–30% | 10 | Strong growth signal |
| Headcount growth 10–20% | 5 | Moderate growth signal |
| Below 10% or no data | 0 | |

Data path: `properties` → `lease_comps` (property_id) → `companies` (company_id) → `tenant_growth` (company_id).

##### Category 5: DEBT / STRESS (10 pts max — capped)
Source: `debt_stress.balloon_confidence` + `property_distress` (liens/delinquency)

Two factors that stack, capped at 10:

**Balloon Confidence** (from Debt & Stress tab — estimated balloon scenarios):

| Balloon Confidence | Points | Logic |
|---|---|---|
| 🔴 HIGH | 10 | Strong evidence of near-term balloon |
| 🟠 MEDIUM | 7 | Moderate balloon likelihood |
| 🟡 LOW | 4 | Some balloon risk |
| No data | 0 | |

The confidence level is determined from three balloon scenarios (5yr, 7yr, 10yr) in the `debt_stress` table. HIGH = shortest scenario is near-term, MEDIUM = mid scenario, LOW = only long scenario applies.

**Lien/Delinquency** (currently 0 records, column exists for future data):

| Signal | Points |
|---|---|
| Any lien or delinquency flag | +5 |

**Cap at 10 combined.** If balloon HIGH (10) + lien (5) = 15 → capped to 10.

*Note: Score Weights tab describes this as "SBA balloon ≤24 months = 7." The actual formula uses Balloon Confidence categories (HIGH/MEDIUM/LOW), not time-to-balloon directly. The Lien/Delinquency column is currently 100% empty — no properties have lien data yet.*

**TOTAL SCORE = Lease + Ownership + Owner Age + Growth + Stress (max 100)**

##### TPE Score Tiers (coaching guidance)

| Score Range | Tier | Action | Coaching Note |
|---|---|---|---|
| 85–100 | 🔴 CALL THIS WEEK | Immediate outreach | Two-fee scenario probable. Bring your father in early. |
| 70–84 | 🟠 CALL THIS MONTH | Schedule this month | Strong signal. Prepare financial model before calling. |
| 50–69 | 🟡 CALL THIS QUARTER | Begin relationship | Begin relationship, not a pitch. |
| Below 50 | 🟢 NURTURE ONLY | Market updates only | Market updates, no direct pitch. |

---

#### MODEL 2: Expected Commission Value (ECV)

##### Market Assumptions (all stored in `tpe_config`, adjustable)

| Parameter | Default Value | Notes |
|---|---|---|
| Sale price per SF | $250 | IE industrial avg ($200–$300 range) |
| Lease rate / SF / month (10-30K SF) | $1.15 | IE industrial NNN |
| Lease rate / SF / month (30-50K SF) | $1.00 | IE industrial NNN |
| Lease rate / SF / month (50K+ SF) | $0.90 | IE industrial NNN |
| Average lease term | 60 months (5 years) | Standard IE industrial |
| Sale commission rate | 3% of sale price | Standard |
| New lease commission rate | 4% of total consideration | SF × rate × term |
| Lease renewal commission rate | 2% of total consideration | SF × rate × term |

##### Commission Calculation

**Sale (tiered by value):**
- Value ≤ $5M (≤20K SF): `value × 3%`
- Value $5M–$10M (20-40K SF): `value × 2%`
- Value > $10M (40K+ SF): `value × 1%`
- Value = `SF × $250/SF`. SF uses RBA if available, else SF Leased.

**Lease (new):** `SF × lease_rate × 60 months × 4%`
**Lease (renewal):** `SF × lease_rate × 60 months × 2%`

Lease rate tiered: ≤30K SF → $1.15, ≤50K → $1.00, >50K → $0.90.

##### Likely Transaction Type

| Condition | Type | Commission Used |
|---|---|---|
| Owner-side (Ownership + Age + Stress) > Tenant-side (Lease + Growth) by > 5 points | SALE | Sale commission |
| Tenant-side > Owner-side by > 5 points | LEASE | Lease commission |
| Difference ≤ 5 points | BLENDED | 40% sale + 60% lease commission |

*The 5-point threshold prevents small differences from swinging the transaction type.*

##### Time Multiplier (used in ECV w/ Maturity Boost only, NOT in Blended Priority)

| Condition | Multiplier | Logic |
|---|---|---|
| Lease expiring ≤ 6 months | 1.2x | Maximum urgency premium |
| Lease expiring 6–12 months | 1.1x | High urgency |
| Lease expiring 12–24 months | 1.0x | Standard |
| Sale opportunity or no lease data | 0.85x | No forcing function discount |

##### Conversion Rate Assumptions (for reference, not used in scoring)

| Scenario | Estimated Rate |
|---|---|
| Expiring lease → deal | ~17% (1 in 6) |
| Growing tenant → deal | ~10% (1 in 10) |
| Owner cold outreach → sale | ~4% (1 in 25) |

---

#### MODEL 3: Blended Priority (the final ranking)

**Formula: `Blended Priority = 0.70 × MIN(Total Score + Confirmed Maturity Score, 100) + 0.30 × MIN(100, Sale Commission / $2,500)`**

Where:
- Total Score = the 100-point TPE score from Model 1
- Confirmed Maturity Score = from Model 4 (added directly, capped at 100 combined)
- Sale Commission = **always uses sale commission** for normalization, regardless of likely transaction type
- Commission normalization: divide by $2,500 to get 0-100 scale ($250K commission = 100 points)

**Key implementation details from the actual formula:**
1. Confirmed Maturity Score is **added to Total Score** before the 70% weight, not applied separately
2. Commission potential **always uses sale commission** (tiered: 3%/2%/1%), even for LEASE-likely properties
3. The Time Multiplier is **calculated but NOT used** in Blended Priority — it's only used in ECV w/ Maturity Boost (Model 4)

**Why 70/30:** Previous ECV-only model overweighted big buildings. A 90K SF building with no signals ranked above a 20K SF building with 5 converging signals. 70/30 ensures properties with multiple signals rank above properties with just a big footprint. Strategic rationale: deal volume builds reputation and network faster than deal size. Target: 20 deals × $75K avg = $1.5M gross.

##### Blended Priority Tiers (v2.20)

| Score | Tier | Count (approx) | Action |
|---|---|---|---|
| ≥ 50 | 🔴 HIGH PRIORITY — Call this week | Top ~50 | Strongest signal convergence |
| 40–49 | 🟠 SOLID — Call this month | Next ~100 | Multiple signals present |
| 30–39 | 🟡 MODERATE — Call this quarter | Next ~350 | Some signals, worth monitoring |
| < 30 | 🟢 LOW — Nurture only | Remaining ~3,200 | Market updates, no active pitch |

---

#### MODEL 4: Confirmed Loan Maturity (boost model)

Source: RCA Loan Export via Title Rep. Only applies to properties with **confirmed** maturity data (not estimated balloon).

##### Confirmed Maturity Score

| Timing | Points | Logic |
|---|---|---|
| Loan already matured (past due) | 25 | Owner is in the pressure cooker NOW |
| Matures within 30 days | 20 | Imminent — refinance or sell decision happening now |
| Matures within 90 days | 15 | Planning window — owner should be making moves |
| Matures > 90 days out | 10 | Early signal — still valuable but less urgent |

##### Enhanced Maturity Bonuses (v2.16 — three additional factors)

**LTV Bonus (0–5 points):** Higher LTV = more refinancing pressure

| LTV | Bonus |
|---|---|
| ≥ 85% | +5 pts — Underwater risk, hard to refinance |
| 75–84% | +3 pts — Tight equity, expensive refi |
| 65–74% | +1 pt — Moderate pressure |
| < 65% | +0 pts — Comfortable equity position |

**Loan Duration Bonus (0–3 points):** Short-term loans = business plan failure

| Duration | Bonus |
|---|---|
| ≤ 2.5 year loan | +3 pts — Bridge loan maturing = plan didn't execute |
| 2.5–4 year loan | +1 pt — Transitional financing stress |
| > 4 year loan | +0 pts — Routine maturity |

**Loan Purpose Bonus (0–2 points):** Acquisition/construction loans carry more risk

| Purpose | Bonus |
|---|---|
| Property Acquisition | +2 pts — Bought at peak, may be underwater |
| Construction | +2 pts — Needs takeout financing or forced sale |
| Refinance | +0 pts — Standard maturity event |

**Maximum Enhanced Maturity Score: 35 points** (25 base + 5 LTV + 3 duration + 2 purpose)

##### ECV with Maturity Boost

Formula: `((Total Score + Confirmed Maturity Score) / 100) × Sale Commission × 1.2x`

Key rules:
- Adds confirmed maturity points to probability (capped at 100)
- Forces SALE commission calculation (maturity = likely sale, not lease)
- Uses 1.2x time multiplier (maximum urgency premium)
- **Properties only get UPGRADED, never downgraded** — final priority = MAX(regular blended, boosted blended)
- Estimated balloon (Debt & Stress) and confirmed maturity are **additive** — a property can have both

---

#### MODEL 5: Distress Scoring (expanded tiers)

Source: Title Rep Maturing Debt Report. 59 properties across 3 distress types.

##### Distress Type Scores

| Distress Type | Base Points | Notes |
|---|---|---|
| AUCTION | 25 | Foreclosure sale — pre-foreclosure or buyer rep opportunity |
| MATURED (past due) | 25 | Loan already matured, no refi completed |
| NOD (Notice of Default) | 20 | Owner 90+ days behind on payments |

##### Maturity Timing Scores (when no distress type, just maturity date)

| Timing | Points |
|---|---|
| Maturing ≤ 1 month | 22 |
| Maturing 1–3 months | 18 |
| Maturing 3–6 months | 15 |
| Maturing 6–9 months | 12 |
| Maturing 9–12 months | 10 |

---

#### Office Courtesy (computed from lease_comps, not stored)

**Not a boolean on properties.** Computed live in the VIEW by checking `lease_comps.landlord_rep_company` and `lease_comps.tenant_rep_company` for "Lee & Associates" + "Riverside".

| Condition | Flag | Meaning |
|---|---|---|
| Lee Riv is landlord rep in any comp for this property | `owner_courtesy` | Don't cold-call the owner — Lee broker has that relationship |
| Lee Riv is tenant rep in any comp for this property | `tenant_courtesy` | Don't cold-call the tenant — Lee broker has that relationship |
| Only LL flagged | | CAN still call the tenant |
| Only TR flagged | | CAN still call the owner |
| Both flagged (double-ended) | | Neither — but advisory, not removed from list |

136 properties currently flagged. Flags are **advisory** — circumstances change, and the property stays in the ranked list.

VIEW output columns: `owner_courtesy` (BOOLEAN), `tenant_courtesy` (BOOLEAN), `courtesy_note` (TEXT — e.g. "⚠️ OWNER: Lee Riv LL rep" or "⚠️ TENANT: Lee Riv TR rep").

---

#### `tpe_config` Table (scoring weights — adjustable)

All point values, thresholds, multipliers, and market assumptions are stored in a config table. The SQL VIEW reads from this table, not hardcoded values. Change a number → every TPE score recalculates instantly.

| config_category | config_key | config_value | description |
|---|---|---|---|
| lease | lease_12mo_points | 30 | Score when lease expires ≤12 months |
| lease | lease_18mo_points | 22 | Score when lease expires 12-18 months |
| lease | lease_24mo_points | 15 | Score when lease expires 18-24 months |
| lease | lease_36mo_points | 8 | Score when lease expires 24-36 months |
| ownership | entity_individual_points | 8 | Individual/Private/Partnership entity type |
| ownership | entity_trust_points | 10 | Trust entity type |
| ownership | hold_15yr_points | 10 | Hold duration ≥15 years |
| ownership | hold_10yr_points | 7 | Hold duration ≥10 years |
| ownership | hold_7yr_points | 4 | Hold duration ≥7 years |
| ownership | owner_user_bonus | 7 | Owner-User (occupant) bonus |
| ownership | ownership_cap | 25 | Maximum combined ownership score |
| owner_age | age_70_points | 20 | Owner age 70+ |
| owner_age | age_65_points | 15 | Owner age 65-70 |
| owner_age | age_60_points | 10 | Owner age 60-65 |
| owner_age | age_55_points | 5 | Owner age 55-60 |
| growth | growth_30pct_points | 15 | Headcount growth ≥30% |
| growth | growth_20pct_points | 10 | Headcount growth 20-30% |
| growth | growth_10pct_points | 5 | Headcount growth 10-20% |
| stress | balloon_high_points | 10 | Balloon Confidence HIGH |
| stress | balloon_medium_points | 7 | Balloon Confidence MEDIUM |
| stress | balloon_low_points | 4 | Balloon Confidence LOW |
| stress | lien_points | 5 | Lien/delinquency flag (currently no data) |
| stress | stress_cap | 10 | Maximum combined stress score |
| ecv | sale_price_psf | 250 | Sale price per SF assumption |
| ecv | lease_rate_small | 1.15 | Lease rate 10-30K SF |
| ecv | lease_rate_mid | 1.00 | Lease rate 30-50K SF |
| ecv | lease_rate_large | 0.90 | Lease rate 50K+ SF |
| ecv | lease_term_months | 60 | Average lease term |
| ecv | sale_commission_5m | 0.03 | Sale commission rate (value ≤$5M) |
| ecv | sale_commission_10m | 0.02 | Sale commission rate (value $5M-$10M) |
| ecv | sale_commission_over10m | 0.01 | Sale commission rate (value >$10M) |
| ecv | lease_new_commission_rate | 0.04 | New lease commission rate |
| ecv | lease_renewal_commission_rate | 0.02 | Renewal commission rate |
| ecv | commission_divisor | 2500 | Divide commission by this for 0-100 scale ($250K=100) |
| time | time_mult_6mo | 1.20 | Time multiplier ≤6 months |
| time | time_mult_12mo | 1.10 | Time multiplier 6-12 months |
| time | time_mult_24mo | 1.00 | Time multiplier 12-24 months |
| time | time_mult_sale | 0.85 | Time multiplier for sales |
| blended | tpe_weight | 0.70 | TPE score weight in blended priority |
| blended | ecv_weight | 0.30 | Commission weight in blended priority |
| maturity | matured_points | 25 | Confirmed loan already matured |
| maturity | mature_30d_points | 20 | Confirmed maturing ≤30 days |
| maturity | mature_90d_points | 15 | Confirmed maturing ≤90 days |
| maturity | mature_over90d_points | 10 | Confirmed maturing >90 days |
| maturity_bonus | ltv_85_bonus | 5 | LTV ≥85% bonus |
| maturity_bonus | ltv_75_bonus | 3 | LTV 75-84% bonus |
| maturity_bonus | ltv_65_bonus | 1 | LTV 65-74% bonus |
| maturity_bonus | duration_25yr_bonus | 3 | Loan ≤2.5 year bonus |
| maturity_bonus | duration_4yr_bonus | 1 | Loan 2.5-4 year bonus |
| maturity_bonus | purpose_acquisition_bonus | 2 | Acquisition loan bonus |
| maturity_bonus | purpose_construction_bonus | 2 | Construction loan bonus |
| distress | auction_points | 25 | Auction distress score |
| distress | matured_distress_points | 25 | Past-due matured loan |
| distress | nod_points | 20 | Notice of Default |
| distress | mature_1mo_points | 22 | Maturing ≤1 month |
| distress | mature_3mo_points | 18 | Maturing 1-3 months |
| distress | mature_6mo_points | 15 | Maturing 3-6 months |
| distress | mature_9mo_points | 12 | Maturing 6-9 months |
| distress | mature_12mo_points | 10 | Maturing 9-12 months |

**TPE Settings page** in the CRM (under Settings) shows this table in an editable UI. User sees all weights grouped by category, can adjust values, and scores recalculate on next query. Ships with the initial TPE build.

**Score Weights tab aspirational values (not currently used, but available to switch to via config):**
- `entity_individual_points`: Score Weights says 10, formula uses 8
- `hold_15yr_points`: Score Weights says "20+ years = 10", formula uses "≥15 years = 10"
- Ownership third factor: Score Weights says "out-of-area = 5", formula uses "owner-user = 7"
- Stress: Score Weights says "balloon ≤24mo = 7", formula uses confidence categories (HIGH=10, MEDIUM=7, LOW=4)
- These are all adjustable via `tpe_config` — change the values to switch scoring approaches

---

#### Supporting Tables

##### `loan_maturities` table (NEW)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| — | `id` | UUID PK | |
| — | `property_id` | FK → properties | |
| Lender | `lender` | TEXT | |
| Loan Amount | `loan_amount` | NUMERIC | |
| Maturity Date | `maturity_date` | DATE | |
| LTV | `ltv` | NUMERIC | Loan-to-value ratio |
| Loan Purpose | `loan_purpose` | TEXT | Purchase, Refinance, Construction |
| Loan Duration | `loan_duration_years` | NUMERIC | |
| Interest Rate | `interest_rate` | NUMERIC | |
| Rate Type | `rate_type` | TEXT | Fixed, Variable |
| Loan Type | `loan_type` | TEXT | 1st Mortgage, SBA, etc. |
| Months Past Due | `months_past_due` | NUMERIC | From RCA data — 0 = current |
| Notes | `notes` | TEXT | |
| Source | `source` | TEXT | "Title Rep", "RCA", "Manual" |
| — | `created_at` | TIMESTAMP | |
| — | `updated_at` | TIMESTAMP | |

##### `property_distress` table (NEW)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| — | `id` | UUID PK | |
| — | `property_id` | FK → properties | |
| Distress Type | `distress_type` | TEXT | NOD, Auction, REO, Lis Pendens |
| Filing Date | `filing_date` | DATE | |
| Amount | `amount` | NUMERIC | Default amount or opening bid |
| Auction Date | `auction_date` | DATE | For auction type |
| Opening Bid | `opening_bid` | NUMERIC | For auction type |
| Delinquent Tax Year | `delinquent_tax_year` | INT | |
| Delinquent Tax Amount | `delinquent_tax_amount` | NUMERIC | |
| Trustee | `trustee` | TEXT | |
| Notes | `notes` | TEXT | |
| Source | `source` | TEXT | "Title Rep", "Manual" |
| — | `created_at` | TIMESTAMP | |
| — | `updated_at` | TIMESTAMP | |

##### `tenant_growth` table (NEW)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| — | `id` | UUID PK | |
| — | `company_id` | FK → companies | Linked to tenant company |
| Headcount Current | `headcount_current` | INT | |
| Headcount Previous | `headcount_previous` | INT | |
| Growth Rate | `growth_rate` | NUMERIC | e.g. 0.30 = 30% |
| Revenue Current | `revenue_current` | NUMERIC | |
| Revenue Previous | `revenue_previous` | NUMERIC | |
| Growth Prospect Score | `growth_prospect_score` | INT | 1-10 from CoStar data |
| Data Date | `data_date` | DATE | When this data was captured |
| Source | `source` | TEXT | "CoStar", "Vibe", "Manual" |
| — | `created_at` | TIMESTAMP | |
| — | `updated_at` | TIMESTAMP | |

##### `debt_stress` table (NEW — estimated balloon data)

Separate from `loan_maturities` (confirmed). This stores estimated balloon scenarios from Title Rep deed of trust / UCC data.

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| — | `id` | UUID PK | |
| — | `property_id` | FK → properties | |
| Lender | `lender` | TEXT | Originator |
| Loan Type | `loan_type` | TEXT | Conventional, SBA, etc. |
| Interest Rate | `interest_rate` | NUMERIC | |
| Rate Type | `rate_type` | TEXT | Fixed, Variable |
| Origination Date | `origination_date` | DATE | |
| Origination Amount | `origination_amount` | NUMERIC | |
| Balloon 5yr | `balloon_5yr` | DATE | Estimated 5-year balloon date |
| Balloon 7yr | `balloon_7yr` | DATE | Estimated 7-year balloon date |
| Balloon 10yr | `balloon_10yr` | DATE | Estimated 10-year balloon date |
| Balloon Confidence | `balloon_confidence` | TEXT | HIGH, MEDIUM, LOW |
| Notes | `notes` | TEXT | |
| Source | `source` | TEXT | "Title Rep", "Manual" |
| — | `created_at` | TIMESTAMP | |
| — | `updated_at` | TIMESTAMP | |

##### Properties Table Additions (for TPE)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| Owner-User/Investor | `owner_user_or_investor` | TEXT | "Owner-User", "Investor", "Large Investor", "Large Company", "Developer" — Owner-User gets +7 ownership bonus |
| Out of Area Owner | `out_of_area_owner` | BOOLEAN | Owner not local — NOT used in current formula but column exists for future use |
| Owner Status | `owner_call_status` | TEXT | Manual call tracking — mark after calling owner (empty by default) |
| Tenant Status | `tenant_call_status` | TEXT | Manual call tracking — mark after calling tenant (empty by default) |
| Owner Age (Est.) | `owner_age_est` | INT | Estimated owner age — drives Owner Age score |
| Hold Duration | `hold_duration_years` | NUMERIC | Computed from last_sale_date or imported directly |
| Owner Entity Type | `owner_entity_type` | TEXT | Individual, Family LLC, Large Investor, etc. |
| Lien/Delinquency | `has_lien_or_delinquency` | BOOLEAN | Tax lien or mechanic's lien flag |

*Note: `office_courtesy` is NOT stored on properties — it's computed live in the VIEW from lease_comps rep data.*

---

#### TPE in the UI

- **Not a separate tab** — TPE scores appear as columns in the Properties table (Total Score, Blended Priority, Tier, Likely Transaction)
- Property detail view shows a **Score Breakdown Card** with all 5 categories + Action Intelligence (see below)
- Properties can be sorted/filtered by TPE score or Blended Priority
- Tier labels (🔴🟠🟡🟢) and coaching notes visible in the detail panel
- **TPE Settings page** (under Settings) shows all weights from `tpe_config` in an editable grouped table

#### Action Intelligence (computed "Who To Call & Why")

The TPE VIEW generates **plain-English call reasons** from the underlying data. Replaces the manually-typed "who to call and why" column from the TPE Excel. All reasons are auto-computed and always current.

**Additional VIEW output columns:**

| Column | Type | Logic |
|---|---|---|
| `call_target` | TEXT | 'owner', 'tenant', or 'both' — based on which score categories drive the total |
| `call_reasons` | TEXT[] | Array of plain-English reason strings built from real data |
| `owner_name` | TEXT | From `properties.owner_name` |
| `owner_contact` | TEXT | From `properties.owner_contact` |
| `tenant_name` | TEXT | From nearest `lease_comps` → `companies.company_name` |
| `tenant_lease_exp` | DATE | From nearest `lease_comps.expiration_date` |
| `lender_name` | TEXT | From `loan_maturities.lender` (nearest maturity) |
| `loan_maturity_date` | DATE | From `loan_maturities.maturity_date` (nearest) |
| `owner_courtesy` | BOOLEAN | Computed from lease_comps — Lee Riv as LL rep |
| `tenant_courtesy` | BOOLEAN | Computed from lease_comps — Lee Riv as TR rep |
| `courtesy_note` | TEXT | e.g. "⚠️ OWNER: Lee Riv LL rep" |
| `tpe_tier` | TEXT | 🔴/🟠/🟡/🟢 label |
| `blended_tier` | TEXT | 🔴/🟠/🟡/🟢 label |
| `coaching_note` | TEXT | Tier-specific coaching guidance |

**`call_target` logic:**
- If Lease Score + Growth Score > Ownership Score + Age Score + Stress Score → 'tenant'
- If Ownership Score + Age Score + Stress Score > Lease Score + Growth Score → 'owner'
- If both sides contribute meaningfully → 'both'

**`call_reasons` generation — each reason is a CASE statement:**

| Condition | Generated reason string |
|---|---|
| Lease expires ≤12 months | "Lease expires in {N} months ({date}) — tenant {company_name}" |
| Lease expires ≤24 months | "Lease expires {date} — early outreach to {company_name}" |
| Confirmed loan maturity ≤12 months | "Confirmed loan with {lender} matures {date} — sell/refinance pressure" |
| Estimated balloon ≤24 months | "Estimated balloon with {lender} around {date} — financing forcing function" |
| property_distress = NOD | "NOD filed {date} — owner under foreclosure pressure" |
| property_distress = Auction | "Auction scheduled {date} ({opening_bid}) — distressed sale opportunity" |
| property_distress = REO | "Bank-owned (REO) — lender motivated to sell" |
| property_distress = Lis Pendens | "Lis Pendens filed {date} — legal action pending" |
| Tax delinquent | "Property tax delinquent ({year}, ${amount}) — financial stress signal" |
| growth_rate ≥ 30% | "Headcount up {N}% — tenant likely needs more space" |
| growth_rate ≥ 20% | "Growing tenant ({N}% headcount growth) — expansion candidate" |
| out_of_area_owner = true | "Out-of-area owner — may consider selling IE asset" |
| owner_entity_type = Individual/Family | "Individual/family owner — non-institutional, higher sell probability" |
| hold_duration ≥ 20 years | "Owned {N} years — maximum equity, potential motivation to exit" |
| owner_age ≥ 70 | "Owner est. age {N} — estate/succession pressure" |
| owner_age ≥ 65 | "Owner est. age {N} — retirement planning window" |
| LTV ≥ 85% (enhanced maturity) | "LTV {N}% — underwater risk, hard to refinance" |
| owner_courtesy | "⚠️ Lee Riv represented landlord — don't cold-call owner" |
| tenant_courtesy | "⚠️ Lee Riv represented tenant — don't cold-call tenant" |

**Score Breakdown Card layout (property detail panel):**

```
┌─ TPE Score: 78/100 ──────────────────────────────┐
│                                                    │
│  Lease        ████████████████████░░  30/30        │
│  Ownership    █████████████████░░░░░  20/25        │
│  Owner Age    ██████████████████░░░░  18/20        │
│  Growth       █████░░░░░░░░░░░░░░░░░   5/15       │
│  Stress       █████░░░░░░░░░░░░░░░░░   5/10       │
│                                                    │
│  Blended Priority: 62  🟠 SOLID                   │
│  Likely Transaction: LEASE                         │
│  Est. Commission: $82,800                          │
│                                                    │
│  ── Who To Call & Why ──────────────────────────── │
│                                                    │
│  CALL OWNER: John Smith (212-555-0100)             │
│  • Confirmed loan with Wells Fargo matures Oct 2026│
│  • Out-of-area owner — may consider selling IE asset│
│  • Owned 22 years — maximum equity                 │
│  • Owner est. age 72 — estate/succession pressure  │
│                                                    │
│  CALL TENANT: ABC Manufacturing                    │
│  • Lease expires in 8 months (Nov 2026)            │
│  • Headcount up 35% — likely needs more space      │
│                                                    │
│  ⚠️ Lee Riv represented landlord — courtesy flag   │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Why this replaces the Excel:** In the TPE Excel, call reasons were manually typed once and went stale. In the CRM, every reason is generated from live data — import new loan maturity data, update a lease expiration, or add a distress record and the reasons update instantly across all affected properties. This is also the foundation for Houston: Houston reads these computed reasons to auto-create action items.

---

#### Houston's Auto-Generated Action Items

The `action_items.source` field separates manual vs AI-generated tasks:

| Value | Meaning |
|---|---|
| `manual` | Entered by Dave, Missy, David Jr |
| `houston_tpe` | Auto-generated from TPE score changes |
| `houston_lease` | Auto-generated from lease expiration alerts |
| `houston_general` | Other AI-generated suggestions |

UI shows two sections:
- **My Tasks** — `source = 'manual'` (Apple Reminders style)
- **Houston's Suggestions** — `source LIKE 'houston_%'` (separate, dismissible)

#### Seven Data Sources (refresh pipeline)

1. **Airtable CRM** → properties, contacts, companies (batch migration via Import tab)
2. **Company DB lease comps** → `lease_comps` (CSV via Import tab)
3. **Title Rep confirmed loan maturity** → `loan_maturities` (CSV via Import tab — RCA export)
4. **Title Rep distressed properties** → `property_distress` (CSV via Import tab)
5. **Title Rep debt & stress** → `debt_stress` (CSV via Import tab — balloon estimates)
6. **CoStar/Vibe tenant growth** → `tenant_growth` (CSV via Import tab)
7. **Ownership data** → `properties` updates (owner age, entity type, hold duration — from Airtable export)

---

## Airtable Audit — Additional Findings

### Missing Contact Fields (from full audit)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| Active Need | `active_need` | TEXT | Current requirement description |
| Property Type Interest | `property_type_interest` | TEXT | Industrial, Office, etc. |
| Data Source | `data_source` | TEXT | Where this contact came from |
| Client Level | `client_level` | TEXT | A, B, C tiering |
| Lease Months Left | `lease_months_left` | INT | Computed or manual |
| Tenant Space Fit | `tenant_space_fit` | TEXT | |
| Tenant Ownership Intent | `tenant_ownership_intent` | TEXT | Buy vs lease preference |
| Business Trajectory | `business_trajectory` | TEXT | Growing, stable, shrinking |
| Last Call Outcome | `last_call_outcome` | TEXT | Result of most recent call |
| Follow-Up Behavior | `follow_up_behavior` | TEXT | Responsive, ghosting, etc. |
| Decision Authority | `decision_authority` | TEXT | Decision maker, influencer, etc. |
| Price/Cost Awareness | `price_cost_awareness` | TEXT | |
| Frustration Signals | `frustration_signals` | TEXT | |
| Exit Trigger Events | `exit_trigger_events` | TEXT | Events that could trigger a move |

*Note: These were part of the old Airtable lead scoring system. We are DISCARDING the scoring formulas but some of these input fields are still useful as qualitative contact intel — they just won't feed a score in the CRM. The TPE handles scoring at the property level instead.*

### Deals Consolidation Gaps

Airtable has 3 deal tables (Dads Deals, Jr Deal Tracker, Sarah Deals) consolidating into one `deals` table. Fields from Dad's/Sarah's tables not yet in schema:

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| Run By | `run_by` | TEXT[] | Multi-select: who's running the deal (replaces separate tables) |
| Other Broker | `other_broker` | TEXT | Outside broker involved |
| Industry | `industry` | TEXT | Tenant's industry (from Dad's Deals) |
| Deadline | `deadline` | DATE | Deal deadline (from Dad's Deals) |
| Fell Through Reason | `fell_through_reason` | TEXT | More granular than deal_dead_reason — "Landlord too difficult", "Client changed mind", etc. |

**Commission Split Differences (handle in formula VIEW):**
- Jr net = team_gross / 3 × 0.75
- Sarah net = gross × 0.50
- Dave has different split (TBD)

These differences should be handled in the deals formula VIEW using a `CASE` on `run_by` or a separate `commission_splits` config table.

### Other Airtable Tables (deferred)

- **S Interactions** — Sarah's separate interactions table. Merge into main `interactions` during migration with `team_member = 'Missy'`.
- **Team Goals** — Simple table (Name, Notes, Assignee, Status). Absorb into Action Items with `status = 'Needs and Wants'` or defer.
- **Fu Ye Billing** — Property management billing. Defer entirely — separate concern.

---

## Next Steps (in order)

1. **Commit the current uncommitted work** (column menu fix — 8 files)
2. ~~**Map Deals tab**~~ ✅ DONE
3. ~~**Map Campaigns tab**~~ ✅ DONE
4. ~~**Review Interactions**~~ ✅ DONE
5. ~~**Map Action Items**~~ ✅ DONE
6. ~~**Map Comps**~~ ✅ DONE
7. ~~**Map TPE**~~ ✅ DONE — 3 new tables (loan_maturities, property_distress, tenant_growth), SQL VIEW, source field on action_items
8. ~~**Audit remaining Airtable tables**~~ ✅ DONE — missing Contact fields, Deals consolidation gaps, deferred tables identified
9. ~~**Batch ALTER TABLE**~~ ✅ DONE
10. ~~**Update ALL_COLUMNS arrays**~~ ✅ DONE
11. ~~**Update API routes**~~ ✅ DONE
12. ~~**Update Interaction type options**~~ ✅ DONE
13. ~~**Build action_items page + 4 junction tables**~~ ✅ DONE
14. ~~**Build comps page**~~ ✅ DONE — Lease/Sale toggle, CSV import (comps-only), property/company linking
15. **Build CSV Import Engine** — general-purpose import with address normalization, fuzzy matching, batch INSERT, dedup detection. See full spec below.
16. **Build formula computation** — SQL VIEWs for Deals formulas + TPE scoring + commission splits
17. **Migrate data** — initial bulk load via Claude Code scripts (Airtable exports + TPE Excel), then ongoing imports via CRM CSV tool

---

### CSV Import Engine — Full Spec (Step 15)

**Problem:** The current CSV import only handles comps. Data needs to flow into ALL tables from multiple sources (CoStar, Company DB, Title Rep, Airtable exports, Landvision). Addresses are the primary linking key but every source formats them differently. Imports can be 10K+ rows.

**Two import paths:**

| Path | Use case | Tool |
|---|---|---|
| **CRM CSV Import** (in-browser) | Ongoing imports — monthly comps, quarterly Title Rep data | Dedicated Import tab in sidebar |
| **Claude Code migration scripts** | One-time initial data load — Airtable exports, TPE Excel | Node scripts run directly against DB |

Both paths share the same address normalizer and fuzzy matcher utilities.

#### 1. Address Normalizer (`ie-crm/server/utils/addressNormalizer.js`)

Shared utility used by both CRM imports and Claude Code scripts.

**Normalization rules:**
- Lowercase everything
- Trim whitespace, strip trailing commas/periods
- Standardize abbreviations: Street→St, Avenue→Ave, Boulevard→Blvd, Drive→Dr, Road→Rd, Lane→Ln, Circle→Cir, Court→Ct, Place→Pl, Way→Way, Suite→Ste, Building→Bldg, North→N, South→S, East→E, West→W
- Remove unit/suite suffixes when matching (store separately)
- Strip city/state/zip if appended (match on street address only)
- Remove # symbols, extra spaces, dashes in unit numbers
- Output: normalized string for matching + parsed components (street_number, street_name, unit, city, state, zip)

**Example:**
```
Input:  "1234 Main Street, Suite 200, Riverside, CA 92507"
Output: { normalized: "1234 main st", unit: "ste 200", city: "riverside", state: "ca", zip: "92507" }

Input:  "1234 MAIN ST."
Output: { normalized: "1234 main st", unit: null, city: null, state: null, zip: null }
```

Both match → same property.

#### 2. Composite Matcher (`ie-crm/server/utils/compositeMatcher.js`)

Matching uses **multiple data points** — not just address. Same address can exist in different cities (e.g. "1234 Main St" in Riverside AND Ontario). The matcher layers fields together for a confidence score.

**Property matching — tiered confidence:**

| Match Level | Fields Checked | Confidence | Action |
|---|---|---|---|
| Exact | normalized_address + city + zip | 100% | Auto-link |
| Strong | normalized_address + city (no zip) | 95% | Auto-link with log |
| Strong | normalized_address + zip (no city) | 90% | Auto-link with log |
| Moderate | normalized_address only, unique in DB | 85% | Auto-link with warning |
| Ambiguous | normalized_address matches 2+ properties | — | Flag for review, show all candidates with city/zip |
| Fuzzy | Levenshtein close + city or zip match | 70-89% | Flag for review |
| No match | Nothing close | — | Option to create new record |

When the CSV includes city, zip, county, or property_name columns, use ALL of them for matching. Most source exports (CoStar, Airtable, Landvision) include these fields.

**Company matching — tiered confidence:**

| Match Level | Fields Checked | Confidence | Action |
|---|---|---|---|
| Exact | company_name (normalized) + city | 100% | Auto-link |
| Strong | company_name only, unique in DB | 90% | Auto-link with log |
| Ambiguous | company_name matches 2+ companies | — | Flag for review |

Normalize: lowercase, strip "Inc", "LLC", "Corp", "Co", "Ltd", trailing periods.

**Contact matching — tiered confidence:**

| Match Level | Fields Checked | Confidence | Action |
|---|---|---|---|
| Exact | email address | 100% | Auto-link |
| Strong | full_name + company match | 85% | Auto-link with log |
| Fuzzy | name only, unique in DB | 70% | Flag for review |

Always match by email first (most unique), fall back to name + company.

**Flagged row UI:** Rows flagged for review show a yellow warning in the import preview — the incoming row alongside all candidate matches with city/zip/name visible. User picks the correct match or creates a new record. Nothing gets silently linked to the wrong property.

#### 3. Batch INSERT Endpoint (`POST /api/import/batch`)

**Why:** Current import calls `createLeaseComp()` one row at a time. 10K rows = 10K API calls = timeout. Batch INSERT does it in one SQL transaction.

**Request body:**
```json
{
  "target": "lease_comps",        // which table
  "rows": [ { ... }, { ... } ],   // 10K+ rows
  "source": "Company DB",         // data source tag
  "matchProperties": true,        // run address matching
  "matchCompanies": true,         // run company name matching
  "onDuplicate": "skip"           // "skip", "update", or "flag"
}
```

**Response:**
```json
{
  "inserted": 9842,
  "skipped": 103,        // duplicates skipped
  "updated": 0,
  "flagged": 55,         // needs manual review (fuzzy matches below threshold)
  "errors": 0,
  "flaggedRows": [ { row: 47, address: "1234 Main", candidates: [...] } ]
}
```

**Implementation:** Single SQL transaction using `INSERT INTO ... VALUES (...), (...), (...)` with `ON CONFLICT` handling. Postgres handles 10K+ rows in under a second.

#### 4. Import Target Configs

Each target table has a config defining its column mapping, required fields, and matching behavior:

| Target | Match by | Auto-link FK | Source column examples |
|---|---|---|---|
| `properties` | address (dedup) | — | CoStar export, Landvision export |
| `contacts` | email, then name | — | Airtable export |
| `companies` | company name | — | Airtable export |
| `deals` | deal name + contact | contact_id, property_id | Airtable export |
| `lease_comps` | address + tenant + date | property_id, company_id | Company DB, CoStar |
| `sale_comps` | address + sale_date | property_id | CoStar |
| `loan_maturities` | address + lender + maturity_date | property_id | Title Rep CSV |
| `property_distress` | address + distress_type + filing_date | property_id | Title Rep CSV |
| `tenant_growth` | company name + data_date | company_id | CoStar/Vibe CSV |
| `action_items` | name (dedup) | contact_id, property_id, deal_id | Airtable export |

#### 5. Import Page (dedicated sidebar tab)

One import tool for the entire CRM — not buried in Settings, not per-tab. Accessible from the sidebar between Campaigns and Settings.

**Auto-detection:** When a CSV is uploaded, the system scans column headers against signature fields for each table and scores the best match. Whichever table scores highest is pre-selected.

| CSV has these headers | → Auto-detects as |
|---|---|
| tenant_name, commencement_date, rate, term_months | lease_comps |
| sale_price, buyer_name, seller_name, cap_rate | sale_comps |
| full_name, email, phone, title, linkedin | contacts |
| address, rba, year_built, owner_name, zoning | properties |
| company_name, industry, employees, revenue | companies |
| maturity_date, lender, loan_amount, ltv | loan_maturities |
| distress_type, filing_date, trustee | property_distress |
| headcount_current, growth_rate, revenue_current | tenant_growth |
| deal name, commission_rate, close_date, repping | deals |
| responsibility, due_date, high_priority, status | action_items |

User can always override the auto-detection manually.

**Import flow:**
- **Step 1:** User uploads CSV file (drag & drop or file picker)
- **Step 2:** Auto-detection banner: "Detected: **Lease Comps** (24 of 28 columns matched). 847 rows." User confirms or overrides.
- **Step 3:** Column mapping screen (auto-mapped from header matching, user can adjust any column)
- **Step 4:** Preview — first 20 rows with match results: green (auto-linked), yellow (flagged for review), blue (new record)
- **Step 5:** User reviews flagged rows — pick correct match from candidates or "create new"
- **Step 6:** Execute import → results summary (inserted, skipped, updated, flagged, errors)

#### 6. Upgrade Existing Comps Import

Refactor `Comps.jsx` CSV import to use the new engine:
- Replace client-side `parseCSV()` with server-side batch endpoint
- Keep the Comps-specific column maps (LEASE_CSV_MAP, SALE_CSV_MAP) as target configs
- Add address matching to link comps to existing properties
- Add company name matching to link lease comps to existing companies

#### 7. Properties Table Addition (for dedup)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| Normalized Address | `normalized_address` | TEXT | Auto-computed on insert/update, used for matching |

Add a trigger or computed column: whenever `property_address` changes, `normalized_address` is recomputed. This makes address matching a simple `WHERE normalized_address = $1` instead of normalizing on every query.

---

## Future Considerations (not now)

- Houston AI agent — auto-generate action items from TPE score changes, lease expiry alerts
- IAR Hot Sheet automation (daily PDF → parse → update comps + property availability)
- Email automation / webhook capture (auto-log emails as Interactions)
- TPE Dashboard view — heatmap, top 50 targets, score change alerts
- Building image storage workflow (Costar PDF extraction → local file storage)
- File attachment storage approach (local filesystem vs S3)
- Prop 13 building tax live formula (needs tax_rate setting per city/county)
- Report generation (BOV reports pulling comps by geography/size/type)
