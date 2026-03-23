# TPE View — Design Spec

## Goal

Build a dedicated Transaction Probability Engine page that serves as a daily prospecting call list with portfolio-level dashboard stats, score-driven property ranking, a pre-call briefing panel, and quick-tune weight adjustment.

## Architecture

The TPE View is a new page in the existing React SPA, following established patterns (CrmTable, SlideOver, hooks). It reads from the existing `property_tpe_scores` SQL VIEW via the `/api/ai/tpe` endpoint. Dashboard stats are computed client-side from the fetched dataset. Weight tuning writes to the `tpe_config` table and triggers a data refetch.

## Tech Stack

- React page component + CrmTable (existing)
- `property_tpe_scores` VIEW (existing, one migration needed for dynamic tier thresholds)
- `/api/ai/tpe` endpoint (existing, may need minor extensions)
- `tpe_config` table (existing) for weight persistence
- SlideOver pattern (existing) for detail panel and quick-tune drawer
- localStorage for dashboard collapse state and column visibility

---

## Page Structure

### Navigation

New sidebar tab **"TPE"** between Deals and Interactions. Lightning bolt icon (⚡) to distinguish from other tabs. Route: `#/tpe`.

### Layout (top to bottom)

1. **Header row** — Title ("Transaction Probability Engine") + record count + tier filter button group (All / A / B / C) + search input + column toggle menu + quick-tune button (⚙️)
2. **Dashboard strip** — Collapsible horizontal stats bar (~80px expanded, ~32px collapsed)
3. **Prospecting table** — Full-width CrmTable
4. **TPE Detail SlideOver** — Opens on row click (right-side slide-in)
5. **Quick-Tune Drawer** — Opens from ⚙️ button (right-side slide-in, same SlideOver pattern)

---

## Dashboard Strip

### Expanded State (~80px)

Three regions in a horizontal flex row:

**Left — Tier Cards (clickable):**
- **A** card: green badge, count of A-tier properties
- **B** card: yellow badge, count of B-tier properties
- **C** card: gray badge, count of C-tier properties
- Clicking a tier card activates that tier filter (same as header filter buttons)

**Center — Tier Distribution Bar:**
- Single horizontal stacked bar showing A/B/C proportion
- Green → Yellow → Gray segments
- Provides instant visual sense of portfolio health

**Right — Key Metrics:**
- **Avg Blended Score** — single number, the portfolio average
- **Est. Pipeline Value** — sum of ECV dollar estimates for all visible (filtered) properties, formatted as compact currency ($1.2M)

### Collapsed State (~32px)

Tier filter buttons + pipeline value in a single compact row. Chevron toggle to expand.

### Persistence

Collapse/expand state saved to localStorage key `crm_tpe_dashboard_collapsed`.

### Data Source

All stats computed client-side from the fetched `property_tpe_scores` result array. Recomputes when tier filter changes. No additional API endpoint needed.

---

## Prospecting Table

### Default Visible Columns (11)

| # | Key | Label | Width | Notes |
|---|-----|-------|-------|-------|
| 1 | `rank` | # | 45px | Computed client-side from sort position. Not a DB column. |
| 2 | `address` | Address | 200px | Primary identifier. Not inline-editable. |
| 3 | `city` | City | 100px | |
| 4 | `property_type` | Type | 100px | |
| 5 | `tpe_tier` | Tier | 60px | Rendered as colored badge: green A, yellow B, muted gray C. |
| 6 | `blended_priority` | Score | 80px | Number + mini horizontal progress bar. Green >70, yellow 40-70, gray <40. |
| 7 | `call_reason` | Call Reason | 280px | Plain-English justification from VIEW. Widest column. |
| 8 | `est_commission` | Est. Commission | 110px | Computed client-side as `GREATEST(sale_commission_est, lease_commission_est) * time_multiplier`. Formatted as compact currency ($24K, $180K). |
| 9 | `lease_expiration` | Lease Exp. | 100px | Date format. |
| 10 | `owner_name` | Owner | 140px | |
| 11 | `owner_call_status` | Call Status | 110px | Inline-editable dropdown: Contacted, No Answer, Left VM, Not Interested, Scheduled, Follow Up. |

### Hidden but Togglable Columns

- TPE sub-scores: `lease_score`, `ownership_score`, `age_score`, `growth_score`, `stress_score`
- `maturity_boost`, `distress_score`, `distress_type`
- `rba` (building size), `year_built`, `costar_star_rating`
- `maturity_date`, `tenant_call_status`
- `owner_entity_type`, `owner_user_or_investor`
- `tpe_score` (raw, before blending), `ecv_score` (0-100 scaled)

### Sorting

Default: `blended_priority DESC` (hottest first). All column headers clickable to toggle sort.

### Filtering

- **Tier filter** (header button group): filters client-side by `tpe_tier` value
- **Search input**: filters client-side across `address`, `city`, `owner_name`, and `call_reason`
- **Column visibility**: standard ColumnToggleMenu

### Call Status Inline Edit

The `owner_call_status` column is editable directly in the table via dropdown. Saves to the `properties` table via `updateProperty(id, { owner_call_status: value })` from `database.js` (same pattern as `Properties.jsx` inline cell editing). No modal or detail panel needed for this common action.

### Call Status Options

`owner_call_status` is a single-select TEXT column (migration 006), separate from the `contacted` multi-select column used in Properties.jsx. TPE-specific options optimized for prospecting workflow:

Not Called, Called — No Answer, Called — Left VM, Called — Contacted, Scheduled Follow-up, Not Interested, Do Not Call.

---

## TPE Detail SlideOver

Opens on row click. Pre-call briefing panel — everything needed before dialing.

### Layout (top to bottom)

**Header:**
- Address (large) + City
- Property Type label
- Tier badge (colored) + Blended Score (large number)

**Score Breakdown — 5 Horizontal Bars:**

Each bar shows:
- Category label (left)
- Colored progress bar (proportional to max points)
- Score as fraction (right, e.g., "22/30")
- Data annotation below the bar explaining the score (e.g., "Expires Mar 2027", "Trust, held 14yr")

| Category | Max | Color |
|----------|-----|-------|
| Lease Expiration | 30 | Blue |
| Ownership Profile | 25 | Purple |
| Owner Age | 20 | Amber |
| Tenant Growth | 15 | Green |
| Debt/Stress | 10 | Red |

**Commission Estimate:**
- Two columns: `sale_commission_est` (Sale) vs. `lease_commission_est` (Lease)
- `time_multiplier` displayed as a badge (e.g., "×1.20")
- Final ECV dollar value = `GREATEST(sale_commission_est, lease_commission_est) * time_multiplier`, displayed prominently

**Call Reason:**
- The VIEW-generated plain-English justification, displayed prominently in a highlighted card

**Quick Info Grid:**
- Owner Name
- RBA (building size)
- Year Built
- CoStar Rating (star display)

**Action Row (bottom, sticky):**
- "View Full Property →" button — opens standard PropertyDetail SlideOver
- Call Status dropdown — same inline edit as table
- "Log Interaction" button — opens NewInteractionModal with property pre-linked

---

## Quick-Tune Drawer

Opens from ⚙️ button in header. Uses SlideOver pattern (right-side slide-in).

### Tunable Parameters (6 key levers)

| # | Config Key | Control | Default | Description |
|---|-----------|---------|---------|-------------|
| 1 | `tpe_weight` + `ecv_weight` | Slider (0-100) | 70/30 | TPE vs ECV blend ratio. Single slider, values are complementary. |
| 2 | A-Tier threshold | Number input | 70 | Minimum blended_priority for A classification |
| 3 | B-Tier threshold | Number input | 40 | Minimum blended_priority for B classification |
| 4 | `lease_12mo_points` | Slider (0-30) | 30 | Weight for leases expiring within 12 months |
| 5 | `time_mult_6mo` | Slider (0.5-2.0, step 0.05) | 1.20 | Time multiplier boost for near-term opportunities |
| 6 | `commission_divisor` | Number input | 250000 | ECV scaling divisor (lower = more generous scoring) |

### Behavior

- Changes save to `tpe_config` table via PATCH API on blur/slider release
- After save, the table refetches from `/api/ai/tpe` and dashboard stats recompute
- "Reset to Defaults" button at bottom restores original seed values
- All other config keys (~40+) remain editable via Claude chat or future Settings page

### Tier Threshold Migration

The A/B tier thresholds are currently hardcoded in the `property_tpe_scores` VIEW SQL (`WHEN blended >= 70 THEN 'A'`). Migration `013_tpe_dynamic_tiers.sql` will:
1. Insert `tier_a_threshold` (default 70) and `tier_b_threshold` (default 40) into `tpe_config`
2. Re-create the VIEW to read thresholds from `tpe_config` via a CTE instead of hardcoded values

This is scoped as part of this feature build.

---

## API Changes

### Existing Endpoints (no changes needed)

- `GET /api/ai/tpe` — returns all scored properties, supports `?tier=A|B|C&limit=500`
- `GET /api/ai/tpe/:propertyId` — returns single property scores

### New/Modified Endpoints

1. **`GET /api/ai/tpe`** — TPE page passes `?limit=500` explicitly. Server default (50) and max (500) remain unchanged to avoid affecting other consumers.

2. **`PATCH /api/ai/tpe-config`** — update one or more tpe_config values
   - Body: `{ "config_key": "tpe_weight", "config_value": 75 }` (or array of updates)
   - Validates key exists in tpe_config before updating
   - Returns updated config

3. **`GET /api/ai/tpe-config`** — fetch current config values (for quick-tune drawer initial state)

4. **`POST /api/ai/tpe-config/reset`** — reset all config values to seed defaults

### Properties Table Update

`owner_call_status` column already exists on `properties` table (migration 006). Inline edits use `updateProperty(id, fields)` from `database.js`. No schema change needed.

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/pages/TPE.jsx` | Page component: header, dashboard strip, CrmTable, filter state |
| `src/components/tpe/DashboardStrip.jsx` | Collapsible stats bar with tier cards, distribution bar, metrics |
| `src/components/tpe/TpeDetailPanel.jsx` | SlideOver content: score breakdown bars, commission, call reason, actions |
| `src/components/tpe/QuickTuneDrawer.jsx` | SlideOver content: 6 tunable sliders/inputs, reset button |
| `src/components/tpe/ScoreBar.jsx` | Reusable horizontal score bar component (category label, progress, fraction, annotation) |
| `src/components/tpe/TierBadge.jsx` | Reusable A/B/C colored badge component |

### Modified Files

| File | Change |
|------|--------|
| `src/App.jsx` | Add TPE route |
| `src/components/Sidebar.jsx` | Add TPE nav item with lightning bolt icon |
| `server/index.js` | Add `GET /api/ai/tpe-config`, `PATCH /api/ai/tpe-config`, `POST /api/ai/tpe-config/reset` endpoints |
| `src/api/database.js` | Add `getTpeConfig()`, `updateTpeConfig()`, `resetTpeConfig()` functions |

### Migration (if tier thresholds need to be dynamic)

| File | Change |
|------|--------|
| `migrations/013_tpe_dynamic_tiers.sql` | Add `tier_a_threshold` and `tier_b_threshold` to `tpe_config`, update VIEW to read from config |

---

## Loading, Empty, and Error States

**Loading:** Skeleton shimmer on dashboard strip (3 placeholder cards + bar) and CrmTable rows (standard `animate-shimmer` pattern). Shows while `/api/ai/tpe?limit=500` is in flight.

**Empty — no scored properties:** Full-page empty state: "No TPE scores yet. Import property data to start scoring." with a link to the Import page. Dashboard strip shows zeroes.

**Empty — filter yields no results:** Table empty state: "No {tier}-tier properties found" or "No properties match '{search}'". Dashboard stats update to reflect the empty filtered set (0 count, $0 pipeline).

**Error — API failure:** Toast notification with retry button. Table shows last successful data if available, or empty state with error message.

**Quick-Tune save error:** Inline error message next to the failed input. Value reverts to previous. Does not block other inputs.

---

## Design Decisions & Rationale

1. **Client-side filtering over server-side** — The full scored dataset is ~500 rows. Filtering/searching in JS is instant and avoids extra API round-trips. Tier filter and search both operate on the already-fetched array.

2. **Horizontal score bars over radar chart** — Bars map directly to max points per category (22/30 is immediately readable). Radar charts look cool but are harder to compare and don't convey the different scales (30 vs 10 max).

3. **6 quick-tune levers, not 40+** — These 6 parameters have the most impact on scoring. Full config editing is a rare power-user action better served by Claude chat or a dedicated Settings page.

4. **Call Status editable in table** — This is the one field you update constantly during a prospecting session. Opening a detail panel just to change "No Answer" to "Left VM" would kill your flow.

5. **TPE detail panel before full property detail** — The TPE view's job is prospecting. The detail panel shows pre-call intel (scores, reasons, commission). Full property detail (linked records, activity history, notes) is one click away but doesn't clutter the prospecting flow.

6. **Dashboard strip collapsible** — Glance at stats in the morning, collapse for the rest of the day. The table is the daily driver and deserves maximum screen space.
