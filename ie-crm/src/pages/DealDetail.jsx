import React, { useState, useEffect } from 'react';
import { getDeal, updateDeal, deleteDeal, getDealProperties, getDealContacts, getDealCompanies, getDealCampaigns, getDealInteractions, getDealActionItems } from '../api/database';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import NotesSection from '../components/shared/NotesSection';
import TYPE_ICONS from '../config/typeIcons';
import { formatDatePacific } from '../utils/timezone';
import NewInteractionModal from '../components/shared/NewInteractionModal';
import ActivitySection from '../components/shared/ActivitySection';
import TasksSection from '../components/shared/TasksSection';
import LeadsSection from '../components/shared/LeadsSection';

export const STATUSES = ['Prospecting', 'Active', 'Under Contract', 'Closed', 'Dead'];
export const DEAL_TYPES = ['Lease', 'Sale', 'Acquisition', 'Disposition', 'Investment', 'Development'];

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

export default function DealDetail({ dealId, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || dealId;
  const handleDelete = async () => {
    if (!window.confirm('Delete this deal? This cannot be undone.')) return;
    await deleteDeal(resolvedId);
    onSave?.();
  };
  const [deal, setDeal] = useState(null);
  const [linkedProperties, setLinkedProperties] = useState([]);
  const [linkedContacts, setLinkedContacts] = useState([]);
  const [linkedCompanies, setLinkedCompanies] = useState([]);
  const [linkedCampaigns, setLinkedCampaigns] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewInteraction, setShowNewInteraction] = useState(false);

  const saveField = useAutoSave(updateDeal, resolvedId, setDeal, onRefresh);
  const parseInt0 = (v) => (v ? parseInt(v, 10) : null);
  const parseFloat0 = (v) => (v ? parseFloat(v) : null);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getDeal(resolvedId);
      const dealData = d.rows?.[0];
      if (!dealData) {
        setError('Deal not found');
        setDeal(null);
        setLoading(false);
        return;
      }
      setDeal(dealData);

      const [props, contacts, companies, campaigns, iRes, tRes] = await Promise.allSettled([
        getDealProperties(resolvedId),
        getDealContacts(resolvedId),
        getDealCompanies(resolvedId),
        getDealCampaigns(resolvedId),
        getDealInteractions(resolvedId),
        getDealActionItems(resolvedId),
      ]);
      setLinkedProperties(props.status === 'fulfilled' ? props.value.rows || [] : []);
      setLinkedContacts(contacts.status === 'fulfilled' ? contacts.value.rows || [] : []);
      setLinkedCompanies(companies.status === 'fulfilled' ? companies.value.rows || [] : []);
      setLinkedCampaigns(campaigns.status === 'fulfilled' ? campaigns.value.rows || [] : []);
      setInteractions(iRes.status === 'fulfilled' ? iRes.value.rows || [] : []);
      setTasks(tRes.status === 'fulfilled' ? tRes.value.rows || [] : []);
    } catch (err) {
      console.error('Failed to load deal:', err);
      setError(err.message || 'Failed to load deal');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [resolvedId]);

  const propertyRecords = linkedProperties.map((p) => ({
    id: p.property_id,
    label: p.property_address || 'Untitled',
    secondary: p.city,
  }));
  const contactRecords = linkedContacts.map((c) => ({
    id: c.contact_id,
    label: `${c.full_name}${c.type ? ` (${c.type})` : ''}`,
  }));
  const companyRecords = linkedCompanies.map((co) => ({
    id: co.company_id,
    label: co.company_name,
    secondary: co.city,
  }));
  const campaignRecords = linkedCampaigns.map((ca) => ({
    id: ca.campaign_id,
    label: ca.name,
    secondary: ca.sent_date ? formatDatePacific(ca.sent_date) : ca.status,
  }));

  if (loading) {
    if (isSlideOver) return <DetailSkeleton />;
    return (
      <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
        <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
        <div className="w-[520px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (error || !deal) {
    const errorContent = (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-crm-muted">{error || 'Deal not found'}</p>
        <button onClick={onClose} className="mt-4 text-xs text-crm-accent hover:underline">Close</button>
      </div>
    );
    if (isSlideOver) return errorContent;
    return (
      <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
        <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
        <div className="w-[520px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
          {errorContent}
        </div>
      </div>
    );
  }

  const content = (
    <>
      <SlideOverHeader
        title={deal.deal_name || 'Untitled Deal'}
        subtitle={<span className="flex items-center gap-2"><span>{deal.deal_type}</span>{deal.status && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[deal.status] || 'bg-crm-border text-crm-muted'}`}>{deal.status}</span>}</span>}
        onClose={onClose}
      >
        <button onClick={handleDelete} className="text-crm-muted hover:text-red-400 w-8 h-8 flex items-center justify-center rounded-md hover:bg-crm-hover transition-colors" title="Delete deal">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </SlideOverHeader>

      <DealPhoto url={deal.photo_url} dealId={resolvedId} onSaved={(url) => {
        setDeal(prev => ({ ...prev, photo_url: url }));
        updateDeal(resolvedId, { photo_url: url }).then(() => onRefresh?.());
      }} />

      <Section title="Deal Info">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Deal Name" value={deal.deal_name} field="deal_name" onSave={saveField} />
          <InlineField label="Type" value={deal.deal_type} field="deal_type" type="select" options={DEAL_TYPES} onSave={saveField} />
          <InlineField label="Status" value={deal.status} field="status" type="select" options={STATUSES} onSave={saveField} />
          <InlineField label="Source" value={deal.deal_source} field="deal_source" onSave={saveField} />
          <InlineField label="Repping" value={deal.repping} field="repping" onSave={saveField} />
          <InlineField label="Term" value={deal.term} field="term" onSave={saveField} />
          <InlineField label="Square Feet" value={deal.sf} field="sf" type="number" onSave={saveField} parse={parseInt0} format={(v) => v?.toLocaleString()} />
          <InlineField label="Rate" value={deal.rate} field="rate" type="number" onSave={saveField} parse={parseFloat0} format={(v) => v ? '$' + Number(v).toLocaleString() : null} />
          <InlineField label="Price" value={deal.price} field="price" type="number" onSave={saveField} parse={parseFloat0} format={(v) => v ? '$' + Number(v).toLocaleString() : null} />
          <InlineField label="Commission Rate" value={deal.commission_rate} field="commission_rate" type="number" onSave={saveField} parse={parseFloat0} format={(v) => v ? v + '%' : null} />
          <InlineField label="Gross Fee" value={deal.gross_fee_potential} field="gross_fee_potential" type="number" onSave={saveField} parse={parseFloat0} format={(v) => v ? '$' + Number(v).toLocaleString() : null} />
          <InlineField label="Net Potential" value={deal.net_potential} field="net_potential" type="number" onSave={saveField} parse={parseFloat0} format={(v) => v ? '$' + Number(v).toLocaleString() : null} />
          <InlineField label="Close Date" value={deal.close_date} field="close_date" type="date" onSave={saveField} />
          <InlineField label="Important Date" value={deal.important_date} field="important_date" type="date" onSave={saveField} />
        </div>
      </Section>

      <Section title="Status">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Priority Deal" value={deal.priority_deal} field="priority_deal" type="boolean" onSave={saveField} />
          <InlineField label="Dead Reason" value={deal.deal_dead_reason} field="deal_dead_reason" onSave={saveField} />
        </div>
      </Section>

      <ActivitySection interactions={interactions} onNewInteraction={() => setShowNewInteraction(true)} />

      <LeadsSection dealId={resolvedId} onAddLead={() => setShowNewInteraction(true)} onRefresh={loadData} />

      <TasksSection tasks={tasks} />

      {showNewInteraction && (
        <NewInteractionModal
          initialLinks={{ deal: [{ id: resolvedId, label: deal.deal_name || 'Untitled Deal' }] }}
          onCreated={() => { setShowNewInteraction(false); loadData(); }}
          onClose={() => setShowNewInteraction(false)}
        />
      )}

      <NotesSection entityType="deal" entityId={resolvedId} onRefresh={loadData} />

      <LinkedRecordSection title="Properties" entityType="property" records={propertyRecords} defaultOpen={linkedProperties.length > 0} sourceType="deal" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Contacts" entityType="contact" records={contactRecords} defaultOpen={linkedContacts.length > 0} sourceType="deal" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Companies" entityType="company" records={companyRecords} defaultOpen={linkedCompanies.length > 0} sourceType="deal" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Email Campaigns" entityType="campaign" records={campaignRecords} defaultOpen={linkedCampaigns.length > 0} sourceType="deal" sourceId={resolvedId} onRefresh={loadData} />
    </>
  );

  if (isSlideOver) return content;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
      <div className="relative w-[520px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function DealPhoto({ url, dealId, onSaved }) {
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef(null);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const token = localStorage.getItem('crm-auth-token');
      const res = await fetch(`${API}/api/files/upload?folder=deals`, {
        method: 'POST',
        body: form,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      onSaved(data.url);
    } catch (err) {
      console.error('[DealPhoto] Upload error:', err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (uploading) {
    return (
      <div className="px-5 py-3 flex items-center gap-2 text-crm-muted text-xs">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
        </svg>
        Uploading photo...
      </div>
    );
  }

  return (
    <div className="px-5 py-3">
      {url ? (
        <div className="relative group">
          <img
            src={url}
            alt=""
            className="w-full max-h-48 object-cover rounded-lg border border-crm-border cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => window.open(url, '_blank')}
          />
          <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => fileRef.current?.click()}
              className="px-2 py-1 text-[10px] rounded bg-crm-card/90 border border-crm-border text-crm-text hover:bg-crm-hover transition-colors"
            >
              Change
            </button>
            <button
              onClick={() => onSaved(null)}
              className="px-2 py-1 text-[10px] rounded bg-crm-card/90 border border-crm-border text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full py-4 rounded-lg border border-dashed border-crm-border text-crm-muted hover:border-crm-accent hover:text-crm-accent transition-colors text-xs flex items-center justify-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          Add deal photo
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  );
}
