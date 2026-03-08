import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getContacts, linkRecords } from '../api/database';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import useLinkedRecords from '../hooks/useLinkedRecords';
import useDetailPanel from '../hooks/useDetailPanel';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import LinkedChips from '../components/shared/LinkedChips';
import ContactDetail from './ContactDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import LinkPickerModal from '../components/shared/LinkPickerModal';
import ActivityCellPreview from '../components/shared/ActivityCellPreview';
import ActivityModal from '../components/shared/ActivityModal';
import { useToast } from '../components/shared/Toast';

const TYPE_COLORS = {
  Owner: 'bg-green-500/20 text-green-400',
  Tenant: 'bg-yellow-500/20 text-yellow-400',
  Landlord: 'bg-teal-500/20 text-teal-400',
  Buyer: 'bg-blue-500/20 text-blue-400',
  Seller: 'bg-orange-500/20 text-orange-400',
  Investor: 'bg-purple-500/20 text-purple-400',
  Developer: 'bg-indigo-500/20 text-indigo-400',
  Broker: 'bg-cyan-500/20 text-cyan-400',
  Lender: 'bg-rose-500/20 text-rose-400',
  Attorney: 'bg-slate-500/20 text-slate-400',
  Other: 'bg-gray-500/20 text-gray-400',
};

const LEVEL_COLORS = { A: 'text-crm-success', B: 'text-yellow-400', C: 'text-crm-muted', D: 'text-red-400' };

const ALL_COLUMNS = [
  // Default visible
  { key: 'full_name', label: 'Name', defaultWidth: 160 },
  {
    key: 'type', label: 'Type', defaultWidth: 90,
    renderCell: (val) => val ? (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[val] || 'bg-crm-border text-crm-muted'}`}>{val}</span>
    ) : <span className="text-crm-muted">--</span>,
  },
  { key: 'title', label: 'Title', defaultWidth: 140 },
  { key: 'email', label: 'Email', defaultWidth: 180, format: 'email' },
  { key: 'phone_1', label: 'Phone', defaultWidth: 120, format: 'phone' },
  {
    key: 'client_level', label: 'Level', defaultWidth: 80,
    renderCell: (val) => val ? (
      <span className={`font-semibold ${LEVEL_COLORS[val] || 'text-crm-muted'}`}>{val}</span>
    ) : <span className="text-crm-muted">--</span>,
  },
  { key: 'last_contacted', label: 'Last Contact', defaultWidth: 100, format: 'date' },
  { key: 'follow_up', label: 'Follow Up', defaultWidth: 100, format: 'date' },
  { key: 'tags', label: 'Tags', defaultWidth: 120, format: 'tags' },
  // Hidden by default
  { key: 'first_name', label: 'First Name', defaultWidth: 120, defaultVisible: false },
  { key: 'email_2', label: 'Email 2', defaultWidth: 180, format: 'email', defaultVisible: false },
  { key: 'phone_2', label: 'Phone 2', defaultWidth: 120, format: 'phone', defaultVisible: false },
  { key: 'phone_hot', label: 'Phone Hot', defaultWidth: 80, format: 'bool', defaultVisible: false },
  { key: 'email_hot', label: 'Email Hot', defaultWidth: 80, format: 'bool', defaultVisible: false },
  { key: 'linkedin', label: 'LinkedIn', defaultWidth: 160, defaultVisible: false },
  { key: 'active_need', label: 'Active Need', defaultWidth: 140, defaultVisible: false },
  { key: 'home_address', label: 'Home Address', defaultWidth: 180, defaultVisible: false },
  { key: 'work_address', label: 'Work Address', defaultWidth: 180, defaultVisible: false },
  { key: 'work_city', label: 'Work City', defaultWidth: 100, defaultVisible: false },
  { key: 'work_state', label: 'Work State', defaultWidth: 80, defaultVisible: false },
  { key: 'work_zip', label: 'Work ZIP', defaultWidth: 70, defaultVisible: false },
  { key: 'data_source', label: 'Source', defaultWidth: 100, defaultVisible: false },
  { key: 'email_3', label: 'Email 3', defaultWidth: 180, format: 'email', defaultVisible: false },
  { key: 'phone_3', label: 'Phone 3', defaultWidth: 120, format: 'phone', defaultVisible: false },
  { key: 'email_kickback', label: 'Email Kickback', defaultWidth: 100, format: 'bool', defaultVisible: false },
  { key: 'born', label: 'Birthday', defaultWidth: 90, format: 'date', defaultVisible: false },
  { key: 'age', label: 'Age', defaultWidth: 50, format: 'number', defaultVisible: false },
  // Research links
  { key: 'white_pages_url', label: 'White Pages', defaultWidth: 80, defaultVisible: false },
  { key: 'been_verified_url', label: 'Been Verified', defaultWidth: 80, defaultVisible: false },
  { key: 'zoom_info_url', label: 'ZoomInfo', defaultWidth: 80, defaultVisible: false },
  // Tenant intel
  { key: 'property_type_interest', label: 'Property Interest', defaultWidth: 120, defaultVisible: false },
  { key: 'lease_months_left', label: 'Lease Mo Left', defaultWidth: 100, format: 'number', defaultVisible: false },
  { key: 'tenant_space_fit', label: 'Space Fit', defaultWidth: 100, defaultVisible: false },
  { key: 'tenant_ownership_intent', label: 'Own/Lease', defaultWidth: 90, defaultVisible: false },
  { key: 'business_trajectory', label: 'Trajectory', defaultWidth: 90, defaultVisible: false },
  // Outreach intel
  { key: 'last_call_outcome', label: 'Last Call', defaultWidth: 100, defaultVisible: false },
  { key: 'follow_up_behavior', label: 'Follow-Up', defaultWidth: 100, defaultVisible: false },
  { key: 'decision_authority', label: 'Authority', defaultWidth: 100, defaultVisible: false },
  { key: 'price_cost_awareness', label: 'Price Aware', defaultWidth: 100, defaultVisible: false },
  { key: 'frustration_signals', label: 'Frustrations', defaultWidth: 100, defaultVisible: false },
  { key: 'exit_trigger_events', label: 'Exit Triggers', defaultWidth: 100, defaultVisible: false },
  // Linked record columns
  { key: 'linked_properties', label: 'Properties', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="property" labelKey="property_address" /> },
  { key: 'linked_companies', label: 'Companies', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="company" labelKey="company_name" /> },
  { key: 'linked_deals', label: 'Deals', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="deal" labelKey="deal_name" /> },
  { key: 'linked_campaigns', label: 'Campaigns', defaultWidth: 150, defaultVisible: false,
    renderCell: (val) => <LinkedChips items={val} type="campaign" labelKey="campaign_name" /> },
];

const CONTACT_TYPES = ['Owner', 'Broker', 'Tenant', 'Investor', 'Vendor', 'Attorney', 'Lender', 'Other'];

export default function Contacts({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCampaignPicker, setShowCampaignPicker] = useState(false);
  const [activityModal, setActivityModal] = useState(null);
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
  const { formulas } = useFormulaColumns('contacts');
  const { customColumns, allCustomColumns, hiddenFieldIds, addField, updateField, removeField, hideField, toggleCustomFieldVisibility, setValue, values } = useCustomFields('contacts');

  const allColumnsWithActivity = useMemo(() => {
    const idx = ALL_COLUMNS.findIndex(c => c.defaultVisible === false);
    const activityCol = {
      key: 'linked_interactions', label: 'Activity', defaultWidth: 220,
      renderCell: (val, row) => (
        <ActivityCellPreview
          interactions={val}
          onExpand={() => setActivityModal({ entityId: row.contact_id, entityLabel: row.full_name || 'Contact' })}
        />
      ),
    };
    const result = [...ALL_COLUMNS];
    result.splice(idx >= 0 ? idx : result.length, 0, activityCol);
    return result;
  }, []);

  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('contacts', allColumnsWithActivity);
  const linked = useLinkedRecords('contacts', rows);

  const augmentedRows = useMemo(() => {
    if (!rows.length) return rows;
    return rows.map((row) => ({
      ...row,
      linked_properties: linked.linked_properties?.[row.contact_id] || [],
      linked_companies: linked.linked_companies?.[row.contact_id] || [],
      linked_deals: linked.linked_deals?.[row.contact_id] || [],
      linked_campaigns: linked.linked_campaigns?.[row.contact_id] || [],
      linked_interactions: linked.linked_interactions?.[row.contact_id] || [],
    }));
  }, [rows, linked]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      if (filterType) filters.type = filterType;
      const result = await getContacts({ limit: 500, orderBy, order, filters });
      setRows(result.rows || []);
      const count = result.rows?.length || 0;
      setTotalCount(count);
      if (onCountChange) onCountChange(count);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterType, orderBy, order, onCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (key) => {
    if (orderBy === key) setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    else { setOrderBy(key); setOrder('ASC'); }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleAll = () => {
    selected.size === rows.length ? setSelected(new Set()) : setSelected(new Set(rows.map((r) => r.contact_id)));
  };

  const handleBulkCampaign = async (campaignId) => {
    setShowCampaignPicker(false);
    try {
      await Promise.all(
        [...selected].map((contactId) =>
          linkRecords('campaign_contacts', 'campaign_id', campaignId, 'contact_id', contactId)
        )
      );
      addToast(`${selected.size} contact(s) added to campaign`);
      setSelected(new Set());
    } catch (err) {
      console.error('Bulk campaign assign failed:', err);
      addToast('Failed to assign contacts to campaign');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Contacts</h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} records</p>
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <>
                <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">{selected.size} selected</span>
                <button
                  onClick={() => setShowCampaignPicker(true)}
                  className="text-xs bg-crm-card border border-crm-border hover:border-crm-accent/50 text-crm-text font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Add to Campaign
                </button>
              </>
            )}
            <button
              onClick={() => setShowQuickAdd(true)}
              className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Contact
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone..."
              className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50" />
          </div>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50">
            <option value="">All Types</option>
            {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
          tableKey="contacts"
          columns={visibleColumns}
          rows={augmentedRows}
          idField="contact_id"
          loading={loading}
          onRowClick={(row) => setDetailId(row.contact_id)}
          onSort={handleSort}
          orderBy={orderBy}
          order={order}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          emptyMessage="No contacts found"
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

      {detailId && (
        <ContactDetail contactId={detailId} onClose={() => setDetailId(null)} onSave={() => { setDetailId(null); fetchData(); }} onRefresh={fetchData} />
      )}

      {showCampaignPicker && (
        <LinkPickerModal
          entityType="campaign"
          onLink={handleBulkCampaign}
          onClose={() => setShowCampaignPicker(false)}
        />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="contact"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Contact created'); fetchData(); }}
        />
      )}

      {activityModal && (
        <ActivityModal
          entityType="contact"
          entityId={activityModal.entityId}
          entityLabel={activityModal.entityLabel}
          onClose={() => setActivityModal(null)}
          onActivityCreated={fetchData}
        />
      )}
    </div>
  );
}
