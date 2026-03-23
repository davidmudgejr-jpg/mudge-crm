# Custom Saved Views — Design Spec

## Goal

Add Airtable-style saved views to all entity tabs (Properties, Contacts, Companies, Deals, Interactions, Campaigns). Each view saves filters, sort order, and column visibility/order. Views persist in PostgreSQL with localStorage caching for instant load.

## Decisions

- **Scope:** All entity tabs, not just Properties
- **Filter power:** Rich filters with compound AND/OR logic
- **View state:** Full lens — filters + sort + column visibility/order
- **Storage:** PostgreSQL primary, localStorage write-through cache
- **Architecture:** Generic View Engine (one reusable hook + shared components)

---

## 1. Data Model

### `saved_views` table

```sql
CREATE TABLE saved_views (
  view_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type     TEXT NOT NULL,
  view_name       TEXT NOT NULL,
  filters         JSONB NOT NULL DEFAULT '[]',
  filter_logic    TEXT NOT NULL DEFAULT 'AND',
  sort_column     TEXT,
  sort_direction  TEXT DEFAULT 'DESC',
  visible_columns JSONB,
  is_default      BOOLEAN DEFAULT FALSE,
  position        INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saved_views_entity ON saved_views (entity_type, position);
CREATE UNIQUE INDEX idx_saved_views_one_default_per_entity
  ON saved_views (entity_type) WHERE is_default = TRUE;
```

**Constraints:**
- `entity_type` is one of: `properties`, `contacts`, `companies`, `deals`, `interactions`, `campaigns`
- `filter_logic` is `AND` or `OR`
- `sort_direction` is `ASC` or `DESC`
- Only one `is_default = TRUE` per `entity_type` (enforced at DB level via partial unique index + application logic clears old default before setting new one)

### Filter condition format

**Simple case (all AND):**
```json
[
  { "column": "property_type", "operator": "equals", "value": "Industrial" },
  { "column": "rba", "operator": "between", "value": [10000, 50000] },
  { "column": "city", "operator": "equals", "value": "Riverside" }
]
```

**Compound case (AND + OR groups):**
```json
{
  "logic": "AND",
  "conditions": [
    { "column": "city", "operator": "equals", "value": "Riverside" },
    {
      "logic": "OR",
      "conditions": [
        { "column": "property_type", "operator": "equals", "value": "Industrial" },
        { "column": "property_type", "operator": "equals", "value": "Office" }
      ]
    }
  ]
}
```

**Canonical parsing rules:**
- If `filters` is an **array**, all conditions are AND'd. The `filter_logic` column is ignored (redundant — it's always AND for flat arrays).
- If `filters` is an **object** with `logic` + `conditions`, compound groups are used. The object's `logic` key determines top-level logic; `filter_logic` column is ignored (redundant).
- If `filters` is `null`, empty array `[]`, or malformed (not array/object), `filterCompiler` returns `{ whereClause: '', params: [] }` — no filtering applied.
- Max nesting depth: 2 (top-level AND/OR containing one level of sub-groups). Deeper nesting is flattened to the max depth.

Note: `filter_logic` column exists for quick reads without parsing the JSONB (e.g., showing "AND" or "OR" in the ViewBar UI). It is always kept in sync on save but is never the source of truth for compilation.

### Supported operators by column type

| Column Type | Operators |
|------------|-----------|
| `text` | equals, not_equals, contains, not_contains, is_empty, is_not_empty |
| `number` | equals, not_equals, gt, gte, lt, lte, between |
| `date` | equals, before, after, between, is_empty, is_not_empty |
| `select` | equals, not_equals, in |

---

## 2. UI Components

### ViewBar (tab strip)

Sits between the page header and table. Horizontal scrollable tabs:

- **"All [Entity]"** tab — always first, pinned, unremovable. No saved filters; shows all records.
- **Saved view tabs** — ordered by `position`. Click to switch. Right-click context menu: Rename, Duplicate, Set as Default, Delete.
- **"+ New View" button** — dashed border, at the end. Opens the filter builder to create a new view.
- **Drag-to-reorder** — view tabs are draggable. Position updates saved to DB.
- **Dirty indicator** — when a saved view's filters are modified but not yet saved, a dot appears on the tab.

### FilterBar (pill strip)

Below the ViewBar when active filters exist:

- **Filter pills** — each active condition shown as a removable chip (e.g., "Type = Industrial ✕").
- **"+ Add Filter" link** — opens the filter builder.
- **Record count** — right-aligned, shows "Showing N of M".
- Hidden when no filters are active (the "All" view).

### FilterBuilder (modal)

Opens when creating a new view or editing filters:

- **AND/OR toggle** — top-level logic switch.
- **Condition rows** — each row has: Column dropdown → Operator dropdown → Value input. Value input adapts to column type (text input, number input, date picker, select dropdown, dual inputs for "between").
- **"+ Add condition"** — adds another row at the current logic level.
- **"+ Add OR group"** — nests a group with its own internal logic. Visual indent + border to show grouping.
- **Column dropdown** — only shows columns with `filterable: true` in their definition.
- **Operator dropdown** — filtered by the selected column's type.
- **Apply / Cancel** buttons.

### Save flow

1. User modifies filters on "All" → FilterBar shows changes → "Save as View" button appears → user names it → saved as new tab.
2. User modifies filters on a saved view → dirty dot appears → auto-saves on debounce (800ms) or user can click "Save" explicitly.

---

## 3. Component Architecture

### New files

| File | Purpose |
|------|---------|
| `src/hooks/useViewEngine.js` | Core hook — view lifecycle, state, CRUD, filter-to-fetch integration |
| `src/components/shared/ViewBar.jsx` | Tab strip component |
| `src/components/shared/FilterBar.jsx` | Active filter pills |
| `src/components/shared/FilterBuilder.jsx` | Modal filter editor |
| `src/utils/filterCompiler.js` | Converts filter conditions → `{ whereClause, params }` |
| `src/api/views.js` | API client for view CRUD via HTTP (same pattern as TPE config endpoints) |
| `migrations/017_saved_views.sql` | Creates `saved_views` table |

### `useViewEngine(entityType, columnDefs)` hook

**Input:** Entity type string + array of column definitions (enriched with `type` and `filterable`).

**Returns:**
```js
{
  // View state
  views,              // all saved views for this entity
  activeView,         // currently selected view (or null for "All")
  isDirty,            // whether filters differ from saved view

  // Filter state
  filters,            // current filter conditions array
  filterLogic,        // 'AND' or 'OR'
  sqlFilters,         // compiled { whereClause, params } ready for DB query

  // Sort state
  sort: { column, direction },
  handleSort,         // toggle sort on column click

  // Column state
  visibleColumns,     // filtered + ordered column defs for CrmTable

  // Actions
  applyView,          // switch to a saved view by ID
  updateFilters,      // set new filter conditions (marks dirty)
  saveView,           // save current state as new or update existing
  renameView,         // rename a view
  deleteView,         // delete a view
  duplicateView,      // duplicate a view
  reorderViews,       // update position ordering
  setDefault,         // mark a view as default for this entity
  resetToAll,         // clear filters, show all records
}
```

**Lifecycle:**
1. On mount: read `localStorage['views_{entityType}']` for instant state → fire `GET /api/views?entity_type=X` → reconcile + update localStorage.
2. On view switch: update filters/sort/columns state → page re-fetches data.
3. On save: `POST` or `PATCH` to server → update localStorage on success.
4. On delete: `DELETE` to server → remove from localStorage → switch to "All".

### Column metadata enrichment

Each page's existing column definitions get `type` and `filterable` fields:

```js
{ key: 'property_address', label: 'Address', type: 'text', filterable: true }
{ key: 'property_type', label: 'Type', type: 'select', filterable: true,
  filterOptions: ['Industrial', 'Office', 'Retail', 'Multifamily', 'Land', 'Special Purpose'] }
{ key: 'rba', label: 'Bldg SF', type: 'number', filterable: true }
{ key: 'lease_exp', label: 'Lease Exp', type: 'date', filterable: true }
{ key: 'priority', label: 'Priority', type: 'select', filterable: true,
  filterOptions: ['Hot', 'Warm', 'Cold', 'Dead'] }
```

Columns without `type` or with `filterable: false` don't appear in the FilterBuilder.

### Page integration pattern

Each page adds ~5-10 lines. Example for Properties:

```jsx
const view = useViewEngine('properties', COLUMNS);

// In fetchData:
const rows = await queryWithFilters('properties', {
  ...view.sqlFilters,
  orderBy: view.sort.column,
  order: view.sort.direction,
  limit: 500,
});

// In render:
<ViewBar {...view} />
<FilterBar {...view} />
<CrmTable columns={view.visibleColumns} ... />
```

---

## 4. SQL Generation & Security

### `filterCompiler.js`

Converts filter conditions + column definitions into safe parameterized SQL.

**Operator map** (hardcoded, no user-provided SQL):
```js
const OPERATOR_SQL = {
  equals:       (col, i) => ({ sql: `${col} = $${i}`, count: 1 }),
  not_equals:   (col, i) => ({ sql: `${col} != $${i}`, count: 1 }),
  contains:     (col, i) => ({ sql: `${col} ILIKE $${i}`, count: 1, transform: v => `%${v}%` }),
  not_contains: (col, i) => ({ sql: `${col} NOT ILIKE $${i}`, count: 1, transform: v => `%${v}%` }),
  gt:           (col, i) => ({ sql: `${col} > $${i}`, count: 1 }),
  gte:          (col, i) => ({ sql: `${col} >= $${i}`, count: 1 }),
  lt:           (col, i) => ({ sql: `${col} < $${i}`, count: 1 }),
  lte:          (col, i) => ({ sql: `${col} <= $${i}`, count: 1 }),
  between:      (col, i) => ({ sql: `${col} BETWEEN $${i} AND $${i+1}`, count: 2 }),
  is_empty:     (col)    => ({ sql: `${col} IS NULL`, count: 0 }),
  is_not_empty: (col)    => ({ sql: `${col} IS NOT NULL`, count: 0 }),
  in:           (col, i) => ({ sql: `${col} = ANY($${i})`, count: 1 }),
};
```

**Security layers:**

1. **Column whitelist** — `filterCompiler` accepts column definitions as input and only allows column names present in that array. This is the compiler's own whitelist — it does NOT call `sanitizeCol()` (which has a different signature and purpose). Unknown column names are silently skipped.
2. **Operator whitelist** — only keys in `OPERATOR_SQL` are accepted. Unknown operators are skipped.
3. **Parameterized values** — all user values go through `$N` positional parameters. Zero string interpolation.
4. **Max nesting depth** — hard limit of 2 levels. Deeper nesting is flattened.
5. **Table whitelist** — `queryWithFilters` validates the `table` argument against a hardcoded whitelist (`VALID_TABLES = ['properties', 'contacts', 'companies', 'deals', 'interactions', 'campaigns']`). Invalid table names throw an error. This prevents SQL injection through the table name.

**Output:**
```js
compileFilters(conditions, columnDefs)
// → { whereClause: 'WHERE property_type = $1 AND rba BETWEEN $2 AND $3', params: ['Industrial', 10000, 50000] }
// → { whereClause: '', params: [] }  // when no filters
```

### `queryWithFilters()` in database.js

New generic query function that accepts compiled filters:

```js
const VALID_TABLES = ['properties', 'contacts', 'companies', 'deals', 'interactions', 'campaigns'];

export async function queryWithFilters(table, { whereClause, params, orderBy, order, limit = 200, offset = 0 }) {
  if (!VALID_TABLES.includes(table)) throw new Error(`Invalid table: ${table}`);
  const safeOrder = sanitizeCol(orderBy, table);
  const safeDir = sanitizeDir(order);
  const n = params.length;
  const sql = `SELECT * FROM ${table} ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${n+1} OFFSET $${n+2}`;
  return query(sql, [...params, limit, offset]);
}
```

Existing per-entity functions (`getProperties`, `getContacts`, etc.) remain for backward compatibility and for the search bar which doesn't go through the view engine.

---

## 5. Server API Endpoints

View CRUD uses dedicated HTTP endpoints on the Express server (`server/index.js`), following the same pattern as the existing TPE config endpoints (`/api/ai/tpe-config`). This is consistent with the dual-mode architecture: the `bridge.js` adapter routes general DB queries through IPC (Electron) or `/api/db/query` (web), while feature-specific endpoints like views and TPE config are direct REST routes on the Express server. The `src/api/views.js` client calls these endpoints directly via `fetch()`.

### Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/views?entity_type=X` | List views for entity type, ordered by position |
| `POST` | `/api/views` | Create new view |
| `PATCH` | `/api/views/:viewId` | Update view (partial) |
| `DELETE` | `/api/views/:viewId` | Delete view |

All endpoints include `if (!pool)` guard returning 503. No authentication/authorization layer — this is a single-user desktop app. If multi-user support is added in the future, a `user_id` column and per-request auth checks would be needed.

### POST /api/views — create

**Request body:**
```json
{
  "entity_type": "properties",
  "view_name": "Industrial 10-50K Riverside",
  "filters": [...],
  "filter_logic": "AND",
  "sort_column": "rba",
  "sort_direction": "DESC",
  "visible_columns": ["property_address", "city", "rba", "owner_name"],
  "position": 2
}
```

**Response:** The created view object with `view_id` and timestamps.

### PATCH /api/views/:viewId — update

Accepts any subset of updatable fields. Sets `updated_at = NOW()`.

When `is_default` is set to `true`, the endpoint runs both operations in a single PostgreSQL transaction:
```sql
BEGIN;
UPDATE saved_views SET is_default = FALSE WHERE entity_type = $1 AND view_id != $2;
UPDATE saved_views SET is_default = TRUE, updated_at = NOW() WHERE view_id = $2;
COMMIT;
```
This prevents a crash between the two UPDATEs from leaving zero or multiple defaults.

### DELETE /api/views/:viewId

Returns `{ deleted: true }`. If the deleted view was default, no view becomes default (falls back to "All").

---

## 6. localStorage Cache Strategy

**Key format:** `views_{entityType}` (e.g., `views_properties`)

**Value:** JSON array of view objects (same shape as DB rows).

**Write-through pattern:**
1. On hook mount → read localStorage for instant paint → fire GET to DB → overwrite localStorage with DB response.
2. On create/update/delete → write to DB first → on success, update localStorage.
3. No conflict resolution — single-user desktop app.

**Active view preference:** `views_{entityType}_active` stores the `view_id` of the last-selected view (or `null` for "All"). On mount, the hook auto-applies this view.

---

## 7. Entity Column Definitions

Each page needs its columns enriched with `type` and `filterable`. Key filterable columns per entity:

### Properties
- property_address (text), city (text), property_type (select), building_class (select), rba (number), year_built (number), priority (select), owner_name (text), lease_exp (date), sale_price (number)

### Contacts
- first_name (text), last_name (text), email (text), phone (text), company_name (text), title (text), contact_type (select), priority (select)

### Companies
- company_name (text), city (text), industry (text), company_type (select), employee_count (number), lease_exp (date)

### Deals
- deal_name (text), deal_type (select), deal_stage (select), expected_close (date), deal_value (number), priority (select)

### Interactions
- interaction_type (select), interaction_date (date), subject (text), notes (text)

### Campaigns
- campaign_name (text), campaign_type (select), status (select), start_date (date), end_date (date)

Exact column keys will be confirmed during implementation by reading each page's existing column definitions.
