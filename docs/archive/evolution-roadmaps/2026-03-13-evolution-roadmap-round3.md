# IE CRM + AI System — Evolution Roadmap Round 3

**Strategic Cognition, Prediction & Compounding Intelligence**
**Generated from 12 Third-Round Deep Audit Prompts — March 13, 2026**

---

## What Round 3 Adds

Round 1 = **Plumbing** (data flows, auth, endpoints)
Round 2 = **Nervous System** (feedback loops, self-calibration, anomaly detection)
Round 3 = **Brain** (market understanding, prediction, simulation, relationship reasoning)

Round 3 transforms the system from a fast executor into a **strategic thinker** that develops a theory of the market, predicts transactions before signals appear, explains its reasoning, and builds an unreplicable competitive advantage over time.

---

## New Capability Tiers (Extends Rounds 1-2's Tiers 0-15)

### Tier 16 — Explainable Intelligence (Why, Not Just What)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 16.1 | **`recommendation_explanations` table** — Structured explanation for every recommendation: factor breakdown, evidence links, confidence reasoning, alternative comparison. | Prompt 28 | 3 hours |
| 16.2 | **`tpe_score_history` table** — Weekly TPE snapshots with factor-by-factor breakdowns. Enables "what changed since last week" delta views. | Prompt 28 | 2 hours |
| 16.3 | **Template-based explanation engine** — No LLM calls. Each TPE score gets a factor bar chart, convergence alerts get multi-agent narratives, outreach drafts get "why this contact over N others." | Prompt 28 | 3 days |
| 16.4 | **Explainability in morning briefing** — Every recommendation includes a 1-2 sentence "because" with specific data points. | Prompt 28 | 4 hours |
| 16.5 | **Expected impact** — 60-70% faster Tier 2 review, 30-40% higher approval rate (reviewers trust what they understand). | Prompt 28 | — |

### Tier 17 — Relationship Graph Intelligence (Network Thinking)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 17.1 | **`relationship_edges` table** — Unified weighted edge table synced from all 15 junction tables. Strength = f(interaction frequency, recency decay, deal history, email response rate, manual boost). | Prompt 25 | 1 day |
| 17.2 | **`relationship_graph_cache` table** — Nightly hub scores, centrality metrics, decay state per contact. | Prompt 25 | 4 hours |
| 17.3 | **`relationship_path_cache` table** — Pre-computed shortest warm-intro paths to high-value targets. | Prompt 25 | 4 hours |
| 17.4 | **Recursive CTE path-finding** — PostgreSQL recursive CTEs (no graph DB needed at this scale). Calculates degrees of separation and strongest connection paths. | Prompt 25 | 1 day |
| 17.5 | **Decay detection + auto-action-items** — Edges transition: active → decaying (3mo) → dormant (6mo) → severed (12mo). Decaying contacts auto-create "re-engage" action items. | Prompt 25 | 4 hours |
| 17.6 | **TPE network bonus** — +5 for 1-hop connections, +3 for 2-hop. Added to blended priority formula. | Prompt 25 | 2 hours |
| 17.7 | **Matcher warm-intro injection** — When Matcher drafts outreach and a warm introduction path exists, inject the path into the email draft. | Prompt 25 | 3 hours |

### Tier 18 — Temporal Intelligence (When, Not Just What)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 18.1 | **`temporal_patterns` table** — Discovered cyclical patterns: deal seasonality, signal spike months, enrichment response windows. | Prompt 26 | 3 hours |
| 18.2 | **`property_transaction_windows` table** — Per-property convergence analysis: when lease expiration + loan maturity + owner age threshold overlap. | Prompt 26 | 4 hours |
| 18.3 | **`temporal_snapshots` table** — Monthly system metrics for trend detection. | Prompt 26 | 2 hours |
| 18.4 | **Convergence window detection** — Properties with 3+ converging temporal signals get up to 1.5x timing multiplier on TPE. | Prompt 26 | 1 day |
| 18.5 | **Seasonality detection** — Chi-squared test on monthly deal close distributions. Agents adjust cadence (Researcher scans more in peak months). | Prompt 26 | 4 hours |
| 18.6 | **Hold duration survival analysis** — Kaplan-Meier on sale comps: "What % of properties purchased in 2016 have sold by now?" | Prompt 26 | 1 day |

### Tier 19 — Predictive Deal Scoring (Before Signals Appear)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 19.1 | **`predictive_scores` table** — Per-property probability of transaction in 3/6/12 months. Expected value = probability × estimated commission. | Prompt 35 | 1 day |
| 19.2 | **`prediction_outcomes` table** — Ground truth tracking: did the property actually transact? Nightly snapshot comparison. | Prompt 35 | 4 hours |
| 19.3 | **`predictive_feature_weights` table** — Domain-knowledge heuristic weights (Phase 1), then outcome-calibrated via Platt scaling (Phase 2 at month 6+). | Prompt 35 | 4 hours |
| 19.4 | **Pre-signal outreach** — Contact owners BEFORE they decide to sell/lease. Matcher generates "anticipatory" outreach with different tone (advisory, not reactive). | Prompt 35 | 1 day |
| 19.5 | **Validation framework** — Quarterly Brier score calibration, prediction-vs-outcome reports, leading indicator identification. | Prompt 35 | 4 hours |

### Tier 20 — Market Theory & Knowledge Base (Compounding Understanding)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 20.1 | **`market_beliefs` table** — Testable beliefs with measurement SQL, evidence count, confidence score, weekly auto-testing. Example: "LLC owners in Fontana hold 7-10 years avg." | Prompt 31 | 1 day |
| 20.2 | **`market_thesis` table** — Living narrative document: industrial thesis, owner behavior patterns, opportunity zones, contrarian views. Updated weekly by Chief of Staff. | Prompt 31 | 4 hours |
| 20.3 | **Belief testing engine** — Weekly cron queries actual data against each belief. Confirms, contradicts, or flags uncertainty. Contradiction detection catches regime changes 6+ weeks early. | Prompt 31 | 1 day |
| 20.4 | **`knowledge_entries` table** — Learned insights with lifecycle: Hypothesis → Emerging (2-5 evidence points) → Established (5+) → Proven (20+). 90-day revalidation. | Prompt 36 | 1 day |
| 20.5 | **`knowledge_validations` table** — Evidence linking: which deals, interactions, or metrics prove/contradict this insight? | Prompt 36 | 3 hours |
| 20.6 | **Agent knowledge query** — Before Enricher processes a trust-owned property, it queries: "What do we know about trust-owned properties?" and adjusts approach. | Prompt 36 | 4 hours |
| 20.7 | **Auto-generation** — SQL queries detect patterns: source reliability trends, deal closure correlations, outreach response patterns → proposed knowledge entries. | Prompt 36 | 1 day |

### Tier 21 — Simulation Engine (Model the Future)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 21.1 | **`simulation_scenarios` table** — Scenario definitions + Monte Carlo results (10,000 runs per simulation). | Prompt 27 | 1 day |
| 21.2 | **`simulation_assumptions_log` table** — Assumption accuracy tracking. When deals close, compare assumed vs actual values. | Prompt 27 | 3 hours |
| 21.3 | **`market_data_points` table** — Researcher-fed market data: cap rates, vacancy rates, rental trends, construction pipeline by submarket. | Prompt 27 | 3 hours |
| 21.4 | **Server-side Monte Carlo engine** — Triangular distributions for cap rate/vacancy, normal for rates/rent growth. Five scenario types: sale, lease, hold vs sell, rate sensitivity, vacancy stress. | Prompt 27 | 3 days |
| 21.5 | **Assumption feedback loop** — Post-deal: actual vs assumed comparison → systematic bias detection → default assumption adjustment. | Prompt 27 | 4 hours |
| 21.6 | **Client-ready output** — Probability fan charts, sensitivity matrices, scenario comparisons. PDF export for presentations. | Prompt 27 | 2 days |

### Tier 22 — Multi-Modal & Cross-Type Intelligence

| # | Item | Source | Effort |
|---|------|--------|--------|
| 22.1 | **PDF OM extraction pipeline** — Claude Vision parses offering memorandums: financial tables, rent rolls, property data → sandbox staging. Saves 32-64 hrs/month. Cost: $25-35/month. | Prompt 29 | 2 days |
| 22.2 | **Phone call transcription** — Local Whisper on Mac Mini (free). Auto-creates interactions with intent classification and follow-up extraction. | Prompt 29 | 2 days |
| 22.3 | **Property photo scoring** — Condition scores (1-10) from photos feed TPE as multiplier. Distressed properties score higher. | Prompt 29 | 1 day |
| 22.4 | **`cross_type_rules` table** — Encodes CRE knowledge: warehouse expansion → office need, big-box vacancy → industrial conversion. | Prompt 30 | 4 hours |
| 22.5 | **`company_lifecycle` table** — Tracks companies through startup/growth/expansion/mature/contraction/exit with space need predictions. | Prompt 30 | 4 hours |
| 22.6 | **`conversion_analysis` table** — Property type arbitrage value calculation. | Prompt 30 | 3 hours |

### Tier 23 — Strategic Collaboration & Data Moat

| # | Item | Source | Effort |
|---|------|--------|--------|
| 23.1 | **Strategy Mode in Claude Panel** — 5-phase protocol: Thesis → Evidence → Challenge → Refine → Commit. Each session produces actionable outputs (enrichment queues, campaigns, TPE adjustments). | Prompt 33 | 5 days |
| 23.2 | **`strategy_sessions` + `strategy_session_turns` tables** — Session history with entity links, data verdicts, and committed actions. | Prompt 33 | 3 hours |
| 23.3 | **`data_moat_registry` table** — Tracks every unique data asset: what it is, replaceability score (0-100), growth rate, protection level. | Prompt 34 | 3 hours |
| 23.4 | **`data_moat_snapshots` table** — Monthly moat health: total assets, average uniqueness, compound growth rate. | Prompt 34 | 2 hours |
| 23.5 | **Moat acceleration strategies** — Systematic owner age research, outcome tracking on every outreach, competitive win/loss documentation, weekly strategy sessions. | Prompt 34 | Ongoing |
| 23.6 | **Antifragile `failure_events` table** — Every failure is a structured learning event with root cause, learning extracted, and remediation applied. | Prompt 32 | 4 hours |
| 23.7 | **`strategy_overrides` table** — Category-specific strategy switching: when standard enrichment consistently fails for a category (e.g., trust owners), auto-switch to alternative approach. | Prompt 32 | 4 hours |
| 23.8 | **Failure journal** — Weekly synthesis of failures → strategic insights for Chief of Staff. Each failure makes the system stronger. | Prompt 32 | 3 hours |

---

## New Tables Summary (Round 3)

| Table | Tier | Purpose |
|-------|------|---------|
| `recommendation_explanations` | 16 | Structured reasoning for every recommendation |
| `tpe_score_history` | 16 | Weekly TPE snapshots with factor breakdowns |
| `relationship_edges` | 17 | Weighted relationship graph from all junction tables |
| `relationship_graph_cache` | 17 | Nightly hub scores and centrality metrics |
| `relationship_path_cache` | 17 | Pre-computed warm intro paths |
| `temporal_patterns` | 18 | Discovered cyclical patterns in system data |
| `property_transaction_windows` | 18 | Per-property temporal convergence analysis |
| `temporal_snapshots` | 18 | Monthly metrics for trend detection |
| `predictive_scores` | 19 | Probability of transaction in 3/6/12 months |
| `prediction_outcomes` | 19 | Ground truth for prediction validation |
| `predictive_feature_weights` | 19 | Calibrated scoring weights |
| `market_beliefs` | 20 | Testable beliefs about IE market dynamics |
| `market_thesis` | 20 | Living market narrative document |
| `knowledge_entries` | 20 | Learned insights with evidence lifecycle |
| `knowledge_validations` | 20 | Evidence links proving/contradicting insights |
| `simulation_scenarios` | 21 | Monte Carlo scenario definitions + results |
| `simulation_assumptions_log` | 21 | Assumption accuracy tracking |
| `market_data_points` | 21 | Researcher-fed market metrics by submarket |
| `cross_type_rules` | 22 | Cross-property-type inference rules |
| `company_lifecycle` | 22 | Company stage tracking with space predictions |
| `conversion_analysis` | 22 | Property type arbitrage calculations |
| `strategy_sessions` | 23 | Strategy brainstorming session history |
| `strategy_session_turns` | 23 | Individual turns within sessions |
| `data_moat_registry` | 23 | Unique data asset tracking |
| `data_moat_snapshots` | 23 | Monthly moat health metrics |
| `failure_events` | 23 | Structured failure learning events |
| `strategy_overrides` | 23 | Category-specific strategy switching rules |

**27 new tables in Round 3.** Combined with Round 1 (12) and Round 2 (11) = **50 total new tables across all three rounds.**

---

## The Complete 23-Tier System

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
```

---

## The Compounding Flywheel (All 3 Rounds)

```
David sets quarterly goals (Tier 13)
    ↓
Chief of Staff decomposes using Market Theory (Tier 20)
    ↓
Predictive scoring identifies targets BEFORE signals (Tier 19)
    ↓
Temporal intelligence times outreach to transaction windows (Tier 18)
    ↓
Relationship graph finds warm intro paths (Tier 17)
    ↓
Agents work with shared context + feedback digests (Tiers 8-9)
    ↓
Multi-modal pipeline processes OMs, photos, calls (Tier 22)
    ↓
Cross-type rules detect adjacent opportunities (Tier 22)
    ↓
Matcher drafts explained, path-aware outreach (Tiers 16-17)
    ↓
Email pipeline sends, tracks, creates follow-ups (Tier 3)
    ↓
David reviews in Strategy Mode sessions (Tier 23)
    ↓
Outcomes feed knowledge base + prediction calibration (Tiers 19-20)
    ↓
Failures make system stronger via antifragility (Tier 23)
    ↓
Data moat grows — each month harder to replicate (Tier 23)
    ↓
Simulation engine models future scenarios (Tier 21)
    ↓
Innovation Agent proposes next capability (Tier 15)
    ↓
COMPOUND LOOP: Market theory updates → better predictions →
  better timing → better outreach → more deals →
  more ground truth → better theory → ...
```

---

## Key Insight: Data Moat Assessment

**David's moat today (month 0):** CoStar data (commodity, score 0), basic CRM contacts (low, score 20), David's manual deal knowledge (high, score 80).

**David's moat at month 12 with this system:**
| Asset | Uniqueness | Growth Rate | Moat Score |
|-------|-----------|-------------|------------|
| Approval pattern model (what David values) | 95 | Compound | 94 |
| Enrichment ground truth (verified contacts) | 90 | Linear | 88 |
| Deal outcome calibration (what actually works) | 92 | Compound | 90 |
| Market belief validations (tested theories) | 88 | Compound | 85 |
| Relationship strength scores (real interactions) | 85 | Linear | 82 |
| Temporal transaction patterns (timing intelligence) | 90 | Compound | 87 |
| Knowledge base entries (proven insights) | 88 | Compound | 85 |
| Competitive win/loss analysis | 80 | Linear | 75 |

**A competitor starting from scratch would need 2+ years to replicate the behavioral and knowledge layers.** The compound assets (approval patterns, market beliefs, deal calibration) are the strongest moat — they get exponentially harder to replicate over time.

---

## Recommended Round 3 Build Sequence

| Phase | Tiers | Timing (after Rounds 1-2) | Rationale |
|-------|-------|---------------------------|-----------|
| Phase I | Tier 16 (Explainability) | Week 21-22 | Immediate value — faster reviews, higher trust |
| Phase II | Tier 20 (Market Theory + Knowledge Base) | Week 23-25 | Compounds everything else — agents think before acting |
| Phase III | Tier 17 (Relationship Graph) | Week 26-27 | Changes outreach quality fundamentally |
| Phase IV | Tier 18 (Temporal Intelligence) | Week 28-29 | Adds WHEN to the system's repertoire |
| Phase V | Tier 19 (Predictive Scoring) | Week 30-31 | The ultimate competitive edge — pre-signal outreach |
| Phase VI | Tier 22 (Multi-Modal + Cross-Type) | Week 32-34 | Expands information surface area |
| Phase VII | Tier 21 (Simulation Engine) | Week 35-37 | Client-facing analytical tool |
| Phase VIII | Tier 23 (Strategy + Moat + Antifragility) | Week 38-40 | Meta-layer: ensures the system keeps compounding |

---

## Detailed Design Documents

- `docs/superpowers/plans/2026-03-13-prompts-25-28-strategic-cognition.md`
- `docs/superpowers/specs/2026-03-13-prompts-29-32-strategic-cognition.md`
- `docs/superpowers/specs/2026-03-13-prompts-33-36-deep-strategy-layer.md`

---

*Round 1 makes the system work. Round 2 makes it think. Round 3 makes it understand.*

*Created: March 13, 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
