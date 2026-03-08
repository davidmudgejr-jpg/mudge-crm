import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getDeals, updateDeal } from '../api/database';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import useLinkedRecords from '../hooks/useLinkedRecords';
import useDetailPanel from '../hooks/useDetailPanel';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import LinkedChips from '../components/shared/LinkedChips';
import DealDetail, { STATUSES } from './DealDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import ActivityCellPreview from '../components/shared/ActivityCellPreview';
import ActivityModal from '../components/shared/ActivityModal';
import { useToast } from '../components/shared/Toast';
import { playDealSound } from '../utils/dealSound';

const STATUS_COLORS = {
  Active: 'bg-green-500/20 text-green-400',
  Lead: 'bg-cyan-500/20 text-cyan-400',
  Prospect: 'bg-yellow-500/20 text-yellow-400',
  Prospecting: 'bg-yellow-500/20 text-yellow-400',
  'Long Leads': 'bg-orange-500/20 text-orange-400',
  'Under Contract': 'bg-blue-500/20 text-blue-400',
  Closed: 'bg-purple-500/20 text-purple-400',
  'Deal fell through': 'bg-red-500/20 text-red-400',
  Dead: 'bg-gray-500/20 text-gray-400',
  'Dead Lead': 'bg-gray-500/20 text-gray-400',
};

const DEAL_TYPES = ['Lease', 'Sale', 'Purchase', 'Sub-Lease', 'Renewal', 'Other'];
const REPPING_OPTIONS = ['Landlord', 'Tenant', 'Buyer', 'Seller', 'Dual'];
const RUN_BY_OPTIONS = ['Dave Mudge', 'David Mudge Jr', 'Missy'];

const ALL_COLUMNS = [
  // Default visible
  { key: 'deal_name', label: 'Deal', defaultWidth: 180, editable: false },
  { key: 'deal_type', label: 'Type', defaultWidth: 100, editType: 'select', editOptions: DEAL_TYPES },
  { key: 'status', label: 'Status', defaultWidth: 90,
    editType: 'select', editOptions: ['Prospecting', 'Active', 'Lead', 'Long Leads', 'Under Contract', 'Closed', 'Deal fell through', 'Dead', 'Dead Lead'],
    renderCell: (val) => val ? (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[val] || 'bg-crm-border text-crm-muted'}`}>{val}</span>
    ) : <span className="text-crm-muted">--</span>,
  },
  { key: 'repping', label: 'Repping', defaultWidth: 100, format: 'tags', editType: 'multi-select', editOptions: REPPING_OPTIONS },
  { key: 'sf', label: 'SF', defaultWidth: 70, format: 'number' },
  { key: 'rate', label: 'Rate', defaultWidth: 70, format: 'currency' },
  { key: 'gross_fee_potential', label: 'Gross Fee', defaultWidth: 90, format: 'currency' },
  { key: 'close_date', label: 'Close Date', defaultWidth: 90, format: 'date' },
  { key: 'priority_deal', label: 'Priority', defaultWidth: 70, editType: 'boolean',
    renderCell: (val) => val ? <span className="text-crm-success">Yes</span> : <span className="text-crm-muted">No</span>,
  },
  // Hidden by default
  { key: 'deal_source', label: 'Source', defaultWidth: 120, format: 'tags', editType: 'tags', defaultVisible: false },
  { key: 'term', label: 'Term (mo)', defaultWidth: 80, format: 'number', defaultVisible: false },
  { key: 'price', label: 'Price', defaultWidth: 100, format: 'currency', defaultVisible: false },
  { key: 'commission_rate', label: 'Commission %', defaultWidth: 100, format: 'number', defaultVisible: false },
  { key: 'net_potential', label: 'Net Potential', defaultWidth: 100, format: 'currency', defaultVisible: false },
  { key: 'important_date', label: 'Important Date', defaultWidth: 100, format: 'date', defaultVisible: false },
  { key: 'deal_dead_reason', label: 'Dead Reason', defaultWidth: 140, format: 'tags', editType: 'tags', defaultVisible: false },
  { key: 'increases', label: 'Escalation %', defaultWidth: 90, format: 'number', defaultVisible: false },
  { key: 'run_by', label: 'Run By', defaultWidth: 120, format: 'tags', editType: 'multi-select', editOptions: RUN_BY_OPTIONS, defaultVisible: false },
  { key: 'other_broker', label: 'Other Broker', defaultWidth: 120, defaultVisible: false },
  { key: 'industry', label: 'Industry', defaultWidth: 100, defaultVisible: false },
  { key: 'deadline', label: 'Deadline', defaultWidth: 90, format: 'date', defaultVisible: false },
  { key: 'fell_through_reason', label: 'Fell Through', defaultWidth: 120, defaultVisible: false },
  { key: 'escrow_url', label: 'Escrow', defaultWidth: 80, defaultVisible: false },
  { key: 'surveys_brochures_url', label: 'Surveys/Brochures', defaultWidth: 80, defaultVisible: false },
  { key: 'tags', label: 'Tags', defaultWidth: 120, format: 'tags', editType: 'tags', defaultVisible: false },
  // Linked record columns
  { key: 'linked_properties', label: 'Properties', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="property" labelKey="property_address" /> },
  { key: 'linked_contacts', label: 'Contacts', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="contact" labelKey="full_name" /> },
  { key: 'linked_companies', label: 'Companies', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="company" labelKey="company_name" /> },
];

export default function Deals({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [activityModal, setActivityModal] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [orderBy, setOrderBy] = useState('created_at');
  const [order, setOrder] = useState('DESC');
  const [selected, setSelected] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  useDetailPanel(detailId);
  const [totalCount, setTotalCount] = useState(0);
  const { formulas, evaluateFormulas } = useFormulaColumns('deals');
  const { customColumns, allCustomColumns, hiddenFieldIds, addField, updateField, removeField, hideField, toggleCustomFieldVisibility, setValue, values } = useCustomFields('deals');

  const allColumnsWithActivity = useMemo(() => {
    const idx = ALL_COLUMNS.findIndex(c => c.defaultVisible === false);
    const activityCol = {
      key: 'linked_interactions', label: 'Activity', defaultWidth: 220,
      renderCell: (val, row) => (
        <ActivityCellPreview
          interactions={val}
          onExpand={() => setActivityModal({ entityId: row.deal_id, entityLabel: row.deal_name || 'Deal' })}
        />
      ),
    };
    const result = [...ALL_COLUMNS];
    result.splice(idx >= 0 ? idx : result.length, 0, activityCol);
    return result;
  }, []);

  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('deals', allColumnsWithActivity);
  const linked = useLinkedRecords('deals', rows);

  const augmentedRows = useMemo(() => {
    if (!rows.length) return rows;
    return rows.map((row) => ({
      ...row,
      linked_properties: linked.linked_properties?.[row.deal_id] || [],
      linked_contacts: linked.linked_contacts?.[row.deal_id] || [],
      linked_companies: linked.linked_companies?.[row.deal_id] || [],
      linked_interactions: linked.linked_interactions?.[row.deal_id] || [],
    }));
  }, [rows, linked]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      if (filterStatus) filters.status = filterStatus;
      const result = await getDeals({ limit: 500, orderBy, order, filters });
      setRows(result.rows || []);
      const count = result.rows?.length || 0;
      setTotalCount(count);
      if (onCountChange) onCountChange(count);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, orderBy, order, onCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key) => {
    if (orderBy === key) setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    else { setOrderBy(key); setOrder('ASC'); }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleAll = () => {
    selected.size === rows.length ? setSelected(new Set()) : setSelected(new Set(rows.map((r) => r.deal_id)));
  };

  const handleCellSave = useCallback(async (rowId, field, value) => {
    let oldValue;
    setRows((prev) => prev.map((r) => {
      if (r.deal_id === rowId) { oldValue = r[field]; return { ...r, [field]: value }; }
      return r;
    }));
    try {
      await updateDeal(rowId, { [field]: value });
      addToast('Saved', 'success', 1500);
    } catch (err) {
      setRows((prev) => prev.map((r) =>
        r.deal_id === rowId ? { ...r, [field]: oldValue } : r
      ));
      addToast(`Save failed: ${err.message}`, 'error', 4000);
    }
  }, [addToast]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Deals</h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} records</p>
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
              New Deal
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deals..."
              className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50">
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <ColumnToggleMenu
            allColumns={allColumnsWithActivity}
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
        <CrmTable
          tableKey="deals"
          columns={visibleColumns}
          rows={augmentedRows}
          idField="deal_id"
          loading={loading}
          onRowClick={(row) => setDetailId(row.deal_id)}
          onSort={handleSort}
          orderBy={orderBy}
          order={order}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          emptyMessage="No deals found"
          emptySubMessage="Try adjusting your filters"
          onRenameColumn={renameColumn}
          onHideColumn={toggleColumn}
          customColumns={customColumns}
          customValues={values}
          onCustomCellChange={setValue}
          onAddField={addField}
          onRenameField={(id, name) => updateField(id, { name })}
          onDeleteField={removeField}
          onHideCustomField={hideField}
          onCellSave={handleCellSave}
        />
      </div>

      {detailId && (
        <DealDetail dealId={detailId} onClose={() => setDetailId(null)} onSave={() => { setDetailId(null); fetchData(); }} onRefresh={fetchData} />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="deal"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Deal created'); fetchData(); playDealSound(); }}
        />
      )}

      {activityModal && (
        <ActivityModal
          entityType="deal"
          entityId={activityModal.entityId}
          entityLabel={activityModal.entityLabel}
          onClose={() => setActivityModal(null)}
          onActivityCreated={fetchData}
        />
      )}
    </div>
  );
}
