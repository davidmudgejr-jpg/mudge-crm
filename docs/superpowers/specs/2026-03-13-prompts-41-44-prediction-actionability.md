# IE CRM AI Master System -- Predictive Intelligence: Prompts 41-44
# Prediction Explanation, Data Freshness, Feature Importance, Calibration

**Date:** 2026-03-13
**Status:** Design Spec (Round 4 -- Predictive Intelligence)
**Scope:** Four capabilities that make predictions explainable, self-calibrating, and actionable
**Depends on:** Round 3 Prompt 35 (`predictive_scores`, `prediction_outcomes`, `predictive_feature_weights`), Round 3 Prompt 38 (Data Bounties -- forward reference), TPE scoring engine (`tpe_config`), and the 6-agent infrastructure (Migration 007)

---

## What Round 4 Adds

Round 1 fixed **operational gaps** (data flow, auth, email pipeline).
Round 2 added **intelligence loops** (self-awareness, calibration, emergent behavior detection).
Round 3 built the **strategic layer** (strategy sessions, data moat, predictive scoring, knowledge base).
Round 4 makes predictions **explainable, fresh, self-aware, and self-correcting**.

### The Core Problem Round 4 Solves

**David cannot trust a prediction he cannot understand, and the system cannot improve predictions it cannot measure.** Currently:
- Predictions from Prompt 35 output a probability but no explanation of WHY
- Data decays silently -- a phone number verified 18 months ago is treated the same as one verified yesterday
- Feature weights are static domain-knowledge guesses with no feedback mechanism
- There is no calibration infrastructure to determine if "70% probability" actually means 70%

Round 4 closes these gaps with four interlocking systems:
1. **Explanation Engine** -- every prediction gets a plain-English "because" statement
2. **Freshness Model** -- every data point has a measurable shelf life that decays predictions
3. **Feature Importance** -- the system discovers which data actually matters and adapts
4. **Calibration System** -- predictions are measured, scored, and self-corrected over time

---

## Table of Contents

1. [Prompt 41: Prediction Explanation & Actionability Engine](#prompt-41)
2. [Prompt 42: Data Freshness & Decay Modeling](#prompt-42)
3. [Prompt 43: Feature Importance & Sensitivity Analysis](#prompt-43)
4. [Prompt 44: Prediction Calibration & Feedback System](#prompt-44)
5. [New Tables Summary](#new-tables)
6. [Migration SQL](#migration-sql)
7. [API Endpoints](#api-endpoints)
8. [Agent Behaviors](#agent-behaviors)
9. [Integration Map](#integration-map)
10. [Implementation Priority](#priority)

---

<a id="prompt-41"></a>
## PROMPT 41: Prediction Explanation & Actionability Engine

### Current State Analysis

The `predictive_scores` table (Prompt 35) stores `top_features` as a JSONB array of `{feature, value, weight, contribution}` objects. This is machine-readable but not David-readable. When David sees "Property X has a 72% chance of sale in 6 months," his immediate questions are:

1. **Why?** What specific data points drive that number?
2. **So what?** What should I do about it?
3. **When?** When is the optimal time to act?
4. **What if?** What would change this prediction?

None of these are answered by the current design.

**What's missing:**

| Gap | Impact |
|-----|--------|
| **No natural-language explanation** | David sees a number but no reasoning -- reduces trust and adoption |
| **No action recommendation** | Prediction exists in a vacuum -- doesn't tell David what to DO |
| **No timing guidance** | "72% in 6 months" doesn't say whether to call today or wait 3 months |
| **No sensitivity analysis** | David can't assess which data to pursue to improve or change the prediction |
| **No link to data gaps** | Missing data that would improve the prediction isn't surfaced |
| **No template system** | Every explanation would require an LLM call at ~$0.01 each, which doesn't scale to 3,700 properties nightly |

### Proposed Design

#### 41.1 -- Explanation Template Engine (Zero LLM Cost)

The key insight: prediction explanations are highly structured. The same patterns repeat across thousands of properties. A template engine with slot-filling produces natural-language explanations at zero marginal cost.

**Template Architecture:**

```
Template: "{entity} has a {probability}% chance of {transaction_type} within
{horizon} because: {reason_1} ({weight_1}%), {reason_2} ({weight_2}%),
{reason_3} ({weight_3}%). The strongest signal is {top_signal}."

Slot-filling example:
- entity = "15840 Valley Blvd, Fontana (Ramirez Family Trust)"
- probability = 72
- transaction_type = "sale"
- horizon = "6 months"
- reason_1 = "owner hold duration is 22 years (typical disposition window)"
- weight_1 = 28
- reason_2 = "owner age is 74 (succession planning likely)"
- weight_2 = 24
- reason_3 = "loan matures in 8 months (refinance-or-sell decision imminent)"
- weight_3 = 18
- top_signal = "22-year hold duration"

Output: "15840 Valley Blvd, Fontana (Ramirez Family Trust) has a 72% chance
of sale within 6 months because: owner hold duration is 22 years (typical
disposition window) (28%), owner age is 74 (succession planning likely) (24%),
loan matures in 8 months (refinance-or-sell decision imminent) (18%).
The strongest signal is 22-year hold duration."
```

**Template Types:**

| Template Type | Use Case | Example |
|---------------|----------|---------|
| `transaction_prediction` | Main prediction explanation | "X has Y% chance of Z because..." |
| `data_gap` | Missing data impact | "This prediction would improve from X% to Y% confidence if..." |
| `action_recommendation` | What to do | "Contact X via Y before Z because..." |
| `delay_risk` | Cost of inaction | "Waiting past X increases competitor risk by Y% because..." |
| `sensitivity` | What-if analysis | "If X changed to Y, prediction would move from A% to B%" |
| `confidence_warning` | Stale data flag | "Warning: this prediction relies on X-month-old data for Y" |

#### 41.2 -- Explanation Generation Pipeline

```
                EXPLANATION PIPELINE
                (runs after nightly scoring, ~2:15 AM)

predictive_scores (fresh)     explanation_templates
         |                            |
         v                            v
  +------------------+      +-------------------+
  | Feature Ranker   |      | Template Selector |
  | - Sort features  |      | - Match template  |
  | by contribution  |      |   to prediction   |
  | - Top 3-5 for    |      |   type + property |
  | explanation      |      |   type            |
  +--------+---------+      +---------+---------+
           |                          |
           +--------------------------+
                       |
                       v
              +-------------------+
              | Slot Filler       |
              | - Map features to |
              |   human-readable  |
              |   reason phrases  |
              | - Compute action  |
              |   timing          |
              | - Generate        |
              |   sensitivity     |
              +--------+----------+
                       |
                       v
              +-------------------+
              | Action Engine     |
              | - Determine best  |
              |   action type     |
              | - Pick optimal    |
              |   channel + date  |
              | - Estimate delay  |
              |   cost            |
              +--------+----------+
                       |
                       v
        prediction_explanations table
        action_recommendations table
```

#### 41.3 -- Feature-to-Reason Mapping

Each raw feature needs a human-readable reason phrase. This mapping is stored in the `feature_reason_phrases` table so it can be tuned without code changes.

| Feature Name | Reason Phrase Template | Example Output |
|--------------|----------------------|----------------|
| `owner_hold_duration` | "owner hold duration is {value} years (typical disposition window)" | "owner hold duration is 22 years (typical disposition window)" |
| `owner_age` | "owner age is {value} (succession planning likely)" | "owner age is 74 (succession planning likely)" |
| `loan_maturity_months` | "loan matures in {value} months (refinance-or-sell decision imminent)" | "loan matures in 8 months (refinance-or-sell decision imminent)" |
| `lease_expiry_months` | "primary lease expires in {value} months" | "primary lease expires in 4 months" |
| `tenant_headcount_growth` | "tenant headcount grew {value}% in 12 months (expansion signal)" | "tenant headcount grew 35% in 12 months (expansion signal)" |
| `submarket_vacancy_trend` | "submarket vacancy is {value} (trending {direction})" | "submarket vacancy is 3.2% (trending down)" |
| `comparable_sales_velocity` | "{value} comparable sales in last 6 months (market active)" | "7 comparable sales in last 6 months (market active)" |
| `cap_rate_vs_market` | "cap rate is {value}% vs {market}% market average" | "cap rate is 5.8% vs 5.2% market average" |
| `property_condition` | "property condition rated {value} (deferred maintenance)" | "property condition rated poor (deferred maintenance)" |
| `tax_assessment_change` | "tax assessment increased {value}% year-over-year" | "tax assessment increased 18% year-over-year" |

#### 41.4 -- Action Recommendation Engine

For each prediction above a configurable threshold (default: prob > 0.15), generate an action recommendation.

**Action Selection Logic:**

```
IF prediction.probability >= 0.50 AND prediction.horizon_months <= 6:
    action_type = 'call'
    urgency = 'high'
    timing = 'within 1 week'

ELSE IF prediction.probability >= 0.30 AND prediction.horizon_months <= 6:
    action_type = 'email'
    urgency = 'medium'
    timing = 'within 2 weeks'

ELSE IF prediction.probability >= 0.15 AND prediction.horizon_months <= 12:
    action_type = 'research'
    urgency = 'low'
    timing = 'within 1 month'

ELSE IF prediction.probability >= 0.50 AND prediction.horizon_months <= 12:
    action_type = 'visit'
    urgency = 'medium'
    timing = 'within 1 month'
```

**Channel Selection Logic:**

```
IF contact.phone_1 IS NOT NULL AND contact.owner_call_status != 'do_not_call':
    channel = 'phone'
ELSE IF contact.email IS NOT NULL AND contact.do_not_email = FALSE:
    channel = 'email'
ELSE IF property.address IS NOT NULL:
    channel = 'visit'  -- drive-by + door knock
ELSE:
    channel = 'research'  -- find contact info first
```

**Delay Cost Estimation:**

The system estimates the cost of inaction:

```
delay_cost_per_week = probability_of_competitor_contact x estimated_commission

WHERE:
  probability_of_competitor_contact =
    0.02 per week (base) +
    0.05 if property is listed on LoopNet/CoStar +
    0.03 if owner has received recent mailers (from market data) +
    0.10 if comparable property just sold (competitors alerted)
```

#### 41.5 -- "What Would Change This" Sensitivity Panel

For any prediction, compute and display:

**Top 5 Contributing Factors:**

```json
{
  "prediction_id": "abc-123",
  "current_probability": 0.72,
  "factors": [
    {
      "feature": "owner_hold_duration",
      "current_value": 22,
      "contribution": 0.20,
      "contribution_pct": 28,
      "sensitivity": "+0.01 per additional year held"
    },
    {
      "feature": "owner_age",
      "current_value": 74,
      "contribution": 0.17,
      "contribution_pct": 24,
      "sensitivity": "+0.02 per year over 65"
    },
    {
      "feature": "loan_maturity_months",
      "current_value": 8,
      "contribution": 0.13,
      "contribution_pct": 18,
      "sensitivity": "+0.03 per month closer to maturity"
    }
  ],
  "what_if_scenarios": [
    {
      "scenario": "If loan were refinanced (maturity pushed to 84 months)",
      "new_probability": 0.48,
      "delta": -0.24,
      "interpretation": "Loan pressure is a major driver -- refinancing would significantly reduce sale probability"
    },
    {
      "scenario": "If owner were 60 instead of 74",
      "new_probability": 0.55,
      "delta": -0.17,
      "interpretation": "Age contributes meaningfully but isn't the primary driver"
    }
  ],
  "data_gaps": [
    {
      "missing_field": "property_condition",
      "current_confidence": 0.72,
      "estimated_confidence_if_known": 0.78,
      "marginal_value": 0.06,
      "acquisition_method": "Drive-by inspection or Google Street View"
    }
  ]
}
```

**Sensitivity Coefficient Calculation:**

For each feature in a prediction:
```
sensitivity_coefficient = (prediction_at_value_plus_1 - prediction_at_current_value) / 1

Computed by:
1. Take current feature vector
2. Perturb one feature by +1 unit (or +1 standard deviation for non-integer features)
3. Re-run scoring engine with perturbed vector
4. Difference = sensitivity coefficient for that feature
```

This is computationally cheap because the scoring engine (Prompt 35) is a weighted sum, not an ML model. Sensitivity = feature_weight for linear models.

#### 41.6 -- Integration with Data Bounties (Prompt 38)

When the explanation engine identifies a data gap with high marginal value of information:

```
IF data_gap.marginal_value >= 0.05 (5% improvement)
   AND prediction.probability >= 0.20 (meaningful prediction)
   AND prediction.ev_6mo >= 5000 (enough commission at stake):

   AUTO-CREATE data_bounty:
     target_entity = prediction.entity
     target_field = data_gap.missing_field
     bounty_reason = "Acquiring {field} for {entity} would improve prediction
                      confidence from {current}% to {estimated}%, on a prediction
                      with ${ev} expected value"
     priority = data_gap.marginal_value x prediction.ev_6mo
     source = 'prediction_explanation_engine'
     linked_prediction_id = prediction.id
```

This creates a closed loop: prediction --> explanation --> data gap --> bounty --> enrichment --> better prediction.

#### 41.7 -- Explanation Tables

```sql
-- Migration 010a: Prediction Explanation & Actionability Engine

-- Explanation templates (zero-LLM-cost template engine)
CREATE TABLE IF NOT EXISTS explanation_templates (
    id                      SERIAL PRIMARY KEY,
    template_type           TEXT NOT NULL CHECK (template_type IN (
        'transaction_prediction', 'data_gap', 'action_recommendation',
        'delay_risk', 'sensitivity', 'confidence_warning'
    )),
    template_text           TEXT NOT NULL,
    -- e.g. "{entity} has a {probability}% chance of {transaction_type} within
    --  {horizon} because: {reason_1} ({weight_1}%), {reason_2} ({weight_2}%),
    --  {reason_3} ({weight_3}%). The strongest signal is {top_signal}."
    required_fields         TEXT[] NOT NULL,
    -- e.g. {'entity','probability','transaction_type','horizon','reason_1',...}
    property_types_applicable TEXT[] DEFAULT '{}',
    -- e.g. {'industrial','office','retail'} or empty = all
    transaction_types_applicable TEXT[] DEFAULT '{}',
    -- e.g. {'sale','lease','both'} or empty = all
    active                  BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_explanation_templates_type ON explanation_templates(template_type);
CREATE INDEX idx_explanation_templates_active ON explanation_templates(active) WHERE active = TRUE;

-- Feature-to-reason phrase mapping
CREATE TABLE IF NOT EXISTS feature_reason_phrases (
    id                      SERIAL PRIMARY KEY,
    feature_name            TEXT NOT NULL,
    reason_template         TEXT NOT NULL,
    -- e.g. "owner hold duration is {value} years (typical disposition window)"
    value_format            TEXT DEFAULT 'numeric',
    -- 'numeric', 'percent', 'months', 'years', 'text', 'currency'
    value_thresholds        JSONB DEFAULT '[]',
    -- e.g. [{"min": 15, "phrase": "typical disposition window"},
    --        {"min": 10, "phrase": "maturing hold period"},
    --        {"min": 5,  "phrase": "mid-term hold"}]
    active                  BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_feature_reason_phrases_feature ON feature_reason_phrases(feature_name);

-- Generated explanations (one per prediction)
CREATE TABLE IF NOT EXISTS prediction_explanations (
    id                      SERIAL PRIMARY KEY,
    prediction_id           UUID NOT NULL,
    -- References predictive_scores.id from Prompt 35
    entity_type             TEXT NOT NULL CHECK (entity_type IN (
        'property', 'contact', 'company'
    )),
    entity_id               UUID NOT NULL,

    -- Generated explanation
    explanation_text        TEXT NOT NULL,
    explanation_template_id INTEGER REFERENCES explanation_templates(id),
    data_points_used        JSONB NOT NULL DEFAULT '[]',
    -- [{feature, value, contribution_pct, freshness_days, decay_factor}]

    -- Action recommendation summary (denormalized for fast reads)
    action_recommended      TEXT,
    -- e.g. "Call Carlos Ramirez (trustee) to discuss estate planning options"
    action_timing           TEXT,
    -- e.g. "within 1 week"
    action_channel          TEXT CHECK (action_channel IN (
        'phone', 'email', 'visit', 'research', 'mail'
    )),
    delay_risk_description  TEXT,
    -- e.g. "Each week of delay increases competitor contact probability by 7%"

    -- Sensitivity summary
    sensitivity_data        JSONB DEFAULT '{}',
    -- {top_factors: [...], what_if_scenarios: [...], data_gaps: [...]}

    -- Confidence metadata
    explanation_confidence  NUMERIC(5,4),
    -- How confident are we in this explanation (affected by data freshness)
    stale_data_warning      TEXT,
    -- e.g. "Warning: phone number last verified 14 months ago"

    generated_at            TIMESTAMPTZ DEFAULT NOW(),
    expires_at              TIMESTAMPTZ,
    -- Explanation expires when the underlying prediction is re-scored

    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pred_explanations_prediction ON prediction_explanations(prediction_id);
CREATE INDEX idx_pred_explanations_entity ON prediction_explanations(entity_type, entity_id);
CREATE INDEX idx_pred_explanations_generated ON prediction_explanations(generated_at);

-- Action recommendations (actionable outputs from predictions)
CREATE TABLE IF NOT EXISTS action_recommendations (
    id                      SERIAL PRIMARY KEY,
    prediction_id           UUID NOT NULL,
    explanation_id          INTEGER REFERENCES prediction_explanations(id),

    -- What to do
    action_type             TEXT NOT NULL CHECK (action_type IN (
        'call', 'email', 'visit', 'research', 'mail', 'linkedin_connect'
    )),
    target_person           TEXT,
    -- e.g. "Carlos Ramirez (trustee)"
    target_contact_id       INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    target_channel          TEXT,
    -- e.g. "(909) 555-1234" or "carlos@ramirez.com"
    target_property_id      UUID,

    -- When to act
    optimal_date            DATE NOT NULL,
    deadline_date           DATE,
    -- After this date, the action loses significant value

    -- Why act now
    urgency_score           INTEGER NOT NULL CHECK (urgency_score >= 0 AND urgency_score <= 100),
    urgency_reason          TEXT,
    -- e.g. "Loan matures in 8 months -- owner entering decision window"

    -- Cost of delay
    delay_cost_estimate     NUMERIC(10,2),
    -- Estimated $ lost per week of delay
    delay_cost_description  TEXT,
    -- e.g. "Competitor contact probability increases 7% per week"

    -- Lifecycle
    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'taken', 'skipped', 'expired', 'delegated'
    )),
    taken_at                TIMESTAMPTZ,
    taken_notes             TEXT,
    outcome_notes           TEXT,
    skipped_reason          TEXT,
    delegated_to            TEXT,

    -- Link to outreach if action was taken
    sandbox_outreach_id     INTEGER REFERENCES sandbox_outreach(id) ON DELETE SET NULL,
    interaction_id          INTEGER,

    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_action_recs_prediction ON action_recommendations(prediction_id);
CREATE INDEX idx_action_recs_status ON action_recommendations(status);
CREATE INDEX idx_action_recs_urgency ON action_recommendations(urgency_score DESC);
CREATE INDEX idx_action_recs_optimal_date ON action_recommendations(optimal_date);
CREATE INDEX idx_action_recs_contact ON action_recommendations(target_contact_id);
CREATE INDEX idx_action_recs_property ON action_recommendations(target_property_id);
```

#### 41.8 -- API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/predictions/:id/explanation` | Get explanation for a specific prediction |
| `GET` | `/api/entities/:type/:id/predictions` | Get all predictions + explanations for an entity |
| `GET` | `/api/predictions/:id/sensitivity` | Get sensitivity analysis (what-would-change panel) |
| `GET` | `/api/action-recommendations?status=pending&limit=20` | David's action queue, sorted by urgency |
| `PATCH` | `/api/action-recommendations/:id` | Update status (taken/skipped/delegated) |
| `GET` | `/api/action-recommendations/dashboard` | Summary: pending count, taken this week, skip rate |
| `POST` | `/api/predictions/:id/what-if` | Run a what-if scenario with modified feature values |

#### 41.9 -- Agent Behaviors

**Chief of Staff Agent -- Morning Briefing Addition:**
```
PREDICTION ACTIONS TODAY:
- 3 HIGH urgency actions pending (call within 1 week)
- 7 MEDIUM urgency actions pending (email within 2 weeks)
- 2 actions expired yesterday (skipped/not taken)

TOP ACTION:
  Call Carlos Ramirez (trustee, Ramirez Family Trust)
  RE: 15840 Valley Blvd, Fontana
  72% sale probability in 6 months
  Because: 22-year hold + age 74 + loan maturing in 8 months
  Delay risk: ~$1,200/week in competitor exposure
```

**Enricher Agent -- Data Bounty Auto-Generation:**
When processing nightly explanations, Enricher checks for high-value data gaps and queues them as priority enrichment tasks alongside its normal work.

### Priority and Effort

| Component | Effort | Priority |
|-----------|--------|----------|
| `explanation_templates` + `feature_reason_phrases` tables + seed data | 3 hours | High |
| `prediction_explanations` table + generation pipeline | 1 day | High |
| `action_recommendations` table + action selection logic | 1 day | High |
| Sensitivity analysis computation | 4 hours | Medium |
| Data bounty auto-generation integration | 4 hours | Medium |
| API endpoints (7 routes) | 4 hours | High |
| Chief of Staff morning briefing integration | 2 hours | High |
| UI: explanation panel in property detail | 1 day | Medium |
| UI: action recommendation queue page | 1 day | Medium |
| **Total** | **~5.5 days** | |

---

<a id="prompt-42"></a>
## PROMPT 42: Data Freshness & Decay Modeling

### Current State Analysis

Every data point in IE CRM is treated as equally trustworthy regardless of age. A phone number verified 2 years ago has the same weight in predictions as one verified yesterday. This is fundamentally wrong:

- Email addresses have ~24% annual bounce rate (industry average)
- Job titles change every 18-24 months on average
- Property ownership transfers ~5% annually in IE market
- Asking prices can change weekly in active markets

The `sandbox_enrichments` table tracks `created_at` for new data, and `contacts` has `updated_at`, but there is no field-level timestamp tracking and no decay model.

**What's missing:**

| Gap | Impact |
|-----|--------|
| **No field-level timestamps** | System knows when a contact row was last updated but not which specific fields were verified when |
| **No decay model** | A phone number from 2024 is treated identically to one from today |
| **No reverification priority** | No mechanism to identify which stale data to refresh first |
| **No prediction impact** | Stale data feeds predictions without any confidence penalty |
| **No auto-reverification** | The Enricher has no concept of refreshing old data vs. finding new data |

### Proposed Design

#### 42.1 -- Data Decay Model

**The Exponential Decay Function:**

```
current_confidence = original_confidence x e^(-lambda x t)

WHERE:
  lambda = ln(2) / half_life_days
  t = days since last verification
  original_confidence = confidence at time of verification (0.0 to 1.0)
```

**Why exponential decay:** It models reality well -- data doesn't suddenly become invalid on day X. It gradually becomes less reliable. The half-life approach means after one half-life, confidence drops to 50% of its original value. After two half-lives, 25%. This gives smooth, predictable degradation.

**Example:**
- Phone number verified at 90% confidence on Jan 1
- Half-life = 240 days (8 months)
- Lambda = ln(2) / 240 = 0.00289
- On July 1 (181 days later): 90% x e^(-0.00289 x 181) = 90% x 0.593 = 53.4%
- On Jan 1 next year (365 days): 90% x e^(-0.00289 x 365) = 90% x 0.348 = 31.3%

#### 42.2 -- Decay Rates by Data Type

| Data Type | Field Names | Half-Life (days) | Stale After (days) | Dead After (days) | Re-verification Method | Est. Time per Item |
|-----------|-------------|------------------|--------------------|--------------------|----------------------|-------------------|
| Email address | `email`, `email_2`, `email_3` | 365 | 548 | 730 | NeverBounce API or send test email | 5 sec (API) |
| Phone number | `phone_1`, `phone_2`, `phone_3` | 240 | 365 | 548 | Carrier lookup API or manual call | 10 sec (API) / 3 min (call) |
| Job title | `title` | 180 | 300 | 425 | LinkedIn scrape / company website | 2 min |
| Company name | `company_name` | 365 | 548 | 730 | Open Corporates / Secretary of State | 1 min |
| Home address | `home_address` | 365 | 548 | 730 | White Pages / voter registration | 1 min |
| Work address | `work_address`, `work_city`, `work_state`, `work_zip` | 240 | 365 | 548 | LinkedIn / company website | 2 min |
| Employee count | (company-level) | 90 | 180 | 365 | LinkedIn job postings / company website | 5 min |
| Lease expiration | `lease_expiration` | N/A (fixed date) | After event | After event | N/A (date-certain) | N/A |
| Property ownership | `owner_name`, `owner_entity_type` | 180 | 365 | 730 | County assessor records | 3 min |
| Asking price | `for_sale_price` | 30 | 90 | 180 | LoopNet / CoStar / listing sites | 2 min |
| Vacancy status | (property-level) | 60 | 120 | 180 | Drive-by / Google Maps / LoopNet | 5 min (online) / 20 min (drive-by) |
| Contact relationship strength | (interaction recency) | 90 | 180 | 365 | Most recent interaction timestamp | Auto-computed |
| Cap rate | `cap_rate` | 90 | 180 | 365 | CoStar / recent comps | 3 min |
| NOI | `noi` | 180 | 365 | 548 | Property financials / owner conversation | 10 min |
| LinkedIn profile | `linkedin` | 365 | 548 | 730 | URL validity check | 10 sec |

#### 42.3 -- Freshness Classification

Each field falls into one of four freshness states:

| State | Condition | Visual Indicator | Prediction Impact |
|-------|-----------|-----------------|-------------------|
| **Fresh** | t < half_life | Green dot | Full confidence weight |
| **Aging** | half_life <= t < stale_threshold | Yellow dot | Reduced confidence (decay applied) |
| **Stale** | stale_threshold <= t < dead_threshold | Orange dot | Significant penalty; flagged in explanations |
| **Dead** | t >= dead_threshold | Red dot | Excluded from predictions; queued for reverification |

#### 42.4 -- Freshness Tables

```sql
-- Migration 010b: Data Freshness & Decay Modeling

-- Decay rules per field (configurable, seeded with domain knowledge)
CREATE TABLE IF NOT EXISTS data_freshness_rules (
    id                      SERIAL PRIMARY KEY,
    field_name              TEXT NOT NULL,
    entity_type             TEXT NOT NULL CHECK (entity_type IN (
        'contact', 'property', 'company', 'deal'
    )),
    -- Decay parameters
    half_life_days          INTEGER NOT NULL,
    stale_threshold_days    INTEGER NOT NULL,
    dead_threshold_days     INTEGER NOT NULL,
    -- Re-verification
    reverification_method   TEXT NOT NULL,
    -- e.g. 'neverbounce_api', 'linkedin_scrape', 'county_assessor',
    --       'carrier_lookup', 'manual_call', 'drive_by', 'auto_computed'
    reverification_cost_minutes NUMERIC(6,1) DEFAULT 0,
    -- Estimated time in minutes per item
    auto_reverify           BOOLEAN DEFAULT FALSE,
    -- If TRUE, Enricher auto-queues reverification when field goes stale
    -- If FALSE, only queued when explicitly requested or high-value prediction needs it
    priority_weight         NUMERIC(4,2) DEFAULT 1.0,
    -- Multiplier for reverification priority (higher = more important to keep fresh)
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_freshness_rules_field_entity
    ON data_freshness_rules(field_name, entity_type);

-- Field-level verification timestamps
CREATE TABLE IF NOT EXISTS field_timestamps (
    id                      BIGSERIAL PRIMARY KEY,
    entity_type             TEXT NOT NULL CHECK (entity_type IN (
        'contact', 'property', 'company', 'deal'
    )),
    entity_id               TEXT NOT NULL,
    -- TEXT because contacts use INTEGER id, properties use UUID
    field_name              TEXT NOT NULL,
    -- Verification data
    last_verified_at        TIMESTAMPTZ NOT NULL,
    verification_source     TEXT,
    -- e.g. 'neverbounce', 'manual_david', 'white_pages', 'linkedin',
    --       'county_assessor', 'import_csv', 'enricher_agent'
    confidence_at_verification NUMERIC(5,4) DEFAULT 1.0,
    -- How confident was the source? NeverBounce "valid" = 0.95, "catch-all" = 0.60
    -- Computed fields (updated by nightly job)
    current_decay_factor    NUMERIC(5,4) DEFAULT 1.0,
    -- e^(-lambda * t), recomputed nightly
    current_confidence      NUMERIC(5,4) DEFAULT 1.0,
    -- confidence_at_verification * current_decay_factor
    freshness_state         TEXT DEFAULT 'fresh' CHECK (freshness_state IN (
        'fresh', 'aging', 'stale', 'dead'
    )),
    -- Timestamps
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_field_timestamps_entity_field
    ON field_timestamps(entity_type, entity_id, field_name);
CREATE INDEX idx_field_timestamps_state
    ON field_timestamps(freshness_state);
CREATE INDEX idx_field_timestamps_verified
    ON field_timestamps(last_verified_at);
CREATE INDEX idx_field_timestamps_confidence
    ON field_timestamps(current_confidence);

-- Reverification queue (what needs refreshing and when)
CREATE TABLE IF NOT EXISTS reverification_queue (
    id                      SERIAL PRIMARY KEY,
    entity_type             TEXT NOT NULL CHECK (entity_type IN (
        'contact', 'property', 'company', 'deal'
    )),
    entity_id               TEXT NOT NULL,
    field_name              TEXT NOT NULL,
    -- Priority scoring
    priority_score          NUMERIC(8,2) NOT NULL DEFAULT 0,
    -- Computed: decay_severity x entity_tpe_score x field_priority_weight x prediction_impact
    priority_reason         TEXT,
    -- e.g. "Email for high-TPE contact (score 87) is stale (14 months). Used in 3 active predictions."
    -- Scheduling
    scheduled_for           DATE,
    assigned_to             TEXT DEFAULT 'enricher',
    -- 'enricher' (agent), 'david' (manual), 'api' (automated service)
    reverification_method   TEXT,
    -- Lifecycle
    status                  TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
        'queued', 'in_progress', 'completed', 'failed', 'skipped'
    )),
    result_value            TEXT,
    -- New value found during reverification (NULL if unchanged)
    result_confidence       NUMERIC(5,4),
    result_source           TEXT,
    completed_at            TIMESTAMPTZ,
    failure_reason          TEXT,
    -- Link back to what triggered this
    triggered_by            TEXT,
    -- 'nightly_decay_scan', 'prediction_engine', 'data_bounty', 'manual'
    linked_prediction_id    UUID,
    -- Timestamps
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reverification_queue_status ON reverification_queue(status);
CREATE INDEX idx_reverification_queue_priority ON reverification_queue(priority_score DESC);
CREATE INDEX idx_reverification_queue_scheduled ON reverification_queue(scheduled_for);
CREATE INDEX idx_reverification_queue_assigned ON reverification_queue(assigned_to, status);
CREATE INDEX idx_reverification_queue_entity ON reverification_queue(entity_type, entity_id);
```

#### 42.5 -- Nightly Decay Computation Job

Runs at 1:30 AM (before prediction scoring at 2:00 AM, so predictions use fresh decay factors):

```
NIGHTLY DECAY JOB:

1. For each row in field_timestamps:
   a. Look up half_life_days from data_freshness_rules for this field_name + entity_type
   b. Compute t = EXTRACT(EPOCH FROM (NOW() - last_verified_at)) / 86400
   c. Compute lambda = ln(2) / half_life_days
   d. Compute decay_factor = e^(-lambda * t)
   e. Compute current_confidence = confidence_at_verification * decay_factor
   f. Determine freshness_state:
      - t < half_life_days: 'fresh'
      - t < stale_threshold_days: 'aging'
      - t < dead_threshold_days: 'stale'
      - t >= dead_threshold_days: 'dead'
   g. UPDATE field_timestamps SET current_decay_factor, current_confidence, freshness_state

2. For each field that transitioned to 'stale' or 'dead':
   a. Check if auto_reverify = TRUE in data_freshness_rules
   b. If yes, compute priority_score:
      priority_score = (1 - decay_factor) x entity_tpe_score x field_priority_weight
   c. INSERT INTO reverification_queue if not already queued

3. Log summary to agent_logs:
   "Decay scan complete: 4,231 fields updated. 187 newly stale. 43 newly dead.
    82 auto-queued for reverification."
```

**SQL for bulk decay update (efficient single-pass):**

```sql
UPDATE field_timestamps ft
SET
    current_decay_factor = EXP(
        -LN(2) / dfr.half_life_days
        * EXTRACT(EPOCH FROM (NOW() - ft.last_verified_at)) / 86400
    ),
    current_confidence = ft.confidence_at_verification * EXP(
        -LN(2) / dfr.half_life_days
        * EXTRACT(EPOCH FROM (NOW() - ft.last_verified_at)) / 86400
    ),
    freshness_state = CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - ft.last_verified_at)) / 86400 < dfr.half_life_days
            THEN 'fresh'
        WHEN EXTRACT(EPOCH FROM (NOW() - ft.last_verified_at)) / 86400 < dfr.stale_threshold_days
            THEN 'aging'
        WHEN EXTRACT(EPOCH FROM (NOW() - ft.last_verified_at)) / 86400 < dfr.dead_threshold_days
            THEN 'stale'
        ELSE 'dead'
    END,
    updated_at = NOW()
FROM data_freshness_rules dfr
WHERE ft.field_name = dfr.field_name
  AND ft.entity_type = dfr.entity_type;
```

#### 42.6 -- Enricher Agent Reverification Budget

The Enricher agent has a daily task budget. Reverification must not starve new research:

```
DAILY ENRICHER BUDGET:
  Total capacity: ~100 items/day (estimated based on API rate limits and LLM costs)

  Budget allocation:
    80% = New research (80 items)
      - New contacts from priority board
      - Enrichment for existing contacts
      - Data bounty fulfillment

    20% = Reverification (20 items)
      - Pull top 20 from reverification_queue ORDER BY priority_score DESC
      - Process each: call API / scrape / lookup
      - Update field_timestamps with new verification
      - If value changed: create sandbox_enrichment for review
      - If value unchanged: update last_verified_at, reset decay

  Priority within reverification budget:
    1. Fields used in predictions with prob > 0.30 (prediction-critical)
    2. Fields for entities with TPE score > 70 (high-value entities)
    3. Fields with freshness_state = 'dead' (most degraded)
    4. Fields with auto_reverify = TRUE and freshness_state = 'stale'
```

#### 42.7 -- Integration with Prediction Engine

The prediction scoring engine (Prompt 35) must consume decay factors:

```
MODIFIED PREDICTION SCORING:

For each feature in the prediction:
  1. Look up field_timestamps for the underlying data field(s)
  2. Get current_decay_factor for each field
  3. Apply decay to the feature's contribution:

     adjusted_contribution = raw_contribution x avg_decay_factor_of_underlying_fields

  4. If any critical field has freshness_state = 'dead':
     - Flag prediction with stale_data_warning
     - Reduce overall prediction confidence by 15%

  5. If average decay factor across all features < 0.50:
     - Mark prediction as "low confidence due to stale data"
     - Include in explanation: "Warning: this prediction is based on data
       with an average age of {avg_age} months. Confidence is reduced."
```

#### 42.8 -- Backfill Strategy

When the freshness system is first deployed, no `field_timestamps` rows exist. Backfill approach:

```
BACKFILL STRATEGY:

1. For contacts imported from CSV (bulk import):
   - Set last_verified_at = contacts.created_at
   - Set verification_source = 'import_csv'
   - Set confidence_at_verification = 0.70 (CSV data has unknown provenance)

2. For contacts enriched by Enricher agent:
   - Set last_verified_at = sandbox_enrichments.promoted_at (or created_at)
   - Set verification_source = sandbox_enrichments.source
   - Set confidence_at_verification based on source:
     neverbounce = 0.95, white_pages = 0.80, been_verified = 0.75,
     open_corporates = 0.85, linkedin = 0.70, manual_david = 0.95

3. For fields with no provenance:
   - Set last_verified_at = entity.updated_at (best guess)
   - Set verification_source = 'backfill_unknown'
   - Set confidence_at_verification = 0.50 (pessimistic default)

4. Run nightly decay job immediately after backfill to compute current state
```

#### 42.9 -- API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/freshness/:entity_type/:entity_id` | Get freshness state for all fields of an entity |
| `GET` | `/api/freshness/summary` | System-wide freshness dashboard (% fresh/aging/stale/dead) |
| `GET` | `/api/reverification-queue?status=queued&limit=50` | View reverification queue |
| `PATCH` | `/api/reverification-queue/:id` | Update status (in_progress/completed/failed) |
| `POST` | `/api/freshness/:entity_type/:entity_id/:field_name/verify` | Manually mark a field as verified |
| `GET` | `/api/freshness/rules` | View/edit decay rules |
| `PATCH` | `/api/freshness/rules/:id` | Update a decay rule (half-life, thresholds) |

### Priority and Effort

| Component | Effort | Priority |
|-----------|--------|----------|
| `data_freshness_rules` table + seed data | 2 hours | High |
| `field_timestamps` table | 1 hour | High |
| `reverification_queue` table | 1 hour | High |
| Backfill script (populate field_timestamps from existing data) | 4 hours | High |
| Nightly decay computation job | 4 hours | High |
| Enricher agent reverification budget | 4 hours | Medium |
| Prediction engine decay integration | 4 hours | High |
| API endpoints (7 routes) | 4 hours | Medium |
| UI: freshness indicators on contact/property detail | 1 day | Medium |
| UI: freshness dashboard in settings | 4 hours | Low |
| **Total** | **~4.5 days** | |

---

<a id="prompt-43"></a>
## PROMPT 43: Feature Importance & Sensitivity Analysis

### Current State Analysis

The predictive scoring engine (Prompt 35) uses static domain-knowledge weights:

**Current sale prediction weights (from Prompt 35 Section 35.4):**
```
ownership_momentum: 0.25
financial_pressure: 0.25
tenant_activity:    0.20
market_context:     0.15
relationship_signal: 0.15
```

These are educated guesses. After the system accumulates outcome data, it should be able to answer: "Were these weights right? Which features actually predicted transactions?"

**What's missing:**

| Gap | Impact |
|-----|--------|
| **No feature-level tracking** | System tracks composite scores but not individual feature contributions over time |
| **No outcome correlation** | No measurement of which features actually correlated with transactions |
| **No submarket variation** | Ontario industrial may have different predictive signals than Riverside office |
| **No adaptive learning** | Weights never change based on evidence |
| **No marginal value of information** | Can't answer "which data should I pursue to improve predictions the most?" |

### Proposed Design

#### 43.1 -- Static Feature Importance (Baseline)

These are the domain-knowledge starting weights. They represent David's decades of CRE experience encoded as priors.

**SALE Prediction Features (10 features, weights sum to 100%):**

| Rank | Feature Name | Description | Baseline Weight | Rationale |
|------|-------------|-------------|-----------------|-----------|
| 1 | `owner_hold_duration` | Years since acquisition (>10 years = higher probability) | 18% | Long-held properties are in the disposition window; owners have maximum capital gains to optimize |
| 2 | `loan_maturity_proximity` | Months until loan maturity | 15% | Hard deadline that forces refinance-or-sell decision |
| 3 | `owner_age` | Owner age (>65 = succession planning) | 12% | Estate planning is a primary transaction driver in IE |
| 4 | `cap_rate_vs_market` | Property cap rate relative to submarket average | 10% | Below-market cap rate = owner likely holds; above-market = opportunity to sell |
| 5 | `comparable_sales_velocity` | Number of similar sales in submarket last 6 months | 10% | Active comp market signals favorable selling conditions |
| 6 | `property_condition` | Deferred maintenance level | 8% | Poor condition + aging owner = likely to sell rather than reinvest |
| 7 | `tax_assessment_change` | Year-over-year assessment increase percentage | 7% | Large increases squeeze returns, motivate sales |
| 8 | `multi_property_portfolio` | Owner holds multiple properties (selling one to fund another) | 7% | Portfolio rebalancing is a common transaction trigger |
| 9 | `tenant_quality_lease_term` | Tenant credit + remaining lease term | 7% | Strong tenant with long lease = hold; weak tenant = sell |
| 10 | `market_regime` | Buyer's vs. seller's market indicator | 6% | Macro conditions affect timing of disposition decisions |

**LEASE Prediction Features (10 features, weights sum to 100%):**

| Rank | Feature Name | Description | Baseline Weight | Rationale |
|------|-------------|-------------|-----------------|-----------|
| 1 | `lease_expiry_proximity` | Months until current lease expires | 25% | Hardest deadline in CRE -- tenants must act |
| 2 | `tenant_growth_signals` | Headcount growth, hiring patterns, expansion news | 15% | Growing companies need more space |
| 3 | `space_utilization` | Current space usage relative to capacity | 12% | Overcrowded = expansion; underused = downsize |
| 4 | `comparable_lease_rates` | Current rent vs. market rate | 10% | Below-market rent = likely renewal; above-market = relocation risk |
| 5 | `tenant_industry_health` | Industry sector growth/decline trends | 10% | Healthy industry = expansion; declining = contraction |
| 6 | `building_class_match` | Building quality relative to tenant needs | 8% | Mismatch drives relocation |
| 7 | `submarket_vacancy_trend` | Vacancy rate direction in submarket | 8% | Tight market = fewer options = likely renewal; loose = relocation opportunity |
| 8 | `landlord_flexibility` | Landlord willingness to negotiate (from interaction history) | 5% | Flexible landlord = renewal; rigid = relocation |
| 9 | `tenant_credit_changes` | Credit rating direction | 4% | Deteriorating credit = risk of default/early termination |
| 10 | `geographic_expansion` | Tenant opening locations in new markets | 3% | Multi-market expansion signals new leasing activity |

#### 43.2 -- Feature Importance Tables

```sql
-- Migration 010c: Feature Importance & Sensitivity Analysis

-- Feature importance tracking (evolving weights)
CREATE TABLE IF NOT EXISTS feature_importance (
    id                      SERIAL PRIMARY KEY,
    feature_name            TEXT NOT NULL,
    transaction_type        TEXT NOT NULL CHECK (transaction_type IN ('sale', 'lease', 'both')),
    property_type           TEXT DEFAULT 'all',
    -- e.g. 'industrial', 'office', 'retail', 'all'
    submarket               TEXT DEFAULT 'all',
    -- e.g. 'ontario', 'fontana', 'riverside', 'san_bernardino', 'all'

    -- Weight values
    current_weight          NUMERIC(6,4) NOT NULL,
    -- Current active weight (starts as baseline, evolves with data)
    baseline_weight         NUMERIC(6,4) NOT NULL,
    -- Original domain-knowledge weight (never changes, for reference)
    previous_weight         NUMERIC(6,4),
    -- Weight before last recalculation (for tracking drift)

    -- Statistical backing
    last_recalculated       TIMESTAMPTZ,
    sample_size             INTEGER DEFAULT 0,
    -- Number of outcomes used in last recalculation
    statistical_significance NUMERIC(5,4),
    -- p-value from correlation test (< 0.05 = significant)
    correlation_with_outcome NUMERIC(5,4),
    -- Pearson correlation between feature value and transaction outcome
    predictive_lift         NUMERIC(6,2),
    -- How much better is prediction with this feature vs. without?
    -- e.g. 2.5 = predictions are 2.5x better with this feature

    -- Constraints
    weight_floor            NUMERIC(6,4) DEFAULT 0.02,
    -- Minimum allowed weight (no feature drops below 2%)
    weight_ceiling          NUMERIC(6,4) DEFAULT 0.30,
    -- Maximum allowed weight (no feature exceeds 30%)

    -- Metadata
    model_version           TEXT,
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_feature_importance_unique
    ON feature_importance(feature_name, transaction_type, property_type, submarket);
CREATE INDEX idx_feature_importance_weight
    ON feature_importance(current_weight DESC);
CREATE INDEX idx_feature_importance_type
    ON feature_importance(transaction_type);

-- Feature sensitivity per prediction (how much does each feature move the needle?)
CREATE TABLE IF NOT EXISTS feature_sensitivity (
    id                      BIGSERIAL PRIMARY KEY,
    prediction_id           UUID NOT NULL,
    -- References predictive_scores.id
    feature_name            TEXT NOT NULL,

    -- Current state
    current_value           NUMERIC(12,4),
    current_value_text      TEXT,
    -- For non-numeric features (e.g. property_condition = 'poor')

    -- Sensitivity analysis
    sensitivity_coefficient NUMERIC(8,6),
    -- How much does prediction change per unit change in this feature?
    -- e.g. 0.015 = prediction moves 1.5% per unit increase

    marginal_value_of_information NUMERIC(8,6),
    -- If this feature's value were known with perfect confidence,
    -- how much would overall prediction confidence improve?
    -- Computed as: sensitivity_coefficient x (1 - current_data_confidence)

    -- What-if bounds
    value_if_bullish        NUMERIC(12,4),
    -- Best-case value for this feature
    prediction_if_bullish   NUMERIC(5,4),
    -- What prediction would be at best-case value
    value_if_bearish        NUMERIC(12,4),
    -- Worst-case value for this feature
    prediction_if_bearish   NUMERIC(5,4),
    -- What prediction would be at worst-case value

    -- Data quality
    data_confidence         NUMERIC(5,4),
    -- Current confidence in this feature's value (from field_timestamps decay)
    data_age_days           INTEGER,
    -- Days since this feature's underlying data was verified

    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feature_sensitivity_prediction ON feature_sensitivity(prediction_id);
CREATE INDEX idx_feature_sensitivity_feature ON feature_sensitivity(feature_name);
CREATE INDEX idx_feature_sensitivity_mvoi
    ON feature_sensitivity(marginal_value_of_information DESC);

-- Weight change history (audit trail of how weights evolved)
CREATE TABLE IF NOT EXISTS feature_weight_history (
    id                      SERIAL PRIMARY KEY,
    feature_name            TEXT NOT NULL,
    transaction_type        TEXT NOT NULL,
    property_type           TEXT DEFAULT 'all',
    submarket               TEXT DEFAULT 'all',

    -- Change details
    old_weight              NUMERIC(6,4) NOT NULL,
    new_weight              NUMERIC(6,4) NOT NULL,
    change_reason           TEXT NOT NULL,
    -- e.g. 'monthly_recalculation', 'manual_override', 'constraint_applied'

    -- Evidence
    sample_size             INTEGER,
    correlation_evidence    NUMERIC(5,4),
    significance_level      NUMERIC(5,4),

    -- Approval
    auto_applied            BOOLEAN DEFAULT FALSE,
    -- TRUE if change was within guardrails and auto-applied
    -- FALSE if change required David's review
    approved_by             TEXT,
    approved_at             TIMESTAMPTZ,

    model_version           TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_weight_history_feature ON feature_weight_history(feature_name);
CREATE INDEX idx_weight_history_created ON feature_weight_history(created_at);
```

#### 43.3 -- "If I Had Perfect Data" Analysis

For any entity, compute which missing or low-confidence data fields would improve predictions the most:

```
PERFECT DATA ANALYSIS for Property X:

1. Get current prediction: prob_6mo = 0.45, using 7 of 10 features

2. For each feature:
   a. If feature has data (confidence > 0):
      - Compute: prediction improvement if confidence were 1.0
      - improvement = sensitivity_coefficient x (1.0 - current_confidence)

   b. If feature has NO data:
      - Compute: prediction improvement if feature were available
      - Use average feature value for this property type/submarket as proxy
      - improvement = sensitivity_coefficient x expected_information_gain

3. Rank features by marginal value of information (MVOI):
   - MVOI = improvement x prediction.ev_6mo
   - This converts abstract accuracy improvement into dollar value

4. Output:
   "If you had perfect data on just these 5 fields, prediction accuracy would
    improve by approximately 12%:
    1. Property condition assessment (MVOI: $2,400) -- requires drive-by
    2. Owner age verification (MVOI: $1,800) -- requires county records
    3. Current NOI (MVOI: $1,200) -- requires owner conversation
    4. Tenant headcount (MVOI: $900) -- requires LinkedIn research
    5. Comparable lease rates (MVOI: $600) -- requires CoStar lookup"
```

**This directly drives the Data Bounty system:** The highest-MVOI fields become the highest-priority bounties. The Enricher agent knows exactly which data to pursue for maximum prediction improvement.

#### 43.4 -- Adaptive Weight Learning

**Phase 1 (Months 1-6): Domain Knowledge Only**
- Use baseline weights from Section 43.1
- No adjustments -- insufficient outcome data
- Track all predictions and outcomes for future analysis

**Phase 2 (Months 7-12): Begin Learning, With Guardrails**

After accumulating 100+ expired predictions with known outcomes:

```
MONTHLY WEIGHT RECALCULATION (runs 1st of each month, 4:00 AM):

1. Pull all prediction_outcomes where:
   - prediction_date is 6-18 months ago (enough time for outcome)
   - actual_outcome != 'unknown' and actual_outcome != 'pending'
   - Sample size >= 100

2. For each feature:
   a. Compute correlation between feature value and actual_outcome
      - Use point-biserial correlation (continuous feature vs. binary outcome)
   b. Compute statistical significance (p-value)
   c. If p < 0.10 (somewhat significant) AND sample_size >= 50:
      - Compute suggested_weight = normalize(correlation) across all features
      - Apply guardrails:
        * Max single adjustment: +/- 3% per month
        * No feature below weight_floor (2%)
        * No feature above weight_ceiling (30%)
        * All weights must sum to 100%
      - If adjustment is within +/- 3%: auto-apply
      - If adjustment exceeds 3%: queue for David's review

3. Log all changes to feature_weight_history

4. Generate monthly report for Chief of Staff briefing:
   "FEATURE WEIGHT UPDATE -- March 2026

    SALE predictions:
    - owner_hold_duration: 18% -> 19.5% (+1.5%, auto-applied)
      Evidence: 22% correlation with outcomes, p=0.02, n=134
    - loan_maturity_proximity: 15% -> 17% (+2%, auto-applied)
      Evidence: 28% correlation, p=0.008, n=134
    - owner_age: 12% -> 10.5% (-1.5%, auto-applied)
      Evidence: 8% correlation, p=0.15, n=134
      Note: weaker than expected -- may be confounded with hold duration

    LEASE predictions:
    - lease_expiry_proximity: 25% -> 23% (-2%, auto-applied)
      Evidence: Still strongest feature but Ontario submarket shows
      tenant_growth_signals is actually more predictive there

    SUBMARKET INSIGHT:
    - Ontario industrial: tenant_growth_signals (19%) outperforms
      lease_expiry_proximity (18%) -- unique to this submarket
    - Fontana industrial: owner_hold_duration (24%) is significantly
      more predictive than system-wide average (19.5%)"
```

**Phase 3 (Month 13+): Full Adaptive Learning**

After 200+ outcomes:
- Per-submarket weight adjustments (Ontario vs. Fontana vs. Riverside)
- Per-property-type adjustments (industrial vs. office vs. retail)
- Seasonal adjustments (Q1 vs. Q4 transaction patterns)
- Guardrails remain (2%-30% range, max 3% monthly change)

#### 43.5 -- Submarket Weight Variation

The system maintains separate weight sets when sufficient local data exists:

```
WEIGHT HIERARCHY:

1. Submarket + Property Type specific (e.g., "ontario_industrial")
   - Requires: 50+ outcomes in this segment
   - Falls back to level 2 if insufficient data

2. Property Type specific (e.g., "industrial")
   - Requires: 100+ outcomes for this property type
   - Falls back to level 3 if insufficient data

3. System-wide (e.g., "all")
   - Always available (uses all outcomes)
   - Starts with domain-knowledge baseline

The prediction engine uses the most specific weight set available:
  IF feature_importance WHERE submarket='ontario' AND property_type='industrial' EXISTS
     AND sample_size >= 50:
    USE submarket-specific weights
  ELSE IF feature_importance WHERE submarket='all' AND property_type='industrial' EXISTS
     AND sample_size >= 100:
    USE property-type-specific weights
  ELSE:
    USE system-wide weights
```

#### 43.6 -- API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/feature-importance?transaction_type=sale&property_type=industrial` | Get current feature weights |
| `GET` | `/api/feature-importance/history?feature=owner_hold_duration` | Weight change history for a feature |
| `GET` | `/api/predictions/:id/sensitivity` | Sensitivity analysis for a specific prediction |
| `GET` | `/api/entities/:type/:id/perfect-data` | "If I had perfect data" analysis |
| `GET` | `/api/feature-importance/submarket-report` | Submarket weight variation report |
| `POST` | `/api/feature-importance/:id/override` | Manual weight override (David only) |
| `GET` | `/api/feature-importance/monthly-report` | Latest monthly weight change report |

### Priority and Effort

| Component | Effort | Priority |
|-----------|--------|----------|
| `feature_importance` table + baseline seed data | 3 hours | High |
| `feature_sensitivity` table | 1 hour | High |
| `feature_weight_history` table | 1 hour | High |
| Sensitivity coefficient computation (integrated with scoring engine) | 4 hours | High |
| "If I had perfect data" analysis engine | 4 hours | Medium |
| Monthly weight recalculation job | 1 day | Medium |
| Submarket weight variation | 4 hours | Low (needs data) |
| Monthly report generation for Chief of Staff | 4 hours | Medium |
| API endpoints (7 routes) | 4 hours | Medium |
| UI: feature importance visualization | 1 day | Low |
| **Total** | **~5 days** | |

---

<a id="prompt-44"></a>
## PROMPT 44: Prediction Calibration & Feedback System

### Current State Analysis

The `prediction_outcomes` table from Prompt 35 stores predicted probabilities and actual outcomes. But there is no infrastructure to:

1. **Measure calibration** -- are predictions at 70% actually happening 70% of the time?
2. **Adjust predictions** -- if 70% predictions are happening only 55% of the time, apply a correction
3. **Track model evolution** -- is the model getting better or worse over time?
4. **Handle cold start** -- what to do in months 1-3 when there are zero outcomes?
5. **Compare approaches** -- run multiple prediction strategies and see which wins

**What's missing:**

| Gap | Impact |
|-----|--------|
| **No calibration metrics** | No Brier score, no calibration curve, no discrimination measurement |
| **No adjustment mechanism** | Over-confident or under-confident predictions go uncorrected |
| **No temporal tracking** | Can't tell if the model is improving or degrading over time |
| **No cold-start labeling** | Predictions in month 1 look the same as predictions in month 12 |
| **No model comparison** | Only one prediction approach runs; no way to test alternatives |
| **No feedback loop to David** | David doesn't know if he should trust the numbers |

### Proposed Design

#### 44.1 -- Calibration Metrics

**Brier Score:**
The gold standard for probabilistic prediction quality.

```
Brier Score = (1/N) x SUM[(predicted_probability - actual_outcome)^2]

WHERE:
  actual_outcome = 1 if transaction occurred, 0 if not

Interpretation:
  0.00 = Perfect predictions
  0.25 = Random guessing (predicting 50% for everything)
  Lower is better

For IE CRM context:
  Base rate ~5% per 6 months means a "predict 5% for everything" strategy scores:
  Brier = 0.05 x (1-0.05)^2 + 0.95 x (0-0.05)^2 = 0.0475

  Any model must beat 0.0475 to be better than always predicting the base rate.
```

**Calibration Error:**
How well do predicted probabilities match actual frequencies?

```
Calibration Error = (1/B) x SUM[|avg_predicted_in_bucket - actual_rate_in_bucket|]

WHERE:
  B = number of probability buckets (typically 10: 0-10%, 10-20%, ..., 90-100%)

Perfect calibration: error = 0 (the 70% bucket has exactly 70% outcomes)
```

**Discrimination (AUC-ROC equivalent):**
Can the model separate transactions from non-transactions?

```
Discrimination = P(predicted_prob for actual transaction > predicted_prob for non-transaction)

Interpretation:
  0.50 = No discrimination (random ordering)
  1.00 = Perfect discrimination (all transactions scored higher than all non-transactions)
  0.70+ = Acceptable
  0.80+ = Good
```

**Resolution:**
Are predictions spread out or clustered?

```
Resolution = Variance of predicted probabilities

Interpretation:
  High variance = predictions are spread (some confident yes, some confident no) = Good
  Low variance = all predictions clustered around 50% = Useless
  Near-zero variance = all predictions are the same number = model is broken
```

#### 44.2 -- Calibration Tables

```sql
-- Migration 010d: Prediction Calibration & Feedback System

-- Enhanced prediction outcomes (extends Prompt 35 table with more detail)
-- Note: If prediction_outcomes already exists from Prompt 35, this ALTER adds columns.
-- If deploying fresh, use the full CREATE below.

CREATE TABLE IF NOT EXISTS prediction_outcomes_v2 (
    id                      SERIAL PRIMARY KEY,
    prediction_id           UUID,
    -- References predictive_scores.id (may be NULL for legacy predictions)
    entity_type             TEXT NOT NULL DEFAULT 'property' CHECK (entity_type IN (
        'property', 'contact', 'company'
    )),
    entity_id               TEXT NOT NULL,

    -- What was predicted
    predicted_probability   NUMERIC(5,4) NOT NULL,
    predicted_horizon_days  INTEGER NOT NULL,
    -- e.g. 90, 180, 365
    predicted_type          TEXT CHECK (predicted_type IN ('sale', 'lease', 'both')),
    prediction_date         DATE NOT NULL,
    model_version           TEXT NOT NULL,
    calibration_status      TEXT DEFAULT 'uncalibrated' CHECK (calibration_status IN (
        'uncalibrated', 'early_calibration', 'calibrated'
    )),

    -- Feature snapshot at time of prediction (for retroactive analysis)
    feature_snapshot        JSONB DEFAULT '{}',
    -- {owner_hold_duration: 22, owner_age: 74, loan_maturity_months: 8, ...}

    -- What actually happened
    actual_outcome          TEXT DEFAULT 'pending' CHECK (actual_outcome IN (
        'transacted', 'not_transacted', 'pending', 'unknown'
    )),
    outcome_date            DATE,
    outcome_type            TEXT CHECK (outcome_type IN (
        'sale', 'lease', 'refinance', 'listing', 'none'
    )),
    time_to_outcome_days    INTEGER,
    -- Days from prediction_date to outcome_date (NULL if pending)
    outcome_details         JSONB DEFAULT '{}',
    -- {sale_price, buyer, lease_rate, commission_earned, etc.}

    -- Prediction expiration
    expires_at              DATE NOT NULL,
    -- prediction_date + predicted_horizon_days
    expired                 BOOLEAN DEFAULT FALSE,
    -- Set TRUE when NOW() > expires_at and outcome resolved

    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pred_outcomes_v2_entity ON prediction_outcomes_v2(entity_type, entity_id);
CREATE INDEX idx_pred_outcomes_v2_date ON prediction_outcomes_v2(prediction_date);
CREATE INDEX idx_pred_outcomes_v2_outcome ON prediction_outcomes_v2(actual_outcome);
CREATE INDEX idx_pred_outcomes_v2_model ON prediction_outcomes_v2(model_version);
CREATE INDEX idx_pred_outcomes_v2_expires ON prediction_outcomes_v2(expires_at);
CREATE INDEX idx_pred_outcomes_v2_expired ON prediction_outcomes_v2(expired);
CREATE INDEX idx_pred_outcomes_v2_status ON prediction_outcomes_v2(calibration_status);
CREATE INDEX idx_pred_outcomes_v2_probability ON prediction_outcomes_v2(predicted_probability);

-- Calibration snapshots (monthly model health report)
CREATE TABLE IF NOT EXISTS calibration_snapshots (
    id                      SERIAL PRIMARY KEY,
    snapshot_date           DATE NOT NULL,
    model_version           TEXT NOT NULL,
    horizon_days            INTEGER NOT NULL,
    -- e.g. 90, 180, 365

    -- Core metrics
    brier_score             NUMERIC(8,6),
    calibration_error       NUMERIC(8,6),
    discrimination_score    NUMERIC(8,6),
    -- AUC-ROC equivalent
    resolution_score        NUMERIC(8,6),
    -- Variance of predictions

    -- Sample details
    sample_size             INTEGER NOT NULL,
    transaction_count       INTEGER NOT NULL,
    -- How many actually transacted
    base_rate               NUMERIC(5,4),
    -- transaction_count / sample_size

    -- Baseline comparison
    brier_score_baseline    NUMERIC(8,6),
    -- Brier score of "always predict base rate" strategy
    skill_score             NUMERIC(8,6),
    -- 1 - (brier_score / brier_score_baseline), >0 = model adds value

    -- Breakdown by property type
    property_type_breakdown JSONB DEFAULT '{}',
    -- {"industrial": {"brier": 0.03, "n": 89}, "office": {"brier": 0.05, "n": 34}}

    -- Breakdown by probability bucket
    calibration_curve       JSONB DEFAULT '[]',
    -- [{"bucket": "0-10%", "avg_predicted": 0.05, "actual_rate": 0.04, "n": 234},
    --  {"bucket": "10-20%", "avg_predicted": 0.15, "actual_rate": 0.12, "n": 67}, ...]

    -- Trend
    previous_brier_score    NUMERIC(8,6),
    brier_trend             TEXT CHECK (brier_trend IN ('improving', 'stable', 'degrading')),

    -- Alert flags
    alert_calibration_drift BOOLEAN DEFAULT FALSE,
    -- TRUE if calibration error increased >50% from previous snapshot
    alert_discrimination_loss BOOLEAN DEFAULT FALSE,
    -- TRUE if discrimination dropped below 0.60
    alert_resolution_collapse BOOLEAN DEFAULT FALSE,
    -- TRUE if resolution dropped below 0.01 (predictions all clustered)

    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_calibration_snapshots_unique
    ON calibration_snapshots(snapshot_date, model_version, horizon_days);
CREATE INDEX idx_calibration_snapshots_date ON calibration_snapshots(snapshot_date);
CREATE INDEX idx_calibration_snapshots_model ON calibration_snapshots(model_version);

-- Calibration adjustments (correction factors applied to raw predictions)
CREATE TABLE IF NOT EXISTS calibration_adjustments (
    id                      SERIAL PRIMARY KEY,
    adjustment_date         DATE NOT NULL,
    model_version           TEXT NOT NULL,
    horizon_days            INTEGER NOT NULL,

    -- Which probability bucket this adjusts
    probability_bucket_low  NUMERIC(5,4) NOT NULL,
    -- e.g. 0.60
    probability_bucket_high NUMERIC(5,4) NOT NULL,
    -- e.g. 0.70
    bucket_label            TEXT,
    -- e.g. "60-70%"

    -- What was observed
    raw_prediction_avg      NUMERIC(5,4) NOT NULL,
    -- Average predicted probability in this bucket
    actual_outcome_rate     NUMERIC(5,4) NOT NULL,
    -- Actual transaction rate in this bucket
    sample_size             INTEGER NOT NULL,

    -- Correction
    adjustment_factor       NUMERIC(6,4) NOT NULL,
    -- Multiply raw prediction by this to get calibrated prediction
    -- e.g. if 70% predictions are actually 55%, factor = 55/70 = 0.786
    adjustment_type         TEXT CHECK (adjustment_type IN (
        'deflation', 'inflation', 'none'
    )),

    -- Validity period
    applied_from            DATE NOT NULL,
    applied_until           DATE,
    -- NULL = currently active
    active                  BOOLEAN DEFAULT TRUE,

    -- Approval
    auto_applied            BOOLEAN DEFAULT FALSE,
    approved_by             TEXT,
    notes                   TEXT,

    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_calibration_adjustments_active
    ON calibration_adjustments(active) WHERE active = TRUE;
CREATE INDEX idx_calibration_adjustments_model
    ON calibration_adjustments(model_version, horizon_days);
CREATE INDEX idx_calibration_adjustments_bucket
    ON calibration_adjustments(probability_bucket_low, probability_bucket_high);

-- Prediction tournaments (compare multiple approaches)
CREATE TABLE IF NOT EXISTS prediction_tournaments (
    id                      SERIAL PRIMARY KEY,
    tournament_name         TEXT NOT NULL,
    -- e.g. "Q1-2026-sale-6mo"
    description             TEXT,

    -- Configuration
    horizon_days            INTEGER NOT NULL,
    transaction_type        TEXT CHECK (transaction_type IN ('sale', 'lease', 'both')),
    start_date              DATE NOT NULL,
    end_date                DATE,
    -- NULL = ongoing
    status                  TEXT DEFAULT 'active' CHECK (status IN (
        'active', 'completed', 'cancelled'
    )),

    -- Results (updated as outcomes arrive)
    results                 JSONB DEFAULT '{}',
    -- {"approaches": [
    --   {"name": "domain_weights_v1", "brier": 0.042, "n": 134, "rank": 1},
    --   {"name": "equal_weights", "brier": 0.048, "n": 134, "rank": 2},
    --   {"name": "adaptive_weights_v1", "brier": 0.039, "n": 134, "rank": 0}
    -- ]}

    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tournaments_status ON prediction_tournaments(status);
CREATE INDEX idx_tournaments_dates ON prediction_tournaments(start_date, end_date);

-- Tournament entries (individual predictions from different approaches)
CREATE TABLE IF NOT EXISTS tournament_entries (
    id                      BIGSERIAL PRIMARY KEY,
    tournament_id           INTEGER REFERENCES prediction_tournaments(id) ON DELETE CASCADE,
    approach_name           TEXT NOT NULL,
    -- e.g. "domain_weights_v1", "adaptive_weights_v1", "equal_weights"
    entity_type             TEXT NOT NULL,
    entity_id               TEXT NOT NULL,

    -- Prediction
    predicted_probability   NUMERIC(5,4) NOT NULL,
    feature_weights_used    JSONB DEFAULT '{}',
    -- Snapshot of weights this approach used
    prediction_date         DATE NOT NULL,

    -- Outcome (filled in when known)
    actual_outcome          TEXT DEFAULT 'pending' CHECK (actual_outcome IN (
        'transacted', 'not_transacted', 'pending', 'unknown'
    )),
    squared_error           NUMERIC(8,6),
    -- (predicted_probability - actual_outcome_binary)^2

    created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tournament_entries_tournament ON tournament_entries(tournament_id);
CREATE INDEX idx_tournament_entries_approach ON tournament_entries(approach_name);
CREATE INDEX idx_tournament_entries_outcome ON tournament_entries(actual_outcome);
CREATE INDEX idx_tournament_entries_entity ON tournament_entries(entity_type, entity_id);
```

#### 44.3 -- Calibration Workflow

**Step 1: Prediction Lifecycle Tracking**

Every prediction gets an expiration date:
```
expires_at = prediction_date + predicted_horizon_days

Example:
  Predicted on 2026-03-13 with 180-day horizon
  Expires on 2026-09-09
  On 2026-09-10, check: did this property transact between March and September?
```

**Step 2: Outcome Detection (Nightly, 3:00 AM)**

```
OUTCOME DETECTION JOB:

1. Find all prediction_outcomes_v2 WHERE expired = FALSE AND expires_at < NOW():
   -- These predictions have reached their horizon

2. For each expired prediction:
   a. Check deals table: was a deal created for this property since prediction_date?
   b. Check sale comps: was a sale recorded for this property since prediction_date?
   c. Check interactions: was a "listing taken" interaction logged?

   IF transaction found:
     UPDATE SET actual_outcome = 'transacted',
                outcome_date = deal.created_at (or sale date),
                outcome_type = deal.deal_type,
                time_to_outcome_days = outcome_date - prediction_date,
                expired = TRUE
   ELSE:
     UPDATE SET actual_outcome = 'not_transacted',
                expired = TRUE

3. Log: "Outcome detection: 45 predictions expired. 7 transacted (15.6%),
         38 did not (84.4%). Base rate: 5%."
```

**Step 3: Monthly Calibration Analysis (1st of each month, 5:00 AM)**

```
MONTHLY CALIBRATION JOB:

1. Pull all prediction_outcomes_v2 WHERE expired = TRUE
   AND actual_outcome IN ('transacted', 'not_transacted')
   AND prediction_date >= NOW() - INTERVAL '12 months'

2. Compute Brier Score:
   brier = AVG((predicted_probability - CASE WHEN actual_outcome = 'transacted'
                THEN 1 ELSE 0 END)^2)

3. Compute Calibration Curve (10 buckets):
   FOR bucket IN [0-10%, 10-20%, ..., 90-100%]:
     avg_predicted = AVG(predicted_probability) WHERE prob IN bucket
     actual_rate = COUNT(transacted) / COUNT(*) WHERE prob IN bucket
     n = COUNT(*) WHERE prob IN bucket

4. Compute Discrimination:
   -- Simplified: compare average predicted prob for transacted vs. not-transacted
   avg_prob_transacted = AVG(predicted_probability) WHERE actual_outcome = 'transacted'
   avg_prob_not_transacted = AVG(predicted_probability) WHERE actual_outcome = 'not_transacted'
   discrimination = (avg_prob_transacted - avg_prob_not_transacted) /
                    MAX(avg_prob_transacted, avg_prob_not_transacted)
   -- Normalized to 0-1 range

5. Compute Resolution:
   resolution = VARIANCE(predicted_probability)

6. Compute Skill Score:
   brier_baseline = base_rate x (1 - base_rate)^2 + (1 - base_rate) x base_rate^2
   skill_score = 1 - (brier / brier_baseline)
   -- >0 = model adds value, <0 = worse than base rate

7. Store in calibration_snapshots

8. Check alerts:
   IF calibration_error increased >50% from previous month: alert_calibration_drift = TRUE
   IF discrimination < 0.60: alert_discrimination_loss = TRUE
   IF resolution < 0.01: alert_resolution_collapse = TRUE

9. If any alerts fire, post to agent_priority_board:
   target_agent = 'chief_of_staff'
   priority_type = 'urgent_review'
   reason = "Prediction model calibration degrading -- {alert_details}"
```

**Step 4: Calibration Adjustment Application**

When the calibration curve shows systematic bias:

```
CALIBRATION ADJUSTMENT LOGIC:

FOR each probability bucket with sample_size >= 20:
  IF |avg_predicted - actual_rate| > 0.05 (5% miscalibration):

    adjustment_factor = actual_rate / avg_predicted

    IF adjustment_factor < 1.0:
      adjustment_type = 'deflation'  -- model is over-confident
    ELSE:
      adjustment_type = 'inflation'  -- model is under-confident

    IF |1.0 - adjustment_factor| <= 0.20 (within 20%):
      auto_apply = TRUE  -- small adjustment, auto-apply
    ELSE:
      auto_apply = FALSE  -- large adjustment, needs David's review

    INSERT INTO calibration_adjustments (
      probability_bucket_low, probability_bucket_high,
      raw_prediction_avg, actual_outcome_rate,
      adjustment_factor, adjustment_type,
      auto_applied, applied_from
    )

APPLYING ADJUSTMENTS to new predictions:
  raw_prediction = scoring_engine output (e.g. 0.72)

  Find active adjustment for this bucket:
  SELECT adjustment_factor FROM calibration_adjustments
  WHERE active = TRUE
    AND raw_prediction BETWEEN probability_bucket_low AND probability_bucket_high

  calibrated_prediction = raw_prediction x adjustment_factor
  calibrated_prediction = CLAMP(calibrated_prediction, 0.01, 0.99)
```

#### 44.4 -- Cold Start Phases

The system must behave differently based on how much outcome data exists:

| Phase | Time Period | Expired Predictions | Behavior | Label |
|-------|-----------|---------------------|----------|-------|
| **Cold Start** | Months 1-3 | 0-50 | Domain knowledge weights only. No calibration adjustments. All predictions marked "uncalibrated". UI shows: "Predictions are based on domain expertise. Accuracy will improve as outcomes accumulate." | `uncalibrated` |
| **Early Calibration** | Months 4-6 | 50-200 | Begin computing calibration metrics but with wide confidence intervals. Adjustments computed but NOT auto-applied (David must approve). UI shows: "Early calibration phase -- predictions are improving. {n} outcomes analyzed so far." | `early_calibration` |
| **Calibrated** | Months 7+ | 200+ | Full calibration with auto-application of small adjustments. Narrowing confidence intervals. UI shows: "Calibrated model (Brier: {score}, Skill: {score}). Based on {n} historical outcomes." | `calibrated` |

**Transitioning between phases:**

```sql
-- Determine current calibration phase
SELECT
    CASE
        WHEN COUNT(*) < 50 THEN 'uncalibrated'
        WHEN COUNT(*) < 200 THEN 'early_calibration'
        ELSE 'calibrated'
    END AS current_phase,
    COUNT(*) AS total_outcomes
FROM prediction_outcomes_v2
WHERE expired = TRUE
  AND actual_outcome IN ('transacted', 'not_transacted');
```

New predictions inherit the current phase as their `calibration_status`.

#### 44.5 -- Prediction Tournaments

Run multiple prediction approaches in parallel to discover which works best:

**Default Tournament Approaches:**

| Approach Name | Description | Feature Weights |
|---------------|-------------|-----------------|
| `domain_weights_v1` | David's domain knowledge baseline | Static weights from Section 43.1 |
| `equal_weights` | All features weighted equally | 10% each (10 features) |
| `adaptive_weights_latest` | Most recent adaptive weights from monthly recalculation | Dynamic, from `feature_importance` table |
| `top3_only` | Only use the top 3 features by baseline weight | Concentrated on top 3, zero for rest |
| `stress_heavy` | Overweight financial stress signals | 2x weight on loan_maturity, tax_assessment, cap_rate |

**Tournament Lifecycle:**

```
1. CREATION (automatic, quarterly):
   - Create tournament for each horizon (90, 180, 365 days)
   - Name: "{quarter}-{year}-{type}-{horizon}d"
   - e.g. "Q2-2026-sale-180d"

2. PREDICTION (nightly, during scoring run):
   - For each property, run all active approaches
   - Store each approach's prediction in tournament_entries
   - Only the PRIMARY approach (currently active winner) is stored
     in predictive_scores for David to see

3. OUTCOME (as predictions expire):
   - Mark outcomes in tournament_entries same as prediction_outcomes_v2
   - Compute squared_error for each entry

4. SCORING (monthly, during calibration):
   - For each tournament:
     - Compute Brier score per approach
     - Rank approaches
     - Store in tournament.results JSONB

5. WINNER SELECTION (quarterly):
   - If an approach has beaten the current primary for 2+ consecutive months
     AND its Brier score is at least 10% better
     AND sample_size >= 100:
     -> Recommend switching primary approach
     -> Requires David's approval (significant model change)

6. CHIEF OF STAFF REPORT:
   "PREDICTION TOURNAMENT UPDATE:
    Current primary: domain_weights_v1 (Brier: 0.042)
    Challenger: adaptive_weights_latest (Brier: 0.038, -9.5%)
    Note: adaptive weights approaching promotion threshold.
    2 more months of outperformance needed."
```

#### 44.6 -- Calibration Drift Detection

The system watches for its own degradation:

```
DRIFT DETECTION (monthly):

1. Compare current month's Brier score to 3-month rolling average
2. If current > rolling_avg x 1.25 (25% worse):
   ALERT: "Prediction model degradation detected"

3. Check for specific failure modes:
   a. Overconfidence drift: avg predicted prob increasing but actual rate stable
      -> Likely cause: feature values inflating without outcomes to anchor them
      -> Fix: apply deflation adjustment

   b. Discrimination collapse: avg_prob_transacted - avg_prob_not_transacted shrinking
      -> Likely cause: features losing predictive power (market regime change)
      -> Fix: trigger weight recalculation, consider new features

   c. Resolution collapse: variance of predictions shrinking
      -> Likely cause: all properties scoring similarly (model not differentiating)
      -> Fix: check for data quality issues, stale features

   d. Base rate shift: actual transaction rate changing significantly
      -> Likely cause: market conditions changed (recession, boom)
      -> Fix: update market_regime feature, recalibrate

4. For each detected issue, generate specific remediation recommendation
   and post to agent_priority_board for Chief of Staff
```

#### 44.7 -- Feedback Loop to David

**Monthly Calibration Report (Chief of Staff Briefing):**

```
PREDICTION MODEL HEALTH -- March 2026

OVERALL:
  Brier Score: 0.038 (vs. 0.0475 baseline = 20% better than random)
  Skill Score: 0.20 (model adds meaningful value)
  Phase: early_calibration (147 outcomes analyzed, need 200 for full calibration)

CALIBRATION CURVE:
  0-10% bucket: predicted 5.2%, actual 4.1% (well calibrated, n=234)
  10-20% bucket: predicted 14.8%, actual 11.3% (slightly overconfident, n=67)
  20-30% bucket: predicted 24.1%, actual 19.5% (overconfident, n=34)
  30-50% bucket: predicted 38.2%, actual 32.0% (overconfident, n=18)
  50%+ bucket: predicted 62.5%, actual 50.0% (overconfident, n=4)

  TREND: Model is systematically overconfident by ~20% in upper buckets.
  ADJUSTMENT: Applying 0.85x deflation factor to predictions above 20%.

TOP HITS (predictions that were right):
  1. 15840 Valley Blvd, Fontana -- predicted 45% sale, SOLD in month 4
  2. 9800 6th St, Rancho Cucamonga -- predicted 38% lease, LEASED in month 3
  3. 2200 S Vineyard Ave, Ontario -- predicted 62% sale, LISTED in month 5

TOP MISSES (highest-confidence wrong predictions):
  1. 7700 Milliken Ave, Rancho Cucamonga -- predicted 55% sale, no activity
     Analysis: Owner refinanced instead of selling (loan maturity signal was misleading)
  2. 4400 E 4th St, Ontario -- predicted 48% lease, tenant renewed directly
     Analysis: Landlord relationship signal was not captured (direct renewal, no broker)

RECOMMENDATION:
  Model is useful but overconfident. Deflation adjustments auto-applied.
  Need 53 more outcomes to reach full calibration phase.
  Estimated: May 2026 at current prediction volume.
```

#### 44.8 -- API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/calibration/current` | Latest calibration snapshot + phase |
| `GET` | `/api/calibration/history?months=12` | Calibration metric history |
| `GET` | `/api/calibration/curve` | Current calibration curve (predicted vs. actual by bucket) |
| `GET` | `/api/calibration/adjustments?active=true` | Active calibration adjustments |
| `POST` | `/api/calibration/adjustments/:id/approve` | David approves a pending adjustment |
| `GET` | `/api/calibration/drift-alerts` | Active drift alerts |
| `GET` | `/api/tournaments?status=active` | Active prediction tournaments |
| `GET` | `/api/tournaments/:id/results` | Tournament results with approach rankings |
| `GET` | `/api/calibration/report` | Monthly calibration report (formatted for briefing) |

### Priority and Effort

| Component | Effort | Priority |
|-----------|--------|----------|
| `prediction_outcomes_v2` table (enhanced from Prompt 35) | 2 hours | High |
| `calibration_snapshots` table | 1 hour | High |
| `calibration_adjustments` table | 1 hour | High |
| Outcome detection nightly job | 4 hours | High |
| Monthly calibration computation job | 1 day | High |
| Calibration adjustment auto-application | 4 hours | Medium |
| Cold start phase management | 2 hours | High |
| `prediction_tournaments` + `tournament_entries` tables | 2 hours | Low |
| Tournament scoring engine | 1 day | Low |
| Drift detection alerts | 4 hours | Medium |
| Monthly calibration report generation | 4 hours | Medium |
| API endpoints (9 routes) | 4 hours | Medium |
| UI: calibration dashboard | 1 day | Low |
| **Total** | **~6 days** | |

---

<a id="new-tables"></a>
## New Tables Summary

### Prompt 41: Prediction Explanation & Actionability Engine

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `explanation_templates` | Zero-cost template engine for natural-language explanations | template_type, template_text, required_fields, property_types_applicable |
| `feature_reason_phrases` | Maps raw features to human-readable phrases | feature_name, reason_template, value_format, value_thresholds |
| `prediction_explanations` | Generated explanations for each prediction | prediction_id, explanation_text, data_points_used, action_recommended, sensitivity_data |
| `action_recommendations` | Actionable outputs from predictions | prediction_id, action_type, target_person, optimal_date, urgency_score, delay_cost_estimate, status |

### Prompt 42: Data Freshness & Decay Modeling

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `data_freshness_rules` | Configurable decay parameters per field type | field_name, entity_type, half_life_days, stale_threshold_days, dead_threshold_days, reverification_method |
| `field_timestamps` | Field-level verification tracking with computed decay | entity_type, entity_id, field_name, last_verified_at, current_decay_factor, freshness_state |
| `reverification_queue` | Priority queue for stale data refresh | entity_type, entity_id, field_name, priority_score, assigned_to, status |

### Prompt 43: Feature Importance & Sensitivity Analysis

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `feature_importance` | Evolving feature weights (starts with domain knowledge, adapts) | feature_name, transaction_type, current_weight, baseline_weight, correlation_with_outcome, statistical_significance |
| `feature_sensitivity` | Per-prediction sensitivity coefficients | prediction_id, feature_name, sensitivity_coefficient, marginal_value_of_information |
| `feature_weight_history` | Audit trail of weight changes | feature_name, old_weight, new_weight, change_reason, sample_size, auto_applied |

### Prompt 44: Prediction Calibration & Feedback System

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `prediction_outcomes_v2` | Enhanced prediction tracking with feature snapshots | prediction_id, predicted_probability, predicted_horizon_days, actual_outcome, calibration_status, feature_snapshot |
| `calibration_snapshots` | Monthly model health metrics | brier_score, calibration_error, discrimination_score, resolution_score, skill_score, calibration_curve |
| `calibration_adjustments` | Correction factors for systematic bias | probability_bucket, adjustment_factor, adjustment_type, active |
| `prediction_tournaments` | Multi-approach comparison framework | tournament_name, horizon_days, status, results |
| `tournament_entries` | Individual predictions from competing approaches | tournament_id, approach_name, predicted_probability, actual_outcome, squared_error |

**Total new tables: 14**

---

<a id="migration-sql"></a>
## Migration SQL

All tables are defined in their respective prompt sections above. The migration file should be:

```
ie-crm/migrations/010_prediction_intelligence.sql
```

Split into four labeled sections:
- `010a` -- Explanation Engine (4 tables)
- `010b` -- Data Freshness (3 tables)
- `010c` -- Feature Importance (3 tables)
- `010d` -- Calibration System (5 tables, including tournament tables)

All tables use `IF NOT EXISTS` guards for idempotent re-runs.

---

<a id="api-endpoints"></a>
## API Endpoints Summary

### Prompt 41 Endpoints (7 routes)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/predictions/:id/explanation` | Explanation for a prediction |
| `GET` | `/api/entities/:type/:id/predictions` | All predictions + explanations for an entity |
| `GET` | `/api/predictions/:id/sensitivity` | Sensitivity / what-would-change panel |
| `GET` | `/api/action-recommendations` | David's action queue |
| `PATCH` | `/api/action-recommendations/:id` | Update action status |
| `GET` | `/api/action-recommendations/dashboard` | Action summary metrics |
| `POST` | `/api/predictions/:id/what-if` | Run what-if scenario |

### Prompt 42 Endpoints (7 routes)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/freshness/:entity_type/:entity_id` | Entity freshness state |
| `GET` | `/api/freshness/summary` | System-wide freshness dashboard |
| `GET` | `/api/reverification-queue` | Reverification queue |
| `PATCH` | `/api/reverification-queue/:id` | Update reverification status |
| `POST` | `/api/freshness/:entity_type/:entity_id/:field_name/verify` | Manual verification |
| `GET` | `/api/freshness/rules` | View decay rules |
| `PATCH` | `/api/freshness/rules/:id` | Update a decay rule |

### Prompt 43 Endpoints (7 routes)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/feature-importance` | Current feature weights |
| `GET` | `/api/feature-importance/history` | Weight change history |
| `GET` | `/api/predictions/:id/sensitivity` | Prediction sensitivity (shared with P41) |
| `GET` | `/api/entities/:type/:id/perfect-data` | "If I had perfect data" analysis |
| `GET` | `/api/feature-importance/submarket-report` | Submarket weight variations |
| `POST` | `/api/feature-importance/:id/override` | Manual weight override |
| `GET` | `/api/feature-importance/monthly-report` | Monthly weight change report |

### Prompt 44 Endpoints (9 routes)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/calibration/current` | Latest calibration snapshot |
| `GET` | `/api/calibration/history` | Metric history over time |
| `GET` | `/api/calibration/curve` | Calibration curve data |
| `GET` | `/api/calibration/adjustments` | Active adjustments |
| `POST` | `/api/calibration/adjustments/:id/approve` | Approve pending adjustment |
| `GET` | `/api/calibration/drift-alerts` | Drift alerts |
| `GET` | `/api/tournaments` | Active tournaments |
| `GET` | `/api/tournaments/:id/results` | Tournament results |
| `GET` | `/api/calibration/report` | Monthly calibration report |

**Total new endpoints: 30** (with 1 shared between P41 and P43)

---

<a id="agent-behaviors"></a>
## Agent Behaviors

### Chief of Staff Agent

**Morning Briefing Additions:**

1. **Action Queue Summary** (from P41):
   - Count of pending actions by urgency level
   - Top action with full context
   - Actions that expired yesterday (missed opportunities)

2. **Data Freshness Alert** (from P42):
   - Count of fields that went stale/dead since yesterday
   - High-value entities with degrading data
   - Reverification queue size

3. **Feature Weight Updates** (from P43):
   - Monthly weight change summary (when recalculated)
   - Submarket insights (when discovered)

4. **Calibration Health** (from P44):
   - Current Brier score and trend
   - Phase status (uncalibrated/early/calibrated)
   - Drift alerts if any

### Enricher Agent

**Daily Workflow Modification:**

```
ENRICHER DAILY CYCLE:

1. Check reverification_queue (P42):
   - Pull top 20 items by priority_score
   - Process reverifications (20% of daily budget)
   - Update field_timestamps with results
   - Create sandbox_enrichments for changed values

2. Check data bounties from prediction engine (P41):
   - High-MVOI fields auto-generated by explanation engine
   - Prioritize by marginal_value_of_information x entity_tpe_score

3. Normal enrichment work (80% of daily budget):
   - Priority board items from other agents
   - New contact research
   - Existing contact enrichment
```

### Prediction Scoring Agent (new nightly job, not a separate agent)

**Nightly Schedule:**

```
1:30 AM  -- Decay computation job (P42)
2:00 AM  -- Prediction scoring engine (P35, existing)
2:15 AM  -- Explanation generation (P41)
2:20 AM  -- Sensitivity computation (P43)
2:25 AM  -- Tournament entry generation (P44)
3:00 AM  -- Outcome detection (P44)

Monthly (1st of month):
4:00 AM  -- Feature weight recalculation (P43)
5:00 AM  -- Calibration analysis (P44)
5:30 AM  -- Calibration adjustment computation (P44)
6:00 AM  -- Monthly reports generation (P43, P44)
```

---

<a id="integration-map"></a>
## Integration Map

```
                        ROUND 4 INTEGRATION MAP

  ┌─────────────────────┐
  │   DATA FRESHNESS    │ (P42)
  │   Decay Model       │
  │                     │
  │  field_timestamps   │──────────────────────┐
  │  reverification_q   │                      │
  └──────────┬──────────┘                      │
             │ decay factors                   │
             v                                 │
  ┌─────────────────────┐                      │
  │   PREDICTION        │ (P35, existing)      │
  │   SCORING ENGINE    │                      │
  │                     │                      │
  │  predictive_scores  │──────────┐           │
  └──────────┬──────────┘          │           │
             │                     │           │
     ┌───────┴───────┐            │           │
     │               │            │           │
     v               v            v           v
  ┌──────────┐  ┌──────────┐  ┌──────────────────┐
  │EXPLANATION│  │FEATURE   │  │   CALIBRATION    │ (P44)
  │ENGINE     │  │IMPORTANCE│  │   SYSTEM         │
  │(P41)      │  │(P43)     │  │                  │
  │           │  │          │  │ prediction_      │
  │prediction_│  │feature_  │  │   outcomes_v2    │
  │explanations│ │importance│  │ calibration_     │
  │action_    │  │feature_  │  │   snapshots      │
  │recommenda-│  │sensitivity│ │ calibration_     │
  │tions      │  │weight_   │  │   adjustments    │
  │           │  │history   │  │ tournaments      │
  └─────┬─────┘  └────┬─────┘  └────────┬─────────┘
        │              │                 │
        │    ┌─────────┘                 │
        │    │                           │
        v    v                           v
  ┌──────────────┐              ┌──────────────────┐
  │ DATA BOUNTY  │ (P38, future)│ CHIEF OF STAFF   │
  │ SYSTEM       │              │ MORNING BRIEFING │
  │              │              │                  │
  │ Auto-gen     │              │ Actions due      │
  │ bounties for │              │ Freshness alerts │
  │ high-MVOI    │              │ Weight changes   │
  │ data gaps    │              │ Calibration      │
  └──────────────┘              │ health           │
                                └──────────────────┘
```

**Key data flows:**

1. **P42 --> P35**: Decay factors down-weight stale data in predictions
2. **P35 --> P41**: Raw predictions get explanations and action recommendations
3. **P35 --> P43**: Predictions provide sensitivity coefficients per feature
4. **P35 --> P44**: Predictions feed into calibration tracking and tournaments
5. **P41 --> P38**: Data gaps with high MVOI auto-generate bounties
6. **P43 --> P35**: Adaptive weights feed back into the scoring engine
7. **P44 --> P35**: Calibration adjustments correct systematic bias in raw scores
8. **P42 --> Enricher**: Reverification queue drives 20% of Enricher's daily work
9. **All --> Chief of Staff**: Summarized in morning briefing

---

<a id="priority"></a>
## Implementation Priority

### Phase 1: Foundation (Week 1-2, ~8 days)

| Task | Source | Effort | Dependencies |
|------|--------|--------|--------------|
| Migration 010 -- all 14 tables | All prompts | 4 hours | None |
| Seed `data_freshness_rules` with decay rates | P42 | 1 hour | Migration |
| Seed `feature_importance` with baseline weights | P43 | 1 hour | Migration |
| Seed `explanation_templates` + `feature_reason_phrases` | P41 | 2 hours | Migration |
| Backfill `field_timestamps` from existing data | P42 | 4 hours | Migration |
| Nightly decay computation job | P42 | 4 hours | Backfill |
| Prediction engine decay integration | P42 | 4 hours | Decay job |
| Outcome detection nightly job | P44 | 4 hours | Migration |
| Cold start phase management | P44 | 2 hours | Outcome detection |

### Phase 2: Explanation & Action (Week 3, ~5 days)

| Task | Source | Effort | Dependencies |
|------|--------|--------|--------------|
| Explanation generation pipeline | P41 | 1 day | Phase 1 |
| Action recommendation engine | P41 | 1 day | Explanation pipeline |
| Sensitivity computation | P41/P43 | 4 hours | Phase 1 |
| API endpoints (P41: 7, P42: 7) | P41, P42 | 1 day | Pipelines |
| Chief of Staff briefing integration | All | 4 hours | API endpoints |
| Enricher reverification budget | P42 | 4 hours | Phase 1 |

### Phase 3: Learning & Calibration (Week 4-5, ~5 days)

| Task | Source | Effort | Dependencies |
|------|--------|--------|--------------|
| Monthly calibration computation | P44 | 1 day | Phase 1 (needs outcomes) |
| Calibration adjustment engine | P44 | 4 hours | Calibration computation |
| Monthly weight recalculation | P43 | 1 day | Phase 1 (needs outcomes) |
| Drift detection alerts | P44 | 4 hours | Calibration computation |
| API endpoints (P43: 7, P44: 9) | P43, P44 | 1 day | Engines |
| Monthly report generation | P43, P44 | 4 hours | Engines |

### Phase 4: Advanced (Week 6+, ~4 days)

| Task | Source | Effort | Dependencies |
|------|--------|--------|--------------|
| Prediction tournaments | P44 | 1.5 days | Phase 3 |
| Data bounty auto-generation (P38 integration) | P41 | 4 hours | Phase 2 + P38 spec |
| Submarket weight variation | P43 | 4 hours | Phase 3 (needs data) |
| UI: explanation panel, freshness indicators, calibration dashboard | All | 2 days | API endpoints |

### Total Estimated Effort

| Phase | Duration | Priority |
|-------|----------|----------|
| Phase 1: Foundation | ~8 days | Critical |
| Phase 2: Explanation & Action | ~5 days | High |
| Phase 3: Learning & Calibration | ~5 days | Medium |
| Phase 4: Advanced | ~4 days | Low |
| **Total** | **~22 days** | |

Note: Phases 3 and 4 depend on accumulated outcome data. Phase 3 becomes effective around month 4-6 (50+ outcomes). Phase 4 tournaments need month 7+ (100+ outcomes). The code can be deployed earlier but will operate in "data collection" mode until sufficient outcomes exist.

---

## Relationship to Existing Specs

| Existing Spec | Relationship |
|---------------|-------------|
| **Prompt 17** (Adaptive Confidence Calibration) | P44 extends calibration from enrichment confidence to prediction confidence. Same mathematical framework (Bayesian updating) but different domain. |
| **Prompt 35** (Predictive Deal Scoring) | P41-P44 build directly on top of P35's `predictive_scores` and `prediction_outcomes` tables. P35 is the scoring engine; P41-P44 make it explainable, fresh, adaptive, and self-correcting. |
| **Prompt 38** (Data Bounties) | Forward dependency. P41's data gap detection auto-generates bounties. P43's MVOI calculation prioritizes bounties. |
| **TPE Scoring** (Migration 006) | TPE is static scoring of current state. The prediction engine (P35) projects forward. P41-P44 make those projections trustworthy. |
| **Enricher Agent** (Migration 007) | P42 adds reverification to the Enricher's daily workflow (20% budget allocation). |
| **Chief of Staff Agent** | P41-P44 all feed summary data into the morning briefing. |
