/**
 * Contracts.jsx — Contract packages list page
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/shared/Toast';
import NewContractModal from '../components/contracts/NewContractModal';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export default function Contracts() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadPackages = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/contracts`, { headers: getAuthHeaders() });
      const data = await res.json();
      setPackages(data.rows || []);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadPackages(); }, [loadPackages]);

  const handleCreate = async (data) => {
    try {
      const res = await fetch(`${API}/api/contracts`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Create failed');
      }
      const result = await res.json();
      setShowModal(false);
      addToast(`Package created with ${result.forms?.length || 1} form(s)`, 'success');
      navigate(`/contracts/${result.package.package_id}`);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (pkgId, e) => {
    e.stopPropagation();
    if (!confirm('Delete this package and all its forms?')) return;
    try {
      await fetch(`${API}/api/contracts/${pkgId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setPackages(prev => prev.filter(p => p.package_id !== pkgId));
      addToast('Package deleted', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-crm-border bg-crm-card">
        <div>
          <h1 className="text-xl font-semibold text-crm-text">Contracts</h1>
          <p className="text-sm text-crm-muted">AIR CRE contract packages linked to your deals</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-4 py-2 bg-crm-accent hover:bg-crm-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
        >
          + New Package
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64 text-crm-muted">Loading...</div>
        ) : packages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-crm-muted">
            <svg className="w-16 h-16 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-lg">No packages yet</p>
            <p className="text-sm mt-1">Create your first contract package to get started</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 px-4 py-2 bg-crm-accent hover:bg-crm-accent-hover text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              + New Package
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {packages.map(pkg => (
              <div
                key={pkg.package_id}
                onClick={() => navigate(`/contracts/${pkg.package_id}`)}
                className="flex items-center justify-between px-5 py-4 bg-crm-card border border-crm-border rounded-lg hover:border-crm-accent/30 cursor-pointer transition-colors group"
              >
                <div className="min-w-0">
                  <div className="font-medium text-crm-text truncate">{pkg.name}</div>
                  <div className="flex items-center gap-2 text-xs text-crm-muted mt-1">
                    <span>{pkg.deal_name}</span>
                    <span>•</span>
                    <span>{new Date(pkg.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex gap-1">
                    {(pkg.form_codes || []).map((code, i) => (
                      <span key={i} className="font-mono text-[10px] bg-crm-bg border border-crm-border px-1.5 py-0.5 rounded text-crm-muted">
                        {code}
                      </span>
                    ))}
                  </div>

                  <span className="text-xs text-crm-muted">
                    {pkg.form_count || 0} form{(pkg.form_count || 0) !== 1 ? 's' : ''}
                  </span>

                  <button
                    onClick={(e) => handleDelete(pkg.package_id, e)}
                    className="opacity-0 group-hover:opacity-100 text-crm-muted hover:text-red-400 transition-all"
                    title="Delete package"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <NewContractModal
          onClose={() => setShowModal(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
}
