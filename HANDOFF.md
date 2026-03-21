# Session Handoff — IE CRM Build Status

> Updated: 2026-03-21 (Phase 5D: Git cleanup + Chat UX overhaul + Houston image analysis + OAuth migration)
> Previous sessions: (1) AI fleet architecture — 3-machine OpenClaw fleet, MVA scoring as TPE Model 6, Reonomy-anchored data pipeline, 14 agents, continuous 24/7 processing. (2) Team Chat — Socket.io + Houston AI brain with Claude Sonnet, RAG memory system (preferences, key facts, relationships), infinite scroll message history, CRM context queries with per-section error isolation. Migration 020_team_chat.sql applied. (3) Git cleanup — merged all feature branches into main (34 commits, 164 files). Chat UX overhaul — draggable, resizable, non-blocking chat. Houston image analysis via Claude Vision API. All Claude calls switched to OAuth (Claude Max subscription).
> Next tasks: **"+ New View" save flow** (plan exists in .claude/plans/), **Email strategies session**, **Auth/RBAC (Phase 4)**, **Test Houston image analysis end-to-end**.

---

## What We're Doing

Building the IE CRM through Phase 1 of the ROADMAP.md — completing Airtable parity with proper Postgres schema, then adding Action Items, Comps, TPE, and data migration. The column mapping and schema blueprint below is the reference spec. Most of Phase 1A is now complete.

### Architecture Decision (locked in)

**Hardcoded Postgres schema** — NOT Airtable-style EAV. Reasons:
- Real data types with proper indexing
- Native SQL math for formulas
- Custom rendering in React
- Developer on call (Claude) means no need for runtime schema flexibility
- Keep current custom fields system for quick ad-hoc experiments only
- Option C (EAV migration) parked as future consideration for CSV import feature

---

## Completed Work (all committed & pushed to GitHub)

### Infrastructure ✅
- [x] Column menu fix — Rename/Hide/Delete with system field protection (commit `f0e4f7d`)
- [x] Neon DB migration from Railway PostgreSQL
- [x] ANTHROPIC_API_KEY on Railway
- [x] ROADMAP.md + ARCHITECTURE.md committed
- [x] Multi-machine workflow: laptop, home machine, work machine all on same GitHub + Neon DB

### Phase 1A — Batch Schema Migration ✅ (mostly complete)
- [x] Migration 001: All column type changes (contacted→TEXT[], deal_source→TEXT[], etc.) — commit `e34ce30`
- [x] Migration 001: ~58 new columns across all tables (Properties 28, Contacts 15, Companies 3, Deals 8, Campaigns 2, Interactions 2)
- [x] Migration 001: 6 new tables (action_items, lease_comps, sale_comps, loan_maturities, property_distress, tenant_growth)
- [x] Migration 001: 4 new junction tables (action_item_contacts/properties/deals/companies)
- [x] Migration 002: normalized_address column + auto-compute trigger on properties
- [x] Migration 003: cam_expenses, zoning, doors_with_lease on lease_comps
- [x] ALL_COLUMNS arrays updated in Properties.jsx (76 columns), other pages updated
- [x] API routes updated — SELECT/INSERT/UPDATE include new columns
- [x] Interaction types expanded from 7 to 17

### Phase 1A — Remaining Gaps ⬜
- [x] **Role-specific linked columns on Properties** — 5 role-filtered columns in table view (Owner Contact, Broker Contact, Company Tenants, Company Owner, Leasing Company) + `augmentedRows` filtering (commit `87c88cd`)
- [x] **Add `role` to batch queries** — `batchGetPropertyContacts` and `batchGetPropertyCompanies` now SELECT `pc.role` (commit `87c88cd`)
- [x] **Role-specific sections in PropertyDetail** — 5 role-filtered LinkedRecordSection panels replace 2 generic ones. `role` prop passed through to `linkRecords()` extras so new links get correct role. Legacy NULL-role records shown in conditional "Other" sections.
- [x] **9 phantom columns in Properties ALL_COLUMNS** — fixed via migration 004: `apn`/`asking_price` were naming mismatches (removed dupes); `units`, `stories`, `parking_spaces`, `price_per_sqft`, `noi`, `owner_email`, `owner_mailing_address` added to DB via ALTER TABLE (commit `e062b84`)
- [ ] **schema.sql is stale** — doesn't include migration 001-008 tables/columns. Fresh install from schema.sql alone would be incomplete.
- [ ] Add indexes on all filtered/searched columns
- [ ] Confirm Vercel frontend works end-to-end

### Phase 1B — Deals Consolidation ✅
- [x] `deal_formulas` PostgreSQL VIEW — geometric series lease commission formula + flat sale commission (migration 005, commit `be7e8e4`)
- [x] `getDeals` now queries `deal_formulas` VIEW — `team_gross_computed`, `jr_gross_computed`, `jr_net_computed` available on every row
- [x] `deal_source` → 22-option constrained multi-select (was freeform tags)
- [x] `deal_dead_reason` → 14-option constrained multi-select (was freeform tags)
- [x] Three computed columns added to Deals table column toggle (read-only): Team Gross, Jr Gross, Jr Net

### Phase 1C — Action Items ✅
- [x] action_items table + 4 junction tables created (migration 001)
- [x] Action Items page built — Apple Reminders-style UI (commit `816df0d`)
- [x] Tasks section wired into DealDetail (commit `1142874`)
- [x] Batch linked record functions for action items in useLinkedRecords hook

### Phase 1D — Comps ✅ (partially)
- [x] lease_comps + sale_comps tables created (migration 001)
- [x] Comps page built with Lease/Sale toggle + CSV import (commit `fb4645c`)
- [x] Additional comp columns via migration 003
- [x] Manual entry form — `CompManualEntryModal` with property search autocomplete, all lease fields (tenant/space/terms/dates/concessions/reps) and all sale fields (details/pricing) (commit `c242425`)
- [ ] Lease expiration auto-sync to companies.lease_exp
- [ ] Sale comp auto-update of property last_sale_date/last_sale_price

### Phase 1E — TPE ⬜ (partially complete)
- [x] Full spec documented (5 models, all weights, tpe_config table)
- [x] Supporting tables created (loan_maturities, property_distress, tenant_growth)
- [x] **Migration 008 deployed** — `tpe_config` table created with default weights, `property_tpe_scores` SQL VIEW live
- [x] **`property_tpe_scores` VIEW** — 7 CTEs joining through junction tables: owner age via `property_contacts→contacts.date_of_birth`, lease months via `property_companies→companies.lease_exp`, tenant growth via `property_companies→tenant_growth.growth_rate`, debt/distress via `loan_maturities`/`property_distress`. All 461 properties scoring (Tier C baseline until input data populated).
- [x] **`contacts.date_of_birth`** column added (DATE) — owner age computed at query time via `AGE(NOW(), date_of_birth)`, NOT stored on properties
- [x] **`properties.costar_star_rating`** column added (INTEGER 1-5)
- [x] **`properties.owner_age_est` dropped** — was wrong location; age comes from contacts through junction
- [x] **Data model corrections applied** — lease_exp lives on companies, owner age on contacts, both accessed through junction table JOINs
- [x] **TPE Living Database page** — dedicated `/tpe` route with stat cards (missing data counts), filter pills (by gap type), gap analysis table (address, current tier, missing data pills, potential points, projected tier). Sorted by potential gain × tier proximity. Click-through to PropertyDetail via SlideOver.
- [x] **Data Enrichment page** — `/tpe/enrichment` route showing properties with biggest data gaps and projected tier improvements
- [x] **Shared GAP_COLORS map** — centralized color definitions for stat cards + table pills (Owner DOB=red, Tenant Growth=green, Loan Data=blue, Owner Link=purple)
- [ ] **CoStar Star Rating integration** — `costar_star_rating` (1–5) column exists but not yet wired into TPE scoring formula or UI
- [ ] Populate TPE input data (date_of_birth on contacts, lease_exp on companies, loan_maturities, tenant_growth, property_distress)

### Phase 1F — Interaction Types ✅
- [x] Expanded from 7 to 17 types (commit `e34ce30`)

### Phase 1G — CSV Import Engine ✅
- [x] Address normalizer, composite matcher, batch INSERT (commit `fc6afe3`)
- [x] Dedicated Import tab in sidebar
- [x] **Array column fix** — PostgreSQL `text[]` columns (tags, contacted, etc.) now properly convert CSV strings to JS arrays via `ARRAY_COLS` set in server batch endpoint
- [x] **SAVEPOINT per row** — one failed row no longer aborts entire transaction; uses `SAVEPOINT row_N` / `ROLLBACK TO SAVEPOINT` pattern
- [x] **Auto-link for ALL entity types** — `_link_*` fields on properties, contacts, companies, deals, campaigns, interactions. Find-or-create contacts/companies/deals + junction table INSERT with correct role
- [x] **Multi-value link handling** — comma-separated Airtable linked records (e.g. "Mike Thompson,Mark Sorenson") split and linked individually
- [x] **Notes-to-Activity import** — `_notes_to_activity` mapping parses dated text entries into individual interaction records linked via junction tables. Handles M/D/YY, M/D/YYYY, M.D.YY, M-D-YY, Month YYYY date formats
- [x] **Cyan color-coding for link fields** — `_link_*` and `_notes_to_activity` fields display as cyan in import mapper UI; matching fields as amber; regular fields as green
- [x] **Holding period formula column** — `holding_period_years` created as formula column (`ROUND(EXTRACT(EPOCH FROM AGE(NOW(), last_sale_date)) / 31557600, 1)`) instead of static import

### Bulk Delete ✅
- [x] **`POST /api/bulk-delete` endpoint** — parameterized `DELETE FROM table WHERE id = ANY($1::uuid[])` with table validation
- [x] **`bulkOps.delete()` in bridge.js** — frontend API function
- [x] **Delete button on all list pages** — Properties, Contacts, Companies, Deals, Campaigns, Comps (with activeTab awareness for lease_comps vs sale_comps)
- [x] **Confirmation dialog** before delete, toast notification on success/failure

### CrmTable UX ✅
- [x] **Column resize handle repositioned** — moved to `right: -9px` with 18px hit zone, separated from ••• menu button
- [x] **••• menu button moved inline** — sits right after column label text instead of far-right, leaving entire right edge for resize handle
- [x] **3-dot icon fixed** — was only rendering 2 dots (broken SVG path); replaced with explicit `<circle>` elements

### Step 16 UI Polish ✅
- [x] Contacted → multi-select with full CRE status options
- [x] Label renames (Owner → Entity Name, Contacts → Owner Contact)
- [x] Unified chip colors (Contacts=purple, Companies=yellow, Deals=orange, Properties=blue)
- [x] Tasks tab Apple Reminders style (circular checkboxes, red overdue)
- [x] Detail panel back navigation with push/pop stack
- [x] Claude panel side-by-side with detail panels
- [x] LinkedChips clickable — opens correct entity detail via SlideOver
- [x] ActivitySection truncates to 5 items with Show All
- [x] LAST CONTACT auto-compute via subquery
- [x] Date formatting via formatDatePacific globally
- [x] Delete buttons on all detail panels
- [x] Deal creation sound effect

### Activity Column in Table Views ✅
- [x] **Batch interaction queries** — `batchGetContactInteractions`, `batchGetPropertyInteractions`, `batchGetCompanyInteractions`, `batchGetDealInteractions` in database.js. Uses `ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY date DESC)` to limit to 5 most recent per entity.
- [x] **Deal aggregation query** — `getDealAggregatedInteractions(dealId)` — UNION ALL across deal + linked contacts/properties/companies with `source_type`/`source_name` provenance labels
- [x] **`linked_interactions` registered in useLinkedRecords** — piggybacks on existing parallel batch fetch for all 4 entity types
- [x] **ActivityCellPreview component** — Compact cell renderer: 3 most recent activities with colored type icon circles, truncated text, actual dates (formatDateCompact). "+N more" link. Click opens ActivityModal. `e.stopPropagation()` prevents row click.
- [x] **ActivityModal component** — Full modal with quick note input (creates Note-type interaction linked to entity), full interaction list with type icons/dates/notes preview. For deals: shows aggregated activities from linked entities with "via [name]" provenance. Click any activity → InteractionDetail slide-over.
- [x] **Activity column added to all 4 table views** — Properties, Contacts, Deals, Companies. Column key: `linked_interactions`. Default visible. Uses `useMemo` to create `allColumnsWithActivity` closing over `setActivityModal`. Existing users need "Reset" in Column menu to see it (localStorage column preferences).

### Full System Test ✅ (2026-03-09)
- [x] **All tabs render** — Properties (3), Contacts (4), Companies (2), Deals (5), Activity (10+), Campaigns (2), Tasks (2), Comps (lease+sale)
- [x] **Activity column** — shows chips + "+N more" on all 4 tables, empty cell opens ActivityModal (not detail panel), quick note from modal saves, count updates live
- [x] **Inline cell editing** — text/select/multi-select confirmed working on Properties, Contacts, Companies, Deals; Escape cancels, Enter/blur saves
- [x] **Role-specific sections in PropertyDetail** — all 5 sections render (Owner Contact, Broker Contact, Company Tenants, Company Owner, Leasing Company)
- [x] **Zero console errors** throughout full test session
- [x] **Stale Vite bundle issue identified** — `git commit` during session doesn't trigger HMR for `const` arrays outside components; fix: restart Vite dev server after pulling commits
- **BUG: Duplicate column labels** — `owner_contact` (text field) and `linked_owner_contacts` (linked records virtual) both labeled "Owner Contact" in Properties column toggle. Same for `broker_contact`/`linked_broker_contacts`. UX ambiguity — rename one pair (e.g. text fields → "Owner Name", "Broker Name")

### Inline Cell Editing ✅
- [x] **InlineTableCellEditor component** — New shared component (`src/components/shared/InlineTableCellEditor.jsx`). Handles all edit types: text, number, date, email, tel, url, select, multi-select (checkbox dropdown), tags (comma-separated freeform), boolean (toggle immediately). Infers edit type from column `editType` override or `format` field. All inputs: blur/Enter saves, Escape cancels.
- [x] **CrmTable.jsx inline edit support** — Added `onCellSave` prop. Cells with `editable !== false` and not `linked_*` keys get `cursor-cell` class and click-to-edit. `e.stopPropagation()` prevents row click (detail panel). Shares `editingCell` state with existing custom field editors.
- [x] **Column metadata on all 4 pages** — Added `editable: false` to primary columns (address/name), `editType`/`editOptions` to select/multi-select/tags/boolean columns. Properties: property_type select (7 options), contacted multi-select (14 options), priority select, boolean flags. Contacts: type select (8 types), client_level select (A-D), boolean flags. Deals: status select (9 statuses), deal_type select, repping/run_by multi-select, priority_deal boolean. Companies: revenue number, tags.
- [x] **handleCellSave on all 4 pages** — Optimistic update with rollback on error. Uses `updateProperty`/`updateContact`/`updateDeal`/`updateCompany` DB functions. Toast notifications for success/failure.
- [x] **Empty activity cell click** — ActivityCellPreview `--` placeholder now has `onClick` → opens ActivityModal instead of falling through to detail panel. Works on all 4 table views.

### AI System Deployment (2026-03-14)
- [x] **Migration 007 deployed** — 11 sandbox/agent tables live in Neon: sandbox_contacts, sandbox_enrichments, sandbox_signals, sandbox_outreach, agent_heartbeats, agent_logs, ai_api_keys, agent_priority_board, agent_escalations, outbound_email_queue, ai_usage_tracking. All FK references corrected to UUID (was INTEGER).
- [x] **Migration 008 deployed** — TPE VIEW + tpe_config + contacts.date_of_birth + costar_star_rating. Dropped owner_age_est from properties.
- [x] **11 AI Ops API endpoints** added to server/index.js: GET/POST sandbox review, contact promotion (with email dedup + SAVEPOINT), heartbeats, logging, summary, TPE scores (single + bulk), convergence detection algorithm
- [x] **3 prompting guides expanded** — opus-4.6.md, qwen-3.5.md, minimax-2.5.md all expanded from ~84 to ~200 lines with CRE-specific templates, token budgets, error recovery
- [x] **CLAUDE.md rewritten** — removed Electron references, updated for Vercel/Railway/Neon web deployment, added AI Master System section
- [x] **Memory system built** — 8 files in `.claude/projects/.../memory/`: user_profile, project_architecture, project_status, project_competitive_edge, feedback_coding_style, feedback_communication, reference_external_systems, reference_key_documents
- [x] **Multiple tenant companies confirmed** — property_companies junction table supports unlimited companies per property (5 properties already have 2+ linked)

### Git Cleanup & Branch Consolidation ✅ (2026-03-21)
- [x] **Merged `feature/ai-ops-dashboard` into `main`** — 34 commits, 164 files, ~15k lines. Resolved merge conflicts in package.json, server/index.js, Settings.jsx
- [x] **Fixed corrupt git objects** — re-hashed all working tree files to repair pack file gaps from multi-machine workflow
- [x] **Deleted stale branches** — `feature/ai-ops-dashboard`, `feature/tpe-view`, `apple-inspired-ui-overhaul`, `claude/naughty-yalow`, `claude/upbeat-panini` (local + remote)
- [x] **Single `main` branch** — clean repo, auto-deploys to Vercel + Railway

### Security: Credential Rotation ✅ (2026-03-21)
- [x] **Neon DB password rotated** — old `npg_LFY9Gyds7VDA` replaced everywhere, Railway env var updated
- [x] **Hardcoded credentials removed** — 9 script files had inline PostgreSQL connection strings; replaced with `dotenv` + `process.env.DATABASE_URL`
- [x] **GitGuardian alert resolved** — PostgreSQL URI no longer in any tracked files

### Team Chat UX Overhaul ✅ (2026-03-21)
- [x] **Non-blocking chat** — removed full-screen backdrop overlay; CRM stays fully interactive behind chat
- [x] **Draggable** — grab header to move chat anywhere in the app window (useDrag hook)
- [x] **Resizable** — drag bottom-right corner handle to resize freely (useResize hook, min 320x300)
- [x] **Expand/Restore** — header button toggles near-full-screen mode
- [x] **Minimize** — collapses to header bar only
- [x] **Unread badge** — red count badge on toggle button when chat is closed, polls every 15s
- [x] **Scroll-to-bottom on open** — chat opens instantly at most recent messages, no flash/jump
- [x] **Future: detachable window** — when Mac desktop app is built (Electron/Tauri), chat can be dragged out of the app into its own OS window

### Houston OAuth Migration ✅ (2026-03-21)
- [x] **Houston brain switched to OAuth** — `ANTHROPIC_OAUTH_TOKEN` via fetch (not SDK), runs on Claude Max subscription (no API credit burn)
- [x] **Server Anthropic client prefers OAuth** — falls back to API key if no OAuth token
- [x] **All Claude calls use `claude-sonnet-4-6`** — consistent model across Houston brain, ClaudePanel, ElevenLabs ConvAI route
- [x] **dotenv Node 25 fix** — `override: true` flag for dotenv compatibility with Node 25 native .env loading
- [x] **express-rate-limit IPv6 fix** — custom keyGenerator no longer triggers IPv6 validation error

### Houston Image Analysis ✅ (2026-03-21)
- [x] **Claude Vision integration** — images uploaded to chat are read from disk as base64 and sent to Claude Vision API
- [x] **5-category classification** — `client_conversation`, `property_listing`, `document`, `crm_data`, `personal`
- [x] **Smart behavior per category** — work images get analysis + action offers; personal photos get brief friendly reactions (no CRM spam)
- [x] **Action confirmation flow** — thumbs up emoji or "yes"/"do it" text confirms Houston's offered action
- [x] **Auto-create interactions** — for `client_conversation` screenshots: Houston identifies contact, summarizes convo, creates interaction record linked to contact on confirmation
- [x] **Cross-reference properties** — for `property_listing` screenshots: Houston extracts address and searches CRM
- [x] **Analysis stored** — `houston_analysis` field in attachment JSONB for future reference
- [x] **Action deduplication** — `houston_meta.action_executed` flag prevents double-execution
- [x] **5-minute timeout** — text confirmations only work within 5 minutes of Houston's offer

### AI Ops 3D War Room ✅ (2026-03-18)
- [x] **Full Three.js rebuild** — Replaced flat SVG isometric room with real 3D scene using `three`, `@react-three/fiber`, `@react-three/drei`, `gsap`
- [x] **12 new component files** — WarRoom3D.jsx (canvas shell), WarRoomScene.jsx (room geometry + lighting), OrbCore.jsx (holographic sphere + lights), OrbRings.jsx (LOCKED — 3 gyroscopic rings with precession), Agent3D.jsx (mesh composite characters), DustParticles.jsx (200 floating motes), WallScreen3D.jsx (4 data screens + RectAreaLight), CameraController.jsx, DetailOverlay.jsx, ProceduralTextures.js, useRoomTextures.js, coordMap.js
- [x] **Polyhaven PBR textures** — 9 texture sets loaded from `/public/textures/`: painted_concrete_02 (floor), granite_tile_04 (platform), painted_plaster_wall (back wall), plastered_wall_03 (left wall), plastered_wall_04 (right wall), grey_tiles (ceiling), metal_plate_02 (platform trim), corrugated_iron_03 (accent panels), rock_tile_floor (alt floor)
- [x] **@react-three/postprocessing v2.19.1** — Bloom effect (intensity 1.5, luminanceThreshold 0.15, mipmapBlur) on orb, rings, screen edges, platform glow
- [x] **Agent roaming AI** — 3-state machine (WALKING/PAUSING/LOOKING), platform collision avoidance with waypoint pathfinding, smooth angle interpolation
- [x] **Cinematic lighting** — Zero ambient, orb as primary light source (PointLight #4488ff intensity 8.0), 4 ceiling SpotLights, HemisphereLight silhouette fill, FogExp2 atmospheric fog
- [x] **Tiered amphitheater platform** — 3 stepped stone rings (outer tallest, inner lowest) + recessed glowing center bowl, matching Star Wars Rebels war table reference
- [x] **OrbRings.jsx is LOCKED** — standalone file with 3 rings, each with primary spin + gyroscopic precession, never to be edited

### TPE Living Database & Enrichment UI ✅ (2026-03-17)
- [x] **TPE Living Database page** — `/tpe` route with sidebar nav (lightning bolt icon), stat cards for total scored/avg score/tier distribution, sortable property table with TPE columns (score, tier, blended priority), TierBadge component with color-coded A/B/C/D badges
- [x] **Data Enrichment page** — `/tpe/enrichment` route showing gap analysis: stat cards (missing owner DOB, tenant growth, loan data, owner link counts), filter pills by gap type, table with current tier → projected tier if gaps filled, sorted by potential point gain × tier proximity
- [x] **Shared GAP_COLORS map** — DRY color definitions so stat card numbers and table pills always match (red/green/blue/purple)
- [x] **TierBadge component** — reusable tier display with A=emerald, B=blue, C=yellow, D=red color coding
- [x] **API endpoints** — `GET /api/ai/tpe-gaps` (with optional `gap_type` filter), `GET /api/ai/tpe-gaps/stats` for aggregate counts

### Custom Saved Views ✅ (2026-03-17)
- [x] **SavedViewsBar component** — horizontal bar below page header on all entity pages, shows saved view pills + "Save View" button
- [x] **View persistence** — saves filter state, sort column/direction, visible columns, and column order per entity type
- [x] **CRUD operations** — save new views, load views (restores all settings), delete views with confirmation
- [x] **localStorage-backed** — `crm_saved_views_{entity}` keys, no DB migration needed
- [x] **Applied to all pages** — Properties, Contacts, Companies, Deals, Interactions, Campaigns

### Page Header Icons ✅ (2026-03-17)
- [x] **All 12 pages** now have colored SVG icons next to page titles, matching sidebar NAV_ITEMS icons
- [x] **Unique colors per page** — Properties=blue, Contacts=violet, Companies=pink, Deals=emerald, Interactions=sky, Campaigns=rose, Action Items=teal, Comps=indigo, Import=cyan, Settings=zinc, TPE=yellow, Enrichment=orange
- [x] **No color collisions** — verified all 12 pages have distinct icon colors

### Lease Comp Import Wizard ⬜ (next priority)
- [ ] **Receive Excel examples from David** — need actual lease comp spreadsheet structure before designing
- [ ] **Design data fan-out mapping** — one Excel row → properties + companies + contacts + lease_comps + junction tables
- [ ] **Build dedicated wizard page** — separate from generic CSV import, smart field mapping, preview before commit
- [ ] **Auto-link logic** — find-or-create for properties (by address), companies (by name), contacts (by name/email), then create junction links with correct roles

### AI Fleet Architecture + MVA + Data Pipeline (2026-03-20)
- [x] **3-machine OpenClaw fleet architecture** — Mac Mini 48GB (workers), Mac Mini 64GB (QA + intelligence), Mac Studio 128GB (Houston + premium). 14 total agents across 3 machines, each as its own OpenClaw instance with Telegram bot. Fleet Apple ID strategy (separate from personal iCloud).
- [x] **MVA (Market Value Alignment) scoring** — TPE Model 6 with 5 categories: price vs comps (30pts), assessment gap (20pts), listing staleness (15pts), zoning upside (15pts), catalyst proximity (20pts). Updated blended priority to 3-factor: TPE 50% + ECV 25% + MVA 25%. All weights configurable in tpe_config.
- [x] **Reonomy as primary data source** — Replaces OpenCorporates + ATTOM + BatchData. "True Owner" feature identifies people behind LLCs in one API call. Returns owner name, contact info, connected entities, full portfolio, mortgage data.
- [x] **Complete data source pipeline** — Tier 1 automated (Reonomy, RE Apps, UniCourt, NeverBounce, county sites), Tier 2 email parsing (AIR super sheets, CoStar alerts, title company), Tier 3 supervised (BeenVerified, WhitePages, ZoomInfo with OpenClaw computer-use assist).
- [x] **Continuous 24/7 processing** — Changed from nightly batch to continuous. Enricher fires immediately on new contacts, Ingester checks email every 15-30 min, Comp Puller checks RE Apps every 2-4 hours. Deal Hunter re-runs on significant new data, not just 5 AM.
- [x] **Supervised enrichment workflow** — OpenClaw drives browser for BeenVerified/WhitePages, David clicks CAPTCHAs. Agent does 95% of work. 8 owners in 24 min vs 2 hours manual.
- [x] **Cross-reference logic encoded** — Reonomy as anchor → UniCourt cascade → NeverBounce verification → BeenVerified/WhitePages confirmation. Pre-confidence scoring: 85%+ auto-enters, 60-84% queues for manual.
- [x] **5 new database tables designed** — mva_listings, mva_comps, mva_assessments, mva_catalysts, enrichment_queue (schemas in ARCHITECTURE.md)
- [x] **5 new agents designed** — Comp Puller (RE Apps), Ingester (email parser), Public Records (county), Court Monitor (UniCourt), Deal Hunter (MVA calculator)
- [x] **Monthly cost estimate** — ~$404-839/mo total (Reonomy ~$300, UniCourt ~$150, cloud APIs ~$50, tools ~$54, electricity ~$20). One deal covers 2+ years.
- [x] **Commits:** `4c7acde` (OpenClaw fleet), `3eac801` (MVA + data pipeline), `0905a94` (Reonomy + continuous processing)

### AI System Architecture Updates (2026-03-13)
- [x] **YouTube Transcript MCP** — installed `@kimtaeyoon83/mcp-server-youtube-transcript` for both Claude Desktop and Claude Code (project-level `.mcp.json`). Drop any YouTube URL in future sessions and Claude can pull the transcript.
- [x] **Credential Hygiene** — new OPERATIONS.md §11: credential scanning before Git backup, nightly config backup cron (4:30 AM), env var pattern for agent configs, placeholder replacement rules. Prevents API key leakage.
- [x] **Alert-Only Health Checks** — new OPERATIONS.md §12: heartbeat monitoring only notifies when something's wrong (no "all clear" spam). Hostile input defense rules for all agents consuming external content.
- [x] **Parallel Sub-Agent Spawning** — new ORCHESTRATION.md section: fan-out/fan-in pattern for Researcher. 5 parallel sub-searches (county records, listings, news, social, CRM cross-ref) merge into single report. Timeout and fallback rules included.
- [x] **Nightly Self-Maintenance Cron** — new ORCHESTRATION.md section: 3-5:30 AM schedule for index rebuilds, data cleanup, model updates, config backup, performance reporting.
- [x] **Scout Agent (new — Agent 5)** — AI & tech intelligence agent. Scans HN, Reddit, X, ArXiv, Ollama registry, HuggingFace for new models/tools/techniques. Weekly Evolution Report with effort-vs-impact matrix. Immediate alerts for urgent discoveries (security vulnerabilities, major model releases). Full agent template created at `agent-templates/scout.md`.
- [x] **Self-Improvement Loop v2** — ARCHITECTURE.md updated: two feedback streams into Claude (internal performance + external intelligence). Evolution Proposal format defined with categories: model_upgrade, new_tool, workflow_change, cost_optimization, security_patch, competitor_intel, new_data_source.
- [x] **ROADMAP Phase 2D** — Scout agent deployment added to Phase 2 roadmap.
- [x] **Supervisor config + folder structure** — ORCHESTRATION.md updated with Scout in architecture diagram, supervisor-config.json, startup order, folder structure, and fleet split strategy (Scout on Mac Mini alongside Researcher).

### 5-Round Deep AI/CRM Audit ✅ (2026-03-13) — 60 Prompts, 47 Tiers

Across 3+ sessions, ran a comprehensive 5-round audit generating 60 strategic prompts and producing a complete evolution roadmap:

**Round 1 (Prompts 1-12):** Tiers 0-7 — Plumbing. Schema fixes, auth, sandbox promotion, pagination, error handling, AI testing framework.
**Round 2 (Prompts 13-24):** Tiers 8-15 — Nervous System. Agent feedback loops, cross-agent learning, source discovery, false negative detection, Bayesian calibration, Innovation Agent.
**Round 3 (Prompts 25-36):** Tiers 16-23 — Brain. Relationship graphs, temporal intelligence, simulation engine, explainability, market theory, data moat, antifragility.
**Round 4 (Prompts 37-48):** Tiers 24-35 — Foresight. Data gap inventory, data bounties (human-in-the-loop requests), proxy signals, multi-horizon predictions, feature importance, calibration, portfolio forecasts, market regime detection, data value ROI calculator.
**Round 5 (Prompts 49-60):** Tiers 36-47 — Body. Agent runtime (PM2/OpenClaw), lifecycle management, multi-Mac coordination, CRM workflow pages, AI Ops dashboard, search/bulk ops, email pipeline (Postmark), notifications (Telegram), RBAC, audit trail, CI/CD, monitoring/DR.

**Design Documents Created (17):**
- `docs/plans/2026-03-13-evolution-roadmap.md` (Round 1 master, Tiers 0-7)
- `docs/plans/2026-03-13-evolution-roadmap-round2.md` (Tiers 8-15)
- `docs/plans/2026-03-13-evolution-roadmap-round3.md` (Tiers 16-23)
- `docs/plans/2026-03-13-evolution-roadmap-round4.md` (Tiers 24-35, Predictive Intelligence)
- `docs/plans/2026-03-13-evolution-roadmap-round5.md` (Tiers 36-47, Implementation Bridge)
- `docs/superpowers/plans/2026-03-13-prompts-13-16-agent-learning-loops.md`
- `docs/superpowers/specs/2026-03-13-prompts-17-20-deep-analysis.md`
- `docs/superpowers/specs/2026-03-13-advanced-intelligence-design.md`
- `docs/superpowers/plans/2026-03-13-prompts-25-28-strategic-cognition.md`
- `docs/superpowers/specs/2026-03-13-prompts-29-32-strategic-cognition.md`
- `docs/superpowers/specs/2026-03-13-prompts-33-36-deep-strategy-layer.md`
- `docs/superpowers/plans/2026-03-13-prompts-37-40-predictive-intelligence.md`
- `docs/superpowers/specs/2026-03-13-prompts-41-44-prediction-actionability.md`
- `docs/superpowers/specs/2026-03-13-prompts-45-48-portfolio-predictions.md`
- `docs/superpowers/plans/2026-03-13-prompts-49-52-implementation-bridge.md`
- `docs/superpowers/specs/2026-03-13-prompts-53-56-ops-email-notifications.md`
- `docs/superpowers/specs/2026-03-13-prompts-57-60-rbac-devops.md`

**Existing docs updated with audit findings:**
- `ai-system/ARCHITECTURE.md` — 12 critical gaps section
- `ai-system/OPERATIONS.md` — feedback/testing/coordination gaps
- `ai-system/COORDINATION.md` — 5 failure modes documented
- `ai-system/ROADMAP.md` — Rounds 1-5 tier summaries added
- `ie-crm/ROADMAP.md` — 12 highest-impact gaps + new tables/pages

**Stats:** 115+ new tables designed, 47 capability tiers, 17 design documents, ~$16-49/mo additional operational cost.

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
| CoStar Star Rating | `costar_star_rating` | INTEGER | 1–5 nationally standardized quality score from CoStar. Supplements broker-reported building_class (A/B/C). See `docs/COSTAR-STAR-RATINGS.md` for full rationale and TPE integration plan. Add during TPE migration. |

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

**Formula Column — Age:**
`contacts.age` (INT) should be treated as a **read-only, auto-calculated display field** in the UI — not manually entered. Computed from `contacts.born DATE` using `DATE_PART('year', AGE(NOW(), born))`. Display as read-only in the Contacts tab whenever `born` is set. This is also the data source for the TPE Owner Age category — the VIEW joins `property_contacts` (role = 'owner') → `contacts.born` to compute owner age at query time.

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

Hold duration is **VIEW-computed** from `properties.last_sale_date`: `EXTRACT(YEAR FROM AGE(NOW(), properties.last_sale_date))`. Not a stored column — no ALTER TABLE needed. If `last_sale_date` is NULL, score is 0 (unknown).

*Note: Score Weights tab says "Individual/Family LLC = 10, Out-of-area = 5." The actual formula uses Individual/Private/Partnership = 8, Trust = 10, Owner-User = 7 instead of out-of-area. The `out_of_area` column exists in the data but is NOT used in the scoring formula. Both values are in `tpe_config` — you can switch to the Score Weights version later if preferred.*

##### Category 3: OWNER AGE (20 pts max)
Source: `contacts.born` (owner's birth date) — age computed in VIEW as `EXTRACT(YEAR FROM AGE(NOW(), c.born))`
Data path: `properties` → `property_contacts` (role = 'owner') → `contacts.born`

| Signal | Points | Logic |
|---|---|---|
| Age 70+ | 20 | Estate/succession pressure highest |
| Age 65–70 | 15 | Retirement planning window |
| Age 60–65 | 10 | Beginning to think about exit |
| Age 55–60 | 5 | On the horizon |
| Under 55 or unknown | 0 | |

No new column needed on `properties`. The `contacts` table already has `born DATE`. The TPE VIEW joins via `property_contacts` (role = 'owner') → `contacts.born` to compute age. In the **Contacts UI**, `age` is a **read-only formula column** auto-calculated from `born` — never manually entered.

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
| Owner Entity Type | `owner_entity_type` | TEXT | Individual, Family LLC, Large Investor, etc. |
| Lien/Delinquency | `has_lien_or_delinquency` | BOOLEAN | Tax lien or mechanic's lien flag |

*Removed from this list: `owner_age_est` (formula on Contacts — see below) and `hold_duration_years` (VIEW-computed from `last_sale_date` — no stored column needed).*

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

1. ~~**Commit the current uncommitted work**~~ ✅ DONE
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
15. ~~**Build CSV Import Engine**~~ ✅ DONE — address normalizer, composite matcher, batch INSERT, dedicated Import tab
16. **Fix bugs (from full system test)** — (a) rename `owner_contact` → "Owner Name" and `broker_contact` → "Broker Name" in `Properties.jsx` ALL_COLUMNS to fix collision with linked-record virtual columns `linked_owner_contacts`/`linked_broker_contacts`; (b) add note to dev workflow: restart Vite dev server after pulling commits (HMR doesn't pick up `const` arrays defined outside components)
17. ~~**Fix TPE readiness gaps (migration)**~~ ✅ DONE — `tpe_config` table created (migration 008), `property_tpe_scores` VIEW deployed, `contacts.date_of_birth` added, `properties.costar_star_rating` added, `owner_age_est` dropped
18. ~~**Build `property_tpe_scores` SQL VIEW**~~ ✅ DONE — 7 CTEs, all 461 properties scoring, tier labels A-D. TPE Living Database + Enrichment pages built with full UI.
19. ~~**Build formula computation (deals)**~~ ✅ DONE — `deal_formulas` VIEW with geometric series commission calc
20. **Build dedicated Lease Comp Import Wizard** — David to provide Excel examples first. Need data fan-out mapping (one row → properties + companies + contacts + lease_comps + junctions).
21. ~~**Build AI Ops Dashboard page**~~ ✅ DONE — Full Three.js 3D war room rebuilt from SVG. Polyhaven PBR textures, Bloom postprocessing, gyroscopic rings (OrbRings.jsx LOCKED), 5 roaming agents with collision avoidance, 4 data screens with RectAreaLight, tiered amphitheater platform, cinematic lighting, FogExp2 fog, dust particles. 12 new component files created. Dependencies added: three, @react-three/fiber, @react-three/drei, @react-three/postprocessing, gsap.
21b. **Houston Voice Activation** — Click orb → GSAP camera swoop to floor level → ElevenLabs voice ("What do you need, David?") → Web Speech API mic → Claude API with CRM RAG context → orb pulses with voice amplitude. Clone from Elowen codebase. **NEXT PRIORITY**
22. **Smart Filters & Saved Lists (Phase 2A)** — filter pills, slide-in filter builder, auto-updating lists
23. **Migrate data** — initial bulk load via Claude Code scripts (Airtable exports + TPE Excel), then ongoing imports via CRM CSV tool
24. **Populate TPE input data** — date_of_birth on contacts, lease_exp on companies, loan_maturities, tenant_growth, property_distress records

---

### UI Polish & Fix List (Step 16)

Tab-by-tab review completed 2026-03-07. Issues documented below.

#### Properties Tab (table view)
- [x] ~~Linked record columns (Contacts, Companies, Deals, Tags) show `--`~~ — FIXED: `useLinkedRecords` hook batch-fetches junction data; columns populate when junction records exist
- [x] ~~"New Property" modal errored with "Disallowed column 'building_sqft'"~~ — FIXED (renamed to `rba`/`land_sf`)

#### Properties Detail Panel
- [x] Building SF and Lot SF fields showing correctly after column rename fix
- [x] Linked chips (Contacts, Companies, Deals) visible and clickable — clicking opens nested slide-over ✓
- [x] Activity section present with `+ Activity` button ✓
- [x] ~~"Contacts" linked section label → rename to **"Owner Contact"**~~ — FIXED
- [x] ~~**"Contacted" field broken**~~ — FIXED: changed to `type="multi-select"` with full options list

#### Properties Tab — Label Renames
- [x] ~~"OWNER" column header in table → rename to **"ENTITY NAME"**~~ — FIXED
- [x] ~~"Owner Name" field in detail panel → rename to **"Entity Name"**~~ — FIXED

#### Contacts Tab (table view)
- [x] ~~LAST CONTACT should auto-populate from most recent interaction date~~ — FIXED: subquery computes MAX(interaction.date) via junction table
- [x] TYPE badge renders correctly as colored chip — not a linked record (Owner/Broker/Tenant are text categories, not FK references)

#### Contacts Detail Panel
- [x] Activity, Properties, Companies, Campaigns linked sections all working ✓

#### Companies Tab (table view)
- [x] Columns displaying correctly ✓
- [x] LAST CONTACT column added — auto-computes from interaction_companies junction

#### Deals Tab (table view)
- [x] Status badges (Prospect, Active) displaying correctly ✓

#### Deals Detail Panel
- [x] Activity section IS present with `+ Activity` button (not missing — was just collapsed/empty)

#### All Detail Panels — Activity Section UX
- [x] ~~**Truncate to 5 recent**~~ — FIXED: ActivitySection shows 5 most recent with "Show all (N)" expand button
- [x] ~~**Clickable activity rows**~~ — FIXED: all detail panels (Properties, Deals, Companies, Contacts) now wire `onSelectInteraction` → InteractionDetail overlay

#### Activity Tab
- [x] ~~Each interaction should show linked entity names~~ — FIXED: Interactions.jsx shows property/contact/deal names in grey text
- [x] ~~Cold Call shows `—` as subject~~ — FIXED: displays "(no subject)" fallback

#### Campaigns Tab
- [x] Table, status badges, dates all working ✓
- [x] ~~Linked Campaign chips in Contact detail panel don't open Campaign detail view~~ — FIXED: navigation wired through SlideOverContext

#### Tasks Tab
- [x] Status, priority star, assignee chips all working ✓
- [x] ~~**Redesign to Apple Reminders style**~~ — FIXED: circular checkboxes, clean list rows, overdue in red
- [x] ~~**Date formatting**~~ — FIXED: all dates use formatDatePacific
- [x] ~~**Assigned To separator bug**~~ — FIXED: comma-separated display

#### Comps Tab (Lease & Sale)
- [x] Columns, data, Import CSV button all working ✓

#### Comps Tab — Lease Comps Additions
- [x] ~~**Property column missing**~~ — FIXED: added as linked chip column with clickable navigation
- [x] ~~**Tenant as linked chip**~~ — FIXED: renders as clickable company chip
- [x] ~~**New columns added**~~ — FIXED: `cam_expenses`, `zoning`, `doors_with_lease` added via migration + ALL_COLUMNS
- [x] ~~**Import engine COLUMN_MAPS update**~~ — FIXED: all mappings added for lease_comps

#### Comps Tab — Sale Comps Additions
- [x] ~~**Building detail lookup columns**~~ — FIXED: getSaleComps() JOINs to properties for ceiling_ht, power, drive_ins, number_of_loading_docks

#### All Tables — Global Issues
- [x] ~~Linked record columns show `--`~~ — FIXED: `useLinkedRecords` hook provides batch junction data; columns populate when records exist
- [x] ~~`LAST CONTACT` auto-compute~~ — FIXED: subquery on getContacts/getCompanies computes MAX(interaction.date)
- [x] ~~**Linked chip colors inconsistent**~~ — FIXED: unified color map (Contacts=purple, Companies=yellow, Deals=orange, Properties=blue, Campaigns=teal)
- [x] ~~**Date formatting global fix**~~ — FIXED: all tables use `format: 'date'` → formatCell → formatDatePacific; detail panels use formatDatePacific directly

#### Modal & Navigation UX
- [x] ~~**Modal close button (X)**~~ — FIXED: increased to 32×32px touch target
- [x] ~~**Detail panel back navigation**~~ — FIXED: SlideOverContext with push/pop navigation stack + back arrow button
- [x] ~~**Claude chat button repositioning**~~ — FIXED: slides left when detail panel opens, anchors next to panel edge

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

- ~~**Houston Voice Agent**~~ → **PROMOTED TO NEXT PRIORITY (Step 21b)** — Click orb → GSAP camera swoop → ElevenLabs voice → Web Speech API mic → Claude API with CRM RAG → orb pulses with amplitude. Clone from Elowen codebase. Zoom integration (wake word, Recall.ai bridge) remains future.
- Houston AI agent — auto-generate action items from TPE score changes, lease expiry alerts
- IAR Hot Sheet automation (daily PDF → parse → update comps + property availability)
- Email automation / webhook capture (auto-log emails as Interactions)
- TPE Dashboard view — heatmap, top 50 targets, score change alerts
- Building image storage workflow (Costar PDF extraction → local file storage)
- File attachment storage approach (local filesystem vs S3)
- Prop 13 building tax live formula (needs tax_rate setting per city/county)
- Report generation (BOV reports pulling comps by geography/size/type)
