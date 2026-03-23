# IE CRM + AI System — Evolution Roadmap Round 5

**Implementation Bridge: From Design to Deployed System**
**Generated from 12 Fifth-Round Deep Audit Prompts — March 13, 2026**

---

## What Round 5 Adds

Round 1 = **Plumbing** (data flows, auth, endpoints)
Round 2 = **Nervous System** (feedback loops, self-calibration, anomaly detection)
Round 3 = **Brain** (market understanding, prediction, simulation, relationship reasoning)
Round 4 = **Foresight** (predictive accuracy, data-aware predictions, human-AI data collaboration)
Round 5 = **Body** (runtime, operations, communication channels, security, resilience)

Round 5 transforms 35 tiers of system design into a **deployable, observable, secure, and self-healing production system**. It bridges the gap between what the AI system is designed to do (Rounds 1-4) and how it actually runs — on real hardware, with real email, real notifications, real users, and real disaster recovery.

### The Core Problem Round 5 Solves

**The system has been designed but has no way to run, be observed, communicate with the outside world, or survive failures.** Specifically:
- Agent templates exist but have no runtime wiring, process management, or crash recovery
- There's no protocol for distributing agents across multiple Mac machines
- The CRM has no global search, document storage, or advanced bulk operations
- David has zero visibility into what the AI agents are doing or costing
- Email communication is entirely manual — no inbound parsing, no tracking, no templates
- There's no notification system — critical events go unnoticed
- No authentication, authorization, or audit trail
- No CI/CD pipeline, database branching strategy, or disaster recovery plan
- No performance monitoring or health checks

---

## New Capability Tiers (Extends Rounds 1-4's Tiers 0-35)

### Tier 36 — Agent Runtime & Configuration (Turn On the Machines)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 36.1 | **Agent folder structure** — `/AI-Agents/` with config/, instructions/, memory/, shared/, agents/, watchdog/, test-harness/ directories. Clean separation of concerns. | Prompt 49 | 2 hours |
| 36.2 | **`supervisor-config.json`** — Master config: CRM API connection, Ollama settings, model registry (qwen3.5-32b, qwen3.5-14b, minimax2.5-8b), pricing table, alert config, host machine specs. | Prompt 49 | 2 hours |
| 36.3 | **Per-agent config files** — 6 JSON configs (enricher, researcher, matcher, scout, logger, chief-of-staff): model selection, temperature, cycle intervals, API permissions, tool definitions, resource limits. | Prompt 49 | 4 hours |
| 36.4 | **Shared Python utilities** — `api_client.py` (retry + audit), `ollama_client.py` (local LLM wrapper), `cost_tracker.py`, `telegram_notifier.py`, `memory_sync.py`. | Prompt 49 | 1 day |
| 36.5 | **Tool definitions** — Per-agent tool registries: web scraping (OpenCorporates, WhitePages), email verification (NeverBounce), CRM queries, sandbox submission, signal submission. | Prompt 49 | 4 hours |
| 36.6 | **Test harness** — Mock CRM API server, sample fixtures (LLC data, air reports, signals), assertion tests for each agent's core loop. | Prompt 49 | 1 day |

### Tier 37 — Agent Lifecycle Management (Keep Them Running)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 37.1 | **PM2 ecosystem config** — `ecosystem.config.js` with all 6 agents, staggered startup (10s intervals), memory limits, restart policies, log rotation. | Prompt 50 | 3 hours |
| 37.2 | **Per-agent cycle specs** — Enricher (15min, 5 items), Researcher (30min, 3 items), Matcher (20min, 3 items), Scout (60min, 1 scan), Logger (5min, 10 items), Chief of Staff (daily at 5 AM). | Prompt 50 | 2 hours |
| 37.3 | **Crash recovery** — Auto-restart with exponential backoff, max 10 restarts/hour, zombie process detection (5 consecutive crashed cycles). | Prompt 50 | 4 hours |
| 37.4 | **Watchdog daemon** — `watchdog.py` + `com.iecrm.watchdog.plist` LaunchDaemon. Monitors PM2, Ollama, disk space, temperature. Sends Telegram alerts on failure. | Prompt 50 | 1 day |
| 37.5 | **Graceful shutdown** — SIGTERM handler on each agent: finish current item, flush logs, update heartbeat to "stopped", exit cleanly. | Prompt 50 | 3 hours |
| 37.6 | **Agent pause/resume** — CLI and API control: `POST /api/ai/ops/agent/:name/pause` sets agent to idle mode without killing the process. | Prompt 50 | 2 hours |

### Tier 38 — Multi-Mac Coordination (Scale the Fleet)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 38.1 | **`agent_registry` table** — agent_name, host_machine, status, last_heartbeat, assigned_model, resource_usage. Prevents duplicate assignments. | Prompt 51 | 3 hours |
| 38.2 | **`agent_locks` table** — Distributed locking for entity-level work (prevents two agents enriching the same contact). Lease-based with 5-minute expiry. | Prompt 51 | 3 hours |
| 38.3 | **Agent memory system** — Per-agent memory directories: `cycle-log.jsonl`, `learned-patterns.md`, `error-journal.md`, `performance-stats.json`. Written by agents, read by Chief of Staff. | Prompt 51 | 4 hours |
| 38.4 | **Shared memory** — `shared/entity-cache.json`, `shared/active-bounties.json`, `shared/market-regime.json`, `shared/priority-board.json`. Cross-agent state. | Prompt 51 | 3 hours |
| 38.5 | **Instruction versioning** — `instructions/archive/{agent}/` directory with semver-named rollback files. Chief of Staff writes new versions, PM2 restarts pick them up. | Prompt 51 | 2 hours |
| 38.6 | **Fleet split strategy** — Mac Mini M4 Pro: Enricher + Matcher + Logger + Scout. Mac Studio M4 Ultra (future): Researcher + Chief of Staff + overflow. Based on RAM requirements. | Prompt 51 | 2 hours |

### Tier 39 — CRM Workflow Enhancements (Better Pages)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 39.1 | **Enhanced Action Items page** — Calendar view, per-person filtered views (Dave, Missy, David Jr, Houston), drag-and-drop status changes. | Prompt 52 | 1 day |
| 39.2 | **TPE Visualization component** — Property detail section showing TPE score breakdown: radar chart of 5 factors, trend spark line, "What Would Change This" panel. | Prompt 52 | 2 days |
| 39.3 | **Enhanced Comps page** — Comparison mode (side-by-side properties), map view integration, auto-link to property records. | Prompt 52 | 1 day |
| 39.4 | **Intelligence Feed page** — Unified feed of AI-generated signals, matches, alerts. Filter by agent, entity type, confidence level. | Prompt 52 | 1 day |
| 39.5 | **Data Bounty page** — Morning briefing view: today's top bounties, estimated value, lookup instructions. Complete button triggers TPE recalculation. | Prompt 52 | 1 day |

### Tier 40 — AI Ops Dashboard (See What They're Doing)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 40.1 | **`agent_status` table** — Real-time fleet health: status, last_heartbeat, last_cycle metrics, current_model, uptime, daily totals. | Prompt 53 | 2 hours |
| 40.2 | **`agent_cycle_log` table** — Per-cycle audit: items attempted/succeeded/failed, tokens used, estimated cost, error summary, metadata JSONB. | Prompt 53 | 3 hours |
| 40.3 | **`agent_cost_daily` table** — Daily cost aggregates per agent per model. Drives cost trend charts. | Prompt 53 | 2 hours |
| 40.4 | **`agent_activity_feed` table** — Unified timeline with 15 event types and 4 severity levels. | Prompt 53 | 3 hours |
| 40.5 | **`sandbox_queue_summary` VIEW** — Unified pending sandbox items across contacts, enrichments, signals, outreach with entity names. | Prompt 53 | 2 hours |
| 40.6 | **AI Ops React page** — Agent fleet panel, selected agent detail, cycle log table, sandbox queue, cost summary, activity timeline. Auto-refresh polling. | Prompt 53 | 2 days |
| 40.7 | **Agent control buttons** — Pause/Resume/Restart from UI. Admin-only via RBAC. | Prompt 53 | 3 hours |

### Tier 41 — Search, Bulk Ops & Documents (Find & Act Fast)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 41.1 | **Global search endpoint** — `GET /api/search?q=` with ILIKE across contacts, properties, companies, deals. Top 5 per type. | Prompt 54 | 3 hours |
| 41.2 | **CommandPalette search integration** — Extend existing ⌘K component with API search results, entity type icons, click-to-navigate. | Prompt 54 | 4 hours |
| 41.3 | **Phase 2 fuzzy search** — `pg_trgm` extension + GIN indexes for typo-tolerant matching. | Prompt 54 | 3 hours |
| 41.4 | **Bulk update endpoint** — `POST /api/bulk-update` with column validation, max 500 IDs, audit logging. | Prompt 54 | 3 hours |
| 41.5 | **Bulk tag endpoint** — `POST /api/bulk-tag` with array append + dedup. | Prompt 54 | 2 hours |
| 41.6 | **Bulk action bar UI** — Floating bar when rows selected: Update Field, Add Tags, Reassign, Delete. | Prompt 54 | 4 hours |
| 41.7 | **`documents` table** — File attachments for any entity: filename, mime_type, storage_path, category (16 types: costar_report, loi, lease, photo, etc.), SHA-256 dedup. | Prompt 54 | 3 hours |
| 41.8 | **Document upload/download endpoints** — Multipart upload (max 25MB), stream download, soft delete. | Prompt 54 | 4 hours |
| 41.9 | **DocumentSection component** — Drag-and-drop upload zone + file list in all detail views. Inline PDF/image preview. | Prompt 54 | 1 day |

### Tier 42 — Email Pipeline (Connect to the World)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 42.1 | **Postmark integration** — Server token, sender signatures, inbound address (crm@mudgeteamcre.com), webhook configuration. | Prompt 55 | 2 hours |
| 42.2 | **`email_messages` table** — Outbound + inbound: addressing, content, threading (In-Reply-To), CRM linking (contact, deal, campaign, interaction), status tracking, open/click counts. | Prompt 55 | 3 hours |
| 42.3 | **`email_events` table** — Webhook-driven tracking: sent, delivered, opened, clicked, bounced, spam_complaint. Raw payload stored. | Prompt 55 | 2 hours |
| 42.4 | **`email_templates` table** — Reusable templates with `{{variable}}` interpolation, category (cold_outreach, follow_up, bov, listing_pitch, etc.), usage tracking, open/click rates. | Prompt 55 | 3 hours |
| 42.5 | **`unmatched_emails` table** — Inbound emails with no contact match. Queue for manual matching or new contact creation. | Prompt 55 | 2 hours |
| 42.6 | **`email_suppressions` table** — Global do-not-email: hard bounces, spam complaints, unsubscribes, manual blocks. | Prompt 55 | 1 hour |
| 42.7 | **Outbound send flow** — Email composer → Postmark API → status tracking → webhook event processing. Auto-creates Interaction record. | Prompt 55 | 1 day |
| 42.8 | **Inbound processing** — Postmark webhook → match sender to contact → create Interaction → thread to conversation → notify if high-priority. | Prompt 55 | 1 day |
| 42.9 | **Campaign send flow** — Select campaign → select template → preview personalization → suppress bounced/unsubscribed → batch send via broadcast stream. | Prompt 55 | 1 day |
| 42.10 | **Email React components** — EmailComposer, EmailThread, EmailTrackingBadge, CampaignSendModal, UnmatchedEmailQueue. | Prompt 55 | 2 days |

### Tier 43 — Notification & Alerting (Stay Informed)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 43.1 | **`notification_events` table** — All emitted events: 9 categories, entity linking, source agent, multi-channel targeting, delivery tracking. | Prompt 56 | 3 hours |
| 43.2 | **`notification_inbox` table** — Per-user in-app notifications with read/dismissed state. | Prompt 56 | 2 hours |
| 43.3 | **`notification_preferences` table** — Per-user, per-category channel settings (Telegram, in-app, digest) with throttle intervals. | Prompt 56 | 2 hours |
| 43.4 | **`quiet_hours` table** — Per-user quiet hours (default 10 PM - 7 AM Pacific). Critical alerts bypass. | Prompt 56 | 1 hour |
| 43.5 | **`telegram_config` table** — Per-user Telegram bot chat_id with verification flow. | Prompt 56 | 2 hours |
| 43.6 | **Telegram bot** — @IECRMBot via BotFather. Formatted alerts: critical (red), hot match (green), email (blue), competitive (orange). | Prompt 56 | 4 hours |
| 43.7 | **In-app notification bell** — Header bell icon with unread badge, dropdown panel, mark-as-read. | Prompt 56 | 4 hours |
| 43.8 | **Throttle & dedup** — Sandbox batching (1/hour), heartbeat dedup (3 misses), email open dedup, bounce batching, same-entity 4-hour cooldown. | Prompt 56 | 3 hours |
| 43.9 | **Daily digest email** — 7 AM Pacific via Postmark: pipeline snapshot, agent summary, email activity, action items, data bounties. | Prompt 56 | 4 hours |
| 43.10 | **`notification_digests` table** — Batch tracking for daily/weekly digest sends. | Prompt 56 | 1 hour |

### Tier 44 — Multi-User RBAC & Auth (Who Can Do What)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 44.1 | **`users` table** — Email, name, password_hash (bcrypt 12 rounds), role (admin/agent/observer), avatar, last_login, active flag. | Prompt 57 | 2 hours |
| 44.2 | **`sessions` table** — JWT token_hash, refresh_token_hash, expiry, IP address, user agent. Supports revocation. | Prompt 57 | 2 hours |
| 44.3 | **`user_preferences` table** — Per-user JSONB preferences: notification settings, default views, column visibility, UI preferences. | Prompt 57 | 1 hour |
| 44.4 | **Authentication middleware** — JWT in httpOnly cookie (24h), refresh token (7d), CSRF via SameSite=Strict. AI agent auth via X-Agent-Key header. | Prompt 57 | 4 hours |
| 44.5 | **Authorization middleware** — Role-gating: `authorize('admin', 'agent')`. Observer limited to read + own action items. | Prompt 57 | 3 hours |
| 44.6 | **Login page + AuthContext** — React login form, AuthProvider context, PrivateRoute wrapper, auto-refresh on token expiry. | Prompt 57 | 1 day |
| 44.7 | **4-role permission matrix** — Admin (David), Agent (Missy), Observer (Houston), AI Agent (system accounts). 14 resource types × 4 roles. | Prompt 57 | 3 hours |

### Tier 45 — Audit Trail (What Changed & Who Did It)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 45.1 | **`audit_log` table** — user_id, action, entity_type, entity_id, old_values (JSONB), new_values (JSONB), ip_address, user_agent. Auto-populated via middleware. | Prompt 58 | 3 hours |
| 45.2 | **Express audit middleware** — Automatically logs all POST/PUT/DELETE requests with before/after snapshots. | Prompt 58 | 4 hours |
| 45.3 | **Audit log viewer** — Settings page section: filterable by user, entity type, action, date range. Diff view for changes. | Prompt 58 | 1 day |
| 45.4 | **Audit log retention** — 90-day hot storage, then archive to JSONL files. Monthly cleanup cron. | Prompt 58 | 2 hours |

### Tier 46 — CI/CD & Database Branching (Ship Safely)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 46.1 | **GitHub Actions workflow** — `deploy.yml`: lint → test → build → deploy to Railway (backend) + Vercel (frontend). | Prompt 59 | 4 hours |
| 46.2 | **Neon database branching** — Preview branches per PR with automatic schema migration testing. | Prompt 59 | 3 hours |
| 46.3 | **`schema_migrations` tracking table** — Version, applied_at, checksum. Prevents duplicate or missing migrations. | Prompt 59 | 2 hours |
| 46.4 | **Pre-deploy migration runner** — Railway pre-deploy hook runs pending migrations with transaction safety. | Prompt 59 | 3 hours |
| 46.5 | **Rollback strategy** — Each migration has a corresponding `down` script. `npm run migrate:rollback` for emergencies. | Prompt 59 | 3 hours |

### Tier 47 — Monitoring & Disaster Recovery (Survive Anything)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 47.1 | **`api_metrics` table** — Per-endpoint: response time histogram, error rate, request count. 15-minute aggregation. | Prompt 60 | 3 hours |
| 47.2 | **`slow_query_log` table** — Queries exceeding 500ms with execution plan and frequency. | Prompt 60 | 2 hours |
| 47.3 | **`frontend_errors` table** — Client-side JavaScript errors with stack trace, browser, user_id. | Prompt 60 | 2 hours |
| 47.4 | **Health check endpoints** — `/api/health` (lightweight), `/api/health/deep` (DB + Postmark + Ollama connectivity). | Prompt 60 | 2 hours |
| 47.5 | **Neon automated backups** — Point-in-time recovery (PITR) + nightly logical dump to local + R2. | Prompt 60 | 3 hours |
| 47.6 | **Recovery playbook** — Documented procedures: DB restore, Railway redeploy, Neon branch recovery, agent fleet restart. | Prompt 60 | 3 hours |
| 47.7 | **Performance alerting** — P95 latency >2s or error rate >5% triggers Telegram alert. | Prompt 60 | 2 hours |

---

## New Tables Summary (Round 5)

| Table | Tier | Source | Purpose |
|-------|------|--------|---------|
| `agent_registry` | 38 | Prompt 51 | Agent-to-machine assignment tracking |
| `agent_locks` | 38 | Prompt 51 | Distributed entity-level locking |
| `agent_status` | 40 | Prompt 53 | Real-time agent fleet health |
| `agent_cycle_log` | 40 | Prompt 53 | Per-cycle audit with cost tracking |
| `agent_cost_daily` | 40 | Prompt 53 | Daily cost aggregates per agent |
| `agent_activity_feed` | 40 | Prompt 53 | Unified agent activity timeline |
| `documents` | 41 | Prompt 54 | File attachments for CRM entities |
| `email_messages` | 42 | Prompt 55 | Outbound + inbound email with threading |
| `email_events` | 42 | Prompt 55 | Webhook-driven email tracking |
| `email_templates` | 42 | Prompt 55 | Reusable email templates |
| `unmatched_emails` | 42 | Prompt 55 | Inbound emails with no contact match |
| `email_suppressions` | 42 | Prompt 55 | Global do-not-email list |
| `notification_events` | 43 | Prompt 56 | All emitted notification events |
| `notification_inbox` | 43 | Prompt 56 | Per-user in-app notifications |
| `notification_preferences` | 43 | Prompt 56 | Per-user channel settings |
| `quiet_hours` | 43 | Prompt 56 | Per-user quiet hours config |
| `telegram_config` | 43 | Prompt 56 | Per-user Telegram bot setup |
| `notification_digests` | 43 | Prompt 56 | Digest email batch tracking |
| `users` | 44 | Prompt 57 | User accounts with RBAC |
| `sessions` | 44 | Prompt 57 | JWT session management |
| `user_preferences` | 44 | Prompt 57 | Per-user JSONB preferences |
| `audit_log` | 45 | Prompt 58 | Comprehensive change tracking |
| `schema_migrations` | 46 | Prompt 59 | Migration version tracking |
| `api_metrics` | 47 | Prompt 60 | Per-endpoint performance metrics |
| `slow_query_log` | 47 | Prompt 60 | Slow query detection |
| `frontend_errors` | 47 | Prompt 60 | Client-side error tracking |

**26 new tables in Round 5** (plus 1 VIEW: `sandbox_queue_summary`).

Combined with Rounds 1 (12), 2 (11), 3 (27), and 4 (39) = **115 total new tables across all five rounds.**

---

## The Complete 47-Tier System

```
ROUND 1: THE PLUMBING (Tiers 0-7) — "Data flows correctly"
  0: Schema fixes, auth, CORS, rate limiting
  1: Sandbox promotion, conflict resolution
  2: Pagination, filters, Intelligence Feed
  3: Email pipeline (Postmark)
  4: KPI tracking, self-improvement feedback
  5: ROI analytics, deal attribution
  6: AI testing harness
  7: Offline support, data sovereignty

ROUND 2: THE NERVOUS SYSTEM (Tiers 8-15) — "System gets smarter"
  8:  Agent self-awareness (feedback digests)
  9:  Cross-agent intelligence (shared context)
  10: Autonomous source discovery
  11: False negative detection
  12: Adaptive calibration (Bayesian + canary testing)
  13: Strategic intelligence (goals + competitive learning)
  14: System self-awareness (anomaly detection + David model)
  15: Autonomous innovation (Innovation Agent + real-time discovery)

ROUND 3: THE BRAIN (Tiers 16-23) — "System thinks strategically"
  16: Explainable intelligence (WHY, not just WHAT)
  17: Relationship graph (WHO connects to WHOM)
  18: Temporal intelligence (WHEN things happen)
  19: Predictive scoring (BEFORE signals appear)
  20: Market theory + knowledge base (compounding UNDERSTANDING)
  21: Simulation engine (WHAT-IF modeling)
  22: Multi-modal + cross-type intelligence (SEEING and CONNECTING)
  23: Strategy collaboration + data moat + antifragility (COMPOUNDING ADVANTAGE)

ROUND 4: THE FORESIGHT (Tiers 24-35) — "System predicts and knows what it doesn't know"
  24: Data inventory + gap intelligence (WHAT'S MISSING)
  25: Data bounty system (WHAT TO LOOK UP and WHY)
  26: Proxy signal framework (SUBSTITUTE for premium data)
  27: Multi-horizon prediction engine (30/90/180/365-DAY forecasts)
  28: Prediction explainability + actionability (WHY this prediction + WHAT TO DO)
  29: Data freshness + decay modeling (HOW STALE is your data)
  30: Feature importance + adaptive weights (WHAT ACTUALLY MATTERS)
  31: Prediction calibration + self-correction (ARE YOU ACTUALLY RIGHT)
  32: Portfolio predictions + pipeline intelligence (THE BIG PICTURE)
  33: Competitive prediction intelligence (WHAT WILL THEY DO)
  34: Market regime detection (DIFFERENT MARKETS, DIFFERENT STRATEGIES)
  35: Data value estimation + research ROI (IS IT WORTH LOOKING UP)

ROUND 5: THE BODY (Tiers 36-47) — "System runs, communicates, and survives"
  36: Agent runtime + configuration (TURN ON the machines)
  37: Agent lifecycle management (KEEP THEM RUNNING)
  38: Multi-Mac coordination (SCALE the fleet)
  39: CRM workflow enhancements (BETTER PAGES)
  40: AI Ops dashboard (SEE what they're doing)
  41: Search, bulk ops + documents (FIND and ACT fast)
  42: Email pipeline via Postmark (CONNECT to the world)
  43: Notification + alerting (STAY INFORMED)
  44: Multi-user RBAC + auth (WHO can do what)
  45: Audit trail (WHAT CHANGED and who did it)
  46: CI/CD + database branching (SHIP SAFELY)
  47: Monitoring + disaster recovery (SURVIVE ANYTHING)
```

---

## The Implementation Bridge Flywheel

```
Agent configs + PM2 ecosystem ready (Tier 36-37)
    ↓
Deploy to Mac Mini M4 Pro (arrives Mar 17-24)
    ↓
Agents start running: enriching, researching, matching (Tier 36)
    ↓
AI Ops Dashboard shows real-time fleet health + costs (Tier 40)
    ↓
Sandbox items queue up → David reviews in CRM (Tier 40)
    ↓
Approved data flows into live CRM tables
    ↓
Global search finds enriched data instantly (Tier 41)
    ↓
David composes email to hot match from CRM (Tier 42)
    ↓
Postmark sends, tracks opens/clicks
    ↓
Owner replies → Postmark inbound webhook → auto-creates Interaction
    ↓
Telegram alert: "📧 John Smith replied to your LOI email" (Tier 43)
    ↓
David opens CRM, sees threaded conversation + contact context
    ↓
Action item created: "Follow up with offer by Friday"
    ↓
Daily digest at 7 AM: pipeline health, agent activity, data bounties (Tier 43)
    ↓
Audit trail logs everything for compliance (Tier 45)
    ↓
CI/CD deploys safely with Neon branch testing (Tier 46)
    ↓
If anything breaks: monitoring alerts + disaster recovery (Tier 47)
    ↓
COMPOUND LOOP: Running agents → enriched data → better matches →
  email outreach → tracked responses → pipeline intelligence →
  data bounties → better predictions → more deals
```

---

## Recommended Round 5 Build Sequence

| Phase | Tiers | Timing | Rationale |
|-------|-------|--------|-----------|
| **Phase I** | Tier 44 (RBAC) | Week 1 | Everything depends on users table — auth must come first |
| **Phase II** | Tier 36-37 (Agent Runtime) | Week 2-3 | Get agents running on Mac Mini when it arrives |
| **Phase III** | Tier 40 (AI Ops Dashboard) | Week 3-4 | Can't manage agents you can't see |
| **Phase IV** | Tier 41 (Search + Bulk Ops) | Week 4 | Quick wins that make the CRM immediately more useful |
| **Phase V** | Tier 42 (Email Pipeline) | Week 5-6 | Postmark integration — outbound first, then inbound |
| **Phase VI** | Tier 43 (Notifications) | Week 6-7 | Telegram bot + in-app bell + daily digest |
| **Phase VII** | Tier 38-39 (Multi-Mac + CRM Pages) | Week 7-8 | Scale fleet, enhance pages with TPE visualization |
| **Phase VIII** | Tier 45-47 (Audit + CI/CD + DR) | Week 9-10 | Hardening — audit trail, safe deploys, resilience |

**Total estimated effort: 8-10 weeks** (after Tier 0 deployment blockers from Round 1 are resolved).

---

## Cost Estimates (Monthly Operational)

| Service | Cost | Notes |
|---------|------|-------|
| Postmark | ~$10/mo | Low-volume CRE email (~1K/mo) |
| Telegram Bot | $0 | Free API |
| Cloudflare R2 (documents) | ~$1-5/mo | $0.015/GB, no egress |
| Ollama (Mac Mini) | $0 | Local inference |
| Claude API (Chief of Staff) | ~$5-15/mo | 1 daily call at Sonnet tier |
| Neon (existing) | $0-19/mo | Within existing plan |
| Railway (existing) | $5/mo | Within existing plan |
| **Total additional** | **~$16-49/mo** | |

---

## Detailed Design Documents

- `docs/superpowers/plans/2026-03-13-prompts-49-52-implementation-bridge.md` — Agent runtime, lifecycle, coordination, CRM pages
- `docs/superpowers/specs/2026-03-13-prompts-53-56-ops-email-notifications.md` — AI Ops dashboard, search/bulk ops, email pipeline, notifications
- `docs/superpowers/specs/2026-03-13-prompts-57-60-rbac-devops.md` — RBAC, audit trail, CI/CD, monitoring/DR

---

*Round 1 makes the system work. Round 2 makes it think. Round 3 makes it understand. Round 4 makes it predict. Round 5 makes it real — running, observable, communicating, secure, and resilient.*

*Created: March 13, 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
