import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { updateProperty } from '../api/database';
import useColumnVisibility from '../hooks/useColumnVisibility';
import useViewEngine from '../hooks/useViewEngine';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import GroupByButton from '../components/shared/GroupByButton';
import ViewBar from '../components/shared/ViewBar';
import FilterBar from '../components/shared/FilterBar';
import FilterBuilder from '../components/shared/FilterBuilder';
import NewViewModal from '../components/shared/NewViewModal';
import EmptyState from '../components/shared/EmptyState';
import { useToast } from '../components/shared/Toast';
import ExportPdfModal from '../components/shared/ExportPdfModal';
import DashboardStrip from '../components/tpe/DashboardStrip';
import TierBadge from '../components/tpe/TierBadge';
import TpeDetailPanel from '../components/tpe/TpeDetailPanel';
import QuickTuneDrawer from '../components/tpe/QuickTuneDrawer';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CALL_STATUS_OPTIONS = [
  'Not Called', 'Called — No Answer', 'Called — Left VM',
  'Called — Contacted', 'Scheduled Follow-up', 'Not Interested', 'Do Not Call',
];

function formatCompactCurrency(val) {
  const n = parseFloat(val) || 0;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  if (n > 0) return `$${Math.round(n)}`;
  return '—';
}

// Client-side filter evaluator — applies useViewEngine filter conditions to in-memory rows
function evaluateCondition(row, cond) {
  const raw = row[cond.column];
  const op = cond.operator;
  if (op === 'is_empty') return raw == null || raw === '';
  if (op === 'is_not_empty') return raw != null && raw !== '';
  const isNum = typeof cond.value === 'number' || (typeof cond.value === 'string' && !isNaN(Number(cond.value)));
  const val = isNum ? Number(raw) : (raw || '').toString().toLowerCase();
  const target = isNum ? Number(cond.value) : (cond.value || '').toString().toLowerCase();
  switch (op) {
    case 'equals': return val === target;
    case 'not_equals': return val !== target;
    case 'contains': return (raw || '').toString().toLowerCase().includes(target);
    case 'gt': return Number(raw) > Number(cond.value);
    case 'gte': return Number(raw) >= Number(cond.value);
    case 'lt': return Number(raw) < Number(cond.value);
    case 'lte': return Number(raw) <= Number(cond.value);
    case 'between': {
      const n = Number(raw);
      const [lo, hi] = Array.isArray(cond.value) ? cond.value.map(Number) : [0, 0];
      return n >= lo && n <= hi;
    }
    case 'in': return Array.isArray(cond.value) && cond.value.some(v => (raw || '').toString().toLowerCase() === v.toString().toLowerCase());
    default: return true;
  }
}
function applyClientFilters(rows, filters, logic = 'AND') {
  if (!filters || filters.length === 0) return rows;
  return rows.filter(row =>
    logic === 'AND'
      ? filters.every(c => evaluateCondition(row, c))
      : filters.some(c => evaluateCondition(row, c))
  );
}

const ALL_COLUMNS = [
  { key: 'rank', label: '#', defaultWidth: 45, editable: false,
    renderCell: (_, row, idx) => <span className="text-crm-muted text-xs tabular-nums">{idx + 1}</span>,
  },
  { key: 'address', label: 'Address', defaultWidth: 200, editable: false, type: 'text', filterable: true },
  { key: 'city', label: 'City', defaultWidth: 100, editable: false, type: 'text', filterable: true },
  { key: 'property_type', label: 'Type', defaultWidth: 100, editable: false, type: 'select', filterable: true, filterOptions: ['Office', 'Retail', 'Industrial', 'Multifamily', 'Land', 'Mixed-Use', 'Special Purpose'] },
  { key: 'tpe_tier', label: 'Tier', defaultWidth: 60, editable: false, type: 'select', filterable: true, filterOptions: ['A', 'B', 'C', 'D'],
    renderCell: (val) => <TierBadge tier={val || 'C'} />,
  },
  { key: 'blended_priority', label: 'Score', defaultWidth: 80, editable: false, type: 'number', filterable: true,
    renderCell: (val) => {
      const n = parseFloat(val) || 0;
      const color = n >= 70 ? 'bg-emerald-500' : n >= 40 ? 'bg-yellow-500' : 'bg-zinc-500';
      return (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tabular-nums w-7">{Math.round(n)}</span>
          <div className="flex-1 h-1.5 bg-crm-card rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(n, 100)}%` }} />
          </div>
        </div>
      );
    },
  },
  { key: 'call_reason', label: 'Call Reason', defaultWidth: 280, editable: false, type: 'text', filterable: true },
  { key: 'est_commission', label: 'Est. Commission', defaultWidth: 110, editable: false,
    renderCell: (_, row) => {
      const sale = parseFloat(row.sale_commission_est) || 0;
      const lease = parseFloat(row.lease_commission_est) || 0;
      const mult = parseFloat(row.time_multiplier) || 1;
      return <span className="text-xs font-medium text-crm-success">{formatCompactCurrency(Math.max(sale, lease) * mult)}</span>;
    },
  },
  { key: 'lease_expiration', label: 'Lease Exp.', defaultWidth: 100, type: 'date', filterable: true, format: 'date', editable: false },
  { key: 'owner_name', label: 'Owner', defaultWidth: 140, editable: false, type: 'text', filterable: true },
  { key: 'owner_call_status', label: 'Call Status', defaultWidth: 110, type: 'select', filterable: true,
    editType: 'select', editOptions: CALL_STATUS_OPTIONS, filterOptions: CALL_STATUS_OPTIONS,
  },
  // Hidden by default
  { key: 'lease_score', label: 'Lease Score', defaultWidth: 80, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'ownership_score', label: 'Ownership Score', defaultWidth: 90, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'age_score', label: 'Age Score', defaultWidth: 75, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'growth_score', label: 'Growth Score', defaultWidth: 85, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'stress_score', label: 'Stress Score', defaultWidth: 85, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'maturity_boost', label: 'Maturity Boost', defaultWidth: 90, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'distress_score', label: 'Distress Score', defaultWidth: 90, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'distress_type', label: 'Distress Type', defaultWidth: 100, type: 'text', filterable: true, editable: false, defaultVisible: false },
  { key: 'rba', label: 'Bldg SF', defaultWidth: 80, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'year_built', label: 'Year Built', defaultWidth: 70, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'costar_star_rating', label: 'CoStar Rating', defaultWidth: 80, type: 'number', filterable: true, editable: false, defaultVisible: false },
  { key: 'maturity_date', label: 'Maturity Date', defaultWidth: 100, type: 'date', filterable: true, format: 'date', editable: false, defaultVisible: false },
  { key: 'tpe_score', label: 'TPE Score', defaultWidth: 75, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'ecv_score', label: 'ECV Score', defaultWidth: 75, type: 'number', filterable: true, format: 'number', editable: false, defaultVisible: false },
  { key: 'owner_entity_type', label: 'Entity Type', defaultWidth: 100, type: 'text', filterable: true, editable: false, defaultVisible: false },
  { key: 'tenant_call_status', label: 'Tenant Status', defaultWidth: 100, type: 'select', filterable: true, filterOptions: CALL_STATUS_OPTIONS, editable: false, defaultVisible: false },
];

export default function TPE({ onCountChange }) {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [showTune, setShowTune] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [newViewModalOpen, setNewViewModalOpen] = useState(false);

  const view = useViewEngine('tpe', ALL_COLUMNS, { defaultSort: { column: 'blended_priority', direction: 'DESC' } });
  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('tpe', ALL_COLUMNS);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('crm-auth-token');
      const res = await fetch(`${API_BASE}/api/ai/tpe?limit=2000`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRows(data || []);
      if (onCountChange) onCountChange(data?.length || 0);
    } catch (err) {
      console.error('Failed to fetch TPE scores:', err);
      addToast('Failed to load TPE data', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [onCountChange, addToast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Client-side filtering: view engine filters + tier + search
  const filteredRows = useMemo(() => {
    let filtered = rows;
    // Apply view engine filters client-side
    if (view.filters?.length > 0) {
      filtered = applyClientFilters(filtered, view.filters, view.filterLogic);
    }
    if (tierFilter) {
      filtered = filtered.filter((r) => r.tpe_tier === tierFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      const searchFields = [
        'property_address', 'address', 'property_name', 'city', 'county', 'state', 'zip',
        'property_type', 'building_class', 'building_status',
        'owner_name', 'owner_phone', 'owner_address', 'owner_city_state_zip', 'owner_email',
        'leasing_company', 'broker_contact', 'building_park', 'market_name', 'submarket_name',
        'zoning', 'features', 'notes', 'parcel_number', 'call_reason',
        'tpe_tier', 'owner_call_status', 'tenant_call_status',
      ];
      filtered = filtered.filter((r) =>
        searchFields.some(f => (r[f] || '').toLowerCase().includes(q)) ||
        (Array.isArray(r.tags) && r.tags.some(t => (t || '').toLowerCase().includes(q)))
      );
    }
    return filtered;
  }, [rows, view.filters, view.filterLogic, tierFilter, search]);

  // Client-side sorting using view engine sort
  const sortedRows = useMemo(() => {
    const orderBy = view.sort.column;
    const order = view.sort.direction;
    if (!orderBy) return filteredRows;
    return [...filteredRows].sort((a, b) => {
      let aVal = a[orderBy], bVal = b[orderBy];
      // Numeric sort for score columns
      if (['blended_priority', 'tpe_score', 'ecv_score', 'lease_score', 'ownership_score', 'age_score', 'growth_score', 'stress_score', 'maturity_boost', 'distress_score', 'rba', 'year_built'].includes(orderBy)) {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      } else {
        aVal = (aVal || '').toString().toLowerCase();
        bVal = (bVal || '').toString().toLowerCase();
      }
      if (aVal < bVal) return order === 'ASC' ? -1 : 1;
      if (aVal > bVal) return order === 'ASC' ? 1 : -1;
      return 0;
    });
  }, [filteredRows, view.sort.column, view.sort.direction]);

  const handleSort = (key) => {
    if (key === 'rank' || key === 'est_commission') return; // Not sortable
    view.handleSort(key);
  };

  const handleCellSave = useCallback(async (rowId, field, value) => {
    let oldValue;
    setRows((prev) => prev.map((r) => {
      if (r.property_id === rowId) { oldValue = r[field]; return { ...r, [field]: value }; }
      return r;
    }));
    try {
      await updateProperty(rowId, { [field]: value });
      addToast('Saved', 'success', 1500);
    } catch (err) {
      setRows((prev) => prev.map((r) =>
        r.property_id === rowId ? { ...r, [field]: oldValue } : r
      ));
      addToast(`Save failed: ${err.message}`, 'error', 4000);
    }
  }, [addToast]);

  const toggleSelect = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const selectOnly = (id) => setSelected(new Set([id]));
  const shiftSelect = (id) => {
    if (selected.size === 0) { setSelected(new Set([id])); return; }
    const lastId = [...selected].pop();
    const ids = sortedRows.map(r => r.property_id);
    const a = ids.indexOf(lastId), b = ids.indexOf(id);
    if (a === -1 || b === -1) { setSelected(new Set([id])); return; }
    const [start, end] = a < b ? [a, b] : [b, a];
    setSelected(new Set(ids.slice(start, end + 1)));
  };
  const toggleAll = () => {
    if (selected.size === sortedRows.length) setSelected(new Set());
    else setSelected(new Set(sortedRows.map((r) => r.property_id)));
  };

  const selectedRow = detailId ? rows.find((r) => r.property_id === detailId) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Transaction Probability Engine
            </h1>
            <p className="text-xs text-crm-muted">{filteredRows.length.toLocaleString()} properties scored</p>
          </div>
          <button
            onClick={() => setShowTune(true)}
            className="text-xs bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Tune Weights
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Tier filter buttons */}
          <div className="flex rounded-lg border border-crm-border overflow-hidden">
            {[null, 'A', 'B', 'C', 'D'].map((t) => (
              <button
                key={t || 'all'}
                onClick={() => setTierFilter(t)}
                className={`text-xs px-3 py-1.5 font-medium transition-colors ${tierFilter === t ? 'bg-crm-accent text-white' : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'}`}
              >
                {t || 'All'}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <div className="w-52 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search all fields..."
              className="w-full bg-crm-hover border-0 rounded-[10px] pl-9 pr-3 py-2.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:ring-2 focus:ring-crm-accent/30"
            />
          </div>

          <ColumnToggleMenu
            allColumns={ALL_COLUMNS}
            visibleKeys={visibleKeys}
            toggleColumn={toggleColumn}
            showAll={showAll}
            hideAll={hideAll}
            resetDefaults={resetDefaults}
          />
          <GroupByButton columns={ALL_COLUMNS} groupByColumn={view.groupByColumn} onGroupByChange={view.updateGroupBy} />

          {selected.size > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">{selected.size} selected</span>
              <button
                onClick={() => setExportOpen(true)}
                className="text-xs bg-crm-card border border-crm-border hover:border-crm-accent/50 text-crm-text font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                Export PDF
              </button>
            </div>
          )}

          <button
            onClick={fetchData}
            className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <ViewBar
        entityLabel="TPE"
        views={view.views}
        activeViewId={view.activeViewId}
        isDirty={view.isDirty}
        activeView={view.activeView}
        filters={view.filters}
        applyView={(id) => { setSearch(''); setTierFilter(null); view.applyView(id); }}
        resetToAll={() => { setSearch(''); setTierFilter(null); view.resetToAll(); }}
        saveView={view.saveView}
        createNewView={view.createNewView}
        renameView={view.renameView}
        deleteView={view.deleteView}
        duplicateView={view.duplicateView}
        setDefault={view.setDefault}
        onNewView={() => { view.resetToAll(); setNewViewModalOpen(true); }}
      />
      <FilterBar
        filters={view.filters}
        filterLogic={view.filterLogic}
        updateFilters={view.updateFilters}
        onAddFilter={() => setFilterBuilderOpen(true)}
        totalCount={rows.length}
        filteredCount={filteredRows.length}
        activeViewId={view.activeViewId}
        onSaveAsView={(name) => view.createNewView(name)}
      />
      <FilterBuilder
        isOpen={filterBuilderOpen}
        onClose={() => setFilterBuilderOpen(false)}
        columnDefs={ALL_COLUMNS}
        initialFilters={view.filters}
        initialLogic={view.filterLogic}
        onApply={(filters, logic) => view.updateFilters(filters, logic)}
      />
      <NewViewModal
        isOpen={newViewModalOpen}
        onClose={() => setNewViewModalOpen(false)}
        onSave={(name) => view.createNewView(name)}
        filters={view.filters}
        filterLogic={view.filterLogic}
        sort={view.sort}
        columnDefs={ALL_COLUMNS}
        visibleColumnKeys={view.visibleColumnKeys}
        onOpenFilterBuilder={() => { setFilterBuilderOpen(true); }}
      />

      {/* Dashboard Strip */}
      <DashboardStrip rows={filteredRows} onTierFilter={setTierFilter} activeTier={tierFilter} />

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {!loading && sortedRows.length === 0 && !search && !tierFilter ? (
          <EmptyState entity="tpe" entityLabel="TPE Scores" addLabel="" />
        ) : (
          <CrmTable
            tableKey="tpe"
            columns={visibleColumns}
            rows={sortedRows}
            idField="property_id"
            loading={loading}
            onRowClick={(row) => setDetailId(row.property_id)}
            onSort={handleSort}
            orderBy={view.sort.column}
            order={view.sort.direction}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            onSelectOnly={selectOnly}
            onShiftSelect={shiftSelect}
            onCellSave={handleCellSave}
            onRenameColumn={renameColumn}
            onHideColumn={toggleColumn}
            emptyMessage={tierFilter ? `No ${tierFilter}-tier properties found` : 'No properties match your search'}
            emptySubMessage="Try adjusting your filters"
            groupByColumn={view.groupByColumn}
            groupOrders={{}}
            columnDefs={ALL_COLUMNS}
            onGroupByColumn={view.updateGroupBy}
          />
        )}
      </div>

      {/* TPE Detail Panel */}
      {selectedRow && (
        <TpeDetailPanel
          property={selectedRow}
          onClose={() => setDetailId(null)}
          onCallStatusChange={(value) => handleCellSave(selectedRow.property_id, 'owner_call_status', value)}
          onRefresh={fetchData}
        />
      )}

      {/* Quick-Tune Drawer */}
      {showTune && (
        <QuickTuneDrawer
          onClose={() => setShowTune(false)}
          onConfigChanged={fetchData}
        />
      )}

      <ExportPdfModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        entityType="tpe"
        entityLabel="TPE Properties"
        selectedRows={sortedRows.filter(r => selected.has(r.property_id))}
        primaryColumns={ALL_COLUMNS}
        linkedData={null}
      />
    </div>
  );
}
