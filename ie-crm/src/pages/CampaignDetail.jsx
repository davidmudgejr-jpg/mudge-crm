import React, { useState, useEffect } from 'react';
import { getCampaign, updateCampaign, deleteCampaign, getCampaignContacts } from '../api/database';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import NotesSection from '../components/shared/NotesSection';
import { formatDatePacific } from '../utils/timezone';

const CAMPAIGN_TYPES = ['Email', 'Mailer', 'Cold Call', 'Door Knock', 'Event', 'Social', 'Other'];
const CAMPAIGN_STATUSES = ['Draft', 'Active', 'Sent', 'Completed', 'Paused'];

export default function CampaignDetail({ campaignId, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || campaignId;
  const handleDelete = async () => {
    if (!window.confirm('Delete this campaign? This cannot be undone.')) return;
    await deleteCampaign(resolvedId);
    onSave?.();
  };
  const [campaign, setCampaign] = useState(null);
  const [linkedContacts, setLinkedContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const saveField = useAutoSave(updateCampaign, resolvedId, setCampaign, onRefresh);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getCampaign(resolvedId);
      const data = res.rows?.[0];
      if (!data) {
        setError('Campaign not found');
        setCampaign(null);
        setLoading(false);
        return;
      }
      setCampaign(data);

      const [contacts] = await Promise.allSettled([
        getCampaignContacts(resolvedId),
      ]);
      setLinkedContacts(contacts.status === 'fulfilled' ? contacts.value.rows || [] : []);
    } catch (err) {
      console.error('Failed to load campaign:', err);
      setError(err.message || 'Failed to load campaign');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [resolvedId]);

  const contactRecords = linkedContacts.map((c) => ({
    id: c.contact_id,
    label: c.full_name,
    secondary: c.email,
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

  if (error || !campaign) {
    const errorContent = (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-crm-muted">{error || 'Campaign not found'}</p>
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

  const subtitle = [campaign.type, campaign.status].filter(Boolean).join(' · ');

  const content = (
    <>
      <SlideOverHeader title={campaign.name || 'Unnamed Campaign'} subtitle={subtitle} onClose={onClose}>
        <button onClick={handleDelete} className="text-crm-muted hover:text-red-400 w-8 h-8 flex items-center justify-center rounded-md hover:bg-crm-hover transition-colors" title="Delete campaign">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </SlideOverHeader>

      <Section title="Campaign Info">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Name" value={campaign.name} field="name" onSave={saveField} />
          <InlineField label="Type" value={campaign.type} field="type" type="select" options={CAMPAIGN_TYPES} onSave={saveField} />
          <InlineField label="Status" value={campaign.status} field="status" type="select" options={CAMPAIGN_STATUSES} onSave={saveField} />
          <InlineField label="Sent Date" value={campaign.sent_date} field="sent_date" type="date" onSave={saveField} />
          <InlineField label="Assignee" value={campaign.assignee} field="assignee" onSave={saveField} />
          <InlineField label="Day/Time Hits" value={campaign.day_time_hits} field="day_time_hits" onSave={saveField} />
        </div>
      </Section>

      <NotesSection entityType="campaign" entityId={resolvedId} onRefresh={loadData} />

      <LinkedRecordSection title="Contacts" entityType="contact" records={contactRecords} defaultOpen={linkedContacts.length > 0} sourceType="campaign" sourceId={resolvedId} onRefresh={loadData} />

      <Section title="Timestamps" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-x-4 text-xs text-crm-muted">
          <div>
            <span className="text-crm-muted/60">Created:</span>{' '}
            {formatDatePacific(campaign.created_at) || '—'}
          </div>
          <div>
            <span className="text-crm-muted/60">Modified:</span>{' '}
            {formatDatePacific(campaign.modified) || '—'}
          </div>
        </div>
      </Section>
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
