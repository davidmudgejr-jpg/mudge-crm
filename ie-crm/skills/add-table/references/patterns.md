# IE CRM Code Patterns Reference

> **For Claude:** Use these templates when scaffolding a new entity. Replace all placeholders with actual values.

## Placeholders

| Placeholder | Example | Description |
|-------------|---------|-------------|
| `{Entities}` | `Properties` | PascalCase plural |
| `{Entity}` | `Property` | PascalCase singular |
| `{entities}` | `properties` | lowercase plural (table name) |
| `{entity}` | `property` | lowercase singular |
| `{entity_id}` | `property_id` | Primary key column |

---

## Layer 1: Schema (schema.sql)

### Entity Table

```sql
-- ============================================================
-- {ENTITIES}
-- ============================================================
CREATE TABLE {entities} (
    {entity_id} UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- {user-defined columns go here}
    created_at TIMESTAMP DEFAULT NOW(),
    modified TIMESTAMP DEFAULT NOW(),
    tags TEXT[],
    overflow JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_{entities}_created ON {entities}(created_at DESC);
CREATE INDEX idx_{entities}_modified ON {entities}(modified DESC);
CREATE INDEX idx_{entities}_tags ON {entities} USING GIN(tags);
```

### Junction Table

Junction table names use alphabetical order of the two entity names.

```sql
CREATE TABLE {entity1}_{entity2} (
    {entity1}_id UUID REFERENCES {entity1_table}({entity1}_id) ON DELETE CASCADE,
    {entity2}_id UUID REFERENCES {entity2_table}({entity2}_id) ON DELETE CASCADE,
    role TEXT,
    PRIMARY KEY ({entity1}_id, {entity2}_id)
);
```

---

## Layer 2: API (src/api/database.js)

### ALLOWED_COLS Entry

Add a new entry to the `ALLOWED_COLS` object:

```javascript
{entities}: new Set(['{entity_id}', /* user-defined columns */, 'created_at', 'modified', 'tags', 'overflow']),
```

### ALLOWED_JUNCTION_TABLES Additions

Add each new junction table name to the existing `ALLOWED_JUNCTION_TABLES` Set:

```javascript
ALLOWED_JUNCTION_TABLES.add('{entity1}_{entity2}');
```

### ALLOWED_JUNCTION_COLS Additions

Add `{entity_id}` to the existing `ALLOWED_JUNCTION_COLS` Set (if not already present):

```javascript
ALLOWED_JUNCTION_COLS.add('{entity_id}');
```

### getAll Function

```javascript
export async function get{Entities}({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.search) {
    where.push(`({searchable_columns_ILIKE})`);
    params.push(`%${filters.search}%`);
    i++;
  }
  // Add additional filter clauses for entity-specific dropdown filters
  // Example:
  // if (filters.{filter_field}) {
  //   where.push(`{filter_field} = $${i++}`);
  //   params.push(filters.{filter_field});
  // }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const safeOrder = sanitizeCol(orderBy, '{entities}', 'created_at');
  const safeDir = sanitizeDir(order);
  const sql = `SELECT * FROM {entities} ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);
  return query(sql, params);
}
```

### getById Function

```javascript
export async function get{Entity}(id) {
  return query('SELECT * FROM {entities} WHERE {entity_id} = $1', [id]);
}
```

### create Function

```javascript
export async function create{Entity}(fields) {
  const id = crypto.randomUUID();
  const keys = Object.keys(fields);
  validateFieldKeys(keys, '{entities}');
  const cols = ['{entity_id}', ...keys];
  const vals = [id, ...Object.values(fields)];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO {entities} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return query(sql, vals);
}
```

### update Function

```javascript
export async function update{Entity}(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, '{entities}');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const sql = `UPDATE {entities} SET ${sets.join(', ')}, modified = NOW() WHERE {entity_id} = $1 RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}
```

### delete Function

```javascript
export async function delete{Entity}(id) {
  return query('DELETE FROM {entities} WHERE {entity_id} = $1', [id]);
}
```

### Linked Record Getters

One function per junction. Example for `{entities}` linked to `contacts`:

```javascript
export async function get{Entity}Contacts({entity_id_param}) {
  return query(
    `SELECT c.*, jt.role
     FROM contacts c
     JOIN {entity}_contacts jt ON c.contact_id = jt.contact_id
     WHERE jt.{entity_id} = $1
     ORDER BY c.full_name`,
    [{entity_id_param}]
  );
}
```

Repeat for each linked entity, adjusting the join table name, joined table alias, and ORDER BY column.

**Note:** Generic `linkRecords` and `unlinkRecords` functions already exist in database.js — new entities only need their junction tables and columns added to the whitelist Sets.

---

## Layer 3: Page (src/pages/{Entities}.jsx)

```jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { get{Entities} } from '../api/database';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import useLinkedRecords from '../hooks/useLinkedRecords';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import LinkedChips from '../components/shared/LinkedChips';
import {Entity}Detail from './{Entity}Detail';
import QuickAddModal from '../components/shared/QuickAddModal';
import { useToast } from '../components/shared/Toast';

const ALL_COLUMNS = [
  // Default visible — add entity-specific columns here
  // { key: 'name', label: 'Name', defaultWidth: 200 },
  { key: 'tags', label: 'Tags', defaultWidth: 120, format: 'tags' },
  // Hidden by default
  // { key: 'some_field', label: 'Some Field', defaultWidth: 100, defaultVisible: false },
  // Linked record columns (hidden by default)
  // { key: 'linked_contacts', label: 'Contacts', defaultWidth: 150, defaultVisible: false,
  //   renderCell: (val) => <LinkedChips items={val} type="contact" labelKey="full_name" /> },
];

export default function {Entities}({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [orderBy, setOrderBy] = useState('created_at');
  const [order, setOrder] = useState('DESC');
  const [selected, setSelected] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  // Add filter state for entity-specific dropdowns:
  // const [filterStatus, setFilterStatus] = useState('');
  const { formulas, evaluateFormulas } = useFormulaColumns('{entities}');
  const { customColumns, addField, updateField, removeField, setValue, values } = useCustomFields('{entities}');
  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('{entities}', ALL_COLUMNS);
  const linked = useLinkedRecords('{entities}', rows);

  const augmentedRows = useMemo(() => {
    if (!rows.length) return rows;
    return rows.map((row) => ({
      ...row,
      // Add linked record keys for each junction:
      // linked_contacts: linked.linked_contacts?.[row.{entity_id}] || [],
    }));
  }, [rows, linked]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      // Add entity-specific filters:
      // if (filterStatus) filters.status = filterStatus;

      const result = await get{Entities}({ limit: 500, orderBy, order, filters });
      setRows(result.rows || []);
      const count = result.rows?.length || 0;
      setTotalCount(count);
      if (onCountChange) onCountChange(count);
    } catch (err) {
      console.error('Failed to fetch {entities}:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, /* filterStatus, */ orderBy, order, onCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key) => {
    if (orderBy === key) {
      setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setOrderBy(key);
      setOrder('ASC');
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.{entity_id})));
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">{Entities}</h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} records</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">
                {selected.size} selected
              </span>
            )}
            <button
              onClick={() => setShowQuickAdd(true)}
              className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New {Entity}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
            />
          </div>
          {/* Add entity-specific filter dropdowns here */}
          <ColumnToggleMenu
            allColumns={ALL_COLUMNS}
            visibleKeys={visibleKeys}
            toggleColumn={toggleColumn}
            showAll={showAll}
            hideAll={hideAll}
            resetDefaults={resetDefaults}
          />
          <button
            onClick={fetchData}
            className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <CrmTable
          tableKey="{entities}"
          columns={visibleColumns}
          rows={augmentedRows}
          idField="{entity_id}"
          loading={loading}
          onRowClick={(row) => setDetailId(row.{entity_id})}
          onSort={handleSort}
          orderBy={orderBy}
          order={order}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          emptyMessage="No {entities} found"
          emptySubMessage="Try adjusting your filters"
          onRenameColumn={renameColumn}
          onHideColumn={toggleColumn}
          customColumns={customColumns}
          customValues={values}
          onCustomCellChange={setValue}
          onAddField={addField}
          onRenameField={(id, name) => updateField(id, { name })}
          onDeleteField={removeField}
        />
      </div>

      {/* Detail Slide-in */}
      {detailId && (
        <{Entity}Detail
          {entity}Id={detailId}
          onClose={() => setDetailId(null)}
          onSave={() => { setDetailId(null); fetchData(); }}
          onRefresh={fetchData}
        />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="{entity}"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('{Entity} created'); fetchData(); }}
        />
      )}
    </div>
  );
}
```

---

## Layer 4: Detail (src/pages/{Entity}Detail.jsx)

```jsx
import React, { useState, useEffect } from 'react';
import { get{Entity}, update{Entity}, get{Entity}Contacts, get{Entity}Companies /* add more linked getters */ } from '../api/database';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import InlineField from '../components/shared/InlineField';
import NotesSection from '../components/shared/NotesSection';
import { formatDatePacific } from '../utils/timezone';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import NewInteractionModal from '../components/shared/NewInteractionModal';

export default function {Entity}Detail({ {entity}Id, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || {entity}Id;
  const [{entity}, set{Entity}] = useState(null);
  const [loading, setLoading] = useState(true);
  // Linked record state — one per junction:
  // const [contacts, setContacts] = useState([]);
  // const [companies, setCompanies] = useState([]);
  // If polymorphic interactions:
  // const [interactions, setInteractions] = useState([]);
  // const [showNewInteraction, setShowNewInteraction] = useState(false);

  const saveField = useAutoSave(update{Entity}, resolvedId, set{Entity}, onRefresh);

  useEffect(() => {
    if (!resolvedId) return;
    setLoading(true);

    const promises = [
      get{Entity}(resolvedId),
      // get{Entity}Contacts(resolvedId),
      // get{Entity}Companies(resolvedId),
      // If polymorphic: get{Entity}Interactions(resolvedId),
    ];

    Promise.allSettled(promises).then(([{entity}Res /* , contactsRes, companiesRes, interactionsRes */]) => {
      if ({entity}Res.status === 'fulfilled') {
        const rows = {entity}Res.value?.rows || {entity}Res.value || [];
        set{Entity}(rows[0] || null);
      }
      // if (contactsRes.status === 'fulfilled') setContacts(contactsRes.value?.rows || []);
      // if (companiesRes.status === 'fulfilled') setCompanies(companiesRes.value?.rows || []);
      // if (interactionsRes.status === 'fulfilled') setInteractions(interactionsRes.value?.rows || []);
      setLoading(false);
    });
  }, [resolvedId]);

  const reload = () => {
    /* re-fetch linked records after link/unlink */
    // get{Entity}Contacts(resolvedId).then(r => setContacts(r?.rows || []));
    if (onRefresh) onRefresh();
  };

  if (loading) return <DetailSkeleton onClose={onClose} />;
  if (!{entity}) return null;

  const content = (
    <>
      <SlideOverHeader
        title={{entity}.{primary_display_field} || 'Untitled'}
        subtitle={/* optional subtitle */}
        onClose={onClose}
      />

      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        {/* Core fields */}
        <Section title="Details" defaultOpen>
          {/* One InlineField per editable column */}
          {/* <InlineField label="Name" value={{entity}.name} onSave={(v) => saveField('name', v)} /> */}
          {/* <InlineField label="Status" value={{entity}.status} onSave={(v) => saveField('status', v)} type="select" options={[...]} /> */}
          {/* <InlineField label="Amount" value={{entity}.amount} onSave={(v) => saveField('amount', v)} type="number" /> */}
          <InlineField label="Tags" value={{entity}.tags} onSave={(v) => saveField('tags', v)} type="tags" />
        </Section>

        {/* Linked record sections — one per junction */}
        {/* <LinkedRecordSection
          title="Contacts"
          entityType="contact"
          records={contacts}
          defaultOpen
          sourceType="{entity}"
          sourceId={resolvedId}
          onRefresh={reload}
        /> */}

        {/* If polymorphic interactions: */}
        {/* <Section title="Activity" defaultOpen>
          <button onClick={() => setShowNewInteraction(true)} className="...">+ Log Activity</button>
          {interactions.map(i => (...))}
        </Section> */}

        {/* Notes */}
        <NotesSection entityType="{entity}" entityId={resolvedId} />

        {/* Metadata */}
        <Section title="Info">
          <InlineField label="Created" value={formatDatePacific({entity}.created_at)} type="readOnly" />
          <InlineField label="Modified" value={formatDatePacific({entity}.modified)} type="readOnly" />
        </Section>
      </div>

      {/* If polymorphic interactions: */}
      {/* {showNewInteraction && (
        <NewInteractionModal
          onClose={() => setShowNewInteraction(false)}
          onCreated={() => { setShowNewInteraction(false); reload(); }}
          initialLinks={{ {entity}_id: resolvedId }}
        />
      )} */}
    </>
  );

  if (isSlideOver) return content;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-crm-bg border-l border-crm-border flex flex-col h-full shadow-xl">
        {content}
      </div>
    </div>
  );
}
```

---

## Layer 5: Navigation (Sidebar.jsx + App.jsx)

### Sidebar.jsx — NAV_ITEMS Entry

Add to the `NAV_ITEMS` array (before the Settings entry):

```javascript
{ path: '/{entities}', label: '{Entities}', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
```

(This is a generic clipboard icon — the user can swap it later.)

### App.jsx — Import

```javascript
import {Entities} from './pages/{Entities}';
import {Entity}Detail from './pages/{Entity}Detail';
```

### App.jsx — DETAIL_COMPONENTS Entry

Add to the `DETAIL_COMPONENTS` object:

```javascript
{entity}: {Entity}Detail,
```

### App.jsx — Route Entry

Add inside the `<Routes>` block:

```jsx
<Route path="/{entities}" element={<{Entities} onCountChange={setRowCount} />} />
```
