# IE CRM — Master Roadmap
**Inland Empire Commercial Real Estate CRM**
Mudge Team CRE — Built by David Mudge Jr
Last updated: March 21, 2026

> **Source of truth:** This is the single roadmap for CRM + AI system.
> **Session status:** HANDOFF.md (updated each session)
> **AI architecture detail:** ai-system/ARCHITECTURE.md
> **Testing:** TESTING-PROMPT.md (26 phases)

---

## Production Launch Target: Monday March 24, 2026

### Launch Checklist
- [x] CRM core — 12 pages, inline editing, linked records, activity tracking
- [x] 10,031 properties + 8,920 contacts + 196 deals in Neon PostgreSQL
- [x] Auth — email/password login, JWT, admin/broker roles
- [x] Team Chat — Houston AI, image analysis, draggable/resizable, frosted glass
- [x] TPE — 2,000 properties scored, tier badges, enrichment gap analysis
- [x] Smart filters + saved views with New View modal
- [x] Light mode + dark mode both readable
- [x] OAuth — all Claude calls on Claude Max subscription (no API burn)
- [x] Deployed — Vercel (frontend) + Railway (backend) auto-deploy on push
- [ ] **PWA setup** — manifest, service worker, app icon for iOS home screen
- [ ] **Production smoke test** — run full testing protocol on Vercel URL
- [ ] **Password reset flow** — in case Dave Sr forgets password Monday morning

---

## What's Built (as of March 21, 2026)

### Core CRM (Phase 1) — ~95% complete
- 12 pages: Properties, Contacts, Companies, Deals, Activity, Campaigns, Action Items, Comps (Lease/Sale), TPE, Enrichment, Import, Settings
- CrmTable with inline editing (text, number, date, select, multi-select, tags, boolean)
- Slide-out detail panels with linked records, activity history, notes, tasks
- Cross-linking: Properties <> Contacts <> Companies <> Deals <> Campaigns
- CSV Import Engine with address normalization, composite matching, auto-linking
- Bulk delete across all entity types
- DB triggers: comp auto-sync (lease→company lease_exp, sale→property sale data)
- 20 database migrations applied to Neon PostgreSQL 17

### TPE — Transaction Probability Engine (Phase 1E) — complete
- SQL VIEW scoring 2,000 properties (5 models, 100pt scale)
- Configurable weights via tpe_config table
- TPE Living Database page with tier badges (A/B/C/D)
- Data Enrichment page with gap analysis + projected tier improvements
- Tune Weights drawer in Settings

### Smart Filters + Saved Views (Phase 2) — complete
- Column filter popovers (text, select, number range, date presets, boolean)
- FilterBuilder with AND/OR logic
- Saved view tabs (create, rename, duplicate, delete, set default)
- New View modal with name + filter/sort/column summary
- Pre-built seed views per entity type

### Auth + Security (Phase 4) — ~85% complete
- Email/password auth with bcrypt hashing
- JWT tokens with role payload (admin, broker)
- requireRole middleware on write + admin routes
- Rate limiting (200/min general, 10/15min auth)
- CORS locked to known Vercel + localhost origins
- Hardcoded credentials removed from all files
- **Missing:** password reset flow, audit logging

### Houston AI + Team Chat (Phase 5) — ~65% complete
- Real-time Socket.io team chat (David Jr, Dave Sr, Sarah + Houston)
- Houston responds to @mentions and CRM data questions
- RAG memory system (preferences, key facts, relationships)
- Image analysis via Claude Vision — classifies screenshots, offers CRM actions
- Action confirmation — thumbs up to auto-create interaction records
- Draggable, resizable, minimizable chat with frosted glass effect
- Unread badge on chat toggle button
- Houston voice activation via ElevenLabs + CRM RAG context
- All Claude calls on OAuth (Claude Max subscription, claude-sonnet-4-6)
- **Missing:** morning briefings, auto-create action items from TPE changes, email pipeline

### AI Ops Dashboard (Phase 1J) — infrastructure complete
- 3D War Room (Three.js) with roaming agents, holographic orb, wall screens
- Sandbox tables for agent outputs (contacts, enrichments, signals, outreach)
- 11 AI API endpoints for agent fleet
- Sandbox-to-production promotion workflow
- **Missing:** actual AI agents running on Mac Mini

---

## What's Next (prioritized)

### Immediate (This Weekend)
1. **PWA setup** — manifest.json, service worker, meta tags, app icon → iOS home screen install
2. **Production smoke test** — run TESTING-PROMPT.md phases on Vercel URL
3. **Password reset** — simple email-based or admin-reset flow

### Post-Launch (Week of March 24)
4. **AI Agents on Mac Mini** — deploy Tier 3 local models (Qwen 3.5, MiniMax 2.5), start with enrichment agent
5. **Email pipeline** — webhook capture of inbound/outbound emails as interactions, match to contacts
6. **Houston morning briefings** — daily summary in chat (new leads, expiring leases, overdue tasks)
7. **Auto-action items from TPE** — Houston creates tasks when properties jump in score

### Phase 3 — Report Generation
- BOV reports (pull lease comps by geography/size/type)
- Property fact sheets / brochures (PDF)
- Comp sheets (side-by-side comparisons)
- Call lists / canvassing sheets (sorted by TPE score)
- Deal summaries and commission projections
- Select records > generate report flow

### Phase 6 — Maps & GIS
- Google Maps with color-coded property markers (by TPE score)
- Parcel boundary overlays (San Bernardino & Riverside County)
- Zoning intelligence DB
- Comp heatmap overlay (lease rates by area)

### Phase 7 — Mobile App
- [x] PWA for immediate mobile access (March 2026)
- [ ] Native iOS app (future — only if needed for push notifications, background location, etc.)

### Data Enrichment Priorities
- **Unicourt court filings** — foreclosures, liens, bankruptcy as TPE input (major deal indicator)
- **Owner DOB** — 9,902 properties missing (affects TPE Model 1)
- **Tenant growth rates** — 10,031 missing (affects TPE Model 1)
- **Loan maturity data** — 8,520 missing (affects TPE Models 4+5)

---

## Architecture

### Deployment
| Layer | Service | Auto-Deploy |
|-------|---------|-------------|
| Frontend | Vercel | On push to main |
| Backend | Railway (Express + Node.js) | On push to main |
| Database | Neon PostgreSQL 17 | Pooled connections |
| AI (in-app) | Claude Max via OAuth | claude-sonnet-4-6 |
| AI (fleet) | Mac Mini — local models | Not yet deployed |
| Voice | ElevenLabs | Houston voice synthesis |

### Tech Stack
- React 18 + Vite 6 (frontend)
- Express + Node.js (backend API)
- Tailwind CSS 3 (custom theme with CSS variables)
- PostgreSQL 17 via Neon (pooled)
- Socket.io (real-time chat)
- Three.js + @react-three/fiber (3D War Room)
- @anthropic-ai/sdk (Claude integration)

### AI Master System (planned fleet)
- **Tier 1 — Claude Opus:** Strategic oversight, Chief of Staff ("Houston")
- **Tier 2 — ChatGPT/Gemini:** Validation/QA on agent outputs
- **Tier 3 — Local (Mac Mini):** Qwen 3.5, MiniMax 2.5 — high-volume research, enrichment, matching
- 14 agents designed, sandbox infrastructure built, agents not yet deployed
- Full architecture: ai-system/ARCHITECTURE.md

---

## File Organization

### Source of Truth
| Topic | File |
|-------|------|
| Current build status | HANDOFF.md |
| Roadmap + priorities | ie-crm/ROADMAP.md (this file) |
| AI system architecture | ai-system/ARCHITECTURE.md |
| AI orchestration | ai-system/ORCHESTRATION.md |
| Dev guide | ie-crm/CLAUDE.md |
| Testing protocol | TESTING-PROMPT.md |

### Reference (don't need updating)
- ai-system/OPERATIONS.md — agent sandbox workflow
- ai-system/agent-templates/ — agent prompt templates
- ai-system/prompting-guides/ — model-specific prompting
- docs/superpowers/ — feature specs + implementation plans

### Archived
- docs/archive/ — old evolution roadmaps, stale brainstorms
