import React, { useState, useEffect } from 'react';
import {
  getInteraction, updateInteraction,
  getInteractionContacts, getInteractionProperties, getInteractionDeals,
} from '../api/database';
import TYPE_ICONS, { INTERACTION_TYPES } from '../config/typeIcons';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import { SlideOverHeader } from '../components/shared/SlideOver';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import NotesSection from '../components/shared/NotesSection';

export function formatDate(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return String(val); }
}

export function formatTime(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return null; }
}

export default function InteractionDetail({ interactionId, id, onClose, onRefresh, isSlideOver }) {
  const resolvedId = id || interactionId;
  const [interaction, setInteraction] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [properties, setProperties] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);

  const saveField = useAutoSave(updateInteraction, resolvedId, setInteraction, onRefresh);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    try {
      const [iRes, cRes, pRes, dRes] = await Promise.all([
        getInteraction(resolvedId),
        getInteractionContacts(resolvedId),
        getInteractionProperties(resolvedId),
        getInteractionDeals(resolvedId),
      ]);
      setInteraction(iRes.rows[0] || null);
      setContacts(cRes.rows || []);
      setProperties(pRes.rows || []);
      setDeals(dRes.rows || []);
    } catch (err) {
      console.error('Failed to load interaction:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [resolvedId]);

  const contactRecords = contacts.map((c) => ({
    id: c.contact_id,
    label: c.full_name,
    secondary: c.email,
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

  if (loading || !interaction) {
    if (isSlideOver) return <DetailSkeleton />;
    return (
      <div className="fixed inset-0 bg-crm-overlay z-40 flex justify-end animate-fade-in" onClick={onClose}>
        <div className="w-[480px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={e => e.stopPropagation()}>
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  const typeInfo = TYPE_ICONS[interaction.type] || TYPE_ICONS.Other;

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
            {interaction.type || 'Interaction'}
          </span>
        }
        subtitle={`${formatDate(interaction.date) || ''}${formatTime(interaction.date) ? ` at ${formatTime(interaction.date)}` : ''}`}
        onClose={onClose}
      />

      <Section title="Email">
        <InlineField label="Subject" value={interaction.email_heading} field="email_heading" onSave={saveField} />
        <InlineField label="Body" value={interaction.email_body} field="email_body" type="textarea" onSave={saveField} placeholder="No email body" />
      </Section>

      <NotesSection entityType="interaction" entityId={resolvedId} />

      <Section title="Details">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Type" value={interaction.type} field="type" type="select" options={INTERACTION_TYPES} onSave={saveField} />
          <InlineField label="Team Member" value={interaction.team_member} field="team_member" onSave={saveField} />
          <InlineField label="Lead Source" value={interaction.lead_source} field="lead_source" onSave={saveField} />
          <InlineField label="Follow Up" value={interaction.follow_up} field="follow_up" type="date" onSave={saveField} />
          <InlineField label="Created" value={interaction.created_at} field="created_at" readOnly format={(v) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null} />
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
        className="relative w-[480px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
