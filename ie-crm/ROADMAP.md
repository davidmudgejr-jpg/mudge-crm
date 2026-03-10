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
9. Import (auto-detects target table from CSV headers)
10. Settings

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
*AI-powered property scoring — the competitive edge. Full spec (5 models, all weights) in HANDOFF.md.*

**Tables:**
- [ ] `loan_maturities` — confirmed RCA data: lender, amount, maturity_date, LTV, purpose, duration, rate, months_past_due
- [ ] `property_distress` — NOD/Auction/REO: distress_type, filing_date, amount, auction_date, opening_bid, delinquent tax
- [ ] `tenant_growth` — CoStar/Vibe: headcount current/previous, growth_rate, growth_prospect_score
- [ ] `debt_stress` — estimated balloon data: 3 balloon scenarios (5yr/7yr/10yr), confidence level (HIGH/MEDIUM/LOW)
- [ ] `tpe_config` — all scoring weights, thresholds, market assumptions (editable, not hardcoded)
- [ ] Properties additions: owner_age_est, owner_entity_type, hold_duration_years, has_lien_or_delinquency, owner_user_or_investor, out_of_area_owner

**SQL VIEW `property_tpe_scores`:**
- [ ] Model 1: Transaction Probability (100pts) — Lease (30) + Ownership (25) + Owner Age (20) + Growth (15) + Stress (10)
- [ ] Model 2: Expected Commission Value — tiered lease rates by SF, sale commission, time multiplier
- [ ] Model 3: Blended Priority — 70% TPE + 30% ECV, normalized commission scale ($250K=100)
- [ ] Model 4: Confirmed Loan Maturity boost — timing tiers (25/20/15/10) + LTV/duration/purpose bonuses (max 35pts)
- [ ] Model 5: Distress scoring — expanded tiers (Auction 25, NOD 20, maturity timing 10-22)
- [ ] Office Courtesy — computed from lease_comps rep data (owner_courtesy + tenant_courtesy), NOT stored
- [ ] All point values read from `tpe_config` table, not hardcoded in VIEW

**UI:**
- [ ] TPE score columns visible in Properties table (Total Score, Blended Priority, Tier, Likely Transaction)
- [ ] Score Breakdown Card in Property detail view — 5 category bar chart + Blended Priority + Est. Commission
- [ ] Action Intelligence — computed `call_target`, `call_reasons` (TEXT[]), courtesy warnings
- [ ] "Who To Call & Why" section with plain-English reasons auto-generated from live data
- [ ] TPE tier labels (🔴🟠🟡🟢) with coaching notes
- [ ] TPE Settings page (under Settings) — editable table of all weights from `tpe_config`

### 1F — Interaction Type Expansion
- [ ] Expand interaction types from 7 to 17 in NewInteractionModal + detail view
- [ ] Types: Phone Call, Cold Call, Voicemail, Outbound Email, Inbound Email, Cold Email, Check in Email, Email Campaign, Text, Meeting, Tour, Door Knock, Drive By, Snail Mail, Offer Sent, Survey Sent, BOV Sent

### 1G — CSV Import Engine
*One smart Import page for the entire CRM. Auto-detects target table from CSV headers, composite matching with city/zip/name for accuracy. Handles 10K+ row imports. Full spec in HANDOFF.md.*

- [ ] Address normalizer utility — standardize Street>St, Avenue>Ave, strip city/state/zip, lowercase, etc.
- [ ] `normalized_address` column on properties table (auto-computed trigger)
- [ ] Composite matcher — tiered confidence scoring using address + city + zip (not just address alone)
- [ ] Company matcher — normalized name + city, handles Inc/LLC/Corp variants
- [ ] Contact matcher — email first, then name + company fallback
- [ ] Batch INSERT endpoint (`POST /api/import/batch`) — single SQL transaction for 10K+ rows
- [ ] Auto-detection — scan CSV headers against signature fields per table, pre-select best match
- [ ] Import target configs for all 10 tables with signature header lists
- [ ] Dedicated Import page (sidebar tab between Campaigns and Settings)
- [ ] Import flow: upload → auto-detect → column mapping → preview with match results → review flagged → execute
- [ ] Flagged row review UI — yellow warnings with candidate matches showing city/zip for disambiguation
- [ ] Refactor existing Comps CSV import to use the new engine
- [ ] Dedup detection with `ON CONFLICT` handling (skip, update, or flag)
- [ ] Source tracking on every imported record

### 1H — SQL VIEWs & Formula Computation
- [ ] SQL VIEW `property_tpe_scores` — live TPE scoring across all properties
- [ ] SQL VIEW or computed SELECT for Deals formulas (Team Gross, Individual Gross/Net, Price)
- [ ] Commission split logic — Jr, Sarah, Dave different splits via CASE or config table

### 1I — Data Migration
*Initial bulk load via Claude Code scripts, then ongoing imports via CRM CSV tool*

- [ ] Claude Code script: export Airtable tables to CSV, run through import engine
- [ ] Claude Code script: import TPE Excel data (loan maturities, distressed, tenant growth, ownership)
- [ ] Merge Dads Deals + Sarah Deals + Jr Deal Tracker into single deals table with run_by attribution
- [ ] Merge S Interactions into main interactions table with team_member = 'Missy'
- [ ] Verify cross-links, deduplication, and data integrity
- [ ] Retire Airtable as source of truth

### 1J — AI Operations Module (Sandbox + Agent Dashboard)
*Infrastructure for the AI Master System — lets local AI agents on Mac Mini write to IE CRM safely*
*Full architecture and agent specs: `ai-system/ARCHITECTURE.md` and `ai-system/ROADMAP.md`*

**Sandbox Tables (migration 007):**
- [ ] `sandbox_contacts` — researched contacts pending review
- [ ] `sandbox_enrichments` — enrichment data for existing contacts
- [ ] `sandbox_signals` — market intelligence hits
- [ ] `sandbox_outreach` — draft outreach emails
- [ ] `agent_heartbeats` — agent status/health reporting
- [ ] `agent_logs` — structured log entries from all agents
- [ ] All sandbox tables: agent_name, confidence_score, status (pending/approved/rejected/promoted), reviewed_by, reviewed_at

**AI API Endpoints (scoped, key-authenticated):**
- [ ] Read-only endpoints for local agents: contacts, properties, companies, comps search
- [ ] Sandbox write endpoints: submit contacts, enrichments, signals, outreach
- [ ] Operations endpoints: heartbeat, log, approval queue (pending/approve/reject)
- [ ] API key auth with per-agent scoping and rate limiting

**Agent Dashboard (new IE CRM page — "AI Ops"):**
- [ ] Agent Status Cards — per-agent health, current task, throughput
- [ ] Approval Queue — review and approve/reject sandbox items
- [ ] Log Viewer — filterable agent activity stream
- [ ] System Health — Mac Mini connection status, error rates
- [ ] Nav placement: between Campaigns and Import

**Sandbox-to-Production Promotion:**
- [ ] Approved contacts → INSERT into contacts table
- [ ] Approved enrichments → UPDATE existing contact rows
- [ ] Approved signals → create interaction/action item records
- [ ] All promotions logged in undo_log

---

## Phase 2 — Smart Filters
*Goal: Power-user list building*

### 2A — Smart Filters & Lists
- [ ] Filter pills in list view header
- [ ] Slide-in filter builder panel
- [ ] Saved filter sets ("Smart Lists") in left sidebar
- [ ] Auto-updating lists based on filter logic
- [ ] Works across all tabs including Comps and Action Items

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

## Phase 5 — Houston AI Teammate + AI Master System Integration
*Goal: AI that runs the CRM, scores properties, catches what falls through the cracks — AND connects to the external AI fleet*
*The AI Master System (local models on Mac Mini/Studio) feeds data through the Sandbox tables built in Phase 1J. Houston is the in-app interface; the AI fleet is the 24/7 backend workforce.*

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
