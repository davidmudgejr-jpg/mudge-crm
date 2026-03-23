# Smart Filters — Design Spec

**Date:** 2026-03-18
**Goal:** Upgrade the CRM filtering experience with inline column filters, relative date operators, pre-built smart views, and dark theme fixes across all entity pages.

---

## 1. Quick Column Filters (Airtable-style)

### Interaction
- Click a column header → small dropdown popover appears anchored below the header
- Popover content varies by column type (see below)
- Selecting/changing values applies the filter immediately (no Apply button)
- A funnel icon appears on filtered column headers
- Click the funnel icon to reopen the filter popover
- Click outside or press Escape to close

### Popover Content by Type

**Text columns:**
- Search input at top (typeahead)
- Scrollable list of top unique values as checkboxes (max 20, sorted by frequency)
- "Select All" / "Clear" links
- Checking multiple values = OR within that column

**Select columns (status, type, repping):**
- All known options as checkboxes (from `filterOptions` on column def)
- Same multi-select behavior

**Number columns (sf, rate, gross_fee):**
- Min and Max inputs side by side
- Filters to `value >= min AND value <= max`

**Date columns (close_date, created_at, lease_exp):**
- Preset buttons: Today, This Week, This Month, Last 30 Days, Last 90 Days, This Year
- Custom range: two date inputs (from / to)
- Presets use relative dates (see section 2)

**Boolean columns (priority_deal):**
- Three-state toggle: All / Yes / No

### Data Flow
- Quick column filters integrate with `useViewEngine` — they call `view.updateFilters()` with the combined filter array
- Multiple column filters combine with AND logic
- Quick filters and FilterBuilder filters coexist — opening FilterBuilder shows all active conditions including ones set via column headers

### Component
- New: `ColumnFilterPopover.jsx` in `src/components/shared/`
- Rendered by `CrmTable.jsx` when a column header is clicked
- Receives: column def, current filter value for that column, unique values (fetched or passed), onFilter callback
- Internal sub-components by type: `TextFilter`, `SelectFilter`, `NumberRangeFilter`, `DateFilter`, `BooleanFilter`

### Unique Values
- For text/select columns, unique values are derived from the current dataset (`rows` prop)
- No extra API call needed — compute from the data already loaded in the table
- Cache per column to avoid recalculation on every render

---

## 2. Relative Date Operators

### New Operators (added to FilterBuilder + filterCompiler)

| Operator | Label | Example |
|----------|-------|---------|
| `in_next_n_days` | in the next N days | lease_exp in next 90 days |
| `in_last_n_days` | in the last N days | created_at in last 30 days |
| `this_week` | this week | close_date this week |
| `this_month` | this month | created_at this month |
| `this_quarter` | this quarter | close_date this quarter |
| `this_year` | this year | created_at this year |
| `is_overdue` | is overdue (before today) | due_date is overdue |

### Implementation
- **Frontend (FilterBuilder):** Add to `OPERATORS_BY_TYPE.date` array
- **Frontend (ColumnFilterPopover):** Date preset buttons map to these operators
- **Backend (filterCompiler.js):** Resolve relative operators to concrete SQL at query time:
  - `in_next_n_days(90)` → `column >= CURRENT_DATE AND column <= CURRENT_DATE + INTERVAL '90 days'`
  - `this_week` → `column >= date_trunc('week', CURRENT_DATE) AND column < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'`
  - `is_overdue` → `column < CURRENT_DATE AND column IS NOT NULL`
- Relative dates resolve server-side so saved views auto-update

### Value Input for N-days operators
- When user selects `in_next_n_days` or `in_last_n_days`, the value input becomes a number field with "days" suffix label

---

## 3. Pre-built Smart Views

### Seed Views
On first load (when `listViews()` returns empty for an entity type), automatically create these views via the API:

**Deals:**
| View Name | Filters |
|-----------|---------|
| Active Pipeline | status equals "Active" |
| Stale Deals | status equals "Active" AND last_activity in_last_n_days > 30 (inverted: no activity) |
| Priority Deals | priority_deal equals true |
| Closing This Month | close_date this_month |

**Properties:**
| View Name | Filters |
|-----------|---------|
| Expiring Leases (90 days) | lease_exp in_next_n_days 90 |
| High TPE Score | tpe_total_score gte 70 |

**Contacts:**
| View Name | Filters |
|-----------|---------|
| No Activity (60+ days) | last_activity_date before (60 days ago) OR last_activity_date is_empty |

**Companies:**
| View Name | Filters |
|-----------|---------|
| Lease Expiring Soon | lease_exp in_next_n_days 90 |

**TPE (Living Database):**
| View Name | Filters |
|-----------|---------|
| Hot Prospects | tpe_total_score gte 80 |
| Lease Expiring (90 days) | lease_exp in_next_n_days 90 |
| Tier 1 Properties | tpe_tier equals "Tier 1" |
| Owner-Occupied Targets | owner_occupied equals true AND sf gte 10000 |

**TPE Enrichment:**
| View Name | Filters |
|-----------|---------|
| Most Data Gaps | data_completeness lte 50 |
| High Score + Low Data | tpe_total_score gte 60 AND data_completeness lte 60 |

### Implementation
- Seed logic lives in `useViewEngine.js` — after initial `listViews()` returns empty, call `createView()` for each seed view
- Only seeds once per entity type — tracked via localStorage flag `views_{entityType}_seeded`
- User can delete/rename/edit seed views like any other view

### "Stale Deals" Special Handling
- Requires knowing last interaction date per deal
- The `activity` column data comes from a join — we need a `last_activity_date` filter column
- If this column doesn't exist on deals, we add it as a computed/virtual column or skip the Stale Deals view for now

---

## 4. Dark Theme Fix for FilterBuilder

### Problem
Native `<select>` and `<option>` elements render with white/light backgrounds in many browsers, ignoring CSS dark mode. Text is hard to read.

### Fix
- Add `color-scheme: dark` to the FilterBuilder's select elements
- Style `<option>` elements with explicit dark backgrounds where browser supports it
- For maximum control: replace native `<select>` with a custom dropdown component for the column and value selectors (using the same popover pattern as ColumnFilterPopover)
- Minimum viable: add `[color-scheme:dark]` Tailwind class to all selects in FilterBuilder + ConditionRow

### Scope
- `FilterBuilder.jsx` — all select and input elements
- `ColumnFilterPopover.jsx` — new component, built dark from the start

---

## 5. Files to Create/Modify

### New Files
- `src/components/shared/ColumnFilterPopover.jsx` — inline column filter dropdown
- `src/components/shared/column-filters/TextFilter.jsx` — text column filter UI
- `src/components/shared/column-filters/SelectFilter.jsx` — select/enum filter UI
- `src/components/shared/column-filters/NumberRangeFilter.jsx` — min/max filter UI
- `src/components/shared/column-filters/DateFilter.jsx` — date presets + range UI
- `src/components/shared/column-filters/BooleanFilter.jsx` — yes/no/all toggle

### Modified Files
- `src/components/shared/CrmTable.jsx` — add column header click → open ColumnFilterPopover
- `src/components/shared/FilterBuilder.jsx` — add relative date operators, dark theme fix
- `src/utils/filterCompiler.js` — compile relative date operators to SQL
- `src/hooks/useViewEngine.js` — add seed view logic
- `src/pages/Deals.jsx` — pass additional props for column filter integration
- `src/pages/Properties.jsx` — same
- `src/pages/Contacts.jsx` — same
- `src/pages/Companies.jsx` — same
- `src/pages/Interactions.jsx` — same
- `src/pages/Campaigns.jsx` — same
- `server/index.js` — update filterCompiler SQL generation for relative dates

---

## 6. Implementation Order

1. **Dark theme fix** — quick win, improves current experience immediately
2. **Relative date operators** — backend + FilterBuilder changes
3. **ColumnFilterPopover** — new component, wire into CrmTable headers
4. **Pre-built smart views** — seed logic in useViewEngine
5. **Polish** — funnel icons, clear-all, keyboard nav

---

## 7. Out of Scope (Phase 2)

- Nested AND/OR groups (compound filter trees)
- Drag-and-drop view reordering in ViewBar
- Filter by linked records (e.g., "deals where contact.type = Owner")
- Saved filter templates (separate from views)
