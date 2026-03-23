import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createLeaseComp, createSaleComp, searchProperties } from '../../api/database';
import { useToast } from './Toast';

const PROPERTY_TYPES = ['Industrial', 'Office', 'Retail', 'Multifamily', 'Land', 'Mixed-Use'];
const RENT_TYPE_OPTIONS = ['NNN', 'GRS', 'MGR'];
const LEASE_TYPE_OPTIONS = ['New', 'Renewal', 'Sublease'];
const SPACE_TYPE_OPTIONS = ['Direct', 'Sublease', 'Relet'];
const SOURCE_OPTIONS = ['Company DB', 'CoStar', 'IAR Hot Sheet', 'Manual'];

// Debounced property search input
function PropertySearchField({ value, onChange }) {
  const [term, setTerm] = useState(value?.label || '');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    try {
      const rows = await searchProperties(q);
      const arr = Array.isArray(rows) ? rows : (rows?.rows || []);
      setResults(arr.slice(0, 8));
    } catch { setResults([]); }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setTerm(val);
    setOpen(true);
    if (!val) onChange(null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const handleSelect = (row) => {
    setTerm(row.property_address || row.property_name || '');
    onChange({ id: row.property_id, label: row.property_address || row.property_name });
    setResults([]);
    setOpen(false);
  };

  const handleClear = () => {
    setTerm('');
    onChange(null);
    setResults([]);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={term}
          onChange={handleChange}
          onFocus={() => term.length >= 2 && setOpen(true)}
          placeholder="Search properties..."
          className="flex-1 bg-crm-bg border border-crm-border rounded px-2.5 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
        />
        {value && (
          <button onClick={handleClear} className="text-crm-muted hover:text-crm-text text-xs px-1.5">✕</button>
        )}
      </div>
      {value && (
        <p className="text-[10px] text-crm-accent mt-0.5">Linked: {value.label}</p>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-crm-card border border-crm-border rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {results.map((row) => (
            <button
              key={row.property_id}
              onMouseDown={() => handleSelect(row)}
              className="w-full text-left px-3 py-2 text-xs text-crm-text hover:bg-crm-hover flex flex-col"
            >
              <span className="font-medium truncate">{row.property_address || row.property_name}</span>
              {row.city && <span className="text-crm-muted">{row.city}{row.state ? `, ${row.state}` : ''}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div>
      <label className="block text-[10px] text-crm-muted mb-1 uppercase tracking-wide">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = 'w-full bg-crm-bg border border-crm-border rounded px-2.5 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50';
const selectCls = inputCls;

export default function CompManualEntryModal({ compType = 'lease', onClose, onCreated }) {
  const { addToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [linkedProperty, setLinkedProperty] = useState(null);

  const [lease, setLease] = useState({
    tenant_name: '', property_type: '', sf: '', rate: '', term_months: '',
    rent_type: '', lease_type: '', escalations: '', cam_expenses: '', zoning: '',
    doors_with_lease: '', space_use: '', space_type: '', floor_suite: '',
    building_rba: '', sign_date: '', commencement_date: '', move_in_date: '',
    expiration_date: '', free_rent_months: '', ti_psf: '', concessions: '',
    tenant_rep_company: '', tenant_rep_agents: '',
    landlord_rep_company: '', landlord_rep_agents: '',
    notes: '', source: 'Manual',
  });

  const [sale, setSale] = useState({
    sale_date: '', property_type: '', sale_price: '', sf: '', price_psf: '',
    cap_rate: '', land_sf: '', price_plsf: '',
    buyer_name: '', seller_name: '',
    notes: '', source: 'Manual',
  });

  const setL = (k, v) => setLease((p) => ({ ...p, [k]: v }));
  const setS = (k, v) => setSale((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const strip = (obj) => {
        const out = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v !== '' && v !== null && v !== undefined) out[k] = v;
        }
        return out;
      };

      if (compType === 'lease') {
        if (!lease.tenant_name.trim()) { addToast('Tenant name is required', 'error'); setSaving(false); return; }
        const payload = strip(lease);
        if (linkedProperty) payload.property_id = linkedProperty.id;
        await createLeaseComp(payload);
      } else {
        const payload = strip(sale);
        if (linkedProperty) payload.property_id = linkedProperty.id;
        await createSaleComp(payload);
      }

      addToast(`${compType === 'lease' ? 'Lease' : 'Sale'} comp created`, 'success', 2000);
      onCreated?.();
    } catch (err) {
      addToast(`Failed: ${err.message}`, 'error', 4000);
    } finally {
      setSaving(false);
    }
  };

  const title = compType === 'lease' ? 'New Lease Comp' : 'New Sale Comp';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-crm-overlay" />
      <div
        className="relative bg-crm-sidebar border border-crm-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-sheet-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-crm-border flex-shrink-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} className="text-crm-muted hover:text-crm-text text-lg leading-none">×</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Linked Property */}
          <div>
            <p className="text-[11px] font-medium text-crm-muted uppercase tracking-wide mb-2">Link to Property</p>
            <PropertySearchField value={linkedProperty} onChange={setLinkedProperty} />
          </div>

          {compType === 'lease' ? (
            <>
              {/* Tenant & Space */}
              <div>
                <p className="text-[11px] font-medium text-crm-muted uppercase tracking-wide mb-2">Tenant & Space</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tenant Name" required>
                    <input className={inputCls} value={lease.tenant_name} onChange={(e) => setL('tenant_name', e.target.value)} placeholder="Acme Corp" />
                  </Field>
                  <Field label="Property Type">
                    <select className={selectCls} value={lease.property_type} onChange={(e) => setL('property_type', e.target.value)}>
                      <option value="">Select...</option>
                      {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Space Use">
                    <input className={inputCls} value={lease.space_use} onChange={(e) => setL('space_use', e.target.value)} placeholder="Warehouse, R&D..." />
                  </Field>
                  <Field label="Space Type">
                    <select className={selectCls} value={lease.space_type} onChange={(e) => setL('space_type', e.target.value)}>
                      <option value="">Select...</option>
                      {SPACE_TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Floor / Suite">
                    <input className={inputCls} value={lease.floor_suite} onChange={(e) => setL('floor_suite', e.target.value)} placeholder="Suite 100" />
                  </Field>
                  <Field label="Building RBA (SF)">
                    <input className={inputCls} type="number" value={lease.building_rba} onChange={(e) => setL('building_rba', e.target.value)} placeholder="200000" />
                  </Field>
                </div>
              </div>

              {/* Lease Terms */}
              <div>
                <p className="text-[11px] font-medium text-crm-muted uppercase tracking-wide mb-2">Lease Terms</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="SF">
                    <input className={inputCls} type="number" value={lease.sf} onChange={(e) => setL('sf', e.target.value)} placeholder="25000" />
                  </Field>
                  <Field label="Rate ($/SF/mo)">
                    <input className={inputCls} type="number" step="0.01" value={lease.rate} onChange={(e) => setL('rate', e.target.value)} placeholder="1.25" />
                  </Field>
                  <Field label="Term (months)">
                    <input className={inputCls} type="number" value={lease.term_months} onChange={(e) => setL('term_months', e.target.value)} placeholder="60" />
                  </Field>
                  <Field label="Rent Type">
                    <select className={selectCls} value={lease.rent_type} onChange={(e) => setL('rent_type', e.target.value)}>
                      <option value="">Select...</option>
                      {RENT_TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Lease Type">
                    <select className={selectCls} value={lease.lease_type} onChange={(e) => setL('lease_type', e.target.value)}>
                      <option value="">Select...</option>
                      {LEASE_TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Escalations %">
                    <input className={inputCls} type="number" step="0.01" value={lease.escalations} onChange={(e) => setL('escalations', e.target.value)} placeholder="3" />
                  </Field>
                  <Field label="CAM ($/SF/mo)">
                    <input className={inputCls} type="number" step="0.01" value={lease.cam_expenses} onChange={(e) => setL('cam_expenses', e.target.value)} placeholder="0.25" />
                  </Field>
                  <Field label="Zoning">
                    <input className={inputCls} value={lease.zoning} onChange={(e) => setL('zoning', e.target.value)} placeholder="M1, C2..." />
                  </Field>
                  <Field label="Doors w/ Lease">
                    <input className={inputCls} type="number" value={lease.doors_with_lease} onChange={(e) => setL('doors_with_lease', e.target.value)} placeholder="2" />
                  </Field>
                </div>
              </div>

              {/* Key Dates */}
              <div>
                <p className="text-[11px] font-medium text-crm-muted uppercase tracking-wide mb-2">Key Dates</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sign Date">
                    <input className={inputCls} type="date" value={lease.sign_date} onChange={(e) => setL('sign_date', e.target.value)} />
                  </Field>
                  <Field label="Commencement Date">
                    <input className={inputCls} type="date" value={lease.commencement_date} onChange={(e) => setL('commencement_date', e.target.value)} />
                  </Field>
                  <Field label="Move-in Date">
                    <input className={inputCls} type="date" value={lease.move_in_date} onChange={(e) => setL('move_in_date', e.target.value)} />
                  </Field>
                  <Field label="Expiration Date">
                    <input className={inputCls} type="date" value={lease.expiration_date} onChange={(e) => setL('expiration_date', e.target.value)} />
                  </Field>
                </div>
              </div>

              {/* Concessions */}
              <div>
                <p className="text-[11px] font-medium text-crm-muted uppercase tracking-wide mb-2">Concessions</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Free Rent (months)">
                    <input className={inputCls} type="number" value={lease.free_rent_months} onChange={(e) => setL('free_rent_months', e.target.value)} placeholder="2" />
                  </Field>
                  <Field label="TI Allowance ($/SF)">
                    <input className={inputCls} type="number" step="0.01" value={lease.ti_psf} onChange={(e) => setL('ti_psf', e.target.value)} placeholder="15.00" />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="Concessions (notes)">
                    <textarea className={`${inputCls} resize-none`} rows={2} value={lease.concessions} onChange={(e) => setL('concessions', e.target.value)} placeholder="Free rent, TI details..." />
                  </Field>
                </div>
              </div>

              {/* Reps */}
              <div>
                <p className="text-[11px] font-medium text-crm-muted uppercase tracking-wide mb-2">Representatives</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tenant Rep Co">
                    <input className={inputCls} value={lease.tenant_rep_company} onChange={(e) => setL('tenant_rep_company', e.target.value)} />
                  </Field>
                  <Field label="Tenant Agents">
                    <input className={inputCls} value={lease.tenant_rep_agents} onChange={(e) => setL('tenant_rep_agents', e.target.value)} />
                  </Field>
                  <Field label="Landlord Rep Co">
                    <input className={inputCls} value={lease.landlord_rep_company} onChange={(e) => setL('landlord_rep_company', e.target.value)} />
                  </Field>
                  <Field label="Landlord Agents">
                    <input className={inputCls} value={lease.landlord_rep_agents} onChange={(e) => setL('landlord_rep_agents', e.target.value)} />
                  </Field>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Sale Details */}
              <div>
                <p className="text-[11px] font-medium text-crm-muted uppercase tracking-wide mb-2">Sale Details</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Sale Date">
                    <input className={inputCls} type="date" value={sale.sale_date} onChange={(e) => setS('sale_date', e.target.value)} />
                  </Field>
                  <Field label="Property Type">
                    <select className={selectCls} value={sale.property_type} onChange={(e) => setS('property_type', e.target.value)}>
                      <option value="">Select...</option>
                      {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </Field>
                  <Field label="Buyer">
                    <input className={inputCls} value={sale.buyer_name} onChange={(e) => setS('buyer_name', e.target.value)} placeholder="ABC Investments" />
                  </Field>
                  <Field label="Seller">
                    <input className={inputCls} value={sale.seller_name} onChange={(e) => setS('seller_name', e.target.value)} placeholder="XYZ Properties" />
                  </Field>
                </div>
              </div>

              {/* Pricing */}
              <div>
                <p className="text-[11px] font-medium text-crm-muted uppercase tracking-wide mb-2">Pricing</p>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Sale Price">
                    <input className={inputCls} type="number" value={sale.sale_price} onChange={(e) => setS('sale_price', e.target.value)} placeholder="5000000" />
                  </Field>
                  <Field label="SF">
                    <input className={inputCls} type="number" value={sale.sf} onChange={(e) => setS('sf', e.target.value)} placeholder="100000" />
                  </Field>
                  <Field label="Price / SF">
                    <input className={inputCls} type="number" step="0.01" value={sale.price_psf} onChange={(e) => setS('price_psf', e.target.value)} placeholder="50.00" />
                  </Field>
                  <Field label="Cap Rate %">
                    <input className={inputCls} type="number" step="0.01" value={sale.cap_rate} onChange={(e) => setS('cap_rate', e.target.value)} placeholder="5.5" />
                  </Field>
                  <Field label="Land SF">
                    <input className={inputCls} type="number" value={sale.land_sf} onChange={(e) => setS('land_sf', e.target.value)} placeholder="200000" />
                  </Field>
                  <Field label="Price / Land SF">
                    <input className={inputCls} type="number" step="0.01" value={sale.price_plsf} onChange={(e) => setS('price_plsf', e.target.value)} placeholder="25.00" />
                  </Field>
                </div>
              </div>
            </>
          )}

          {/* Notes & Source — both types */}
          <div>
            <p className="text-[11px] font-medium text-crm-muted uppercase tracking-wide mb-2">Other</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="Source">
                <select
                  className={selectCls}
                  value={compType === 'lease' ? lease.source : sale.source}
                  onChange={(e) => compType === 'lease' ? setL('source', e.target.value) : setS('source', e.target.value)}
                >
                  {SOURCE_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                value={compType === 'lease' ? lease.notes : sale.notes}
                onChange={(e) => compType === 'lease' ? setL('notes', e.target.value) : setS('notes', e.target.value)}
                placeholder="Additional context..."
              />
            </Field>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-crm-border flex-shrink-0">
          <button onClick={onClose} className="text-xs text-crm-muted hover:text-crm-text px-3 py-1.5 rounded transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-crm-accent hover:bg-crm-accent-hover disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : `Save ${compType === 'lease' ? 'Lease' : 'Sale'} Comp`}
          </button>
        </div>
      </div>
    </div>
  );
}
