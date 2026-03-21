# IE CRM + AI System — Master Evolution Roadmap

**Generated from 12-Prompt Deep Audit — March 13, 2026**
**Mudge Team CRE — Built by David Mudge Jr**

---

## Executive Summary

A full audit of the IE CRM and AI Master System was conducted across 12 strategic dimensions: pipeline intelligence, agent coordination, sandbox promotion, ROI tracking, email infrastructure, frontend UX, authentication, schema integrity, self-improvement feedback, AI testing, offline support, and competitive intelligence.

**What's strong:** SQL injection prevention, AI agent architecture, import/matching engine, TPE scoring design, security hardening documentation.

**What's blocking progress:** No sandbox promotion path (AI agents produce work that sits in tables with no review UI), no authentication, broken FK references in migration 007, and no email send pipeline.

This roadmap is the **synthesized, prioritized build sequence** across all 12 dimensions.

---

## Priority Tiers

### Tier 0 — Deployment Blockers (Do Before Anything Else)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 0.1 | **Fix broken FK references in migration 007** — sandbox tables reference `contacts(id)` but the column is `contacts(contact_id)` UUID. Migration will crash on fresh deploy. | Prompt 8 | 1 hour |
| 0.2 | **Normalize timestamp columns** — Rename `last_modified` → `updated_at` (properties), `modified` → `updated_at` (contacts/companies/deals/campaigns). Convert all to TIMESTAMPTZ. Update `database.js` ALLOWED_COLS and UPDATE queries. | Prompt 8 | 2 hours |
| 0.3 | **Add soft delete** — `deleted_at TIMESTAMPTZ` column on all 7 entity tables. Partial indexes for active records. Change bulk-delete endpoint from DELETE to UPDATE. Add `active_*` views for backward compatibility. | Prompt 8 | 2 hours |
| 0.4 | **Add authentication** — JWT login (single-user: bcrypt hash in env vars), `authenticate` middleware on all `/api/` routes, API key validation against `ai_api_keys` table for agents, webhook secret for Postmark. | Prompt 7 | 4 hours |
| 0.5 | **Lock down CORS** — Restrict to `ie-crm.vercel.app`, `localhost:5173`, `localhost:3001`, `app://.` (Electron). | Prompt 7 | 15 min |
| 0.6 | **Add rate limiting** — `express-rate-limit`: 120 req/min general, 5 req/15min on login, per-agent limits from `ai_api_keys.rate_limit_per_minute`. | Prompt 7 | 30 min |
| 0.7 | **Lock down `/api/db/query`** — Admin-only, classify SQL (read vs write), require `allowWrite` flag for mutations. | Prompt 7 | 30 min |

**New dependencies:** `npm install jsonwebtoken bcryptjs express-rate-limit`

---

### Tier 1 — Core AI Operations (Unblocks Everything Else)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 1.1 | **Build `/api/ai/` endpoints** — Auth middleware (X-Agent-Key), sandbox write (contact/enrichment/signal/outreach), approval queue (pending/approve/reject), agent heartbeat/log. | Prompts 3, 7 | 1 day |
| 1.2 | **Build sandbox promotion logic** — Contact dedup + insert, enrichment stale-check + update, signal → interaction + action_item, outreach → email queue. All with undo_log. | Prompt 3 | 1 day |
| 1.3 | **Build AI Ops page** — Agent status cards (from heartbeats), approval queue (tabbed: contacts/enrichments/signals/outreach), batch approve/reject, log viewer. | Prompt 3 | 2 days |
| 1.4 | **Add conflict detection on enrichment ingestion** — Check for duplicate pending enrichments on same contact+field. Higher confidence supersedes; tied confidence → escalation. | Prompt 2 | 4 hours |
| 1.5 | **Add version stamps to contacts/properties/companies** — `version INTEGER DEFAULT 1`, increment on every UPDATE. Enricher captures version at read time; promotion checks for staleness. | Prompt 2 | 2 hours |
| 1.6 | **Human data supremacy rule** — If `contacts.updated_at > sandbox_enrichments.created_at` AND the field value changed, block promotion with `conflict_stale` status. | Prompt 2 | 2 hours |

---

### Tier 2 — Pipeline & Intelligence (Makes AI System Valuable)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 2.1 | **Server-side pagination** — Add COUNT query to all entity getters. Return `{ rows, total, limit, offset }`. Build `PaginationBar.jsx` component (page nav, page size selector). | Prompt 6 | 1.5 days |
| 2.2 | **Advanced filter builder** — Generalized `filters[]` array support in all entity getters. `FilterBuilder.jsx` with typed operators per field. Saved filter presets in localStorage (later DB). | Prompt 6 | 3 days |
| 2.3 | **Intelligence Feed page** — New `/intelligence` route. Signal junction tables (`signal_contacts`, `signal_properties`, `signal_companies`). Live feed of approved signals. Signal cards on entity detail panels. Dashboard widget. Sidebar badge with unread count. | Prompt 12 | 2 days |
| 2.4 | **Signal convergence detection** — Query entities with 3+ signals in 30 days. Surface convergence alerts in Intelligence Feed. Escalate to Chief of Staff for morning briefing. | Prompt 12 | 4 hours |
| 2.5 | **Automated outreach trigger** — When signal is approved with high relevance + CRM match + confidence ≥80, auto-create priority board item for Matcher. | Prompt 12 | 2 hours |
| 2.6 | **CSV export** — `GET /api/export/:table` endpoint with filter support. Frontend export button (current view or all matching). | Prompt 6 | 1 day |

---

### Tier 3 — Email & Outreach Pipeline (Revenue-Generating)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 3.1 | **Install Postmark SDK** — `npm install postmark`. Add env vars: `POSTMARK_SERVER_TOKEN`, `WEBHOOK_SECRET`. | Prompt 5 | 15 min |
| 3.2 | **Email send service** — `POST /api/email/send` (single), `POST /api/email/send-batch` (cron-driven). do_not_email check, retry logic (3 attempts with backoff). | Prompt 5 | 4 hours |
| 3.3 | **Postmark webhook handler** — `POST /api/webhooks/postmark` for delivery, open, click, bounce, spam complaint. Update `outbound_email_queue` engagement columns. Hard bounce → set `contacts.do_not_email`. | Prompt 5 | 4 hours |
| 3.4 | **Auto action_item on engagement** — On open: create "Call [name] — opened your email" action_item (due +24h, high priority). On reply: create "Reply received — respond within 2h" (due +2h). | Prompt 5 | 2 hours |
| 3.5 | **Inbound reply detection** — Postmark inbound webhook. Match reply to original via In-Reply-To header. Create interaction (type: Inbound Email). Link to contact. | Prompt 5 | 3 hours |
| 3.6 | **Telegram notifications** — `sendTelegramAlert()` function (Bot API). Trigger on reply received, hard bounce, daily email stats digest. | Prompt 5 | 2 hours |

---

### Tier 4 — Feedback & Self-Improvement (Makes AI System Smart)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 4.1 | **`agent_daily_kpis` table** — Per-agent, per-day, per-instruction-version metrics. Volume (items processed/submitted/errors), quality (approval rate, avg confidence, false positives), outreach (sent/opened/replied/bounced), cost (total, per-approved-item). | Prompt 9 | 2 hours |
| 4.2 | **`enrichment_ground_truth` table** — Tracks whether promoted enrichments turned out correct. Fed by email bounces, phone disconnects, manual review, NeverBounce rechecks. | Prompt 9 | 1 hour |
| 4.3 | **Nightly KPI aggregation job** — Logger (or cron at 3:30 AM) queries sandbox tables and populates `agent_daily_kpis`. | Prompt 9 | 3 hours |
| 4.4 | **Chief of Staff decision triggers** — Hardcoded thresholds: approval_rate drop >10pts after instruction change → auto-rollback. false_positive_count >5/day → tighten confidence. reply_rate <2% over 7 days → rewrite Matcher tone. | Prompt 9 | 2 hours |
| 4.5 | **Pre-instruction-change gate** — Before Chief of Staff applies a rewrite: run Level 1 tests with new instruction, compare against baseline, abort if regressions detected. | Prompts 9, 10 | 4 hours |

---

### Tier 5 — Pipeline Analytics & ROI (Proves the System's Value)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 5.1 | **`deal_stage_history` table** — Logs every deal status change with timestamp, changed_by, notes. Enables pipeline velocity reporting. | Prompt 1 | 1 hour |
| 5.2 | **`commission_payments` table** — Tracks actual payments: amount, paid_date, expected_date, recipient, split_pct, status (pending/received/overdue). | Prompt 1 | 1 hour |
| 5.3 | **`tpe_score_snapshots` table** — Nightly snapshot of all TPE scores. Enables score history and "what changed" analysis. | Prompt 1 | 1 hour |
| 5.4 | **`attribution_chain` table** — Tracks signal → enrichment → outreach → reply → meeting → deal lineage. Each step tagged with source agent and reference to sandbox record. | Prompt 1 | 2 hours |
| 5.5 | **`ai_roi_metrics` SQL VIEW** — Joins monthly costs, contacts promoted, outreach sent, replies received, AI-originated deals, commission. Computes: cost/enriched contact, cost/outreach, cost/warm lead, cost/AI deal, overall ROI. | Prompt 4 | 3 hours |
| 5.6 | **ROI dashboard panel** — Add to AI Ops page. Monthly cost breakdown by service, unit economics, trend charts, export to CSV. | Prompt 4 | 4 hours |
| 5.7 | **Follow-up decay alerts** — Nightly: query contacts where `follow_up < NOW()` with no recent interaction. Auto-create action items. | Prompt 1 | 2 hours |
| 5.8 | **Dead deal re-engagement** — Nightly: deals with status 'Dead Lead'/'Deal fell through' older than 6 months → create action items for linked contacts. | Prompt 1 | 2 hours |

---

### Tier 6 — Testing & Resilience (Needed Before Mac Mini Agents Go Live)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 6.1 | **Test harness structure** — `/AI-Agents/test-harness/` with fixtures, mock server, assertions, results. | Prompt 10 | 2 hours |
| 6.2 | **Mock server** — Express on port 9999 serving fixture responses for Open Corporates, White Pages, BeenVerified, NeverBounce. | Prompt 10 | 3 hours |
| 6.3 | **Enricher test fixtures** — 10 test LLCs with known correct answers. Expected sandbox_contacts and sandbox_enrichments outputs. | Prompt 10 | 2 hours |
| 6.4 | **Assertion framework** — Per-agent assertion functions checking: record found, confidence within tolerance, sources used, field values correct. | Prompt 10 | 3 hours |
| 6.5 | **Regression detector** — Compare current test results against previous run. Flag any test that went from pass → fail. Tag results with instruction version. | Prompt 10 | 2 hours |
| 6.6 | **Priority interrupt mechanism** — Agents check priority board every 5 items (not just at cycle start). High-urgency items interrupt the current batch. | Prompt 2 | 2 hours |
| 6.7 | **Priority flood protection** — Max 10 priorities per source_agent per hour to same target. Excess bundled into single priority. Dedup: same target+type+payload within 24h → merge. | Prompt 2 | 2 hours |

---

### Tier 7 — Data Sovereignty & Offline (Quality of Life)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 7.1 | **`user_preferences` table** — Move column visibility, column widths, column labels from localStorage to DB. One-time migration reads existing localStorage on first load. | Prompt 11 | 1 day |
| 7.2 | **`custom_field_definitions` + `custom_field_values` tables** — Move custom fields from localStorage to DB. Queryable, cross-device, survives browser reset. | Prompt 11 | 2 days |
| 7.3 | **Offline edit queue** — Service Worker-based queue in localStorage. Last-Write-Wins with `updated_at` conflict check on sync. | Prompt 11 | 1 day |
| 7.4 | **Read-only offline cache** — Cache 100 most recent records per entity type. Fallback to cache when `navigator.onLine` is false. Show "Offline mode" banner. | Prompt 11 | 1 day |

---

## Cross-Prompt Dependency Graph

```
Tier 0 (Schema + Auth)
  │
  ├── Tier 1 (Sandbox Promotion + Conflict Resolution)
  │     │
  │     ├── Tier 2 (Pagination + Filters + Intelligence Feed)
  │     │     │
  │     │     └── Tier 3 (Email Pipeline)
  │     │           │
  │     │           └── Tier 5 (Pipeline Analytics + ROI)
  │     │
  │     └── Tier 4 (KPIs + Self-Improvement Feedback)
  │           │
  │           └── Tier 6 (Testing + Agent Resilience)
  │
  └── Tier 7 (Offline + Data Sovereignty) ← independent, can start anytime
```

---

## Estimated Timeline

| Week | Focus | Key Deliverables |
|------|-------|-----------------|
| 1 | Tier 0 | Migration 008 (schema fix), auth layer, CORS, rate limiting |
| 2 | Tier 1 | `/api/ai/` endpoints, promotion logic, AI Ops page |
| 3 | Tier 2 | Server-side pagination, filter builder, Intelligence Feed |
| 4 | Tier 3 | Postmark integration, email send, webhooks, Telegram alerts |
| 5 | Tier 4 | KPI tables, nightly aggregation, decision triggers |
| 6 | Tier 5 | Deal stage history, attribution chain, ROI dashboard |
| 7 | Tier 6 | Test harness, mock server, regression detection |
| 8 | Tier 7 | Preferences/custom fields to DB, offline queue |

---

## New Tables Summary (Across All Tiers)

| Table | Tier | Purpose |
|-------|------|---------|
| `user_preferences` | 7 | Column visibility/widths/labels (replaces localStorage) |
| `custom_field_definitions` | 7 | Custom field schemas (replaces localStorage) |
| `custom_field_values` | 7 | Custom field data (replaces localStorage) |
| `deal_stage_history` | 5 | Pipeline velocity tracking |
| `commission_payments` | 5 | Actual commission received tracking |
| `tpe_score_snapshots` | 5 | Nightly TPE score history |
| `attribution_chain` | 5 | Signal → deal lineage for ROI |
| `agent_daily_kpis` | 4 | Structured per-agent daily metrics |
| `enrichment_ground_truth` | 4 | Was the enrichment actually correct? |
| `signal_contacts` | 2 | Junction: signals ↔ contacts |
| `signal_properties` | 2 | Junction: signals ↔ properties |
| `signal_companies` | 2 | Junction: signals ↔ companies |

---

## New Columns Summary (Across All Tiers)

| Table | Column | Tier | Purpose |
|-------|--------|------|---------|
| contacts, properties, companies | `version INTEGER` | 1 | Optimistic concurrency control |
| contacts, properties, companies | `updated_at TIMESTAMPTZ` | 0 | Replaces modified/last_modified |
| All 7 entity tables | `deleted_at TIMESTAMPTZ` | 0 | Soft delete |
| sandbox_enrichments | `target_version INTEGER` | 1 | Staleness check on promotion |
| ai_usage_tracking | `task_type TEXT` | 4 | enrichment/research/matching/review/outreach |
| ai_usage_tracking | `sandbox_contact_id INTEGER` | 4 | Link cost to specific sandbox record |
| agent_priority_board | `batch_id TEXT` | 6 | Group related priorities |
| outbound_email_queue | `delivered_at TIMESTAMPTZ` | 3 | Email delivery tracking |
| outbound_email_queue | `reply_interaction_id UUID` | 3 | Link to reply interaction |

---

## New Endpoints Summary

| Endpoint | Tier | Method | Purpose |
|----------|------|--------|---------|
| `/api/auth/login` | 0 | POST | JWT authentication |
| `/api/ai/sandbox/contact` | 1 | POST | Agent submits researched contact |
| `/api/ai/sandbox/enrichment` | 1 | POST | Agent submits field-level enrichment |
| `/api/ai/sandbox/signal` | 1 | POST | Agent submits market signal |
| `/api/ai/sandbox/outreach` | 1 | POST | Agent submits draft outreach |
| `/api/ai/agent/heartbeat` | 1 | POST | Agent reports health |
| `/api/ai/agent/log` | 1 | POST | Agent writes structured log |
| `/api/ai/queue/pending` | 1 | GET | Unified approval queue |
| `/api/ai/queue/approve` | 1 | POST | Batch approve sandbox items |
| `/api/ai/queue/reject` | 1 | POST | Batch reject sandbox items |
| `/api/export/:table` | 2 | GET | CSV export with filters |
| `/api/signals/unread-count` | 2 | GET | Badge count for Intelligence Feed |
| `/api/email/send` | 3 | POST | Send single queued email |
| `/api/email/send-batch` | 3 | POST | Process all queued emails |
| `/api/webhooks/postmark` | 3 | POST | Receive engagement events |
| `/api/webhooks/postmark/inbound` | 3 | POST | Receive reply emails |
| `/api/deals/:id/stage` | 5 | POST | Record stage transition |
| `/api/ai/roi/summary` | 5 | GET | Monthly ROI metrics |
| `/api/ai/roi/by-agent` | 5 | GET | Cost/output per agent |
| `/api/bulk-restore` | 0 | POST | Restore soft-deleted records |

---

## New UI Components Summary

| Component | Tier | Location |
|-----------|------|----------|
| `PaginationBar.jsx` | 2 | shared/ — Page nav, size selector, total count |
| `FilterBuilder.jsx` | 2 | shared/ — Pill-based filter builder with typed operators |
| `AiOps.jsx` | 1 | pages/ — Agent status + approval queue + log viewer |
| `Intelligence.jsx` | 2 | pages/ — Signal feed + convergence alerts |
| `SignalCard.jsx` | 2 | shared/ — Compact signal display with type icon |
| `DashboardIntelWidget.jsx` | 2 | shared/ — Top 5 signals widget |
| `RoiDashboard.jsx` | 5 | shared/ — Cost breakdown + unit economics |
| Login screen | 0 | pages/ — JWT auth form |

---

*This roadmap synthesizes findings from all 12 strategic audit prompts. Each tier builds on the previous. Implementation should proceed tier-by-tier to maintain stability.*

---

## Round 2: Meta-Learning & Autonomous Innovation (Tiers 8-15)

A second 12-prompt audit focused on self-improvement, autonomous learning, and internet-sourced innovation produced 8 additional tiers. These make the system **self-aware and self-improving** rather than just operational.

**Full Round 2 roadmap:** `docs/plans/2026-03-13-evolution-roadmap-round2.md`

| Tier | Capability | Key Innovation |
|------|-----------|---------------|
| 8 | Agent Self-Awareness | Agents read their own scorecards before each cycle |
| 9 | Cross-Agent Intelligence | Shared per-entity knowledge graph prevents duplicate work |
| 10 | Autonomous Source Discovery | System finds and evaluates its own data sources |
| 11 | False Negative Detection | System detects what it's missing, not just what it gets wrong |
| 12 | Adaptive Calibration | Bayesian confidence tuning + canary instruction testing |
| 13 | Strategic Intelligence | Quarterly goal cascading + competitive learning loop |
| 14 | System Self-Awareness | Emergent behavior detection + David preference model |
| 15 | Autonomous Innovation | Innovation Agent + real-time discovery pipeline |

**11 new tables, 3 detailed design documents.** Build sequence starts at Week 9 after Round 1 Tiers 0-7 are stable.

**Detailed specs:**
- `docs/superpowers/plans/2026-03-13-prompts-13-16-agent-learning-loops.md`
- `docs/superpowers/specs/2026-03-13-prompts-17-20-deep-analysis.md`
- `docs/superpowers/specs/2026-03-13-advanced-intelligence-design.md`

---

## Round 3: Strategic Cognition & Compounding Intelligence (Tiers 16-23)

A third 12-prompt audit went to the deepest layer — how the system **thinks about the market**, predicts transactions, explains its reasoning, and builds an unreplicable competitive moat.

**Full Round 3 roadmap:** `docs/plans/2026-03-13-evolution-roadmap-round3.md`

| Tier | Capability | Key Innovation |
|------|-----------|---------------|
| 16 | Explainable Intelligence | Every recommendation includes "because" with specific data points |
| 17 | Relationship Graph | Network paths, hub detection, warm intro routing, decay alerts |
| 18 | Temporal Intelligence | Cycle detection, transaction windows, timing multipliers on TPE |
| 19 | Predictive Deal Scoring | Probability of transaction in 3/6/12 months BEFORE signals appear |
| 20 | Market Theory + Knowledge Base | Testable beliefs, compounding insights, agent-queryable lessons |
| 21 | Simulation Engine | Monte Carlo what-if analysis, client-ready scenario comparisons |
| 22 | Multi-Modal + Cross-Type | PDF OM extraction, call transcription, property type arbitrage |
| 23 | Strategy + Data Moat + Antifragility | Collaborative sessions, moat tracking, failure-driven improvement |

**27 new tables, 6 detailed design documents.** Build sequence starts at Week 21 after Rounds 1-2 are stable.

**Detailed specs:**
- `docs/superpowers/plans/2026-03-13-prompts-25-28-strategic-cognition.md`
- `docs/superpowers/specs/2026-03-13-prompts-29-32-strategic-cognition.md`
- `docs/superpowers/specs/2026-03-13-prompts-33-36-deep-strategy-layer.md`

---

## Round 4: Predictive Intelligence & Data Gap Awareness (Tiers 24-35)

A fourth 12-prompt audit focused on **predictive capability** — making the system predict transactions, know what data it's missing, tell David exactly what to look up and why, and calibrate its own accuracy.

**Full Round 4 roadmap:** `docs/plans/2026-03-13-evolution-roadmap-round4.md`

| Tier | Capability | Key Innovation |
|------|-----------|---------------|
| 24 | Data Inventory & Gap Intelligence | Field-by-field fill rates, 15 prioritized gaps, Data Health Dashboard |
| 25 | Data Bounty System | "Look up these 8 lease expirations — est. value: $85K" |
| 26 | Proxy Signal Framework | 45+ free proxies for CoStar/ZoomInfo data. Composite scoring |
| 27 | Multi-Horizon Predictions | 30/90/180/365-day forecasts with momentum detection |
| 28 | Prediction Explainability | "72% because lease expires Aug 2026." + "Call CFO before June" |
| 29 | Data Freshness & Decay | Exponential decay per field type. Stale data down-weighted |
| 30 | Feature Importance | Adaptive weights (sale: 10 features, lease: 10 features) |
| 31 | Prediction Calibration | Brier scores, tournaments (5 competing models), drift detection |
| 32 | Portfolio Predictions | Monte Carlo: "$1.2-1.8M commission at 60% confidence" |
| 33 | Competitive Prediction | Predict listing expirations, focus shifts, client departures |
| 34 | Market Regime Detection | 5 regimes × 8 indicators. Regime-adaptive predictions |
| 35 | Data Value Estimation | ROI per hour of research. "Lease data = 4x ROI of phone verification" |

**39 new tables, 3 detailed design documents.** Build sequence starts at Week 41 after Rounds 1-3 are stable.

**Detailed specs:**
- `docs/superpowers/plans/2026-03-13-prompts-37-40-predictive-intelligence.md`
- `docs/superpowers/specs/2026-03-13-prompts-41-44-prediction-actionability.md`
- `docs/superpowers/specs/2026-03-13-prompts-45-48-portfolio-predictions.md`

---

## Complete System: 48 Prompts, 35 Tiers, 89 New Tables

```
Round 1 (Plumbing):      Tiers 0-7   | 12 tables  | "Data flows correctly"
Round 2 (Nervous System): Tiers 8-15  | 11 tables  | "System gets smarter"
Round 3 (Brain):          Tiers 16-23 | 27 tables  | "System thinks strategically"
Round 4 (Foresight):      Tiers 24-35 | 39 tables  | "System predicts and knows what it doesn't know"
```

---

*Created: March 13, 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
