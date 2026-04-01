import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getProperties, updateProperty, queryWithFilters, countWithFilters, query } from '../api/database';
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
import PropertyDetail from './PropertyDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import ActivityCellPreview from '../components/shared/ActivityCellPreview';
import ActivityModal from '../components/shared/ActivityModal';
import { useToast } from '../components/shared/Toast';
import EmptyState from '../components/shared/EmptyState';
import PhotoUploadCell from '../components/shared/PhotoUploadCell';
import PivotButton from '../components/shared/PivotButton';
import usePivotFilter from '../hooks/usePivotFilter';
import { applyLinkedFilters, splitLinkedFilters } from '../utils/linkedFilter';
import { bulkOps } from '../api/bridge';
import useLiveUpdates from '../hooks/useLiveUpdates';

const CONTACTED_OPTIONS = [
  'Contacted Owner', 'Not Contacted', 'Broker/Not worth it',
  'Emailed Owner/Tenant', 'Cold called', 'Left VM',
  'Contacted Tenant', 'Contacted Owner & Tenant', 'Listing',
  'Doorknocked', 'BOV Sent', 'Offer Sent', 'Letter Sent', 'Met with Owner',
];

const ALL_COLUMNS = [
  // Default visible
  { key: 'property_address', label: 'Address', defaultWidth: 200, editable: false, type: 'text', filterable: true },
  { key: 'city', label: 'City', defaultWidth: 100, type: 'text', filterable: true },
  { key: 'county', label: 'County', defaultWidth: 90, type: 'text', filterable: true },
  { key: 'property_type', label: 'Type', defaultWidth: 100, type: 'select', filterable: true, editType: 'select', editOptions: ['Office', 'Retail', 'Industrial', 'Multifamily', 'Land', 'Mixed-Use', 'Special Purpose'], filterOptions: ['Office', 'Retail', 'Industrial', 'Multifamily', 'Land', 'Mixed-Use', 'Special Purpose'] },
  { key: 'rba', label: 'Bldg SF', defaultWidth: 80, type: 'number', filterable: true, format: 'number' },
  { key: 'land_sf', label: 'Lot SF', defaultWidth: 80, format: 'number' },
  { key: 'year_built', label: 'Year', defaultWidth: 60, type: 'number', filterable: true },
  { key: 'owner_name', label: 'Entity Name', defaultWidth: 140, type: 'text', filterable: true },
  { key: 'priority', label: 'Priority', defaultWidth: 80, type: 'select', filterable: true, format: 'priority', editType: 'select', editOptions: ['Hot', 'Warm', 'Cold', 'Dead'], filterOptions: ['Hot', 'Warm', 'Cold', 'Dead'] },
  { key: 'contacted', label: 'Contacted', defaultWidth: 120, format: 'tags', editType: 'multi-select', editOptions: CONTACTED_OPTIONS },
  { key: 'tags', label: 'Tags', defaultWidth: 120, format: 'tags', editType: 'tags' },
  // Market listing columns (AIR ingest + CoStar)
  { key: 'listing_status', label: 'Listing Status', defaultWidth: 110, type: 'select', filterable: true, editType: 'select', editOptions: ['for_sale', 'for_lease', 'sold', 'leased'], filterOptions: ['for_sale', 'for_lease', 'sold', 'leased'] },
  { key: 'listing_asking_lease_rate', label: 'Asking Rate/SF/Mo', defaultWidth: 120, type: 'number', filterable: true, format: 'currency', editType: 'number' },
  // Hidden by default
  { key: 'property_name', label: 'Property Name', defaultWidth: 160, defaultVisible: false },
  { key: 'zip', label: 'ZIP', defaultWidth: 70, defaultVisible: false },
  { key: 'zoning', label: 'Zoning', defaultWidth: 80, defaultVisible: false },
  { key: 'units', label: 'Units', defaultWidth: 60, format: 'number', editType: 'number', defaultVisible: false },
  { key: 'stories', label: 'Stories', defaultWidth: 60, format: 'number', editType: 'number', defaultVisible: false },
  { key: 'parking_spaces', label: 'Parking Spaces', defaultWidth: 90, format: 'number', editType: 'number', defaultVisible: false },
  { key: 'price_per_sqft', label: 'Price/SF', defaultWidth: 90, format: 'currency', editType: 'number', defaultVisible: false },
  // RBA already shown as 'Bldg SF' above
  { key: 'far', label: 'FAR', defaultWidth: 60, defaultVisible: false, editable: false, renderCell: (_, row) => {
    if (!row?.rba || !row?.land_sf || row.land_sf === 0) return <span className="text-crm-muted">--</span>;
    return (row.rba / row.land_sf).toFixed(2);
  }},
  { key: 'cap_rate', label: 'Cap Rate', defaultWidth: 80, type: 'number', filterable: true, defaultVisible: false },
  { key: 'noi', label: 'NOI', defaultWidth: 100, format: 'currency', editType: 'number', defaultVisible: false },
  { key: 'owner_phone', label: 'Owner Phone', defaultWidth: 120, defaultVisible: false },
  { key: 'owner_email', label: 'Owner Email', defaultWidth: 160, editType: 'email', defaultVisible: false },
  { key: 'owner_mailing_address', label: 'Owner Mailing', defaultWidth: 180, defaultVisible: false },
  // Building details
  { key: 'parking_ratio', label: 'Parking Ratio', defaultWidth: 90, format: 'number', defaultVisible: false },
  { key: 'ceiling_ht', label: 'Ceiling Ht', defaultWidth: 80, format: 'number', defaultVisible: false },
  { key: 'column_spacing', label: 'Col Spacing', defaultWidth: 90, defaultVisible: false },
  { key: 'sprinklers', label: 'Sprinklers', defaultWidth: 80, defaultVisible: false },
  { key: 'construction_material', label: 'Construction', defaultWidth: 100, defaultVisible: false },
  { key: 'number_of_cranes', label: 'Cranes', defaultWidth: 70, format: 'number', defaultVisible: false },
  { key: 'rail_lines', label: 'Rail Lines', defaultWidth: 80, defaultVisible: false },
  { key: 'sewer', label: 'Sewer', defaultWidth: 80, defaultVisible: false },
  { key: 'water', label: 'Water', defaultWidth: 80, defaultVisible: false },
  { key: 'gas', label: 'Gas', defaultWidth: 80, defaultVisible: false },
  { key: 'heating', label: 'Heating', defaultWidth: 80, defaultVisible: false },
  { key: 'power', label: 'Power', defaultWidth: 80, defaultVisible: false },
  // Availability
  { key: 'total_available_sf', label: 'Available SF', defaultWidth: 100, type: 'number', filterable: true, format: 'number', editType: 'number', defaultVisible: false },
  { key: 'direct_available_sf', label: 'Direct Avail SF', defaultWidth: 110, format: 'number', defaultVisible: false },
  { key: 'direct_vacant_space', label: 'Direct Vacant', defaultWidth: 100, format: 'number', defaultVisible: false },
  { key: 'percent_leased', label: '% Leased', defaultWidth: 80, format: 'number', defaultVisible: false },
  { key: 'vacancy_pct', label: 'Vacancy %', defaultWidth: 80, type: 'number', filterable: true, format: 'number', defaultVisible: false },
  // Financial
  { key: 'last_sale_price', label: 'Last Sale Price', defaultWidth: 110, type: 'number', filterable: true, format: 'currency', defaultVisible: false },
  { key: 'last_sale_date', label: 'Last Sale Date', defaultWidth: 100, type: 'date', filterable: true, format: 'date', defaultVisible: false },
  { key: 'plsf', label: 'PLSF', defaultWidth: 70, format: 'currency', defaultVisible: false },
  { key: 'for_sale_price', label: 'Asking Sale Price', defaultWidth: 120, type: 'number', filterable: true, format: 'currency', editType: 'number', defaultVisible: false },
  { key: 'avg_weighted_rent', label: 'Avg Rent', defaultWidth: 90, format: 'currency', defaultVisible: false },
  { key: 'building_tax', label: 'Building Tax', defaultWidth: 120, defaultVisible: false },
  { key: 'building_opex', label: 'Bldg OpEx', defaultWidth: 120, defaultVisible: false },
  { key: 'ops_expense_psf', label: 'OpEx/SF', defaultWidth: 80, format: 'currency', defaultVisible: false },
  { key: 'costar_star_rating', label: 'CoStar Rating', defaultWidth: 100, format: 'number', defaultVisible: false },
  { key: 'loan_amount', label: 'Loan Amount', defaultWidth: 110, format: 'currency', defaultVisible: false },
  { key: 'debt_date', label: 'Debt Date', defaultWidth: 90, format: 'date', defaultVisible: false },
  // Ownership
  { key: 'owner_type', label: 'Owner Type', defaultWidth: 100, defaultVisible: false },
  { key: 'owner_contact', label: 'Owner Name', defaultWidth: 120, defaultVisible: false },
  { key: 'owner_user_or_investor', label: 'Owner/Investor', defaultWidth: 110, defaultVisible: false },
  { key: 'out_of_area_owner', label: 'Out of Area', defaultWidth: 80, format: 'bool', editType: 'boolean', defaultVisible: false },
  { key: 'office_courtesy', label: 'Office Courtesy', defaultWidth: 100, format: 'bool', editType: 'boolean', defaultVisible: false },
  // Broker
  { key: 'leasing_company', label: 'Leasing Co', defaultWidth: 120, defaultVisible: false },
  { key: 'broker_contact', label: 'Broker Name', defaultWidth: 120, defaultVisible: false },
  // Location / Parcel
  { key: 'parcel_number', label: 'APN', defaultWidth: 120, defaultVisible: false },
  { key: 'sb_county_zoning', label: 'SB Zoning', defaultWidth: 100, defaultVisible: false },
  { key: 'building_park', label: 'Building Park', defaultWidth: 120, defaultVisible: false },
  { key: 'market_name', label: 'Market', defaultWidth: 100, defaultVisible: false },
  { key: 'submarket_name', label: 'Submarket', defaultWidth: 100, defaultVisible: false },
  { key: 'submarket_cluster', label: 'Cluster', defaultWidth: 100, defaultVisible: false },
  { key: 'tenancy', label: 'Tenancy', defaultWidth: 80, defaultVisible: false },
  { key: 'off_market_deal', label: 'Off Market', defaultWidth: 80, format: 'bool', editType: 'boolean', defaultVisible: false },
  // Links / URLs
  { key: 'costar_url', label: 'CoStar', defaultWidth: 80, defaultVisible: false, format: 'url' },
  { key: 'landvision_url', label: 'Landvision', defaultWidth: 80, defaultVisible: false, format: 'url' },
  { key: 'google_maps_url', label: 'Google Maps', defaultWidth: 80, defaultVisible: false, format: 'url' },
  { key: 'zoning_map_url', label: 'Zoning Map', defaultWidth: 80, defaultVisible: false, format: 'url' },
  { key: 'lease_comp_count', label: 'Lease Comps', defaultWidth: 90, type: 'number', filterable: true, format: 'number', defaultVisible: false },
  { key: 'sale_comp_count', label: 'Sale Comps', defaultWidth: 90, type: 'number', filterable: true, format: 'number', defaultVisible: false },
  { key: 'building_status', label: 'Building Status', defaultWidth: 120, type: 'select', filterable: true, editType: 'select', editOptions: ['Existing', 'Under Construction', 'Proposed', 'Final Planning', 'Demolished', 'Abandoned'], filterOptions: ['Existing', 'Under Construction', 'Proposed', 'Final Planning', 'Demolished', 'Abandoned'], defaultVisible: false },
  { key: 'listing_first_seen_date', label: 'Listed Since', defaultWidth: 100, type: 'date', filterable: true, format: 'date', defaultVisible: false },
  { key: 'listing_url', label: 'Listing URL', defaultWidth: 80, defaultVisible: false, format: 'url' },
  // Linked record columns — role-specific (filterable: is_empty / is_not_empty applied client-side)
  { key: 'linked_owner_contacts', label: 'Owner Contact', defaultWidth: 160, defaultVisible: true, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="contact" labelKey="full_name" /> },
  { key: 'linked_broker_contacts', label: 'Broker Contact', defaultWidth: 160, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="contact" labelKey="full_name" /> },
  { key: 'linked_tenant_companies', label: 'Company Tenants', defaultWidth: 160, defaultVisible: true, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="company" labelKey="company_name" /> },
  { key: 'linked_owner_companies', label: 'Company Owner', defaultWidth: 160, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="company" labelKey="company_name" /> },
  { key: 'linked_leasing_companies', label: 'Leasing Company', defaultWidth: 160, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="company" labelKey="company_name" /> },
  { key: 'linked_deals', label: 'Deals', defaultWidth: 150, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="deal" labelKey="deal_name" /> },
  // Generic (all roles)
  { key: 'linked_contacts', label: 'All Contacts', defaultWidth: 150, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="contact" labelKey="full_name" /> },
  { key: 'linked_companies', label: 'All Companies', defaultWidth: 150, defaultVisible: false, filterable: true, type: 'text',
    renderCell: (val) => <LinkedChips items={val} type="company" labelKey="company_name" /> },
];

const PRIORITIES = ['Hot', 'Warm', 'Cold', 'Dead'];
const PROPERTY_TYPES = ['Office', 'Retail', 'Industrial', 'Multifamily', 'Land', 'Mixed-Use', 'Special Purpose'];

const PRIORITY_BORDERS = {
  Hot: 'border-l-2 border-l-red-500',
  Warm: 'border-l-2 border-l-orange-400',
  Cold: 'border-l-2 border-l-blue-400',
};

export default function Properties({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [activityModal, setActivityModal] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [filterBuilderOpen, setFilterBuilderOpen] = useState(false);
  const [newViewModalOpen, setNewViewModalOpen] = useState(false);
  const [reopenNewViewAfterFilter, setReopenNewViewAfterFilter] = useState(false);
  const view = useViewEngine('properties', ALL_COLUMNS);
  const [detailId, setDetailId] = useState(null);
  useDetailPanel(detailId);
  const [totalCount, setTotalCount] = useState(0);
  const { pivotFilter, dismiss: dismissPivot, mergeFilters: mergePivotFilters } = usePivotFilter('properties');

  const saveViewWithPivot = useCallback(async (name) => {
    const mergedFilters = pivotFilter?.ids?.length ? mergePivotFilters(view.filters) : view.filters;
    const result = await view.createNewView(name, { overrideFilters: mergedFilters });
    if (pivotFilter) dismissPivot();
    return result;
  }, [pivotFilter, view, mergePivotFilters, dismissPivot]);
  const [cityOptions, setCityOptions] = useState([]);

  // Fetch distinct cities once for dropdown filter
  useEffect(() => {
    query('SELECT DISTINCT city FROM properties WHERE city IS NOT NULL ORDER BY city')
      .then(r => setCityOptions((r.rows || []).map(x => x.city)))
      .catch(() => {});
  }, []);
  const { formulas, evaluateFormulas } = useFormulaColumns('properties');
  const { customColumns, allCustomColumns, hiddenFieldIds, addField, updateField, removeField, hideField, toggleCustomFieldVisibility, setValue, values } = useCustomFields('properties');

  const handlePhotoSave = useCallback(async (rowId, field, value) => {
    setRows((prev) => prev.map((r) =>
      r.property_id === rowId ? { ...r, [field]: value } : r
    ));
    try {
      await updateProperty(rowId, { [field]: value });
    } catch (err) {
      addToast(`Photo save failed: ${err.message}`, 'error', 4000);
    }
  }, [addToast]);

  const allColumnsWithActivity = useMemo(() => {
    const idx = ALL_COLUMNS.findIndex(c => c.defaultVisible === false);
    const photoCol = {
      key: 'building_image_path', label: 'Photo', defaultWidth: 140, editable: false,
      renderCell: (val, row) => (
        <PhotoUploadCell url={val} rowId={row.property_id} onSave={handlePhotoSave} folder="properties" field="building_image_path" />
      ),
    };
    const activityCol = {
      key: 'linked_interactions', label: 'Activity', defaultWidth: 220,
      renderCell: (val, row) => (
        <ActivityCellPreview
          interactions={val}
          onExpand={() => setActivityModal({ entityId: row.property_id, entityLabel: row.property_address || 'Property' })}
        />
      ),
    };
    // Inject dynamic filterOptions for city and county
    const result = ALL_COLUMNS.map(col => {
      if (col.key === 'city' && cityOptions.length > 0) {
        return { ...col, type: 'select', filterOptions: cityOptions };
      }
      return col;
    });
    // Insert photo after address (index 1)
    result.splice(1, 0, photoCol);
    const hiddenIdx = result.findIndex(c => c.defaultVisible === false);
    result.splice(hiddenIdx >= 0 ? hiddenIdx : result.length, 0, activityCol);
    return result;
  }, [cityOptions, handlePhotoSave]);

  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('properties', allColumnsWithActivity);
  const linked = useLinkedRecords('properties', rows);

  const augmentedRows = useMemo(() => {
    if (!rows.length) return rows;
    const augmented = rows.map((row) => {
      const allContacts = linked.linked_contacts?.[row.property_id] || [];
      const allCompanies = linked.linked_companies?.[row.property_id] || [];
      return {
        ...row,
        linked_owner_contacts: allContacts.filter(c => c.role === 'owner'),
        linked_broker_contacts: allContacts.filter(c => c.role === 'broker'),
        linked_tenant_companies: allCompanies.filter(c => c.role === 'tenant'),
        linked_owner_companies: allCompanies.filter(c => c.role === 'owner'),
        linked_leasing_companies: allCompanies.filter(c => c.role === 'leasing'),
        linked_contacts: allContacts,
        linked_companies: allCompanies,
        linked_deals: linked.linked_deals?.[row.property_id] || [],
        linked_interactions: linked.linked_interactions?.[row.property_id] || [],
        lease_comp_count: linked.linked_comp_counts?.[row.property_id]?.[0]?.lease_count || 0,
        sale_comp_count: linked.linked_comp_counts?.[row.property_id]?.[0]?.sale_count || 0,
      };
    });
    const { linkedFilters } = splitLinkedFilters(view.filters);
    return linkedFilters.length > 0 ? applyLinkedFilters(augmented, linkedFilters) : augmented;
  }, [rows, linked, view.filters]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Pivot filter overrides everything
      if (pivotFilter?.ids?.length) {
        const pivotWhere = { whereClause: 'WHERE property_id = ANY($1)', params: [pivotFilter.ids] };
        const [result, total] = await Promise.all([
          queryWithFilters('properties', {
            ...pivotWhere,
            orderBy: view.sort.column,
            order: view.sort.direction,
            limit: 500,
          }),
          countWithFilters('properties', pivotWhere),
        ]);
        setRows(result.rows || []);
        setTotalCount(total);
        if (onCountChange) onCountChange(result.rows?.length || 0);
      } else {
        // Merge view engine filters with quick-access dropdown filters
        let whereClause = view.sqlFilters?.whereClause || '';
        let params = [...(view.sqlFilters?.params || [])];

        const extraConds = [];
        if (filterType) {
          params.push(filterType);
          extraConds.push(`property_type = $${params.length}`);
        }
        if (filterPriority) {
          params.push(filterPriority);
          extraConds.push(`priority = $${params.length}`);
        }
        if (search) {
          params.push(`%${search}%`);
          const i = params.length;
          extraConds.push(`(property_address ILIKE $${i} OR owner_name ILIKE $${i} OR city ILIKE $${i} OR property_name ILIKE $${i})`);
        }

        if (extraConds.length) {
          const extraWhere = extraConds.join(' AND ');
          if (whereClause) {
            whereClause = whereClause.replace(/^WHERE\s+/i, 'WHERE (') + ') AND ' + extraWhere;
          } else {
            whereClause = 'WHERE ' + extraWhere;
          }
        }

        const mergedFilters = { whereClause, params };

        const [result, total] = await Promise.all([
          queryWithFilters('properties', {
            ...mergedFilters,
            orderBy: view.sort.column,
            order: view.sort.direction,
            limit: 500,
          }),
          countWithFilters('properties', mergedFilters),
        ]);
        setRows(result.rows || []);
        setTotalCount(total);
        if (onCountChange) onCountChange(result.rows?.length || 0);
      }
    } catch (err) {
      console.error('Failed to fetch properties:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterType, filterPriority, view.sort.column, view.sort.direction, view.sqlFilters, onCountChange, pivotFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const { newRecordId } = useLiveUpdates('property', fetchData);

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectOnly = (id) => setSelected(new Set([id]));

  const shiftSelect = (id) => {
    if (selected.size === 0) { setSelected(new Set([id])); return; }
    const lastId = [...selected].pop();
    const ids = augmentedRows.map(r => r.property_id);
    const a = ids.indexOf(lastId), b = ids.indexOf(id);
    if (a === -1 || b === -1) { setSelected(new Set([id])); return; }
    const [start, end] = a < b ? [a, b] : [b, a];
    setSelected(new Set(ids.slice(start, end + 1)));
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.property_id)));
    }
  };

  const deleteRow = async (id) => {
    if (!window.confirm('Delete this record? This cannot be undone.')) return;
    try {
      await bulkOps.delete('properties', [id]);
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      fetchData();
      addToast('Deleted', 'success');
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  };

  const handleBulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const count = selected.size;
    if (!window.confirm(`Delete ${count} selected ${count === 1 ? 'property' : 'properties'}? This cannot be undone.`)) return;
    try {
      const { deleted } = await bulkOps.delete('properties', [...selected]);
      addToast(`Deleted ${deleted} ${deleted === 1 ? 'property' : 'properties'}`, 'success');
      setSelected(new Set());
      fetchData();
    } catch (err) {
      addToast(`Delete failed: ${err.message}`, 'error');
    }
  }, [selected, fetchData, addToast]);

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

  const handleColumnFilter = useCallback((columnKey, conditions) => {
    const otherFilters = view.filters.filter(f => f.column !== columnKey);
    const merged = [...otherFilters, ...conditions];
    view.updateFilters(merged, view.filterLogic);
  }, [view]);

  const rowClassName = (row) => PRIORITY_BORDERS[row.priority] || '';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              Properties
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
              </div>
            )}
            <button
              onClick={() => setShowQuickAdd(true)}
              className="text-xs btn-primary px-3 py-1.5 flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Property
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex-1" />
          <div className="w-48 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search address, owner, city..."
              className="w-full bg-crm-hover border-0 rounded-[10px] pl-9 pr-3 py-2.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:ring-2 focus:ring-crm-accent/30"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
          >
            <option value="">All Types</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
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
          <button
            onClick={fetchData}
            className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      <ViewBar
        entityLabel="Properties"
        views={view.views}
        activeViewId={view.activeViewId}
        isDirty={view.isDirty}
        activeView={view.activeView}
        filters={view.filters}
        applyView={(id) => { dismissPivot(); setSearch(''); setFilterType(''); setFilterPriority(''); view.applyView(id); }}
        resetToAll={() => { dismissPivot(); setSearch(''); setFilterType(''); setFilterPriority(''); view.resetToAll(); }}
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
        <PivotButton rows={augmentedRows} linkedKey="linked_contacts" idField="contact_id" target="contacts" label="Contacts" sourceLabel={view.activeView?.view_name ? `From Properties: ${view.activeView.view_name}` : 'From Properties'} />
        <PivotButton rows={augmentedRows} linkedKey="linked_companies" idField="company_id" target="companies" label="Companies" sourceLabel={view.activeView?.view_name ? `From Properties: ${view.activeView.view_name}` : 'From Properties'} />
        <PivotButton rows={augmentedRows} linkedKey="linked_deals" idField="deal_id" target="deals" label="Deals" sourceLabel={view.activeView?.view_name ? `From Properties: ${view.activeView.view_name}` : 'From Properties'} />
      </FilterBar>
      <FilterBuilder
        isOpen={filterBuilderOpen}
        onClose={() => { setFilterBuilderOpen(false); if (reopenNewViewAfterFilter) { setReopenNewViewAfterFilter(false); setNewViewModalOpen(true); } }}
        columnDefs={allColumnsWithActivity}
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
        columnDefs={allColumnsWithActivity}
        visibleColumnKeys={view.visibleColumnKeys}
        onOpenFilterBuilder={() => { setReopenNewViewAfterFilter(true); setFilterBuilderOpen(true); }}
      />

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {!loading && augmentedRows.length === 0 && !search && !filterType && !filterPriority ? (
          <EmptyState entity="properties" entityLabel="Properties" onAdd={() => setShowQuickAdd(true)} addLabel="+ New Property" />
        ) : (
        <CrmTable
          tableKey="properties"
          newRecordId={newRecordId}
          columns={visibleColumns}
          rows={augmentedRows}
          idField="property_id"
          loading={loading}
          onRowClick={(row) => setDetailId(row.property_id)}
          onSort={view.handleSort}
          orderBy={view.sort.column}
          order={view.sort.direction}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          rowClassName={rowClassName}
          emptyMessage="No properties found"
          emptySubMessage="Try adjusting your filters or sync from Airtable"
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
        />
        )}
      </div>

      {/* Property Detail Slide-in */}
      {detailId && (
        <PropertyDetail
          propertyId={detailId}
          onClose={() => setDetailId(null)}
          onSave={() => { setDetailId(null); fetchData(); }}
          onRefresh={fetchData}
        />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="property"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Property created'); fetchData(); }}
        />
      )}

      {activityModal && (
        <ActivityModal
          entityType="property"
          entityId={activityModal.entityId}
          entityLabel={activityModal.entityLabel}
          onClose={() => setActivityModal(null)}
          onActivityCreated={fetchData}
        />
      )}
    </div>
  );
}
