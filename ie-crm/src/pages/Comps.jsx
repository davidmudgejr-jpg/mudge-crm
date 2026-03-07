import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getLeaseComps, getSaleComps, createLeaseComp, createSaleComp } from '../api/database';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import CompDetail from './CompDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import { useToast } from '../components/shared/Toast';

const PROPERTY_TYPES = ['Industrial', 'Office', 'Retail', 'Multifamily', 'Land', 'Mixed-Use'];
const RENT_TYPES = ['NNN', 'GRS', 'MGR'];
const SOURCE_OPTIONS = ['Company DB', 'CoStar', 'IAR Hot Sheet', 'Manual'];

const LEASE_COLUMNS = [
  { key: 'tenant_name', label: 'Tenant', defaultWidth: 150 },
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
  { key: 'land_sf', label: 'Land SF', defaultWidth: 90, format: 'number', defaultVisible: false },
  { key: 'price_plsf', label: 'Price/Land SF', defaultWidth: 100, format: 'currency', defaultVisible: false },
  { key: 'notes', label: 'Notes', defaultWidth: 200, defaultVisible: false },
  { key: 'created_at', label: 'Created', defaultWidth: 100, format: 'date', defaultVisible: false },
];

// ---- CSV parsing helpers ----
function parseCSV(text) {
  const lines = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      lines.push(current);
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      lines.push(current);
      current = '';
      // Only push a row if we have accumulated fields
      if (lines.length > 0) {
        // We'll process below
      }
    } else {
      current += ch;
    }
  }
  // Simpler approach: split by newlines respecting quotes
  const rows = [];
  let row = [];
  let field = '';
  let insideQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (insideQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else insideQuotes = !insideQuotes;
    } else if (ch === ',' && !insideQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !insideQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((f) => f)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    if (row.some((f) => f)) rows.push(row);
  }
  return rows;
}

// Fuzzy column header matching for CSV import
const LEASE_CSV_MAP = {
  tenant: 'tenant_name', 'tenant name': 'tenant_name', 'tenant_name': 'tenant_name',
  'property type': 'property_type', property_type: 'property_type', type: 'property_type',
  'space use': 'space_use', space_use: 'space_use',
  'space type': 'space_type', space_type: 'space_type',
  sf: 'sf', 'square feet': 'sf', 'square footage': 'sf', 'sq ft': 'sf', 'square footage leased': 'sf',
  rba: 'building_rba', 'building rba': 'building_rba', 'lease rba': 'building_rba',
  'floor/suite': 'floor_suite', floor_suite: 'floor_suite', suite: 'floor_suite', 'floor suite': 'floor_suite',
  'sign date': 'sign_date', sign_date: 'sign_date', signed: 'sign_date',
  'commencement date': 'commencement_date', commencement: 'commencement_date', commenced: 'commencement_date',
  'move-in date': 'move_in_date', 'move in date': 'move_in_date', 'move in': 'move_in_date',
  'expiration date': 'expiration_date', expiration: 'expiration_date', expires: 'expiration_date',
  'lease term': 'term_months', term: 'term_months', 'term (months)': 'term_months', term_months: 'term_months',
  'contract rent': 'rate', rate: 'rate', rent: 'rate', 'asking rent': 'rate',
  escalations: 'escalations', escalation: 'escalations',
  'rent type': 'rent_type', rent_type: 'rent_type',
  'lease type': 'lease_type', lease_type: 'lease_type',
  concessions: 'concessions',
  'tenant rep company': 'tenant_rep_company', 'tenant rep': 'tenant_rep_company',
  'tenant rep agents': 'tenant_rep_agents', 'tenant agents': 'tenant_rep_agents',
  'landlord rep company': 'landlord_rep_company', 'landlord rep': 'landlord_rep_company',
  'landlord rep agents': 'landlord_rep_agents', 'landlord agents': 'landlord_rep_agents',
  notes: 'notes', source: 'source',
};

const SALE_CSV_MAP = {
  'sale date': 'sale_date', sale_date: 'sale_date', date: 'sale_date',
  'sale price': 'sale_price', sale_price: 'sale_price', price: 'sale_price',
  'price psf': 'price_psf', price_psf: 'price_psf', 'price/sf': 'price_psf', '$/sf': 'price_psf',
  'price plsf': 'price_plsf', price_plsf: 'price_plsf', 'price/land sf': 'price_plsf',
  'cap rate': 'cap_rate', cap_rate: 'cap_rate', cap: 'cap_rate',
  sf: 'sf', 'square feet': 'sf', 'building sf': 'sf',
  'land sf': 'land_sf', land_sf: 'land_sf', 'land area': 'land_sf',
  buyer: 'buyer_name', buyer_name: 'buyer_name', 'buyer name': 'buyer_name',
  seller: 'seller_name', seller_name: 'seller_name', 'seller name': 'seller_name',
  'property type': 'property_type', property_type: 'property_type', type: 'property_type',
  notes: 'notes', source: 'source',
};

function mapHeaders(headers, csvMap) {
  return headers.map((h) => {
    const normalized = h.toLowerCase().replace(/[_\-#]/g, ' ').trim();
    return csvMap[normalized] || null;
  });
}

function parseNumeric(val) {
  if (!val) return null;
  const cleaned = val.replace(/[$,%\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

const NUMERIC_FIELDS = new Set(['sf', 'building_rba', 'rate', 'escalations', 'free_rent_months', 'ti_psf', 'term_months', 'sale_price', 'price_psf', 'price_plsf', 'cap_rate', 'land_sf']);
const DATE_FIELDS = new Set(['sign_date', 'commencement_date', 'move_in_date', 'expiration_date', 'sale_date']);

// Parse concessions text like "2.00 months free rent, $6 TI Allowance"
function parseConcessions(text) {
  const result = {};
  if (!text) return result;
  const freeRentMatch = text.match(/([\d.]+)\s*months?\s*free/i);
  if (freeRentMatch) result.free_rent_months = parseFloat(freeRentMatch[1]);
  const tiMatch = text.match(/\$?([\d.]+)\s*TI/i) || text.match(/TI.*?\$?([\d.]+)/i);
  if (tiMatch) result.ti_psf = parseFloat(tiMatch[1]);
  return result;
}

export default function Comps({ onCountChange }) {
  const { addToast } = useToast();
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
  const [totalCount, setTotalCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const fileInputRef = useRef(null);

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

  const toggleAll = () => {
    selected.size === rows.length ? setSelected(new Set()) : setSelected(new Set(rows.map((r) => r.id)));
  };

  // ---- CSV Import ----
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const parsed = parseCSV(text);
        if (parsed.length < 2) {
          addToast('CSV must have a header row and at least one data row', 'error');
          return;
        }
        const headers = parsed[0];
        const csvMap = activeTab === 'lease' ? LEASE_CSV_MAP : SALE_CSV_MAP;
        const mappedHeaders = mapHeaders(headers, csvMap);

        const dataRows = parsed.slice(1).map((row) => {
          const obj = {};
          mappedHeaders.forEach((field, idx) => {
            if (!field) return;
            let val = row[idx] || '';
            if (NUMERIC_FIELDS.has(field)) val = parseNumeric(val);
            else if (DATE_FIELDS.has(field)) val = parseDate(val);
            else val = val.trim() || null;
            if (val != null) obj[field] = val;
          });
          // Parse concessions into free_rent_months and ti_psf if present
          if (obj.concessions && activeTab === 'lease') {
            const parsed = parseConcessions(obj.concessions);
            if (parsed.free_rent_months && !obj.free_rent_months) obj.free_rent_months = parsed.free_rent_months;
            if (parsed.ti_psf && !obj.ti_psf) obj.ti_psf = parsed.ti_psf;
          }
          return obj;
        }).filter((obj) => Object.keys(obj).length > 0);

        const unmapped = headers.filter((_, idx) => !mappedHeaders[idx]);
        setImportPreview({
          headers,
          mappedHeaders,
          unmapped,
          rows: dataRows,
          fileName: file.name,
        });
      } catch (err) {
        console.error('CSV parse error:', err);
        addToast('Failed to parse CSV file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const executeImport = async () => {
    if (!importPreview?.rows.length) return;
    setImporting(true);
    const createFn = activeTab === 'lease' ? createLeaseComp : createSaleComp;
    let success = 0;
    let failed = 0;

    for (const row of importPreview.rows) {
      try {
        await createFn(row);
        success++;
      } catch (err) {
        console.error('Import row failed:', err, row);
        failed++;
      }
    }

    setImporting(false);
    setImportPreview(null);
    addToast(`Imported ${success} ${activeTab} comps${failed ? `, ${failed} failed` : ''}`);
    fetchData();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Comps</h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} {activeTab} comps</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">{selected.size} selected</span>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs bg-crm-card border border-crm-border hover:border-crm-accent/50 text-crm-text font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Import CSV
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileSelect} />
            <button
              onClick={() => setShowQuickAdd(true)}
              className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
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
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={activeTab === 'lease' ? 'Search tenant, rep, type...' : 'Search buyer, seller, type...'}
              className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
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
        />
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
        <QuickAddModal
          entityType={activeTab === 'lease' ? 'lease_comp' : 'sale_comp'}
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast(`${activeTab === 'lease' ? 'Lease' : 'Sale'} comp created`); fetchData(); }}
        />
      )}

      {/* CSV Import Preview Modal */}
      {importPreview && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh]" onClick={() => setImportPreview(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-crm-card border border-crm-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[70vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-3 border-b border-crm-border flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Import Preview — {importPreview.fileName}</h3>
                <p className="text-xs text-crm-muted mt-0.5">
                  {importPreview.rows.length} rows ready to import
                  {importPreview.unmapped.length > 0 && (
                    <span className="text-amber-400 ml-2">
                      {importPreview.unmapped.length} unmapped column{importPreview.unmapped.length > 1 ? 's' : ''}: {importPreview.unmapped.slice(0, 5).join(', ')}
                    </span>
                  )}
                </p>
              </div>
              <button onClick={() => setImportPreview(null)} className="text-crm-muted hover:text-crm-text">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-crm-border">
                    <th className="text-left py-1 px-2 text-crm-muted font-medium">#</th>
                    {importPreview.mappedHeaders.filter(Boolean).slice(0, 8).map((h, idx) => (
                      <th key={idx} className="text-left py-1 px-2 text-crm-muted font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 15).map((row, idx) => (
                    <tr key={idx} className="border-b border-crm-border/50">
                      <td className="py-1 px-2 text-crm-muted">{idx + 1}</td>
                      {importPreview.mappedHeaders.filter(Boolean).slice(0, 8).map((h, hIdx) => (
                        <td key={hIdx} className="py-1 px-2 text-crm-text truncate max-w-[120px]">
                          {row[h] != null ? String(row[h]) : <span className="text-crm-muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {importPreview.rows.length > 15 && (
                <p className="text-xs text-crm-muted mt-2">...and {importPreview.rows.length - 15} more rows</p>
              )}
            </div>

            <div className="px-4 py-3 border-t border-crm-border flex items-center justify-end gap-2">
              <button onClick={() => setImportPreview(null)} className="px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text transition-colors">
                Cancel
              </button>
              <button
                onClick={executeImport}
                disabled={importing}
                className="px-4 py-1.5 text-sm bg-crm-accent text-white rounded-lg hover:bg-crm-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {importing ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Importing...
                  </>
                ) : (
                  `Import ${importPreview.rows.length} Records`
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
