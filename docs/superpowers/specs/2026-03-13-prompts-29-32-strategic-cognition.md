# IE CRM AI Master System -- Strategic Cognition Layer: Prompts 29-32
# Multi-Modal Intelligence, Transfer Learning, Market Theory, Antifragile Design

**Date:** 2026-03-13
**Status:** Design Spec
**Scope:** Four strategic capabilities that elevate the system from data processing to market cognition
**Depends on:** Migration 006 (TPE schema), Migration 007 (AI sandbox/agent infrastructure), Prompts 17-24 (calibration, self-improvement, David Model)

---

## Table of Contents

1. [Prompt 29: Multi-Modal Intelligence -- Beyond Text](#prompt-29)
2. [Prompt 30: Transfer Learning Across Property Types](#prompt-30)
3. [Prompt 31: The System's Theory of the Market](#prompt-31)
4. [Prompt 32: Antifragile System Design](#prompt-32)

---

<a id="prompt-29"></a>
# PROMPT 29: Multi-Modal Intelligence -- Beyond Text

## Current State Analysis

The IE CRM processes text exclusively. The `ClaudePanel.jsx` already supports file attachments (images, PDFs, CSVs, Excel) -- these are converted to Claude API content blocks and sent as context for conversation. The `building_image_path` column exists on properties (migration 001). But no automated visual analysis occurs. Property photos sit in CoStar links. Offering memorandums arrive as PDFs and are read manually. Phone calls are logged manually in the interactions table with no transcription.

**What exists:**
- `building_image_path` column on properties (stores a URL/path, rarely populated)
- ClaudePanel file attachment support (drag-and-drop images/PDFs to Claude)
- `interactions` table with `type`, `subject`, `notes` fields (manual call logging)
- `sandbox_signals` table with `source_name` field (could tag visual sources)
- Anthropic Claude API with vision capability (already integrated)
- `ai_usage_tracking` table (can track costs per modality)

**What's missing:**
1. No automated property photo analysis pipeline
2. No satellite/aerial imagery integration
3. No structured PDF extraction (OMs are read manually or pasted to Claude ad hoc)
4. No call transcription -- interactions are logged from memory, losing detail
5. No visual data feeding TPE scores
6. No change detection over time (before/after comparisons)

## ROI Ranking (Highest to Lowest)

| Rank | Modality | ROI Rationale | Cost/mo | Implementation Effort |
|------|----------|---------------|---------|----------------------|
| **1** | **PDF OM Extraction** | Every deal starts with an OM. 5-10 OMs/week, 20 min each manual = 8-16 hrs/week saved. Directly creates property records, populates financials. | $15-30 (Claude API) | Medium (2 weeks) |
| **2** | **Phone Call Transcription** | 15-25 calls/day. Each call contains intent signals, follow-up commitments, pricing intel. Currently 80% of call content is lost. Feeds interactions table automatically. | $25-50 (Whisper API) | Low (1 week) |
| **3** | **Property Photo Condition Scoring** | Detects deferred maintenance, age indicators, vacancy signs. Enriches TPE with physical condition data. But ROI depends on volume -- useful when prospecting at scale. | $5-15 (Claude Vision) | Medium (2 weeks) |
| **4** | **Satellite Change Detection** | Detects construction, new tenants, vacancy. Powerful but requires aerial imagery subscription ($500+/mo) and complex diff pipeline. Long-term play. | $500+ (imagery) + $20 (compute) | High (4-6 weeks) |

## Proposed Design

### 29.1 -- PDF Offering Memorandum Extraction Pipeline

**The problem:** An OM is a 20-80 page PDF with mixed content: cover photo, executive summary, financial tables, rent roll, tenant profiles, aerials, site plan, market overview. David currently reads these manually or pastes pages into Claude one at a time.

**Architecture:**

```
OM PDF arrives (email attachment, download, drag-drop)
    |
    v
[1] PDF Ingestion Service (server/om-extractor.js)
    - Splits PDF into pages
    - Classifies each page: cover | summary | financials | rent_roll |
      tenant_info | aerials | site_plan | market | appendix
    |
    v
[2] Page-Type-Specific Extraction (Claude API with vision)
    - Financial pages -> structured JSON (NOI, cap rate, price, expenses)
    - Rent roll pages -> tenant array [{name, sf, rate, expiration, options}]
    - Summary pages -> property metadata (address, SF, year built, type)
    - Aerial/site plan -> condition notes, parking count, access points
    |
    v
[3] Entity Resolution
    - Match property address to existing properties table
    - Match tenant names to existing companies table
    - Match broker names to existing contacts table
    |
    v
[4] Sandbox Staging (sandbox_om_extractions table)
    - Full extracted data staged for review
    - Diff against existing property record shown
    - One-click promotion: updates property, creates lease comps,
      links companies, creates follow-up action items
```

**New table:**

```sql
CREATE TABLE IF NOT EXISTS sandbox_om_extractions (
    id              SERIAL PRIMARY KEY,
    -- Source
    file_name       TEXT NOT NULL,
    file_hash       TEXT NOT NULL,           -- SHA-256 for dedup
    page_count      INTEGER,
    -- Extracted property data
    property_data   JSONB NOT NULL DEFAULT '{}',
    -- e.g. {address, city, sf, year_built, price, cap_rate, noi, ...}
    rent_roll       JSONB NOT NULL DEFAULT '[]',
    -- e.g. [{tenant, sf, rate, expiration, lease_type, options}]
    financial_data  JSONB NOT NULL DEFAULT '{}',
    -- e.g. {gross_income, vacancy_loss, opex, noi, cap_rate, price_psf}
    broker_info     JSONB NOT NULL DEFAULT '{}',
    -- e.g. {listing_broker, company, phone, email}
    raw_text        TEXT,                    -- full extracted text for search
    -- Entity matching
    matched_property_id  UUID,
    matched_company_ids  INTEGER[],
    matched_contact_ids  INTEGER[],
    -- Sandbox metadata
    agent_name      TEXT NOT NULL DEFAULT 'om_extractor',
    confidence_score INTEGER DEFAULT 0,
    extraction_notes TEXT,
    -- Review workflow
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','promoted')),
    reviewed_by     TEXT,
    reviewed_at     TIMESTAMPTZ,
    promoted_at     TIMESTAMPTZ,
    -- What was created on promotion
    promoted_property_id UUID,
    promoted_lease_comp_ids INTEGER[],
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_om_extractions_status ON sandbox_om_extractions(status);
CREATE INDEX idx_om_extractions_hash ON sandbox_om_extractions(file_hash);
```

**Claude API call pattern (per page type):**

```javascript
// Financial page extraction
const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
        role: 'user',
        content: [
            {
                type: 'image',
                source: { type: 'base64', media_type: 'image/png', data: pageImageB64 }
            },
            {
                type: 'text',
                text: `Extract all financial data from this offering memorandum page.
Return JSON: {
    asking_price, cap_rate, noi, gross_income, effective_gross_income,
    vacancy_rate, operating_expenses, opex_breakdown: {taxes, insurance,
    management, maintenance, utilities, other},
    price_per_sf, grm, dscr, cash_on_cash
}
Only include fields clearly stated on this page. Use null for missing.`
            }
        ]
    }]
});
```

**Cost estimate:** 10 OMs/week x ~30 pages avg x ~1500 input tokens/page = ~450K tokens/week. At Claude Sonnet pricing (~$3/M input tokens for images): ~$6-8/week. Extremely high ROI.

**TPE integration:** Extracted cap rates, NOI, and vacancy feed directly into ECV calculations. Rent roll expirations feed lease expiration scoring. Owner entity type (from OM) feeds ownership profile scoring.

### 29.2 -- Phone Call Transcription Pipeline

**Architecture:**

```
Phone call ends (Mac Mini detects via CallKit / manual trigger)
    |
    v
[1] Audio Capture
    - Option A: Mac Mini records via Audio Hijack / BlackHole (local)
    - Option B: VoIP integration (RingCentral/Dialpad API)
    - Option C: Manual upload (drag audio file to CRM)
    |
    v
[2] Transcription (local Whisper on Mac Mini)
    - Model: whisper-large-v3 via whisper.cpp (runs on M-series GPU)
    - Speaker diarization via pyannote.audio
    - Output: timestamped transcript with speaker labels
    |
    v
[3] Intelligence Extraction (local Qwen 2.5 or Claude API)
    - Contact intent classification:
      INTERESTED | NOT_INTERESTED | CALLBACK | INFO_REQUEST | COMPLAINT
    - Key facts: pricing mentioned, timeline, competitors, objections
    - Follow-up commitments: "I'll send you the OM" / "Call me next week"
    - Sentiment: POSITIVE | NEUTRAL | NEGATIVE | HOSTILE
    |
    v
[4] Automatic Interaction Logging
    - Creates interaction record:
      type='call', subject=auto-generated, notes=structured summary
    - Links to contact (matched by phone number)
    - Creates action_items for any follow-up commitments
    - Updates contact fields:
      last_contacted, last_call_outcome, follow_up
    |
    v
[5] TPE Signal Extraction
    - "We're running out of space" -> company_expansion signal
    - "Our lease is up in March" -> lease expiration confirmation
    - "The owner is getting older" -> owner age signal
    - These feed sandbox_signals for review
```

**Local processing advantage:** Whisper runs entirely on the Mac Mini M-series chip. A 30-minute call transcribes in ~2-3 minutes. Zero API cost for transcription. Privacy preserved -- call recordings never leave the local machine.

**New server endpoint:**

```javascript
// POST /api/transcribe
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
    const { contactId, callDirection } = req.body;
    // 1. Run whisper.cpp on the audio file
    // 2. Extract intelligence with local Qwen or Claude
    // 3. Create interaction record
    // 4. Create action items for follow-ups
    // 5. Update contact fields
    // 6. Extract TPE signals
    res.json({ interaction_id, signals_found, action_items_created });
});
```

**Cost estimate:** $0 for transcription (local Whisper). ~$0.01-0.03 per call for intelligence extraction via local Qwen. If using Claude API for extraction: ~$0.02-0.05 per call. At 20 calls/day = $0.40-1.00/day.

### 29.3 -- Property Photo Condition Scoring

**Architecture:**

```
Property photo (CoStar scrape, Google Street View API, manual upload)
    |
    v
[1] Photo Classification
    - Exterior front | Exterior side | Interior | Aerial | Loading area | Parking
    |
    v
[2] Condition Analysis (Claude Vision API)
    - Structural: roof condition, wall condition, foundation visible issues
    - Cosmetic: paint, signage quality, landscaping, parking lot condition
    - Functional: loading dock condition, door count verification, yard space
    - Vacancy signals: dark windows, empty parking, "For Lease" signage
    - Age indicators: architectural style dating, material aging
    |
    v
[3] Condition Score (0-100)
    - Excellent (80-100): recently renovated, modern materials
    - Good (60-79): well-maintained, minor wear
    - Fair (40-59): deferred maintenance visible, aging
    - Poor (20-39): significant deterioration, vacancy indicators
    - Distressed (0-19): structural concerns, abandoned appearance
    |
    v
[4] Property Record Update
    - New column: condition_score INTEGER
    - New column: condition_notes TEXT
    - New column: condition_assessed_at TIMESTAMPTZ
    - New column: vacancy_visual_signals JSONB
    - Feeds into TPE as condition modifier (multiplier on ownership score)
```

**TPE integration formula:**

```
condition_modifier = CASE
    WHEN condition_score < 30 THEN 1.15  -- distressed = higher opportunity
    WHEN condition_score < 50 THEN 1.08  -- deferred maintenance = some opportunity
    WHEN condition_score > 80 THEN 0.95  -- well-maintained = less likely to sell
    ELSE 1.00
END
```

Distressed properties with aging owners and expiring leases are the highest-probability deals. The visual signal confirms what the data suggests.

**Cost estimate:** ~$0.01-0.03 per photo (Claude Vision). At 50 properties/week with 3 photos each = $1.50-4.50/week.

### 29.4 -- Satellite Imagery Change Detection (Future Phase)

This is the highest-cost, highest-complexity modality. Defer to Phase 3 (6+ months).

**Approach when ready:**
- Source: Google Earth Engine API (free for research) or Nearmap ($$$) or Planet Labs
- Monthly snapshots of IE industrial corridors
- Pixel-diff detection: new construction, demolition, parking lot changes
- Classification: construction_start | construction_complete | new_tenant | vacancy_increase
- Feed as sandbox_signals with `source_name = 'satellite'`

**Estimated cost:** $500-2000/month for commercial aerial imagery subscription. Only justified at scale (500+ tracked properties).

---

<a id="prompt-30"></a>
# PROMPT 30: Transfer Learning Across Property Types

## Current State Analysis

The IE CRM schema treats property types as a flat `property_type` TEXT field on the properties table. The TPE scoring system (migration 006, `tpe_config`) uses uniform weights regardless of property type -- the same lease expiration scoring applies to a 50K SF warehouse as a 2K SF retail suite. The `companies` table has `industry_type` and `tenant_naics` fields, and the `sandbox_signals` table has `signal_type` (company_expansion, hiring, relocation, etc.) -- but no cross-type inference exists.

**What exists:**
- `property_type` on properties (Industrial, Retail, Office, Land, etc.)
- `companies` with `industry_type`, `sf`, `employees`, `revenue`, `company_growth`
- `sandbox_signals` with `signal_type` and `companies_mentioned`
- `lease_comps` with `property_type` and `space_use`
- Junction tables: `company_properties`, `deal_properties`, `deal_contacts`

**The gap:**
1. A company expanding its warehouse (detected via hiring signal or lease comp) is never flagged as a potential office tenant elsewhere
2. A retail chain closing stores in IE is never flagged as creating industrial conversion opportunities
3. No company lifecycle model exists -- the system sees each signal atomically, not as part of a trajectory
4. TPE weights are property-type-agnostic -- but a 5-year hold on industrial has different implications than a 5-year hold on retail
5. No property type conversion value analysis (what's a vacant Kmart worth as a distribution center?)

## Proposed Design

### 30.1 -- Cross-Type Signal Inference Engine

**Core insight:** Signals in one property type often imply opportunities in another. These rules encode decades of CRE broker knowledge.

**Inference rule table:**

```sql
CREATE TABLE IF NOT EXISTS cross_type_rules (
    id              SERIAL PRIMARY KEY,
    -- Trigger condition
    source_type     TEXT NOT NULL,          -- 'Industrial', 'Retail', 'Office', 'ANY'
    trigger_signal  TEXT NOT NULL,          -- matches sandbox_signals.signal_type
    trigger_condition JSONB DEFAULT '{}',   -- additional conditions
    -- e.g. {"company_growth": ">20%", "sf": ">30000"}
    -- Inference
    target_type     TEXT NOT NULL,          -- what property type to look at
    inferred_signal TEXT NOT NULL,          -- what opportunity is implied
    confidence_base INTEGER DEFAULT 50,    -- base confidence for this inference
    -- Metadata
    rule_name       TEXT NOT NULL,
    rationale       TEXT NOT NULL,          -- human-readable explanation
    active          BOOLEAN DEFAULT TRUE,
    -- Performance tracking
    times_triggered INTEGER DEFAULT 0,
    times_confirmed INTEGER DEFAULT 0,     -- when the inferred opportunity materialized
    last_triggered  TIMESTAMPTZ,
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cross_type_source ON cross_type_rules(source_type, trigger_signal);
CREATE INDEX idx_cross_type_active ON cross_type_rules(active);
```

**Seed rules (David's CRE knowledge encoded):**

```sql
INSERT INTO cross_type_rules
    (source_type, trigger_signal, trigger_condition, target_type,
     inferred_signal, confidence_base, rule_name, rationale) VALUES

-- Expansion signals
('Industrial', 'company_expansion', '{"company_growth": ">20%"}',
 'Office', 'office_need_likely', 65,
 'warehouse_expansion_needs_office',
 'Company growing warehouse ops >20% typically needs admin/office space within 6-12 months'),

('Industrial', 'hiring', '{"employees_delta": ">15"}',
 'Office', 'office_need_likely', 55,
 'industrial_hiring_surge_office',
 'Industrial company adding 15+ employees needs office/admin space for management layer'),

-- Retail decline signals
('Retail', 'distress', '{"sf": ">20000"}',
 'Industrial', 'conversion_opportunity', 70,
 'big_box_to_warehouse',
 'Large retail vacancy (>20K SF) in IE often converts to last-mile distribution'),

('Retail', 'distress', '{"property_count": ">3"}',
 'Industrial', 'conversion_opportunity', 60,
 'retail_chain_closure_wave',
 'Multiple retail closures by same chain = bulk conversion opportunity for industrial'),

-- Office to flex/industrial
('Office', 'distress', '{"vacancy_pct": ">30"}',
 'Industrial', 'conversion_opportunity', 55,
 'office_to_flex_industrial',
 'High-vacancy office parks in IE convert to flex/industrial -- higher rent basis'),

-- Tenant relocation chains
('Industrial', 'relocation', '{}',
 'Industrial', 'vacancy_backfill', 75,
 'relocation_leaves_vacancy',
 'Company relocating from one industrial space creates vacancy to backfill'),

('Office', 'new_lease', '{"sf": ">10000"}',
 'Industrial', 'operational_expansion', 50,
 'office_lease_precedes_warehouse',
 'Large office lease by logistics/ecommerce company precedes warehouse need within 12 months'),

-- Company lifecycle
('ANY', 'funding', '{"amount": ">5000000"}',
 'Industrial', 'space_need_likely', 60,
 'funding_round_space_need',
 'Series B+ or $5M+ funding often triggers physical space expansion within 6-18 months'),

('ANY', 'sale_closed', '{}',
 'ANY', 'new_owner_repositioning', 45,
 'new_owner_capital_event',
 'Property sale = new owner likely to reposition, renovate, or re-tenant');
```

### 30.2 -- Company Lifecycle Model

**The insight:** Companies don't randomly appear in CRE signals. They follow predictable trajectories: startup -> growth -> expansion -> maturity -> contraction/exit. Each phase has different space needs.

**Data structure:**

```sql
CREATE TABLE IF NOT EXISTS company_lifecycle (
    id              SERIAL PRIMARY KEY,
    company_id      INTEGER REFERENCES companies(company_id) ON DELETE CASCADE,
    -- Current assessment
    lifecycle_stage TEXT NOT NULL CHECK (lifecycle_stage IN (
        'startup',          -- <3 years, small space, growing fast
        'growth',           -- 3-8 years, expanding headcount and space
        'expansion',        -- opening new locations, multi-market
        'mature',           -- stable operations, lease renewals
        'contraction',      -- closing locations, reducing space
        'exit',             -- sale, merger, shutdown
        'unknown'
    )),
    stage_confidence INTEGER DEFAULT 50,
    -- Evidence
    evidence        JSONB NOT NULL DEFAULT '[]',
    -- [{signal_id, type, date, description}]
    -- Trajectory prediction
    predicted_next_stage    TEXT,
    predicted_timeline_months INTEGER,
    space_need_prediction   JSONB DEFAULT '{}',
    -- {type: 'Industrial', sf_range: [20000, 40000], timeline: '6-12 months'}
    -- Timestamps
    assessed_at     TIMESTAMPTZ DEFAULT NOW(),
    previous_stage  TEXT,
    stage_changed_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_company_lifecycle_company ON company_lifecycle(company_id);
CREATE INDEX idx_company_lifecycle_stage ON company_lifecycle(lifecycle_stage);
```

**Lifecycle assessment algorithm (runs in Chief of Staff daily cycle):**

```
For each company with new signals in last 7 days:

1. Collect all signals: hiring, funding, lease comps, interactions, news
2. Score lifecycle indicators:
   - startup:      founded_date < 3yr AND employees < 50
   - growth:       employee_growth > 15% AND revenue_growth > 10%
   - expansion:    multiple_locations OR new_lease_signed_recently
   - mature:       stable_headcount AND long_tenure (>5yr) AND renewal_activity
   - contraction:  employee_decline > 10% OR store_closures OR lease_non_renewals
   - exit:         acquisition_rumors OR shutdown_signals OR asset_sales
3. Compare to previous assessment
4. If stage changed: create sandbox_signal with cross-type implications
5. Update space_need_prediction based on new stage
```

### 30.3 -- Property Type Arbitrage Analysis

**The question:** Is a vacant 40K SF retail box worth more as-is ($85/SF) or as a converted distribution center ($150/SF)? This arbitrage is where David makes his most lucrative deals.

**Data structure:**

```sql
CREATE TABLE IF NOT EXISTS conversion_analysis (
    id              SERIAL PRIMARY KEY,
    property_id     UUID REFERENCES properties(property_id) ON DELETE CASCADE,
    -- Current use
    current_type    TEXT NOT NULL,
    current_value_psf NUMERIC,
    current_noi     NUMERIC,
    current_cap_rate NUMERIC,
    -- Proposed conversion
    target_type     TEXT NOT NULL,
    estimated_conversion_cost NUMERIC,
    estimated_value_psf_post  NUMERIC,
    estimated_noi_post        NUMERIC,
    estimated_cap_rate_post   NUMERIC,
    -- Arbitrage calculation
    value_uplift_pct   NUMERIC,    -- (post_value - current_value - conversion_cost) / current_value
    commission_at_stake NUMERIC,   -- potential commission on the conversion deal
    -- Risk factors
    zoning_compatible  BOOLEAN,    -- can the zoning support the target type?
    zoning_notes       TEXT,
    structural_feasible BOOLEAN,   -- ceiling height, column spacing, etc.
    market_demand_score INTEGER,   -- 0-100 based on vacancy rates for target type in submarket
    -- Assessment
    agent_name      TEXT DEFAULT 'cross_type_analyzer',
    confidence_score INTEGER DEFAULT 50,
    analysis_notes  TEXT,
    status          TEXT DEFAULT 'pending' CHECK (status IN
                    ('pending','viable','not_viable','presented_to_david')),
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversion_property ON conversion_analysis(property_id);
CREATE INDEX idx_conversion_status ON conversion_analysis(status);
CREATE INDEX idx_conversion_uplift ON conversion_analysis(value_uplift_pct DESC);
```

### 30.4 -- Cross-Type TPE Adjustments

**The question answered:** Does "company expansion" mean different things for different property types? Yes, absolutely.

| Signal | Industrial Implication | Office Implication | Retail Implication |
|--------|----------------------|-------------------|-------------------|
| Company expansion (+20% headcount) | Need more warehouse/production SF | Need more admin/meeting space | Likely opening new stores |
| Lease expiring <12mo | High urgency -- relocation costly for heavy equipment | Medium -- office moves are faster | High -- retail buildout is expensive |
| Owner age 70+ | Very high signal -- industrial owners are operators | Medium -- office owners are often investors | Medium-high -- mom-and-pop retail is common |
| High vacancy (>30%) | Distress signal -- industrial rarely sits empty | Normal for post-COVID IE office | Concerning -- may indicate location problem |
| New construction nearby | Competitive pressure on older buildings | Less relevant -- office is location-driven | Major threat to existing retail |

**Implementation:** Add `property_type_modifiers` to `tpe_config`:

```sql
INSERT INTO tpe_config (config_category, config_key, config_value, description) VALUES
    ('type_modifier', 'industrial_lease_12mo_mult', 1.15, 'Industrial lease expiry more urgent (relocation cost)'),
    ('type_modifier', 'industrial_owner_age_70_mult', 1.20, 'Industrial owner-operators more likely to sell'),
    ('type_modifier', 'retail_vacancy_30_mult', 1.25, 'High retail vacancy is stronger distress signal'),
    ('type_modifier', 'office_vacancy_30_mult', 0.85, 'High office vacancy is normalized post-COVID'),
    ('type_modifier', 'industrial_hold_15yr_mult', 1.10, 'Long industrial holds mean more deferred decisions'),
    ('type_modifier', 'retail_new_construction_mult', 1.20, 'New retail construction threatens existing properties')
ON CONFLICT (config_key) DO NOTHING;
```

**Priority:** Medium-High. Cross-type inference is a genuine competitive advantage. Start with the seed rules and lifecycle model -- they're low cost and compound with every signal the system processes.

**Effort:** 2-3 weeks for rules engine + lifecycle model. 1 week for conversion analysis. 1 week for TPE type modifiers.

---

<a id="prompt-31"></a>
# PROMPT 31: The System's Theory of the Market

## Current State Analysis

After 6 months of operation, the IE CRM will contain thousands of data points: property records, lease comps, sale comps, interaction logs, enrichment results, TPE scores, signals, and agent logs. But these are facts, not understanding. The system can tell you "average industrial cap rate in West IE is 5.2%" but cannot tell you "cap rates are compressing because logistics demand is outpacing supply, and this compression will slow when the Beaumont interchange development delivers 2M SF in Q3."

**What exists:**
- `tpe_config` table with market assumptions (sale_price_psf, lease rates by size)
- `sandbox_signals` with market_trend type
- `agent_logs` with daily summaries
- `lease_comps` and `sale_comps` tables with historical data
- `agent_priority_board` for inter-agent coordination

**The gap:**
1. Market assumptions in `tpe_config` are static values set once
2. No mechanism to test beliefs against incoming data
3. No formal market thesis generation
4. No contradiction detection
5. No living document that synthesizes what the system "knows" about IE
6. No compounding -- yesterday's insight doesn't improve today's analysis

## How Is This Different From Signal Aggregation?

Signal aggregation answers: "What happened?" (Company X signed a lease, cap rates dropped 20bps.)

A market theory answers: "Why did it happen, and what will happen next?" (Logistics companies are expanding into West IE because port backlog is shifting distribution inland. This will push industrial vacancy below 3% in Ontario/Rancho Cucamonga by Q4, creating upward rent pressure that makes sale-leaseback attractive for owner-users.)

The difference is **causal structure** and **predictive power**. Signals are leaves; the theory is the tree.

## Proposed Design

### 31.1 -- Market Beliefs Table (Structured Beliefs)

```sql
CREATE TABLE IF NOT EXISTS market_beliefs (
    id              SERIAL PRIMARY KEY,
    -- The belief itself
    belief_category TEXT NOT NULL CHECK (belief_category IN (
        'pricing',          -- cap rates, rent rates, sale prices
        'demand',           -- tenant demand patterns
        'supply',           -- new construction, deliveries
        'ownership',        -- hold patterns, owner behavior
        'macro',            -- interest rates, migration, regulation
        'submarket',        -- submarket-specific dynamics
        'competitive',      -- competitor activity patterns
        'seasonal'          -- time-of-year patterns
    )),
    belief_statement TEXT NOT NULL,
    -- e.g. "LLC-owned industrial properties in IE hold for 7-10 years on average"
    -- Testability
    testable_prediction TEXT,
    -- e.g. "80% of LLC-owned industrial properties with 8+ year hold will transact within 3 years"
    measurement_sql   TEXT,
    -- SQL query that can test this prediction against CRM data
    -- e.g. "SELECT COUNT(*) FILTER (WHERE sold) / COUNT(*)::float FROM ... WHERE hold_years >= 8"
    -- Confidence tracking
    confidence      INTEGER DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
    evidence_for    JSONB DEFAULT '[]',    -- [{date, source, description, strength}]
    evidence_against JSONB DEFAULT '[]',   -- [{date, source, description, strength}]
    times_tested    INTEGER DEFAULT 0,
    times_confirmed INTEGER DEFAULT 0,
    times_contradicted INTEGER DEFAULT 0,
    last_tested     TIMESTAMPTZ,
    -- Lifecycle
    status          TEXT DEFAULT 'active' CHECK (status IN (
        'hypothesis',       -- newly formed, untested
        'active',           -- being tested, currently believed
        'strong',           -- repeatedly confirmed
        'weakening',        -- recent contradictions
        'retired',          -- replaced by better belief
        'disproven'         -- clearly wrong
    )),
    superseded_by   INTEGER REFERENCES market_beliefs(id),
    -- Authorship
    source          TEXT DEFAULT 'chief_of_staff',
    -- 'chief_of_staff', 'david', 'data_analysis', 'external'
    david_endorsed  BOOLEAN DEFAULT FALSE,  -- David explicitly agreed
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    retired_at      TIMESTAMPTZ
);

CREATE INDEX idx_beliefs_category ON market_beliefs(belief_category);
CREATE INDEX idx_beliefs_status ON market_beliefs(status);
CREATE INDEX idx_beliefs_confidence ON market_beliefs(confidence DESC);
```

### 31.2 -- Market Thesis Document (Free Text + Structure Hybrid)

The market theory isn't just a collection of beliefs. It's a narrative -- a coherent story about what's happening in IE CRE. The Chief of Staff maintains this as a living document.

```sql
CREATE TABLE IF NOT EXISTS market_thesis (
    id              SERIAL PRIMARY KEY,
    -- Document structure
    section         TEXT NOT NULL CHECK (section IN (
        'executive_summary',    -- 2-3 paragraph market overview
        'industrial_thesis',    -- IE industrial market theory
        'retail_thesis',        -- IE retail market theory
        'office_thesis',        -- IE office market theory
        'submarket_dynamics',   -- submarket-specific insights
        'owner_behavior',       -- what owner types are doing and why
        'tenant_demand',        -- where tenant demand is heading
        'macro_environment',    -- rates, regulation, migration
        'opportunities',        -- where the team should focus
        'risks',                -- what could go wrong
        'contrarian_views'      -- beliefs that go against consensus
    )),
    content         TEXT NOT NULL,          -- markdown narrative
    -- Supporting data
    supporting_belief_ids INTEGER[],        -- references to market_beliefs
    key_metrics     JSONB DEFAULT '{}',
    -- e.g. {"avg_cap_rate": 5.2, "vacancy_pct": 3.1, "new_supply_sf": 2000000}
    -- Version tracking
    version         INTEGER DEFAULT 1,
    previous_version_content TEXT,          -- diff context
    change_summary  TEXT,                   -- what changed and why
    -- Timestamps
    effective_date  DATE DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_thesis_section_version ON market_thesis(section, version);
CREATE INDEX idx_thesis_section ON market_thesis(section);
```

### 31.3 -- Belief Testing Engine (Weekly)

The Chief of Staff runs this every Sunday at 3 AM alongside the confidence calibration engine.

```
BELIEF TESTING CYCLE (weekly)
============================

For each active belief in market_beliefs:

1. MEASURABLE TEST
   - If measurement_sql exists, run it against current data
   - Compare result to testable_prediction
   - Score: confirmed | contradicted | insufficient_data

2. SIGNAL SCAN
   - Search last 7 days of sandbox_signals for evidence
   - Search last 7 days of lease_comps and sale_comps
   - Categorize each as evidence_for or evidence_against
   - Append to evidence arrays with timestamp

3. CONFIDENCE UPDATE
   - If confirmed: confidence = MIN(confidence + 5, 95)
   - If contradicted: confidence = MAX(confidence - 10, 5)
   - Note: contradictions penalize twice as much (loss aversion = good here)
   - If contradicted 3+ times in a row: status -> 'weakening'
   - If contradicted 5+ times: status -> 'disproven'

4. THESIS UPDATE
   - If any belief changed status, trigger thesis section rewrite
   - Chief of Staff regenerates the relevant section with new evidence
   - Previous content saved to previous_version_content
   - Diff highlighted in David's Monday briefing

5. NEW BELIEF GENERATION
   - Scan for patterns in recent data not covered by existing beliefs
   - e.g. "3 sale_comps this week in Fontana all above $280/SF -- is this a new trend?"
   - Generate new hypothesis beliefs with confidence=30, status='hypothesis'
   - Flag for David's review in next briefing
```

### 31.4 -- Contradiction Detection

**This is the most valuable part.** When new data contradicts the market model, it's either noise (most of the time) or a regime change (occasionally, but enormously valuable when caught).

```
CONTRADICTION DETECTOR
======================

Triggers: Every new sale_comp, lease_comp, or high-confidence signal

1. Compare new data point to active beliefs:
   - New sale at $310/SF in Ontario when belief says "$250/SF avg"
     -> If 1 data point: flag as outlier, append to evidence_against
     -> If 3+ data points in same direction: trigger belief review

2. Regime Change Detection:
   - Track rolling 30-day averages vs. belief values
   - If 30-day avg diverges >15% from belief: ALERT
   - Alert goes to David's briefing as: "MARKET SHIFT DETECTED"
   - Example: "Industrial cap rates in West IE compressed from 5.2% to 4.6%
     over last 45 days. This contradicts our pricing belief #12.
     Recommendation: update ECV sale_price_psf from $250 to $275."

3. Auto-adjustment (with guardrails):
   - For ECV config values: propose new value, stage in tpe_config_proposals
   - Never auto-update tpe_config -- always through David approval
   - Show: old value, new value, evidence, confidence
```

### 31.5 -- How It Compounds

Week 1: System has 10 hypothesis beliefs seeded from David's intuition.
Month 1: 8 confirmed, 2 weakening. 5 new hypotheses generated from data. Thesis is rough but directional.
Month 3: 20 active beliefs, 6 strong. Thesis sections are data-rich. First regime change detected (rent compression in a submarket). David adjusts strategy.
Month 6: 35+ beliefs form an interconnected model. Cross-type rules have performance data. The system can answer "Why should I call this owner?" with a causal chain: "Because LLC owners in West IE hold 7-10 years (belief #3, strong, confirmed 12x), this property is at year 9 (data), cap rates are compressing in this submarket (belief #17, confirmed 8x, updated last week), creating a tax-advantaged exit window before rate cuts end."

**That's a theory, not a data point.**

**Priority:** High. This is the highest-leverage capability in this entire batch. The belief table and testing engine are simple to implement and compound every week.

**Effort:** 2 weeks for beliefs table + testing engine. 1 week for thesis document generation. 1 week for contradiction detection. Ongoing: Chief of Staff maintains it automatically.

---

<a id="prompt-32"></a>
# PROMPT 32: Antifragile System Design

## Current State Analysis

The system has error handling at multiple layers:
- Express server catches errors in try/catch blocks and returns 400/503 status codes
- `agent_heartbeats` tracks agent status (running/idle/error/offline)
- `agent_logs` records errors with `log_type = 'error'`
- `agent_escalations` routes problems to Tier 1 for human decision
- `ai_usage_tracking` monitors costs

**How is antifragility different from error handling?**

Error handling: "The API call failed. Retry 3 times. If still failing, log the error and move on."

Antifragility: "The API call failed. Why? Is this source degrading? What alternative sources exist? Has this failure pattern happened before? What did we learn last time? Should we preemptively switch strategies before more failures occur? Did this failure reveal a data quality gap we didn't know about?"

Error handling is defensive. Antifragility is offensive -- the system gets stronger because of the failure.

**The gap:**
1. Failures are logged but never analyzed for patterns
2. No alternative source discovery when a source degrades
3. No automatic strategy switching when a category of enrichment consistently fails
4. No failure journal connecting past failures to strategy changes
5. No mechanism for failures to improve the system's capabilities

## Proposed Design

### 32.1 -- Failure Event System

Every failure generates a structured learning event, not just an error log.

```sql
CREATE TABLE IF NOT EXISTS failure_events (
    id              SERIAL PRIMARY KEY,
    -- What failed
    agent_name      TEXT NOT NULL,
    operation       TEXT NOT NULL,
    -- e.g. 'enrich_contact', 'scrape_costar', 'send_email', 'transcribe_call'
    failure_type    TEXT NOT NULL CHECK (failure_type IN (
        'api_error',        -- external API returned error
        'timeout',          -- operation timed out
        'rate_limit',       -- hit rate limit
        'data_quality',     -- source returned bad/stale data
        'auth_failure',     -- credentials expired/invalid
        'parse_error',      -- couldn't parse response
        'validation_fail',  -- output failed quality checks
        'cost_exceeded',    -- operation would exceed budget
        'dependency_down',  -- required service unavailable
        'logic_error'       -- internal bug or unexpected state
    )),
    -- Context
    error_message   TEXT,
    error_code      TEXT,
    request_context JSONB DEFAULT '{}',
    -- {service, endpoint, params, contact_id, property_id, etc.}
    -- Pattern matching
    failure_hash    TEXT,
    -- hash of (agent_name + operation + failure_type + error_code)
    -- for grouping identical failures
    -- Learning
    learning_status TEXT DEFAULT 'unanalyzed' CHECK (learning_status IN (
        'unanalyzed',       -- just logged, not yet analyzed
        'analyzed',         -- pattern identified
        'action_taken',     -- strategy adjustment made
        'recurring'         -- keeps happening despite action
    )),
    root_cause      TEXT,                   -- identified after analysis
    strategy_change TEXT,                   -- what was changed as a result
    strategy_change_ref TEXT,               -- reference to what was modified
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_failure_events_agent ON failure_events(agent_name);
CREATE INDEX idx_failure_events_type ON failure_events(failure_type);
CREATE INDEX idx_failure_events_hash ON failure_events(failure_hash);
CREATE INDEX idx_failure_events_status ON failure_events(learning_status);
CREATE INDEX idx_failure_events_created ON failure_events(created_at);
```

### 32.2 -- Failure Pattern Analyzer (runs in Chief of Staff daily cycle)

```
FAILURE PATTERN ANALYSIS
========================

1. GROUP failures by failure_hash over last 7 days
   - If same failure_hash appears 3+ times -> PATTERN DETECTED

2. For each pattern:
   a. Classify severity:
      - CRITICAL: auth_failure or dependency_down (source is unusable)
      - DEGRADED: rate_limit or timeout (source is stressed)
      - QUALITY: data_quality or validation_fail (source is unreliable)
      - TRANSIENT: api_error with <3 occurrences (probably temporary)

   b. Determine response:

   CRITICAL -> Immediate actions:
     - Disable the failing source in agent config
     - Check alternative_sources table for replacements
     - Alert David via agent_escalations with urgency='critical'
     - If auth_failure: check if API key needs rotation

   DEGRADED -> Adaptive actions:
     - Reduce request rate to this source (backoff)
     - Increase batch intervals
     - If rate_limit: adjust scheduling to off-peak hours
     - Monitor for 48 hours, if not improving -> escalate

   QUALITY -> Strategic actions:
     - Reduce confidence_weight for this source in calibration
     - Increase cross-validation requirements (need 2+ sources to confirm)
     - Log in failure_journal for Chief of Staff review
     - If quality issues persist 7+ days: mark source as 'degraded'
       in source_registry

   TRANSIENT -> Log and monitor:
     - No action unless frequency increases
     - Reset counter if 48 hours pass without recurrence
```

### 32.3 -- Alternative Source Discovery

When a primary source fails persistently, the system should automatically identify and test alternatives.

```sql
CREATE TABLE IF NOT EXISTS source_registry (
    id              SERIAL PRIMARY KEY,
    -- Source identity
    source_name     TEXT NOT NULL UNIQUE,
    source_type     TEXT NOT NULL CHECK (source_type IN (
        'contact_enrichment',   -- White Pages, BeenVerified, etc.
        'company_data',         -- Open Corporates, ZoomInfo, etc.
        'property_data',        -- CoStar, Reonomy, etc.
        'market_data',          -- GlobeSt, CoStar News, etc.
        'email_verification',   -- NeverBounce, ZeroBounce, etc.
        'phone_verification',   -- Twilio Lookup, NumVerify, etc.
        'imagery',              -- Google Street View, Nearmap, etc.
        'transcription',        -- Whisper, Deepgram, etc.
        'llm'                   -- Claude, GPT, Qwen, etc.
    )),
    -- Configuration
    api_endpoint    TEXT,
    cost_per_call   NUMERIC DEFAULT 0,
    rate_limit_rpm  INTEGER,               -- requests per minute
    -- Health
    health_status   TEXT DEFAULT 'healthy' CHECK (health_status IN (
        'healthy',      -- working normally
        'degraded',     -- elevated error rate
        'failing',      -- majority of calls failing
        'disabled',     -- manually or automatically disabled
        'untested'      -- newly discovered, not yet validated
    )),
    reliability_score INTEGER DEFAULT 100, -- 0-100, rolling 30-day success rate
    last_success    TIMESTAMPTZ,
    last_failure    TIMESTAMPTZ,
    consecutive_failures INTEGER DEFAULT 0,
    -- Alternatives
    alternatives    TEXT[],                -- other source_names that provide similar data
    is_primary      BOOLEAN DEFAULT FALSE, -- is this the primary source for its type?
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_source_registry_type ON source_registry(source_type);
CREATE INDEX idx_source_registry_health ON source_registry(health_status);
```

**Auto-failover logic:**

```
When source X fails:
1. Increment X.consecutive_failures
2. Update X.reliability_score = (successes / total) * 100 over last 30 days
3. If consecutive_failures >= 5:
   a. Set X.health_status = 'failing'
   b. Find alternatives: SELECT * FROM source_registry
      WHERE source_type = X.source_type
      AND health_status IN ('healthy', 'untested')
      AND source_name != X.source_name
   c. For 'untested' alternatives: run 3 test queries
      - If 2/3 succeed: set health_status = 'healthy', promote to primary
      - If <2/3 succeed: set health_status = 'failing'
   d. For 'healthy' alternatives: switch primary flag
   e. Log the switch in failure_events with strategy_change
4. If no alternatives exist:
   a. Post to agent_priority_board:
      source_agent='failure_analyzer', target_agent='chief_of_staff',
      priority_type='research_property',
      reason='No working source for {source_type}. Need alternative.'
   b. Chief of Staff researches options, updates source_registry
```

### 32.4 -- Strategy Switching for Persistent Category Failures

Sometimes it's not a source failing -- it's an entire approach failing. For example, if email enrichment for "Trust"-type owners consistently yields no results (because trusts don't have public email), the system should switch strategy from "find email" to "find attorney of record" or "find managing member."

```sql
CREATE TABLE IF NOT EXISTS strategy_overrides (
    id              SERIAL PRIMARY KEY,
    -- What category of work
    operation       TEXT NOT NULL,
    -- e.g. 'enrich_contact_email', 'enrich_owner_phone'
    -- Condition that triggers the override
    condition_field TEXT NOT NULL,
    -- e.g. 'owner_entity_type'
    condition_value TEXT NOT NULL,
    -- e.g. 'Trust'
    -- Override behavior
    original_strategy TEXT NOT NULL,
    -- e.g. 'search White Pages + BeenVerified for owner email'
    override_strategy TEXT NOT NULL,
    -- e.g. 'search Open Corporates for trust attorney, then enrich attorney'
    -- Performance tracking
    times_applied   INTEGER DEFAULT 0,
    success_rate    NUMERIC DEFAULT 0,     -- rolling success rate with this override
    -- Lifecycle
    active          BOOLEAN DEFAULT TRUE,
    discovered_by   TEXT DEFAULT 'failure_analyzer',
    -- was this rule auto-discovered or manually added?
    discovery_evidence TEXT,
    -- e.g. '47/50 email enrichments for Trust owners returned no results'
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_strategy_overrides_operation ON strategy_overrides(operation, condition_field);
CREATE INDEX idx_strategy_overrides_active ON strategy_overrides(active);
```

**Auto-discovery algorithm:**

```
STRATEGY SWITCH DETECTION (runs weekly)
=======================================

1. For each (operation, entity_category) pair in failure_events:
   GROUP BY operation, request_context->>'owner_type' (or similar segmentation)

2. If failure_rate > 70% for a specific segment AND sample_size >= 20:
   - This segment needs a different strategy
   - Generate strategy_override proposal:
     "Email enrichment for Trust owners fails 84% of the time (42/50).
      Proposed override: Search for trust attorney instead."
   - Stage as pending in strategy_overrides
   - Escalate to Chief of Staff for review

3. Chief of Staff options:
   a. Approve: activate the override, agents check strategy_overrides
      before executing their default approach
   b. Modify: adjust the override strategy
   c. Reject: mark as rejected with reasoning (maybe the approach
      is correct but the sources need updating)
```

### 32.5 -- Failure Journal (Chief of Staff Strategic Document)

The failure journal is a structured record that transforms failures into institutional knowledge. It lives alongside the market thesis as a strategic document.

```sql
CREATE TABLE IF NOT EXISTS failure_journal (
    id              SERIAL PRIMARY KEY,
    -- Entry metadata
    entry_date      DATE DEFAULT CURRENT_DATE,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    -- Content
    title           TEXT NOT NULL,
    -- e.g. "BeenVerified data quality degradation for SB County"
    category        TEXT NOT NULL CHECK (category IN (
        'source_degradation',
        'strategy_ineffective',
        'cost_overrun',
        'data_gap_discovered',
        'integration_failure',
        'model_prediction_wrong',
        'process_bottleneck'
    )),
    -- Analysis
    failure_summary TEXT NOT NULL,          -- what happened
    root_cause      TEXT NOT NULL,          -- why it happened
    impact          TEXT NOT NULL,          -- what was the business impact
    resolution      TEXT NOT NULL,          -- what was done about it
    lessons_learned TEXT NOT NULL,          -- what the system learned
    -- Links
    related_failure_ids INTEGER[],         -- failure_events that contributed
    related_belief_ids  INTEGER[],         -- market_beliefs affected
    strategy_override_id INTEGER,          -- if a strategy override was created
    -- Outcome tracking
    resolution_effective BOOLEAN,          -- did the fix actually work?
    follow_up_date  DATE,                  -- when to check if resolution held
    follow_up_notes TEXT,
    -- Timestamps
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_failure_journal_category ON failure_journal(category);
CREATE INDEX idx_failure_journal_date ON failure_journal(entry_date);
```

### 32.6 -- The Failure -> Learning -> Improvement Data Flow

```
FAILURE OCCURS
    |
    v
[1] failure_events row created (immediate, automatic)
    - Structured: agent, operation, type, context
    |
    v
[2] Pattern Analyzer (daily, Chief of Staff)
    - Groups by failure_hash
    - Classifies severity
    - Determines response type
    |
    +---> CRITICAL: source_registry health update + auto-failover
    |
    +---> DEGRADED: backoff + monitoring
    |
    +---> QUALITY: confidence weight reduction + cross-validation increase
    |
    +---> PATTERN: strategy_overrides proposal
    |
    v
[3] Failure Journal Entry (weekly, Chief of Staff)
    - Synthesizes week's failures into strategic insights
    - Identifies root causes across patterns
    - Creates or updates market_beliefs if failures reveal market truths
    |
    v
[4] System Improvement (ongoing)
    - source_registry updated with health scores
    - strategy_overrides activated for failing categories
    - tpe_config adjusted if failure patterns reveal scoring gaps
    - Agent instructions updated if process changes needed
    - confidence_weights recalibrated to downweight unreliable sources
    |
    v
[5] COMPOUNDING
    - Next time this failure type occurs, the system already has:
      a. A working alternative source (from step 3a)
      b. A strategy override (from step 3d)
      c. Calibrated confidence weights (from step 4)
      d. Historical context in failure_journal (from step 3)
    - The system handles it automatically instead of failing
    - THAT is antifragility: the failure made the system stronger
```

### 32.7 -- Concrete Examples of Antifragile Behavior

**Example 1: Source Degradation**
- Week 1: BeenVerified returns stale data for 3 San Bernardino contacts
- Week 2: 12 more failures. Pattern analyzer flags: "BeenVerified SB County data_quality failure rate 68%"
- Action: Reduce BeenVerified confidence weight for SB County from 25 to 10. Increase White Pages weight. Add county assessor MCP as alternative source.
- Week 3: Enrichment quality for SB County improves because the system is no longer trusting a bad source.

**Example 2: Category Strategy Switch**
- Month 1-2: 47 out of 50 email enrichments for Trust-type owners fail
- Strategy switch: For Trust owners, search Open Corporates for managing member, then enrich the person, not the trust
- Month 3: Trust owner email success rate goes from 6% to 34%

**Example 3: Market Belief Correction**
- Belief #7: "Industrial properties in Ontario trade at $250/SF"
- 5 consecutive sale comps come in above $290/SF
- Contradiction detector fires, updates belief confidence from 85 to 45
- Chief of Staff rewrites industrial thesis section
- ECV model proposes new sale_price_psf = $285
- David approves, all TPE scores recalculate
- The market shift was caught 6 weeks earlier than manual analysis would have found it

**Priority:** High. The failure_events table and pattern analyzer can be implemented in 1 week and immediately start generating value. Every failure the system experiences from day 1 becomes training data.

**Effort:** 1 week for failure_events + pattern analyzer. 1 week for source_registry + auto-failover. 1 week for strategy_overrides. 1 week for failure_journal + integration with Chief of Staff.

---

# Implementation Roadmap

## Phase 1: Foundations (Weeks 1-3)
| Item | Prompt | Priority | Effort |
|------|--------|----------|--------|
| Market beliefs table + belief seeding | 31 | **Critical** | 3 days |
| Failure events table + pattern analyzer | 32 | **Critical** | 3 days |
| Source registry + auto-failover | 32 | High | 4 days |
| PDF OM extraction pipeline | 29 | High | 5 days |

## Phase 2: Intelligence (Weeks 4-6)
| Item | Prompt | Priority | Effort |
|------|--------|----------|--------|
| Belief testing engine (weekly cycle) | 31 | **Critical** | 4 days |
| Cross-type inference rules + engine | 30 | High | 5 days |
| Phone call transcription (local Whisper) | 29 | High | 4 days |
| Strategy overrides + auto-discovery | 32 | Medium-High | 3 days |

## Phase 3: Synthesis (Weeks 7-9)
| Item | Prompt | Priority | Effort |
|------|--------|----------|--------|
| Market thesis document generation | 31 | High | 4 days |
| Contradiction detection + alerts | 31 | High | 3 days |
| Company lifecycle model | 30 | Medium-High | 5 days |
| Failure journal + Chief of Staff integration | 32 | Medium | 3 days |

## Phase 4: Advanced (Weeks 10-12)
| Item | Prompt | Priority | Effort |
|------|--------|----------|--------|
| Property photo condition scoring | 29 | Medium | 5 days |
| Conversion analysis (type arbitrage) | 30 | Medium | 4 days |
| Cross-type TPE modifiers | 30 | Medium | 3 days |
| Satellite change detection (research only) | 29 | Low | 3 days |

---

# Migration 008: Strategic Cognition Schema

All tables from this design spec would be consolidated into a single migration file. The total new tables:

| Table | Prompt | Purpose |
|-------|--------|---------|
| `sandbox_om_extractions` | 29 | Staged OM extraction data |
| `cross_type_rules` | 30 | Cross-property-type inference rules |
| `company_lifecycle` | 30 | Company stage tracking |
| `conversion_analysis` | 30 | Property type arbitrage analysis |
| `market_beliefs` | 31 | Testable market beliefs |
| `market_thesis` | 31 | Living market narrative document |
| `failure_events` | 32 | Structured failure learning events |
| `source_registry` | 32 | Data source health tracking |
| `strategy_overrides` | 32 | Category-specific strategy switches |
| `failure_journal` | 32 | Strategic failure synthesis |

New columns on `properties`:
- `condition_score INTEGER`
- `condition_notes TEXT`
- `condition_assessed_at TIMESTAMPTZ`
- `vacancy_visual_signals JSONB`

New rows in `tpe_config`:
- 6 property type modifier values

---

# Cost Summary

| Capability | Monthly Cost | Monthly Value (hours saved) |
|------------|-------------|---------------------------|
| PDF OM Extraction | $25-35 | 32-64 hours |
| Call Transcription | $0-30 | 20-40 hours |
| Photo Scoring | $5-20 | 4-8 hours |
| Satellite (future) | $500-2000 | 8-16 hours |
| Market Theory Engine | $0 (runs in Chief of Staff cycle) | Qualitative: better deal selection |
| Antifragile System | $0 (runs in Chief of Staff cycle) | Qualitative: fewer failures over time |

**Total incremental cost: $30-85/month (excluding satellite)**
**Total time saved: 50-110 hours/month**
**ROI: Extremely favorable**
