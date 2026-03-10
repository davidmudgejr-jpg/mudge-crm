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

### 3C — Approval Queue from Mobile
- [ ] Make Agent Dashboard responsive / mobile-friendly
- [ ] David can approve/reject sandbox items from phone
- [ ] Push notification when high-confidence items are ready (future)

---

## Phase 4 — Full Fleet (Mac Studio Arrives)
*Goal: All agents running at scale*

### 4A — Migration to Mac Studio
- [ ] Move agents from Mac Mini to Mac Studio (128GB RAM)
- [ ] Run larger model variants (Qwen 3.5 full, MiniMax 2.5 full)
- [ ] Mac Mini becomes secondary/backup or dedicated to specific agent

### 4B — Scale Up
- [ ] All 4 agents running 24/7
- [ ] Full self-improvement loop active (Claude reviewing + rewriting agent instructions)
- [ ] Market intelligence feeding into IE CRM daily
- [ ] Contact verification running automatically on new LLCs
- [ ] AIR report workflow fully automated
- [ ] Lead scoring from combined signals

### 4C — Advanced Intelligence
- [ ] Relationship mapping (analyze interaction history, surface connections)
- [ ] Anomaly detection (contact changed companies, property vacant too long, pricing off)
- [ ] Automated meeting prep (pull context before calls)
- [ ] Market intelligence summaries (daily/weekly briefings)

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
| Phase 3 (Claude Oversight) | Phase 2 + at least 2 weeks of logs |
| Phase 4 (Full Fleet) | Mac Studio arrival + Phase 3 stable |
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

---

*Created: March 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
