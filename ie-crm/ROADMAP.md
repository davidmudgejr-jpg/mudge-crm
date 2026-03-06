# IE CRM — Build Roadmap
**Inland Empire Commercial Real Estate CRM**  
Mudge Team CRE — Built by David Mudge Jr  
Last updated: March 2026

---

## Current State (as of March 2026)

### ✅ Already Built
- 6 core tabs: Properties, Contacts, Companies, Deals, Activity, Campaigns
- Consistent list view with toggleable columns across all tabs
- Slide-out detail panel on every record
- Quick Note on every record (saves to interactions table)
- Activity/Interactions log — polymorphic, surfaces on all related records
- Cross-linking working: Properties ↔ Contacts ↔ Companies ↔ Deals ↔ Campaigns
- New record modals with consistent pattern across all tabs
- Claude AI panel stubbed in on Properties (needs ANTHROPIC_API_KEY set)
- Airtable sync built in Settings (switching to CSV import instead)
- Settings tab with connection status, record counts, environment variable visibility
- GitHub → Railway (backend) + Vercel (frontend) auto-deploy pipeline working
- Multi-machine workflow: push to GitHub, changes live everywhere

### 🔧 In Progress / Partially Built
- Deals tab — structure exists, needs full field buildout
- Claude AI panel — wired to DB, needs API key and full query/write logic

### ❌ Not Yet Started
- Tasks tab (7th tab, before Campaigns)
- Lease Comps tab
- Smart Filters & Saved Lists
- CSV Import Pipeline
- Report Generation
- Maps & GIS
- Houston AI Teammate
- Role-Based Access
- iOS companion app

---

## Nav Order (current + planned)

1. Properties
2. Contacts
3. Companies
4. Deals
5. Activity
6. *(Lease Comps — position TBD)*
7. Tasks ← new, before Campaigns
8. Campaigns
9. Settings

---

## Infrastructure To-Do
*Do these before heavy feature building*

- [x] Migrate database from Railway PostgreSQL to Neon PostgreSQL (March 2026)
- [x] Update DATABASE_URL in Railway environment variables to point to Neon
- [x] Use Neon pooled connection string in DATABASE_URL (not direct connection)
- [x] Add ANTHROPIC_API_KEY to Railway environment variables
- [ ] Add indexes to all columns that are filtered, searched, or sorted on
- [ ] Add latitude, longitude, parcel_number to Properties table (for future GIS)
- [ ] Add source, source_id, canonical_id to Properties and Contacts (for CSV deduplication)
- [ ] Add created_by, updated_by audit fields to any tables missing them
- [x] Commit ROADMAP.md and ARCHITECTURE.md to GitHub repo root
- [ ] Set up Neon branching workflow for future schema changes
- [ ] Confirm Vercel frontend works end-to-end after Railway redeploy

---

## Phase 1 — Complete the Core CRM
*Goal: Full Airtable parity + Tasks + Comps before loading real data*

### 1A — Finish Existing Tabs
- [ ] **Deals** — full field buildout: repping side (Landlord/Tenant/Buyer/Seller), commission structure, LOI expiration, projected close, next follow-up, dead reason
- [ ] **Properties** — field-by-field comparison against Airtable, add any missing fields
- [ ] **Contacts** — field-by-field comparison against Airtable, add any missing fields
- [ ] **Companies** — field-by-field comparison against Airtable, add any missing fields

### 1B — Notes System (enhance existing)
- [ ] Auto-date stamping when a note is started
- [ ] Append-only follow-up notes with timestamp dividers (no overwriting)
- [ ] Notes visible across all linked records (Contact note surfaces on their Deal)
- [ ] Confirm all activity types work: Note, Call, Tour, Email, Other

### 1C — Tasks Tab (7th tab — before Campaigns)
- [ ] New `tasks` table with fields: title, description, due date, priority (High/Medium/Low), completed, completed date, assigned to, created by, created at
- [ ] Polymorphic link: record_type + record_id (connects to any Deal/Contact/Property/Company)
- [ ] Tasks tab in nav at position 7
- [ ] Shared team task pool — visible to all team members
- [ ] Filter by assignee (David / Sarah / Dad)
- [ ] Tasks surface inside linked record detail panels
- [ ] Critical dates on Deals auto-create tasks (LOI expiration, projected close, next follow-up)

### 1D — Lease Comps Tab
- [ ] New `lease_comps` table: linked property (FK), tenant name, SF, rate, lease type (NNN/Gross/Modified Gross), term months, commencement date, expiration date, free rent months, TI allowance, source, verified, notes
- [ ] Lease Comps tab in nav (position TBD)
- [ ] One property → many lease comps (full history per building)
- [ ] Comp history visible inside Property detail panel
- [ ] Sale history fields on Properties: last_sale_date, last_sale_price, last_sale_price_per_sf

---

## Phase 2 — Smart Filters & Data Import
*Goal: Power-user list building and real data in the system*

### 2A — Smart Filters & Lists
- [ ] Filter pills in list view header
- [ ] Slide-in filter builder panel
- [ ] Saved filter sets ("Smart Lists") in left sidebar
- [ ] Auto-updating lists based on filter logic
- [ ] Works across all tabs

### 2B — CSV Import Pipeline
- [ ] CSV import for Properties (CoStar, Landvision, internal lease expiration DB, loan maturity reports)
- [ ] CSV import for Contacts and Companies
- [ ] Address normalization
- [ ] Fuzzy matching for deduplication
- [ ] Intelligent field mapping UI
- [ ] Conflict detection — flag potential duplicate records
- [ ] Import preview before committing
- [ ] Source tracking on every imported record

### 2C — Load Real Data
- [ ] Export all Airtable tables to CSV
- [ ] Import Properties (~50K records), Contacts, Companies
- [ ] Verify cross-links and deduplication
- [ ] Set ANTHROPIC_API_KEY, test Claude AI panel at scale
- [ ] Confirm all list views are paginated (no endpoint returning all 50K at once)

---

## Phase 3 — Report Generation
*Goal: 1-click client-ready outputs*

- [ ] Property fact sheets / brochures (PDF) — branded HTML/CSS templates
- [ ] Comp sheets (side-by-side comparisons)
- [ ] Call lists / canvassing sheets (PDF)
- [ ] Deal summaries and commission projections (PDF)
- [ ] Lease vs. Buy proforma (Excel)
- [ ] Select records → generate report flow
- [ ] All templates Mudge Team CRE branded

---

## Phase 4 — Role-Based Access
*Goal: Safe multi-user access for David, Sarah, and Dad*

- [ ] Users table with login/auth
- [ ] Roles: Admin, Broker, Read-Only
- [ ] Audit logging
- [ ] Export controls by role
- [ ] Per-user task filtering

---

## Phase 5 — Houston AI Teammate
*Goal: AI that runs the CRM and catches what falls through the cracks*

- [ ] Claude AI panel fully operational (natural language query + write)
- [ ] Auto-execute with short cancel window
- [ ] Proactive alerts: lease expirations, overdue follow-ups, inactive contacts on active deals
- [ ] In-app group chat: David, Sarah, Dad + Houston as 4th teammate
- [ ] Houston listens passively, flags time-sensitive items
- [ ] Houston auto-creates tasks from chat ("we need to follow up by Friday")
- [ ] Morning daily briefing in group chat
- [ ] Houston speaks only when something would fall through the cracks

---

## Phase 6 — Maps & GIS

- [ ] Google Maps with color-coded property markers
- [ ] Parcel boundary overlays (San Bernardino & Riverside County GIS)
- [ ] Zoning PDF ghost layers
- [ ] Zoning intelligence DB (zone codes → permitted/conditional/prohibited uses)
- [ ] Natural language zoning queries
- [ ] Map view accessible from Properties tab

---

## Phase 7 — iOS Companion App

- [ ] iOS app — Houston + team chat interface only
- [ ] Push notifications for proactive alerts
- [ ] Quick note capture → syncs to CRM

---

## File Storage (add whenever ready)
- Use **Cloudflare R2** (S3-compatible, no egress fees)
- DB stores URL string only — add photo_url / document_url columns when needed
- Does not affect current schema

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
