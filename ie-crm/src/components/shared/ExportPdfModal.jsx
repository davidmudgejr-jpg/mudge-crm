import { useState, useCallback, useMemo, useEffect } from 'react';
import { LINKED_EXPORT_FIELDS, ENTITY_LINKED_TYPES } from '../../config/exportFields';
import { fetchFullRecords, buildCardPdfHtml, generatePdf } from '../../utils/pdfExport';
import { useToast } from './Toast';

// ── Template persistence (cloud via API) ────────────────────────────
const API_BASE = '';

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('crm-auth-token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function loadTemplatesFromServer(entityType) {
  try {
    return await apiFetch(`/api/pdf-templates?entity_type=${encodeURIComponent(entityType)}`);
  } catch { return []; }
}

async function saveTemplateToServer(entityType, name, primaryFields, linkedTypes) {
  return apiFetch('/api/pdf-templates', {
    method: 'POST',
    body: JSON.stringify({ entity_type: entityType, name, primary_fields: primaryFields, linked_types: linkedTypes }),
  });
}

async function deleteTemplateFromServer(id) {
  return apiFetch(`/api/pdf-templates/${id}`, { method: 'DELETE' });
}

// Which field is the card title for each entity type
const TITLE_KEY = {
  properties: 'property_address',
  contacts: 'full_name',
  companies: 'company_name',
  deals: 'deal_name',
  campaigns: 'campaign_name',
  lease_comps: 'property_address',
  sale_comps: 'property_address',
  tpe: 'property_address',
};

// ── Checkbox group ──────────────────────────────────────────────────
function FieldCheckboxGroup({ fields, checked, onChange, label }) {
  const allChecked = fields.every(f => checked.has(f.key));
  const toggleAll = () => {
    if (allChecked) onChange(new Set());
    else onChange(new Set(fields.map(f => f.key)));
  };

  return (
    <div className="mb-3">
      {label && (
        <button onClick={toggleAll} className="flex items-center gap-2 text-xs font-semibold text-crm-text uppercase tracking-wider mb-1.5 hover:text-crm-accent transition-colors">
          <input type="checkbox" checked={allChecked} readOnly className="rounded border-crm-border" />
          {label}
        </button>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 pl-1">
        {fields.map(f => (
          <label key={f.key} className="flex items-center gap-1.5 text-xs text-crm-text cursor-pointer hover:text-crm-accent transition-colors">
            <input
              type="checkbox"
              checked={checked.has(f.key)}
              onChange={() => {
                const next = new Set(checked);
                next.has(f.key) ? next.delete(f.key) : next.add(f.key);
                onChange(next);
              }}
              className="rounded border-crm-border"
            />
            {f.label}
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Main modal ──────────────────────────────────────────────────────
export default function ExportPdfModal({
  open,
  onClose,
  entityType,
  entityLabel,
  selectedRows,
  primaryColumns,
  linkedData,       // from useLinkedRecords — { linked_contacts: {id: [...]}, ... } or null
}) {
  const { addToast } = useToast();
  const [exporting, setExporting] = useState(false);

  // Derive exportable primary fields (exclude linked_* columns and renderCell-only computed columns)
  const exportablePrimary = useMemo(() =>
    primaryColumns.filter(c => !c.key.startsWith('linked_') && c.key !== 'linked_interactions'),
    [primaryColumns]
  );

  // Primary field selection — default to columns currently in the list (not hidden)
  const [primaryChecked, setPrimaryChecked] = useState(() =>
    new Set(exportablePrimary.filter(c => c.defaultVisible !== false).map(c => c.key))
  );

  // Linked type toggles + field selection
  const availableLinkedTypes = ENTITY_LINKED_TYPES[entityType] || [];
  const [linkedToggles, setLinkedToggles] = useState({});
  const [linkedChecked, setLinkedChecked] = useState(() => {
    const init = {};
    for (const lt of availableLinkedTypes) {
      const meta = LINKED_EXPORT_FIELDS[lt];
      if (meta) init[lt] = new Set(meta.fields.slice(0, 3).map(f => f.key)); // default: first 3 fields
    }
    return init;
  });

  // Templates (cloud-persisted)
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Load templates from server when modal opens
  useEffect(() => {
    if (open) {
      loadTemplatesFromServer(entityType).then(setTemplates);
    }
  }, [open, entityType]);

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    const linkedTypesObj = {};
    for (const [lt, on] of Object.entries(linkedToggles)) {
      if (on && linkedChecked[lt]?.size > 0) {
        linkedTypesObj[lt] = [...linkedChecked[lt]];
      }
    }
    try {
      const created = await saveTemplateToServer(entityType, templateName.trim(), [...primaryChecked], linkedTypesObj);
      setTemplates(prev => [...prev, created]);
      setTemplateName('');
      setShowSaveTemplate(false);
      addToast(`Template "${created.name}" saved`, 'success', 2000);
    } catch (err) {
      addToast(`Failed to save template: ${err.message}`, 'error', 3000);
    }
  };

  const handleLoadTemplate = (tpl) => {
    const pf = tpl.primary_fields || tpl.primaryFields || [];
    const lt = tpl.linked_types || tpl.linkedTypes || {};
    setPrimaryChecked(new Set(pf));
    const nextToggles = {};
    const nextChecked = { ...linkedChecked };
    for (const lType of availableLinkedTypes) {
      if (lt[lType]?.length > 0) {
        nextToggles[lType] = true;
        nextChecked[lType] = new Set(lt[lType]);
      } else {
        nextToggles[lType] = false;
      }
    }
    setLinkedToggles(nextToggles);
    setLinkedChecked(nextChecked);
    addToast(`Template "${tpl.name}" loaded`, 'info', 1500);
  };

  const handleDeleteTemplate = async (tpl) => {
    try {
      await deleteTemplateFromServer(tpl.id);
      setTemplates(prev => prev.filter(t => t.id !== tpl.id));
    } catch (err) {
      addToast(`Failed to delete template: ${err.message}`, 'error', 3000);
    }
  };

  // ── Export ──────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (primaryChecked.size === 0) {
      addToast('Select at least one field to export', 'error', 2500);
      return;
    }

    setExporting(true);
    try {
      // Build primary field list
      const primaryFields = exportablePrimary.filter(c => primaryChecked.has(c.key));

      // Build linked config + fetch full records
      const linkedConfig = [];
      const linkedRecordMaps = {};

      for (const lt of availableLinkedTypes) {
        if (!linkedToggles[lt] || !linkedChecked[lt]?.size) continue;
        const meta = LINKED_EXPORT_FIELDS[lt];
        if (!meta) continue;

        const linkedKey = `linked_${lt}`;
        const fields = meta.fields.filter(f => linkedChecked[lt].has(f.key));
        linkedConfig.push({ entityType: lt, fields, linkedKey });

        // Collect all linked IDs across selected rows
        const allIds = new Set();
        for (const row of selectedRows) {
          const items = row[linkedKey] || [];
          for (const item of items) {
            const id = item[meta.idField] || item.id;
            if (id) allIds.add(id);
          }
        }

        if (allIds.size > 0) {
          linkedRecordMaps[lt] = await fetchFullRecords(lt, meta.idField, [...allIds]);
        }
      }

      // Build card-based PDF
      const html = buildCardPdfHtml({
        title: `${entityLabel} Export`,
        selectedRows,
        primaryFields,
        linkedConfig,
        linkedRecordMaps,
        logoUrl: '/logo.png',
        titleKey: TITLE_KEY[entityType] || primaryFields[0]?.key,
      });

      const filename = `${entityLabel.toLowerCase()}_export_${new Date().toISOString().slice(0, 10)}.pdf`;
      await generatePdf(html, filename);

      addToast(`Exported ${selectedRows.length} ${entityLabel.toLowerCase()}`, 'success', 2500);
      onClose();
    } catch (err) {
      console.error('[ExportPdfModal] Export failed:', err);
      addToast(`Export failed: ${err.message}`, 'error', 4000);
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-crm-card border border-crm-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-crm-border">
          <div>
            <h2 className="text-sm font-semibold text-crm-text">Export to PDF</h2>
            <p className="text-xs text-crm-muted mt-0.5">{selectedRows.length} {entityLabel.toLowerCase()} selected</p>
          </div>
          <button onClick={onClose} className="text-crm-muted hover:text-crm-text transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Template bar */}
          {templates.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-crm-muted font-medium">Templates:</span>
              {templates.map((tpl) => (
                <span key={tpl.id} className="inline-flex items-center gap-1 text-xs bg-crm-accent/10 text-crm-accent px-2 py-1 rounded-lg">
                  <button onClick={() => handleLoadTemplate(tpl)} className="hover:underline">{tpl.name}</button>
                  <button onClick={() => handleDeleteTemplate(tpl)} className="text-crm-muted hover:text-red-400 ml-0.5">&times;</button>
                </span>
              ))}
            </div>
          )}

          {/* Primary fields */}
          <div>
            <h3 className="text-xs font-semibold text-crm-muted uppercase tracking-wider mb-2">{entityLabel} Fields</h3>
            <FieldCheckboxGroup
              fields={exportablePrimary}
              checked={primaryChecked}
              onChange={setPrimaryChecked}
              label="Select All"
            />
          </div>

          {/* Linked entity sections */}
          {availableLinkedTypes.length > 0 && linkedData && (
            <div>
              <h3 className="text-xs font-semibold text-crm-muted uppercase tracking-wider mb-2">Include Linked Records</h3>
              {availableLinkedTypes.map(lt => {
                const meta = LINKED_EXPORT_FIELDS[lt];
                if (!meta) return null;
                const isOn = !!linkedToggles[lt];
                return (
                  <div key={lt} className="mb-3">
                    <label className="flex items-center gap-2 text-xs font-medium text-crm-text cursor-pointer mb-1.5">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => setLinkedToggles(prev => ({ ...prev, [lt]: !prev[lt] }))}
                        className="rounded border-crm-border"
                      />
                      Include {meta.label}
                    </label>
                    {isOn && (
                      <div className="ml-5 pl-3 border-l border-crm-border/40">
                        <FieldCheckboxGroup
                          fields={meta.fields}
                          checked={linkedChecked[lt] || new Set()}
                          onChange={(next) => setLinkedChecked(prev => ({ ...prev, [lt]: next }))}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-crm-border bg-crm-bg/50">
          <div className="flex items-center gap-2">
            {showSaveTemplate ? (
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={templateName}
                  onChange={e => setTemplateName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveTemplate()}
                  placeholder="Template name..."
                  className="text-xs bg-crm-bg border border-crm-border rounded px-2 py-1 text-crm-text w-36 focus:outline-none focus:border-crm-accent"
                  autoFocus
                />
                <button onClick={handleSaveTemplate} className="text-xs text-crm-accent hover:underline">Save</button>
                <button onClick={() => setShowSaveTemplate(false)} className="text-xs text-crm-muted hover:text-crm-text">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowSaveTemplate(true)} className="text-xs text-crm-muted hover:text-crm-accent transition-colors">
                Save as Template
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-xs text-crm-muted hover:text-crm-text px-3 py-1.5 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting || primaryChecked.size === 0}
              className="text-xs bg-crm-accent hover:bg-crm-accent-hover disabled:opacity-50 text-white font-medium px-4 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
            >
              {exporting ? (
                <>
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Exporting...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Export PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
