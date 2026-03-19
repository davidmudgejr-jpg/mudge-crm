# Smart Filters Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add inline column filters, relative date operators, pre-built smart views, and dark theme fixes to the CRM filter system across all entity pages.

**Architecture:** Enhance the existing FilterBuilder + filterCompiler + useViewEngine stack. Add a new ColumnFilterPopover component that renders per-column filter UIs (text search, checkboxes, date presets, number ranges) anchored below column headers in CrmTable. Extend filterCompiler with relative date operators. Seed smart views on first load.

**Tech Stack:** React 18, Tailwind CSS, PostgreSQL (parameterized queries via filterCompiler)

**Spec:** `docs/superpowers/specs/2026-03-18-smart-filters-design.md`

---

## File Structure

```
ie-crm/
├── src/
│   ├── components/shared/
│   │   ├── FilterBuilder.jsx              — MODIFY: add relative date operators, dark theme
│   │   ├── CrmTable.jsx                   — MODIFY: add column header filter click + funnel icon
│   │   ├── ColumnFilterPopover.jsx         — CREATE: popover wrapper + type routing
│   │   └── column-filters/
│   │       ├── TextFilter.jsx             — CREATE: search + checkbox list
│   │       ├── SelectFilter.jsx           — CREATE: checkbox list for enum values
│   │       ├── NumberRangeFilter.jsx       — CREATE: min/max inputs
│   │       ├── DateFilter.jsx             — CREATE: preset buttons + custom range
│   │       └── BooleanFilter.jsx          — CREATE: yes/no/all toggle
│   ├── utils/
│   │   └── filterCompiler.js              — MODIFY: add relative date operators
│   ├── hooks/
│   │   └── useViewEngine.js               — MODIFY: add seed view logic
│   └── pages/
│       ├── Deals.jsx                      — MODIFY: wire column filters
│       ├── Properties.jsx                 — MODIFY: wire column filters
│       ├── Contacts.jsx                   — MODIFY: wire column filters
│       ├── Companies.jsx                  — MODIFY: wire column filters
│       ├── Interactions.jsx               — MODIFY: wire column filters
│       └── Campaigns.jsx                  — MODIFY: wire column filters
└── server/
    └── index.js                           — MODIFY: handle relative date SQL in filter endpoint
```

---

## Chunk 1: Dark Theme Fix + Relative Date Operators

### Task 1: Fix FilterBuilder dark theme

**Files:**
- Modify: `ie-crm/src/components/shared/FilterBuilder.jsx`

- [ ] **Step 1: Add color-scheme dark to all select elements**

In `ConditionRow` (line 38), update all `<select>` className strings to include `[color-scheme:dark]`:

```jsx
// Column select (line 51)
className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs w-[140px]"

// Operator select (line 63)
className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-accent px-2.5 py-1.5 rounded-md text-xs w-[100px]"

// Value select for filterOptions (line 100)
className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs flex-1"
```

Also add to all `<input>` elements:
```jsx
className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs ..."
```

- [ ] **Step 2: Verify dark theme renders correctly**

Open any entity page, click "+ New View", confirm select dropdowns and inputs have dark backgrounds with readable text.

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/components/shared/FilterBuilder.jsx
git commit -m "fix: dark theme for FilterBuilder selects and inputs"
```

### Task 2: Add relative date operators to filterCompiler

**Files:**
- Modify: `ie-crm/src/utils/filterCompiler.js`

- [ ] **Step 1: Add relative date operator handlers**

After the existing `OPERATOR_SQL` map (line 55), add a new function for relative date resolution:

```javascript
// Relative date operators — resolved to SQL at compile time
function compileRelativeDate(column, operator, value, paramIndex) {
  switch (operator) {
    case 'in_next_n_days': {
      const days = parseInt(value) || 30;
      return {
        sql: `${column} >= CURRENT_DATE AND ${column} <= CURRENT_DATE + INTERVAL '${days} days'`,
        params: [],
        paramCount: 0,
      };
    }
    case 'in_last_n_days': {
      const days = parseInt(value) || 30;
      return {
        sql: `${column} >= CURRENT_DATE - INTERVAL '${days} days' AND ${column} <= CURRENT_DATE`,
        params: [],
        paramCount: 0,
      };
    }
    case 'this_week':
      return {
        sql: `${column} >= date_trunc('week', CURRENT_DATE) AND ${column} < date_trunc('week', CURRENT_DATE) + INTERVAL '7 days'`,
        params: [],
        paramCount: 0,
      };
    case 'this_month':
      return {
        sql: `${column} >= date_trunc('month', CURRENT_DATE) AND ${column} < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'`,
        params: [],
        paramCount: 0,
      };
    case 'this_quarter':
      return {
        sql: `${column} >= date_trunc('quarter', CURRENT_DATE) AND ${column} < date_trunc('quarter', CURRENT_DATE) + INTERVAL '3 months'`,
        params: [],
        paramCount: 0,
      };
    case 'this_year':
      return {
        sql: `${column} >= date_trunc('year', CURRENT_DATE) AND ${column} < date_trunc('year', CURRENT_DATE) + INTERVAL '1 year'`,
        params: [],
        paramCount: 0,
      };
    case 'is_overdue':
      return {
        sql: `${column} < CURRENT_DATE AND ${column} IS NOT NULL`,
        params: [],
        paramCount: 0,
      };
    default:
      return null;
  }
}
```

- [ ] **Step 2: Integrate relative date handlers into compileCondition**

In the `compileCondition` function, before the standard `OPERATOR_SQL` lookup, check for relative date operators:

```javascript
// Check for relative date operator first
const relativeResult = compileRelativeDate(safeCol, operator, value, paramIndex);
if (relativeResult) {
  return relativeResult;
}
```

Add this constant for the operator check:
```javascript
const RELATIVE_DATE_OPS = new Set([
  'in_next_n_days', 'in_last_n_days', 'this_week', 'this_month',
  'this_quarter', 'this_year', 'is_overdue',
]);
```

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/utils/filterCompiler.js
git commit -m "feat: add relative date operators to filter compiler"
```

### Task 3: Add relative date operators to FilterBuilder UI

**Files:**
- Modify: `ie-crm/src/components/shared/FilterBuilder.jsx`

- [ ] **Step 1: Extend OPERATORS_BY_TYPE.date**

Add relative date operators to the date operator list (line 23):

```javascript
date: [
  { value: 'equals', label: 'equals' },
  { value: 'before', label: 'before' },
  { value: 'after', label: 'after' },
  { value: 'between', label: 'between' },
  { value: 'in_next_n_days', label: 'in the next N days' },
  { value: 'in_last_n_days', label: 'in the last N days' },
  { value: 'this_week', label: 'this week' },
  { value: 'this_month', label: 'this month' },
  { value: 'this_quarter', label: 'this quarter' },
  { value: 'this_year', label: 'this year' },
  { value: 'is_overdue', label: 'is overdue' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
],
```

- [ ] **Step 2: Handle N-days value input**

In `ConditionRow`, add N-days operators to the "no value needed" list and add a days-specific input:

```javascript
const needsNoValue = ['is_empty', 'is_not_empty', 'this_week', 'this_month', 'this_quarter', 'this_year', 'is_overdue'].includes(condition.operator);
const needsDaysInput = ['in_next_n_days', 'in_last_n_days'].includes(condition.operator);
```

Add after the `needsNoValue` check in the JSX:
```jsx
{needsDaysInput && (
  <div className="flex items-center gap-1.5 flex-1">
    <input
      type="number"
      min="1"
      value={condition.value || 30}
      onChange={(e) => onChange(index, { ...condition, value: parseInt(e.target.value) || 30 })}
      className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs w-20"
    />
    <span className="text-[11px] text-crm-muted/60">days</span>
  </div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/components/shared/FilterBuilder.jsx
git commit -m "feat: add relative date operators to FilterBuilder UI"
```

---

## Chunk 2: Column Filter Popover Components

### Task 4: Create column filter sub-components

**Files:**
- Create: `ie-crm/src/components/shared/column-filters/TextFilter.jsx`
- Create: `ie-crm/src/components/shared/column-filters/SelectFilter.jsx`
- Create: `ie-crm/src/components/shared/column-filters/NumberRangeFilter.jsx`
- Create: `ie-crm/src/components/shared/column-filters/DateFilter.jsx`
- Create: `ie-crm/src/components/shared/column-filters/BooleanFilter.jsx`

- [ ] **Step 1: Create TextFilter**

```jsx
// Search box + checkbox list of unique values
// Props: { values: string[], selected: string[], onChange: (selected) => void }
import React, { useState, useMemo } from 'react';

export default function TextFilter({ values, selected, onChange }) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const unique = [...new Set(values.filter(Boolean))].sort();
    if (!search) return unique.slice(0, 20);
    return unique.filter(v => v.toLowerCase().includes(search.toLowerCase())).slice(0, 20);
  }, [values, search]);

  const toggle = (val) => {
    const next = selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val];
    onChange(next);
  };

  return (
    <div className="w-56">
      <input
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search..."
        className="[color-scheme:dark] w-full bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2.5 py-1.5 rounded-md mb-2 outline-none"
      />
      <div className="flex justify-between mb-1.5">
        <button onClick={() => onChange([...new Set(values.filter(Boolean))])} className="text-[10px] text-crm-accent hover:underline">Select All</button>
        <button onClick={() => onChange([])} className="text-[10px] text-crm-muted hover:underline">Clear</button>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {filtered.map(val => (
          <label key={val} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-crm-hover/60 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(val)}
              onChange={() => toggle(val)}
              className="rounded border-crm-border"
            />
            <span className="text-xs text-crm-text truncate">{val}</span>
          </label>
        ))}
        {filtered.length === 0 && (
          <p className="text-[11px] text-crm-muted/60 px-1.5 py-2">No matches</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SelectFilter**

```jsx
// Checkbox list for enum/select columns
// Props: { options: string[], selected: string[], onChange: (selected) => void }
import React from 'react';

export default function SelectFilter({ options, selected, onChange }) {
  const toggle = (val) => {
    const next = selected.includes(val)
      ? selected.filter(v => v !== val)
      : [...selected, val];
    onChange(next);
  };

  return (
    <div className="w-48">
      <div className="flex justify-between mb-1.5">
        <button onClick={() => onChange([...options])} className="text-[10px] text-crm-accent hover:underline">Select All</button>
        <button onClick={() => onChange([])} className="text-[10px] text-crm-muted hover:underline">Clear</button>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-0.5">
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-crm-hover/60 cursor-pointer">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="rounded border-crm-border"
            />
            <span className="text-xs text-crm-text">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create NumberRangeFilter**

```jsx
// Min/max number inputs
// Props: { min: number|'', max: number|'', onChange: ({min, max}) => void }
import React from 'react';

export default function NumberRangeFilter({ min, max, onChange }) {
  return (
    <div className="w-48 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-crm-muted w-8">Min</span>
        <input
          type="number"
          value={min ?? ''}
          onChange={(e) => onChange({ min: e.target.value === '' ? null : Number(e.target.value), max })}
          placeholder="—"
          className="[color-scheme:dark] flex-1 bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2 py-1.5 rounded-md outline-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-crm-muted w-8">Max</span>
        <input
          type="number"
          value={max ?? ''}
          onChange={(e) => onChange({ min, max: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="—"
          className="[color-scheme:dark] flex-1 bg-crm-hover/60 border border-crm-border text-crm-text text-xs px-2 py-1.5 rounded-md outline-none"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create DateFilter**

```jsx
// Preset buttons + custom date range
// Props: { value: {operator, value}, onChange: ({operator, value}) => void }
import React, { useState } from 'react';

const PRESETS = [
  { label: 'Today', operator: 'in_last_n_days', value: 1 },
  { label: 'This Week', operator: 'this_week', value: null },
  { label: 'This Month', operator: 'this_month', value: null },
  { label: 'Last 30 Days', operator: 'in_last_n_days', value: 30 },
  { label: 'Last 90 Days', operator: 'in_last_n_days', value: 90 },
  { label: 'This Year', operator: 'this_year', value: null },
  { label: 'Next 90 Days', operator: 'in_next_n_days', value: 90 },
  { label: 'Overdue', operator: 'is_overdue', value: null },
];

export default function DateFilter({ value, onChange }) {
  const [showCustom, setShowCustom] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const activeOp = value?.operator;

  return (
    <div className="w-56">
      <div className="grid grid-cols-2 gap-1 mb-2">
        {PRESETS.map(p => (
          <button
            key={p.label}
            onClick={() => onChange({ operator: p.operator, value: p.value })}
            className={`text-[11px] px-2 py-1.5 rounded-md transition-colors ${
              activeOp === p.operator ? 'bg-crm-accent/20 text-crm-accent font-semibold' : 'text-crm-muted hover:bg-crm-hover/60'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <button
        onClick={() => setShowCustom(!showCustom)}
        className="text-[10px] text-crm-accent hover:underline mb-2"
      >
        Custom Range
      </button>
      {showCustom && (
        <div className="flex gap-1.5 items-center">
          <input
            type="date"
            value={from}
            onChange={(e) => { setFrom(e.target.value); if (to) onChange({ operator: 'between', value: [e.target.value, to] }); }}
            className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-[11px] px-1.5 py-1 rounded-md flex-1 outline-none"
          />
          <span className="text-[10px] text-crm-muted">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => { setTo(e.target.value); if (from) onChange({ operator: 'between', value: [from, e.target.value] }); }}
            className="[color-scheme:dark] bg-crm-hover/60 border border-crm-border text-crm-text text-[11px] px-1.5 py-1 rounded-md flex-1 outline-none"
          />
        </div>
      )}
      {(activeOp || from) && (
        <button
          onClick={() => { onChange(null); setFrom(''); setTo(''); }}
          className="text-[10px] text-red-400 hover:underline mt-2"
        >
          Clear Filter
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create BooleanFilter**

```jsx
// Yes/No/All toggle
// Props: { value: boolean|null, onChange: (value) => void }
import React from 'react';

export default function BooleanFilter({ value, onChange }) {
  const options = [
    { label: 'All', val: null },
    { label: 'Yes', val: true },
    { label: 'No', val: false },
  ];

  return (
    <div className="w-36">
      <div className="flex bg-crm-hover/40 rounded-md p-0.5">
        {options.map(opt => (
          <button
            key={opt.label}
            onClick={() => onChange(opt.val)}
            className={`flex-1 text-[11px] px-2.5 py-1.5 rounded transition-colors ${
              value === opt.val ? 'bg-crm-accent/20 text-crm-accent font-semibold' : 'text-crm-muted/60'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add ie-crm/src/components/shared/column-filters/
git commit -m "feat: add column filter sub-components (text, select, number, date, boolean)"
```

### Task 5: Create ColumnFilterPopover wrapper

**Files:**
- Create: `ie-crm/src/components/shared/ColumnFilterPopover.jsx`

- [ ] **Step 1: Build the popover**

```jsx
// Anchored dropdown that renders the appropriate filter type for a column.
// Positioned below the column header, closes on outside click or Escape.
import React, { useRef, useEffect, useMemo } from 'react';
import TextFilter from './column-filters/TextFilter';
import SelectFilter from './column-filters/SelectFilter';
import NumberRangeFilter from './column-filters/NumberRangeFilter';
import DateFilter from './column-filters/DateFilter';
import BooleanFilter from './column-filters/BooleanFilter';

export default function ColumnFilterPopover({
  column,          // column def object
  anchorRect,      // { left, top, width } from header getBoundingClientRect()
  rows,            // current table rows (for computing unique values)
  currentFilter,   // existing filter for this column (if any)
  onApply,         // (conditions: array) => void — replaces filter for this column
  onClose,
}) {
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Unique values for text/select columns
  const uniqueValues = useMemo(() => {
    if (!rows || !column.key) return [];
    return [...new Set(rows.map(r => r[column.key]).filter(v => v != null && v !== ''))];
  }, [rows, column.key]);

  const colType = column.type || 'text';
  const isBoolean = column.editType === 'boolean' || column.filterOptions?.length === 2 && column.filterOptions.includes('Yes');

  // Build filter condition from sub-component output
  const handleTextSelect = (selected) => {
    if (selected.length === 0) { onApply([]); return; }
    onApply([{ column: column.key, operator: 'in', value: selected }]);
  };

  const handleNumberRange = ({ min, max }) => {
    const conditions = [];
    if (min != null) conditions.push({ column: column.key, operator: 'gte', value: min });
    if (max != null) conditions.push({ column: column.key, operator: 'lte', value: max });
    onApply(conditions);
  };

  const handleDate = (filter) => {
    if (!filter) { onApply([]); return; }
    onApply([{ column: column.key, operator: filter.operator, value: filter.value }]);
  };

  const handleBoolean = (val) => {
    if (val === null) { onApply([]); return; }
    onApply([{ column: column.key, operator: 'equals', value: val ? 'Yes' : 'No' }]);
  };

  // Extract current selected values from existing filter
  const currentSelected = currentFilter?.operator === 'in' && Array.isArray(currentFilter.value)
    ? currentFilter.value : [];
  const currentMin = currentFilter?.operator === 'gte' ? currentFilter.value : null;
  const currentMax = currentFilter?.operator === 'lte' ? currentFilter.value : null;

  // Position: below the header, left-aligned
  const style = {
    position: 'fixed',
    left: Math.min(anchorRect.left, window.innerWidth - 260),
    top: anchorRect.top + anchorRect.height + 4,
    zIndex: 60,
  };

  return (
    <div ref={ref} style={style}
      className="bg-crm-card border border-crm-border rounded-lg shadow-2xl p-3 animate-fade-in"
    >
      <div className="text-[10px] text-crm-muted/60 uppercase tracking-wider mb-2">
        Filter: {column.label}
      </div>
      {isBoolean ? (
        <BooleanFilter value={currentFilter ? currentFilter.value === 'Yes' : null} onChange={handleBoolean} />
      ) : column.filterOptions ? (
        <SelectFilter options={column.filterOptions} selected={currentSelected} onChange={handleTextSelect} />
      ) : colType === 'number' ? (
        <NumberRangeFilter min={currentMin} max={currentMax} onChange={handleNumberRange} />
      ) : colType === 'date' ? (
        <DateFilter value={currentFilter} onChange={handleDate} />
      ) : (
        <TextFilter values={uniqueValues.map(String)} selected={currentSelected} onChange={handleTextSelect} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/src/components/shared/ColumnFilterPopover.jsx
git commit -m "feat: add ColumnFilterPopover wrapper component"
```

---

## Chunk 3: Wire Column Filters into CrmTable

### Task 6: Add filter click + funnel icon to CrmTable column headers

**Files:**
- Modify: `ie-crm/src/components/shared/CrmTable.jsx`

- [ ] **Step 1: Add filter state and imports**

At the top of CrmTable, add:
```javascript
import ColumnFilterPopover from './ColumnFilterPopover';
```

Add new props to CrmTable:
```javascript
// Add to the destructured props:
rows,                // table data rows (for unique value computation)
filters,             // current filter array from useViewEngine
onColumnFilter,      // (columnKey, conditions) => void — callback to update filters for a column
```

Add state for the active filter popover:
```javascript
const [filterPopover, setFilterPopover] = useState(null); // { column, anchorRect }
```

- [ ] **Step 2: Add funnel icon + click handler to ColumnHeader**

In the `ColumnHeader` component, add a funnel icon button next to the sort arrow. The icon appears dimmed normally, highlighted when a filter is active for that column:

```jsx
{/* Filter funnel icon — next to sort arrow */}
{onColumnFilter && col.type && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      const rect = e.currentTarget.closest('th').getBoundingClientRect();
      setFilterPopover(prev =>
        prev?.column.key === col.key ? null : { column: col, anchorRect: rect }
      );
    }}
    className={`ml-1 transition-opacity ${
      hasActiveFilter ? 'opacity-100 text-crm-accent' : 'opacity-0 group-hover:opacity-40 text-crm-muted'
    }`}
    title="Filter column"
  >
    <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
      <path d="M1.5 1.5h13l-5 6v5l-3 2v-7z"/>
    </svg>
  </button>
)}
```

Compute `hasActiveFilter`:
```javascript
const hasActiveFilter = filters?.some(f => f.column === col.key);
```

Add `group` to the `<th>` className so the funnel shows on hover.

- [ ] **Step 3: Render ColumnFilterPopover**

At the bottom of CrmTable's return, before the closing tag:

```jsx
{filterPopover && onColumnFilter && (
  <ColumnFilterPopover
    column={filterPopover.column}
    anchorRect={filterPopover.anchorRect}
    rows={rows}
    currentFilter={filters?.find(f => f.column === filterPopover.column.key)}
    onApply={(conditions) => {
      onColumnFilter(filterPopover.column.key, conditions);
      setFilterPopover(null);
    }}
    onClose={() => setFilterPopover(null)}
  />
)}
```

- [ ] **Step 4: Commit**

```bash
git add ie-crm/src/components/shared/CrmTable.jsx
git commit -m "feat: wire column filter popover into CrmTable headers"
```

### Task 7: Wire column filters in all 6 entity pages

**Files:**
- Modify: `ie-crm/src/pages/Deals.jsx`
- Modify: `ie-crm/src/pages/Properties.jsx`
- Modify: `ie-crm/src/pages/Contacts.jsx`
- Modify: `ie-crm/src/pages/Companies.jsx`
- Modify: `ie-crm/src/pages/Interactions.jsx`
- Modify: `ie-crm/src/pages/Campaigns.jsx`

- [ ] **Step 1: Add column filter handler**

In each page, add a handler that merges column filter conditions into the view's filter array:

```javascript
const handleColumnFilter = useCallback((columnKey, conditions) => {
  // Remove existing filters for this column, add new ones
  const otherFilters = view.filters.filter(f => f.column !== columnKey);
  const merged = [...otherFilters, ...conditions];
  view.updateFilters(merged, view.filterLogic);
}, [view]);
```

- [ ] **Step 2: Pass props to CrmTable**

Add to the `<CrmTable>` component in each page:

```jsx
<CrmTable
  // ... existing props
  rows={rows}
  filters={view.filters}
  onColumnFilter={handleColumnFilter}
/>
```

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/pages/Deals.jsx ie-crm/src/pages/Properties.jsx ie-crm/src/pages/Contacts.jsx ie-crm/src/pages/Companies.jsx ie-crm/src/pages/Interactions.jsx ie-crm/src/pages/Campaigns.jsx
git commit -m "feat: wire column filter handlers in all 6 entity pages"
```

---

## Chunk 4: Pre-built Smart Views

### Task 8: Add seed view logic to useViewEngine

**Files:**
- Modify: `ie-crm/src/hooks/useViewEngine.js`

- [ ] **Step 1: Define seed views per entity type**

Add after the imports:

```javascript
const SEED_VIEWS = {
  deals: [
    { view_name: 'Active Pipeline', filters: [{ column: 'status', operator: 'equals', value: 'Active' }], filter_logic: 'AND' },
    { view_name: 'Priority Deals', filters: [{ column: 'priority_deal', operator: 'equals', value: 'Yes' }], filter_logic: 'AND' },
    { view_name: 'Closing This Month', filters: [{ column: 'close_date', operator: 'this_month', value: null }], filter_logic: 'AND' },
  ],
  properties: [
    { view_name: 'Expiring Leases (90 days)', filters: [{ column: 'lease_exp', operator: 'in_next_n_days', value: 90 }], filter_logic: 'AND' },
  ],
  contacts: [
    { view_name: 'No Activity (60+ days)', filters: [{ column: 'last_activity_date', operator: 'in_last_n_days', value: 60 }], filter_logic: 'AND' },
  ],
  companies: [
    { view_name: 'Lease Expiring Soon', filters: [{ column: 'lease_exp', operator: 'in_next_n_days', value: 90 }], filter_logic: 'AND' },
  ],
  interactions: [],
  campaigns: [],
};
```

- [ ] **Step 2: Add seeding logic after initial load**

In the `useEffect` that loads views (line 93), after `setViews(serverViews)`, add:

```javascript
// Seed default views if none exist
const seededKey = `${LS_PREFIX}${entityType}_seeded`;
if (serverViews.length === 0 && !localStorage.getItem(seededKey)) {
  const seeds = SEED_VIEWS[entityType] || [];
  if (seeds.length > 0) {
    try {
      const created = [];
      for (let i = 0; i < seeds.length; i++) {
        const view = await createView({
          entity_type: entityType,
          view_name: seeds[i].view_name,
          filters: seeds[i].filters,
          filter_logic: seeds[i].filter_logic,
          sort_column: null,
          sort_direction: 'DESC',
          visible_columns: null,
          position: i,
        });
        created.push(view);
      }
      setViews(created);
      writeCache(entityType, created);
      localStorage.setItem(seededKey, 'true');
    } catch (err) {
      console.error(`[useViewEngine] Failed to seed views for ${entityType}:`, err);
    }
  } else {
    localStorage.setItem(seededKey, 'true');
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/hooks/useViewEngine.js
git commit -m "feat: seed pre-built smart views on first load per entity type"
```

---

## Chunk 5: Final Polish + Deploy

### Task 9: Test and verify end-to-end

- [ ] **Step 1: Verify dark theme fix** — Open FilterBuilder, confirm all selects/inputs are readable
- [ ] **Step 2: Verify relative dates** — Create a filter with "in the next 90 days" on close_date, confirm correct results
- [ ] **Step 3: Verify column filter popover** — Click a column header funnel, test each filter type (text, select, number, date, boolean)
- [ ] **Step 4: Verify smart views** — Clear localStorage, reload Deals page, confirm seed views appear as tabs
- [ ] **Step 5: Verify views persist** — Create a custom view via column filters + save, navigate away and back, confirm it loads
- [ ] **Step 6: Test on multiple pages** — Repeat basic checks on Properties, Contacts, Companies

### Task 10: Deploy

- [ ] **Step 1: Commit any remaining changes**
- [ ] **Step 2: Merge to main and push**

```bash
git checkout main
git merge feature/ai-ops-dashboard
git push origin main
```

- [ ] **Step 3: Verify deployment** — Check Vercel build succeeds, test on production URL
