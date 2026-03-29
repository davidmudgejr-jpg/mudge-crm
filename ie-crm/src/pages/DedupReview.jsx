import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/shared/Toast';

const CONFIDENCE_COLORS = {
  high: 'bg-red-500/15 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/15 text-green-400 border-green-500/30',
};

const MATCH_TYPE_LABELS = {
  exact_normalized: 'Exact Address',
  fuzzy_address_sf: 'Fuzzy Address',
  same_name_city: 'Same Name + City',
  same_parcel: 'Same Parcel',
};

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'merged', label: 'Merged' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'deferred', label: 'Deferred' },
];

function SummaryField({ label, valA, valB }) {
  const isDiff = valA !== valB && valA && valB;
  if (!valA && !valB) return null;
  return (
    <div className="grid grid-cols-[100px_1fr_1fr] gap-2 py-1 border-b border-crm-border/30 text-xs">
      <span className="text-crm-muted font-medium">{label}</span>
      <span className={isDiff ? 'text-yellow-400' : 'text-crm-text'}>{valA || '—'}</span>
      <span className={isDiff ? 'text-yellow-400' : 'text-crm-text'}>{valB || '—'}</span>
    </div>
  );
}

function PropertyCard({ label, addr, city, type, rba, summary, isSelected, onSelect }) {
  const s = summary || {};
  return (
    <button
      onClick={onSelect}
      className={`flex-1 rounded-lg border p-3 text-left transition-all ${
        isSelected
          ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
          : 'border-crm-border bg-crm-card hover:border-crm-accent/40'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-crm-muted">{label}</span>
        {isSelected && (
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">KEEP</span>
        )}
      </div>
      <p className="text-sm font-medium text-crm-text truncate">{addr || 'No address'}</p>
      <p className="text-xs text-crm-muted">{[city, type].filter(Boolean).join(' · ')}</p>
      {rba && <p className="text-xs text-crm-muted mt-0.5">{Number(rba).toLocaleString()} SF</p>}
      <div className="flex gap-3 mt-2 text-[10px] text-crm-muted">
        {s.contacts > 0 && <span>{s.contacts} contact{s.contacts > 1 ? 's' : ''}</span>}
        {s.companies > 0 && <span>{s.companies} co{s.companies > 1 ? 's' : ''}</span>}
        {s.deals > 0 && <span>{s.deals} deal{s.deals > 1 ? 's' : ''}</span>}
        {s.comps > 0 && <span>{s.comps} comp{s.comps > 1 ? 's' : ''}</span>}
        {s.interactions > 0 && <span>{s.interactions} activity</span>}
      </div>
      {s.last_activity && (
        <p className="text-[10px] text-crm-muted mt-1">Last activity: {s.last_activity}</p>
      )}
    </button>
  );
}

function CandidateCard({ candidate, onMerge, onDismiss, onDefer }) {
  const [keepId, setKeepId] = useState(null);
  const [merging, setMerging] = useState(false);
  const c = candidate;
  const isPending = c.status === 'pending';

  const handleMerge = async () => {
    if (!keepId) return;
    const removeId = keepId === c.property_a_id ? c.property_b_id : c.property_a_id;
    setMerging(true);
    await onMerge(c.id, keepId, removeId, c.property_a_id);
    setMerging(false);
  };

  return (
    <div className="bg-crm-card border border-crm-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-crm-border bg-crm-deep/50">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[c.confidence] || CONFIDENCE_COLORS.medium}`}>
            {c.confidence?.toUpperCase()}
          </span>
          <span className="text-xs text-crm-muted">
            {MATCH_TYPE_LABELS[c.match_type] || c.match_type}
          </span>
          {c.match_score && (
            <span className="text-[10px] text-crm-muted">({c.match_score}%)</span>
          )}
        </div>
        {c.status !== 'pending' && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-crm-border/50 text-crm-muted">
            {c.status} {c.resolved_by ? `by ${c.resolved_by}` : ''}
          </span>
        )}
      </div>

      {/* Match reason */}
      {c.match_reason && (
        <div className="px-4 py-1.5 text-xs text-crm-muted bg-crm-deep/30 border-b border-crm-border/50">
          {c.match_reason}
        </div>
      )}

      {/* Side-by-side property cards */}
      <div className="p-4">
        <div className="flex gap-3 mb-3">
          <PropertyCard
            label="Property A"
            addr={c.addr_a}
            city={c.city_a}
            type={c.type_a}
            rba={c.rba_a}
            summary={c.property_a_summary}
            isSelected={keepId === c.property_a_id}
            onSelect={() => isPending && setKeepId(keepId === c.property_a_id ? null : c.property_a_id)}
          />
          <PropertyCard
            label="Property B"
            addr={c.addr_b}
            city={c.city_b}
            type={c.type_b}
            rba={c.rba_b}
            summary={c.property_b_summary}
            isSelected={keepId === c.property_b_id}
            onSelect={() => isPending && setKeepId(keepId === c.property_b_id ? null : c.property_b_id)}
          />
        </div>

        {/* Detail comparison */}
        {(c.property_a_summary || c.property_b_summary) && (
          <details className="mb-3">
            <summary className="text-[10px] text-crm-muted cursor-pointer hover:text-crm-text transition-colors">
              Compare details
            </summary>
            <div className="mt-2 bg-crm-deep/30 rounded-lg p-3">
              <div className="grid grid-cols-[100px_1fr_1fr] gap-2 pb-1 border-b border-crm-border/50 text-[10px] font-semibold text-crm-muted uppercase tracking-wider">
                <span>Field</span><span>Property A</span><span>Property B</span>
              </div>
              <SummaryField label="Address" valA={c.property_a_summary?.address} valB={c.property_b_summary?.address} />
              <SummaryField label="Name" valA={c.property_a_summary?.name} valB={c.property_b_summary?.name} />
              <SummaryField label="City" valA={c.property_a_summary?.city} valB={c.property_b_summary?.city} />
              <SummaryField label="RBA" valA={c.property_a_summary?.rba} valB={c.property_b_summary?.rba} />
              <SummaryField label="Type" valA={c.property_a_summary?.property_type} valB={c.property_b_summary?.property_type} />
              <SummaryField label="Contacts" valA={String(c.property_a_summary?.contacts || 0)} valB={String(c.property_b_summary?.contacts || 0)} />
              <SummaryField label="Companies" valA={String(c.property_a_summary?.companies || 0)} valB={String(c.property_b_summary?.companies || 0)} />
              <SummaryField label="Deals" valA={String(c.property_a_summary?.deals || 0)} valB={String(c.property_b_summary?.deals || 0)} />
              <SummaryField label="Comps" valA={String(c.property_a_summary?.comps || 0)} valB={String(c.property_b_summary?.comps || 0)} />
            </div>
          </details>
        )}

        {/* Action buttons */}
        {isPending && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleMerge}
              disabled={!keepId || merging}
              className="flex-1 h-8 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              {merging ? 'Merging...' : keepId ? 'Merge (keep selected)' : 'Select a property to keep'}
            </button>
            <button
              onClick={() => onDismiss(c.id)}
              className="h-8 px-3 rounded-lg text-xs font-medium text-crm-muted hover:text-crm-text hover:bg-crm-hover transition-all border border-crm-border"
            >
              Not a dupe
            </button>
            <button
              onClick={() => onDefer(c.id)}
              className="h-8 px-3 rounded-lg text-xs font-medium text-crm-muted hover:text-crm-text hover:bg-crm-hover transition-all border border-crm-border"
            >
              Later
            </button>
          </div>
        )}

        {/* Merge notes for resolved items */}
        {c.merge_notes && c.status !== 'pending' && (
          <p className="text-[10px] text-crm-muted mt-2 italic">{c.merge_notes}</p>
        )}
      </div>
    </div>
  );
}

export default function DedupReview({ onCountChange }) {
  const { token } = useAuth();
  const { addToast } = useToast();
  const [candidates, setCandidates] = useState([]);
  const [stats, setStats] = useState({ pending: 0, merged: 0, dismissed: 0, deferred: 0 });
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);

  const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [candRes, statsRes] = await Promise.all([
        fetch(`${API}/api/dedup/candidates?status=${activeTab}`, { headers }),
        fetch(`${API}/api/dedup/stats`, { headers }),
      ]);
      const candData = await candRes.json();
      const statsData = await statsRes.json();
      setCandidates(candData.rows || []);
      setStats(statsData);
      onCountChange?.(statsData.pending || 0);
    } catch (err) {
      console.error('Failed to load dedup data:', err);
      addToast('Failed to load dedup candidates', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, token]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMerge = async (candidateId, keepId, removeId, propertyAId) => {
    try {
      const res = await fetch(`${API}/api/dedup/merge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ candidateId, keepId, removeId, propertyAId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast(`Merged! ${data.fieldsFilled} fields filled, ${data.linksMoved} links moved.`, 'success');
      loadData();
    } catch (err) {
      addToast(`Merge failed: ${err.message}`, 'error');
    }
  };

  const handleResolve = async (candidateId, status) => {
    try {
      const res = await fetch(`${API}/api/dedup/resolve`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ candidateId, status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      addToast(status === 'dismissed' ? 'Marked as not a duplicate' : 'Deferred for later', 'success');
      loadData();
    } catch (err) {
      addToast(`Failed: ${err.message}`, 'error');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-crm-text">Duplicate Review</h1>
            <p className="text-xs text-crm-muted mt-0.5">
              {stats.pending} pending · {stats.merged} merged · {stats.dismissed} dismissed
            </p>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-crm-accent text-white'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
              }`}
            >
              {tab.label}
              {stats[tab.key] > 0 && (
                <span className={`ml-1.5 text-[10px] ${activeTab === tab.key ? 'opacity-80' : 'opacity-50'}`}>
                  {stats[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl bg-crm-card border border-crm-border animate-shimmer" />
            ))}
          </div>
        ) : candidates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-crm-muted text-sm">
              {activeTab === 'pending' ? 'No pending duplicates to review.' : `No ${activeTab} candidates.`}
            </p>
          </div>
        ) : (
          candidates.map(c => (
            <CandidateCard
              key={c.id}
              candidate={c}
              onMerge={handleMerge}
              onDismiss={id => handleResolve(id, 'dismissed')}
              onDefer={id => handleResolve(id, 'deferred')}
            />
          ))
        )}
      </div>
    </div>
  );
}
