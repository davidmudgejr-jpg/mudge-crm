import React, { useState, useEffect } from 'react';
import { getCompany, updateCompany, deleteCompany, getCompanyContacts, getCompanyProperties, getCompanyDeals, getCompanyInteractions, getCompanyLeaseComps } from '../api/database';
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
import CompHistorySection from '../components/shared/CompHistorySection';

export default function CompanyDetail({ companyId, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || companyId;
  const handleDelete = async () => {
    if (!window.confirm('Delete this company? This cannot be undone.')) return;
    await deleteCompany(resolvedId);
    onSave?.();
  };
  const [company, setCompany] = useState(null);
  const [linkedContacts, setLinkedContacts] = useState([]);
  const [linkedProperties, setLinkedProperties] = useState([]);
  const [linkedDeals, setLinkedDeals] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [leaseComps, setLeaseComps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewInteraction, setShowNewInteraction] = useState(false);

  const saveField = useAutoSave(updateCompany, resolvedId, setCompany, onRefresh);
  const parseInt0 = (v) => (v ? parseInt(v, 10) : null);
  const parseFloat0 = (v) => (v ? parseFloat(v) : null);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch company record first — don't let linked-record failures block it
      const c = await getCompany(resolvedId);
      const companyData = c.rows?.[0];
      if (!companyData) {
        setError('Company not found');
        setCompany(null);
        setLoading(false);
        return;
      }
      setCompany(companyData);

      // Fetch linked records independently so one failure doesn't break the panel
      const [contacts, props, deals, iRes, lcRes] = await Promise.allSettled([
        getCompanyContacts(resolvedId),
        getCompanyProperties(resolvedId),
        getCompanyDeals(resolvedId),
        getCompanyInteractions(resolvedId),
        getCompanyLeaseComps(resolvedId),
      ]);
      setLinkedContacts(contacts.status === 'fulfilled' ? contacts.value.rows || [] : []);
      setLinkedProperties(props.status === 'fulfilled' ? props.value.rows || [] : []);
      setLinkedDeals(deals.status === 'fulfilled' ? deals.value.rows || [] : []);
      setInteractions(iRes.status === 'fulfilled' ? iRes.value.rows || [] : []);
      setLeaseComps(lcRes.status === 'fulfilled' ? lcRes.value.rows || [] : []);
    } catch (err) {
      console.error('Failed to load company:', err);
      setError(err.message || 'Failed to load company');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [resolvedId]);

  const contactRecords = linkedContacts.map((c) => ({
    id: c.contact_id,
    label: `${c.full_name}${c.type ? ` (${c.type})` : ''}`,
    secondary: c.email_1,
  }));

  const propertyRecords = linkedProperties.map((p) => ({
    id: p.property_id,
    label: p.property_address || 'Untitled',
    secondary: p.city,
  }));

  const dealRecords = linkedDeals.map((d) => ({
    id: d.deal_id,
    label: d.deal_name,
    secondary: d.status,
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

  if (error || !company) {
    const errorContent = (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-crm-muted">{error || 'Company not found'}</p>
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
        title={company.company_name || 'Unnamed Company'}
        subtitle={[company.company_type, company.industry_type].filter(Boolean).join(' · ')}
        onClose={onClose}
      >
        <button onClick={handleDelete} className="text-crm-muted hover:text-red-400 w-8 h-8 flex items-center justify-center rounded-md hover:bg-crm-hover transition-colors" title="Delete company">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </SlideOverHeader>

      <Section title="Company Info">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Company Name" value={company.company_name} field="company_name" onSave={saveField} />
          <InlineField label="Type" value={company.company_type} field="company_type" onSave={saveField} />
          <InlineField label="Industry" value={company.industry_type} field="industry_type" onSave={saveField} />
          <InlineField label="Website" value={company.website} field="website" type="url" onSave={saveField} />
          <InlineField label="HQ Location" value={company.company_hq} field="company_hq" onSave={saveField} />
          <InlineField label="City" value={company.city} field="city" onSave={saveField} />
          <InlineField label="SF" value={company.sf} field="sf" type="number" onSave={saveField} parse={parseInt0} format={(v) => v?.toLocaleString()} />
          <InlineField label="Employees" value={company.employees} field="employees" type="number" onSave={saveField} parse={parseInt0} format={(v) => v?.toLocaleString()} />
          <InlineField label="Revenue" value={company.revenue} field="revenue" type="number" onSave={saveField} parse={parseFloat0} format={(v) => v ? '$' + Number(v).toLocaleString() : null} />
          <InlineField label="Growth" value={company.company_growth} field="company_growth" onSave={saveField} />
        </div>
      </Section>

      <Section title="Lease Info">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Lease Expiration" value={company.lease_exp} field="lease_exp" type="date" onSave={saveField} />
          <InlineField label="Months Left" value={company.lease_months_left} field="lease_months_left" type="number" onSave={saveField} parse={parseInt0} />
          <InlineField label="Move-in Date" value={company.move_in_date} field="move_in_date" type="date" onSave={saveField} />
        </div>
      </Section>

      <CompHistorySection leaseComps={leaseComps} title="Lease Comp History" />

      <ActivitySection interactions={interactions} onNewInteraction={() => setShowNewInteraction(true)} />

      {showNewInteraction && (
        <NewInteractionModal
          initialLinks={{ company: [{ id: resolvedId, label: company.company_name || 'Unnamed Company' }] }}
          onCreated={() => { setShowNewInteraction(false); loadData(); }}
          onClose={() => setShowNewInteraction(false)}
        />
      )}

      <NotesSection entityType="company" entityId={resolvedId} onRefresh={loadData} />

      <LinkedRecordSection title="Contacts" entityType="contact" records={contactRecords} defaultOpen={linkedContacts.length > 0} sourceType="company" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Properties" entityType="property" records={propertyRecords} defaultOpen={linkedProperties.length > 0} sourceType="company" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Deals" entityType="deal" records={dealRecords} defaultOpen={linkedDeals.length > 0} sourceType="company" sourceId={resolvedId} onRefresh={loadData} />
    </>
  );

  if (isSlideOver) return content;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
      <div
        className="relative w-[520px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
