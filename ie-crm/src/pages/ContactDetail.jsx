import React, { useState, useEffect } from 'react';
import { getContact, updateContact, getContactInteractions, query } from '../api/database';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import NotesSection from '../components/shared/NotesSection';
import InteractionDetail from './InteractionDetail';
import { formatDatePacific } from '../utils/timezone';
import TYPE_ICONS from '../config/typeIcons';

export const CONTACT_TYPES = ['Tenant', 'Landlord', 'Buyer', 'Seller', 'Investor', 'Developer', 'Broker', 'Lender', 'Attorney', 'Other'];
export const CLIENT_LEVEL_OPTIONS = ['A', 'B', 'C', 'D'];

export default function ContactDetail({ contactId, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || contactId;
  const [contact, setContact] = useState(null);
  const [linkedProps, setLinkedProps] = useState([]);
  const [linkedCompanies, setLinkedCompanies] = useState([]);
  const [linkedCampaigns, setLinkedCampaigns] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedInteraction, setSelectedInteraction] = useState(null);

  const saveField = useAutoSave(updateContact, resolvedId, setContact, onRefresh);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    setError(null);
    try {
      const c = await getContact(resolvedId);
      const data = c.rows?.[0];
      if (!data) {
        setError('Contact not found');
        setContact(null);
        setLoading(false);
        return;
      }
      setContact(data);

      const [props, comps, camps, iRes] = await Promise.allSettled([
        query(`SELECT p.property_id, p.property_address, p.city FROM properties p JOIN property_contacts pc ON p.property_id = pc.property_id WHERE pc.contact_id = $1`, [resolvedId]),
        query(`SELECT co.company_id, co.company_name FROM companies co JOIN contact_companies cc ON co.company_id = cc.company_id WHERE cc.contact_id = $1`, [resolvedId]),
        query(`SELECT ca.campaign_id, ca.name, ca.type, ca.status, ca.sent_date FROM campaigns ca JOIN campaign_contacts cc ON ca.campaign_id = cc.campaign_id WHERE cc.contact_id = $1`, [resolvedId]),
        getContactInteractions(resolvedId),
      ]);
      setLinkedProps(props.status === 'fulfilled' ? props.value.rows || [] : []);
      setLinkedCompanies(comps.status === 'fulfilled' ? comps.value.rows || [] : []);
      setLinkedCampaigns(camps.status === 'fulfilled' ? camps.value.rows || [] : []);
      setInteractions(iRes.status === 'fulfilled' ? iRes.value.rows || [] : []);
    } catch (err) {
      console.error('Failed to load contact:', err);
      setError(err.message || 'Failed to load contact');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [resolvedId]);

  const propertyRecords = linkedProps.map((p) => ({
    id: p.property_id,
    label: p.property_address || 'Untitled',
    secondary: p.city,
  }));

  const companyRecords = linkedCompanies.map((c) => ({
    id: c.company_id,
    label: c.company_name,
  }));

  const campaignRecords = linkedCampaigns.map((c) => ({
    id: c.campaign_id,
    label: c.name,
    secondary: [c.status, c.type].filter(Boolean).join(' · '),
  }));

  if (loading) {
    if (isSlideOver) return <DetailSkeleton />;
    return (
      <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
        <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
        <div className="w-[500px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (error || !contact) {
    const errorContent = (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-crm-muted">{error || 'Contact not found'}</p>
        <button onClick={onClose} className="mt-4 text-xs text-crm-accent hover:underline">Close</button>
      </div>
    );
    if (isSlideOver) return errorContent;
    return (
      <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
        <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
        <div className="w-[500px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
          {errorContent}
        </div>
      </div>
    );
  }

  const subtitle = [contact.title, contact.type].filter(Boolean).join(' · ');

  const content = (
    <>
      <SlideOverHeader title={contact.full_name || 'Unnamed'} subtitle={subtitle} onClose={onClose} />

      <Section title="Contact Info">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Full Name" value={contact.full_name} field="full_name" onSave={saveField} />
          <InlineField label="First Name" value={contact.first_name} field="first_name" onSave={saveField} />
          <InlineField label="Type" value={contact.type} field="type" type="select" options={CONTACT_TYPES} onSave={saveField} />
          <InlineField label="Title" value={contact.title} field="title" onSave={saveField} />
          <InlineField label="Email" value={contact.email} field="email" type="email" onSave={saveField} />
          <InlineField label="Email 2" value={contact.email_2} field="email_2" type="email" onSave={saveField} />
          <InlineField label="Phone 1" value={contact.phone_1} field="phone_1" type="phone" onSave={saveField} />
          <InlineField label="Phone 2" value={contact.phone_2} field="phone_2" type="phone" onSave={saveField} />
          <InlineField label="Phone Hot" value={contact.phone_hot} field="phone_hot" onSave={saveField} />
          <InlineField label="Email Hot" value={contact.email_hot} field="email_hot" onSave={saveField} />
          <InlineField label="LinkedIn" value={contact.linkedin} field="linkedin" type="url" onSave={saveField} />
          <InlineField label="Client Level" value={contact.client_level} field="client_level" type="select" options={CLIENT_LEVEL_OPTIONS} onSave={saveField} />
        </div>
      </Section>

      <Section title="Address">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Home Address" value={contact.home_address} field="home_address" onSave={saveField} />
          <InlineField label="Work Address" value={contact.work_address} field="work_address" onSave={saveField} />
          <InlineField label="Work City" value={contact.work_city} field="work_city" onSave={saveField} />
          <InlineField label="Work State" value={contact.work_state} field="work_state" onSave={saveField} />
          <InlineField label="Work Zip" value={contact.work_zip} field="work_zip" onSave={saveField} />
        </div>
      </Section>

      <Section title="Status">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Active Need" value={contact.active_need} field="active_need" onSave={saveField} />
          <InlineField label="Follow Up" value={contact.follow_up} field="follow_up" type="date" onSave={saveField} />
          <InlineField label="Last Contacted" value={contact.last_contacted} field="last_contacted" type="date" onSave={saveField} />
          <InlineField label="Data Source" value={contact.data_source} field="data_source" onSave={saveField} />
        </div>
      </Section>

      <Section title="Activity" badge={interactions.length} defaultOpen={interactions.length > 0}>
        {interactions.length === 0 ? (
          <p className="text-xs text-crm-muted">No interactions</p>
        ) : (
          <div className="space-y-1">
            {interactions.slice(0, 10).map((int) => {
              const typeInfo = TYPE_ICONS[int.type] || TYPE_ICONS.Other;
              return (
              <button
                key={int.interaction_id}
                onClick={() => setSelectedInteraction(int.interaction_id)}
                className="w-full flex gap-3 px-2 py-1.5 -mx-2 rounded-lg hover:bg-crm-card/60 transition-colors cursor-pointer text-left"
              >
                <div className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${typeInfo.color}`}>
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeInfo.icon} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">
                    {int.type === 'Note' && int.notes
                      ? (() => { const clean = int.notes.split(/\n\n---\s/)[0].trim(); return clean.length > 60 ? clean.slice(0, 60) + '...' : clean; })()
                      : <>{int.type}{int.email_heading ? ` — ${int.email_heading}` : ''}</>}
                  </div>
                  {int.type !== 'Note' && int.notes && <div className="text-xs text-crm-muted mt-0.5 line-clamp-2">{int.notes.split(/\n\n---\s/)[0].trim()}</div>}
                  <div className="text-[10px] text-crm-muted mt-0.5">{formatDatePacific(int.date) || ''}</div>
                </div>
              </button>
              );
            })}
          </div>
        )}
      </Section>

      {selectedInteraction && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setSelectedInteraction(null)}>
          <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
          <div className="relative w-[480px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
            <InteractionDetail id={selectedInteraction} onClose={() => setSelectedInteraction(null)} onRefresh={loadData} isSlideOver />
          </div>
        </div>
      )}

      <NotesSection entityType="contact" entityId={resolvedId} onRefresh={loadData} />

      <LinkedRecordSection title="Properties" entityType="property" records={propertyRecords} defaultOpen={linkedProps.length > 0} sourceType="contact" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Companies" entityType="company" records={companyRecords} defaultOpen={linkedCompanies.length > 0} sourceType="contact" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Campaigns" entityType="campaign" records={campaignRecords} defaultOpen={linkedCampaigns.length > 0} sourceType="contact" sourceId={resolvedId} onRefresh={loadData} />
    </>
  );

  if (isSlideOver) return content;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
      <div className="relative w-[500px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
