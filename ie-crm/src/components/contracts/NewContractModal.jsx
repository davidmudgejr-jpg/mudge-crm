/**
 * NewContractModal.jsx — Pick a form type + deal to create a new contract
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
  const [selectedForm, setSelectedForm] = useState('');
  const [selectedDeal, setSelectedDeal] = useState('');
  const [contractName, setContractName] = useState('');
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

  const selectedTemplate = templates.find(t => t.formCode === selectedForm);
  const selectedDealObj = deals.find(d => String(d.deal_id) === selectedDeal);

  // Auto-generate contract name
  useEffect(() => {
    if (selectedDealObj && selectedTemplate) {
      setContractName(`${selectedDealObj.deal_name} — ${selectedTemplate.name}`);
    }
  }, [selectedDealObj, selectedTemplate]);

  const handleCreate = () => {
    if (!selectedForm || !selectedDeal || !contractName.trim()) return;
    onCreate({
      formCode: selectedForm,
      dealId: selectedDeal,
      name: contractName.trim(),
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
          <h2 className="text-lg font-semibold text-crm-text">New Contract</h2>
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

            {/* Step 2: Select Form Type */}
            <div>
              <label className="block text-sm font-medium text-crm-text mb-2">Form Type *</label>
              <div className="space-y-3">
                {Object.entries(FORM_CATEGORIES).map(([cat, codes]) => (
                  <div key={cat}>
                    <div className="text-xs font-medium text-crm-muted uppercase tracking-wider mb-1">{cat}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {codes.map(code => {
                        const t = templates.find(t => t.formCode === code);
                        if (!t) return null;
                        return (
                          <button
                            key={code}
                            onClick={() => setSelectedForm(code)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                              selectedForm === code
                                ? 'bg-crm-accent/20 border-crm-accent text-crm-accent'
                                : 'bg-crm-bg border-crm-border text-crm-text hover:border-crm-accent/50'
                            }`}
                            title={t.name}
                          >
                            <span className="font-mono mr-1">{code}</span>
                            {t.fieldCount}f
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              {selectedTemplate && (
                <p className="mt-2 text-xs text-crm-muted">{selectedTemplate.name} — {selectedTemplate.fieldCount} fields</p>
              )}
            </div>

            {/* Step 3: Contract Name */}
            <div>
              <label className="block text-sm font-medium text-crm-text mb-2">Contract Name</label>
              <input
                type="text"
                value={contractName}
                onChange={e => setContractName(e.target.value)}
                placeholder="Auto-generated from deal + form type"
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
            disabled={!selectedForm || !selectedDeal || !contractName.trim()}
            className="px-4 py-2 bg-crm-accent hover:bg-crm-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
          >
            Create Contract
          </button>
        </div>
      </div>
    </div>
  );
}
