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

### Transaction Probability Engine (TPE) — FULLY MAPPED (SQL VIEW + 3 NEW TABLES)

**Source:** TPE Excel file (`TPE_Master_List_v2_20_11.xlsx`) — 9 sheets, 3,700 properties scored.
**Decision:** DISCARD the Airtable lead scoring fields. Use the TPE Excel model instead — it's far more sophisticated.

**Architecture:** TPE scores are **not stored** — they're a **SQL VIEW** on top of `properties`, joining against three supporting data tables. Scores recompute live on every query (3,700 rows = milliseconds). No stale data.

**Scoring Model (100 points max):**

| Category | Max Points | Source Table | Logic |
|---|---|---|---|
| Lease Score | 30 | `lease_comps` → nearest expiration | ≤12mo=30, ≤18mo=22, ≤24mo=15, ≤36mo=8, else 0 |
| Ownership Score | 25 | `properties` (owner age, type) | Age≥70=20, ≥65=15, ≥60=10, ≥55=5 + out-of-area/user bonuses |
| Age Score | 20 | `properties.year_built` | Same tiers as ownership age |
| Growth Score | 15 | `tenant_growth` | Headcount growth ≥30%=15, ≥20%=10, ≥10%=5 |
| Stress Score | 10 | `property_distress` + `loan_maturities` | NOD/Auction/REO flags, distressed debt signals |

**Blended Priority = 70% × Total Score + 30% × Commission Potential**
- Commission Potential: estimated from property RBA × $250/SF × tiered commission rate (3%/2%/1%), normalized to 0-100 scale
- Confirmed Maturity Boost: extra points when loan maturity data confirms near-term debt events (LTV, duration, purpose bonuses)
- Office Courtesy flag: properties where Lee & Associates was involved (avoid poaching colleagues)

**Likely Transaction Type:** Based on score composition — if ownership-side scores dominate → SALE, if tenant-side → LEASE, balanced → BLENDED

#### `loan_maturities` table (NEW)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| — | `id` | UUID PK | |
| — | `property_id` | FK → properties | |
| Lender | `lender` | TEXT | |
| Loan Amount | `loan_amount` | NUMERIC | |
| Maturity Date | `maturity_date` | DATE | |
| LTV | `ltv` | NUMERIC | Loan-to-value ratio |
| Loan Purpose | `loan_purpose` | TEXT | Purchase, Refinance, Construction |
| Loan Duration | `loan_duration_years` | INT | |
| Interest Rate | `interest_rate` | NUMERIC | |
| Notes | `notes` | TEXT | |
| Source | `source` | TEXT | "Title Rep", "Manual" |
| — | `created_at` | TIMESTAMP | |
| — | `updated_at` | TIMESTAMP | |

#### `property_distress` table (NEW)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| — | `id` | UUID PK | |
| — | `property_id` | FK → properties | |
| Distress Type | `distress_type` | TEXT | NOD, Auction, REO, Lis Pendens |
| Filing Date | `filing_date` | DATE | |
| Amount | `amount` | NUMERIC | |
| Trustee | `trustee` | TEXT | |
| Notes | `notes` | TEXT | |
| Source | `source` | TEXT | "Title Rep", "Manual" |
| — | `created_at` | TIMESTAMP | |
| — | `updated_at` | TIMESTAMP | |

#### `tenant_growth` table (NEW)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| — | `id` | UUID PK | |
| — | `company_id` | FK → companies | Linked to tenant company |
| Headcount Current | `headcount_current` | INT | |
| Headcount Previous | `headcount_previous` | INT | |
| Growth Rate | `growth_rate` | NUMERIC | e.g. 0.30 = 30% |
| Revenue Current | `revenue_current` | NUMERIC | |
| Revenue Previous | `revenue_previous` | NUMERIC | |
| Data Date | `data_date` | DATE | When this data was captured |
| Source | `source` | TEXT | "CoStar", "Vibe", "Manual" |
| — | `created_at` | TIMESTAMP | |
| — | `updated_at` | TIMESTAMP | |

#### Properties Table Additions (for TPE)

| Column | Schema Name | Type | Notes |
|---|---|---|---|
| Owner Type | `owner_user_or_investor` | TEXT | "Owner User", "Investor" — affects ownership score |
| Out of Area Owner | `out_of_area_owner` | BOOLEAN | Owner not local — adds ownership score bonus |
| Office Courtesy | `office_courtesy` | BOOLEAN | Lee & Associates previously involved — flag to avoid |

*Note: `owner_type` field already planned in Properties mapping above — `owner_user_or_investor` is a more specific field for TPE scoring distinct from the general `owner_type`.*

#### TPE SQL VIEW (conceptual)

```sql
CREATE VIEW property_tpe_scores AS
SELECT
  p.id,
  p.property_address,
  -- Lease Score (30 pts max)
  CASE
    WHEN nearest_lease_exp <= 12 THEN 30
    WHEN nearest_lease_exp <= 18 THEN 22
    WHEN nearest_lease_exp <= 24 THEN 15
    WHEN nearest_lease_exp <= 36 THEN 8
    ELSE 0
  END AS lease_score,
  -- Ownership Score (25 pts max) - based on owner age + type + location
  -- Age Score (20 pts max) - based on year_built
  -- Growth Score (15 pts max) - from tenant_growth table
  -- Stress Score (10 pts max) - from property_distress + loan_maturities
  -- Total Score = sum of all five
  -- Blended Priority = 0.7 * total_score + 0.3 * commission_potential
  -- Likely Transaction = SALE / LEASE / BLENDED based on score composition
FROM properties p
LEFT JOIN LATERAL (
  SELECT MIN(months_to_exp) AS nearest_lease_exp
  FROM lease_comps lc WHERE lc.property_id = p.id AND lc.expiration_date > NOW()
) lease ON true
LEFT JOIN LATERAL (...) distress ON true
LEFT JOIN LATERAL (...) growth ON true;
```

#### TPE in the UI

- **Not a separate tab** — TPE scores appear as columns in the Properties table (Total Score, Blended Priority, Likely Transaction)
- Property detail view shows a **Score Breakdown Card** with all 5 categories
- Properties can be sorted/filtered by TPE score
- Future: dedicated TPE Dashboard view with heatmap, top 50 targets, score change alerts

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

#### Six Data Sources (refresh pipeline)

1. **Airtable CRM** → properties, contacts, companies (batch migration)
2. **Company DB lease comps** → `lease_comps` (CSV import)
3. **Title Rep loan maturity** → `loan_maturities` (CSV or manual)
4. **Title Rep distressed properties** → `property_distress` (CSV or manual)
5. **CoStar/Vibe tenant growth** → `tenant_growth` (CSV or manual)
6. **Title Rep debt & stress** → feeds into `loan_maturities` + `property_distress`

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
| **CRM CSV Import** (in-browser) | Ongoing imports — monthly comps, quarterly Title Rep data | Settings > Import page in the CRM UI |
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

#### 2. Fuzzy Matcher (`ie-crm/server/utils/fuzzyMatcher.js`)

**Property matching (by address):**
1. Normalize incoming address
2. Exact match against `properties.property_address` (also normalized) → auto-link
3. If no exact match, Levenshtein distance against all properties in same city/zip → return candidates with confidence score
4. Above 95% confidence → auto-link with log entry
5. Below 95% → flag for user review (show in import results)
6. No match at all → optionally create new property record (user chooses)

**Company matching (by name):**
- Same approach but for company names
- Normalize: lowercase, strip "Inc", "LLC", "Corp", "Co", "Ltd", trailing periods
- Exact match → auto-link
- Fuzzy match with candidates → flag for review
- Used when importing lease comps (tenant name → companies.company_name)

**Contact matching (by name + email):**
- Match by email first (most unique)
- Fallback: match by normalized full_name
- Used when importing contacts from Airtable or other sources

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

#### 5. CRM Import UI (Settings > Import)

- **Step 1:** User picks target table from dropdown
- **Step 2:** User uploads CSV file
- **Step 3:** Column mapping screen (auto-mapped with fuzzy header matching, user can override)
- **Step 4:** Preview — show first 20 rows, highlight unmapped columns, show match results (auto-linked, flagged, new)
- **Step 5:** User reviews flagged rows — pick correct match or "create new"
- **Step 6:** Execute import → show results summary

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
