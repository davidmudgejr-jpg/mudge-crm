import React, { useState, useEffect } from 'react';
import { getContact, updateContact, deleteContact, getContactInteractions, query } from '../api/database';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import NotesSection from '../components/shared/NotesSection';
import { formatDatePacific } from '../utils/timezone';
import TYPE_ICONS from '../config/typeIcons';
import NewInteractionModal from '../components/shared/NewInteractionModal';
import ActivitySection from '../components/shared/ActivitySection';

export const CONTACT_TYPES = ['Owner', 'Tenant', 'Landlord', 'Buyer', 'Seller', 'Investor', 'Developer', 'Broker', 'Lender', 'Attorney', 'Other'];
export const CLIENT_LEVEL_OPTIONS = ['A', 'B', 'C', 'D'];

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

export default function ContactDetail({ contactId, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || contactId;
  const handleDelete = async () => {
    if (!window.confirm('Delete this contact? This cannot be undone.')) return;
    await deleteContact(resolvedId);
    onSave?.();
  };
  const [contact, setContact] = useState(null);
  const [linkedProps, setLinkedProps] = useState([]);
  const [linkedCompanies, setLinkedCompanies] = useState([]);
  const [linkedCampaigns, setLinkedCampaigns] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewInteraction, setShowNewInteraction] = useState(false);

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
        <div className="w-[500px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
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
        <div className="w-[500px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
          {errorContent}
        </div>
      </div>
    );
  }

  const subtitle = (
    <span className="flex items-center gap-2">
      {contact.title && <span>{contact.title}</span>}
      {contact.type && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${TYPE_COLORS[contact.type] || 'bg-crm-border text-crm-muted'}`}>{contact.type}</span>}
    </span>
  );

  const content = (
    <>
      <SlideOverHeader title={contact.full_name || 'Unnamed'} subtitle={subtitle} onClose={onClose}>
        <button onClick={handleDelete} className="text-crm-muted hover:text-red-400 w-8 h-8 flex items-center justify-center rounded-md hover:bg-crm-hover transition-colors" title="Delete contact">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </SlideOverHeader>

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
          {/* AI Email Tracking Toggle */}
          <div className="col-span-2 mt-2 mb-1 px-1">
            <div className="flex items-center justify-between rounded-lg bg-crm-hover/50 border border-crm-border/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-base">📧</span>
                <div>
                  <div className="text-xs font-medium text-crm-text">Email Tracking</div>
                  <div className="text-[10px] text-crm-muted leading-tight">
                    {contact.track_emails
                      ? 'Postmaster auto-logs emails to/from this contact'
                      : 'Emails from this contact are not tracked'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  const newVal = !contact.track_emails;
                  saveField('track_emails', newVal);
                  // When turning ON, also set track_emails_since timestamp
                  if (newVal) saveField('track_emails_since', new Date().toISOString());
                }}
                className={`
                  relative w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none
                  ${contact.track_emails
                    ? 'bg-crm-accent'
                    : 'bg-crm-border'
                  }
                `}
              >
                <span
                  className={`
                    absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200
                    ${contact.track_emails ? 'translate-x-4' : 'translate-x-0'}
                  `}
                />
              </button>
            </div>
          </div>
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

      <ActivitySection interactions={interactions} onNewInteraction={() => setShowNewInteraction(true)} />

      {showNewInteraction && (
        <NewInteractionModal
          initialLinks={{ contact: [{ id: resolvedId, label: contact.full_name || 'Unnamed' }] }}
          onCreated={() => { setShowNewInteraction(false); loadData(); }}
          onClose={() => setShowNewInteraction(false)}
        />
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
      <div className="relative w-[500px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
