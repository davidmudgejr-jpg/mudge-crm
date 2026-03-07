import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getProperties } from '../api/database';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import useLinkedRecords from '../hooks/useLinkedRecords';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import LinkedChips from '../components/shared/LinkedChips';
import PropertyDetail from './PropertyDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import { useToast } from '../components/shared/Toast';

const ALL_COLUMNS = [
  // Default visible
  { key: 'property_address', label: 'Address', defaultWidth: 200 },
  { key: 'city', label: 'City', defaultWidth: 100 },
  { key: 'county', label: 'County', defaultWidth: 90 },
  { key: 'property_type', label: 'Type', defaultWidth: 100 },
  { key: 'building_sqft', label: 'Bldg SF', defaultWidth: 80, format: 'number' },
  { key: 'lot_sqft', label: 'Lot SF', defaultWidth: 80, format: 'number' },
  { key: 'year_built', label: 'Year', defaultWidth: 60 },
  { key: 'owner_name', label: 'Owner', defaultWidth: 140 },
  { key: 'priority', label: 'Priority', defaultWidth: 80, format: 'priority' },
  { key: 'contacted', label: 'Contacted', defaultWidth: 120, format: 'tags' },
  { key: 'tags', label: 'Tags', defaultWidth: 120, format: 'tags' },
  // Hidden by default
  { key: 'property_name', label: 'Property Name', defaultWidth: 160, defaultVisible: false },
  { key: 'zip', label: 'ZIP', defaultWidth: 70, defaultVisible: false },
  { key: 'apn', label: 'APN', defaultWidth: 100, defaultVisible: false },
  { key: 'zoning', label: 'Zoning', defaultWidth: 80, defaultVisible: false },
  { key: 'units', label: 'Units', defaultWidth: 60, format: 'number', defaultVisible: false },
  { key: 'stories', label: 'Stories', defaultWidth: 60, format: 'number', defaultVisible: false },
  { key: 'parking_spaces', label: 'Parking', defaultWidth: 70, format: 'number', defaultVisible: false },
  { key: 'asking_price', label: 'Asking Price', defaultWidth: 110, format: 'currency', defaultVisible: false },
  { key: 'price_per_sqft', label: 'Price/SF', defaultWidth: 90, format: 'currency', defaultVisible: false },
  { key: 'rba', label: 'RBA', defaultWidth: 80, format: 'number', defaultVisible: false },
  { key: 'far', label: 'FAR', defaultWidth: 60, defaultVisible: false },
  { key: 'cap_rate', label: 'Cap Rate', defaultWidth: 80, defaultVisible: false },
  { key: 'noi', label: 'NOI', defaultWidth: 100, format: 'currency', defaultVisible: false },
  { key: 'owner_phone', label: 'Owner Phone', defaultWidth: 120, defaultVisible: false },
  { key: 'owner_email', label: 'Owner Email', defaultWidth: 160, defaultVisible: false },
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
  { key: 'total_available_sf', label: 'Total Avail SF', defaultWidth: 100, format: 'number', defaultVisible: false },
  { key: 'direct_available_sf', label: 'Direct Avail SF', defaultWidth: 110, format: 'number', defaultVisible: false },
  { key: 'direct_vacant_space', label: 'Direct Vacant', defaultWidth: 100, format: 'number', defaultVisible: false },
  { key: 'percent_leased', label: '% Leased', defaultWidth: 80, format: 'number', defaultVisible: false },
  { key: 'vacancy_pct', label: 'Vacancy %', defaultWidth: 80, format: 'number', defaultVisible: false },
  // Financial
  { key: 'last_sale_price', label: 'Last Sale Price', defaultWidth: 110, format: 'currency', defaultVisible: false },
  { key: 'last_sale_date', label: 'Last Sale Date', defaultWidth: 100, format: 'date', defaultVisible: false },
  { key: 'plsf', label: 'PLSF', defaultWidth: 70, format: 'currency', defaultVisible: false },
  { key: 'for_sale_price', label: 'For Sale Price', defaultWidth: 110, format: 'currency', defaultVisible: false },
  { key: 'avg_weighted_rent', label: 'Avg Rent', defaultWidth: 90, format: 'currency', defaultVisible: false },
  { key: 'building_tax', label: 'Building Tax', defaultWidth: 120, defaultVisible: false },
  { key: 'building_opex', label: 'Bldg OpEx', defaultWidth: 120, defaultVisible: false },
  { key: 'ops_expense_psf', label: 'OpEx/SF', defaultWidth: 80, format: 'currency', defaultVisible: false },
  { key: 'loan_amount', label: 'Loan Amount', defaultWidth: 110, format: 'currency', defaultVisible: false },
  { key: 'debt_date', label: 'Debt Date', defaultWidth: 90, format: 'date', defaultVisible: false },
  // Ownership
  { key: 'owner_type', label: 'Owner Type', defaultWidth: 100, defaultVisible: false },
  { key: 'owner_contact', label: 'Owner Contact', defaultWidth: 120, defaultVisible: false },
  { key: 'owner_user_or_investor', label: 'Owner/Investor', defaultWidth: 110, defaultVisible: false },
  { key: 'out_of_area_owner', label: 'Out of Area', defaultWidth: 80, format: 'bool', defaultVisible: false },
  { key: 'office_courtesy', label: 'Office Courtesy', defaultWidth: 100, format: 'bool', defaultVisible: false },
  // Broker
  { key: 'leasing_company', label: 'Leasing Co', defaultWidth: 120, defaultVisible: false },
  { key: 'broker_contact', label: 'Broker Contact', defaultWidth: 120, defaultVisible: false },
  // Location / Parcel
  { key: 'parcel_number', label: 'APN', defaultWidth: 120, defaultVisible: false },
  { key: 'sb_county_zoning', label: 'SB Zoning', defaultWidth: 100, defaultVisible: false },
  { key: 'building_park', label: 'Building Park', defaultWidth: 120, defaultVisible: false },
  { key: 'market_name', label: 'Market', defaultWidth: 100, defaultVisible: false },
  { key: 'submarket_name', label: 'Submarket', defaultWidth: 100, defaultVisible: false },
  { key: 'submarket_cluster', label: 'Cluster', defaultWidth: 100, defaultVisible: false },
  { key: 'tenancy', label: 'Tenancy', defaultWidth: 80, defaultVisible: false },
  { key: 'off_market_deal', label: 'Off Market', defaultWidth: 80, format: 'bool', defaultVisible: false },
  // Links / URLs
  { key: 'costar_url', label: 'CoStar', defaultWidth: 80, defaultVisible: false },
  { key: 'landvision_url', label: 'Landvision', defaultWidth: 80, defaultVisible: false },
  { key: 'google_maps_url', label: 'Google Maps', defaultWidth: 80, defaultVisible: false },
  { key: 'zoning_map_url', label: 'Zoning Map', defaultWidth: 80, defaultVisible: false },
  { key: 'listing_url', label: 'Listing', defaultWidth: 80, defaultVisible: false },
  // Linked record columns
  { key: 'linked_contacts', label: 'Contacts', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="contact" labelKey="full_name" /> },
  { key: 'linked_companies', label: 'Companies', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="company" labelKey="company_name" /> },
  { key: 'linked_deals', label: 'Deals', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="deal" labelKey="deal_name" /> },
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
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [orderBy, setOrderBy] = useState('created_at');
  const [order, setOrder] = useState('DESC');
  const [selected, setSelected] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const { formulas, evaluateFormulas } = useFormulaColumns('properties');
  const { customColumns, allCustomColumns, hiddenFieldIds, addField, updateField, removeField, hideField, toggleCustomFieldVisibility, setValue, values } = useCustomFields('properties');
  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('properties', ALL_COLUMNS);
  const linked = useLinkedRecords('properties', rows);

  const augmentedRows = useMemo(() => {
    if (!rows.length) return rows;
    return rows.map((row) => ({
      ...row,
      linked_contacts: linked.linked_contacts?.[row.property_id] || [],
      linked_companies: linked.linked_companies?.[row.property_id] || [],
      linked_deals: linked.linked_deals?.[row.property_id] || [],
    }));
  }, [rows, linked]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      if (filterType) filters.property_type = filterType;
      if (filterPriority) filters.priority = filterPriority;

      const result = await getProperties({ limit: 500, orderBy, order, filters });
      setRows(result.rows || []);
      const count = result.rows?.length || 0;
      setTotalCount(count);
      if (onCountChange) onCountChange(count);
    } catch (err) {
      console.error('Failed to fetch properties:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterType, filterPriority, orderBy, order, onCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key) => {
    if (orderBy === key) {
      setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setOrderBy(key);
      setOrder('ASC');
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.property_id)));
    }
  };

  const rowClassName = (row) => PRIORITY_BORDERS[row.priority] || '';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Properties</h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} records</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">
                {selected.size} selected
              </span>
            )}
            <button
              onClick={() => setShowQuickAdd(true)}
              className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
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
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search address, owner, city..."
              className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
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
          <button
            onClick={fetchData}
            className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <CrmTable
          tableKey="properties"
          columns={visibleColumns}
          rows={augmentedRows}
          idField="property_id"
          loading={loading}
          onRowClick={(row) => setDetailId(row.property_id)}
          onSort={handleSort}
          orderBy={orderBy}
          order={order}
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
        />
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
    </div>
  );
}
