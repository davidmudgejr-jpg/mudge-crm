import React, { useState, useEffect, useCallback } from 'react';
import { getCompanies } from '../api/database';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import CrmTable from '../components/shared/CrmTable';
import CompanyDetail from './CompanyDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import { useToast } from '../components/shared/Toast';

function formatRevenue(val) {
  if (val == null || val === '') return <span className="text-crm-muted">--</span>;
  if (typeof val !== 'number') return String(val);
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

const COLUMNS = [
  { key: 'company_name', label: 'Company', defaultWidth: 180 },
  { key: 'company_type', label: 'Type', defaultWidth: 100 },
  { key: 'industry_type', label: 'Industry', defaultWidth: 100 },
  { key: 'city', label: 'City', defaultWidth: 90 },
  { key: 'sf', label: 'SF', defaultWidth: 70, format: 'number' },
  { key: 'employees', label: 'Employees', defaultWidth: 80, format: 'number' },
  { key: 'revenue', label: 'Revenue', defaultWidth: 90, renderCell: (val) => formatRevenue(val) },
  { key: 'lease_exp', label: 'Lease Exp', defaultWidth: 90, format: 'date' },
  { key: 'tags', label: 'Tags', defaultWidth: 120, format: 'tags' },
];

export default function Companies({ onCountChange }) {
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
  const { formulas, evaluateFormulas } = useFormulaColumns('companies');
  const { customColumns, addField, updateField, removeField, setValue, values } = useCustomFields('companies');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      const result = await getCompanies({ limit: 500, orderBy, order, filters });
      setRows(result.rows || []);
      const count = result.rows?.length || 0;
      setTotalCount(count);
      if (onCountChange) onCountChange(count);
    } catch (err) {
      console.error('Failed to fetch companies:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, orderBy, order, onCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key) => {
    if (orderBy === key) setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    else { setOrderBy(key); setOrder('ASC'); }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleAll = () => {
    selected.size === rows.length ? setSelected(new Set()) : setSelected(new Set(rows.map((r) => r.company_id)));
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Companies</h1>
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
              New Company
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..."
              className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50" />
          </div>
          <button onClick={fetchData} className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors">Refresh</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <CrmTable
          tableKey="companies"
          columns={COLUMNS}
          rows={rows}
          idField="company_id"
          loading={loading}
          onRowClick={(row) => setDetailId(row.company_id)}
          onSort={handleSort}
          orderBy={orderBy}
          order={order}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          emptyMessage="No companies found"
          emptySubMessage="Try adjusting your search"
          customColumns={customColumns}
          customValues={values}
          onCustomCellChange={setValue}
          onAddField={addField}
          onRenameField={(id, name) => updateField(id, { name })}
          onDeleteField={removeField}
        />
      </div>

      {detailId && (
        <CompanyDetail companyId={detailId} onClose={() => setDetailId(null)} onSave={() => { setDetailId(null); fetchData(); }} onRefresh={fetchData} />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="company"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Company created'); fetchData(); }}
        />
      )}
    </div>
  );
}
