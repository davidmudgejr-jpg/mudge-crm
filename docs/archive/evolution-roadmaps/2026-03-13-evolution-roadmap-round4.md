# IE CRM + AI System — Evolution Roadmap Round 4

**Predictive Intelligence, Data Gap Awareness & Human-in-the-Loop Data Requests**
**Generated from 12 Fourth-Round Deep Audit Prompts — March 13, 2026**

---

## What Round 4 Adds

Round 1 = **Plumbing** (data flows, auth, endpoints)
Round 2 = **Nervous System** (feedback loops, self-calibration, anomaly detection)
Round 3 = **Brain** (market understanding, prediction, simulation, relationship reasoning)
Round 4 = **Foresight** (predictive accuracy, data-aware predictions, human-AI data collaboration)

Round 4 transforms the system from a strategic thinker into a **predictive engine that knows what it doesn't know**. It tells David exactly which data to look up, estimates the dollar value of that research time, calibrates its own predictions against reality, and adapts to different market conditions — all while working within the constraint of not having access to premium data sources like CoStar or ZoomInfo.

### The Core Problem Round 4 Solves

**The system makes predictions but doesn't know how good they are, what data would make them better, or how to ask David for help efficiently.** Specifically:
- Predictions have no calibration — a "70% probability" prediction is currently meaningless because nobody has measured if 70% predictions actually happen 70% of the time
- The system doesn't know which missing data would most improve its predictions
- When David has research time, there's no way to optimize what he looks up
- Premium data gaps (CoStar, ZoomInfo) have no proxy signal framework
- Different market conditions require different prediction strategies, but the system uses one model for all conditions
- Individual predictions exist but can't aggregate into portfolio-level strategic forecasts

---

## New Capability Tiers (Extends Rounds 1-3's Tiers 0-23)

### Tier 24 — Data Inventory & Gap Intelligence (Know What You're Missing)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 24.1 | **`data_inventory` table** — Complete field-by-field inventory across contacts, properties, companies, deals, comps, TPE, and agent infrastructure. Tracks fill_rate per field, last_updated, staleness. | Prompt 37 | 3 hours |
| 24.2 | **`data_gap_registry` table** — Every known data gap: source_if_available, impact_score (1-100), proxy_available, proxy_reliability (0-1), manual_lookup_difficulty (easy/moderate/hard), manual_lookup_instructions, records_affected_count. | Prompt 37 | 3 hours |
| 24.3 | **Nightly `audit_data_fill_rates()` function** — PL/pgSQL function that scans all entity tables and computes per-field fill rates, staleness metrics, and gap severity scores. | Prompt 37 | 4 hours |
| 24.4 | **Data Health Dashboard** — UI showing fill rate by category with color coding (green >80%, yellow 50-80%, red <50%). Drill-down to specific records with missing critical fields. | Prompt 37 | 1 day |
| 24.5 | **15 prioritized data gaps** — Mapped with impact scores: lease expirations (95), owner contact info (90), CMBS loan maturity (88), company headcount (85), property condition (82), tenant financials (80), etc. | Prompt 37 | 2 hours |

### Tier 25 — Data Bounty System (Human-in-the-Loop Intelligence)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 25.1 | **`data_bounties` table** — entity_type, entity_id, missing_field, current_prediction, predicted_improvement, priority_score, lookup_instructions, suggested_sources, status (pending/assigned/completed/expired), outcome_after_fill. | Prompt 38 | 3 hours |
| 25.2 | **`bounty_batches` table** — Groups related bounties by geography + property type for efficient research sessions. "Look up lease expirations for these 12 Fontana industrial properties." | Prompt 38 | 2 hours |
| 25.3 | **Prioritization algorithm** — `priority = (current_tpe × improvement_potential × deal_value_estimate) / (lookup_difficulty × estimated_minutes)`. Caps at 10 bounties/day. | Prompt 38 | 3 hours |
| 25.4 | **Morning briefing bounty section** — "Today's top 5 data bounties — estimated value: $X in potential commission." With specific examples: "ABC Logistics lease expiration unknown. If it expires within 18 months, probability jumps from 22% to 67%." | Prompt 38 | 3 hours |
| 25.5 | **Completion feedback loop** — When David fills data, trigger immediate TPE recalculation. Track 180-day outcomes. `bounty_calibration` view refines future predictions. | Prompt 38 | 4 hours |
| 25.6 | **Bounty ROI tracking** — Track: did predictions improve? Did deals materialize? Use outcomes to refine which data types are worth pursuing. | Prompt 38 | 3 hours |

### Tier 26 — Proxy Signal Framework (Substitute for Premium Data)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 26.1 | **`proxy_signals` table** — 45+ proxy signals across 5 categories. Each: what premium data it approximates, source, collection method, reliability rating (0.0-1.0), freshness interval, responsible agent. | Prompt 39 | 3 hours |
| 26.2 | **`proxy_signal_values` table** — Collected proxy values per entity with timestamp, source, and confidence. | Prompt 39 | 2 hours |
| 26.3 | **`proxy_reliability_tracking` table** — Compares proxy predictions against actual outcomes when ground truth becomes available. Auto-adjusts reliability ratings. | Prompt 39 | 3 hours |
| 26.4 | **Occupancy proxies** — Google Maps reviews, Yelp listings, job postings at address, USPS indicators, utility records. Substitute for CoStar vacancy data. Reliability: 0.45-0.70. | Prompt 39 | 1 day |
| 26.5 | **Company health proxies** — Job posting velocity, Glassdoor reviews, press releases, SEC filings, UCC liens, bankruptcy filings. Substitute for ZoomInfo firmographics. Reliability: 0.50-0.80. | Prompt 39 | 1 day |
| 26.6 | **Lease expiration proxies** — County assessor changes, business license renewals, TI permits, signage permits, broker listing activity. Reliability: 0.35-0.65. | Prompt 39 | 1 day |
| 26.7 | **Market trend proxies** — Building permits, BLS employment, Census population, freight indices, Port of LA/LB volume. Substitute for CBRE/Moody's forecasts. Reliability: 0.60-0.85. | Prompt 39 | 4 hours |
| 26.8 | **Owner intent proxies** — CMBS loan data (public), tax delinquency, code violations, deferred maintenance, owner age, portfolio concentration. Reliability: 0.40-0.75. | Prompt 39 | 4 hours |
| 26.9 | **Composite proxy scoring** — Combine multiple weak proxies into stronger signals. Three 0.5-reliability proxies that agree = 0.82 composite confidence. | Prompt 39 | 4 hours |

### Tier 27 — Multi-Horizon Prediction Engine (30/90/180/365 Days)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 27.1 | **`predictions` table** — entity_type, entity_id, horizon_days, probability, confidence_lower, confidence_upper, top_features (JSONB ranked), model_version, predicted_at, expires_at. | Prompt 40 | 3 hours |
| 27.2 | **`prediction_history` table** — Tracks prediction changes over time. "This property's 90-day probability has been climbing for 3 weeks." Trend analysis and momentum detection. | Prompt 40 | 3 hours |
| 27.3 | **`prediction_triggers` table** — What events cause recalculation: new data, time decay, market regime change, related entity change. Cascade depth limits. | Prompt 40 | 2 hours |
| 27.4 | **30-day feature set** — Active listing, broker inquiry velocity, showing requests, price reduction, pending offers, tenant move-out notices. Confidence bounds: ±10%. | Prompt 40 | 4 hours |
| 27.5 | **90-day feature set** — Lease expiration within window, owner listed other properties, refinancing activity, tenant downsizing signals. Confidence bounds: ±15%. | Prompt 40 | 4 hours |
| 27.6 | **180-day feature set** — Lease approaching, loan maturity, owner age/succession, tenant growth trends, submarket vacancy. Confidence bounds: ±20%. | Prompt 40 | 4 hours |
| 27.7 | **365-day feature set** — Demographic shifts, infrastructure projects, interest rate cycle, tenant industry health. Confidence bounds: ±30%. | Prompt 40 | 4 hours |
| 27.8 | **Prediction momentum detection** — When multiple short-horizon signals align with long-horizon structural factors, boost confidence. Compute alignment, velocity, and persistence scores. | Prompt 40 | 1 day |

### Tier 28 — Prediction Explainability & Actionability (Why + What To Do)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 28.1 | **`explanation_templates` table** — Zero-LLM-cost templates with slot-filling. Transaction, data gap, action, and sensitivity templates per property type. | Prompt 41 | 3 hours |
| 28.2 | **`feature_reason_phrases` table** — Human-readable phrases for each feature contribution. "lease expires Aug 2026" not "lease_exp_proximity = 0.82". | Prompt 41 | 2 hours |
| 28.3 | **`prediction_explanations` table** — prediction_id, explanation_text, data_points_used (JSONB), action_recommended, action_timing, delay_risk_description. | Prompt 41 | 3 hours |
| 28.4 | **`action_recommendations` table** — prediction_id, action_type (call/email/visit/research), target_person, optimal_date, urgency_score, delay_cost_estimate, status (pending/taken/skipped/expired). | Prompt 41 | 3 hours |
| 28.5 | **"What Would Change This" panel** — For any prediction: top 5 contributing factors, sensitivity coefficients, what-if scenarios. "If lease expiration confirmed within 12 months, prediction moves from 35% to 72%." | Prompt 41 | 1 day |
| 28.6 | **Auto-bounty generation** — When prediction has high probability but low confidence due to missing data, auto-generate data bounty (links to Tier 25). | Prompt 41 | 3 hours |

### Tier 29 — Data Freshness & Decay Modeling (Trust Your Data)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 29.1 | **`data_freshness_rules` table** — Per-field decay parameters: half_life_days, stale_threshold, dead_threshold, reverification_method, reverification_cost, auto_reverify flag. | Prompt 42 | 2 hours |
| 29.2 | **`field_timestamps` table** — entity_type, entity_id, field_name, last_verified_at, verification_source, confidence_at_verification, current_decay_factor. | Prompt 42 | 3 hours |
| 29.3 | **`reverification_queue` table** — Priority-scored queue of stale fields. Assigned to Enricher agent or David. | Prompt 42 | 2 hours |
| 29.4 | **Exponential decay function** — `confidence = original × e^(-λt)` where λ = ln(2)/half_life_days. Nightly bulk computation. | Prompt 42 | 3 hours |
| 29.5 | **15 data type decay rates** — Asking price (30-day half-life), phone (240 days), email (365 days), job title (180 days), lease expiration (fixed/no decay), ownership (180 days), vacancy (60 days). | Prompt 42 | 2 hours |
| 29.6 | **Prediction staleness warnings** — Flag predictions relying heavily on stale data. "Warning: this prediction is based on 14-month-old contact information." | Prompt 42 | 3 hours |
| 29.7 | **Enricher reverification budget** — 20% of daily Enricher capacity dedicated to reverifying stale data on high-TPE entities. 80% on new research. | Prompt 42 | 2 hours |

### Tier 30 — Feature Importance & Adaptive Weights (What Actually Matters)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 30.1 | **`feature_importance` table** — feature_name, transaction_type, property_type, submarket, current_weight, baseline_weight, last_recalculated, sample_size, statistical_significance. | Prompt 43 | 3 hours |
| 30.2 | **`feature_sensitivity` table** — prediction_id, feature_name, current_value, sensitivity_coefficient, marginal_value_of_information (dollar estimate). | Prompt 43 | 3 hours |
| 30.3 | **`feature_weight_history` table** — Tracks weight changes over time. Monthly delta reports to David. | Prompt 43 | 2 hours |
| 30.4 | **10 sale prediction features** — Owner hold duration (18%), loan maturity (15%), owner age (12%), cap rate vs market (10%), comp velocity (10%), property condition (8%), tax assessment (7%), portfolio strategy (7%), tenant quality (7%), market regime (6%). | Prompt 43 | 4 hours |
| 30.5 | **10 lease prediction features** — Lease expiration (25%), tenant growth signals (15%), space utilization (12%), comp lease rates (10%), tenant industry (10%), building class match (8%), vacancy trend (8%), landlord flexibility (5%), tenant credit (4%), geographic expansion (3%). | Prompt 43 | 4 hours |
| 30.6 | **Adaptive weight learning** — After 100+ outcomes, begin adjusting weights. Guardrails: 2-30% range, max 3% monthly change. Submarket-specific variations (Ontario vs Fontana). | Prompt 43 | 1 day |
| 30.7 | **"If I Had Perfect Data" analysis** — For any entity: which 5 fields would most improve prediction accuracy, ranked by marginal value of information in dollar terms. Drives Data Bounty prioritization. | Prompt 43 | 4 hours |

### Tier 31 — Prediction Calibration & Self-Correction (Are You Actually Right?)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 31.1 | **`prediction_outcomes_v2` table** — prediction_id, predicted_probability, predicted_horizon, actual_outcome, outcome_date, outcome_type, time_to_outcome_days. Ground truth tracking. | Prompt 44 | 3 hours |
| 31.2 | **`calibration_snapshots` table** — Monthly: brier_score, calibration_error, discrimination_score, resolution_score, sample_size, property_type_breakdown (JSONB). | Prompt 44 | 3 hours |
| 31.3 | **`calibration_adjustments` table** — Per probability bucket: raw_prediction_avg vs actual_outcome_rate. Auto-deflation/inflation factors. | Prompt 44 | 3 hours |
| 31.4 | **Cold-start phases** — Months 1-3: uncalibrated (domain knowledge only). Months 4-6: early calibration (wide intervals). Months 7+: full calibration (200+ expired predictions required). | Prompt 44 | 2 hours |
| 31.5 | **`prediction_tournaments` + `tournament_entries` tables** — 5 competing prediction approaches run in parallel. Automatic winner promotion based on Brier score. | Prompt 44 | 1 day |
| 31.6 | **Drift detection** — If calibration error exceeds threshold for 2 consecutive months, alert David with specific failure mode diagnosis. | Prompt 44 | 3 hours |
| 31.7 | **Monthly calibration report** — "Of 45 predictions at 70% confidence, 32 (71%) actually transacted. Calibration: excellent. Discrimination: good (AUC 0.78)." | Prompt 44 | 3 hours |

### Tier 32 — Portfolio Predictions & Pipeline Intelligence (The Big Picture)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 32.1 | **`portfolio_predictions` table** — deal_count_low/expected/high, commission_low/expected/high, confidence_level, top_submarkets (JSONB), pipeline_health_score (0-100). Monte Carlo aggregation. | Prompt 45 | 4 hours |
| 32.2 | **`portfolio_segments` table** — Breakdowns by submarket/property_type/deal_type: entity_count, avg_probability, expected_deals, expected_commission, data_completeness_pct. | Prompt 45 | 3 hours |
| 32.3 | **`pipeline_stages` table** — Per-entity: current_stage (cold/warming/warm/hot/active/closing), stage_probability, days_in_stage, next_stage_probability. Plus `pipeline_stage_history`. | Prompt 45 | 4 hours |
| 32.4 | **Monte Carlo aggregation** — 10,000 runs with correlated submarket shocks. Produces percentile distributions, not point estimates. "60% confidence of $1.2-1.8M commission." | Prompt 45 | 1 day |
| 32.5 | **Pipeline Health Score** — 5 components: diversity via HHI (25%), velocity (25%), data quality (20%), conversion trend (15%), coverage (15%). | Prompt 45 | 4 hours |
| 32.6 | **Portfolio morning briefing** — "Pipeline: 47 active, $3.2M potential. Movers: 3 warm→hot. Risk: 2 hot deals quiet 14 days. Opportunity: 5 Fontana properties >60% but no owner contact." | Prompt 45 | 3 hours |
| 32.7 | **Pipeline Board Kanban UI** — Visual pipeline with drag-and-drop stage transitions, color-coded by probability and data completeness. | Prompt 45 | 2 days |

### Tier 33 — Competitive Prediction Intelligence (What Will They Do?)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 33.1 | **`competitor_predictions` table** — competitor_id, prediction_type (listing/acquisition/focus_shift/client_loss), probability, evidence (JSONB), recommended_response. | Prompt 46 | 3 hours |
| 33.2 | **`competitor_activity_feed` table** — Real-time tracking: new listings, price changes, withdrawn listings, transaction closings. Source detection. | Prompt 46 | 3 hours |
| 33.3 | **`competitive_opportunities` table** — Trigger-based: expired_listing, price_reduction, client_departure, focus_shift. Window_days, priority_score, recommended_action. | Prompt 46 | 3 hours |
| 33.4 | **Listing loss prediction** — >180 days + 2 price reductions = 70%+ listing expiration probability. Auto-alert David. | Prompt 46 | 4 hours |
| 33.5 | **Focus shift detection** — Geographic distribution delta analysis. "Competitor Y shifting to Riverside — Ontario may be underserved." | Prompt 46 | 4 hours |
| 33.6 | **Competitive morning briefing** — "Competitor X listing expired yesterday at 1234 Industrial Way. Owner may be frustrated. Call today." | Prompt 46 | 3 hours |

### Tier 34 — Market Regime Detection (Different Markets, Different Strategies)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 34.1 | **`market_regimes` table** — Per submarket + property type: current_regime (Boom/Stable Growth/Plateau/Correction/Recovery), confidence, duration, transition_probability (JSONB). | Prompt 47 | 3 hours |
| 34.2 | **`regime_prediction_adjustments` table** — Regime-specific probability multipliers and feature weight overrides. Seed data for all 5 regime × transaction-type combinations. | Prompt 47 | 4 hours |
| 34.3 | **`regime_history` table** — Historical regime tracking with key events per transition. | Prompt 47 | 2 hours |
| 34.4 | **`regime_indicators` table** — 8 weighted signals: vacancy trend (20%), DOM (15%), listing volume (15%), price/SF (15%), rates (10%), employment (10%), permits (8%), port volume (7%). | Prompt 47 | 3 hours |
| 34.5 | **Regime-adaptive predictions** — Boom: boost sale probability, shorten horizons. Correction: boost distressed sales, increase lease probability. Recovery: boost opportunistic purchases. | Prompt 47 | 1 day |
| 34.6 | **Regime transition alerts** — "IE Industrial transitioning from Stable Growth to Plateau. Key signals: DOM up 22% in 60 days, 3 listings withdrawn. Shift to lease renewals and tenant rep." | Prompt 47 | 3 hours |

### Tier 35 — Data Value Estimation & Research ROI (Is It Worth Looking Up?)

| # | Item | Source | Effort |
|---|------|--------|--------|
| 35.1 | **`data_value_estimates` table** — data_type, records_affected, avg_prediction_improvement, total_estimated_value, estimated_lookup_time_hours, roi_per_hour, status. | Prompt 48 | 3 hours |
| 35.2 | **`data_value_actuals` table** — actual_prediction_improvement, actual_deals_influenced, actual_commission_generated, actual_time_spent, actual_roi_per_hour. | Prompt 48 | 3 hours |
| 35.3 | **VOI formula** — `Value = Σ(probability_improvement × deal_value × commission_rate) - (lookup_hours × hourly_rate)` for all affected entities. | Prompt 48 | 3 hours |
| 35.4 | **Research Session Optimizer** — Greedy knapsack: given X hours of research time, produce optimal research plan ranked by ROI. "45 min on lease expirations ($85K value) → 20 min on phone verification ($42K) → 35 min on assessor records ($38K)." | Prompt 48 | 1 day |
| 35.5 | **Data Investment Portfolio view** — Historical ROI by data type. "Lease expiration research has 4x the ROI of phone number verification." Helps David allocate limited research time. | Prompt 48 | 4 hours |
| 35.6 | **Monthly ROI report** — "Your research time last month: 12 hours, effective ROI $18K/hour. Most valuable: lease expirations. Least valuable: company revenue estimates." | Prompt 48 | 3 hours |
| 35.7 | **30/90/180-day outcome tracking** — After research completion, measure actual prediction improvement at each interval. Refine VOI model. | Prompt 48 | 4 hours |

---

## New Tables Summary (Round 4)

| Table | Tier | Purpose |
|-------|------|---------|
| `data_inventory` | 24 | Field-by-field fill rate tracking across all entities |
| `data_gap_registry` | 24 | Known data gaps with impact scores and proxy info |
| `data_bounties` | 25 | Prioritized data lookup requests for David |
| `bounty_batches` | 25 | Geographic/type groupings for efficient research |
| `proxy_signals` | 26 | Free/low-cost proxy signal definitions |
| `proxy_signal_values` | 26 | Collected proxy values per entity |
| `proxy_reliability_tracking` | 26 | Proxy accuracy vs ground truth |
| `predictions` | 27 | Multi-horizon transaction probability predictions |
| `prediction_history` | 27 | Prediction changes over time (trend analysis) |
| `prediction_triggers` | 27 | Events that cause prediction recalculation |
| `explanation_templates` | 28 | Zero-LLM-cost explanation templates |
| `feature_reason_phrases` | 28 | Human-readable feature descriptions |
| `prediction_explanations` | 28 | Generated explanations for each prediction |
| `action_recommendations` | 28 | Recommended actions with timing and urgency |
| `data_freshness_rules` | 29 | Per-field decay parameters |
| `field_timestamps` | 29 | Last-verified timestamps per field per entity |
| `reverification_queue` | 29 | Prioritized stale data reverification queue |
| `feature_importance` | 30 | Current and baseline feature weights |
| `feature_sensitivity` | 30 | Per-prediction sensitivity coefficients |
| `feature_weight_history` | 30 | Weight change tracking over time |
| `prediction_outcomes_v2` | 31 | Ground truth for prediction validation |
| `calibration_snapshots` | 31 | Monthly calibration metrics |
| `calibration_adjustments` | 31 | Probability bucket adjustment factors |
| `prediction_tournaments` | 31 | Competing prediction approaches |
| `tournament_entries` | 31 | Individual tournament model results |
| `portfolio_predictions` | 32 | Portfolio-level deal/commission forecasts |
| `portfolio_segments` | 32 | Submarket/type breakdowns with expected deals |
| `pipeline_stages` | 32 | Per-entity pipeline stage tracking |
| `pipeline_stage_history` | 32 | Stage transition history |
| `competitor_predictions` | 33 | Predicted competitor actions |
| `competitor_activity_feed` | 33 | Real-time competitor activity tracking |
| `competitive_opportunities` | 33 | Trigger-based competitive opportunities |
| `market_regimes` | 34 | Current market regime per submarket |
| `regime_prediction_adjustments` | 34 | Regime-specific prediction modifiers |
| `regime_history` | 34 | Historical regime tracking |
| `regime_indicators` | 34 | Weighted regime detection signals |
| `data_value_estimates` | 35 | Estimated ROI of looking up specific data |
| `data_value_actuals` | 35 | Actual ROI after research completed |

**39 new tables in Round 4.** Combined with Rounds 1 (12), 2 (11), and 3 (27) = **89 total new tables across all four rounds.**

---

## The Complete 35-Tier System

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
```

---

## The Predictive Intelligence Flywheel

```
David has 2 hours for research this morning
    ↓
Data Value Calculator ranks what to look up by ROI per hour (Tier 35)
    ↓
Data Bounties present specific records + fields to research (Tier 25)
    ↓
"Look up lease expirations for 8 Fontana properties — est value: $85K"
    ↓
David completes research, fills in data
    ↓
Predictions recalculate immediately (Tier 27)
    ↓
Prediction explanations update: "Now 72% because lease expires Aug 2026" (Tier 28)
    ↓
Action recommendations generate: "Call CFO before June" (Tier 28)
    ↓
Meanwhile, proxy signals fill gaps David can't look up (Tier 26)
    ↓
Data freshness model down-weights stale inputs (Tier 29)
    ↓
Feature importance learns which data actually mattered (Tier 30)
    ↓
Calibration system checks: was the 72% prediction accurate? (Tier 31)
    ↓
Portfolio predictions aggregate: "On track for 10 deals this quarter" (Tier 32)
    ↓
Competitive intelligence surfaces: "Competitor listing expired — call owner" (Tier 33)
    ↓
Market regime adjusts all predictions for current conditions (Tier 34)
    ↓
Data gap registry updates: what's still missing? (Tier 24)
    ↓
Tomorrow's bounties are better because yesterday's outcomes fed back
    ↓
COMPOUND LOOP: Better data → better predictions → better actions →
  more deals → more ground truth → better calibration →
  smarter data requests → ...
```

---

## The "Data Bounty" Morning Briefing (Example)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TODAY'S DATA BOUNTIES — Est. value: $127K
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 🏭 LEASE EXPIRATIONS — 8 Fontana industrial properties
   Est. time: 45 min | Est. value: $85K
   "If 3+ expire within 18 months, we surface 3 new hot leads"
   Sources: CoStar, property manager calls, county records

2. 📞 PHONE VERIFICATION — 5 high-TPE contacts
   Est. time: 20 min | Est. value: $42K
   "John Smith (CFO, XYZ Corp) — connected to 3 hot properties.
    Phone last verified 14 months ago."
   Sources: LinkedIn, direct call

3. 📋 OWNERSHIP CHANGES — 12 Ontario office properties
   Est. time: 35 min | Est. value: $38K
   "Recent LLC transfers may indicate motivated sellers"
   Sources: County assessor website

4. ✉️ EMAIL RE-VERIFY — 3 stale addresses for hot leads
   Est. time: 10 min | Est. value: $15K
   Sources: NeverBounce, LinkedIn

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TOTAL: 110 min research | $180K pipeline improvement
  LAST MONTH'S ROI: $18K per hour of research time
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Recommended Round 4 Build Sequence

| Phase | Tiers | Timing (after Rounds 1-3) | Rationale |
|-------|-------|---------------------------|-----------|
| Phase I | Tier 24 (Data Inventory) + Tier 29 (Freshness) | Week 41-42 | Foundation — know what you have and how stale it is |
| Phase II | Tier 30 (Feature Importance) + Tier 27 (Multi-Horizon) | Week 43-45 | Core prediction engine with ranked features |
| Phase III | Tier 28 (Explainability) + Tier 25 (Data Bounties) | Week 46-48 | The killer feature — "look up THIS because it's worth $X" |
| Phase IV | Tier 26 (Proxy Signals) | Week 49-50 | Fill gaps without premium data access |
| Phase V | Tier 31 (Calibration) + Tier 35 (Data Value) | Week 51-53 | Self-correction + ROI tracking |
| Phase VI | Tier 32 (Portfolio) + Tier 34 (Market Regimes) | Week 54-56 | Strategic layer — big picture + market conditions |
| Phase VII | Tier 33 (Competitive Prediction) | Week 57-58 | Competitive edge — predict what competitors will do |

---

## Detailed Design Documents

- `docs/superpowers/plans/2026-03-13-prompts-37-40-predictive-intelligence.md`
- `docs/superpowers/specs/2026-03-13-prompts-41-44-prediction-actionability.md`
- `docs/superpowers/specs/2026-03-13-prompts-45-48-portfolio-predictions.md`

---

*Round 1 makes the system work. Round 2 makes it think. Round 3 makes it understand. Round 4 makes it predict — and know what it doesn't know.*

*Created: March 13, 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
