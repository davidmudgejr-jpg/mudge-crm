/**
 * Contracts.jsx — AIR CRE Contracts list page
 *
 * Shows all contracts with status, form type, linked deal, and dates.
 * "New Contract" opens a modal to pick form type + deal.
 * Row click navigates to the full ContractEditor page.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/shared/Toast';
import EmptyState from '../components/shared/EmptyState';
import NewContractModal from '../components/contracts/NewContractModal';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const STATUS_BADGE = {
  Draft: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20',
  Final: 'bg-green-500/15 text-green-400 border border-green-500/20',
};

const FORM_LABELS = {
  OFA: 'Purchase (Improved)',
  OFAL: 'Purchase (Vacant Land)',
  STN: 'Single Tenant Net',
  STG: 'Single Tenant Gross',
  MTN: 'Multi-Tenant Net',
  MTG: 'Multi-Tenant Gross',
  BBE: 'Buyer-Broker Rep',
  OA: 'Listing Agreement',
  AD: 'Agency Disclosure',
  ATL: 'Lease Amendment',
  ATPA: 'Purchase Amendment',
};

export default function Contracts() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);

  const loadContracts = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/contracts`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Failed to load contracts');
      const data = await res.json();
      setContracts(data.rows || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadContracts(); }, [loadContracts]);

  const handleCreate = async (newContract) => {
    try {
      const res = await fetch(`${API}/api/contracts`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newContract),
      });
      if (!res.ok) throw new Error('Failed to create contract');
      const data = await res.json();
      addToast(`Contract created (${data.autoFilledCount} fields auto-filled)`, 'success');
      setShowNewModal(false);
      navigate(`/contracts/${data.contract.contract_id}`);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this draft contract?')) return;
    try {
      const res = await fetch(`${API}/api/contracts/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setContracts(prev => prev.filter(c => c.contract_id !== id));
      addToast('Contract deleted', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-crm-text">Contracts</h1>
          <p className="text-sm text-crm-muted mt-1">AIR CRE contract packages linked to your deals</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 bg-crm-accent hover:bg-crm-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          + New Contract
        </button>
      </div>

      {/* Contract list */}
      {loading ? (
        <div className="text-crm-muted text-center py-12">Loading contracts...</div>
      ) : contracts.length === 0 ? (
        <EmptyState
          entity="deals"
          entityLabel="contracts"
          onAdd={() => setShowNewModal(true)}
          addLabel="+ New Contract"
        />
      ) : (
        <div className="space-y-2">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_160px_180px_100px_120px_60px] gap-4 px-4 py-2 text-xs font-medium text-crm-muted uppercase tracking-wider border-b border-crm-border">
            <div>Contract Name</div>
            <div>Form Type</div>
            <div>Deal</div>
            <div>Status</div>
            <div>Modified</div>
            <div></div>
          </div>

          {/* Rows */}
          {contracts.map((c, i) => (
            <div
              key={c.contract_id}
              onClick={() => navigate(`/contracts/${c.contract_id}`)}
              className="grid grid-cols-[1fr_160px_180px_100px_120px_60px] gap-4 px-4 py-3 rounded-lg bg-crm-card hover:bg-crm-hover cursor-pointer transition-colors border border-transparent hover:border-crm-border/50"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="text-crm-text font-medium truncate">{c.name}</div>
              <div className="text-crm-muted text-sm">
                <span className="font-mono text-xs bg-crm-bg px-1.5 py-0.5 rounded mr-1">{c.form_code}</span>
                {FORM_LABELS[c.form_code] || c.form_code}
              </div>
              <div className="text-crm-muted text-sm truncate">{c.deal_name || '—'}</div>
              <div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[c.status] || ''}`}>
                  {c.status}
                </span>
              </div>
              <div className="text-crm-muted text-sm">{formatDate(c.updated_at)}</div>
              <div className="flex justify-end">
                {c.status === 'Draft' && (
                  <button
                    onClick={(e) => handleDelete(c.contract_id, e)}
                    className="text-crm-muted hover:text-red-400 transition-colors p-1"
                    title="Delete draft"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Contract Modal */}
      {showNewModal && (
        <NewContractModal
          onClose={() => setShowNewModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
