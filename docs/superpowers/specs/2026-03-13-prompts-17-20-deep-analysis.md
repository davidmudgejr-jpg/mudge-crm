# IE CRM AI Master System -- Deep Analysis: Prompts 17-20
# Adaptive Calibration, Innovation Agent, Goal Cascading, Real-Time Learning

**Date:** 2026-03-13
**Status:** Design Spec
**Scope:** Four advanced capabilities for the 6-agent AI Master System
**Depends on:** Tiers 0-4 of the Evolution Roadmap (especially `agent_daily_kpis`, `enrichment_ground_truth`, and the JSONL audit log)

---

## Table of Contents

1. [Prompt 17: Adaptive Confidence Calibration](#prompt-17)
2. [Prompt 18: The Innovation Agent](#prompt-18)
3. [Prompt 19: Multi-Horizon Goal Cascading](#prompt-19)
4. [Prompt 20: Learning From the Internet in Real-Time](#prompt-20)

---

<a id="prompt-17"></a>
## PROMPT 17: Adaptive Confidence Calibration

### Current State Analysis

The Enricher uses a **fixed, additive confidence formula** defined in `ai-system/agent-templates/enricher.md`:

| Factor | Points | Rationale |
|--------|--------|-----------|
| Address match (Open Corporates + White Pages agree) | +30 | Intuition: strongest signal |
| Phone match (White Pages + BeenVerified agree) | +25 | Intuition: second strongest |
| Email found (at least one source) | +15 | Intuition: having email matters |
| Email agreement (two sources agree) | +10 | Intuition: cross-validation |
| Real person (not a registered agent service) | +10 | Intuition: filters junk |
| Recent data (sources updated within 12 months) | +10 | Intuition: freshness matters |

**Max possible: 100.** Tiers: High (70+), Medium (40-69), Low (0-39).

These weights were designed by David's intuition before any data existed. They are static -- the same weights on day 1 as day 300.

### Gap Analysis

| Gap | Impact |
|-----|--------|
| **No ground truth feedback loop** | Weights never learn whether address_match actually predicts contact accuracy better than phone_match |
| **No outcome tracking** | System doesn't know if a confidence-85 contact was actually reachable vs. a confidence-55 one |
| **David's approval bias baked in** | If David rubber-stamps everything above 70 and rejects everything below, the system learns David's threshold behavior, not contact quality |
| **No source-specific calibration** | White Pages may be 95% accurate for Riverside County but 60% for San Bernardino -- same weight either way |
| **No temporal drift detection** | BeenVerified data quality may degrade over time (stale databases, pricing changes) -- no mechanism to detect this |
| **No cold-start handling** | New data sources added later (e.g., a county assessor MCP server) get no weight until manually configured |
| **Binary factors lose information** | "Email found" is +15 whether it is a personal Gmail or a corporate domain -- no granularity |

### Proposed Design: Bayesian Confidence Recalibration Engine

#### Architecture Overview

```
                    CALIBRATION ENGINE
                    (runs weekly, 3:00 AM Sunday)

Ground Truth Data                     Current Weights
(enrichment_ground_truth)    +        (confidence_weights.json)
         |                                    |
         v                                    v
  +------------------+              +-------------------+
  | Outcome Analyzer |              | Prior Weight Set  |
  | (what actually   |              | (current Bayesian |
  |  happened?)      |              |  posteriors)      |
  +--------+---------+              +---------+---------+
           |                                  |
           +----------------------------------+
                          |
                          v
              +-----------------------+
              | Bayesian Updater      |
              | - Per-factor analysis |
              | - Source segmentation |
              | - Seasonal windowing  |
              | - Bias correction     |
              +-----------+-----------+
                          |
                          v
              +-----------------------+
              | Candidate Weights     |
              | (proposed new weights)|
              +-----------+-----------+
                          |
                          v
              +-----------------------+
              | Validation Gate       |
              | - Backtest on last    |
              |   90 days             |
              | - Max delta per       |
              |   factor: +/-5 pts   |
              | - Stability check     |
              +-----------+-----------+
                          |
                    pass? |
                   /      \
                  v        v
            Apply to    Flag for
         confidence_   David review
         weights.json  (delta too large
                        or backtest
                        regression)
```

#### Data Foundation: Ground Truth Table

This table already exists in the roadmap as `enrichment_ground_truth` (Tier 4, item 4.2). Extend it:

```sql
CREATE TABLE enrichment_ground_truth (
  id SERIAL PRIMARY KEY,

  -- What was enriched
  sandbox_enrichment_id INTEGER REFERENCES sandbox_enrichments(id),
  contact_id UUID REFERENCES contacts(contact_id),
  company_name TEXT,

  -- Original confidence details (snapshot at enrichment time)
  original_confidence INTEGER NOT NULL,
  original_factors JSONB NOT NULL,
  -- e.g., {"address_match": true, "phone_match": true, "email_found": true,
  --        "email_agreement": false, "real_person": true, "recent_data": true,
  --        "source_details": {"white_pages_region": "riverside", "been_verified_age": 8}}

  -- Outcome tracking
  outcome TEXT CHECK (outcome IN (
    'verified_correct',      -- Manual confirmation or successful outreach
    'email_bounced',         -- Hard bounce from Postmark
    'phone_disconnected',    -- Agent or David tried calling, number dead
    'wrong_person',          -- Reached someone, wrong contact
    'correct_but_outdated',  -- Right person, but info has changed
    'no_response',           -- Outreach sent, no engagement (ambiguous)
    'pending'                -- Not yet evaluated
  )),
  outcome_source TEXT,       -- 'postmark_bounce', 'manual_review', 'neverbounce_recheck', 'outreach_reply'
  outcome_at TIMESTAMPTZ,

  -- Metadata
  enricher_instruction_version TEXT,
  data_sources JSONB,        -- {"open_corporates": true, "white_pages": true, "been_verified": true}
  geography TEXT,            -- County or submarket
  property_type TEXT,
  entity_type TEXT,          -- LLC, Corp, Trust, Individual

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gt_outcome ON enrichment_ground_truth(outcome);
CREATE INDEX idx_gt_confidence ON enrichment_ground_truth(original_confidence);
CREATE INDEX idx_gt_geography ON enrichment_ground_truth(geography);
CREATE INDEX idx_gt_created ON enrichment_ground_truth(created_at);
```

#### Weight Configuration File

Replace the hardcoded weights in enricher.md with a versioned JSON config:

```
/AI-Agents/enricher/confidence_weights.json
```

```json
{
  "version": "1.0",
  "updated_by": "david",
  "updated_at": "2026-03-17",
  "calibration_method": "manual_initial",
  "sample_size": 0,

  "global_weights": {
    "address_match": 30,
    "phone_match": 25,
    "email_found": 15,
    "email_agreement": 10,
    "real_person": 10,
    "recent_data": 10
  },

  "source_adjustments": {},
  "geography_adjustments": {},
  "seasonal_adjustments": {},

  "tier_thresholds": {
    "high": 70,
    "medium": 40,
    "low": 0
  },

  "calibration_history": []
}
```

#### Cold-Start Protocol (Months 0-3)

Before enough ground truth exists for Bayesian updating:

```
MONTH 1 (0-100 enrichments with outcomes):
  - Use David's initial weights unchanged
  - Log EVERY factor for EVERY enrichment to enrichment_ground_truth
  - Track ALL outcomes (bounces, replies, manual corrections)
  - Build the dataset -- no calibration yet

MONTH 2 (100-500 enrichments with outcomes):
  - Run calibration engine in OBSERVATION MODE
  - Engine computes what weights WOULD be, logs them
  - David sees proposed changes in morning briefing but they don't apply
  - Chief of Staff compares proposed weights vs. actual outcomes

MONTH 3+ (500+ enrichments with outcomes):
  - Calibration engine goes ACTIVE
  - Proposed weights applied automatically IF they pass validation gate
  - Large changes still require David's approval
  - Weekly recalibration cycle begins
```

**Minimum sample sizes per segment:**

| Segment Type | Minimum n | Rationale |
|-------------|-----------|-----------|
| Global weight | 200 | Enough for stable factor-level analysis |
| Per-source adjustment | 100 | Source-specific bias detection |
| Per-geography adjustment | 50 | Smaller markets have less data |
| Seasonal window | 30 per month | Detect drift over time |

#### Bayesian Updating Algorithm

The core insight: treat each confidence factor as a **binary classifier** predicting "is this contact actually reachable/correct?" Use the ground truth to compute each factor's **actual predictive power**.

```python
# Pseudocode for weekly calibration

def calibrate_weights(ground_truth_rows, current_weights, config):
    """
    For each factor, compute:
    - P(correct | factor_present) = hit rate when this factor is true
    - P(correct | factor_absent)  = hit rate when this factor is false
    - Lift = P(correct|present) / P(correct|absent)

    Higher lift = factor is more predictive = deserves more weight.
    """

    results = {}

    for factor in ['address_match', 'phone_match', 'email_found',
                   'email_agreement', 'real_person', 'recent_data']:

        # Split ground truth by factor presence
        present = [r for r in ground_truth_rows
                   if r['original_factors'].get(factor)]
        absent  = [r for r in ground_truth_rows
                   if not r['original_factors'].get(factor)]

        if len(present) < 20 or len(absent) < 20:
            # Not enough data for this factor -- keep current weight
            results[factor] = {
                'new_weight': current_weights[factor],
                'reason': 'insufficient_data',
                'n_present': len(present),
                'n_absent': len(absent)
            }
            continue

        # "Correct" = verified_correct OR outreach_reply
        # "Incorrect" = email_bounced OR phone_disconnected OR wrong_person
        # Exclude: no_response (ambiguous), pending, correct_but_outdated

        def correctness_rate(rows):
            evaluable = [r for r in rows if r['outcome'] in
                        ('verified_correct', 'email_bounced',
                         'phone_disconnected', 'wrong_person')]
            if not evaluable:
                return None
            correct = [r for r in evaluable if r['outcome'] == 'verified_correct']
            return len(correct) / len(evaluable)

        rate_present = correctness_rate(present)
        rate_absent = correctness_rate(absent)

        if rate_present is None or rate_absent is None:
            results[factor] = {
                'new_weight': current_weights[factor],
                'reason': 'insufficient_evaluated_outcomes'
            }
            continue

        # Compute lift
        if rate_absent > 0:
            lift = rate_present / rate_absent
        else:
            lift = 10.0  # Cap at 10x if absent rate is zero

        # Convert lift to weight using log-odds scaling
        # Normalize so total weights still sum to 100
        raw_weight = math.log(max(lift, 0.1)) * 20 + 15  # Scale to ~0-40 range
        raw_weight = max(5, min(40, raw_weight))  # Clamp to [5, 40]

        results[factor] = {
            'new_weight': round(raw_weight),
            'lift': round(lift, 2),
            'rate_when_present': round(rate_present, 3),
            'rate_when_absent': round(rate_absent, 3),
            'n_present': len(present),
            'n_absent': len(absent),
            'reason': 'bayesian_update'
        }

    # Normalize weights to sum to 100
    computed = {k: v['new_weight'] for k, v in results.items()}
    total = sum(computed.values())
    normalized = {k: round(v / total * 100) for k, v in computed.items()}

    # Apply max-delta constraint: no factor changes more than 5 points per cycle
    constrained = {}
    for factor, new_weight in normalized.items():
        old_weight = current_weights[factor]
        delta = new_weight - old_weight
        if abs(delta) > 5:
            constrained[factor] = old_weight + (5 if delta > 0 else -5)
            results[factor]['clamped'] = True
            results[factor]['unclamped_weight'] = new_weight
        else:
            constrained[factor] = new_weight

    return constrained, results
```

#### Source-Specific Calibration

Different data sources have different reliability by geography:

```json
{
  "source_adjustments": {
    "white_pages": {
      "riverside_county": { "reliability_modifier": 1.0, "sample_size": 340 },
      "san_bernardino_county": { "reliability_modifier": 0.85, "sample_size": 180 },
      "la_county": { "reliability_modifier": 0.92, "sample_size": 95 }
    },
    "been_verified": {
      "riverside_county": { "reliability_modifier": 0.95, "sample_size": 290 },
      "san_bernardino_county": { "reliability_modifier": 1.05, "sample_size": 160 }
    }
  }
}
```

**How modifiers apply:**

When computing the confidence score for a contact in San Bernardino County, if White Pages provided the address match, the address_match points get multiplied by the White Pages San Bernardino modifier:

```
effective_points = base_weight * source_modifier
e.g., address_match in SB County via White Pages = 30 * 0.85 = 25.5
```

#### Seasonal Drift Detection

Track monthly hit rates and detect when a source's quality changes:

```python
def detect_drift(monthly_rates, window=3):
    """
    Compare the most recent `window` months against the prior `window` months.
    If the difference exceeds a threshold, flag drift.
    """
    if len(monthly_rates) < window * 2:
        return None  # Not enough history

    recent = monthly_rates[-window:]
    prior = monthly_rates[-window*2:-window]

    recent_avg = sum(recent) / len(recent)
    prior_avg = sum(prior) / len(prior)

    drift = recent_avg - prior_avg

    if abs(drift) > 0.10:  # 10 percentage point shift
        return {
            'direction': 'improving' if drift > 0 else 'degrading',
            'magnitude': round(abs(drift), 3),
            'recent_avg': round(recent_avg, 3),
            'prior_avg': round(prior_avg, 3),
            'action': 'alert_chief_of_staff'
        }
    return None
```

#### Preventing Overfitting to David's Approval Biases

This is the critical design challenge. If calibration only uses David's approve/reject decisions as ground truth, the system learns to match David's biases rather than actual contact quality.

**Five anti-bias mechanisms:**

1. **Outcome-based truth, not approval-based truth.** The ground truth table tracks what *actually happened* after promotion (email bounced, phone worked, got a reply), not whether David approved it. David's approval is the gate to promotion, but the calibration engine looks at post-promotion outcomes.

2. **Delayed ground truth collection.** Don't evaluate an enrichment's quality at approval time. Wait 30 days, then check: Did the email bounce? Did outreach get a reply? Did David manually correct the info? This creates a natural lag that separates approval bias from outcome truth.

3. **Bias detection metric.** Track and report:
   ```
   david_approval_rate_by_bucket = {
     "90-100": 0.99,   -- David approves almost everything above 90
     "70-89":  0.95,   -- Also approves most 70+ items
     "50-69":  0.40,   -- Sharp dropoff
     "30-49":  0.05,   -- Rarely approves below 50
     "0-29":   0.01    -- Almost never
   }

   actual_correctness_by_bucket = {
     "90-100": 0.92,   -- These are actually correct 92% of the time
     "70-89":  0.78,   -- 78% correct
     "50-69":  0.61,   -- 61% correct -- David is under-approving this bucket!
     "30-49":  0.35,   -- 35% correct
     "0-29":   0.12    -- 12% correct
   }
   ```
   If David's approval curve diverges significantly from the actual correctness curve, the morning briefing flags this: "You're rejecting 60% of contacts in the 50-69 range, but 61% of those turn out to be correct. Consider lowering the review threshold."

4. **Random sampling below threshold.** Automatically promote a small random sample (5%) of items David would normally reject (confidence 40-69) to a "validation set." Track their outcomes. This provides unbiased ground truth for the calibration engine without David's filter.

5. **Holdout validation.** When computing new weights, always hold out 20% of ground truth data. Compute weights on 80%, validate on 20%. If validation set accuracy drops, the new weights are overfitting.

#### Calibration Output: Weekly Report to Chief of Staff

```json
{
  "type": "calibration_report",
  "date": "2026-06-15",
  "sample_size": 847,
  "outcomes_evaluated": 623,

  "current_weights": {
    "address_match": 30,
    "phone_match": 25,
    "email_found": 15,
    "email_agreement": 10,
    "real_person": 10,
    "recent_data": 10
  },

  "proposed_weights": {
    "address_match": 28,
    "phone_match": 27,
    "email_found": 18,
    "email_agreement": 12,
    "real_person": 8,
    "recent_data": 7
  },

  "factor_analysis": {
    "address_match": {
      "lift": 2.1,
      "rate_present": 0.82,
      "rate_absent": 0.39,
      "verdict": "Slightly overweighted. Still the strongest predictor but phone_match is catching up."
    },
    "email_found": {
      "lift": 2.8,
      "rate_present": 0.79,
      "rate_absent": 0.28,
      "verdict": "UNDERWEIGHTED. Having an email is more predictive than current 15 points suggest."
    },
    "recent_data": {
      "lift": 1.3,
      "rate_present": 0.71,
      "rate_absent": 0.55,
      "verdict": "Overweighted. Recency matters less than expected -- old data is often still valid."
    }
  },

  "source_drift_alerts": [
    {
      "source": "been_verified",
      "geography": "san_bernardino_county",
      "direction": "degrading",
      "magnitude": 0.12,
      "recommendation": "BeenVerified accuracy in SB County dropped 12% over last 3 months. Consider reducing weight for SB enrichments."
    }
  ],

  "bias_detection": {
    "approval_vs_correctness_divergence": 0.15,
    "worst_bucket": "50-69",
    "recommendation": "David is under-approving the 50-69 confidence range. 61% of these turn out correct."
  },

  "backtest_result": {
    "current_weights_accuracy": 0.74,
    "proposed_weights_accuracy": 0.78,
    "improvement": 0.04,
    "holdout_validation": "passed"
  },

  "decision": "auto_apply",
  "reason": "All changes within 5-point max delta. Backtest shows 4% improvement. Holdout validates."
}
```

#### Tier Threshold Auto-Adjustment

Beyond factor weights, the tier thresholds themselves (High: 70+, Medium: 40-69, Low: 0-39) should also calibrate:

```
Target: High-confidence tier should have >=85% correctness rate.

If high-confidence (70+) correctness drops below 80%:
  - Raise threshold to 75 (next cycle)
  - Alert: "High-confidence tier accuracy is 78%. Raised threshold from 70 to 75."

If medium-confidence (40-69) correctness exceeds 70%:
  - Lower high threshold to 65 (next cycle)
  - Alert: "Many good contacts are being flagged as medium. Consider lowering threshold."
```

#### Integration with Existing System

| Component | Change Required |
|-----------|----------------|
| `enricher.md` | Replace hardcoded weights with `confidence_weights.json` reference |
| `enrichment_ground_truth` table | Extend with `original_factors` JSONB and geography/source columns |
| Chief of Staff daily review | Add calibration report review to weekly deeper dive (Step 4) |
| JSONL audit log | New action type: `confidence_calibration` |
| Supervisor cron | Add weekly calibration job (Sunday 3:00 AM, before Scout's Evolution Report) |
| Morning briefing | Add calibration alerts to Telegram (David only) when thresholds shift |

#### Implementation Priority and Effort

| Phase | What | Effort | When |
|-------|------|--------|------|
| Phase A | Extend `enrichment_ground_truth` with factor details | 2 hours | With Tier 4 build |
| Phase B | Create `confidence_weights.json`, modify Enricher to read it | 3 hours | With Tier 4 build |
| Phase C | Build outcome tracking (bounce -> ground_truth, reply -> ground_truth) | 4 hours | After email pipeline (Tier 3) |
| Phase D | Build calibration engine (observation mode) | 1 day | Month 2 of operation |
| Phase E | Add source-specific and geography segmentation | 4 hours | Month 3 |
| Phase F | Activate auto-calibration with validation gate | 4 hours | Month 3+ (500+ outcomes) |
| Phase G | Bias detection and random sampling | 4 hours | Month 4 |

**Total: ~4 days of development, phased over months 1-4 of operation.**

---

<a id="prompt-18"></a>
## PROMPT 18: The Innovation Agent (7th Agent Type)

### Current State Analysis

The system has two agents that touch "improvement": the **Scout** and the **Chief of Staff**.

| Agent | Scope | Frequency | Perspective |
|-------|-------|-----------|------------|
| **Scout** | External: AI news, model releases, tools, competitor tech | Weekly report + immediate alerts | "What's new in the world that we could use?" |
| **Chief of Staff** | Internal: agent performance, instruction tuning, workflow optimization | Daily review + weekly proposals | "How do we make what we already have work better?" |

**What nobody does:**
- Observe David's *manual* CRM interactions and spot automation opportunities
- Study what *other CRE brokerages* are doing operationally (not just their tech stack)
- Propose *entirely new capabilities* the system doesn't have (not improvements to existing ones)
- Run structured *experiments* with hypotheses and success metrics
- Think on a *quarterly* time horizon about what the system should become

### Gap Analysis

| Gap | Example |
|-----|---------|
| **Manual pattern blindness** | David spends 20 minutes every Tuesday manually cross-referencing lease expiry dates with contact touch history. No agent notices this pattern or proposes automating it. |
| **Operational best practices** | Top CRE firms use "trigger events" (new hire announcements, zoning changes) to time outreach. The Scout tracks tech tools but not CRE operational practices. |
| **Capability horizon** | Nobody asks "should we add lease abstraction?" or "should we build a tenant rep matching engine?" -- only "should we switch from Qwen 3.5 to Qwen 4?" |
| **Experiment framework** | When the system wants to try something new, there is no structured way to run an A/B test and measure results. |
| **Structured ideation** | Ideas come ad-hoc from Claude's reverse prompts. No systematic process for generating, evaluating, and tracking innovation proposals. |

### Scout vs. Innovator: The Distinction

```
SCOUT                                   INNOVATOR
-----                                   ---------
"Qwen 4 is 12% better on              "We should build a lease
structured extraction"                  abstraction pipeline because
                                        David manually reads 3 leases
EXTERNAL, TECHNICAL                     per week and it takes 45 min each"
Scans the tech landscape                Observes the business operation
Recommends tool/model swaps             Proposes new capabilities
Weekly cadence                          Monthly cadence (deeper thinking)
Answers: "What's available?"            Answers: "What should we build?"
Reactive to releases                    Proactive from patterns
```

**The Innovator is to capabilities what the Scout is to tools.** Scout says "use this better hammer." Innovator says "we should start building cabinets."

### Proposed Design: The Innovator Agent

#### Agent Specification

```
Agent: The Innovator
Model: Claude Opus 4.6 via API (same as Chief of Staff)
Tier: 1.5 (Advisory -- no CRM write access, reports to Chief of Staff)
Cadence: Monthly deep analysis + quarterly capability review
Cost: ~$2-5 per monthly run (one long Opus call)
```

**Why Opus, not a local model:**
The Innovator needs to synthesize across multiple domains (David's behavior, industry practices, system capabilities, business strategy). This requires the reasoning depth of a frontier model. Local models are good at structured tasks; innovation requires lateral thinking and business judgment.

**Why Tier 1.5 (not Tier 1 or Tier 3):**
The Innovator should not have write access to anything. It produces proposals that go through the Chief of Staff for evaluation and then to David for approval. It is purely advisory. But it needs read access to CRM data, agent logs, and David's interaction history to do its job.

#### Four Input Streams

```
INPUT STREAM 1: David's Manual Behavior
────────────────────────────────────────
Source: CRM interaction logs, audit trail, login patterns
Analyzes:
  - What pages does David visit most? (Properties 40x/week, Contacts 25x/week)
  - What filters does David repeatedly build? (Industrial + Fontana + >20K SF = 15x/month)
  - What data does David manually update vs. what the system updates?
  - What exports does David run? (He exports contacts weekly -- why? What's he doing with them?)
  - What does David do RIGHT AFTER approving an enrichment? (Calls them? Adds to campaign?)
  - Time-of-day patterns: David does X every Monday morning -> can we automate X?

Key question: "What is David doing repeatedly that the system could do for him?"


INPUT STREAM 2: CRE Industry Best Practices
────────────────────────────────────────────
Source: Scout's deep-dive backlog, CRE publications, brokerage operation guides
Analyzes:
  - How do top-performing CRE brokers use technology?
  - What workflows do firms like CBRE, JLL, Cushman & Wakefield automate?
  - What trigger events do sophisticated brokerages track?
  - What CRM features do CRE-specific CRMs (Buildout, Apto, RealNex) have that we don't?
  - What data sources do successful IE brokers use that we're missing?

Key question: "What are winning CRE operations doing that we aren't?"


INPUT STREAM 3: Competitor & Market Intelligence
─────────────────────────────────────────────────
Source: Scout's weekly reports (competitor section), proptech news
Analyzes:
  - What features are CRE AI startups shipping? (Reonomy's owner lookup, CompStak's comp data)
  - What gaps do competitors have that we could fill?
  - What capabilities are becoming table-stakes vs. differentiators?
  - Are there new data sources (county records, permit databases, zoning changes) we could tap?

Key question: "What would make this system a competitive advantage, not just a tool?"


INPUT STREAM 4: System Capability Gap Analysis
───────────────────────────────────────────────
Source: Agent logs, attribution_chain, enrichment_ground_truth, priority_board history
Analyzes:
  - Where does the pipeline break or slow down?
  - What types of leads does the system miss entirely?
  - What data does David wish he had but the system doesn't collect?
  - Where is manual intervention still required that could be automated?
  - What would make the morning briefing 2x more valuable?

Key question: "If we could add ONE capability, what would move the needle most?"
```

#### Output: Monthly Innovation Report

```json
{
  "type": "innovation_report",
  "month": "2026-07",
  "theme": "From contact verification to deal origination",

  "behavioral_observations": [
    {
      "pattern": "David builds the same filter (Industrial + Fontana + >20K SF) 15 times per month",
      "insight": "This is a saved search that should auto-run and alert when new matches appear",
      "automation_potential": "high",
      "time_saved_estimate": "30 min/month"
    },
    {
      "pattern": "David exports contacts every Friday and manually emails a curated list to his dad",
      "insight": "Build an automated weekly digest feature that generates and sends a curated contact list",
      "automation_potential": "medium",
      "time_saved_estimate": "45 min/week"
    }
  ],

  "capability_proposals": [
    {
      "id": "INV-2026-07-001",
      "title": "Lease Expiry Intelligence Pipeline",
      "category": "new_capability",
      "description": "Add lease_expiry_date to properties, have Researcher scan for expiry signals, trigger time-sensitive outreach 6 months before expiry",

      "hypothesis": "Timing outreach to lease expiry will increase reply rates by 3x compared to cold outreach",
      "success_metric": "reply_rate on lease-expiry-timed outreach vs. general outreach over 90 days",
      "experiment_design": {
        "control": "Continue current outreach timing (random)",
        "treatment": "Time outreach to 6 months before known lease expiry",
        "sample_size": "50 contacts per group",
        "duration": "90 days",
        "measurement": "reply_rate, meeting_rate, deal_conversion_rate"
      },

      "effort": "medium",
      "impact": "high",
      "dependencies": ["lease_expiry_date column on properties", "Researcher scanning for expiry signals"],
      "competitive_context": "Reonomy and CompStak both offer lease expiry tracking. This is becoming table-stakes for serious CRE tech.",

      "build_plan": [
        "Add lease_expiry_date to properties table (migration)",
        "Extend Researcher to scan public records for lease filing dates",
        "Build expiry countdown alert in Intelligence Feed",
        "Modify Matcher to prioritize contacts with expiring leases",
        "Track experiment metrics in attribution_chain"
      ]
    },
    {
      "id": "INV-2026-07-002",
      "title": "Permit-Based Lead Generation",
      "category": "new_data_source",
      "description": "Monitor county building permit filings for commercial construction, renovation, and tenant improvement permits. Companies pulling permits are actively investing in space -- they're either expanding, renovating for a new tenant, or preparing to sell.",

      "hypothesis": "Contacts associated with recent commercial permits will have a 2x higher engagement rate than contacts without permit activity",
      "success_metric": "engagement_rate of permit-flagged contacts vs. baseline",
      "experiment_design": {
        "control": "Standard enrichment pipeline contacts",
        "treatment": "Contacts flagged by permit activity",
        "duration": "60 days"
      },

      "effort": "high",
      "impact": "high",
      "dependencies": ["County assessor data access (MCP server or API)", "New signal type in sandbox_signals"],
      "competitive_context": "Reonomy has basic permit data. Nobody in IE is using it for proactive outreach."
    }
  ],

  "industry_insights": [
    {
      "observation": "Top 10% of CRE brokers track 'trigger events' (hiring, funding, permits, zoning changes) to time outreach. Our Researcher only tracks news and X signals.",
      "recommendation": "Expand Researcher's signal types to include: permit filings, zoning changes, business license applications, large equipment purchases",
      "source": "CCIM Institute 2025 Technology Report"
    }
  ],

  "experiments_in_progress": [
    {
      "id": "INV-2026-06-003",
      "title": "Multi-touch outreach sequence vs. single email",
      "status": "running",
      "start_date": "2026-06-15",
      "preliminary_results": "Treatment group (3-touch sequence) showing 2.1x reply rate at day 30. Continuing to day 60 for statistical significance."
    }
  ]
}
```

#### Relationship to Chief of Staff

```
INNOVATOR                           CHIEF OF STAFF
(proposes new things)               (evaluates + decides)
         |                                   |
         |   Monthly Innovation Report       |
         +---------------------------------->|
                                             |
                                    Evaluates against:
                                    - Current priorities
                                    - Available resources
                                    - David's stated goals
                                    - ROI projections
                                             |
                                    Produces:
                                    - Approved proposals -> David
                                    - Deferred proposals -> backlog
                                    - Rejected proposals -> with reasoning
                                             |
                                    If David approves:
                                    - Experiment gets scheduled
                                    - Success metrics tracked
                                    - Results reported next month
```

**The Chief of Staff is the Innovator's boss.** The Innovator cannot implement anything. It cannot change agent instructions. It cannot modify the CRM. It proposes; the Chief of Staff evaluates; David decides.

#### Experiment Tracking Table

```sql
CREATE TABLE innovation_experiments (
  id SERIAL PRIMARY KEY,
  experiment_id TEXT UNIQUE NOT NULL,     -- 'INV-2026-07-001'
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  success_metric TEXT NOT NULL,

  -- Design
  control_description TEXT,
  treatment_description TEXT,
  sample_size_target INTEGER,
  duration_days INTEGER,

  -- Status
  status TEXT CHECK (status IN (
    'proposed', 'approved', 'running', 'completed', 'cancelled'
  )) DEFAULT 'proposed',
  approved_by TEXT,                        -- 'david' or 'chief_of_staff'
  approved_at TIMESTAMPTZ,

  -- Results
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  control_result JSONB,
  treatment_result JSONB,
  conclusion TEXT,                          -- 'treatment_wins', 'no_difference', 'control_wins'
  statistical_significance DECIMAL,

  -- Metadata
  proposed_by TEXT DEFAULT 'innovator',
  innovation_report_month TEXT,            -- '2026-07'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Agent Template: `agent-templates/innovator.md`

Key behavioral rules:

1. **Think in capabilities, not features.** Don't say "add a column." Say "build a lease expiry intelligence pipeline that detects expiring leases and triggers proactive outreach."

2. **Every proposal needs a hypothesis.** "I think X will cause Y, measured by Z." No untestable proposals.

3. **Ground observations in data.** Don't say "David probably spends time on X." Query the interaction logs and say "David ran this filter 15 times in March."

4. **Know what exists.** Read the full ARCHITECTURE.md, ROADMAP.md, and current agent instructions before proposing anything. Don't reinvent existing capabilities.

5. **One big bet per month.** Max 2 major capability proposals and 3 minor ones. Quality over quantity.

6. **Track experiment outcomes.** Every monthly report must include updates on running experiments. Close completed experiments with clear conclusions.

7. **Competitive context is mandatory.** Every proposal must note: "Our competitors do/don't have this." and "This is table-stakes/differentiator/blue-ocean."

#### Scheduling and Cost

```
Monthly (1st Sunday of each month, 4:00 AM):
  - Innovator reads: last 30 days of CRM interaction logs, agent logs,
    Scout's weekly reports, attribution_chain data, ground truth outcomes
  - Produces: Monthly Innovation Report
  - Cost: ~$2-5 per run (one extended Opus call, ~50K input tokens, ~5K output)
  - Annual cost: ~$24-60

Quarterly (1st Sunday of Jan/Apr/Jul/Oct):
  - Extended run: reviews all experiment outcomes, reassesses the capability
    roadmap, proposes quarterly innovation priorities
  - Cost: ~$5-10 per run
  - Annual cost: ~$20-40
```

**Total annual cost: ~$44-100.** This is trivially cheap compared to the value of even one good innovation proposal that leads to a deal.

#### Integration with Existing System

| Component | Change Required |
|-----------|----------------|
| `ai-system/ARCHITECTURE.md` | Add Innovator to agent roster (Tier 1.5) |
| `ai-system/ORCHESTRATION.md` | Add monthly cron job for Innovator |
| Supervisor cron table | Add `innovator_monthly` job (1st Sunday, 4:00 AM) |
| `agent_logs` | New `log_type`: `innovation_report`, `experiment_update` |
| Chief of Staff template | Add "Review Innovator proposals" to monthly duties |
| New table | `innovation_experiments` for experiment tracking |
| Morning briefing | Chief of Staff includes approved experiment updates when relevant |

#### Implementation Priority and Effort

| Phase | What | Effort | When |
|-------|------|--------|------|
| Phase A | Write `agent-templates/innovator.md` | 2 hours | After Tier 4 (needs KPIs and ground truth) |
| Phase B | Create `innovation_experiments` table (migration) | 1 hour | With Phase A |
| Phase C | Add CRM interaction logging (what pages David visits, what filters he builds) | 4 hours | Prerequisite for behavioral observation |
| Phase D | Add monthly cron job to supervisor | 1 hour | With Phase A |
| Phase E | Add experiment tracking UI to AI Ops page | 1 day | After Phase B |
| Phase F | First live run (observation mode -- report only, no experiments) | 1 hour (Opus cost) | Month 3 of operation |

**Total: ~2 days of development. Should not be built until Tiers 0-4 are operational.**

---

<a id="prompt-19"></a>
## PROMPT 19: Multi-Horizon Goal Cascading

### Current State Analysis

The system operates on a **24-48 hour cycle**:

- Agents run continuous loops (seconds-to-minutes per task)
- Logger aggregates daily (midnight)
- Chief of Staff reviews daily (6:00 AM)
- Scout reports weekly (Sunday 6:00 PM)
- CRM improvement proposals weekly (Friday review)

**There is no concept of:**
- Quarterly objectives
- Monthly targets
- Progress tracking toward multi-week goals
- Agent intensity adjustment based on goal progress
- Conflicting goal resolution
- Pipeline velocity toward specific outcomes

David thinks in terms like: "I want 10 deals from Fontana industrial by Q3." The system has no mechanism to receive this goal, decompose it, track progress, or adjust behavior.

### Gap Analysis

| Gap | Impact |
|-----|--------|
| **No goal registry** | David's objectives live in his head, not in the system |
| **No decomposition** | "10 deals by Q3" doesn't translate into "50 contacts verified this month" |
| **No progress tracking** | Morning briefing shows daily activity but not progress toward quarterly outcomes |
| **No intensity adjustment** | Agent effort is constant regardless of whether a goal is on-track or behind |
| **No goal conflicts** | If David wants both "focus on Fontana industrial" and "explore Ontario office," agents can't prioritize |
| **No quarterly review** | System never asks "are we on track for Q3 goals?" |
| **No feedback from deals to goals** | When a deal closes, it doesn't update goal progress |

### Proposed Design: OKR Cascade System

#### Architecture Overview

```
QUARTERLY OKRS (David sets these)
  "Close 10 industrial deals in Fontana/Ontario by Q3 2026"
  "Build a pipeline of 25 qualified retail contacts in Riverside"
           |
           v
    CHIEF OF STAFF DECOMPOSITION ENGINE
    (runs at quarter start + weekly recalibration)
           |
           v
MONTHLY TARGETS (auto-generated, David-approved)
  Month 1: "Verify 100 industrial contacts in Fontana/Ontario"
  Month 1: "Generate 30 market signals for Fontana industrial"
  Month 2: "Send 50 outreach emails, achieve 10% reply rate"
  Month 3: "Convert 5 warm leads to meetings"
           |
           v
WEEKLY AGENT PRIORITIES (auto-generated)
  Week 1: Enricher priority = Fontana industrial LLCs (80% capacity)
  Week 1: Researcher priority = Fontana industrial signals (60% capacity)
  Week 1: Matcher priority = industrial AIR reports (70% capacity)
           |
           v
DAILY WORK (existing system, now goal-aware)
  - Agent loops execute with goal-weighted priorities
  - Priority board items tagged with goal_id
  - Morning briefing includes goal progress
```

#### Goal Registry Table

```sql
CREATE TABLE strategic_goals (
  id SERIAL PRIMARY KEY,
  goal_id TEXT UNIQUE NOT NULL,           -- 'Q3-2026-IND-FONTANA'

  -- Goal definition
  title TEXT NOT NULL,                    -- '10 industrial deals in Fontana/Ontario by Q3'
  description TEXT,
  goal_type TEXT CHECK (goal_type IN (
    'deal_count',          -- Close N deals
    'pipeline_build',      -- Build pipeline of N qualified contacts
    'market_entry',        -- Establish presence in new submarket
    'revenue_target',      -- Hit $X in commission
    'relationship_depth',  -- Deepen N existing relationships
    'custom'               -- Freeform goal with custom metrics
  )),

  -- Scope
  property_type TEXT,                     -- 'industrial', 'office', 'retail', etc.
  geography JSONB,                        -- ["Fontana", "Ontario"] or ["Riverside County"]
  target_metric TEXT NOT NULL,            -- 'deals_closed', 'contacts_verified', 'meetings_set'
  target_value INTEGER NOT NULL,          -- 10
  target_unit TEXT DEFAULT 'count',       -- 'count', 'dollars', 'percentage'

  -- Timeline
  quarter TEXT NOT NULL,                  -- 'Q3-2026'
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  -- Priority (for conflict resolution)
  priority INTEGER DEFAULT 50,           -- 1-100, higher = more important
  status TEXT CHECK (status IN (
    'active', 'on_track', 'at_risk', 'behind', 'completed', 'abandoned'
  )) DEFAULT 'active',

  -- Progress
  current_value DECIMAL DEFAULT 0,
  progress_pct DECIMAL GENERATED ALWAYS AS (
    CASE WHEN target_value > 0 THEN LEAST(current_value / target_value * 100, 100) ELSE 0 END
  ) STORED,
  last_progress_update TIMESTAMPTZ,

  -- Metadata
  created_by TEXT DEFAULT 'david',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_goals_quarter ON strategic_goals(quarter);
CREATE INDEX idx_goals_status ON strategic_goals(status);
CREATE INDEX idx_goals_priority ON strategic_goals(priority DESC);
```

#### Monthly Target Decomposition

```sql
CREATE TABLE monthly_targets (
  id SERIAL PRIMARY KEY,
  goal_id TEXT REFERENCES strategic_goals(goal_id),
  month TEXT NOT NULL,                    -- '2026-07'

  -- Target
  target_metric TEXT NOT NULL,            -- 'contacts_verified', 'signals_found', 'outreach_sent'
  target_value INTEGER NOT NULL,
  current_value INTEGER DEFAULT 0,

  -- Agent assignment
  primary_agent TEXT,                     -- 'enricher', 'researcher', 'matcher'
  capacity_allocation_pct INTEGER,        -- How much of this agent's capacity goes here

  -- Status
  status TEXT CHECK (status IN (
    'planned', 'active', 'on_track', 'behind', 'ahead', 'completed'
  )) DEFAULT 'planned',

  -- Intensity mode
  intensity TEXT CHECK (intensity IN (
    'coast',     -- Ahead of schedule, maintain current pace
    'steady',    -- On track, normal operation
    'surge',     -- Behind schedule, increase effort
    'diversify'  -- Way behind, try different approaches
  )) DEFAULT 'steady',

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Chief of Staff Goal Decomposition Protocol

When David inputs a quarterly goal, the Chief of Staff runs a decomposition:

```
INPUT: "Close 10 industrial deals in Fontana/Ontario by Q3 2026"
       Q3 = July 1 - September 30 (3 months)

DECOMPOSITION LOGIC:

Step 1: Work backward from outcome
  10 deals closed requires (using industry conversion rates):
  - ~30 meetings (3:1 meeting-to-deal ratio for CRE)
  - ~150 warm leads / replies (5:1 reply-to-meeting ratio)
  - ~1,500 outreach emails (10:1 outreach-to-reply ratio)
  - ~500 verified contacts (3:1 verified-to-outreachable ratio)
  - ~2,000 raw LLCs to process (2.5:1 raw-to-verified ratio)
  - ~100 market signals to find targets (20:1 signal-to-deal ratio)

Step 2: Spread across months (not evenly -- front-loaded for pipeline building)
  Month 1 (pipeline building):
    - Verify 250 Fontana/Ontario industrial contacts
    - Find 50 market signals for Fontana industrial
    - Send 500 outreach emails
    - Target: 50 replies, 10 meetings

  Month 2 (pipeline working):
    - Verify 150 additional contacts (ongoing)
    - Find 30 market signals (ongoing)
    - Send 700 outreach emails (including follow-ups)
    - Target: 70 replies, 15 meetings

  Month 3 (closing):
    - Verify 100 additional contacts (fill gaps)
    - Find 20 market signals (targeted)
    - Send 300 outreach emails (targeted follow-ups)
    - Target: 30 replies, 10 meetings
    - Close 10 deals

Step 3: Assign agent capacity
  Enricher: 70% capacity on Fontana/Ontario industrial LLCs
  Researcher: 50% capacity on Fontana/Ontario industrial signals
  Matcher: 60% capacity on industrial AIR report matching
  Remaining capacity: other goals and general operations

Step 4: David reviews and adjusts
  "Those conversion rates seem aggressive. Make it 20 meetings per deal."
  -> System recalculates targets upward
```

#### Intensity Adjustment: Coast / Steady / Surge / Diversify

The Chief of Staff evaluates goal progress weekly and adjusts intensity:

```
WEEKLY PROGRESS CHECK (every Monday 6:00 AM, part of daily review):

For each active goal:
  expected_progress = (days_elapsed / total_days) * target_value
  actual_progress = current_value
  progress_ratio = actual_progress / expected_progress

  IF progress_ratio >= 1.2:
    INTENSITY = "coast"
    - Reduce agent capacity allocation by 20%
    - Redirect freed capacity to behind-schedule goals
    - Morning briefing: "Fontana industrial pipeline is 20% ahead. Coasting."

  IF progress_ratio >= 0.8 AND < 1.2:
    INTENSITY = "steady"
    - Maintain current capacity allocation
    - No changes
    - Morning briefing: "Fontana industrial pipeline on track."

  IF progress_ratio >= 0.5 AND < 0.8:
    INTENSITY = "surge"
    - Increase agent capacity allocation by 30%
    - Pull capacity from coast-mode goals
    - Prioritize this goal's items on priority board
    - Morning briefing: "Fontana industrial is behind. Surging: Enricher now at 90% allocation."

  IF progress_ratio < 0.5:
    INTENSITY = "diversify"
    - Something is fundamentally wrong with the approach
    - Don't just do more of the same -- try different strategies
    - Chief of Staff proposes alternatives:
      "Outreach reply rate is 3% instead of expected 10%.
       Options:
       a) Rewrite Matcher outreach templates (tone adjustment)
       b) Shift from cold outreach to warm intro via existing contacts
       c) Add phone outreach to the pipeline
       d) Expand geography to include Rancho Cucamonga"
    - Morning briefing: "Fontana industrial is significantly behind. Diversification needed. Please review options."
```

#### Conflict Resolution Between Goals

When David has multiple active goals, agents need to know how to split their time:

```
SCENARIO: Two active goals
  Goal A: "10 Fontana industrial deals" (priority: 80)
  Goal B: "25 Riverside retail contacts" (priority: 50)

CAPACITY ALLOCATION FORMULA:
  Total capacity = 100%
  Reserved for non-goal work (maintenance, security audit, etc.) = 20%
  Available for goals = 80%

  Goal A share = (priority_A / sum(all_priorities)) * available
               = (80 / 130) * 80% = 49%

  Goal B share = (50 / 130) * 80% = 31%

  THEN apply intensity modifiers:
  If Goal A is in "surge" mode: Goal A gets +15% (from Goal B's share)
  If Goal B is in "coast" mode: Goal B gives up 10% to Goal A

CONFLICT RULES:
  1. Same-agent conflicts: If Enricher is allocated 70% to Goal A and 50% to Goal B
     (total 120%), reduce proportionally to fit.
  2. Priority always wins ties: Higher-priority goal gets first claim on capacity.
  3. David can override: "Pause Goal B for two weeks while we surge on Goal A."
  4. No goal can drop below 10% allocation unless explicitly paused.
```

#### Goal Progress in Morning Briefing

Add a new section to both Houston and Telegram briefings:

```markdown
## Goal Progress (Telegram -- David only)

### Q3-2026 Goals

| Goal | Target | Progress | Pace | Intensity | ETA |
|------|--------|----------|------|-----------|-----|
| Fontana Industrial (10 deals) | 10 deals | 3/10 (30%) | On track | Steady | Sept 15 |
| Riverside Retail (25 contacts) | 25 contacts | 8/25 (32%) | Behind | Surge | Oct 2 (LATE) |

### This Week's Impact on Goals
- Fontana Industrial: +12 contacts verified, +3 meetings set
- Riverside Retail: +5 contacts verified, 0 meetings (outreach not started yet)

### Intensity Changes
- Riverside Retail moved from "steady" to "surge"
  - Enricher allocation: 30% -> 45%
  - Researcher allocation: 20% -> 35%
  - Recommendation: Start outreach this week to get back on track. Approve? [Y/N]

### Alerts
- Fontana Industrial: Meeting-to-deal conversion is 5:1 (expected 3:1).
  Recommendation: David should personally follow up on the 3 stalled meetings.
```

#### Goal Input Interface

David needs a simple way to set goals. Two options:

**Option A: Telegram command (immediate)**
```
David sends to Telegram bot:
/goal "10 industrial deals in Fontana by Q3" priority=80

Houston responds:
"Got it. I've decomposed this into monthly targets:
- July: 250 contacts, 500 outreach, 10 meetings
- August: 150 contacts, 700 outreach, 15 meetings
- September: 100 contacts, 300 outreach, 10 meetings

Enricher gets 70%, Researcher 50%, Matcher 60%.
Sound right? Reply 'yes' to activate or tell me what to change."
```

**Option B: CRM UI (better long-term)**
New "Goals" page in IE CRM sidebar:
- Goal creation form (title, type, geography, property type, target, quarter, priority)
- Goal progress dashboard with charts
- Monthly target breakdown
- Agent allocation visualization
- Intensity mode indicators

#### Agent Priority Board Integration

Priority board items get tagged with goal context:

```json
{
  "source_agent": "researcher",
  "target_agent": "enricher",
  "priority_type": "enrich_company",
  "payload": {
    "company_name": "Pacific West Holdings",
    "goal_id": "Q3-2026-IND-FONTANA",
    "goal_relevance": 0.9,
    "signal_type": "company_expansion"
  },
  "reason": "Company expansion in Fontana industrial -- supports Q3 Fontana goal",
  "urgency": "high"
}
```

Agents check `goal_relevance` when deciding work order. Higher-relevance items for higher-priority goals get processed first.

#### Integration with Existing System

| Component | Change Required |
|-----------|----------------|
| New tables | `strategic_goals`, `monthly_targets` |
| Chief of Staff template | Add goal decomposition protocol, weekly progress check, intensity adjustment |
| Priority board | Add `goal_id` and `goal_relevance` columns |
| All agent templates | Add "check your goal allocation before starting work cycle" |
| Morning briefing | Add goal progress section |
| Telegram bot | Add `/goal` command for quick goal creation |
| AI Ops page | Add Goals tab (or separate Goals page) |
| Attribution chain | Link deals to goals for progress tracking |
| JSONL audit log | New actions: `goal_created`, `goal_progress`, `intensity_change` |

#### Implementation Priority and Effort

| Phase | What | Effort | When |
|-------|------|--------|------|
| Phase A | Create `strategic_goals` and `monthly_targets` tables | 2 hours | After Tier 4 |
| Phase B | Build goal decomposition logic in Chief of Staff | 1 day | With Phase A |
| Phase C | Add goal_id column to priority_board | 30 min | With Phase A |
| Phase D | Add weekly progress check to Chief of Staff review | 4 hours | With Phase B |
| Phase E | Add intensity adjustment logic | 4 hours | With Phase D |
| Phase F | Add goal progress to morning briefing | 2 hours | With Phase D |
| Phase G | Telegram `/goal` command | 4 hours | After Telegram bot is working |
| Phase H | Goals page in CRM UI | 2 days | After Phase G |
| Phase I | Attribution chain -> goal progress linkage | 4 hours | After Tier 5 (attribution_chain) |

**Total: ~5 days of development. Phases A-F can be built in month 2-3. Phases G-I in month 4+.**

---

<a id="prompt-20"></a>
## PROMPT 20: Learning From the Internet in Real-Time

### Current State Analysis

The Scout agent currently scans on two cadences:

| Scan Type | Frequency | Sources | Output |
|-----------|-----------|---------|--------|
| Quick scan | Daily | Hacker News, Reddit, X | Immediate alerts (if urgent) |
| Deep scan | Weekly (Sunday) | All sources | Evolution Report |
| Deep dive | Idle cycles | Backlog topics | Deep dive findings |
| Pricing monitor | As announced | Anthropic, OpenAI, Google | supervisor-config.json updates |

**The problem:** AI moves at the speed of days, not weeks. Between Scout's weekly reports:
- New models drop (Qwen 4 released Tuesday, Scout doesn't report until Sunday)
- Pricing changes happen (OpenAI cuts GPT-4o price 50% on Wednesday)
- New MCP servers appear (county assessor data server published Thursday)
- Competitors ship features (Reonomy launches AI-powered owner identification Friday)

By the time Scout's weekly report reaches David, the discovery may be 5 days old. For some things (pricing changes, security vulnerabilities), that delay is costly.

### Gap Analysis

| Gap | Impact |
|-----|--------|
| **Weekly cadence misses fast-moving events** | A model that is 40% cheaper drops Monday, but the system doesn't know until Sunday |
| **No automatic evaluation against current stack** | Scout reports "Qwen 4 is out" but doesn't automatically compare it to current Qwen 3.5 on our tasks |
| **No cost-of-switching analysis** | "This model is better" doesn't account for migration effort, testing time, and risk |
| **No hype filter** | Every new model claims to be "state of the art." No systematic way to distinguish real improvements from marketing |
| **No cognitive load management** | If Scout surfaced everything interesting daily, David would be overwhelmed |
| **No automatic experimentation** | Interesting discovery -> manual evaluation -> manual testing -> manual adoption. Each step requires David's attention |
| **No MCP server discovery** | New MCP servers that could give agents new capabilities (county records, permit data) are not systematically tracked |

### Proposed Design: Real-Time Innovation Pipeline

#### Architecture Overview

```
CONTINUOUS BACKGROUND SCAN (every 6 hours)
  Scout's existing sources + expanded feeds
           |
           v
    RELEVANCE FILTER
    (is this about something we use or could use?)
           |
    pass?  |
   /       \
  v         v
DROP     DISCOVERY QUEUE
         (structured entries in agent_logs)
              |
              v
      IMPACT CLASSIFIER
      (low / medium / high / critical)
              |
       +-----------+-----------+
       |           |           |
       v           v           v
    LOW         MEDIUM       HIGH/CRITICAL
    (weekly      (daily       (immediate
     report)      digest)      sprint)
                               |
                               v
                     INNOVATION SPRINT
                     (auto-evaluation against
                      current stack)
                               |
                               v
                     SPRINT REPORT
                     (to David via Telegram
                      with recommendation)
```

#### Expanded Source Monitoring

Add these to Scout's daily scan:

```
NEW CONTINUOUS SOURCES (check every 6 hours):

MCP Server Registries:
  - smithery.ai/registry (MCP server directory)
  - GitHub: search for "mcp-server" repos created in last 24h
  - npm: packages tagged "mcp" published in last 24h
  - Specific watch: county assessor, property records, permit, zoning

Model Release Channels:
  - Ollama model registry RSS/API
  - HuggingFace "new models" feed (filtered: >1B params, English, Apache/MIT license)
  - Anthropic blog RSS
  - OpenAI blog RSS
  - Google AI blog RSS

Pricing Change Monitors:
  - Anthropic pricing page (hash check for changes)
  - OpenAI pricing page (hash check for changes)
  - Google AI pricing page (hash check for changes)

CRE Data Source Monitors:
  - County assessor website changes (Riverside, San Bernardino, LA, Orange)
  - New APIs on RapidAPI tagged "real estate" or "property"
  - data.gov new datasets tagged "property" or "commercial"
```

#### Discovery Classification System

When Scout finds something, classify it before deciding what to do:

```python
def classify_discovery(discovery):
    """
    Classify a discovery on two axes:
    1. Impact: How much would this improve our system?
    2. Urgency: How quickly do we need to act?
    """

    impact_signals = {
        'high': [
            'directly replaces a paid service we use',
            'model benchmarks >15% better on our task types',
            'new data source for IE/SoCal commercial property',
            'security vulnerability in our stack',
            'cost reduction >30% on a significant expense',
        ],
        'medium': [
            'model benchmarks 5-15% better',
            'new tool that could automate a manual step',
            'cost reduction 10-30%',
            'new MCP server for a relevant data type',
            'competitor shipped a feature we should consider',
        ],
        'low': [
            'model benchmarks <5% better',
            'interesting but not directly relevant',
            'cost reduction <10%',
            'general AI news with no immediate application',
        ]
    }

    urgency_signals = {
        'critical': [
            'security vulnerability (CVE)',
            'service we depend on shutting down',
            'pricing increase >50% effective immediately',
        ],
        'high': [
            'pricing change (any direction)',
            'model that makes a current model obsolete',
            'free data source replacing a paid one',
            'limited-time opportunity (beta access, free tier expiring)',
        ],
        'normal': [
            'everything else'
        ]
    }

    return {
        'impact': classify_impact(discovery, impact_signals),
        'urgency': classify_urgency(discovery, urgency_signals)
    }
```

#### Hype vs. Real Improvement Filter

The critical question: when a new model claims "40% better," is that real?

```
HYPE DETECTION CHECKLIST (Scout evaluates each claim):

1. SOURCE CREDIBILITY
   - Published by the model creator? (marketing -- discount 50%)
   - Independent benchmark (LMSYS, Artificial Analysis)? (credible)
   - Single blog post with no reproducible benchmarks? (hype)
   - Multiple independent confirmations on r/LocalLLaMA? (real)

2. BENCHMARK RELEVANCE
   - Benchmark is on tasks SIMILAR to ours? (relevant)
     Our tasks: structured data extraction, entity matching,
     contact classification, outreach drafting, web research
   - Benchmark is on general reasoning/coding/math? (maybe relevant)
   - Benchmark is on tasks we never do? (irrelevant)

3. PRACTICAL CONSTRAINTS
   - Fits in our RAM budget? (48GB Mac Mini, 128GB Mac Studio)
   - Available on Ollama or HuggingFace with quantized versions?
   - License allows commercial use?
   - Has been available for >48 hours? (don't test day-0 releases -- let others find bugs)

4. COST REALITY
   - If API model: actual $/1M token vs. current?
   - If local model: RAM requirement vs. current? Speed impact?
   - If new service: pricing tier we'd land in vs. current solution?

SCORING:
  credible_source + relevant_benchmark + practical + cost_favorable
  = REAL IMPROVEMENT (trigger innovation sprint)

  marketing_source + irrelevant_benchmark + impractical
  = HYPE (log and skip)

  mixed signals
  = WATCHLIST (add to backlog, re-evaluate in 2 weeks)
```

#### Innovation Sprint Protocol

When a high-impact discovery passes the hype filter, trigger an automatic evaluation sprint:

```
INNOVATION SPRINT (runs automatically, no David involvement needed)

TRIGGER: Discovery classified as high-impact + high-urgency + passes hype filter

DURATION: 2-4 hours (overnight, during 3:00-5:30 AM maintenance window)

STEPS:

1. BASELINE CAPTURE (30 min)
   - Record current system performance on relevant metrics
   - For model swap: run 10 test fixtures through current model, save results
   - For new tool: document current workflow's cost/time/accuracy

2. CANDIDATE EVALUATION (1-2 hours)
   - For new model:
     a. Pull model via Ollama (if local) or create API test account
     b. Run SAME 10 test fixtures through candidate model
     c. Compare: accuracy, speed (tokens/sec), output quality, cost
     d. Check RAM usage, GPU utilization, stability
   - For new data source:
     a. Query the source with 5 known entities from our CRM
     b. Compare returned data vs. what we already have
     c. Evaluate: coverage (how many did it find?), accuracy (does it match?),
        freshness (how recent?), cost (per query?)
   - For new MCP server:
     a. Install in test environment
     b. Run 5 representative queries
     c. Evaluate: response time, data quality, reliability

3. COST-OF-SWITCHING ANALYSIS (30 min)
   - Migration effort: How many agent instructions need rewriting?
   - Testing effort: How many test fixtures need updating?
   - Risk: What breaks if the new thing doesn't work?
   - Rollback plan: How fast can we revert?
   - Hidden costs: New dependencies, maintenance burden, learning curve

4. SPRINT REPORT (generated automatically)
```

#### Sprint Report Format

```json
{
  "type": "innovation_sprint_report",
  "discovery_id": "DISC-2026-07-15-001",
  "title": "Qwen 4 (25B) vs. current Qwen 3.5 (20B) for contact enrichment",
  "sprint_date": "2026-07-16",
  "sprint_duration_hours": 2.5,

  "discovery": {
    "what": "Qwen 4 (25B) released July 15, claims 20% improvement on structured extraction",
    "source": "Ollama registry + r/LocalLLaMA benchmarks",
    "hype_check": {
      "source_credibility": "high (independent benchmarks on LMSYS)",
      "benchmark_relevance": "high (structured data extraction is our core task)",
      "practical": "yes (25B fits in 48GB alongside MiniMax)",
      "cost": "same ($0 -- local inference)",
      "verdict": "REAL IMPROVEMENT"
    }
  },

  "evaluation_results": {
    "accuracy": {
      "current_model": "82% on 10 test fixtures",
      "candidate_model": "89% on same fixtures",
      "improvement": "+7 percentage points"
    },
    "speed": {
      "current_model": "24 tokens/sec",
      "candidate_model": "21 tokens/sec",
      "change": "-12.5% (slower due to larger model)"
    },
    "ram_usage": {
      "current_model": "14 GB",
      "candidate_model": "18 GB",
      "remaining_headroom": "16 GB (still fits with MiniMax)"
    },
    "output_quality": {
      "structured_extraction": "Better at parsing complex LLC structures",
      "confidence_scoring": "Similar",
      "edge_cases": "Handles dissolved/merged LLCs better"
    }
  },

  "cost_of_switching": {
    "migration_effort": "low -- update model name in supervisor-config.json",
    "testing_effort": "low -- rerun Level 1 tests with new model",
    "risk": "low -- can revert to Qwen 3.5 in 5 minutes",
    "hidden_costs": "Slightly slower inference may reduce daily throughput by ~10%"
  },

  "recommendation": "ADOPT",
  "reasoning": "7% accuracy improvement on our core task with acceptable speed tradeoff. Zero migration risk. Recommendation: switch Enricher to Qwen 4, keep Qwen 3.5 cached as fallback.",

  "action_plan": [
    "Update supervisor-config.json: enricher model = qwen4:25b",
    "Run Level 1 tests with new model (automated)",
    "Monitor first 24 hours of production for regressions",
    "Compare approval_rate before/after in agent_daily_kpis"
  ],

  "decision": "defer_to_david"
}
```

#### Cognitive Load Management

The biggest risk of real-time scanning: overwhelming David with noise. Design constraints:

```
INFORMATION FLOW THROTTLING:

1. CRITICAL discoveries: Immediate Telegram alert (max 1 per day)
   Only for: security vulnerabilities, services shutting down, pricing spikes

2. HIGH discoveries: Included in next morning briefing (max 2 per briefing)
   Format: 3-line summary + recommendation + approve button

3. MEDIUM discoveries: Weekly Innovation Digest (new format, Saturday)
   Format: Ranked list of 5-10 items with one-line summaries

4. LOW discoveries: Logged internally, never surfaces to David
   Available if David asks: "What did Scout find this week?"

BATCHING RULES:
  - Never send more than 1 Telegram alert per day for non-security items
  - If 3 high discoveries happen in one day, batch them into one briefing section
  - If the same type of discovery repeats (e.g., 5 new models in a week),
    consolidate: "5 new models released this week. Best candidate: [X]. Sprint report attached."

ATTENTION BUDGET:
  - David should spend MAX 5 minutes per day on innovation items
  - Sprint reports are structured so the RECOMMENDATION is the first line
  - David can respond "yes" or "no" -- no reading required unless he wants detail
```

#### Auto-Adoption for Low-Risk Improvements

Some improvements are so low-risk that David shouldn't need to approve them:

```
AUTO-ADOPTION CRITERIA (all must be true):
  1. Cost change: savings only (never auto-adopt something more expensive)
  2. Performance: equal or better on all test fixtures
  3. Migration: config change only (no code changes)
  4. Rollback: can revert in <5 minutes
  5. Category: pricing update or model version patch (not a major version change)

Examples that qualify for auto-adoption:
  - Anthropic drops Sonnet pricing 20% -> update pricing table
  - Ollama patches Qwen 3.5 (bug fix, same version) -> auto-update
  - Free MCP server adds a new query type we don't use -> log, no action

Examples that DO NOT qualify:
  - New model version (Qwen 3.5 -> Qwen 4) -> requires testing + David approval
  - New data source -> requires integration work
  - Switching from paid to free service -> requires validation
```

#### MCP Server Discovery Pipeline

Special handling for MCP servers, because they can give agents entirely new capabilities:

```
MCP SERVER DISCOVERY:

Every 6 hours, check:
  1. smithery.ai for new servers
  2. GitHub for repos matching "mcp-server-*" created in last 6 hours
  3. npm for packages with "mcp" keyword published in last 6 hours

RELEVANCE FILTER:
  High relevance: property records, county assessor, permits, zoning,
                   business licenses, SEC filings, USPS address validation
  Medium relevance: web scraping, PDF parsing, email, calendar, CRM
  Low relevance: social media, gaming, entertainment, unrelated domains

FOR HIGH-RELEVANCE MCP SERVERS:
  1. Log to agent_logs as scout_alert (urgency: high)
  2. Include in next morning briefing:
     "New MCP server found: mcp-server-riverside-assessor
      Provides: Property owner lookup, assessed value, tax records
      for Riverside County. Could replace manual assessor website searches.
      Recommend installing in test environment? [Y/N]"
  3. If David approves: Scout installs in sandbox, runs 5 test queries,
     reports results in next briefing

FOR MEDIUM-RELEVANCE MCP SERVERS:
  Log to weekly digest. No immediate action.
```

#### Integration with Existing System

| Component | Change Required |
|-----------|----------------|
| Scout agent template | Increase scan frequency to 6-hourly for priority sources; add hype filter; add sprint protocol |
| Supervisor cron | Add 6-hourly scan job (existing daily scan becomes more frequent) |
| `agent_logs` | New log types: `discovery`, `innovation_sprint`, `auto_adoption` |
| Morning briefing | Add innovation section with throttled high-impact items |
| Telegram bot | Add sprint report delivery; add quick-approve for adoption recommendations |
| Test harness | Add `sprint_benchmark` mode for rapid model comparison |
| `supervisor-config.json` | Add `auto_adoption_rules` section |
| JSONL audit log | New actions: `discovery_classified`, `sprint_started`, `sprint_completed`, `auto_adopted` |

#### Implementation Priority and Effort

| Phase | What | Effort | When |
|-------|------|--------|------|
| Phase A | Increase Scout scan frequency to 6-hourly (config change) | 1 hour | Immediate (after Scout is deployed) |
| Phase B | Add hype filter logic to Scout instructions | 2 hours | With Phase A |
| Phase C | Add discovery classification and throttling | 4 hours | With Phase A |
| Phase D | Build innovation sprint protocol (automated model comparison) | 1 day | After test harness (Tier 6) |
| Phase E | Add MCP server discovery pipeline | 4 hours | With Phase A |
| Phase F | Add auto-adoption rules for low-risk changes | 4 hours | After Phase D |
| Phase G | Add sprint reports to morning briefing | 2 hours | With Phase D |
| Phase H | Cognitive load management (batching, throttling) | 4 hours | With Phase C |

**Total: ~4 days of development. Phase A-C can ship with Scout's initial deployment. Phases D-H require test harness (Tier 6).**

---

## Cross-Prompt Integration Map

These four systems are not independent. Here is how they connect:

```
PROMPT 17 (Calibration)              PROMPT 20 (Real-Time Learning)
  Confidence weights adjust      <---  New data source discovered
  based on ground truth                (improves factor accuracy)
         |                                    |
         |                                    |
         v                                    v
PROMPT 19 (Goal Cascading)          PROMPT 18 (Innovator)
  Goals drive agent priorities       Proposes new capabilities
  Agent intensity adjusts based      based on goal progress gaps
  on goal progress                   and David's behavior patterns
         |                                    |
         +------------------------------------+
                        |
                        v
              CHIEF OF STAFF
              (synthesizes all four systems
               in daily/weekly/monthly reviews)
```

**Example of all four working together:**

1. David sets goal: "10 Fontana industrial deals by Q3" (Prompt 19)
2. Enricher processes Fontana LLCs with calibrated confidence weights (Prompt 17)
3. Confidence calibration shows BeenVerified accuracy is declining for SB County (Prompt 17)
4. Scout discovers a county assessor MCP server with better SB County data (Prompt 20)
5. Innovation sprint confirms the MCP server is more accurate than BeenVerified for SB County (Prompt 20)
6. Innovator proposes: "Replace BeenVerified with county assessor MCP for SB County enrichments, and add permit-based lead generation as a new signal source for the Fontana goal" (Prompt 18)
7. Chief of Staff evaluates the proposal against Q3 goal progress, approves MCP switch, defers permit pipeline to next month (all four systems)
8. Confidence calibration adjusts weights to give county assessor data higher weight than BeenVerified in SB County (Prompt 17)
9. Goal progress improves as enrichment accuracy increases in the Fontana submarket (Prompt 19)

---

## Priority Summary

| Prompt | System | Priority | Depends On | Est. Effort |
|--------|--------|----------|------------|-------------|
| 17 | Adaptive Confidence Calibration | HIGH | Tier 4 (KPIs, ground truth), Tier 3 (email for bounce data) | 4 days |
| 19 | Multi-Horizon Goal Cascading | HIGH | Tier 4, Tier 5 (attribution) | 5 days |
| 20 | Real-Time Innovation Pipeline | MEDIUM | Scout deployed, Tier 6 (test harness for sprints) | 4 days |
| 18 | The Innovation Agent | MEDIUM-LOW | Tiers 0-4 operational, CRM interaction logging | 2 days |

**Recommended build order: 17 -> 19 -> 20 -> 18**

Calibration (17) is the highest ROI because it makes every enrichment more accurate from day one of having ground truth data. Goal cascading (19) is next because it transforms the system from reactive to strategic. Real-time learning (20) is a force multiplier for the Scout that already exists. The Innovator (18) is the final layer -- it works best when all other systems are generating the data it needs to observe.

---

*Created: March 13, 2026*
*For: IE CRM AI Master System -- Advanced Capabilities Design*
*Prompts: 17 (Calibration), 18 (Innovation Agent), 19 (Goal Cascading), 20 (Real-Time Learning)*
