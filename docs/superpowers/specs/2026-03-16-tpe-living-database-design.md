# TPE Living Database — Design Spec

**Date:** 2026-03-16
**Status:** Approved
**Branch:** feature/tpe-view

## Overview

Transform the TPE scoring engine from a static snapshot into a living, time-aware system that:
1. Decays scores as opportunities pass (temporal lifecycle)
2. Shows separate owner vs. tenant call reasons with clickable contacts
3. Identifies missing data that would have the highest impact on scores
4. Provides an enrichment dashboard for strategic data collection

## Architecture

All new logic lives in **SQL VIEWs** — no new tables, no cron jobs, no background workers. The existing `property_tpe_scores` VIEW already recalculates on every query using `NOW()`. Temporal decay, multi-signal reasons, and gap scoring all compute live.

Phase 2 adds one new VIEW (`property_data_gaps`) for the impact calculator, same pattern.

### Phase Breakdown

| Phase | Features | Complexity |
|-------|----------|------------|
| **Phase 1** | Temporal signal lifecycle + Multi-signal call reasons | Primarily SQL VIEW changes, minor UI updates |
| **Phase 2** | Data gap impact engine + Per-property hints + Enrichment dashboard | New VIEW, new API endpoint, new UI components |

---

## Phase 1: Temporal Signal Lifecycle

### Problem

Three time-sensitive signals currently have no post-expiration behavior:
- **Lease expiration**: Score drops to 0 after expiry. Misses month-to-month opportunity.
- **Loan maturity**: Maturity boost persists indefinitely. Stale after refi.
- **Distress events**: Distress score never decays. A 2-year-old NOD is treated as active.

### Design

Each signal follows: **Approaching → Peak → Expired → Decay/Transform → Gone**

#### Lease Expiration Decay

| Time Relative to Expiry | Points | Call Reason |
|--------------------------|--------|-------------|
| ≤12 months before | 30 (full) | LEASE EXPIRING: [date] — tenant decision window |
| ≤18 months before | 22 | LEASE EXPIRING: [date] — early planning |
| ≤24 months before | 15 | LEASE EXPIRING: [date] — long-range |
| ≤36 months before | 8 | LEASE EXPIRING: [date] — distant |
| 0-3 months PAST | 8 | MONTH-TO-MONTH: Lease expired, renegotiation window |
| 3-6 months PAST | 4 | STALE LEASE: Expired 3+ months, update tenant status |
| 6+ months PAST | 0 | Signal fully decayed |

**SQL change**: Add `WHEN months_to_exp < 0 AND months_to_exp >= -3` and `WHEN months_to_exp < -3 AND months_to_exp >= -6` branches to the lease_score CASE statement.

#### Loan Maturity Decay

| Time Relative to Maturity | Points | Call Reason |
|----------------------------|--------|-------------|
| Approaching (existing tiers) | 10-25 | LOAN MATURING: [date] — refi/sell pressure |
| 0-3 months PAST | 15 | LOAN MATURED: Recent maturity, refi/sale pressure likely active |
| 3-6 months PAST | 8 | MATURED LOAN: May have refi'd, verify status |
| 6-12 months PAST | 3 | STALE MATURITY: 6+ months, likely resolved |
| 12+ months PAST | 0 | Signal fully decayed |

**Rationale**: Loan maturity decays slower than lease because refinancing takes longer to close.

**SQL change**: Add post-maturity CASE branches to the maturity_boost calculation in the `scored` CTE. Compute `months_past_maturity` as `EXTRACT(EPOCH FROM (NOW() - maturity_date)) / 2629800.0` when maturity_date < NOW().

#### Distress Event Decay

| Time Since Event | Points | Call Reason |
|------------------|--------|-------------|
| 0-6 months | Full (25 auction, 20 NOD) | ACTIVE DISTRESS: [type] |
| 6-12 months | 50% of original | AGING DISTRESS: Verify if resolved |
| 12+ months | 0 | Fully decayed |

**SQL change**: Add `months_since_distress` calculation and apply 50% multiplier for 6-12mo, 0 for 12+mo.

#### New tpe_config Keys

```
lease_expired_0_3mo_points: 8
lease_expired_3_6mo_points: 4
maturity_past_0_3mo_points: 15
maturity_past_3_6mo_points: 8
maturity_past_6_12mo_points: 3
distress_decay_6_12mo_pct: 50
```

---

## Phase 1: Multi-Signal Call Reasons

### Problem

Current `call_reason` uses a waterfall CASE — picks the single highest signal, drops the rest. A property with both a maturing loan (owner signal) AND an expiring lease (tenant signal) only shows the loan maturity. The user misses the tenant outreach opportunity.

### Design

Replace single `call_reason` with **two separate call reason columns** mapped to contact types:

#### Signal-to-Contact Mapping

| Signal | Contact Type | Reasoning |
|--------|-------------|-----------|
| Loan Maturity / Balloon | **Owner** | Borrower faces refi/sale pressure |
| Owner Age | **Owner** | Succession/estate planning |
| Long Hold Period | **Owner** | Equity harvesting |
| Distress / NOD / Auction | **Owner** | Motivated seller |
| Debt Stress / Lien | **Owner** | Financial pressure |
| Owner-User Occupant | **Owner** | Both owner and occupant |
| Lease Expiration | **Tenant** | Tenant decision window |
| Tenant Growth | **Tenant** | Expansion need |
| Month-to-Month (new) | **Tenant** | Renegotiation opportunity |

#### New VIEW Columns

```sql
-- Owner outreach
owner_call_reason    TEXT    -- 'LOAN MATURING: Sep 2026 — refi pressure'
owner_signal_pts     INT    -- sum of owner-facing signal points
owner_contact_id     UUID   -- from property_contacts WHERE role = 'owner'
owner_name           TEXT   -- already exists

-- Tenant outreach
tenant_call_reason   TEXT   -- 'LEASE EXPIRING: Sep 2026 — decision window'
tenant_signal_pts    INT    -- sum of tenant-facing signal points
tenant_company_id    UUID   -- from property-company link
tenant_name          TEXT   -- company name

-- Backward compatibility
call_reason          TEXT   -- kept as alias (highest overall signal)
```

#### Owner Call Reason Generation

Waterfall within owner signals only:
1. distress_score >= 20 → "DISTRESS: [type]"
2. maturity_boost >= 20 → "LOAN MATURING: [date]"
3. age_score >= 15 → "OWNER AGE: Est. [age]"
4. ownership_score >= 15 → "LONG HOLD: [years] years"
5. stress_score >= 5 → "DEBT STRESS: Balloon or lien"
6. NULL if no owner signals active

#### Tenant Call Reason Generation

Waterfall within tenant signals only:
1. lease_score >= 22 → "LEASE EXPIRING: [date]"
2. growth_score >= 10 → "TENANT GROWTH: [pct]% growth"
3. lease_score > 0 AND months_to_exp < 0 → "MONTH-TO-MONTH: Renegotiation window"
4. NULL if no tenant signals active

#### UI Changes

In `TpeDetailPanel.jsx`, replace the single "Call Reason" box with **two outreach cards**:

- **Owner card** (green border): Shows `owner_call_reason`, `owner_signal_pts`, and a clickable contact chip (`owner_name` → opens contact slide-over via `owner_contact_id`). Phone number shown if available.
- **Tenant card** (blue border): Shows `tenant_call_reason`, `tenant_signal_pts`, and a clickable company chip (`tenant_name` → opens company slide-over via `tenant_company_id`).

Cards only render if their respective call reason is non-null.

#### Table Column Update

In the TPE table (`TPE.jsx`), the "CALL REASON" column shows the backward-compatible `call_reason` (highest signal). The detail panel shows the full split.

---

## Phase 2: Data Gap Impact Scoring

### Problem

Many properties score low not because they're bad opportunities, but because data is missing. There's no way to know which missing data would have the biggest impact on scores, or which properties are closest to jumping a tier if enriched.

### Design

#### New VIEW: `property_data_gaps`

For each property, check each scoring model: if the score is 0 (or below threshold) AND the underlying data is missing, that's a gap.

```sql
CREATE OR REPLACE VIEW property_data_gaps AS
SELECT
  t.property_id,
  t.address,
  t.tpe_tier,
  t.blended_priority,

  -- Age gap: score is 0 AND owner has no DOB and no static age
  CASE WHEN t.age_score = 0 AND t.owner_age_years IS NULL
    THEN cfg_age_70.config_value  -- max possible = 20
    ELSE 0
  END AS age_gap_pts,

  -- Growth gap: score is 0 AND company has no headcount
  CASE WHEN t.growth_score = 0 AND t.growth_pct IS NULL
    THEN cfg_growth_30.config_value  -- max possible = 15
    ELSE 0
  END AS growth_gap_pts,

  -- Stress gap: score is 0 AND no debt_stress row for this property
  CASE WHEN t.stress_score = 0 AND NOT EXISTS (
    SELECT 1 FROM debt_stress ds WHERE ds.property_id = t.property_id
  )
    THEN cfg_stress_cap.config_value  -- max possible = 15
    ELSE 0
  END AS stress_gap_pts,

  -- Ownership gap: score < threshold AND no owner linked
  CASE WHEN t.ownership_score < 10 AND t.owner_name IS NULL
    THEN cfg_own_cap.config_value  -- max possible = 30
    ELSE 0
  END AS ownership_gap_pts,

  -- Total potential gain
  (age_gap + growth_gap + stress_gap + ownership_gap) AS total_gap_pts,

  -- Next tier info
  CASE t.tpe_tier
    WHEN 'D' THEN cfg_tier_c.config_value - t.blended_priority
    WHEN 'C' THEN cfg_tier_b.config_value - t.blended_priority
    WHEN 'B' THEN cfg_tier_a.config_value - t.blended_priority
    ELSE 0
  END AS pts_to_next_tier,

  -- Impact priority = properties closest to tier jump with biggest gaps
  -- Higher = more actionable
  total_gap_pts * (1.0 / GREATEST(pts_to_next_tier, 1)) AS impact_priority

FROM property_tpe_scores t
CROSS JOIN ... (config lookups)
WHERE total_gap_pts > 0;
```

#### Per-Property Gap Hints (Detail Panel)

New section in `TpeDetailPanel.jsx` between Score Breakdown and Commission Estimate:

- Header: "🔑 Unlock Up To +[total_gap_pts] Points"
- Subtitle: "Could reach [projected_tier]-tier" (if gap fills would push past threshold)
- List of gap items, each showing:
  - Point value badge (+20, +15, etc.)
  - Action text ("Get owner date of birth")
  - Context ("if owner is 65+, this jumps to A-tier")
  - Signal category label
- Complete signals shown dimmed with ✓

Only renders if `total_gap_pts > 0`.

#### Enrichment Dashboard

New tab or view accessible from TPE page. Shows:

**Header stats**: Aggregate counts of missing data by type (Missing Owner DOB: 847, Missing Tenant Growth: 1,203, etc.)

**Sorted table**:
- Property address
- Current tier + score
- Missing data type(s)
- Potential point gain
- Projected new tier

**Sort formula**: `impact_priority` from the VIEW — properties closest to a tier jump with the biggest gaps surface first.

#### API Endpoint

```javascript
app.get('/api/ai/tpe-gaps', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
  const gap_type = req.query.gap_type; // optional filter: 'age', 'growth', 'stress', 'ownership'
  const result = await pool.query(
    `SELECT * FROM property_data_gaps
     WHERE ($1::text IS NULL OR gap_type = $1)
     ORDER BY impact_priority DESC
     LIMIT $2`,
    [gap_type || null, limit]
  );
  res.json(result.rows);
});
```

---

## Files to Modify

### Phase 1

| File | Change |
|------|--------|
| `migrations/015_tpe_living_database.sql` | New migration: temporal decay logic, multi-signal call reasons, new tpe_config keys, recreate VIEW |
| `server/index.js` | Update reset defaults with new config keys |
| `src/components/tpe/TpeDetailPanel.jsx` | Replace single call reason with owner/tenant outreach cards, clickable contact links |

### Phase 2

| File | Change |
|------|--------|
| `migrations/016_tpe_data_gaps.sql` | New VIEW `property_data_gaps`, gap impact calculations |
| `server/index.js` | Add `/api/ai/tpe-gaps` endpoint |
| `src/components/tpe/TpeDetailPanel.jsx` | Add "Unlock Points" gap hints section |
| `src/pages/TPEEnrichment.jsx` | New page: enrichment dashboard with stats + sorted table |
| `src/components/Sidebar.jsx` | Add enrichment sub-nav under TPE (or tab within TPE page) |

---

## Error Handling

- Owner/tenant contact lookups use LEFT JOINs — missing contacts result in NULL contact_id/name, cards still render with "No [owner/tenant] linked" message
- Temporal decay uses `COALESCE` with 0 defaults — missing dates never produce negative scores
- Gap VIEW uses `CASE WHEN ... AND ... THEN` guards — both conditions (low score AND missing data) must be true to register as a gap
- All new config keys have hardcoded fallback defaults in the VIEW

## Testing Strategy

- Verify temporal decay by checking properties with known past-expiry dates
- Verify multi-signal by finding properties with both lease_score > 0 AND maturity_boost > 0
- Verify gap scoring by finding properties with age_score = 0 and no owner DOB
- Count sanity checks against current tier distribution (A: 132, B: 202, C: 1158, D: 508 in top 2000)
