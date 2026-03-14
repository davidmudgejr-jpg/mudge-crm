import React, { useState, useEffect } from 'react';
import { getLeaseComp, updateLeaseComp, getSaleComp, updateSaleComp } from '../api/database';
import Section from '../components/shared/Section';
import InlineField from '../components/shared/InlineField';
import useAutoSave from '../hooks/useAutoSave';
import { SlideOverHeader } from '../components/shared/SlideOver';
import DetailSkeleton from '../components/shared/DetailSkeleton';
import { formatDatePacific } from '../utils/timezone';

const PROPERTY_TYPES = ['Industrial', 'Office', 'Retail', 'Multifamily', 'Land', 'Mixed-Use'];
const RENT_TYPE_OPTIONS = ['NNN', 'GRS', 'MGR'];
const LEASE_TYPE_OPTIONS = ['New', 'Renewal', 'Sublease'];
const SPACE_TYPE_OPTIONS = ['Direct', 'Sublease', 'Relet'];
const SOURCE_OPTIONS = ['Company DB', 'CoStar', 'IAR Hot Sheet', 'Manual'];

export default function CompDetail({ compId, compType = 'lease', id, onClose, onSave, onRefresh, isSlideOver }) {
  const resolvedId = id || compId;
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Determine type — when opened from SlideOver, compType may be passed as a prop
  // Default to 'lease' if not specified
  const [type] = useState(compType);

  const updateFn = type === 'lease' ? updateLeaseComp : updateSaleComp;
  const saveField = useAutoSave(updateFn, resolvedId, setItem, onRefresh);

  const loadData = async () => {
    if (!resolvedId) return;
    setLoading(true);
    setError(null);
    try {
      const getFn = type === 'lease' ? getLeaseComp : getSaleComp;
      const d = await getFn(resolvedId);
      const itemData = d.rows?.[0];
      if (!itemData) {
        setError(`${type === 'lease' ? 'Lease' : 'Sale'} comp not found`);
        setItem(null);
        setLoading(false);
        return;
      }
      setItem(itemData);
    } catch (err) {
      console.error(`Failed to load ${type} comp:`, err);
      setError(err.message || `Failed to load ${type} comp`);
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
        <div className="w-[520px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
          <DetailSkeleton />
        </div>
      </div>
    );
  }

  if (error || !item) {
    const errorContent = (
      <div className="px-5 py-10 text-center">
        <p className="text-sm text-crm-muted">{error || 'Comp not found'}</p>
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

  const content = type === 'lease' ? (
    <>
      <SlideOverHeader
        title={item.tenant_name || 'Untitled Lease Comp'}
        subtitle={
          <span className="flex items-center gap-2">
            <span>{item.property_type || 'Unknown Type'}</span>
            {item.sf && <span>{Number(item.sf).toLocaleString()} SF</span>}
            {item.rate && <span>${Number(item.rate).toFixed(2)}/SF/mo</span>}
          </span>
        }
        onClose={onClose}
      />

      <Section title="Tenant & Property">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Tenant Name" value={item.tenant_name} field="tenant_name" onSave={saveField} />
          <InlineField label="Property Type" value={item.property_type} field="property_type" type="select" options={PROPERTY_TYPES} onSave={saveField} />
          <InlineField label="Space Use" value={item.space_use} field="space_use" onSave={saveField} />
          <InlineField label="Space Type" value={item.space_type} field="space_type" type="select" options={SPACE_TYPE_OPTIONS} onSave={saveField} />
          <InlineField label="Floor/Suite" value={item.floor_suite} field="floor_suite" onSave={saveField} />
          <InlineField label="Building RBA" value={item.building_rba} field="building_rba" type="number" onSave={saveField} />
        </div>
      </Section>

      <Section title="Lease Terms">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Square Feet" value={item.sf} field="sf" type="number" onSave={saveField} />
          <InlineField label="Rate ($/SF/mo)" value={item.rate} field="rate" type="number" onSave={saveField} />
          <InlineField label="Term (months)" value={item.term_months} field="term_months" type="number" onSave={saveField} />
          <InlineField label="Rent Type" value={item.rent_type} field="rent_type" type="select" options={RENT_TYPE_OPTIONS} onSave={saveField} />
          <InlineField label="Lease Type" value={item.lease_type} field="lease_type" type="select" options={LEASE_TYPE_OPTIONS} onSave={saveField} />
          <InlineField label="Escalations %" value={item.escalations} field="escalations" type="number" onSave={saveField} />
        </div>
      </Section>

      <Section title="Concessions" defaultOpen={!!(item.concessions || item.free_rent_months || item.ti_psf)}>
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Free Rent (months)" value={item.free_rent_months} field="free_rent_months" type="number" onSave={saveField} />
          <InlineField label="TI Allowance ($/SF)" value={item.ti_psf} field="ti_psf" type="number" onSave={saveField} />
        </div>
        <InlineField label="Concessions (raw)" value={item.concessions} field="concessions" onSave={saveField} multiline />
      </Section>

      <Section title="Key Dates">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Sign Date" value={item.sign_date} field="sign_date" type="date" onSave={saveField} />
          <InlineField label="Commencement" value={item.commencement_date} field="commencement_date" type="date" onSave={saveField} />
          <InlineField label="Move-in Date" value={item.move_in_date} field="move_in_date" type="date" onSave={saveField} />
          <InlineField label="Expiration" value={item.expiration_date} field="expiration_date" type="date" onSave={saveField} />
        </div>
      </Section>

      <Section title="Representatives" defaultOpen={!!(item.tenant_rep_company || item.landlord_rep_company)}>
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Tenant Rep Co" value={item.tenant_rep_company} field="tenant_rep_company" onSave={saveField} />
          <InlineField label="Tenant Agents" value={item.tenant_rep_agents} field="tenant_rep_agents" onSave={saveField} />
          <InlineField label="Landlord Rep Co" value={item.landlord_rep_company} field="landlord_rep_company" onSave={saveField} />
          <InlineField label="Landlord Agents" value={item.landlord_rep_agents} field="landlord_rep_agents" onSave={saveField} />
        </div>
      </Section>

      <Section title="Other Details" defaultOpen={!!item.notes}>
        <InlineField label="Notes" value={item.notes} field="notes" onSave={saveField} multiline />
        <InlineField label="Source" value={item.source} field="source" type="select" options={SOURCE_OPTIONS} onSave={saveField} />
      </Section>

      <Section title="Timestamps" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-x-4 text-xs text-crm-muted">
          <div><span className="text-crm-muted/60">Created:</span> {formatDatePacific(item.created_at) || '—'}</div>
          <div><span className="text-crm-muted/60">Updated:</span> {formatDatePacific(item.updated_at) || '—'}</div>
        </div>
      </Section>
    </>
  ) : (
    <>
      <SlideOverHeader
        title={`${item.buyer_name || item.seller_name || 'Untitled'} Sale`}
        subtitle={
          <span className="flex items-center gap-2">
            <span>{item.property_type || 'Unknown Type'}</span>
            {item.sf && <span>{Number(item.sf).toLocaleString()} SF</span>}
            {item.sale_price && <span>${Number(item.sale_price).toLocaleString()}</span>}
          </span>
        }
        onClose={onClose}
      />

      <Section title="Sale Details">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Sale Date" value={item.sale_date} field="sale_date" type="date" onSave={saveField} />
          <InlineField label="Property Type" value={item.property_type} field="property_type" type="select" options={PROPERTY_TYPES} onSave={saveField} />
          <InlineField label="Buyer" value={item.buyer_name} field="buyer_name" onSave={saveField} />
          <InlineField label="Seller" value={item.seller_name} field="seller_name" onSave={saveField} />
        </div>
      </Section>

      <Section title="Pricing">
        <div className="grid grid-cols-2 gap-x-4">
          <InlineField label="Sale Price" value={item.sale_price} field="sale_price" type="number" onSave={saveField} />
          <InlineField label="Square Feet" value={item.sf} field="sf" type="number" onSave={saveField} />
          <InlineField label="Price/SF" value={item.price_psf} field="price_psf" type="number" onSave={saveField} />
          <InlineField label="Cap Rate" value={item.cap_rate} field="cap_rate" type="number" onSave={saveField} />
          <InlineField label="Land SF" value={item.land_sf} field="land_sf" type="number" onSave={saveField} />
          <InlineField label="Price/Land SF" value={item.price_plsf} field="price_plsf" type="number" onSave={saveField} />
        </div>
      </Section>

      <Section title="Other Details" defaultOpen={!!item.notes}>
        <InlineField label="Notes" value={item.notes} field="notes" onSave={saveField} multiline />
        <InlineField label="Source" value={item.source} field="source" type="select" options={SOURCE_OPTIONS} onSave={saveField} />
      </Section>

      <Section title="Timestamps" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-x-4 text-xs text-crm-muted">
          <div><span className="text-crm-muted/60">Created:</span> {formatDatePacific(item.created_at) || '—'}</div>
          <div><span className="text-crm-muted/60">Updated:</span> {formatDatePacific(item.updated_at) || '—'}</div>
        </div>
      </Section>
    </>
  );

  if (isSlideOver) return content;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
      <div className="relative w-[520px] bg-crm-panel glass-liquid border-l border-crm-border h-full overflow-y-auto animate-slide-in-right" onClick={(e) => e.stopPropagation()}>
        {content}
      </div>
    </div>
  );
}
