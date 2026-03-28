/**
 * NewContractModal.jsx — Create a new contract package with 1+ forms
 */

import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const FORM_CATEGORIES = {
  'Purchase': ['OFA', 'OFAL', 'ATPA'],
  'Lease': ['STN', 'STG', 'MTN', 'MTG', 'ATL'],
  'Agency': ['BBE', 'OA', 'AD'],
};

export default function NewContractModal({ onClose, onCreate }) {
  const [templates, setTemplates] = useState([]);
  const [deals, setDeals] = useState([]);
  const [selectedForms, setSelectedForms] = useState([]); // array of form codes
  const [selectedDeal, setSelectedDeal] = useState('');
  const [packageName, setPackageName] = useState('');
  const [dealSearch, setDealSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/contracts/templates`, { headers: getAuthHeaders() }).then(r => r.json()),
      fetch(`${API}/api/db/query`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ sql: "SELECT deal_id, deal_name, status FROM deals WHERE status NOT IN ('Dead', 'Dead Lead', 'Deal fell through') ORDER BY deal_name", params: [] }),
      }).then(r => r.json()),
    ]).then(([tData, dData]) => {
      setTemplates(tData.templates || []);
      setDeals(dData.rows || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filteredDeals = deals.filter(d =>
    !dealSearch || d.deal_name?.toLowerCase().includes(dealSearch.toLowerCase())
  );

  const selectedDealObj = deals.find(d => String(d.deal_id) === selectedDeal);

  // Auto-generate package name from deal + form codes
  useEffect(() => {
    if (selectedDealObj && selectedForms.length > 0) {
      const formLabel = selectedForms.join(' + ');
      setPackageName(`${selectedDealObj.deal_name} — ${formLabel}`);
    }
  }, [selectedDealObj, selectedForms]);

  const toggleForm = (code) => {
    setSelectedForms(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const handleCreate = () => {
    if (!selectedForms.length || !selectedDeal || !packageName.trim()) return;
    onCreate({
      formCodes: selectedForms,
      dealId: selectedDeal,
      name: packageName.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-crm-overlay" onClick={onClose}>
      <div
        className="bg-crm-card border border-crm-border rounded-xl shadow-2xl w-full max-w-lg mx-4 animate-sheet-down"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-crm-border">
          <h2 className="text-lg font-semibold text-crm-text">New Contract Package</h2>
          <button onClick={onClose} className="text-crm-muted hover:text-crm-text transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-crm-muted">Loading...</div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Step 1: Select Deal */}
            <div>
              <label className="block text-sm font-medium text-crm-text mb-2">Link to Deal *</label>
              <input
                type="text"
                placeholder="Search deals..."
                value={dealSearch}
                onChange={e => setDealSearch(e.target.value)}
                className="w-full px-3 py-2 bg-crm-bg border border-crm-border rounded-lg text-crm-text text-sm mb-2 focus:border-crm-accent outline-none"
              />
              <div className="max-h-36 overflow-y-auto border border-crm-border rounded-lg bg-crm-bg">
                {filteredDeals.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-crm-muted">No matching deals</div>
                ) : (
                  filteredDeals.slice(0, 20).map(d => (
                    <div
                      key={d.deal_id}
                      onClick={() => setSelectedDeal(String(d.deal_id))}
                      className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                        selectedDeal === String(d.deal_id)
                          ? 'bg-crm-accent/20 text-crm-accent'
                          : 'text-crm-text hover:bg-crm-hover'
                      }`}
                    >
                      <span className="font-medium">{d.deal_name}</span>
                      <span className="ml-2 text-crm-muted text-xs">{d.status}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Step 2: Select Forms (multi-select) */}
            <div>
              <label className="block text-sm font-medium text-crm-text mb-2">
                Forms * <span className="text-crm-muted font-normal">— select one or more</span>
              </label>
              <div className="space-y-3">
                {Object.entries(FORM_CATEGORIES).map(([cat, codes]) => (
                  <div key={cat}>
                    <div className="text-xs font-medium text-crm-muted uppercase tracking-wider mb-1">{cat}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {codes.map(code => {
                        const t = templates.find(t => t.formCode === code);
                        if (!t) return null;
                        const selected = selectedForms.includes(code);
                        return (
                          <button
                            key={code}
                            onClick={() => toggleForm(code)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                              selected
                                ? 'bg-crm-accent/20 border-crm-accent text-crm-accent'
                                : 'bg-crm-bg border-crm-border text-crm-text hover:border-crm-accent/50'
                            }`}
                            title={t.name}
                          >
                            {selected && (
                              <svg className="w-3 h-3 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                            <span className="font-mono mr-1">{code}</span>
                            {t.fieldCount}f
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {selectedForms.length > 0 && (
                <p className="mt-2 text-xs text-crm-muted">
                  {selectedForms.length} form{selectedForms.length !== 1 ? 's' : ''} selected: {selectedForms.join(', ')}
                </p>
              )}
            </div>

            {/* Step 3: Package Name */}
            <div>
              <label className="block text-sm font-medium text-crm-text mb-2">Package Name</label>
              <input
                type="text"
                value={packageName}
                onChange={e => setPackageName(e.target.value)}
                placeholder="Auto-generated from deal + forms"
                className="w-full px-3 py-2 bg-crm-bg border border-crm-border rounded-lg text-crm-text text-sm focus:border-crm-accent outline-none"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-crm-border">
          <button onClick={onClose} className="px-4 py-2 text-sm text-crm-muted hover:text-crm-text transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!selectedForms.length || !selectedDeal || !packageName.trim()}
            className="px-4 py-2 bg-crm-accent hover:bg-crm-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            Create Package ({selectedForms.length} form{selectedForms.length !== 1 ? 's' : ''})
          </button>
        </div>
      </div>
    </div>
  );
}
