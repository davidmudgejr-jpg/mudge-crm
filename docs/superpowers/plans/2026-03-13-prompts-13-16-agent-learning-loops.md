# Prompts 13-16: Agent Learning Loops, Source Discovery, False Negatives & Shared Context
## Deep System Architecture Analysis for IE CRM AI Master System
**Generated: March 13, 2026**
**Analyst: Claude Opus 4.6 — Systems Architecture Mode**

---

## PROMPT 13: Agent-Level Feedback Loops

### Current State

Every Tier 3 agent (Enricher, Researcher, Matcher, Scout) operates in fire-and-forget mode. They submit work to `sandbox_*` tables and never learn what happened to it. The only entity that reads outcomes is the Chief of Staff during its 6 AM daily review, and even that is limited to parsing the Logger's daily markdown summary and eyeballing rejection patterns.

What exists today:

- **Submission path:** Agent writes to `sandbox_contacts`, `sandbox_enrichments`, `sandbox_signals`, or `sandbox_outreach` with a `confidence_score` and `notes`.
- **Review path:** Tier 2 (Ralph Loop) approves/rejects items, writing to `status`, `reviewed_by`, `reviewed_at`, `review_notes`.
- **Feedback path:** Zero. No agent reads its own approval/rejection data. No structured feedback is stored in a format agents can consume. The `review_notes` field exists but no agent queries it.

The ROADMAP.md Tier 4 items (`agent_daily_kpis` table, `enrichment_ground_truth` table) are designed but not built. Even when built, they feed the Chief of Staff, not the individual agents.

### Gap Analysis

| Gap | Impact |
|-----|--------|
| Enricher submits a contact with confidence 85, gets rejected for "registered agent service" — Enricher has no idea and will repeat the same mistake | Systematic false positives persist until Chief of Staff manually rewrites agent.md |
| Matcher drafts outreach that Tier 2 rejects for "too salesy" — Matcher keeps drafting in the same tone | Outreach quality plateaus; human review becomes a bottleneck |
| Researcher submits 30 signals per day, 25 get rejected as low-relevance — Researcher doesn't know its signal-to-noise ratio | Compute waste; Researcher keeps scanning the same low-value sources |
| No agent knows which of its previous submissions led to real outcomes (deal, reply, meeting) | Zero calibration between confidence scores and actual value delivered |
| Chief of Staff rewrites are blunt instruments — it can change instructions but can't give an agent a targeted "your last 5 submissions failed for reason X" | Instruction rewrites are global when targeted feedback would be more effective |

### Proposed Design

#### New Table: `agent_feedback_digest`

```sql
CREATE TABLE IF NOT EXISTS agent_feedback_digest (
  id SERIAL PRIMARY KEY,
  -- Target agent
  agent_name TEXT NOT NULL,
  -- Time window this digest covers
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  -- Scorecard metrics
  items_submitted INTEGER DEFAULT 0,
  items_approved INTEGER DEFAULT 0,
  items_rejected INTEGER DEFAULT 0,
  items_pending INTEGER DEFAULT 0,
  approval_rate DECIMAL(5,2),           -- 0.00 to 100.00
  avg_confidence_approved DECIMAL(5,2),
  avg_confidence_rejected DECIMAL(5,2),
  -- Rejection breakdown (structured, not prose)
  rejection_reasons JSONB DEFAULT '[]',
  -- Example: [
  --   {"reason": "registered_agent_service", "count": 4, "example_id": 234},
  --   {"reason": "low_confidence_data", "count": 2, "example_id": 241},
  --   {"reason": "stale_data", "count": 1, "example_id": 248}
  -- ]

  -- Ground truth feedback (did approved items turn out correct?)
  ground_truth_correct INTEGER DEFAULT 0,
  ground_truth_incorrect INTEGER DEFAULT 0,
  ground_truth_examples JSONB DEFAULT '[]',
  -- Example: [
  --   {"sandbox_id": 189, "field": "email", "submitted": "john@old.com", "actual": "john@new.com", "source": "bounce"}
  -- ]

  -- Engagement outcomes (for Matcher)
  outreach_sent INTEGER DEFAULT 0,
  outreach_opened INTEGER DEFAULT 0,
  outreach_replied INTEGER DEFAULT 0,
  outreach_bounced INTEGER DEFAULT 0,
  top_performing_template TEXT,         -- subject line pattern that got replies

  -- Signal outcomes (for Researcher)
  signals_that_led_to_action INTEGER DEFAULT 0,
  signals_that_led_to_deal INTEGER DEFAULT 0,
  highest_value_signal_id INTEGER,

  -- Chief of Staff commentary (optional, added during daily review)
  cos_notes TEXT,
  cos_instruction_change TEXT,          -- "I changed rule X because of this data"

  -- Instruction version this digest covers
  instruction_version TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_digest_agent ON agent_feedback_digest(agent_name, period_end DESC);
CREATE INDEX idx_feedback_digest_created ON agent_feedback_digest(created_at);
```

#### New Table: `rejection_reason_taxonomy`

Standardizes rejection reasons so agents can pattern-match against them, rather than parsing free-text review_notes.

```sql
CREATE TABLE IF NOT EXISTS rejection_reason_taxonomy (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,            -- 'registered_agent_service'
  category TEXT NOT NULL,               -- 'data_quality', 'relevance', 'tone', 'stale', 'duplicate'
  description TEXT NOT NULL,            -- Human-readable explanation
  agent_guidance TEXT NOT NULL,         -- What the agent should do differently
  -- Example: "When Open Corporates returns a registered agent service (CT Corp, CSC, etc.),
  --           do NOT use that name as the contact. Look for the actual person behind the LLC."
  applies_to TEXT[] DEFAULT '{}',       -- Which agents this reason is relevant to
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with initial taxonomy
INSERT INTO rejection_reason_taxonomy (code, category, description, agent_guidance, applies_to) VALUES
('registered_agent_service', 'data_quality', 'Contact is a registered agent service, not a real person',
 'When Open Corporates registered agent is CT Corporation, CSC, National Registered Agents, or similar service companies, skip that name entirely. Search for the MANAGER or MEMBER of the LLC instead.',
 '{enricher}'),
('stale_data', 'data_quality', 'Data is outdated — source material older than 12 months',
 'Check source recency before submitting. If the most recent source is >12 months old, lower confidence by 20 points and note staleness.',
 '{enricher,researcher}'),
('low_relevance', 'relevance', 'Signal is not specific enough to the Inland Empire market',
 'Only submit signals that name a specific company + specific IE city/address. General CRE trends without IE specificity should be logged but not submitted.',
 '{researcher}'),
('tone_too_salesy', 'tone', 'Outreach draft sounds like a marketing email, not a personal note',
 'Rewrite: remove exclamation points, remove phrases like "exclusive opportunity" or "don''t miss out." Lead with the recipient''s specific situation, not the listing features.',
 '{matcher}'),
('duplicate_contact', 'duplicate', 'Contact already exists in CRM with similar or better data',
 'Before submitting, query CRM for exact email match AND fuzzy name match (first 3 chars of last name + same company). If match found with data <90 days old, skip.',
 '{enricher}'),
('wrong_geography', 'relevance', 'Property or company is outside target market',
 'Verify city is in Inland Empire (San Bernardino County or Riverside County) or adjacent markets (eastern LA County, northern Orange County) before submitting.',
 '{enricher,researcher}'),
('confidence_miscalibrated', 'data_quality', 'Agent scored high confidence but data was clearly wrong',
 'Review scoring criteria. If only 1 source confirms and no address match, max confidence should be 55, not 80+.',
 '{enricher}');
```

#### Digest Generation: Nightly Cron (3:30 AM, after KPI aggregation)

The Logger agent (or a cron job) generates the digest by querying sandbox tables:

```sql
-- Example: Generate Enricher digest for the past 24 hours
WITH submissions AS (
  SELECT * FROM sandbox_contacts
  WHERE agent_name = 'enricher'
  AND created_at >= NOW() - INTERVAL '24 hours'
),
approved AS (SELECT * FROM submissions WHERE status = 'approved' OR status = 'promoted'),
rejected AS (SELECT * FROM submissions WHERE status = 'rejected'),
-- Categorize rejections using taxonomy
rejection_analysis AS (
  SELECT
    r.review_notes,
    CASE
      WHEN r.review_notes ILIKE '%registered agent%' THEN 'registered_agent_service'
      WHEN r.review_notes ILIKE '%stale%' OR r.review_notes ILIKE '%outdated%' THEN 'stale_data'
      WHEN r.review_notes ILIKE '%duplicate%' THEN 'duplicate_contact'
      WHEN r.review_notes ILIKE '%geography%' OR r.review_notes ILIKE '%outside%' THEN 'wrong_geography'
      ELSE 'other'
    END AS reason_code,
    r.id
  FROM rejected r
)
SELECT
  COUNT(*) AS items_submitted,
  COUNT(*) FILTER (WHERE status IN ('approved','promoted')) AS items_approved,
  COUNT(*) FILTER (WHERE status = 'rejected') AS items_rejected,
  COUNT(*) FILTER (WHERE status = 'pending') AS items_pending,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('approved','promoted')) / NULLIF(COUNT(*) FILTER (WHERE status != 'pending'), 0), 2) AS approval_rate,
  ROUND(AVG(confidence_score) FILTER (WHERE status IN ('approved','promoted')), 2) AS avg_confidence_approved,
  ROUND(AVG(confidence_score) FILTER (WHERE status = 'rejected'), 2) AS avg_confidence_rejected
FROM submissions;
```

#### How Each Agent Reads Its Digest

Every agent checks for its latest digest at the START of each work cycle. This is a simple API call added to each agent's loop preamble:

```
GET /api/ai/feedback-digest?agent=enricher&limit=3
```

Returns the last 3 digests (covering ~3 days). The agent's instruction file is updated to include a **Feedback Awareness** section:

#### Agent Instruction Changes

**Enricher — add to agent.md:**

```markdown
## Feedback Awareness (Read Before Every Cycle)

At the start of every work cycle, read your feedback digest:
`GET /api/ai/feedback-digest?agent=enricher&limit=3`

Use this data to calibrate your current cycle:

### If approval_rate < 70%:
- Tighten confidence scoring by 10 points across the board
- Add extra notes to every submission explaining your reasoning
- Check rejection_reasons — if one reason dominates, address it specifically

### If avg_confidence_rejected > avg_confidence_approved:
- Your confidence scoring is miscalibrated — you're rating bad data too high
- Review the examples in ground_truth_examples for what you got wrong
- Lower thresholds until approved avg > rejected avg by at least 15 points

### If rejection_reasons contains a repeated code:
- Read the agent_guidance for that code from the rejection taxonomy
- Apply that guidance for the ENTIRE current cycle
- If the same reason appears in 3+ consecutive digests, flag for Chief of Staff

### If ground_truth_incorrect > 0:
- These are items you submitted, got approved, but turned out WRONG
- Study the examples: what went wrong in your verification?
- Adjust your workflow to catch these before submission

### Never ignore your scorecard. Your job is to get better, not just faster.
```

**Matcher — add to agent.md:**

```markdown
## Feedback Awareness

At the start of every work cycle, read your feedback digest:
`GET /api/ai/feedback-digest?agent=matcher&limit=3`

### Outreach Performance:
- If outreach_replied > 0: Study top_performing_template — replicate that subject line pattern
- If outreach_bounced > 0: Flag those contacts for Enricher re-verification (post to priority board)
- If outreach_opened > 0 but outreach_replied = 0: Your subject lines work but body text needs improvement

### Tone Feedback:
- If rejection_reasons includes 'tone_too_salesy': Rewrite ALL drafts this cycle with softer language
- Check cos_notes for specific guidance from the Chief of Staff
```

**Researcher — add to agent.md:**

```markdown
## Feedback Awareness

At the start of every work cycle, read your feedback digest:
`GET /api/ai/feedback-digest?agent=researcher&limit=3`

### Signal Quality:
- If approval_rate < 50%: You're producing more noise than signal. Tighten relevance filters.
- If signals_that_led_to_action > 0: Note which signal_types and sources produced those — weight them higher
- If signals_that_led_to_deal > 0: This is gold. Study what made that signal special and optimize for more like it.
- If rejection_reasons shows 'low_relevance' repeatedly: Only submit signals with named IE company + specific address
```

#### Integration with Chief of Staff Review

The Chief of Staff's daily review (Step 3: Analyze Rejection Patterns) now has structured data instead of parsing raw logs:

```
GET /api/ai/feedback-digest?limit=1  (all agents, latest digest)
```

The Chief of Staff:
1. Reviews each agent's scorecard
2. Adds `cos_notes` and `cos_instruction_change` commentary to the digest record
3. If an agent's approval_rate dropped >10 points since last instruction change, triggers auto-rollback
4. If a rejection reason appears in 5+ consecutive digests for the same agent, the agent.md instruction needs rewriting — the agent's self-correction isn't working

#### Data Flow

```
Agent submits to sandbox
        |
Tier 2 reviews: approve/reject with review_notes + reason_code
        |
Email system reports: bounce/open/reply (for Matcher items)
        |
Nightly cron (3:30 AM):
  1. Query sandbox tables for past 24h per agent
  2. Categorize rejections using rejection_reason_taxonomy
  3. Query outbound_email_queue for engagement data
  4. Query attribution_chain for deal outcomes
  5. Write agent_feedback_digest row per agent
        |
Next agent cycle (any time):
  1. Agent reads GET /api/ai/feedback-digest?agent=self&limit=3
  2. Agent applies calibration rules from its instruction file
  3. Agent adjusts behavior for current cycle
        |
Chief of Staff (6 AM):
  1. Reads all agent digests
  2. Adds commentary
  3. Decides if instruction rewrites are needed
  4. If rewrite needed AND agent self-correction isn't working, does surgical agent.md edit
```

### Implementation Priority: **HIGH** — This is the single highest-leverage change to the system.
### Effort: 2-3 days
- `agent_feedback_digest` table + `rejection_reason_taxonomy` table: 1 hour
- Digest generation cron job: 4 hours
- API endpoint (`GET /api/ai/feedback-digest`): 1 hour
- Tier 2 review UI change to include `reason_code` dropdown: 2 hours
- Agent instruction updates (all 4 agents): 2 hours
- Chief of Staff instruction updates: 1 hour
- Integration testing: 4 hours

---

## PROMPT 14: Autonomous Source Discovery & Evaluation

### Current State

The Scout monitors a hardcoded list of sources defined in `agent-templates/scout.md`:

**Daily:** Hacker News, Reddit (r/LocalLLaMA, r/MachineLearning, r/OpenClaw), X/Twitter, ArXiv, Ollama registry, HuggingFace trending

**Weekly:** OpenClaw Skills, MCP Server registries, GitHub trending, Product Hunt, CRE tech news, proptech funding

The Researcher similarly has a fixed set: CoStar, GlobeSt, Bisnow, local business journals, Commercial Cafe.

Neither agent has any mechanism to:
1. Discover new sources autonomously
2. Evaluate which existing sources are producing approved vs. rejected signals
3. Detect when a source has gone dead or become unreliable
4. Weight sources by reliability when calculating confidence scores
5. Propose new sources with evidence of their value

The Researcher's idle-cycle work (item #6: "Data Source Discovery") acknowledges this gap but provides no structured system for tracking source performance.

### Gap Analysis

| Gap | Impact |
|-----|--------|
| No source reliability tracking | A source could degrade in quality over months and nobody would notice |
| No dead-source detection | Scout could be scanning a site that hasn't updated in 6 months |
| No discovery mechanism beyond manual list updates | New CRE data platforms, new local business news sites, new X accounts go unnoticed |
| Source weighting is binary (scan or don't scan) instead of continuous | All sources treated equally regardless of hit rate |
| No citation chain following | When a high-value signal references another source, that source isn't evaluated for addition |
| Information overload risk | Adding sources without removing bad ones degrades signal-to-noise |

### Proposed Design

#### New Table: `agent_source_registry`

```sql
CREATE TABLE IF NOT EXISTS agent_source_registry (
  id SERIAL PRIMARY KEY,
  -- Source identity
  source_name TEXT NOT NULL,            -- 'CoStar', 'Bisnow', 'r/LocalLLaMA'
  source_url TEXT,                      -- Base URL if applicable
  source_type TEXT NOT NULL CHECK (source_type IN (
    'news_site', 'social_media', 'data_api', 'government_records',
    'rss_feed', 'subreddit', 'x_account', 'newsletter', 'model_registry',
    'github_repo', 'arxiv_category', 'mcp_registry', 'other'
  )),
  category TEXT NOT NULL CHECK (category IN (
    'cre_market',      -- Commercial real estate market data
    'ai_tools',        -- AI models, tools, frameworks
    'proptech',        -- CRE technology companies
    'local_business',  -- Inland Empire business news
    'data_enrichment', -- Contact/company data sources
    'general_tech'     -- General tech news relevant to our stack
  )),
  -- Which agent(s) use this source
  used_by TEXT[] NOT NULL DEFAULT '{}', -- '{researcher}', '{scout}', '{researcher,scout}'

  -- Reliability scoring (updated nightly)
  total_signals_produced INTEGER DEFAULT 0,
  signals_approved INTEGER DEFAULT 0,
  signals_rejected INTEGER DEFAULT 0,
  signals_led_to_action INTEGER DEFAULT 0,  -- approved + resulted in outreach/deal
  signals_led_to_deal INTEGER DEFAULT 0,
  reliability_score DECIMAL(5,2) DEFAULT 50.00,  -- 0-100, calculated
  -- Formula: (approved / total * 60) + (led_to_action / approved * 30) + recency_bonus(10)

  -- Freshness tracking
  last_signal_at TIMESTAMPTZ,           -- When this source last produced a signal
  last_checked_at TIMESTAMPTZ,          -- When an agent last scanned this source
  last_content_change_at TIMESTAMPTZ,   -- When the source itself last had new content
  check_frequency TEXT DEFAULT 'daily' CHECK (check_frequency IN (
    'hourly', 'every_6h', 'daily', 'weekly', 'monthly', 'paused', 'dead'
  )),

  -- Discovery metadata
  discovered_by TEXT,                   -- 'manual', 'scout_citation', 'researcher_citation', 'scout_discovery'
  discovered_from TEXT,                 -- Source that led to discovering this one
  discovery_evidence TEXT,              -- Why this source was added

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',         -- Being scanned regularly
    'probation',      -- New source, being evaluated (first 30 days)
    'degraded',       -- Reliability dropped, reduced scan frequency
    'paused',         -- Temporarily not scanning (rate limited, etc.)
    'dead',           -- Source is unreachable or hasn't updated in 90+ days
    'proposed',       -- Discovered but not yet approved for scanning
    'rejected'        -- Proposed but rejected by Chief of Staff
  )),
  status_reason TEXT,

  -- Cost (for paid sources)
  has_cost BOOLEAN DEFAULT FALSE,
  monthly_cost_cents INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_source_registry_status ON agent_source_registry(status);
CREATE INDEX idx_source_registry_category ON agent_source_registry(category);
CREATE INDEX idx_source_registry_reliability ON agent_source_registry(reliability_score DESC);
CREATE INDEX idx_source_registry_used_by ON agent_source_registry USING GIN(used_by);
CREATE UNIQUE INDEX idx_source_registry_name ON agent_source_registry(source_name);
```

#### Reliability Score Calculation (Nightly Cron)

```sql
-- Update reliability scores for all active sources
UPDATE agent_source_registry SET
  reliability_score = COALESCE(
    -- Approval component (60% weight): what fraction of signals got approved?
    CASE WHEN total_signals_produced > 0
      THEN (signals_approved::DECIMAL / total_signals_produced) * 60
      ELSE 30 END  -- neutral score for new sources
    +
    -- Action component (30% weight): of approved signals, how many led to action?
    CASE WHEN signals_approved > 0
      THEN (signals_led_to_action::DECIMAL / signals_approved) * 30
      ELSE 0 END
    +
    -- Recency bonus (10% weight): source produced a signal in last 7 days?
    CASE
      WHEN last_signal_at > NOW() - INTERVAL '7 days' THEN 10
      WHEN last_signal_at > NOW() - INTERVAL '30 days' THEN 5
      ELSE 0
    END,
    50  -- default if all NULL
  ),
  -- Dynamic frequency adjustment
  check_frequency = CASE
    WHEN reliability_score >= 80 AND status = 'active' THEN 'daily'
    WHEN reliability_score >= 60 AND status = 'active' THEN 'daily'
    WHEN reliability_score >= 40 AND status = 'active' THEN 'weekly'
    WHEN reliability_score < 40 AND total_signals_produced >= 10 THEN 'weekly'
    ELSE check_frequency
  END,
  -- Auto-degradation
  status = CASE
    WHEN last_content_change_at < NOW() - INTERVAL '90 days' AND status = 'active' THEN 'dead'
    WHEN reliability_score < 20 AND total_signals_produced >= 20 AND status = 'active' THEN 'degraded'
    WHEN status = 'probation' AND created_at < NOW() - INTERVAL '30 days'
         AND reliability_score >= 40 THEN 'active'  -- graduated from probation
    WHEN status = 'probation' AND created_at < NOW() - INTERVAL '30 days'
         AND reliability_score < 40 THEN 'rejected'  -- failed probation
    ELSE status
  END,
  updated_at = NOW();
```

#### Citation Chain Following (Scout/Researcher Workflow Addition)

When either agent finds a high-value signal (approved, confidence >= 75), it should examine the signal's source references:

**Add to `researcher.md` and `scout.md`:**

```markdown
## Source Discovery Protocol

When you find a signal with confidence >= 75 that cites or references a source NOT in your source registry:

1. Check source registry: `GET /api/ai/sources?name=<source_name>`
2. If source NOT found:
   a. Evaluate the source independently:
      - Is it a real, maintained publication/feed/account?
      - Does it cover CRE, IE business, AI/tech, or data enrichment?
      - Is it updated regularly (at least monthly)?
      - Is it accessible without paid subscription (preferred) or worth the cost?
   b. If evaluation passes, propose the source:
      ```
      POST /api/ai/sources/propose
      {
        "source_name": "IE Business News Daily",
        "source_url": "https://iebusinessnews.com",
        "source_type": "news_site",
        "category": "local_business",
        "discovered_from": "Signal #472 cited this source for ABC Corp expansion data",
        "discovery_evidence": "Source has published 3 IE-specific CRE articles in the past month.
                               Content is factual, names specific companies and addresses.",
        "used_by": ["researcher"]
      }
      ```
   c. Source enters `proposed` status — Chief of Staff reviews during daily cycle
3. If source IS found but status = 'dead' or 'degraded':
   a. Check if the source has recovered (new content available)
   b. If recovered, flag for re-evaluation via priority board
```

#### Dead Source Detection (Nightly)

```markdown
## Dead Source Detection Rules

Every nightly cycle, check all 'active' sources:

1. **No content change in 60 days** → status = 'degraded', reduce to weekly scan
2. **No content change in 90 days** → status = 'dead', stop scanning
3. **3 consecutive scan failures** (HTTP errors, timeouts) → status = 'paused', alert Scout
4. **Reliability score < 20 for 30 consecutive days** → status = 'degraded'
5. **Source returns paywall/login wall** → status = 'paused', note reason

When a source dies, Scout checks:
- Are there alternative sources covering the same category?
- If not, this is a coverage gap — flag for Chief of Staff
```

#### Dynamic Source Weighting

Agents adjust their confidence scores based on source reliability:

```markdown
## Source-Weighted Confidence

When calculating confidence for a signal, factor in source reliability:

base_confidence = [your normal scoring]
source_reliability = [from source registry, 0-100]

adjusted_confidence = base_confidence * (0.5 + (source_reliability / 200))

This means:
- Source with reliability 100: confidence multiplied by 1.0 (no change)
- Source with reliability 50: confidence multiplied by 0.75 (25% reduction)
- Source with reliability 0: confidence multiplied by 0.50 (50% reduction)

A signal from an unreliable source CAN still be high-confidence if the data itself is strong,
but the source penalty makes it harder. This is intentional.
```

#### Information Overload Prevention

```markdown
## Source Budget

Hard limits to prevent source sprawl:
- Max active CRE market sources: 15
- Max active AI/tools sources: 20
- Max active local business sources: 10
- Max total active sources: 50

When proposing a new source that would exceed the budget:
1. Compare the proposed source's expected reliability against the lowest-scoring active source in the same category
2. If proposed source looks stronger, recommend REPLACING the weakest source, not adding
3. Include both in the proposal: "Replace [weak source] (reliability: 23) with [new source] (evidence: ...)"

This forces quality over quantity. The source list should get BETTER over time, not BIGGER.
```

#### API Endpoints

```
GET  /api/ai/sources                  -- List all sources (filterable by status, category, used_by)
GET  /api/ai/sources/:name            -- Get specific source with full history
POST /api/ai/sources/propose          -- Propose new source (enters 'proposed' status)
PUT  /api/ai/sources/:id/status       -- Change source status (Chief of Staff only)
PUT  /api/ai/sources/:id/reliability  -- Update reliability metrics (nightly cron)
GET  /api/ai/sources/coverage-gaps    -- Categories with <3 active sources
```

### Implementation Priority: **MEDIUM** — High value but depends on feedback loops (Prompt 13) being in place first, because source reliability depends on knowing which signals got approved.
### Effort: 2 days
- `agent_source_registry` table + seed data: 2 hours
- Nightly reliability score calculation: 2 hours
- Source discovery protocol in agent instructions: 2 hours
- API endpoints: 3 hours
- Dead source detection cron: 1 hour
- Coverage gap detection: 1 hour
- Integration testing: 3 hours

---

## PROMPT 15: False Negative Detection (What Are We Missing?)

### Current State

The system measures what it finds and whether those findings were good (false positive detection via Tier 2 rejection). It has absolutely zero mechanism for detecting what it SHOULD have found but DIDN'T.

False negatives are invisible by definition. The system cannot know what it doesn't know. But there ARE signals that reveal false negatives — they just aren't captured:

1. **David manually adds a contact** that the Enricher should have found during its LLC scan
2. **David closes a deal** that wasn't AI-attributed — meaning the system had the data but didn't surface it
3. **David spots a market trend** that the Researcher should have caught days earlier
4. **David makes a phone call** based on personal knowledge that the system could have flagged
5. **A competitor closes a deal** in IE that the system should have flagged as an opportunity

None of these events currently feed back into the system as training data.

### Gap Analysis

| Gap | Impact |
|-----|--------|
| David manually adds contacts — system doesn't ask "why didn't I find this?" | Enricher doesn't learn about gaps in its data source coverage |
| David closes non-AI deals — system doesn't trace back to see what signals existed | Attribution chain only works forward (signal→deal), never backward (deal→what signals existed?) |
| David spots trends before the Researcher — no way to record "I noticed this first" | Researcher doesn't know its lag time vs. human intelligence |
| Manual CRM updates are treated as new data, not as corrections to system gaps | System can't distinguish "new information" from "information I should have had" |
| No structured way for David to say "the system should have caught this" | Most valuable feedback signal is completely lost |

### Proposed Design

#### The Core Insight

False negatives reveal themselves when a human takes action that the system should have taken first. The system needs to detect when David does something the agents should have done, and then ask: "Why didn't I do this?"

#### New Table: `missed_opportunity_log`

```sql
CREATE TABLE IF NOT EXISTS missed_opportunity_log (
  id SERIAL PRIMARY KEY,
  -- What was missed
  opportunity_type TEXT NOT NULL CHECK (opportunity_type IN (
    'contact_not_found',      -- David manually added a contact the Enricher should have found
    'signal_not_detected',    -- Market signal David noticed that Researcher missed
    'match_not_made',         -- Obvious property-contact match that Matcher missed
    'trend_missed',           -- Market trend David spotted before the system
    'deal_not_attributed',    -- Deal closed without AI involvement that could have been AI-sourced
    'outreach_not_suggested', -- David reached out to someone the system should have flagged
    'source_not_monitored'   -- Information came from a source the system doesn't watch
  )),
  -- Context
  entity_type TEXT,           -- 'contact', 'company', 'property', 'deal'
  entity_id INTEGER,          -- CRM record ID
  entity_name TEXT,           -- Human-readable name for quick reference
  description TEXT NOT NULL,  -- What happened and why the system should have caught it

  -- Root cause analysis (filled by Chief of Staff during review)
  root_cause TEXT CHECK (root_cause IN (
    'source_gap',             -- Data existed but in a source we don't monitor
    'filter_too_aggressive',  -- Our filters (pre-filter, relevance, geography) excluded this
    'confidence_too_low',     -- System found it but scored it too low to surface
    'timing_lag',             -- System would have found it but was too slow
    'logic_gap',              -- System's matching/enrichment logic has a blind spot
    'data_quality',           -- Source data was incomplete or incorrect
    'not_addressable',        -- System realistically couldn't have found this
    'pending_analysis'        -- Not yet analyzed
  )),
  root_cause_detail TEXT,     -- Specific explanation

  -- What agent should have caught this
  responsible_agent TEXT,     -- 'enricher', 'researcher', 'matcher', or NULL if unclear

  -- Remediation
  remediation_action TEXT,    -- What was changed to prevent this in the future
  remediation_type TEXT CHECK (remediation_type IN (
    'instruction_update',     -- Agent.md was changed
    'source_added',           -- New data source added
    'filter_adjusted',        -- Pre-filter rule changed
    'threshold_changed',      -- Confidence or relevance threshold adjusted
    'no_action',              -- Not addressable or too rare to warrant change
    'pending'
  )),

  -- Tracking
  detected_by TEXT NOT NULL DEFAULT 'manual' CHECK (detected_by IN (
    'manual',                 -- David flagged it
    'auto_contact_compare',   -- Automated detection: manual contact vs Enricher coverage
    'auto_deal_attribution',  -- Automated detection: unattributed deal
    'auto_signal_backtest',   -- Automated detection: signal existed but wasn't surfaced
    'chief_of_staff'          -- Chief of Staff identified during review
  )),

  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'analyzed', 'remediated', 'dismissed')),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  analyzed_at TIMESTAMPTZ,
  remediated_at TIMESTAMPTZ
);

CREATE INDEX idx_missed_opp_status ON missed_opportunity_log(status);
CREATE INDEX idx_missed_opp_type ON missed_opportunity_log(opportunity_type);
CREATE INDEX idx_missed_opp_agent ON missed_opportunity_log(responsible_agent);
CREATE INDEX idx_missed_opp_root ON missed_opportunity_log(root_cause);
CREATE INDEX idx_missed_opp_created ON missed_opportunity_log(created_at);
```

#### Automated False Negative Detection (4 Detectors)

**Detector 1: Manual Contact Compare (Nightly)**

When David manually creates a contact in the CRM (not promoted from sandbox), check if the Enricher should have found it.

```sql
-- Find contacts created manually in the last 24 hours
-- (created_at is recent, no matching sandbox_contacts with status='promoted' and promoted_to_id matching)
SELECT c.contact_id, c.first_name, c.last_name, c.company_name, c.email
FROM contacts c
WHERE c.created_at > NOW() - INTERVAL '24 hours'
AND c.contact_id NOT IN (
  SELECT promoted_to_id FROM sandbox_contacts
  WHERE status = 'promoted' AND promoted_to_id IS NOT NULL
)
AND c.created_by != 'ai_system';  -- need to add created_by column
```

For each manually-created contact, the Chief of Staff asks:
1. Is this contact's company already in the CRM? If yes, was it in the Enricher's queue?
2. Does this contact's LLC exist in public records (Open Corporates)? If yes, Enricher should have found it.
3. Was this contact's company mentioned in any Researcher signals? If yes, there was a convergence opportunity missed.

**Detector 2: Unattributed Deal Detection (Nightly)**

When a deal progresses past "Active Lead" stage without an `attribution_chain` entry:

```sql
-- Deals that advanced in the last 7 days with no AI attribution
SELECT d.id, d.name, d.status, d.updated_at
FROM deals d
LEFT JOIN attribution_chain ac ON ac.deal_id = d.id
WHERE d.updated_at > NOW() - INTERVAL '7 days'
AND d.status NOT IN ('Dead Lead', 'Deal fell through')
AND ac.id IS NULL;
```

For each unattributed deal, the Chief of Staff backtracks:
1. Query `sandbox_signals` for any signals mentioning the deal's company or property
2. Query `sandbox_contacts` for any enrichments related to the deal's contacts
3. If signals/enrichments existed but weren't connected, this is a `match_not_made` false negative
4. If no signals existed, check if the data was available in monitored sources — this is a `signal_not_detected` false negative

**Detector 3: Signal Backtest (Weekly)**

For every deal closed in the past 30 days, backtest whether signals existed in raw source data that the Researcher should have caught. This is expensive but extremely valuable.

```sql
-- Get companies involved in recently closed deals
SELECT DISTINCT c.company_name, d.name as deal_name, d.id as deal_id
FROM deals d
JOIN deal_contacts dc ON dc.deal_id = d.id
JOIN contacts c ON c.contact_id = dc.contact_id
WHERE d.status IN ('Closed', 'Commission Received')
AND d.updated_at > NOW() - INTERVAL '30 days';
```

For each company, the Researcher (during idle cycles) runs a targeted historical search:
- Were there news articles about this company in the 90 days before the deal?
- Were there hiring signals, expansion signals, or lease expiry signals?
- If YES and they weren't in `sandbox_signals`, this is a missed signal

**Detector 4: David's Manual Flag (UI Button)**

Add a simple button to the CRM UI — on any entity detail page, David can click "AI Should Have Caught This" and fill in a quick form:

```markdown
[Button: "Flag for AI Learning"]

Modal:
- What did the AI miss? [dropdown: contact, signal, match, trend, deal opportunity]
- Brief description: [text field]
- How did you find this? [text field]
- [Submit → creates missed_opportunity_log entry with detected_by='manual']
```

This is the most valuable input in the entire system. Every time David clicks this button, the system gets smarter. Make it frictionless — two fields and a submit.

#### Integration with Chief of Staff

Add to `chief-of-staff.md` daily review:

```markdown
### Step 3.5: Review Missed Opportunities

Query missed opportunity log: `GET /api/ai/missed-opportunities?status=open`

For each open item:
1. Determine root cause (source_gap, filter_too_aggressive, logic_gap, etc.)
2. Identify responsible agent
3. Determine if remediation is possible (instruction update, source addition, threshold change)
4. Write root_cause_detail and remediation_action
5. If this is a pattern (3+ similar misses in 30 days), escalate to David with a systemic fix proposal

### Missed Opportunity KPIs (Weekly)
- Total false negatives detected this week
- Root cause distribution (are we mostly missing due to source gaps? filter issues?)
- Remediation rate (% of open items that got fixed)
- Repeat rate (same root cause appearing multiple times)
```

#### Feedback Loop Completion

```
David takes manual action in CRM
        |
Nightly detectors run:
  1. Manual contact compare → finds contacts Enricher missed
  2. Unattributed deal detection → finds deals system should have sourced
  3. Signal backtest → finds signals that existed but weren't caught
  4. David's manual flags → captures explicit "you missed this" feedback
        |
missed_opportunity_log entries created
        |
Chief of Staff reviews (6 AM):
  1. Determines root cause for each
  2. Assigns responsible agent
  3. Writes remediation action
        |
Remediation flows to agents:
  - Source gap → Scout proposes new source, or Researcher adds to scan list
  - Filter too aggressive → Chief of Staff loosens pre-filter rules
  - Confidence too low → Agent feedback digest shows recalibration needed
  - Logic gap → Agent.md instruction rewrite
  - Timing lag → Scan frequency increased for that source category
        |
Agent feedback digest (Prompt 13) includes missed_opportunity stats:
  "You missed 3 contacts this week that David found manually.
   Root causes: 2 source gaps (Open Corporates didn't have them),
   1 filter too aggressive (junk entity filter caught a legitimate LLC)"
        |
Agent adjusts behavior → fewer false negatives over time
```

#### Required Schema Additions

```sql
-- Add created_by to contacts table for detector 1
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'manual';
-- Existing contacts: default 'manual'
-- Sandbox promotions: set to 'ai_system'
-- Import: set to 'csv_import'
```

### Implementation Priority: **HIGH** — This is the only mechanism for the system to learn from David's expertise. Without it, the system can only improve on what it already finds, never on what it misses.
### Effort: 3-4 days
- `missed_opportunity_log` table: 30 min
- `contacts.created_by` column: 15 min
- Detector 1 (manual contact compare): 3 hours
- Detector 2 (unattributed deal detection): 3 hours
- Detector 3 (signal backtest, weekly): 4 hours
- Detector 4 (UI button + modal): 2 hours
- Chief of Staff instruction updates: 1 hour
- Agent digest integration: 1 hour
- Integration testing: 4 hours

---

## PROMPT 16: Cross-Agent Shared Context & Institutional Memory

### Current State

Each agent operates in complete isolation. The only shared surface is the `agent_priority_board` — a fire-and-forget task queue. An agent can tell another agent "go do this thing" but cannot say "here's what I already know about this entity."

The existing coordination model (from `COORDINATION.md`):
- Agents post priorities for other agents
- Priorities include a `payload` JSONB field with context
- But the payload is task-specific, not entity-specific
- Once the task is completed, the context is lost
- No persistent per-entity knowledge accumulates across agents

**Example of the problem:**

```
09:00 - Enricher processes "Pacific West Holdings LLC"
         Finds: registered in CA, John Martinez is manager, address in Ontario
         Submits to sandbox_contacts with confidence 85

11:00 - Researcher finds signal: "Pacific West Holdings expanding, opening warehouse in Fontana"
         Submits to sandbox_signals with confidence 70
         Posts priority_board item: enrich_company for Pacific West Holdings

11:30 - Enricher picks up the priority, processes Pacific West Holdings AGAIN
         Duplicates the same Open Corporates lookup
         Doesn't know it already processed this company 2.5 hours ago
         Doesn't know about the expansion signal

13:00 - Matcher processes an AIR report with a Fontana industrial listing
         Matches against contacts — finds John Martinez
         Drafts outreach referencing only the listing
         Has NO IDEA about the expansion signal from the Researcher
         Missing: "Your company Pacific West Holdings is expanding in Fontana,
                  and we have a listing nearby" — this is a much better email
```

Three agents touched the same entity. None knew about the others. The outreach is weaker, the enrichment was duplicated, and the convergence was invisible until the Logger detected it hours later.

### Gap Analysis

| Gap | Impact |
|-----|--------|
| No per-entity knowledge accumulation | Agents re-do work and miss cross-agent insights |
| Priority board carries task context, not entity context | When a priority completes, the knowledge is lost |
| Matcher drafts outreach without Researcher signals | Outreach misses the most compelling personalization data |
| Enricher re-processes entities without knowing prior results | Wasted compute, duplicate API calls |
| No "what do we know about X?" query | Chief of Staff can't quickly pull together all system knowledge about an entity |
| Convergence detection is after-the-fact (Logger hourly) | Should be real-time — when agent touches entity, it should see all prior touches |

### Proposed Design

#### New Table: `entity_context_cache`

This is the shared knowledge graph. Every agent reads from and writes to it. It's entity-centric, not agent-centric.

```sql
CREATE TABLE IF NOT EXISTS entity_context_cache (
  id SERIAL PRIMARY KEY,
  -- Entity identity (what this knowledge is about)
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'company', 'contact', 'property', 'llc', 'person'
  )),
  entity_name TEXT NOT NULL,            -- Canonical name (used for matching)
  entity_name_normalized TEXT NOT NULL, -- Lowercase, stripped of LLC/Inc/Corp suffixes
  crm_id INTEGER,                       -- CRM record ID if entity exists in CRM
  -- Aliases (company may be known by multiple names)
  aliases TEXT[] DEFAULT '{}',          -- {'Pacific West Holdings', 'Pacific West Holdings LLC', 'PW Holdings'}

  -- Accumulated knowledge (each agent appends, never overwrites)
  knowledge_entries JSONB NOT NULL DEFAULT '[]',
  -- Structure:
  -- [
  --   {
  --     "agent": "enricher",
  --     "timestamp": "2026-03-10T09:15:00Z",
  --     "type": "enrichment_result",
  --     "data": {
  --       "manager": "John Martinez",
  --       "address": "1234 Industrial Way, Ontario CA",
  --       "confidence": 85,
  --       "sandbox_id": 234
  --     },
  --     "ttl": "90d"
  --   },
  --   {
  --     "agent": "researcher",
  --     "timestamp": "2026-03-10T11:00:00Z",
  --     "type": "market_signal",
  --     "data": {
  --       "signal_type": "company_expansion",
  --       "headline": "Pacific West expanding, opening warehouse in Fontana",
  --       "source": "GlobeSt",
  --       "confidence": 70,
  --       "sandbox_id": 156
  --     },
  --     "ttl": "30d"
  --   }
  -- ]

  -- Summary (regenerated when entries change)
  context_summary TEXT,                 -- LLM-generated 2-3 sentence summary of all knowledge
  -- "Pacific West Holdings is an active CA LLC managed by John Martinez (Ontario address).
  --  Company is expanding — opening new warehouse in Fontana per GlobeSt (March 10).
  --  Contact enriched with confidence 85. High-priority convergence target."

  -- Freshness
  last_touched_at TIMESTAMPTZ DEFAULT NOW(),
  last_touched_by TEXT,                 -- Which agent last added knowledge
  touch_count INTEGER DEFAULT 1,        -- How many times agents have touched this entity
  agents_involved TEXT[] DEFAULT '{}',  -- Unique agents that have contributed

  -- Staleness
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Key indexes for fast entity lookup
CREATE INDEX idx_entity_cache_name ON entity_context_cache(entity_name_normalized);
CREATE INDEX idx_entity_cache_type ON entity_context_cache(entity_type);
CREATE INDEX idx_entity_cache_crm ON entity_context_cache(crm_id) WHERE crm_id IS NOT NULL;
CREATE INDEX idx_entity_cache_aliases ON entity_context_cache USING GIN(aliases);
CREATE INDEX idx_entity_cache_touched ON entity_context_cache(last_touched_at DESC);
CREATE INDEX idx_entity_cache_agents ON entity_context_cache USING GIN(agents_involved);
CREATE INDEX idx_entity_cache_touch_count ON entity_context_cache(touch_count DESC);
CREATE INDEX idx_entity_cache_expires ON entity_context_cache(expires_at);
```

#### Entity Name Normalization

For reliable matching, normalize entity names:

```python
def normalize_entity_name(name):
    """Normalize company/LLC name for matching"""
    name = name.lower().strip()
    # Remove common suffixes
    for suffix in [' llc', ' inc', ' corp', ' corporation', ' company',
                   ' co', ' ltd', ' limited', ' lp', ' lp.', ' l.p.',
                   ' holdings', ' group', ' enterprises', ' associates',
                   ',', '.']:
        name = name.replace(suffix, '')
    # Remove extra whitespace
    name = ' '.join(name.split())
    return name
```

#### How Each Agent Uses the Context Cache

**Before Processing ANY Entity:**

Every agent, before processing a company/contact/property, first checks the context cache:

```
GET /api/ai/entity-context?name=Pacific+West+Holdings&type=company
```

Response:
```json
{
  "found": true,
  "entity": {
    "entity_name": "Pacific West Holdings",
    "crm_id": 234,
    "touch_count": 2,
    "agents_involved": ["enricher", "researcher"],
    "context_summary": "Active CA LLC managed by John Martinez (Ontario). Expanding into Fontana (GlobeSt, Mar 10). Contact enriched confidence 85.",
    "knowledge_entries": [...],
    "last_touched_at": "2026-03-10T11:00:00Z"
  }
}
```

**After Processing ANY Entity:**

Every agent appends its findings to the context cache:

```
POST /api/ai/entity-context/append
{
  "entity_name": "Pacific West Holdings",
  "entity_type": "company",
  "crm_id": 234,
  "entry": {
    "agent": "matcher",
    "type": "outreach_drafted",
    "data": {
      "contact": "John Martinez",
      "property_matched": "5678 Industrial Ave, Fontana",
      "outreach_sandbox_id": 89
    },
    "ttl": "30d"
  }
}
```

#### Agent-Specific Behavior Changes

**Enricher:**

```markdown
## Context-Aware Enrichment

Before processing any LLC/company:
1. Check entity context cache for existing knowledge
2. If entity was already enriched (by you) in the last 7 days:
   - Skip UNLESS a priority board item explicitly requests re-enrichment
   - Log: "Skipped [entity] — already enriched [X days ago], confidence [Y]"
3. If entity has Researcher signals attached:
   - Boost urgency — this entity has market activity
   - Include signal context in your sandbox submission notes
   - If signal mentions expansion/relocation, prioritize finding ALL decision-makers, not just the registered agent
4. After enrichment, append your results to the entity context cache
```

**Researcher:**

```markdown
## Context-Aware Signal Submission

Before submitting any signal:
1. Check entity context cache for the mentioned company
2. If entity already has context entries:
   - Note this in your signal submission: "Entity previously touched by [agents]"
   - If Enricher already has verified contacts, note it: "Verified contact available"
   - This helps Tier 2 prioritize — a signal about an entity with verified contacts is MORE valuable
3. If your signal is the SECOND or THIRD signal for the same entity in 7 days:
   - Set urgency to 'high' on any priority board posts
   - Note convergence in your submission
4. After submitting, append your signal to the entity context cache
```

**Matcher:**

```markdown
## Context-Enriched Outreach

Before drafting outreach for any contact:
1. Check entity context cache for the contact's company
2. If Researcher signals exist for this company:
   - INCORPORATE the signal into your outreach email
   - Example: Instead of "We have a listing that might interest you..."
     Use: "I noticed Pacific West Holdings is expanding into the Fontana market —
           we have a 50K SF industrial listing at 5678 Industrial Ave that could
           be a fit for your growth plans."
   - This dramatically improves outreach quality
3. If multiple agents have touched this entity:
   - Your outreach is backed by convergent data — note this in your confidence scoring (+10)
   - Include agent_context_summary in match_reason field
4. After drafting, append your outreach action to the entity context cache
```

#### Staleness Policies

```sql
-- Nightly cleanup: remove expired knowledge entries from JSONB arrays
-- (entries where their individual TTL has elapsed)
UPDATE entity_context_cache SET
  knowledge_entries = (
    SELECT COALESCE(jsonb_agg(entry), '[]'::jsonb)
    FROM jsonb_array_elements(knowledge_entries) AS entry
    WHERE (entry->>'timestamp')::timestamptz +
          (entry->>'ttl')::interval > NOW()
  ),
  updated_at = NOW()
WHERE expires_at > NOW();  -- only process non-expired entities

-- Remove fully expired entities (no entries left + past expires_at)
DELETE FROM entity_context_cache
WHERE expires_at < NOW()
OR (jsonb_array_length(knowledge_entries) = 0 AND last_touched_at < NOW() - INTERVAL '7 days');
```

TTL by entry type:
| Entry Type | Default TTL | Rationale |
|------------|-------------|-----------|
| `enrichment_result` | 90 days | Contact data goes stale |
| `market_signal` | 30 days | Market signals are time-sensitive |
| `outreach_drafted` | 14 days | Outreach context fades fast |
| `outreach_sent` | 90 days | Need to remember what was sent to avoid repeat |
| `outreach_replied` | 1 year | Reply data is extremely valuable |
| `deal_activity` | 1 year | Deal context should persist |

#### Conflict Surfacing

When two agents write contradictory data about the same entity:

```markdown
## Conflict Detection

When appending to entity context cache, check for contradictions:

1. If your data contradicts a previous entry from another agent:
   - Flag the conflict in your entry: "conflicts_with": [entry_id]
   - Do NOT overwrite the other agent's data
   - Post to priority board: urgent_review with both data points

   Example: Enricher says "Manager: John Martinez"
            Researcher finds news: "New CEO Sarah Chen replaces John Martinez"
            → Both entries stay. Conflict flagged. Tier 2 resolves.

2. If your data REINFORCES a previous entry:
   - Note the corroboration: "corroborates": [entry_id]
   - This increases entity confidence without duplicating data

3. The context_summary is regenerated whenever entries change — it should note conflicts:
   "Manager may be John Martinez (Enricher, Mar 10) OR Sarah Chen (Researcher, Mar 12 news article).
    Conflict flagged for review."
```

#### API Endpoints

```
GET  /api/ai/entity-context?name=X&type=Y        -- Lookup by name (fuzzy match on normalized)
GET  /api/ai/entity-context?crm_id=X              -- Lookup by CRM ID
GET  /api/ai/entity-context/hot                    -- Entities with touch_count >= 3 in last 7 days
POST /api/ai/entity-context/append                 -- Add knowledge entry
PUT  /api/ai/entity-context/:id/summary            -- Regenerate context summary
GET  /api/ai/entity-context/conflicts              -- All entities with unresolved conflicts
DELETE /api/ai/entity-context/expired              -- Cleanup (nightly cron)
```

#### Integration with Existing Systems

**Priority Board enhancement:** When an agent posts a priority for another agent, include `entity_context_id` if available:

```json
{
  "source_agent": "researcher",
  "target_agent": "enricher",
  "priority_type": "enrich_company",
  "payload": {
    "company_name": "Pacific West Holdings",
    "entity_context_id": 456,        // <-- NEW: point to shared context
    "signal_type": "company_expansion"
  }
}
```

The receiving agent can then pull the full context with one lookup instead of re-discovering everything.

**Morning Briefing enhancement:** The Chief of Staff's briefing now includes a "Hot Entities" section:

```markdown
## Hot Entities (3+ agent touches this week)
1. **Pacific West Holdings** — Enricher + Researcher + Matcher touched.
   Expansion signal + verified contact + outreach drafted. CONVERGENCE.
2. **ABC Logistics** — Researcher + Enricher touched.
   Hiring signal + contact being verified. Watch for convergence.
```

**Agent Dashboard enhancement:** Add an "Entity Intelligence" panel showing:
- Hot entities (touch_count >= 3)
- Entities with unresolved conflicts
- Recent entity context activity (timeline view)
- Click to see full context for any entity

### Implementation Priority: **HIGH** — This transforms agents from independent workers into a coordinated team. The outreach quality improvement alone justifies the effort.
### Effort: 3-4 days
- `entity_context_cache` table: 1 hour
- Entity name normalization utility: 1 hour
- API endpoints (lookup, append, hot, conflicts): 4 hours
- Context summary generation (LLM call for summary regeneration): 3 hours
- Agent instruction updates (all 4 agents): 3 hours
- Priority board integration (add entity_context_id): 1 hour
- Staleness/cleanup cron: 2 hours
- Conflict detection logic: 2 hours
- Dashboard UI (hot entities panel): 4 hours
- Integration testing: 4 hours

---

## Summary: Build Sequence & Dependencies

```
WEEK 1: Foundation
├── Prompt 13: agent_feedback_digest table + rejection_reason_taxonomy
├── Prompt 13: Tier 2 review UI — add reason_code dropdown
├── Prompt 16: entity_context_cache table + normalization utility
└── Prompt 15: missed_opportunity_log table + contacts.created_by column

WEEK 2: Data Flows
├── Prompt 13: Digest generation cron (3:30 AM)
├── Prompt 13: GET /api/ai/feedback-digest endpoint
├── Prompt 16: Entity context API endpoints
├── Prompt 15: Detectors 1 & 2 (manual contact compare, unattributed deals)
└── Prompt 14: agent_source_registry table + seed data

WEEK 3: Agent Integration
├── Prompt 13: Update all agent instructions with Feedback Awareness sections
├── Prompt 16: Update all agent instructions with Context Cache integration
├── Prompt 15: Detector 4 (UI button for David's manual flags)
├── Prompt 14: Source reliability calculation cron
├── Prompt 14: Citation chain following in Scout/Researcher instructions
└── Prompt 15: Chief of Staff instruction updates for missed opportunity review

WEEK 4: Polish & Advanced
├── Prompt 15: Detector 3 (signal backtest, weekly)
├── Prompt 14: Dead source detection + coverage gap alerts
├── Prompt 16: Dashboard enhancements (hot entities, conflict view)
├── Prompt 14: Dynamic source weighting in confidence scoring
└── ALL: Integration testing across all 4 systems
```

### Priority Rankings

| Prompt | Priority | Effort | Impact | Dependency |
|--------|----------|--------|--------|------------|
| 13: Feedback Loops | **1st** | 2-3 days | Highest — every agent gets smarter every cycle | None (foundational) |
| 16: Shared Context | **2nd** | 3-4 days | High — eliminates duplicate work, improves outreach quality | None (foundational) |
| 15: False Negatives | **3rd** | 3-4 days | High — captures David's expertise as training data | Needs feedback loops to deliver remediation |
| 14: Source Discovery | **4th** | 2 days | Medium — improves over time but needs approval data first | Needs feedback loops for reliability scoring |

### Total New Tables: 4
- `agent_feedback_digest` — per-agent performance scorecards
- `rejection_reason_taxonomy` — standardized rejection vocabulary
- `missed_opportunity_log` — false negative capture and remediation
- `entity_context_cache` — per-entity shared knowledge graph
- `agent_source_registry` — source reliability tracking and discovery

### Total New API Endpoints: 12
- Feedback digest: 1 (GET)
- Source registry: 6 (GET list, GET single, POST propose, PUT status, PUT reliability, GET coverage-gaps)
- Missed opportunities: 2 (GET list, POST manual flag)
- Entity context: 5 (GET by name, GET by CRM ID, GET hot, POST append, GET conflicts)

### Total Agent Instruction Changes: 6 files
- All 4 Tier 3 agents: Feedback Awareness + Context Cache sections
- Chief of Staff: Missed opportunity review + hot entity briefing
- Tier 2 Validator: Rejection reason code selection

### Key Insight

These four systems create a **closed learning loop** that doesn't exist today:

```
Current: Agent → Sandbox → Review → Done (knowledge dies)

Proposed:
Agent → Sandbox → Review → Feedback Digest → Agent adjusts
                        ↘ Entity Context → Other agents benefit
                        ↘ If rejected → Root cause → Instruction fix
David's manual work → Missed Opportunity Log → Agent adjusts
Source performance → Source Registry → Scan priorities adjust
```

The system stops being a pipeline of independent processors and becomes an organism that learns from every interaction — its own successes, its failures, David's expertise, and the changing landscape of data sources. Each cycle makes the next cycle better, automatically, without requiring the Chief of Staff to manually parse logs and rewrite instructions.

---

*Generated: March 13, 2026*
*For: IE CRM AI Master System — Prompts 13-16 Deep Analysis*
*Analyst: Claude Opus 4.6*
