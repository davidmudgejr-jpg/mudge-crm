# Prompts 37-40: Predictive Intelligence Layer
## Data Inventory, Data Bounties, Proxy Signals, and Multi-Horizon Predictions
**Generated: March 13, 2026**
**Analyst: Claude Opus 4.6 -- Systems Architecture Mode**

---

# PROMPT 37: Data Inventory & Gap Map

## Current Data Inventory

Everything the IE CRM system currently stores, organized by category with table/column references.

### Category 1: Contact Intelligence

| Data Point | Table.Column | Fill Rate (Est.) | Notes |
|---|---|---|---|
| Full name | `contacts.full_name` | 95%+ | Core field, almost always populated |
| Email (primary) | `contacts.email` | 70% | Many owner contacts lack email |
| Email (2nd, 3rd) | `contacts.email_2`, `email_3` | 15% | Rarely populated |
| Phone (primary) | `contacts.phone_1` | 60% | Owner phones often missing |
| Phone (2nd, 3rd) | `contacts.phone_2`, `phone_3` | 10% | Rarely populated |
| Title | `contacts.title` | 45% | Inconsistent -- "Owner", "President", free text |
| Type | `contacts.type` | 80% | Tenant, Owner, Broker, etc. |
| Company name | `contacts.company_name` | 55% | Free text, not always linked to `companies` |
| LinkedIn URL | `contacts.linkedin` | 20% | Sparse -- Enricher agent target |
| Home address | `contacts.home_address` | 25% | For owners, from White Pages/county records |
| Work address/city/state/zip | `contacts.work_address` etc. | 40% | |
| Email verified (hot) | `contacts.email_hot` | 30% | Boolean, from NeverBounce |
| Phone verified (hot) | `contacts.phone_hot` | 25% | Boolean |
| Email kickback flag | `contacts.email_kickback` | 15% | Known-bad emails |
| Property type interest | `contacts.property_type_interest` | 20% | Industrial, Office, Retail |
| Lease months left | `contacts.lease_months_left` | 15% | Critical for TPE, rarely known |
| Tenant space fit | `contacts.tenant_space_fit` | 10% | Size range preference |
| Tenant ownership intent | `contacts.tenant_ownership_intent` | 8% | Lease vs. buy preference |
| Business trajectory | `contacts.business_trajectory` | 10% | Growing, Stable, Contracting |
| Last call outcome | `contacts.last_call_outcome` | 25% | From interaction logging |
| Follow-up behavior | `contacts.follow_up_behavior` | 10% | |
| Decision authority | `contacts.decision_authority` | 12% | Decision maker, Influencer, etc. |
| Price/cost awareness | `contacts.price_cost_awareness` | 8% | |
| Frustration signals | `contacts.frustration_signals` | 5% | Qualitative, from calls |
| Exit trigger events | `contacts.exit_trigger_events` | 5% | What would make them move |
| Do-not-email | `contacts.do_not_email` | 95% | Well-maintained opt-out |
| White Pages URL | `contacts.white_pages_url` | 15% | Research trail |
| Been Verified URL | `contacts.been_verified_url` | 10% | Research trail |
| ZoomInfo URL | `contacts.zoom_info_url` | 5% | Rarely used (no subscription) |

### Category 2: Property Intelligence

| Data Point | Table.Column | Fill Rate (Est.) | Notes |
|---|---|---|---|
| Address | `properties.address` | 99% | Core field |
| City / State / Zip | `properties.city`, `state`, `zip` | 95% | |
| Property type | `properties.property_type` | 90% | Industrial, Office, Retail |
| Building SF | `properties.sf` | 75% | From county assessor or CoStar |
| Land SF | `properties.land_sf` | 50% | County assessor |
| Year built | `properties.year_built` | 60% | County assessor |
| Zoning | `properties.zoning`, `sb_county_zoning` | 45% | |
| Clear height | `properties.clear_height` | 35% | Industrial-specific |
| Dock doors | `properties.dock_doors` | 30% | Industrial-specific |
| Grade doors | `properties.grade_doors` | 25% | Industrial-specific |
| Power / Amps | `properties.power`, `amps` | 20% | |
| Parking spaces / ratio | `properties.parking_spaces`, `parking_ratio` | 30% | |
| Units / Stories | `properties.units`, `stories` | 40% | Multi-tenant buildings |
| NOI | `properties.noi` | 10% | Rarely known without CoStar |
| Price per sqft | `properties.price_per_sqft` | 20% | |
| For-sale price | `properties.for_sale_price` | 15% | Only if listed |
| Parcel number (APN) | `properties.parcel_number` | 55% | County assessor |
| Owner name | `properties.owner_contact` | 40% | From title/assessor |
| Owner type | `properties.owner_type` | 30% | Individual, Trust, LLC, etc. |
| Owner entity type | `properties.owner_entity_type` | 25% | TPE field |
| Owner email | `properties.owner_email` | 15% | Hard to find |
| Owner mailing address | `properties.owner_mailing_address` | 30% | County assessor |
| Owner user vs investor | `properties.owner_user_or_investor` | 20% | TPE critical |
| Out-of-area owner | `properties.out_of_area_owner` | 15% | Distance flag |
| Owner call status | `properties.owner_call_status` | 20% | |
| Tenant call status | `properties.tenant_call_status` | 15% | |
| Lien/delinquency flag | `properties.has_lien_or_delinquency` | 10% | From title rep |
| Contacted status | `properties.contacted` | 35% | Array of contact methods |
| Leasing company | `properties.leasing_company` | 20% | |
| Broker contact | `properties.broker_contact` | 25% | |
| Lat/Long | `properties.latitude`, `longitude` | 50% | From geocoding |
| Building image | `properties.building_image_path` | 15% | |
| Listing URL | `properties.listing_url` | 10% | Only active listings |
| Available SF | `properties.total_available_sf`, `direct_available_sf` | 10% | Requires CoStar |
| Avg weighted rent | `properties.avg_weighted_rent` | 8% | Requires lease data |
| Utilities (sewer/water/gas/heating) | `properties.sewer`, `water`, `gas`, `heating` | 10% | |
| Cranes / Rail | `properties.number_of_cranes`, `rail_lines` | 5% | Niche industrial |

### Category 3: Company Intelligence

| Data Point | Table.Column | Fill Rate (Est.) | Notes |
|---|---|---|---|
| Company name | `companies.name` | 99% | Core field |
| Industry | `companies.industry` | 50% | Free text |
| City | `companies.city` | 60% | |
| Revenue range | `companies.revenue_range` | 15% | Rarely known without ZoomInfo |
| SIC code | `companies.tenant_sic` | 10% | |
| NAICS code | `companies.tenant_naics` | 10% | |
| Suite | `companies.suite` | 20% | |

### Category 4: Deal Pipeline

| Data Point | Table.Column | Fill Rate (Est.) | Notes |
|---|---|---|---|
| Deal type | `deals.deal_type` | 95% | Lease, Sale, Purchase, Renewal, Sub-Lease |
| Status | `deals.status` | 95% | Pipeline stage |
| SF | `deals.sf` | 70% | |
| Rate | `deals.rate` | 60% | Lease rate |
| Price | `deals.price` | 50% | Sale price |
| Commission rate | `deals.commission_rate` | 65% | |
| Term | `deals.term` | 55% | Months |
| Increases | `deals.increases` | 30% | Annual escalation |
| Source | `deals.deal_source` | 40% | How the deal originated |
| Repping | `deals.repping` | 70% | Landlord, Tenant, Buyer, Seller |
| Deadline | `deals.deadline` | 25% | |
| Dead reason | `deals.deal_dead_reason` | 60% | For dead deals |

### Category 5: Transaction Probability Engine (TPE)

| Data Point | Table.Column | Fill Rate (Est.) | Notes |
|---|---|---|---|
| Loan maturity date | `loan_maturities.maturity_date` | 5% | Critical gap -- requires CMBS/RCA |
| Loan amount | `loan_maturities.loan_amount` | 5% | |
| LTV ratio | `loan_maturities.ltv` | 3% | Almost never known |
| Loan purpose | `loan_maturities.loan_purpose` | 3% | |
| Debt stress (balloon dates) | `debt_stress.balloon_*` | 8% | Title rep sourced |
| Distress type | `property_distress.distress_type` | 5% | NOD, auction, etc. |
| Tenant headcount current | `tenant_growth.headcount_current` | 8% | |
| Tenant growth rate | `tenant_growth.growth_rate` | 5% | |
| TPE config weights | `tpe_config.*` | 100% | Seeded, fully populated |

### Category 6: Market Comparables

| Data Point | Table.Column | Fill Rate (Est.) | Notes |
|---|---|---|---|
| Lease comp rate | `lease_comps.rate` | Per-record | Populated when entered |
| Lease comp SF | `lease_comps.sf` | Per-record | |
| Lease comp expiration | `lease_comps.expiration_date` | 60% of records | Often missing |
| Lease comp TI/free rent | `lease_comps.ti_psf`, `free_rent_months` | 30% of records | Concession data sparse |
| Sale comp price | `sale_comps.sale_price` | Per-record | |
| Sale comp cap rate | `sale_comps.cap_rate` | 40% of records | Rarely known for private sales |

### Category 7: AI Agent Infrastructure

| Data Point | Table.Column | Fill Rate (Est.) | Notes |
|---|---|---|---|
| Sandbox contacts | `sandbox_contacts.*` | Active pipeline | Agent-sourced |
| Sandbox enrichments | `sandbox_enrichments.*` | Active pipeline | |
| Sandbox signals | `sandbox_signals.*` | Active pipeline | |
| Sandbox outreach | `sandbox_outreach.*` | Active pipeline | |
| Agent heartbeats | `agent_heartbeats.*` | Real-time | |
| Agent logs | `agent_logs.*` | Continuous | |
| Priority board | `agent_priority_board.*` | Active queue | |
| Escalations | `agent_escalations.*` | Active queue | |
| Usage tracking | `ai_usage_tracking.*` | Continuous | |

---

## Data Gap Map

### Critical Gaps (Would Transform Prediction Accuracy)

| # | Gap | Premium Source | Impact | Proxy Available? | Proxy Reliability | Manual Difficulty | Data Bounty Instructions |
|---|-----|--------------|--------|-------------------|-------------------|-------------------|--------------------------|
| G1 | Lease expiration dates for non-client properties | CoStar | **Critical** (impact: 95) | Yes | 0.4 | Moderate | Call property manager, check broker listings, look up business license renewal dates on county site |
| G2 | Vacancy rates by submarket | CoStar | **Critical** (impact: 90) | Yes | 0.5 | Hard | Drive submarkets monthly, note "For Lease" signs, check LoopNet/Crexi listing counts |
| G3 | Company firmographics (revenue, headcount, org chart) | ZoomInfo | **High** (impact: 80) | Yes | 0.45 | Moderate | Check LinkedIn company page for headcount, Glassdoor for revenue estimates, state filings for officer names |
| G4 | Loan maturity dates | CMBS data / RCA | **Critical** (impact: 92) | Partial | 0.3 | Hard | Ask title rep for deed of trust recording dates, estimate balloon from origination + typical 5/7/10yr terms |
| G5 | Owner age / succession indicators | Public records + ZoomInfo | **High** (impact: 75) | Yes | 0.5 | Moderate | White Pages for age estimate, county assessor for trust ownership (trusts often signal succession planning) |
| G6 | Tenant credit / financial health | D&B / ZoomInfo | **High** (impact: 70) | Yes | 0.4 | Hard | Check state tax liens, UCC filings, Glassdoor reviews for layoff signals, job posting velocity |
| G7 | Market rent trends (asking vs. effective) | CoStar | **High** (impact: 78) | Yes | 0.5 | Moderate | Track asking rents on LoopNet/Crexi weekly, note concessions mentioned in broker conversations |
| G8 | Cap rates by property type/submarket | RCA / CoStar | **High** (impact: 72) | Yes | 0.45 | Moderate | Track sale comps from public records, calculate implied cap rates from known NOI/price pairs |
| G9 | Tenant improvement allowance benchmarks | CoStar | **Medium** (impact: 55) | Yes | 0.35 | Moderate | Track TI in own lease comps, ask other brokers at IE SIOR/CCIM meetings |
| G10 | Building condition / deferred maintenance | Physical inspection | **High** (impact: 65) | Partial | 0.3 | Easy | Drive-by inspection, note roof condition, parking lot, landscaping, HVAC age visible from exterior |
| G11 | Foot traffic / occupancy signals | Placer.ai / cell data | **Medium** (impact: 50) | Yes | 0.4 | Easy | Google Maps popular times, Yelp review frequency, parking lot fullness during drive-bys |
| G12 | Interest rate sensitivity per property | Trepp / CMBS analytics | **High** (impact: 68) | Partial | 0.3 | Hard | Estimate from known loan terms + current rate environment, check Fed rate trajectory |
| G13 | Entitlements / development pipeline | County planning dept | **Medium** (impact: 55) | Yes | 0.6 | Moderate | Check county planning portal for active applications, attend planning commission meetings |
| G14 | Environmental issues (Phase I/II) | EDR / state databases | **Medium** (impact: 45) | Yes | 0.5 | Moderate | Check CA DTSC EnviroStor, EPA Envirofacts, SWRCB GeoTracker -- all free |
| G15 | Owner portfolio concentration | RCA / CoStar | **High** (impact: 70) | Yes | 0.5 | Moderate | County assessor bulk search by owner name, cross-reference with CRM property records |

### Gap Registry Table

```sql
CREATE TABLE IF NOT EXISTS data_gap_registry (
  gap_id TEXT PRIMARY KEY,                    -- e.g. 'G1', 'G2'
  data_type TEXT NOT NULL,                    -- 'lease_expiration', 'vacancy_rate', etc.
  data_category TEXT NOT NULL,                -- 'property', 'company', 'market', 'contact'
  description TEXT NOT NULL,
  source_if_available TEXT,                   -- 'CoStar', 'ZoomInfo', 'RCA', etc.
  source_has_api BOOLEAN DEFAULT FALSE,
  impact_score INTEGER NOT NULL CHECK (impact_score >= 1 AND impact_score <= 100),
  proxy_available BOOLEAN DEFAULT FALSE,
  proxy_signal_ids TEXT[],                    -- references proxy_signals table
  proxy_reliability NUMERIC(3,2) CHECK (proxy_reliability >= 0 AND proxy_reliability <= 1),
  manual_lookup_difficulty TEXT NOT NULL CHECK (manual_lookup_difficulty IN ('easy', 'moderate', 'hard')),
  manual_lookup_instructions TEXT NOT NULL,   -- step-by-step for David
  manual_lookup_sources TEXT[],               -- e.g. {'county_assessor', 'loopnet', 'title_rep'}
  records_affected_count INTEGER DEFAULT 0,   -- how many CRM records lack this data
  records_affected_query TEXT,                -- SQL to recalculate records_affected_count
  estimated_fill_time_minutes INTEGER,        -- per record, for prioritization
  last_audit_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_gap_registry_impact ON data_gap_registry(impact_score DESC);
CREATE INDEX idx_gap_registry_category ON data_gap_registry(data_category);
CREATE INDEX idx_gap_registry_difficulty ON data_gap_registry(manual_lookup_difficulty);
```

### Data Inventory Table

```sql
CREATE TABLE IF NOT EXISTS data_inventory (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,                     -- 'contact', 'property', 'company', 'deal', 'tpe', 'comp', 'agent'
  subcategory TEXT,                           -- 'basic_info', 'financial', 'location', etc.
  field_name TEXT NOT NULL,                   -- 'contacts.email', 'properties.sf', etc.
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  data_type TEXT NOT NULL,                    -- 'text', 'numeric', 'boolean', 'date', etc.
  -- Fill rate tracking
  total_records INTEGER DEFAULT 0,
  filled_records INTEGER DEFAULT 0,
  fill_rate NUMERIC(5,2) DEFAULT 0,           -- percentage 0-100
  fill_rate_trend TEXT DEFAULT 'stable',       -- 'improving', 'stable', 'declining'
  fill_rate_30d_ago NUMERIC(5,2),
  -- Quality metrics
  verified_count INTEGER DEFAULT 0,           -- records verified by agent or human
  stale_count INTEGER DEFAULT 0,              -- records older than freshness_threshold
  freshness_threshold_days INTEGER DEFAULT 365,
  -- Impact
  tpe_weight NUMERIC(5,2) DEFAULT 0,          -- how much this field affects TPE scores
  related_gap_id TEXT REFERENCES data_gap_registry(gap_id),
  -- Audit
  last_audit_at TIMESTAMPTZ,
  last_audit_query TEXT,                      -- SQL used to calculate fill rates
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(table_name, column_name)
);

CREATE INDEX idx_data_inventory_category ON data_inventory(category);
CREATE INDEX idx_data_inventory_fill_rate ON data_inventory(fill_rate);
CREATE INDEX idx_data_inventory_tpe_weight ON data_inventory(tpe_weight DESC);
```

### Fill Rate Audit Function

```sql
-- Scheduled nightly: recalculates fill rates for all inventory rows
CREATE OR REPLACE FUNCTION audit_data_fill_rates()
RETURNS void AS $$
DECLARE
  inv RECORD;
  total_ct INTEGER;
  filled_ct INTEGER;
BEGIN
  FOR inv IN SELECT * FROM data_inventory LOOP
    EXECUTE format(
      'SELECT COUNT(*), COUNT(%I) FROM %I',
      inv.column_name, inv.table_name
    ) INTO total_ct, filled_ct;

    UPDATE data_inventory SET
      fill_rate_30d_ago = CASE
        WHEN last_audit_at < NOW() - INTERVAL '25 days' THEN fill_rate
        ELSE fill_rate_30d_ago
      END,
      total_records = total_ct,
      filled_records = filled_ct,
      fill_rate = CASE WHEN total_ct > 0
        THEN ROUND((filled_ct::numeric / total_ct * 100), 2)
        ELSE 0 END,
      fill_rate_trend = CASE
        WHEN fill_rate_30d_ago IS NULL THEN 'stable'
        WHEN (filled_ct::numeric / NULLIF(total_ct, 0) * 100) > fill_rate_30d_ago + 2 THEN 'improving'
        WHEN (filled_ct::numeric / NULLIF(total_ct, 0) * 100) < fill_rate_30d_ago - 2 THEN 'declining'
        ELSE 'stable'
      END,
      last_audit_at = NOW(),
      updated_at = NOW()
    WHERE id = inv.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

### Data Health Dashboard -- UI Component Concept

```
+------------------------------------------------------------------+
|  DATA HEALTH DASHBOARD                          Last audit: 2h ago |
+------------------------------------------------------------------+
|                                                                    |
|  OVERALL HEALTH SCORE: 38%  [========-----------] Yellow           |
|                                                                    |
|  +-- CONTACTS --------+  +-- PROPERTIES ------+  +-- COMPANIES --+ |
|  | Basic Info    [###] |  | Basic Info   [###] |  | Name/City [##]| |
|  |    ██████████ 82%   |  |   █████████  85%   |  |  █████████ 90%| |
|  |              GREEN  |  |              GREEN  |  |          GREEN| |
|  |                     |  |                     |  |               | |
|  | Contact Info  [##]  |  | Physical     [##]   |  | Firmographics | |
|  |   ██████     55%    |  |  ██████      52%    |  |  ██       12% | |
|  |           YELLOW    |  |            YELLOW   |  |           RED | |
|  |                     |  |                     |  |               | |
|  | Behavioral    [#]   |  | Financial     [#]   |  | SIC/NAICS    | |
|  |   ██         12%    |  |  ██           10%   |  |  █         8% | |
|  |              RED    |  |              RED    |  |           RED | |
|  |                     |  |                     |  |               | |
|  | TPE Fields    [#]   |  | Owner Intel   [#]   |  +---------------+ |
|  |   ███        18%    |  |  ███          22%   |                    |
|  |              RED    |  |              RED    |  +-- DEALS ------+ |
|  +---------------------+  +--------------------+  | Pipeline  [##]| |
|                                                    |  ████████ 75% | |
|  +-- TPE DATA --------+  +-- COMPS -----------+   |         GREEN | |
|  | Lease Expiry   [#]  |  | Lease Comps  [##]  |   | Financial [#] | |
|  |   ██          15%   |  |  ███████     65%   |   |  ████    35% | |
|  |              RED    |  |            YELLOW  |   |        YELLOW| |
|  |                     |  |                     |   +---------------+ |
|  | Loan Maturity  [#]  |  | Sale Comps   [##]  |                    |
|  |   █            5%   |  |  █████       50%   |                    |
|  |              RED    |  |            YELLOW  |                    |
|  |                     |  |                     |                    |
|  | Debt Stress    [#]  |  | Cap Rates     [#]  |                    |
|  |   █            8%   |  |  ████         40%  |                    |
|  |              RED    |  |            YELLOW  |                    |
|  |                     |  +--------------------+                    |
|  | Tenant Growth  [#]  |                                            |
|  |   █            5%   |  HIGHEST-IMPACT GAPS:                     |
|  |              RED    |  1. G1: Lease expirations (95 impact)     |
|  +---------------------+  2. G4: Loan maturities (92 impact)      |
|                            3. G2: Vacancy rates (90 impact)        |
|                            4. G3: Firmographics (80 impact)        |
|                            5. G7: Market rents (78 impact)         |
+------------------------------------------------------------------+

COLOR CODING:
  ████ GREEN  = >80% filled     -- Data is healthy
  ████ YELLOW = 50-80% filled   -- Gaps exist but workable
  ████ RED    = <50% filled     -- Critical gaps hurting predictions
```

### React Component Structure

```jsx
// DataHealthDashboard.jsx
const DataHealthDashboard = () => {
  const [inventory, setInventory] = useState([]);
  const [gaps, setGaps] = useState([]);

  useEffect(() => {
    Promise.all([
      window.iecrm.db.query('SELECT * FROM data_inventory ORDER BY category, subcategory'),
      window.iecrm.db.query('SELECT * FROM data_gap_registry ORDER BY impact_score DESC')
    ]).then(([inv, gap]) => {
      setInventory(inv.rows);
      setGaps(gap.rows);
    });
  }, []);

  const getColor = (rate) => {
    if (rate >= 80) return 'bg-green-500';
    if (rate >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const categoryGroups = groupBy(inventory, 'category');

  return (
    <div className="p-6 space-y-6">
      {/* Overall health score */}
      <OverallHealthBar inventory={inventory} />

      {/* Category cards in grid */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(categoryGroups).map(([cat, fields]) => (
          <CategoryCard key={cat} category={cat} fields={fields} getColor={getColor} />
        ))}
      </div>

      {/* Top gaps list */}
      <TopGapsList gaps={gaps.slice(0, 10)} />
    </div>
  );
};
```

---

# PROMPT 38: Human-in-the-Loop Data Requests (Data Bounties)

## Core Concept

The AI agents continuously identify records where missing data is the primary bottleneck to accurate predictions. Instead of guessing, the system generates prioritized, actionable research requests for David -- "data bounties" -- each with a calculated dollar value representing the potential commission impact.

## Database Schema

### `data_bounties` Table

```sql
CREATE TABLE IF NOT EXISTS data_bounties (
  id SERIAL PRIMARY KEY,
  -- Target entity
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'contact', 'property', 'company', 'deal', 'lease_comp', 'sale_comp'
  )),
  entity_id UUID NOT NULL,
  entity_label TEXT NOT NULL,                 -- human-readable: "ABC Logistics @ 1234 Main St, Fontana"

  -- What's missing
  missing_field TEXT NOT NULL,                -- column name: 'lease_months_left', 'owner_age', etc.
  missing_field_label TEXT NOT NULL,          -- human-readable: "Lease Expiration Date"
  gap_id TEXT REFERENCES data_gap_registry(gap_id),

  -- Prediction impact analysis
  current_tpe_score NUMERIC(5,2),            -- current TPE probability (0-100)
  predicted_tpe_if_filled NUMERIC(5,2),      -- estimated TPE if this field is filled
  prediction_improvement NUMERIC(5,2),       -- delta (predicted - current)
  deal_value_estimate NUMERIC(12,2),         -- estimated commission value in dollars
  value_of_information NUMERIC(12,2),        -- prediction_improvement * deal_value_estimate / 100

  -- Prioritization
  priority_score NUMERIC(10,2),              -- computed: (current_tpe * improvement * deal_value) / difficulty
  lookup_difficulty TEXT NOT NULL CHECK (lookup_difficulty IN ('easy', 'moderate', 'hard')),
  lookup_difficulty_score INTEGER NOT NULL CHECK (lookup_difficulty_score >= 1 AND lookup_difficulty_score <= 10),
  estimated_minutes INTEGER DEFAULT 5,       -- how long this lookup should take

  -- Instructions for David
  lookup_instructions TEXT NOT NULL,          -- step-by-step: "1. Open CoStar... 2. Search for..."
  suggested_sources TEXT[] NOT NULL,          -- e.g. {'costar', 'county_assessor', 'property_manager_call'}
  context_notes TEXT,                         -- why this matters: "Connected to 3 high-TPE properties"

  -- Grouping
  batch_id INTEGER REFERENCES bounty_batches(id),
  geography_cluster TEXT,                    -- e.g. 'Fontana Industrial', 'Ontario Office'
  property_type_cluster TEXT,                -- e.g. 'Industrial 20K-50K SF'

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'queued', 'assigned', 'in_progress', 'completed',
    'skipped', 'expired', 'impossible'
  )),
  assigned_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  skipped_reason TEXT,                       -- "Data not available", "Couldn't reach PM", etc.
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),

  -- Outcome tracking (filled after completion)
  filled_value TEXT,                         -- what David entered
  tpe_score_after NUMERIC(5,2),             -- actual TPE after filling
  actual_improvement NUMERIC(5,2),          -- actual delta (for calibration)
  deal_materialized BOOLEAN,                -- did a deal happen within 180 days?
  deal_materialized_at TIMESTAMPTZ,
  deal_actual_value NUMERIC(12,2),          -- actual commission if deal closed

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bounties_status ON data_bounties(status);
CREATE INDEX idx_bounties_priority ON data_bounties(priority_score DESC);
CREATE INDEX idx_bounties_entity ON data_bounties(entity_type, entity_id);
CREATE INDEX idx_bounties_batch ON data_bounties(batch_id);
CREATE INDEX idx_bounties_geography ON data_bounties(geography_cluster);
CREATE INDEX idx_bounties_expires ON data_bounties(expires_at);
CREATE INDEX idx_bounties_created ON data_bounties(created_at);
```

### `bounty_batches` Table

```sql
CREATE TABLE IF NOT EXISTS bounty_batches (
  id SERIAL PRIMARY KEY,
  -- Batch metadata
  batch_name TEXT NOT NULL,                  -- "Fontana Industrial Lease Expirations"
  batch_description TEXT,                    -- "12 industrial properties in Fontana needing lease expiration lookup"
  batch_type TEXT NOT NULL CHECK (batch_type IN (
    'geography_sweep',        -- research all properties in an area
    'field_campaign',         -- fill one field across many records
    'high_value_targets',     -- top N by deal value
    'verification_round',     -- re-verify stale data
    'morning_briefing'        -- daily top-5 package
  )),

  -- Scope
  geography_focus TEXT,                      -- 'Fontana', 'Ontario', 'Rancho Cucamonga'
  property_type_focus TEXT,                  -- 'Industrial', 'Office', 'Retail'
  field_focus TEXT,                          -- 'lease_months_left', 'owner_age', etc.
  bounty_count INTEGER DEFAULT 0,

  -- Estimated value
  total_estimated_value NUMERIC(12,2),       -- sum of value_of_information for all bounties
  total_estimated_minutes INTEGER,           -- sum of estimated_minutes

  -- Progress
  completed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'ready', 'in_progress', 'completed', 'archived'
  )),

  -- Outcome
  actual_tpe_lift NUMERIC(5,2),             -- average TPE improvement across completed bounties
  deals_generated INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bounty_batches_status ON bounty_batches(status);
CREATE INDEX idx_bounty_batches_type ON bounty_batches(batch_type);
CREATE INDEX idx_bounty_batches_created ON bounty_batches(created_at);
```

## Prioritization Algorithm

### Core Formula

```
Priority = (current_tpe * prediction_improvement * deal_value_estimate)
           / (lookup_difficulty_score * estimated_minutes)
```

### Difficulty Scoring

| Difficulty | Score | Examples |
|---|---|---|
| Easy (1-3) | 1-3 | Drive-by inspection, Google search, county assessor website |
| Moderate (4-6) | 4-6 | Phone call to property manager, LinkedIn research, CoStar lookup |
| Hard (7-10) | 7-10 | Multiple calls needed, requires relationship, CMBS data research |

### Daily Bounty Generation (Chief of Staff Agent -- Nightly Job)

```python
# Pseudocode: nightly bounty generation
def generate_daily_bounties():
    # Step 1: Get all entities with TPE scores
    entities = query("""
        SELECT p.property_id, p.address, p.city, p.property_type, p.sf,
               tpe.score AS current_tpe,
               ecv.commission_estimate AS deal_value
        FROM properties p
        JOIN property_tpe_scores tpe ON p.property_id = tpe.property_id
        JOIN property_ecv ecv ON p.property_id = ecv.property_id
        WHERE tpe.score >= 15  -- only bother with properties that have some signal
        ORDER BY tpe.score * ecv.commission_estimate DESC
    """)

    bounties = []
    for entity in entities:
        # Step 2: Check which high-impact fields are missing
        missing = check_missing_fields(entity, HIGH_IMPACT_FIELDS)

        for field in missing:
            gap = GAP_REGISTRY[field]
            # Step 3: Estimate improvement using historical calibration
            improvement = estimate_improvement(
                field=field,
                current_tpe=entity.current_tpe,
                calibration_data=get_past_bounty_outcomes(field)
            )

            priority = (
                entity.current_tpe *
                improvement *
                entity.deal_value
            ) / (gap.difficulty_score * gap.estimated_minutes)

            bounties.append(Bounty(
                entity=entity,
                field=field,
                improvement=improvement,
                priority=priority,
                instructions=gap.lookup_instructions
            ))

    # Step 4: Sort by priority, cap at 10 per day
    bounties.sort(key=lambda b: b.priority, reverse=True)
    daily_bounties = bounties[:10]

    # Step 5: Group by geography for efficient research
    batches = cluster_by_geography(daily_bounties)

    # Step 6: Create morning briefing batch
    create_morning_batch(batches)
```

### Geographic Clustering

Bounties are grouped so David can research efficiently during a single drive or phone session:

```sql
-- Cluster bounties by city + property_type for efficient research
SELECT
  geography_cluster,
  property_type_cluster,
  COUNT(*) as bounty_count,
  SUM(value_of_information) as total_value,
  SUM(estimated_minutes) as total_minutes,
  ROUND(SUM(value_of_information) / NULLIF(SUM(estimated_minutes), 0), 2)
    AS value_per_minute
FROM data_bounties
WHERE status = 'pending'
  AND expires_at > NOW()
GROUP BY geography_cluster, property_type_cluster
ORDER BY total_value DESC;
```

### Daily Cap: 10 Bounties Maximum

The system enforces a strict daily cap to prevent overwhelm:

```sql
-- Check daily capacity before creating new bounties
SELECT COUNT(*) as today_bounties
FROM data_bounties
WHERE created_at >= CURRENT_DATE
  AND status IN ('pending', 'queued', 'assigned', 'in_progress');
-- If >= 10, defer new bounties to tomorrow
```

## Morning Briefing Format

The Chief of Staff agent generates this at 6:00 AM daily:

```
+------------------------------------------------------------------+
|  MORNING DATA BOUNTIES              Thursday, March 13, 2026      |
|  Estimated potential commission value: $47,500                     |
+------------------------------------------------------------------+
|                                                                    |
|  BATCH 1: Fontana Industrial (3 bounties, ~25 min)                |
|  --------------------------------------------------------        |
|                                                                    |
|  #1  PRIORITY: ████████ 94                                        |
|  ABC Logistics @ 1234 Main St, Fontana                            |
|  Missing: Lease Expiration Date                                    |
|  Current TPE: 22% --> If expires <18mo: ~67% (+45 pts)            |
|  Deal value if transaction: ~$18,000 commission                    |
|  HOW: Call property manager (Jim Torres, 909-555-1234)            |
|       or look up on CoStar lease comps tab                         |
|  WHY: Tenant is 3PL company growing 25%/yr -- if lease            |
|       expires soon, likely expansion or relocation opportunity     |
|                                                                    |
|  #2  PRIORITY: ████████ 87                                        |
|  VACANT @ 5678 Jurupa Ave, Fontana                                |
|  Missing: Owner Contact Phone                                      |
|  Current TPE: 35% --> With owner contact: ~52% (+17 pts)          |
|  Deal value if transaction: ~$22,000 commission                    |
|  HOW: County assessor shows owner as "Chen Family Trust"          |
|       Mailing addr: 4521 Palm Dr, Arcadia 91006                   |
|       Try White Pages for phone, or send intro letter              |
|  WHY: 45,000 SF industrial, vacant 6+ months, trust ownership     |
|       signals potential disposition                                 |
|                                                                    |
|  #3  PRIORITY: ███████ 79                                         |
|  Delta Steel @ 910 Banana Ave, Fontana                            |
|  Missing: Building SF (currently estimated from land SF)           |
|  Current TPE: 28% --> With confirmed SF: recalculates ECV         |
|  Deal value: Unknown until SF confirmed                            |
|  HOW: County assessor "Improvement SF" field, or drive-by         |
|       to estimate from dock doors / building footprint             |
|                                                                    |
|  BATCH 2: Ontario Office (2 bounties, ~15 min)                    |
|  --------------------------------------------------------        |
|                                                                    |
|  #4  PRIORITY: ███████ 76                                         |
|  John Smith, CFO of XYZ Corp                                      |
|  Missing: Verified Phone Number (last checked 14 months ago)      |
|  Current TPE (3 linked properties): avg 41%                       |
|  HOW: Check LinkedIn for current company, call main line,         |
|       or re-verify on Been Verified                                |
|  WHY: Decision maker connected to 3 high-TPE properties.          |
|       Last interaction was 8 months ago -- relationship decaying   |
|                                                                    |
|  #5  PRIORITY: ██████ 71                                          |
|  Pacific Dental @ 2200 S Haven Ave, Ontario                       |
|  Missing: Lease Term / Expiration                                  |
|  Current TPE: 18% --> If <24mo: ~48% (+30 pts)                    |
|  HOW: Suite signage usually shows "Est. 20XX" -- check            |
|       Google Street View or drive-by. Call PM if visible           |
|                                                                    |
|  [View all 10 bounties] [Start research session] [Defer to Monday]|
+------------------------------------------------------------------+
```

## Feedback Loop

### Immediate Recalculation on Data Entry

When David fills a bounty, the system immediately:

1. Updates the source record with the new value
2. Recalculates TPE scores for the affected entity and all related entities
3. Records the actual TPE change vs. predicted change
4. Updates bounty calibration weights

```sql
-- Trigger: on bounty completion, recalculate and record outcome
CREATE OR REPLACE FUNCTION on_bounty_completed()
RETURNS TRIGGER AS $$
DECLARE
  new_tpe NUMERIC;
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Get recalculated TPE (assumes TPE view auto-updates)
    SELECT score INTO new_tpe
    FROM property_tpe_scores
    WHERE property_id = NEW.entity_id;

    UPDATE data_bounties SET
      tpe_score_after = new_tpe,
      actual_improvement = new_tpe - current_tpe_score,
      completed_at = NOW(),
      updated_at = NOW()
    WHERE id = NEW.id;

    -- Update batch progress
    UPDATE bounty_batches SET
      completed_count = completed_count + 1,
      updated_at = NOW()
    WHERE id = NEW.batch_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bounty_completed
  AFTER UPDATE OF status ON data_bounties
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION on_bounty_completed();
```

### Outcome Tracking (180-Day Window)

```sql
-- Nightly job: check if bounty entities generated deals
UPDATE data_bounties b SET
  deal_materialized = TRUE,
  deal_materialized_at = d.created_at,
  deal_actual_value = df.team_gross_computed / 3.0  -- David's share
FROM deals d
JOIN deal_properties dp ON d.deal_id = dp.deal_id
JOIN deal_formulas df ON d.deal_id = df.deal_id
WHERE dp.property_id = b.entity_id
  AND b.status = 'completed'
  AND b.deal_materialized IS NULL
  AND d.created_at > b.completed_at
  AND d.created_at < b.completed_at + INTERVAL '180 days'
  AND d.status NOT IN ('Dead', 'Lost');
```

### Calibration: Refining Future Predictions

```sql
-- View: how accurate are improvement predictions by field type?
CREATE OR REPLACE VIEW bounty_calibration AS
SELECT
  missing_field,
  COUNT(*) as total_completed,
  ROUND(AVG(prediction_improvement), 2) as avg_predicted_improvement,
  ROUND(AVG(actual_improvement), 2) as avg_actual_improvement,
  ROUND(AVG(actual_improvement) / NULLIF(AVG(prediction_improvement), 0), 3)
    as calibration_ratio,
  -- How often did filling this data lead to a deal?
  ROUND(
    COUNT(*) FILTER (WHERE deal_materialized = TRUE)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE completed_at < NOW() - INTERVAL '180 days'), 0) * 100,
    1
  ) as deal_conversion_rate,
  ROUND(AVG(deal_actual_value) FILTER (WHERE deal_materialized = TRUE), 2)
    as avg_deal_value_when_converted
FROM data_bounties
WHERE status = 'completed'
GROUP BY missing_field
ORDER BY avg_actual_improvement DESC;

-- Use calibration_ratio to adjust future predictions:
-- If calibration_ratio = 0.7, the system overestimates by 30% for this field
-- Future predicted_improvement = raw_estimate * calibration_ratio
```

### Specific Examples (IE-Contextualized)

**Example 1: Lease Expiration Discovery**
```
Entity: ABC Logistics @ 1234 Main St, Fontana (property_id: a1b2c3...)
Missing field: lease_months_left
Current TPE: 22 (low -- no lease data, ownership score carrying it)
  - Owner: Chen Family Trust (entity_trust_points: 10)
  - Hold duration: 18 years (hold_15yr_points: 10)
  - No lease data, no debt data, no growth data

If lease expires within 18 months:
  - lease_18mo_points: 22 added
  - New TPE: ~44 (before other recalculations)
  - With tenant growth signal (ABC grew 25% per Indeed postings): ~59
  - With balloon date estimate from title rep: ~67

Value of information:
  - Building: 38,000 SF industrial
  - Estimated lease value: 38,000 * $1.10/SF/mo * 60 months = $2,508,000
  - Commission at 4%: $100,320 team gross
  - David's share: ~$33,440
  - VOI = 45-point improvement * $33,440 / 100 = $15,048

Lookup instructions:
  1. Check CoStar > Property > Tenants tab for lease dates
  2. If no CoStar access: call PM (Jim Torres) at 909-555-1234
  3. If no PM: check if business license was recently renewed (city of Fontana portal)
  4. If none of the above: drive by, check loading dock activity level as occupancy proxy
```

**Example 2: Contact Verification**
```
Entity: John Smith, CFO of XYZ Corp (contact_id: d4e5f6...)
Missing field: phone_1 (currently: 909-555-9999, last verified 14 months ago)
Current TPE (3 linked properties): avg 41

Connected properties:
  - 2200 Industrial Blvd, Ontario -- TPE 48 (lease expiring 11 months)
  - 1800 Milliken Ave, Rancho Cucamonga -- TPE 39 (trust ownership)
  - 900 E 4th St, Ontario -- TPE 36 (long hold period)

If phone is valid and David reaches John:
  - Interaction logged --> recency boost to relationship score
  - Potential intel on lease plans for all 3 properties
  - Each property's TPE could shift +5 to +15 based on conversation content

Value of information:
  - 3 properties, combined estimated commissions: $95,000
  - Probability-weighted value: $95,000 * 0.41 = $38,950
  - A single phone call could surface actionable intel on all 3
  - VOI estimate: $8,500 (conservative)

Lookup instructions:
  1. Check LinkedIn for John Smith at XYZ Corp -- confirm still there
  2. If still at XYZ: call main line (909-555-0000), ask for John
  3. If moved companies: update company link, research new company's IE footprint
  4. Re-verify on Been Verified or White Pages
```

---

# PROMPT 39: Proxy Signal Engineering

## Framework Overview

When premium data sources (CoStar, ZoomInfo, RCA) are unavailable, the system uses free or low-cost proxy signals to approximate the same intelligence. Each proxy signal is collected by a specific agent, has a measured reliability rating, and is continuously calibrated against ground truth when it becomes available.

## Proxy Signal Categories

### Category 1: Occupancy Proxies (Substitutes for CoStar Vacancy Data)

| Proxy Signal | Approximates | Source | Collection Method | Reliability | Freshness | Agent |
|---|---|---|---|---|---|---|
| Google Maps review frequency | Building occupancy level | Google Maps API (free tier) | API call, count reviews in last 90 days | 0.35 | Weekly | Scout |
| Google Maps "Popular Times" | Foot traffic / active business | Google Maps scrape | Web scrape popular times chart | 0.40 | Weekly | Scout |
| Yelp/Google business listing count at address | Multi-tenant occupancy | Yelp API / Google Places | API call, count active businesses | 0.45 | Bi-weekly | Scout |
| Job postings mentioning address | Tenant actively operating | Indeed/LinkedIn scrape | Search by address or suite | 0.50 | Weekly | Researcher |
| USPS mail delivery (Change of Address filings) | Tenant move-out | USPS NCOA (requires bulk mailing) | Batch address check via bulk mail service | 0.55 | Monthly | Enricher |
| Parking lot fullness (Street View date) | Daytime occupancy | Google Street View | Compare historical Street View images | 0.30 | Quarterly | Scout |
| Utility connection status | Active tenant vs. vacant | County/city utility records (FOIA) | Public records request, batch | 0.65 | Quarterly | Researcher |
| "For Lease" sign visible (drive-by) | Vacancy | Manual drive-by | David or agent reports | 0.85 | As-observed | Logger |
| Broker listing on LoopNet/Crexi | Available space | LoopNet/Crexi scrape | Web scrape listing pages | 0.80 | Daily | Scout |
| Business license active status | Tenant operating | City business license portal | Web scrape city portal | 0.60 | Monthly | Researcher |

### Category 2: Company Health Proxies (Substitutes for ZoomInfo Firmographics)

| Proxy Signal | Approximates | Source | Collection Method | Reliability | Freshness | Agent |
|---|---|---|---|---|---|---|
| Job posting velocity (Indeed/LinkedIn) | Headcount growth rate | Indeed RSS / LinkedIn scrape | Count new postings per week, track trend | 0.55 | Weekly | Researcher |
| Job posting types (seniority, function) | Expansion vs. replacement hiring | Indeed/LinkedIn scrape | Classify postings: new roles vs. backfills | 0.40 | Weekly | Researcher |
| Glassdoor rating trend | Employee satisfaction / stability | Glassdoor scrape | Track rating over time, note review sentiment | 0.35 | Monthly | Researcher |
| Glassdoor "CEO Approval" trend | Leadership stability | Glassdoor scrape | Track approval rating direction | 0.30 | Monthly | Researcher |
| Press releases / news mentions | Growth, funding, contracts | Google News API / RSS | Search company name + IE geography | 0.50 | Daily | Scout |
| SEC filings (10-K, 8-K) | Revenue, headcount (if public) | SEC EDGAR API (free) | API query by company CIK | 0.90 | Quarterly | Researcher |
| CA Secretary of State filings | Active status, officer changes | CA SOS bizfile portal | Web scrape by entity name | 0.70 | Monthly | Enricher |
| UCC lien filings | Equipment financing / debt load | CA SOS UCC search | Web scrape by debtor name | 0.60 | Monthly | Researcher |
| Federal/state tax liens | Financial distress | County recorder / IRS FOIA | Public records search | 0.75 | Monthly | Researcher |
| BBB complaints trend | Customer satisfaction proxy | BBB API / scrape | Count complaints, track trend | 0.25 | Monthly | Scout |
| Bankruptcy filings (PACER) | Severe distress | PACER (low cost per query) | Search by company name | 0.95 | Weekly | Researcher |
| Social media posting frequency | Company activity level | LinkedIn company page scrape | Track posting frequency and engagement | 0.30 | Weekly | Scout |
| Website traffic (SimilarWeb free tier) | Company health/visibility | SimilarWeb | Free tier lookup | 0.35 | Monthly | Researcher |

### Category 3: Lease Expiration Proxies (Substitutes for CoStar Lease Data)

| Proxy Signal | Approximates | Source | Collection Method | Reliability | Freshness | Agent |
|---|---|---|---|---|---|---|
| County assessor ownership change date | Ownership hold period | County assessor portal | Web scrape by APN | 0.70 | Quarterly | Enricher |
| Business license renewal date | Operating tenure at location | City business license portal | Web scrape by address | 0.45 | Annually | Researcher |
| Tenant improvement permits (recent) | New/renewed lease (TI = new lease) | County building permits portal | Web scrape by address | 0.60 | Monthly | Researcher |
| Signage permits | New tenant moving in | County/city permits portal | Web scrape by address | 0.55 | Monthly | Scout |
| Broker listing activity for the space | Lease expiring / space coming available | LoopNet/Crexi/broker sites | Web scrape, monitor for address | 0.75 | Daily | Scout |
| Tenant company founding date vs. address tenure | Approximate occupancy start | CA SOS + county assessor | Cross-reference incorporation with address | 0.35 | Quarterly | Enricher |
| "Lease" recorded on title | Lease existence (not expiration) | County recorder | Title search by property | 0.50 | Quarterly | Researcher |
| Asking rent changes for comparable spaces | Market pressure on renewals | LoopNet/Crexi listing data | Track asking rents in submarket | 0.40 | Weekly | Scout |
| Tenant's other locations (multi-site) | Consolidation/expansion patterns | Google Maps / company website | Search for other locations in region | 0.35 | Monthly | Researcher |

### Category 4: Market Trend Proxies (Substitutes for CBRE/Moody's Forecasts)

| Proxy Signal | Approximates | Source | Collection Method | Reliability | Freshness | Agent |
|---|---|---|---|---|---|---|
| Building permits (new construction) | Supply pipeline | SB/Riverside County building dept | Web scrape permit portal | 0.65 | Monthly | Researcher |
| Construction starts (Dodge free tier) | Near-term supply additions | Dodge Data & Analytics free summaries | Web scrape / RSS | 0.55 | Monthly | Scout |
| Employment data (BLS) | Demand driver -- more jobs = more space | BLS API (free) | API call: IE MSA employment by sector | 0.70 | Monthly | Researcher |
| Population data (Census/ACS) | Long-term demand driver | Census API (free) | API call: SB/Riverside county population | 0.65 | Annually | Researcher |
| Freight indices (Cass/DAT) | Logistics demand (industrial) | Cass Freight Index (free summary) | Web scrape monthly summary | 0.50 | Monthly | Scout |
| Port of LA/Long Beach volume | IE warehouse demand driver | Port websites (free, published monthly) | Web scrape monthly throughput stats | 0.60 | Monthly | Scout |
| Amazon/FedEx/UPS facility announcements | Logistics market temperature | Google News / press releases | Search: "Amazon warehouse Inland Empire" | 0.55 | Daily | Scout |
| Interest rates (Fed Funds / 10yr Treasury) | Cap rate direction, transaction velocity | FRED API (free) | API call: daily rates | 0.75 | Daily | Researcher |
| CMBS delinquency rates (Trepp free) | Distressed property supply | Trepp free monthly report | Web scrape summary stats | 0.50 | Monthly | Researcher |
| LoopNet/Crexi listing count trend | Supply/demand balance | LoopNet/Crexi scrape | Count active listings by submarket/type | 0.55 | Weekly | Scout |
| Days-on-market trend | Market velocity | LoopNet/Crexi scrape | Track average DOM for listings | 0.50 | Weekly | Scout |
| Asking rent trend | Rent direction | LoopNet/Crexi scrape | Track median asking rent by type/submarket | 0.55 | Weekly | Scout |
| Inland Empire unemployment rate | Economic health | BLS/EDD API (free) | API call: IE MSA unemployment | 0.70 | Monthly | Researcher |

### Category 5: Owner Intent Proxies (Substitutes for RCA Transaction Data)

| Proxy Signal | Approximates | Source | Collection Method | Reliability | Freshness | Agent |
|---|---|---|---|---|---|---|
| Deed of trust recording date | Loan origination (estimate maturity) | County recorder | Title search, estimate 5/7/10yr balloon | 0.45 | Quarterly | Enricher |
| CMBS loan data (public, Trepp/KBRA free) | Confirmed loan maturity | CMBS servicer reports (free via KBRA) | Search by property address in CMBS databases | 0.80 | Monthly | Researcher |
| Property tax delinquency | Financial distress / forced sale | County tax collector portal | Web scrape by APN | 0.75 | Quarterly | Researcher |
| Code violations | Deferred maintenance / distress | City code enforcement portal | Web scrape by address | 0.50 | Monthly | Researcher |
| Visible deferred maintenance | Owner neglect / disposition signal | Drive-by inspection | David or agent observes and logs | 0.55 | As-observed | Logger |
| Owner age (White Pages/public records) | Succession / estate planning | White Pages / county voter rolls | Web scrape by owner name | 0.50 | Annually | Enricher |
| Trust ownership | Estate/succession planning | County assessor (owner name) | Parse owner name for "Trust", "Estate" | 0.65 | Quarterly | Enricher |
| Owner portfolio size | Portfolio optimization pressure | County assessor bulk search | Search all properties by owner name | 0.60 | Quarterly | Enricher |
| Owner selling other properties | Disposition mode / 1031 exchange | LoopNet/Crexi listings by owner name | Search owner name in listing sites | 0.70 | Weekly | Scout |
| Recent property tax reassessment | Ownership change / refinance | County assessor tax rolls | Check for supplemental tax bills | 0.65 | Quarterly | Researcher |
| 1031 exchange intermediary activity | Active exchangers looking to buy/sell | QI websites, broker network intel | Industry contacts, news monitoring | 0.30 | Monthly | Scout |
| Owner recently purchased other property | Active investor / deploying capital | County recorder (grant deeds by name) | Search recent grant deeds by owner name | 0.70 | Monthly | Enricher |
| Probate filings | Owner death / estate disposition | County probate court records | Search by owner name | 0.85 | Monthly | Researcher |

## Database Schema

### `proxy_signals` Table

```sql
CREATE TABLE IF NOT EXISTS proxy_signals (
  id SERIAL PRIMARY KEY,
  -- Signal definition
  signal_code TEXT NOT NULL UNIQUE,            -- e.g. 'OCC_GOOGLE_REVIEWS', 'HEALTH_JOB_VELOCITY'
  signal_name TEXT NOT NULL,                   -- human-readable
  signal_category TEXT NOT NULL CHECK (signal_category IN (
    'occupancy', 'company_health', 'lease_expiration',
    'market_trend', 'owner_intent'
  )),
  -- What it approximates
  premium_data_equivalent TEXT NOT NULL,       -- 'CoStar vacancy rate', 'ZoomInfo headcount', etc.
  premium_source TEXT NOT NULL,                -- 'CoStar', 'ZoomInfo', 'RCA', 'CBRE', etc.

  -- Collection
  source_name TEXT NOT NULL,                   -- 'Google Maps API', 'Indeed scrape', etc.
  source_cost TEXT NOT NULL DEFAULT 'free',    -- 'free', 'low_cost', 'per_query'
  collection_method TEXT NOT NULL CHECK (collection_method IN (
    'api', 'web_scrape', 'manual', 'rss', 'public_records', 'calculated'
  )),
  collection_agent TEXT NOT NULL,              -- which of the 6 agents collects this
  collection_frequency TEXT NOT NULL,          -- 'daily', 'weekly', 'bi-weekly', 'monthly', 'quarterly', 'as_observed'
  collection_endpoint TEXT,                    -- URL or API endpoint

  -- Reliability
  base_reliability NUMERIC(3,2) NOT NULL CHECK (base_reliability >= 0 AND base_reliability <= 1),
  calibrated_reliability NUMERIC(3,2),        -- updated from reliability_tracking
  reliability_sample_size INTEGER DEFAULT 0,

  -- Applicability
  applies_to_entity TEXT NOT NULL CHECK (applies_to_entity IN (
    'property', 'company', 'contact', 'market', 'submarket'
  )),
  property_types TEXT[],                      -- which property types this applies to, NULL = all
  notes TEXT,

  -- Status
  active BOOLEAN DEFAULT TRUE,
  last_collected_at TIMESTAMPTZ,
  collection_error_count INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proxy_signals_category ON proxy_signals(signal_category);
CREATE INDEX idx_proxy_signals_agent ON proxy_signals(collection_agent);
CREATE INDEX idx_proxy_signals_active ON proxy_signals(active);
CREATE INDEX idx_proxy_signals_reliability ON proxy_signals(calibrated_reliability DESC);
```

### `proxy_signal_values` Table

```sql
-- Stores actual collected proxy signal values per entity
CREATE TABLE IF NOT EXISTS proxy_signal_values (
  id SERIAL PRIMARY KEY,
  signal_id INTEGER NOT NULL REFERENCES proxy_signals(id),
  -- Target entity
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  -- Value
  value_numeric NUMERIC,                     -- for quantitative signals
  value_text TEXT,                            -- for qualitative signals
  value_json JSONB,                           -- for structured signals (e.g., job posting breakdown)
  -- Interpretation
  interpreted_score NUMERIC(5,2),            -- normalized 0-100 score
  interpretation TEXT,                        -- 'high_occupancy', 'growing', 'distressed', etc.
  -- Collection metadata
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  collection_source_url TEXT,
  agent_name TEXT,
  confidence INTEGER DEFAULT 50 CHECK (confidence >= 0 AND confidence <= 100),
  -- Lifecycle
  superseded_by INTEGER REFERENCES proxy_signal_values(id),  -- newer reading
  is_current BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proxy_values_signal ON proxy_signal_values(signal_id);
CREATE INDEX idx_proxy_values_entity ON proxy_signal_values(entity_type, entity_id);
CREATE INDEX idx_proxy_values_current ON proxy_signal_values(is_current) WHERE is_current = TRUE;
CREATE INDEX idx_proxy_values_collected ON proxy_signal_values(collected_at);
```

### `proxy_reliability_tracking` Table

```sql
-- Tracks proxy predictions vs. actual outcomes for calibration
CREATE TABLE IF NOT EXISTS proxy_reliability_tracking (
  id SERIAL PRIMARY KEY,
  signal_id INTEGER NOT NULL REFERENCES proxy_signals(id),
  -- What the proxy predicted
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  proxy_prediction TEXT NOT NULL,            -- e.g. 'occupied', 'vacant', 'growing', 'lease_expiring'
  proxy_confidence NUMERIC(3,2),             -- 0-1

  -- Ground truth (filled when known)
  ground_truth TEXT,                          -- actual outcome
  ground_truth_source TEXT,                   -- how we learned the truth: 'costar', 'david_confirmed', 'deal_closed'
  ground_truth_at TIMESTAMPTZ,

  -- Accuracy
  prediction_correct BOOLEAN,                -- did the proxy get it right?
  error_magnitude NUMERIC(5,2),              -- how far off (for continuous predictions)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proxy_reliability_signal ON proxy_reliability_tracking(signal_id);
CREATE INDEX idx_proxy_reliability_correct ON proxy_reliability_tracking(prediction_correct);

-- View: aggregate reliability by signal
CREATE OR REPLACE VIEW proxy_reliability_summary AS
SELECT
  ps.signal_code,
  ps.signal_name,
  ps.signal_category,
  ps.base_reliability,
  COUNT(prt.id) as sample_size,
  ROUND(
    COUNT(*) FILTER (WHERE prt.prediction_correct = TRUE)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE prt.ground_truth IS NOT NULL), 0),
    3
  ) as measured_accuracy,
  ROUND(AVG(prt.error_magnitude) FILTER (WHERE prt.error_magnitude IS NOT NULL), 3)
    as avg_error,
  MAX(prt.ground_truth_at) as last_calibrated
FROM proxy_signals ps
LEFT JOIN proxy_reliability_tracking prt ON ps.id = prt.signal_id
GROUP BY ps.id, ps.signal_code, ps.signal_name, ps.signal_category, ps.base_reliability;
```

### Composite Proxy Scoring

When multiple proxy signals cover the same premium data gap, they are combined into a weighted composite score:

```sql
-- Example: Composite occupancy score for a property
-- Combines multiple proxy signals with reliability-weighted averaging
CREATE OR REPLACE FUNCTION calculate_composite_proxy(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_signal_category TEXT
) RETURNS NUMERIC AS $$
DECLARE
  composite NUMERIC;
BEGIN
  SELECT
    ROUND(
      SUM(psv.interpreted_score * COALESCE(ps.calibrated_reliability, ps.base_reliability))
      / NULLIF(SUM(COALESCE(ps.calibrated_reliability, ps.base_reliability)), 0),
      2
    ) INTO composite
  FROM proxy_signal_values psv
  JOIN proxy_signals ps ON psv.signal_id = ps.id
  WHERE psv.entity_type = p_entity_type
    AND psv.entity_id = p_entity_id
    AND psv.is_current = TRUE
    AND ps.signal_category = p_signal_category
    AND ps.active = TRUE;

  RETURN COALESCE(composite, 50);  -- default to 50 (uncertain) if no signals
END;
$$ LANGUAGE plpgsql;
```

### Agent Collection Schedule

| Agent | Signals Collected | Schedule | Estimated Daily Load |
|---|---|---|---|
| **Scout** | Google Maps, Yelp, LoopNet/Crexi listings, press releases, port volumes, freight indices | Daily/Weekly | 50-100 lookups |
| **Researcher** | Job postings, BLS data, building permits, CMBS data, bankruptcy, tax liens, SEC filings | Weekly/Monthly | 20-40 lookups |
| **Enricher** | County assessor, CA SOS filings, White Pages, UCC liens, deed records, owner portfolio | Monthly/Quarterly | 30-50 lookups |
| **Logger** | Drive-by observations (deferred maintenance, vacancy signs, parking lot) | As-observed | David inputs |
| **Matcher** | Cross-references proxy signals with CRM entities, calculates composites | Continuous | Reactive |
| **Chief of Staff** | Aggregates proxy scores into TPE inputs, identifies calibration drift | Nightly | Full portfolio |

---

# PROMPT 40: Multi-Horizon Prediction Engine

## Overview

The prediction engine generates transaction probability scores across four time horizons: 30-day, 90-day, 180-day, and 365-day. Each horizon uses a different feature set weighted by time-relevance, and produces probability estimates with explicit confidence bounds.

The existing TPE system (migration 006) calculates a static score. This design extends it into a time-aware, multi-horizon system that tracks prediction evolution and identifies momentum.

## Database Schema

### `predictions` Table

```sql
CREATE TABLE IF NOT EXISTS predictions (
  id SERIAL PRIMARY KEY,
  -- Target entity
  entity_type TEXT NOT NULL CHECK (entity_type IN (
    'property', 'contact', 'company', 'deal'
  )),
  entity_id UUID NOT NULL,
  entity_label TEXT,                          -- human-readable label

  -- Prediction
  horizon_days INTEGER NOT NULL CHECK (horizon_days IN (30, 90, 180, 365)),
  probability NUMERIC(5,2) NOT NULL CHECK (probability >= 0 AND probability <= 100),
  confidence_lower NUMERIC(5,2) NOT NULL,     -- lower bound of confidence interval
  confidence_upper NUMERIC(5,2) NOT NULL,     -- upper bound of confidence interval
  confidence_width NUMERIC(5,2) GENERATED ALWAYS AS (confidence_upper - confidence_lower) STORED,

  -- Feature attribution
  top_features JSONB NOT NULL DEFAULT '[]',   -- ranked list: [{feature, value, contribution, direction}]
  feature_count INTEGER DEFAULT 0,            -- how many features contributed
  data_completeness NUMERIC(3,2),             -- 0-1: what % of ideal features are available

  -- Model metadata
  model_version TEXT NOT NULL DEFAULT 'v1.0',
  model_type TEXT DEFAULT 'weighted_score',   -- 'weighted_score', 'logistic', 'gradient_boost'
  calculation_time_ms INTEGER,

  -- Momentum (filled by prediction_history analysis)
  momentum_direction TEXT CHECK (momentum_direction IN (
    'accelerating', 'climbing', 'stable', 'declining', 'decelerating'
  )),
  momentum_strength NUMERIC(3,2),             -- 0-1: how strong is the trend
  consecutive_direction_weeks INTEGER DEFAULT 0,

  -- Lifecycle
  is_current BOOLEAN DEFAULT TRUE,
  predicted_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  superseded_by INTEGER REFERENCES predictions(id),

  -- Outcome (filled when ground truth is known)
  outcome_known BOOLEAN DEFAULT FALSE,
  outcome_transaction BOOLEAN,                -- did a transaction happen in this horizon?
  outcome_known_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_predictions_entity ON predictions(entity_type, entity_id);
CREATE INDEX idx_predictions_horizon ON predictions(horizon_days);
CREATE INDEX idx_predictions_current ON predictions(is_current) WHERE is_current = TRUE;
CREATE INDEX idx_predictions_probability ON predictions(probability DESC) WHERE is_current = TRUE;
CREATE INDEX idx_predictions_momentum ON predictions(momentum_direction, momentum_strength);
CREATE INDEX idx_predictions_expires ON predictions(expires_at);
CREATE UNIQUE INDEX idx_predictions_current_unique
  ON predictions(entity_type, entity_id, horizon_days) WHERE is_current = TRUE;
```

### `prediction_history` Table

```sql
CREATE TABLE IF NOT EXISTS prediction_history (
  id SERIAL PRIMARY KEY,
  -- Target entity
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  horizon_days INTEGER NOT NULL,

  -- Snapshot
  probability NUMERIC(5,2) NOT NULL,
  confidence_lower NUMERIC(5,2),
  confidence_upper NUMERIC(5,2),
  top_features JSONB,
  data_completeness NUMERIC(3,2),

  -- Change tracking
  previous_probability NUMERIC(5,2),
  probability_delta NUMERIC(5,2),             -- current - previous
  delta_reason TEXT,                           -- 'new_data', 'time_decay', 'market_shift', 'related_entity'

  -- Source prediction
  prediction_id INTEGER REFERENCES predictions(id),

  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pred_history_entity ON prediction_history(entity_type, entity_id);
CREATE INDEX idx_pred_history_horizon ON prediction_history(horizon_days);
CREATE INDEX idx_pred_history_recorded ON prediction_history(recorded_at);
CREATE INDEX idx_pred_history_delta ON prediction_history(probability_delta);

-- View: prediction trend analysis
CREATE OR REPLACE VIEW prediction_trends AS
SELECT
  entity_type,
  entity_id,
  horizon_days,
  -- Current
  (ARRAY_AGG(probability ORDER BY recorded_at DESC))[1] as current_probability,
  -- 1 week ago
  (ARRAY_AGG(probability ORDER BY recorded_at DESC
    FILTER (WHERE recorded_at < NOW() - INTERVAL '6 days')))[1] as prob_1w_ago,
  -- 2 weeks ago
  (ARRAY_AGG(probability ORDER BY recorded_at DESC
    FILTER (WHERE recorded_at < NOW() - INTERVAL '13 days')))[1] as prob_2w_ago,
  -- 4 weeks ago
  (ARRAY_AGG(probability ORDER BY recorded_at DESC
    FILTER (WHERE recorded_at < NOW() - INTERVAL '27 days')))[1] as prob_4w_ago,
  -- Trend direction
  COUNT(*) FILTER (WHERE probability_delta > 0 AND recorded_at > NOW() - INTERVAL '21 days')
    as up_readings_3w,
  COUNT(*) FILTER (WHERE probability_delta < 0 AND recorded_at > NOW() - INTERVAL '21 days')
    as down_readings_3w,
  COUNT(*) FILTER (WHERE recorded_at > NOW() - INTERVAL '21 days')
    as total_readings_3w
FROM prediction_history
WHERE recorded_at > NOW() - INTERVAL '90 days'
GROUP BY entity_type, entity_id, horizon_days;
```

### `prediction_triggers` Table

```sql
CREATE TABLE IF NOT EXISTS prediction_triggers (
  id SERIAL PRIMARY KEY,
  -- What triggered the recalculation
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'new_data',           -- a field was updated on the entity
    'time_decay',         -- scheduled recalculation (daily/weekly)
    'market_regime',      -- market-level signal changed (interest rates, vacancy)
    'related_entity',     -- a linked entity changed (contact's company grew)
    'proxy_signal',       -- new proxy signal collected
    'bounty_completed',   -- David filled a data bounty
    'interaction_logged', -- new call/meeting/email logged
    'deal_stage_change',  -- deal pipeline movement
    'manual_override'     -- David manually adjusted something
  )),
  trigger_detail TEXT,                        -- e.g. 'lease_months_left updated from NULL to 14'

  -- What was recalculated
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  horizons_recalculated INTEGER[] NOT NULL,   -- e.g. {30, 90, 180, 365}

  -- Impact
  max_probability_change NUMERIC(5,2),        -- largest delta across all horizons
  predictions_affected INTEGER DEFAULT 1,     -- how many predictions were recalculated

  -- Cascade tracking
  cascaded_from_entity_type TEXT,             -- if this was triggered by another entity's change
  cascaded_from_entity_id UUID,
  cascade_depth INTEGER DEFAULT 0,            -- prevent infinite cascades

  triggered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_pred_triggers_entity ON prediction_triggers(entity_type, entity_id);
CREATE INDEX idx_pred_triggers_type ON prediction_triggers(trigger_type);
CREATE INDEX idx_pred_triggers_triggered ON prediction_triggers(triggered_at);
```

## Feature Sets by Horizon

### 30-Day Features (Immediate Transaction Signals)

These are action-oriented, high-velocity signals. If something is going to transact in 30 days, there should be visible activity NOW.

| Rank | Feature | Weight | Type | Min Data Requirement | Signal Character |
|---|---|---|---|---|---|
| 1 | Active listing (property for sale/lease) | 0.20 | Leading | Listing URL or broker confirmed | Binary: listed or not |
| 2 | Broker inquiry velocity (last 14 days) | 0.15 | Leading | >= 1 interaction logged | Count of inquiries, normalized |
| 3 | Showing requests / tours scheduled | 0.15 | Leading | Calendar/interaction data | Count in last 14 days |
| 4 | Price reduction (last 30 days) | 0.12 | Leading | For-sale price history | Boolean + magnitude |
| 5 | Pending offer / LOI submitted | 0.15 | Leading | Deal status = "LOI" or "Under Contract" | Binary |
| 6 | Tenant move-out notice received | 0.10 | Leading | Interaction logged | Binary |
| 7 | David's last interaction recency | 0.08 | Concurrent | Interaction timestamp | Days since last contact |
| 8 | Days on market | 0.05 | Lagging | Listing date | Continuous, higher DOM = lower prob |

**Confidence bounds at 30 days:**
- High data completeness (>70%): probability +/- 8 points
- Medium data completeness (40-70%): probability +/- 15 points
- Low data completeness (<40%): probability +/- 25 points

**Minimum viable prediction:** At least one of: active listing, recent interaction, or pending offer. Without any of these, 30-day prediction defaults to base rate (3-5%) with very wide confidence bands.

### 90-Day Features (Near-Term Transaction Drivers)

These capture situations where a transaction is developing but not yet in active negotiation.

| Rank | Feature | Weight | Type | Min Data Requirement | Signal Character |
|---|---|---|---|---|---|
| 1 | Lease expiration within 90 days | 0.18 | Leading | lease_months_left <= 3 | Countdown |
| 2 | Owner listed other properties | 0.12 | Leading | Scout detected listing by same owner | Binary + count |
| 3 | Refinancing activity detected | 0.10 | Leading | Deed of trust recording or title rep intel | Binary |
| 4 | Tenant downsizing signals | 0.10 | Leading | Job posting decline, Glassdoor layoff mentions | Composite proxy |
| 5 | Loan maturity within 90 days | 0.12 | Leading | loan_maturities.maturity_date | Countdown |
| 6 | Market comp velocity (similar deals closing) | 0.08 | Concurrent | sale_comps or lease_comps in submarket | Rate: deals/month |
| 7 | Price per SF vs. market (over/underpriced) | 0.08 | Concurrent | for_sale_price and market avg | Ratio |
| 8 | David relationship strength to decision maker | 0.07 | Enabling | Interaction history + relationship_edges | Composite score |
| 9 | Vacancy duration (if vacant) | 0.08 | Lagging | Days since vacancy detected | Continuous |
| 10 | Submarket vacancy trend | 0.07 | Concurrent | Proxy signal composite | Direction + magnitude |

**Confidence bounds at 90 days:**
- High data completeness: probability +/- 12 points
- Medium: probability +/- 20 points
- Low: probability +/- 30 points

**Minimum viable prediction:** Lease expiration date OR loan maturity date OR at least 2 proxy signals. Without these, defaults to 8-12% base rate.

### 180-Day Features (Medium-Term Structural Drivers)

These capture slow-moving structural forces that make a transaction increasingly likely.

| Rank | Feature | Weight | Type | Min Data Requirement | Signal Character |
|---|---|---|---|---|---|
| 1 | Lease expiration within 180 days | 0.15 | Leading | lease_months_left <= 6 | Countdown |
| 2 | Loan maturity within 180 days | 0.12 | Leading | maturity_date | Countdown |
| 3 | Owner age 65+ | 0.10 | Structural | owner age estimate | Threshold |
| 4 | Trust/estate ownership | 0.08 | Structural | owner_entity_type | Binary |
| 5 | Tenant growth trend (3-6 month) | 0.10 | Leading | Job posting velocity trend | Direction + magnitude |
| 6 | Tenant contraction trend | 0.10 | Leading | Layoff signals, posting decline | Direction + magnitude |
| 7 | Hold period > 10 years | 0.08 | Structural | County assessor last sale date | Threshold |
| 8 | Submarket vacancy trend (3mo) | 0.07 | Concurrent | Proxy composite | Direction |
| 9 | Out-of-area owner | 0.06 | Structural | Owner mailing address vs. property | Binary |
| 10 | Deferred maintenance signals | 0.05 | Structural | Code violations, drive-by observations | Composite |
| 11 | LTV ratio > 75% | 0.05 | Structural | Estimated from loan data | Threshold |
| 12 | Debt stress (balloon approaching) | 0.04 | Leading | debt_stress table | Confidence-weighted |

**Confidence bounds at 180 days:**
- High data completeness: probability +/- 15 points
- Medium: probability +/- 25 points
- Low: probability +/- 35 points

**Minimum viable prediction:** At least 3 of the top 8 features must have data. Otherwise, defaults to 10-15% base rate.

### 365-Day Features (Long-Term Strategic Drivers)

These are macro and demographic forces that shape the market over a full year. Individual property features matter less; market structure matters more.

| Rank | Feature | Weight | Type | Min Data Requirement | Signal Character |
|---|---|---|---|---|---|
| 1 | Demographic shifts (IE population growth) | 0.10 | Structural | Census/ACS data | Rate of change |
| 2 | Infrastructure projects (freeway, rail) | 0.08 | Structural | County planning data, news | Binary + proximity |
| 3 | Zoning changes (warehouse district rezoning) | 0.08 | Structural | County planning commission | Binary + proximity |
| 4 | Interest rate cycle position | 0.10 | Structural | Fed funds rate + 10yr Treasury | Direction + velocity |
| 5 | Tenant industry health (sector employment) | 0.10 | Structural | BLS sector employment data | Direction + magnitude |
| 6 | Port volume trend (12-month) | 0.08 | Leading | Port of LA/LB throughput | Direction |
| 7 | Supply pipeline (permits + construction) | 0.08 | Leading | Building permits filed | Volume + location |
| 8 | Owner portfolio lifecycle | 0.07 | Structural | Owner age + hold period + portfolio size | Composite |
| 9 | Lease expiration within 365 days | 0.08 | Leading | lease_months_left <= 12 | Countdown |
| 10 | Loan maturity within 365 days | 0.07 | Leading | maturity_date | Countdown |
| 11 | Market cycle position (absorption trend) | 0.08 | Structural | Listing count trend, comp velocity | Phase: expansion/peak/contraction/trough |
| 12 | Entitlement/redevelopment potential | 0.08 | Structural | Zoning, land value vs. improvement value | Ratio + opportunity |

**Confidence bounds at 365 days:**
- High data completeness: probability +/- 20 points
- Medium: probability +/- 30 points
- Low: probability +/- 40 points

**Minimum viable prediction:** Market-level features (items 1-7) are always available from public data. Property-specific prediction requires at least 2 property-level features.

## Prediction Momentum Engine

### Concept: Convergence Amplification

When signals across multiple time horizons align -- short-term activity confirms long-term structural factors -- the system detects "prediction momentum" and adjusts confidence accordingly.

```
Momentum Score = alignment_score * velocity * persistence

Where:
  alignment_score = correlation between 30/90/180/365-day probability directions
                    (all climbing = 1.0, mixed = 0.5, all declining = -1.0)
  velocity        = average rate of probability change per week (normalized 0-1)
  persistence     = weeks of consecutive same-direction movement (capped at 8)
```

### Momentum Detection SQL

```sql
CREATE OR REPLACE FUNCTION detect_prediction_momentum(
  p_entity_type TEXT,
  p_entity_id UUID
) RETURNS TABLE (
  momentum_direction TEXT,
  momentum_strength NUMERIC,
  alignment_score NUMERIC,
  narrative TEXT
) AS $$
DECLARE
  prob_30 NUMERIC; prob_90 NUMERIC; prob_180 NUMERIC; prob_365 NUMERIC;
  delta_30 NUMERIC; delta_90 NUMERIC; delta_180 NUMERIC; delta_365 NUMERIC;
  alignment NUMERIC;
  velocity NUMERIC;
  persistence INTEGER;
  direction TEXT;
  strength NUMERIC;
BEGIN
  -- Get current probabilities
  SELECT probability INTO prob_30 FROM predictions
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id
    AND horizon_days = 30 AND is_current = TRUE;
  SELECT probability INTO prob_90 FROM predictions
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id
    AND horizon_days = 90 AND is_current = TRUE;
  SELECT probability INTO prob_180 FROM predictions
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id
    AND horizon_days = 180 AND is_current = TRUE;
  SELECT probability INTO prob_365 FROM predictions
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id
    AND horizon_days = 365 AND is_current = TRUE;

  -- Get 2-week deltas
  SELECT COALESCE(
    prob_30 - (SELECT probability FROM prediction_history
               WHERE entity_type = p_entity_type AND entity_id = p_entity_id
               AND horizon_days = 30 AND recorded_at < NOW() - INTERVAL '13 days'
               ORDER BY recorded_at DESC LIMIT 1),
    0) INTO delta_30;
  -- (similar for delta_90, delta_180, delta_365)
  SELECT COALESCE(
    prob_90 - (SELECT probability FROM prediction_history
               WHERE entity_type = p_entity_type AND entity_id = p_entity_id
               AND horizon_days = 90 AND recorded_at < NOW() - INTERVAL '13 days'
               ORDER BY recorded_at DESC LIMIT 1),
    0) INTO delta_90;
  SELECT COALESCE(
    prob_180 - (SELECT probability FROM prediction_history
                WHERE entity_type = p_entity_type AND entity_id = p_entity_id
                AND horizon_days = 180 AND recorded_at < NOW() - INTERVAL '13 days'
                ORDER BY recorded_at DESC LIMIT 1),
    0) INTO delta_180;
  SELECT COALESCE(
    prob_365 - (SELECT probability FROM prediction_history
                WHERE entity_type = p_entity_type AND entity_id = p_entity_id
                AND horizon_days = 365 AND recorded_at < NOW() - INTERVAL '13 days'
                ORDER BY recorded_at DESC LIMIT 1),
    0) INTO delta_365;

  -- Calculate alignment: how many horizons agree on direction?
  alignment := (
    SIGN(delta_30) + SIGN(delta_90) + SIGN(delta_180) + SIGN(delta_365)
  )::numeric / 4.0;

  -- Velocity: average absolute change rate
  velocity := LEAST(
    (ABS(delta_30) + ABS(delta_90) + ABS(delta_180) + ABS(delta_365)) / 4.0 / 10.0,
    1.0
  );

  -- Persistence: consecutive weeks of same-direction movement (simplified)
  SELECT COUNT(*) INTO persistence
  FROM prediction_history
  WHERE entity_type = p_entity_type AND entity_id = p_entity_id
    AND horizon_days = 90
    AND recorded_at > NOW() - INTERVAL '56 days'
    AND SIGN(probability_delta) = SIGN(delta_90)
    AND probability_delta != 0;
  persistence := LEAST(persistence, 8);

  -- Determine direction
  IF alignment > 0.5 THEN
    IF velocity > 0.3 THEN direction := 'accelerating';
    ELSE direction := 'climbing';
    END IF;
  ELSIF alignment < -0.5 THEN
    IF velocity > 0.3 THEN direction := 'decelerating';
    ELSE direction := 'declining';
    END IF;
  ELSE
    direction := 'stable';
  END IF;

  -- Strength
  strength := LEAST(ABS(alignment) * velocity * (persistence::numeric / 4.0), 1.0);

  RETURN QUERY SELECT
    direction,
    ROUND(strength, 2),
    ROUND(alignment, 2),
    CASE
      WHEN direction = 'accelerating' THEN
        format('All horizons climbing, velocity %.0f%%/wk, %s weeks consistent -- strong buy signal',
               velocity * 100, persistence)
      WHEN direction = 'climbing' THEN
        format('Most horizons trending up, %s weeks consistent -- building opportunity',
               persistence)
      WHEN direction = 'declining' THEN
        format('Most horizons trending down -- opportunity may be cooling')
      WHEN direction = 'decelerating' THEN
        format('All horizons declining rapidly -- investigate cause')
      ELSE
        'Mixed signals across horizons -- monitor for convergence'
    END;
END;
$$ LANGUAGE plpgsql;
```

### Convergence Confidence Boost

When momentum is detected, confidence bounds tighten proportionally:

```sql
-- Adjust confidence bounds based on momentum
adjusted_confidence_lower = base_lower + (momentum_strength * alignment_score * 5)
adjusted_confidence_upper = base_upper - (momentum_strength * alignment_score * 5)

-- Example:
-- Base prediction: 45% +/- 15 (range: 30-60)
-- Momentum: accelerating, strength 0.8, alignment 1.0
-- Adjusted: 45% +/- 11 (range: 34-56)
-- The system is MORE confident because everything points the same way
```

### Momentum Alerts

The Chief of Staff agent generates alerts when momentum changes direction or crosses thresholds:

```sql
-- Detect momentum shifts (new climbing or new declining)
SELECT
  p.entity_type,
  p.entity_id,
  p.entity_label,
  p.momentum_direction,
  p.momentum_strength,
  ph_prev.momentum_direction as previous_direction
FROM predictions p
JOIN LATERAL (
  SELECT momentum_direction
  FROM prediction_history
  WHERE entity_type = p.entity_type
    AND entity_id = p.entity_id
    AND horizon_days = p.horizon_days
    AND recorded_at < p.predicted_at - INTERVAL '6 days'
  ORDER BY recorded_at DESC
  LIMIT 1
) ph_prev ON TRUE
WHERE p.is_current = TRUE
  AND p.horizon_days = 90
  AND p.momentum_direction != ph_prev.momentum_direction
  AND p.momentum_direction IN ('accelerating', 'decelerating')
ORDER BY p.momentum_strength DESC;
```

## Recalculation Triggers

| Trigger Type | When Fires | Horizons Recalculated | Cascade? |
|---|---|---|---|
| `new_data` | Any field update on entity | All 4 | Yes -- recalculate linked entities |
| `time_decay` | Daily at 2:00 AM | All 4 | No |
| `market_regime` | Interest rate change >25bps, major employment report | 180, 365 | Yes -- all properties in affected submarket |
| `related_entity` | Linked contact/company changes | 90, 180 | No (prevents cascade loops) |
| `proxy_signal` | New proxy signal collected | Depends on signal category | No |
| `bounty_completed` | David fills a data bounty | All 4 | Yes |
| `interaction_logged` | New call/meeting/email | 30, 90 | No |
| `deal_stage_change` | Deal moves pipeline stages | 30, 90 | Yes -- all parties to the deal |
| `manual_override` | David adjusts a field or flag | All 4 | Yes |

### Cascade Depth Limit

To prevent infinite recalculation loops (Entity A triggers B which triggers A):

```sql
-- Maximum cascade depth: 2
-- Entity A changes -> recalculate B (depth 1) -> recalculate C (depth 2) -> STOP
INSERT INTO prediction_triggers (
  trigger_type, entity_type, entity_id,
  cascaded_from_entity_type, cascaded_from_entity_id,
  cascade_depth
) VALUES (
  'related_entity', target_type, target_id,
  source_type, source_id,
  source_cascade_depth + 1
);
-- Only process if cascade_depth <= 2
```

## Prediction Output: Complete Example

```json
{
  "entity_type": "property",
  "entity_id": "a1b2c3d4-...",
  "entity_label": "1234 Main St, Fontana -- 38,000 SF Industrial",
  "predictions": [
    {
      "horizon_days": 30,
      "probability": 12.5,
      "confidence_lower": 5.0,
      "confidence_upper": 20.0,
      "data_completeness": 0.45,
      "top_features": [
        {"feature": "no_active_listing", "value": true, "contribution": -8, "direction": "negative"},
        {"feature": "last_interaction_days", "value": 45, "contribution": -3, "direction": "negative"},
        {"feature": "submarket_activity", "value": "moderate", "contribution": 2, "direction": "positive"}
      ],
      "momentum": "stable"
    },
    {
      "horizon_days": 90,
      "probability": 34.0,
      "confidence_lower": 22.0,
      "confidence_upper": 46.0,
      "data_completeness": 0.55,
      "top_features": [
        {"feature": "lease_expiration_days", "value": 85, "contribution": 15, "direction": "positive"},
        {"feature": "tenant_growth_rate", "value": 0.25, "contribution": 8, "direction": "positive"},
        {"feature": "owner_entity_trust", "value": true, "contribution": 5, "direction": "positive"}
      ],
      "momentum": "climbing"
    },
    {
      "horizon_days": 180,
      "probability": 52.0,
      "confidence_lower": 37.0,
      "confidence_upper": 67.0,
      "data_completeness": 0.60,
      "top_features": [
        {"feature": "lease_expiration_days", "value": 85, "contribution": 18, "direction": "positive"},
        {"feature": "owner_age", "value": 72, "contribution": 10, "direction": "positive"},
        {"feature": "hold_period_years", "value": 18, "contribution": 8, "direction": "positive"},
        {"feature": "balloon_estimate_months", "value": 14, "contribution": 6, "direction": "positive"}
      ],
      "momentum": "accelerating"
    },
    {
      "horizon_days": 365,
      "probability": 61.0,
      "confidence_lower": 41.0,
      "confidence_upper": 81.0,
      "data_completeness": 0.65,
      "top_features": [
        {"feature": "owner_age_succession", "value": 72, "contribution": 12, "direction": "positive"},
        {"feature": "ie_population_growth", "value": 0.018, "contribution": 5, "direction": "positive"},
        {"feature": "industrial_demand_trend", "value": "expanding", "contribution": 7, "direction": "positive"},
        {"feature": "interest_rate_direction", "value": "declining", "contribution": 4, "direction": "positive"},
        {"feature": "hold_period_years", "value": 18, "contribution": 8, "direction": "positive"}
      ],
      "momentum": "accelerating"
    }
  ],
  "momentum_summary": {
    "direction": "accelerating",
    "strength": 0.78,
    "alignment": 0.88,
    "narrative": "All horizons climbing, velocity 15%/wk, 4 weeks consistent -- strong buy signal. Lease expiration + owner age + trust ownership converging. Recommend immediate outreach.",
    "commission_at_risk": 33440
  },
  "bounty_suggestion": {
    "missing_field": "lease_months_left (currently estimated from proxy)",
    "predicted_improvement": 13,
    "instructions": "Confirm lease expiration via CoStar or property manager call"
  }
}
```

## Model Calibration and Accuracy Tracking

### Brier Score by Horizon

```sql
-- Brier score: measures prediction accuracy (lower = better, 0 = perfect)
-- Score = (1/N) * SUM((probability/100 - outcome)^2)
CREATE OR REPLACE VIEW prediction_accuracy AS
SELECT
  horizon_days,
  model_version,
  COUNT(*) as predictions_evaluated,
  ROUND(
    AVG(POWER(probability / 100.0 - outcome_transaction::integer, 2)),
    4
  ) as brier_score,
  ROUND(AVG(probability), 2) as avg_predicted_probability,
  ROUND(
    COUNT(*) FILTER (WHERE outcome_transaction = TRUE)::numeric /
    NULLIF(COUNT(*), 0) * 100,
    2
  ) as actual_transaction_rate,
  -- Calibration: predicted vs actual in decile buckets
  ROUND(
    CORR(probability, outcome_transaction::integer * 100),
    3
  ) as calibration_correlation
FROM predictions
WHERE outcome_known = TRUE
GROUP BY horizon_days, model_version
ORDER BY horizon_days, model_version;
```

### Nightly Prediction Job (Chief of Staff Agent)

```
Schedule: 2:00 AM nightly

1. Expire old predictions (WHERE expires_at < NOW())
2. Recalculate all current predictions:
   a. For each property/contact/company with any TPE-relevant data:
      - Calculate 30/90/180/365-day probabilities
      - Determine confidence bounds from data_completeness
      - Rank top features by contribution
   b. Record to prediction_history
   c. Detect momentum changes
   d. Generate alerts for momentum shifts
3. Check outcome tracking:
   a. For expired predictions, check if transaction occurred
   b. Update outcome_known, outcome_transaction
   c. Recalculate Brier scores
4. Generate bounties for high-momentum, low-data entities
5. Update data_inventory fill rates (weekly, on Sundays)
```

---

## Implementation Sequence

| Phase | Components | Dependencies | Estimated Effort |
|---|---|---|---|
| **Phase 1** | `data_inventory` + `data_gap_registry` tables, fill rate audit function, Data Health Dashboard UI | None | 1 week |
| **Phase 2** | `proxy_signals` + `proxy_signal_values` tables, Scout agent proxy collection (LoopNet, Google Maps, BLS) | Phase 1 | 2 weeks |
| **Phase 3** | `predictions` + `prediction_history` + `prediction_triggers` tables, 90-day model (extends existing TPE) | Phases 1-2 | 2 weeks |
| **Phase 4** | `data_bounties` + `bounty_batches` tables, morning briefing generation, bounty UI | Phases 1-3 | 1.5 weeks |
| **Phase 5** | Multi-horizon models (30/180/365-day), momentum detection, convergence amplification | Phase 3 | 2 weeks |
| **Phase 6** | `proxy_reliability_tracking`, calibration feedback loops, Brier score tracking, bounty outcome tracking | Phases 2-5 | 1.5 weeks |
| **Phase 7** | Full integration: bounty <-> proxy <-> prediction feedback cycle, Chief of Staff nightly orchestration | All phases | 1 week |

**Total estimated effort: 11 weeks**

---

## Migration File Reference

All new tables in this document would be implemented as:
- `008_data_inventory.sql` -- data_inventory, data_gap_registry, audit function
- `009_proxy_signals.sql` -- proxy_signals, proxy_signal_values, proxy_reliability_tracking
- `010_predictions.sql` -- predictions, prediction_history, prediction_triggers
- `011_data_bounties.sql` -- data_bounties, bounty_batches, triggers, calibration view
