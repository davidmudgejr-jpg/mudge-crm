import React, { useState, useEffect, useCallback } from 'react';
import { getDeals } from '../api/database';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import DealDetail, { STATUSES } from './DealDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import { useToast } from '../components/shared/Toast';

const STATUS_COLORS = {
  Prospecting: 'bg-yellow-500/20 text-yellow-400',
  Active: 'bg-blue-500/20 text-blue-400',
  'Under Contract': 'bg-purple-500/20 text-purple-400',
  Closed: 'bg-green-500/20 text-green-400',
  Dead: 'bg-gray-500/20 text-gray-400',
};

const ALL_COLUMNS = [
  // Default visible
  { key: 'deal_name', label: 'Deal', defaultWidth: 180 },
  { key: 'deal_type', label: 'Type', defaultWidth: 100 },
  {
    key: 'status', label: 'Status', defaultWidth: 90,
    renderCell: (val) => val ? (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[val] || 'bg-crm-border text-crm-muted'}`}>{val}</span>
    ) : <span className="text-crm-muted">--</span>,
  },
  { key: 'repping', label: 'Repping', defaultWidth: 80 },
  { key: 'sf', label: 'SF', defaultWidth: 70, format: 'number' },
  { key: 'rate', label: 'Rate', defaultWidth: 70, format: 'currency' },
  { key: 'gross_fee_potential', label: 'Gross Fee', defaultWidth: 90, format: 'currency' },
  { key: 'close_date', label: 'Close Date', defaultWidth: 90, format: 'date' },
  {
    key: 'priority_deal', label: 'Priority', defaultWidth: 70,
    renderCell: (val) => val ? <span className="text-crm-success">Yes</span> : <span className="text-crm-muted">No</span>,
  },
  // Hidden by default
  { key: 'deal_source', label: 'Source', defaultWidth: 100, defaultVisible: false },
  { key: 'term', label: 'Term', defaultWidth: 70, defaultVisible: false },
  { key: 'price', label: 'Price', defaultWidth: 100, format: 'currency', defaultVisible: false },
  { key: 'commission_rate', label: 'Commission %', defaultWidth: 100, defaultVisible: false },
  { key: 'net_potential', label: 'Net Potential', defaultWidth: 100, format: 'currency', defaultVisible: false },
  { key: 'important_date', label: 'Important Date', defaultWidth: 100, format: 'date', defaultVisible: false },
  { key: 'deal_dead_reason', label: 'Dead Reason', defaultWidth: 120, defaultVisible: false },
  { key: 'tags', label: 'Tags', defaultWidth: 120, format: 'tags', defaultVisible: false },
];

export default function Deals({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [orderBy, setOrderBy] = useState('created_at');
  const [order, setOrder] = useState('DESC');
  const [selected, setSelected] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const { formulas, evaluateFormulas } = useFormulaColumns('deals');
  const { customColumns, addField, updateField, removeField, setValue, values } = useCustomFields('deals');
  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults } = useColumnVisibility('deals', ALL_COLUMNS);

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
            allColumns={ALL_COLUMNS}
            visibleKeys={visibleKeys}
            toggleColumn={toggleColumn}
            showAll={showAll}
            hideAll={hideAll}
            resetDefaults={resetDefaults}
          />
          <button onClick={fetchData} className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors">Refresh</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <CrmTable
          tableKey="deals"
          columns={visibleColumns}
          rows={rows}
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
          customColumns={customColumns}
          customValues={values}
          onCustomCellChange={setValue}
          onAddField={addField}
          onRenameField={(id, name) => updateField(id, { name })}
          onDeleteField={removeField}
        />
      </div>

      {detailId && (
        <DealDetail dealId={detailId} onClose={() => setDetailId(null)} onSave={() => { setDetailId(null); fetchData(); }} onRefresh={fetchData} />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="deal"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Deal created'); fetchData(); }}
        />
      )}
    </div>
  );
}
