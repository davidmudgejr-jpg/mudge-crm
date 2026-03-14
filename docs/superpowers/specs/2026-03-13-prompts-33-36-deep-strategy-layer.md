# IE CRM AI Master System -- Deep Strategy Layer: Prompts 33-36
# Human-AI Strategy Sessions, Data Moat, Predictive Scoring, Knowledge Base

**Date:** 2026-03-13
**Status:** Design Spec (Round 3 -- Deepest Layer)
**Scope:** Four strategic capabilities that transform the system from an execution engine into a thinking partner
**Depends on:** Tiers 0-7 (Round 1), Tiers 8-14 (Round 2), and the existing TPE scoring, sandbox workflow, and agent infrastructure

---

## What Round 3 Adds

Round 1 fixed **operational gaps** (data flow, auth, email pipeline).
Round 2 added **intelligence loops** (self-awareness, calibration, emergent behavior detection).
Round 3 builds the **strategic layer** -- the system doesn't just execute and learn, it *thinks with David*, accumulates irreplaceable knowledge, and predicts the future.

### The Core Problem Round 3 Solves

**David has a thinking partner that never forgets, never misses a pattern, and gets better at strategy every month.** Currently:
- Strategy sessions are ephemeral (Claude Panel chats disappear)
- Competitive advantage is unmeasured (David doesn't know what data is uniquely his)
- TPE is reactive (scores current state, doesn't predict future state)
- Hard-won lessons evaporate (no structured memory of "what works in this market")

Round 3 makes the system a true strategic collaborator with compounding intelligence.

---

## Table of Contents

1. [Prompt 33: Human-AI Collaborative Strategy Sessions](#prompt-33)
2. [Prompt 34: Data Moat Assessment & Acceleration](#prompt-34)
3. [Prompt 35: Predictive Deal Scoring](#prompt-35)
4. [Prompt 36: Knowledge Base -- Lessons That Compound](#prompt-36)
5. [New Tables Summary](#new-tables)
6. [Integration Map](#integration-map)
7. [Implementation Priority](#priority)

---

<a id="prompt-33"></a>
## PROMPT 33: Human-AI Collaborative Strategy Sessions

### Current State Analysis

The Claude Panel (`src/api/claude.js`, `src/components/ClaudePanel.jsx`) is a general-purpose SQL chat interface. It:
- Receives a system prompt with the live database schema
- Parses responses for SQL blocks (read/write)
- Auto-executes reads, countdown-then-execute for writes
- Supports file attachments (PDF, CSV, images)
- Has 10 suggested commands hard-coded in `SUGGESTED_COMMANDS`

**What works:** Fast ad-hoc queries. David can ask "show me my top 20 targets in Fontana" and get results.

**What's missing:**

| Gap | Impact |
|-----|--------|
| **No session persistence** | Every Claude Panel conversation is ephemeral -- insights, hypotheses, and decisions disappear when the browser refreshes |
| **No structured thinking framework** | Chat is freeform. There's no guided flow for developing a market thesis, testing it against data, and producing actionable outputs |
| **No hypothesis testing** | David can query data, but there's no mechanism for "I think X is true -- prove or disprove it with live CRM data" |
| **No actionable output pipeline** | Insights don't automatically become enrichment queues, outreach campaigns, TPE filter adjustments, or knowledge base entries |
| **No session memory across conversations** | A brilliant insight from Tuesday's session is invisible to Friday's session |
| **No distinction between query mode and strategy mode** | Quick lookups and deep strategic thinking use the same UI, same prompts, same interaction pattern |

### What Makes "Strategy Mode" Different From Just Chatting

The difference is **structure, persistence, and outputs**. A strategy session is not a conversation -- it is a *decision-making process* with a beginning (hypothesis), middle (data-driven testing), and end (actionable outputs that enter the system). Specifically:

1. **Framed around a thesis** -- Every session starts with a declarative statement about the market, not a question. "Trust-owned properties in Fontana with 15+ year hold periods are the highest-probability dispositions in Q3." The system then helps stress-test this thesis.

2. **Live data integration** -- Houston pulls real CRM data mid-conversation to validate or invalidate claims. Not "let me go check" but inline, real-time evidence.

3. **Produces artifacts** -- A strategy session produces at minimum one of: enrichment queue, outreach campaign, TPE weight adjustment, knowledge base entry, or quarterly goal update.

4. **Persisted and indexed** -- Sessions are saved, searchable, and feed back into the Market Model and Knowledge Base. The system remembers what David concluded and why.

5. **Structured back-and-forth** -- The session follows a defined protocol (thesis > evidence > challenge > refine > commit), not freeform chat.

### Proposed Design

#### 33.1 -- Strategy Session Data Model

```sql
-- Migration 008_strategy_sessions.sql

CREATE TABLE IF NOT EXISTS strategy_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Session metadata
    title           TEXT NOT NULL,           -- "Fontana Trust Owners Q3 Disposition Thesis"
    session_type    TEXT NOT NULL CHECK (session_type IN (
        'market_thesis',        -- Testing a market belief
        'portfolio_review',     -- Reviewing a segment of the pipeline
        'campaign_design',      -- Designing an outreach strategy
        'competitive_response', -- Responding to a competitor move
        'opportunity_deep_dive' -- Deep analysis of a specific opportunity
    )),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'paused', 'concluded', 'archived'
    )),
    -- Thesis
    initial_thesis  TEXT NOT NULL,           -- The declarative statement being tested
    final_thesis    TEXT,                    -- Refined thesis after evidence (may differ from initial)
    thesis_verdict  TEXT CHECK (thesis_verdict IN (
        'confirmed', 'partially_confirmed', 'refuted', 'inconclusive'
    )),
    -- Context
    market_segment  TEXT,                    -- "Fontana industrial 20K-50K SF"
    time_horizon    TEXT,                    -- "Q3 2026" or "next 6 months"
    -- Outputs produced (references to what was created)
    outputs         JSONB DEFAULT '[]',      -- Array of {type, reference_id, description}
    -- Scoring
    confidence      INTEGER CHECK (confidence >= 0 AND confidence <= 100),
    impact_estimate TEXT,                    -- "Could generate 3-5 new listings"
    -- Timestamps
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    concluded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strategy_sessions_status ON strategy_sessions(status);
CREATE INDEX idx_strategy_sessions_type ON strategy_sessions(session_type);
CREATE INDEX idx_strategy_sessions_created ON strategy_sessions(created_at);

-- Individual turns in the conversation, with data snapshots
CREATE TABLE IF NOT EXISTS strategy_session_turns (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES strategy_sessions(id) ON DELETE CASCADE,
    turn_number     INTEGER NOT NULL,
    -- Turn content
    role            TEXT NOT NULL CHECK (role IN ('david', 'houston', 'system')),
    phase           TEXT NOT NULL CHECK (phase IN (
        'thesis',       -- David states the hypothesis
        'evidence',     -- Houston pulls data to test it
        'challenge',    -- Houston presents counter-evidence or edge cases
        'refine',       -- David adjusts thesis based on evidence
        'commit',       -- David decides on actions
        'followup'      -- Post-session check-ins
    )),
    content         TEXT NOT NULL,           -- The message text
    -- Data pulled during this turn
    data_snapshot   JSONB,                   -- Query results that informed this turn
    sql_executed    TEXT,                    -- SQL that was run
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_turns_session ON strategy_session_turns(session_id, turn_number);

-- Links between sessions and CRM entities discussed
CREATE TABLE IF NOT EXISTS strategy_session_entities (
    id              SERIAL PRIMARY KEY,
    session_id      UUID NOT NULL REFERENCES strategy_sessions(id) ON DELETE CASCADE,
    entity_type     TEXT NOT NULL CHECK (entity_type IN (
        'property', 'contact', 'company', 'deal'
    )),
    entity_id       UUID NOT NULL,
    role_in_session TEXT,                    -- "target", "comparable", "competitor", "evidence"
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_session_entities_session ON strategy_session_entities(session_id);
CREATE INDEX idx_session_entities_entity ON strategy_session_entities(entity_type, entity_id);
```

#### 33.2 -- Strategy Session Protocol (System Prompt Extension)

When Strategy Mode is activated, the Claude Panel system prompt is extended with this protocol:

```
STRATEGY MODE ACTIVE -- You are Houston in Strategy Mode.

This is NOT a query session. You are helping David develop and test a market thesis.
Follow this structured protocol:

PHASE 1 -- THESIS (David leads)
- David states a declarative hypothesis about the market
- You restate it precisely and identify the testable claims within it
- You propose 3-5 data queries that would confirm or refute each claim

PHASE 2 -- EVIDENCE (Houston leads)
- Execute each query against the live CRM
- Present results with clear verdict per claim: SUPPORTS / WEAKENS / NEUTRAL
- Highlight surprising findings that David may not have expected
- Pull comparison data (what does this segment look like vs the broader market?)

PHASE 3 -- CHALLENGE (Houston leads)
- Present the strongest counter-argument to the thesis
- Identify edge cases, survivorship bias, small sample sizes
- Ask: "What would need to be true for this thesis to be wrong?"
- Surface any data gaps that prevent confident conclusions

PHASE 4 -- REFINE (David leads)
- David adjusts the thesis based on evidence
- Houston proposes the refined thesis in precise language
- David confirms or further adjusts

PHASE 5 -- COMMIT (David leads)
- Propose specific actions based on the refined thesis:
  * Enrichment queue: which properties/contacts need more data?
  * Outreach campaign: who should be contacted, with what message?
  * TPE adjustment: should scoring weights change?
  * Knowledge base entry: what lesson was learned?
  * Priority board item: what should agents work on next?
- David approves specific actions
- You generate the SQL/API calls to create them

After COMMIT, save the session with its conclusion and outputs.
```

#### 33.3 -- UI Changes to ClaudePanel.jsx

**Mode Toggle:** Add a toggle at the top of the Claude Panel: `Query Mode` (current behavior) | `Strategy Mode` (structured protocol). Strategy Mode changes:

1. **Session creation prompt** -- On entering Strategy Mode, a modal asks for: title, session type (dropdown), initial thesis (textarea), market segment (text), time horizon (text).

2. **Phase indicator** -- A horizontal stepper at the top of the chat showing the current phase: `THESIS > EVIDENCE > CHALLENGE > REFINE > COMMIT`. Phases can be revisited.

3. **Data cards** -- When Houston pulls CRM data during Evidence phase, results render as rich data cards (not raw SQL output) with verdict badges: green "SUPPORTS", amber "NEUTRAL", red "WEAKENS".

4. **Action sidebar** -- During Commit phase, a right sidebar appears showing proposed actions as checkboxes. David checks which to execute. Actions include:
   - "Add 47 properties to enrichment queue" (creates priority board items)
   - "Create 'Trust Owner Fontana' campaign" (inserts campaign + contacts)
   - "Adjust TPE trust entity weight from 10 to 12" (updates tpe_config)
   - "Save lesson: Trust owners with 70+ age sell 30% faster" (creates knowledge base entry)

5. **Session history** -- Strategy Mode includes a session list sidebar showing past sessions with title, date, verdict, and key outputs. Clicking a session loads its full transcript.

#### 33.4 -- Session-to-Market-Model Feedback

When a strategy session concludes, the system:

1. **Extracts quantitative findings** -- Any statistical claim in the session (e.g., "Fontana trust owners have 2.3x the disposition rate") is tagged and stored in the Knowledge Base (see Prompt 36).

2. **Flags TPE implications** -- If evidence suggests a TPE weight should change, it creates a `tpe_weight_proposal` entry (new JSONB column on `strategy_sessions.outputs`) that the Chief of Staff reviews in the next morning briefing.

3. **Feeds morning briefing** -- Active strategy sessions appear in the morning briefing: "Strategy session 'Fontana Trust Thesis' is active -- 3 claims confirmed, 1 awaiting data from enrichment queue."

4. **Cross-references future sessions** -- When a new session involves entities or market segments that overlap with past sessions, Houston surfaces relevant past conclusions: "In your October session, you concluded that Fontana trust owners respond best to estate planning framing. Still want to use that approach?"

### Priority and Effort

| Component | Effort | Priority |
|-----------|--------|----------|
| `strategy_sessions` + `strategy_session_turns` tables | 2 hours | High |
| Strategy Mode system prompt extension | 2 hours | High |
| UI: mode toggle + phase stepper | 1 day | High |
| UI: data cards with verdict badges | 1 day | Medium |
| UI: action sidebar (Commit phase) | 1 day | Medium |
| UI: session history list | 4 hours | Medium |
| Session-to-knowledge-base pipeline | 4 hours | Medium |
| Cross-session reference in system prompt | 4 hours | Low |
| **Total** | **~5 days** | |

---

<a id="prompt-34"></a>
## PROMPT 34: Data Moat Assessment & Acceleration

### Current State Analysis

IE CRM sits on top of multiple data layers. Some are commodity (anyone can buy), some are semi-unique (take effort to assemble), and some are genuinely unreplicable.

#### Data Asset Inventory (March 2026)

| Data Asset | Source | Count | Commodity? | Notes |
|-----------|--------|-------|------------|-------|
| Property records | CoStar | ~3,700 | YES | Anyone with a CoStar license has this |
| Building specs (SF, year built, zoning) | CoStar | ~3,700 | YES | Public/purchasable |
| Owner names | CoStar + County Assessor | ~1,094 | SEMI | Assessor data is public but messy; cleaned data has value |
| Owner ages | Manual research | ~120 | UNIQUE | Not available in any commercial database |
| Hold duration | CoStar + manual calc | ~1,784 | SEMI | Derivable from public sale records but requires assembly |
| Entity types (LLC, Trust, etc.) | CoStar + manual | ~219 | SEMI | CoStar has some; Trust vs LLC classification is research |
| Lease expirations | Company DB (proprietary) | varies | SEMI-UNIQUE | Lee & Associates internal; not available to outside brokers |
| Confirmed loan maturities | Title rep RCA data | 98 | UNIQUE | Personal relationship data, not purchasable |
| Distress signals (NOD/Auction) | Title rep reports | 59 | SEMI | Public filings but curated + cross-referenced to CRM |
| Tenant growth signals | CoStar/Vibe | 92 | SEMI | Available to CoStar subscribers but integrated into scoring |
| Debt/stress estimates | Title rep relationships | varies | UNIQUE | Balloon estimates from personal intel |
| TPE scores | Computed | ~3,700 | UNIQUE | Algorithm + weights are proprietary |
| Contact enrichments | White Pages/BeenVerified/AI agents | growing | SEMI-UNIQUE | Raw data is purchasable; cross-referenced + verified is not |
| Approval patterns | David's review decisions | growing | UNIQUE | Only exists in this system |
| Ground truth data | Email bounces, phone outcomes | growing | UNIQUE | Only exists in this system |
| Interaction history | Team activity logs | growing | UNIQUE | Relationship intelligence, not purchasable |
| Deal outcomes | Closed/dead deals with reasons | growing | UNIQUE | Proprietary performance data |
| Agent performance data | AI system KPIs | growing | UNIQUE | No one else has this for their market |
| Market model beliefs | Strategy sessions | 0 (new) | UNIQUE | David's tested hypotheses about the IE market |
| Knowledge base lessons | System observations | 0 (new) | UNIQUE | Compounding intelligence |

### Gap Analysis

| Gap | Impact |
|-----|--------|
| **No moat measurement** | David doesn't know which data assets are his competitive advantage vs commodity overlays |
| **No moat acceleration strategy** | Data collection happens opportunistically, not strategically targeted at unique advantage |
| **No moat protection** | Unique data (owner ages, approval patterns, deal outcomes) is not identified as requiring special protection |
| **No compounding metric** | No way to measure "how much more valuable is my system this month vs last month?" |
| **No data exclusivity awareness** | The system doesn't know which data it has that competitors provably lack |

### Proposed Design

#### 34.1 -- Data Moat Scoring Framework

Every data asset is scored on three dimensions:

```
MOAT SCORE = Uniqueness (40%) + Defensibility (30%) + Compounding Rate (30%)

UNIQUENESS (0-100):
  100 = Only exists because David/system created it (approval patterns, ground truth)
   80 = Derived from unique relationships (title rep data, Lee internal DB)
   60 = Assembled from public sources but requires significant effort (owner ages)
   40 = Available commercially but enriched/cross-referenced
   20 = Commodity data with minor formatting improvements
    0 = Raw commodity (CoStar building specs)

DEFENSIBILITY (0-100):
  100 = Cannot be replicated even with unlimited budget (interaction history, approval patterns)
   80 = Requires years of human relationships to replicate (title rep intel)
   60 = Requires months of AI processing + human review (enriched contacts)
   40 = Requires significant investment but achievable (owner age research)
   20 = Replicable with off-the-shelf tools in weeks
    0 = Can be purchased immediately

COMPOUNDING RATE (0-100):
  100 = Each month makes it exponentially more valuable (knowledge base, deal outcomes)
   80 = Linear value increase every month (interaction history, ground truth)
   60 = Value increases with volume but with diminishing returns (enrichments)
   40 = Requires active maintenance to remain valuable (market signals)
   20 = Static value once assembled (owner ages -- until updated)
    0 = Depreciates over time without active work
```

#### 34.2 -- `data_moat_registry` Table

```sql
CREATE TABLE IF NOT EXISTS data_moat_registry (
    id                  SERIAL PRIMARY KEY,
    asset_name          TEXT NOT NULL UNIQUE,
    asset_category      TEXT NOT NULL CHECK (asset_category IN (
        'property_data', 'contact_data', 'relationship_intel',
        'scoring_model', 'behavioral_data', 'market_intelligence',
        'system_performance', 'strategic_knowledge'
    )),
    -- Scoring
    uniqueness_score    INTEGER NOT NULL CHECK (uniqueness_score >= 0 AND uniqueness_score <= 100),
    defensibility_score INTEGER NOT NULL CHECK (defensibility_score >= 0 AND defensibility_score <= 100),
    compounding_score   INTEGER NOT NULL CHECK (compounding_score >= 0 AND compounding_score <= 100),
    moat_score          NUMERIC GENERATED ALWAYS AS (
        uniqueness_score * 0.4 + defensibility_score * 0.3 + compounding_score * 0.3
    ) STORED,
    -- Metadata
    source_description  TEXT,
    current_volume      TEXT,                    -- "120 owner ages" or "3,700 TPE scores"
    growth_rate         TEXT,                    -- "~15 per week via enrichment"
    protection_notes    TEXT,                    -- How to protect this asset
    acceleration_strategy TEXT,                  -- How to grow this faster
    -- Tracking
    last_assessed_at    TIMESTAMPTZ DEFAULT NOW(),
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly moat snapshots for trend analysis
CREATE TABLE IF NOT EXISTS data_moat_snapshots (
    id                  SERIAL PRIMARY KEY,
    snapshot_month      DATE NOT NULL,           -- First of the month
    asset_name          TEXT NOT NULL,
    volume_count        INTEGER,                 -- How many records in this asset
    moat_score          NUMERIC,
    uniqueness_delta    INTEGER,                 -- Change from previous month
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_moat_snapshots_month_asset
    ON data_moat_snapshots(snapshot_month, asset_name);
```

#### 34.3 -- David's Data Moat Today (March 2026)

| Asset | Uniqueness | Defensibility | Compounding | MOAT SCORE | Verdict |
|-------|-----------|---------------|-------------|------------|---------|
| Approval patterns | 100 | 100 | 80 | **94** | CROWN JEWEL |
| Ground truth (bounce/disconnect data) | 100 | 100 | 80 | **94** | CROWN JEWEL |
| Deal outcomes + dead deal reasons | 100 | 100 | 80 | **94** | CROWN JEWEL |
| Interaction history | 100 | 100 | 80 | **94** | CROWN JEWEL |
| TPE scoring model + weights | 100 | 80 | 60 | **82** | STRONG MOAT |
| Agent performance KPIs | 100 | 80 | 60 | **82** | STRONG MOAT |
| Title rep loan maturities | 80 | 80 | 40 | **68** | DEVELOPING |
| Owner ages | 60 | 40 | 20 | **42** | EARLY STAGE |
| Enriched contacts | 40 | 60 | 60 | **52** | DEVELOPING |
| Lease expirations (Lee internal) | 80 | 40 | 40 | **56** | DEVELOPING |
| CoStar property records | 0 | 0 | 0 | **0** | NO MOAT |

**Key insight:** David's strongest moat is not the data he *has* but the data he *generates through using the system*. Every approval, every rejection, every deal outcome, every phone call logged -- these are the irreplicable assets. After 12 months of active use, a competitor would need 12 months of the same decisions to replicate even the behavioral layer, and by then David will be 24 months ahead.

#### 34.4 -- Data Moat in 12 Months (March 2027 Projection)

With the AI system running 24/7:

| Asset | Today | 12-Month Projection | Growth Driver |
|-------|-------|---------------------|---------------|
| Approval patterns | ~0 decisions | ~10,000 decisions | 30/day x 365 |
| Ground truth | ~0 outcomes | ~3,000 verified outcomes | Bounces + disconnects + manual |
| Deal outcomes | ~207 deals | ~260 deals | 4-5 new deals/month |
| Interaction history | ~2,000 interactions | ~8,000 interactions | Team activity + AI-logged |
| Enriched contacts | ~0 verified | ~5,000 verified contacts | Enricher + NeverBounce pipeline |
| Owner ages | ~120 | ~600 | Enricher + manual research |
| Knowledge base entries | 0 | ~200 tested lessons | Strategy sessions + Chief of Staff |
| Market model beliefs | 0 | ~50 validated theses | 1/week from strategy sessions |
| Predictive accuracy data | 0 | ~500 prediction outcomes | Predictive scoring with validation |

**12-month moat acceleration:** After one year, the system's behavioral data alone would take a competitor 2+ years to replicate (they'd need to build the system, staff the agents, AND make 10,000 approval decisions). The knowledge base and market model are essentially unreplicable -- they encode David's *thinking*, not just his data.

#### 34.5 -- Moat Acceleration Strategies (Intentional Data Collection)

**Strategy 1: Systematic Owner Age Research**
- Owner age is the highest-leverage gap (adds 5-20 TPE points per fill, only 3.2% populated)
- Enricher should prioritize owner age lookup for high-TPE properties first
- Each age found increases both the enrichment moat AND the TPE accuracy moat
- Target: 100% coverage of TPE top 200 properties within 90 days

**Strategy 2: Outcome Tracking on Every Outreach**
- Every email, call, and voicemail should be tracked to outcome: connected, no answer, wrong number, bounced, replied, meeting set, deal generated
- This creates ground truth that no competitor has
- Feed outcome data back into the confidence calibration engine (Prompt 17)
- Even negative outcomes are valuable (wrong numbers tell you which sources are unreliable)

**Strategy 3: Competitive Win/Loss Documentation**
- When David loses a deal to a competitor, log: who won, why, what they had that he didn't
- When David wins, log: what advantage he had, what data drove the approach
- This feeds the competitive intelligence loop (Prompt 23) and creates an unreplicable win/loss database

**Strategy 4: Market Thesis Testing Cadence**
- One strategy session per week minimum
- Each session produces at least one knowledge base entry
- Over 12 months: ~50 tested, validated market beliefs that no other broker has systematically proven
- These compound: future strategy sessions reference past conclusions

**Strategy 5: Data Asset Protection**
- Crown jewel data (approval patterns, ground truth, deal outcomes) should be backed up to encrypted storage separate from the main database
- Agent performance KPIs should never be exposed through public APIs
- TPE weights are intellectual property -- never include in client-facing outputs

#### 34.6 -- Monthly Moat Dashboard

Add a "Data Moat" card to the AI Ops page or Settings:

- **Overall Moat Score:** Weighted average across all assets (target: 60+ by month 6)
- **Monthly Delta:** +/- change, with top 3 contributors
- **Moat Velocity Chart:** Line chart showing overall moat score over time
- **Asset Breakdown:** Bar chart of each asset's moat score
- **Acceleration Targets:** "Owner ages: 120/600 target (20%). Ground truth: 0/3,000 (0%)."
- **Protection Status:** Green/yellow/red indicators for backup status of crown jewel assets

### Priority and Effort

| Component | Effort | Priority |
|-----------|--------|----------|
| `data_moat_registry` + seed data | 2 hours | Medium |
| `data_moat_snapshots` + monthly cron | 2 hours | Medium |
| Initial moat assessment (seed the registry) | 1 hour | Medium |
| Moat dashboard card | 4 hours | Low |
| Acceleration strategy implementation | Ongoing | High (embedded in other work) |
| **Total new work** | **~1.5 days** | |

---

<a id="prompt-35"></a>
## PROMPT 35: Predictive Deal Scoring -- From Reactive to Proactive

### Current State Analysis

TPE (Transaction Probability Engine) scores the **current state** of a property:
- Lease expiring soon? Points.
- Owner is old? Points.
- Loan maturing? Points.

This is reactive. It tells David "this property has signals RIGHT NOW." But the best deals come from contacting owners BEFORE they decide to sell -- when they're thinking about it but haven't listed yet. The goal is to predict which properties will transact in 3/6/12 months **before the traditional signals appear**.

**What TPE does today (from `tpe_config` and the SQL VIEW):**
- 5-category scoring (Lease 30, Ownership 25, Age 20, Growth 15, Stress 10)
- Blended Priority (70% TPE + 30% commission)
- All weights configurable via `tpe_config` table
- Static: scores change only when underlying data changes (lease added, age found, etc.)

**What's missing:**

| Gap | Impact |
|-----|--------|
| **No temporal prediction** | TPE says "this property is interesting now" but not "this property will become interesting in 6 months" |
| **No historical pattern matching** | System doesn't analyze what deal-closing properties looked like 12 months before closing |
| **No pre-signal detection** | Early indicators (owner starting estate planning, tenant hiring in adjacent market) aren't tracked |
| **No probability calibration** | TPE scores are not calibrated probabilities -- a score of 80 doesn't mean 80% chance of transaction |
| **No expected value ranking** | Properties aren't ranked by probability x commission x time-to-close |
| **No validation framework** | When a prediction is right/wrong, there's no mechanism to learn from it |

### Proposed Design

#### 35.1 -- Predictive Transaction Model Architecture

```
                    PREDICTIVE SCORING ENGINE
                    (runs nightly at 2:00 AM)

Current State Data              Historical Pattern Data
(properties, contacts,          (deal_stage_history,
 companies, tpe_config,          closed deals, dead deals,
 loan_maturities, etc.)          tpe_score_snapshots)
         |                              |
         v                              v
  +-----------------+          +-------------------+
  | Feature          |          | Pattern Library   |
  | Extraction       |          | (what did closed  |
  | (compute ~40     |          |  deals look like  |
  | features per     |          |  6-12 months      |
  | property)        |          |  before closing?) |
  +--------+---------+          +---------+---------+
           |                              |
           +------------------------------+
                        |
                        v
              +-------------------+
              | Scoring Engine    |
              | - Pattern match   |
              | - Temporal decay  |
              | - Market context  |
              | - Expected value  |
              +--------+----------+
                       |
                       v
              +-------------------+
              | predictive_scores |
              | table (per        |
              | property, per     |
              | horizon)          |
              +-------------------+
```

#### 35.2 -- Feature Engineering (What Predicts a Transaction?)

Based on CRE domain knowledge and the available data in IE CRM:

**Ownership Signal Features (pre-sale indicators):**

| Feature | Signal | Lead Time |
|---------|--------|-----------|
| Owner age crossing 65/70 threshold | Estate/succession planning begins | 12-24 months |
| Hold duration crossing 10/15/20 year mark | Capital gains optimization window | 6-12 months |
| Trust entity + owner age 70+ | Estate planning pressure accelerates | 6-12 months |
| Out-of-area owner + vacancy increase | Management burden increases | 3-6 months |
| Owner's other properties trading | Portfolio rebalancing pattern | 3-6 months |
| Owner entity type change (LLC -> Trust) | Estate planning in progress | 6-12 months |

**Financial Stress Features (pre-distress indicators):**

| Feature | Signal | Lead Time |
|---------|--------|-----------|
| Loan maturity approaching (12-18 months out) | Refinance/sell decision window | 6-12 months |
| Rising vacancy in submarket | Rent pressure coming | 6-12 months |
| Property tax assessment increase > 15% | Cost pressure | 3-6 months |
| Insurance cost spike (from market data) | Operational squeeze | 3-6 months |
| Interest rate environment vs loan terms | Refinance shock potential | 6-12 months |

**Tenant Activity Features (pre-lease indicators):**

| Feature | Signal | Lead Time |
|---------|--------|-----------|
| Tenant headcount growth > 20% | Space expansion needed | 6-12 months |
| Lease expiration 18-30 months out | Decision window approaching | 6-12 months |
| Tenant hiring in new geographic area | Relocation signal | 9-12 months |
| Tenant industry growth trend | Expansion capability | 12+ months |
| Multiple tenants in building with expirations within 12 months of each other | Potential building sale/repositioning | 6-12 months |

**Market Context Features:**

| Feature | Signal | Lead Time |
|---------|--------|-----------|
| Submarket vacancy trending down | Landlords gaining confidence to sell at peak | 6-12 months |
| Comparable sales accelerating | Market timing signal | 3-6 months |
| New construction completions planned | Supply increase may trigger sales before competition | 12-18 months |
| Cap rate compression in submarket | Seller-favorable market | 6-12 months |

#### 35.3 -- Predictive Scoring Tables

```sql
-- Predictive transaction scores
CREATE TABLE IF NOT EXISTS predictive_scores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id         UUID NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    -- Prediction horizons
    prob_3mo            NUMERIC(5,4),           -- 0.0000 to 1.0000
    prob_6mo            NUMERIC(5,4),
    prob_12mo           NUMERIC(5,4),
    -- Transaction type prediction
    predicted_type      TEXT CHECK (predicted_type IN ('sale', 'lease', 'both')),
    type_confidence     NUMERIC(5,4),
    -- Expected value (probability x estimated commission)
    ev_3mo              NUMERIC(12,2),           -- Dollar amount
    ev_6mo              NUMERIC(12,2),
    ev_12mo             NUMERIC(12,2),
    -- Feature importance (which signals drove this score)
    top_features        JSONB DEFAULT '[]',      -- [{feature, value, weight, contribution}]
    -- Leading indicators detected
    leading_indicators  JSONB DEFAULT '[]',      -- [{indicator, detected_at, description}]
    -- Model metadata
    model_version       TEXT NOT NULL,
    scored_at           TIMESTAMPTZ DEFAULT NOW(),
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_predictive_scores_property ON predictive_scores(property_id);
CREATE INDEX idx_predictive_scores_ev6 ON predictive_scores(ev_6mo DESC NULLS LAST);
CREATE INDEX idx_predictive_scores_prob6 ON predictive_scores(prob_6mo DESC NULLS LAST);
CREATE INDEX idx_predictive_scores_scored ON predictive_scores(scored_at);

-- Only keep the latest score per property (upsert pattern)
CREATE UNIQUE INDEX idx_predictive_scores_latest
    ON predictive_scores(property_id, model_version);

-- Prediction validation tracking
CREATE TABLE IF NOT EXISTS prediction_outcomes (
    id                  SERIAL PRIMARY KEY,
    property_id         UUID NOT NULL,
    -- What was predicted
    prediction_date     DATE NOT NULL,
    predicted_prob_6mo  NUMERIC(5,4),
    predicted_type      TEXT,
    predicted_ev        NUMERIC(12,2),
    model_version       TEXT NOT NULL,
    -- What actually happened
    actual_outcome      TEXT CHECK (actual_outcome IN (
        'sale_closed', 'lease_signed', 'listing_taken',
        'no_transaction', 'pending', 'unknown'
    )),
    outcome_date        DATE,
    outcome_details     JSONB DEFAULT '{}',      -- {sale_price, buyer, lease_rate, etc.}
    -- Scoring
    prediction_correct  BOOLEAN,                 -- Did transaction occur within predicted horizon?
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prediction_outcomes_property ON prediction_outcomes(property_id);
CREATE INDEX idx_prediction_outcomes_date ON prediction_outcomes(prediction_date);
CREATE INDEX idx_prediction_outcomes_correct ON prediction_outcomes(prediction_correct);

-- Feature weight history (tracks how the model evolves)
CREATE TABLE IF NOT EXISTS predictive_feature_weights (
    id                  SERIAL PRIMARY KEY,
    model_version       TEXT NOT NULL,
    feature_name        TEXT NOT NULL,
    weight              NUMERIC(8,4),
    predictive_power    NUMERIC(5,4),           -- Measured correlation with outcomes
    sample_size         INTEGER,
    effective_date      DATE NOT NULL,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feature_weights_version ON predictive_feature_weights(model_version);
CREATE INDEX idx_feature_weights_feature ON predictive_feature_weights(feature_name);
```

#### 35.4 -- Scoring Algorithm (Implementable Without ML)

The cold-start problem is real: David has ~207 deals but limited historical TPE-score-at-time-of-origination data. The algorithm must work with sparse data and improve as outcomes accumulate.

**Phase 1: Heuristic Scoring (Months 1-6, before sufficient outcome data)**

Use domain-knowledge weights, similar to how TPE works today but projected forward:

```
PREDICTIVE_SCORE_6MO =
    ownership_momentum(0.25)     -- Age approaching threshold, hold duration increasing
  + financial_pressure(0.25)     -- Loan maturity within 18mo, stress indicators
  + tenant_activity(0.20)        -- Lease expiring, growth signals
  + market_context(0.15)         -- Submarket conditions, comp activity
  + relationship_signal(0.15)    -- Recent interactions, engagement level

Each component scored 0.00 to 1.00.
Final score = weighted sum, output as probability 0.00 to 1.00.

CALIBRATION: Scale so that the top 5% of properties get scores > 0.30
(meaning ~30% predicted probability of transacting in 6 months).
Based on IE industrial market: ~5% of 3,700 properties = ~185 transactions/year,
so base rate is ~5% per 6 months for any given property.
```

**Phase 2: Calibrated Scoring (Month 6+, after 100+ outcomes)**

Once `prediction_outcomes` has enough data:
1. Bin properties by predicted score (0-10%, 10-20%, etc.)
2. Compare predicted probability to actual transaction rate per bin
3. Apply calibration curve (Platt scaling or isotonic regression, implementable as a lookup table)
4. Adjust feature weights based on actual predictive power

**Expected Value Calculation:**

```
EV_6MO = prob_6mo x estimated_commission x time_discount_factor

WHERE:
  estimated_commission = from TPE ECV model (already computed)
  time_discount_factor = 1.0 for 3mo, 0.95 for 6mo, 0.85 for 12mo
    (reflects uncertainty and time value of David's effort)
```

#### 35.5 -- Pre-Signal Outreach Generation

The killer application: contacting owners BEFORE they decide to sell.

**Auto-generated outreach triggers:**

| Trigger | Outreach Template | Timing |
|---------|------------------|--------|
| Owner turning 65 in next 12 months | "Estate & succession planning" framing | 12 months before birthday |
| Hold duration crossing 15 years | "Capital gains optimization" framing | 3 months before anniversary |
| Loan maturing in 12-18 months | "Refinance vs. sell analysis" framing | 12 months before maturity |
| Tenant lease expiring in 18-24 months | "Lease renewal strategy" framing | 18 months before expiration |
| Submarket vacancy hitting 5-year low | "Peak market timing" framing | When vacancy data updates |

Each trigger creates a `sandbox_outreach` entry with pre-written email, tagged with `source = 'predictive_scoring'`. Goes through normal approval workflow.

#### 35.6 -- Validation Framework

**The months-delayed ground truth problem:** If you predict Property X will transact in 6 months, you won't know if you're right for 6 months. Design:

1. **Nightly snapshot:** Every night, snapshot the current `predictive_scores` for all properties with `prob_6mo > 0.05`. Store in `prediction_outcomes` with `actual_outcome = 'pending'`.

2. **Outcome detection:** When a deal is created or a sale comp is added to any property, check `prediction_outcomes` for matching predictions. Mark as `prediction_correct = TRUE` if the transaction occurred within the predicted horizon.

3. **Quarterly calibration review:** Every 3 months, analyze all predictions that have matured (their horizon has passed). Compute:
   - Brier score (calibration quality)
   - AUC (discrimination quality)
   - Precision at top-50 (are the highest-scored properties actually transacting?)

4. **Chief of Staff integration:** Include prediction accuracy in the morning briefing. "Predictive model accuracy: 23% of top-50 properties transacted within 6 months (vs. 5% base rate). 4.6x lift."

#### 35.7 -- Cold-Start Mitigation

**Problem:** No historical TPE-score-to-outcome data exists.

**Solutions:**
1. **Backfill from closed deals:** For each of David's ~207 existing deals, reconstruct what the property looked like 6-12 months before closing. Were there ownership signals? Stress signals? This creates a retrospective training set.

2. **Market-level base rates:** Use IE industrial market transaction data (available from CoStar) to establish base rates by property type, size, and submarket. Even without property-level predictions, knowing "20K-50K SF Ontario properties transact at 6% annually" provides a prior.

3. **Feature-level validation first:** Before building a composite model, validate individual features. "Do properties with owner age 70+ actually transact more frequently than properties with owner age 50?" If individual features have no predictive power, the composite won't either.

4. **Gradual rollout:** Start with the highest-confidence features only (loan maturity, lease expiration -- these have hard deadlines that mechanically drive transactions). Add softer features (owner age, hold duration) as validation data accumulates.

### Priority and Effort

| Component | Effort | Priority |
|-----------|--------|----------|
| `predictive_scores` + `prediction_outcomes` tables | 2 hours | High |
| Feature extraction queries | 1 day | High |
| Heuristic scoring engine (Phase 1) | 2 days | High |
| Nightly scoring cron job | 4 hours | High |
| Pre-signal outreach triggers | 4 hours | Medium |
| Backfill from closed deals | 1 day | Medium |
| Validation framework (quarterly review) | 4 hours | Medium |
| Calibrated scoring (Phase 2, month 6+) | 1 day | Low (future) |
| UI: predictive score column in Properties | 4 hours | Medium |
| **Total** | **~6 days** | |

---

<a id="prompt-36"></a>
## PROMPT 36: Knowledge Base -- Lessons That Compound

### Current State Analysis

IE CRM has three memory layers:
1. **Ephemeral state:** Claude Panel conversations (lost on refresh)
2. **Short-term memory:** Agent logs in `agent_logs` table (structured but not curated)
3. **Permanent storage:** CRM data (contacts, properties, deals, interactions)

**What's missing: structured lessons.** The system generates insights constantly -- from strategy sessions, from agent performance, from deal outcomes, from David's approval patterns -- but these insights evaporate. Nobody writes down "Trust-owned Fontana properties sell 30% faster when owner 70+" in a place where agents can query it before making decisions.

**How is this different from agent instructions?** Agent instructions (`agent.md` files) tell agents *how to work*. The Knowledge Base tells agents *what is true about this market*. Instructions are procedural ("verify email before submitting"). Knowledge is declarative ("NeverBounce has 15% false positive rate in San Bernardino County"). Instructions change when processes change. Knowledge changes when evidence changes.

**How is this different from the Market Model?** The Market Model (from strategy sessions) contains *theses being tested*. The Knowledge Base contains *lessons that have been validated*. A thesis graduates to the Knowledge Base when sufficient evidence supports it. The Knowledge Base is the "graduated" layer of the Market Model.

### Proposed Design

#### 36.1 -- Knowledge Base Data Model

```sql
-- Migration 009_knowledge_base.sql

CREATE TABLE IF NOT EXISTS knowledge_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Content
    lesson              TEXT NOT NULL,           -- The declarative statement
    explanation         TEXT,                    -- Why this is true, with context
    category            TEXT NOT NULL CHECK (category IN (
        'market_pattern',       -- "Trust-owned Fontana properties sell 30% faster when owner 70+"
        'source_reliability',   -- "NeverBounce has 15% false positive rate in SB County"
        'outreach_effectiveness', -- "Lease expiration outreach gets 3x response rate vs cold"
        'scoring_insight',      -- "Owner age is 2.3x more predictive than hold duration for sales"
        'agent_optimization',   -- "Enricher should skip LLCs with 'Holdings' in the name"
        'competitive_intel',    -- "CBRE focuses on Ontario/Rancho 100K+ SF, ignores sub-30K"
        'seasonal_pattern',     -- "Q4 deal closings spike 40% due to 1031 exchange deadlines"
        'process_learning'      -- "Door knocks in Fontana industrial parks get 2x connect rate vs calls"
    )),
    -- Evidence & confidence
    confidence          TEXT NOT NULL DEFAULT 'hypothesis' CHECK (confidence IN (
        'hypothesis',    -- Proposed, not yet tested (from strategy session or observation)
        'emerging',      -- Some supporting evidence (2-5 data points)
        'established',   -- Strong evidence (5+ data points, statistically meaningful)
        'proven',        -- Extensively validated (20+ data points, tested across time periods)
        'deprecated'     -- Was true, evidence now suggests otherwise
    )),
    evidence_count      INTEGER DEFAULT 0,       -- Number of supporting data points
    evidence_links      JSONB DEFAULT '[]',      -- [{type, id, description, date}]
    counter_evidence    JSONB DEFAULT '[]',      -- Contradicting evidence (important for honesty)
    -- Scope
    geography           TEXT[],                  -- ['Fontana', 'Ontario'] or ['IE-wide']
    property_types      TEXT[],                  -- ['Industrial'] or ['Industrial', 'Flex']
    time_period         TEXT,                    -- "2025-2026" or "all-time"
    -- Impact
    affects_agents      TEXT[],                  -- ['enricher', 'matcher', 'researcher']
    affects_scoring     BOOLEAN DEFAULT FALSE,   -- Does this suggest a TPE weight change?
    tpe_implication     TEXT,                    -- "Increase trust entity weight from 10 to 14"
    -- Lifecycle
    source_type         TEXT NOT NULL CHECK (source_type IN (
        'strategy_session', 'chief_of_staff', 'agent_observation',
        'deal_outcome', 'david_manual', 'data_analysis'
    )),
    source_reference    TEXT,                    -- Session ID, log entry ID, etc.
    promoted_from_id    UUID,                    -- If graduated from a strategy session thesis
    -- Decay / strengthening
    last_validated_at   TIMESTAMPTZ,
    validation_interval INTERVAL DEFAULT '90 days', -- How often to re-check
    next_validation_at  TIMESTAMPTZ,
    decay_status        TEXT DEFAULT 'active' CHECK (decay_status IN (
        'active', 'needs_revalidation', 'weakening', 'deprecated'
    )),
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_category ON knowledge_entries(category);
CREATE INDEX idx_knowledge_confidence ON knowledge_entries(confidence);
CREATE INDEX idx_knowledge_decay ON knowledge_entries(decay_status);
CREATE INDEX idx_knowledge_geography ON knowledge_entries USING GIN(geography);
CREATE INDEX idx_knowledge_types ON knowledge_entries USING GIN(property_types);
CREATE INDEX idx_knowledge_agents ON knowledge_entries USING GIN(affects_agents);
CREATE INDEX idx_knowledge_validation ON knowledge_entries(next_validation_at);

-- Knowledge validation events (evidence that strengthens or weakens an entry)
CREATE TABLE IF NOT EXISTS knowledge_validations (
    id                  SERIAL PRIMARY KEY,
    knowledge_id        UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
    -- Validation result
    direction           TEXT NOT NULL CHECK (direction IN ('supports', 'contradicts', 'neutral')),
    evidence_type       TEXT NOT NULL CHECK (evidence_type IN (
        'deal_closed', 'deal_lost', 'outreach_response', 'enrichment_accuracy',
        'agent_kpi', 'data_analysis', 'david_observation', 'market_data'
    )),
    description         TEXT NOT NULL,           -- What happened
    data_reference      JSONB DEFAULT '{}',      -- {table, id, details}
    -- Impact on confidence
    confidence_before   TEXT,
    confidence_after    TEXT,
    -- Timestamps
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_validations_entry ON knowledge_validations(knowledge_id);
CREATE INDEX idx_knowledge_validations_direction ON knowledge_validations(direction);
```

#### 36.2 -- How Agents Query the Knowledge Base

Every agent reads relevant knowledge entries at the start of each processing cycle. The query is scoped to the agent and the entity being processed:

**Enricher (before processing a property/contact):**
```sql
SELECT lesson, confidence, evidence_count
FROM knowledge_entries
WHERE 'enricher' = ANY(affects_agents)
  AND decay_status = 'active'
  AND confidence IN ('emerging', 'established', 'proven')
  AND (geography && ARRAY['Fontana'] OR geography && ARRAY['IE-wide'])
ORDER BY
  CASE confidence
    WHEN 'proven' THEN 1
    WHEN 'established' THEN 2
    WHEN 'emerging' THEN 3
  END,
  evidence_count DESC
LIMIT 10;
```

Returns entries like:
- "NeverBounce has 15% false positive rate in San Bernardino County. Use BeenVerified as secondary verification." (proven, 47 evidence points)
- "LLCs with 'Holdings' in the name are 80% likely to be registered agent services, not real contacts." (established, 12 evidence points)

**Matcher (before drafting outreach):**
```sql
SELECT lesson, confidence, evidence_count
FROM knowledge_entries
WHERE 'matcher' = ANY(affects_agents)
  AND category IN ('outreach_effectiveness', 'market_pattern', 'seasonal_pattern')
  AND decay_status = 'active'
ORDER BY confidence DESC, evidence_count DESC
LIMIT 10;
```

Returns entries like:
- "Lease expiration outreach gets 3x response rate vs cold outreach. Always reference the specific expiration date." (proven, 89 evidence points)
- "Estate planning framing works better than 'sell your property' for trust owners." (emerging, 4 evidence points)

**Chief of Staff (in morning briefing preparation):**
```sql
SELECT lesson, confidence, evidence_count, decay_status, next_validation_at
FROM knowledge_entries
WHERE decay_status IN ('needs_revalidation', 'weakening')
   OR (confidence = 'hypothesis' AND created_at < NOW() - INTERVAL '30 days')
ORDER BY next_validation_at ASC
LIMIT 5;
```

Returns entries needing attention:
- "Q4 deal closings spike 40% due to 1031 deadlines" -- last validated 95 days ago, needs revalidation
- "Door knocks get 2x connect rate in Fontana" -- hypothesis from 35 days ago, never tested

#### 36.3 -- Knowledge Entry Lifecycle

```
CREATION:
  Strategy session concludes with insight → hypothesis
  Chief of Staff observes agent KPI pattern → hypothesis
  Deal closes and reveals pattern → emerging
  David manually adds a lesson → emerging (David's experience = evidence)

STRENGTHENING:
  Each supporting data point → evidence_count++, add to evidence_links
  After 5 supporting data points → promote to 'established'
  After 20 supporting data points → promote to 'proven'
  Chief of Staff reviews and confirms → manual promotion

WEAKENING:
  Counter-evidence found → add to counter_evidence array
  If counter_evidence count > 30% of evidence_count → mark 'weakening'
  If counter_evidence count > 50% → mark 'deprecated'
  Chief of Staff reviews and overrides → manual deprecation

DECAY:
  Each entry has a validation_interval (default 90 days)
  When next_validation_at passes → mark 'needs_revalidation'
  Chief of Staff can:
    - Revalidate (reset timer, optionally adjust confidence)
    - Deprecate (evidence no longer holds)
    - Extend interval (well-established entries need less frequent checking)

REVALIDATION TRIGGERS:
  - Time-based: validation_interval expires
  - Event-based: market conditions change significantly
  - Performance-based: agent KPIs shift in ways that suggest knowledge is stale
```

#### 36.4 -- Knowledge Base vs Agent Instructions vs Market Model

| Dimension | Agent Instructions | Knowledge Base | Market Model |
|-----------|-------------------|----------------|--------------|
| **What it contains** | How to do work | What is true about this market | Theses being tested |
| **Who writes it** | Chief of Staff | Chief of Staff + Strategy Sessions + Automated | David + Houston in Strategy Mode |
| **Who reads it** | The specific agent | All agents (scoped by relevance) | Chief of Staff + Morning Briefing |
| **Format** | Procedural markdown | Declarative entries with evidence | Session transcripts with verdicts |
| **Change trigger** | Agent performance drops | New evidence (supporting or contradicting) | Strategy session concludes |
| **Persistence** | Overwritten on each version | Permanent with decay lifecycle | Archived after conclusion |
| **Example** | "Submit with confidence >= 70" | "NeverBounce FP rate is 15% in SB County" | "Fontana trust owners sell 30% faster" |
| **Interaction** | Reads from knowledge base | Feeds into instruction updates | Graduates to knowledge base |

#### 36.5 -- Chief of Staff Curation Protocol

The Chief of Staff has a new responsibility: Knowledge Base curation. In the nightly review:

1. **Promote KPI patterns:** If agent_daily_kpis shows a consistent pattern for 7+ days (e.g., "Enricher confidence scores are 20% higher when BeenVerified data is less than 6 months old"), create a knowledge entry.

2. **Promote deal patterns:** When a deal closes, analyze all linked entities and identify what was unique about this deal's path. Create knowledge entries for reusable patterns.

3. **Revalidate expiring entries:** Review any entries where `next_validation_at < NOW()`. Query current data to check if the lesson still holds.

4. **Surface for David:** In the morning briefing, include a "Knowledge Digest" section:
   - New entries (hypothesis): "2 new lessons from this week's strategy session"
   - Promotions: "1 lesson promoted from 'emerging' to 'established'"
   - Needing revalidation: "3 entries haven't been validated in 90+ days"
   - Deprecated: "1 lesson deprecated based on counter-evidence"

#### 36.6 -- Automated Knowledge Generation

Beyond manual and Chief-of-Staff-driven entries, the system can auto-generate hypotheses:

**From enrichment_ground_truth:**
```sql
-- Auto-detect source reliability patterns
-- Run weekly as part of Chief of Staff review

WITH source_accuracy AS (
    SELECT
        source,
        geography,
        COUNT(*) AS total,
        SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END) AS correct,
        ROUND(100.0 * SUM(CASE WHEN outcome = 'correct' THEN 1 ELSE 0 END) / COUNT(*), 1) AS accuracy_pct
    FROM enrichment_ground_truth
    WHERE created_at > NOW() - INTERVAL '90 days'
    GROUP BY source, geography
    HAVING COUNT(*) >= 10
)
SELECT * FROM source_accuracy
WHERE accuracy_pct < 80 OR accuracy_pct > 95;
-- Low accuracy: create "source X is unreliable in geography Y" entry
-- High accuracy: create "source X is highly reliable in geography Y" entry
```

**From deal outcomes:**
```sql
-- Auto-detect property characteristics that correlate with deal closure
-- Run monthly

WITH deal_properties AS (
    SELECT p.*, d.status, d.type AS deal_type
    FROM deals d
    JOIN deal_properties dp ON d.id = dp.deal_id
    JOIN properties p ON dp.property_id = p.property_id
    WHERE d.status = 'Closed'
),
closed_vs_all AS (
    SELECT
        city,
        ROUND(AVG(CASE WHEN dp.status = 'Closed' THEN 1 ELSE 0 END)::numeric, 3) AS close_rate,
        COUNT(*) AS sample_size
    FROM properties p
    LEFT JOIN deal_properties dp ON p.property_id = dp.property_id
    GROUP BY city
    HAVING COUNT(*) >= 20
)
SELECT * FROM closed_vs_all
WHERE close_rate > 0.10  -- Cities with notably high close rates
ORDER BY close_rate DESC;
-- "Properties in [city] have a [X]% close rate, 2x the market average"
```

**From outreach engagement:**
```sql
-- Auto-detect outreach patterns that get responses
SELECT
    so.match_reason,
    COUNT(*) AS total_sent,
    SUM(CASE WHEN eq.replied_at IS NOT NULL THEN 1 ELSE 0 END) AS replies,
    ROUND(100.0 * SUM(CASE WHEN eq.replied_at IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 1) AS reply_rate
FROM sandbox_outreach so
JOIN outbound_email_queue eq ON eq.sandbox_outreach_id = so.id
WHERE eq.status = 'sent'
GROUP BY so.match_reason
HAVING COUNT(*) >= 10
ORDER BY reply_rate DESC;
-- "Outreach based on [reason] gets [X]% reply rate"
```

#### 36.7 -- UI: Knowledge Base Page

New page in IE CRM (nav position: between AI Ops and Settings):

1. **Knowledge Feed:** Scrollable list of all active entries, sorted by confidence (proven first). Each card shows:
   - Lesson text (bold)
   - Category badge (colored)
   - Confidence level (progress bar: hypothesis -> emerging -> established -> proven)
   - Evidence count with supporting/contradicting ratio
   - Geography and property type tags
   - Last validated date
   - Agents affected

2. **Filters:** By category, confidence level, geography, property type, decay status, agent

3. **Detail view:** Click an entry to see:
   - Full explanation
   - Evidence links (clickable to CRM records)
   - Counter-evidence
   - Validation history timeline
   - TPE implication (if any)
   - "Validate Now" button (queues for Chief of Staff review)

4. **Add Entry:** Manual entry form for David to add lessons from his experience

5. **Dashboard cards:**
   - Total active entries by confidence level
   - Knowledge growth chart (entries over time)
   - Entries needing revalidation
   - Top 5 proven lessons (quick reference)

### Priority and Effort

| Component | Effort | Priority |
|-----------|--------|----------|
| `knowledge_entries` + `knowledge_validations` tables | 2 hours | High |
| Agent query protocol (knowledge at start of cycle) | 4 hours | High |
| Chief of Staff curation protocol in agent.md | 2 hours | High |
| Auto-generation queries (source, deal, outreach patterns) | 1 day | Medium |
| Knowledge Base UI page | 2 days | Medium |
| Strategy session -> knowledge entry pipeline | 4 hours | Medium |
| Decay/revalidation cron job | 4 hours | Medium |
| Morning briefing integration | 2 hours | Medium |
| **Total** | **~5 days** | |

---

<a id="new-tables"></a>
## New Tables Summary (Round 3)

| Table | Prompt | Purpose | Key Columns |
|-------|--------|---------|-------------|
| `strategy_sessions` | 33 | Strategy session metadata and outcomes | session_type, initial_thesis, final_thesis, thesis_verdict, outputs, confidence |
| `strategy_session_turns` | 33 | Individual turns with data snapshots | session_id, role, phase, content, data_snapshot, sql_executed |
| `strategy_session_entities` | 33 | CRM entities discussed in sessions | session_id, entity_type, entity_id, role_in_session |
| `data_moat_registry` | 34 | Data asset inventory with moat scores | asset_name, uniqueness_score, defensibility_score, compounding_score, moat_score |
| `data_moat_snapshots` | 34 | Monthly moat score tracking | snapshot_month, asset_name, volume_count, moat_score |
| `predictive_scores` | 35 | Per-property transaction predictions | property_id, prob_3mo/6mo/12mo, ev_3mo/6mo/12mo, top_features, leading_indicators |
| `prediction_outcomes` | 35 | Prediction validation tracking | property_id, predicted_prob, actual_outcome, prediction_correct |
| `predictive_feature_weights` | 35 | Feature weight evolution | feature_name, weight, predictive_power, sample_size |
| `knowledge_entries` | 36 | Structured lessons with evidence and decay | lesson, category, confidence, evidence_links, counter_evidence, decay_status |
| `knowledge_validations` | 36 | Evidence events that strengthen/weaken entries | knowledge_id, direction, evidence_type, description |

**Total new tables: 10**

---

<a id="integration-map"></a>
## Integration Map

```
STRATEGY SESSIONS (Prompt 33)
    |
    |-- Produces --> KNOWLEDGE BASE entries (Prompt 36)
    |-- Produces --> TPE weight proposals (tpe_config updates)
    |-- Produces --> Enrichment queue items (agent_priority_board)
    |-- Produces --> Campaign definitions (campaigns table)
    |-- References --> Past session conclusions (cross-session memory)
    |
KNOWLEDGE BASE (Prompt 36)
    |
    |-- Queried by --> All agents at start of each cycle
    |-- Curated by --> Chief of Staff (nightly)
    |-- Fed by --> Strategy sessions, deal outcomes, agent KPIs, ground truth
    |-- Informs --> Agent instructions (Chief of Staff rewrites)
    |-- Informs --> TPE weight adjustments (scoring_insight category)
    |-- Informs --> Predictive model feature weights
    |
PREDICTIVE SCORING (Prompt 35)
    |
    |-- Reads from --> TPE scores, properties, contacts, companies
    |-- Reads from --> Knowledge Base (feature weight adjustments)
    |-- Produces --> Pre-signal outreach (sandbox_outreach)
    |-- Validated by --> Deal outcomes, prediction_outcomes table
    |-- Featured in --> Morning briefing (top predictive opportunities)
    |-- Displayed in --> Properties table (new columns)
    |
DATA MOAT (Prompt 34)
    |
    |-- Measured by --> Monthly snapshot cron
    |-- Displayed in --> AI Ops or Settings dashboard
    |-- Acceleration strategies --> Drive enrichment priorities
    |-- Protection rules --> Inform security policy
    |-- Feeds --> Morning briefing (moat velocity)
```

---

<a id="priority"></a>
## Implementation Priority

### Recommended Build Order

**Phase 1 (Week 1-2): Foundation**
1. Knowledge Base tables + agent query protocol (Prompt 36 core)
2. Strategy Session tables + system prompt extension (Prompt 33 core)
3. Data moat registry + initial assessment (Prompt 34 seed)

**Phase 2 (Week 3-4): Scoring & UI**
4. Predictive scoring tables + heuristic engine (Prompt 35 core)
5. Strategy Mode UI in Claude Panel (Prompt 33 UI)
6. Knowledge Base UI page (Prompt 36 UI)

**Phase 3 (Month 2): Integration & Feedback**
7. Pre-signal outreach triggers (Prompt 35)
8. Automated knowledge generation queries (Prompt 36)
9. Session-to-knowledge pipeline (Prompt 33 -> 36)
10. Moat dashboard (Prompt 34 UI)
11. Prediction validation framework (Prompt 35)

**Phase 4 (Month 3+): Calibration**
12. Predictive model calibration with real outcomes (Prompt 35 Phase 2)
13. Knowledge decay/revalidation automation (Prompt 36)
14. Cross-session reference in strategy mode (Prompt 33)
15. Moat acceleration measurement (Prompt 34)

### Total Effort Across All Four Prompts

| Prompt | Core | UI | Integration | Total |
|--------|------|-----|-------------|-------|
| 33: Strategy Sessions | 1 day | 3 days | 1 day | ~5 days |
| 34: Data Moat | 0.5 day | 0.5 day | 0.5 day | ~1.5 days |
| 35: Predictive Scoring | 3 days | 0.5 day | 1.5 days | ~5 days |
| 36: Knowledge Base | 1.5 days | 2 days | 1.5 days | ~5 days |
| **Grand Total** | | | | **~16.5 days** |

### Dependencies on Prior Rounds

| This Round Needs | From Round |
|-----------------|------------|
| `agent_daily_kpis` table | Round 1, Tier 4 |
| `enrichment_ground_truth` table | Round 1, Tier 4 |
| `tpe_score_snapshots` table | Round 1, Tier 5 |
| `deal_stage_history` table | Round 1, Tier 5 |
| Agent feedback digest infrastructure | Round 2, Tier 8 |
| Entity context cache | Round 2, Tier 9 |

### What Makes This Round Different

Rounds 1 and 2 built plumbing and feedback loops. Round 3 builds **the brain**:

- **Strategy Sessions** make David's thinking *structured and persistent* instead of ephemeral
- **Data Moat** makes competitive advantage *measurable and intentional* instead of accidental
- **Predictive Scoring** makes the system *proactive instead of reactive* -- contacting owners before they decide to sell
- **Knowledge Base** makes lessons *compound instead of evaporate* -- the system gets smarter every month in ways that can never be replicated by a competitor

After Round 3, the IE CRM is no longer a CRM with AI features. It is an **intelligence platform** that happens to store CRM data.

---

*Round 3 of 3 — Strategic Layer Complete*
*Created: March 13, 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
*Mudge Team CRE — Built by David Mudge Jr*
