# IE CRM — Build Roadmap
**Inland Empire Commercial Real Estate CRM**
Mudge Team CRE — Built by David Mudge Jr
Last updated: March 2026

---

## Current State (as of March 2026)

### Already Built
- 6 core tabs: Properties, Contacts, Companies, Deals, Activity, Campaigns
- Consistent list view with toggleable columns across all tabs
- Slide-out detail panel on every record
- Quick Note on every record (saves to interactions table)
- Activity/Interactions log — polymorphic, surfaces on all related records
- Cross-linking working: Properties <> Contacts <> Companies <> Deals <> Campaigns
- New record modals with consistent pattern across all tabs
- Claude AI panel stubbed in on Properties (needs ANTHROPIC_API_KEY set)
- Settings tab with connection status, record counts, environment variable visibility
- GitHub > Railway (backend) + Vercel (frontend) auto-deploy pipeline working
- Multi-machine workflow: push to GitHub, changes live everywhere
- Column menu fix: Rename/Hide/Delete with system field protection (8 files, uncommitted)

### Fully Designed (schema mapped, not yet built)
- **Action Items** — Apple Reminders-inspired task system with 4 junction tables, Houston AI source separation
- **Comps** — Lease comps (28 fields) + Sale comps (15 fields) as separate tables, one UI page with toggle
- **Transaction Probability Engine (TPE)** — 5-category property scoring (100pts), 3 supporting tables, SQL VIEW
- **Deals consolidation** — 3 Airtable deal tables merging into one with commission split VIEWs
- **All tab column mappings complete** — Properties (~25 new), Contacts (~18 new), Companies (3 new), Deals (5 new + type changes), Campaigns (2 new), Interactions (2 new + expanded types)
- Full schema blueprint in HANDOFF.md

### Not Yet Started
- Smart Filters & Saved Lists
- Report Generation (BOV reports, comp sheets, call lists)
- Maps & GIS
- Role-Based Access
- iOS companion app

---

## Nav Order (current + planned)

1. Properties (+ TPE scores as columns)
2. Contacts
3. Companies
4. Deals
5. Activity
6. Comps (Lease | Sale toggle)
7. Action Items (Apple Reminders UI)
8. Campaigns
9. Settings

---

## Infrastructure To-Do
*Do these before heavy feature building*

- [x] Migrate database from Railway PostgreSQL to Neon PostgreSQL (March 2026)
- [x] Update DATABASE_URL in Railway environment variables to point to Neon
- [x] Use Neon pooled connection string in DATABASE_URL (not direct connection)
- [x] Add ANTHROPIC_API_KEY to Railway environment variables
- [x] Commit ROADMAP.md and ARCHITECTURE.md to GitHub repo root
- [ ] Commit column menu fix (8 files changed, tested, ready)
- [ ] Add indexes to all columns that are filtered, searched, or sorted on
- [ ] Set up Neon branching workflow for future schema changes
- [ ] Confirm Vercel frontend works end-to-end after Railway redeploy

---

## Phase 1 — Complete the Core CRM
*Goal: Full Airtable parity + Action Items + Comps + TPE before loading real data*

### 1A — Batch Schema Migration
*All column mappings completed in HANDOFF.md — execute in one clean SQL script*

- [ ] **Batch ALTER TABLE** — add all new columns to existing tables (Properties ~25, Contacts ~18, Companies 3, Deals 5+type changes, Campaigns 2, Interactions 2)
- [ ] **Create new tables** — action_items, lease_comps, sale_comps, loan_maturities, property_distress, tenant_growth
- [ ] **Create junction tables** — action_item_contacts, action_item_properties, action_item_deals, action_item_companies
- [ ] **Column type changes** — properties.contacted BOOLEAN>TEXT[], deals.deal_source TEXT>TEXT[], deals.repping TEXT>TEXT[], deals.term TEXT>INT, deals.deal_dead_reason TEXT>TEXT[], contacts.email_hot TEXT>BOOLEAN, contacts.phone_hot TEXT>BOOLEAN
- [ ] **Add indexes** on all filtered/searched columns
- [ ] **Update ALL_COLUMNS arrays** in every page component
- [ ] **Update API routes** — SELECT/INSERT/UPDATE queries include new columns

### 1B — Deals Consolidation
*3 Airtable deal tables (Dads Deals, Jr Deal Tracker, Sarah Deals) > 1 deals table*

- [ ] Add run_by, other_broker, industry, deadline, fell_through_reason columns
- [ ] Build commission split VIEW — Jr net = team_gross / 3 x 0.75, Sarah net = gross x 0.50, Dave TBD
- [ ] Build deal formula VIEW — Team Gross (lease vs sale), Price, Individual Gross/Net
- [ ] Expand Deals status options: Active, Lead, Prospect, Long Leads, Closed, Deal fell through, Dead Lead
- [ ] Expand deal_source to 22-option TEXT[] multiselect
- [ ] Expand deal_dead_reason to 14-option TEXT[] multiselect

### 1C — Action Items (new tab)
*Apple Reminders-inspired UI — replaces Airtable "Action Items" table (121 records)*

- [ ] `action_items` table: name, notes, notes_on_date, responsibility (TEXT[]), high_priority, status (7 options), due_date, date_completed, source, created_at, updated_at
- [ ] 4 junction tables: action_item_contacts, action_item_properties, action_item_deals, action_item_companies
- [ ] `source` field separates manual vs Houston-generated items
- [ ] Team members: Dave Mudge, Missy, David Mudge Jr, Houston
- [ ] Status options: Todo (red), Reminders (blue), In progress (yellow), Done (green), Dead (green-alt), Email (cyan), Needs and Wants (purple)
- [ ] Filtered views: Today's Items, All, Per-person (Dave, Missy, David Jr, Houston)
- [ ] Calendar view using due_date
- [ ] Action items surface inside linked record detail panels (Properties, Contacts, Deals, Companies)

### 1D — Comps (new tab)
*Two tables, one page with Lease | Sale toggle*

- [ ] `lease_comps` table — 28 columns mapped from Company DB + CoStar CSV exports
- [ ] `sale_comps` table — 15 columns
- [ ] Direct FKs: lease_comps.property_id, lease_comps.company_id, sale_comps.property_id
- [ ] CSV import pipeline — upload CSV, auto-match properties by address, auto-match tenant companies by name, parse concessions text
- [ ] Manual entry form
- [ ] Lease expiration auto-sync: new lease comp updates companies.lease_exp
- [ ] Comp history visible inside Property detail panel
- [ ] Sale comp auto-updates property last_sale_date/last_sale_price when more recent

### 1E — Transaction Probability Engine (TPE)
*AI-powered property scoring — the competitive edge*

- [ ] `loan_maturities` table — lender, loan_amount, maturity_date, LTV, purpose, duration, rate
- [ ] `property_distress` table — distress_type (NOD/Auction/REO), filing_date, amount, trustee
- [ ] `tenant_growth` table — headcount/revenue current vs previous, growth_rate, data_date
- [ ] Properties additions: owner_user_or_investor, out_of_area_owner, office_courtesy
- [ ] SQL VIEW `property_tpe_scores` — live scoring: Lease (30pts), Ownership (25pts), Age (20pts), Growth (15pts), Stress (10pts)
- [ ] Blended Priority formula: 70% transaction probability + 30% commission potential
- [ ] Likely Transaction Type: SALE / LEASE / BLENDED based on score composition
- [ ] Office Courtesy flag for Lee & Associates properties
- [ ] TPE score columns visible in Properties table (sortable/filterable)
- [ ] Score Breakdown Card in Property detail view
- [ ] CSV import for loan maturity, distressed property, and tenant growth data

### 1F — Interaction Type Expansion
- [ ] Expand interaction types from 7 to 17 in NewInteractionModal + detail view
- [ ] Types: Phone Call, Cold Call, Voicemail, Outbound Email, Inbound Email, Cold Email, Check in Email, Email Campaign, Text, Meeting, Tour, Door Knock, Drive By, Snail Mail, Offer Sent, Survey Sent, BOV Sent

### 1G — Migrate Airtable Data
*Last step of Phase 1 — load real data into completed schema*

- [ ] Batch import from all Airtable tables (Properties, Contacts, Companies, Jr Deal Tracker, Campaigns, Action Items, Interactions)
- [ ] Merge Dads Deals + Sarah Deals + Jr Deal Tracker into single deals table with run_by attribution
- [ ] Merge S Interactions into main interactions table with team_member = 'Missy'
- [ ] Import TPE data from Excel: loan maturities, distressed properties, tenant growth, ownership data
- [ ] Verify cross-links, deduplication, and data integrity
- [ ] Retire Airtable as source of truth

---

## Phase 2 — Smart Filters & Data Import
*Goal: Power-user list building and ongoing data refresh*

### 2A — Smart Filters & Lists
- [ ] Filter pills in list view header
- [ ] Slide-in filter builder panel
- [ ] Saved filter sets ("Smart Lists") in left sidebar
- [ ] Auto-updating lists based on filter logic
- [ ] Works across all tabs including Comps and Action Items

### 2B — CSV Import Pipeline (general)
- [ ] CSV import for Properties (CoStar, Landvision)
- [ ] CSV import for Contacts and Companies
- [ ] Address normalization and fuzzy matching for deduplication
- [ ] Intelligent field mapping UI
- [ ] Conflict detection — flag potential duplicate records
- [ ] Import preview before committing
- [ ] Source tracking on every imported record
- [ ] Comp-specific CSV import (Company DB lease comps, CoStar sale comps)
- [ ] TPE data CSV import (Title Rep loan maturity, distressed, debt & stress)

---

## Phase 3 — Report Generation
*Goal: 1-click client-ready outputs powered by comps and TPE data*

- [ ] BOV reports — pull lease comps by geography/size/type/date
- [ ] Property fact sheets / brochures (PDF) — branded HTML/CSS templates
- [ ] Comp sheets (side-by-side comparisons)
- [ ] Call lists / canvassing sheets (PDF) — sorted by TPE score
- [ ] Deal summaries and commission projections (PDF) — powered by deal formula VIEWs
- [ ] Lease vs. Buy proforma (Excel)
- [ ] Select records > generate report flow
- [ ] All templates Mudge Team CRE branded

---

## Phase 4 — Role-Based Access
*Goal: Safe multi-user access for David, Missy (Sarah), and Dave*

- [ ] Users table with login/auth
- [ ] Roles: Admin, Broker, Read-Only
- [ ] Audit logging
- [ ] Export controls by role
- [ ] Per-user action item filtering (already designed with responsibility field)

---

## Phase 5 — Houston AI Teammate
*Goal: AI that runs the CRM, scores properties, and catches what falls through the cracks*

### 5A — TPE Auto-Generation
- [ ] Houston scans TPE score changes overnight
- [ ] Auto-creates action items (source = 'houston_tpe') when properties jump in score
- [ ] Auto-creates lease expiration alerts (source = 'houston_lease') for upcoming tenant expirations
- [ ] Action Items page shows "Houston's Suggestions" section — separate from manual tasks, dismissible

### 5B — AI Panel & Chat
- [ ] Claude AI panel fully operational (natural language query + write)
- [ ] Auto-execute with short cancel window
- [ ] Proactive alerts: lease expirations, overdue follow-ups, inactive contacts on active deals
- [ ] In-app group chat: David Jr, Missy, Dave + Houston as 4th teammate
- [ ] Houston listens passively, flags time-sensitive items
- [ ] Houston auto-creates action items from chat ("we need to follow up by Friday")
- [ ] Morning daily briefing in group chat
- [ ] Houston speaks only when something would fall through the cracks

### 5C — IAR Hot Sheet Automation
- [ ] Daily PDF from email > parse > create new lease comp records
- [ ] Auto-update property availability fields
- [ ] Flag new tenant move-ins and expirations

### 5D — Email Automation
- [ ] Webhook-based email capture — auto-log inbound/outbound emails as Interactions
- [ ] Match to Contact by email address
- [ ] Full email history per contact

---

## Phase 6 — Maps & GIS

- [ ] Google Maps with color-coded property markers (color by TPE score)
- [ ] Parcel boundary overlays (San Bernardino & Riverside County GIS)
- [ ] Zoning PDF ghost layers
- [ ] Zoning intelligence DB (zone codes > permitted/conditional/prohibited uses)
- [ ] Natural language zoning queries
- [ ] Map view accessible from Properties tab
- [ ] Comp heatmap overlay (lease rates by area)

---

## Phase 7 — iOS Companion App

- [ ] iOS app — Houston + team chat interface only
- [ ] Push notifications for proactive alerts and Houston suggestions
- [ ] Quick note capture > syncs to CRM
- [ ] TPE score alerts on the go

---

## File Storage (add whenever ready)
- Use **Cloudflare R2** (S3-compatible, no egress fees)
- DB stores URL string only — add photo_url / document_url columns when needed
- Does not affect current schema
- Property images: `~/ie-crm-files/properties/{id}/`
- Deal documents: `~/ie-crm-files/deals/{id}/`
- Campaign files: `~/ie-crm-files/campaigns/{id}/`

---

## Guiding Principles

1. Schema decisions before data — never load 50K records into a table you're not confident in
2. Neon branching for every schema change — test on a branch, never directly on production
3. Pagination on every list endpoint — max 50 records, always
4. Index every filtered/searched column — ask Claude Code on every new table
5. Audit fields on every table — created_at, updated_at, created_by, updated_by
6. One complete vertical slice before moving to the next feature
7. Push to GitHub = deploys everywhere (Railway backend + Vercel frontend auto-deploy)
8. ARCHITECTURE.md is the source of truth — update it with every new tech decision
9. HANDOFF.md is the schema blueprint — every column mapping lives there
10. SQL VIEWs for computed data — never store what you can calculate live
