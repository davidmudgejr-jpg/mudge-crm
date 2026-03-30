/**
 * DealContractsSection.jsx — Shows contracts linked to a deal in DealDetail
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export default function DealContractsSection({ dealId, dealName }) {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!dealId) return;
    fetch(`${API}/api/contracts/by-deal/${dealId}`, { headers: getAuthHeaders() })
      .then(r => r.json())
      .then(data => setContracts(data.rows || []))
      .catch(() => {});
  }, [dealId]);

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-crm-hover rounded-lg transition-colors"
      >
        <svg className={`w-3.5 h-3.5 text-crm-muted transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <svg className="w-4 h-4 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span className="text-sm font-medium text-crm-text">Contracts</span>
        <span className="text-xs text-crm-muted bg-crm-bg px-1.5 py-0.5 rounded-full">{contracts.length}</span>
      </button>

      {open && (
        <div className="ml-6 mt-1 space-y-1">
          {contracts.length === 0 ? (
            <p className="text-xs text-crm-muted py-1 px-2">No contracts yet</p>
          ) : (
            contracts.map(c => (
              <div
                key={c.contract_id}
                onClick={() => navigate(`/contracts/${c.contract_id}`)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-crm-hover cursor-pointer transition-colors"
              >
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  c.status === 'Final'
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-yellow-500/15 text-yellow-400'
                }`}>
                  {c.status}
                </span>
                <span className="font-mono text-xs text-crm-muted">{c.form_code}</span>
                <span className="text-sm text-crm-text truncate">{c.name}</span>
              </div>
            ))
          )}

          <button
            onClick={() => navigate('/contracts')}
            className="text-xs text-crm-accent hover:text-crm-accent-hover px-2 py-1 transition-colors"
          >
            + New Contract
          </button>
        </div>
      )}
    </div>
  );
}
