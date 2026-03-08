import React, { useState, useEffect } from 'react';
import {
  getProperty, updateProperty, deleteProperty,
  getPropertyContacts, getPropertyCompanies,
  getPropertyDeals, getPropertyInteractions,
} from '../api/database';
import Section from '../components/shared/Section';
import LinkedRecordSection from '../components/shared/LinkedRecordSection';
import InlineField from '../components/shared/InlineField';
import NotesSection from '../components/shared/NotesSection';
import { formatDatePacific } from '../utils/timezone';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import TYPE_ICONS from '../config/typeIcons';
import NewInteractionModal from '../components/shared/NewInteractionModal';
import InteractionDetail from './InteractionDetail';
import ActivitySection from '../components/shared/ActivitySection';

const PRIORITY_OPTIONS = ['Hot', 'Warm', 'Cold', 'Dead'];
const PROPERTY_TYPES = ['Office', 'Retail', 'Industrial', 'Multifamily', 'Mixed-Use', 'Land', 'Other'];
const CONTACTED_OPTIONS = ['Contacted Owner', 'Not Contacted', 'Broker/Not worth it', 'Emailed Owner/Tenant', 'Cold called', 'Left VM', 'Contacted Tenant', 'Contacted Owner & Tenant', 'Listing', 'Doorknocked', 'BOV Sent', 'Offer Sent', 'Letter Sent', 'Met with Owner'];

export default function PropertyDetail({ propertyId, id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || propertyId;
  const handleDelete = async () => {
    if (!window.confirm('Delete this property? This cannot be undone.')) return;
    await deleteProperty(resolvedId);
    onSave?.();
  };
  const [prop, setProp] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [deals, setDeals] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewInteraction, setShowNewInteraction] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState(null);

  const saveField = useAutoSave(updateProperty, resolvedId, setProp, onRefresh);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    setError(null);
    try {
      const pRes = await getProperty(resolvedId);
      const p = pRes.rows?.[0];
      if (!p) {
        setError('Property not found');
        setProp(null);
        setLoading(false);
        return;
      }
      setProp(p);

      const [cRes, coRes, dRes, iRes] = await Promise.allSettled([
        getPropertyContacts(resolvedId),
        getPropertyCompanies(resolvedId),
        getPropertyDeals(resolvedId),
        getPropertyInteractions(resolvedId),
      ]);
      setContacts(cRes.status === 'fulfilled' ? cRes.value.rows || [] : []);
      setCompanies(coRes.status === 'fulfilled' ? coRes.value.rows || [] : []);
      setDeals(dRes.status === 'fulfilled' ? dRes.value.rows || [] : []);
      setInteractions(iRes.status === 'fulfilled' ? iRes.value.rows || [] : []);
    } catch (err) {
      console.error('Failed to load property:', err);
      setError(err.message || 'Failed to load property');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [resolvedId]);

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

  if (error || !prop) {
    const errorContent = (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-crm-muted">{error || 'Property not found'}</p>
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

  const priorityColors = { Hot: 'text-red-400', Warm: 'text-orange-400', Cold: 'text-blue-400', Dead: 'text-gray-400' };

  const contactRecords = contacts.map((c) => ({
    id: c.contact_id,
    label: `${c.full_name}${c.role ? ` (${c.role})` : ''}`,
    secondary: c.email,
  }));
  const companyRecords = companies.map((co) => ({
    id: co.company_id,
    label: `${co.company_name}${co.role ? ` (${co.role})` : ''}`,
    secondary: co.city,
  }));
  const dealRecords = deals.map((d) => ({
    id: d.deal_id,
    label: d.deal_name,
    secondary: d.status,
  }));

  const subtitle = [
    prop.city && `${prop.city}${prop.county ? ', ' + prop.county : ''}`,
    prop.property_type,
    prop.priority && <span key="pri" className={priorityColors[prop.priority]}>{prop.priority}</span>,
  ].filter(Boolean);

  const parseInt0 = (v) => (v ? parseInt(v, 10) : null);
  const parseFloat0 = (v) => (v ? parseFloat(v) : null);

  const content = (
    <>
      <SlideOverHeader
        title={prop.property_address || 'Untitled Property'}
        subtitle={
          <span className="flex items-center gap-2">
            {subtitle.map((s, i) => typeof s === 'string' ? <span key={i}>{s}</span> : s)}
          </span>
        }
        onClose={onClose}
      >
        <button onClick={handleDelete} className="text-crm-muted hover:text-red-400 w-8 h-8 flex items-center justify-center rounded-md hover:bg-crm-hover transition-colors" title="Delete property">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </SlideOverHeader>

      <Section title="Building Info">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Address" value={prop.property_address} field="property_address" onSave={saveField} />
          <InlineField label="Property Name" value={prop.property_name} field="property_name" onSave={saveField} />
          <InlineField label="City" value={prop.city} field="city" onSave={saveField} />
          <InlineField label="County" value={prop.county} field="county" onSave={saveField} />
          <InlineField label="ZIP" value={prop.zip} field="zip" onSave={saveField} />
          <InlineField label="APN" value={prop.apn} field="apn" onSave={saveField} />
          <InlineField label="Type" value={prop.property_type} field="property_type" type="select" options={PROPERTY_TYPES} onSave={saveField} />
          <InlineField label="Zoning" value={prop.zoning} field="zoning" onSave={saveField} />
          <InlineField label="Building SF" value={prop.rba} field="rba" type="number" onSave={saveField} parse={parseInt0} format={(v) => v?.toLocaleString()} />
          <InlineField label="Lot SF" value={prop.land_sf} field="land_sf" type="number" onSave={saveField} parse={parseInt0} format={(v) => v?.toLocaleString()} />
          <InlineField label="Year Built" value={prop.year_built} field="year_built" type="number" onSave={saveField} parse={parseInt0} />
          <InlineField label="Units" value={prop.units} field="units" type="number" onSave={saveField} parse={parseInt0} />
          <InlineField label="Stories" value={prop.stories} field="stories" type="number" onSave={saveField} parse={parseInt0} />
          <InlineField label="Parking" value={prop.parking_spaces} field="parking_spaces" type="number" onSave={saveField} parse={parseInt0} />
        </div>
      </Section>

      <Section title="Financial Info">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Asking Price" value={prop.asking_price} field="asking_price" type="number" onSave={saveField} parse={parseFloat0} format={(v) => v ? `$${Number(v).toLocaleString()}` : null} />
          <InlineField label="Price/SF" value={prop.price_per_sqft} field="price_per_sqft" type="number" onSave={saveField} parse={parseFloat0} format={(v) => v ? `$${Number(v).toLocaleString()}` : null} />
          <InlineField label="RBA" value={prop.rba} field="rba" readOnly format={(v) => v?.toLocaleString()} />
          <InlineField label="FAR" value={prop.far} field="far" readOnly />
          <InlineField label="Cap Rate" value={prop.cap_rate} field="cap_rate" readOnly format={(v) => v ? `${v}%` : null} />
          <InlineField label="NOI" value={prop.noi} field="noi" readOnly format={(v) => v ? `$${Number(v).toLocaleString()}` : null} />
        </div>
      </Section>

      <Section title="Entity Info">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Entity Name" value={prop.owner_name} field="owner_name" onSave={saveField} />
          <InlineField label="Owner Phone" value={prop.owner_phone} field="owner_phone" type="phone" onSave={saveField} />
          <InlineField label="Owner Email" value={prop.owner_email} field="owner_email" type="email" onSave={saveField} />
          <InlineField label="Mailing Address" value={prop.owner_mailing_address} field="owner_mailing_address" onSave={saveField} />
        </div>
      </Section>

      <LinkedRecordSection title="Owner Contact" entityType="contact" records={contactRecords} defaultOpen={contacts.length > 0} sourceType="property" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Companies" entityType="company" records={companyRecords} defaultOpen={companies.length > 0} sourceType="property" sourceId={resolvedId} onRefresh={loadData} />
      <LinkedRecordSection title="Deals" entityType="deal" records={dealRecords} defaultOpen={deals.length > 0} sourceType="property" sourceId={resolvedId} onRefresh={loadData} />

      <ActivitySection interactions={interactions} onNewInteraction={() => setShowNewInteraction(true)} onSelectInteraction={(id) => setSelectedInteraction(id)} />

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
          initialLinks={{ property: [{ id: resolvedId, label: prop.property_address || 'Untitled Property' }] }}
          onCreated={() => { setShowNewInteraction(false); loadData(); }}
          onClose={() => setShowNewInteraction(false)}
        />
      )}

      <NotesSection entityType="property" entityId={resolvedId} onRefresh={loadData} />

      <Section title="Status">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField
            label="Priority" value={prop.priority} field="priority" type="select"
            options={PRIORITY_OPTIONS} onSave={saveField}
            format={(v) => v ? <span className={priorityColors[v]}>{v}</span> : null}
          />
          <InlineField label="Contacted" value={prop.contacted} field="contacted" type="multi-select" options={CONTACTED_OPTIONS} onSave={saveField} />
        </div>
      </Section>
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
