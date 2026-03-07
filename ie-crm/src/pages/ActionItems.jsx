import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getActionItems } from '../api/database';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import useLinkedRecords from '../hooks/useLinkedRecords';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import LinkedChips from '../components/shared/LinkedChips';
import ActionItemDetail, { STATUSES } from './ActionItemDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import { useToast } from '../components/shared/Toast';

const STATUS_COLORS = {
  Todo: 'bg-red-500/20 text-red-400',
  Reminders: 'bg-blue-500/20 text-blue-400',
  'In progress': 'bg-yellow-500/20 text-yellow-400',
  Done: 'bg-green-500/20 text-green-400',
  Dead: 'bg-emerald-500/20 text-emerald-400',
  Email: 'bg-cyan-500/20 text-cyan-400',
  'Needs and Wants': 'bg-purple-500/20 text-purple-400',
};

const RESPONSIBILITY_OPTIONS = ['Dave Mudge', 'Missy', 'David Mudge Jr', 'Houston'];

const VIEW_TABS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'dave', label: 'Dave', filter: 'Dave Mudge' },
  { key: 'missy', label: 'Missy', filter: 'Missy' },
  { key: 'jr', label: 'David Jr', filter: 'David Mudge Jr' },
  { key: 'houston', label: 'Houston', filter: 'Houston' },
];

const ALL_COLUMNS = [
  { key: 'name', label: 'Task', defaultWidth: 260 },
  {
    key: 'status', label: 'Status', defaultWidth: 110,
    renderCell: (val) => val ? (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[val] || 'bg-crm-border text-crm-muted'}`}>{val}</span>
    ) : <span className="text-crm-muted">--</span>,
  },
  { key: 'due_date', label: 'Due Date', defaultWidth: 100, format: 'date' },
  {
    key: 'high_priority', label: 'Priority', defaultWidth: 75,
    renderCell: (val) => val
      ? <span className="text-red-400 font-medium">★ High</span>
      : <span className="text-crm-muted">—</span>,
  },
  { key: 'responsibility', label: 'Assigned To', defaultWidth: 150, format: 'tags' },
  { key: 'date_completed', label: 'Completed', defaultWidth: 100, format: 'date', defaultVisible: false },
  { key: 'notes', label: 'Notes', defaultWidth: 200, defaultVisible: false },
  { key: 'notes_on_date', label: 'Note on Date', defaultWidth: 120, defaultVisible: false },
  {
    key: 'source', label: 'Source', defaultWidth: 90, defaultVisible: false,
    renderCell: (val) => {
      if (!val) return <span className="text-crm-muted">--</span>;
      if (val === 'manual') return <span className="text-crm-muted">Manual</span>;
      if (val.startsWith('houston_')) return <span className="text-cyan-400">Houston</span>;
      return <span className="text-crm-muted">{val}</span>;
    },
  },
  { key: 'created_at', label: 'Created', defaultWidth: 100, format: 'date', defaultVisible: false },
  { key: 'updated_at', label: 'Updated', defaultWidth: 100, format: 'date', defaultVisible: false },
  // Linked record columns
  { key: 'linked_contacts', label: 'Contacts', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="contact" labelKey="full_name" /> },
  { key: 'linked_properties', label: 'Properties', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="property" labelKey="property_address" /> },
  { key: 'linked_deals', label: 'Deals', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="deal" labelKey="deal_name" /> },
  { key: 'linked_companies', label: 'Companies', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="company" labelKey="company_name" /> },
];

export default function ActionItems({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeView, setActiveView] = useState('all');
  const [orderBy, setOrderBy] = useState('due_date');
  const [order, setOrder] = useState('ASC');
  const [selected, setSelected] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const { formulas, evaluateFormulas } = useFormulaColumns('action_items');
  const { customColumns, allCustomColumns, hiddenFieldIds, addField, updateField, removeField, hideField, toggleCustomFieldVisibility, setValue, values } = useCustomFields('action_items');
  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('action_items', ALL_COLUMNS);
  const linked = useLinkedRecords('action_items', rows);

  const augmentedRows = useMemo(() => {
    if (!rows.length) return rows;
    return rows.map((row) => ({
      ...row,
      linked_contacts: linked.linked_contacts?.[row.action_item_id] || [],
      linked_properties: linked.linked_properties?.[row.action_item_id] || [],
      linked_deals: linked.linked_deals?.[row.action_item_id] || [],
      linked_companies: linked.linked_companies?.[row.action_item_id] || [],
    }));
  }, [rows, linked]);

  // Split rows into My Tasks and Houston's Suggestions
  const { myTasks, houstonTasks } = useMemo(() => {
    const my = [];
    const houston = [];
    augmentedRows.forEach((row) => {
      if (row.source && row.source.startsWith('houston_')) {
        houston.push(row);
      } else {
        my.push(row);
      }
    });
    return { myTasks: my, houstonTasks: houston };
  }, [augmentedRows]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      if (filterStatus) filters.status = filterStatus;

      // View-based filters
      const viewTab = VIEW_TABS.find((t) => t.key === activeView);
      if (viewTab?.filter) {
        filters.responsibility = viewTab.filter;
      }

      const result = await getActionItems({ limit: 500, orderBy, order, filters });
      let resultRows = result.rows || [];

      // Client-side filter for "today" view (overdue + due today)
      if (activeView === 'today') {
        const today = new Date().toISOString().split('T')[0];
        resultRows = resultRows.filter((r) => {
          if (!r.due_date) return false;
          const d = r.due_date.split('T')[0];
          return d <= today;
        });
      }

      setRows(resultRows);
      const count = resultRows.length;
      setTotalCount(count);
      if (onCountChange) onCountChange(count);
    } catch (err) {
      console.error('Failed to fetch action items:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, activeView, orderBy, order, onCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key) => {
    if (orderBy === key) setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    else { setOrderBy(key); setOrder('ASC'); }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleAll = () => {
    selected.size === rows.length ? setSelected(new Set()) : setSelected(new Set(rows.map((r) => r.action_item_id)));
  };

  // Determine which rows to show in the table
  // If there are Houston tasks, show My Tasks section; Houston section renders separately below
  const showHoustonSection = houstonTasks.length > 0;
  const tableRows = showHoustonSection ? myTasks : augmentedRows;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Action Items</h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} items</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">{selected.size} selected</span>
            )}
            <button
              onClick={() => setShowQuickAdd(true)}
              className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Task
            </button>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex items-center gap-1 mb-3">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                activeView === tab.key
                  ? 'bg-crm-accent/20 text-crm-accent font-medium'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..."
              className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50">
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ColumnToggleMenu
            allColumns={ALL_COLUMNS}
            visibleKeys={visibleKeys}
            toggleColumn={toggleColumn}
            showAll={showAll}
            hideAll={hideAll}
            resetDefaults={resetDefaults}
            customColumns={allCustomColumns}
            hiddenFieldIds={hiddenFieldIds}
            onToggleCustomColumn={toggleCustomFieldVisibility}
          />
          <button onClick={fetchData} className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors">Refresh</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* My Tasks section */}
        {showHoustonSection && (
          <div className="px-6 pt-3 pb-1">
            <h2 className="text-xs font-semibold text-crm-text uppercase tracking-wide">My Tasks</h2>
          </div>
        )}
        <CrmTable
          tableKey="action_items"
          columns={visibleColumns}
          rows={tableRows}
          idField="action_item_id"
          loading={loading}
          onRowClick={(row) => setDetailId(row.action_item_id)}
          onSort={handleSort}
          orderBy={orderBy}
          order={order}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          emptyMessage="No action items found"
          emptySubMessage={activeView === 'today' ? 'Nothing due today — nice work!' : 'Try adjusting your filters'}
          onRenameColumn={renameColumn}
          onHideColumn={toggleColumn}
          customColumns={customColumns}
          customValues={values}
          onCustomCellChange={setValue}
          onAddField={addField}
          onRenameField={(id, name) => updateField(id, { name })}
          onDeleteField={removeField}
          onHideCustomField={hideField}
        />

        {/* Houston's Suggestions section */}
        {showHoustonSection && (
          <>
            <div className="px-6 pt-4 pb-1 border-t border-crm-border mt-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xs font-semibold text-cyan-400 uppercase tracking-wide">Houston's Suggestions</h2>
                <span className="text-[10px] text-crm-muted bg-crm-card px-1.5 py-0.5 rounded">{houstonTasks.length}</span>
              </div>
            </div>
            <CrmTable
              tableKey="action_items_houston"
              columns={visibleColumns}
              rows={houstonTasks}
              idField="action_item_id"
              loading={false}
              onRowClick={(row) => setDetailId(row.action_item_id)}
              onSort={handleSort}
              orderBy={orderBy}
              order={order}
              selected={selected}
              onToggleSelect={toggleSelect}
              onToggleAll={toggleAll}
              emptyMessage="No suggestions from Houston"
              onRenameColumn={renameColumn}
              onHideColumn={toggleColumn}
              customColumns={customColumns}
              customValues={values}
              onCustomCellChange={setValue}
              onAddField={addField}
              onRenameField={(id, name) => updateField(id, { name })}
              onDeleteField={removeField}
              onHideCustomField={hideField}
            />
          </>
        )}
      </div>

      {detailId && (
        <ActionItemDetail actionItemId={detailId} onClose={() => setDetailId(null)} onSave={() => { setDetailId(null); fetchData(); }} onRefresh={fetchData} />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="action_item"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Task created'); fetchData(); }}
        />
      )}
    </div>
  );
}
