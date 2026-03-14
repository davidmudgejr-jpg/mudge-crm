# System Operations
## Escalation, Testing, Versioning, Data Retention & Cost Tracking
### IE CRM AI Master System

---

## #6 — Escalation Protocol (Consolidated)

Escalation rules are defined in `tier2-validator.md` and `chief-of-staff.md`. This section consolidates the full picture so there's one reference for how information flows up.

### Escalation Chain

```
Tier 3 (Local Agent) has a problem it can't solve
        ↓
Writes to agent_logs (log_type: 'error') — visible in Dashboard
        ↓
If it's a data quality issue → sandbox item gets submitted with low confidence
        ↓ (normal Tier 2 review catches it)

Tier 2 (Ralph Loop) finds something it can't decide on
        ↓
Writes to agent_escalations table:
  - sandbox_table + sandbox_id (what item)
  - urgency: normal / high / critical
  - reason + recommendation
        ↓
Normal: waits for Claude's daily review (6 AM)
High: Claude responds within 1 hour
Critical: Claude responds immediately
        ↓

Claude (Tier 1) can't decide or it's too important
        ↓
Claude writes to David's morning briefing:
  - decision: "defer_to_david"
  - Creates action_item in IE CRM with high priority
        ↓
David sees it in the Dashboard or on his phone
```

### What Triggers Each Urgency Level

| Urgency | Examples | Response Time |
|---------|----------|--------------|
| **Normal** | Borderline confidence score, ambiguous data, minor pattern drift | Daily review (6 AM) |
| **High** | High-value deal opportunity (>$1M), possible portfolio owner, agent quality degrading fast | Within 1 hour |
| **Critical** | Agent malfunction (stuck/crash loop), auth failure (account blocked), spam complaint, data integrity issue | Immediate |

### Escalation Endpoints (API)

```
POST /api/ai/queue/escalate              — Tier 2 escalates to Tier 1
GET  /api/ai/queue/escalations           — List pending escalations
GET  /api/ai/queue/escalations?urgency=critical  — Filter by urgency
POST /api/ai/queue/escalation-response   — Tier 1 responds to escalation
```

### David's Notification Path (Future)

For now, David checks the Dashboard. Future enhancements:
- Push notification on phone when critical escalation fires
- SMS via Twilio for true emergencies (agent fleet down, spam complaint)
- Daily morning briefing emailed at 6:30 AM (after Claude's review runs at 6 AM)

---

## #7 — Testing & Dry Run Mode

Before letting agents loose on real data and real services, you need a way to test the full pipeline without consequences.

### Dry Run Flag

Every agent supports a `--dry-run` flag (set in supervisor-config.json):

```json
{
  "name": "enricher",
  "enabled": true,
  "dry_run": true,
  ...
}
```

**When dry_run is true:**
- Agent runs its full workflow (reads instructions, checks priority board, processes items)
- API calls to external services (White Pages, BeenVerified, etc.) are **skipped**
- Instead, the agent uses **mock responses** from local test fixtures
- Writes to sandbox tables are **tagged**: `agent_name = 'enricher_dry_run'`
- Heartbeats still fire (so you can see it in the Dashboard)
- Logs still write (so you can review what it *would* have done)
- Priority board posts are tagged as dry_run and auto-expire in 1 hour

**When dry_run is false:**
- Normal operation — real API calls, real sandbox writes

### Test Fixtures

Pre-built mock data for testing each agent without hitting real services:

```
/AI-Agents/test-fixtures/
├── enricher/
│   ├── sample-llcs.json              # 10 test LLCs to process
│   ├── mock-open-corporates.json     # Mock API responses
│   ├── mock-white-pages.json         # Mock API responses
│   ├── mock-been-verified.json       # Mock API responses
│   └── mock-neverbounce.json         # Mock API responses
├── researcher/
│   ├── mock-news-feed.json           # Mock CRE news articles
│   ├── mock-x-tweets.json            # Mock X signal tweets
│   └── mock-crm-companies.json       # Mock CRM company list for matching
├── matcher/
│   ├── sample-air-reports/           # 3-5 sample AIR report PDFs
│   ├── mock-crm-contacts.json        # Mock contacts for matching
│   └── expected-outreach.json        # Expected output for validation
└── integration/
    └── end-to-end-scenario.json      # Full scenario: LLC → enrichment → signal → outreach
```

### Test Levels

**Level 1: Unit Test (per agent, mock everything)**
```
Agent reads from test fixtures instead of real APIs
Validates: does the agent follow its instructions correctly?
Run: agentctl test enricher --fixtures /AI-Agents/test-fixtures/enricher/
```

**Level 2: Integration Test (agents talk to real sandbox, mock external APIs)**
```
Agents read/write to a test schema in Neon (separate from production)
Validates: does the sandbox pipeline work? Do heartbeats appear? Do logs write?
Run: agentctl test integration --schema ai_test
```

**Level 3: Smoke Test (one real item, real services, real sandbox)**
```
Process exactly ONE real LLC through the full Enricher pipeline
Validates: do API keys work? Do services respond? Does the data look right?
Run manually — David watches the Dashboard while one item processes
```

**Level 4: Burn-In (24-hour dry run)**
```
Run all agents in dry_run mode for 24 hours
Validates: stability, memory leaks, log rotation, heartbeat consistency
Check: no crashes, no runaway loops, logs look sane, Dashboard shows all green
```

### First-Day Testing Sequence

```
Day 1 on Mac Mini:
  1. Install everything (setup script)
  2. Run Level 1: unit tests for Enricher (30 minutes)
  3. Run Level 1: unit tests for Researcher (30 minutes)
  4. Fix any issues found
  5. Run Level 2: integration test (1 hour)
  6. Run Level 3: smoke test — one real LLC through Enricher (watch carefully)
  7. If smoke test passes: start Level 4 burn-in overnight

Day 2:
  8. Review burn-in results
  9. If clean: disable dry_run for Enricher, start real processing
  10. Keep other agents in dry_run until individually validated
```

---

## #8 — Agent Instruction Versioning

When Claude (Tier 1) rewrites an agent.md, the old version must be preserved. If performance drops, you need to rollback.

### Version Metadata

Every agent.md starts with a version block:

```markdown
<!-- INSTRUCTION VERSION -->
<!-- version: 1.3 -->
<!-- updated_by: chief_of_staff -->
<!-- updated_at: 2026-03-25T06:00:00Z -->
<!-- change: Tightened address matching for common names (ZIP-level, not city-level) -->
<!-- reason: 15% false positive rate on names with >5 White Pages matches -->
<!-- previous_version: /AI-Agents/enricher/versions/agent-v1.2.md -->
```

### Version History (Local Files)

```
/AI-Agents/enricher/
├── agent.md                        # Current live version (always latest)
├── versions/
│   ├── agent-v1.0.md              # Original (from GitHub template)
│   ├── agent-v1.1.md              # First Claude update
│   ├── agent-v1.2.md              # Second Claude update
│   └── agent-v1.3.md              # Third Claude update (copied here when v1.4 is written)
└── version-log.json               # Structured history
```

### Version Log (Structured)

```json
{
  "agent": "enricher",
  "current_version": "1.3",
  "history": [
    {
      "version": "1.0",
      "date": "2026-03-17",
      "author": "david",
      "change": "Initial deployment from GitHub template",
      "file": "versions/agent-v1.0.md"
    },
    {
      "version": "1.1",
      "date": "2026-03-20",
      "author": "chief_of_staff",
      "change": "Added handling for registered agent services (CSC, CT Corp, etc.)",
      "reason": "Agent was scoring high confidence on contacts that were actually registered agent services",
      "impact": "False positive rate dropped from 12% to 4%",
      "file": "versions/agent-v1.1.md"
    },
    {
      "version": "1.2",
      "date": "2026-03-22",
      "author": "chief_of_staff",
      "change": "Lowered confidence threshold for NeverBounce from 70 to 60",
      "reason": "Good contacts being missed because email verification wasn't triggering",
      "impact": "Email verification volume up 35%, valid email rate stayed at 92%",
      "file": "versions/agent-v1.2.md"
    }
  ]
}
```

### Rollback Protocol

If Claude updates an agent.md and performance drops:

```
1. Claude detects regression in daily review:
   "Enricher approval rate dropped from 82% to 61% after v1.3 update"

2. Claude rolls back:
   - Copy current agent.md to versions/agent-v1.3.md
   - Copy versions/agent-v1.2.md to agent.md
   - Update version metadata to show rollback
   - Log the rollback in version-log.json

3. Agent picks up the old instructions on its next cycle
   (OpenClaw re-reads agent.md periodically or on restart)

4. Claude notes in daily log:
   "Rolled back Enricher from v1.3 to v1.2. V1.3 change caused regression."

5. Claude analyzes WHY v1.3 failed before attempting a revised update
```

### Dashboard: Version View

In the Agent Dashboard, each agent card shows:
- Current instruction version (e.g., "v1.3")
- Last updated date and author
- Link to view version history
- "Rollback" button (triggers Claude to revert to previous version)

---

## #9 — Data Retention & Cleanup

Data piles up. Logs grow. Heartbeats fire every 60 seconds. Without cleanup, the database bloats and the Dashboard slows down.

### Retention Policies

| Data Type | Retention | Cleanup Method |
|-----------|-----------|---------------|
| **agent_heartbeats** | Latest only | UPSERT — only 1 row per agent (already designed this way) |
| **agent_logs** | 90 days | Delete logs older than 90 days, weekly cleanup job |
| **agent_logs (daily_summary)** | 1 year | Daily summaries are valuable — keep longer |
| **sandbox_contacts (pending)** | 30 days | Auto-reject if pending >30 days (stale data) |
| **sandbox_contacts (approved/promoted)** | Permanent | This is production-path data |
| **sandbox_contacts (rejected)** | 60 days | Keep for pattern analysis, then purge |
| **sandbox_enrichments** | Same as contacts | Follows same retention rules |
| **sandbox_signals** | 90 days | Signals older than 90 days are stale market data |
| **sandbox_outreach (pending)** | 14 days | Auto-cancel if not reviewed in 2 weeks |
| **sandbox_outreach (approved/sent)** | 1 year | Need for compliance and performance analysis |
| **sandbox_outreach (rejected)** | 60 days | Keep for tone/quality analysis |
| **agent_priority_board** | 30 days | Expired and completed items older than 30 days |
| **agent_escalations** | 1 year | Decision history is valuable for system learning |
| **outbound_email_queue** | 1 year | Email compliance requires keeping send records |
| **Daily log .md files (local)** | 6 months | Archive to compressed folder, then delete |
| **Agent memory files (local)** | Permanent | These ARE the agent's learned knowledge |

### Cleanup Jobs

A weekly cleanup job runs on the CRM backend (Sunday 3 AM):

```sql
-- Purge old activity logs (keep daily summaries longer)
DELETE FROM agent_logs
WHERE log_type != 'daily_summary'
AND created_at < NOW() - INTERVAL '90 days';

-- Purge old daily summaries
DELETE FROM agent_logs
WHERE log_type = 'daily_summary'
AND created_at < NOW() - INTERVAL '1 year';

-- Auto-reject stale pending sandbox items
UPDATE sandbox_contacts SET status = 'rejected', review_notes = 'Auto-rejected: pending >30 days'
WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 days';

UPDATE sandbox_outreach SET status = 'rejected', review_notes = 'Auto-cancelled: pending >14 days'
WHERE status = 'pending' AND created_at < NOW() - INTERVAL '14 days';

-- Purge old rejected sandbox items
DELETE FROM sandbox_contacts WHERE status = 'rejected' AND updated_at < NOW() - INTERVAL '60 days';
DELETE FROM sandbox_enrichments WHERE status = 'rejected' AND updated_at < NOW() - INTERVAL '60 days';
DELETE FROM sandbox_outreach WHERE status = 'rejected' AND updated_at < NOW() - INTERVAL '60 days';

-- Purge expired/completed priority board items
DELETE FROM agent_priority_board
WHERE status IN ('expired', 'completed', 'skipped')
AND created_at < NOW() - INTERVAL '30 days';

-- Purge old signal data
DELETE FROM sandbox_signals WHERE created_at < NOW() - INTERVAL '90 days';
```

### Local File Cleanup (Mac Mini)

The supervisor runs monthly:

```bash
# Compress daily logs older than 30 days
find /AI-Agents/daily-logs/ -name "*.md" -mtime +30 -exec gzip {} \;

# Delete compressed logs older than 6 months
find /AI-Agents/daily-logs/ -name "*.md.gz" -mtime +180 -delete

# Delete offline buffer files older than 7 days (already flushed)
find /AI-Agents/offline-buffer/ -type f -mtime +7 -delete

# Keep supervisor logs trimmed
find /AI-Agents/supervisor-logs/ -name "*.log" -size +100M -exec truncate -s 10M {} \;
```

### Database Size Monitoring

Add to the Agent Dashboard "System Health" panel:
- Total rows per sandbox table
- Database size (Neon Postgres provides this)
- Growth rate (rows added per day)
- Alert if any table exceeds 100K rows (probably needs cleanup or archival)

---

## #10 — Cost & Usage Tracking

Running this system has real costs. Tracking them helps optimize spending and prove ROI.

### Cost Categories

| Category | Service | Pricing Model | Estimated Monthly |
|----------|---------|--------------|-------------------|
| **Claude API** | Anthropic | Per token (input/output) | $20-100 depending on daily review depth |
| **ChatGPT OAuth** | OpenAI | $250/mo flat | $250 (fixed) |
| **Gemini** | Google | Per token or free tier | $0-50 |
| **NeverBounce** | NeverBounce | Per verification (~$0.008/ea) | $20-50 (2,500-6,000 verifications) |
| **White Pages** | WhitePages Premium | Monthly subscription | ~$30-50/mo |
| **BeenVerified** | BeenVerified | Monthly subscription | ~$30-50/mo |
| **Postmark** | Postmark | $15/mo for 10K emails | $15 |
| **Open Corporates** | Open Corporates | Free tier or API plan | $0-50 |
| **Neon Postgres** | Neon | Based on compute + storage | ~$20-50 |
| **Railway** | Railway | Based on usage | ~$5-20 |
| **Hardware** | Mac Mini (one-time) | Amortized over 3 years | ~$60/mo |
| **Hardware** | Mac Studio (one-time) | Amortized over 3 years | ~$115/mo |
| **Electricity** | Mac Mini 24/7 | ~15-30W typical | ~$5/mo |
| **Total estimated** | | | **$470-860/mo** |

### Usage Tracking Table

```sql
CREATE TABLE IF NOT EXISTS ai_usage_tracking (
  id SERIAL PRIMARY KEY,
  -- What was used
  service TEXT NOT NULL,            -- 'claude_api', 'chatgpt', 'neverbounce', 'white_pages', etc.
  agent_name TEXT,                  -- which agent triggered the usage
  -- Usage details
  usage_type TEXT NOT NULL,         -- 'api_call', 'token', 'verification', 'email_send'
  quantity INTEGER DEFAULT 1,       -- number of units used
  unit_cost_cents INTEGER,          -- cost per unit in cents (if known)
  total_cost_cents INTEGER,         -- total cost for this usage entry in cents
  -- Context
  metadata JSONB DEFAULT '{}',     -- flexible: token counts, endpoint called, etc.
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_usage_tracking_service ON ai_usage_tracking(service);
CREATE INDEX idx_usage_tracking_agent ON ai_usage_tracking(agent_name);
CREATE INDEX idx_usage_tracking_created ON ai_usage_tracking(created_at);
CREATE INDEX idx_usage_tracking_date ON ai_usage_tracking(DATE(created_at));
```

### How Each Service Gets Tracked

**Claude API (Tier 1):**
```json
{
  "service": "claude_api",
  "agent_name": "chief_of_staff",
  "usage_type": "token",
  "quantity": 15000,
  "metadata": {
    "input_tokens": 12000,
    "output_tokens": 3000,
    "model": "claude-opus-4-6",
    "purpose": "daily_review"
  }
}
```

**NeverBounce (Enricher):**
```json
{
  "service": "neverbounce",
  "agent_name": "enricher",
  "usage_type": "verification",
  "quantity": 1,
  "unit_cost_cents": 1,
  "total_cost_cents": 1,
  "metadata": {
    "email": "john@company.com",
    "result": "valid"
  }
}
```

**Postmark (Email sends):**
```json
{
  "service": "postmark",
  "agent_name": "system",
  "usage_type": "email_send",
  "quantity": 1,
  "unit_cost_cents": 0,
  "total_cost_cents": 0,
  "metadata": {
    "outbound_email_id": 456,
    "to": "john@company.com"
  }
}
```

### Per-Call Cost Tracking (JSONL Audit Log)

In addition to the Postgres `ai_usage_tracking` table above (which powers the Dashboard), a **per-call JSONL audit log** runs locally on the Mac for granular visibility. See spec: `docs/superpowers/specs/2026-03-13-ai-system-enhancements-design.md`

**Relationship:** JSONL is the local source of truth — captures every individual LLM/API call in real-time. A daily sync (during the 3:00-5:30 AM maintenance window) pushes aggregated totals to the Postgres `ai_usage_tracking` table for Dashboard display.

**Utility:** `/AI-Agents/shared/cost-tracker.py`
**Log location:** `/AI-Agents/logs/audit/YYYY-MM-DD.jsonl`
**Pricing config:** `supervisor-config.json` under `"pricing"` key

**Entry format:**
```jsonl
{"ts":"2026-03-25T06:01:23Z","agent":"enricher","model":"qwen-3.5-20b","provider":"ollama_local","tokens_in":1240,"tokens_out":380,"task_type":"contact_classification","cost_estimate":0.00,"duration_ms":1850}
```

**Reports generated by Logger agent:**
- By model, by task type, by agent — which operations cost the most
- Routing suggestions — flag expensive models on simple tasks
- Daily trend with 7-day moving average

Local Ollama calls are logged with `cost_estimate: 0.00` for complete system visibility.

### ROI Metrics

The real question isn't "what does this cost?" — it's "what's it worth?"

Track these to prove ROI:

```
COST SIDE:
  Total monthly spend (from usage tracking table)
  Cost per verified contact
  Cost per outreach email sent
  Cost per reply received

VALUE SIDE:
  Contacts verified this month
  Outreach emails sent
  Replies received (warm leads)
  Deals sourced from AI outreach
  Time saved (estimate: contacts verified per hour manually vs. AI)
```

### Dashboard: "Cost & ROI" Panel

```
This Month's Costs
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Claude API:      $45.20  (daily reviews)
ChatGPT:         $250.00 (flat — Ralph Loop)
NeverBounce:     $18.40  (2,300 verifications)
White Pages:     $29.99  (subscription)
BeenVerified:    $29.99  (subscription)
Postmark:        $15.00  (email sends)
Neon + Railway:  $35.00  (infrastructure)
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total:           $423.58

This Month's Output
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Contacts verified:  847
Outreach sent:      134
Replies received:   18
Signals found:      52

Unit Economics
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Cost per verified contact:  $0.50
Cost per outreach email:    $3.16
Cost per warm lead (reply): $23.53
```

If even ONE of those 18 replies turns into a deal, the system pays for itself for years.

---

## #11 — Credential Hygiene & Config Security

Before any agent config, instruction file, or log is backed up to Git or transmitted anywhere, it MUST be scanned for credential leakage.

### What Gets Scanned

Any file leaving the local machine:
- `supervisor-config.json`
- Agent `.md` instruction files (could contain example API calls with real keys)
- Daily logs (agents might log API responses containing tokens)
- Memory files (agents might store connection info)
- `.env` files (obviously)

### Scan Rules

```python
CREDENTIAL_PATTERNS = [
    r'(?i)(api[_-]?key|apikey)\s*[:=]\s*["\']?[\w-]{20,}',
    r'(?i)(secret|token|password|passwd)\s*[:=]\s*["\']?[\w-]{10,}',
    r'postgres://[^@]+@[^/]+/\w+',          # Postgres connection strings
    r'(?i)bearer\s+[\w.-]{20,}',             # Bearer tokens
    r'sk-[a-zA-Z0-9]{20,}',                  # OpenAI-style keys
    r'pat[a-zA-Z0-9]{10,}\.',                # Airtable PATs
    r'(?i)postmark.*[a-f0-9-]{30,}',         # Postmark server tokens
    r'neon://[^@]+@[^/]+',                   # Neon connection strings
]
```

### What Happens on Match

1. **Block the push/backup** — never transmit the file as-is
2. **Replace with placeholders:** `[NEON_CONNECTION_STRING]`, `[CLAUDE_API_KEY]`, etc.
3. **Log the incident:** which file, which pattern, which agent (if applicable)
4. **Alert in supervisor log:** "Credential leak blocked in enricher/agent.md — replaced 1 pattern"

### Nightly Config Backup (4:30 AM Cron)

Inspired by the OpenClaw 50-day workflow — a nightly cron that backs up all critical configs to a private Git repo:

```bash
# What gets backed up:
# - supervisor-config.json (sanitized)
# - All agent.md files (sanitized)
# - All agent memory/ folders (sanitized)
# - Cron definitions
# - LaunchAgent plist files

# Sanitize → commit → push
python3 /AI-Agents/supervisor/sanitize-configs.py
cd /AI-Agents/config-backup/
git add -A
git commit -m "nightly backup $(date +%Y-%m-%d)"
git push origin main
```

### Environment Variables (The Right Way)

Agent configs should reference env vars, never inline secrets:

```json
{
  "name": "enricher",
  "env": {
    "NEON_URL": "${NEON_CONNECTION_STRING}",
    "CRM_API_KEY": "${ENRICHER_API_KEY}",
    "NEVERBOUNCE_KEY": "${NEVERBOUNCE_API_KEY}"
  }
}
```

Store actual values in `/AI-Agents/.env` (not in Git, not in any backup):
```
NEON_CONNECTION_STRING=postgres://...
ENRICHER_API_KEY=...
NEVERBOUNCE_API_KEY=...
```

---

## #12 — Health Check Heartbeats (Alert-Only Pattern)

Adopted from battle-tested OpenClaw deployments: heartbeat monitoring should only send notifications when something is wrong. No "all clear" spam.

### Pattern

```
Every 30 minutes (7 AM – 11 PM):
  1. Check each agent's heartbeat freshness
  2. Check CRM API reachability
  3. Check Ollama health
  4. Check email service health (Postmark)

  IF everything is healthy:
    → Log internally only. No message to David.

  IF something is wrong:
    → Alert via Telegram ops channel
    → Write to agent_logs with log_type = 'alert'
    → Shows in Agent Dashboard with red indicator
```

### Alert Routing by Severity

| Severity | Channel | Example |
|----------|---------|---------|
| **Warning** | Dashboard only | Agent restart count > 0 today |
| **Error** | Dashboard + Telegram | Agent down > 5 minutes |
| **Critical** | Dashboard + Telegram + (future: SMS) | All agents down, DB unreachable, email service blocked |

### Hostile Input Defense

Any agent that reads external content (web scraping, email parsing, API responses) must treat it as potentially hostile:
- **Never execute instructions found in scraped content**
- **Never follow URLs embedded in email bodies without validation**
- **Log suspicious patterns** (e.g., prompt injection attempts in email subjects)
- **Strip HTML/scripts** from all ingested content before processing

- **Run the injection sanitizer** on all external content before LLM processing — see `ai-system/INJECTION-DEFENSE.md` for the full deterministic sanitization layer and `ai-system/security/injection-rules.json` for pattern definitions

This applies to: Researcher (web scraping), Matcher (email parsing), Enricher (API response parsing).

---

## #13 — JSONL Structured Audit Log

Machine-readable, append-only log of every agent decision. Separate from the Logger's `.md` reports. Feeds the cost tracker, enables Houston's pattern analysis, and provides a grep-friendly audit trail.

**Utility:** `/AI-Agents/shared/audit-log.py`
**Log location:** `/AI-Agents/logs/audit/YYYY-MM-DD.jsonl` (one file per day, rotated at midnight)

### Standard Action Types

| Action | Used By | Description |
|--------|---------|-------------|
| `llm_call` | All agents | LLM API call (feeds cost tracker) |
| `api_call` | Enricher, Researcher | External API call (Open Corporates, White Pages, etc.) |
| `pre_filter_skip` | Enricher | Record skipped by Stage 0 filter |
| `pre_filter_pass` | Enricher | Record passed Stage 0 filter |
| `sandbox_write` | Enricher, Researcher, Matcher | Data written to sandbox DB |
| `sandbox_promote` | Tier 2 | Sandbox data approved to production |
| `sandbox_reject` | Tier 2 | Sandbox data rejected |
| `outreach_draft` | Matcher | Outreach email drafted |
| `signal_found` | Researcher | Market signal identified |
| `escalation` | Any agent | Issue escalated to higher tier |
| `council_phase` | Houston | Council briefing phase completed |
| `injection_detected` | Enricher, Researcher, Matcher, Scout | Prompt injection pattern detected in external data |
| `injection_blocked` | Enricher, Researcher, Matcher, Scout | Record auto-rejected due to 3+ injection flags |
| `security_audit` | Scout | Nightly security audit finding |
| `security_audit_offensive` | Scout | Security audit — offensive perspective result |
| `security_audit_defensive` | Scout | Security audit — defensive perspective result |
| `security_audit_privacy` | Scout | Security audit — data privacy perspective result |
| `security_audit_operational` | Scout | Security audit — operational realism perspective result |
| `error` | All agents | Error occurred |

### JSONL Retention Policy

| Entry Type | Local Retention | Archive |
|------------|----------------|---------|
| `llm_call`, `api_call`, `heartbeat` | 90 days | Compressed, 1 year |
| `sandbox_write`, `sandbox_promote`, `sandbox_reject` | 1 year | Permanent |
| `outreach_draft`, `outreach_queued` | 1 year | Compliance requirement |
| `escalation`, `council_phase` | 1 year | Decision history / self-improvement |
| `error` | 90 days | Compressed, 1 year |
| `pre_filter_skip`, `pre_filter_pass` | 90 days | Compressed, 6 months |

**Note:** This covers local JSONL file retention only. For Postgres-side retention, see Section #9.

### Audit Log Cleanup (Add to Nightly Cron)

```bash
# Compress audit logs older than 30 days
find /AI-Agents/logs/audit/ -name "*.jsonl" -mtime +30 -exec gzip {} \;

# Delete compressed audit logs older than 90 days (most types)
find /AI-Agents/logs/audit/ -name "*.jsonl.gz" -mtime +90 -delete
```

### Full Spec
See `docs/superpowers/specs/2026-03-13-ai-system-enhancements-design.md` for complete entry format, consumer details, and performance requirements.

---

## Summary: Files Created This Session

| # | Topic | File | Status |
|---|-------|------|--------|
| 1 | Tier 1 + Tier 2 Instructions | `agent-templates/chief-of-staff.md` | Done |
| 1 | Tier 2 Validator | `agent-templates/tier2-validator.md` | Done |
| 2 | Inter-Agent Coordination | `COORDINATION.md` | Done |
| 3 | Orchestration & Process Mgmt | `ORCHESTRATION.md` | Done |
| 4 | Error Handling & Recovery | `ERROR-HANDLING.md` | Done |
| 5 | Email Infrastructure | `EMAIL-INFRASTRUCTURE.md` | Done |
| 6-10 | Operations (this file) | `OPERATIONS.md` | Done |
| 13 | JSONL Audit Log | `OPERATIONS.md` | Done |

### Migration 007 now includes:
- Sandbox tables (contacts, enrichments, signals, outreach)
- Agent infrastructure (heartbeats, logs, API keys)
- Priority board (inter-agent coordination)
- Escalation queue (Tier 2 → Tier 1)
- Outbound email queue (with engagement tracking)
- Do-not-email support on contacts table

### Still needed (add to migration 007 or a separate migration):
- `ai_usage_tracking` table (cost tracking — see above)
- `shared/cost-tracker.py` — per-call JSONL cost tracking utility
- `shared/audit-log.py` — JSONL structured audit log utility
- `feedback_loop` table (see §14 below)
- `contact_relationships` table (see ROADMAP Phase 4C.1)

---

## #14 — Feedback Loop System

The system currently flows one direction: agents → Tier 2 → Tier 1 → David. Learning never flows back down. This section closes that loop so agents actually improve from their mistakes.

### Feedback Loop Table

```sql
CREATE TABLE IF NOT EXISTS feedback_loop (
  id SERIAL PRIMARY KEY,
  -- What happened
  source_tier TEXT NOT NULL,            -- 'david', 'tier1', 'tier2'
  target_agent TEXT NOT NULL,           -- which agent's behavior triggered this
  decision_type TEXT NOT NULL CHECK (decision_type IN (
    'override_approval',    -- David approved something Tier 2 rejected
    'override_rejection',   -- David rejected something Tier 2 approved
    'instruction_change',   -- Agent instructions were modified
    'threshold_change',     -- Scoring thresholds were adjusted
    'workflow_change'       -- Agent workflow was modified
  )),
  -- Context
  sandbox_table TEXT,                   -- which sandbox table was involved
  sandbox_id INTEGER,                   -- which sandbox row
  original_action TEXT NOT NULL,        -- what the system did
  override_action TEXT NOT NULL,        -- what David/Tier 1 changed it to
  reason TEXT NOT NULL,                 -- why the override happened
  -- Impact tracking
  pattern_category TEXT,                -- 'false_positive', 'false_negative', 'scoring_error', 'template_issue', 'data_quality'
  resolved BOOLEAN DEFAULT FALSE,       -- has this been addressed in agent instructions?
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,                     -- 'chief_of_staff' or 'david'
  resolution_notes TEXT,                -- what was changed to fix it
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_loop_agent ON feedback_loop(target_agent);
CREATE INDEX idx_feedback_loop_type ON feedback_loop(decision_type);
CREATE INDEX idx_feedback_loop_resolved ON feedback_loop(resolved);
CREATE INDEX idx_feedback_loop_created ON feedback_loop(created_at);
```

### How Feedback Gets Captured

**Automatic (system-generated):**
- When David approves a sandbox item that Tier 2 rejected → `override_approval`
- When David rejects a sandbox item that Tier 2 approved → `override_rejection`
- When Chief of Staff rewrites an agent.md → `instruction_change`
- When scoring thresholds change in pre-filter-rules.json → `threshold_change`

**Manual (David-initiated):**
- David can add feedback notes when approving/rejecting sandbox items
- Feedback notes are stored in the feedback_loop table for Chief of Staff to review

### How Chief of Staff Uses Feedback

**Weekly Review (during Step 4 deeper dive):**
1. Query `feedback_loop` for unresolved items grouped by `target_agent` and `pattern_category`
2. If 3+ overrides of the same type for the same agent → pattern detected
3. Update agent instructions to address the pattern
4. Mark feedback items as resolved with `resolution_notes`
5. Monitor next week: did the fix work? If not, iterate

**Monthly Report:**
- Feedback volume by agent (which agent gets overridden most?)
- Resolution rate (what % of feedback items led to instruction changes?)
- Impact tracking: did resolved items reduce future override rates?

### Feedback Loop Retention
| Type | Retention |
|------|-----------|
| Unresolved | Permanent (until resolved) |
| Resolved | 6 months (valuable for pattern analysis) |
| Instruction/workflow changes | 1 year (decision history) |

---

## #15 — Sandbox Auto-Promotion Rules

For high-confidence, low-risk items, skip manual review to save David time. All auto-promoted items are logged and tracked for accuracy.

### Rule Configuration

Stored in `supervisor-config.json` under `"auto_promote"`:

```json
{
  "auto_promote": {
    "enabled": false,
    "rules": [
      {
        "name": "high_confidence_enrichment_additive",
        "sandbox_table": "sandbox_enrichments",
        "conditions": {
          "confidence_score_min": 90,
          "change_type": "additive_only",
          "fields_allowed": ["phone_1", "phone_2", "email", "email_2"],
          "fields_blocked": ["full_name", "company_name", "home_address"]
        },
        "action": "auto_promote",
        "enabled": true
      },
      {
        "name": "verified_news_signal",
        "sandbox_table": "sandbox_signals",
        "conditions": {
          "confidence_score_min": 80,
          "source_url_required": true,
          "signal_types_allowed": ["company_expansion", "new_lease", "sale_closed", "hiring", "market_trend"]
        },
        "action": "auto_promote",
        "enabled": true
      },
      {
        "name": "outreach_never_auto",
        "sandbox_table": "sandbox_outreach",
        "conditions": {},
        "action": "never_auto_promote",
        "enabled": true,
        "reason": "Outreach carries reputation risk — always requires manual review"
      }
    ],
    "monitoring": {
      "accuracy_check_interval_days": 30,
      "min_accuracy_threshold": 0.95,
      "action_on_low_accuracy": "disable_rule_and_alert"
    }
  }
}
```

### Safety Controls

1. **Start disabled** — `"enabled": false` at the top level. David enables when ready (Phase 3F)
2. **Never auto-promote outreach** — email sends carry reputation risk
3. **Additive-only enrichments** — auto-promote can add phone/email but never change existing data
4. **Monthly accuracy audits** — Chief of Staff samples 20 auto-promoted items, verifies accuracy
5. **Auto-disable** — if accuracy drops below 95%, the rule is automatically disabled and David is alerted
6. **Full audit trail** — every auto-promotion logged in JSONL with `auto_promoted: true`

### Dashboard Display

```
Auto-Promotion Stats (This Month)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Items auto-promoted:     47
Manual review bypassed:  ~35 min saved
Accuracy (last audit):   97.5% (39/40 verified correct)
Rules active:            2 of 3
```

---

## #16 — Audit Log Queryability

The JSONL audit log is comprehensive but requires post-processing to query. Add a queryable interface for real-time analysis.

### Dual-Write Strategy

Audit events write to **both**:
1. **JSONL files** (backup, compliance, grep-friendly) — existing system
2. **SQLite database** (queryable, fast lookups) — new addition

SQLite location: `/AI-Agents/logs/audit/audit.db`

### SQLite Schema

```sql
CREATE TABLE IF NOT EXISTS audit_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  agent TEXT NOT NULL,
  action TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  task_type TEXT,
  cost_estimate REAL,
  duration_ms INTEGER,
  severity TEXT,
  target TEXT,
  finding TEXT,
  metadata TEXT,  -- JSON string for flexible fields
  created_date TEXT NOT NULL  -- YYYY-MM-DD for partition-like queries
);

CREATE INDEX idx_audit_agent ON audit_entries(agent);
CREATE INDEX idx_audit_action ON audit_entries(action);
CREATE INDEX idx_audit_date ON audit_entries(created_date);
CREATE INDEX idx_audit_severity ON audit_entries(severity);
```

### Query API Endpoints

Add to the CRM backend (Tier 1 access only):

```
GET /api/ai/audit?agent=enricher&action=injection_detected&last=7d
GET /api/ai/audit?action=auto_promoted&last=30d
GET /api/ai/audit?severity=critical&last=24h
GET /api/ai/audit/summary?group_by=agent&last=7d
```

### Use Cases

- Chief of Staff queries injection patterns without parsing files
- David checks auto-promotion accuracy from Dashboard
- Security audit references recent injection detections
- Cost analysis without waiting for Logger's weekly report

---

## #17 — Crash Recovery Procedures

Each agent needs a documented recovery procedure for unclean shutdowns (power loss, Ollama crash, Mac restart).

### Transaction Journaling

Every agent writes a **work intent** before starting an operation and a **work completion** after:

```json
// Before: write to /AI-Agents/{agent}/journal/current.json
{
  "operation": "enrich_contact",
  "item_id": "llc_789",
  "started_at": "2026-03-25T14:30:00Z",
  "status": "in_progress",
  "steps_completed": []
}

// After each step: update steps_completed
{
  "steps_completed": ["open_corporates_lookup", "white_pages_lookup"]
}

// On completion: delete current.json or mark as "completed"
```

### Idempotency Keys

Prevent duplicate work on restart:

```json
// Each sandbox write includes an idempotency key
{
  "idempotency_key": "enricher_llc_789_2026-03-25",
  "agent_name": "enricher",
  // ... rest of sandbox submission
}
```

The sandbox API checks: does a submission with this idempotency key already exist? If yes, return the existing record (don't create a duplicate).

### Per-Agent Recovery Protocol

**On Agent Startup (after crash or restart):**

1. Check `/AI-Agents/{agent}/journal/current.json`
2. If file exists with `status: "in_progress"`:
   a. Read `steps_completed` to know where it stopped
   b. If step was a sandbox write → check if the write succeeded (query by idempotency key)
   c. If write succeeded → mark journal as completed, move to next item
   d. If write didn't succeed → resume from the incomplete step
   e. Log: "Recovered from crash. Resuming [item_id] at step [step_name]"
3. If no journal file → normal startup

### Supervisor Recovery

The supervisor (parent process) handles fleet-level recovery:

```
On Mac startup / Ollama restart:
  1. Check which agents were running before shutdown
  2. Start agents in dependency order: Logger first → Enricher/Researcher → Matcher → Scout
  3. Each agent runs its own recovery protocol on startup
  4. After all agents report healthy heartbeats → resume normal operations
  5. Log: "System recovered from shutdown. All agents healthy."
```

### Migration 007 Addition

Add idempotency support to sandbox tables:

```sql
ALTER TABLE sandbox_contacts ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE sandbox_enrichments ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE sandbox_signals ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE sandbox_outreach ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
```

---

## 47-Tier Evolution Roadmap Reference

This operations document covers escalation, testing, versioning, retention, and crash recovery for the current agent system. A 5-round deep audit (60 prompts, March 2026) designed additional operational capabilities across 47 tiers:

- **Tier 37:** Agent lifecycle management — PM2 process management, crash recovery with exponential backoff, watchdog daemon
- **Tier 40:** AI Ops Dashboard — fleet status, cycle logs, cost tracking, sandbox queue, activity timeline
- **Tier 43:** Notification infrastructure — Telegram alerts, in-app notifications, daily digest emails, quiet hours
- **Tier 45:** Comprehensive audit trail — per-request change logging with before/after JSONB snapshots
- **Tier 46:** CI/CD pipeline — GitHub Actions, Neon database branching, migration runner
- **Tier 47:** Monitoring & disaster recovery — API metrics, slow query detection, health checks, recovery playbooks

**Full specs:**
- `docs/superpowers/plans/2026-03-13-prompts-49-52-implementation-bridge.md` (agent runtime + lifecycle)
- `docs/superpowers/specs/2026-03-13-prompts-53-56-ops-email-notifications.md` (ops dashboard + notifications)
- `docs/superpowers/specs/2026-03-13-prompts-57-60-rbac-devops.md` (audit trail + CI/CD + DR)

---

*Created: March 2026*
*Updated: March 2026 — Added feedback loop system, auto-promotion rules, audit queryability, crash recovery, 47-tier evolution reference*
*For: IE CRM AI Master System — System Operations*
