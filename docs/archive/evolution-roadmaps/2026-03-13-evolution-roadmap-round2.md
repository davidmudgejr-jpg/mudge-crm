# IE CRM + AI System — Evolution Roadmap Round 2

**Meta-Learning, Autonomous Innovation & Self-Improving Intelligence**
**Generated from 12 Second-Round Deep Audit Prompts — March 13, 2026**

---

## What Round 1 Missed

Round 1 (Prompts 1-12) fixed **operational gaps** — how to get data flowing, how to authenticate, how to send emails. Round 2 addresses **intelligence gaps** — how the system gets smarter on its own without David manually tuning it.

### The Core Problem Round 2 Solves

**The system currently has a centralized brain bottleneck.** Only the Chief of Staff learns. Every other agent is a rule-follower with zero feedback loops back to itself. This means:
- Errors today aren't corrected until tomorrow's Chief review
- Agents repeat the same mistakes for 24 hours
- No agent knows why it was rejected
- No agent knows if its outputs actually produced results
- The system optimizes what it knows, not what it's missing

Round 2 makes every agent self-aware and the whole system self-discovering.

---

## New Capability Tiers (Extends Round 1's Tier 0-7)

### Tier 8 — Agent Self-Awareness (Make Every Agent See Its Own Scorecard)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 8.1 | **`agent_feedback_digest` table** — Per-agent, per-cycle scorecards: approval rate, rejection reasons, engagement outcomes (opens/replies/bounces), ground truth corrections, comparison to previous cycle. | Prompt 13 | 3 hours |
| 8.2 | **`rejection_reason_taxonomy` table** — Standardized rejection vocabulary with agent-specific remediation guidance (e.g., "low_confidence" → Enricher should add more sources). | Prompt 13 | 1 hour |
| 8.3 | **Nightly digest generation cron** — Queries sandbox tables, engagement data, and ground truth to build scorecards for each agent. | Prompt 13 | 3 hours |
| 8.4 | **`GET /api/ai/feedback-digest` endpoint** — Agents read their digest at the start of every cycle. | Prompt 13 | 1 hour |
| 8.5 | **Agent instruction updates** — Add "Feedback Awareness" section to every agent.md: read digest, adjust behavior based on scorecard (e.g., if rejection_rate > 30% for "insufficient_sources", add a third source before submitting). | Prompt 13 | 4 hours |

### Tier 9 — Cross-Agent Intelligence (Agents That Know What Each Other Know)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 9.1 | **`entity_context_cache` table** — Per-entity knowledge graph. Every agent checks cache before processing any entity. Columns: entity_type, entity_id, agent_name, context_type, content, confidence, expires_at. | Prompt 16 | 3 hours |
| 9.2 | **Cache read/write protocol** — Before: Enricher checks "has any agent touched this entity in 7 days?" After: Enricher writes "enriched ABC Logistics, confidence 82, email found". | Prompt 16 | 2 hours |
| 9.3 | **Convergence auto-detection** — When 3+ agents touch the same entity within 48 hours, auto-flag as convergence and escalate to Chief of Staff. | Prompt 16 | 2 hours |
| 9.4 | **Conflict surfacing** — If Enricher writes "email = john@abc.com" and Researcher writes "John left ABC", surface contradiction to Tier 2. | Prompt 16 | 2 hours |
| 9.5 | **Matcher enrichment** — Matcher reads Researcher signals from cache before drafting outreach, incorporating recent intelligence into email personalization. | Prompt 16 | 2 hours |

### Tier 10 — Autonomous Source Intelligence (The System Finds Its Own Data)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 10.1 | **`agent_source_registry` table** — Every data source tracked with reliability score (weighted: 60% approval rate, 30% action rate, 10% recency), status lifecycle, freshness. | Prompt 14 | 2 hours |
| 10.2 | **Source reliability scoring** — Weekly recalculation: what % of signals from this source got approved? Led to deals? Still relevant? | Prompt 14 | 3 hours |
| 10.3 | **Dead source auto-detection** — If source produces no content for 90 days, mark degraded. If no content for 180 days, mark dead. | Prompt 14 | 1 hour |
| 10.4 | **Citation chain discovery** — Scout follows citation links in high-value signals to find new data sources. Proposes to Chief of Staff with evidence. | Prompt 14 | 3 hours |
| 10.5 | **Source budget cap** — Max 50 active sources. New sources must replace weaker ones, not accumulate. Prevents information overload. | Prompt 14 | 1 hour |

### Tier 11 — False Negative Detection (Learning From What You Miss)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 11.1 | **`missed_opportunity_log` table** — Captures opportunities the system should have found: manual contacts David adds, unattributed deals, missed signals. | Prompt 15 | 2 hours |
| 11.2 | **Manual contact compare** — Weekly: diff David's manually-added contacts against Enricher's queue. If David found someone Enricher should have found, log the miss with root cause. | Prompt 15 | 3 hours |
| 11.3 | **Unattributed deal detector** — When a deal is created without an AI attribution chain, backtrack: was there a signal we missed? A contact we didn't enrich? | Prompt 15 | 3 hours |
| 11.4 | **Signal backtest** — For closed deals, check if source data existed at the time the Researcher was scanning. If yes, why didn't it get caught? | Prompt 15 | 4 hours |
| 11.5 | **"AI should have caught this" button** — Simple UI action for David to flag any CRM activity as a missed opportunity. One click → logs to `missed_opportunity_log`. | Prompt 15 | 1 hour |
| 11.6 | **Root cause taxonomy** — Chief of Staff categorizes misses: source_gap, filter_too_aggressive, confidence_too_low, logic_gap, timing_lag. Routes remediation to responsible agent. | Prompt 15 | 2 hours |

### Tier 12 — Adaptive Intelligence (The System Tunes Itself)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 12.1 | **Bayesian confidence recalibration** — Weekly job: compute actual predictive power of each confidence factor against real outcomes. Adjust weights automatically (max 5-point change per cycle). | Prompt 17 | 1 day |
| 12.2 | **Source-specific and geography-specific modifiers** — e.g., "White Pages is 85% reliable in San Bernardino but only 70% in Riverside." Applied as multipliers on confidence factors. | Prompt 17 | 4 hours |
| 12.3 | **Cold-start protocol** — Months 1-2: observation only (collect data, don't adjust). Month 3+: active calibration after 500+ outcomes. | Prompt 17 | 2 hours |
| 12.4 | **Anti-bias mechanisms** — Use outcome-based truth (bounces, disconnects) not approval-based truth (David's biases). Random sub-threshold sampling to catch false negatives. Holdout validation set. | Prompt 17 | 3 hours |
| 12.5 | **`canary_evaluations` table** — Before any instruction change, run both current and candidate instructions against held-out test set. Multi-dimensional scorecard: precision, recall, latency, cost, edge cases. | Prompt 21 | 4 hours |
| 12.6 | **Pareto comparison engine** — Auto-promote if strictly better on all dimensions. Defer to David if trade-offs exist. Auto-reject if worse. | Prompt 21 | 3 hours |
| 12.7 | **Three-tier test sets** — Curated (hand-picked), production (rolling 20 recent items), adversarial (items from every past rollback). Prevents overfitting. | Prompt 21 | 3 hours |

### Tier 13 — Strategic Intelligence (Quarterly Thinking, Not Just Daily)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 13.1 | **`quarterly_goals` table** — David inputs OKRs: "10 Fontana industrial deals by Q3." Chief of Staff decomposes into monthly → weekly → daily targets. | Prompt 19 | 2 hours |
| 13.2 | **Conversion funnel modeling** — 10 deals needs ~30 meetings needs ~1,500 outreach needs ~500 verified contacts. Math drives agent capacity allocation. | Prompt 19 | 3 hours |
| 13.3 | **Intensity modes** — Coast (ahead of target), Steady (on track), Surge (behind), Diversify (fundamentally off track). Agent behavior changes per mode. | Prompt 19 | 3 hours |
| 13.4 | **Goal progress in morning briefing** — Pace indicators, ETA projections, recommended action when behind. | Prompt 19 | 2 hours |
| 13.5 | **Competitive learning loop** — When a competitor wins a deal, system checks CRM overlap, analyzes win factors, proposes TPE weight adjustments, queues adjacent contacts for enrichment. | Prompt 23 | 1 day |
| 13.6 | **`competitor_profiles` + `competitor_deals` tables** — Structured tracking of competitors' focus areas, deal patterns, win rates. | Prompt 23 | 2 hours |

### Tier 14 — System Self-Awareness (The System Watches Itself)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 14.1 | **Emergent behavior detector** — Background thread watching for: processing time shifts (MAD-based), cost spikes (CUSUM), cyclic dependencies (DFS on priority board), resource contention (Ollama polling). | Prompt 22 | 1 day |
| 14.2 | **`ebd_alerts` table** — Structured anomaly alerts with diagnosis, affected agents, auto-throttle status. | Prompt 22 | 2 hours |
| 14.3 | **Three-phase rollout** — Observe-only (weeks 1-2), alert-only (weeks 3-4), full auto-throttle (month 2+). | Prompt 22 | Built into 14.1 |
| 14.4 | **False alarm tracking** — Automatic threshold tuning targeting <2 false alarms/week. | Prompt 22 | 2 hours |
| 14.5 | **`david_interactions` table** — Event collection from React hooks (useAutoSave, SlideOver, CrmTable, ClaudePanel). Captures what David clicks, edits, approves, rejects. | Prompt 24 | 3 hours |
| 14.6 | **Entity affinity scoring** — Weighted frequency with 60-day half-life recency decay. Reveals what David actually cares about vs what the system thinks he cares about. | Prompt 24 | 3 hours |
| 14.7 | **Four anti-filter-bubble mechanisms** — Exploration quota (1 outside-focus item per briefing), affinity decay toward neutral, market reality override, monthly model health report. | Prompt 24 | 2 hours |

### Tier 15 — Autonomous Innovation (The System Proposes New Capabilities)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 15.1 | **Innovation Agent (7th agent type)** — Monthly Opus-powered agent at Tier 1.5 (advisory, no write access). Reads David's CRM behavior patterns, studies CRE industry AI use, analyzes competitor features, proposes experiments with hypotheses and success metrics. | Prompt 18 | 1 day |
| 15.2 | **Real-time innovation pipeline** — Upgrade Scout from weekly to 6-hour continuous scan. 4-point hype filter (source credibility, benchmark relevance, practicality, cost). | Prompt 20 | 1 day |
| 15.3 | **Innovation sprints** — When high-impact discovery detected: overnight automated evaluation pulls candidate model, runs against test fixtures, compares to baseline, produces cost-of-switching report. | Prompt 20 | 1 day |
| 15.4 | **Cognitive load management** — Critical: immediate Telegram (max 1/day). High: morning briefing (max 2). Medium: weekly digest. Low: never surfaced. | Prompt 20 | 2 hours |
| 15.5 | **MCP server discovery pipeline** — 6-hourly scan of registries for new property records, assessor data, permit databases that could give the system new data access. | Prompt 20 | 4 hours |
| 15.6 | **Auto-adoption for low-risk changes** — Pricing updates and patch versions apply automatically. Major changes require David's approval. | Prompt 20 | 2 hours |

---

## New Tables Summary (Round 2)

| Table | Tier | Purpose |
|-------|------|---------|
| `agent_feedback_digest` | 8 | Per-agent scorecards with approval/rejection/engagement data |
| `rejection_reason_taxonomy` | 8 | Standardized rejection vocabulary + remediation guidance |
| `entity_context_cache` | 9 | Per-entity cross-agent knowledge graph |
| `agent_source_registry` | 10 | Source reliability tracking + lifecycle management |
| `missed_opportunity_log` | 11 | False negative capture + root cause analysis |
| `canary_evaluations` | 12 | Pre-deployment instruction testing results |
| `quarterly_goals` | 13 | OKR decomposition + progress tracking |
| `competitor_profiles` | 13 | Competitor strategy + deal pattern tracking |
| `competitor_deals` | 13 | Competitor win/loss analysis |
| `ebd_alerts` | 14 | Emergent behavior anomaly detection alerts |
| `david_interactions` | 14 | CRM interaction events for preference learning |

---

## How Round 2 Extends Round 1

```
ROUND 1: Data flows correctly
  Tier 0: Schema fixes + auth
  Tier 1: Sandbox promotion
  Tier 2: Pagination + filters + intelligence
  Tier 3: Email pipeline
  Tier 4: KPI tracking
  Tier 5: ROI analytics
  Tier 6: Testing
  Tier 7: Offline

ROUND 2: System gets smarter autonomously
  Tier 8:  Agents see their own scorecards (feedback loops)
  Tier 9:  Agents share what they know (cross-agent context)
  Tier 10: System finds its own data sources
  Tier 11: System detects what it's missing (false negatives)
  Tier 12: System tunes its own algorithms (Bayesian calibration + canary testing)
  Tier 13: System thinks quarterly, not just daily (goal cascading + competitive learning)
  Tier 14: System watches itself for anomalies (emergent behavior + David model)
  Tier 15: System proposes new capabilities (Innovation Agent + real-time discovery)
```

---

## The Learning Flywheel

When all tiers are operational, the system has a complete learning flywheel:

```
David sets quarterly goals (Tier 13)
    ↓
Chief of Staff decomposes into weekly agent priorities
    ↓
Agents work, checking shared context cache (Tier 9)
    ↓
Each agent reads its feedback digest before working (Tier 8)
    ↓
Source registry weights high-performing sources (Tier 10)
    ↓
Confidence calibration auto-tunes scoring (Tier 12)
    ↓
Results flow through sandbox → promotion → CRM (Round 1)
    ↓
Engagement data (opens, replies, bounces) feeds back (Round 1 Tier 3)
    ↓
False negative detector catches misses (Tier 11)
    ↓
Emergent behavior detector prevents runaway loops (Tier 14)
    ↓
David Model learns preferences, personalizes briefings (Tier 14)
    ↓
Innovation Agent proposes new capabilities (Tier 15)
    ↓
Scout discovers new tools/models in real-time (Tier 15)
    ↓
Chief of Staff uses canary testing before changes (Tier 12)
    ↓
Competitive learning updates TPE scoring (Tier 13)
    ↓
System gets smarter → David closes more deals → goals achieved → new goals set
    ↓
REPEAT
```

---

## Recommended Build Sequence (Round 2 Tiers)

| Phase | Tiers | Timing | Why This Order |
|-------|-------|--------|----------------|
| Phase A | Tier 8 (Feedback Digests) | Week 9 | Highest ROI: immediate agent improvement with minimal infrastructure |
| Phase B | Tier 9 (Shared Context) | Week 10 | Second-highest: prevents duplicate work and enables convergence detection |
| Phase C | Tier 12 (Adaptive Calibration + Canary Testing) | Week 11-12 | Third: the system can now self-tune safely |
| Phase D | Tier 11 (False Negative Detection) | Week 13 | Fourth: now we measure what we're missing |
| Phase E | Tier 10 (Source Discovery) | Week 14 | Fifth: expands the system's information horizon |
| Phase F | Tier 13 (Goal Cascading + Competitive) | Week 15-16 | Sixth: strategic intelligence layer |
| Phase G | Tier 14 (System Self-Awareness) | Week 17-18 | Seventh: anomaly detection + David model |
| Phase H | Tier 15 (Autonomous Innovation) | Week 19-20 | Last: the system proposes its own evolution |

---

## Detailed Design Documents

Full implementation specs for each tier are in:
- `docs/superpowers/plans/2026-03-13-prompts-13-16-agent-learning-loops.md`
- `docs/superpowers/specs/2026-03-13-prompts-17-20-deep-analysis.md`
- `docs/superpowers/specs/2026-03-13-advanced-intelligence-design.md`

---

*This is the meta-learning layer. Round 1 makes the system work. Round 2 makes it think.*

*Created: March 13, 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
