# IE CRM AI Master System -- Predictive Intelligence Layer: Prompts 45-48
# Portfolio Predictions, Competitive Intelligence, Market Regimes, Data Value ROI

**Date:** 2026-03-13
**Status:** Design Spec (Round 4 -- Predictive Intelligence, Part 2)
**Scope:** Four capabilities that elevate predictions from entity-level to portfolio-level, add competitive awareness, adapt to market regimes, and quantify the ROI of David's research time
**Depends on:** Migration 006 (TPE schema), Migration 007 (AI sandbox), Prompts 35-36 (predictive scoring, knowledge base), Prompts 37-44 (data gaps, proxy signals, multi-horizon, explainability, calibration)

---

## What Prompts 45-48 Add

Prompts 37-44 built the **prediction engine** -- individual property/contact probabilities, multi-horizon forecasts, explainability, and calibration. Prompts 45-48 build the **strategic prediction layer** on top:

| # | Capability | Core Problem | Key Deliverable |
|---|-----------|-------------|----------------|
| 45 | Portfolio-Level Predictions | Individual predictions exist but David needs aggregate pipeline forecasts for quarterly planning | Monte Carlo pipeline simulation with health scoring |
| 46 | Competitive Intelligence Prediction | Competitor behavior is untracked -- expired listings, focus shifts, and client departures are missed opportunities | Competitor tracking feed with predictive alerts |
| 47 | Market Regime Detection | Predictions calibrated in a hot market fail in a cold one -- no regime awareness | Adaptive regime detection with prediction multipliers |
| 48 | Data Value Estimation | David spends research time without knowing which data has the highest ROI | VOI calculator with research session optimizer |

---

## Table of Contents

1. [Prompt 45: Portfolio-Level vs. Entity-Level Predictions](#prompt-45)
2. [Prompt 46: Competitive Intelligence Prediction](#prompt-46)
3. [Prompt 47: Market Regime Detection & Adaptive Predictions](#prompt-47)
4. [Prompt 48: Data Value Estimation & ROI Calculator](#prompt-48)
5. [New Tables Summary](#new-tables)
6. [Migration: 014_portfolio_competitive_regime_dataroi.sql](#migration)
7. [Integration Map](#integration-map)
8. [Implementation Priority](#priority)

---

<a id="prompt-45"></a>
# PROMPT 45: Portfolio-Level vs. Entity-Level Predictions

## Current State Analysis

The `predictive_scores` table (Prompt 35) stores per-property predictions: `prob_3mo`, `prob_6mo`, `prob_12mo`, expected value per horizon, top features, and leading indicators. The `prediction_outcomes` table tracks accuracy. The `tpe_config` table holds commission rate assumptions (`sale_commission_5m` = 0.03, etc.).

**What exists (entity-level):**
- Per-property transaction probability at 3/6/12-month horizons
- Per-property expected value (probability x estimated commission)
- TPE scores with blended priority ranking
- Contact engagement data via `interactions` and `outbound_email_queue`
- Deal pipeline via `deals` table with `status` field

**What's missing (portfolio-level):**

| Gap | Impact |
|-----|--------|
| **No aggregate pipeline forecast** | David cannot answer "How many deals will I close in Q3?" without manual math |
| **No commission forecast** | No probability distribution on expected commission -- just sum of individual EVs |
| **No submarket/type breakdown** | Cannot compare "Fontana industrial pipeline" vs "Ontario office pipeline" |
| **No pipeline health metric** | No single score for "is my pipeline healthy or am I heading for a dry quarter?" |
| **No stage tracking** | Properties don't move through labeled pipeline stages (cold/warm/hot/active/closing) |
| **No correlation modeling** | Summing individual probabilities ignores that a market downturn tanks ALL probabilities simultaneously |
| **No gap analysis** | System cannot say "you need 15 more contacts in Riverside retail to hit your Q4 target" |

## Proposed Design

### 45.1 -- Two Prediction Levels

**Entity-Level (enhanced from Prompt 35):**

The `predictive_scores` table already handles per-property predictions. Three enhancements:

1. **Per-contact engagement probability** -- new rows in `predictive_scores` using a `entity_type` discriminator (see schema below). Predicts: probability of meaningful response within horizon, probability of becoming a deal source.

2. **Per-company expansion/contraction probability** -- tracks whether a company is likely expanding (needing more space), contracting (shedding space), or stable. Based on: headcount trends, lease expiration timing, industry growth signals, hiring activity from `sandbox_signals`.

3. **Stage assignment** -- each entity gets a pipeline stage label based on its probability and interaction recency (see `pipeline_stages` table).

**Portfolio-Level (NEW):**

Aggregates entity-level predictions into actionable forecasts:

- Deal count distribution: "You'll close 8-12 deals in Q3 (90% CI)"
- Commission distribution: "$2.4M potential, 60% confidence of realizing $1.2-1.8M"
- Submarket breakdown: "Fontana industrial is strongest (4 expected deals), Ontario office is weakest (0-1 deals)"
- Coverage gaps: "You need 15 more verified contacts in Riverside retail to hit Q4 target"
- Pipeline health: single 0-100 score combining diversity, velocity, data quality, conversion trends, and coverage

### 45.2 -- Portfolio Predictions Table

```sql
CREATE TABLE IF NOT EXISTS portfolio_predictions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- When and what horizon
    prediction_date         DATE NOT NULL,
    horizon_days            INTEGER NOT NULL,          -- 90, 180, 365
    horizon_label           TEXT NOT NULL,             -- 'Q3 2026', 'H2 2026', 'FY 2026'

    -- Deal count distribution (from Monte Carlo simulation)
    deal_count_p10          INTEGER NOT NULL,          -- 10th percentile (pessimistic)
    deal_count_p25          INTEGER NOT NULL,          -- 25th percentile
    deal_count_expected     INTEGER NOT NULL,          -- 50th percentile (median)
    deal_count_p75          INTEGER NOT NULL,          -- 75th percentile
    deal_count_p90          INTEGER NOT NULL,          -- 90th percentile (optimistic)

    -- Commission distribution (dollars)
    commission_p10          NUMERIC(12,2) NOT NULL,
    commission_p25          NUMERIC(12,2) NOT NULL,
    commission_expected     NUMERIC(12,2) NOT NULL,    -- median
    commission_p75          NUMERIC(12,2) NOT NULL,
    commission_p90          NUMERIC(12,2) NOT NULL,

    -- Confidence metadata
    confidence_level        NUMERIC(5,4),              -- 0.0-1.0, how confident the model is
    simulation_runs         INTEGER DEFAULT 10000,     -- Monte Carlo iterations
    correlation_model       TEXT DEFAULT 'submarket',  -- 'none', 'submarket', 'copula'

    -- Breakdown by segment
    top_submarkets          JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   {"submarket": "Fontana", "property_type": "Industrial",
    --    "expected_deals": 4, "expected_commission": 480000,
    --    "probability_range": [0.55, 0.75]},
    --   {"submarket": "Ontario", "property_type": "Office",
    --    "expected_deals": 1, "expected_commission": 85000,
    --    "probability_range": [0.10, 0.30]}
    -- ]

    top_property_types      JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   {"property_type": "Industrial", "expected_deals": 7,
    --    "pct_of_pipeline": 0.58},
    --   {"property_type": "Office", "expected_deals": 3,
    --    "pct_of_pipeline": 0.25}
    -- ]

    -- Pipeline health composite score
    pipeline_health_score   INTEGER NOT NULL CHECK (
        pipeline_health_score >= 0 AND pipeline_health_score <= 100
    ),
    health_components       JSONB NOT NULL DEFAULT '{}',
    -- Example: {
    --   "diversity_score": 72,
    --   "velocity_score": 65,
    --   "data_quality_score": 58,
    --   "conversion_trend_score": 80,
    --   "coverage_score": 45
    -- }

    -- Coverage gap analysis
    coverage_gaps           JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   {"segment": "Riverside Retail", "current_contacts": 8,
    --    "target_contacts": 23, "gap": 15,
    --    "impact": "Missing ~$180K potential commission"},
    --   {"segment": "Rancho Cucamonga Industrial", "current_contacts": 3,
    --    "target_contacts": 12, "gap": 9,
    --    "impact": "Missing ~$95K potential commission"}
    -- ]

    -- Risk alerts
    risk_alerts             JSONB NOT NULL DEFAULT '[]',
    -- Example: [
    --   {"type": "concentration", "detail": "62% of pipeline is Fontana Industrial",
    --    "severity": "medium"},
    --   {"type": "stale_hot", "detail": "2 hot deals with no interaction in 14 days",
    --    "severity": "high", "entity_ids": ["uuid1", "uuid2"]}
    -- ]

    -- Model metadata
    model_version           TEXT NOT NULL,
    entity_count            INTEGER NOT NULL,          -- total entities in pipeline
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portfolio_pred_date ON portfolio_predictions(prediction_date DESC);
CREATE INDEX idx_portfolio_pred_horizon ON portfolio_predictions(horizon_days);
CREATE UNIQUE INDEX idx_portfolio_pred_unique
    ON portfolio_predictions(prediction_date, horizon_days, model_version);
```

### 45.3 -- Portfolio Segments Table

```sql
CREATE TABLE IF NOT EXISTS portfolio_segments (
    id                      SERIAL PRIMARY KEY,
    -- Which portfolio prediction this belongs to
    portfolio_prediction_id UUID NOT NULL REFERENCES portfolio_predictions(id) ON DELETE CASCADE,

    -- Segment definition
    segment_type            TEXT NOT NULL CHECK (segment_type IN (
        'submarket', 'property_type', 'deal_type', 'price_range',
        'owner_type', 'hold_duration', 'cross'
    )),
    segment_value           TEXT NOT NULL,             -- 'Fontana', 'Industrial', 'Sale', '$1-5M', 'Trust', '15yr+', 'Fontana Industrial'

    -- Segment metrics
    entity_count            INTEGER NOT NULL,
    avg_probability         NUMERIC(5,4) NOT NULL,     -- average entity-level probability in this segment
    probability_std         NUMERIC(5,4),              -- standard deviation (measures uncertainty)
    expected_deals          NUMERIC(6,2) NOT NULL,     -- sum of individual probabilities
    expected_commission     NUMERIC(12,2) NOT NULL,

    -- Data completeness for this segment
    data_completeness_pct   INTEGER NOT NULL CHECK (
        data_completeness_pct >= 0 AND data_completeness_pct <= 100
    ),
    missing_fields          JSONB DEFAULT '[]',        -- ["lease_expiration", "owner_age", "phone"]

    -- How much could predictions improve with better data
    improvement_potential   NUMERIC(5,4),              -- 0.0-1.0, estimated prediction accuracy gain
    improvement_value       NUMERIC(12,2),             -- dollar value of that improvement

    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portfolio_seg_pred ON portfolio_segments(portfolio_prediction_id);
CREATE INDEX idx_portfolio_seg_type ON portfolio_segments(segment_type, segment_value);
```

### 45.4 -- Pipeline Stages Table

```sql
CREATE TABLE IF NOT EXISTS pipeline_stages (
    id                          SERIAL PRIMARY KEY,
    -- Entity identification
    entity_type                 TEXT NOT NULL CHECK (entity_type IN (
        'property', 'contact', 'company', 'deal'
    )),
    entity_id                   UUID NOT NULL,

    -- Current stage classification
    current_stage               TEXT NOT NULL CHECK (current_stage IN (
        'cold',         -- No interaction, low probability (<10%)
        'warming',      -- Some signals but no engagement yet (10-25%)
        'warm',         -- Initial engagement, moderate probability (25-45%)
        'hot',          -- Active engagement, high probability (45-70%)
        'active',       -- Deal in progress, very high probability (70-90%)
        'closing'       -- Under contract or final negotiations (>90%)
    )),
    stage_probability           NUMERIC(5,4) NOT NULL,  -- entity-level probability that determined this stage
    stage_assigned_at           TIMESTAMPTZ DEFAULT NOW(),

    -- Time in current stage
    days_in_stage               INTEGER NOT NULL DEFAULT 0,
    avg_days_in_stage           INTEGER,                 -- average for this stage across all entities (benchmark)
    is_stale                    BOOLEAN DEFAULT FALSE,   -- TRUE if days_in_stage > 2x avg_days_in_stage

    -- Transition predictions
    next_stage_probability      NUMERIC(5,4),            -- probability of advancing to next stage within 30 days
    expected_stage_transition   DATE,                    -- predicted date of next stage change
    regression_probability      NUMERIC(5,4),            -- probability of moving backward (hot -> warm)

    -- Last meaningful interaction
    last_interaction_date       DATE,
    last_interaction_type       TEXT,                     -- 'call', 'email', 'meeting', 'showing'
    days_since_interaction      INTEGER,

    -- Estimated value at this stage
    estimated_commission        NUMERIC(12,2),
    stage_weighted_value        NUMERIC(12,2),           -- commission x stage_probability

    -- Context
    submarket                   TEXT,
    property_type               TEXT,

    -- Metadata
    model_version               TEXT NOT NULL,
    scored_at                   TIMESTAMPTZ DEFAULT NOW(),
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_pipeline_stages_entity
    ON pipeline_stages(entity_type, entity_id);
CREATE INDEX idx_pipeline_stages_stage ON pipeline_stages(current_stage);
CREATE INDEX idx_pipeline_stages_stale ON pipeline_stages(is_stale) WHERE is_stale = TRUE;
CREATE INDEX idx_pipeline_stages_submarket ON pipeline_stages(submarket, property_type);
CREATE INDEX idx_pipeline_stages_scored ON pipeline_stages(scored_at);
```

### 45.5 -- Pipeline Stage History (Movement Tracking)

```sql
CREATE TABLE IF NOT EXISTS pipeline_stage_history (
    id                  SERIAL PRIMARY KEY,
    entity_type         TEXT NOT NULL,
    entity_id           UUID NOT NULL,
    from_stage          TEXT,                            -- NULL for initial assignment
    to_stage            TEXT NOT NULL,
    probability_at_transition NUMERIC(5,4),
    trigger_reason      TEXT,                            -- 'probability_increase', 'interaction_logged', 'deal_created', 'gone_quiet'
    model_version       TEXT NOT NULL,
    transitioned_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stage_history_entity ON pipeline_stage_history(entity_type, entity_id);
CREATE INDEX idx_stage_history_date ON pipeline_stage_history(transitioned_at);
CREATE INDEX idx_stage_history_stages ON pipeline_stage_history(from_stage, to_stage);
```

### 45.6 -- Aggregation Math: Three Tiers

**Tier 1 -- Naive Sum (baseline, always computed):**

```
expected_deals = SUM(prob_i) for all entities i in the pipeline
expected_commission = SUM(prob_i * commission_i)
```

This is the simplest model. If 100 properties each have a 10% transaction probability, expect ~10 deals. Weakness: assumes independence. If a recession hits, ALL probabilities drop together, but the naive sum doesn't account for this.

**Tier 2 -- Monte Carlo Simulation (default, 10,000 runs):**

```python
# Pseudocode for the nightly portfolio prediction engine
def monte_carlo_portfolio(entities, n_runs=10000):
    """
    Each entity has: probability, commission, submarket, property_type.
    Entities in the same submarket share a correlated shock.
    """
    results = []

    for run in range(n_runs):
        # 1. Draw a market-wide shock (normal distribution)
        market_shock = np.random.normal(0, 0.10)  # +/- 10% market swing

        # 2. Draw submarket-specific shocks (correlated with market)
        submarket_shocks = {}
        for sm in unique_submarkets:
            # 60% correlated with market, 40% idiosyncratic
            submarket_shocks[sm] = 0.6 * market_shock + 0.4 * np.random.normal(0, 0.08)

        # 3. Adjust each entity's probability
        run_deals = 0
        run_commission = 0
        for entity in entities:
            adjusted_prob = clip(
                entity.probability + submarket_shocks[entity.submarket],
                0.01, 0.99
            )
            # 4. Bernoulli draw: does this entity transact?
            if np.random.random() < adjusted_prob:
                run_deals += 1
                run_commission += entity.estimated_commission

        results.append((run_deals, run_commission))

    # 5. Extract percentiles
    deals = [r[0] for r in results]
    commissions = [r[1] for r in results]
    return {
        'deal_count_p10': np.percentile(deals, 10),
        'deal_count_p25': np.percentile(deals, 25),
        'deal_count_expected': np.percentile(deals, 50),
        'deal_count_p75': np.percentile(deals, 75),
        'deal_count_p90': np.percentile(deals, 90),
        'commission_p10': np.percentile(commissions, 10),
        'commission_p25': np.percentile(commissions, 25),
        'commission_expected': np.percentile(commissions, 50),
        'commission_p75': np.percentile(commissions, 75),
        'commission_p90': np.percentile(commissions, 90),
    }
```

Key design decisions:
- **Market shock**: drawn once per simulation run, affects all entities. Captures: interest rate surprises, recession fears, IE-specific economic shifts.
- **Submarket shock**: 60% correlated with market, 40% idiosyncratic. Captures: a new Amazon fulfillment center announcement boosts Fontana industrial but not Riverside retail.
- **Clipping**: probabilities never go below 1% or above 99% to avoid degenerate draws.
- **10,000 runs**: sufficient for stable percentile estimates. Runtime: <5 seconds for 500 entities on a single thread.

**Tier 3 -- Copula-Based Correlation (future enhancement):**

For more accurate correlation modeling, a Gaussian copula groups entities by:
- Same submarket (correlation: 0.5-0.7)
- Same property type, different submarket (correlation: 0.3-0.5)
- Same owner (correlation: 0.8-0.9 -- if an owner sells one, they may sell all)
- Different everything (correlation: 0.1-0.2 -- macro only)

This is a Tier 3 enhancement because it requires fitting a correlation matrix from historical deal data. With <100 closed deals in the system currently, the matrix would be poorly estimated. Revisit when `prediction_outcomes` has 200+ rows.

### 45.7 -- Pipeline Health Score (0-100)

The Pipeline Health Score is a composite metric computed nightly alongside portfolio predictions.

**Component 1: Diversity Score (weight: 25%)**

Measures concentration risk using the Herfindahl-Hirschman Index (HHI).

```sql
-- Compute HHI across submarkets
-- HHI = sum of squared market shares
-- Perfect diversity (10 equal segments) -> HHI = 0.10 -> score = 95
-- Total concentration (1 segment) -> HHI = 1.0 -> score = 5
WITH segment_shares AS (
    SELECT submarket,
           COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER () AS share
    FROM pipeline_stages
    WHERE current_stage IN ('warming', 'warm', 'hot', 'active', 'closing')
    GROUP BY submarket
),
hhi AS (
    SELECT SUM(share * share) AS hhi_value FROM segment_shares
)
SELECT ROUND(100 * (1 - hhi_value))::INTEGER AS diversity_score FROM hhi;
```

Also penalizes if >50% of expected commission comes from a single deal (concentration in a single whale deal).

| HHI Range | Diversity Score | Interpretation |
|-----------|----------------|----------------|
| 0.00-0.15 | 85-100 | Excellent diversity |
| 0.15-0.25 | 65-84 | Good diversity |
| 0.25-0.40 | 45-64 | Moderate concentration |
| 0.40-0.60 | 25-44 | High concentration risk |
| 0.60-1.00 | 5-24 | Dangerous concentration |

**Component 2: Velocity Score (weight: 25%)**

Measures how actively deals are moving through pipeline stages.

```sql
WITH stage_movements AS (
    SELECT COUNT(*) AS movements_30d
    FROM pipeline_stage_history
    WHERE transitioned_at > NOW() - INTERVAL '30 days'
      AND to_stage IN ('warm', 'hot', 'active', 'closing')  -- forward movements only
),
total_pipeline AS (
    SELECT COUNT(*) AS total
    FROM pipeline_stages
    WHERE current_stage != 'cold'
)
SELECT LEAST(100, ROUND(
    (movements_30d::NUMERIC / GREATEST(total, 1)) * 200
))::INTEGER AS velocity_score
FROM stage_movements, total_pipeline;
```

Scoring benchmarks:

| Forward Movements / Pipeline Size (30d) | Velocity Score | Interpretation |
|-----------------------------------------|---------------|----------------|
| >50% | 90-100 | Rapid movement, healthy pipeline |
| 30-50% | 70-89 | Good velocity |
| 15-30% | 50-69 | Moderate -- some stagnation |
| 5-15% | 25-49 | Slow -- pipeline is stalling |
| <5% | 0-24 | Stagnant -- urgent attention needed |

Also factors in regression events (hot -> warm, warm -> cold) as negative velocity.

**Component 3: Data Quality Score (weight: 20%)**

Measures how complete the data is on pipeline entities (non-cold).

```sql
WITH completeness AS (
    SELECT
        p.property_id,
        (CASE WHEN p.lease_expiration IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN p.owner_name IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN p.owner_entity_type IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN p.square_footage IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN p.year_built IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN p.for_sale_price IS NOT NULL OR p.asking_lease_rate IS NOT NULL THEN 1 ELSE 0 END +
         CASE WHEN EXISTS (
             SELECT 1 FROM contacts c
             JOIN contact_companies cc ON cc.contact_id = c.id
             WHERE cc.company_name = p.owner_name
               AND (c.phone_1 IS NOT NULL OR c.email IS NOT NULL)
         ) THEN 1 ELSE 0 END
        )::NUMERIC / 7 AS completeness_ratio
    FROM properties p
    JOIN pipeline_stages ps ON ps.entity_id = p.property_id
    WHERE ps.entity_type = 'property' AND ps.current_stage != 'cold'
)
SELECT ROUND(AVG(completeness_ratio) * 100)::INTEGER AS data_quality_score
FROM completeness;
```

Key fields checked (7 total, each worth ~14 points):
1. Lease expiration date
2. Owner name
3. Owner entity type
4. Square footage
5. Year built
6. Pricing data (sale price or lease rate)
7. Contactable owner (has phone or email linked)

**Component 4: Conversion Rate Trend (weight: 15%)**

Compares the conversion rate (stage advances / total pipeline) over the last 60 days vs. the previous 60 days.

```sql
WITH recent AS (
    SELECT COUNT(*) FILTER (WHERE to_stage IN ('active', 'closing')) AS conversions,
           COUNT(*) AS total_movements
    FROM pipeline_stage_history
    WHERE transitioned_at > NOW() - INTERVAL '60 days'
),
prior AS (
    SELECT COUNT(*) FILTER (WHERE to_stage IN ('active', 'closing')) AS conversions,
           COUNT(*) AS total_movements
    FROM pipeline_stage_history
    WHERE transitioned_at BETWEEN NOW() - INTERVAL '120 days' AND NOW() - INTERVAL '60 days'
)
SELECT CASE
    WHEN prior.total_movements = 0 THEN 50  -- no baseline, neutral score
    ELSE LEAST(100, GREATEST(0, 50 + ROUND(
        ((recent.conversions::NUMERIC / GREATEST(recent.total_movements, 1))
         - (prior.conversions::NUMERIC / GREATEST(prior.total_movements, 1)))
        * 500  -- scale factor: 10% improvement -> +50 points above baseline
    )))
END AS conversion_trend_score
FROM recent, prior;
```

| Trend | Score | Interpretation |
|-------|-------|----------------|
| Improving >10% | 85-100 | Strong improvement, strategy is working |
| Improving 0-10% | 50-84 | Positive trend |
| Flat | 45-55 | Stable |
| Declining 0-10% | 20-44 | Negative trend, investigate |
| Declining >10% | 0-19 | Alarming decline, urgent review |

**Component 5: Coverage Score (weight: 15%)**

Measures whether David has enough contacts in each target segment to achieve pipeline goals.

```sql
WITH segment_coverage AS (
    SELECT
        ps.submarket,
        ps.property_type,
        COUNT(DISTINCT ps.entity_id) AS properties_in_pipeline,
        COUNT(DISTINCT c.id) FILTER (
            WHERE c.phone_1 IS NOT NULL OR c.email IS NOT NULL
        ) AS contactable_owners,
        -- Target: at least 1 contactable owner per property in pipeline
        LEAST(1.0,
            COUNT(DISTINCT c.id) FILTER (WHERE c.phone_1 IS NOT NULL OR c.email IS NOT NULL)::NUMERIC
            / GREATEST(COUNT(DISTINCT ps.entity_id), 1)
        ) AS coverage_ratio
    FROM pipeline_stages ps
    LEFT JOIN properties p ON p.property_id = ps.entity_id AND ps.entity_type = 'property'
    LEFT JOIN contacts c ON c.company_name = p.owner_name
    WHERE ps.current_stage != 'cold'
    GROUP BY ps.submarket, ps.property_type
)
SELECT ROUND(AVG(coverage_ratio) * 100)::INTEGER AS coverage_score
FROM segment_coverage;
```

**Final Composite:**

```
pipeline_health_score = ROUND(
    diversity_score     * 0.25 +
    velocity_score      * 0.25 +
    data_quality_score  * 0.20 +
    conversion_trend    * 0.15 +
    coverage_score      * 0.15
)
```

### 45.8 -- Morning Briefing: Portfolio Section

The nightly portfolio prediction engine (runs at 2:30 AM, after entity-level predictions at 2:00 AM) generates a briefing block stored in the morning briefing queue.

**Template:**

```
PORTFOLIO SNAPSHOT -- {horizon_label}
================================================

Pipeline: {entity_count} active opportunities
Expected deals: {deal_count_p25}-{deal_count_p75} (90% CI: {deal_count_p10}-{deal_count_p90})
Expected commission: ${commission_p25/1000:.0f}K-${commission_p75/1000:.0f}K
Pipeline Health: {pipeline_health_score}/100 ({health_interpretation})

TOP SUBMARKETS:
{for each top_submarket, sorted by expected_deals DESC:}
  {rank}. {submarket} {property_type}: {expected_deals} expected deals, ${expected_commission/1000:.0f}K commission
{end for}

THIS WEEK'S MOVERS:
{for each stage_movement in last 7 days where to_stage > from_stage:}
  {arrow_up} {entity_name} moved from {from_stage} to {to_stage}
{end for}
{if no movers: "No stage changes this week -- pipeline may be stalling."}

RISK ALERTS:
{for each risk_alert:}
  [{severity}] {detail}
{end for}

COVERAGE GAPS:
{for each coverage_gap, sorted by impact DESC, limit 3:}
  {segment}: need {gap} more verified contacts (missing ~${impact})
{end for}

OPPORTUNITIES:
{for entities with prob > 0.60 AND no linked contact with phone/email:}
  {submarket} has {count} high-probability properties but you have no owner contact info.
  Estimated value if contacted: ${value}
{end for}
```

**Example Output:**

```
PORTFOLIO SNAPSHOT -- Q3 2026
================================================

Pipeline: 47 active opportunities
Expected deals: 7-11 (90% CI: 5-14)
Expected commission: $890K-$1.6M
Pipeline Health: 68/100 (Good -- velocity could improve)

TOP SUBMARKETS:
  1. Fontana Industrial: 4 expected deals, $480K commission
  2. Ontario Industrial: 2 expected deals, $310K commission
  3. Riverside Office: 2 expected deals, $185K commission
  4. Rancho Cucamonga Retail: 1 expected deal, $95K commission

THIS WEEK'S MOVERS:
  >> 1234 Industrial Way, Fontana moved from warm to hot
  >> 5678 Commerce Dr, Ontario moved from cold to warming
  >> 9012 Main St, Riverside moved from warm to hot
  << 3456 Airport Dr, Ontario regressed from hot to warm (no interaction in 21 days)

RISK ALERTS:
  [HIGH] 2 hot deals have gone quiet: 7890 Etiwanda Ave (18 days), 2345 Arrow Rt (14 days)
  [MEDIUM] 62% of pipeline value is concentrated in Fontana Industrial
  [LOW] Data quality on Ontario pipeline is 42% -- 8 properties missing lease expiration

COVERAGE GAPS:
  Riverside Retail: need 15 more verified contacts (missing ~$180K pipeline)
  Rancho Cucamonga Industrial: need 9 more verified contacts (missing ~$95K pipeline)
  Moreno Valley Industrial: need 6 more verified contacts (missing ~$72K pipeline)

OPPORTUNITIES:
  Fontana Industrial has 5 properties with >60% probability but no owner contact info.
  Estimated value if contacted: $240K commission.
  Action: Research owner contacts for these 5 properties (est. 45 min).
```

### 45.9 -- Server Endpoint

```
POST /api/portfolio/predict
```

Triggered nightly by cron at 2:30 AM. Can also be triggered manually from the dashboard.

**Process:**

1. Query all entities from `predictive_scores` where `prob_6mo > 0.05` (at least 5% chance).
2. Enrich with submarket, property type, estimated commission from `properties` + `tpe_config`.
3. Run Monte Carlo simulation (10,000 iterations).
4. Compute segment breakdowns.
5. Compute Pipeline Health Score (5 components).
6. Identify coverage gaps by comparing contactable owners to pipeline targets.
7. Generate risk alerts (stale hot deals, concentration, data quality).
8. Insert into `portfolio_predictions` + `portfolio_segments`.
9. Update `pipeline_stages` for all entities.
10. Insert stage changes into `pipeline_stage_history`.
11. Queue morning briefing block.

```
GET /api/portfolio/current
```

Returns the most recent portfolio prediction for each horizon (90, 180, 365 days), plus current pipeline stages and segments.

```
GET /api/portfolio/health
```

Returns current Pipeline Health Score with component breakdown and trend (last 30 days of health scores).

```
GET /api/portfolio/stages?stage=hot&submarket=Fontana
```

Returns entities in the specified pipeline stage, optionally filtered by submarket/property_type. Used for the pipeline board UI.

### 45.10 -- Pipeline Board UI Component

A new dashboard section showing the pipeline as a Kanban-style board:

```
COLD (142)    WARMING (23)    WARM (15)    HOT (7)    ACTIVE (3)    CLOSING (1)
----------    -----------     ---------    -------    ----------    ----------
[cards]       [cards]         [cards]      [cards]    [cards]       [cards]
```

Each card shows: address (or contact name), submarket, probability, days in stage, estimated commission, last interaction date. Cards with `is_stale = TRUE` get a red border. Clicking a card opens the entity detail slide-over.

---

<a id="prompt-46"></a>
# PROMPT 46: Competitive Intelligence Prediction

## Current State Analysis

Prompt 23 designed the Competitive Intelligence Loop with `competitor_profiles`, `competitor_listings`, and `competitor_transactions` tables. That system tracks what competitors have done. This prompt extends it to **predict what competitors will do** and surface **actionable opportunities** from competitor weaknesses.

**What exists (from Prompt 23):**
- `competitor_profiles` -- known CRE brokers in IE with focus areas
- `competitor_listings` -- their active/expired listings
- `competitor_transactions` -- public record closed deals
- Competitive learning loop feeding TPE adjustments

**What's missing:**

| Gap | Impact |
|-----|--------|
| **No predictive models on competitor behavior** | David reacts to competitor moves instead of anticipating them |
| **No expired listing alerts** | When a competitor's listing expires, the owner is frustrated and open to a new broker -- but David doesn't know in real time |
| **No focus shift detection** | If a competitor shifts from Ontario to Riverside, their Ontario clients may be underserved |
| **No structured opportunity surfacing** | Competitive intelligence exists but doesn't generate prioritized action items |
| **No window-of-opportunity tracking** | After a listing expires, there's a 2-4 week window before the owner relists or gives up. This window isn't tracked |

## Proposed Design

### 46.1 -- Competitor Predictions Table

```sql
CREATE TABLE IF NOT EXISTS competitor_predictions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id           UUID NOT NULL,             -- references competitor_profiles(id)

    -- Prediction type
    prediction_type         TEXT NOT NULL CHECK (prediction_type IN (
        'listing_expiration',       -- Their listing is likely to expire without sale
        'client_departure',         -- Their client may leave them
        'focus_shift',              -- They're shifting geographic/type focus
        'pricing_error',            -- They're mispricing (too high/low) based on comps
        'market_entry',             -- They're entering a new submarket
        'market_exit',              -- They're abandoning a submarket
        'capacity_strain'           -- They have too many listings to service well
    )),

    -- Prediction details
    probability             NUMERIC(5,4) NOT NULL,     -- 0.0-1.0
    confidence              NUMERIC(5,4),              -- model confidence in this prediction
    horizon_days            INTEGER NOT NULL,           -- prediction time window

    -- Evidence supporting this prediction
    evidence                JSONB NOT NULL DEFAULT '[]',
    -- Example for listing_expiration: [
    --   {"signal": "days_on_market", "value": 210, "threshold": 180, "weight": 0.3},
    --   {"signal": "price_reductions", "value": 3, "threshold": 2, "weight": 0.25},
    --   {"signal": "no_showings_30d", "value": true, "weight": 0.2},
    --   {"signal": "market_absorption_rate", "value": 0.03, "note": "3% monthly, listing overpriced by 15%", "weight": 0.25}
    -- ]

    -- Affected entities in our CRM
    affected_property_ids   UUID[],                    -- properties in our CRM affected by this prediction
    affected_contact_ids    INTEGER[],                 -- contacts in our CRM affected

    -- Recommended response
    recommended_response    TEXT NOT NULL,
    response_urgency        TEXT NOT NULL DEFAULT 'normal' CHECK (
        response_urgency IN ('low', 'normal', 'high', 'urgent')
    ),
    response_window_days    INTEGER,                   -- how long the opportunity stays open

    -- Lifecycle
    status                  TEXT NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'acted_on', 'expired', 'invalidated')
    ),
    acted_on_at             TIMESTAMPTZ,
    outcome                 TEXT,                       -- what happened after acting (or not)

    -- Metadata
    model_version           TEXT NOT NULL,
    predicted_at            TIMESTAMPTZ DEFAULT NOW(),
    expires_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comp_pred_competitor ON competitor_predictions(competitor_id);
CREATE INDEX idx_comp_pred_type ON competitor_predictions(prediction_type);
CREATE INDEX idx_comp_pred_status ON competitor_predictions(status);
CREATE INDEX idx_comp_pred_urgency ON competitor_predictions(response_urgency);
CREATE INDEX idx_comp_pred_expires ON competitor_predictions(expires_at);
```

### 46.2 -- Competitor Activity Feed

```sql
CREATE TABLE IF NOT EXISTS competitor_activity_feed (
    id                      SERIAL PRIMARY KEY,
    competitor_id           UUID NOT NULL,              -- references competitor_profiles(id)

    -- Activity details
    activity_type           TEXT NOT NULL CHECK (activity_type IN (
        'new_listing',          -- Competitor listed a new property
        'price_reduction',      -- Competitor reduced asking price
        'listing_withdrawn',    -- Competitor withdrew a listing
        'listing_expired',      -- Listing expired without transaction
        'deal_closed',          -- Competitor closed a deal (public records)
        'new_client',           -- Competitor appears to have a new client
        'marketing_campaign',   -- Competitor launched marketing (mailers, ads)
        'team_change',          -- Competitor hired/lost team members
        'market_entry',         -- First listing in a new submarket
        'market_exit'           -- Last listing in a submarket expired/sold
    )),
    activity_detail         TEXT NOT NULL,              -- human-readable description
    activity_data           JSONB DEFAULT '{}',         -- structured data about the activity

    -- Source tracking
    source                  TEXT NOT NULL CHECK (source IN (
        'costar', 'loopnet', 'public_records', 'mls',
        'manual', 'agent_research', 'web_scrape', 'industry_news'
    )),
    source_url              TEXT,

    -- Cross-references to our CRM
    entity_ids_affected     JSONB DEFAULT '[]',         -- [{type: "property", id: "uuid"}, {type: "contact", id: 123}]

    -- Classification
    opportunity_flag        BOOLEAN DEFAULT FALSE,      -- TRUE if this creates an opportunity for David
    threat_flag             BOOLEAN DEFAULT FALSE,      -- TRUE if this threatens David's pipeline

    -- Metadata
    detected_at             TIMESTAMPTZ DEFAULT NOW(),
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comp_feed_competitor ON competitor_activity_feed(competitor_id);
CREATE INDEX idx_comp_feed_type ON competitor_activity_feed(activity_type);
CREATE INDEX idx_comp_feed_opportunity ON competitor_activity_feed(opportunity_flag) WHERE opportunity_flag = TRUE;
CREATE INDEX idx_comp_feed_detected ON competitor_activity_feed(detected_at);
```

### 46.3 -- Competitive Opportunities Table

```sql
CREATE TABLE IF NOT EXISTS competitive_opportunities (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Trigger classification
    trigger_type            TEXT NOT NULL CHECK (trigger_type IN (
        'competitor_expired_listing',    -- Their listing expired -- owner is frustrated
        'competitor_price_reduction',    -- 3+ price cuts -- they can't move it
        'competitor_lost_listing',       -- Owner pulled listing from competitor
        'competitor_client_departure',   -- Client didn't renew with competitor
        'competitor_focus_shift',        -- Competitor leaving a submarket -- gap opens
        'competitor_capacity_strain',    -- Competitor has too many listings -- clients underserved
        'competitor_pricing_error',      -- Competitor mispriced -- we can pitch better strategy
        'competitor_market_exit'         -- Competitor fully exiting a segment
    )),

    -- What entity this opportunity is about
    entity_type             TEXT NOT NULL CHECK (entity_type IN ('property', 'contact', 'company')),
    entity_id               UUID NOT NULL,

    -- Which competitor created this opportunity
    competitor_id           UUID NOT NULL,
    competitor_name         TEXT NOT NULL,

    -- Opportunity window
    window_open_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    window_close_date       DATE,                       -- estimated date opportunity expires
    window_days             INTEGER,                    -- days the window is open

    -- Scoring
    priority_score          INTEGER NOT NULL CHECK (priority_score >= 0 AND priority_score <= 100),
    -- Priority formula:
    -- base_score (trigger type) + property_value_factor + data_completeness_bonus + timing_bonus
    priority_factors        JSONB DEFAULT '{}',

    -- Action plan
    recommended_action      TEXT NOT NULL,
    action_steps            JSONB DEFAULT '[]',
    -- Example: [
    --   {"step": 1, "action": "Pull property details from CoStar", "est_minutes": 5},
    --   {"step": 2, "action": "Research owner contact info", "est_minutes": 15},
    --   {"step": 3, "action": "Call owner with market update pitch", "est_minutes": 10},
    --   {"step": 4, "action": "Send CMA follow-up email within 24 hours", "est_minutes": 20}
    -- ]

    -- Source evidence
    source_activity_ids     INTEGER[],                  -- references competitor_activity_feed(id)
    source_prediction_id    UUID,                       -- references competitor_predictions(id)

    -- Lifecycle
    status                  TEXT NOT NULL DEFAULT 'open' CHECK (
        status IN ('open', 'in_progress', 'acted_on', 'won', 'lost', 'expired', 'dismissed')
    ),
    acted_on_at             TIMESTAMPTZ,
    outcome_notes           TEXT,
    deal_id                 INTEGER,                    -- if this opportunity resulted in a deal

    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comp_opp_trigger ON competitive_opportunities(trigger_type);
CREATE INDEX idx_comp_opp_status ON competitive_opportunities(status);
CREATE INDEX idx_comp_opp_priority ON competitive_opportunities(priority_score DESC);
CREATE INDEX idx_comp_opp_competitor ON competitive_opportunities(competitor_id);
CREATE INDEX idx_comp_opp_entity ON competitive_opportunities(entity_type, entity_id);
CREATE INDEX idx_comp_opp_window ON competitive_opportunities(window_close_date);
```

### 46.4 -- Competitive Prediction Models

**Model 1: Listing Expiration Prediction**

Predicts probability that a competitor's listing will expire without a transaction.

```
Inputs:
  - days_on_market (from competitor_listings)
  - price_reduction_count
  - price_vs_comps_ratio (asking price / comparable sales average)
  - submarket_absorption_rate (months of supply)
  - property_type_demand_score
  - competitor_historical_success_rate (from competitor_transactions)

Logic (rule-based, upgradeable to ML when data volume supports):
  base_probability = 0.15  -- baseline expiration rate

  IF days_on_market > 180: base += 0.20
  IF days_on_market > 270: base += 0.15
  IF price_reductions >= 2: base += 0.15
  IF price_reductions >= 3: base += 0.10
  IF price_vs_comps > 1.15: base += 0.10  -- overpriced by 15%+
  IF price_vs_comps > 1.25: base += 0.10  -- overpriced by 25%+
  IF absorption_rate > 12: base += 0.10   -- 12+ months of supply
  IF competitor_success_rate < 0.50: base += 0.05

  probability = CLIP(base, 0, 0.95)
```

Trigger: When probability > 0.70, create a `competitive_opportunity` with `trigger_type = 'competitor_expired_listing'`.

Recommended response: "Contact the property owner. Their listing has been on market {days} days with {reductions} price reductions. They may be ready for a new approach. Lead with a CMA showing realistic pricing."

**Model 2: Client Departure Prediction**

Predicts probability that a competitor's client will not renew their broker relationship.

```
Inputs:
  - listing_duration vs market_average
  - competitor_responsiveness_score (if available)
  - client_lease_expiration (if known)
  - client_property_count (single vs multi-property owner)
  - competitor_recent_performance (% of listings that sold)

Logic:
  base_probability = 0.10  -- baseline non-renewal

  IF listing_expired_without_sale: base += 0.30
  IF listing_duration > 2x_market_average: base += 0.15
  IF client_has_multiple_properties AND only_one_listed: base += 0.05
  IF competitor_recent_close_rate < 0.40: base += 0.10
  IF client_lease_expiring_within_12mo: base += 0.10  -- need proactive broker

  probability = CLIP(base, 0, 0.90)
```

Trigger: When probability > 0.50, create `competitive_opportunity` with `trigger_type = 'competitor_client_departure'`.

**Model 3: Focus Shift Detection**

Detects when a competitor is shifting their geographic or property-type focus.

```
Algorithm:
  1. For each competitor, compute listing distribution by submarket for:
     - Last 6 months (recent)
     - 6-12 months ago (baseline)
  2. For each submarket, compute delta = recent_pct - baseline_pct
  3. If delta > +15%: competitor is ENTERING this submarket
     If delta < -15%: competitor is EXITING this submarket

Evidence generation:
  entering_submarkets = [{submarket, delta, new_listing_count}]
  exiting_submarkets = [{submarket, delta, remaining_listing_count}]

Trigger: For each exiting submarket where David has pipeline entities:
  Create competitor_prediction with type = 'focus_shift'
  Create competitive_opportunity with type = 'competitor_focus_shift'
```

Recommended response: "Competitor {name} appears to be deprioritizing {submarket} (listings down {delta}% in 6 months). You have {count} contacts in {submarket} that may be receiving less attention. Consider reaching out."

**Model 4: Pricing Prediction**

Predicts competitor's likely asking price for properties similar to their historical listings.

```
Algorithm:
  1. Collect competitor's listing history: property_type, SF, submarket, asking_price
  2. Compute their historical price_per_sf by (submarket, property_type)
  3. Compare to market comps to identify their pricing tendency:
     - Aggressive (5-10% above market)
     - Market-rate (+/- 5%)
     - Conservative (5-10% below market)
  4. For any new listing from this competitor, predict expected asking price
  5. If actual asking price deviates >15% from prediction, flag as potential mispricing

Use case: If David knows a property is coming to market via a competitor and can predict they'll overprice it, he can position himself for the owner when the overpricing fails.
```

### 46.5 -- Competitive Intelligence Processing Pipeline

**Nightly job (3:00 AM, after portfolio predictions):**

1. **Ingest**: Pull latest competitor listing data (CoStar export, manual CSV, or API when available) into `competitor_activity_feed`.
2. **Detect changes**: Compare today's competitor listings to yesterday's. Flag: new listings, price changes, withdrawals.
3. **Run prediction models**: For each active competitor listing, compute listing expiration probability. For each competitor, run focus shift detection.
4. **Generate opportunities**: When prediction thresholds are met, create `competitive_opportunities` entries.
5. **Cross-reference CRM**: Match affected properties to `properties` table. Match affected owners to `contacts` table. Link via `entity_ids_affected`.
6. **Score opportunities**: Compute priority_score based on deal value, timing window, and data completeness.
7. **Queue briefing**: Add competitive intelligence section to morning briefing.

### 46.6 -- Morning Briefing: Competitive Intelligence Section

**Template:**

```
COMPETITIVE INTELLIGENCE
================================================

EXPIRED/EXPIRING LISTINGS (act within {window_days} days):
{for each opportunity where trigger_type = 'competitor_expired_listing', sorted by priority DESC, limit 3:}
  [{priority_score}] {address}, {submarket}
    Competitor: {competitor_name} | On market: {days} days | {reductions} price cuts
    Owner: {owner_name} {if contactable: "(phone on file)" else: "(need contact info)"}
    Action: {recommended_action}
{end for}

FOCUS SHIFTS:
{for each competitor with detected focus shift:}
  {competitor_name} is shifting from {exiting_submarket} to {entering_submarket}
    Their {exiting_submarket} clients may need attention. You have {david_contact_count} contacts there.
{end for}

COMPETITOR SCORECARD (30-day summary):
{for each top competitor:}
  {competitor_name}: {new_listings} new, {expired} expired, {closed} closed
    Focus: {top_submarket} {top_property_type}
    Win rate: {close_rate}%
{end for}
```

**Example Output:**

```
COMPETITIVE INTELLIGENCE
================================================

EXPIRED/EXPIRING LISTINGS (act within 14 days):
  [92] 1234 Industrial Way, Fontana (42,000 SF Industrial)
    Competitor: John Smith, CBRE | On market: 245 days | 3 price cuts
    Owner: Pacific Trust LLC (phone on file)
    Action: Call today. Lead with updated CMA showing realistic pricing at $215/SF vs their $265/SF ask.

  [78] 5678 Commerce Dr, Ontario (18,000 SF Office)
    Competitor: Jane Doe, Cushman | On market: 195 days | 2 price cuts
    Owner: Chen Family Trust (need contact info -- research priority)
    Action: Research owner contact, then pitch lease-up strategy vs sale.

FOCUS SHIFTS:
  Marcus Lee (Lee & Associates) is shifting from Ontario Industrial to Riverside Logistics
    Their Ontario Industrial clients may need attention. You have 12 contacts there.
    3 of those contacts have properties with lease expirations in the next 12 months.

COMPETITOR SCORECARD (30-day summary):
  CBRE (IE team):    4 new, 2 expired, 1 closed | Focus: Fontana Industrial | Win rate: 38%
  Cushman:           3 new, 1 expired, 2 closed | Focus: Ontario Office    | Win rate: 52%
  Marcus Lee:        6 new, 0 expired, 3 closed | Focus: Riverside Logistics | Win rate: 61%
```

### 46.7 -- Server Endpoints

```
POST /api/competitive/scan          -- Trigger nightly competitive scan
GET  /api/competitive/opportunities -- List open opportunities, filterable by trigger_type, priority, status
GET  /api/competitive/feed          -- Recent competitor activity feed
GET  /api/competitive/predictions   -- Active competitor predictions
PUT  /api/competitive/opportunities/:id  -- Update opportunity status (acted_on, dismissed, etc.)
GET  /api/competitive/scorecard     -- Competitor scorecard summary
```

---

<a id="prompt-47"></a>
# PROMPT 47: Market Regime Detection & Adaptive Predictions

## Current State Analysis

The predictive scoring engine (Prompt 35) and portfolio predictions (Prompt 45) generate forecasts based on entity-level features. But these predictions implicitly assume the market environment is constant. A property with a 40% transaction probability in a hot market might have only a 15% probability in a correction -- the same features, but a completely different context.

**What exists:**
- `predictive_scores` with `prob_3mo`, `prob_6mo`, `prob_12mo` per property
- `tpe_config` with static weights (unchanged regardless of market conditions)
- `sandbox_signals` capturing market trend signals
- Strategy sessions (Prompt 33) where David discusses market conditions
- Knowledge base (Prompt 36) storing market lessons

**What's missing:**

| Gap | Impact |
|-----|--------|
| **No regime classification** | System doesn't know if the market is in boom, correction, or recovery |
| **No regime-specific prediction adjustments** | Probabilities are not adjusted for market conditions |
| **No regime transition detection** | David isn't alerted when the market is shifting regimes |
| **No historical regime memory** | No way to say "last time we were in a Plateau regime, these strategies worked" |
| **No submarket-level regime tracking** | Fontana Industrial may be in Boom while Riverside Office is in Correction |

## Proposed Design

### 47.1 -- Market Regime Definitions

Five regimes, defined by quantitative thresholds on observable indicators:

| Regime | Vacancy Trend | Days on Market | Price/SF Trend | Transaction Volume | Description |
|--------|--------------|----------------|----------------|-------------------|-------------|
| **Boom** | Falling >2% YoY | <90 avg | Rising >8% YoY | >120% of 5yr avg | Seller's market. Multiple offers. Short windows. |
| **Stable Growth** | Falling 0-2% YoY | 90-150 avg | Rising 2-8% YoY | 90-120% of 5yr avg | Balanced market. Steady deal flow. |
| **Plateau** | Flat (+/- 0.5%) | 150-210 avg | Flat (+/- 2%) | 70-90% of 5yr avg | Slowing market. Longer sales cycles. |
| **Correction** | Rising >1% YoY | >210 avg | Falling >3% YoY | <70% of 5yr avg | Buyer's market. Distressed sales emerging. |
| **Recovery** | Peaked, now flat/falling | 150-210, declining | Stabilizing (flat after decline) | Rising from trough | Opportunistic phase. Value plays. |

### 47.2 -- Regime Indicators (Weighted Signal System)

```
regime_score = weighted_sum of normalized indicator scores

Each indicator produces a value on a -1.0 to +1.0 scale:
  -1.0 = strongly bearish (correction signal)
   0.0 = neutral
  +1.0 = strongly bullish (boom signal)
```

| Indicator | Weight | Source | Normalization |
|-----------|--------|--------|---------------|
| Vacancy rate trend (3-month MA) | 20% | CoStar quarterly data, manual entry | Falling >2% = +1.0; Rising >2% = -1.0; Linear between |
| Average days on market | 15% | `competitor_listings` + own pipeline data | <90d = +1.0; >210d = -1.0; Linear between |
| Listing volume ratio (new / withdrawn) | 15% | `competitor_activity_feed` | >2.0 = +1.0 (lots of new, few withdrawn); <0.5 = -1.0 |
| Price per SF trend (6-month) | 15% | Comp sales data, `prediction_outcomes` | Rising >8% annualized = +1.0; Falling >5% = -1.0 |
| Interest rate environment | 10% | Manual entry or FRED API | Fed funds < 3% = +1.0; > 6% = -1.0; Linear between |
| IE employment data | 10% | BLS quarterly, manual entry | YoY growth >3% = +1.0; Decline >1% = -1.0 |
| Construction permits (leading) | 8% | County records, manual entry | Above 5yr avg = +0.5 (supply coming, mildly bearish for existing); Below = +0.5 (constrained supply, bullish) |
| Port volume (Long Beach/LA) | 7% | Port authority monthly data | YoY growth >5% = +1.0 (logistics demand); Decline >5% = -1.0 |

**Regime classification from composite score:**

| Composite Score Range | Regime |
|----------------------|--------|
| +0.60 to +1.00 | Boom |
| +0.20 to +0.59 | Stable Growth |
| -0.19 to +0.19 | Plateau |
| -0.59 to -0.20 | Correction |
| Correction-to-Plateau transition detected | Recovery |

Recovery is special: it's detected as a transition, not a score range. When the composite score has been in Correction for 3+ months and crosses above -0.20 with a positive trend, it's classified as Recovery.

### 47.3 -- Market Regimes Table

```sql
CREATE TABLE IF NOT EXISTS market_regimes (
    id                      SERIAL PRIMARY KEY,
    -- When and where
    regime_date             DATE NOT NULL,
    submarket               TEXT NOT NULL,             -- 'Fontana', 'Ontario', 'Riverside', 'IE_Overall'
    property_type           TEXT NOT NULL,             -- 'Industrial', 'Office', 'Retail', 'All'

    -- Current regime
    current_regime          TEXT NOT NULL CHECK (current_regime IN (
        'boom', 'stable_growth', 'plateau', 'correction', 'recovery'
    )),
    regime_confidence       NUMERIC(5,4) NOT NULL,     -- 0.0-1.0, how clearly the signals point to this regime
    composite_score         NUMERIC(5,4) NOT NULL,     -- -1.0 to +1.0, the raw weighted score
    regime_duration_days    INTEGER NOT NULL DEFAULT 0, -- how long we've been in this regime

    -- Previous regime (for transition tracking)
    previous_regime         TEXT CHECK (previous_regime IN (
        'boom', 'stable_growth', 'plateau', 'correction', 'recovery'
    )),
    previous_regime_duration_days INTEGER,

    -- Transition probabilities (where is the market likely heading?)
    transition_probabilities JSONB NOT NULL DEFAULT '{}',
    -- Example: {
    --   "boom": 0.05,
    --   "stable_growth": 0.30,
    --   "plateau": 0.45,
    --   "correction": 0.15,
    --   "recovery": 0.05
    -- }

    -- Raw indicator values (snapshot for auditing)
    indicators_snapshot     JSONB NOT NULL DEFAULT '{}',
    -- Example: {
    --   "vacancy_trend": {"value": -0.015, "normalized": 0.75, "weight": 0.20, "source": "CoStar Q1 2026"},
    --   "days_on_market": {"value": 125, "normalized": 0.47, "weight": 0.15, "source": "pipeline_avg"},
    --   "listing_volume_ratio": {"value": 1.8, "normalized": 0.60, "weight": 0.15, "source": "competitor_feed"},
    --   "price_psf_trend": {"value": 0.04, "normalized": 0.50, "weight": 0.15, "source": "comp_sales"},
    --   "interest_rate": {"value": 4.5, "normalized": 0.17, "weight": 0.10, "source": "manual"},
    --   "employment": {"value": 0.02, "normalized": 0.50, "weight": 0.10, "source": "BLS"},
    --   "construction_permits": {"value": 0.9, "normalized": 0.55, "weight": 0.08, "source": "county"},
    --   "port_volume": {"value": 0.03, "normalized": 0.60, "weight": 0.07, "source": "port_authority"}
    -- }

    -- Metadata
    model_version           TEXT NOT NULL,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_market_regimes_unique
    ON market_regimes(regime_date, submarket, property_type);
CREATE INDEX idx_market_regimes_regime ON market_regimes(current_regime);
CREATE INDEX idx_market_regimes_date ON market_regimes(regime_date DESC);
CREATE INDEX idx_market_regimes_submarket ON market_regimes(submarket, property_type);
```

### 47.4 -- Regime Prediction Adjustments Table

```sql
CREATE TABLE IF NOT EXISTS regime_prediction_adjustments (
    id                      SERIAL PRIMARY KEY,
    -- Which regime this adjustment applies to
    regime                  TEXT NOT NULL CHECK (regime IN (
        'boom', 'stable_growth', 'plateau', 'correction', 'recovery'
    )),
    -- Which transaction type
    transaction_type        TEXT NOT NULL CHECK (transaction_type IN (
        'sale', 'lease_new', 'lease_renewal', 'distressed_sale',
        'value_add_purchase', 'owner_user_sale', 'investment_sale'
    )),

    -- Probability multiplier applied to entity-level predictions
    probability_multiplier  NUMERIC(5,4) NOT NULL,     -- 1.0 = no change, 1.3 = +30%, 0.7 = -30%

    -- Feature weight overrides (applied on top of tpe_config)
    feature_weight_overrides JSONB DEFAULT '{}',
    -- Example for correction regime: {
    --   "lease_expiration_weight": 1.3,    -- lease expirations matter MORE (tenants renegotiate)
    --   "owner_age_weight": 0.8,           -- age matters less (old owners hold through downturns)
    --   "debt_stress_weight": 1.5,         -- debt stress matters MUCH more
    --   "hold_duration_weight": 0.7        -- long holds matter less (everyone's holding)
    -- }

    -- Horizon adjustment
    horizon_multiplier      NUMERIC(5,4) DEFAULT 1.0,  -- >1.0 = deals take longer, <1.0 = deals close faster

    -- Explanation for David
    explanation             TEXT NOT NULL,

    -- Metadata
    active                  BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_regime_adj_unique
    ON regime_prediction_adjustments(regime, transaction_type);
CREATE INDEX idx_regime_adj_regime ON regime_prediction_adjustments(regime);
```

**Seed data for regime adjustments:**

```sql
INSERT INTO regime_prediction_adjustments
    (regime, transaction_type, probability_multiplier, horizon_multiplier, feature_weight_overrides, explanation)
VALUES
    -- BOOM regime
    ('boom', 'sale', 1.30, 0.80,
     '{"debt_stress_weight": 0.7, "hold_duration_weight": 1.2}',
     'Hot market increases voluntary sale probability. Deals close faster. Owners with long holds are tempted to take profits.'),
    ('boom', 'lease_new', 0.85, 0.90,
     '{"lease_expiration_weight": 0.9}',
     'In boom markets, tenants prefer to buy rather than lease. New lease probability decreases slightly.'),
    ('boom', 'lease_renewal', 1.10, 1.00,
     '{}',
     'Existing tenants lock in rates during boom, slight increase in renewal probability.'),
    ('boom', 'distressed_sale', 0.40, 1.20,
     '{"debt_stress_weight": 0.5}',
     'Very few distressed sales in boom market. Even stressed owners can refinance or sell at market.'),
    ('boom', 'investment_sale', 1.40, 0.75,
     '{}',
     'Investors actively transacting in boom. Cap rate compression drives sales.'),

    -- STABLE GROWTH regime (baseline -- multipliers near 1.0)
    ('stable_growth', 'sale', 1.00, 1.00, '{}', 'Baseline regime. No adjustments needed.'),
    ('stable_growth', 'lease_new', 1.00, 1.00, '{}', 'Baseline regime.'),
    ('stable_growth', 'lease_renewal', 1.00, 1.00, '{}', 'Baseline regime.'),
    ('stable_growth', 'distressed_sale', 1.00, 1.00, '{}', 'Baseline regime.'),
    ('stable_growth', 'investment_sale', 1.00, 1.00, '{}', 'Baseline regime.'),

    -- PLATEAU regime
    ('plateau', 'sale', 0.80, 1.30,
     '{"hold_duration_weight": 0.8, "owner_age_weight": 1.1}',
     'Sales slow in plateau. Owners on the fence wait. Only strong motivators (age, estate) drive transactions.'),
    ('plateau', 'lease_new', 1.10, 1.10,
     '{"lease_expiration_weight": 1.2}',
     'When sales slow, leasing picks up. Tenants that considered buying now lease instead.'),
    ('plateau', 'lease_renewal', 1.15, 0.95,
     '{}',
     'Renewals increase -- tenants stay put in uncertain markets.'),
    ('plateau', 'distressed_sale', 1.20, 1.00,
     '{"debt_stress_weight": 1.3}',
     'Early distress signals emerge. Owners who overleveraged in boom start feeling pressure.'),
    ('plateau', 'investment_sale', 0.70, 1.40,
     '{}',
     'Investors pull back. Cap rate expansion makes sellers reluctant.'),

    -- CORRECTION regime
    ('correction', 'sale', 0.55, 1.50,
     '{"debt_stress_weight": 1.5, "hold_duration_weight": 0.6, "owner_age_weight": 0.8}',
     'Voluntary sales drop sharply. Only forced sellers transact. Deals take much longer.'),
    ('correction', 'lease_new', 1.20, 1.20,
     '{"lease_expiration_weight": 1.4}',
     'Leasing becomes primary transaction type. Tenants renegotiate for better terms.'),
    ('correction', 'lease_renewal', 0.90, 1.00,
     '{}',
     'Some tenants don''t renew (go out of business or downsize). Slight decrease.'),
    ('correction', 'distressed_sale', 1.80, 0.90,
     '{"debt_stress_weight": 1.8, "lien_weight": 1.5}',
     'Distressed sales surge. Loan maturities, NODs, and auctions increase dramatically.'),
    ('correction', 'value_add_purchase', 1.50, 1.00,
     '{}',
     'Value-add buyers enter looking for discounts. Tenant-rep opportunities increase.'),
    ('correction', 'investment_sale', 0.40, 1.80,
     '{}',
     'Institutional investors mostly frozen. Only opportunistic buyers active.'),

    -- RECOVERY regime
    ('recovery', 'sale', 0.90, 1.20,
     '{"hold_duration_weight": 1.1}',
     'Sales beginning to return but still cautious. Some pent-up supply entering market.'),
    ('recovery', 'lease_new', 1.15, 1.00,
     '{}',
     'Leasing remains strong as businesses expand again.'),
    ('recovery', 'lease_renewal', 1.10, 1.00,
     '{}',
     'Renewals solid -- tenants who survived the correction are stable.'),
    ('recovery', 'distressed_sale', 1.30, 1.00,
     '{"debt_stress_weight": 1.3}',
     'Tail-end distress from correction still clearing. Last wave of forced sellers.'),
    ('recovery', 'value_add_purchase', 1.60, 0.85,
     '{}',
     'Best window for value-add plays. Smart money is buying. Deals move quickly.'),
    ('recovery', 'investment_sale', 1.20, 1.00,
     '{}',
     'Institutional capital returning. Early movers get best pricing.')

ON CONFLICT (regime, transaction_type) DO NOTHING;
```

### 47.5 -- Regime History Table

```sql
CREATE TABLE IF NOT EXISTS regime_history (
    id                      SERIAL PRIMARY KEY,
    submarket               TEXT NOT NULL,
    property_type           TEXT NOT NULL,
    regime                  TEXT NOT NULL CHECK (regime IN (
        'boom', 'stable_growth', 'plateau', 'correction', 'recovery'
    )),
    start_date              DATE NOT NULL,
    end_date                DATE,                      -- NULL if current regime
    duration_days           INTEGER,
    -- Key events during this regime
    key_events              JSONB DEFAULT '[]',
    -- Example: [
    --   {"date": "2025-06-15", "event": "Amazon announced 1.2M SF fulfillment center in Fontana"},
    --   {"date": "2025-09-01", "event": "Fed cut rates 50bp"},
    --   {"date": "2025-11-20", "event": "Vacancy hit 2.1%, lowest since 2021"}
    -- ]
    -- Performance during this regime
    avg_days_on_market      INTEGER,
    avg_price_psf           NUMERIC(10,2),
    deals_closed            INTEGER,
    commission_generated    NUMERIC(12,2),
    -- What strategies worked
    effective_strategies    JSONB DEFAULT '[]',
    -- Example: [
    --   {"strategy": "Target trust owners 70+", "success_rate": 0.35, "deals": 4},
    --   {"strategy": "Distressed loan maturity outreach", "success_rate": 0.12, "deals": 2}
    -- ]
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regime_history_submarket ON regime_history(submarket, property_type);
CREATE INDEX idx_regime_history_regime ON regime_history(regime);
CREATE INDEX idx_regime_history_dates ON regime_history(start_date, end_date);
```

### 47.6 -- Regime Indicator Data Entry Table

Since most regime indicators require manual data entry (CoStar exports, BLS data, port authority reports), a structured input table:

```sql
CREATE TABLE IF NOT EXISTS regime_indicators (
    id                      SERIAL PRIMARY KEY,
    indicator_name          TEXT NOT NULL CHECK (indicator_name IN (
        'vacancy_rate', 'days_on_market', 'listing_volume_new',
        'listing_volume_withdrawn', 'price_psf', 'interest_rate',
        'employment_growth', 'construction_permits', 'port_volume'
    )),
    submarket               TEXT NOT NULL,             -- 'Fontana', 'Ontario', 'IE_Overall', etc.
    property_type           TEXT NOT NULL DEFAULT 'All',
    -- Value
    value                   NUMERIC NOT NULL,
    period_start            DATE NOT NULL,             -- what period this data covers
    period_end              DATE NOT NULL,
    -- Source
    source                  TEXT NOT NULL,             -- 'CoStar Q1 2026', 'BLS March 2026', etc.
    source_url              TEXT,
    notes                   TEXT,
    -- Metadata
    entered_by              TEXT DEFAULT 'david',
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_regime_ind_name ON regime_indicators(indicator_name, submarket);
CREATE INDEX idx_regime_ind_period ON regime_indicators(period_start);
CREATE UNIQUE INDEX idx_regime_ind_unique
    ON regime_indicators(indicator_name, submarket, property_type, period_start);
```

### 47.7 -- How Regime Adjustments Apply to Predictions

The nightly prediction engine (2:00 AM) applies regime adjustments between feature scoring and final probability output:

```
1. Compute raw entity probability (from features, as designed in Prompt 35)
2. Look up current regime for entity's submarket + property_type
3. Determine transaction type (sale vs lease based on predicted_type)
4. Fetch regime_prediction_adjustments for (regime, transaction_type)
5. Apply:
   adjusted_probability = raw_probability * probability_multiplier
   adjusted_horizon = raw_horizon * horizon_multiplier
6. Apply feature weight overrides to recalculate TPE components
7. Clip adjusted_probability to [0.01, 0.99]
8. Store in predictive_scores with regime metadata in top_features JSONB
```

The `predictive_scores.top_features` JSONB gains a new entry:

```json
{
    "feature": "regime_adjustment",
    "regime": "plateau",
    "multiplier": 0.80,
    "original_probability": 0.45,
    "adjusted_probability": 0.36,
    "explanation": "Plateau regime reduces sale probability by 20%. Deals taking longer to close."
}
```

### 47.8 -- Regime Transition Alert

When the regime detection engine identifies a regime change (current regime differs from previous month), it generates an alert for the morning briefing.

**Template:**

```
MARKET REGIME ALERT
================================================

{submarket} {property_type} appears to be transitioning from {previous_regime} to {new_regime}.

KEY SIGNALS:
{for each indicator where |change| > threshold:}
  {indicator}: {previous_value} -> {current_value} ({change_direction} {abs_change}%)
{end for}

WHAT THIS MEANS FOR YOUR PIPELINE:
- Sale probability adjustment: {sale_multiplier}x ({explanation})
- Lease probability adjustment: {lease_multiplier}x ({explanation})
- Expected deal timeline: {horizon_multiplier}x (deals will take {longer/shorter})

RECOMMENDED STRATEGY SHIFT:
{for each regime-specific recommendation:}
  - {recommendation}
{end for}

HISTORICAL CONTEXT:
Last time {submarket} {property_type} was in {new_regime}: {last_regime_period}
  Duration: {duration_days} days
  Deals closed: {deals_closed}
  Most effective strategy: {top_strategy}
```

**Example Output:**

```
MARKET REGIME ALERT
================================================

IE Industrial appears to be transitioning from Stable Growth to Plateau.

KEY SIGNALS:
  Days on market: 118 avg -> 156 avg (increased 32% in 60 days)
  Listing withdrawals: 3 -> 8 this month (167% increase)
  Price/SF trend: +5.2% annualized -> +1.1% (deceleration)
  Transaction volume: 94% of 5yr avg -> 78% of 5yr avg

WHAT THIS MEANS FOR YOUR PIPELINE:
- Sale probability adjustment: 0.80x (voluntary sales slow, only strong motivators drive deals)
- Lease probability adjustment: 1.10x (tenants who considered buying will lease instead)
- Expected deal timeline: 1.30x (deals will take 30% longer to close)

RECOMMENDED STRATEGY SHIFT:
  - Shift prospecting emphasis toward lease renewals and tenant representation
  - Delay aggressive pricing on new sale listings -- price to market, not aspiration
  - Increase focus on distressed/motivated sellers (loan maturities, estate situations)
  - Watch for value-add opportunities as prices soften
  - Consider tenant-rep mandates for companies whose leases expire in 12-18 months

HISTORICAL CONTEXT:
Last time IE Industrial was in Plateau: July 2023 - February 2024
  Duration: 245 days
  Deals closed: 6
  Most effective strategy: Target trust owners 70+ (3 of 6 deals)
```

### 47.9 -- Server Endpoints

```
GET  /api/regime/current                    -- Current regime for all submarket/type combos
GET  /api/regime/current/:submarket/:type   -- Current regime for specific segment
GET  /api/regime/history/:submarket/:type   -- Regime history for a segment
POST /api/regime/indicators                 -- Enter new indicator data
GET  /api/regime/indicators/:submarket      -- Get indicator history for a submarket
GET  /api/regime/adjustments                -- Get all regime prediction adjustments
PUT  /api/regime/adjustments/:id            -- Update a regime adjustment (David tuning)
POST /api/regime/detect                     -- Trigger regime detection manually
```

---

<a id="prompt-48"></a>
# PROMPT 48: Data Value Estimation & ROI Calculator

## Current State Analysis

David spends 5-10 hours per week on manual data research: looking up lease expirations on CoStar, verifying phone numbers via WhitePages, checking county assessor records for ownership changes, re-verifying stale email addresses. This time is valuable but unstructured -- he doesn't know which research activities produce the highest return.

**What exists:**
- `data_moat_registry` (Prompt 34) -- catalogs data assets and their uniqueness
- `data_quality_scores` (implied from Prompt 37) -- per-entity completeness metrics
- `predictive_scores` (Prompt 35) -- per-property predictions that improve with better data
- `ai_usage_tracking` -- tracks AI agent costs per service
- `prediction_outcomes` -- tracks prediction accuracy over time

**What's missing:**

| Gap | Impact |
|-----|--------|
| **No data value quantification** | David doesn't know if spending 1 hour on lease expirations is worth more than 1 hour on phone numbers |
| **No research session planning** | When David has 2 free hours, the system can't recommend the optimal research tasks |
| **No feedback loop** | After research is done, there's no measurement of whether it actually led to deals |
| **No ROI comparison** | No way to compare historical ROI of different data types |
| **No time tracking** | System doesn't know how long different research tasks take |

## Proposed Design

### 48.1 -- Value of Information (VOI) Formula

The core insight: better data improves prediction accuracy, which leads to better targeting, which leads to more deals closed. The value chain:

```
Better data -> Better predictions -> Better targeting -> More deals -> More commission

VOI = Σ (prediction_improvement_i × deal_value_i × commission_rate_i) for affected entities
    - lookup_cost (estimated_hours × hourly_rate)
```

**Breaking down each component:**

**1. Prediction Improvement (per entity):**

How much does filling a missing data field improve the prediction for that entity?

This is estimated from historical data: when a field was filled in the past, how much did the prediction change?

```sql
-- Historical prediction improvement when lease_expiration was added
WITH before_after AS (
    SELECT
        ps_before.property_id,
        ps_before.prob_6mo AS prob_before,
        ps_after.prob_6mo AS prob_after,
        ABS(ps_after.prob_6mo - ps_before.prob_6mo) AS improvement
    FROM predictive_scores ps_before
    JOIN predictive_scores ps_after ON ps_before.property_id = ps_after.property_id
    WHERE ps_after.scored_at > ps_before.scored_at
      AND ps_after.scored_at < ps_before.scored_at + INTERVAL '7 days'
      -- Property got lease_expiration filled between scores
      AND EXISTS (
          SELECT 1 FROM properties p
          WHERE p.property_id = ps_before.property_id
            AND p.lease_expiration IS NOT NULL
            AND p.updated_at BETWEEN ps_before.scored_at AND ps_after.scored_at
      )
)
SELECT AVG(improvement) AS avg_prediction_improvement  -- e.g., 0.15 = 15% avg improvement
FROM before_after;
```

If no historical data exists yet, use domain-knowledge defaults:

| Data Field | Default Prediction Improvement | Rationale |
|-----------|-------------------------------|-----------|
| Lease expiration | +15% | Strongest single predictor of transaction timing |
| Owner age | +12% | Key motivator predictor |
| Owner entity type | +8% | Trust/estate indicators |
| Phone number (verified) | +5% | Enables outreach, indirect prediction value |
| Email (verified) | +3% | Enables outreach, less direct |
| Loan maturity date | +18% | Strongest distress predictor |
| Vacancy status | +10% | Directly affects transaction type prediction |
| Asking price / lease rate | +7% | Enables commission estimation |

**2. Deal Value (per entity):**

Estimated from property characteristics using `tpe_config` assumptions:

```sql
estimated_deal_value = CASE
    WHEN predicted_type = 'sale' THEN
        COALESCE(for_sale_price, square_footage * (SELECT config_value FROM tpe_config WHERE config_key = 'sale_price_psf'))
    WHEN predicted_type = 'lease' THEN
        square_footage * COALESCE(asking_lease_rate,
            (SELECT config_value FROM tpe_config WHERE config_key = 'lease_rate_mid'))
        * (SELECT config_value FROM tpe_config WHERE config_key = 'lease_term_months')
    END
```

**3. Commission Rate:**

From `tpe_config`: 3% for sales under $5M, 2% for $5-10M, 1% for over $10M. 4% for new leases, 2% for renewals.

**4. Lookup Cost:**

David's effective hourly rate (configurable, default: $200/hour based on target annual commission / working hours).

Estimated time per data type per record:

| Data Type | Est. Minutes/Record | Source |
|-----------|-------------------|--------|
| Lease expiration | 8 | CoStar lookup |
| Owner age | 12 | WhitePages + social media |
| Phone number | 5 | WhitePages / BeenVerified |
| Email verification | 3 | NeverBounce / manual send |
| Ownership changes | 4 | County assessor website |
| Loan maturity | 15 | Title rep request |
| Vacancy status | 3 | CoStar / drive-by |
| Asking price | 2 | CoStar / LoopNet |

### 48.2 -- Data Value Estimates Table

```sql
CREATE TABLE IF NOT EXISTS data_value_estimates (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- What data is being valued
    data_type                   TEXT NOT NULL,          -- 'lease_expiration', 'owner_age', 'phone', 'email', etc.
    segment_filter              JSONB DEFAULT '{}',    -- optional: {"submarket": "Fontana", "property_type": "Industrial"}

    -- Scope
    records_affected            INTEGER NOT NULL,       -- how many entities are missing this data
    sample_entity_ids           UUID[],                 -- top 10 entity IDs for quick reference

    -- Value calculation
    avg_prediction_improvement  NUMERIC(5,4) NOT NULL,  -- average improvement per entity (0.0-1.0)
    avg_deal_value              NUMERIC(12,2) NOT NULL,  -- average estimated deal value
    avg_commission              NUMERIC(12,2) NOT NULL,  -- average commission per deal
    expected_additional_deals   NUMERIC(6,2) NOT NULL,   -- records_affected * avg_prediction_improvement (simplified)
    total_estimated_value       NUMERIC(12,2) NOT NULL,  -- expected_additional_deals * avg_commission

    -- Cost calculation
    est_minutes_per_record      INTEGER NOT NULL,
    estimated_lookup_time_hours NUMERIC(6,2) NOT NULL,   -- records_affected * est_minutes_per_record / 60
    hourly_rate                 NUMERIC(8,2) NOT NULL DEFAULT 200.00,
    estimated_cost              NUMERIC(10,2) NOT NULL,  -- estimated_lookup_time_hours * hourly_rate

    -- ROI
    roi_per_hour                NUMERIC(12,2) NOT NULL,  -- total_estimated_value / estimated_lookup_time_hours
    roi_multiple                NUMERIC(8,2) NOT NULL,   -- total_estimated_value / estimated_cost

    -- Ranking
    priority_rank               INTEGER,                 -- 1 = highest ROI per hour

    -- Lifecycle
    status                      TEXT NOT NULL DEFAULT 'estimated' CHECK (
        status IN ('estimated', 'queued', 'in_progress', 'completed', 'measured', 'expired')
    ),
    queued_at                   TIMESTAMPTZ,
    started_at                  TIMESTAMPTZ,
    completed_at                TIMESTAMPTZ,

    -- Metadata
    model_version               TEXT NOT NULL,
    created_at                  TIMESTAMPTZ DEFAULT NOW(),
    expires_at                  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
);

CREATE INDEX idx_data_value_type ON data_value_estimates(data_type);
CREATE INDEX idx_data_value_roi ON data_value_estimates(roi_per_hour DESC);
CREATE INDEX idx_data_value_status ON data_value_estimates(status);
CREATE INDEX idx_data_value_created ON data_value_estimates(created_at);
```

### 48.3 -- Data Value Actuals Table (Feedback Loop)

```sql
CREATE TABLE IF NOT EXISTS data_value_actuals (
    id                          SERIAL PRIMARY KEY,
    estimate_id                 UUID NOT NULL REFERENCES data_value_estimates(id) ON DELETE CASCADE,

    -- What actually happened after the research was completed
    -- Measured at 30, 90, and 180 days post-completion
    measurement_horizon_days    INTEGER NOT NULL,       -- 30, 90, or 180

    -- Actual prediction improvement
    actual_prediction_improvement NUMERIC(5,4),         -- measured avg improvement
    prediction_improvement_ratio NUMERIC(5,4),          -- actual / estimated

    -- Actual deal outcomes
    actual_deals_influenced     INTEGER DEFAULT 0,      -- deals where this data was a factor
    actual_commission_generated NUMERIC(12,2) DEFAULT 0,

    -- Actual time spent
    actual_time_spent_hours     NUMERIC(6,2),
    actual_records_completed    INTEGER,

    -- Actual ROI
    actual_roi_per_hour         NUMERIC(12,2),          -- actual_commission / actual_time_spent
    actual_roi_multiple         NUMERIC(8,2),

    -- Accuracy of the estimate
    value_estimate_accuracy     NUMERIC(5,4),           -- actual_commission / estimated_commission (1.0 = perfect)

    -- Notes
    notes                       TEXT,
    measured_at                 TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_data_actuals_estimate ON data_value_actuals(estimate_id);
CREATE INDEX idx_data_actuals_horizon ON data_value_actuals(measurement_horizon_days);
```

### 48.4 -- Research Session Optimizer

When David has a block of research time, the system generates an optimal research plan.

**Endpoint:**

```
GET /api/research/optimize?available_minutes=120
```

**Algorithm:**

```python
def optimize_research_session(available_minutes):
    """
    Knapsack optimization: maximize total estimated value
    subject to time constraint.
    """
    # 1. Get all current data_value_estimates with status = 'estimated'
    estimates = query("SELECT * FROM data_value_estimates WHERE status = 'estimated' ORDER BY roi_per_hour DESC")

    # 2. For each estimate, compute research "items"
    #    Break large tasks into chunks (max 60 min per chunk)
    items = []
    for est in estimates:
        total_minutes = est.estimated_lookup_time_hours * 60
        records = est.records_affected

        if total_minutes <= available_minutes:
            # Can do the whole thing
            items.append({
                'estimate_id': est.id,
                'data_type': est.data_type,
                'records': records,
                'minutes': total_minutes,
                'value': est.total_estimated_value,
                'description': f"Look up {est.data_type} for {records} {est.segment_filter} records"
            })
        else:
            # Break into proportional chunk that fits
            fraction = available_minutes / total_minutes
            chunk_records = int(records * fraction)
            chunk_minutes = int(total_minutes * fraction)
            chunk_value = est.total_estimated_value * fraction
            items.append({
                'estimate_id': est.id,
                'data_type': est.data_type,
                'records': chunk_records,
                'minutes': chunk_minutes,
                'value': chunk_value,
                'description': f"Look up {est.data_type} for {chunk_records} of {records} records (highest-value first)"
            })

    # 3. Greedy knapsack (items sorted by ROI, add until time budget exhausted)
    plan = []
    remaining_minutes = available_minutes
    total_value = 0

    for item in sorted(items, key=lambda x: x['value'] / max(x['minutes'], 1), reverse=True):
        if item['minutes'] <= remaining_minutes:
            plan.append(item)
            remaining_minutes -= item['minutes']
            total_value += item['value']

    return {
        'available_minutes': available_minutes,
        'planned_minutes': available_minutes - remaining_minutes,
        'total_estimated_value': total_value,
        'tasks': plan,
        'roi_per_hour': total_value / ((available_minutes - remaining_minutes) / 60) if remaining_minutes < available_minutes else 0
    }
```

**Example response:**

```json
{
    "available_minutes": 120,
    "planned_minutes": 110,
    "total_estimated_value": 180000,
    "roi_per_hour": 98182,
    "tasks": [
        {
            "rank": 1,
            "data_type": "lease_expiration",
            "description": "Look up lease expirations for 8 Fontana industrial properties",
            "records": 8,
            "minutes": 45,
            "value": 85000,
            "roi_per_hour": 113333,
            "top_entities": ["1234 Industrial Way", "5678 Commerce Dr", "..."]
        },
        {
            "rank": 2,
            "data_type": "phone",
            "description": "Verify phone numbers for 5 high-TPE contacts",
            "records": 5,
            "minutes": 20,
            "value": 42000,
            "roi_per_hour": 126000,
            "top_entities": ["John Chen (Pacific Trust)", "Maria Garcia (IE Holdings)", "..."]
        },
        {
            "rank": 3,
            "data_type": "ownership_change",
            "description": "Check county assessor for ownership changes on 12 Ontario properties",
            "records": 12,
            "minutes": 35,
            "value": 38000,
            "roi_per_hour": 65143,
            "top_entities": ["9012 Main St", "3456 Airport Dr", "..."]
        },
        {
            "rank": 4,
            "data_type": "email_verification",
            "description": "Re-verify 3 stale email addresses for hot leads",
            "records": 3,
            "minutes": 10,
            "value": 15000,
            "roi_per_hour": 90000,
            "top_entities": ["Robert Kim", "Susan Park", "..."]
        }
    ]
}
```

### 48.5 -- Research Completion Tracking

When David completes a research task, he (or the system, when data is entered) marks it:

```
POST /api/research/complete
{
    "estimate_id": "uuid",
    "records_completed": 8,
    "actual_time_minutes": 50,
    "notes": "3 properties had no lease data available on CoStar"
}
```

This updates the `data_value_estimates` record to `status = 'completed'` and schedules measurement checks at 30, 90, and 180 days (via agent cron job) that will create `data_value_actuals` rows.

### 48.6 -- Monthly ROI Report

Generated on the 1st of each month. Compares estimated vs actual ROI across all completed research tasks.

**Template:**

```
DATA RESEARCH ROI REPORT -- {month} {year}
================================================

SUMMARY:
  Total research time this month: {total_hours} hours
  Estimated value generated: ${estimated_value}
  Actual value measured (from prior months' research): ${actual_value}
  Effective ROI: ${actual_roi_per_hour}/hour

DATA TYPE PERFORMANCE (ranked by actual ROI):
{for each data_type with completed measurements:}
  {rank}. {data_type}
    Research time: {hours} hours ({records} records)
    Estimated value: ${estimated}
    Actual value (measured): ${actual}
    ROI ratio: {actual/estimated}x ({"better" or "worse"} than estimated)
    Deals influenced: {deals}
{end for}

RECOMMENDATIONS:
{if any data type has actual ROI > 2x estimated:}
  INCREASE: {data_type} research is producing {ratio}x the estimated value.
    Consider allocating more time here.
{end if}
{if any data type has actual ROI < 0.5x estimated:}
  DECREASE: {data_type} research is producing only {ratio}x the estimated value.
    Consider reducing time here or investigating why returns are low.
{end if}

DATA INVESTMENT PORTFOLIO:
  {for each data_type, sorted by historical actual ROI:}
    {data_type}: Historical ROI ${roi}/hour ({data_points} measurements)
    [=========>    ] {confidence_bar based on data_points}
  {end for}
```

**Example Output:**

```
DATA RESEARCH ROI REPORT -- February 2026
================================================

SUMMARY:
  Total research time this month: 18 hours
  Estimated value generated: $420K pipeline improvement
  Actual value measured (from November research): $165K commission closed
  Effective ROI: $9,167/hour of research time

DATA TYPE PERFORMANCE (ranked by actual ROI):
  1. Lease expirations
    Research time: 6 hours (32 records)
    Estimated value: $180K
    Actual value (measured at 90 days): $95K commission from 2 deals
    ROI ratio: 0.53x (lower than estimated, but still excellent)
    Deals influenced: 2

  2. Loan maturity dates
    Research time: 3 hours (12 records)
    Estimated value: $85K
    Actual value: $70K commission from 1 distressed sale
    ROI ratio: 0.82x (close to estimate)
    Deals influenced: 1

  3. Phone numbers (verified)
    Research time: 4 hours (48 records)
    Estimated value: $95K
    Actual value: $0 (no deals yet, 2 active conversations)
    ROI ratio: pending (too early to measure)
    Deals influenced: 0 (2 in progress)

  4. Owner ages
    Research time: 5 hours (25 records)
    Estimated value: $60K
    Actual value: $0 (no deals, 1 warm lead)
    ROI ratio: pending
    Deals influenced: 0

RECOMMENDATIONS:
  INCREASE: Lease expiration research produced $15,833/hour ROI.
    You completed 32 records. There are 89 more high-value records without lease data.
    Suggested: allocate 8 hours next month to lease expirations.

  MONITOR: Phone number verification has 2 active conversations in progress.
    Defer judgment until 180-day measurement.

DATA INVESTMENT PORTFOLIO (Historical ROI per hour):
  Lease expirations:  $15,833/hour  (2 measurements)  [=====>     ]
  Loan maturities:    $23,333/hour  (1 measurement)   [==>        ]
  Phone numbers:       pending      (0 measurements)  [           ]
  Owner ages:          pending      (0 measurements)  [           ]
```

### 48.7 -- Data Investment Portfolio View (UI Component)

A new section on the dashboard showing data types as "investments" with historical performance:

```
DATA INVESTMENT PORTFOLIO
================================================

| Data Type          | Records Missing | Est. ROI/hour | Actual ROI/hour | Confidence | Action        |
|--------------------|-----------------|---------------|-----------------|------------|---------------|
| Loan maturity      | 45              | $24K          | $23K (1 meas.)  | Low        | [Research]    |
| Lease expiration   | 89              | $18K          | $16K (2 meas.)  | Medium     | [Research]    |
| Owner age          | 480             | $12K          | pending          | None       | [Research]    |
| Phone (verified)   | 234             | $8K           | pending          | None       | [Research]    |
| Email (verified)   | 156             | $5K           | pending          | None       | [Research]    |
| Vacancy status     | 67              | $4K           | pending          | None       | [Research]    |
| Ownership changes  | 320             | $3K           | pending          | None       | [Research]    |

[Optimize 2-hour session]  [Optimize 30-minute session]
```

Clicking "Research" on any row opens the research optimizer pre-filtered to that data type. Clicking an "Optimize" button triggers the research session optimizer for that time budget.

### 48.8 -- Nightly Data Value Refresh

**Cron job: 3:30 AM (after portfolio predictions and competitive scan)**

1. Identify all missing data fields across pipeline entities (non-cold stage).
2. Group by data_type and segment.
3. For each group, compute VOI using the formula in 48.1.
4. Use historical `data_value_actuals` to refine default prediction improvement estimates (Bayesian update: blend domain defaults with measured actuals).
5. Rank all groups by ROI per hour.
6. Upsert into `data_value_estimates` (expire old estimates, create new ones).
7. Generate morning briefing section with top 3 research recommendations.

### 48.9 -- Morning Briefing: Data Value Section

**Template:**

```
RESEARCH PRIORITIES (based on pipeline value)
================================================

Top 3 highest-ROI research tasks:
{for each top-3 estimate by roi_per_hour:}
  {rank}. {data_type} for {segment}: {records} records, ~{minutes} min
    Est. value: ${total_estimated_value}  |  ROI: ${roi_per_hour}/hour
    Start with: {top_entity_names, limit 3}
{end for}

{if any data_value_actuals measured this week:}
RESEARCH RESULTS UPDATE:
  Your {data_type} research from {date} has produced {outcome_summary}.
{end if}
```

### 48.10 -- Server Endpoints

```
GET  /api/research/values                   -- All current data value estimates, sorted by ROI
GET  /api/research/optimize?minutes=120     -- Research session optimizer
POST /api/research/complete                 -- Mark research task as completed
GET  /api/research/actuals                  -- Historical actual ROI data
GET  /api/research/portfolio                -- Data investment portfolio view
GET  /api/research/report?month=2026-02     -- Monthly ROI report
POST /api/research/refresh                  -- Trigger nightly data value refresh manually
```

---

<a id="new-tables"></a>
# New Tables Summary

| Table | Purpose | Rows (estimated) | Growth Rate |
|-------|---------|-------------------|-------------|
| `portfolio_predictions` | Aggregate pipeline forecasts | 3/day (one per horizon) | ~90/month |
| `portfolio_segments` | Breakdown by submarket/type/etc. | ~30 per prediction | ~900/month |
| `pipeline_stages` | Current stage per entity | ~500 (1 per active entity) | Stable (upsert) |
| `pipeline_stage_history` | Stage transition log | 5-20/day | ~300/month |
| `competitor_predictions` | Predicted competitor behaviors | 10-30 active | ~50/month |
| `competitor_activity_feed` | Raw competitor activity log | 5-15/day | ~300/month |
| `competitive_opportunities` | Actionable competitive openings | 5-20 active | ~30/month |
| `market_regimes` | Current regime per submarket/type | ~12 (one per combo) | Stable (upsert) |
| `regime_prediction_adjustments` | Regime-specific multipliers | ~30 (seed data) | Rare changes |
| `regime_history` | Historical regime periods | ~20 (growing slowly) | ~4/year |
| `regime_indicators` | Raw indicator data entries | 5-10/month | ~80/year |
| `data_value_estimates` | Estimated ROI of research tasks | 20-40 active | Monthly refresh |
| `data_value_actuals` | Measured actual ROI | 3 per completed estimate | ~30/month |

**Total new tables: 13**

---

<a id="migration"></a>
# Migration: 014_portfolio_competitive_regime_dataroi.sql

All tables above would be created in a single migration file. The migration should be idempotent (all `CREATE TABLE IF NOT EXISTS`, all `CREATE INDEX IF NOT EXISTS`). The `regime_prediction_adjustments` seed data uses `ON CONFLICT DO NOTHING`.

**Dependencies:**
- `properties(property_id)` -- referenced by `pipeline_stages`, `competitive_opportunities`
- `contacts(id)` -- referenced by `competitor_predictions.affected_contact_ids`
- `deals(id)` -- referenced by `competitive_opportunities.deal_id`
- `predictive_scores` (Prompt 35 migration) -- portfolio predictions aggregate from this table
- `competitor_profiles` (Prompt 23 migration) -- referenced by competitor tables

**Migration order:** This migration must run AFTER the Prompt 35 migration (predictive_scores) and the Prompt 23 migration (competitor_profiles). Since those are design specs not yet implemented, this migration should include the `competitor_profiles` table creation as well if it doesn't already exist.

---

<a id="integration-map"></a>
# Integration Map

## Nightly Processing Pipeline (Cron Sequence)

```
1:30 AM  Regime indicator ingestion (auto-pull where APIs exist)
1:45 AM  Regime detection engine (classify current regime per submarket/type)
2:00 AM  Entity-level prediction engine (Prompt 35, with regime adjustments from 47)
2:30 AM  Portfolio prediction engine (Prompt 45, aggregates entity predictions)
3:00 AM  Competitive intelligence scan (Prompt 46)
3:15 AM  Data value estimation refresh (Prompt 48)
3:30 AM  Morning briefing compilation (all sections)
```

## Data Flow Between Prompts

```
Regime Detection (47)
    |
    | regime_prediction_adjustments
    v
Entity-Level Predictions (35, enhanced)
    |
    | predictive_scores (adjusted for regime)
    v
Portfolio Predictions (45)
    |
    | portfolio_predictions, pipeline_stages
    v
Competitive Intelligence (46)
    |
    | competitive_opportunities (cross-ref pipeline)
    v
Data Value Estimation (48)
    |
    | data_value_estimates (based on pipeline gaps)
    v
Morning Briefing (compiled)
    |
    | All sections rendered
    v
David's Morning Dashboard
```

## Agent Responsibilities

| Agent | Prompt 45 Role | Prompt 46 Role | Prompt 47 Role | Prompt 48 Role |
|-------|---------------|---------------|---------------|---------------|
| **Houston (Tier 3)** | Presents portfolio briefing in Claude Panel | Surfaces competitive opportunities in conversation | Explains regime context for predictions | Recommends research priorities when David asks "what should I work on?" |
| **Chief of Staff (Tier 1)** | Monitors pipeline health score trends | Reviews competitive prediction accuracy | Validates regime classification | Generates monthly ROI reports |
| **Enrichment Agent (Tier 2)** | Identifies data gaps in pipeline entities | Cross-references competitor listings to CRM | None | Executes automated enrichment (email verify, etc.) |
| **Signal Agent (Tier 2)** | Detects stage transitions from signals | Monitors competitor activity sources | Ingests regime indicator data from news | None |
| **Outreach Agent (Tier 2)** | Drafts outreach for stage transitions | Drafts outreach for competitive opportunities | Adjusts outreach tone for regime | None |
| **QA Agent (Tier 1)** | Validates portfolio prediction reasonableness | Validates competitive predictions | Validates regime transitions | Validates VOI calculations |

---

<a id="priority"></a>
# Implementation Priority

## Phase 1: Foundation (Week 1-2)

| Component | Effort | Priority | Dependencies |
|-----------|--------|----------|-------------|
| `pipeline_stages` + `pipeline_stage_history` tables | 2 hours | **Critical** | predictive_scores |
| Stage assignment logic (nightly job) | 4 hours | **Critical** | pipeline_stages |
| `regime_indicators` + `market_regimes` tables | 2 hours | **High** | None |
| Regime indicator data entry UI | 4 hours | **High** | regime_indicators |
| Regime detection engine (rule-based) | 6 hours | **High** | regime_indicators, market_regimes |
| `regime_prediction_adjustments` + seed data | 1 hour | **High** | None |

## Phase 2: Portfolio Intelligence (Week 3-4)

| Component | Effort | Priority | Dependencies |
|-----------|--------|----------|-------------|
| Monte Carlo simulation engine | 8 hours | **High** | predictive_scores, pipeline_stages |
| `portfolio_predictions` + `portfolio_segments` tables | 2 hours | **High** | None |
| Pipeline Health Score computation | 4 hours | **High** | pipeline_stages |
| Portfolio section in morning briefing | 4 hours | **High** | portfolio_predictions |
| Pipeline Board UI (Kanban view) | 8 hours | **Medium** | pipeline_stages |
| Regime adjustment integration into prediction engine | 4 hours | **Medium** | regime_prediction_adjustments |

## Phase 3: Competitive Intelligence (Week 5-6)

| Component | Effort | Priority | Dependencies |
|-----------|--------|----------|-------------|
| `competitor_activity_feed` table + ingestion pipeline | 4 hours | **High** | competitor_profiles |
| `competitor_predictions` + prediction models (rule-based) | 8 hours | **High** | competitor_activity_feed |
| `competitive_opportunities` + scoring | 4 hours | **High** | competitor_predictions |
| Competitive intelligence morning briefing section | 4 hours | **Medium** | competitive_opportunities |
| Competitive opportunities UI (list + actions) | 6 hours | **Medium** | competitive_opportunities |

## Phase 4: Data Value ROI (Week 7-8)

| Component | Effort | Priority | Dependencies |
|-----------|--------|----------|-------------|
| `data_value_estimates` table + VOI calculation | 6 hours | **High** | predictive_scores, pipeline_stages |
| Research session optimizer endpoint | 4 hours | **High** | data_value_estimates |
| `data_value_actuals` + feedback loop cron | 4 hours | **Medium** | data_value_estimates |
| Monthly ROI report generator | 4 hours | **Medium** | data_value_actuals |
| Data Investment Portfolio UI | 6 hours | **Low** | data_value_estimates, data_value_actuals |
| Research priorities in morning briefing | 2 hours | **Medium** | data_value_estimates |

## Phase 5: Refinement (Ongoing)

| Component | Effort | Priority | Dependencies |
|-----------|--------|----------|-------------|
| Upgrade Monte Carlo to copula-based correlation | 12 hours | **Low** | 200+ prediction_outcomes |
| ML-based regime detection (replace rule-based) | 16 hours | **Low** | 12+ months regime_indicators data |
| ML-based competitor prediction models | 12 hours | **Low** | 6+ months competitor_activity_feed data |
| Bayesian VOI refinement (auto-calibrate from actuals) | 8 hours | **Low** | 50+ data_value_actuals rows |

**Total estimated effort: ~15-18 days across 8 weeks**

---

# Appendix: Key Formulas Reference

## Portfolio Expected Deals (Naive)
```
E[deals] = Σ prob_i for all pipeline entities i
```

## Portfolio Expected Commission (Naive)
```
E[commission] = Σ (prob_i × commission_i)
```

## Pipeline Health Score
```
PHS = 0.25 × diversity + 0.25 × velocity + 0.20 × data_quality + 0.15 × conversion_trend + 0.15 × coverage
```

## Regime Composite Score
```
RCS = 0.20 × vacancy + 0.15 × DOM + 0.15 × listing_ratio + 0.15 × price_trend + 0.10 × rates + 0.10 × employment + 0.08 × permits + 0.07 × port_volume
```

## Value of Information
```
VOI = Σ (improvement_i × deal_value_i × commission_rate_i) - (hours × hourly_rate)
```

## Listing Expiration Probability
```
P(expire) = clip(0.15 + DOM_factor + price_cut_factor + overpricing_factor + absorption_factor + competitor_factor, 0, 0.95)
```
