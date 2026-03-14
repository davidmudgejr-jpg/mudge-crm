# AI Master System — Build Roadmap
**Tiered AI Fleet for IE CRM**
Mudge Team CRE — Built by David Mudge Jr
Last updated: March 2026

---

## Overview

This is the build plan for the AI Master System — a tiered, hybrid AI organization that runs 24/7 to automate research, data enrichment, market intelligence, and outreach for IE CRM. Local open-source models do the heavy lifting, cloud models validate the work, and Claude oversees the whole operation.

**Full architecture:** `ai-system/ARCHITECTURE.md`
**Original brainstorm:** `ai-system/BRAINSTORM.md`
**IE CRM integration:** Code changes live in `ie-crm/` — sandbox tables, API endpoints, and Agent Dashboard are part of the CRM codebase.

---

## Phase 0 — Infrastructure in IE CRM (Before Mac Mini Arrives)
*Goal: Build the data layer and UI so agents have somewhere to write and you have somewhere to watch*

### 0A — Sandbox Database Tables
- [ ] Migration `007_ai_sandbox.sql` — create all sandbox tables in Neon Postgres
  - `sandbox_contacts` — researched contacts pending review
  - `sandbox_enrichments` — enrichment data for existing contacts
  - `sandbox_signals` — market intelligence hits
  - `sandbox_outreach` — draft outreach emails
  - `agent_heartbeats` — agent status/health reporting
  - `agent_logs` — structured log entries from all agents
  - `sandbox_queue` — unified approval queue with status workflow
- [ ] All sandbox tables include: `agent_name`, `confidence_score`, `status` (pending/approved/rejected/promoted), `reviewed_by`, `reviewed_at`, `promoted_at`
- [ ] Indexes on status, agent_name, confidence_score, created_at
- [ ] Foreign keys to production tables where applicable (e.g., sandbox_enrichments.contact_id references contacts.id)

### 0B — AI API Endpoints
*Scoped API routes for agent access — separate from the main CRM API*

**Read-only (Tier 3 — local models):**
- [ ] `GET /api/ai/contacts` — search by name, company, submarket, type
- [ ] `GET /api/ai/properties` — search by size, type, submarket, price range, city
- [ ] `GET /api/ai/companies` — lookup by name, industry, city
- [ ] `GET /api/ai/comps` — recent lease/sale comps by geography and size

**Sandbox write (Tier 3):**
- [ ] `POST /api/ai/sandbox/contact` — submit researched contact
- [ ] `POST /api/ai/sandbox/enrichment` — submit enrichment for existing contact
- [ ] `POST /api/ai/sandbox/signal` — submit market intelligence signal
- [ ] `POST /api/ai/sandbox/outreach` — submit draft outreach email

**Operations (all tiers):**
- [ ] `POST /api/ai/agent/heartbeat` — agent reports status, current task, queue depth
- [ ] `POST /api/ai/agent/log` — agent writes structured log entry
- [ ] `GET /api/ai/queue/pending` — items awaiting review
- [ ] `POST /api/ai/queue/approve/:id` — approve + promote to production tables
- [ ] `POST /api/ai/queue/reject/:id` — reject with feedback note

**Tier 1 only (Claude — trusted write):**
- [ ] `PUT /api/ai/contacts/:id` — direct CRM write
- [ ] `POST /api/ai/agent/instructions` — push updated agent.md files to Mac Mini (future)

**Auth:**
- [ ] API key-based auth (`X-Agent-Key` header)
- [ ] Key scoping: each agent gets its own key with tier-appropriate permissions
- [ ] Key management in Settings page
- [ ] Rate limiting per key (prevent runaway agents)

### 0C — Agent Dashboard (IE CRM UI)
*New page in IE CRM sidebar — "AI Ops" or "Agent Hub"*

- [ ] Agent Status Cards — one card per agent showing: name, tier, status (running/idle/error), current task, items processed today, last heartbeat
- [ ] Tier Hierarchy View — visual showing Claude > ChatGPT/Gemini > Local Models
- [ ] Approval Queue — list of pending sandbox items with approve/reject buttons
  - Shows: item type, agent source, confidence score, timestamp, preview of data
  - Approve promotes to production table
  - Reject sends feedback (stored for agent learning)
- [ ] Log Viewer — filterable stream of agent activity logs
  - Filter by agent, date, log level
  - Expandable detail on each entry
- [ ] System Health — Mac Mini connection status, error rates, items processed per day
- [ ] Nav placement: between Campaigns and Import in sidebar

### 0D — Sandbox-to-Production Promotion Logic
- [ ] When sandbox_contact approved: INSERT into contacts table, mark sandbox row as promoted
- [ ] When sandbox_enrichment approved: UPDATE matching contact row, mark as promoted
- [ ] When sandbox_signal approved: create interaction record and/or action item
- [ ] When sandbox_outreach approved: move to outbound email queue (future email integration)
- [ ] All promotions logged in undo_log for reversibility
- [ ] Batch approve capability (select multiple, approve all)

---

## Phase 1 — First Agents on Mac Mini (Week 1-2 After Arrival)
*Goal: Prove the system works end-to-end with one workflow*

### 1A — Mac Mini Setup
- [ ] Install Ollama (local model runner)
- [ ] Pull Qwen 3.5 (20GB variant) via Ollama
- [ ] Pull MiniMax 2.5 via Ollama
- [ ] Install OpenClaw
- [ ] Create /AI-Agents/ folder structure on Mac Mini
- [ ] Configure network access to Neon Postgres (whitelist Mac Mini IP or use connection string)
- [ ] Test API connectivity: Mac Mini can hit IE CRM backend endpoints

### 1B — Enricher Agent (First Agent)
- [ ] Deploy `agent-templates/enricher.md` as the Enricher's instruction file
- [ ] Configure OpenClaw instance with Qwen 3.5
- [ ] Test end-to-end: pick one LLC from IE CRM → Open Corporates → White Pages → BeenVerified → NeverBounce → sandbox_contacts
- [ ] Verify heartbeat shows up in Agent Dashboard
- [ ] Verify sandbox entry appears in Approval Queue
- [ ] Approve one entry, verify it lands in contacts table
- [ ] Run for 24 hours, review logs

### 1C — Manual Tier 2 (You Are the Ralph Loop)
- [ ] For the first 1-2 weeks, David manually reviews sandbox entries
- [ ] Document what you're checking — this becomes the Tier 2 instruction set later
- [ ] Note false positives, low-confidence entries, patterns to watch for
- [ ] Refine Enricher agent.md based on what you see

---

## Phase 2 — Second Agent + Automated QA (Week 3-4)
*Goal: Two agents running, Tier 2 automated*

### 2A — Researcher Agent
- [ ] Deploy `agent-templates/researcher.md` with MiniMax 2.5
- [ ] Configure internet access, X monitoring, news scraping
- [ ] Test: find one growth signal for a company already in IE CRM
- [ ] Verify signals land in sandbox_signals with confidence scores

### 2B — Connect Tier 2 (The Ralph Loop)
- [ ] Connect ChatGPT via OAuth ($250/mo flat)
- [ ] Write Tier 2 instruction set based on your manual review notes from Phase 1
- [ ] Configure 10-minute check cycle: ChatGPT reads sandbox, validates, flags issues
- [ ] Test: ChatGPT catches a low-confidence entry and rejects it
- [ ] Optional: add Gemini as second Tier 2 reviewer

### 2C — Logger Agent
- [ ] Deploy Logger agent (either model)
- [ ] Configure daily log generation: what each agent did, counts, errors, patterns
- [ ] Logs write to both local .md files AND agent_logs table in IE CRM
- [ ] Verify logs appear in Agent Dashboard log viewer

### 2D — Scout Agent (AI & Tech Intelligence)
- [ ] Deploy `agent-templates/scout.md` with MiniMax 2.5
- [ ] Configure internet access for: Hacker News, Reddit, X, ArXiv, Ollama registry, HuggingFace
- [ ] Test: Scout finds one relevant new model release or tool and writes an evolution report
- [ ] Verify evolution_report entries appear in agent_logs
- [ ] Configure weekly Evolution Report cron (Sunday 6 PM)
- [ ] Wire Scout alerts to Telegram ops channel for urgent discoveries

---

## Phase 3 — Claude Oversight + Self-Improvement (Month 2)
*Goal: The system starts getting smarter on its own*

### 3A — Claude Daily Review
- [ ] Set up daily trigger: push day's logs to Claude (Tier 1)
- [ ] Claude reviews: what worked, what failed, what patterns emerged
- [ ] Claude writes improvement suggestions (initially just recommendations to David)
- [ ] Later: Claude directly rewrites agent.md instruction files

### 3B — Matcher Agent + AIR Workflow
- [ ] Deploy Matcher agent for AIR report processing
- [ ] Set up dedicated email inbox for AIR report forwarding
- [ ] Test: forward one AIR report → parse → match → draft outreach → sandbox_outreach
- [ ] Build deduplication check (don't email same person about same property twice)
- [ ] Tier 2 reviews outreach tone and accuracy before send
- [ ] Matcher references Comps table data in outreach drafts (comparable sales/leases for personalization)

### 3C — Approval Queue from Mobile
- [ ] Make Agent Dashboard responsive / mobile-friendly
- [ ] David can approve/reject sandbox items from phone
- [ ] Push notification when high-confidence items are ready (future)

### 3D — Feedback Loop System
*The system currently flows one direction. This closes the loop so agents learn from their mistakes.*
- [ ] Create `feedback_loop` table in migration (see OPERATIONS.md §14)
- [ ] When David overrides Tier 2 (approves something rejected, or rejects something approved), record the override with reason
- [ ] When Tier 2 rejects an agent's submission, the rejection reason is stored in a format agents can consume
- [ ] Chief of Staff reviews feedback_loop weekly and adjusts agent instructions based on patterns
- [ ] Track: which agent instructions changed → did the approval rate improve? If not, rollback.

### 3E — Confidence Score Calibration
*Make "80 confidence" actually mean "~80% chance of being correct"*
- [ ] After 30 days of operation, pull all records scored 70+ that were approved
- [ ] Sample 50, manually verify accuracy against real-world data
- [ ] Calculate actual accuracy per confidence band (60-69, 70-79, 80-89, 90+) per agent
- [ ] Adjust scoring formulas so calibration improves
- [ ] Chief of Staff runs monthly calibration checks and tunes agent scoring rubrics
- [ ] Track calibration drift over time in Logger's monthly report

### 3F — Sandbox Auto-Promotion Rules
*For high-confidence, low-risk items, skip manual review to save David 15+ min/day*
- [ ] Define auto-promotion rules in `supervisor-config.json` under `"auto_promote"` key
- [ ] Rule 1: Contact enrichment with confidence ≥ 90 AND only adding phone/email (not changing existing data) → auto-promote
- [ ] Rule 2: News signals with verified source URL AND confidence ≥ 80 → auto-promote to CRM signals table
- [ ] Rule 3: Outreach always requires manual review (highest risk — never auto-promote)
- [ ] All auto-promoted items logged with `auto_promoted: true` in JSONL audit log
- [ ] Chief of Staff tracks auto-promotion accuracy monthly; tightens/loosens thresholds
- [ ] Dashboard shows auto-promotion stats: count, accuracy rate, time saved estimate

### 3G — Real-Time Alerting Tiers
*Daily summaries aren't enough for critical events*
- [ ] Configure 3 alert tiers in supervisor:
  - **Immediate** (Telegram push): agent crash, 3+ injection attempts in 1 hour, Tier 2 approval rate drops below 50%, external API total failure, critical security audit finding
  - **Hourly digest** (Telegram): new high-confidence signals, completed enrichments, outreach approvals
  - **Daily summary** (stays as-is): strategic review, patterns, recommendations
- [ ] Logger aggregates hourly digest and sends via Telegram bot
- [ ] Supervisor monitors crash/injection events and triggers immediate alerts
- [ ] All alerts logged in JSONL audit log with `action: alert_sent`

---

## Phase 3.5 — Intelligence Optimization (Month 2-3)
*Goal: Transform raw data collection into adaptive intelligence*

### 3.5A — Deal Velocity Tracker (Logger Enhancement)
*Don't just detect signals — detect acceleration. A company with 3 signals in one week is hotter than one with 1 signal per quarter.*
- [ ] Logger tracks signal velocity per company: signals per week, trend (accelerating/decelerating/flat)
- [ ] Auto-generate "Hot 10" list ranked by velocity, not just confidence
- [ ] Velocity thresholds: 2+ signals in 7 days = "warm", 3+ in 48 hours = "hot"
- [ ] When velocity crosses "hot" threshold → auto-post to priority board as `flag_for_outreach` (high urgency)
- [ ] Hot 10 list included in Chief of Staff's morning briefing (Houston channel for team visibility)
- [ ] Velocity data stored in `agent_logs` with `log_type: 'velocity_report'`

### 3.5B — Lease Expiration Intelligence (First-Class Workflow)
*Currently an idle-cycle task for Researcher. Too important — make it systematic.*
- [ ] Add `lease_expiry_date` column to properties table in CRM (migration)
- [ ] Researcher runs systematic public records scanning for lease terms:
  - County records, REIT filings, broker press releases, news announcements
  - Dedicated scan cycle: 2 hours daily (not just idle time)
- [ ] Cross-reference found expirations with CRM properties
- [ ] Auto-generate outreach opportunities 12-18 months before expiry
- [ ] Feed lease expiry data into TPE scoring (`lease_expiry_proximity` — already in TPE spec)
- [ ] Matcher prioritizes contacts with upcoming expirations for outreach matching
- [ ] Chief of Staff tracks lease expiry pipeline in weekly review

### 3.5C — Competitive Intelligence Dashboard (Scout Enhancement)
*Move from vague "competitor monitoring" to structured tracking*
- [ ] Define named competitor list in `supervisor-config.json` under `"competitors"` key:
  ```json
  {
    "competitors": [
      { "name": "CBRE IE", "agents": ["broker1", "broker2"], "watch_listings": true },
      { "name": "Colliers IE", "agents": ["broker3"], "watch_listings": true },
      { "name": "Lee & Associates", "agents": ["broker4", "broker5"], "watch_listings": true }
    ]
  }
  ```
- [ ] Scout tracks per competitor: new listings, closed deals, team changes, marketing activity
- [ ] Weekly competitive intel section added to Scout's Evolution Report
- [ ] Alert when a competitor is working a property that's also in David's pipeline
- [ ] Store competitive intel as signals with type `competitive_intel` and `competitor_name` in metadata

### 3.5D — Outreach A/B Testing (Matcher Enhancement)
*Learn what works from actual results*
- [ ] Track subject line variants in `sandbox_outreach` metadata
- [ ] Integrate Postmark webhook data: opens, clicks, replies per outreach
- [ ] After 100+ emails sent, Logger surfaces patterns:
  - Which subject line styles get highest open rates?
  - Which body structures get replies?
  - Which time-of-day gets best engagement?
- [ ] Chief of Staff updates Matcher's template guidance based on results
- [ ] A/B test report included in Logger's monthly summary

### 3.5E — Tiered Model Routing
*Stop hardcoding which model does what. Make it dynamic based on task complexity.*
- [ ] Create `routing-rules.json` in `/AI-Agents/shared/`:
  ```json
  {
    "rules": [
      { "task": "simple_classification", "model": "minimax-2.5", "reason": "fastest, free" },
      { "task": "structured_extraction", "model": "qwen-3.5", "reason": "more accurate on structured output" },
      { "task": "complex_reasoning", "model": "claude_api", "reason": "escalate when local models unsure" },
      { "task": "email_draft", "model": "qwen-3.5", "reason": "good balance of quality and speed" }
    ],
    "fallback_model": "qwen-3.5"
  }
  ```
- [ ] Each agent checks routing rules before making LLM calls
- [ ] Chief of Staff can update routing rules based on accuracy data and cost reports
- [ ] Logger tracks model performance by task type to inform routing changes

---

## Phase 4 — Full Fleet (Mac Studio Arrives)
*Goal: All agents running at scale with adaptive intelligence*

### 4A — Migration to Mac Studio
- [ ] Move agents from Mac Mini to Mac Studio (128GB RAM)
- [ ] Run larger model variants (Qwen 3.5 full, MiniMax 2.5 full)
- [ ] Mac Mini becomes secondary/backup or dedicated to specific agent

### 4B — Scale Up
- [ ] All 5 agents running 24/7 (Enricher, Researcher, Matcher, Logger, Scout)
- [ ] Full self-improvement loop active (Claude reviewing + rewriting agent instructions)
- [ ] Feedback loop table actively driving instruction improvements
- [ ] Market intelligence feeding into IE CRM daily
- [ ] Contact verification running automatically on new LLCs
- [ ] AIR report workflow fully automated
- [ ] Lead scoring from combined signals
- [ ] Auto-promotion rules calibrated and saving David 15+ min/day
- [ ] Confidence scores calibrated across all agents

### 4C — Advanced Intelligence
- [ ] Relationship mapping (analyze interaction history, surface connections — see 4C.1 below)
- [ ] Anomaly detection (contact changed companies, property vacant too long, pricing off)
- [ ] Automated meeting prep (see 4C.2 below)
- [ ] Market intelligence summaries (daily/weekly briefings)

### 4C.1 — Relationship Graph (Researcher Idle-Cycle → First-Class)
*CRE deals happen through relationship chains. Map them.*
- [ ] Researcher builds lightweight relationship graph from CRM interaction data during idle cycles
- [ ] Graph structure: Contact A → knows → Contact B (with relationship type and strength score)
- [ ] Sources: shared interactions, same company, co-listed properties, meeting attendees
- [ ] When new opportunity surfaces, query: "Who in our CRM is closest to this contact?"
- [ ] Surface "warm introduction paths" in morning briefings: "David → John (met last month) → Property Owner"
- [ ] Store relationship data in new `contact_relationships` table (migration required)
- [ ] Relationship paths included in Matcher's outreach context ("David's colleague John works with this company")

### 4C.2 — Meeting Prep Automation
*Triggered workflow: 2 hours before any meeting, auto-generate a prep packet*
- [ ] Calendar integration: read David's calendar for upcoming meetings (Apple Calendar or Google Calendar API)
- [ ] 2 hours before meeting, trigger prep workflow:
  - Pull all CRM data on meeting contact/company
  - Summarize recent signals and interactions
  - Check for recent market activity in their submarket
  - Pull comp data for relevant properties
  - Generate 3-5 talking points based on their property needs
- [ ] Deliver prep packet via Telegram with one-tap "got it" confirmation
- [ ] Store prep packets for post-meeting reference
- [ ] Future: integrate with Zoom for real-time context during calls

---

## Phase 5 — Voice Team Member (Future)
*Goal: AI sits on Zoom calls, listens, contributes*

- [ ] Speech-to-text (local on Mac Studio)
- [ ] LLM processing (context from IE CRM)
- [ ] Text-to-speech output
- [ ] Prompt engineering: knows WHEN to speak, not just what to say
- [ ] Only attempt this after foundation is rock solid

---

## Key Dependencies

| Phase | Depends On |
|-------|-----------|
| Phase 0 (Infrastructure) | Nothing — can start now |
| Phase 1 (First Agents) | Phase 0 + Mac Mini arrival |
| Phase 2 (Second Agent + QA) | Phase 1 working end-to-end |
| Phase 3 (Claude Oversight + Learning) | Phase 2 + at least 2 weeks of logs |
| Phase 3.5 (Intelligence Optimization) | Phase 3 stable + 30 days of operational data for calibration |
| Phase 4 (Full Fleet) | Mac Studio arrival + Phase 3.5 features validated |
| Phase 5 (Voice) | Phase 4 fully operational |

---

## Guiding Principles

1. **Start narrow** — One workflow working perfectly beats ten half-baked ones
2. **Sandbox everything** — Local models never write directly to production IE CRM
3. **Log everything** — Logs are what makes the system self-improve
4. **Ambient beats genius** — A less-smart model running 24/7 outperforms a brilliant model used occasionally
5. **Hybrid is the sweet spot** — Local models do the work, cloud models check it
6. **Separate agents for separate skills** — Don't mix researcher context with developer context
7. **Your process is your moat** — Teaching the system your contact research logic is not replicable by competitors
8. **Build the infrastructure first** — Agents need somewhere to write before they can work
9. **Close the feedback loops** — A system that doesn't learn from its mistakes is just expensive automation
10. **Detect velocity, not just signals** — Acceleration matters more than any single data point
11. **Calibrate or it's theater** — Confidence scores mean nothing if they're not validated against reality

---

*Created: March 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
