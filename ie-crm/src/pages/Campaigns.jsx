import React, { useState, useEffect, useCallback } from 'react';
import { getCampaigns, getCampaignContacts, query } from '../api/database';
import { useCustomFields } from '../hooks/useCustomFields';
import useColumnVisibility from '../hooks/useColumnVisibility';
import CrmTable from '../components/shared/CrmTable';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import QuickAddModal from '../components/shared/QuickAddModal';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import { useToast } from '../components/shared/Toast';
import { formatDatePacific, formatDateTimePacific } from '../utils/timezone';

const STATUS_COLORS = {
  Draft: 'bg-gray-500/20 text-gray-400',
  Scheduled: 'bg-blue-500/20 text-blue-400',
  Active: 'bg-green-500/20 text-green-400',
  Sent: 'bg-crm-accent/20 text-crm-accent',
  Completed: 'bg-emerald-500/20 text-emerald-400',
  Paused: 'bg-yellow-500/20 text-yellow-400',
};

const ALL_COLUMNS = [
  { key: 'name', label: 'Campaign', defaultWidth: 200 },
  { key: 'type', label: 'Type', defaultWidth: 100 },
  {
    key: 'status', label: 'Status', defaultWidth: 90,
    renderCell: (val) => val ? (
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[val] || 'bg-crm-border text-crm-muted'}`}>{val}</span>
    ) : <span className="text-crm-muted">--</span>,
  },
  { key: 'sent_date', label: 'Sent Date', defaultWidth: 100, format: 'date' },
  { key: 'assignee', label: 'Assignee', defaultWidth: 110 },
  { key: 'notes', label: 'Notes', defaultWidth: 200 },
  { key: 'day_time_hits', label: 'Day/Time Hits', defaultWidth: 120, defaultVisible: false },
  { key: 'modified', label: 'Modified', defaultWidth: 120, format: 'datetime' },
  { key: 'created_at', label: 'Created', defaultWidth: 120, format: 'datetime', defaultVisible: false },
];

const TYPES = ['Email', 'Direct Mail', 'Cold Call', 'Door Knock', 'SMS', 'Social Media', 'Event'];
const STATUSES = ['Draft', 'Scheduled', 'Active', 'Sent', 'Completed', 'Paused'];

// formatCell for CampaignDetail only (status badge in detail panel)
function formatCampaignStatus(value) {
  if (!value) return <span className="text-crm-muted">--</span>;
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[value] || 'bg-crm-border text-crm-muted'}`}>{value}</span>;
}

/* ───── Campaign Detail Slide-in ───── */
function CampaignDetail({ campaignId, onClose, onSave }) {
  const [campaign, setCampaign] = useState(null);
  const [linkedContacts, setLinkedContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});

  const loadData = async () => {
    setLoading(true);
    try {
      const [res, contactsRes] = await Promise.allSettled([
        query('SELECT * FROM campaigns WHERE campaign_id = $1', [campaignId]),
        getCampaignContacts(campaignId),
      ]);
      const c = res.status === 'fulfilled' ? (res.value.rows?.[0] || null) : null;
      setCampaign(c);
      if (c) setDraft({ ...c });
      setLinkedContacts(contactsRes.status === 'fulfilled' ? (contactsRes.value.rows || []) : []);
    } catch (err) {
      console.error('Failed to load campaign:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [campaignId]);

  const handleSave = async () => {
    try {
      await query(
        `UPDATE campaigns SET name=$1, type=$2, status=$3, notes=$4, sent_date=$5, modified=NOW() WHERE campaign_id=$6`,
        [draft.name, draft.type, draft.status, draft.notes, draft.sent_date || null, campaignId]
      );
      setEditing(false);
      onSave();
    } catch (err) {
      console.error('Failed to save campaign:', err);
    }
  };

  const handleDelete = async () => {
    try {
      await query('DELETE FROM campaigns WHERE campaign_id = $1', [campaignId]);
      onSave();
    } catch (err) {
      console.error('Failed to delete campaign:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-crm-overlay" />
      <div
        className="relative w-[500px] h-full bg-crm-sidebar border-l border-crm-border overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center h-40 text-crm-muted text-sm">Loading...</div>
        ) : !campaign ? (
          <div className="flex items-center justify-center h-40 text-crm-muted text-sm">Campaign not found</div>
        ) : (
          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex-1 min-w-0">
                {editing ? (
                  <input
                    value={draft.name || ''}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="text-lg font-semibold bg-crm-card border border-crm-border rounded px-2 py-1 w-full text-crm-text"
                  />
                ) : (
                  <h2 className="text-lg font-semibold truncate">{campaign.name || 'Untitled Campaign'}</h2>
                )}
                <p className="text-xs text-crm-muted mt-1">
                  Created {formatDatePacific(campaign.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-3">
                {editing ? (
                  <>
                    <button onClick={handleSave} className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white px-3 py-1.5 rounded transition-colors">Save</button>
                    <button onClick={() => { setEditing(false); setDraft({ ...campaign }); }} className="text-xs text-crm-muted hover:text-crm-text px-2 py-1.5 transition-colors">Cancel</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setEditing(true)} className="text-xs bg-crm-card border border-crm-border hover:border-crm-accent/50 text-crm-text px-3 py-1.5 rounded transition-colors">Edit</button>
                    <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300 px-2 py-1.5 transition-colors">Delete</button>
                  </>
                )}
                <button onClick={onClose} className="text-crm-muted hover:text-crm-text p-1 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-4">
              <Field label="Type" editing={editing}>
                {editing ? (
                  <select value={draft.type || ''} onChange={(e) => setDraft({ ...draft, type: e.target.value })} className="w-full bg-crm-card border border-crm-border rounded px-2 py-1.5 text-sm text-crm-text">
                    <option value="">--</option>
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                ) : (
                  <span>{campaign.type || '--'}</span>
                )}
              </Field>

              <Field label="Status" editing={editing}>
                {editing ? (
                  <select value={draft.status || ''} onChange={(e) => setDraft({ ...draft, status: e.target.value })} className="w-full bg-crm-card border border-crm-border rounded px-2 py-1.5 text-sm text-crm-text">
                    <option value="">--</option>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  formatCampaignStatus(campaign.status)
                )}
              </Field>

              <Field label="Sent Date" editing={editing}>
                {editing ? (
                  <input
                    type="date"
                    value={draft.sent_date ? draft.sent_date.slice(0, 10) : ''}
                    onChange={(e) => setDraft({ ...draft, sent_date: e.target.value })}
                    className="w-full bg-crm-card border border-crm-border rounded px-2 py-1.5 text-sm text-crm-text"
                  />
                ) : (
                  <span>{campaign.sent_date ? formatDatePacific(campaign.sent_date) : '--'}</span>
                )}
              </Field>

              <Field label="Notes" editing={editing}>
                {editing ? (
                  <textarea
                    value={draft.notes || ''}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    rows={4}
                    className="w-full bg-crm-card border border-crm-border rounded px-2 py-1.5 text-sm text-crm-text resize-none"
                  />
                ) : (
                  <span className="whitespace-pre-wrap text-sm">{campaign.notes || '--'}</span>
                )}
              </Field>

              <Field label="Last Modified">
                <span className="text-xs text-crm-muted">{formatDateTimePacific(campaign.modified)}</span>
              </Field>
            </div>

            <div className="mt-6">
              <LinkedRecordSection
                title="Contacts"
                entityType="contact"
                records={linkedContacts.map((c) => ({
                  id: c.contact_id,
                  label: c.full_name || 'Unnamed',
                  secondary: [c.type, c.phone_1].filter(Boolean).join(' · '),
                }))}
                defaultOpen={linkedContacts.length > 0}
                sourceType="campaign"
                sourceId={campaignId}
                onRefresh={() => { loadData(); onSave(); }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-crm-muted uppercase tracking-wider block mb-1">{label}</label>
      <div className="text-sm text-crm-text">{children}</div>
    </div>
  );
}

/* ───── Campaigns Page ───── */
export default function Campaigns({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [orderBy, setOrderBy] = useState('modified');
  const [order, setOrder] = useState('DESC');
  const [selected, setSelected] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const { customColumns, allCustomColumns, hiddenFieldIds, addField, updateField, removeField, hideField, toggleCustomFieldVisibility, setValue, values } = useCustomFields('campaigns');
  const { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, renameColumn } = useColumnVisibility('campaigns', ALL_COLUMNS);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getCampaigns({ limit: 500 });
      let filtered = result.rows || [];

      // Client-side filtering (getCampaigns doesn't support server-side filters)
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter((r) =>
          (r.name || '').toLowerCase().includes(q) ||
          (r.notes || '').toLowerCase().includes(q) ||
          (r.type || '').toLowerCase().includes(q)
        );
      }
      if (filterType) filtered = filtered.filter((r) => r.type === filterType);
      if (filterStatus) filtered = filtered.filter((r) => r.status === filterStatus);

      // Client-side sorting
      filtered.sort((a, b) => {
        const aVal = a[orderBy];
        const bVal = b[orderBy];
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;
        const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal) : (aVal > bVal ? 1 : -1);
        return order === 'ASC' ? cmp : -cmp;
      });

      setRows(filtered);
      setTotalCount(filtered.length);
      if (onCountChange) onCountChange(filtered.length);
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterType, filterStatus, orderBy, order, onCountChange]);

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
      setSelected(new Set(rows.map((r) => r.campaign_id)));
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Campaigns</h1>
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
              New Campaign
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
              placeholder="Search campaigns..."
              className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
          >
            <option value="">All Types</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
          >
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
          tableKey="campaigns"
          columns={visibleColumns}
          rows={rows}
          idField="campaign_id"
          loading={loading}
          onRowClick={(row) => setDetailId(row.campaign_id)}
          onSort={handleSort}
          orderBy={orderBy}
          order={order}
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          emptyMessage="No campaigns found"
          emptySubMessage="Create a new campaign to get started"
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

      {/* Campaign Detail Slide-in */}
      {detailId && (
        <CampaignDetail
          campaignId={detailId}
          onClose={() => setDetailId(null)}
          onSave={() => { setDetailId(null); fetchData(); }}
        />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="campaign"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Campaign created'); fetchData(); }}
        />
      )}
    </div>
  );
}
