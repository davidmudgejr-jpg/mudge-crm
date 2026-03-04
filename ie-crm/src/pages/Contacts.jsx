import React, { useState, useEffect, useCallback } from 'react';
import { getContacts } from '../api/database';
import { useFormulaColumns } from '../hooks/useFormulaColumns';
import { useCustomFields } from '../hooks/useCustomFields';
import CrmTable from '../components/shared/CrmTable';
import ContactDetail from './ContactDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import { useToast } from '../components/shared/Toast';

const TYPE_COLORS = {
  Owner: 'bg-blue-500/20 text-blue-400',
  Broker: 'bg-purple-500/20 text-purple-400',
  Tenant: 'bg-green-500/20 text-green-400',
  Investor: 'bg-yellow-500/20 text-yellow-400',
};

const LEVEL_COLORS = { A: 'text-crm-success', B: 'text-yellow-400', C: 'text-crm-muted', D: 'text-red-400' };

const COLUMNS = [
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
];

const CONTACT_TYPES = ['Owner', 'Broker', 'Tenant', 'Investor', 'Vendor', 'Attorney', 'Lender', 'Other'];

export default function Contacts({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [orderBy, setOrderBy] = useState('created_at');
  const [order, setOrder] = useState('DESC');
  const [selected, setSelected] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const { formulas } = useFormulaColumns('contacts');
  const { customColumns, addField, updateField, removeField, setValue, values } = useCustomFields('contacts');

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
              <span className="text-xs text-crm-accent bg-crm-accent/10 px-2 py-1 rounded">{selected.size} selected</span>
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
          <button onClick={fetchData} className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors">Refresh</button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <CrmTable
          tableKey="contacts"
          columns={COLUMNS}
          rows={rows}
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
          customColumns={customColumns}
          customValues={values}
          onCustomCellChange={setValue}
          onAddField={addField}
          onRenameField={(id, name) => updateField(id, { name })}
          onDeleteField={removeField}
        />
      </div>

      {detailId && (
        <ContactDetail contactId={detailId} onClose={() => setDetailId(null)} onSave={() => { setDetailId(null); fetchData(); }} onRefresh={fetchData} />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="contact"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Contact created'); fetchData(); }}
        />
      )}
    </div>
  );
}
