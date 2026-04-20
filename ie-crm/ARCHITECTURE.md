# IE CRM — Architecture & Technical Decisions
**Inland Empire Commercial Real Estate CRM**
Mudge Team CRE — Built by David Mudge Jr
Last updated: March 2026

---

## What This App Is

A web-based CRM built specifically for industrial commercial real estate brokerage in the Inland Empire (Riverside/Corona/Ontario). Purpose-built for industrial property tracking, owner outreach, deal management, lease comp analysis, AI-powered property scoring (TPE), and team coordination. Not a generic CRM.

---

## Tech Stack

| Layer | Technology | Location | Notes |
|---|---|---|---|
| Frontend | React | Vercel | Auto-deploys on GitHub push |
| Backend | Node.js / Express | Railway | Auto-deploys on GitHub push |
| Database | PostgreSQL 17 | Neon | Pooled connection via pgBouncer |
| Source control | GitHub | GitHub | Push to main = deploy everywhere |
| AI | Claude API (Anthropic) | Backend | Needs ANTHROPIC_API_KEY set in Railway env |
| Dev tool | Claude Code | Local (terminal) | Run on any machine after git pull |

---

## Deployment Pipeline

```
Local machine (Claude Code)
        | git push
      GitHub
     /        \
Railway        Vercel
(backend)    (frontend)
     \        /
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

*Full column-by-column mapping with types lives in HANDOFF.md. This section covers structure and relationships.*

### properties
30+ columns (expanding to ~55 after batch migration).

**Building Info:** id, address, property_name, city, county, zip, type, rba, land_sf, year_built, zoning, construction_material, parking_ratio, ceiling_ht, number_of_loading_docks, drive_ins, column_spacing, sprinklers, power, sewer, water, gas, heating, number_of_cranes, rail_lines

**Financial Info:** last_sale_price, last_sale_date, plsf, cap_rate, for_sale_price, avg_weighted_rent, building_tax, building_opex, ops_expense_psf

**Owner Info:** owner_name, owner_type, owner_contact, owner_user_or_investor, out_of_area_owner

**Status:** contacted (TEXT[] multiselect with 14 options), percent_leased, vacancy_pct, off_market_deal, tenancy, market_name, submarket_name

**Comps/GIS:** latitude, longitude, parcel_number

**TPE:** office_courtesy (Lee & Associates flag)

**Quality Metrics:** building_class (A/B/C — broker-reported, market-relative), costar_star_rating (1–5 — nationally standardized, data-driven; see `docs/COSTAR-STAR-RATINGS.md`)

**URLs:** costar_url, landvision_url, google_maps_url, zoning_map_url, listing_url

**Indexes needed:** address, city, zip, county, type, owner_name, contacted, zoning, parcel_number, year_built

---

### contacts
26 columns (expanding to ~40 after batch migration).

**Contact Info:** id, full_name, first_name, type, title, email, email_2, email_3, phone_1, phone_2, phone_3, phone_hot (BOOLEAN), email_hot (BOOLEAN), email_kickback (BOOLEAN), linkedin

**Address:** home_address, work_address, work_city, work_state, work_zip

**Status:** active_need, property_type_interest, follow_up, last_contacted, data_source, client_level, born, age

**Intel:** business_trajectory, last_call_outcome, follow_up_behavior, decision_authority, price_cost_awareness, frustration_signals, exit_trigger_events, tenant_space_fit, tenant_ownership_intent, lease_months_left

**URLs:** white_pages_url, been_verified_url, zoom_info_url

**Indexes needed:** full_name, email, phone_1, type, last_contacted, data_source, client_level

---

### companies
17 columns (expanding to 20).

**Company Info:** id, company_name, type, industry, website, hq_location, city, sf, employees, revenue, growth

**Lease Info:** lease_exp, months_left, move_in_date

**New:** tenant_sic, tenant_naics, suite

**Indexes needed:** company_name, type, industry, city, lease_exp

---

### deals
20 columns (expanding to 25+).

**Deal Info:** id, name, type (Sale/Lease), status, repping (TEXT[] — Landlord/Tenant/Buyer/Seller), sf, rate, increases, commission_rate, gross_fee_potential, net_potential, price

**Team:** run_by (TEXT[] — who's running the deal), other_broker

**Dates:** close_date, important_date (TIMESTAMP), deadline

**Status:** priority_deal (boolean), deal_source (TEXT[] — 22 options), deal_dead_reason (TEXT[] — 14 options), fell_through_reason, industry

**URLs:** escrow_url, surveys_brochures_url

**Status Options:** Active, Lead, Prospect, Long Leads, Closed, Deal fell through, Dead Lead

**Formulas (SQL VIEW — computed live, not stored):**
- Team Gross (Lease): SF x rate x commission_rate x total_lease_value with annual escalations
- Team Gross (Sale/Buy): price x commission_rate
- Individual Member Net: varies by person — Jr = team_gross/3 x 0.75, Sarah = gross x 0.50, Dave TBD

**Indexes needed:** status, type, repping, close_date, priority_deal, run_by

---

### interactions
The backbone of the notes/activity system. Powers the Activity tab (global feed), Quick Note on every record, and the Activity section inside every detail panel.

**Core fields:** id, type (17 options — see below), subject, date, notes, email_heading, email_body, follow_up, follow_up_notes, lead_source, team_member, email_url, email_id, created_at

**Type Options (17):** Phone Call, Cold Call, Voicemail, Outbound Email, Inbound Email, Cold Email, Check in Email, Email Campaign, Text, Meeting, Tour, Door Knock, Drive By, Snail Mail, Offer Sent, Survey Sent, BOV Sent

**Junction tables:** interaction_contacts, interaction_properties, interaction_deals, interaction_companies

**Most important index in the app:** type, date, team_member

**Activity Column (table views):**
Interactions are surfaced directly in all 4 main table views (Properties, Contacts, Deals, Companies) via a batch-fetched `linked_interactions` column. Architecture:
- **Batch queries:** `batchGet[Entity]Interactions()` uses `ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY date DESC)` to fetch the 5 most recent interactions per entity in a single query, then groups by entity ID.
- **Deal aggregation:** `getDealAggregatedInteractions(dealId)` — UNION ALL across the deal's own interactions + interactions from all linked contacts, properties, and companies. Returns `source_type` and `source_name` for provenance display ("via John Smith").
- **Hook integration:** Registered as `linked_interactions` in `useLinkedRecords.js` ENTITY_FETCHERS config. Piggybacks on the existing parallel batch fetch — no additional round trips.
- **Cell rendering:** `ActivityCellPreview` shows 3 most recent with colored type icon, truncated text, and date. Click opens `ActivityModal` (full list + quick note input). `e.stopPropagation()` prevents row click.
- **Column definition:** Created via `useMemo` inside each page component (closes over `setActivityModal` state setter). Merged into `allColumnsWithActivity` before passing to `useColumnVisibility`.
- **Empty state click:** `ActivityCellPreview` renders `--` with `onClick` that opens ActivityModal (not detail panel).

**Inline Cell Editing (table views):**
All 4 main table views support click-to-edit cells (spreadsheet-style). Architecture:
- **InlineTableCellEditor** (`src/components/shared/InlineTableCellEditor.jsx`): Shared editor component. Routes to sub-editors based on `editType` (text, number, date, select, multi-select, tags, boolean, email, tel, url). Infers type from column `format` if `editType` not set.
- **Column metadata:** Each page's `ALL_COLUMNS` array annotates columns with `editable: false` (primary column, computed fields), `editType`, and `editOptions`. Linked record columns (`linked_*` prefix) are auto-excluded.
- **CrmTable integration:** `onCellSave` prop enables inline editing. Editable cells get `cursor-cell` + `e.stopPropagation()` on click. Shares `editingCell` state with custom field editors.
- **Optimistic saves:** `handleCellSave` in each page does optimistic `setRows` update, calls `update[Entity]()`, shows toast. On error, rolls back to old value.

---

### action_items (NEW — not yet created)
Task management with Apple Reminders-inspired UI. 10 columns + source field for Houston AI separation.

**Core fields:** id, name, notes, notes_on_date, responsibility (TEXT[] — Dave Mudge, Missy, David Mudge Jr, Houston), high_priority (BOOLEAN), status (7 options), due_date, date_completed, source (manual/houston_tpe/houston_lease/houston_general), created_at, updated_at

**Status Options (7):** Todo, Reminders, In progress, Done, Dead, Email, Needs and Wants

**Junction tables (4 — dedicated, NOT polymorphic):**
- `action_item_contacts` (action_item_id, contact_id)
- `action_item_properties` (action_item_id, property_id)
- `action_item_deals` (action_item_id, deal_id)
- `action_item_companies` (action_item_id, company_id)

**Why junction tables instead of polymorphic:** Action items link to multiple record types simultaneously (e.g., one task links to a property AND a contact AND a deal). Polymorphic (record_type + record_id) only supports one link per row. Junction tables allow many-to-many across all types.

**Indexes needed:** status, due_date, responsibility, source, high_priority

---

### campaigns
id, name, type (Email/Snail Mail/Calls), status (Not sent/Sent), sent_date, notes, assignee, day_time_hits, last_modified

**Junction tables:** campaign_contacts

**Indexes needed:** status, type, sent_date, assignee

---

### lease_comps (NEW — not yet created)
28 columns. One lease comp = one property + one tenant. Direct FKs, not junction tables.

**Core:** id, property_id (FK), company_id (FK), tenant_name, property_type, space_use, space_type, sf, building_rba, floor_suite

**Dates:** sign_date, commencement_date, move_in_date, expiration_date

**Financials:** term_months, rate ($/SF/month), escalations, rent_type (NNN/GRS/MGR), lease_type (New/Renewal/Sublease), concessions, free_rent_months, ti_psf

**Reps:** tenant_rep_company, tenant_rep_agents, landlord_rep_company, landlord_rep_agents

**Meta:** notes, source (Company DB/CoStar/IAR Hot Sheet/Manual), created_at, updated_at

**Indexes needed:** property_id, company_id, expiration_date, commencement_date, sf, source

---

### sale_comps (NEW — not yet created)
15 columns. Direct FK to properties.

**Core:** id, property_id (FK), sale_date, sale_price, price_psf, price_plsf, cap_rate, sf, land_sf, buyer_name, seller_name, property_type, notes, source, created_at, updated_at

**Indexes needed:** property_id, sale_date, sale_price, sf

---

### loan_maturities (NEW — not yet created, TPE data)
Feeds TPE Ownership/Stress scoring.

**Core:** id, property_id (FK), lender, loan_amount, maturity_date, ltv, loan_purpose, loan_duration_years, interest_rate, notes, source, created_at, updated_at

**Indexes needed:** property_id, maturity_date

---

### property_distress (NEW — not yet created, TPE data)
Feeds TPE Stress scoring.

**Core:** id, property_id (FK), distress_type (NOD/Auction/REO/Lis Pendens), filing_date, amount, trustee, notes, source, created_at, updated_at

**Indexes needed:** property_id, distress_type, filing_date

---

### tenant_growth (NEW — not yet created, TPE data)
Feeds TPE Growth scoring.

**Core:** id, company_id (FK), headcount_current, headcount_previous, growth_rate, revenue_current, revenue_previous, data_date, source (CoStar/Vibe/Manual), created_at, updated_at

**Indexes needed:** company_id, growth_rate, data_date

---

### Junction Tables (cross-linking between records)
These power the linked record badges (e.g. "CONTACTS 1", "PROPERTIES 1") in every detail panel.

**Existing:**
- `contact_properties` — contact_id, property_id
- `contact_companies` — contact_id, company_id
- `contact_campaigns` — contact_id, campaign_id (= campaign_contacts)
- `deal_properties` — deal_id, property_id
- `deal_contacts` — deal_id, contact_id
- `deal_companies` — deal_id, company_id
- `interaction_contacts` — interaction_id, contact_id
- `interaction_properties` — interaction_id, property_id
- `interaction_deals` — interaction_id, deal_id
- `interaction_companies` — interaction_id, company_id

**New (to be created):**
- `action_item_contacts` — action_item_id, contact_id
- `action_item_properties` — action_item_id, property_id
- `action_item_deals` — action_item_id, deal_id
- `action_item_companies` — action_item_id, company_id

---

## SQL VIEWs (computed data — never stored)

### property_tpe_scores
Live-computed Transaction Probability Engine scores for all properties.

**Scoring Model (100 points max):**
| Category | Max Points | Source | Logic |
|---|---|---|---|
| Lease Score | 30 | lease_comps nearest expiration | <=12mo=30, <=18mo=22, <=24mo=15, <=36mo=8 |
| Ownership Score | 25 | properties (owner age, type, location) | Age tiers + out-of-area/user bonuses |
| Age Score | 20 | properties.year_built (+ costar_star_rating modifier) | Same age tiers; star rating can adjust for renovations/condition — see docs/COSTAR-STAR-RATINGS.md |
| Growth Score | 15 | tenant_growth.growth_rate | >=30%=15, >=20%=10, >=10%=5 |
| Stress Score | 10 | property_distress + loan_maturities | NOD/Auction/REO flags |

**Blended Priority** = 0.7 x Total Score + 0.3 x Commission Potential
**Likely Transaction** = SALE / LEASE / BLENDED based on score composition

### deal_formulas
Live-computed deal financials: Team Gross, Individual Gross, Individual Net.
Commission splits vary by team member (Jr, Sarah, Dave).

---

## Environment Variables

| Variable | Where set | Status | Purpose |
|---|---|---|---|
| DATABASE_URL | Railway dashboard | Set | Neon PostgreSQL pooled connection string |
| ANTHROPIC_API_KEY | Railway dashboard | Set | Powers Claude AI panel / Houston |
| AIRTABLE_API_KEY | Railway dashboard | Set | Being deprecated — switching to CSV import |
| AIRTABLE_BASE_ID | Railway dashboard | Set | appQaZNM0Mt4Zul3q — being deprecated |

**Local .env file** mirrors Railway env vars for local development. Never committed to GitHub.

---

## AI Master System Integration

IE CRM serves as the center of truth for a tiered AI fleet that runs 24/7 on local hardware (Mac Mini / Mac Studio). Full architecture and agent specs live in `ai-system/`.

### The Tier Structure
| Tier | Agent | Role | IE CRM Access |
|------|-------|------|---------------|
| 1 | Claude (Opus via API) | Chief of Staff — reviews logs, refines agent instructions, strategic decisions | Read + Write (trusted) |
| 2 | ChatGPT + Gemini | Operations Managers — validate local model output every 10-15 min | Read + Sandbox Write |
| 3 | Local Models (Qwen 3.5, MiniMax 2.5) | 24/7 Workers — research, enrichment, matching, logging | Read-only + Sandbox Write |

### How Data Flows
```
Local agents (Mac Mini) do research/enrichment 24/7
        ↓
Write to Sandbox tables in Neon Postgres (NEVER to production tables)
        ↓
Tier 2 (ChatGPT/Gemini) validates every 10-15 min
        ↓
Approved data promoted to production tables (contacts, interactions, etc.)
        ↓
Claude reviews daily logs, rewrites agent instructions → system improves
```

### Sandbox Tables (in Neon Postgres)
- `sandbox_contacts` — researched contacts pending review
- `sandbox_enrichments` — enrichment data for existing contacts
- `sandbox_signals` — market intelligence hits
- `sandbox_outreach` — draft outreach emails
- `agent_heartbeats` — agent status/health
- `agent_logs` — structured agent activity logs

All sandbox rows carry: `agent_name`, `confidence_score`, `status` (pending → approved/rejected → promoted), `reviewed_by`, `reviewed_at`, `promoted_at`

### AI API Endpoints
Scoped routes under `/api/ai/` with API key auth (`X-Agent-Key` header). Each agent gets its own key with tier-appropriate permissions. See `ai-system/ROADMAP.md` Phase 0B for full endpoint list. Team-task + deal-activity endpoints for Hermes/Agent M/Agent 48 are documented in `docs/api/ai-tasks-activities.md`.

### Agent Dashboard
New IE CRM page ("AI Ops") showing agent status cards, approval queue, log viewer, and system health. Nav position: between Campaigns and Import.

### Key Decision: Sandbox DB Lives in Neon (Not Local)
The sandbox tables live in the same Neon Postgres instance as production IE CRM tables, just in separate tables. This means:
- No sync layer between local SQLite and Neon
- Approval workflow is a status change on a row, not a data migration
- Agent Dashboard reads from the same DB as the rest of IE CRM
- Claude (Tier 1) accesses sandbox data through the same API

What lives locally on the Mac Mini: agent.md instruction files, memory folders, daily .md log files. Data flows through IE CRM.

---

## Key Architectural Decisions

### Why Hardcoded Postgres Schema (not EAV)
Decision locked in. All columns are real Postgres columns with proper types, not key-value pairs. Reasons:
- Real data types with proper indexing
- Native SQL math for formulas (VIEWs)
- Custom rendering in React per column type
- Developer on call (Claude) means no need for runtime schema flexibility
- Keep current custom fields system for quick ad-hoc experiments only

### Why SQL VIEWs for Computed Data
Deal formulas, TPE scores, and commission splits are all computed live via SQL VIEWs rather than stored. Reasons:
- Never stale — always reflects current data
- 3,700 properties / 207 deals = milliseconds to compute
- One source of truth for scoring logic (the VIEW definition)
- Easy to adjust scoring tiers without re-computing stored values

### Why Junction Tables for Action Items (not polymorphic)
Action items use 4 dedicated junction tables instead of the polymorphic pattern used by interactions. Reason: an action item can link to a property AND a contact AND a deal simultaneously. Polymorphic (record_type + record_id) only allows one link per row. Junction tables allow many-to-many across all types.

### Why Activity Propagation for Deals (UNION ALL, not denormalization)
Deal activity aggregation pulls interactions from linked contacts, properties, and companies using a UNION ALL query at read time rather than copying/denormalizing interactions into the deal. Reasons:
- Always current — adding an interaction to a contact instantly appears in the deal's activity feed
- No sync jobs or triggers to maintain
- Provenance is clear — each row carries `source_type` and `source_name` so the UI shows "via John Smith" or "via 123 Main St"
- Performance is fine — deals rarely link to more than 5-10 entities, so the UNION is fast

### Why Web App (not Electron)
Originally built as Electron desktop app but migrated to React (Vercel) + Node.js (Railway). Web app is the right choice because:
- David works across 3 machines — web app is accessible from any browser
- GitHub > auto-deploy pipeline means changes are live everywhere immediately
- Sets up naturally for team access (Missy, Dave) and future iOS app
- No per-machine installation or sync headaches

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
- TEXT[] arrays: used for multiselect fields (`responsibility`, `deal_source`, `repping`)
- Direct FKs: used for one-to-many (comps to properties). Junction tables: used for many-to-many.

---

## Team Members

| Name | Email | Role | Notes |
|---|---|---|---|
| David Mudge Jr | dmudgejr@leeriverside.com | Primary user, builder | |
| Dave Mudge | dmudge@leeriverside.com | Team lead (Dad) | |
| Missy | sarahmudgie@gmail.com | Team member (Sarah Mudge, nickname = Missy) | |
| Houston | — | AI teammate (Claude) | Auto-generates action items from TPE |

---

## Two Rules Claude Code Must Always Follow

**Pagination:** Every list endpoint returns max 50 records using LIMIT/OFFSET. Never fetch all records.

**Indexes:** Every column used in WHERE, ORDER BY, or JOIN needs an index. When adding a new table, add indexes to all columns we'll filter or search on.

---

## Key Reference Documents

| Document | Purpose |
|---|---|
| HANDOFF.md | Full column-by-column schema mapping with types, every field mapped from Airtable |
| ROADMAP.md | Build phases and feature checklist |
| ARCHITECTURE.md | This file — tech stack, schema structure, architectural decisions |
| CLAUDE.md | Claude Code session instructions and conventions |
| ai-system/ARCHITECTURE.md | AI Master System — tiered agent fleet architecture, agent roster, workflows |
| ai-system/ROADMAP.md | AI Master System — phased build plan from infrastructure to full fleet |
| ai-system/BRAINSTORM.md | AI Master System — original brainstorm session with all ideas and context |
| ai-system/agent-templates/ | Draft instruction files for each local agent (enricher, researcher, matcher, logger) |
