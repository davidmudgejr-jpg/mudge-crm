import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getDeals, updateDeal, queryWithFilters, countWithFilters } from '../api/database';
import { bulkOps } from '../api/bridge';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import useLinkedRecords from '../hooks/useLinkedRecords';
import useDetailPanel from '../hooks/useDetailPanel';
import useViewEngine from '../hooks/useViewEngine';
import useFetchGuard from '../hooks/useFetchGuard';
import { computeDealFormulas, FORMULA_TRIGGER_FIELDS } from '../utils/dealFormulas';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import GroupByButton from '../components/shared/GroupByButton';
import ViewBar from '../components/shared/ViewBar';
import FilterBar from '../components/shared/FilterBar';
import FilterBuilder from '../components/shared/FilterBuilder';
import NewViewModal from '../components/shared/NewViewModal';
import LinkedChips from '../components/shared/LinkedChips';
import ExportPdfModal from '../components/shared/ExportPdfModal';
import DealDetail, { STATUSES } from './DealDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import ActivityCellPreview from '../components/shared/ActivityCellPreview';
import ActivityModal from '../components/shared/ActivityModal';
import { useToast } from '../components/shared/Toast';
import EmptyState from '../components/shared/EmptyState';
import PhotoUploadCell from '../components/shared/PhotoUploadCell';
import PivotButton from '../components/shared/PivotButton';
import usePivotFilter from '../hooks/usePivotFilter';
import { readPivot } from '../utils/pivotNav';
import { rankByRelevance } from '../utils/searchRank';

const SEARCH_FIELDS = ['deal_name', 'deal_type', 'status', 'notes'];
import { applyLinkedFilters, splitLinkedFilters } from '../utils/linkedFilter';
import { playDealSound } from '../utils/dealSound';
import useLiveUpdates from '../hooks/useLiveUpdates';

const STATUS_COLORS = {
  Active: 'bg-gradient-to-r from-[#30D158] to-[#34C759] text-white shadow-[0_2px_6px_rgba(48,209,88,0.3)]',
  Lead: 'bg-gradient-to-r from-[#FF9F0A] to-[#FFD60A] text-white shadow-[0_2px_6px_rgba(255,159,10,0.3)]',
  Prospect: 'bg-gradient-to-r from-[#FF9F0A] to-[#FFD60A] text-white shadow-[0_2px_6px_rgba(255,159,10,0.3)]',
  Prospecting: 'bg-gradient-to-r from-[#FF9F0A] to-[#FFD60A] text-white shadow-[0_2px_6px_rgba(255,159,10,0.3)]',
  'Long Leads': 'bg-gradient-to-r from-[#FF9F0A] to-[#FF6B2C] text-white shadow-[0_2px_6px_rgba(255,107,44,0.3)]',
  'Under Contract': 'bg-gradient-to-r from-[#007AFF] to-[#5AC8FA] text-white shadow-[0_2px_6px_rgba(0,122,255,0.3)]',
  Closed: 'bg-gradient-to-r from-[#AF52DE] to-[#BF5AF2] text-white shadow-[0_2px_6px_rgba(175,82,222,0.3)]',
  'Deal fell through': 'bg-[rgba(142,142,147,0.2)] text-[#8e8e93]',
  Dead: 'bg-[rgba(142,142,147,0.2)] text-[#8e8e93]',
  'Dead Lead': 'bg-[rgba(142,142,147,0.2)] text-[#8e8e93]',
};

const DEAL_TYPES = ['Lease', 'Sale', 'Buy', 'Sublease', 'Renewal', 'Investment', 'Other'];
const REPPING_OPTIONS = ['Landlord', 'Tenant', 'Buyer', 'Seller', 'Dual'];
const RUN_BY_OPTIONS = ['Dave Mudge', 'David Mudge Jr', 'Missy'];

const DEAL_SOURCE_OPTIONS = [
  'Sarah', 'Mat/Ryan', 'Dave', 'Doorknock', 'Relationship', 'Referral',
  'Loopnet', 'Email Campaign', 'Cold Email', 'Cold Call', 'Outside Broker',
  'Creativity', 'Snailmail', 'Existing Tenant', 'Previous Deal', 'Sign Call',
  'Sent Purchase Offer', 'Walk In', 'Reid', 'Listing', 'BOV', 'Lease vs Buy Analysis',
];

const GROUP_ORDERS = {
  status: ['Prospecting', 'Active', 'Lead', 'Long Leads', 'Under Contract', 'Closed', 'Deal fell through', 'Dead', 'Dead Lead'],
  deal_type: ['Lease', 'Sale', 'Buy', 'Sublease', 'Renewal', 'Investment', 'Other'],
};

const DEAL_DEAD_REASON_OPTIONS = [
  'Unqualified', 'Unlucky', 'Client renewed', 'Radio Silent',
  'Never got ahold of', 'Found Space w/o our help', 'Working with another broker',
  'Not Interested', 'Lost listing to another broker', "Didn't want to pay commission",
  'No Money', 'Fired off listing', "Deal didn't make sense for client",
  'Too difficult of requirement',
];

const ALL_COLUMNS = [
  // Default visible
  { key: 'deal_name', label: 'Deal', defaultWidth: 180, editable: false, type: 'text', filterable: true, wrapText: true },
  { key: 'deal_type', label: 'Type', defaultWidth: 100, type: 'select', filterable: true, editType: 'select', editOptions: DEAL_TYPES, filterOptions: DEAL_TYPES },
  { key: 'status', label: 'Status', defaultWidth: 90, type: 'select', filterable: true,
    editType: 'select', editOptions: ['Prospecting', 'Active', 'Lead', 'Long Leads', 'Under Contract', 'Closed', 'Deal fell through', 'Dead', 'Dead Lead'],
    filterOptions: ['Prospecting', 'Active', 'Lead', 'Long Leads', 'Under Contract', 'Closed', 'Deal fell through', 'Dead', 'Dead Lead'],
    renderCell: (val) => val ? (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[val] || 'bg-crm-border text-crm-muted'}`}>{val}</span>
    ) : <span className="text-crm-muted">--</span>,
  },
  { key: 'repping', label: 'Repping', defaultWidth: 100, format: 'tags', editType: 'multi-select', editOptions: REPPING_OPTIONS },
  { key: 'sf', label: 'SF', defaultWidth: 70, type: 'number', filterable: true, format: 'number' },
  { key: 'rate', label: 'Rate', defaultWidth: 70, type: 'number', filterable: true, format: 'currency' },
  { key: 'close_date', label: 'Close Date', defaultWidth: 90, type: 'date', filterable: true, format: 'date' },
  { key: 'priority_deal', label: 'Priority', defaultWidth: 70, type: 'select', filterable: true, filterOptions: ['Yes', 'No'], editType: 'boolean',
    renderCell: (val) => val ? <span className="text-red-500 font-semibold">Yes</span> : <span className="text-crm-muted">No</span>,
  },
  { key: 'lead_count', label: 'Leads', defaultWidth: 65, format: 'number',
    renderCell: (val) => {
      const n = parseInt(val) || 0;
      return n > 0
        ? <span className="text-xs font-medium text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full">🔥 {n}</span>
        : <span className="text-crm-muted text-xs">0</span>;
    },
  },
  // Hidden by default
  { key: 'deal_source', label: 'Source', defaultWidth: 120, format: 'tags', editType: 'multi-select', editOptions: DEAL_SOURCE_OPTIONS, defaultVisible: false },
  { key: 'term', label: 'Term (mo)', defaultWidth: 80, type: 'number', filterable: true, format: 'number', defaultVisible: false },
  { key: 'price_computed', label: 'Price', defaultWidth: 110, type: 'number', filterable: true, editable: false, defaultVisible: false,
    renderCell: (val) => {
      if (!val && val !== 0) return <span className="text-crm-muted">--</span>;
      const n = Number(val);
      return <span className="font-medium">${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>;
    },
  },
  { key: 'commission_rate', label: 'Commission %', defaultWidth: 100, type: 'number', filterable: true, defaultVisible: false,
    renderCell: (val) => val ? <span>{Number(val)}%</span> : <span className="text-crm-muted">--</span>,
  },
  { key: 'important_date', label: 'Important Date', defaultWidth: 100, format: 'date', defaultVisible: false },
  { key: 'deal_dead_reason', label: 'Dead Reason', defaultWidth: 140, format: 'tags', editType: 'multi-select', editOptions: DEAL_DEAD_REASON_OPTIONS, defaultVisible: false },
  { key: 'increases', label: 'Escalation %', defaultWidth: 90, type: 'number', filterable: true, defaultVisible: false,
    renderCell: (val) => val ? <span>{Number(val)}%</span> : <span className="text-crm-muted">--</span>,
  },
  { key: 'run_by', label: 'Run By', defaultWidth: 120, format: 'tags', editType: 'multi-select', editOptions: RUN_BY_OPTIONS, defaultVisible: false },
  { key: 'other_broker', label: 'Other Broker', defaultWidth: 120, defaultVisible: false },
  { key: 'industry', label: 'Industry', defaultWidth: 100, defaultVisible: false },
  { key: 'deadline', label: 'Deadline', defaultWidth: 90, format: 'date', defaultVisible: false },
  { key: 'fell_through_reason', label: 'Fell Through', defaultWidth: 120, defaultVisible: false },
  { key: 'escrow_url', label: 'Escrow', defaultWidth: 80, defaultVisible: false },
  { key: 'surveys_brochures_url', label: 'Surveys/Brochures', defaultWidth: 80, defaultVisible: false },
  { key: 'notes', label: 'Notes', defaultWidth: 200, type: 'text', editable: true, wrapText: true, defaultVisible: false },
  { key: 'tags', label: 'Tags', defaultWidth: 120, format: 'tags', editType: 'tags', defaultVisible: false },
  // Computed formula columns (from deal_formulas VIEW)
  { key: 'team_gross_computed', label: 'Team Gross', defaultWidth: 110, type: 'number', filterable: true, editable: false, defaultVisible: true,
    renderCell: (val) => {
      if (!val && val !== 0) return <span className="text-crm-muted">--</span>;
      const n = Number(val);
      return <span className="text-emerald-400 font-medium">${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>;
    },
  },
  { key: 'jr_gross_computed', label: 'Jr Gross', defaultWidth: 100, type: 'number', filterable: true, format: 'currency', editable: false, defaultVisible: true },
  { key: 'jr_net_computed', label: 'Jr Net', defaultWidth: 100, type: 'number', filterable: true, format: 'currency', editable: false, defaultVisible: true },
  // Linked record columns (filterable: is_empty / is_not_empty applied client-side)
  { key: 'linked_properties', label: 'Properties', defaultWidth: 150, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="property" labelKey="property_address" /> },
  { key: 'linked_contacts', label: 'Contacts', defaultWidth: 150, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="contact" labelKey="full_name" /> },
  { key: 'linked_companies', label: 'Companies', defaultWidth: 150, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="company" labelKey="company_name" /> },
  { key: 'linked_campaigns', label: 'Email Campaign', defaultWidth: 180, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="campaign" labelKey="campaign_name" /> },
];

export default function Deals({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [activityModal, setActivityModal] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [newViewModalOpen, setNewViewModalOpen] = useState(false);
  const [reopenNewViewAfterFilter, setReopenNewViewAfterFilter] = useState(false);
  const hasPivotOnMount = useRef(!!readPivot('deals')).current;
  const view = useViewEngine('deals', ALL_COLUMNS, { suppressRestore: hasPivotOnMount });
  const [detailId, setDetailId] = useState(null);
  useDetailPanel(detailId);
  const [totalCount, setTotalCount] = useState(0);
  // Slide-out animation state (deals leaving a filtered view)
  const [transitioningDealIds, setTransitioningDealIds] = useState(new Set());
  const [slidingOutDealIds, setSlidingOutDealIds] = useState(new Set());
  const transitionTimers = useRef({});
  const suppressRefetchRef = useRef(0);
  const { pivotFilter, dismiss: dismissPivot, mergeFilters: mergePivotFilters } = usePivotFilter('deals');
  const guard = useFetchGuard();

  // Check if changing a field value would make the row no longer match active filters
  const doesChangeBreakFilter = useCallback((field, newValue) => {
    if (!view.filters?.length) return false;
    const fieldFilters = view.filters.filter(f => f.column === field);
    if (fieldFilters.length === 0) return false;
    return fieldFilters.some(f => {
      switch (f.operator) {
        case 'equals': case '=': case 'is': return f.value !== newValue;
        case 'not_equals': case '!=': case 'is_not': return f.value === newValue;
        case 'in': return !f.value?.includes?.(newValue);
        case 'not_in': return f.value?.includes?.(newValue);
        default: return false;
      }
    });
  }, [view.filters]);

  // Cancel a pending slide-out transition (used by undo)
  const cancelTransition = useCallback((dealId) => {
    if (transitionTimers.current[dealId]) {
      transitionTimers.current[dealId].forEach(clearTimeout);
      delete transitionTimers.current[dealId];
    }
    setTransitioningDealIds(prev => { const n = new Set(prev); n.delete(dealId); return n; });
    setSlidingOutDealIds(prev => { const n = new Set(prev); n.delete(dealId); return n; });
  }, []);

  const saveViewWithPivot = useCallback(async (name) => {
    const mergedFilters = pivotFilter?.ids?.length ? mergePivotFilters(view.filters) : view.filters;
    const result = await view.createNewView(name, { overrideFilters: mergedFilters });
    if (pivotFilter) dismissPivot();
    return result;
  }, [pivotFilter, view, mergePivotFilters, dismissPivot]);
  const { formulas, evaluateFormulas } = useFormulaColumns('deals');
  const { customColumns, allCustomColumns, hiddenFieldIds, addField, updateField, removeField, hideField, toggleCustomFieldVisibility, setValue, values } = useCustomFields('deals');

  const handlePhotoSave = useCallback(async (rowId, field, value) => {
    setRows((prev) => prev.map((r) =>
      r.deal_id === rowId ? { ...r, [field]: value } : r
    ));
    try {
      await updateDeal(rowId, { [field]: value });
    } catch (err) {
      addToast(`Photo save failed: ${err.message}`, 'error', 4000);
    }
  }, [addToast]);

  const allColumnsWithActivity = useMemo(() => {
    const idx = ALL_COLUMNS.findIndex(c => c.defaultVisible === false);
    const photoCol = {
      key: 'photo_url', label: 'Photo', defaultWidth: 140, editable: false,
      renderCell: (val, row) => (
        <PhotoUploadCell url={val} rowId={row.deal_id} onSave={handlePhotoSave} />
      ),
    };
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
    // Insert photo after deal_name (index 1)
    result.splice(1, 0, photoCol);
    // Insert activity before the first hidden-by-default column
    const hiddenIdx = result.findIndex(c => c.defaultVisible === false);
    result.splice(hiddenIdx >= 0 ? hiddenIdx : result.length, 0, activityCol);
    return result;
  }, [handlePhotoSave]);

  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('deals', allColumnsWithActivity);
  const linked = useLinkedRecords('deals', rows);

  const augmentedRows = useMemo(() => {
    if (!rows.length) return rows;
    const augmented = rows.map((row) => ({
      ...row,
      linked_properties: linked.linked_properties?.[row.deal_id] || [],
      linked_contacts: linked.linked_contacts?.[row.deal_id] || [],
      linked_companies: linked.linked_companies?.[row.deal_id] || [],
      linked_campaigns: linked.linked_campaigns?.[row.deal_id] || [],
      linked_interactions: linked.linked_interactions?.[row.deal_id] || [],
    }));
    const { linkedFilters } = splitLinkedFilters(view.filters);
    return linkedFilters.length > 0 ? applyLinkedFilters(augmented, linkedFilters) : augmented;
  }, [rows, linked, view.filters]);

  const fetchData = useCallback(async () => {
    const { isStale } = guard();
    setLoading(true);
    try {
      if (pivotFilter?.ids?.length) {
        const pivotWhere = { whereClause: 'WHERE deal_id = ANY($1)', params: [pivotFilter.ids] };
        const [result, total] = await Promise.all([
          queryWithFilters('deals', { ...pivotWhere, orderBy: view.sort.column, order: view.sort.direction, limit: 500 }),
          countWithFilters('deals', pivotWhere),
        ]);
        if (isStale()) return;
        setRows(result.rows || []);
        setTotalCount(total);
        if (onCountChange) onCountChange(result.rows?.length || 0);
      } else if (search) {
        const filters = { search };
        const result = await getDeals({ limit: 500, orderBy: view.sort.column, order: view.sort.direction, filters });
        if (isStale()) return;
        const fetched = result.rows || [];
        setRows(search ? rankByRelevance(fetched, search, SEARCH_FIELDS) : fetched);
        setTotalCount(fetched.length);
        if (onCountChange) onCountChange(fetched.length);
      } else {
        const [result, total] = await Promise.all([
          queryWithFilters('deals', { ...view.sqlFilters, orderBy: view.sort.column, order: view.sort.direction, limit: 500 }),
          countWithFilters('deals', view.sqlFilters || {}),
        ]);
        if (isStale()) return;
        setRows(result.rows || []);
        setTotalCount(total);
        if (onCountChange) onCountChange(result.rows?.length || 0);
      }
    } catch (err) {
      console.error('Failed to fetch deals:', err);
      if (!isStale()) setRows([]);
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [search, view.sort.column, view.sort.direction, view.sqlFilters, onCountChange, pivotFilter, guard]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Suppress live-update refetches while a deal is transitioning out
  const liveFetchData = useCallback(() => {
    if (suppressRefetchRef.current > Date.now()) return;
    fetchData();
  }, [fetchData]);
  const { newRecordId } = useLiveUpdates('deal', liveFetchData);

  // Clean up transition timers on unmount
  useEffect(() => () => {
    Object.values(transitionTimers.current).forEach(arr => arr.forEach(clearTimeout));
  }, []);

  const toggleSelect = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectOnly = (id) => setSelected(new Set([id]));

  const shiftSelect = (id) => {
    if (selected.size === 0) { setSelected(new Set([id])); return; }
    const lastId = [...selected].pop();
    const ids = augmentedRows.map(r => r.deal_id);
    const a = ids.indexOf(lastId), b = ids.indexOf(id);
    if (a === -1 || b === -1) { setSelected(new Set([id])); return; }
    const [start, end] = a < b ? [a, b] : [b, a];
    setSelected(new Set(ids.slice(start, end + 1)));
  };

  const deleteRow = async (id) => {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    try {
      await bulkOps.delete('deals', [id]);
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      fetchData();
      addToast('Deleted', 'success');
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  const toggleAll = () => {
    selected.size === rows.length ? setSelected(new Set()) : setSelected(new Set(rows.map((r) => r.deal_id)));
  };

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!window.confirm(`Delete ${count} selected ${count === 1 ? 'deal' : 'deals'}? This cannot be undone.`)) return;
    try {
      const { deleted } = await bulkOps.delete('deals', [...selected]);
      addToast(`Deleted ${deleted} ${deleted === 1 ? 'deal' : 'deals'}`, 'success');
      setSelected(new Set());
      fetchData();
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  }, [selected, fetchData, addToast]);

  // Live formula recomputation — fires on every keystroke for trigger fields (no DB call)
  const handleCellChange = useCallback((rowId, field, rawValue) => {
    setRows((prev) => prev.map((r) => {
      if (r.deal_id !== rowId) return r;
      const snapshot = { ...r, [field]: rawValue };
      const computed = computeDealFormulas(snapshot);
      return { ...r, [field]: rawValue, ...computed };
    }));
  }, []);

  const handleCellSave = useCallback(async (rowId, field, value) => {
    let oldRow;
    setRows((prev) => prev.map((r) => {
      if (r.deal_id !== rowId) return r;
      oldRow = { ...r };
      const updated = { ...r, [field]: value };
      if (FORMULA_TRIGGER_FIELDS.has(field)) {
        Object.assign(updated, computeDealFormulas(updated));
      }
      return updated;
    }));
    try {
      await updateDeal(rowId, { [field]: value });

      // If the new value breaks the active filter, animate the row out
      if (doesChangeBreakFilter(field, value)) {
        suppressRefetchRef.current = Date.now() + 7000;
        setTransitioningDealIds(prev => new Set(prev).add(rowId));

        const slideTimer = setTimeout(() => {
          setSlidingOutDealIds(prev => new Set(prev).add(rowId));
        }, 4500);
        const removeTimer = setTimeout(() => {
          cancelTransition(rowId);
          setRows(prev => prev.filter(r => r.deal_id !== rowId));
        }, 5200);
        transitionTimers.current[rowId] = [slideTimer, removeTimer];

        addToast(`Moved to ${value}`, 'info', 5000, {
          action: {
            label: 'Undo',
            onClick: () => {
              cancelTransition(rowId);
              setRows(prev => prev.map(r =>
                r.deal_id === rowId ? { ...r, [field]: oldRow[field] } : r
              ));
              updateDeal(rowId, { [field]: oldRow[field] }).catch(() => {
                addToast('Undo failed', 'error', 3000);
              });
            },
          },
        });
      } else {
        addToast('Saved', 'success', 1500);
      }
    } catch (err) {
      setRows((prev) => prev.map((r) =>
        r.deal_id === rowId && oldRow ? oldRow : r
      ));
      addToast(`Save failed: ${err.message}`, 'error', 4000);
    }
  }, [addToast, doesChangeBreakFilter, cancelTransition]);

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
              <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Deals
            </h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} records</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">
                  {selected.size} selected
                </span>
                <button
                  onClick={handleBulkDelete}
                  className="text-xs bg-red-600/80 hover:bg-red-600 text-white font-medium px-2 py-1 rounded transition-colors"
                >
                  Delete
                </button>
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
              onClick={() => setShowQuickAdd(true)}
              className="text-xs btn-primary px-3 py-1.5 flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Deal
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1" />
          <div className="w-48 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search all fields..."
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
          <GroupByButton columns={ALL_COLUMNS} groupByColumn={view.groupByColumn} onGroupByChange={view.updateGroupBy} />
          <button onClick={fetchData} className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors">Refresh</button>
        </div>
      </div>

      <ViewBar
        entityLabel="Deals"
        views={view.views}
        activeViewId={view.activeViewId}
        isDirty={view.isDirty}
        activeView={view.activeView}
        filters={view.filters}
        applyView={(...args) => { dismissPivot(); view.applyView(...args); }}
        resetToAll={() => { dismissPivot(); view.resetToAll(); }}
        saveView={pivotFilter ? saveViewWithPivot : view.saveView}
        createNewView={pivotFilter ? saveViewWithPivot : view.createNewView}
        renameView={view.renameView}
        deleteView={(...args) => { dismissPivot(); view.deleteView(...args); }}
        duplicateView={view.duplicateView}
        setDefault={view.setDefault}
        onNewView={() => { dismissPivot(); view.resetToAll(); setNewViewModalOpen(true); }}
      />
      <FilterBar
        filters={view.filters}
        filterLogic={view.filterLogic}
        updateFilters={view.updateFilters}
        onAddFilter={() => setFilterBuilderOpen(true)}
        totalCount={totalCount}
        filteredCount={augmentedRows.length}
        activeViewId={view.activeViewId}
        onSaveAsView={(name) => pivotFilter ? saveViewWithPivot(name) : view.createNewView(name)}
        hasPivot={!!pivotFilter}
      >
        {pivotFilter && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md bg-purple-500/15 text-purple-400 border border-purple-500/25">
            {pivotFilter.label} ({pivotFilter.ids.length})
            <button onClick={dismissPivot} className="ml-0.5 hover:text-purple-200">×</button>
          </span>
        )}
        <PivotButton rows={augmentedRows} linkedKey="linked_contacts" idField="contact_id" target="contacts" label="Contacts" sourceLabel={view.activeView?.view_name ? `From Deals: ${view.activeView.view_name}` : 'From Deals'} />
        <PivotButton rows={augmentedRows} linkedKey="linked_properties" idField="property_id" target="properties" label="Properties" sourceLabel={view.activeView?.view_name ? `From Deals: ${view.activeView.view_name}` : 'From Deals'} />
        <PivotButton rows={augmentedRows} linkedKey="linked_companies" idField="company_id" target="companies" label="Companies" sourceLabel={view.activeView?.view_name ? `From Deals: ${view.activeView.view_name}` : 'From Deals'} />
      </FilterBar>
      <FilterBuilder
        isOpen={filterBuilderOpen}
        onClose={() => {
          setFilterBuilderOpen(false);
          if (reopenNewViewAfterFilter) {
            setReopenNewViewAfterFilter(false);
            setNewViewModalOpen(true);
          }
        }}
        columnDefs={ALL_COLUMNS}
        initialFilters={view.filters}
        initialLogic={view.filterLogic}
        onApply={(filters, logic) => view.updateFilters(filters, logic)}
      />
      <NewViewModal
        isOpen={newViewModalOpen}
        onClose={() => setNewViewModalOpen(false)}
        onSave={(name) => pivotFilter ? saveViewWithPivot(name) : view.createNewView(name)}
        filters={view.filters}
        filterLogic={view.filterLogic}
        sort={view.sort}
        columnDefs={ALL_COLUMNS}
        visibleColumnKeys={view.visibleColumnKeys}
        onOpenFilterBuilder={() => { setReopenNewViewAfterFilter(true); setFilterBuilderOpen(true); }}
      />

      <div className="flex-1 overflow-auto">
        {!loading && augmentedRows.length === 0 && !search ? (
          <EmptyState entity="deals" entityLabel="Deals" onAdd={() => setShowQuickAdd(true)} addLabel="+ New Deal" />
        ) : (
          <CrmTable
            tableKey="deals"
            newRecordId={newRecordId}
            columns={visibleColumns}
            rows={augmentedRows}
            idField="deal_id"
            loading={loading}
            onRowClick={(row) => setDetailId(row.deal_id)}
            onSort={view.handleSort}
            orderBy={view.sort.column}
            order={view.sort.direction}
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
            onCellChange={handleCellChange}
            formulaTriggerFields={FORMULA_TRIGGER_FIELDS}
            onSelectOnly={selectOnly}
            onShiftSelect={shiftSelect}
            onDeleteRow={deleteRow}
            filters={view.filters}
            onColumnFilter={handleColumnFilter}
            viewColumnOrder={view.columnOrder}
            onColumnOrderChange={view.updateColumnOrder}
            groupByColumn={view.groupByColumn}
            groupOrders={GROUP_ORDERS}
            columnDefs={ALL_COLUMNS}
            onGroupByColumn={view.updateGroupBy}
            slidingRowIds={slidingOutDealIds}
            transitioningRowIds={transitioningDealIds}
          />
        )}
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

      <ExportPdfModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        entityType="deals"
        entityLabel="Deals"
        selectedRows={augmentedRows.filter(r => selected.has(r.deal_id))}
        primaryColumns={allColumnsWithActivity}
        linkedData={linked}
      />
    </div>
  );
}
