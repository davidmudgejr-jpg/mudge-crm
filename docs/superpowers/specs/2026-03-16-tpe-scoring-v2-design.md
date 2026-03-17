# TPE Scoring Engine v2 — Excel Parity + Weight Optimization

## Context

The TPE (Transaction Probability Engine) SQL VIEW (`property_tpe_scores`) was compared against the original Excel scoring model (`TPE_Master_List_v2_20_11.xlsx`). Three bugs were found, plus strategic weight optimizations based on signal analysis.

## Changes

### Fix 1: Tier Thresholds — Switch to 4-Tier v2.20 Model

**Problem:** SQL uses 70/40 (3 tiers: A/B/C). With current data coverage, no property can reach A-tier.

**Solution:** Switch to 4-tier system matching Excel v2.20:

| Blended Score | Tier | Label | Action |
|---|---|---|---|
| ≥50 | A | HIGH PRIORITY | Call this week |
| 40-49 | B | SOLID | Call this month |
| 30-39 | C | MODERATE | Call this quarter |
| <30 | D | NURTURE | Market updates only |

**Implementation:**
- Update `tpe_config`: `tier_a_threshold` → 50, `tier_b_threshold` → 40
- Add new config rows: `tier_c_threshold` → 30
- Update VIEW tier CASE to include D tier
- Update `DashboardStrip.jsx` to show 4 tier cards (A/B/C/D)
- Update `TierBadge.jsx` with D tier color (green/zinc)
- Update filter pills in `TPE.jsx` to include D

### Fix 2: Owner Age CTE — Case-Sensitive Role + Static Fallback

**Problem:** The `owner_age` CTE filters on `pc.role = 'Owner'` but the data uses lowercase `'owner'`. Result: 0 matches despite 5,975 owner links existing.

**Additionally:** `date_of_birth` is empty for all contacts, but 143 owner contacts have a static `age` field. The VIEW should fall back to `contacts.age` when `date_of_birth` is null — a stale "72" is infinitely better than 0.

**Solution:** Update `owner_age` CTE:
```sql
owner_age AS (
  SELECT DISTINCT ON (pc.property_id)
    pc.property_id,
    COALESCE(
      EXTRACT(YEAR FROM AGE(NOW(), ct.date_of_birth))::integer,
      ct.age::integer
    ) AS owner_age_years
  FROM property_contacts pc
  JOIN contacts ct ON ct.contact_id = pc.contact_id
  WHERE (ct.date_of_birth IS NOT NULL OR ct.age IS NOT NULL)
    AND LOWER(pc.role) = 'owner'
  ORDER BY pc.property_id, ct.date_of_birth ASC NULLS LAST, ct.age DESC NULLS LAST
)
```

### Fix 3: Blended Priority — Include Maturity Boost + Distress Score

**Problem:** Excel formula is `0.7 × MIN(TPE_score + maturity_score, 100) + 0.3 × ECV`. SQL only uses the base 5 TPE categories — maturity_boost and distress_score are computed but NOT added to blended priority.

**Solution:** Update blended_priority formula:
```sql
ROUND(
  LEAST(
    s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score
    + s.maturity_boost + s.distress_score,
    100
  ) * s.tpe_w
  + LEAST(
    GREATEST(s.sale_commission_est, s.lease_commission_est)
    * s.time_multiplier / NULLIF(s.comm_divisor, 0),
    100
  ) * s.ecv_w,
  1
) AS blended_priority
```

Also update `tpe_score` to include maturity + distress:
```sql
LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score
  + s.maturity_boost + s.distress_score, 100) AS tpe_score
```

And update the tier CASE expression to match.

### Weight Change 1: Ownership Profile — Bump Cap to 30, Increase Owner-User and Hold 20yr

**Rationale:** Owner-Users have the highest conversion rate — they need a broker, they have emotional + business attachment, and when they outgrow or retire, they sell. Long holders (20yr+) have massive embedded gains and 1031 motivation.

**Config changes:**
- `owner_user_bonus`: 7 → **10**
- `hold_15yr_points`: 10 → **12** (this is the 20yr+ bracket)
- `ownership_cap`: 25 → **30**

### Weight Change 2: Debt/Stress — Bump Cap to 15, Increase Balloon HIGH and Lien

**Rationale:** This is a data moat — 1,511 properties with debt data other brokers don't have. At 10 pts max, a HIGH balloon barely moves the needle. A property with HIGH balloon AND a lien is a seriously motivated seller.

**Config changes:**
- `balloon_high_points`: 10 → **12**
- `lien_points`: 5 → **7**
- `stress_cap`: 10 → **15**

### Score Bar Max Updates in TpeDetailPanel

Update the ScoreBar `max` props to reflect new caps:
- Ownership: max 25 → **30**
- Debt/Stress: max 10 → **15**
- Add Maturity Boost bar (new, max 35)
- Add Distress Score bar (new, max 25)

## Files Modified

1. `migrations/014_tpe_scoring_v2.sql` — New migration: UPDATE config values, DROP + CREATE VIEW with all fixes
2. `src/components/tpe/TierBadge.jsx` — Add D tier color
3. `src/components/tpe/DashboardStrip.jsx` — Add D tier card
4. `src/components/tpe/TpeDetailPanel.jsx` — Update ScoreBar maxes, add maturity/distress bars
5. `src/pages/TPE.jsx` — Add D filter pill, update tier filter logic
6. `src/components/tpe/QuickTuneDrawer.jsx` — Add C-tier threshold control

## Verification

After applying migration 014:
- Query `SELECT tpe_tier, COUNT(*) FROM property_tpe_scores GROUP BY tpe_tier` — should show A/B/C/D distribution
- Query `SELECT COUNT(*) FROM property_tpe_scores WHERE age_score > 0` — should be > 0 (from static age fallback)
- Query `SELECT COUNT(*) FROM property_tpe_scores WHERE maturity_boost > 0 AND blended_priority > 0` — maturity should boost blended score
- Visually verify 4-tier badges and dashboard strip in browser
