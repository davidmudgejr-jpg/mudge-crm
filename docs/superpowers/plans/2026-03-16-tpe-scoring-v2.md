# TPE Scoring Engine v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 scoring bugs and apply 2 weight optimizations to match Excel TPE model + strategic improvements

**Architecture:** Single SQL migration (014) recreates the VIEW with fixes. Config updates via UPDATE statements. UI components updated for 4-tier system.

**Tech Stack:** PostgreSQL VIEW, React components (JSX), Express endpoint defaults

**Spec:** `docs/superpowers/specs/2026-03-16-tpe-scoring-v2-design.md`

**Worktree:** `.worktrees/tpe-view` on branch `feature/tpe-view`

---

## Chunk 1: SQL Migration + Server Defaults

### Task 1: Create migration 014 — TPE scoring v2

**Files:**
- Create: `ie-crm/migrations/014_tpe_scoring_v2.sql`

This migration does 3 things:
1. Updates config values (new weights + new tier_c_threshold row)
2. Drops and recreates `property_tpe_scores` VIEW with all 3 fixes
3. Cleans dirty balloon_confidence data

- [ ] **Step 1: Write the migration file**

The migration must contain:

**Section 1 — Config updates:**
```sql
BEGIN;

-- New config row for C-tier threshold
INSERT INTO tpe_config (config_category, config_key, config_value, description)
VALUES ('blended', 'tier_c_threshold', 30, 'Blended priority score threshold for Tier C classification')
ON CONFLICT (config_key) DO NOTHING;

-- Update tier thresholds to v2.20 4-tier model
UPDATE tpe_config SET config_value = 50 WHERE config_key = 'tier_a_threshold';
UPDATE tpe_config SET config_value = 40 WHERE config_key = 'tier_b_threshold';

-- Weight optimizations
UPDATE tpe_config SET config_value = 10 WHERE config_key = 'owner_user_bonus';    -- was 7
UPDATE tpe_config SET config_value = 12 WHERE config_key = 'hold_15yr_points';    -- was 10
UPDATE tpe_config SET config_value = 30 WHERE config_key = 'ownership_cap';       -- was 25
UPDATE tpe_config SET config_value = 12 WHERE config_key = 'balloon_high_points'; -- was 10
UPDATE tpe_config SET config_value = 7  WHERE config_key = 'lien_points';         -- was 5
UPDATE tpe_config SET config_value = 15 WHERE config_key = 'stress_cap';          -- was 10

-- Clean dirty balloon data (Excel import artifacts with Unicode PUA chars)
UPDATE debt_stress SET balloon_confidence = 'HIGH' WHERE balloon_confidence LIKE '%HIGH%' AND balloon_confidence != 'HIGH';
UPDATE debt_stress SET balloon_confidence = 'MEDIUM' WHERE balloon_confidence LIKE '%MEDIUM%' AND balloon_confidence != 'MEDIUM';
UPDATE debt_stress SET balloon_confidence = 'LOW' WHERE balloon_confidence LIKE '%LOW%' AND balloon_confidence != 'LOW';
```

**Section 2 — Recreate VIEW:**

Copy migration 013 VIEW verbatim with these changes:

1. **cfg CTE:** Add `tier_c` pivot:
```sql
MAX(CASE WHEN config_key = 'tier_c_threshold' THEN config_value END) AS tier_c,
```

2. **owner_age CTE:** Fix case sensitivity + add static age fallback:
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
),
```

3. **tpe_score:** Include maturity_boost + distress_score:
```sql
LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score
  + s.maturity_boost + s.distress_score, 100) AS tpe_score,
```

4. **blended_priority:** Include maturity_boost + distress_score:
```sql
ROUND(
  LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score
    + s.maturity_boost + s.distress_score, 100) * s.tpe_w
  + LEAST(
    GREATEST(s.sale_commission_est, s.lease_commission_est)
    * s.time_multiplier / NULLIF(s.comm_divisor, 0),
    100
  ) * s.ecv_w,
  1
) AS blended_priority,
```

5. **tpe_tier:** 4-tier system with D:
```sql
CASE
  WHEN <blended_expr> >= cfg.tier_a THEN 'A'
  WHEN <blended_expr> >= cfg.tier_b THEN 'B'
  WHEN <blended_expr> >= cfg.tier_c THEN 'C'
  ELSE 'D'
END AS tpe_tier,
```

Where `<blended_expr>` is the same expression used in blended_priority (with maturity+distress included).

6. **ownership_score comment:** Update from `(0-25)` to `(0-30)`.

7. **stress_score comment:** Update from `(0-10)` to `(0-15)`.

End with:
```sql
COMMENT ON VIEW property_tpe_scores IS 'TPE v2 — 5-model scoring + maturity/distress boost, 4-tier classification, dynamic weights from tpe_config.';
COMMIT;
```

- [ ] **Step 2: Apply migration to database**

The migration needs to be run against the live Neon database. Use the Express `/api/db/query` endpoint to execute the SQL, or run via the server's pool. Since the migration is a large multi-statement block, it may need to be run in sections.

Alternatively, apply via the Express server startup migration runner if one exists.

- [ ] **Step 3: Verify scoring changes via API**

Query through `/api/db/query`:
```sql
SELECT tpe_tier, COUNT(*) FROM property_tpe_scores GROUP BY tpe_tier ORDER BY tpe_tier;
-- Expected: A, B, C, D tiers with non-zero counts

SELECT COUNT(*) FROM property_tpe_scores WHERE age_score > 0;
-- Expected: > 0 (from static age fallback — 143 owner contacts have age)

SELECT COUNT(*) FROM property_tpe_scores WHERE stress_score > 0;
-- Expected: ~985 (balloon data now scoring)

SELECT address, blended_priority, maturity_boost, distress_score, tpe_tier
FROM property_tpe_scores WHERE maturity_boost > 0 OR distress_score > 0
ORDER BY blended_priority DESC LIMIT 5;
-- Expected: maturity/distress boost visible in blended scores
```

- [ ] **Step 4: Commit migration**

```bash
cd .worktrees/tpe-view && git add ie-crm/migrations/014_tpe_scoring_v2.sql
git commit -m "feat: TPE scoring v2 — 4-tier model, weight optimizations, maturity/distress in blend"
```

### Task 2: Update server reset defaults

**Files:**
- Modify: `.worktrees/tpe-view/ie-crm/server/index.js` (lines 1031-1048, the reset endpoint defaults)

- [ ] **Step 1: Update the defaults object in the reset endpoint**

Change these values in the `defaults` object at `POST /api/ai/tpe-config/reset`:
```javascript
const defaults = {
  // ... existing keys unchanged except:
  entity_individual_points: 8, entity_trust_points: 10,
  hold_15yr_points: 12,   // was 10
  hold_10yr_points: 7, hold_7yr_points: 4,
  owner_user_bonus: 10,   // was 7
  ownership_cap: 30,      // was 25
  balloon_high_points: 12, // was 10
  balloon_medium_points: 7, balloon_low_points: 4,
  lien_points: 7,         // was 5
  stress_cap: 15,         // was 10
  tier_a_threshold: 50,   // was 70
  tier_b_threshold: 40,   // unchanged
  tier_c_threshold: 30,   // NEW
  // ... rest unchanged
};
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/server/index.js
git commit -m "feat: update TPE config reset defaults for v2 weights and 4-tier thresholds"
```

---

## Chunk 2: UI Updates for 4-Tier System

### Task 3: Update TierBadge for D tier

**Files:**
- Modify: `.worktrees/tpe-view/ie-crm/src/components/tpe/TierBadge.jsx`

- [ ] **Step 1: Add D tier style**

Add to `TIER_STYLES`:
```javascript
const TIER_STYLES = {
  A: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  B: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  C: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  D: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};
```

Note: C changes from zinc to orange (moderate = orange), D gets zinc (low priority = gray).

### Task 4: Update DashboardStrip for 4 tiers

**Files:**
- Modify: `.worktrees/tpe-view/ie-crm/src/components/tpe/DashboardStrip.jsx`

- [ ] **Step 1: Update tier counting and display**

Changes needed:
1. Line 22: `const tiers = { A: 0, B: 0, C: 0, D: 0 };`
2. Line 42: `const total = tiers.A + tiers.B + tiers.C + tiers.D;`
3. Lines 52 and 71: Change `['A', 'B', 'C']` to `['A', 'B', 'C', 'D']`
4. Line 74: Add D color entry:
```javascript
{ tier: 'A', color: 'text-emerald-400' },
{ tier: 'B', color: 'text-yellow-400' },
{ tier: 'C', color: 'text-orange-400' },
{ tier: 'D', color: 'text-zinc-400' },
```
5. Lines 92-94: Add D bar segment:
```jsx
<div className="bg-emerald-500 transition-all" style={{ width: `${(tiers.A / total) * 100}%` }} />
<div className="bg-yellow-500 transition-all" style={{ width: `${(tiers.B / total) * 100}%` }} />
<div className="bg-orange-500 transition-all" style={{ width: `${(tiers.C / total) * 100}%` }} />
<div className="bg-zinc-500 transition-all" style={{ width: `${(tiers.D / total) * 100}%` }} />
```

### Task 5: Update TPE page filter pills for 4 tiers

**Files:**
- Modify: `.worktrees/tpe-view/ie-crm/src/pages/TPE.jsx`

- [ ] **Step 1: Add D to filter buttons**

Line 232: Change `{[null, 'A', 'B', 'C'].map((t) => (` to:
```javascript
{[null, 'A', 'B', 'C', 'D'].map((t) => (
```

### Task 6: Update TpeDetailPanel score bars for new maxes

**Files:**
- Modify: `.worktrees/tpe-view/ie-crm/src/components/tpe/TpeDetailPanel.jsx`

- [ ] **Step 1: Update ScoreBar max values and add maturity/distress bars**

1. Change ownership max from 25 to 30:
```jsx
<ScoreBar label="Ownership Profile" score={parseFloat(p.ownership_score) || 0} max={30} color="purple" annotation={annotations.ownership} />
```

2. Change stress max from 10 to 15:
```jsx
<ScoreBar label="Debt/Stress" score={parseFloat(p.stress_score) || 0} max={15} color="red" annotation={annotations.stress} />
```

3. Add maturity boost and distress score bars after the existing 5 (inside the Score Breakdown section):
```jsx
{(parseFloat(p.maturity_boost) > 0 || parseFloat(p.distress_score) > 0) && (
  <>
    <ScoreBar label="Maturity Boost" score={parseFloat(p.maturity_boost) || 0} max={35} color="blue" annotation={p.maturity_date ? `Matures ${formatDateCompact(p.maturity_date)}` : 'No maturity data'} />
    <ScoreBar label="Distress Signal" score={parseFloat(p.distress_score) || 0} max={25} color="red" annotation={p.distress_type || 'No distress signals'} />
  </>
)}
```

### Task 7: Update QuickTuneDrawer with C-tier threshold

**Files:**
- Modify: `.worktrees/tpe-view/ie-crm/src/components/tpe/QuickTuneDrawer.jsx`

- [ ] **Step 1: Add C-Tier Threshold control**

After the B-Tier Threshold NumberControl (around line 195), add:
```jsx
{/* 3b. C-Tier Threshold */}
<NumberControl
  label="C-Tier Threshold"
  description="Minimum blended score for C classification"
  value={config.tier_c_threshold || 30}
  configKey="tier_c_threshold"
  onSave={handleSave}
/>
```

- [ ] **Step 2: Commit all UI changes**

```bash
git add ie-crm/src/components/tpe/TierBadge.jsx ie-crm/src/components/tpe/DashboardStrip.jsx \
       ie-crm/src/pages/TPE.jsx ie-crm/src/components/tpe/TpeDetailPanel.jsx \
       ie-crm/src/components/tpe/QuickTuneDrawer.jsx
git commit -m "feat: update TPE UI for 4-tier system with new weight maxes"
```

---

## Chunk 3: Verification

### Task 8: Visual verification

- [ ] **Step 1: Restart Express server** (to pick up new migration results)
- [ ] **Step 2: Reload TPE page and verify:**
  - Dashboard shows 4 tier cards (A/B/C/D) with non-zero counts for A
  - Filter pills show All/A/B/C/D
  - Distribution bar has 4 colors (green/yellow/orange/gray)
  - Score bars show correct maxes (Ownership/30, Stress/15)
  - Clicking a row shows maturity/distress bars when applicable
  - Tune Weights drawer has C-tier threshold control
- [ ] **Step 3: Build check**
  ```bash
  cd .worktrees/tpe-view/ie-crm && npx vite build
  ```
  Expected: 0 errors
