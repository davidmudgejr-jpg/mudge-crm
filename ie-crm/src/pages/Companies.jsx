import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getCompanies, updateCompany, queryWithFilters, countWithFilters } from '../api/database';
import { bulkOps } from '../api/bridge';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import useLinkedRecords from '../hooks/useLinkedRecords';
import useDetailPanel from '../hooks/useDetailPanel';
import useViewEngine from '../hooks/useViewEngine';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import ViewBar from '../components/shared/ViewBar';
import FilterBar from '../components/shared/FilterBar';
import FilterBuilder from '../components/shared/FilterBuilder';
import NewViewModal from '../components/shared/NewViewModal';
import LinkedChips from '../components/shared/LinkedChips';
import CompanyDetail from './CompanyDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import ActivityCellPreview from '../components/shared/ActivityCellPreview';
import ActivityModal from '../components/shared/ActivityModal';
import { useToast } from '../components/shared/Toast';
import EmptyState from '../components/shared/EmptyState';
import PivotButton from '../components/shared/PivotButton';
import { applyLinkedFilters, splitLinkedFilters } from '../utils/linkedFilter';
import useLiveUpdates from '../hooks/useLiveUpdates';

function formatRevenue(val) {
  if (val == null || val === '') return <span className="text-crm-muted">--</span>;
  if (typeof val !== 'number') return String(val);
  if (val >= 1e9) return `$${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(0)}K`;
  return `$${val.toLocaleString()}`;
}

const ALL_COLUMNS = [
  // Default visible
  { key: 'company_name', label: 'Company', defaultWidth: 180, editable: false, type: 'text', filterable: true },
  { key: 'company_type', label: 'Type', defaultWidth: 100, type: 'text', filterable: true },
  { key: 'industry_type', label: 'Industry', defaultWidth: 100, type: 'text', filterable: true },
  { key: 'city', label: 'City', defaultWidth: 90, type: 'text', filterable: true },
  { key: 'sf', label: 'SF', defaultWidth: 70, format: 'number' },
  { key: 'employees', label: 'Employees', defaultWidth: 80, type: 'number', filterable: true, format: 'number' },
  { key: 'revenue', label: 'Revenue', defaultWidth: 90, type: 'number', filterable: true, editType: 'number', renderCell: (val) => formatRevenue(val) },
  { key: 'lease_exp', label: 'Lease Exp', defaultWidth: 90, type: 'date', filterable: true, format: 'date' },
  { key: 'last_contacted', label: 'Last Contact', defaultWidth: 100, format: 'date' },
  { key: 'tags', label: 'Tags', defaultWidth: 120, format: 'tags', editType: 'tags' },
  // Hidden by default
  { key: 'website', label: 'Website', defaultWidth: 160, defaultVisible: false },
  { key: 'company_hq', label: 'HQ', defaultWidth: 140, defaultVisible: false },
  { key: 'company_growth', label: 'Growth', defaultWidth: 80, defaultVisible: false },
  { key: 'lease_months_left', label: 'Lease Mo. Left', defaultWidth: 100, format: 'number', defaultVisible: false },
  { key: 'move_in_date', label: 'Move-In Date', defaultWidth: 100, format: 'date', defaultVisible: false },
  { key: 'tenant_sic', label: 'SIC', defaultWidth: 80, defaultVisible: false },
  { key: 'tenant_naics', label: 'NAICS', defaultWidth: 80, defaultVisible: false },
  { key: 'suite', label: 'Suite', defaultWidth: 80, defaultVisible: false },
  { key: 'notes', label: 'Notes', defaultWidth: 200, defaultVisible: false },
  // Linked record columns (filterable: is_empty / is_not_empty applied client-side)
  { key: 'linked_contacts', label: 'Contacts', defaultWidth: 150, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="contact" labelKey="full_name" /> },
  { key: 'linked_properties', label: 'Properties', defaultWidth: 150, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="property" labelKey="property_address" /> },
  { key: 'linked_deals', label: 'Deals', defaultWidth: 150, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="deal" labelKey="deal_name" /> },
];

export default function Companies({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [activityModal, setActivityModal] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [newViewModalOpen, setNewViewModalOpen] = useState(false);
  const [reopenNewViewAfterFilter, setReopenNewViewAfterFilter] = useState(false);
  const view = useViewEngine('companies', ALL_COLUMNS);
  const [detailId, setDetailId] = useState(null);
  useDetailPanel(detailId);
  const [totalCount, setTotalCount] = useState(0);
  const { formulas, evaluateFormulas } = useFormulaColumns('companies');
  const { customColumns, allCustomColumns, hiddenFieldIds, addField, updateField, removeField, hideField, toggleCustomFieldVisibility, setValue, values } = useCustomFields('companies');

  const allColumnsWithActivity = useMemo(() => {
    const idx = ALL_COLUMNS.findIndex(c => c.defaultVisible === false);
    const activityCol = {
      key: 'linked_interactions', label: 'Activity', defaultWidth: 220,
      renderCell: (val, row) => (
        <ActivityCellPreview
          interactions={val}
          onExpand={() => setActivityModal({ entityId: row.company_id, entityLabel: row.company_name || 'Company' })}
        />
      ),
    };
    const result = [...ALL_COLUMNS];
    result.splice(idx >= 0 ? idx : result.length, 0, activityCol);
    return result;
  }, []);

  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('companies', allColumnsWithActivity);
  const linked = useLinkedRecords('companies', rows);

  const augmentedRows = useMemo(() => {
    if (!rows.length) return rows;
    const now = new Date();
    const augmented = rows.map((row) => {
      let lease_months_left = null;
      if (row.lease_exp) {
        const exp = new Date(row.lease_exp);
        if (!isNaN(exp)) {
          const months = (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth());
          lease_months_left = months > 0 ? months : 0;
        }
      }
      return {
        ...row,
        lease_months_left,
        linked_contacts: linked.linked_contacts?.[row.company_id] || [],
        linked_properties: linked.linked_properties?.[row.company_id] || [],
        linked_deals: linked.linked_deals?.[row.company_id] || [],
        linked_interactions: linked.linked_interactions?.[row.company_id] || [],
      };
    });
    // Apply client-side linked record filters (is_empty / is_not_empty on linked columns)
    const { linkedFilters } = splitLinkedFilters(view.filters);
    return linkedFilters.length > 0 ? applyLinkedFilters(augmented, linkedFilters) : augmented;
  }, [rows, linked, view.filters]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (search) {
        const filters = { search };
        const result = await getCompanies({ limit: 500, orderBy: view.sort.column, order: view.sort.direction, filters });
        setRows(result.rows || []);
        setTotalCount(result.rows?.length || 0);
        if (onCountChange) onCountChange(result.rows?.length || 0);
      } else {
        const [result, total] = await Promise.all([
          queryWithFilters('companies', { ...view.sqlFilters, orderBy: view.sort.column, order: view.sort.direction, limit: 500 }),
          countWithFilters('companies', view.sqlFilters || {}),
        ]);
        setRows(result.rows || []);
        setTotalCount(total);
        if (onCountChange) onCountChange(result.rows?.length || 0);
      }
    } catch (err) {
      console.error('Failed to fetch companies:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, view.sort.column, view.sort.direction, view.sqlFilters, onCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const { newRecordId } = useLiveUpdates('company', fetchData);

  const toggleSelect = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectOnly = (id) => setSelected(new Set([id]));

  const shiftSelect = (id) => {
    if (selected.size === 0) { setSelected(new Set([id])); return; }
    const lastId = [...selected].pop();
    const ids = augmentedRows.map(r => r.company_id);
    const a = ids.indexOf(lastId), b = ids.indexOf(id);
    if (a === -1 || b === -1) { setSelected(new Set([id])); return; }
    const [start, end] = a < b ? [a, b] : [b, a];
    setSelected(new Set(ids.slice(start, end + 1)));
  };

  const deleteRow = async (id) => {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    try {
      await bulkOps.delete('companies', [id]);
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      fetchData();
      addToast('Deleted', 'success');
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  const toggleAll = () => {
    selected.size === rows.length ? setSelected(new Set()) : setSelected(new Set(rows.map((r) => r.company_id)));
  };

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!window.confirm(`Delete ${count} selected ${count === 1 ? 'company' : 'companies'}? This cannot be undone.`)) return;
    try {
      const { deleted } = await bulkOps.delete('companies', [...selected]);
      addToast(`Deleted ${deleted} ${deleted === 1 ? 'company' : 'companies'}`, 'success');
      setSelected(new Set());
      fetchData();
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  }, [selected, fetchData, addToast]);

  const handleCellSave = useCallback(async (rowId, field, value) => {
    let oldValue;
    setRows((prev) => prev.map((r) => {
      if (r.company_id === rowId) { oldValue = r[field]; return { ...r, [field]: value }; }
      return r;
    }));
    try {
      await updateCompany(rowId, { [field]: value });
      addToast('Saved', 'success', 1500);
    } catch (err) {
      setRows((prev) => prev.map((r) =>
        r.company_id === rowId ? { ...r, [field]: oldValue } : r
      ));
      addToast(`Save failed: ${err.message}`, 'error', 4000);
    }
  }, [addToast]);

  const handleColumnFilter = useCallback((columnKey, conditions) => {
    const otherFilters = view.filters.filter(f => f.column !== columnKey);
    const merged = [...otherFilters, ...conditions];
    view.updateFilters(merged, view.filterLogic);
  }, [view]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              Companies
            </h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} records</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">{selected.size} selected</span>
                <button
                  onClick={handleBulkDelete}
                  className="text-xs bg-red-600 hover:bg-red-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  Delete {selected.size}
                </button>
              </>
            )}
            <button
              onClick={() => setShowQuickAdd(true)}
              className="text-xs btn-primary px-3 py-1.5 flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Company
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1" />
          <div className="w-48 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..."
              className="w-full bg-crm-hover border-0 rounded-[10px] pl-9 pr-3 py-2.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:ring-2 focus:ring-crm-accent/30" />
          </div>
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

      <ViewBar
        entityLabel="Companies"
        views={view.views}
        activeViewId={view.activeViewId}
        isDirty={view.isDirty}
        activeView={view.activeView}
        filters={view.filters}
        applyView={view.applyView}
        resetToAll={view.resetToAll}
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
        totalCount={totalCount}
        filteredCount={augmentedRows.length}
        activeViewId={view.activeViewId}
        onSaveAsView={(name) => view.createNewView(name)}
      >
        <PivotButton rows={augmentedRows} linkedKey="linked_contacts" idField="contact_id" target="contacts" label="Contacts" sourceLabel={view.activeView?.view_name ? `From Companies: ${view.activeView.view_name}` : 'From Companies'} />
        <PivotButton rows={augmentedRows} linkedKey="linked_properties" idField="property_id" target="properties" label="Properties" sourceLabel={view.activeView?.view_name ? `From Companies: ${view.activeView.view_name}` : 'From Companies'} />
        <PivotButton rows={augmentedRows} linkedKey="linked_deals" idField="deal_id" target="deals" label="Deals" sourceLabel={view.activeView?.view_name ? `From Companies: ${view.activeView.view_name}` : 'From Companies'} />
      </FilterBar>
      <FilterBuilder
        isOpen={filterBuilderOpen}
        onClose={() => { setFilterBuilderOpen(false); if (reopenNewViewAfterFilter) { setReopenNewViewAfterFilter(false); setNewViewModalOpen(true); } }}
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
        onOpenFilterBuilder={() => { setReopenNewViewAfterFilter(true); setFilterBuilderOpen(true); }}
      />

      <div className="flex-1 overflow-auto">
        {!loading && augmentedRows.length === 0 && !search ? (
          <EmptyState entity="companies" entityLabel="Companies" onAdd={() => setShowQuickAdd(true)} addLabel="+ New Company" />
        ) : (
          <CrmTable
            tableKey="companies"
            newRecordId={newRecordId}
            columns={visibleColumns}
            rows={augmentedRows}
            idField="company_id"
            loading={loading}
            onRowClick={(row) => setDetailId(row.company_id)}
            onSort={view.handleSort}
            orderBy={view.sort.column}
            order={view.sort.direction}
            selected={selected}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            emptyMessage="No companies found"
            emptySubMessage="Try adjusting your search"
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
            onSelectOnly={selectOnly}
            onShiftSelect={shiftSelect}
            onDeleteRow={deleteRow}
            filters={view.filters}
            onColumnFilter={handleColumnFilter}
            viewColumnOrder={view.columnOrder}
            onColumnOrderChange={view.updateColumnOrder}
          />
        )}
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

      {activityModal && (
        <ActivityModal
          entityType="company"
          entityId={activityModal.entityId}
          entityLabel={activityModal.entityLabel}
          onClose={() => setActivityModal(null)}
          onActivityCreated={fetchData}
        />
      )}
    </div>
  );
}
