# TPE Living Database Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the TPE scoring engine into a living, time-aware system with temporal signal decay, multi-signal call reasons with clickable contacts, and data gap impact scoring.

**Architecture:** All new scoring logic lives in SQL VIEWs (no new tables, no cron). The existing `property_tpe_scores` VIEW is recreated with temporal decay + owner/tenant call reason split. Phase 2 adds a second VIEW (`property_data_gaps`) for gap impact scoring.

**Tech Stack:** PostgreSQL VIEWs, Node/Express API, React (Vite), Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-03-16-tpe-living-database-design.md`

---

## Chunk 1: Phase 1 — Temporal Lifecycle + Multi-Signal Call Reasons

### Task 1: Migration 015 — New Config Keys

**Files:**
- Create: `ie-crm/migrations/015_tpe_living_database.sql`

**Context:** The `tpe_config` table stores all scoring weights. We need 6 new keys for temporal decay rates. These must exist before the VIEW references them.

- [ ] **Step 1: Create migration file with config inserts**

```sql
-- Migration 015: TPE Living Database
-- Adds temporal decay config keys and recreates VIEW with:
--   - Post-expiry lease scoring (month-to-month signal)
--   - Loan maturity decay (12-month window)
--   - Distress event decay (12-month window with 50% mid-tier)
--   - Owner/tenant split call reasons with contact lookups
-- Safe to re-run: uses ON CONFLICT DO NOTHING

BEGIN;

-- ============================================================
-- SECTION 1: New config keys for temporal decay
-- ============================================================

INSERT INTO tpe_config (config_category, config_key, config_value, description)
VALUES
  ('lease', 'lease_expired_0_3mo_points', 8, 'Points for leases expired 0-3 months (month-to-month signal)'),
  ('lease', 'lease_expired_3_6mo_points', 4, 'Points for leases expired 3-6 months (stale, update status)')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO tpe_config (config_category, config_key, config_value, description)
VALUES
  ('maturity', 'maturity_past_0_3mo_points', 15, 'Points for loans matured 0-3 months ago (active pressure)'),
  ('maturity', 'maturity_past_3_6mo_points', 8, 'Points for loans matured 3-6 months ago (may have refid)'),
  ('maturity', 'maturity_past_6_12mo_points', 3, 'Points for loans matured 6-12 months ago (likely resolved)')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO tpe_config (config_category, config_key, config_value, description)
VALUES
  ('distress', 'distress_decay_6_12mo_pct', 50, 'Percentage of distress points retained at 6-12 months')
ON CONFLICT (config_key) DO NOTHING;
```

- [ ] **Step 2: Verify config keys inserted**

Run via node script against the database:
```bash
cd ie-crm && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"SELECT config_key, config_value FROM tpe_config WHERE config_key LIKE 'lease_expired%' OR config_key LIKE 'maturity_past%' OR config_key LIKE 'distress_decay%' ORDER BY config_key\")
  .then(r => { console.table(r.rows); pool.end(); });
"
```

Expected: 6 rows with the new keys and their default values.

- [ ] **Step 3: Commit**

```bash
git add ie-crm/migrations/015_tpe_living_database.sql
git commit -m "feat: add temporal decay config keys (migration 015 part 1)"
```

---

### Task 2: Migration 015 — Recreate VIEW with Temporal Decay

**Files:**
- Modify: `ie-crm/migrations/015_tpe_living_database.sql` (append to existing file)

**Context:** The VIEW must be dropped and recreated. The key changes are:
1. `lease_months` CTE: remove `> NOW()` guard to allow negative `months_to_exp`
2. `scores` CTE: add post-expiry lease CASE branches, maturity decay, distress decay
3. Add new config pivots for the 6 new keys
4. `best_distress` CTE: add `months_since_distress` column

- [ ] **Step 1: Add cfg pivot entries for new config keys**

Append to the `cfg` CTE's SELECT list in the VIEW (after the existing `dist_12mo` line):

```sql
    -- Temporal decay config
    MAX(CASE WHEN config_key = 'lease_expired_0_3mo_points' THEN config_value END) AS lease_exp_0_3,
    MAX(CASE WHEN config_key = 'lease_expired_3_6mo_points' THEN config_value END) AS lease_exp_3_6,
    MAX(CASE WHEN config_key = 'maturity_past_0_3mo_points' THEN config_value END) AS mat_past_0_3,
    MAX(CASE WHEN config_key = 'maturity_past_3_6mo_points' THEN config_value END) AS mat_past_3_6,
    MAX(CASE WHEN config_key = 'maturity_past_6_12mo_points' THEN config_value END) AS mat_past_6_12,
    MAX(CASE WHEN config_key = 'distress_decay_6_12mo_pct' THEN config_value END) AS dist_decay_pct,
```

- [ ] **Step 2: Rewrite `lease_months` CTE to allow negative months**

Replace the existing `lease_months` CTE:

```sql
lease_months AS (
  SELECT DISTINCT ON (pc.property_id)
    pc.property_id,
    co.lease_exp AS lease_expiration,
    CASE
      WHEN co.lease_exp IS NOT NULL
      THEN EXTRACT(EPOCH FROM (co.lease_exp::timestamp - NOW())) / 2629800.0
      ELSE NULL
    END AS months_to_exp
  FROM property_companies pc
  JOIN companies co ON co.company_id = pc.company_id
  WHERE co.lease_exp IS NOT NULL
  ORDER BY pc.property_id, co.lease_exp ASC
),
```

Key change: removed `AND co.lease_exp > NOW()` — now produces negative values for expired leases.

- [ ] **Step 3: Add `months_since_distress` to `best_distress` CTE**

```sql
best_distress AS (
  SELECT DISTINCT ON (property_id)
    property_id,
    distress_type,
    filing_date AS event_date,
    CASE
      WHEN filing_date IS NOT NULL AND filing_date < NOW()
      THEN EXTRACT(EPOCH FROM (NOW() - filing_date)) / 2629800.0
      ELSE 0
    END AS months_since_distress
  FROM property_distress
  ORDER BY property_id,
    CASE distress_type
      WHEN 'Auction' THEN 1
      WHEN 'NOD' THEN 2
      WHEN 'Matured' THEN 3
      ELSE 4
    END ASC
),
```

- [ ] **Step 4: Update lease_score CASE with post-expiry branches**

In the `scores` CTE, replace the lease_score calculation:

```sql
    -- Category 1: Lease Expiration (0-30, with post-expiry decay)
    CASE
      WHEN lm.months_to_exp IS NULL THEN 0
      WHEN lm.months_to_exp <= 12 AND lm.months_to_exp >= 0 THEN c.lease_12
      WHEN lm.months_to_exp <= 18 AND lm.months_to_exp > 0 THEN c.lease_18
      WHEN lm.months_to_exp <= 24 AND lm.months_to_exp > 0 THEN c.lease_24
      WHEN lm.months_to_exp <= 36 AND lm.months_to_exp > 0 THEN c.lease_36
      WHEN lm.months_to_exp < 0 AND lm.months_to_exp >= -3 THEN COALESCE(c.lease_exp_0_3, 8)
      WHEN lm.months_to_exp < -3 AND lm.months_to_exp >= -6 THEN COALESCE(c.lease_exp_3_6, 4)
      ELSE 0
    END AS lease_score,
```

Note: `>= 0` guard on the ≤12 branch prevents expired leases from matching the pre-expiry tiers. COALESCE provides fallback if config keys don't exist yet.

- [ ] **Step 5: Update maturity_boost with post-maturity decay**

Replace the maturity_boost calculation in `scores`:

```sql
    -- MODEL 4: Maturity Boost (with post-maturity decay)
    CASE
      WHEN bm.maturity_date IS NULL THEN 0
      -- Pre-maturity (existing logic)
      WHEN bm.maturity_date > NOW() AND bm.maturity_date <= NOW() + INTERVAL '30 days' THEN c.mat_30d
      WHEN bm.maturity_date > NOW() AND bm.maturity_date <= NOW() + INTERVAL '90 days' THEN c.mat_90d
      WHEN bm.maturity_date > NOW() THEN c.mat_over90d
      -- At maturity
      WHEN bm.maturity_date <= NOW() AND EXTRACT(EPOCH FROM (NOW() - bm.maturity_date)) / 2629800.0 <= 3 THEN COALESCE(c.mat_past_0_3, 15)
      -- Post-maturity decay
      WHEN EXTRACT(EPOCH FROM (NOW() - bm.maturity_date)) / 2629800.0 <= 6 THEN COALESCE(c.mat_past_3_6, 8)
      WHEN EXTRACT(EPOCH FROM (NOW() - bm.maturity_date)) / 2629800.0 <= 12 THEN COALESCE(c.mat_past_6_12, 3)
      ELSE 0
    END
    + COALESCE(CASE WHEN bm.ltv >= 85 THEN c.ltv_85 WHEN bm.ltv >= 75 THEN c.ltv_75 WHEN bm.ltv >= 65 THEN c.ltv_65 ELSE 0 END, 0)
    + COALESCE(CASE WHEN bm.loan_term_years <= 2.5 THEN c.dur_25 WHEN bm.loan_term_years <= 4 THEN c.dur_4 ELSE 0 END, 0)
    + COALESCE(CASE WHEN bm.loan_purpose = 'Acquisition' THEN c.purp_acq WHEN bm.loan_purpose = 'Construction' THEN c.purp_const ELSE 0 END, 0)
    AS maturity_boost,
```

- [ ] **Step 6: Update distress_score with decay multiplier**

Replace the distress_score in `scores`:

```sql
    -- MODEL 5: Distress Score (with temporal decay)
    CASE
      WHEN bdist.distress_type IS NULL THEN 0
      WHEN bdist.months_since_distress > 12 THEN 0
      ELSE
        ROUND(
          (CASE
            WHEN bdist.distress_type = 'Auction' THEN c.dist_auction
            WHEN bdist.distress_type = 'Matured' THEN c.dist_matured
            WHEN bdist.distress_type = 'NOD' THEN c.dist_nod
            ELSE
              CASE
                WHEN bdist.event_date <= NOW() + INTERVAL '1 month' THEN c.dist_1mo
                WHEN bdist.event_date <= NOW() + INTERVAL '3 months' THEN c.dist_3mo
                WHEN bdist.event_date <= NOW() + INTERVAL '6 months' THEN c.dist_6mo
                WHEN bdist.event_date <= NOW() + INTERVAL '9 months' THEN c.dist_9mo
                WHEN bdist.event_date <= NOW() + INTERVAL '12 months' THEN c.dist_12mo
                ELSE 0
              END
          END)
          * CASE
              WHEN bdist.months_since_distress > 6 THEN COALESCE(c.dist_decay_pct, 50) / 100.0
              ELSE 1
            END
        )
    END AS distress_score
```

- [ ] **Step 7: Apply migration to database**

```bash
cd ie-crm && node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync('migrations/015_tpe_living_database.sql', 'utf8');
pool.query(sql).then(() => { console.log('Migration 015 applied'); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });
"
```

- [ ] **Step 8: Verify temporal decay works**

```bash
cd ie-crm && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// Check if any properties have post-expiry lease scores
pool.query(\"SELECT COUNT(*) as count, MIN(months_to_exp) as min_months FROM property_tpe_scores WHERE months_to_exp < 0 AND lease_score > 0\")
  .then(r => { console.log('Post-expiry lease scores:', r.rows[0]); pool.end(); });
"
```

- [ ] **Step 9: Commit**

```bash
git add ie-crm/migrations/015_tpe_living_database.sql
git commit -m "feat: add temporal decay to lease, maturity, and distress scores"
```

---

### Task 3: Migration 015 — Owner/Tenant Contact CTEs + Split Call Reasons

**Files:**
- Modify: `ie-crm/migrations/015_tpe_living_database.sql` (the VIEW definition)

**Context:** Add two new CTEs (`owner_contact`, `tenant_company`) and replace the single `call_reason` with `owner_call_reason`, `tenant_call_reason`, and their associated columns. Keep `call_reason` as backward-compatible alias.

- [ ] **Step 1: Add `owner_contact` CTE**

Add after the `owner_age` CTE:

```sql
-- Owner contact info for call reason cards
owner_contact AS (
  SELECT DISTINCT ON (pc.property_id)
    pc.property_id,
    ct.contact_id AS owner_contact_id,
    ct.full_name AS owner_contact_name,
    ct.phone_1 AS owner_phone
  FROM property_contacts pc
  JOIN contacts ct ON ct.contact_id = pc.contact_id
  WHERE LOWER(pc.role) = 'owner'
  ORDER BY pc.property_id, ct.date_of_birth ASC NULLS LAST
),
```

- [ ] **Step 2: Add `tenant_company` CTE**

Add after the `owner_contact` CTE:

```sql
-- Tenant company info for call reason cards
tenant_company AS (
  SELECT DISTINCT ON (pco.property_id)
    pco.property_id,
    co.company_id AS tenant_company_id,
    co.company_name AS tenant_name
  FROM property_companies pco
  JOIN companies co ON co.company_id = pco.company_id
  ORDER BY pco.property_id, co.lease_exp DESC NULLS LAST
),
```

- [ ] **Step 3: Add LEFT JOINs to the `scores` SELECT**

In the `FROM` clause of the `scores` CTE, add:

```sql
  LEFT JOIN owner_contact oc ON oc.property_id = p.property_id
  LEFT JOIN tenant_company tc ON tc.property_id = p.property_id
```

And add these columns to the `scores` SELECT list:

```sql
    oc.owner_contact_id,
    oc.owner_contact_name,
    oc.owner_phone,
    tc.tenant_company_id,
    tc.tenant_name,
```

- [ ] **Step 4: Replace single `call_reason` with owner/tenant split in final SELECT**

Replace the existing `call_reason` CASE with:

```sql
  -- Owner call reason (owner-facing signals only)
  CASE
    WHEN s.distress_score >= 20 THEN 'DISTRESS: ' || COALESCE(s.distress_type, 'Unknown') || ' — immediate outreach recommended'
    WHEN s.maturity_boost >= 20 THEN 'LOAN MATURING: Confirmed maturity ' || TO_CHAR(s.maturity_date, 'Mon YYYY') || ' — refinance/sell pressure'
    WHEN s.age_score >= 15 THEN 'OWNER AGE: Est. ' || s.owner_age_years || ' years old — succession/estate planning likely'
    WHEN s.ownership_score >= 15 THEN 'LONG HOLD: ' || ROUND(s.hold_years::numeric, 0) || ' years — equity harvesting opportunity'
    WHEN s.stress_score >= 5 THEN 'DEBT STRESS: Balloon or lien activity — motivated seller signals'
    ELSE NULL
  END AS owner_call_reason,

  -- Owner signal points (sum of owner-facing signals)
  (s.maturity_boost + s.age_score + s.stress_score + s.distress_score
   + CASE WHEN s.ownership_score >= 15 THEN s.ownership_score ELSE 0 END)
  AS owner_signal_pts,

  s.owner_contact_id,
  s.owner_contact_name,
  s.owner_phone,

  -- Tenant call reason (tenant-facing signals only)
  CASE
    WHEN s.lease_score >= 22 AND s.months_to_exp >= 0 THEN 'LEASE EXPIRING: ' || TO_CHAR(s.lease_expiration, 'Mon YYYY') || ' — tenant decision window open'
    WHEN s.growth_score >= 10 THEN 'TENANT GROWTH: ' || s.growth_pct || '% headcount growth — expansion need likely'
    WHEN s.lease_score > 0 AND s.months_to_exp < 0 AND s.months_to_exp >= -3 THEN 'MONTH-TO-MONTH: Lease expired ' || TO_CHAR(s.lease_expiration, 'Mon YYYY') || ' — renegotiation window'
    WHEN s.lease_score > 0 AND s.months_to_exp < -3 THEN 'STALE LEASE: Expired ' || TO_CHAR(s.lease_expiration, 'Mon YYYY') || ' — update tenant status'
    ELSE NULL
  END AS tenant_call_reason,

  -- Tenant signal points
  (s.lease_score + s.growth_score) AS tenant_signal_pts,

  s.tenant_company_id,
  s.tenant_name,

  -- Backward-compatible call_reason (highest overall signal, same waterfall as before)
  CASE
    WHEN s.distress_score >= 20 THEN 'DISTRESS: ' || COALESCE(s.distress_type, 'Unknown') || ' — immediate outreach recommended'
    WHEN s.maturity_boost >= 20 THEN 'LOAN MATURING: Confirmed maturity ' || TO_CHAR(s.maturity_date, 'Mon YYYY') || ' — refinance/sell pressure'
    WHEN s.lease_score >= 22 THEN 'LEASE EXPIRING: ' || TO_CHAR(s.lease_expiration, 'Mon YYYY') || ' — tenant decision window open'
    WHEN s.age_score >= 15 THEN 'OWNER AGE: Est. ' || s.owner_age_years || ' years old — succession/estate planning likely'
    WHEN s.ownership_score >= 15 THEN 'LONG HOLD: ' || ROUND(s.hold_years::numeric, 0) || ' years — equity harvesting opportunity'
    WHEN s.growth_score >= 10 THEN 'TENANT GROWTH: ' || s.growth_pct || '% headcount growth — expansion need likely'
    WHEN s.stress_score >= 5 THEN 'DEBT STRESS: Balloon or lien activity — motivated seller signals'
    WHEN s.lease_score > 0 AND s.months_to_exp < 0 THEN 'MONTH-TO-MONTH: Lease expired — update tenant status'
    ELSE 'LOW PRIORITY: No strong transaction signals detected'
  END AS call_reason
```

- [ ] **Step 5: Apply migration and verify**

```bash
cd ie-crm && node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync('migrations/015_tpe_living_database.sql', 'utf8');
pool.query(sql).then(() => {
  return pool.query(\"SELECT address, owner_call_reason, owner_contact_name, tenant_call_reason, tenant_name FROM property_tpe_scores WHERE owner_call_reason IS NOT NULL AND tenant_call_reason IS NOT NULL ORDER BY blended_priority DESC LIMIT 5\");
}).then(r => { console.table(r.rows); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });
"
```

Expected: Properties with BOTH owner and tenant call reasons populated (e.g., loan maturing + lease expiring).

- [ ] **Step 6: Commit**

```bash
git add ie-crm/migrations/015_tpe_living_database.sql
git commit -m "feat: add owner/tenant split call reasons with contact lookups"
```

---

### Task 4: Update Server Reset Defaults

**Files:**
- Modify: `ie-crm/server/index.js:1031-1048` (the `defaults` object in tpe-config/reset handler)

**Context:** The reset endpoint must include the 6 new config keys so "Reset All to Defaults" doesn't leave them orphaned.

- [ ] **Step 1: Add new keys to reset defaults**

Add these entries to the `defaults` object in the `/api/ai/tpe-config/reset` handler (after the `tier_c_threshold: 30` line):

```javascript
      // Temporal decay defaults
      lease_expired_0_3mo_points: 8, lease_expired_3_6mo_points: 4,
      maturity_past_0_3mo_points: 15, maturity_past_3_6mo_points: 8, maturity_past_6_12mo_points: 3,
      distress_decay_6_12mo_pct: 50,
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/server/index.js
git commit -m "feat: add temporal decay keys to TPE config reset defaults"
```

---

### Task 5: Update TpeDetailPanel — Owner/Tenant Outreach Cards

**Files:**
- Modify: `ie-crm/src/components/tpe/TpeDetailPanel.jsx`

**Context:** Replace the single "Call Reason" box (lines 98-104) with two outreach cards: green for owner, blue for tenant. Each card shows the reason, signal points, and a clickable contact/company chip. Uses `useSlideOver` to open contact/company slide-overs.

- [ ] **Step 1: Replace the Call Reason section**

Replace the existing `{/* Call Reason */}` section (lines 98-104) with:

```jsx
        {/* Outreach Cards */}
        <div className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider text-crm-muted font-semibold">Outreach</h3>

          {/* Owner Card */}
          {p.owner_call_reason && (
            <div className="bg-crm-card border border-emerald-500/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">👤 Owner</span>
                <span className="text-[10px] text-emerald-400 font-bold">{Math.round(parseFloat(p.owner_signal_pts) || 0)} pts</span>
              </div>
              <div className="text-xs text-crm-text mb-2">{p.owner_call_reason}</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {p.owner_contact_id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(); openSlideOver('contact', p.owner_contact_id); }}
                    className="text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-full hover:bg-emerald-500/20 transition-colors"
                  >
                    🔗 {p.owner_contact_name || 'Owner'}
                  </button>
                ) : (
                  <span className="text-[11px] text-crm-muted italic">No owner contact linked</span>
                )}
                {p.owner_phone && (
                  <span className="text-[11px] text-crm-muted">{p.owner_phone}</span>
                )}
              </div>
            </div>
          )}

          {/* Tenant Card */}
          {p.tenant_call_reason && (
            <div className="bg-crm-card border border-blue-500/30 rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold">🏢 Tenant</span>
                <span className="text-[10px] text-blue-400 font-bold">{Math.round(parseFloat(p.tenant_signal_pts) || 0)} pts</span>
              </div>
              <div className="text-xs text-crm-text mb-2">{p.tenant_call_reason}</div>
              <div className="flex items-center gap-1.5">
                {p.tenant_company_id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(); openSlideOver('company', p.tenant_company_id); }}
                    className="text-[11px] bg-blue-500/10 border border-blue-500/30 text-blue-400 px-2.5 py-1 rounded-full hover:bg-blue-500/20 transition-colors"
                  >
                    🔗 {p.tenant_name || 'Tenant'}
                  </button>
                ) : (
                  <span className="text-[11px] text-crm-muted italic">No tenant company linked</span>
                )}
              </div>
            </div>
          )}

          {/* Fallback when no signals active */}
          {!p.owner_call_reason && !p.tenant_call_reason && (
            <div className="text-xs text-crm-muted italic py-2">No active outreach signals</div>
          )}
        </div>
```

- [ ] **Step 2: Build check**

```bash
cd ie-crm && npx vite build 2>&1 | tail -5
```

Expected: Build succeeds with 0 errors.

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/components/tpe/TpeDetailPanel.jsx
git commit -m "feat: replace single call reason with owner/tenant outreach cards"
```

---

### Task 6: Visual Verification — Phase 1

**Files:** None (verification only)

- [ ] **Step 1: Start dev servers**

Start both Vite and Express servers using the preview tools or launch.json.

- [ ] **Step 2: Navigate to TPE page and verify temporal decay**

Open a property that had an expired lease. The lease score should show a non-zero value (8 or 4) if it expired within the last 6 months, and the call reason should say "MONTH-TO-MONTH" or "STALE LEASE".

- [ ] **Step 3: Verify owner/tenant outreach cards**

Click a high-scoring property (e.g., 1980 Eastridge Ave). Verify:
- Owner card (green) shows with loan maturity reason and clickable owner name
- Tenant card (blue) shows with lease expiring reason and clickable company name
- Clicking the contact chip opens the contact slide-over
- Clicking the company chip opens the company slide-over

- [ ] **Step 4: Run tier distribution sanity check**

```bash
cd ie-crm && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(\"SELECT tpe_tier, COUNT(*) FROM property_tpe_scores GROUP BY tpe_tier ORDER BY tpe_tier\")
  .then(r => { console.table(r.rows); pool.end(); });
"
```

Expected: Distribution should be similar to v2 (A ~130-140, B ~200-210, C ~1150-1170, D ~8500+). Some movement is expected due to post-expiry scoring adding small points.

- [ ] **Step 5: Commit any fixes from verification**

If fixes were needed, commit them individually with descriptive messages.

---

## Chunk 2: Phase 2 — Data Gap Impact Scoring + Enrichment Dashboard

### Task 7: Migration 016 — `property_data_gaps` VIEW

**Files:**
- Create: `ie-crm/migrations/016_tpe_data_gaps.sql`

**Context:** This VIEW calculates which missing data would have the highest impact on each property's TPE score. It uses the same `cfg` CTE pattern as `property_tpe_scores`.

- [ ] **Step 1: Create the migration file**

```sql
-- Migration 016: TPE Data Gap Impact Scoring
-- Creates property_data_gaps VIEW for enrichment recommendations
-- Safe to re-run: uses DROP VIEW IF EXISTS

BEGIN;

DROP VIEW IF EXISTS property_data_gaps;

CREATE VIEW property_data_gaps AS
WITH cfg AS (
  SELECT
    MAX(CASE WHEN config_key = 'age_70_points' THEN config_value END) AS age_70,
    MAX(CASE WHEN config_key = 'growth_30pct_points' THEN config_value END) AS growth_30,
    MAX(CASE WHEN config_key = 'stress_cap' THEN config_value END) AS stress_cap,
    MAX(CASE WHEN config_key = 'ownership_cap' THEN config_value END) AS ownership_cap,
    MAX(CASE WHEN config_key = 'tier_a_threshold' THEN config_value END) AS tier_a,
    MAX(CASE WHEN config_key = 'tier_b_threshold' THEN config_value END) AS tier_b,
    MAX(CASE WHEN config_key = 'tier_c_threshold' THEN config_value END) AS tier_c
  FROM tpe_config
),
gaps AS (
  SELECT
    t.property_id, t.address, t.city, t.property_type, t.tpe_tier,
    t.blended_priority, t.owner_contact_name, t.tenant_name,
    t.age_score, t.growth_score, t.stress_score, t.ownership_score,
    t.owner_age_years, t.growth_pct,

    -- Per-model gap calculations
    CASE WHEN t.age_score = 0 AND t.owner_age_years IS NULL
      THEN c.age_70 ELSE 0 END AS age_gap_pts,
    CASE WHEN t.growth_score = 0 AND t.growth_pct IS NULL
      THEN c.growth_30 ELSE 0 END AS growth_gap_pts,
    CASE WHEN t.stress_score = 0 AND NOT EXISTS (
      SELECT 1 FROM debt_stress ds WHERE ds.property_id = t.property_id
    ) THEN c.stress_cap ELSE 0 END AS stress_gap_pts,
    CASE WHEN t.ownership_score < 10 AND t.owner_contact_name IS NULL
      THEN c.ownership_cap ELSE 0 END AS ownership_gap_pts,

    c.tier_a, c.tier_b, c.tier_c
  FROM property_tpe_scores t
  CROSS JOIN cfg c
)
SELECT
  g.property_id, g.address, g.city, g.property_type, g.tpe_tier,
  g.blended_priority, g.owner_contact_name, g.tenant_name,
  g.age_gap_pts, g.growth_gap_pts, g.stress_gap_pts, g.ownership_gap_pts,
  (g.age_gap_pts + g.growth_gap_pts + g.stress_gap_pts + g.ownership_gap_pts) AS total_gap_pts,
  CASE g.tpe_tier
    WHEN 'D' THEN g.tier_c - g.blended_priority
    WHEN 'C' THEN g.tier_b - g.blended_priority
    WHEN 'B' THEN g.tier_a - g.blended_priority
    ELSE 0
  END AS pts_to_next_tier,
  ROUND(
    (g.age_gap_pts + g.growth_gap_pts + g.stress_gap_pts + g.ownership_gap_pts)::numeric
    * (1.0 / GREATEST(
      CASE g.tpe_tier
        WHEN 'D' THEN g.tier_c - g.blended_priority
        WHEN 'C' THEN g.tier_b - g.blended_priority
        WHEN 'B' THEN g.tier_a - g.blended_priority
        ELSE 1
      END, 1)),
    2
  ) AS impact_priority
FROM gaps g
WHERE (g.age_gap_pts + g.growth_gap_pts + g.stress_gap_pts + g.ownership_gap_pts) > 0;

COMMENT ON VIEW property_data_gaps IS 'Per-property data gap analysis — shows which missing data would have the highest TPE score impact';

COMMIT;
```

- [ ] **Step 2: Apply migration and verify**

```bash
cd ie-crm && node -e "
const { Pool } = require('pg');
const fs = require('fs');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sql = fs.readFileSync('migrations/016_tpe_data_gaps.sql', 'utf8');
pool.query(sql).then(() => {
  return pool.query('SELECT tpe_tier, COUNT(*), ROUND(AVG(total_gap_pts)) AS avg_gap FROM property_data_gaps GROUP BY tpe_tier ORDER BY tpe_tier');
}).then(r => { console.table(r.rows); pool.end(); }).catch(e => { console.error(e.message); pool.end(); });
"
```

Expected: Rows grouped by tier showing average gap potential. Most properties should have gaps (especially age and growth).

- [ ] **Step 3: Verify top enrichment opportunities**

```bash
cd ie-crm && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT address, tpe_tier, blended_priority, total_gap_pts, pts_to_next_tier, impact_priority FROM property_data_gaps ORDER BY impact_priority DESC LIMIT 10')
  .then(r => { console.table(r.rows); pool.end(); });
"
```

Expected: B-tier properties near the A-tier threshold with missing DOB data should rank highest.

- [ ] **Step 4: Commit**

```bash
git add ie-crm/migrations/016_tpe_data_gaps.sql
git commit -m "feat: add property_data_gaps VIEW for enrichment impact scoring"
```

---

### Task 8: API Endpoint for Data Gaps

**Files:**
- Modify: `ie-crm/server/index.js` (add new route near the existing TPE routes)

- [ ] **Step 1: Add `/api/ai/tpe-gaps` endpoint**

Add after the existing `/api/ai/tpe` route (around line 985):

```javascript
// ============================================================
// TPE DATA GAPS — enrichment recommendations
// ============================================================
app.get('/api/ai/tpe-gaps', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const gap_type = req.query.gap_type;
    const typeFilter = {
      age: 'AND age_gap_pts > 0',
      growth: 'AND growth_gap_pts > 0',
      stress: 'AND stress_gap_pts > 0',
      ownership: 'AND ownership_gap_pts > 0',
    }[gap_type] || '';
    const result = await pool.query(
      `SELECT * FROM property_data_gaps
       WHERE total_gap_pts > 0 ${typeFilter}
       ORDER BY impact_priority DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('TPE gaps fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Aggregate gap stats for dashboard header
app.get('/api/ai/tpe-gaps/stats', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE age_gap_pts > 0) AS missing_owner_dob,
        COUNT(*) FILTER (WHERE growth_gap_pts > 0) AS missing_tenant_growth,
        COUNT(*) FILTER (WHERE stress_gap_pts > 0) AS missing_loan_data,
        COUNT(*) FILTER (WHERE ownership_gap_pts > 0) AS missing_owner_link,
        COUNT(*) AS total_with_gaps
      FROM property_data_gaps
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('TPE gap stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/server/index.js
git commit -m "feat: add /api/ai/tpe-gaps and /api/ai/tpe-gaps/stats endpoints"
```

---

### Task 9: TpeDetailPanel — Gap Hints Section

**Files:**
- Modify: `ie-crm/src/components/tpe/TpeDetailPanel.jsx`

**Context:** Add a "🔑 Unlock Points" section between Score Breakdown and Commission Estimate. This shows per-property data gaps sorted by potential impact. Data comes from the main TPE fetch (the VIEW columns are already in the property object from Phase 1's updated VIEW — but gap data comes from a separate VIEW, so we'll fetch it inline).

- [ ] **Step 1: Add gap data fetch**

Add a `useEffect` to fetch gap data for the selected property. Add at the top of the component (after the existing state declarations):

```jsx
  const [gapData, setGapData] = useState(null);
  useEffect(() => {
    if (!p?.property_id) return;
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    fetch(`${API_BASE}/api/ai/tpe-gaps?limit=1&property_id=${p.property_id}`)
      .catch(() => null);
    // Use inline calculation from existing property data instead
    const gaps = [];
    if ((parseFloat(p.age_score) || 0) === 0 && !p.owner_age_years)
      gaps.push({ label: 'Get owner date of birth', pts: 20, signal: 'Age Signal', color: 'amber' });
    if ((parseFloat(p.growth_score) || 0) === 0 && !p.growth_pct)
      gaps.push({ label: 'Get tenant headcount data', pts: 15, signal: 'Growth Signal', color: 'blue' });
    if ((parseFloat(p.stress_score) || 0) === 0 && !p.balloon_confidence && !p.has_lien_or_delinquency)
      gaps.push({ label: 'Research loan/debt data', pts: 15, signal: 'Stress Signal', color: 'red' });
    if ((parseFloat(p.ownership_score) || 0) < 10 && !p.owner_contact_name)
      gaps.push({ label: 'Link owner contact to property', pts: 30, signal: 'Ownership Signal', color: 'purple' });
    setGapData(gaps.length > 0 ? gaps : null);
  }, [p?.property_id]);
```

- [ ] **Step 2: Add gap hints UI section**

Add between the Score Breakdown `</div>` and the Commission Estimate `<div>`:

```jsx
        {/* Data Gap Hints */}
        {gapData && gapData.length > 0 && (
          <div className="bg-gradient-to-br from-crm-card to-crm-hover border border-amber-500/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-amber-400 font-semibold">
                🔑 Unlock Up To +{gapData.reduce((sum, g) => sum + g.pts, 0)} Points
              </span>
              <span className="text-[10px] text-crm-muted">
                {(() => {
                  const current = parseFloat(p.blended_priority) || 0;
                  const potential = current + gapData.reduce((sum, g) => sum + g.pts, 0);
                  if (potential >= 50) return 'Could reach A-tier';
                  if (potential >= 40) return 'Could reach B-tier';
                  if (potential >= 30) return 'Could reach C-tier';
                  return '';
                })()}
              </span>
            </div>
            <div className="space-y-1.5">
              {gapData.map((gap, i) => (
                <div key={i} className="flex items-center gap-2 py-1.5 border-b border-crm-border/50 last:border-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded bg-${gap.color}-500/10 text-${gap.color}-400 whitespace-nowrap`}>
                    +{gap.pts}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-crm-text truncate">{gap.label}</div>
                  </div>
                  <span className="text-[10px] text-crm-muted whitespace-nowrap">{gap.signal}</span>
                </div>
              ))}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Build check**

```bash
cd ie-crm && npx vite build 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add ie-crm/src/components/tpe/TpeDetailPanel.jsx
git commit -m "feat: add data gap hints to TPE detail panel"
```

---

### Task 10: Enrichment Dashboard Page

**Files:**
- Create: `ie-crm/src/pages/TPEEnrichment.jsx`
- Modify: `ie-crm/src/components/Sidebar.jsx`
- Modify: `ie-crm/src/App.jsx` (add route)

**Context:** New page showing aggregate gap stats + sorted enrichment table. Accessible via sidebar sub-item under TPE.

- [ ] **Step 1: Create the enrichment dashboard page**

Create `ie-crm/src/pages/TPEEnrichment.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import TierBadge from '../components/tpe/TierBadge';
import { useSlideOver } from '../components/shared/SlideOverContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const GAP_TYPES = [
  { key: null, label: 'All Gaps' },
  { key: 'age', label: 'Owner DOB' },
  { key: 'growth', label: 'Tenant Growth' },
  { key: 'stress', label: 'Loan Data' },
  { key: 'ownership', label: 'Owner Link' },
];

function StatCard({ label, count, color }) {
  return (
    <div className="bg-crm-card rounded-lg p-4 text-center">
      <div className={`text-2xl font-bold tabular-nums text-${color}-400`}>{count?.toLocaleString() || '—'}</div>
      <div className="text-[10px] text-crm-muted uppercase mt-1">{label}</div>
    </div>
  );
}

function projectedTier(current, gain) {
  const projected = (parseFloat(current) || 0) + (parseFloat(gain) || 0);
  if (projected >= 50) return 'A';
  if (projected >= 40) return 'B';
  if (projected >= 30) return 'C';
  return 'D';
}

export default function TPEEnrichment() {
  const { open: openSlideOver } = useSlideOver();
  const [stats, setStats] = useState(null);
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [gapFilter, setGapFilter] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, gapsRes] = await Promise.all([
        fetch(`${API_BASE}/api/ai/tpe-gaps/stats`),
        fetch(`${API_BASE}/api/ai/tpe-gaps?limit=200${gapFilter ? `&gap_type=${gapFilter}` : ''}`),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (gapsRes.ok) setGaps(await gapsRes.json());
    } catch (err) {
      console.error('Enrichment load error:', err);
    } finally {
      setLoading(false);
    }
  }, [gapFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-crm-border">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <span>🔑</span> Data Enrichment
          </h1>
          <p className="text-sm text-crm-muted mt-0.5">
            {stats ? `${stats.total_with_gaps?.toLocaleString()} properties with data gaps` : 'Loading...'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Missing Owner DOB" count={stats?.missing_owner_dob} color="amber" />
          <StatCard label="Missing Tenant Growth" count={stats?.missing_tenant_growth} color="blue" />
          <StatCard label="Missing Loan Data" count={stats?.missing_loan_data} color="red" />
          <StatCard label="Missing Owner Link" count={stats?.missing_owner_link} color="purple" />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-crm-border overflow-hidden">
            {GAP_TYPES.map((t) => (
              <button
                key={t.key || 'all'}
                onClick={() => setGapFilter(t.key)}
                className={`text-xs px-3 py-1.5 font-medium transition-colors ${gapFilter === t.key ? 'bg-crm-accent text-white' : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Enrichment Table */}
        <div className="bg-crm-card rounded-lg border border-crm-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase text-crm-muted tracking-wider border-b border-crm-border">
                <th className="text-left px-4 py-3">Property</th>
                <th className="text-left px-3 py-3">Current</th>
                <th className="text-left px-3 py-3">Missing Data</th>
                <th className="text-right px-3 py-3">Potential</th>
                <th className="text-center px-3 py-3">New Tier</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-8 text-crm-muted">Loading...</td></tr>
              ) : gaps.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-8 text-crm-muted">No data gaps found</td></tr>
              ) : (
                gaps.map((g) => {
                  const missingList = [];
                  if (g.age_gap_pts > 0) missingList.push('Owner DOB');
                  if (g.growth_gap_pts > 0) missingList.push('Tenant Growth');
                  if (g.stress_gap_pts > 0) missingList.push('Loan Data');
                  if (g.ownership_gap_pts > 0) missingList.push('Owner Link');
                  const newTier = projectedTier(g.blended_priority, g.total_gap_pts);
                  return (
                    <tr
                      key={g.property_id}
                      onClick={() => openSlideOver('property', g.property_id)}
                      className="border-b border-crm-border/50 hover:bg-crm-hover cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-2.5">
                        <div className="text-crm-text">{g.address}</div>
                        <div className="text-[10px] text-crm-muted">{g.city} · {g.property_type}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <TierBadge tier={g.tpe_tier} />
                          <span className="tabular-nums text-crm-muted">{Math.round(parseFloat(g.blended_priority) || 0)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          {missingList.map((m) => (
                            <span key={m} className="text-[10px] bg-amber-500/10 text-amber-400 px-1.5 py-0.5 rounded">{m}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="text-emerald-400 font-bold tabular-nums">+{Math.round(parseFloat(g.total_gap_pts) || 0)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {newTier !== g.tpe_tier ? (
                          <span className="text-[10px] font-medium">
                            <TierBadge tier={newTier} /> <span className="text-crm-muted">→</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-crm-muted">same</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add route in App.jsx**

Find the TPE route in `App.jsx` and add the enrichment route. Import the new page and add:

```jsx
import TPEEnrichment from './pages/TPEEnrichment';

// In the Routes section, add after the TPE route:
<Route path="/tpe-enrichment" element={<TPEEnrichment />} />
```

- [ ] **Step 3: Add sidebar navigation item**

In `Sidebar.jsx`, add after the TPE nav item:

```javascript
{ path: '/tpe-enrichment', label: '🔑', title: 'Data Enrichment', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
```

- [ ] **Step 4: Build check**

```bash
cd ie-crm && npx vite build 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add ie-crm/src/pages/TPEEnrichment.jsx ie-crm/src/App.jsx ie-crm/src/components/Sidebar.jsx
git commit -m "feat: add TPE enrichment dashboard page with gap stats and sorted table"
```

---

### Task 11: Visual Verification — Phase 2

**Files:** None (verification only)

- [ ] **Step 1: Restart dev servers**

Restart both Vite and Express to pick up server changes.

- [ ] **Step 2: Verify gap hints in detail panel**

Click a B-tier property. Verify:
- "🔑 Unlock Up To +XX Points" section appears between score bars and commission
- Shows specific actions ("Get owner date of birth")
- Shows projected tier if gaps were filled
- Properties with all data filled show NO gap section

- [ ] **Step 3: Navigate to enrichment dashboard**

Click the 🔑 icon in the sidebar. Verify:
- 4 stat cards show gap counts
- Filter pills work (All Gaps, Owner DOB, etc.)
- Table sorted by impact_priority (B-tier properties near A threshold first)
- Clicking a row opens the property slide-over

- [ ] **Step 4: Build check**

```bash
cd ie-crm && npx vite build 2>&1 | tail -5
```

Expected: Build succeeds with 0 errors.

- [ ] **Step 5: Commit any fixes**

If fixes were needed, commit them individually.
