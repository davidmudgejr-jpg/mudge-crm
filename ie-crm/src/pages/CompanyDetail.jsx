import React, { useState, useEffect } from 'react';
import { getCompany, updateCompany, getCompanyContacts, getCompanyProperties, getCompanyDeals, getCompanyInteractions } from '../api/database';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import NotesSection from '../components/shared/NotesSection';

export default function CompanyDetail({ companyId, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || companyId;
  const [company, setCompany] = useState(null);
  const [linkedContacts, setLinkedContacts] = useState([]);
  const [linkedProperties, setLinkedProperties] = useState([]);
  const [linkedDeals, setLinkedDeals] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);

  const saveField = useAutoSave(updateCompany, resolvedId, setCompany, onRefresh);
  const parseInt0 = (v) => (v ? parseInt(v, 10) : null);
  const parseFloat0 = (v) => (v ? parseFloat(v) : null);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    try {
      const [c, contacts, props, deals, iRes] = await Promise.all([
        getCompany(resolvedId),
        getCompanyContacts(resolvedId),
        getCompanyProperties(resolvedId),
        getCompanyDeals(resolvedId),
        getCompanyInteractions(resolvedId),
      ]);
      const companyData = c.rows[0];
      setCompany(companyData);
      setLinkedContacts(contacts.rows || []);
      setLinkedProperties(props.rows || []);
      setLinkedDeals(deals.rows || []);
      setInteractions(iRes.rows || []);
    } catch (err) {
      console.error('Failed to load company:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [resolvedId]);

  const contactRecords = linkedContacts.map((c) => ({
    id: c.contact_id,
    label: `${c.full_name}${c.type ? ` (${c.type})` : ''}`,
    secondary: c.email,
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

  if (loading || !company) {
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
        title={company.company_name || 'Unnamed Company'}
        subtitle={[company.company_type, company.industry_type].filter(Boolean).join(' · ')}
        onClose={onClose}
      />

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

      <NotesSection entityType="company" entityId={resolvedId} />

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
        className="relative w-[520px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
