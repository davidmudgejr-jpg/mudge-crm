# Prompts 25-28: Strategic Cognition Layer
## Relationship Graphs, Temporal Intelligence, Simulation, and Explainability
**Generated: March 13, 2026**
**Analyst: Claude Opus 4.6 -- Systems Architecture Mode**

---

# PROMPT 25: Relationship Graph Intelligence

## Current State

The CRM stores relationships as flat M2M junction tables:

| Junction Table | Connects |
|---|---|
| `property_contacts` | Properties to Contacts (with `role`) |
| `property_companies` | Properties to Companies |
| `contact_companies` | Contacts to Companies |
| `deal_contacts` | Deals to Contacts |
| `deal_companies` | Deals to Companies |
| `deal_properties` | Deals to Properties |
| `interaction_contacts` | Interactions to Contacts |
| `interaction_companies` | Interactions to Companies |
| `interaction_properties` | Interactions to Properties |
| `interaction_deals` | Interactions to Deals |
| `campaign_contacts` | Campaigns to Contacts |
| `action_item_contacts` | Action Items to Contacts |
| `action_item_companies` | Action Items to Companies |
| `action_item_properties` | Action Items to Properties |
| `action_item_deals` | Action Items to Deals |

These junctions answer "who is linked to what" but cannot answer:
- How strong is this relationship?
- What is the shortest path from David to Decision Maker X?
- Who are the network hubs that unlock the most opportunities?
- Which relationships are decaying?
- What is the warmest introduction path to Company Y?

## Gap Analysis

| Gap | Impact |
|-----|--------|
| No relationship strength scoring | All connections treated equally -- a contact David talked to yesterday vs. 2 years ago |
| No path traversal capability | Cannot discover that David knows Contact A, who works with Contact B at Company C, whose VP is the decision maker |
| No hub identification | David cannot see which contacts are his highest-leverage relationships for deal flow |
| No decay detection | Valuable relationships go cold silently; no alert when a key contact hasn't been engaged in 6+ months |
| No warm intro routing | When targeting a new company, David has to mentally trace his network; system cannot help |
| Junction `role` field is rarely populated | Even existing relationship context is sparse |

## Proposed Design

### Decision: PostgreSQL with Graph Extensions (Not a Graph DB)

A separate graph database (Neo4j, etc.) adds operational complexity, a sync layer, and a second query language for a team of one. PostgreSQL can handle this workload with recursive CTEs, and the dataset (hundreds to low thousands of nodes) is well within SQL graph traversal limits.

The design uses three new tables that sit on top of the existing junction tables and derive their data from them.

### New Table: `relationship_edges`

This is the core graph structure -- a unified edge table that collapses all junction tables into typed, weighted edges.

```sql
CREATE TABLE IF NOT EXISTS relationship_edges (
  id SERIAL PRIMARY KEY,
  -- Source node
  source_entity_type TEXT NOT NULL CHECK (source_entity_type IN (
    'contact', 'company', 'property', 'deal'
  )),
  source_entity_id UUID NOT NULL,
  -- Target node
  target_entity_type TEXT NOT NULL CHECK (target_entity_type IN (
    'contact', 'company', 'property', 'deal'
  )),
  target_entity_id UUID NOT NULL,
  -- Edge metadata
  relationship_type TEXT NOT NULL,
  -- Examples: 'works_at', 'owns', 'tenant_of', 'broker_for', 'co_invested',
  -- 'referred_by', 'former_colleague', 'deal_party', 'introduced_by'
  role TEXT,                          -- from junction role field if present
  -- Strength scoring (0.0 to 1.0)
  strength_score NUMERIC(4,3) DEFAULT 0.500,
  strength_factors JSONB DEFAULT '{}',
  -- Example: {
  --   "interaction_frequency": 0.8,   -- based on interaction count/recency
  --   "deal_history": 0.6,            -- shared deals
  --   "response_rate": 0.9,           -- email open/reply rate
  --   "recency": 0.7,                 -- days since last contact
  --   "manual_boost": 0.0             -- David's override
  -- }
  -- Directionality
  is_bidirectional BOOLEAN DEFAULT TRUE,
  -- Lifecycle
  first_observed_at TIMESTAMPTZ DEFAULT NOW(),
  last_interaction_at TIMESTAMPTZ,
  interaction_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'decaying', 'dormant', 'severed')),
  -- Source tracking
  source TEXT DEFAULT 'junction_sync', -- 'junction_sync', 'manual', 'ai_inferred'
  confidence NUMERIC(4,3) DEFAULT 1.000,
  notes TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  -- Prevent duplicate edges
  UNIQUE (source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type)
);

CREATE INDEX idx_rel_edges_source ON relationship_edges(source_entity_type, source_entity_id);
CREATE INDEX idx_rel_edges_target ON relationship_edges(target_entity_type, target_entity_id);
CREATE INDEX idx_rel_edges_type ON relationship_edges(relationship_type);
CREATE INDEX idx_rel_edges_strength ON relationship_edges(strength_score DESC);
CREATE INDEX idx_rel_edges_status ON relationship_edges(status);
CREATE INDEX idx_rel_edges_last_interaction ON relationship_edges(last_interaction_at);
```

### New Table: `relationship_graph_cache`

Pre-computed graph metrics, refreshed nightly by the Nightly Cron.

```sql
CREATE TABLE IF NOT EXISTS relationship_graph_cache (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  -- Network metrics
  degree_centrality INTEGER DEFAULT 0,      -- total edge count
  weighted_centrality NUMERIC(8,3) DEFAULT 0,-- sum of strength_score on edges
  betweenness_score NUMERIC(8,3) DEFAULT 0, -- how often this node is on shortest paths
  hub_score NUMERIC(8,3) DEFAULT 0,         -- composite: centrality * deal connectivity
  -- Reach metrics
  direct_contacts INTEGER DEFAULT 0,
  two_hop_reach INTEGER DEFAULT 0,          -- unique entities reachable in 2 hops
  three_hop_reach INTEGER DEFAULT 0,
  -- Deal connectivity
  active_deals_connected INTEGER DEFAULT 0,
  closed_deals_connected INTEGER DEFAULT 0,
  total_deal_value_connected NUMERIC DEFAULT 0,
  -- Decay status
  decaying_edges INTEGER DEFAULT 0,
  dormant_edges INTEGER DEFAULT 0,
  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX idx_graph_cache_hub ON relationship_graph_cache(hub_score DESC);
CREATE INDEX idx_graph_cache_entity ON relationship_graph_cache(entity_type, entity_id);
```

### New Table: `relationship_path_cache`

Pre-computed shortest paths from David's direct contacts to high-value targets.

```sql
CREATE TABLE IF NOT EXISTS relationship_path_cache (
  id SERIAL PRIMARY KEY,
  -- Path endpoints
  from_entity_type TEXT NOT NULL,
  from_entity_id UUID NOT NULL,
  to_entity_type TEXT NOT NULL,
  to_entity_id UUID NOT NULL,
  -- Path details
  degrees_of_separation INTEGER NOT NULL,
  path_nodes JSONB NOT NULL,
  -- Example: [
  --   {"type": "contact", "id": "uuid1", "name": "David Mudge"},
  --   {"type": "contact", "id": "uuid2", "name": "John Smith", "relationship": "works_at"},
  --   {"type": "company", "id": "uuid3", "name": "ABC Logistics", "relationship": "vp_of"}
  -- ]
  path_strength NUMERIC(4,3),             -- product of edge strengths along path
  warmth_score NUMERIC(4,3),              -- path_strength * recency factor
  -- Timestamps
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

CREATE INDEX idx_path_cache_from ON relationship_path_cache(from_entity_type, from_entity_id);
CREATE INDEX idx_path_cache_to ON relationship_path_cache(to_entity_type, to_entity_id);
CREATE INDEX idx_path_cache_warmth ON relationship_path_cache(warmth_score DESC);
```

### Algorithms

#### A. Strength Score Calculation

Run nightly or on interaction creation. Inputs from existing data:

```
strength_score = weighted_average(
  interaction_frequency_score  * 0.30,   -- interactions in last 12 months / max(all contacts)
  recency_score                * 0.25,   -- 1.0 if <7 days, decays exponentially to 0 at 365 days
  deal_history_score           * 0.20,   -- 1.0 if closed deal together, 0.5 if active, 0.0 if none
  response_rate_score          * 0.15,   -- email open/reply rate from outbound_email_queue
  manual_boost                 * 0.10    -- David's override (0-1), defaults to 0.5
)
```

Recency decay function: `recency_score = EXP(-0.005 * days_since_last_interaction)`

This gives: 7 days = 0.97, 30 days = 0.86, 90 days = 0.64, 180 days = 0.41, 365 days = 0.16.

#### B. Decay Detection

Run nightly. Status transitions:

| Current Status | Days Since Last Interaction | New Status | Action |
|---|---|---|---|
| active | > 90 | decaying | Yellow indicator on contact card |
| active | > 180 | dormant | Red indicator + action item created |
| decaying | new interaction logged | active | Status restored |
| dormant | > 365, no interaction | severed | Edge deprioritized in path calculations |

When a contact transitions to `decaying`, the system creates an `action_item` titled "Re-engage [Name] -- relationship decaying (X days since last contact)" with `source = 'relationship_graph'`.

#### C. Shortest Path (BFS via Recursive CTE)

```sql
WITH RECURSIVE paths AS (
  -- Seed: edges from David's contact node
  SELECT
    target_entity_type,
    target_entity_id,
    1 AS depth,
    ARRAY[jsonb_build_object(
      'type', source_entity_type, 'id', source_entity_id
    )] || ARRAY[jsonb_build_object(
      'type', target_entity_type, 'id', target_entity_id,
      'via', relationship_type
    )] AS path,
    strength_score AS cumulative_strength
  FROM relationship_edges
  WHERE source_entity_type = 'contact'
    AND source_entity_id = :david_contact_id
    AND status IN ('active', 'decaying')

  UNION ALL

  -- Recurse: follow edges up to 4 hops
  SELECT
    e.target_entity_type,
    e.target_entity_id,
    p.depth + 1,
    p.path || ARRAY[jsonb_build_object(
      'type', e.target_entity_type, 'id', e.target_entity_id,
      'via', e.relationship_type
    )],
    p.cumulative_strength * e.strength_score
  FROM relationship_edges e
  JOIN paths p ON e.source_entity_type = p.target_entity_type
              AND e.source_entity_id = p.target_entity_id
  WHERE p.depth < 4
    AND e.status IN ('active', 'decaying')
    AND NOT (e.target_entity_id = ANY(
      SELECT (elem->>'id')::UUID FROM unnest(p.path) AS elem
    )) -- prevent cycles
)
SELECT * FROM paths
WHERE target_entity_type = :target_type
  AND target_entity_id = :target_id
ORDER BY depth ASC, cumulative_strength DESC
LIMIT 5;
```

#### D. Hub Score Calculation

```
hub_score = (
  degree_centrality_normalized * 0.25 +
  weighted_centrality_normalized * 0.25 +
  active_deals_connected / max_deals * 0.30 +
  two_hop_reach / max_two_hop * 0.20
)
```

Contacts with `hub_score > 0.7` are flagged as "Network Hubs" in the UI.

### Integration with TPE Scoring

Add a **Network Proximity Bonus** to the blended priority score:

```sql
INSERT INTO tpe_config (config_category, config_key, config_value, description) VALUES
  ('network', 'network_1hop_bonus', 5, 'Property owner is 1 hop from David'),
  ('network', 'network_2hop_bonus', 3, 'Property owner is 2 hops from David'),
  ('network', 'network_hub_bonus', 2, 'Property connected to a network hub contact'),
  ('network', 'network_weight', 0.10, 'Network bonus weight in blended priority')
ON CONFLICT (config_key) DO NOTHING;
```

A property where David has a 1-hop warm path to the decision maker gets +5 points on the 100-point TPE scale. This is additive, not a replacement -- the blended formula becomes `tpe * 0.65 + ecv * 0.25 + network * 0.10`.

### Integration with Matcher (Outreach Personalization)

When the Matcher drafts outreach for a property target, it queries `relationship_path_cache`:

1. Find the warmest path to the property's owner/decision maker.
2. If a path exists with `degrees_of_separation <= 3`:
   - Include the introduction context in the email: "I work with [mutual connection] at [company]..."
   - Flag the outreach as "warm intro possible" in `sandbox_outreach.notes`.
3. If the intermediary contact is a hub, the Matcher posts to `agent_priority_board` asking the Enricher to verify the intermediary's current contact info before outreach.

### UI Concepts

**Contact Detail -- Network Panel:**
- Radial graph visualization showing 1-hop and 2-hop connections.
- Edge thickness represents strength score.
- Color coding: green (active), yellow (decaying), red (dormant).
- Click any node to see the path and relationship details.

**Property Detail -- "Path to Decision Maker" Card:**
- Shows the warmest introduction path with intermediary names.
- "Request Warm Intro" button creates an action item to ask the intermediary.

**Dashboard -- Network Health Widget:**
- Total active relationships, decaying count, dormant count.
- Top 5 hubs with their hub scores.
- "Relationships at risk" list (transitioning to decaying this week).

### Edge Sync: Junction Tables to `relationship_edges`

A nightly job (or trigger on junction table INSERT/DELETE) syncs edges:

```sql
-- Example: sync contact_companies to relationship_edges
INSERT INTO relationship_edges (
  source_entity_type, source_entity_id,
  target_entity_type, target_entity_id,
  relationship_type, source
)
SELECT
  'contact', cc.contact_id,
  'company', cc.company_id,
  'works_at', 'junction_sync'
FROM contact_companies cc
ON CONFLICT (source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type)
DO NOTHING;
```

Repeat for all 15 junction tables with appropriate `relationship_type` values.

### Implementation Priority and Effort

| Component | Priority | Effort | Rationale |
|---|---|---|---|
| `relationship_edges` table + junction sync | P0 | 2 days | Foundation for everything else |
| Strength scoring algorithm (nightly) | P0 | 1 day | Required for decay detection and path warmth |
| Decay detection + action item creation | P1 | 1 day | Immediate CRM value -- stop losing relationships |
| Shortest path CTE + path cache | P1 | 2 days | Core differentiator for warm intro routing |
| Hub score calculation | P2 | 1 day | Strategic but not blocking other features |
| UI: Network panel on Contact Detail | P2 | 3 days | Complex visualization, can start with a list view |
| TPE network bonus integration | P2 | 0.5 days | Config table insert + view update |
| Matcher warm intro integration | P3 | 1 day | Depends on Matcher agent being operational |

**Total estimated effort: ~11.5 days**

---

# PROMPT 26: Temporal Pattern Recognition & Market Cycle Awareness

## Current State

The system captures timestamps on most tables:

- `properties.last_sale_date`, `properties.debt_date`, `properties.created_at`
- `deals.close_date`, `deals.created_at`
- `companies.lease_exp`, `companies.move_in_date`
- `interactions.date`, `interactions.created_at`
- `lease_comps.sign_date`, `lease_comps.expiration_date`, `lease_comps.commencement_date`
- `sale_comps.sale_date`
- `loan_maturities.maturity_date`
- `debt_stress.origination_date`, `debt_stress.balloon_5yr/7yr/10yr`
- `sandbox_signals.timestamp_found`
- `outbound_email_queue.sent_at`, `opened_at`, `replied_at`

The TPE scoring system uses `tpe_config` time multipliers (`time_mult_6mo`, `time_mult_12mo`, etc.) but these are static escalators based on lease expiration proximity. They don't learn from historical patterns, don't detect cyclical behavior, and don't predict optimal timing.

## Gap Analysis

| Gap | Impact |
|-----|--------|
| No seasonal awareness | System doesn't know that Q1 is typically slow for IE industrial deals while Q3 is hot |
| No hold-duration pattern recognition | Can't detect that properties held 12-15 years transact at 3x the rate of properties held 5-7 years |
| No convergence timing | Three signals (lease expiring + loan maturing + owner aging) converging in the same 6-month window is exponentially more predictive, but the system doesn't detect this |
| No signal seasonality | Enricher and Researcher run at constant cadence regardless of when data is most actionable |
| No deal velocity tracking | No model for "how long does a typical IE industrial deal take from first contact to close?" |
| No retrospective learning | After deals close, the system doesn't ask "when did the first signal appear?" to calibrate future timing |

## Proposed Design

### New Table: `temporal_patterns`

Stores discovered cyclical patterns from the system's own data.

```sql
CREATE TABLE IF NOT EXISTS temporal_patterns (
  id SERIAL PRIMARY KEY,
  -- What pattern was detected
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'deal_seasonality',        -- which months/quarters deals close
    'signal_seasonality',      -- when signal types spike
    'owner_sell_timing',       -- hold duration distributions before sale
    'lease_renewal_timing',    -- when tenants renew vs. vacate
    'engagement_timing',       -- when emails get opened/replied
    'enrichment_freshness',    -- when enrichment data goes stale
    'market_cycle_phase'       -- macro cycle position
  )),
  -- Pattern details
  pattern_name TEXT NOT NULL,
  description TEXT,
  -- Statistical model
  model_type TEXT DEFAULT 'histogram',    -- 'histogram', 'regression', 'survival'
  model_params JSONB NOT NULL,
  -- Example for deal_seasonality:
  -- {
  --   "monthly_distribution": [0.05, 0.06, 0.08, 0.09, 0.07, 0.10, 0.09, 0.11, 0.10, 0.09, 0.08, 0.08],
  --   "peak_months": [6, 8, 9],
  --   "trough_months": [1, 2],
  --   "sample_size": 47,
  --   "confidence_interval": 0.85
  -- }
  -- Example for owner_sell_timing:
  -- {
  --   "median_hold_years": 11.3,
  --   "percentile_25": 7.2,
  --   "percentile_75": 16.8,
  --   "hazard_rate_by_year": [0.02, 0.03, 0.03, 0.04, 0.05, 0.06, 0.07, 0.09, 0.11, 0.13, ...],
  --   "sample_size": 312,
  --   "property_type": "industrial"
  -- }
  -- Filters (what subset of data this pattern applies to)
  filters JSONB DEFAULT '{}',
  -- Example: {"property_type": "industrial", "submarket": "Ontario"}
  -- Validity
  sample_size INTEGER NOT NULL,
  confidence NUMERIC(4,3),
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '90 days'),
  superseded_by INTEGER REFERENCES temporal_patterns(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_temporal_type ON temporal_patterns(pattern_type);
CREATE INDEX idx_temporal_valid ON temporal_patterns(valid_until);
```

### New Table: `property_transaction_windows`

Per-property predicted transaction windows based on converging signals.

```sql
CREATE TABLE IF NOT EXISTS property_transaction_windows (
  id SERIAL PRIMARY KEY,
  property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
  -- Individual signal timelines
  lease_expiration_date DATE,
  loan_maturity_date DATE,
  owner_age_threshold_date DATE,       -- estimated date owner hits 65/70
  hold_duration_years NUMERIC,
  hold_percentile NUMERIC(4,3),        -- where this hold sits vs. historical distribution
  -- Convergence analysis
  convergence_window_start DATE,       -- earliest of the signal dates
  convergence_window_end DATE,         -- latest of the signal dates
  convergence_span_months INTEGER,     -- how tight the window is
  signals_converging INTEGER,          -- count of signals hitting in the window
  signals_detail JSONB,
  -- Example: [
  --   {"signal": "lease_expires", "date": "2026-09-15", "weight": 0.30},
  --   {"signal": "loan_matures", "date": "2026-11-01", "weight": 0.25},
  --   {"signal": "owner_age_70", "date": "2027-01-15", "weight": 0.20}
  -- ]
  -- Predicted transaction probability
  transaction_probability NUMERIC(4,3),  -- 0.000 to 1.000
  optimal_outreach_date DATE,            -- when to start outreach (typically 6-9 months before window)
  -- Timing multiplier for TPE
  timing_multiplier NUMERIC(4,3) DEFAULT 1.000,
  -- Lifecycle
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  UNIQUE (property_id)
);

CREATE INDEX idx_txn_windows_property ON property_transaction_windows(property_id);
CREATE INDEX idx_txn_windows_probability ON property_transaction_windows(transaction_probability DESC);
CREATE INDEX idx_txn_windows_outreach ON property_transaction_windows(optimal_outreach_date);
CREATE INDEX idx_txn_windows_convergence ON property_transaction_windows(signals_converging DESC);
```

### New Table: `temporal_snapshots`

Monthly snapshots of key metrics for trend detection (the system's own time series).

```sql
CREATE TABLE IF NOT EXISTS temporal_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN (
    'deal_pipeline',       -- active deals by stage, total value
    'property_coverage',   -- properties tracked, TPE distribution
    'contact_engagement',  -- active contacts, decay rates
    'signal_volume',       -- signals by type per period
    'outreach_performance' -- emails sent, open rate, reply rate
  )),
  metrics JSONB NOT NULL,
  -- Example for deal_pipeline:
  -- {
  --   "active_deals": 12,
  --   "total_pipeline_value": 4500000,
  --   "avg_days_in_pipeline": 87,
  --   "deals_closed_this_month": 2,
  --   "deals_lost_this_month": 1,
  --   "by_stage": {"prospecting": 5, "proposal": 3, "negotiation": 2, "closing": 2}
  -- }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (snapshot_date, snapshot_type)
);

CREATE INDEX idx_snapshots_date ON temporal_snapshots(snapshot_date);
CREATE INDEX idx_snapshots_type ON temporal_snapshots(snapshot_type);
```

### Algorithms

#### A. Deal Seasonality Detection

Run quarterly from `sale_comps` and `deals` with `close_date`:

```sql
-- Monthly deal close distribution
SELECT
  EXTRACT(MONTH FROM close_date) AS month,
  COUNT(*) AS deal_count,
  AVG(price) AS avg_deal_value,
  COUNT(*)::NUMERIC / SUM(COUNT(*)) OVER () AS month_share
FROM deals
WHERE close_date IS NOT NULL
  AND close_date > NOW() - INTERVAL '3 years'
GROUP BY EXTRACT(MONTH FROM close_date)
ORDER BY month;
```

Store the `month_share` array as the deal seasonality pattern. A chi-squared test against uniform distribution determines if the seasonality is statistically significant (p < 0.05 with 11 df).

#### B. Hold Duration Survival Analysis

Uses a Kaplan-Meier estimator on `sale_comps` data:

1. For each property that sold, compute `hold_duration = sale_date - previous_sale_date` (from CoStar historical data or `properties.last_sale_date`).
2. For properties that haven't sold, they are right-censored observations.
3. Compute the hazard rate by year: probability of selling in year N given they haven't sold by year N-1.
4. Properties with hold duration in the top quartile of hazard rate get a timing multiplier > 1.0.

Implementation: This is a batch SQL computation, not a real-time calculation. The Nightly Cron stores results in `property_transaction_windows.hold_percentile`.

#### C. Convergence Window Detection

For each property, collect all datable signals:

```python
signals = []
if lease_exp and lease_exp < now + 24_months:
    signals.append(("lease_expires", lease_exp, 0.30))
if loan_maturity and loan_maturity < now + 24_months:
    signals.append(("loan_matures", loan_maturity, 0.25))
if owner_age >= 63:  # will hit 65 within 2 years
    signals.append(("owner_age_65", owner_dob + 65_years, 0.20))
if hold_duration >= median_hold * 0.8:
    signals.append(("hold_duration_ripe", estimated_sell_date, 0.15))
if has_distress:
    signals.append(("distress_active", filing_date, 0.10))

if len(signals) >= 2:
    window_start = min(s[1] for s in signals)
    window_end = max(s[1] for s in signals)
    span = (window_end - window_start).months
    # Tighter window = higher probability
    convergence_factor = max(0, 1.0 - (span / 24))
    transaction_probability = sum(s[2] for s in signals) * convergence_factor
    optimal_outreach = window_start - 6_months
```

#### D. Dynamic Timing Multiplier for TPE

Replace the static `tpe_config` time multipliers with a property-specific multiplier from `property_transaction_windows`:

```
timing_multiplier = base_multiplier * convergence_boost

where:
  base_multiplier = 1.0 + (0.3 * transaction_probability)
  convergence_boost = 1.0 + (0.1 * (signals_converging - 1))

Capped at 1.50.
```

A property with 3 converging signals and 0.7 transaction probability gets: `(1.0 + 0.21) * (1.0 + 0.2) = 1.45x` multiplier on its TPE score.

The difference from static TPE: static TPE says "lease expires in 12 months, add 22 points." Dynamic TPE says "lease expires in 12 months AND loan matures in 9 months AND owner is 68 -- this is a 1.45x property, move it from TPE 72 to effective TPE 104 (capped at 100)."

### Integration with Existing System

- **TPE View:** The `property_tpe_scores` view reads `timing_multiplier` from `property_transaction_windows` and applies it to the blended score.
- **Researcher Agent:** Adjusts scan frequency based on `temporal_patterns.signal_seasonality` -- scan CoStar more in peak months.
- **Enricher Agent:** Refreshes stale enrichment data based on `temporal_patterns.enrichment_freshness` -- re-verify emails every 90 days, company data every 180 days.
- **Matcher Agent:** Uses `optimal_outreach_date` from `property_transaction_windows` to time outreach campaigns. Posts to `agent_priority_board` when a property enters its outreach window.
- **Nightly Cron:** Runs all temporal computations, snapshots, and convergence window recalculations.

### UI Concepts

**Property Detail -- "Transaction Window" Card:**
- Timeline visualization showing converging signals on a horizontal axis.
- Convergence window highlighted.
- "Optimal outreach: start by [date]" callout.
- Transaction probability gauge.

**Dashboard -- Seasonal Heatmap:**
- 12-month calendar heatmap showing predicted deal activity.
- Current month highlighted with pipeline overlay.
- "This month historically sees X% of annual deal volume."

**Dashboard -- Convergence Alerts:**
- List of properties entering their transaction window in the next 30/60/90 days.
- Sorted by `transaction_probability DESC`.

### Implementation Priority and Effort

| Component | Priority | Effort | Rationale |
|---|---|---|---|
| `temporal_snapshots` + monthly snapshot job | P0 | 1 day | Foundation -- you need historical data before you can detect patterns |
| `property_transaction_windows` + convergence calc | P0 | 2 days | Highest-value output -- directly impacts which properties to target |
| `temporal_patterns` + deal seasonality | P1 | 2 days | Requires enough deal data; pattern detection logic is moderate complexity |
| Hold duration survival analysis | P2 | 2 days | Requires historical sale data from CoStar; statistical modeling |
| Dynamic timing multiplier integration | P1 | 1 day | Config change + view update once convergence calc is running |
| Enrichment freshness scheduling | P2 | 1 day | Agent scheduling logic |
| UI: Transaction window card | P2 | 2 days | Visualization |
| UI: Seasonal heatmap | P3 | 2 days | Nice-to-have dashboard widget |

**Total estimated effort: ~13 days**

---

# PROMPT 27: Simulation & What-If Analysis Engine

## Current State

The system calculates commission estimates via the ECV (Estimated Commission Value) model in `tpe_config`:

- Sale commission rates by value tier (3%/2%/1%)
- Lease commission rates (4% new, 2% renewal)
- Sale price PSF assumption ($250 IE industrial avg)
- Lease rate assumptions by size tier ($1.15/$1.00/$0.90 PSF/mo)

These are single-point estimates. There is no ability to:
- Vary interest rates and see impact on buyer pool / cap rates / deal feasibility.
- Model vacancy scenarios (what if vacancy goes from 3% to 8%?).
- Run probability distributions on outcomes.
- Compare two deal structures side by side.
- Generate client-facing scenario analysis.

## Gap Analysis

| Gap | Impact |
|-----|--------|
| Single-point ECV estimates | David cannot tell a client "there's a 70% chance your commission will be $X-$Y" |
| No rate sensitivity analysis | With rate volatility, cannot model how a 100bp rate change affects deal flow and cap rates |
| No vacancy modeling | IE industrial vacancy is historically low but rising; no way to stress-test portfolio exposure |
| No Monte Carlo capability | All analysis is deterministic; real estate is probabilistic |
| No deal structure comparison | Cannot compare "sell now at $X" vs. "re-lease and sell in 3 years at $Y" |
| No assumption tracking | When the system uses $250 PSF, nobody tracks whether that assumption was right; no feedback loop |
| No client-ready output | David manually builds Excel models; the CRM has all the data but can't model with it |

## Proposed Design

### New Table: `simulation_scenarios`

Stores scenario definitions and results.

```sql
CREATE TABLE IF NOT EXISTS simulation_scenarios (
  id SERIAL PRIMARY KEY,
  -- Context
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT DEFAULT 'david',        -- 'david' or agent name
  -- Input parameters
  property_id UUID REFERENCES properties(property_id) ON DELETE SET NULL,
  deal_id UUID REFERENCES deals(deal_id) ON DELETE SET NULL,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN (
    'sale_analysis',        -- model a sale at various cap rates / prices
    'lease_analysis',       -- model lease-up scenarios
    'hold_vs_sell',         -- compare holding vs. selling now
    'rate_sensitivity',     -- impact of interest rate changes
    'vacancy_stress',       -- impact of rising vacancy
    'development_pro_forma' -- ground-up or value-add development
  )),
  -- Input assumptions (user-provided + defaults from tpe_config)
  assumptions JSONB NOT NULL,
  -- Example for sale_analysis:
  -- {
  --   "property_sf": 45000,
  --   "current_noi": 360000,
  --   "base_cap_rate": 0.058,
  --   "cap_rate_range": [0.050, 0.070],
  --   "interest_rate_current": 0.068,
  --   "interest_rate_range": [0.055, 0.085],
  --   "vacancy_current": 0.03,
  --   "vacancy_range": [0.02, 0.10],
  --   "rent_growth_annual": 0.03,
  --   "expense_growth_annual": 0.02,
  --   "hold_period_years": 5,
  --   "exit_cap_rate": 0.060,
  --   "loan_ltv": 0.65,
  --   "loan_amortization_years": 25,
  --   "commission_structure": "sale",
  --   "simulation_runs": 10000
  -- }
  -- Simulation results
  results JSONB,
  -- Example:
  -- {
  --   "expected_value": 6206897,
  --   "expected_commission": 124138,
  --   "value_p10": 5142857,
  --   "value_p25": 5625000,
  --   "value_p50": 6206897,
  --   "value_p75": 6857143,
  --   "value_p90": 7200000,
  --   "commission_p10": 102857,
  --   "commission_p25": 112500,
  --   "commission_p50": 124138,
  --   "commission_p75": 137143,
  --   "commission_p90": 144000,
  --   "probability_above_asking": 0.42,
  --   "probability_negative_leverage": 0.18,
  --   "irr_distribution": {"p10": 0.06, "p25": 0.08, "p50": 0.11, "p75": 0.14, "p90": 0.17},
  --   "sensitivity_matrix": {
  --     "cap_rate_vs_value": [[cap_rates], [values]],
  --     "rate_vs_dscr": [[rates], [dscrs]]
  --   },
  --   "breakeven_vacancy": 0.12,
  --   "breakeven_rate": 0.092
  -- }
  -- Comparison (if this scenario is compared to another)
  compare_to_id INTEGER REFERENCES simulation_scenarios(id),
  -- Metadata
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed', 'shared')),
  shared_with TEXT[],                     -- email addresses of clients who received this
  run_duration_ms INTEGER,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_simulations_property ON simulation_scenarios(property_id);
CREATE INDEX idx_simulations_deal ON simulation_scenarios(deal_id);
CREATE INDEX idx_simulations_type ON simulation_scenarios(scenario_type);
CREATE INDEX idx_simulations_status ON simulation_scenarios(status);
```

### New Table: `simulation_assumptions_log`

Tracks which assumptions were used and whether they proved accurate (feedback loop).

```sql
CREATE TABLE IF NOT EXISTS simulation_assumptions_log (
  id SERIAL PRIMARY KEY,
  simulation_id INTEGER REFERENCES simulation_scenarios(id) ON DELETE CASCADE,
  -- The assumption
  assumption_key TEXT NOT NULL,           -- 'cap_rate', 'vacancy', 'interest_rate', etc.
  assumed_value NUMERIC NOT NULL,
  -- Ground truth (filled in after deal closes or market data arrives)
  actual_value NUMERIC,
  variance NUMERIC,                       -- actual - assumed
  variance_pct NUMERIC,                   -- (actual - assumed) / assumed
  -- Source of ground truth
  actual_source TEXT,                     -- 'deal_close', 'costar_update', 'fed_rate'
  actual_date DATE,
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_assumptions_simulation ON simulation_assumptions_log(simulation_id);
CREATE INDEX idx_assumptions_key ON simulation_assumptions_log(assumption_key);
CREATE INDEX idx_assumptions_variance ON simulation_assumptions_log(variance_pct);
```

### Monte Carlo Engine (Server-Side)

Implemented as a module in `ie-crm/server/simulation.js`:

```javascript
// Core Monte Carlo simulation
function runSimulation(assumptions, runs = 10000) {
  const results = [];

  for (let i = 0; i < runs; i++) {
    // Sample from distributions
    const capRate = sampleTriangular(
      assumptions.cap_rate_range[0],
      assumptions.base_cap_rate,
      assumptions.cap_rate_range[1]
    );
    const vacancy = sampleTriangular(
      assumptions.vacancy_range[0],
      assumptions.vacancy_current,
      assumptions.vacancy_range[1]
    );
    const interestRate = sampleNormal(
      assumptions.interest_rate_current,
      0.01  // 100bp standard deviation
    );
    const rentGrowth = sampleNormal(
      assumptions.rent_growth_annual,
      0.01
    );

    // Calculate NOI
    const effectiveNOI = assumptions.current_noi * (1 - vacancy);

    // Calculate value
    const propertyValue = effectiveNOI / capRate;

    // Calculate commission
    const commission = calculateCommission(propertyValue, assumptions.commission_structure);

    // Calculate buyer metrics
    const loanAmount = propertyValue * assumptions.loan_ltv;
    const debtService = calculateDebtService(loanAmount, interestRate, assumptions.loan_amortization_years);
    const dscr = effectiveNOI / debtService;
    const negativeLeverage = (effectiveNOI / loanAmount) < interestRate;

    // Hold period IRR (if applicable)
    let irr = null;
    if (assumptions.hold_period_years) {
      irr = calculateIRR(
        propertyValue, effectiveNOI, rentGrowth,
        assumptions.expense_growth_annual,
        assumptions.exit_cap_rate, assumptions.hold_period_years,
        loanAmount, interestRate, assumptions.loan_amortization_years
      );
    }

    results.push({ propertyValue, commission, dscr, negativeLeverage, irr, capRate, vacancy });
  }

  return summarizeResults(results);
}

// Triangular distribution (common in RE modeling)
function sampleTriangular(min, mode, max) {
  const u = Math.random();
  const fc = (mode - min) / (max - min);
  if (u < fc) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  }
  return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
}
```

### How Researcher Feeds Simulation Assumptions

The Researcher agent writes market data to `sandbox_signals`. When signals contain quantitative data, they update a `market_assumptions` view:

```sql
CREATE TABLE IF NOT EXISTS market_data_points (
  id SERIAL PRIMARY KEY,
  metric TEXT NOT NULL,                   -- 'ie_industrial_cap_rate', 'ie_vacancy_rate', 'fed_funds_rate'
  value NUMERIC NOT NULL,
  observation_date DATE NOT NULL,
  source TEXT NOT NULL,
  submarket TEXT,                          -- 'Ontario', 'Riverside', etc.
  property_type TEXT,
  agent_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (metric, observation_date, submarket, property_type)
);

CREATE INDEX idx_market_data_metric ON market_data_points(metric, observation_date);
```

When David creates a simulation, the system pre-fills assumptions from the latest `market_data_points`:

```sql
SELECT metric, value, observation_date
FROM market_data_points
WHERE metric IN ('ie_industrial_cap_rate', 'ie_vacancy_rate')
  AND observation_date = (
    SELECT MAX(observation_date) FROM market_data_points WHERE metric = m.metric
  );
```

### Assumption Accuracy Feedback Loop

When a deal closes:

1. The system queries `simulation_scenarios` for any simulations linked to that `deal_id` or `property_id`.
2. For each simulation, it compares `assumptions.base_cap_rate` vs. `actual_cap_rate` (from the deal's close data).
3. It writes to `simulation_assumptions_log` with `actual_value` and `variance`.
4. Quarterly, the Chief of Staff reviews assumption variance patterns:
   - If cap rate assumptions are consistently 50bp too optimistic, update `tpe_config.sale_price_psf` and `market_data_points` defaults.
   - If vacancy assumptions are too conservative, widen the range.

### Client-Ready Output

The simulation results feed a React component that renders:

1. **Probability Fan Chart**: X-axis is outcome metric (value, commission), Y-axis is probability. Shows p10/p25/p50/p75/p90 as a fan shape.
2. **Sensitivity Table**: 2D grid showing value at different cap rate x vacancy combinations.
3. **Scenario Comparison**: Side-by-side cards showing two scenarios with delta highlighting.
4. **Key Metrics Card**: Expected value, commission range, probability above asking, breakeven vacancy, DSCR range.

Export options: PDF (for email to clients) and CSV (for further analysis).

### Implementation Priority and Effort

| Component | Priority | Effort | Rationale |
|---|---|---|---|
| `simulation_scenarios` + `simulation_assumptions_log` tables | P0 | 1 day | Schema foundation |
| `market_data_points` table + Researcher integration | P1 | 1 day | Feeds assumption defaults |
| Monte Carlo engine (`server/simulation.js`) | P0 | 3 days | Core computation; requires careful financial math |
| Sale analysis scenario type | P0 | 2 days | Most common use case |
| Hold vs. sell scenario type | P1 | 2 days | High client value |
| Rate sensitivity scenario type | P1 | 1 day | Variation on sale analysis |
| UI: Scenario builder form | P1 | 2 days | Input form with assumption sliders |
| UI: Results dashboard (fan chart, sensitivity table) | P1 | 3 days | Visualization; can use a charting library (recharts) |
| Assumption accuracy feedback loop | P2 | 1 day | Requires deals closing to generate data |
| PDF export for client presentations | P2 | 2 days | Uses existing PDF infrastructure or html-to-pdf |

**Total estimated effort: ~18 days**

---

# PROMPT 28: Explainable AI -- Why Did the System Recommend This?

## Current State

The system generates recommendations from multiple sources:

1. **TPE Scores**: 100-point weighted model across 5 categories (lease, ownership, age, growth, stress). The score is a number. David sees "TPE 87" but does not see: "30 from lease expiring in 8 months + 25 from trust entity held 16 years + 20 from owner age 72 + 10 from 25% headcount growth + 2 from medium balloon confidence."

2. **Convergence Signals**: Multiple agents detect signals about the same entity. David sees "convergence detected" in a priority board entry but not which agents found what, when, and what the combined picture says.

3. **Outreach Drafts**: The Matcher generates emails targeting specific contacts. David sees the draft but not why this contact was selected over 50 others in the database.

4. **Sandbox Items**: Tier 2 review presents items for approval. The `confidence_score` is a number (0-100) with `notes` as free text. There is no structured breakdown of what contributed to that confidence.

The `tpe_config` table has descriptions for each scoring parameter, but these descriptions are metadata for administrators, not explanations for David or clients.

## Gap Analysis

| Gap | Impact |
|-----|--------|
| TPE score is a black box number | David cannot explain to a client why their property scored high; cannot verify the system's logic |
| No factor-by-factor breakdown visible in UI | If a score seems wrong, David has to mentally reverse-engineer the formula |
| No weekly delta tracking | "TPE went from 72 to 87" -- why? What changed? |
| Convergence alerts lack narrative | "3 agents flagged ABC Logistics" tells David nothing about what was found |
| Outreach selection is opaque | "Email this person" without "because they're the decision maker with lease expiring and warm intro path" |
| No audit trail for recommendations | If David asks "why did I call this person last month?", the system cannot reconstruct the rationale |
| Confidence scores lack decomposition | Enricher says "confidence 85" -- is that 85% because the email bounced but the phone was verified? |

## Proposed Design

### New Table: `recommendation_explanations`

Every system recommendation gets a structured explanation record.

```sql
CREATE TABLE IF NOT EXISTS recommendation_explanations (
  id SERIAL PRIMARY KEY,
  -- What is being explained
  recommendation_type TEXT NOT NULL CHECK (recommendation_type IN (
    'tpe_score',           -- TPE score breakdown
    'property_priority',   -- why this property is prioritized
    'contact_outreach',    -- why this contact was selected for outreach
    'convergence_alert',   -- why convergence was detected
    'signal_relevance',    -- why this signal is high/medium/low
    'enrichment_confidence', -- why enricher is confident in this data
    'deal_recommendation', -- why the system suggests pursuing this deal
    'timing_alert'         -- why the system says "act now"
  )),
  -- Reference to the entity being explained
  entity_type TEXT,
  entity_id UUID,
  -- Also link to specific sandbox/system records
  sandbox_table TEXT,
  sandbox_id INTEGER,
  -- The explanation itself
  headline TEXT NOT NULL,                  -- 1-line summary: "High TPE because lease expires soon and owner is 72"
  plain_english TEXT NOT NULL,             -- 2-4 sentence explanation for David
  -- Example: "ABC Logistics at 1234 Industrial Dr scores TPE 87 primarily because
  -- the tenant's lease expires in 8 months (30 pts), the property is held by a trust
  -- entity for 16 years (25 pts), and the owner is 72 years old (20 pts). Headcount
  -- growth of 25% adds another 10 points. The loan has medium balloon confidence
  -- contributing 2 stress points."
  -- Structured factor breakdown
  factors JSONB NOT NULL,
  -- Example for TPE:
  -- [
  --   {"factor": "Lease Expiration", "score": 30, "max": 30, "detail": "Expires 2026-11-15 (8 months)", "pct": 1.00},
  --   {"factor": "Ownership Profile", "score": 25, "max": 25, "detail": "Trust entity, held 16 years", "pct": 1.00},
  --   {"factor": "Owner Age", "score": 20, "max": 20, "detail": "Age 72", "pct": 1.00},
  --   {"factor": "Tenant Growth", "score": 10, "max": 15, "detail": "25% headcount growth", "pct": 0.67},
  --   {"factor": "Debt Stress", "score": 2, "max": 10, "detail": "Medium balloon confidence", "pct": 0.20}
  -- ]
  -- For convergence:
  -- [
  --   {"agent": "Researcher", "signal": "CoStar listing removed", "date": "2026-03-01", "relevance": "high"},
  --   {"agent": "Enricher", "signal": "Owner phone verified", "date": "2026-03-05", "relevance": "medium"},
  --   {"agent": "Scout", "signal": "Lease comp shows 40% rent increase nearby", "date": "2026-03-10", "relevance": "high"}
  -- ]
  -- Delta tracking
  previous_score NUMERIC,
  current_score NUMERIC,
  score_delta NUMERIC,
  delta_explanation TEXT,
  -- Example: "TPE increased from 72 to 87 this week. Changes: lease moved from 18-24
  -- month window to 12-18 month window (+7 pts), tenant growth data updated from
  -- 15% to 25% (+5 pts), balloon confidence upgraded from LOW to MEDIUM (+3 pts)."
  -- Alternatives considered (for outreach selection)
  alternatives_considered INTEGER,
  selection_reasoning TEXT,
  -- Example: "Selected over 47 other contacts because: (1) decision authority = 'Final',
  -- (2) 1-hop warm introduction path via John Smith, (3) email verified 14 days ago,
  -- (4) previous interaction had positive outcome."
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

CREATE INDEX idx_explanations_type ON recommendation_explanations(recommendation_type);
CREATE INDEX idx_explanations_entity ON recommendation_explanations(entity_type, entity_id);
CREATE INDEX idx_explanations_sandbox ON recommendation_explanations(sandbox_table, sandbox_id);
CREATE INDEX idx_explanations_created ON recommendation_explanations(created_at);
```

### New Table: `tpe_score_history`

Weekly snapshots of TPE scores with factor breakdowns for delta tracking.

```sql
CREATE TABLE IF NOT EXISTS tpe_score_history (
  id SERIAL PRIMARY KEY,
  property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
  -- Score snapshot
  snapshot_date DATE NOT NULL,
  total_score NUMERIC NOT NULL,
  -- Factor breakdown
  lease_score NUMERIC DEFAULT 0,
  ownership_score NUMERIC DEFAULT 0,
  age_score NUMERIC DEFAULT 0,
  growth_score NUMERIC DEFAULT 0,
  stress_score NUMERIC DEFAULT 0,
  -- Derived scores
  ecv_score NUMERIC DEFAULT 0,
  blended_score NUMERIC DEFAULT 0,
  timing_multiplier NUMERIC DEFAULT 1.000,
  network_bonus NUMERIC DEFAULT 0,
  -- What changed since last snapshot
  delta_total NUMERIC DEFAULT 0,
  delta_factors JSONB,
  -- Example: {"lease_score": +7, "growth_score": +5, "stress_score": +3}
  change_reason TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (property_id, snapshot_date)
);

CREATE INDEX idx_tpe_history_property ON tpe_score_history(property_id);
CREATE INDEX idx_tpe_history_date ON tpe_score_history(snapshot_date);
CREATE INDEX idx_tpe_history_score ON tpe_score_history(total_score DESC);
```

### Explanation Generation Algorithm

Every time a score is computed or a recommendation is made, the system generates an explanation. This is NOT an LLM call -- it is template-based with data interpolation.

```javascript
function generateTPEExplanation(property, scores, previousScores) {
  const factors = [
    {
      factor: 'Lease Expiration',
      score: scores.lease,
      max: 30,
      detail: scores.lease_detail,  // e.g., "Expires 2026-11-15 (8 months)"
      pct: scores.lease / 30
    },
    {
      factor: 'Ownership Profile',
      score: scores.ownership,
      max: 25,
      detail: scores.ownership_detail,
      pct: scores.ownership / 25
    },
    // ... etc for all 5 categories
  ];

  // Sort by contribution (highest first)
  factors.sort((a, b) => b.score - a.score);

  // Generate plain English
  const topFactors = factors.filter(f => f.score > 0);
  const headline = `TPE ${scores.total}: ${topFactors.slice(0, 2).map(f => f.factor.toLowerCase()).join(' and ')} drive this score`;

  const sentences = topFactors.map(f =>
    `${f.factor}: ${f.score}/${f.max} pts (${f.detail})`
  );
  const plainEnglish = `${property.property_address} scores TPE ${scores.total}. ` +
    sentences.join('. ') + '.';

  // Delta analysis
  let deltaExplanation = null;
  if (previousScores) {
    const changes = factors
      .filter(f => f.score !== previousScores[f.factor.toLowerCase().replace(/ /g, '_')])
      .map(f => {
        const prev = previousScores[f.factor.toLowerCase().replace(/ /g, '_')] || 0;
        const delta = f.score - prev;
        return `${f.factor} ${delta > 0 ? '+' : ''}${delta} (${f.detail})`;
      });
    if (changes.length > 0) {
      deltaExplanation = `Changed from ${previousScores.total} to ${scores.total}: ${changes.join(', ')}`;
    }
  }

  return { headline, plainEnglish, factors, deltaExplanation };
}
```

### Convergence Explanation

When multiple agents flag the same entity within a 14-day window:

```sql
-- Detect convergence: 2+ sandbox entries referencing the same entity within 14 days
WITH entity_signals AS (
  SELECT 'signal' AS source_table, id, agent_name, headline AS detail,
         unnest(crm_property_ids) AS property_id, created_at
  FROM sandbox_signals WHERE status = 'pending'
  UNION ALL
  SELECT 'enrichment', id, agent_name, field_name || ': ' || new_value,
         NULL, created_at
  FROM sandbox_enrichments WHERE status = 'pending'
  UNION ALL
  SELECT 'outreach', id, agent_name, match_reason,
         NULL, created_at
  FROM sandbox_outreach WHERE status = 'pending'
)
SELECT property_id, COUNT(DISTINCT agent_name) AS agent_count,
       array_agg(DISTINCT agent_name) AS agents,
       jsonb_agg(jsonb_build_object(
         'agent', agent_name, 'source', source_table,
         'detail', detail, 'date', created_at
       )) AS signal_details
FROM entity_signals
WHERE created_at > NOW() - INTERVAL '14 days'
GROUP BY property_id
HAVING COUNT(DISTINCT agent_name) >= 2;
```

The explanation for convergence:

> "3 agents independently flagged 1234 Industrial Dr this week. Researcher found the CoStar listing was removed (possible off-market deal). Enricher verified the owner's phone number is active. Scout detected a 40% rent increase in lease comps within 0.5 miles. Combined with TPE 87, this property has the highest convergence score in your pipeline."

### Outreach Selection Explanation

When the Matcher selects a contact for outreach, it records:

1. **Pool size**: "Evaluated 47 contacts linked to this property/company."
2. **Selection criteria**: Decision authority, email verification status, relationship strength, previous interaction outcomes.
3. **Why this one**: "Selected Jane Smith because: (a) title is VP Operations (decision authority: Final), (b) email verified 14 days ago via NeverBounce, (c) 1-hop warm introduction through John Smith (strength 0.82), (d) last interaction on 2026-01-15 had outcome 'interested, follow up in Q2'."
4. **Why not others**: "Runner-up: Bob Johnson (CFO) -- email unverified, no warm intro path."

### UI Integration

**Property Detail -- TPE Breakdown Card:**

```
TPE Score: 87 / 100                      [+15 this week]
-----------------------------------------------------
Lease Expiration    |||||||||||||||||||||||||||||| 30/30
                    Expires 2026-11-15 (8 months)
Ownership Profile   ||||||||||||||||||||||||||||| 25/25
                    Trust entity, held 16 years
Owner Age           ||||||||||||||||||||||||||   20/20
                    Age 72
Tenant Growth       ||||||||||||||||             10/15
                    25% headcount growth (ZoomInfo)
Debt Stress         ||||                          2/10
                    Medium balloon confidence
-----------------------------------------------------
This week: Lease moved from 18-24mo to 12-18mo window (+7),
           tenant growth updated 15% -> 25% (+5),
           balloon confidence LOW -> MEDIUM (+3)
```

**Convergence Alert Card:**

```
CONVERGENCE DETECTED -- 1234 Industrial Dr
3 agents flagged this property in 7 days:

[Researcher] CoStar listing removed -- possible off-market
[Enricher]   Owner phone verified: (909) 555-0123
[Scout]      Nearby lease comp: $1.45/SF (40% above current)

Combined with TPE 87 and transaction window opening in Q3,
this is your #1 priority property.

[View Property] [Draft Outreach] [Dismiss]
```

**Outreach Draft -- "Why This Contact" Expandable:**

```
TO: Jane Smith, VP Operations, ABC Logistics
RE: 1234 Industrial Dr -- Lease Expiring November

[Expand: Why Jane Smith?]
  - Decision authority: Final (from CRM contact record)
  - Warm intro: David -> John Smith (colleague) -> Jane Smith
  - Email verified: 2026-03-01 via NeverBounce
  - Last interaction: 2026-01-15, outcome: "interested, follow up Q2"
  - Selected over 46 other contacts for this property
```

### Impact on Approval Speed and Trust

Explainability directly addresses the bottleneck in the sandbox review workflow:

| Without Explainability | With Explainability |
|---|---|
| David sees "TPE 87" and has to trust the number | David sees the factor breakdown and can verify each input |
| Tier 2 review takes 2-5 minutes per item (must investigate context) | Tier 2 review takes 30-60 seconds (context is pre-assembled) |
| David rejects items he doesn't understand | David approves faster because the reasoning is transparent |
| No way to calibrate agent performance | Delta tracking shows whether scores are improving over time |
| Client conversations require manual research | David can show the TPE card to a client: "Here's why your property is attracting interest" |

Expected impact: **60-70% reduction in Tier 2 review time**, **30-40% increase in approval rate** (fewer false rejections caused by uncertainty), **faster client conversations** with data-backed narratives.

### Implementation Priority and Effort

| Component | Priority | Effort | Rationale |
|---|---|---|---|
| `recommendation_explanations` table | P0 | 0.5 days | Schema only |
| `tpe_score_history` table + weekly snapshot job | P0 | 1 day | Foundation for delta tracking |
| TPE explanation generator (template-based) | P0 | 2 days | Highest-impact feature -- makes TPE transparent |
| UI: TPE breakdown card on Property Detail | P0 | 2 days | Visual representation of factor contributions |
| Convergence explanation generator | P1 | 1 day | Assembles multi-agent signals into narrative |
| UI: Convergence alert card | P1 | 1 day | Card component with agent attribution |
| Outreach selection explanation | P1 | 1 day | Matcher integration |
| UI: "Why this contact" expandable on outreach review | P1 | 1 day | Simple expandable section |
| Delta tracking with weekly comparison | P2 | 1 day | Requires 2+ weeks of history data |
| UI: Weekly delta annotations on TPE card | P2 | 1 day | Visual diff |

**Total estimated effort: ~11.5 days**

---

# Cross-Prompt Integration Map

These four systems are deeply interconnected:

```
                    +-------------------+
                    |   RELATIONSHIP    |
                    |   GRAPH (P25)     |
                    +--------+----------+
                             |
              network bonus  |  warm intro paths
              to TPE scoring |  to Matcher
                             |
+-------------------+--------+----------+-------------------+
|   TEMPORAL        |   TPE SCORING     |   SIMULATION      |
|   PATTERNS (P26)  |   (existing)      |   ENGINE (P27)    |
+--------+----------+--------+----------+--------+----------+
         |                   |                    |
  timing |            score  |           market   |
  mult   |          factors  |         data feed  |
         |                   |                    |
         +--------+----------+--------+-----------+
                  |   EXPLAINABILITY   |
                  |      (P28)         |
                  +--------------------+
                             |
                    explains everything
                    to David in plain English
```

**Data flow example -- a single property recommendation:**

1. **Relationship Graph** discovers David is 2 hops from the property owner via John Smith (strength 0.82).
2. **Temporal Patterns** detects lease expiration + loan maturity converging in a 4-month window starting Q3 2026. Timing multiplier: 1.35x.
3. **TPE Score** computes 87 base points. With network bonus (+3) and timing multiplier (1.35x), the effective priority is 121 (capped at 100, but ranked above all sub-100 properties).
4. **Simulation Engine** models the property: expected value $6.2M, expected commission $124K (p50), with 42% probability above the assumed asking price.
5. **Explainability Layer** assembles all of this into:
   - **Headline**: "Priority #1: 1234 Industrial Dr -- TPE 87, convergence detected, warm intro available"
   - **Plain English**: "This property scores TPE 87 because the lease expires in 8 months, the owner is 72, and the trust has held it for 16 years. A loan matures in November, creating a convergence window. You're 2 hops away via John Smith. Expected commission: $112K-$137K (p25-p75)."
   - **Action**: "Draft outreach to Jane Smith (VP Operations, decision authority: Final) via warm intro through John Smith. Optimal timing: start outreach by April 2026."

---

# Implementation Roadmap

## Phase 1: Foundation (Weeks 1-2)
- `recommendation_explanations` + `tpe_score_history` tables (P28)
- TPE explanation generator + UI breakdown card (P28)
- `temporal_snapshots` + monthly snapshot job (P26)
- `relationship_edges` table + junction sync (P25)

## Phase 2: Core Intelligence (Weeks 3-5)
- Strength scoring + decay detection (P25)
- `property_transaction_windows` + convergence calc (P26)
- `simulation_scenarios` + Monte Carlo engine for sale analysis (P27)
- Convergence explanation generator + UI card (P28)

## Phase 3: Advanced Features (Weeks 6-8)
- Shortest path CTE + path cache (P25)
- Hub score calculation (P25)
- Hold vs. sell + rate sensitivity scenarios (P27)
- Dynamic timing multiplier TPE integration (P26)
- Outreach selection explanation (P28)

## Phase 4: Polish and Feedback Loops (Weeks 9-10)
- UI: Network panel, scenario builder, seasonal heatmap
- Assumption accuracy feedback loop (P27)
- Market data points table + Researcher integration (P27)
- PDF export for client presentations (P27)

**Total effort across all four prompts: ~54 days (approximately 10-11 weeks at 5 days/week)**

The recommended start: **Prompt 28 (Explainability)** first, because it delivers immediate value to the existing TPE system without requiring any new data collection, and it establishes the explanation infrastructure that Prompts 25-27 will feed into.
