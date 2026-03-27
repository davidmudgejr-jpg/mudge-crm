import React, { useState, useEffect } from 'react';
import {
  getInteraction, updateInteraction,
  getInteractionContacts, getInteractionProperties, getInteractionDeals,
} from '../api/database';
import TYPE_ICONS, { INTERACTION_TYPES, EMAIL_TYPES, getTypeInfo } from '../config/typeIcons';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import { SlideOverHeader } from '../components/shared/SlideOver';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import { formatDatePacific, formatTimePacific } from '../utils/timezone';

export function formatDate(val) {
  return formatDatePacific(val);
}

export function formatTime(val) {
  return formatTimePacific(val);
}

export default function InteractionDetail({ interactionId, id, onClose, onRefresh, isSlideOver }) {
  const resolvedId = id || interactionId;
  const [interaction, setInteraction] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const saveField = useAutoSave(updateInteraction, resolvedId, setInteraction, onRefresh);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    setError(null);
    try {
      const iRes = await getInteraction(resolvedId);
      const data = iRes.rows?.[0];
      if (!data) {
        setError('Interaction not found');
        setInteraction(null);
        setLoading(false);
        return;
      }
      setInteraction(data);

      const [cRes, pRes, dRes] = await Promise.allSettled([
        getInteractionContacts(resolvedId),
        getInteractionProperties(resolvedId),
        getInteractionDeals(resolvedId),
      ]);
      setContacts(cRes.status === 'fulfilled' ? cRes.value.rows || [] : []);
      setProperties(pRes.status === 'fulfilled' ? pRes.value.rows || [] : []);
      setDeals(dRes.status === 'fulfilled' ? dRes.value.rows || [] : []);
    } catch (err) {
      console.error('Failed to load interaction:', err);
      setError(err.message || 'Failed to load interaction');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [resolvedId]);

  const contactRecords = contacts.map((c) => ({
    id: c.contact_id,
    label: c.full_name,
    secondary: c.email_1,
  }));

  const propertyRecords = properties.map((p) => ({
    id: p.property_id,
    label: p.property_address,
    secondary: p.city,
  }));

  const dealRecords = deals.map((d) => ({
    id: d.deal_id,
    label: d.deal_name,
    secondary: d.status,
  }));

  if (loading) {
    if (isSlideOver) return <DetailSkeleton />;
    return (
      <div className="fixed inset-0 bg-crm-overlay z-40 flex justify-end animate-fade-in" onClick={onClose}>
        <div className="w-[480px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={e => e.stopPropagation()}>
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (error || !interaction) {
    const errorContent = (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-crm-muted">{error || 'Interaction not found'}</p>
        <button onClick={onClose} className="mt-4 text-xs text-crm-accent hover:underline">Close</button>
      </div>
    );
    if (isSlideOver) return errorContent;
    return (
      <div className="fixed inset-0 bg-crm-overlay z-40 flex justify-end animate-fade-in" onClick={onClose}>
        <div className="w-[480px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={e => e.stopPropagation()}>
          {errorContent}
        </div>
      </div>
    );
  }

  const typeInfo = getTypeInfo(interaction.type);

  const content = (
    <>
      <SlideOverHeader
        title={
          <span className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded flex items-center justify-center ${typeInfo.color}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={typeInfo.icon} />
              </svg>
            </span>
            {typeInfo.displayName || 'Interaction'}
          </span>
        }
        subtitle={`${formatDate(interaction.date) || ''}${formatTime(interaction.date) ? ` at ${formatTime(interaction.date)}` : ''}`}
        onClose={onClose}
      />

      {EMAIL_TYPES.some(t => t.toLowerCase() === (interaction.type || '').toLowerCase()) && (
        <Section title="Email">
          <InlineField label="Subject" value={interaction.email_heading} field="email_heading" onSave={saveField} />
          <InlineField label="Body" value={interaction.email_body} field="email_body" type="textarea" onSave={saveField} placeholder="No email body" />
        </Section>
      )}

      <Section title="Details" defaultOpen>
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Type" value={interaction.type} field="type" type="select" options={INTERACTION_TYPES} onSave={saveField} />
          <InlineField label="Team Member" value={interaction.team_member} field="team_member" onSave={saveField} />
          <InlineField label="Lead Source" value={interaction.lead_source} field="lead_source" onSave={saveField} />
          <InlineField label="Follow Up" value={interaction.follow_up} field="follow_up" type="date" onSave={saveField} />
          <InlineField label="Created" value={interaction.created_at} field="created_at" readOnly format={(v) => formatDatePacific(v)} />
        </div>

        <div className="mt-4 pt-3 border-t border-crm-border">
          <InlineField label="Notes" value={interaction.notes} field="notes" type="textarea" onSave={saveField} placeholder="Click to add notes..." />
        </div>
      </Section>

      <LinkedRecordSection title="Contacts" entityType="contact" records={contactRecords} defaultOpen={contacts.length > 0} sourceType="interaction" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Properties" entityType="property" records={propertyRecords} defaultOpen={properties.length > 0} sourceType="interaction" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Deals" entityType="deal" records={dealRecords} defaultOpen={deals.length > 0} sourceType="interaction" sourceId={resolvedId} onRefresh={loadData} />
    </>
  );

  if (isSlideOver) {
    return content;
  }

  return (
    <div className="fixed inset-0 bg-crm-overlay z-40 flex justify-end animate-fade-in" onClick={onClose}>
      <div
        className="relative w-[480px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
