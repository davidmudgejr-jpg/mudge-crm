import React, { useState, useRef, useEffect } from 'react';
import { createProperty, createContact, createCompany, createDeal, createInteraction, createCampaign, createActionItem, createLeaseComp, createSaleComp } from '../../api/database';
import ENTITY_TYPES from '../../config/entityTypes';
import { QUICK_ADD_FIELDS } from '../../config/quickAddFields';
import { todayPacific } from '../../utils/timezone';
import DuplicateWarning from './DuplicateWarning';

const CREATE_FNS = {
  property: createProperty,
  contact: createContact,
  company: createCompany,
  deal: createDeal,
  interaction: createInteraction,
  campaign: createCampaign,
  action_item: createActionItem,
  lease_comp: createLeaseComp,
  sale_comp: createSaleComp,
};

export default function QuickAddModal({ entityType, onCreated, onClose }) {
  const fields = QUICK_ADD_FIELDS[entityType] || [];
  const meta = ENTITY_TYPES[entityType];
  const createFn = CREATE_FNS[entityType];

  const [values, setValues] = useState(() => {
    const init = {};
    fields.forEach((f) => {
      if (f.type === 'date') init[f.key] = todayPacific();
      else init[f.key] = '';
    });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [duplicates, setDuplicates] = useState(null);
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const handleChange = (key, val) => {
    setValues((prev) => ({ ...prev, [key]: val }));
    setError(null);
  };

  const getCleanedFields = () => {
    const cleaned = {};
    for (const f of fields) {
      const v = values[f.key];
      if (v !== '' && v != null) {
        cleaned[f.key] = f.type === 'number' ? Number(v) : f.isArray ? [v] : v;
      }
    }
    return cleaned;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Validate required fields
    for (const f of fields) {
      if (f.required && !values[f.key]?.toString().trim()) {
        setError(`${f.label} is required`);
        return;
      }
    }
    setSaving(true);
    try {
      const cleaned = getCleanedFields();
      const result = await createFn(cleaned);

      // Check for duplicate warning from server
      if (result?.duplicateWarning) {
        setDuplicates(result);
        setSaving(false);
        return;
      }

      const row = result?.rows?.[0] || result;
      const newId = row?.[meta.idCol];
      onCreated(newId);
    } catch (err) {
      console.error('Quick add failed:', err);
      setError(err.message || 'Failed to create record');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAnyway = async () => {
    setSaving(true);
    try {
      const cleaned = getCleanedFields();
      const result = await createFn(cleaned, true); // skipDuplicateCheck = true
      const row = result?.rows?.[0] || result;
      const newId = row?.[meta.idCol];
      onCreated(newId);
    } catch (err) {
      console.error('Force create failed:', err);
      setError(err.message || 'Failed to create record');
      setDuplicates(null);
    } finally {
      setSaving(false);
    }
  };

  const handleUseExisting = (existingId) => {
    onCreated(existingId);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 animate-fade-in" />
      <div className="relative bg-crm-card/95 border border-crm-border/50 rounded-2xl shadow-2xl glass-modal w-full max-w-md animate-sheet-down" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-crm-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">New {meta?.label || entityType}</h3>
          <button onClick={onClose} className="text-crm-muted hover:text-crm-text transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form or Duplicate Warning */}
        <div className="px-4 py-3">
          {duplicates ? (
            <DuplicateWarning
              match={duplicates.match}
              candidates={duplicates.candidates}
              level={duplicates.level}
              entityType={entityType}
              onUseExisting={handleUseExisting}
              onCreateAnyway={handleCreateAnyway}
              onBack={() => setDuplicates(null)}
            />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              {fields.map((f, i) => (
                <div key={f.key}>
                  <label className="block text-xs text-crm-muted mb-1">
                    {f.label}{f.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select
                      value={values[f.key]}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
                    >
                      <option value="">Select...</option>
                      {f.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea
                      ref={i === 0 ? firstRef : undefined}
                      value={values[f.key]}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={3}
                      className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50 resize-none"
                    />
                  ) : (
                    <input
                      ref={i === 0 ? firstRef : undefined}
                      type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                      value={values[f.key]}
                      onChange={(e) => handleChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
                    />
                  )}
                </div>
              ))}

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-sm bg-crm-accent text-white rounded-lg hover:bg-crm-accent/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create & Link'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
