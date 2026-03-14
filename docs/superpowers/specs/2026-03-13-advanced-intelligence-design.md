# Advanced Intelligence Systems — Prompts 21-24
# Regression-Aware Self-Improvement, Emergent Behavior Detection,
# Competitive Intelligence Loop, David Model

**Date:** 2026-03-13
**Status:** Design Spec
**Scope:** Four advanced capabilities layered onto the existing AI Master System

---

## Overview

These four capabilities transform the AI system from a well-orchestrated agent fleet into a genuinely self-aware, self-correcting intelligence platform. They address the four hardest problems in autonomous AI systems: safe self-modification, emergent failure detection, competitive learning, and user preference modeling.

| # | Capability | Core Problem | Key Deliverable |
|---|-----------|-------------|----------------|
| 21 | Regression-Aware Self-Improvement | Instruction rewrites can silently degrade | Canary deployment with multi-dimensional scoring |
| 22 | Emergent Behavior Detection | Scaling creates cascading failures nobody anticipated | Statistical anomaly detector with auto-throttle |
| 23 | Competitive Intelligence Loop | Competitor wins are learning opportunities being wasted | Active competitive learning → TPE scoring adjustments |
| 24 | The David Model | David's daily CRM actions encode strategy nobody captures | Preference profile that improves recommendations |

---

---

# PROMPT 21: Regression-Aware Self-Improvement

## Current State Analysis

The Chief of Staff already rewrites agent instructions based on daily log analysis (see `agent-templates/chief-of-staff.md`, Steps 5-7). Versioning exists — every `agent.md` has version metadata, previous versions are saved to `/versions/`, and a `version-log.json` tracks history (see `OPERATIONS.md` Section 8). The rollback protocol is defined: if approval rate drops, Claude copies the old `agent.md` back.

**What works:**
- Version metadata with change reasoning
- Backup of previous versions before overwriting
- Basic rollback trigger: "approval rate dropped from 82% to 61%"
- One-change-at-a-time principle

**What's missing (the gap):**

1. **No pre-deployment testing.** The instruction change goes live immediately. There's no way to test it before agents run with it.
2. **Single-dimensional regression check.** Only approval rate is monitored. A change could improve approval rate by being more conservative — while silently killing recall (missing good leads).
3. **No held-out test data.** The system has no curated evaluation set to test instruction changes against.
4. **No Pareto analysis.** No framework for reasoning about trade-offs across multiple metrics.
5. **Overfitting risk.** If the test set is static, the Chief of Staff will optimize instructions to pass the test set, not to perform well on novel data.
6. **No human-in-the-loop for trade-off decisions.** Some regressions are acceptable if a different dimension improves. David should decide these trade-offs, not the system.

## Proposed Design

### 21.1 — Canary Evaluation Pipeline

Before any instruction change goes live, the Chief of Staff runs a canary evaluation. The pipeline is:

```
Chief of Staff identifies instruction change needed
    |
    v
[1] Save proposed instruction to /AI-Agents/{agent}/candidates/agent-vX.Y-candidate.md
    |
    v
[2] Load the held-out evaluation set for that agent
    |
    v
[3] Run BOTH current and candidate instructions against evaluation set
    |  (same inputs, same mock responses, different instructions)
    |
    v
[4] Score both on multiple dimensions (see scorecard below)
    |
    v
[5] Pareto comparison — is candidate strictly better?
    |
    |-- YES on all dimensions -------> Auto-promote to live
    |-- Better on some, worse on others -> Generate trade-off report for David
    |-- Worse on all dimensions -----> Auto-reject, log reasoning
    |
    v
[6] If promoted: move candidate to agent.md, archive old version
    If deferred: write trade-off report to David's morning briefing
```

### 21.2 — Multi-Dimensional Scorecard

Each evaluation run produces a scorecard with these dimensions:

```
┌─────────────────────────────────────────────────────────────────┐
│ CANARY SCORECARD — Enricher v1.3 → v1.4 candidate             │
│ Evaluation set: 40 items (20 curated + 20 recent production)   │
│ Date: 2026-04-15                                               │
├─────────────────┬──────────┬───────────┬────────┬──────────────┤
│ Dimension       │ Current  │ Candidate │ Delta  │ Verdict      │
├─────────────────┼──────────┼───────────┼────────┼──────────────┤
│ Precision       │ 0.88     │ 0.91      │ +0.03  │ BETTER       │
│ Recall          │ 0.82     │ 0.79      │ -0.03  │ WORSE        │
│ Latency (avg)   │ 2.1s     │ 2.3s      │ +0.2s  │ NEUTRAL      │
│ Cost (avg/item) │ $0.012   │ $0.014    │ +$0.002│ NEUTRAL      │
│ Edge cases      │ 14/16    │ 15/16     │ +1     │ BETTER       │
│ Junk rejection  │ 18/20    │ 19/20     │ +1     │ BETTER       │
│ False negatives │ 3/40     │ 5/40      │ +2     │ WORSE        │
├─────────────────┴──────────┴───────────┴────────┴──────────────┤
│ PARETO RESULT: NOT Pareto-better (precision up, recall down)   │
│ RECOMMENDATION: Defer to David — trade-off decision required   │
│ TRADE-OFF: +3% precision / -3% recall / +1 edge case handled  │
└─────────────────────────────────────────────────────────────────┘
```

**Dimension definitions by agent:**

| Agent | Precision | Recall | Edge Cases | Cost | Latency |
|-------|-----------|--------|------------|------|---------|
| Enricher | % of submitted contacts that would be approved | % of good contacts not missed (false negatives) | Registered agent services, dissolved LLCs, common names, multi-state entities | API calls per item | Time per enrichment cycle |
| Researcher | % of signals marked relevant that actually are | % of real market events captured | Paywalled sources, ambiguous company names, cross-market signals | Tokens per research cycle | Time per source scan |
| Matcher | % of drafted outreach that's relevant to recipient | % of good matches not missed | Multi-property owners, tenant vs owner confusion, size range edge cases | Tokens per match | Time per AIR report |

### 21.3 — Evaluation Set Management

The evaluation set is the foundation. It must be curated, diverse, and regularly refreshed to prevent overfitting.

**File structure:**
```
/AI-Agents/test-harness/
├── evaluation-sets/
│   ├── enricher/
│   │   ├── curated/          # Hand-picked by David or CoS — permanent
│   │   │   ├── set-v1.json   # Original 20 items
│   │   │   ├── set-v2.json   # Refreshed Q2 2026
│   │   │   └── metadata.json # When created, what each item tests
│   │   ├── production/       # Auto-sampled from recent production
│   │   │   └── rolling-20.json  # Last 20 approved+rejected items
│   │   └── adversarial/      # Items that broke previous versions
│   │       └── regressions.json # Every item that triggered a rollback
│   ├── researcher/
│   │   ├── curated/
│   │   ├── production/
│   │   └── adversarial/
│   └── matcher/
│       ├── curated/
│       ├── production/
│       └── adversarial/
```

**Evaluation set item format (Enricher example):**

```json
{
  "id": "eval-enr-017",
  "category": "edge_case",
  "description": "Common name with registered agent service — should detect CT Corp and score low",
  "input": {
    "entity_name": "PACIFIC HOLDINGS LLC",
    "registered_agent": "CT CORPORATION SYSTEM",
    "state": "CA",
    "address": "818 West 7th Street, Los Angeles, CA 90017"
  },
  "mock_responses": {
    "open_corporates": { "status": "active", "agent_name": "CT Corporation System", "agent_address": "818 W 7th St..." },
    "white_pages": { "results": [{"name": "John Pacific", "address": "..."}] },
    "been_verified": { "results": [] }
  },
  "expected_behavior": {
    "should_skip_prefilter": false,
    "should_detect_registered_agent": true,
    "confidence_range": [0, 40],
    "should_flag": true,
    "should_not": ["score above 70", "trigger NeverBounce"]
  },
  "added_by": "chief_of_staff",
  "added_at": "2026-04-01",
  "added_reason": "v1.2 scored this 78 and promoted — it was a registered agent service"
}
```

### 21.4 — Anti-Overfitting Mechanisms

The evaluation set is powerful but dangerous. If it's static, the CoS will unconsciously optimize instructions to pass the known test cases while failing on novel data.

**Mechanism 1: Rolling Production Sample**
- Every week, the 20-item production sample is refreshed from the most recent approved and rejected sandbox items
- 70% approved items (to test recall), 30% rejected items (to test precision)
- Old production samples are archived, never reused in the same quarter

**Mechanism 2: Adversarial Growth**
- Every regression (an instruction change that was rolled back) adds the failing item to `regressions.json`
- This set only grows — it's the system's institutional memory of past mistakes
- New instruction candidates must pass ALL regression items (zero-tolerance)

**Mechanism 3: Quarterly Curated Refresh**
- Every 3 months, David reviews and refreshes the curated set
- Remove items the system has "learned" (always gets right now — they no longer test anything)
- Add new edge cases discovered in production
- Ensure coverage: at least 2 items per property type, per geography, per entity type

**Mechanism 4: Blind Spot Detection**
- Monthly, the CoS generates a "coverage report" — which categories in the evaluation set are well-represented vs thin
- If >80% of eval items are industrial/IE, the set has geographic/property-type bias
- CoS proposes additions to fill gaps

### 21.5 — Regression Response Protocol

When a regression is detected (post-promotion, live performance degrades):

```
Performance monitoring detects regression
    |
    v
[1] IMMEDIATE: Rollback to previous instruction version
    - Copy current agent.md to /versions/agent-vX.Y-regressed.md
    - Restore previous version as agent.md
    - Log rollback in version-log.json with full context
    |
    v
[2] INVESTIGATE: Identify which eval dimension degraded
    - Query agent_daily_kpis for before/after comparison
    - Identify specific items that failed post-change
    |
    v
[3] LEARN: Add failing items to adversarial set
    - Every item that the new instruction got wrong goes into regressions.json
    - These items become permanent constraints on future changes
    |
    v
[4] REPORT: Include in next morning briefing
    - "Enricher v1.4 rolled back to v1.3. Precision improved +3% but recall
       dropped -7%. 5 good contacts were missed that v1.3 would have caught."
    - Ask David: "Should I attempt a revised v1.4 that addresses recall?"
    |
    v
[5] RETRY (with constraints): Any revised attempt must:
    - Pass the adversarial set (including newly added items)
    - Pass the full canary evaluation
    - Show Pareto improvement OR get David's explicit trade-off approval
```

### 21.6 — Database Support

**New table: `canary_evaluations`**

```sql
CREATE TABLE IF NOT EXISTS canary_evaluations (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  current_version TEXT NOT NULL,
  candidate_version TEXT NOT NULL,
  -- Scorecard (JSON for flexibility across agent types)
  scorecard JSONB NOT NULL,
  -- Decision
  pareto_result TEXT NOT NULL CHECK (pareto_result IN (
    'pareto_better', 'trade_off', 'pareto_worse'
  )),
  decision TEXT NOT NULL CHECK (decision IN (
    'auto_promoted', 'deferred_to_david', 'auto_rejected', 'david_approved', 'david_rejected'
  )),
  decision_reasoning TEXT,
  -- Evaluation set metadata
  eval_set_size INTEGER,
  eval_set_composition JSONB, -- {"curated": 20, "production": 20, "adversarial": 8}
  -- Timestamps
  evaluated_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT -- 'chief_of_staff' or 'david'
);

CREATE INDEX idx_canary_agent ON canary_evaluations(agent_name);
CREATE INDEX idx_canary_decision ON canary_evaluations(decision);
```

### 21.7 — Integration Points

| Existing Component | Change Required |
|---|---|
| `chief-of-staff.md` Step 5 | Add pre-change gate: "Before writing instruction updates, run canary evaluation" |
| `OPERATIONS.md` Section 8 | Add canary evaluation to version protocol |
| `ORCHESTRATION.md` supervisor | Add `canary-evaluate` command to agentctl |
| Test harness (`/test-harness/`) | Add evaluation set loader + scorecard generator |
| Morning briefing (Step 8) | Add trade-off reports when canary defers to David |
| `agent_daily_kpis` (future) | Feed live regression detection |

### 21.8 — Implementation Priority

| Step | Effort | Priority |
|---|---|---|
| Define scorecard dimensions per agent | Low | P0 — do first |
| Build curated evaluation sets (20 items each) | Medium | P0 — do first |
| Build canary evaluation runner (mock-based) | Medium | P1 — week 2 |
| Add production sample auto-refresh | Low | P2 — after first month of production data |
| Add adversarial set growth | Low | P2 — after first rollback |
| Build trade-off report format for briefings | Low | P1 |
| Database table + Dashboard integration | Medium | P3 |

---

---

# PROMPT 22: Emergent Behavior Detection

## Current State Analysis

The system has basic health monitoring:
- Agent heartbeats every 60 seconds (`agent_heartbeats` table)
- Error logging to `agent_logs`
- Alert-only health checks every 30 minutes (`OPERATIONS.md` Section 12)
- Priority board flood protection: max 10 per source-target per hour (`COORDINATION.md`)
- Escalation protocol for known failure modes (`OPERATIONS.md` Section 6)

**What works:**
- Individual agent monitoring (is it alive? is it erroring?)
- Basic flood protection on the priority board
- Escalation chain for known failure types

**What's missing (the gap):**

1. **No system-level anomaly detection.** Individual agents are monitored, but nobody watches the interactions between agents for emergent patterns.
2. **No distribution tracking.** If enrichment time gradually drifts from 2s to 8s, no alert fires because it's not an "error."
3. **No cost spike detection.** If the Enricher suddenly starts making 5x more API calls per item, the cost tracker records it but nobody notices until the monthly bill.
4. **No cycle detection.** If Researcher posts a priority for Enricher, which triggers a priority for Researcher, which triggers Enricher again — infinite loop. The priority board TTL (72h) eventually kills it, but not before wasting resources.
5. **No resource contention detection.** When two agents both need Qwen 3.5 and one is starving.
6. **No statistical baselines.** Without knowing what "normal" looks like, you can't detect "abnormal."

## Proposed Design

### 22.1 — The Emergent Behavior Detector (EBD)

A new monitoring layer that runs inside the supervisor, analyzing system-wide patterns that no individual agent can see. It watches for five categories of emergent behavior:

```
Supervisor Process (agent-supervisor.py)
    |
    ├── Agent Management (existing)
    |   ├── Start/stop/restart agents
    |   ├── Health checks
    |   └── Resource allocation
    |
    └── Emergent Behavior Detector (NEW)
        ├── [A] Processing Time Monitor
        ├── [B] Cost Spike Detector
        ├── [C] Agent Interaction Analyzer
        ├── [D] Cycle Detector
        └── [E] Resource Contention Monitor
        |
        └── When anomaly detected:
            ├── Auto-throttle affected agent(s)
            ├── Log to JSONL audit log (action: 'ebd_anomaly')
            ├── Alert Chief of Staff with diagnosis
            └── Alert David via Telegram if severity >= high
```

### 22.2 — Statistical Baselines

The EBD needs to know what "normal" looks like before it can detect "abnormal." Baselines are built from the first 2 weeks of production data, then continuously updated.

**Baseline metrics tracked per agent:**

```json
{
  "agent": "enricher",
  "baseline_window": "2026-04-01 to 2026-04-14",
  "metrics": {
    "items_per_hour": { "mean": 12.4, "std": 3.2, "p95": 18, "p5": 6 },
    "processing_time_ms": { "mean": 2100, "std": 450, "p95": 3200, "p5": 1400 },
    "api_calls_per_item": { "mean": 3.8, "std": 0.6, "p95": 5, "p5": 3 },
    "cost_per_item_cents": { "mean": 1.2, "std": 0.4, "p95": 2.1, "p5": 0.8 },
    "confidence_score_avg": { "mean": 68, "std": 12 },
    "sandbox_writes_per_hour": { "mean": 8.2, "std": 2.5 },
    "priority_posts_per_hour": { "mean": 1.8, "std": 1.1 },
    "error_rate": { "mean": 0.03, "std": 0.02 }
  },
  "updated_at": "2026-04-14T06:00:00Z"
}
```

**Baseline update protocol:**
- Recalculate weekly using an exponentially weighted moving average (EWMA)
- Alpha = 0.3 (recent data weighted more heavily, but not amnesia)
- Only include data from non-anomalous periods (exclude hours where EBD fired)
- Store baseline history so you can see drift over time

**File:** `/AI-Agents/ebd/baselines/{agent}-baseline.json`

### 22.3 — Detector Specifications

#### [A] Processing Time Distribution Monitor

**What it watches:** Per-agent processing time per item, tracked via JSONL audit log entries.

**Detection method:** Modified Z-score using median absolute deviation (MAD) — more robust to outliers than mean/std.

```
modified_z = 0.6745 × (x - median) / MAD

If modified_z > 3.5 for a single item: log as outlier (don't alert)
If rolling 10-item median > baseline p95: ALERT — systematic slowdown
If rolling 10-item median < baseline p5: ALERT — suspiciously fast (skipping steps?)
```

**Why MAD instead of standard deviation:** Processing times have fat tails (occasional slow API responses). Standard Z-scores would either miss real slowdowns or fire constantly on normal tail events. MAD is resistant to the occasional 10-second API timeout.

**Throttle action:** If systematic slowdown detected, reduce that agent's concurrency or batch size. Don't stop it — just slow it down until the root cause is identified.

#### [B] Cost Spike Detector

**What it watches:** Cost per item (from JSONL `llm_call` and `api_call` entries), aggregated hourly.

**Detection method:** CUSUM (Cumulative Sum) control chart — specifically designed to detect sustained shifts, not just spikes.

```
CUSUM tracks cumulative deviation from the target (baseline mean):
  S_high(t) = max(0, S_high(t-1) + (x_t - target - slack))
  S_low(t)  = max(0, S_low(t-1)  + (target - slack - x_t))

Parameters:
  target = baseline mean cost per item
  slack  = 0.5 × baseline std (allows normal variation)
  threshold = 5 × baseline std (triggers alert)

When S_high > threshold: ALERT — sustained cost increase
When S_low > threshold:  INFO — sustained cost decrease (might mean skipping steps)
```

**Why CUSUM instead of simple thresholds:** A flat threshold ("alert if cost > $X") misses gradual drift and false-alarms on single expensive items. CUSUM accumulates small deviations, catching the pattern where cost creeps up $0.001/item over 200 items.

**Throttle action:** If cost spike is from a specific external API, pause that API's agent and fall back to cached/mock responses. If cost spike is from LLM calls, check if the agent is in a retry loop and cap retries.

#### [C] Agent Interaction Pattern Analyzer

**What it watches:** Priority board activity — who posts for whom, how often, and whether patterns change.

**Detection method:** Build an agent interaction graph (directed, weighted by volume) and detect anomalies in edge weights.

```
Normal interaction pattern (baseline):
  Researcher → Enricher:   ~5 priorities/day
  Enricher → Matcher:      ~3 priorities/day
  Matcher → Enricher:      ~0.5 priorities/day (bounce-backs)
  Logger → Tier2:          ~1 priority/day (convergence alerts)

Anomaly indicators:
  1. Edge weight > 3× baseline for any pair    → PRIORITY FLOOD
  2. New edge appears (agents that never interact) → UNEXPECTED COUPLING
  3. Total priority volume > 5× daily baseline → SYSTEM-WIDE FLOOD
  4. Single agent accounts for >60% of all posts → AGENT DOMINATION
```

**Detection method for floods:** Sliding window counter with exponential decay. If the count in any 1-hour window exceeds 3x the hourly baseline, fire.

**Throttle action:** Rate-limit the flooding agent's priority board writes. The existing "max 10 per source-target per hour" in COORDINATION.md is the first line of defense; the EBD adds a second layer that can dynamically lower this limit when a flood pattern is detected.

#### [D] Cycle Detector

**What it watches:** Priority board chains — A triggers B triggers A.

**Detection method:** Directed graph cycle detection using a sliding window of recent priority board entries.

```
Build a graph from the last 100 priority board entries:
  - Node = (agent, entity)  — e.g., (enricher, "Pacific Holdings LLC")
  - Edge = priority post

Run DFS-based cycle detection:
  If cycle found with length ≤ 4 and all entries within last 24 hours:
    → ALERT: Cyclic dependency detected

Example cycle:
  researcher posts enrich_company("XYZ Corp") → enricher
  enricher posts research_company("XYZ Corp") → researcher  (new signal found)
  researcher posts enrich_company("XYZ Corp") → enricher   (CYCLE)
```

**Prevention (proactive):** Before posting a priority, check if the same (source_agent, target_agent, entity) combination exists in `pending` or `picked_up` status within the last 24 hours. If so, skip the post and log `action: 'cycle_prevented'`.

**Throttle action:** When a cycle is detected, mark all entries in the cycle as `expired` and post a single `urgent_review` to the Chief of Staff with the full cycle trace.

#### [E] Resource Contention Monitor

**What it watches:** Ollama model loading/unloading, inference queue depth, GPU memory pressure.

**Detection method:** Poll Ollama's API (`/api/ps`) every 30 seconds. Track:

```json
{
  "models_loaded": ["qwen-3.5-20b", "minimax-2.5"],
  "gpu_memory_used_gb": 22.4,
  "gpu_memory_total_gb": 48.0,
  "inference_queue": {
    "qwen-3.5-20b": 0,
    "minimax-2.5": 2
  }
}
```

**Anomaly indicators:**
1. Inference queue depth > 5 for any model for > 2 minutes → CONTENTION
2. GPU memory > 90% of total → MEMORY PRESSURE
3. Model swap detected (model unloaded + reloaded) > 3 times in 1 hour → THRASHING
4. One agent's inference time increasing while another agent's throughput spikes → STARVATION

**Throttle action:** Implement priority-based inference scheduling:
- High-urgency priority board items get inference priority
- If contention detected, pause the lower-priority agent's batch processing (not its heartbeat)
- If memory pressure detected, reduce context window sizes for batch operations

### 22.4 — Alert and Diagnosis Format

When the EBD fires, it generates a structured diagnosis:

```json
{
  "alert_type": "ebd_anomaly",
  "detector": "cost_spike",
  "severity": "high",
  "agent_affected": "enricher",
  "diagnosis": {
    "metric": "cost_per_item",
    "baseline": 1.2,
    "current": 4.8,
    "deviation": "4x baseline",
    "trend": "increasing over last 2 hours",
    "probable_cause": "White Pages API returning paginated results requiring extra calls",
    "evidence": [
      "api_call count per item increased from 3.8 to 9.2",
      "White Pages calls specifically increased 3x",
      "Other API call counts unchanged"
    ]
  },
  "throttle_applied": {
    "action": "Reduced enricher batch size from 10 to 3",
    "duration": "Until next CoS review or 4 hours (whichever first)"
  },
  "recommended_response": "Check White Pages API — may have changed pagination or rate limiting. Review last 50 enricher audit log entries.",
  "timestamp": "2026-04-20T14:23:00Z"
}
```

### 22.5 — Threshold Tuning and False Alarm Management

**The cold start problem:** During the first 2 weeks, there are no baselines. Run the EBD in observation-only mode — log everything, alert on nothing. After 2 weeks of data, calculate initial baselines and switch to alerting mode.

**Threshold tuning schedule:**
- Week 1-2: Observation only (no alerts)
- Week 3-4: Alert but don't throttle (human reviews all alerts)
- Month 2+: Full auto-throttle enabled, thresholds tuned based on false alarm rate

**False alarm tracking:**

```json
{
  "alert_id": "ebd-2026-04-20-007",
  "was_false_alarm": true,
  "resolution": "White Pages returned extra results for a common name — normal behavior for this entity type",
  "threshold_adjustment": "Increased cost_per_item slack from 0.5σ to 0.8σ for entities with common names"
}
```

**Target:** < 2 false alarms per week. If false alarm rate exceeds this:
1. CoS reviews which detector is noisy
2. Increase that detector's slack parameter by 25%
3. If still noisy after 2 adjustments, add the specific pattern to a whitelist

**File:** `/AI-Agents/ebd/false-alarms.json` — tracks every false alarm and resulting threshold adjustment. This is the EBD's own self-improvement loop.

### 22.6 — Database Support

**New table: `ebd_alerts`**

```sql
CREATE TABLE IF NOT EXISTS ebd_alerts (
  id SERIAL PRIMARY KEY,
  detector TEXT NOT NULL, -- 'processing_time', 'cost_spike', 'interaction_pattern', 'cycle', 'contention'
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'high', 'critical')),
  agent_affected TEXT NOT NULL,
  diagnosis JSONB NOT NULL,
  throttle_applied JSONB,
  -- Resolution
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved', 'false_alarm')),
  resolution_notes TEXT,
  was_false_alarm BOOLEAN DEFAULT FALSE,
  threshold_adjusted BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ebd_alerts_status ON ebd_alerts(status);
CREATE INDEX idx_ebd_alerts_severity ON ebd_alerts(severity, status);
CREATE INDEX idx_ebd_alerts_agent ON ebd_alerts(agent_affected);
CREATE INDEX idx_ebd_alerts_detector ON ebd_alerts(detector);
```

### 22.7 — Integration Points

| Existing Component | Change Required |
|---|---|
| `ORCHESTRATION.md` supervisor | Add EBD as a background thread in the supervisor process |
| `COORDINATION.md` priority board | Add cycle prevention check before priority post |
| `OPERATIONS.md` health checks | Add EBD status to 30-minute health check |
| Morning briefing | Include EBD alerts (high/critical) in system health section |
| Telegram alerts | Route critical EBD alerts directly to Telegram |
| Agent Dashboard | Add "System Behavior" panel showing EBD baselines vs actuals |
| JSONL audit log | Add `ebd_anomaly`, `ebd_throttle`, `cycle_prevented` action types |

### 22.8 — Implementation Priority

| Step | Effort | Priority |
|---|---|---|
| Baseline collection (2 weeks of observation) | Low | P0 — runs automatically from day 1 |
| Processing time monitor [A] | Low | P1 — most common failure mode |
| Cycle detector [D] | Low | P1 — prevents infinite loops |
| Cost spike detector [B] | Medium | P2 — important but cost tracker provides some visibility already |
| Interaction pattern analyzer [C] | Medium | P2 — becomes critical at scale |
| Resource contention monitor [E] | Medium | P3 — only matters on Mac Mini with 48GB; less critical on Mac Studio |
| Dashboard integration | Medium | P3 |
| False alarm tuning automation | Low | P3 — after 1 month of production alerts |

---

---

# PROMPT 23: Competitive Intelligence as Continuous Learning

## Current State Analysis

The Researcher already monitors competitor activity as an idle-cycle task (see `agent-templates/researcher.md`, Idle-Cycle Activity #4: Competitor Monitoring). The Scout tracks CRE/proptech competitors at the technology level (see `agent-templates/scout.md`, CRE & Proptech Intelligence). Signals go into `sandbox_signals` with type `competitive_intel`.

**What works:**
- Researcher passively observes competitor listings, team moves, marketing
- Scout tracks competitor technology (Reonomy, CompStak, Cherre, Buildout)
- Signals are submitted with `competitive_intel` type
- CoS sees them in daily review

**What's missing (the gap):**

1. **No feedback loop from competitor wins.** When a competitor broker wins a deal, the system doesn't analyze why or update its strategy.
2. **No connection to David's contacts.** When a competitor closes a deal, the system doesn't check if that deal involved contacts David already has in his CRM.
3. **No TPE scoring adjustment.** Competitor intelligence doesn't feed back into the scoring system that prioritizes David's outreach.
4. **No systematic competitor tracking.** Individual signals come in, but there's no structured model of "Competitor X has won deals A, B, C with pattern Y."
5. **No enrichment trigger.** When a competitor wins a deal, the losing/adjacent contacts are prime outreach targets — but nobody queues them.
6. **Privacy/ethics guardrails undefined.** How far is too far in monitoring competitors?

## Proposed Design

### 23.1 — Competitive Learning Loop Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   COMPETITIVE LEARNING LOOP                       │
│                                                                   │
│  [1] DETECT: Researcher finds competitor deal closed              │
│      Sources: CoStar, GlobeSt, county records, press releases     │
│      Signal type: 'competitor_deal_closed'                        │
│              │                                                    │
│              v                                                    │
│  [2] CROSS-REFERENCE: Check IE CRM for involvement               │
│      - Did any of David's contacts own/lease that property?       │
│      - Did David have that property in his pipeline?              │
│      - Was the tenant a company David was tracking?               │
│              │                                                    │
│              v                                                    │
│  [3] ANALYZE: Why did the competitor win?                         │
│      - Timing: Did they reach the client first?                   │
│      - Relationship: Did they have existing relationship?         │
│      - Specialization: Was it their niche (property type/submarket)? │
│      - Pricing: Was it a price-sensitive deal?                    │
│      - Speed: Did they close faster?                              │
│              │                                                    │
│              v                                                    │
│  [4] LEARN: Update TPE scoring and strategy                       │
│      - If timing was the factor → increase lease_expiry weight    │
│      - If submarket specialization → expand research coverage     │
│      - If speed → adjust outreach urgency thresholds              │
│              │                                                    │
│              v                                                    │
│  [5] ACT: Queue enrichment and outreach                           │
│      - Add competitor's known clients to enrichment queue         │
│      - Flag properties in same submarket for increased monitoring │
│      - Post priority board items for Matcher                      │
│              │                                                    │
│              v                                                    │
│  [6] BRIEF: Include in morning briefing                           │
│      - "Competitor X closed a 30K SF industrial lease in Ontario" │
│      - "3 contacts in your CRM were adjacent to this deal"       │
│      - "Recommendation: reach out to [contact] before they do"   │
└──────────────────────────────────────────────────────────────────┘
```

### 23.2 — Competitor Profile Model

Track structured profiles for the top 5-10 competitors David cares about:

**File:** `/AI-Agents/researcher/memory/competitors/{competitor-slug}.json`

```json
{
  "broker_name": "Mike Chen",
  "brokerage": "CBRE",
  "slug": "mike-chen-cbre",
  "focus_areas": {
    "property_types": ["industrial", "logistics"],
    "submarkets": ["Ontario", "Rancho Cucamonga", "Fontana"],
    "deal_size_range": [15000, 100000],
    "typical_client": "institutional_investor"
  },
  "known_deals": [
    {
      "date": "2026-03-01",
      "type": "lease",
      "property": "1234 Inland Empire Blvd, Ontario",
      "sf": 45000,
      "tenant": "Amazon Logistics",
      "deal_value_est": 3100000,
      "source": "CoStar news",
      "source_url": "https://...",
      "crm_contacts_involved": [234, 567],
      "analysis": {
        "win_factor": "existing_relationship",
        "detail": "CBRE had prior relationship with Amazon from 3 other IE deals",
        "timing": "Tenant's lease was expiring Q2 — Chen was 6 months ahead",
        "lessons": ["Monitor Amazon lease expirations", "Increase logistics sector coverage"]
      }
    }
  ],
  "patterns": {
    "win_rate_by_property_type": {"industrial": 0.7, "office": 0.3},
    "avg_deal_size_sf": 42000,
    "avg_days_to_close": 45,
    "preferred_submarket": "Ontario",
    "observed_strategy": "Focuses on repeat institutional clients. Rarely cold-prospects. Wins on relationship depth, not speed."
  },
  "total_deals_tracked": 8,
  "last_updated": "2026-03-25"
}
```

### 23.3 — Data Sources for Competitor Tracking

| Source | What It Reveals | Frequency | Cost |
|--------|----------------|-----------|------|
| **CoStar news/alerts** | Deal closings, new listings, market reports | Daily scan | Part of existing subscription |
| **County recorder (SB/Riverside)** | Property transfers, deed recordings | Weekly batch | Public records (free) |
| **GlobeSt / Bisnow** | Deal announcements, broker mentions | Daily scan | Free/subscription |
| **Press releases** | Brokerage announcements of closed deals | Daily scan | Free |
| **LinkedIn** | Broker team changes, new hires, client congratulations | Weekly | Free (manual or API) |
| **Commercial broker websites** | Featured deals, team bios, case studies | Monthly | Free |
| **AIR/CBRE/Cushman marketing** | Deal books, pitches showing recent wins | Periodic | Received via email |

**Researcher workflow addition:**
When scanning existing news sources, add a filter: "Does this mention a competitor broker by name?" If yes, create a `competitor_deal_closed` signal instead of a generic market signal.

### 23.4 — TPE Scoring Feedback Mechanism

When the competitive analysis reveals patterns, those patterns should influence how David's contacts and properties are scored. This is the learning loop's most important output.

**How competitive intelligence feeds TPE:**

```
Competitor Analysis Reveals               TPE Scoring Adjustment
────────────────────────                  ──────────────────────
"Competitors winning on timing"     →     Increase lease_expiry weight
                                          (tpe_config: lease_12mo_points 30→35)

"Competitors winning in Ontario"    →     Add submarket_heat factor to TPE
                                          (new tpe_config category: 'submarket')

"Competitors winning logistics"     →     Increase growth signal weight for
                                          logistics companies
                                          (tpe_config: growth_30pct_points 15→18
                                           when sector=logistics)

"Competitor relationship depth wins" →    Increase owner_user_bonus for contacts
                                          with prior interactions
                                          (tpe_config: ownership.owner_user_bonus)
```

**Implementation: The CoS proposes TPE adjustments, David approves.**

```json
{
  "type": "tpe_adjustment_proposal",
  "source": "competitive_analysis",
  "competitor": "mike-chen-cbre",
  "observation": "Chen has won 4 of 5 deals in Ontario industrial in Q1. All were tenants with leases expiring within 6 months. We had 2 of those tenants in our CRM but didn't reach out until month 4.",
  "proposed_adjustment": {
    "table": "tpe_config",
    "changes": [
      {"config_key": "lease_12mo_points", "current": 30, "proposed": 35, "reason": "Weight earlier outreach on expiring leases"},
      {"config_key": "time_mult_6mo", "current": 1.20, "proposed": 1.35, "reason": "Amplify urgency for 6-month horizon"}
    ]
  },
  "expected_impact": "3 contacts currently scored 60-70 would move to 75-85, triggering outreach queue",
  "decision": "defer_to_david"
}
```

### 23.5 — Enrichment Trigger from Competitor Deals

When a competitor closes a deal, several entities become high-value targets:

| Entity | Why It's Valuable | Action |
|--------|------------------|--------|
| **The tenant** | Just signed a new lease — will need services/attention | Enrich contact, add to monitoring |
| **The property owner** | Just did a deal — may have more properties | Enrich all owned LLCs |
| **Adjacent properties** | Same submarket is active — owners may be thinking about deals | Research company for adjacent parcels |
| **Competitor's other clients** | If competitor wins here, where else are they winning? | Add to enrichment queue |
| **Similar-profile tenants** | Tenants with same profile in same submarket | Matcher: check against available properties |

**Priority board integration:**

```json
{
  "source_agent": "researcher",
  "source_context": "competitor_deal: mike-chen-cbre closed 45K SF lease in Ontario",
  "target_agent": "enricher",
  "priority_type": "enrich_company",
  "payload": {
    "company_name": "Amazon Logistics",
    "trigger": "competitor_deal_adjacency",
    "competitor": "mike-chen-cbre",
    "urgency_reason": "Competitor has 6-month head start. Enrich immediately to identify other Amazon properties in IE."
  },
  "reason": "Competitor closed deal with this company. Enrich to find other opportunities before competitor locks them up.",
  "urgency": "high"
}
```

### 23.6 — Privacy and Ethics Guardrails

Competitive intelligence is valuable but can cross ethical and legal lines. Hard rules:

**PERMITTED:**
- Monitor public deal announcements (CoStar, press releases, county records)
- Track publicly available broker bios, team pages, and case studies
- Analyze publicly recorded transactions
- Note when a competitor's client is also in David's CRM (contact already known)
- Aggregate patterns from public data

**NOT PERMITTED:**
- Scraping private broker communications or internal listings
- Impersonating a client to get competitor pricing
- Accessing competitor CRMs, databases, or internal systems
- Social engineering competitor employees for intelligence
- Using competitor client lists obtained through non-public means
- Storing competitor employees' personal contact information
- Automated monitoring of individual competitor brokers' personal social media (beyond professional/public posts)

**Technical enforcement:**
- `researcher.md` includes explicit prohibition list
- JSONL audit log tags all competitive intelligence actions with `source_type: 'public_record'` — any entry without this tag is flagged
- CoS reviews competitive intel weekly for boundary compliance
- David can override these rules explicitly, but the system defaults to conservative

**Data retention:**
- Competitor profiles: retained indefinitely (they're business intelligence)
- Individual deal records: retained 2 years
- Source URLs: retained permanently (provenance)
- No PII about competitor employees is stored — only professional role and brokerage affiliation

### 23.7 — Database Support

**New signal types for `sandbox_signals`:**

Add to the `signal_type` CHECK constraint in migration 007:
```sql
ALTER TABLE sandbox_signals DROP CONSTRAINT IF EXISTS sandbox_signals_signal_type_check;
ALTER TABLE sandbox_signals ADD CONSTRAINT sandbox_signals_signal_type_check
  CHECK (signal_type IN (
    'company_expansion', 'new_lease', 'sale_closed', 'funding',
    'hiring', 'relocation', 'market_trend', 'lease_expiration',
    'distress', 'other',
    -- New competitive intelligence types
    'competitor_deal_closed', 'competitor_listing', 'competitor_team_change',
    'competitor_pattern'
  ));
```

**New table: `competitor_profiles`**

```sql
CREATE TABLE IF NOT EXISTS competitor_profiles (
  id SERIAL PRIMARY KEY,
  broker_name TEXT NOT NULL,
  brokerage TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  focus_areas JSONB DEFAULT '{}',
  patterns JSONB DEFAULT '{}',
  total_deals_tracked INTEGER DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_competitor_slug ON competitor_profiles(slug);
```

**New table: `competitor_deals`**

```sql
CREATE TABLE IF NOT EXISTS competitor_deals (
  id SERIAL PRIMARY KEY,
  competitor_profile_id INTEGER REFERENCES competitor_profiles(id),
  -- Deal details
  deal_date DATE,
  deal_type TEXT CHECK (deal_type IN ('lease', 'sale', 'sublease')),
  property_address TEXT,
  sf INTEGER,
  tenant_company TEXT,
  deal_value_est NUMERIC,
  -- Source
  source_name TEXT,
  source_url TEXT,
  -- CRM cross-reference
  crm_contact_ids INTEGER[],
  crm_property_ids INTEGER[],
  crm_overlap BOOLEAN DEFAULT FALSE,
  -- Analysis
  win_factor TEXT,
  analysis JSONB DEFAULT '{}',
  lessons_learned TEXT[],
  -- TPE adjustment triggered
  tpe_adjustment_proposed BOOLEAN DEFAULT FALSE,
  tpe_adjustment_id INTEGER,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_competitor_deals_profile ON competitor_deals(competitor_profile_id);
CREATE INDEX idx_competitor_deals_date ON competitor_deals(deal_date);
CREATE INDEX idx_competitor_deals_overlap ON competitor_deals(crm_overlap);
```

### 23.8 — Integration Points

| Existing Component | Change Required |
|---|---|
| `researcher.md` idle-cycle #4 | Upgrade from passive monitoring to structured competitor tracking with profiles |
| `researcher.md` signal submission | Add `competitor_deal_closed` signal type with competitor analysis fields |
| `chief-of-staff.md` daily review | Add competitive analysis section — cross-reference competitor deals with CRM |
| `chief-of-staff.md` Step 6 | Add competitive-intelligence-based reverse prompts |
| Morning briefing | Add "Competitive Activity" section when competitor deals detected |
| TPE scoring (`tpe_config`) | CoS proposes weight adjustments based on competitive patterns |
| Priority board | Add competitor-triggered enrichment priorities |
| `COORDINATION.md` | Add `competitor_adjacency` as a convergence trigger |

### 23.9 — Implementation Priority

| Step | Effort | Priority |
|---|---|---|
| Add competitor signal types to schema | Low | P1 |
| Build competitor profile model (JSON files) | Low | P1 |
| Add CRM cross-reference check to competitive signals | Medium | P1 — high value |
| Build competitor deal tracking table | Low | P2 |
| Add competitor-triggered enrichment to priority board | Low | P2 |
| Build TPE adjustment proposal mechanism | Medium | P3 — requires TPE scoring to be live |
| Build win-factor analysis prompt for CoS | Medium | P3 |
| Dashboard: competitive activity panel | Medium | P4 |

---

---

# PROMPT 24: The David Model — User Preference Profile

## Current State Analysis

David interacts with the CRM daily through the IE CRM UI. He:
- Clicks on contacts, properties, companies, deals
- Edits fields inline (via `useAutoSave` hook)
- Approves or rejects sandbox items in the Agent Dashboard approval queue
- Creates deals, interactions, and campaigns
- Uses Claude AI to query the database
- Imports data via CSV

**What's captured today:**
- `undo_log` — records of AI-initiated changes (for reversal)
- `sandbox_contacts/enrichments/signals/outreach` — approval/rejection status with review notes
- `interactions` — logged interactions with contacts
- Database changes — all CRUD operations flow through `database.js`

**What's NOT captured today:**
1. **Click patterns** — which contacts/properties David views most often
2. **Edit patterns** — which fields he edits, how he changes them
3. **Approval patterns** — systematic preferences in what he approves vs rejects
4. **Search patterns** — what he searches for in Claude AI queries
5. **Time patterns** — when he's most active, what he does first each morning
6. **Implicit preferences** — properties he keeps coming back to vs. ones he views once and ignores

## Proposed Design

### 24.1 — The David Model Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                        THE DAVID MODEL                              │
│                                                                     │
│  INPUT SIGNALS                    PREFERENCE PROFILE                │
│  ─────────────                    ──────────────────                │
│  • Contact clicks/views           Property Preferences:            │
│  • Property views (duration)       - Type: industrial (0.85),      │
│  • Inline field edits               office (0.45), retail (0.30)   │
│  • Sandbox approvals/rejections    - Size: 20K-80K SF preferred    │
│  • Deal creation patterns          - Submarket: Ontario (0.9),     │
│  • Claude AI queries                 Fontana (0.7), Riverside (0.4)│
│  • Time-of-day activity           - Price: $150-$350 PSF sweet spot│
│  • Search/filter usage                                             │
│                                   Contact Preferences:             │
│                                    - Prioritizes owner-users       │
│                                    - Trusts NeverBounce-verified   │
│                                    - Rejects dissolved LLCs always │
│                                    - Approves >80 confidence fast  │
│                                                                    │
│                                   Strategy Signals:                │
│                                    - Morning: reviews briefing,    │
│                                      then deals, then contacts     │
│                                    - Spends most time on deals     │
│                                      >$2M in Ontario industrial    │
│                                    - Ignores office market signals │
│                                    - Always follows up convergence │
│                                      alerts within 24 hours        │
│                                                                    │
│  OUTPUT                                                            │
│  ──────                                                            │
│  • Smarter scoring (weight what David cares about)                 │
│  • Better sandbox filtering (pre-approve obvious yes, flag edge)   │
│  • Personalized morning briefings (lead with what David acts on)   │
│  • Smarter outreach matching (target David's preferred profiles)   │
│  • Reduced noise (suppress signals David never acts on)            │
└────────────────────────────────────────────────────────────────────┘
```

### 24.2 — Signal Collection Layer

Every David interaction generates a lightweight event. These are collected client-side in the React app and batched to the server.

**Event schema:**

```json
{
  "event_type": "view|edit|approve|reject|create|search|click",
  "entity_type": "contact|property|company|deal|interaction|signal",
  "entity_id": 234,
  "details": {
    "field_edited": "phone_1",
    "old_value": null,
    "new_value": "909-555-1234",
    "duration_ms": 12000,
    "query_text": "show me industrial properties in Ontario over 30K SF",
    "filters_applied": {"type": "industrial", "city": "Ontario", "min_sf": 30000}
  },
  "context": {
    "page": "properties",
    "referrer": "morning_briefing",
    "time_of_day": "08:15",
    "day_of_week": "Monday",
    "session_duration_so_far_ms": 180000
  },
  "timestamp": "2026-04-15T08:15:23Z"
}
```

**Collection points in the React app:**

| Event | Where to Hook | What to Capture |
|-------|--------------|-----------------|
| Entity view | SlideOver open / Detail component mount | Entity type, ID, time spent (track unmount) |
| Field edit | `useAutoSave` hook (already fires on save) | Field name, old value, new value |
| Sandbox approval | Approval queue button click | Confidence score, agent source, review time |
| Sandbox rejection | Rejection button click | Confidence score, agent source, rejection reason |
| Deal creation | Deal form submit | Deal type, value, property type, submarket |
| Claude query | ClaudePanel submit | Query text (anonymized), filters extracted |
| List page filter | CrmTable sort/filter change | Column sorted, filter applied |
| Navigation | Sidebar click | Which page, time spent on previous page |

**Privacy-critical implementation detail:** Events are stored in the local CRM database, NOT sent to any external service. The David Model runs locally or on the CRM's backend — David's behavioral data never leaves his infrastructure.

### 24.3 — Preference Extraction Engine

Raw events are too granular to be useful. The preference extraction engine runs weekly (Saturday 4 AM maintenance window) and distills patterns into a structured profile.

**Extraction methods:**

#### A. Entity Affinity Scoring

For each entity attribute (property type, submarket, deal size), calculate an affinity score:

```
affinity(attribute) = Σ (weight × frequency × recency_decay)

Where:
  weight:
    - view = 1
    - edit = 3  (editing means engagement)
    - create_deal = 5  (creating a deal is the strongest signal)
    - approve = 2
    - reject = -1 (negative signal)
    - return_visit = 2 (came back to same entity within 7 days)

  frequency: count of events for this attribute in the window

  recency_decay: e^(-0.1 × days_since_event)
    - Yesterday's actions weight ~0.9
    - Last week's actions weight ~0.5
    - Last month's actions weight ~0.05
```

**Example output:**
```json
{
  "property_type_affinity": {
    "industrial": 0.92,
    "office": 0.34,
    "retail": 0.28,
    "multifamily": 0.15,
    "land_commercial": 0.41
  },
  "submarket_affinity": {
    "Ontario": 0.88,
    "Rancho Cucamonga": 0.72,
    "Fontana": 0.65,
    "San Bernardino": 0.45,
    "Riverside": 0.38,
    "Moreno Valley": 0.22
  },
  "deal_size_affinity": {
    "under_1m": 0.15,
    "1m_5m": 0.55,
    "5m_10m": 0.82,
    "over_10m": 0.68
  }
}
```

#### B. Approval Pattern Analysis

Analyze sandbox approval/rejection patterns to learn David's quality threshold:

```json
{
  "approval_patterns": {
    "auto_approve_threshold": 85,
    "description": "David approves 98% of items with confidence >= 85. Safe to auto-approve above this threshold.",
    "rejection_patterns": [
      {
        "pattern": "dissolved_llc",
        "rejection_rate": 1.0,
        "sample_size": 12,
        "recommendation": "Add dissolved LLC detection to pre-filter"
      },
      {
        "pattern": "office_property_type",
        "rejection_rate": 0.65,
        "sample_size": 20,
        "recommendation": "Increase confidence threshold for office properties to 80"
      },
      {
        "pattern": "confidence_below_50",
        "rejection_rate": 0.85,
        "sample_size": 40,
        "recommendation": "Consider auto-rejecting below 50"
      }
    ],
    "avg_review_time_by_confidence": {
      "90_plus": "3 seconds",
      "70_89": "12 seconds",
      "50_69": "45 seconds",
      "below_50": "8 seconds (fast reject)"
    }
  }
}
```

#### C. Temporal Patterns

```json
{
  "temporal_patterns": {
    "most_active_hours": ["08:00-10:00", "14:00-16:00"],
    "morning_routine": [
      "1. Check morning briefing (avg 4 min)",
      "2. Review approval queue (avg 8 min)",
      "3. Open deals page, sort by close date (avg 12 min)",
      "4. View 2-3 specific contacts"
    ],
    "response_time_to_briefing_recommendations": {
      "opportunity": "avg 2.3 hours",
      "system_improvement": "avg 18 hours",
      "action_required": "avg 45 minutes"
    },
    "day_of_week_patterns": {
      "Monday": "Heavy deal review, briefing deep-read",
      "Tuesday-Thursday": "Contact engagement, outreach review",
      "Friday": "Light CRM use, focuses on calls"
    }
  }
}
```

### 24.4 — Profile Storage

**File:** `/AI-Agents/chief-of-staff/memory/david-model.json`

This is the canonical David Model. It's read by the Chief of Staff during daily review and morning briefing generation.

```json
{
  "version": "1.3",
  "last_updated": "2026-04-20T04:00:00Z",
  "data_window": "2026-03-17 to 2026-04-20",
  "event_count": 4823,
  "profile": {
    "property_type_affinity": { ... },
    "submarket_affinity": { ... },
    "deal_size_affinity": { ... },
    "approval_patterns": { ... },
    "temporal_patterns": { ... },
    "contact_type_affinity": {
      "owner_user": 0.85,
      "owner_investor": 0.60,
      "tenant": 0.72,
      "tenant_rep": 0.30
    },
    "signal_engagement": {
      "company_expansion": 0.90,
      "lease_expiration": 0.85,
      "hiring": 0.50,
      "market_trend": 0.35,
      "funding": 0.25,
      "competitor_deal_closed": 0.80
    }
  }
}
```

**Database table for raw events:**

```sql
CREATE TABLE IF NOT EXISTS david_interactions (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'view', 'edit', 'approve', 'reject', 'create', 'search', 'click', 'navigate'
  )),
  entity_type TEXT,
  entity_id INTEGER,
  details JSONB DEFAULT '{}',
  context JSONB DEFAULT '{}',
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_david_interactions_type ON david_interactions(event_type);
CREATE INDEX idx_david_interactions_entity ON david_interactions(entity_type, entity_id);
CREATE INDEX idx_david_interactions_created ON david_interactions(created_at);

-- Retention: 6 months of raw events, then aggregate and purge
-- The derived profile (david-model.json) is the permanent artifact
```

### 24.5 — How the David Model Improves the System

#### A. Smarter Morning Briefings

The CoS uses the David Model to personalize briefings:

```
BEFORE (generic):
  "5 new signals found overnight: 2 industrial, 2 office, 1 retail"

AFTER (personalized):
  "3 industrial signals in Ontario and Fontana overnight (your
   highest-affinity submarkets). 2 office signals filtered to
   summary — you've engaged with 0 of the last 12 office signals."
```

The briefing leads with what David acts on, summarizes what he ignores, and learns from his response time to previous recommendations.

#### B. Smarter Sandbox Ordering

Instead of showing sandbox items in chronological order, order by predicted approval probability:

```
predicted_approval = f(
  confidence_score,
  property_type_affinity,
  submarket_affinity,
  contact_type_affinity,
  historical_approval_rate_for_similar_items
)

Show highest predicted-approval items first → David reviews faster,
approves more per session, and the system learns from his remaining
decisions on the harder edge cases.
```

#### C. TPE Score Boosting

The David Model can add a "David affinity boost" to TPE scores:

```
tpe_adjusted = tpe_base + (david_affinity_boost × boost_weight)

Where:
  david_affinity_boost = property_type_affinity × submarket_affinity × contact_type_affinity
  boost_weight = configurable in tpe_config (default: 5 points max)
```

This means properties that match David's demonstrated preferences bubble up in prioritization — not because the data says they're better deals, but because David is more likely to act on them.

#### D. Noise Reduction

Signals and enrichments in categories David consistently ignores can be auto-downgraded:

```
IF signal_type_affinity < 0.30 AND david has ignored last 10 of this type:
  → Don't include in morning briefing (still log, still available)
  → Reduce Researcher's monitoring frequency for this signal type
  → Flag for CoS: "David hasn't engaged with 'funding' signals in 30 days.
     Should Researcher continue monitoring? [yes/no]"
```

### 24.6 — Privacy Controls

David's behavioral data is the most sensitive data in the system. Hard rules:

**Storage:**
- Raw events stored ONLY in the local CRM database (`david_interactions` table)
- Derived profile stored ONLY on the Mac Mini (`david-model.json`)
- NEVER synced to cloud services, NEVER included in API calls to external LLMs
- NEVER included in agent instruction files or agent memory files

**Access:**
- Only the Chief of Staff (Tier 1) reads the David Model
- Tier 2 and Tier 3 agents NEVER see the David Model
- The David Model influences scoring and prioritization indirectly — agents see the result (adjusted scores) but never the input (David's behavior)

**Transparency:**
- David can view his profile at any time: Agent Dashboard > "My Profile" tab
- Every recommendation influenced by the David Model is tagged: `"influenced_by": "david_model"`
- David can see exactly which preferences drove each recommendation

**Opt-out:**
- David can disable the David Model entirely: one toggle in Settings
- David can disable individual dimensions: "Don't use my property type preferences"
- Disabling is immediate — the profile stops being read, but the data is retained (can re-enable)

**Data deletion:**
- David can request full deletion of `david_interactions` table data
- The derived profile (`david-model.json`) is deleted separately
- After deletion, the system reverts to generic scoring and prioritization

### 24.7 — Anti-Filter-Bubble Mechanisms

The biggest risk of the David Model is creating a filter bubble — the system shows David only what he's clicked on before, reinforcing existing biases and hiding opportunities in unfamiliar categories.

**Mechanism 1: Exploration Quota**
- The morning briefing MUST include at least 1 recommendation outside David's top-3 affinities
- Labeled: "Outside your usual focus — but the data supports this"
- Tracks whether David engages with these "exploration" items
- If David engages with 3+ exploration items in a category, the model updates naturally

**Mechanism 2: Affinity Decay**
- Affinities decay toward 0.5 (neutral) if not reinforced
- Half-life: 60 days without engagement → affinity drops toward 0.5
- This prevents the model from permanently ignoring a category just because David didn't click on it for 2 months
- An affinity can never drop below 0.20 — there's always some baseline visibility

**Mechanism 3: Market Reality Override**
- If objective market data contradicts the David Model, market data wins
- Example: David's office affinity is 0.34 (low), but a massive office vacancy spike in Ontario creates a genuine opportunity. The signal still surfaces at full strength because the market data is strong enough to override preference filtering.
- Rule: Any signal with confidence > 80 AND relevance = 'high' bypasses David Model filtering entirely

**Mechanism 4: Monthly Model Review**
- Once per month, the CoS generates a "David Model Health Report"
- Shows: which categories are being suppressed, how much David's view has narrowed, whether exploration items are being engaged with
- Sent to David via Telegram with the question: "Your CRM focus has narrowed to industrial/Ontario over the last month. Is this intentional strategy, or should I broaden monitoring?"

### 24.8 — Override Mechanisms

David can override the model at any time:

| Override | How | Effect |
|----------|-----|--------|
| "Show me everything" | Toggle in Agent Dashboard | Disables all preference filtering for 7 days |
| "I want to see more office" | Tell Claude in chat | CoS manually boosts office affinity to 0.7 for 30 days |
| "Stop filtering funding signals" | Settings toggle per signal type | That signal type bypasses David Model |
| "Reset my profile" | Settings button | Clears all affinities to 0.5, rebuilds from scratch over 2 weeks |
| "I don't like this recommendation" | Thumbs-down on briefing item | Negative signal: decreases affinity for that category by 0.1 |

### 24.9 — Integration Points

| Existing Component | Change Required |
|---|---|
| `ie-crm/src/hooks/useAutoSave.js` | Add event emission on save (field edit signal) |
| `ie-crm/src/components/shared/SlideOver.jsx` | Track view duration (mount → unmount timing) |
| `ie-crm/src/components/shared/CrmTable.jsx` | Track row clicks, sort changes, filter changes |
| `ie-crm/src/components/ClaudePanel.jsx` | Track query submissions (text, not results) |
| Agent Dashboard approval queue | Track approval/rejection with timing |
| `chief-of-staff.md` Step 6 | Use David Model to personalize recommendations |
| `chief-of-staff.md` Step 8 | Use David Model to order and filter briefing content |
| Morning briefing format | Add exploration quota enforcement |
| Sandbox approval queue UI | Reorder by predicted approval probability |
| TPE scoring | Add optional David affinity boost factor |

### 24.10 — Implementation Priority

| Step | Effort | Priority |
|---|---|---|
| Event collection in React app (lightweight, localStorage buffer) | Medium | P1 — start collecting before anything else |
| `david_interactions` table + batch sync endpoint | Low | P1 |
| Approval pattern analysis (simplest extraction) | Low | P1 — immediate value |
| Property/submarket affinity scoring | Medium | P2 |
| Sandbox reordering by predicted approval | Low | P2 — quick win |
| David Model file generation (weekly job) | Medium | P2 |
| CoS integration (personalized briefings) | Medium | P3 |
| TPE affinity boost | Low | P3 |
| Anti-filter-bubble mechanisms | Medium | P3 |
| Dashboard "My Profile" view | Medium | P4 |
| Override controls in Settings | Low | P4 |

---

---

# Cross-Cutting: How These Four Systems Interact

These four capabilities are not independent. They form a reinforcing loop:

```
David Model (24) learns what David cares about
    |
    v
CoS uses David Model to prioritize instruction changes
    |
    v
Regression-Aware Improvement (21) tests changes safely
    |
    v
Emergent Behavior Detector (22) catches unexpected interactions
    |
    v
Competitive Intelligence (23) discovers new factors to optimize for
    |
    v
David Model (24) learns whether David acts on competitive insights
    |
    (loop continues)
```

**Specific interaction points:**

1. **21 + 24:** The David Model's approval patterns define "precision" and "recall" for canary evaluation scorecards. If David consistently rejects a category, that's the ground truth for what counts as a false positive.

2. **22 + 23:** When competitive intelligence triggers a burst of enrichment priorities (e.g., "competitor closed 5 deals this week"), the EBD should expect elevated activity from the Enricher and not flag it as anomalous. The EBD needs a concept of "expected bursts" tied to competitive events.

3. **22 + 21:** If the EBD detects a regression after an instruction change, it should feed that information back to the canary evaluation system as a "missed regression" — the evaluation set didn't catch this, so it needs updating.

4. **23 + 24:** When competitive intelligence reveals that a competitor is winning in a market David hasn't focused on (low affinity), the exploration quota in the David Model should surface this as an "outside your usual focus" item. The system should distinguish between "David doesn't care about office" and "David hasn't had competitive pressure in office yet."

---

# Combined Database Migration: 009_advanced_intelligence.sql

All four capabilities require schema additions. These should go in a single migration:

```sql
-- Migration 009: Advanced Intelligence Systems
-- Canary evaluations, emergent behavior detection, competitive intelligence, David Model

-- [Tables defined above in each section]
-- canary_evaluations
-- ebd_alerts
-- competitor_profiles
-- competitor_deals
-- david_interactions

-- Plus updates to existing tables:
-- sandbox_signals: expanded signal_type CHECK constraint
-- agent_logs: expanded log_type CHECK constraint to include
--   'canary_evaluation', 'ebd_alert', 'competitor_analysis', 'david_model_update'
```

---

# Implementation Roadmap

| Phase | Capabilities | Timeline | Dependencies |
|-------|-------------|----------|-------------|
| **Phase A** | David Model event collection (24.1-24.2) + Baseline collection for EBD (22.2) | Week 1-2 after agents go live | Agents producing data |
| **Phase B** | Approval pattern analysis (24.5.B) + Processing time monitor (22.3.A) + Cycle detector (22.3.D) | Week 3-4 | Phase A data |
| **Phase C** | Canary evaluation pipeline (21.1-21.3) + Competitive signal types (23.1-23.3) | Month 2 | At least 1 instruction rewrite + competitive signals flowing |
| **Phase D** | Full David Model profile (24.3-24.5) + Cost spike detector (22.3.B) + Competitor profiles (23.2) | Month 2-3 | Phase B + C |
| **Phase E** | Anti-filter-bubble (24.7) + TPE adjustments from competitive intel (23.4) + False alarm tuning (22.5) | Month 3-4 | Phase D + David review |
| **Phase F** | Full integration — all four systems feeding each other | Month 4+ | Phases A-E stable |

**Key principle:** Start collecting data in Phase A even if you don't process it until Phase D. Behavioral data and baselines need history to be useful. The worst time to start collecting is "when you need it."

---

*Created: March 2026*
*For: IE CRM AI Master System — Advanced Intelligence Capabilities*
*Prompts: 21 (Regression-Aware Self-Improvement), 22 (Emergent Behavior Detection), 23 (Competitive Intelligence Loop), 24 (The David Model)*
