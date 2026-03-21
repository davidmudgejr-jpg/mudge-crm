# IE CRM — Full System Test & Fix Prompt

> **Purpose:** Give this file to a new Claude Code session. It will systematically test every feature, create test data, verify all relationships, fix anything broken, and confirm the app is fully working before TPE development begins.
>
> **How to use:** Start a new Claude Code chat and say:
> `Read TESTING-PROMPT.md and execute the full testing protocol.`

---

## Your Mission

You are testing the IE CRM application — a custom commercial real estate CRM built with React (Vite) + Express + PostgreSQL (Neon). Your job is to:

1. **Start the dev server** and verify the app loads
2. **Check the database schema** — confirm all expected tables and columns exist
3. **Create test records** in every tab so there's data to work with
4. **Test every feature** — CRUD operations, detail panels, linked records, search, column visibility
5. **Fix anything broken** — if something fails, diagnose the root cause, fix the code, and re-test
6. **Repeat until everything works perfectly**
7. **Clean up** — delete test records after all tests pass (optional, ask user)

**Important:** Do NOT just report problems — FIX them. Test again after fixing. Continue this loop until every test passes.

---

## Key Files & Architecture

| File | Purpose |
|---|---|
| `ie-crm/server/index.js` | Express API server — all backend routes |
| `ie-crm/src/api/database.js` | Frontend database functions — CRUD, search, linking, batch queries |
| `ie-crm/src/api/bridge.js` | API bridge — routes calls to Express server |
| `ie-crm/src/pages/*.jsx` | Page components — one per tab |
| `ie-crm/src/components/shared/CrmTable.jsx` | Shared table component used by all tabs |
| `ie-crm/src/components/shared/SlideOver.jsx` | Detail panel (slide-out) component |
| `ie-crm/src/hooks/*.js` | Custom hooks — column visibility, custom fields, auto-save, linked records |
| `HANDOFF.md` | Full schema blueprint — every column mapping and table spec |
| `ROADMAP.md` | Build phases and feature status |
| `ARCHITECTURE.md` | Tech stack, schema structure, key decisions |

**Stack:** React + Vite (frontend on Vercel) → Express (backend on Railway) → PostgreSQL 17 (Neon)

**API pattern:** Frontend calls `database.js` functions → `bridge.js` routes to `POST /api/db/query` → Express runs SQL via `pg` Pool → Neon PostgreSQL

**Dev server:** Run `npm run dev:web` from `ie-crm/` directory (starts both Vite dev server and Express backend)

---

## Phase 0: Environment & Server Check

### 0.1 Start the dev server
```bash
cd ie-crm && npm run dev:web
```
Wait for both Vite and Express to report ready. If `dev:web` script doesn't exist, check `package.json` for the correct script name (might be `dev` or need two terminals).

### 0.2 Verify the app loads
- Navigate to the local URL (likely `http://localhost:5173`)
- Confirm the sidebar renders with all nav items
- Take a screenshot to confirm

### 0.3 Check database connection
- Navigate to Settings tab
- Confirm "Database: Connected" shows green
- Note the record counts for each table

### 0.4 Query the live schema
Run this SQL to get the actual database schema:
```sql
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position
```
Save the output — you'll cross-reference this against expected columns throughout testing.

---

## Phase 1: Schema Verification

Check that all expected tables exist in the database. For each table, verify the key columns are present.

### 1.1 Core Tables (must exist)

| Table | Primary Key | Key Columns to Verify |
|---|---|---|
| `properties` | `property_id` | property_address, city, zip, rba, owner_name, property_type, last_sale_date, last_sale_price, contacted, notes, created_at |
| `contacts` | `contact_id` | full_name, first_name, email, phone_1, type, title, notes, created_at |
| `companies` | `company_id` | company_name, company_type, industry_type, city, lease_exp, employees, notes, created_at |
| `deals` | `deal_id` | deal_name, deal_type, status, sf, rate, commission_rate, close_date, notes, priority_deal, created_at |
| `interactions` | `interaction_id` | type, subject, date, notes, team_member, created_at |
| `campaigns` | `campaign_id` | name, type, status, sent_date, notes, created_at |
| `action_items` | `action_item_id` | name, status, due_date, responsibility, high_priority, source, notes, created_at |
| `lease_comps` | `id` | property_id, company_id, tenant_name, sf, rate, expiration_date, term_months, source, created_at |
| `sale_comps` | `id` | property_id, sale_date, sale_price, sf, buyer_name, seller_name, source, created_at |

### 1.2 Junction Tables (must exist — these power linked records)

| Junction Table | Column 1 | Column 2 | Extra Columns |
|---|---|---|---|
| `property_contacts` | property_id | contact_id | role |
| `property_companies` | property_id | company_id | role |
| `contact_companies` | contact_id | company_id | — |
| `deal_properties` | deal_id | property_id | — |
| `deal_contacts` | deal_id | contact_id | — |
| `deal_companies` | deal_id | company_id | — |
| `interaction_contacts` | interaction_id | contact_id | — |
| `interaction_properties` | interaction_id | property_id | — |
| `interaction_deals` | interaction_id | deal_id | — |
| `interaction_companies` | interaction_id | company_id | — |
| `campaign_contacts` | campaign_id | contact_id | — |
| `action_item_contacts` | action_item_id | contact_id | — |
| `action_item_properties` | action_item_id | property_id | — |
| `action_item_deals` | action_item_id | deal_id | — |
| `action_item_companies` | action_item_id | company_id | — |

### 1.3 Supporting Tables (check if exist)

| Table | Purpose | Status |
|---|---|---|
| `formula_columns` | Custom formula column definitions | Should exist |
| `undo_log` | Action undo tracking | Should exist |
| `custom_fields` | Ad-hoc custom field definitions | Should exist |

### 1.4 TPE Tables (NOT expected to exist yet — just confirm)

These tables are planned for Step 16 but should NOT exist yet:
- `loan_maturities`
- `debt_stress`
- `tenant_growth`
- `property_distress`
- `tpe_config`

If any exist already, note it but don't worry about testing them.

### 1.5 Missing Columns Check (TPE prerequisites on `properties`)

These columns are needed for TPE and may or may not exist yet. Check and report:
- `owner_entity_type` (TEXT)
- `owner_user_or_investor` (TEXT) — might already exist
- `owner_age_est` (INT)
- `hold_duration_years` (NUMERIC)
- `has_lien_or_delinquency` (BOOLEAN)
- `out_of_area_owner` (BOOLEAN) — might already exist
- `owner_call_status` (TEXT)
- `tenant_call_status` (TEXT)

**Action:** Report which exist and which are missing. Do NOT add them yet — just document.

---

## Phase 2: Create Test Data

Create test records in a specific order so linked records can reference each other. Use realistic commercial real estate data for the Inland Empire (Riverside/Ontario/Corona area).

**IMPORTANT:** Prefix all test record names with `[TEST]` so they're easy to find and delete later.

### 2.1 Create Test Companies (2 records)

```
Company 1:
  company_name: "[TEST] Pacific Industrial LLC"
  company_type: "Owner"
  industry_type: "Real Estate"
  city: "Ontario"
  employees: 15
  website: "https://pacificindustrial.test"

Company 2:
  company_name: "[TEST] SoCal Distribution Inc"
  company_type: "Tenant"
  industry_type: "Logistics"
  city: "Riverside"
  sf: 25000
  lease_exp: "2027-06-30"
  employees: 85
```

### 2.2 Create Test Contacts (2 records)

```
Contact 1:
  full_name: "[TEST] Mike Thompson"
  first_name: "Mike"
  type: "Owner"
  title: "Managing Partner"
  email: "mthompson@test.com"
  phone_1: "(951) 555-0101"
  work_city: "Ontario"

Contact 2:
  full_name: "[TEST] Sarah Chen"
  first_name: "Sarah"
  type: "Tenant"
  title: "VP Operations"
  email: "schen@test.com"
  phone_1: "(951) 555-0202"
  work_city: "Riverside"
```

### 2.3 Create Test Properties (2 records)

```
Property 1:
  property_address: "[TEST] 1234 Commerce Center Dr"
  city: "Ontario"
  state: "CA"
  zip: "91761"
  property_type: "Industrial"
  rba: 45000
  land_sf: 90000
  year_built: 1998
  owner_name: "Pacific Industrial LLC"
  last_sale_date: "2010-03-15"
  last_sale_price: 8500000

Property 2:
  property_address: "[TEST] 5678 Logistics Pkwy"
  city: "Riverside"
  state: "CA"
  zip: "92507"
  property_type: "Industrial"
  rba: 25000
  land_sf: 55000
  year_built: 2005
  owner_name: "Thompson Family Trust"
  last_sale_date: "2015-08-20"
  last_sale_price: 5200000
```

### 2.4 Create Test Deals (2 records)

```
Deal 1:
  deal_name: "[TEST] Pacific Industrial - Sale"
  deal_type: "Sale"
  status: "Active"
  sf: 45000
  price: 9500000
  commission_rate: 0.03
  notes: "Test deal for system verification"

Deal 2:
  deal_name: "[TEST] SoCal Distribution - Lease Renewal"
  deal_type: "Lease"
  status: "Prospect"
  sf: 25000
  rate: 1.15
  term: 60
  commission_rate: 0.04
  notes: "Test lease deal"
```

### 2.5 Create Test Interactions (2 records)

```
Interaction 1:
  type: "Phone Call"
  subject: "[TEST] Initial owner outreach"
  date: today's date
  notes: "Called Mike Thompson about listing 1234 Commerce Center"
  team_member: "David Mudge Jr"

Interaction 2:
  type: "Meeting"
  subject: "[TEST] Property tour with tenant"
  date: today's date
  notes: "Toured 5678 Logistics Pkwy with Sarah Chen"
  team_member: "David Mudge Jr"
```

### 2.6 Create Test Campaign (1 record)

```
Campaign 1:
  name: "[TEST] Spring 2026 Industrial Mailer"
  type: "Snail Mail"
  status: "Not sent"
  notes: "Test campaign for system verification"
```

### 2.7 Create Test Action Items (2 records)

```
Action Item 1:
  name: "[TEST] Follow up with Mike Thompson"
  status: "Todo"
  due_date: 7 days from now
  responsibility: ["David Mudge Jr"]
  high_priority: true
  source: "manual"
  notes: "Discuss listing agreement for Commerce Center"

Action Item 2:
  name: "[TEST] Send lease proposal to SoCal Distribution"
  status: "In progress"
  due_date: 3 days from now
  responsibility: ["David Mudge Jr", "Missy"]
  high_priority: false
  source: "manual"
```

### 2.8 Create Test Comps (1 lease, 1 sale)

```
Lease Comp 1:
  tenant_name: "[TEST] SoCal Distribution Inc"
  property_type: "Industrial"
  sf: 25000
  rate: 1.05
  rent_type: "NNN"
  lease_type: "New"
  term_months: 60
  commencement_date: "2022-07-01"
  expiration_date: "2027-06-30"
  source: "Manual"
  notes: "Test lease comp"
  (Link to Property 2 via property_id if possible)

Sale Comp 1:
  sale_date: "2024-11-15"
  sale_price: 12000000
  sf: 50000
  price_psf: 240
  buyer_name: "[TEST] Inland Logistics Group"
  seller_name: "[TEST] Vista Commerce Partners"
  property_type: "Industrial"
  source: "Manual"
  notes: "Test sale comp"
```

---

## Phase 3: Test Every Tab (CRUD + UI)

For each tab, test the following operations. If any operation fails, note the error, fix it, and re-test.

### Test Checklist Per Tab

For **Properties, Contacts, Companies, Deals, Campaigns, Action Items**:

- [ ] **LIST VIEW** — Tab loads and shows records (including test records)
- [ ] **SEARCH** — Search bar finds test records by name/address
- [ ] **SORT** — Click a column header to sort; verify sort order changes
- [ ] **CREATE** — Open "New Record" modal, fill fields, save. Record appears in list.
- [ ] **DETAIL PANEL** — Click a record row → slide-out panel opens with all fields
- [ ] **INLINE EDIT** — Edit a field in the detail panel → changes save automatically
- [ ] **COLUMN VISIBILITY** — Open column toggle menu → hide a column → it disappears from table → show it → it reappears
- [ ] **COLUMN MENU** — Right-click or click column header menu → Rename, Hide, Delete options appear. Delete is disabled for system columns.

For **Activity (Interactions)**:

- [ ] **LIST VIEW** — Shows interactions sorted by date
- [ ] **SEARCH** — Can search by notes or subject
- [ ] **DETAIL PANEL** — Click to open detail view
- [ ] **QUICK NOTE** — Quick Note feature works from detail panels on other tabs (creates interaction + links it)

For **Comps** (Lease | Sale toggle):

- [ ] **TOGGLE** — Lease / Sale toggle switches between tables
- [ ] **LIST VIEW** — Both lease comps and sale comps display
- [ ] **CREATE** — Can create new lease comp and sale comp via modal
- [ ] **DETAIL PANEL** — Click comp row to open detail
- [ ] **PROPERTY LINK** — If property_id was set, comp shows linked property

For **Action Items**:

- [ ] **LIST VIEW** — Shows action items with status colors
- [ ] **STATUS FILTER** — Filter by status works (Todo, In progress, Done, etc.)
- [ ] **PRIORITY FLAG** — High priority items display visually differently
- [ ] **RESPONSIBILITY** — Multi-select responsibility field shows correctly
- [ ] **DUE DATE** — Due dates display and sort works

For **Settings**:

- [ ] **DATABASE STATUS** — Shows "Connected" with green indicator
- [ ] **RECORD COUNTS** — Table counts display for all tables
- [ ] **ENVIRONMENT** — Shows which env vars are configured (without revealing values)

For **Import** (if it exists as a tab):

- [ ] **PAGE LOADS** — Import tab renders without errors
- [ ] **FILE UPLOAD** — Can select a CSV file (don't need to complete import, just verify UI)

---

## Phase 4: Test Linked Records (Junction Tables)

This is the most critical section — linked records power the cross-referencing that makes the CRM useful.

### 4.1 Link Records Together

Using the test data created in Phase 2, create these links:

| Link | Junction Table | How to Test |
|---|---|---|
| Contact 1 → Company 1 | `contact_companies` | Open Contact 1 detail → link to Pacific Industrial LLC |
| Contact 2 → Company 2 | `contact_companies` | Open Contact 2 detail → link to SoCal Distribution |
| Contact 1 → Property 1 | `property_contacts` | Open Property 1 detail → link Contact 1 (role: owner) |
| Contact 2 → Property 2 | `property_contacts` | Open Property 2 detail → link Contact 2 |
| Company 1 → Property 1 | `property_companies` | Open Property 1 detail → link Company 1 (role: owner) |
| Company 2 → Property 2 | `property_companies` | Open Property 2 detail → link Company 2 (role: tenant) |
| Deal 1 → Property 1 | `deal_properties` | Open Deal 1 detail → link Property 1 |
| Deal 1 → Contact 1 | `deal_contacts` | Open Deal 1 detail → link Contact 1 |
| Deal 1 → Company 1 | `deal_companies` | Open Deal 1 detail → link Company 1 |
| Deal 2 → Property 2 | `deal_properties` | Open Deal 2 detail → link Property 2 |
| Deal 2 → Contact 2 | `deal_contacts` | Open Deal 2 detail → link Contact 2 |
| Deal 2 → Company 2 | `deal_companies` | Open Deal 2 detail → link Company 2 |
| Interaction 1 → Contact 1 | `interaction_contacts` | Open Interaction 1 detail → link Contact 1 |
| Interaction 1 → Property 1 | `interaction_properties` | Open Interaction 1 detail → link Property 1 |
| Interaction 2 → Contact 2 | `interaction_contacts` | Open Interaction 2 detail → link Contact 2 |
| Interaction 2 → Property 2 | `interaction_properties` | Open Interaction 2 detail → link Property 2 |
| Campaign 1 → Contact 1 | `campaign_contacts` | Open Campaign 1 detail → link Contact 1 |
| Campaign 1 → Contact 2 | `campaign_contacts` | Open Campaign 1 detail → link Contact 2 |
| Action Item 1 → Contact 1 | `action_item_contacts` | Open Action Item 1 → link Contact 1 |
| Action Item 1 → Property 1 | `action_item_properties` | Open Action Item 1 → link Property 1 |
| Action Item 2 → Company 2 | `action_item_companies` | Open Action Item 2 → link Company 2 |
| Action Item 2 → Deal 2 | `action_item_deals` | Open Action Item 2 → link Deal 2 |

### 4.2 Verify Links Show Bidirectionally

After creating links, verify they appear from BOTH directions:

- Open **Property 1** detail → should show Contact 1 in Contacts section, Company 1 in Companies section, Deal 1 in Deals section
- Open **Contact 1** detail → should show Property 1 in Properties section, Company 1 in Companies section, Deal 1 in Deals section
- Open **Deal 1** detail → should show Property 1, Contact 1, Company 1
- Open **Interaction 1** detail → should show Contact 1, Property 1
- Open **Company 1** detail → should show Contact 1, Property 1, Deal 1
- Open **Campaign 1** detail → should show Contact 1 and Contact 2
- Open **Action Item 1** detail → should show Contact 1, Property 1

### 4.3 Test Link Picker

The Link Picker Modal is the UI for searching and linking records:
- Open any detail panel → click the "+" button on a linked record section
- Search for a test record by name
- Select it and confirm the link appears
- Verify the typeahead/search results are accurate

### 4.4 Test Unlinking

- Open a detail panel with linked records
- Remove a link (click the X or unlink button)
- Verify the link disappears from both sides
- Re-link it to restore test state

---

## Phase 5: Test Quick Note (Interaction Creation)

Quick Note is a feature on every detail panel that creates a new interaction and auto-links it.

### 5.1 Test from Property Detail
- Open Property 1 detail
- Find the Quick Note / Notes section
- Add a note: "[TEST] Quick note from property detail"
- Verify:
  - New interaction appears in Activity tab
  - Interaction is linked to Property 1
  - Note text is correct

### 5.2 Test from Contact Detail
- Open Contact 1 detail
- Add a note: "[TEST] Quick note from contact detail"
- Verify same as above (linked to Contact 1)

### 5.3 Test from Deal Detail
- Open Deal 1 detail
- Add a note: "[TEST] Quick note from deal detail"
- Verify same (linked to Deal 1)

### 5.4 Test from Company Detail
- Open Company 1 detail
- Add a note: "[TEST] Quick note from company detail"
- Verify same (linked to Company 1)

---

## Phase 6: Test New Interaction Modal

The New Interaction Modal creates interactions with manual linking to multiple record types.

- Open the New Interaction Modal (from Activity tab or "+" button)
- Fill in:
  - Type: "Cold Call"
  - Subject: "[TEST] New interaction modal test"
  - Date: today
  - Notes: "Testing modal interaction creation"
  - Link to: Contact 1, Property 1 (via the link picker within the modal)
- Save and verify:
  - Interaction appears in Activity tab
  - Links to Contact 1 and Property 1 are correct
  - Opening Contact 1 detail shows this interaction

---

## Phase 7: Test Column Features

### 7.1 Column Visibility Toggle
On any tab (e.g., Properties):
- Open the column toggle menu (gear icon or column selector)
- Uncheck a column → verify it hides from the table
- Check it again → verify it reappears
- Verify the toggle persists after navigating away and back

### 7.2 Column Sorting
- Click a column header to sort ascending
- Click again to sort descending
- Verify data order changes correctly

### 7.3 Custom Fields (if applicable)
- Try adding a custom field via the Add Field panel
- Verify it appears as a column
- Try editing a value in the custom field
- Try hiding/showing the custom field

---

## Phase 8: Browser Console Error Check

After all tests, check the browser console for errors:
- Open browser dev tools → Console tab
- Look for any red errors (JavaScript errors, failed API calls, 404s)
- Document each error with its source
- Fix any errors that indicate broken functionality

Also check the Express server terminal output for any backend errors.

---

## Phase 9: TPE Readiness Check

This is the final verification before TPE development can begin.

### 9.1 Properties table has all base columns TPE needs:
- [ ] `rba` — building square footage (NUMERIC)
- [ ] `last_sale_date` — DATE
- [ ] `last_sale_price` — NUMERIC
- [ ] `owner_name` — TEXT
- [ ] `property_type` — TEXT
- [ ] `city` — TEXT
- [ ] `zip` — TEXT

### 9.2 Lease comps relationship works:
- [ ] `lease_comps.property_id` FK links to `properties.property_id`
- [ ] Can create a lease comp with a property_id
- [ ] Can query lease comps by property_id
- [ ] `expiration_date` column exists and accepts DATE values

### 9.3 Companies relationship works:
- [ ] `lease_comps.company_id` FK links to `companies.company_id`
- [ ] `companies.lease_exp` column exists and accepts DATE values

### 9.4 Report: TPE columns missing from `properties`:
List any of these that do NOT exist yet:
- `owner_entity_type`
- `owner_user_or_investor`
- `owner_age_est`
- `hold_duration_years`
- `has_lien_or_delinquency`
- `out_of_area_owner`
- `owner_call_status`
- `tenant_call_status`

### 9.5 Report: Tables that need to be created for TPE:
Confirm these do NOT exist and need to be created:
- `loan_maturities`
- `debt_stress`
- `tenant_growth`
- `property_distress`
- `tpe_config`

---

## Phase 10: Role-Specific Linked Columns (Properties)

Properties table has 5 columns that are filtered by the `role` field on junction tables — they are NOT regular data columns. These must be tested separately from generic linked records.

### 10.1 Verify Role Columns Appear in Properties Table View

The following 5 columns should be visible (or toggleable) in the Properties table:

| Column Label | Source Table | Role Filter |
|---|---|---|
| Owner Contact | `property_contacts` | role = 'owner' |
| Broker Contact | `property_contacts` | role = 'broker' |
| Company Tenants | `property_companies` | role = 'tenant' |
| Company Owner | `property_companies` | role = 'owner' |
| Leasing Company | `property_companies` | role = 'leasing' |

- [ ] All 5 columns appear in the Properties table (may be hidden — use column toggle to show them)
- [ ] Columns show `--` for properties with no linked records of that role
- [ ] Columns show chips/names for properties that have linked records with those roles

### 10.2 Link Records with Roles from PropertyDetail

Open **Property 1** ([TEST] 1234 Commerce Center Dr) detail panel:

- [ ] Link **Contact 1** ([TEST] Mike Thompson) with role = `owner` → verify it appears in "Owner Contact" column in table
- [ ] Link **Contact 2** ([TEST] Sarah Chen) with role = `broker` → verify it appears in "Broker Contact" column
- [ ] Link **Company 1** ([TEST] Pacific Industrial LLC) with role = `owner` → verify in "Company Owner" column
- [ ] Link **Company 2** ([TEST] SoCal Distribution Inc) with role = `tenant` → verify in "Company Tenants" column

### 10.3 Verify Role-Filtered Sections in PropertyDetail

Open **Property 1** detail panel and confirm these 5 separate linked record sections exist (not one generic "Contacts" section):

- [ ] **Owner Contact** section — shows Contact 1
- [ ] **Broker Contact** section — shows Contact 2
- [ ] **Company Tenants** section — shows Company 2
- [ ] **Company Owner** section — shows Company 1
- [ ] **Leasing Company** section — exists (may be empty)

### 10.4 Verify NULL-role Records Shown in "Other" Sections

If any contacts/companies were linked before roles were added (NULL role), they should appear in conditional "Other" sections:
- [ ] "Other Contacts" section appears only if there are NULL-role contacts linked
- [ ] "Other Companies" section appears only if there are NULL-role companies linked
- [ ] If no NULL-role records exist, "Other" sections do NOT appear

### 10.5 Test New Links Get Correct Role

- [ ] Click "+" on the "Owner Contact" section → link picker opens → select a contact → link is saved with `role = 'owner'`
- [ ] Verify the newly linked contact appears in "Owner Contact" column in table view (not in Broker/Other sections)

---

## Phase 11: Activity Column in Table Views

The Activity column (`linked_interactions`) was added to all 4 main tables. It shows the 3 most recent interactions as compact colored chips and opens a full ActivityModal.

### 11.1 Verify Activity Column Exists on All 4 Tables

Navigate to each tab and confirm the Activity column is present (may need column toggle → Reset if user has saved column preferences):

- [ ] **Properties** — Activity column visible
- [ ] **Contacts** — Activity column visible
- [ ] **Deals** — Activity column visible
- [ ] **Companies** — Activity column visible

### 11.2 Test ActivityCellPreview Rendering

Find a record that has interactions linked to it (use test interactions created in Phase 2):

- [ ] **Populated cell** — Shows colored type-icon circles + truncated notes + date
- [ ] **"+N more" link** — Appears when there are more than 3 interactions
- [ ] **Empty cell** — Shows `--` placeholder (not blank, not an error)
- [ ] **Cell width** — Doesn't overflow or break the row layout

### 11.3 Test Clicking Populated Activity Cell → Opens Modal

Click on an activity cell that has interactions:
- [ ] ActivityModal opens (does NOT open the row detail panel)
- [ ] Modal title shows the entity name
- [ ] Full list of interactions displays with type icons, dates, notes preview
- [ ] `e.stopPropagation()` is working — the detail panel does NOT open behind the modal

### 11.4 Test Clicking Empty Activity Cell → Opens Modal

Click on a `--` activity cell (record with no interactions):
- [ ] ActivityModal opens (NOT the detail panel)
- [ ] Modal shows "No activity yet" or empty state
- [ ] Quick Note input is present in the modal

### 11.5 Test Quick Note from ActivityModal

With ActivityModal open on any entity:
- [ ] Type a note in the Quick Note input field
- [ ] Submit (Enter or button click)
- [ ] New interaction appears in the modal's list immediately
- [ ] Navigate to Activity tab → new interaction is present there too
- [ ] Open entity detail panel → interaction appears in ActivitySection

### 11.6 Test Deals Aggregated Activity

The Deals Activity column shows interactions from the deal itself PLUS linked contacts, properties, and companies — with "via [name]" provenance labels:
- [ ] Open ActivityModal for a Deal that has linked contacts/properties/companies with interactions
- [ ] Verify "via [Contact Name]" / "via [Property Address]" labels appear on aggregated items
- [ ] Direct deal interactions show without a "via" label

### 11.7 Test Click-Through to InteractionDetail

From within ActivityModal, click any individual interaction:
- [ ] InteractionDetail slide-over opens
- [ ] Correct interaction data displays
- [ ] Back navigation returns to ActivityModal (or closes cleanly)

---

## Phase 12: Inline Cell Editing

All 4 main table views support click-to-edit directly in the table cell — no need to open the detail panel for simple field updates.

### 12.1 Verify Click-to-Edit Triggers on Editable Cells

On the Properties table:
- [ ] Click a **text cell** (e.g., City, Owner Name) → text input appears in the cell
- [ ] Click a **select cell** (e.g., Property Type) → dropdown opens with options
- [ ] Click a **multi-select cell** (e.g., Contacted status) → checkbox dropdown opens
- [ ] Click a **boolean cell** (e.g., Off Market Deal) → toggles immediately without extra click
- [ ] Click a **number cell** (e.g., Building SF / RBA) → number input appears

### 12.2 Verify Primary Columns Do NOT Trigger Edit

These columns should open the detail panel, not inline edit:
- [ ] Click **Address** (Properties) → opens PropertyDetail, NOT an input
- [ ] Click **Full Name** (Contacts) → opens ContactDetail, NOT an input
- [ ] Click **Deal Name** (Deals) → opens DealDetail, NOT an input
- [ ] Click **Company Name** (Companies) → opens CompanyDetail, NOT an input

### 12.3 Verify Linked Columns Do NOT Trigger Edit

- [ ] Click any `linked_*` column cell (e.g., Owner Contact, Activity) → does NOT enter edit mode

### 12.4 Test Save on Blur / Enter

- [ ] Edit a text cell → click elsewhere (blur) → value saves → verify in detail panel
- [ ] Edit a text cell → press Enter → value saves
- [ ] Navigate away and back → edited value persists (confirms DB write, not just local state)

### 12.5 Test Cancel on Escape

- [ ] Enter edit mode on any cell → press Escape → original value restored, no save occurs

### 12.6 Test Each Editable Column Type Per Table

**Properties** (`handleCellSave` → `updateProperty`):
- [ ] `property_type` select — 7 options (Industrial, Office, Retail, etc.)
- [ ] `contacted` multi-select — 14 options (Contacted Owner, Not Contacted, etc.)
- [ ] `priority` select
- [ ] Boolean flag (e.g., `off_market_deal`) — toggles on click
- [ ] Number field (e.g., `rba`) — saves numeric value

**Contacts** (`handleCellSave` → `updateContact`):
- [ ] `type` select — 8 types (Owner, Tenant, Broker, etc.)
- [ ] `client_level` select — A, B, C, D options
- [ ] Boolean flag (e.g., `email_hot`) — toggles on click

**Deals** (`handleCellSave` → `updateDeal`):
- [ ] `status` select — 9 status options
- [ ] `deal_type` select
- [ ] `repping` multi-select
- [ ] `priority_deal` boolean toggle

**Companies** (`handleCellSave` → `updateCompany`):
- [ ] `revenue` number field
- [ ] `tags` field (comma-separated freeform)

### 12.7 Test Optimistic Update + Error Rollback

- [ ] Edit a cell → value updates immediately in the UI (before server responds)
- [ ] Simulate an error (disconnect or test with invalid value) → value reverts to original
- [ ] Toast notification appears on both success and failure

### 12.8 Test That Activity Column Is Not Editable

- [ ] Click the Activity column cell → ActivityModal opens (from Phase 11), NOT an edit input
- [ ] No cursor-cell style on the Activity column

---

## Phase 13: Column Resize (Drag-to-Resize)

All main table views support Airtable-style column resizing via drag handles on column header borders.

### 13.1 Drag-to-Resize Works

On the Properties table (or any main table):
- [ ] **Drag handle visible** — Hover over a column header right border → cursor changes to `col-resize`
- [ ] **Drag to widen** — Drag right → column widens, cell content has more space
- [ ] **Drag to narrow** — Drag left → column narrows, text truncates with ellipsis
- [ ] **Minimum width** — Cannot drag below 60px (minimum enforced)
- [ ] **Other columns unaffected** — Only the dragged column changes width; siblings don't shift unexpectedly

### 13.2 Widths Persist Across Navigation

- [ ] Resize a column → navigate to a different tab → navigate back → column retains the resized width
- [ ] Close and reopen the app → widths persist (stored in localStorage key `crm-col-widths-{tableKey}`)

### 13.3 Table Layout Enforced

- [ ] Columns respect the set width — text overflows with ellipsis, not by expanding the column
- [ ] `table-layout: fixed` is active — columns don't auto-expand to fit content
- [ ] Horizontal scroll works when total column width exceeds viewport

### 13.4 New Columns Get Default Width

- [ ] If a new custom field column is added, it receives a default width (150px) without breaking existing column sizes

---

## Phase 14: CSV Import — Campaign & Property Linking

The Import tab supports linking contacts to campaigns, owner properties, and broker properties during CSV upload.

### 14.1 Link Options Appear for Contacts Target

When "contacts" is selected as the import target:
- [ ] **Column mapping dropdown** includes: `Campaign → link`, `Property (owner) → link`, `Property (broker) → link`
- [ ] These appear alongside the existing `Company → link` and `Notes → Activity` options

### 14.2 Campaign Linking (Comma-Separated)

Prepare a test CSV with a column containing comma-separated campaign names (e.g., `"Spring Mailer, Fall Outreach"`):
- [ ] Map the column to `Campaign → link`
- [ ] **Preview** step shows the column correctly
- [ ] **Import succeeds** — links are created in `campaign_contacts` junction table
- [ ] **New campaigns auto-created** — If a campaign name doesn't exist, it's created in `campaigns` table
- [ ] **Existing campaigns matched** — If the campaign already exists (case-insensitive), the existing record is linked (no duplicate created)
- [ ] **Multiple campaigns per row** — Each comma-separated name creates a separate link

### 14.3 Property Owner Linking

Prepare a test CSV with a column containing property addresses that match existing properties:
- [ ] Map the column to `Property (owner) → link`
- [ ] Import links contacts to matching properties in `property_contacts` with `role = 'owner'`
- [ ] **Match-only** — If the property address doesn't match any existing property, the row is skipped (no auto-create for properties)

### 14.4 Property Broker Linking

Same as 14.3 but with `Property (broker) → link`:
- [ ] Links are created with `role = 'broker'` in `property_contacts`

### 14.5 Auto-Detect Column Names

CSV columns with these header names should auto-map:
- [ ] `campaigns`, `campaign`, `campaign name` → `Campaign → link`
- [ ] `owner properties`, `owner property` → `Property (owner) → link`
- [ ] `broker property`, `broker properties` → `Property (broker) → link`

### 14.6 Import Error Resilience

- [ ] Per-row savepoints work — one failed row doesn't abort the entire batch
- [ ] **Error count reported** — Import summary shows inserted count, link count, and error count
- [ ] Missing `normalized_address` column handled gracefully (try/catch fallback in property SELECT)

---

## Phase 15: Activity Display — Icons & Note Preview

Activity cells, activity sections, and activity modals display interaction types with correct icons and note previews.

### 15.1 Case-Insensitive Type Matching

Interactions with lowercase types from Airtable imports render correctly:
- [ ] `"note"` (lowercase) → shows **yellow** Note icon (annotation bubble), NOT gray Other icon
- [ ] `"phone call"` (lowercase) → shows **green** Phone icon
- [ ] Title displays as canonical Title Case: "Note", "Phone Call" — NOT "note", "phone call"
- [ ] All 17+ interaction types resolve correctly regardless of case in DB

### 15.2 Note Icon Style

- [ ] Note type icon is an annotation/speech-bubble with text lines (NOT the old pencil-alt/edit icon)
- [ ] Icon is consistent across: table cell preview, activity section (detail panel), activity modal, interactions page

### 15.3 Note Preview Text

In all activity displays (table cell, detail panel, modal):
- [ ] Note-type interactions show **"Note"** as the type label (not raw note text as the title)
- [ ] Below the label: truncated preview of note content (2-line clamp in sections/modal, ~35 chars in table cells)
- [ ] Non-Note types also show their note preview below the type label (consistent rendering)
- [ ] Clicking the activity item opens InteractionDetail with the full note content

### 15.4 Table Cell Activity Preview (ActivityCellPreview)

- [ ] Shows up to 3 recent interactions with colored type icons
- [ ] Each row shows: icon circle → type + preview text → date
- [ ] Note entries show: `"Note — Met with tenant to dis…"` (not just "note")
- [ ] `"+N more"` link appears when >3 interactions exist

### 15.5 InteractionDetail Type Display

- [ ] Opening any interaction shows the correct icon and Title Case type name in the header
- [ ] Email-type interactions (case-insensitive match) show the Email section with Subject/Body fields

---

## Phase 16: Boolean Coercion in Imports (If Implemented)

> **Note:** This may not be implemented yet. If boolean coercion has been added, test it. Otherwise skip.

CSV fields mapped to boolean columns should handle non-standard values:
- [ ] `"checked"` → `true`
- [ ] `"🔥"` → `true`
- [ ] `"yes"`, `"true"`, `"1"` → `true`
- [ ] `"no"`, `"false"`, `"0"`, `""` → `false`
- [ ] Unexpected values (e.g., `"maybe"`) → `false` (or null, no crash)

---

## Phase 17: Custom Saved Views

The saved views feature adds Airtable-style custom views to every entity tab. Each view stores filters, sort order, and column visibility. Views persist in a `saved_views` PostgreSQL table with localStorage caching.

### Key Files
| File | Purpose |
|---|---|
| `ie-crm/migrations/017_saved_views.sql` | Table schema + partial unique index |
| `ie-crm/src/utils/filterCompiler.js` | Compiles filter conditions → parameterized SQL |
| `ie-crm/src/hooks/useViewEngine.js` | Central hook: views, filters, sort, columns, cache |
| `ie-crm/src/components/shared/ViewBar.jsx` | Tab strip for switching views |
| `ie-crm/src/components/shared/FilterBar.jsx` | Active filter pills |
| `ie-crm/src/components/shared/FilterBuilder.jsx` | Modal filter editor |
| `ie-crm/src/api/views.js` | REST client for view CRUD |
| `ie-crm/server/index.js` | REST endpoints: GET/POST/PATCH/DELETE `/api/views` |

### 17.1 Schema Verification

- [ ] `saved_views` table exists with columns: `view_id`, `entity_type`, `view_name`, `filters`, `filter_logic`, `sort_column`, `sort_direction`, `visible_columns`, `is_default`, `position`, `created_at`, `updated_at`
- [ ] Partial unique index `idx_saved_views_one_default_per_entity` exists (enforces one default per entity type)
- [ ] Index `idx_saved_views_entity` exists on `(entity_type, position)`

### 17.2 REST API Endpoints

Test each endpoint via the browser or direct `fetch`:

**GET /api/views?entity_type=properties**
- [ ] Returns an empty array when no views exist
- [ ] Returns 400 for invalid entity_type (e.g., `?entity_type=users`)
- [ ] Returns 503 when database is not connected

**POST /api/views** — Create a view
- [ ] Create: `{ entity_type: "properties", view_name: "[TEST] Industrial Ontario", filters: [{ column: "property_type", operator: "equals", value: "Industrial" }, { column: "city", operator: "equals", value: "Ontario" }], filter_logic: "AND" }`
- [ ] Returns 201 with the created view including `view_id`
- [ ] Returns 400 for missing entity_type or view_name

**PATCH /api/views/:viewId** — Update a view
- [ ] Update the test view's name to `"[TEST] Industrial Riverside"`
- [ ] Returns the updated view with `updated_at` changed
- [ ] Returns 404 for non-existent viewId
- [ ] Test `{ is_default: true }` — sets the view as default via transaction

**DELETE /api/views/:viewId** — Delete a view
- [ ] Deletes the test view
- [ ] Returns `{ deleted: true }`
- [ ] Returns 404 for already-deleted viewId

### 17.3 ViewBar Component (All 6 Tabs)

Navigate to each tab and verify the ViewBar renders:

- [ ] **Properties** — "All Properties" tab visible as default active tab
- [ ] **Contacts** — "All Contacts" tab visible
- [ ] **Companies** — "All Companies" tab visible
- [ ] **Deals** — "All Deals" tab visible
- [ ] **Interactions** — "All Interactions" tab visible (note: this tab may use a timeline layout)
- [ ] **Campaigns** — "All Campaigns" tab visible
- [ ] **"+ New View" button** — visible on all tabs

### 17.4 Create a Saved View via UI

On the **Properties** tab:

1. [ ] Click **"+ New View"** → FilterBuilder modal opens
2. [ ] Select column **"property_type"**, operator **"equals"**, value **"Industrial"**
3. [ ] Click **"+ Add condition"** to add a second filter
4. [ ] Select column **"rba"**, operator **"between"**, value **[10000, 50000]**
5. [ ] Leave logic toggle on **AND**
6. [ ] Click **"Apply Filters"** → modal closes
7. [ ] **FilterBar** appears with 2 filter pills: `property type = Industrial` and `rba 10,000–50,000`
8. [ ] Table shows only matching properties (or empty if none match)
9. [ ] **"Save as View"** button appears in FilterBar
10. [ ] Click "Save as View" → name input appears → type `"[TEST] Industrial 10-50K"` → press Enter
11. [ ] New view tab appears in ViewBar: `[TEST] Industrial 10-50K`

### 17.5 Switch Between Views

- [ ] Click **"All Properties"** tab → filters clear, all records show
- [ ] Click **"[TEST] Industrial 10-50K"** tab → filters re-apply, filtered records show
- [ ] "Showing N of M" counter in FilterBar shows correct numbers (N < M when filtered)

### 17.6 Modify & Save a View

- [ ] With `[TEST] Industrial 10-50K` active, click **"+ Add Filter"** in FilterBar → FilterBuilder opens with existing filters pre-populated
- [ ] Add a new condition: `city equals Ontario`
- [ ] Apply → filter pills update to show 3 conditions
- [ ] **Dirty indicator** — small dot appears on the view tab + "Save" button appears
- [ ] Click **"Save"** → changes persist
- [ ] Navigate away and back → view still has 3 filters

### 17.7 View Context Menu (Right-Click)

- [ ] **Right-click** on the `[TEST] Industrial 10-50K` tab → context menu appears
- [ ] **Rename** — click Rename → inline input appears → type new name → press Enter → name updates
- [ ] **Duplicate** — creates a copy with "(copy)" suffix
- [ ] **Set as Default** — view becomes default (loads on tab first visit)
- [ ] **Delete** — removes the view, reverts to "All" tab

### 17.8 Filter Pill Removal

- [ ] Click the **✕** on any filter pill → that condition is removed
- [ ] Remaining filters stay active
- [ ] Removing all pills clears the filter → shows all records

### 17.9 Sort Integration

- [ ] Click a column header to sort → sort order changes
- [ ] With a saved view active, changing sort shows the dirty indicator
- [ ] Save the view → sort order persists when switching back to this view

### 17.10 Filter Operators

Test various operators work correctly from the FilterBuilder:

- [ ] **equals** — exact match (text or select)
- [ ] **contains** — partial text match (ILIKE)
- [ ] **between** — shows two value inputs, filters numeric range
- [ ] **is_empty** — no value input needed, shows records with NULL values
- [ ] **is_not_empty** — shows records with non-NULL values
- [ ] **gt / lt** — greater/less than for numbers and dates
- [ ] **before / after** — date pickers appear for date columns

### 17.11 localStorage Cache

- [ ] Create a saved view → refresh the page → view tabs appear instantly (from localStorage cache before server response)
- [ ] The last active view is remembered across page refreshes (stored via `views_properties_active` key)

### 17.12 Security Validation

- [ ] Filters with unknown column names (not in columnDefs) produce no WHERE clause (silently ignored)
- [ ] Filters with unknown operators produce no WHERE clause
- [ ] The `queryWithFilters` function rejects invalid table names with an error

### 17.13 Existing Search Coexistence

- [ ] The search bar on Properties still works independently
- [ ] Typing in the search bar overrides view filters temporarily (uses the legacy `getProperties` path)
- [ ] Clearing the search bar restores view filters

---

## Phase 18: TPE Living Database

The TPE (Transaction Probability Engine) scores properties 0–100 based on lease expiration, owner characteristics, market stress, and estimated commission value. It includes a tunable config panel and data gap tracking.

### Key Files
| File | Purpose |
|---|---|
| `ie-crm/migrations/015_tpe_living_database.sql` | Scoring VIEW with temporal decay + config table |
| `ie-crm/migrations/016_tpe_data_gaps.sql` | Data gap analysis VIEW |
| `ie-crm/src/pages/TPEEnrichment.jsx` | Main TPE dashboard page |
| `ie-crm/src/components/tpe/TpeDetailPanel.jsx` | Property TPE detail slide-over |
| `ie-crm/src/components/tpe/QuickTuneDrawer.jsx` | Config tuning panel |
| `ie-crm/server/index.js` | TPE config + data gap endpoints |

### 18.1 TPE Schema Verification

- [ ] `tpe_config` table exists with `config_key`, `config_value`, `config_category`, `config_label` columns
- [ ] `property_tpe_scores` VIEW exists (returns properties with `tpe_score`, `tier`, `call_reason`, etc.)
- [ ] `property_data_gaps` VIEW exists (returns data gap analysis per property)
- [ ] Config has tier threshold keys: `tier_a_threshold`, `tier_b_threshold`, `tier_c_threshold`

### 18.2 TPE Dashboard

Navigate to the TPE Enrichment page:

- [ ] **Page loads** without errors
- [ ] **Score distribution** — shows properties distributed across tiers A/B/C/D
- [ ] **Stats summary** — shows total scored properties, average score, tier counts
- [ ] **Property list** — shows scored properties with columns: address, city, score, tier, call reason

### 18.3 TPE Detail Panel

Click a property in the TPE list:

- [ ] **TpeDetailPanel opens** as a slide-over
- [ ] **Score breakdown** — shows individual component scores (lease, ownership, age, stress, etc.)
- [ ] **Call reason** — displays the top reason for contacting this owner
- [ ] **Projected tier** — uses dynamic tier thresholds from config (not hardcoded 50/40/30)
- [ ] **Linked owner/company** — clicking opens their detail panel ON TOP (not replacing TPE panel)
- [ ] **Back navigation** — closing the owner/company panel returns to the TPE detail (not closing everything)

### 18.4 TPE Config (QuickTuneDrawer)

Open the config/tuning panel:

- [ ] **Config loads** — all configuration values display with correct labels
- [ ] **Edit a value** — change a scoring weight → save → verify score changes
- [ ] **Blend weights** — TPE weight + ECV weight save atomically (single batch PATCH)
- [ ] **Reset defaults** — POST /api/ai/tpe-config/reset restores all values

### 18.5 Data Gaps

- [ ] **Gap endpoint** — GET /api/ai/tpe-gaps returns properties with missing data
- [ ] **Gap stats** — GET /api/ai/tpe-gaps/stats returns counts by gap type
- [ ] **Fetch error handling** — bad responses show user-friendly error (not silent failure)

### 18.6 TPE Scoring Logic Verification

Run a SQL query to spot-check scoring:
```sql
SELECT property_address, city, tpe_score, tier, call_reason,
       lease_exp_score, ownership_score, age_score, stress_score
FROM property_tpe_scores
ORDER BY tpe_score DESC
LIMIT 10;
```

- [ ] Scores are in 0–100 range
- [ ] Tiers match thresholds (A ≥ tier_a, B ≥ tier_b, C ≥ tier_c, D below tier_c)
- [ ] Call reasons are not NULL (COALESCE handles missing data with '?' placeholder)
- [ ] Properties with expired leases have non-zero lease_exp_score
- [ ] Distress types (Auction, NOD, Matured) don't decay over time

### 18.7 Pool Guards

- [ ] All TPE API endpoints return 503 with "Database not connected" when pool is null
- [ ] Both `/api/ai/tpe-gaps` and `/api/ai/tpe-gaps/stats` have pool guards

---

## Phase 19: Team Chat — Real-Time Messaging & Houston AI

The Team Chat is a Socket.io-powered real-time messaging system with an AI assistant (Houston) that responds to @mentions and questions. The chat window is draggable, resizable, and minimizable.

### Key Files
| File | Purpose |
|---|---|
| `ie-crm/src/components/chat/TeamChat.jsx` | Main chat component — messages, input, file upload |
| `ie-crm/server/index.js` | Socket.io server — message broadcasting, Houston AI integration |
| `ie-crm/src/components/chat/TeamChatToggle.jsx` | Toggle button with unread badge |

### 19.1 Socket.io Connection

- [ ] Chat connects to the Socket.io server without errors on page load
- [ ] Connection indicator shows "Connected" state in chat header
- [ ] Disconnecting the server shows reconnection attempts

### 19.2 Sending & Receiving Messages

- [ ] Type a message and press Enter — message appears in chat
- [ ] Message shows correct sender name, avatar, and timestamp
- [ ] Open a second browser tab — messages sent in one appear in the other in real time
- [ ] Empty messages are prevented (send button disabled / Enter does nothing)

### 19.3 Houston AI Brain

- [ ] Type `@Houston what is CRE?` — Houston responds with an AI-generated answer
- [ ] Houston responses are visually distinct from user messages (different color/avatar)
- [ ] Ask Houston a CRM-related question — response references RAG memory if available
- [ ] Houston does not respond to messages without @mention or question mark

### 19.4 File & Image Upload

- [ ] Click the attachment icon — file picker opens
- [ ] Upload an image — preview appears in the chat message
- [ ] Upload a non-image file — file name/link appears in the message
- [ ] Large files are rejected or show an error (check size limit)

### 19.5 Typing Indicators

- [ ] Start typing in one tab — "User is typing..." appears in the other tab
- [ ] Stop typing — indicator disappears after a short delay
- [ ] Multiple users typing shows all names

### 19.6 Reactions

- [ ] Hover over a message — reaction picker appears
- [ ] Click an emoji — reaction appears on the message
- [ ] Same reaction from multiple users shows count
- [ ] Click own reaction again to remove it

### 19.7 Infinite Scroll Message History

- [ ] Scroll up in chat — older messages load automatically
- [ ] Loading spinner appears during fetch
- [ ] Scroll position is preserved when older messages load (no jump to top)
- [ ] Reaching the oldest message stops further loading

### 19.8 Unread Badge

- [ ] Close/minimize chat — send a message from another tab — unread badge appears on the toggle button
- [ ] Badge shows correct count of unread messages
- [ ] Opening chat clears the unread badge

---

## Phase 20: Houston Image Analysis

Houston can analyze images dropped into Team Chat, classify them, and offer CRM actions based on the content.

### 20.1 Image Classification

- [ ] Drop/upload an image into Team Chat — Houston analyzes it automatically
- [ ] Houston classifies the image into one of: `client_conversation`, `property_listing`, `document`, `crm_data`, `personal`
- [ ] Classification label appears in Houston's response

### 20.2 CRM Action Suggestions

- [ ] For a `property_listing` image — Houston suggests creating a property record or lease comp
- [ ] For a `client_conversation` image (e.g., screenshot of text messages) — Houston suggests creating an interaction record
- [ ] For a `document` image — Houston summarizes key information and suggests relevant CRM actions
- [ ] For a `personal` image — Houston does not suggest CRM actions (responds conversationally)

### 20.3 Action Confirmation Flow

- [ ] Houston's CRM action suggestion includes a thumbs-up or "yes" confirmation prompt
- [ ] Clicking thumbs-up / typing "yes" creates the corresponding interaction record in the database
- [ ] Confirm the new interaction record appears in the Interactions tab with correct details
- [ ] Canceling or ignoring the prompt does not create any record

---

## Phase 21: OAuth Migration

All Claude AI calls now use `ANTHROPIC_OAUTH_TOKEN` (Claude Max subscription) instead of API key authentication. The model is `claude-sonnet-4-6` everywhere.

### 21.1 Environment Configuration

- [ ] `ANTHROPIC_OAUTH_TOKEN` environment variable is set in `.env`
- [ ] No references to `ANTHROPIC_API_KEY` remain in active server code (grep the codebase)
- [ ] Server starts without authentication errors

### 21.2 Model Consistency

- [ ] Grep all files for `claude-` model references — all should be `claude-sonnet-4-6`
- [ ] No hardcoded `claude-3` or `claude-3.5` model strings remain in active code

### 21.3 AI Feature Verification

- [ ] Houston AI in Team Chat responds correctly (uses OAuth token)
- [ ] Houston image analysis works (vision API via OAuth)
- [ ] ClaudePanel (if present) uses OAuth proxy routes, not direct API key SDK
- [ ] TPE scoring AI endpoints work (if AI-powered)
- [ ] No 401/403 authentication errors in server logs during AI calls

---

## Phase 22: New View Modal

The "+ New View" button opens a modal that lets users name and create saved views with a summary of current filters, sort, and columns.

### 22.1 Modal Opening

- [ ] Click "+ New View" button on the Properties page — modal opens
- [ ] Modal contains: name input field, filters summary, sort summary, columns count
- [ ] Modal has a "Create View" button

### 22.2 View Creation

- [ ] Enter a view name and click "Create View" — view is created and appears in the ViewBar
- [ ] Empty name is prevented (validation error or disabled button)
- [ ] The new view captures current filter state correctly
- [ ] The new view captures current sort state correctly
- [ ] The new view captures current column visibility state

### 22.3 Cross-Entity Support

- [ ] "+ New View" modal works on Contacts page
- [ ] "+ New View" modal works on Companies page
- [ ] "+ New View" modal works on Deals page
- [ ] "+ New View" modal works on Interactions page
- [ ] "+ New View" modal works on Campaigns page

### 22.4 Modal UX

- [ ] Modal can be dismissed by clicking outside or pressing Escape
- [ ] Filters summary in modal accurately reflects active filters
- [ ] Sort summary shows current sort column and direction
- [ ] Columns count reflects number of visible columns

---

## Phase 23: Auth Headers Sweep

All API fetch calls across the application now include JWT auth headers for secure access.

### 23.1 Verify Auth Headers in Code

- [ ] Grep all `fetch(` calls in `src/` — each includes `Authorization` header with JWT token
- [ ] TPE Enrichment page API calls include auth headers
- [ ] Enrichment page API calls include auth headers
- [ ] QuickTuneDrawer config save/load calls include auth headers
- [ ] AI Ops panel API calls include auth headers
- [ ] Agent hook API calls include auth headers

### 23.2 Authenticated Request Testing

- [ ] Navigate to Properties page — data loads (auth header sent)
- [ ] Open TPE Enrichment page — scores load (auth header sent)
- [ ] Open QuickTuneDrawer — config loads (auth header sent)
- [ ] Remove or invalidate the JWT token — API calls return 401 Unauthorized
- [ ] Expired token triggers re-authentication flow (login redirect or refresh)

---

## Phase 24: Chat Window UX

The Team Chat window is non-blocking (no backdrop), draggable, resizable, and has expand/minimize controls.

### 24.1 Non-Blocking Behavior

- [ ] Open Team Chat — the rest of the application remains fully interactive (no backdrop/overlay)
- [ ] Click on sidebar nav items while chat is open — navigation works normally
- [ ] Click on table rows while chat is open — detail panels open normally

### 24.2 Draggable Window

- [ ] Drag the chat window by its header bar — window moves freely
- [ ] Window stays within viewport bounds (cannot be dragged off-screen)
- [ ] Dragging does not interfere with text selection inside the chat

### 24.3 Resizable Window

- [ ] Drag the corner resize handle — window resizes smoothly
- [ ] Minimum size is enforced (window cannot be made too small)
- [ ] Content inside adjusts to new dimensions (messages area, input field)

### 24.4 Expand/Restore Button

- [ ] Click the expand button — chat window expands to a larger preset size
- [ ] Click restore — chat returns to previous size and position
- [ ] Expand/restore toggles correctly on repeated clicks

### 24.5 Minimize to Header Bar

- [ ] Click the minimize button — chat collapses to just the header bar
- [ ] Click the collapsed header bar — chat restores to full size
- [ ] Minimized state does not lose message history

### 24.6 Auto-Scroll Behavior

- [ ] Open chat — view scrolls to the most recent message without a visible flash
- [ ] Receive a new message while scrolled to bottom — auto-scrolls to show it
- [ ] Scrolled up reading history — new message does NOT force scroll (shows "new messages" indicator instead)

---

## Phase 25: Security Hardening

Hardcoded credentials removed, dotenv compatibility fixed, and rate limiting patched.

### 25.1 Credential Removal

- [ ] Grep all files in `ie-crm/` for hardcoded Neon connection strings (e.g., `neondb`, `postgresql://`) — none found outside `.env` and `.env.example`
- [ ] Specifically check the 9 script files that previously had hardcoded credentials — all now use `process.env.DATABASE_URL`
- [ ] `.env` file is listed in `.gitignore`

### 25.2 Dotenv Compatibility

- [ ] Server starts correctly with Node 25 (dotenv override applied)
- [ ] `dotenv` is loaded before any `process.env` references in server startup
- [ ] No "undefined" connection string errors on cold start

### 25.3 Rate Limiting IPv6 Fix

- [ ] `express-rate-limit` is configured and active on the Express server
- [ ] IPv6 loopback (`::1`) and IPv4 loopback (`127.0.0.1`) are handled correctly (not treated as different clients)
- [ ] Rate limit applies correctly: exceeding the limit returns 429 Too Many Requests
- [ ] Auth endpoints have stricter rate limits than general endpoints

---

## Phase 26: Final Report

After all tests complete, produce a report in this format:

```
# IE CRM Test Report — [date]

## Summary
- Total tests: XX
- Passed: XX
- Fixed during testing: XX
- Still failing: XX (with details)

## Schema Status
- Tables found: [list]
- Tables missing: [list]
- Columns needing migration: [list]

## Tab-by-Tab Results

### Properties
- List view: PASS/FAIL
- Create: PASS/FAIL
- Detail panel: PASS/FAIL
- Inline edit: PASS/FAIL
- Linked records: PASS/FAIL
- Quick note: PASS/FAIL
[...repeat for each tab]

## Linked Records
- All 22 junction links tested: PASS/FAIL
- Bidirectional verification: PASS/FAIL
- Link picker search: PASS/FAIL
- Unlinking: PASS/FAIL

## Role-Specific Columns (Phase 10)
- 5 role columns visible in Properties table: PASS/FAIL
- Role-filtered sections in PropertyDetail: PASS/FAIL
- New links save correct role: PASS/FAIL
- NULL-role "Other" sections conditional: PASS/FAIL

## Activity Column (Phase 11)
- Activity column on all 4 tables: PASS/FAIL
- Populated cell renders correctly: PASS/FAIL
- Empty cell click opens modal: PASS/FAIL
- Populated cell click opens modal (not detail panel): PASS/FAIL
- Quick Note from modal creates interaction: PASS/FAIL
- Deals aggregated activity with provenance: PASS/FAIL
- Click-through to InteractionDetail: PASS/FAIL

## Inline Cell Editing (Phase 12)
- Text fields editable: PASS/FAIL
- Select fields editable: PASS/FAIL
- Multi-select fields editable: PASS/FAIL
- Boolean toggle works: PASS/FAIL
- Primary columns NOT editable (open detail): PASS/FAIL
- Linked columns NOT editable: PASS/FAIL
- Blur/Enter saves: PASS/FAIL
- Escape cancels: PASS/FAIL
- Optimistic update + rollback: PASS/FAIL

## Column Resize (Phase 13)
- Drag-to-resize works: PASS/FAIL
- Minimum width enforced (60px): PASS/FAIL
- Widths persist across navigation: PASS/FAIL
- Widths persist after app restart (localStorage): PASS/FAIL
- table-layout: fixed enforced: PASS/FAIL

## CSV Import — Campaign & Property Linking (Phase 14)
- Campaign link option appears for contacts: PASS/FAIL
- Comma-separated campaigns create multiple links: PASS/FAIL
- New campaigns auto-created: PASS/FAIL
- Existing campaigns matched (no dupes): PASS/FAIL
- Property (owner) linking works: PASS/FAIL
- Property (broker) linking works: PASS/FAIL
- Auto-detect column headers: PASS/FAIL
- Per-row error resilience: PASS/FAIL

## Activity Display — Icons & Note Preview (Phase 15)
- Case-insensitive type matching: PASS/FAIL
- Lowercase "note" shows yellow icon (not gray Other): PASS/FAIL
- Note icon is annotation bubble (not pencil): PASS/FAIL
- Note preview text shows below type label: PASS/FAIL
- Title Case display names in all views: PASS/FAIL
- Table cell preview shows "Note — preview…": PASS/FAIL
- InteractionDetail shows correct icon + name: PASS/FAIL

## Boolean Coercion (Phase 16) — if implemented
- Standard values coerced correctly: PASS/FAIL/SKIPPED
- Emoji/text values handled: PASS/FAIL/SKIPPED

## Custom Saved Views (Phase 17)
- saved_views table + indexes exist: PASS/FAIL
- REST API CRUD endpoints work: PASS/FAIL
- ViewBar renders on all 6 tabs: PASS/FAIL
- Create view via FilterBuilder UI: PASS/FAIL
- Switch between views: PASS/FAIL
- "Showing N of M" counter correct: PASS/FAIL
- Filter pill removal works: PASS/FAIL
- View context menu (rename/duplicate/delete/set default): PASS/FAIL
- Sort integration with dirty indicator: PASS/FAIL
- All filter operators work (equals, contains, between, is_empty, gt, lt, before, after): PASS/FAIL
- localStorage cache persists views across refresh: PASS/FAIL
- Security: unknown columns/operators silently ignored: PASS/FAIL
- Existing search bar coexists with view filters: PASS/FAIL

## TPE Living Database (Phase 18)
- tpe_config table exists: PASS/FAIL
- property_tpe_scores VIEW works: PASS/FAIL
- property_data_gaps VIEW works: PASS/FAIL
- TPE dashboard loads with score distribution: PASS/FAIL
- TpeDetailPanel shows score breakdown + call reason: PASS/FAIL
- Dynamic tier thresholds (not hardcoded): PASS/FAIL
- SlideOver back-navigation from linked owner/company: PASS/FAIL
- QuickTuneDrawer config editing + atomic blend save: PASS/FAIL
- Data gap endpoints with pool guards: PASS/FAIL
- Scoring logic: 0-100 range, correct tiers, NULL-safe call reasons: PASS/FAIL
- Distress types (Auction/NOD/Matured) don't decay: PASS/FAIL

## Team Chat (Phase 19)
- Socket.io connection established: PASS/FAIL
- Send/receive messages in real time: PASS/FAIL
- Houston AI responds to @mentions: PASS/FAIL
- File/image upload works: PASS/FAIL
- Typing indicators visible: PASS/FAIL
- Reactions add/remove: PASS/FAIL
- Infinite scroll loads history: PASS/FAIL
- Unread badge appears and clears: PASS/FAIL

## Houston Image Analysis (Phase 20)
- Image classification (5 categories): PASS/FAIL
- CRM action suggestions per category: PASS/FAIL
- Thumbs-up confirmation creates interaction record: PASS/FAIL
- Cancel/ignore does not create record: PASS/FAIL

## OAuth Migration (Phase 21)
- ANTHROPIC_OAUTH_TOKEN configured: PASS/FAIL
- No ANTHROPIC_API_KEY references in active code: PASS/FAIL
- All model references are claude-sonnet-4-6: PASS/FAIL
- AI features work without auth errors: PASS/FAIL

## New View Modal (Phase 22)
- Modal opens with name, filters, sort, columns: PASS/FAIL
- View created and appears in ViewBar: PASS/FAIL
- Works on all 6 entity pages: PASS/FAIL
- Modal dismissible via Escape/click-outside: PASS/FAIL

## Auth Headers Sweep (Phase 23)
- All fetch calls include JWT auth header: PASS/FAIL
- Authenticated requests succeed: PASS/FAIL
- Invalid/expired token returns 401: PASS/FAIL

## Chat Window UX (Phase 24)
- Non-blocking (no backdrop): PASS/FAIL
- Draggable via header: PASS/FAIL
- Resizable via corner handle: PASS/FAIL
- Expand/restore toggle: PASS/FAIL
- Minimize to header bar: PASS/FAIL
- Auto-scroll without flash: PASS/FAIL

## Security Hardening (Phase 25)
- No hardcoded credentials in codebase: PASS/FAIL
- Dotenv loads before process.env references: PASS/FAIL
- Rate limiting active with IPv6 fix: PASS/FAIL
- .env in .gitignore: PASS/FAIL

## Fixes Applied
1. [file:line] — description of what was broken and how it was fixed
2. ...

## TPE Readiness
- Base properties columns: READY / X columns missing
- Lease comps FK working: YES/NO
- Companies FK working: YES/NO
- TPE-specific columns missing from properties: [list]
- TPE tables to create: [list]

## Recommendation
[Ready to build TPE / Need to fix X before TPE]

## Improvement Recommendations
Things that aren't broken but could be better — discovered during testing.

### UX / Visual
1. [Component/area] — suggestion and why it would help
2. ...

### Performance
1. [Area] — what's slow and a proposed improvement
2. ...

### Data Integrity
1. [Area] — edge case or validation gap worth addressing
2. ...

### Future-Proofing
1. [Area] — something that works now but may cause issues at scale
2. ...
```

---

## Rules for This Testing Session

1. **Fix, don't just report.** If something is broken, fix it in the code, then re-test.
2. **Test through the UI** using the preview tools, not just via API calls. The user needs the UI to work.
3. **Check both frontend and backend.** A 200 response means nothing if the UI doesn't render the data.
4. **Prefix all test data with `[TEST]`** so it's identifiable.
5. **Don't modify HANDOFF.md, ROADMAP.md, or ARCHITECTURE.md** — those are documentation, not code.
6. **Don't add new features** — only fix existing broken functionality.
7. **Don't change the schema** unless something is genuinely missing that prevents existing features from working (e.g., a column referenced in code that doesn't exist in the database).
8. **Commit fixes** with descriptive messages like `fix: repair linked record display in contact detail panel`.
9. **Be thorough but efficient** — if a pattern works on one tab, you can test it more quickly on other tabs that use the same shared components.
10. **Use `database.js` function signatures** as the source of truth for what operations the app supports. If a function exists in `database.js` but doesn't work, that's a bug to fix.
