import React, { useState, useEffect } from 'react';
import { getActionItem, updateActionItem, getActionItemContacts, getActionItemProperties, getActionItemDeals, getActionItemCompanies } from '../api/database';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import { formatDatePacific } from '../utils/timezone';

export const STATUSES = ['Todo', 'Reminders', 'In progress', 'Done', 'Dead', 'Email', 'Needs and Wants'];
const RESPONSIBILITY_OPTIONS = ['Dave Mudge', 'Missy', 'David Mudge Jr', 'Houston'];
const SOURCE_OPTIONS = ['manual', 'houston_tpe', 'houston_lease', 'houston_general'];

export default function ActionItemDetail({ actionItemId, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || actionItemId;
  const [item, setItem] = useState(null);
  const [linkedContacts, setLinkedContacts] = useState([]);
  const [linkedProperties, setLinkedProperties] = useState([]);
  const [linkedDeals, setLinkedDeals] = useState([]);
  const [linkedCompanies, setLinkedCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const saveField = useAutoSave(updateActionItem, resolvedId, setItem, onRefresh);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    setError(null);
    try {
      const d = await getActionItem(resolvedId);
      const itemData = d.rows?.[0];
      if (!itemData) {
        setError('Action item not found');
        setItem(null);
        setLoading(false);
        return;
      }
      setItem(itemData);

      const [contacts, properties, deals, companies] = await Promise.allSettled([
        getActionItemContacts(resolvedId),
        getActionItemProperties(resolvedId),
        getActionItemDeals(resolvedId),
        getActionItemCompanies(resolvedId),
      ]);
      setLinkedContacts(contacts.status === 'fulfilled' ? contacts.value.rows || [] : []);
      setLinkedProperties(properties.status === 'fulfilled' ? properties.value.rows || [] : []);
      setLinkedDeals(deals.status === 'fulfilled' ? deals.value.rows || [] : []);
      setLinkedCompanies(companies.status === 'fulfilled' ? companies.value.rows || [] : []);
    } catch (err) {
      console.error('Failed to load action item:', err);
      setError(err.message || 'Failed to load action item');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [resolvedId]);

  const contactRecords = linkedContacts.map((c) => ({
    id: c.contact_id,
    label: `${c.full_name}${c.type ? ` (${c.type})` : ''}`,
  }));
  const propertyRecords = linkedProperties.map((p) => ({
    id: p.property_id,
    label: p.property_address || 'Untitled',
    secondary: p.city,
  }));
  const dealRecords = linkedDeals.map((d) => ({
    id: d.deal_id,
    label: d.deal_name || 'Untitled Deal',
    secondary: d.status,
  }));
  const companyRecords = linkedCompanies.map((co) => ({
    id: co.company_id,
    label: co.company_name,
    secondary: co.city,
  }));

  // Handle status change with auto date_completed
  const handleStatusChange = async (field, value) => {
    if (value === 'Done' && item.status !== 'Done') {
      // Set date_completed when marking as Done
      await saveField('date_completed', new Date().toISOString());
    } else if (value !== 'Done' && item.status === 'Done') {
      // Clear date_completed when un-doing
      await saveField('date_completed', null);
    }
    await saveField(field, value);
  };

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

  if (error || !item) {
    const errorContent = (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-crm-muted">{error || 'Action item not found'}</p>
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

  const isHouston = item.source && item.source.startsWith('houston_');
  const isOverdue = item.due_date && item.status !== 'Done' && item.status !== 'Dead'
    && new Date(item.due_date).toISOString().split('T')[0] < new Date().toISOString().split('T')[0];

  const content = (
    <>
      <SlideOverHeader
        title={item.name || 'Untitled Task'}
        subtitle={
          <span className="flex items-center gap-2">
            {item.high_priority && <span className="text-red-400">★ High Priority</span>}
            <span>{item.status}</span>
            {isHouston && <span className="text-cyan-400 text-[10px] bg-cyan-400/10 px-1.5 py-0.5 rounded">Houston</span>}
            {isOverdue && <span className="text-red-400 text-[10px] bg-red-400/10 px-1.5 py-0.5 rounded">Overdue</span>}
          </span>
        }
        onClose={onClose}
      />

      <Section title="Task Details">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Task Name" value={item.name} field="name" onSave={saveField} />
          <InlineField label="Status" value={item.status} field="status" type="select" options={STATUSES} onSave={handleStatusChange} />
          <InlineField label="Due Date" value={item.due_date} field="due_date" type="date" onSave={saveField} />
          <InlineField label="High Priority" value={item.high_priority} field="high_priority" type="boolean" onSave={saveField} />
          <InlineField label="Assigned To" value={item.responsibility} field="responsibility" onSave={saveField} />
          <InlineField label="Source" value={item.source} field="source" type="select" options={SOURCE_OPTIONS} onSave={saveField} />
        </div>
      </Section>

      <Section title="Notes" defaultOpen={!!item.notes || !!item.notes_on_date}>
        <div className="space-y-3">
          <InlineField label="Notes" value={item.notes} field="notes" onSave={saveField} multiline />
          <InlineField label="Note on Date" value={item.notes_on_date} field="notes_on_date" onSave={saveField} multiline />
        </div>
      </Section>

      <Section title="Timestamps" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-x-4 text-xs text-crm-muted">
          <div>
            <span className="text-crm-muted/60">Created:</span>{' '}
            {formatDatePacific(item.created_at) || '—'}
          </div>
          <div>
            <span className="text-crm-muted/60">Updated:</span>{' '}
            {formatDatePacific(item.updated_at) || '—'}
          </div>
          {item.date_completed && (
            <div className="col-span-2 mt-1">
              <span className="text-crm-muted/60">Completed:</span>{' '}
              {formatDatePacific(item.date_completed)}
            </div>
          )}
        </div>
      </Section>

      <LinkedRecordSection title="Contacts" entityType="contact" records={contactRecords} defaultOpen={linkedContacts.length > 0} sourceType="action_item" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Properties" entityType="property" records={propertyRecords} defaultOpen={linkedProperties.length > 0} sourceType="action_item" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Deals" entityType="deal" records={dealRecords} defaultOpen={linkedDeals.length > 0} sourceType="action_item" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Companies" entityType="company" records={companyRecords} defaultOpen={linkedCompanies.length > 0} sourceType="action_item" sourceId={resolvedId} onRefresh={loadData} />
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
