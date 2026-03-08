import React, { useState, useEffect } from 'react';
import { getDeal, updateDeal, deleteDeal, getDealProperties, getDealContacts, getDealCompanies, getDealInteractions, getDealActionItems } from '../api/database';
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
import InteractionDetail from './InteractionDetail';
import ActivitySection from '../components/shared/ActivitySection';
import TasksSection from '../components/shared/TasksSection';

export const STATUSES = ['Prospecting', 'Active', 'Under Contract', 'Closed', 'Dead'];
export const DEAL_TYPES = ['Lease', 'Sale', 'Acquisition', 'Disposition', 'Investment', 'Development'];

const STATUS_COLORS = {
  Active: 'bg-green-500/20 text-green-400',
  Lead: 'bg-cyan-500/20 text-cyan-400',
  Prospect: 'bg-yellow-500/20 text-yellow-400',
  Prospecting: 'bg-yellow-500/20 text-yellow-400',
  'Long Leads': 'bg-orange-500/20 text-orange-400',
  'Under Contract': 'bg-blue-500/20 text-blue-400',
  Closed: 'bg-purple-500/20 text-purple-400',
  'Deal fell through': 'bg-red-500/20 text-red-400',
  Dead: 'bg-gray-500/20 text-gray-400',
  'Dead Lead': 'bg-gray-500/20 text-gray-400',
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
  const [interactions, setInteractions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewInteraction, setShowNewInteraction] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState(null);

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

      const [props, contacts, companies, iRes, tRes] = await Promise.allSettled([
        getDealProperties(resolvedId),
        getDealContacts(resolvedId),
        getDealCompanies(resolvedId),
        getDealInteractions(resolvedId),
        getDealActionItems(resolvedId),
      ]);
      setLinkedProperties(props.status === 'fulfilled' ? props.value.rows || [] : []);
      setLinkedContacts(contacts.status === 'fulfilled' ? contacts.value.rows || [] : []);
      setLinkedCompanies(companies.status === 'fulfilled' ? companies.value.rows || [] : []);
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

  if (loading) {
    if (isSlideOver) return <DetailSkeleton />;
    return (
      <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
        <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
        <div className="w-[520px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
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
        <div className="w-[520px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
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

      <ActivitySection interactions={interactions} onNewInteraction={() => setShowNewInteraction(true)} onSelectInteraction={(id) => setSelectedInteraction(id)} />

      <TasksSection tasks={tasks} />

      {selectedInteraction && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedInteraction(null)}>
          <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
          <div className="relative w-[480px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <InteractionDetail id={selectedInteraction} onClose={() => setSelectedInteraction(null)} onRefresh={loadData} isSlideOver />
          </div>
        </div>
      )}

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
    </>
  );

  if (isSlideOver) return content;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
      <div className="relative w-[520px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
