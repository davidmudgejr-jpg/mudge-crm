# IE CRM — Architecture & Technical Decisions
**Inland Empire Commercial Real Estate CRM**  
Mudge Team CRE — Built by David Mudge Jr  
Last updated: March 2026

---

## What This App Is

A web-based CRM built specifically for industrial commercial real estate brokerage in the Inland Empire (Riverside/Corona/Ontario). Purpose-built for industrial property tracking, owner outreach, deal management, lease comp analysis, and team coordination. Not a generic CRM.

---

## Tech Stack

| Layer | Technology | Location | Notes |
|---|---|---|---|
| Frontend | React | Vercel | Auto-deploys on GitHub push |
| Backend | Node.js / Express | Railway | Auto-deploys on GitHub push |
| Database | PostgreSQL | Railway → Neon (migration pending) | |
| Source control | GitHub | GitHub | Push to main = deploy everywhere |
| AI | Claude API (Anthropic) | Backend | Needs ANTHROPIC_API_KEY set in Railway env |
| Dev tool | Claude Code | Local (terminal) | Run on any machine after git pull |

---

## Deployment Pipeline

```
Local machine (Claude Code)
        ↓ git push
      GitHub
     ↙        ↘
Railway        Vercel
(backend)    (frontend)
     ↘        ↙
   PostgreSQL (Neon)
```

**Multi-machine workflow:** Any machine can run Claude Code after cloning the repo and copying the .env file. All changes go through GitHub — no machine-specific state.

**Environment variables** live in Railway dashboard (backend) and Vercel dashboard (frontend). Never committed to GitHub.

---

## Database

### Current Host
Neon PostgreSQL — connected and working. Migrated March 2026.

- **Project:** ie-crm
- **Region:** AWS US West 2 (Oregon) — chosen to minimize latency with Railway backend
- **Postgres version:** 17
- **Connection pooling:** Built-in pgBouncer via Neon pooled connection string

### Why Neon (migrated from Railway PostgreSQL)
- Built-in pgBouncer connection pooling — critical for performance at 50K+ records
- Database branching — test schema migrations on a copy before touching production
- Autoscaling to zero — no billing for idle overnight/weekend time
- Better developer workflow for solo/small team building fast

**Connection string format (always use pooled — hostname contains `-pooler`):**
`postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require`

**Important:** Always use the pooled connection string (with `-pooler` in the hostname). Never use the direct connection string for the app.

---

## Current Tables & Schema

### properties
30+ columns. Core table of the entire CRM.

**Building Info:** id, address, property_name, city, county, zip, type (Industrial/Office/Retail/Land/Flex), building_sf, lot_sf, year_built, units, stories, parking, apn, zoning

**Financial Info:** asking_price, price_per_sf, rba, far, cap_rate, noi

**Owner Info:** owner_name, owner_phone, owner_email, mailing_address

**Status:** priority, contacted (boolean), tags

**To add — infrastructure columns:**
- `latitude` (decimal) — GIS/Maps Phase 6
- `longitude` (decimal) — GIS/Maps Phase 6
- `parcel_number` — GIS parcel overlays
- `source` — CoStar / Landvision / Manual / etc.
- `source_id` — original ID from import source
- `canonical_id` — for deduplication merging
- `last_sale_date`, `last_sale_price`, `last_sale_price_per_sf` — sale history
- `created_by`, `updated_by` — audit fields

**Indexes needed:** address, city, zip, county, type, owner_name, priority, contacted, zoning, apn

---

### contacts
26 columns.

**Contact Info:** id, full_name, first_name, type (Owner/Tenant/Broker/Lender/etc.), title, email, email_2, phone_1, phone_2, phone_hot, email_hot, linkedin, client_level

**Address:** home_address, work_address, work_city, work_state, work_zip

**Status:** active_need, follow_up, last_contacted, data_source

**To add:** source, source_id, canonical_id, created_by, updated_by

**Indexes needed:** full_name, email, phone_1, type, last_contacted, data_source

---

### companies
17 columns.

**Company Info:** id, company_name, type (Owner/Operator/Tenant/Broker/etc.), industry, website, hq_location, city, sf, employees, revenue, growth

**Lease Info:** lease_expiration, months_left, move_in_date

**To add:** created_by, updated_by

**Indexes needed:** company_name, type, industry, city, lease_expiration

---

### deals
20 columns.

**Deal Info:** id, name, type (Sale/Lease), status (Active/Dead/Closed), repping (Landlord/Tenant/Buyer/Seller), sf, rate, gross_fee, net_potential, price

**Dates:** close_date, important_date
**To add:** loi_expiration, projected_close, next_follow_up

**Status:** priority_deal (boolean), dead_reason

**To add:** created_by, updated_by

**Indexes needed:** status, type, repping, close_date, priority_deal

---

### interactions
The backbone of the notes/activity system. Powers the Activity tab (global feed), Quick Note on every record, and the Activity section inside every detail panel.

**Core fields:** id, type (Note/Call/Tour/Email/Other), content (text), created_at, created_by

**Polymorphic relationship — this is the key design:**
- `record_type` (text): "property" | "contact" | "company" | "deal" | "campaign" | "task"
- `record_id` (integer): the ID of whatever record this interaction belongs to

A note on Contact #42 = `record_type: "contact", record_id: 42`  
A call logged on Property #7 = `record_type: "property", record_id: 7`

One table serves everything. Adding a new record type (like tasks) just means adding a new valid value for record_type — no new tables needed.

**Most important index in the app:** composite index on (record_type, record_id)  
**Also index:** created_at, type

---

### campaigns
id, name, type (Email/Call/Mail/etc.), status (Scheduled/Sent/Draft), sent_date, notes, last_modified

**Indexes needed:** status, type, sent_date

---

### tasks (to be added — Phase 1C)
id, title, description, due_date, priority (High/Medium/Low), completed (boolean), completed_date, assigned_to, created_by, created_at, updated_at

**Polymorphic link:** record_type + record_id (same pattern as interactions — links to any record type)

---

### lease_comps (to be added — Phase 1D)
id, property_id (FK → properties), tenant_name, sf, rate, lease_type (NNN/Gross/Modified Gross), term_months, commencement_date, expiration_date, free_rent_months, ti_allowance, source (CoStar/Landvision/Direct/Other), verified (boolean), notes, created_at, created_by

---

### Junction Tables (cross-linking between records)
These power the linked record badges (e.g. "CONTACTS 1", "PROPERTIES 1") in every detail panel.

- `contact_properties` — contact_id, property_id
- `contact_companies` — contact_id, company_id
- `contact_campaigns` — contact_id, campaign_id
- `deal_properties` — deal_id, property_id
- `deal_contacts` — deal_id, contact_id
- `deal_companies` — deal_id, company_id

---

## Environment Variables

| Variable | Where set | Status | Purpose |
|---|---|---|---|
| DATABASE_URL | Railway dashboard | ✅ Set | Neon PostgreSQL pooled connection string |
| ANTHROPIC_API_KEY | Railway dashboard | ❌ Not set | Powers Claude AI panel / Houston |
| AIRTABLE_API_KEY | Railway dashboard | ✅ Set | Being deprecated — switching to CSV import |
| AIRTABLE_BASE_ID | Railway dashboard | ✅ Set | appQaZNM0Mt4Zul3q — being deprecated |

**Local .env file** mirrors Railway env vars for local development. Never committed to GitHub.

---

## Key Architectural Decisions

### Why Web App (not Electron)
Originally built as Electron desktop app but migrated to React (Vercel) + Node.js (Railway). Web app is the right choice because:
- David works across 3 machines — web app is accessible from any browser
- GitHub → auto-deploy pipeline means changes are live everywhere immediately
- Sets up naturally for team access (Sarah, Dad) and future iOS app
- No per-machine installation or sync headaches

### Why Polymorphic Interactions Table
One `interactions` table with `record_type` + `record_id` handles notes/activity for all record types. The alternative — separate notes tables per record type — would mean duplicate code, impossible global Activity feed, and a new table every time a new record type is added. Polymorphic is correct here and should not be changed.

### Why CSV Import (not Airtable API Sync)
Airtable sync was built and connected. Decision made to switch to CSV import instead:
- One clean migration, no ongoing sync complexity
- No Airtable API rate limit issues at 50K records
- Full control over field mapping and deduplication logic
- Removes permanent dependency on Airtable
- Airtable becomes read-only source of truth during transition, then retired

### Why Neon (not Railway for database)
See Database section above. Short version: connection pooling, branching, and cost for this usage pattern.

### File Storage (future — Cloudflare R2)
When photos/PDFs needed: R2 stores files, DB stores URL strings only. Does not require schema changes beyond adding a `_url` column.

---

## Naming Conventions
- Table names: snake_case plural (`properties`, `lease_comps`, `contact_properties`)
- Column names: snake_case (`building_sf`, `created_at`, `owner_name`)
- All tables have: `id` (PK), `created_at`, `updated_at`
- Booleans: named as past-tense adjectives or prefixed (`contacted`, `verified`, `priority_deal`)

---

## Two Rules Claude Code Must Always Follow

**Pagination:** Every list endpoint returns max 50 records using LIMIT/OFFSET. Never fetch all records. Remind Claude Code every session: *"All list endpoints must be paginated to 50 records max."*

**Indexes:** Every column used in WHERE, ORDER BY, or JOIN needs an index. When adding a new table tell Claude Code: *"Add indexes to all columns we'll filter or search on."*

---

## Prompt to Start Every Claude Code Session

Copy and paste this at the start of each new Claude Code conversation:

> "This is IE CRM — a React (Vercel) + Node.js/Express (Railway) + PostgreSQL (Neon) web CRM for industrial commercial real estate in the Inland Empire. Backend auto-deploys to Railway on GitHub push. Frontend auto-deploys to Vercel on GitHub push. Read ROADMAP.md for the full build plan and where we are. The interactions table is polymorphic (record_type + record_id) and powers all activity/notes across the app — do not change this pattern. All list endpoints must be paginated to 50 records max. All new tables need created_at, updated_at, created_by, updated_by and indexes on any filtered/searched columns. Airtable sync is being deprecated — do not add to it. We are migrating the database from Railway to Neon."
