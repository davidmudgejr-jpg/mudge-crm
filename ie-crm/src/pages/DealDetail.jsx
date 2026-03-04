import React, { useState, useEffect } from 'react';
import { getDeal, updateDeal, getDealProperties, getDealContacts, getDealCompanies, getDealInteractions } from '../api/database';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import NotesSection from '../components/shared/NotesSection';

export const STATUSES = ['Prospecting', 'Active', 'Under Contract', 'Closed', 'Dead'];
export const DEAL_TYPES = ['Lease', 'Sale', 'Acquisition', 'Disposition', 'Investment', 'Development'];

export default function DealDetail({ dealId, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || dealId;
  const [deal, setDeal] = useState(null);
  const [linkedProperties, setLinkedProperties] = useState([]);
  const [linkedContacts, setLinkedContacts] = useState([]);
  const [linkedCompanies, setLinkedCompanies] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);

  const saveField = useAutoSave(updateDeal, resolvedId, setDeal, onRefresh);
  const parseInt0 = (v) => (v ? parseInt(v, 10) : null);
  const parseFloat0 = (v) => (v ? parseFloat(v) : null);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    try {
      const [d, props, contacts, companies, iRes] = await Promise.all([
        getDeal(resolvedId),
        getDealProperties(resolvedId),
        getDealContacts(resolvedId),
        getDealCompanies(resolvedId),
        getDealInteractions(resolvedId),
      ]);
      const dealData = d.rows[0];
      setDeal(dealData);
      setLinkedProperties(props.rows || []);
      setLinkedContacts(contacts.rows || []);
      setLinkedCompanies(companies.rows || []);
      setInteractions(iRes.rows || []);
    } catch (err) {
      console.error('Failed to load deal:', err);
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

  if (loading || !deal) {
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

  const content = (
    <>
      <SlideOverHeader
        title={deal.deal_name || 'Untitled Deal'}
        subtitle={<span className="flex items-center gap-2"><span>{deal.deal_type}</span><span>{deal.status}</span></span>}
        onClose={onClose}
      />

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

      <Section title="Activity" badge={interactions.length} defaultOpen={interactions.length > 0}>
        {interactions.length === 0 ? (
          <p className="text-xs text-crm-muted">No interactions</p>
        ) : (
          <div className="space-y-2">
            {interactions.slice(0, 10).map((int) => (
              <div key={int.interaction_id} className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-crm-accent mt-1.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{int.type}{int.email_heading ? ` — ${int.email_heading}` : ''}</div>
                  {int.notes && <div className="text-xs text-crm-muted mt-0.5 line-clamp-2">{int.notes}</div>}
                  <div className="text-[10px] text-crm-muted mt-0.5">{int.date ? new Date(int.date).toLocaleDateString() : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <NotesSection entityType="deal" entityId={resolvedId} />

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
