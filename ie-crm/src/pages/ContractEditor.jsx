/**
 * ContractEditor.jsx — Package editor with form tabs + WYSIWYG document preview
 *
 * Layout: Top toolbar (zoom, export) → Form tabs → Left field checklist | Center document
 * Each tab = one form within the package. Switching tabs loads that form's template + fields.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useToast } from '../components/shared/Toast';
import XamlDocumentRenderer from '../components/contracts/XamlDocumentRenderer';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export default function ContractEditor() {
  const { id } = useParams(); // package_id
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [pkg, setPkg] = useState(null);
  const [forms, setForms] = useState([]);
  const [activeFormIdx, setActiveFormIdx] = useState(0);
  const [fieldValues, setFieldValues] = useState({}); // { contractId: { annotationId: value } }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoom, setZoom] = useState(0.35);
  const [showAddForm, setShowAddForm] = useState(false);
  const [templates, setTemplates] = useState([]);
  const saveTimer = useRef(null);

  // Load package + all forms
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/api/contracts/${id}`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Package not found');
        const data = await res.json();
        setPkg(data.package);
        setForms(data.forms || []);
        // Initialize field values per form
        const fv = {};
        for (const f of (data.forms || [])) {
          fv[f.contract_id] = f.field_values || {};
        }
        setFieldValues(fv);
      } catch (err) {
        addToast(err.message, 'error');
        navigate('/contracts');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate, addToast]);

  // Load templates for the "add form" dropdown
  useEffect(() => {
    fetch(`${API}/api/contracts/templates`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(d => setTemplates(d.templates || []))
      .catch(() => {});
  }, []);

  const activeForm = forms[activeFormIdx];
  const activeContractId = activeForm?.contract_id;
  const activeTemplate = activeForm?.template;
  const activeFieldValues = activeContractId ? (fieldValues[activeContractId] || {}) : {};

  // Auto-save field values with debounce
  const saveFieldValues = useCallback(async (contractId, newValues) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`${API}/api/contracts/${id}/forms/${contractId}`, {
          method: 'PATCH',
          headers: getAuthHeaders(),
          body: JSON.stringify({ fieldValues: newValues }),
        });
        if (!res.ok) throw new Error('Save failed');
      } catch (err) {
        addToast(err.message, 'error');
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [id, addToast]);

  const handleFieldChange = useCallback((annotationId, value) => {
    if (!activeContractId) return;
    setFieldValues(prev => {
      const formFv = { ...prev[activeContractId], [annotationId]: value };
      saveFieldValues(activeContractId, { [annotationId]: value });
      return { ...prev, [activeContractId]: formFv };
    });
  }, [activeContractId, saveFieldValues]);

  // Add a form to the package
  const handleAddForm = async (formCode) => {
    try {
      const res = await fetch(`${API}/api/contracts/${id}/forms`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ formCode }),
      });
      if (!res.ok) throw new Error('Failed to add form');
      const data = await res.json();
      // Reload the package
      const pkgRes = await fetch(`${API}/api/contracts/${id}`, { headers: getAuthHeaders() });
      const pkgData = await pkgRes.json();
      setForms(pkgData.forms || []);
      const fv = {};
      for (const f of (pkgData.forms || [])) {
        fv[f.contract_id] = f.field_values || {};
      }
      setFieldValues(fv);
      setActiveFormIdx(pkgData.forms.length - 1); // switch to new tab
      setShowAddForm(false);
      addToast(`Added ${formCode}`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Remove a form from the package
  const handleRemoveForm = async (contractId) => {
    if (forms.length <= 1) return addToast('Package must have at least one form', 'error');
    if (!confirm('Remove this form from the package?')) return;
    try {
      await fetch(`${API}/api/contracts/${id}/forms/${contractId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const newForms = forms.filter(f => f.contract_id !== contractId);
      setForms(newForms);
      if (activeFormIdx >= newForms.length) setActiveFormIdx(newForms.length - 1);
      addToast('Form removed', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Export PDF
  const handleExportPDF = async () => {
    try {
      const { default: html2pdf } = await import('html2pdf.js');
      const el = document.getElementById('air-document-root');
      if (!el) return addToast('Document not rendered', 'error');

      addToast('Generating PDF...', 'info', 2000);
      await html2pdf().set({
        margin: 0,
        filename: `${pkg?.name || 'contract'}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], before: '.air-page' },
      }).from(el).save();
      addToast('PDF exported', 'success');
    } catch (err) {
      addToast('PDF export failed: ' + err.message, 'error');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-crm-muted">Loading package...</div>;
  }

  if (!pkg || !forms.length) {
    return <div className="flex items-center justify-center h-full text-crm-muted">Package not found</div>;
  }

  const fields = activeTemplate?.fields || [];
  const editableFields = fields.filter(f => f.dataType === 1 || f.dataType === 3);
  const filledCount = editableFields.filter(f => {
    const v = activeFieldValues[String(f.annotationId)];
    return v && v.trim() !== '';
  }).length;

  // Forms already in this package (to prevent duplicates in "add" dropdown)
  const existingCodes = new Set(forms.map(f => f.form_code));

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 bg-crm-card border-b border-crm-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/contracts')}
            className="text-crm-muted hover:text-crm-text transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold text-crm-text">{pkg.name}</h1>
            <div className="flex items-center gap-2 text-xs text-crm-muted">
              <span>{forms.length} form{forms.length !== 1 ? 's' : ''}</span>
              <span>•</span>
              <span>{pkg.deal_name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Zoom controls */}
          <div className="flex items-center gap-1.5 border-r border-crm-border pr-3 mr-1">
            <button
              onClick={() => setZoom(z => Math.max(0.2, +(z - 0.05).toFixed(2)))}
              className="w-6 h-6 flex items-center justify-center rounded text-crm-muted hover:text-crm-text hover:bg-crm-hover transition-colors text-sm"
            >-</button>
            <input
              type="range" min="20" max="100" step="5"
              value={Math.round(zoom * 100)}
              onChange={e => setZoom(parseInt(e.target.value) / 100)}
              className="w-24 h-1 accent-crm-accent cursor-pointer"
            />
            <button
              onClick={() => setZoom(z => Math.min(1.0, +(z + 0.05).toFixed(2)))}
              className="w-6 h-6 flex items-center justify-center rounded text-crm-muted hover:text-crm-text hover:bg-crm-hover transition-colors text-sm"
            >+</button>
            <span className="text-xs text-crm-muted w-8 text-center font-mono">{Math.round(zoom * 100)}%</span>
          </div>

          <span className="text-xs text-crm-muted">
            {saving ? 'Saving...' : `${filledCount}/${editableFields.length} fields`}
          </span>

          <button
            onClick={handleExportPDF}
            className="px-3 py-1.5 bg-crm-bg hover:bg-crm-hover border border-crm-border text-crm-text rounded-lg text-sm transition-colors"
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* Form tabs */}
      <div className="flex items-center px-4 bg-crm-sidebar border-b border-crm-border shrink-0 overflow-x-auto">
        {forms.map((form, i) => (
          <button
            key={form.contract_id}
            onClick={() => setActiveFormIdx(i)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
              i === activeFormIdx
                ? 'border-crm-accent text-crm-accent font-medium'
                : 'border-transparent text-crm-muted hover:text-crm-text hover:border-crm-border'
            }`}
          >
            <span className="font-mono text-[10px] bg-crm-bg px-1.5 py-0.5 rounded">{form.form_code}</span>
            <span className="max-w-[200px] truncate">{form.template?.name || form.name}</span>
            {forms.length > 1 && i === activeFormIdx && (
              <button
                onClick={(e) => { e.stopPropagation(); handleRemoveForm(form.contract_id); }}
                className="ml-1 text-crm-muted hover:text-red-400 transition-colors"
                title="Remove form"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </button>
        ))}

        {/* Add form button */}
        <div className="relative">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1 px-3 py-2.5 text-sm text-crm-muted hover:text-crm-accent transition-colors"
            title="Add form to package"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>

          {showAddForm && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-crm-card border border-crm-border rounded-lg shadow-2xl z-50 max-h-80 overflow-y-auto">
              <div className="p-2 text-xs font-medium text-crm-muted uppercase border-b border-crm-border">Add Form</div>
              {templates.filter(t => !existingCodes.has(t.formCode)).map(t => (
                <button
                  key={t.formCode}
                  onClick={() => handleAddForm(t.formCode)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-crm-text hover:bg-crm-hover transition-colors text-left"
                >
                  <span className="font-mono text-[10px] bg-crm-bg px-1.5 py-0.5 rounded shrink-0">{t.formCode}</span>
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
              {templates.filter(t => !existingCodes.has(t.formCode)).length === 0 && (
                <div className="px-3 py-2 text-sm text-crm-muted">All forms already added</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content: sidebar + document */}
      <div className="flex flex-1 overflow-hidden">
        {/* Field checklist sidebar */}
        <div className="w-64 shrink-0 border-r border-crm-border bg-crm-sidebar overflow-y-auto">
          <div className="p-3">
            <h3 className="text-xs font-medium text-crm-muted uppercase tracking-wider mb-2">
              Fields ({filledCount}/{editableFields.length})
            </h3>
            <div className="space-y-0.5">
              {editableFields.map(f => {
                const value = activeFieldValues[String(f.annotationId)];
                const filled = value && value.trim() !== '';
                return (
                  <div
                    key={f.annotationId}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors hover:bg-crm-hover ${
                      filled ? 'text-crm-text' : 'text-crm-muted'
                    }`}
                    onClick={() => {
                      const el = document.querySelector(`[data-annotation-id="${f.annotationId}"]`);
                      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); }
                    }}
                  >
                    <span className={`w-3 h-3 rounded-full border shrink-0 ${
                      filled ? 'bg-green-500 border-green-500'
                        : f.isRequired ? 'border-red-500/60' : 'border-crm-border'
                    }`} />
                    <span className="truncate">
                      {f.name}
                      {f.isRequired && !filled && <span className="text-red-400 ml-0.5">*</span>}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Document preview */}
        <div className="flex-1 overflow-auto bg-[#2a2a2e]">
          {activeTemplate ? (
            <XamlDocumentRenderer
              xamlContent={activeTemplate.xamlContent}
              fieldValues={activeFieldValues}
              onFieldChange={handleFieldChange}
              editable={true}
              zoom={zoom}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-crm-muted">
              Template not available for {activeForm?.form_code}
            </div>
          )}
        </div>
      </div>

      {/* Click-outside handler for add form dropdown */}
      {showAddForm && (
        <div className="fixed inset-0 z-40" onClick={() => setShowAddForm(false)} />
      )}
    </div>
  );
}
