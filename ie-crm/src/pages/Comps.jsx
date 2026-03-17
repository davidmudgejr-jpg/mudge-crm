import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getLeaseComps, getSaleComps, createLeaseComp, createSaleComp } from '../api/database';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import CompDetail from './CompDetail';
import CompManualEntryModal from '../components/shared/CompManualEntryModal';
import { useToast } from '../components/shared/Toast';
import EmptyState from '../components/shared/EmptyState';
import { bulkOps } from '../api/bridge';
import { useSlideOver } from '../components/shared/SlideOverContext';
import useDetailPanel from '../hooks/useDetailPanel';

const PROPERTY_TYPES = ['Industrial', 'Office', 'Retail', 'Multifamily', 'Land', 'Mixed-Use'];
const RENT_TYPES = ['NNN', 'GRS', 'MGR'];
const SOURCE_OPTIONS = ['Company DB', 'CoStar', 'IAR Hot Sheet', 'Manual'];

// Chip renderer for linked property — needs access to SlideOver context so rendered at row level
const PropertyChip = ({ row }) => {
  const { open } = useSlideOver();
  if (!row.property_id || !row.linked_property_address) return <span className="text-crm-muted">--</span>;
  return (
    <span
      className="text-[10px] leading-tight px-1.5 py-0.5 rounded-full font-medium truncate max-w-[140px] bg-blue-500/15 text-blue-400 cursor-pointer hover:brightness-125"
      title={row.linked_property_address}
      onClick={(e) => { e.stopPropagation(); open('property', row.property_id); }}
    >
      {row.linked_property_address}
    </span>
  );
};

const CompanyChip = ({ row }) => {
  const { open } = useSlideOver();
  if (!row.company_id || !row.linked_company_name) return null;
  return (
    <span
      className="text-[10px] leading-tight px-1.5 py-0.5 rounded-full font-medium truncate max-w-[120px] bg-yellow-500/15 text-yellow-400 cursor-pointer hover:brightness-125 ml-1"
      title={row.linked_company_name}
      onClick={(e) => { e.stopPropagation(); open('company', row.company_id); }}
    >
      {row.linked_company_name}
    </span>
  );
};

const LEASE_COLUMNS = [
  {
    key: 'linked_property_address', label: 'Property', defaultWidth: 160,
    renderCell: (val, row) => <PropertyChip row={row} />,
  },
  {
    key: 'tenant_name', label: 'Tenant', defaultWidth: 150,
    renderCell: (val, row) => {
      if (!val) return <span className="text-crm-muted">--</span>;
      return (
        <span className="flex items-center">
          <span className="truncate">{val}</span>
          <CompanyChip row={row} />
        </span>
      );
    },
  },
  { key: 'property_type', label: 'Property Type', defaultWidth: 110 },
  { key: 'sf', label: 'SF', defaultWidth: 90, format: 'number' },
  { key: 'rate', label: 'Rate $/SF/mo', defaultWidth: 100, format: 'currency' },
  { key: 'term_months', label: 'Term (mo)', defaultWidth: 85, format: 'number' },
  { key: 'commencement_date', label: 'Commenced', defaultWidth: 100, format: 'date' },
  { key: 'expiration_date', label: 'Expires', defaultWidth: 100, format: 'date' },
  { key: 'rent_type', label: 'Rent Type', defaultWidth: 85 },
  {
    key: 'source', label: 'Source', defaultWidth: 100,
    renderCell: (val) => {
      if (!val) return <span className="text-crm-muted">--</span>;
      const colors = { 'Company DB': 'text-blue-400', 'CoStar': 'text-green-400', 'IAR Hot Sheet': 'text-amber-400', Manual: 'text-crm-muted' };
      return <span className={colors[val] || 'text-crm-muted'}>{val}</span>;
    },
  },
  { key: 'cam_expenses', label: 'CAM $/SF/mo', defaultWidth: 100, format: 'currency' },
  { key: 'zoning', label: 'Zoning', defaultWidth: 80 },
  { key: 'doors_with_lease', label: 'Doors', defaultWidth: 70, format: 'number' },
  { key: 'space_use', label: 'Space Use', defaultWidth: 100, defaultVisible: false },
  { key: 'space_type', label: 'Space Type', defaultWidth: 100, defaultVisible: false },
  { key: 'building_rba', label: 'Building RBA', defaultWidth: 100, format: 'number', defaultVisible: false },
  { key: 'floor_suite', label: 'Floor/Suite', defaultWidth: 100, defaultVisible: false },
  { key: 'sign_date', label: 'Sign Date', defaultWidth: 100, format: 'date', defaultVisible: false },
  { key: 'move_in_date', label: 'Move-in', defaultWidth: 100, format: 'date', defaultVisible: false },
  { key: 'escalations', label: 'Escalations %', defaultWidth: 95, defaultVisible: false },
  { key: 'lease_type', label: 'Lease Type', defaultWidth: 90, defaultVisible: false },
  { key: 'concessions', label: 'Concessions', defaultWidth: 180, defaultVisible: false },
  { key: 'free_rent_months', label: 'Free Rent (mo)', defaultWidth: 95, format: 'number', defaultVisible: false },
  { key: 'ti_psf', label: 'TI $/SF', defaultWidth: 80, format: 'currency', defaultVisible: false },
  { key: 'tenant_rep_company', label: 'Tenant Rep Co', defaultWidth: 130, defaultVisible: false },
  { key: 'tenant_rep_agents', label: 'Tenant Agents', defaultWidth: 130, defaultVisible: false },
  { key: 'landlord_rep_company', label: 'LL Rep Co', defaultWidth: 130, defaultVisible: false },
  { key: 'landlord_rep_agents', label: 'LL Agents', defaultWidth: 130, defaultVisible: false },
  { key: 'notes', label: 'Notes', defaultWidth: 200, defaultVisible: false },
  { key: 'created_at', label: 'Created', defaultWidth: 100, format: 'date', defaultVisible: false },
];

const SALE_COLUMNS = [
  {
    key: 'linked_property_address', label: 'Property', defaultWidth: 160,
    renderCell: (val, row) => <PropertyChip row={row} />,
  },
  { key: 'sale_date', label: 'Sale Date', defaultWidth: 100, format: 'date' },
  { key: 'property_type', label: 'Property Type', defaultWidth: 110 },
  { key: 'sale_price', label: 'Sale Price', defaultWidth: 120, format: 'currency' },
  { key: 'sf', label: 'SF', defaultWidth: 90, format: 'number' },
  { key: 'price_psf', label: 'Price/SF', defaultWidth: 90, format: 'currency' },
  { key: 'cap_rate', label: 'Cap Rate', defaultWidth: 85 },
  { key: 'buyer_name', label: 'Buyer', defaultWidth: 150 },
  { key: 'seller_name', label: 'Seller', defaultWidth: 150 },
  {
    key: 'source', label: 'Source', defaultWidth: 100,
    renderCell: (val) => {
      if (!val) return <span className="text-crm-muted">--</span>;
      const colors = { 'Company DB': 'text-blue-400', 'CoStar': 'text-green-400', 'IAR Hot Sheet': 'text-amber-400', Manual: 'text-crm-muted' };
      return <span className={colors[val] || 'text-crm-muted'}>{val}</span>;
    },
  },
  { key: 'bldg_clear_height', label: 'Clear Height', defaultWidth: 90, format: 'number' },
  { key: 'bldg_power', label: 'Power', defaultWidth: 80 },
  { key: 'bldg_gl_doors', label: 'GL Doors', defaultWidth: 80, format: 'number' },
  { key: 'bldg_dock_doors', label: 'Dock Doors', defaultWidth: 90, format: 'number' },
  { key: 'land_sf', label: 'Land SF', defaultWidth: 90, format: 'number', defaultVisible: false },
  { key: 'price_plsf', label: 'Price/Land SF', defaultWidth: 100, format: 'currency', defaultVisible: false },
  { key: 'notes', label: 'Notes', defaultWidth: 200, defaultVisible: false },
  { key: 'created_at', label: 'Created', defaultWidth: 100, format: 'date', defaultVisible: false },
];


export default function Comps({ onCountChange }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [activeTab, setActiveTab] = useState('lease');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [orderBy, setOrderBy] = useState('created_at');
  const [order, setOrder] = useState('DESC');
  const [selected, setSelected] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  useDetailPanel(detailId);
  const [totalCount, setTotalCount] = useState(0);

  // Column visibility for both tabs
  const leaseVis = useColumnVisibility('lease_comps', LEASE_COLUMNS);
  const saleVis = useColumnVisibility('sale_comps', SALE_COLUMNS);
  const vis = activeTab === 'lease' ? leaseVis : saleVis;

  // Custom fields for both tables
  const leaseCustom = useCustomFields('lease_comps');
  const saleCustom = useCustomFields('sale_comps');
  const custom = activeTab === 'lease' ? leaseCustom : saleCustom;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      if (filterType) filters.property_type = filterType;

      const result = activeTab === 'lease'
        ? await getLeaseComps({ limit: 500, orderBy, order, filters })
        : await getSaleComps({ limit: 500, orderBy, order, filters });

      const resultRows = result.rows || [];
      setRows(resultRows);
      const count = resultRows.length;
      setTotalCount(count);
      if (onCountChange) onCountChange(count);
    } catch (err) {
      console.error(`Failed to fetch ${activeTab} comps:`, err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterType, orderBy, order, activeTab, onCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    const table = activeTab === 'lease' ? 'lease_comps' : 'sale_comps';
    if (!window.confirm(`Delete ${count} selected ${activeTab} comp${count === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      const { deleted } = await bulkOps.delete(table, [...selected]);
      addToast(`Deleted ${deleted} comp${deleted === 1 ? '' : 's'}`, 'success');
      setSelected(new Set());
      fetchData();
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  }, [selected, activeTab, fetchData, addToast]);

  // Reset state when switching tabs
  const switchTab = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setSelected(new Set());
    setDetailId(null);
    setSearch('');
    setFilterType('');
    setOrderBy('created_at');
    setOrder('DESC');
  };

  const handleSort = (key) => {
    if (orderBy === key) setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    else { setOrderBy(key); setOrder('ASC'); }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectOnly = (id) => setSelected(new Set([id]));

  const shiftSelect = (id) => {
    if (selected.size === 0) { setSelected(new Set([id])); return; }
    const lastId = [...selected].pop();
    const ids = rows.map(r => r.id);
    const a = ids.indexOf(lastId), b = ids.indexOf(id);
    if (a === -1 || b === -1) { setSelected(new Set([id])); return; }
    const [start, end] = a < b ? [a, b] : [b, a];
    setSelected(new Set(ids.slice(start, end + 1)));
  };

  const deleteRow = async (id) => {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    const table = activeTab === 'lease' ? 'lease_comps' : 'sale_comps';
    try {
      await bulkOps.delete(table, [id]);
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      fetchData();
      addToast('Deleted', 'success');
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  const toggleAll = () => {
    selected.size === rows.length ? setSelected(new Set()) : setSelected(new Set(rows.map((r) => r.id)));
  };

  // CSV Import now uses the dedicated Import page
  const goToImport = () => navigate('/import');

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Comps
            </h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} {activeTab} comps</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">{selected.size} selected</span>
                <button onClick={handleBulkDelete} className="text-xs bg-red-600/80 hover:bg-red-600 text-white font-medium px-2 py-1 rounded transition-colors">Delete</button>
              </div>
            )}
            <button
              onClick={goToImport}
              className="text-xs bg-crm-card border border-crm-border hover:border-crm-accent/50 text-crm-text font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </button>
            <button
              onClick={() => setShowQuickAdd(true)}
              className="text-xs btn-primary px-3 py-1.5 flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New {activeTab === 'lease' ? 'Lease' : 'Sale'} Comp
            </button>
          </div>
        </div>

        {/* Lease / Sale toggle */}
        <div className="flex items-center gap-1 mb-3">
          <button
            onClick={() => switchTab('lease')}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              activeTab === 'lease'
                ? 'bg-crm-accent/20 text-crm-accent font-medium'
                : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
            }`}
          >
            Lease Comps
          </button>
          <button
            onClick={() => switchTab('sale')}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
              activeTab === 'sale'
                ? 'bg-crm-accent/20 text-crm-accent font-medium'
                : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
            }`}
          >
            Sale Comps
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex-1" />
          <div className="w-48 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'lease' ? 'Search tenant, rep, type...' : 'Search buyer, seller, type...'}
              className="w-full bg-crm-hover border-0 rounded-[10px] pl-9 pr-3 py-2.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:ring-2 focus:ring-crm-accent/30"
            />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50">
            <option value="">All Types</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <ColumnToggleMenu
            allColumns={activeTab === 'lease' ? LEASE_COLUMNS : SALE_COLUMNS}
            visibleKeys={vis.visibleKeys}
            toggleColumn={vis.toggleColumn}
            showAll={vis.showAll}
            hideAll={vis.hideAll}
            resetDefaults={vis.resetDefaults}
            customColumns={custom.allCustomColumns}
            hiddenFieldIds={custom.hiddenFieldIds}
            onToggleCustomColumn={custom.toggleCustomFieldVisibility}
          />
          <button onClick={fetchData} className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors">Refresh</button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {!loading && rows.length === 0 && !search && !filterType ? (
          <EmptyState entity="comps" entityLabel="Comps" onAdd={() => setShowQuickAdd(true)} addLabel="+ New Comp" />
        ) : (
          <CrmTable
            tableKey={activeTab === 'lease' ? 'lease_comps' : 'sale_comps'}
            columns={vis.visibleColumns}
            rows={rows}
            idField="id"
            loading={loading}
            onRowClick={(row) => setDetailId(row.id)}
            onSort={handleSort}
            orderBy={orderBy}
            order={order}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            emptyMessage={`No ${activeTab} comps found`}
            emptySubMessage="Add comps manually or import a CSV"
            onRenameColumn={vis.renameColumn}
            onHideColumn={vis.toggleColumn}
            customColumns={custom.customColumns}
            customValues={custom.values}
            onCustomCellChange={custom.setValue}
            onAddField={custom.addField}
            onRenameField={(id, name) => custom.updateField(id, { name })}
            onDeleteField={custom.removeField}
            onHideCustomField={custom.hideField}
            onSelectOnly={selectOnly}
            onShiftSelect={shiftSelect}
            onDeleteRow={deleteRow}
          />
        )}
      </div>

      {/* Detail drawer */}
      {detailId && (
        <CompDetail
          compId={detailId}
          compType={activeTab}
          onClose={() => setDetailId(null)}
          onSave={() => { setDetailId(null); fetchData(); }}
          onRefresh={fetchData}
        />
      )}

      {/* Quick add modal */}
      {showQuickAdd && (
        <CompManualEntryModal
          compType={activeTab}
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); fetchData(); }}
        />
      )}

    </div>
  );
}
