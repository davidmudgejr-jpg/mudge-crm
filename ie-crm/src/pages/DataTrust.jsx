import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/shared/Toast';
import useDetailPanel from '../hooks/useDetailPanel';
import { SlideOver } from '../components/shared/SlideOver';
import ContactDetail from './ContactDetail';

const TIER_CONFIG = {
  gold:      { label: 'Gold',      color: 'from-amber-500 to-yellow-400', text: 'text-amber-400', bg: 'bg-amber-500/15 border-amber-500/30', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', desc: 'Manual research or 3+ sources' },
  silver:    { label: 'Silver',    color: 'from-gray-300 to-gray-400',     text: 'text-gray-300',  bg: 'bg-gray-400/15 border-gray-400/30',  icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', desc: '2 API sources agree' },
  bronze:    { label: 'Bronze',    color: 'from-orange-600 to-orange-400', text: 'text-orange-400', bg: 'bg-orange-500/15 border-orange-500/30', icon: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'Single API source' },
  untracked: { label: 'Untracked', color: 'from-gray-600 to-gray-500',    text: 'text-gray-500',  bg: 'bg-gray-600/15 border-gray-600/30',  icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', desc: 'No source data' },
};

const TIER_FILTERS = ['all', 'gold', 'silver', 'bronze', 'untracked', 'campaign_ready'];

function TierCard({ tier, count, total }) {
  const cfg = TIER_CONFIG[tier];
  if (!cfg) return null;
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
  return (
    <div className={`rounded-xl border ${cfg.bg} p-4 flex-1 min-w-[140px]`}>
      <div className="flex items-center gap-2 mb-2">
        <svg className={`w-4 h-4 ${cfg.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cfg.icon} />
        </svg>
        <span className={`text-sm font-semibold ${cfg.text}`}>{cfg.label}</span>
      </div>
      <p className="text-2xl font-bold text-crm-text">{count?.toLocaleString() || 0}</p>
      <p className="text-[10px] text-crm-muted mt-0.5">{pct}% of contacts</p>
      <p className="text-[10px] text-crm-muted">{cfg.desc}</p>
    </div>
  );
}

function SuggestionCard({ suggestion, onResolve }) {
  const [resolving, setResolving] = useState(false);
  const s = suggestion;

  const handle = async (action) => {
    setResolving(true);
    await onResolve(s.id, action);
    setResolving(false);
  };

  return (
    <div className="bg-crm-card border border-crm-border rounded-lg p-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-crm-text">{s.entity_name || 'Unknown'}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TIER_CONFIG[s.data_tier]?.bg || TIER_CONFIG.bronze.bg}`}>
            {s.data_tier}
          </span>
          <span className="text-[10px] text-crm-muted">{s.source}</span>
        </div>
        <div className="text-xs text-crm-muted">
          <span className="font-medium">{s.field_label || s.field_name}</span>:
          <span className="text-red-400/70 line-through ml-1">{s.current_value || '(empty)'}</span>
          <span className="mx-1">→</span>
          <span className="text-emerald-400">{s.suggested_value}</span>
        </div>
        {s.source_detail && <p className="text-[10px] text-crm-muted mt-0.5">{s.source_detail}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-[10px] text-crm-muted">{s.confidence}%</span>
        <button
          onClick={() => handle('accepted')}
          disabled={resolving}
          className="h-7 px-2.5 rounded-md text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-30"
        >
          Accept
        </button>
        <button
          onClick={() => handle('rejected')}
          disabled={resolving}
          className="h-7 px-2.5 rounded-md text-[11px] font-medium text-crm-muted hover:text-crm-text hover:bg-crm-hover border border-crm-border"
        >
          Reject
        </button>
      </div>
    </div>
  );
}

export default function DataTrust({ onCountChange }) {
  const { token } = useAuth();
  const { addToast } = useToast();
  const { openDetail, detailState, closeDetail } = useDetailPanel();
  const [overview, setOverview] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [activeTier, setActiveTier] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const LIMIT = 50;

  const loadOverview = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/data-trust/overview`, { headers });
      const data = await res.json();
      setOverview(data);
    } catch (err) {
      console.error('Failed to load overview:', err);
    }
  }, [token]);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const tier = activeTier === 'campaign_ready' ? 'all' : activeTier;
      const url = `${API}/api/data-trust/contacts?tier=${tier}&page=${page}&limit=${LIMIT}`;
      const res = await fetch(url, { headers });
      const data = await res.json();
      let rows = data.rows || [];
      if (activeTier === 'campaign_ready') {
        rows = rows.filter(c => c.campaign_ready);
      }
      setContacts(rows);
      setTotal(activeTier === 'campaign_ready' ? rows.length : data.total);
      onCountChange?.(data.total);
    } catch (err) {
      console.error('Failed to load contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [token, activeTier, page]);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/data-trust/suggestions?status=pending`, { headers });
      const data = await res.json();
      setSuggestions(data.rows || []);
    } catch (err) {
      console.error('Failed to load suggestions:', err);
    }
  }, [token]);

  useEffect(() => { loadOverview(); loadSuggestions(); }, [loadOverview, loadSuggestions]);
  useEffect(() => { loadContacts(); }, [loadContacts]);
  useEffect(() => { setPage(1); }, [activeTier]);

  const handleResolveSuggestion = async (id, action) => {
    try {
      const res = await fetch(`${API}/api/data-trust/suggestions/${id}/resolve`, {
        method: 'POST', headers, body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      addToast(action === 'accepted' ? 'Change applied' : 'Suggestion rejected', 'success');
      loadSuggestions();
      loadOverview();
      loadContacts();
    } catch (err) {
      addToast(`Failed: ${err.message}`, 'error');
    }
  };

  const tierTotal = overview?.enrichment?.total || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-crm-border">
        <h1 className="text-lg font-semibold text-crm-text">Data Trust Tiers</h1>
        <p className="text-xs text-crm-muted mt-0.5">
          Safety layer for enrichment — track data quality and review AI-proposed changes
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Tier Overview Cards */}
        <div className="flex gap-3 flex-wrap">
          {['gold', 'silver', 'bronze', 'untracked'].map(tier => (
            <TierCard key={tier} tier={tier} count={overview?.tiers?.[tier] || 0} total={tierTotal} />
          ))}
        </div>

        {/* Enrichment Stats Row */}
        {overview?.enrichment && (
          <div className="flex gap-4 text-xs text-crm-muted bg-crm-deep/30 rounded-lg px-4 py-2.5">
            <span>{overview.enrichment.has_email.toLocaleString()} have email</span>
            <span className="text-crm-border">|</span>
            <span className="text-emerald-400">{overview.enrichment.campaign_ready.toLocaleString()} campaign ready</span>
            <span className="text-crm-border">|</span>
            <span>{overview.enrichment.enrichment_started} enrichment started</span>
            <span className="text-crm-border">|</span>
            <span>{overview.pendingSuggestions} pending suggestions</span>
          </div>
        )}

        {/* Suggested Updates Queue */}
        <div>
          <h2 className="text-sm font-semibold text-crm-text mb-2">
            Suggested Updates
            {suggestions.length > 0 && (
              <span className="ml-2 text-[10px] font-normal bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-full">
                {suggestions.length} pending
              </span>
            )}
          </h2>
          {suggestions.length === 0 ? (
            <div className="bg-crm-card border border-crm-border rounded-lg p-6 text-center">
              <svg className="w-8 h-8 mx-auto text-crm-muted/30 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-crm-muted">No pending suggestions.</p>
              <p className="text-[10px] text-crm-muted mt-1">Enrichment agents will propose changes here for your review.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map(s => (
                <SuggestionCard key={s.id} suggestion={s} onResolve={handleResolveSuggestion} />
              ))}
            </div>
          )}
        </div>

        {/* Contact Trust Table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-crm-text">Contacts by Trust Tier</h2>
            <span className="text-[10px] text-crm-muted">{total.toLocaleString()} contacts</span>
          </div>

          {/* Filter pills */}
          <div className="flex gap-1.5 mb-3">
            {TIER_FILTERS.map(f => (
              <button
                key={f}
                onClick={() => setActiveTier(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeTier === f
                    ? 'bg-crm-accent text-white'
                    : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
                }`}
              >
                {f === 'all' ? 'All' : f === 'campaign_ready' ? 'Campaign Ready' : TIER_CONFIG[f]?.label || f}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-crm-card border border-crm-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-crm-border bg-crm-deep/30">
                  <th className="text-left px-3 py-2 font-medium text-crm-muted">Name</th>
                  <th className="text-left px-3 py-2 font-medium text-crm-muted">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-crm-muted">Email</th>
                  <th className="text-left px-3 py-2 font-medium text-crm-muted">Phone</th>
                  <th className="text-left px-3 py-2 font-medium text-crm-muted">Tier</th>
                  <th className="text-left px-3 py-2 font-medium text-crm-muted">Source</th>
                  <th className="text-left px-3 py-2 font-medium text-crm-muted">Ready</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-crm-border/30">
                      <td colSpan={7} className="px-3 py-3"><div className="h-4 bg-crm-border/20 rounded animate-shimmer" /></td>
                    </tr>
                  ))
                ) : contacts.length === 0 ? (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-crm-muted">No contacts found</td></tr>
                ) : (
                  contacts.map(c => {
                    const cfg = TIER_CONFIG[c.trust_tier] || TIER_CONFIG.untracked;
                    return (
                      <tr
                        key={c.contact_id}
                        onClick={() => openDetail('contact', c.contact_id)}
                        className="border-b border-crm-border/30 hover:bg-crm-hover/50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 font-medium text-crm-text truncate max-w-[180px]">{c.full_name || '—'}</td>
                        <td className="px-3 py-2 text-crm-muted">{c.type || '—'}</td>
                        <td className="px-3 py-2 text-crm-muted truncate max-w-[180px]">{c.email_1 || '—'}</td>
                        <td className="px-3 py-2 text-crm-muted">{c.phone_1 || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.text}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-crm-muted truncate max-w-[140px]">{c.data_source || '—'}</td>
                        <td className="px-3 py-2">
                          {c.campaign_ready ? (
                            <span className="text-emerald-400 text-[10px] font-medium">Ready</span>
                          ) : (
                            <span className="text-crm-muted text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-between px-3 py-2 border-t border-crm-border bg-crm-deep/30">
                <span className="text-[10px] text-crm-muted">
                  Page {page} of {Math.ceil(total / LIMIT)}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-2 py-1 text-[10px] rounded bg-crm-hover text-crm-muted disabled:opacity-30"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage(p => p + 1)}
                    disabled={page >= Math.ceil(total / LIMIT)}
                    className="px-2 py-1 text-[10px] rounded bg-crm-hover text-crm-muted disabled:opacity-30"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contact Detail SlideOver */}
      {detailState?.type === 'contact' && (
        <SlideOver onClose={closeDetail}>
          <ContactDetail id={detailState.id} onClose={closeDetail} isSlideOver />
        </SlideOver>
      )}
    </div>
  );
}
