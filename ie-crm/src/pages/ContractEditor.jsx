/**
 * ContractEditor.jsx — Full-page contract editor with WYSIWYG document preview
 *
 * Layout: Left field checklist | Center document preview | Top toolbar
 * Fields are editable inline in the document when status is Draft.
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
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [contract, setContract] = useState(null);
  const [template, setTemplate] = useState(null);
  const [fieldValues, setFieldValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);

  // Load contract + template
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API}/api/contracts/${id}`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Contract not found');
        const data = await res.json();
        setContract(data.contract);
        setTemplate(data.template);
        setFieldValues(data.contract.field_values || {});
      } catch (err) {
        addToast(err.message, 'error');
        navigate('/contracts');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, navigate, addToast]);

  // Auto-save field values with debounce
  const saveFieldValues = useCallback(async (newValues) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`${API}/api/contracts/${id}`, {
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

  // Handle field change from the renderer
  const handleFieldChange = useCallback((annotationId, value) => {
    setFieldValues(prev => {
      const next = { ...prev, [annotationId]: value };
      saveFieldValues({ [annotationId]: value }); // send just the changed field
      return next;
    });
  }, [saveFieldValues]);

  // Finalize contract
  const handleFinalize = async () => {
    if (!confirm('Finalize this contract? Fields will become read-only.')) return;
    try {
      const res = await fetch(`${API}/api/contracts/${id}/finalize`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Finalize failed');
      const data = await res.json();
      setContract(data.contract);
      addToast('Contract finalized', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Export PDF (client-side via html2pdf)
  const handleExportPDF = async () => {
    try {
      const { default: html2pdf } = await import('html2pdf.js');
      const el = document.getElementById('air-document-root');
      if (!el) return addToast('Document not rendered', 'error');

      addToast('Generating PDF...', 'info', 2000);
      await html2pdf().set({
        margin: 0,
        filename: `${contract.name}.pdf`,
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

  // Export WAFPKG
  const handleExportWafpkg = async () => {
    try {
      addToast('Generating WAFPKG...', 'info', 2000);
      const res = await fetch(`${API}/api/contracts/${id}/export/wafpkg`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contract.name}.wafpkg`;
      a.click();
      URL.revokeObjectURL(url);
      addToast('WAFPKG exported', 'success');
    } catch (err) {
      addToast('WAFPKG export failed: ' + err.message, 'error');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-full text-crm-muted">Loading contract...</div>;
  }

  if (!contract || !template) {
    return <div className="flex items-center justify-center h-full text-crm-muted">Contract not found</div>;
  }

  const isDraft = contract.status === 'Draft';
  const fields = template.fields || [];
  const editableFields = fields.filter(f => f.dataType === 1 || f.dataType === 3);
  const filledCount = editableFields.filter(f => {
    const v = fieldValues[String(f.annotationId)];
    return v && v.trim() !== '';
  }).length;

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
            <h1 className="text-lg font-semibold text-crm-text">{contract.name}</h1>
            <div className="flex items-center gap-2 text-xs text-crm-muted">
              <span className="font-mono bg-crm-bg px-1.5 py-0.5 rounded">{contract.form_code}</span>
              <span>{template.name}</span>
              <span>•</span>
              <span>{contract.deal_name}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Save indicator */}
          <span className="text-xs text-crm-muted">
            {saving ? 'Saving...' : `${filledCount}/${editableFields.length} fields`}
          </span>

          {/* Status badge */}
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isDraft
              ? 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20'
              : 'bg-green-500/15 text-green-400 border border-green-500/20'
          }`}>
            {contract.status}
          </span>

          {/* Actions */}
          {isDraft && (
            <button
              onClick={handleFinalize}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Finalize
            </button>
          )}
          <button
            onClick={handleExportPDF}
            className="px-3 py-1.5 bg-crm-bg hover:bg-crm-hover border border-crm-border text-crm-text rounded-lg text-sm transition-colors"
          >
            Export PDF
          </button>
          <button
            onClick={handleExportWafpkg}
            className="px-3 py-1.5 bg-crm-bg hover:bg-crm-hover border border-crm-border text-crm-text rounded-lg text-sm transition-colors"
          >
            Export WAFPKG
          </button>
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
                const value = fieldValues[String(f.annotationId)];
                const filled = value && value.trim() !== '';
                return (
                  <div
                    key={f.annotationId}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors hover:bg-crm-hover ${
                      filled ? 'text-crm-text' : 'text-crm-muted'
                    }`}
                    onClick={() => {
                      // Scroll to field in document
                      const el = document.querySelector(`[data-annotation-id="${f.annotationId}"]`);
                      if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        el.focus();
                      }
                    }}
                  >
                    <span className={`w-3 h-3 rounded-full border shrink-0 ${
                      filled
                        ? 'bg-green-500 border-green-500'
                        : f.isRequired
                          ? 'border-red-500/60'
                          : 'border-crm-border'
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
        <div className="flex-1 overflow-y-auto bg-[#2a2a2e] p-6">
          <XamlDocumentRenderer
            xamlContent={template.xamlContent}
            fieldValues={fieldValues}
            onFieldChange={handleFieldChange}
            editable={isDraft}
          />
        </div>
      </div>
    </div>
  );
}
