# Inter-Agent Coordination System
## How Agents Communicate Without Coupling
### IE CRM AI Master System

---

## Design Philosophy

Agents run **independent loops**. They do NOT call each other directly. Instead, they communicate through a shared **task priority table** in the database — a lightweight event bus that any agent can write to and any agent can read from.

This gives you:
- **Simplicity** — each agent is still a self-contained loop. If one crashes, the others keep running.
- **Coordination** — agents can influence each other's priorities without tight coupling.
- **Visibility** — every cross-agent signal is logged in a table David can see in the Agent Dashboard.
- **Debuggability** — when something goes wrong, you can trace exactly which agent posted which priority and why.

Think of it like a shared whiteboard in an office. Agents don't tap each other on the shoulder — they write notes on the board, and other agents check the board at the start of each work cycle.

---

## The Priority Board (Database Table)

```sql
CREATE TABLE IF NOT EXISTS agent_priority_board (
  id SERIAL PRIMARY KEY,
  -- Who posted this
  source_agent TEXT NOT NULL,          -- agent that created this priority
  source_context TEXT,                 -- what triggered it (e.g., "signal #47", "enrichment #123")
  -- Who should act on it
  target_agent TEXT NOT NULL,          -- which agent should pick this up
  -- What to do
  priority_type TEXT NOT NULL CHECK (priority_type IN (
    'enrich_company',       -- Enricher: prioritize this company's contacts
    'enrich_contact',       -- Enricher: prioritize this specific contact
    'research_company',     -- Researcher: dig deeper on this company
    'research_property',    -- Researcher: find intel on this property
    'match_contact',        -- Matcher: check this contact against recent AIR listings
    'match_property',       -- Matcher: check this property against contact needs
    'verify_email',         -- Enricher: re-verify this email (bounced or flagged)
    'flag_for_outreach',    -- Matcher: this contact + property combo looks promising
    'urgent_review'         -- Tier 2: review this item ASAP, don't wait for next cycle
  )),
  -- Context for the target agent
  payload JSONB NOT NULL DEFAULT '{}', -- flexible data: company_name, contact_id, property_id, etc.
  reason TEXT NOT NULL,                -- human-readable: why this priority was created
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high')),
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'picked_up', 'completed', 'expired', 'skipped')),
  picked_up_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_notes TEXT,                   -- what the target agent did with this
  -- Auto-expiry
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '72 hours'),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_priority_board_target ON agent_priority_board(target_agent, status);
CREATE INDEX idx_priority_board_urgency ON agent_priority_board(urgency, status);
CREATE INDEX idx_priority_board_created ON agent_priority_board(created_at);
CREATE INDEX idx_priority_board_expires ON agent_priority_board(expires_at);
```

---

## How Each Agent Uses the Priority Board

### At the Start of Every Work Cycle

Each agent checks the board before starting its normal loop:

```
1. Query: GET /api/ai/priority-board?target=enricher&status=pending&order=urgency,created_at
2. If high-urgency items exist → work those FIRST, before the normal queue
3. If normal items exist → interleave with regular work (e.g., every 3rd task)
4. If low items exist → work them when the regular queue is empty
5. Mark items as "picked_up" when starting, "completed" when done
```

This means agents are still running their own loops — they just check the board first and adjust priorities accordingly.

### When Posting to the Board

Agents post priorities when their work reveals something another agent should act on. The posting agent does NOT wait for a response. Fire and forget.

---

## Coordination Scenarios

### Scenario 1: Researcher Finds Company Expansion Signal
```
Researcher finds: "Pacific West Holdings expanding, opening new warehouse in Fontana"
        ↓
Researcher submits signal to sandbox_signals (normal workflow)
        ↓
Researcher ALSO posts to priority board:
{
  source_agent: "researcher",
  source_context: "signal #47 — Pacific West Holdings expansion",
  target_agent: "enricher",
  priority_type: "enrich_company",
  payload: {
    company_name: "Pacific West Holdings",
    crm_company_id: 234,          // if found in CRM
    signal_type: "company_expansion",
    reason_detail: "Expanding into Fontana, likely needs new space"
  },
  reason: "Company expansion signal — enriching their contacts could generate deal flow",
  urgency: "high"
}
        ↓
Next Enricher cycle: sees "enrich_company" for Pacific West Holdings
        ↓
Enricher prioritizes looking up all LLCs and contacts associated with that company
        ↓
Enricher marks priority as "completed" with notes on what was found
```

### Scenario 2: Enricher Verifies High-Value Contact
```
Enricher verifies: "John Martinez, VP Operations at ABC Logistics, high confidence"
        ↓
Enricher submits to sandbox_contacts (normal workflow)
        ↓
Enricher ALSO posts to priority board:
{
  source_agent: "enricher",
  source_context: "sandbox_contact #89 — John Martinez, ABC Logistics",
  target_agent: "matcher",
  priority_type: "match_contact",
  payload: {
    contact_name: "John Martinez",
    company_name: "ABC Logistics",
    sandbox_contact_id: 89,
    contact_type: "tenant",
    property_type_interest: "industrial",
    size_range: "20000-50000"       // inferred from company size
  },
  reason: "Newly verified high-confidence contact — check against recent AIR listings",
  urgency: "normal"
}
        ↓
Next Matcher cycle: sees "match_contact" for John Martinez
        ↓
Matcher checks recent AIR listings for industrial space matching ABC Logistics' profile
        ↓
If match found: drafts outreach and submits to sandbox_outreach
        ↓
Matcher marks priority as "completed" with notes
```

### Scenario 3: Multiple Signals About Same Company (Convergence)
```
Day 1: Researcher finds "XYZ Corp hiring 50 warehouse workers in Ontario"
        → Posts enrich_company priority for XYZ Corp (normal urgency)

Day 2: Researcher finds "XYZ Corp lease at 1234 Industrial Ave expiring Q3"
        → Posts another priority for XYZ Corp

Day 2: Enricher completes XYZ Corp contact enrichment
        → Posts match_contact priority for XYZ Corp decision-maker

System now has CONVERGENCE: multiple signals + verified contact = hot lead
        ↓
Logger detects convergence pattern (same company, multiple agents, <48 hours)
        ↓
Logger posts urgent_review priority targeting Tier 2:
{
  source_agent: "logger",
  target_agent: "tier2_validator",
  priority_type: "urgent_review",
  payload: {
    company_name: "XYZ Corp",
    signals: [47, 52],
    contact: 89,
    convergence_score: 3       // number of independent signals
  },
  reason: "CONVERGENCE: 2 signals + 1 verified contact for XYZ Corp in <48 hours",
  urgency: "high"
}
        ↓
Tier 2 sees the convergence, fast-tracks approval, escalates to Tier 1
        ↓
Claude flags in David's morning briefing: "XYZ Corp — multiple signals converging. Consider direct outreach."
```

### Scenario 4: Outreach Email Bounces (Feedback Loop)
```
Outreach email to john@company.com bounces (future email integration)
        ↓
System posts to priority board:
{
  source_agent: "email_system",
  target_agent: "enricher",
  priority_type: "verify_email",
  payload: {
    contact_id: 45,
    bounced_email: "john@company.com",
    bounce_type: "hard"
  },
  reason: "Email bounced — need updated email for this contact",
  urgency: "normal"
}
        ↓
Enricher re-runs verification for contact #45
        ↓
If new email found: submits enrichment to sandbox_enrichments
```

### Scenario 5: Researcher Finds Property Intelligence
```
Researcher finds: "New 50K SF industrial listing at 5678 Hospitality Lane, SB"
        ↓
Researcher submits to sandbox_signals (normal workflow)
        ↓
Researcher posts to priority board:
{
  source_agent: "researcher",
  target_agent: "matcher",
  priority_type: "match_property",
  payload: {
    property_address: "5678 Hospitality Lane, San Bernardino",
    property_type: "industrial",
    sf: 50000,
    asking_rate: 1.15,
    source_url: "https://..."
  },
  reason: "New listing found via web — check against contacts with matching needs",
  urgency: "normal"
}
        ↓
Matcher treats this like an AIR report match — queries CRM for contacts
```

---

## Priority Expiration

Priorities don't live forever:
- **Default TTL: 72 hours** — if not picked up in 3 days, it's stale
- **High urgency: 24 hours** — time-sensitive, expires faster
- **Low urgency: 7 days** — background task, can wait
- A background job (or the Logger) marks expired items as `status = 'expired'`
- Expired items are still queryable for analysis but won't show in active queue

---

## Convergence Detection (Logger's Job)

The Logger agent has an additional responsibility: detecting **convergence** — when multiple independent signals point at the same company, contact, or property within a short time window.

### Convergence Rules:
1. **Same company mentioned by 2+ agents within 48 hours** → high-priority flag
2. **Same company has signal + enriched contact + matching AIR listing** → immediate escalation
3. **3+ signals about the same submarket within 24 hours** → market trend alert
4. **Contact enriched + matching outreach drafted within same day** → fast-track the outreach review

### How Logger Detects Convergence:
- Every hourly aggregation, query the priority board for patterns
- Group by company_name/contact_id/property across the last 48 hours
- If convergence threshold met → post urgent_review to priority board

---

## API Endpoints for Priority Board

```
GET  /api/ai/priority-board
     ?target=enricher          -- filter by target agent
     &status=pending           -- filter by status
     &urgency=high             -- filter by urgency
     &order=urgency,created_at -- sort order

POST /api/ai/priority-board    -- create new priority
     Body: { source_agent, target_agent, priority_type, payload, reason, urgency }

PUT  /api/ai/priority-board/:id/pickup    -- mark as picked_up
PUT  /api/ai/priority-board/:id/complete  -- mark as completed + result_notes
PUT  /api/ai/priority-board/:id/skip      -- mark as skipped + reason
```

---

## Priority Board Enhancements

### Business Value Scoring

Not all priorities are equal. A $10M deal signal should jump the queue over a $500K one. Add estimated business value to priority board posts:

```json
{
  "source_agent": "researcher",
  "target_agent": "enricher",
  "priority_type": "enrich_company",
  "urgency": "high",
  "estimated_value": "high",
  "payload": {
    "company_name": "Pacific West Holdings",
    "estimated_deal_size": "5000000",
    "value_basis": "50K SF at $1.00/SF/mo = $600K/yr, 8-year lease likely"
  },
  "reason": "Large tenant expansion signal — high-value enrichment"
}
```

Agents use `estimated_value` (low/medium/high) as a secondary sort after urgency. Chief of Staff monitors whether high-value items are processed faster.

### Dependency Chains (Linked Workflows)

Some workflows need multiple agents in sequence. Instead of relying on agents to independently discover related work, link priorities explicitly:

```json
{
  "source_agent": "researcher",
  "target_agent": "enricher",
  "priority_type": "enrich_company",
  "chain_id": "chain_xyz_corp_2026_03_25",
  "chain_sequence": 1,
  "chain_total": 3,
  "chain_next": {
    "target_agent": "matcher",
    "priority_type": "match_contact",
    "auto_post": true
  },
  "payload": { "company_name": "XYZ Corp" },
  "reason": "Step 1/3: Enrich → Match → Draft Outreach for XYZ Corp"
}
```

When Enricher completes this priority:
1. Marks priority as `completed`
2. System auto-posts the `chain_next` priority to Matcher with enrichment results in payload
3. Matcher completes → auto-posts the next step (if any)

**Rules:**
- Chains are optional — normal fire-and-forget priorities still work
- If a step fails, the chain stops and logs the failure
- Max chain length: 5 steps (prevent runaway chains)
- Chief of Staff can view active chains in the Dashboard

### Completion Callbacks

When Agent A posts a task for Agent B, Agent A may want to know the result:

```json
{
  "source_agent": "enricher",
  "target_agent": "matcher",
  "priority_type": "match_contact",
  "callback_requested": true,
  "payload": { "contact_name": "John Martinez", "sandbox_contact_id": 89 }
}
```

When Matcher completes this priority, the board creates a `callback` entry visible to Enricher:

```json
{
  "source_agent": "matcher",
  "target_agent": "enricher",
  "priority_type": "callback",
  "payload": {
    "original_priority_id": 234,
    "result": "3 matches found, 2 outreach drafted",
    "matched_properties": [12, 45, 67]
  }
}
```

Enricher sees this on its next cycle and can update its own state.

### Priority Board Table Updates

Add these columns to the `agent_priority_board` table (migration 007 addition):

```sql
ALTER TABLE agent_priority_board ADD COLUMN IF NOT EXISTS estimated_value TEXT DEFAULT 'medium'
  CHECK (estimated_value IN ('low', 'medium', 'high'));
ALTER TABLE agent_priority_board ADD COLUMN IF NOT EXISTS chain_id TEXT;
ALTER TABLE agent_priority_board ADD COLUMN IF NOT EXISTS chain_sequence INTEGER;
ALTER TABLE agent_priority_board ADD COLUMN IF NOT EXISTS chain_next JSONB;
ALTER TABLE agent_priority_board ADD COLUMN IF NOT EXISTS callback_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE agent_priority_board ADD COLUMN IF NOT EXISTS callback_for_priority_id INTEGER REFERENCES agent_priority_board(id);

CREATE INDEX idx_priority_board_chain ON agent_priority_board(chain_id);
CREATE INDEX idx_priority_board_value ON agent_priority_board(estimated_value, urgency, status);
```

---

## What This is NOT

- **Not a message queue** — agents don't wait for responses. Fire and forget (unless using dependency chains).
- **Not required** — if no priorities are on the board, agents run their normal loops. The board enhances, it doesn't replace.
- **Not real-time** — agents check the board at the start of each cycle. Speed of hours, not seconds.
- **Not blocking** — even with dependency chains, Agent A does NOT wait. It posts and moves on. The chain auto-advances when steps complete.

---

## Adding the Table to Migration 007

Add the `agent_priority_board` table to `007_ai_sandbox.sql` alongside the other agent infrastructure tables. Include the enhancement columns (estimated_value, chain fields, callback fields) from the start.

---

## How This Looks in the Agent Dashboard

The priority board gets its own section in the Agent Dashboard UI:

### "Cross-Agent Activity" Panel
- Live feed of recent priority board entries
- Shows: source agent → target agent, priority type, urgency badge, status
- Color coding: high urgency = red, normal = blue, low = gray
- Estimated value badge: high = gold star, medium = silver, low = none
- Convergence alerts highlighted with a special badge
- Active chains shown as connected nodes (click to see full chain)
- Click to expand and see full payload + result

---

## 47-Tier Evolution Roadmap Reference

This coordination document covers the priority board pattern for inter-agent communication. A 5-round deep audit (60 prompts, March 2026) designed additional coordination capabilities:

- **Tier 9:** Cross-agent intelligence — shared entity context cache, signal fusion across agents
- **Tier 38:** Multi-Mac coordination — agent_registry table, distributed locking (agent_locks), shared memory directories, fleet split strategy across Mac Mini + Mac Studio
- **Tier 40:** AI Ops Dashboard — unified activity timeline showing cross-agent activity and sandbox queue

**Full specs:**
- `docs/superpowers/plans/2026-03-13-prompts-13-16-agent-learning-loops.md` (cross-agent learning)
- `docs/superpowers/plans/2026-03-13-prompts-49-52-implementation-bridge.md` (multi-Mac coordination)
- `docs/superpowers/specs/2026-03-13-prompts-53-56-ops-email-notifications.md` (AI Ops dashboard)

---

*Created: March 2026*
*Updated: March 2026 — Added business value scoring, dependency chains, completion callbacks, 47-tier evolution reference*
*For: IE CRM AI Master System — Inter-Agent Coordination*
