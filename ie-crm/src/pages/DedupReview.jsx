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
  exact_email: 'Exact Email',
  same_name_company: 'Same Name + Company',
  same_name_phone: 'Same Name + Phone',
  exact_normalized_name: 'Exact Name',
  fuzzy_name: 'Fuzzy Name',
};

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'merged', label: 'Merged' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'deferred', label: 'Deferred' },
];

const ENTITY_TABS = [
  { key: 'property', label: 'Properties', icon: '🏢' },
  { key: 'contact', label: 'Contacts', icon: '👤' },
  { key: 'company', label: 'Companies', icon: '🏛' },
];

// API endpoint mapping per entity type
const ENTITY_API = {
  property: {
    candidates: '/api/dedup/candidates',
    stats: '/api/dedup/stats',
    merge: '/api/dedup/merge',
    resolve: '/api/dedup/resolve',
    idA: 'property_a_id',
    idB: 'property_b_id',
  },
  contact: {
    candidates: '/api/dedup/contact-candidates',
    stats: '/api/dedup/contact-stats',
    merge: '/api/dedup/contact-merge',
    resolve: '/api/dedup/contact-resolve',
    idA: 'contact_a_id',
    idB: 'contact_b_id',
  },
  company: {
    candidates: '/api/dedup/company-candidates',
    stats: '/api/dedup/company-stats',
    merge: '/api/dedup/company-merge',
    resolve: '/api/dedup/company-resolve',
    idA: 'company_a_id',
    idB: 'company_b_id',
  },
};

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

function EntityCard({ label, fields, summary, isSelected, onSelect, isPending }) {
  const s = summary || {};
  return (
    <button
      onClick={() => isPending && onSelect()}
      className={`flex-1 rounded-lg border p-3 text-left transition-all ${
        isSelected
          ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
          : 'border-crm-border bg-crm-card hover:border-crm-accent/40'
      } ${!isPending ? 'cursor-default' : ''}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-crm-muted">{label}</span>
        {isSelected && (
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">KEEP</span>
        )}
      </div>
      {/* Primary field */}
      <p className="text-sm font-medium text-crm-text truncate">{fields.primary || 'Unknown'}</p>
      {/* Secondary field */}
      {fields.secondary && <p className="text-xs text-crm-muted">{fields.secondary}</p>}
      {/* Tertiary field */}
      {fields.tertiary && <p className="text-xs text-crm-muted mt-0.5">{fields.tertiary}</p>}
      {/* Linked record counts */}
      <div className="flex gap-3 mt-2 text-[10px] text-crm-muted flex-wrap">
        {s.contacts > 0 && <span>{s.contacts} contact{s.contacts > 1 ? 's' : ''}</span>}
        {s.companies > 0 && <span>{s.companies} co{s.companies > 1 ? 's' : ''}</span>}
        {s.properties > 0 && <span>{s.properties} prop{s.properties > 1 ? 's' : ''}</span>}
        {s.deals > 0 && <span>{s.deals} deal{s.deals > 1 ? 's' : ''}</span>}
        {s.lease_comps > 0 && <span>{s.lease_comps} lease comp{s.lease_comps > 1 ? 's' : ''}</span>}
        {s.sale_comps > 0 && <span>{s.sale_comps} sale comp{s.sale_comps > 1 ? 's' : ''}</span>}
        {s.interactions > 0 && <span>{s.interactions} activity</span>}
        {s.action_items > 0 && <span>{s.action_items} task{s.action_items > 1 ? 's' : ''}</span>}
      </div>
    </button>
  );
}

// Build display fields for each entity type
function getEntityFields(entityType, candidate, side) {
  const isA = side === 'a';
  if (entityType === 'property') {
    const addr = isA ? candidate.addr_a : candidate.addr_b;
    const city = isA ? candidate.city_a : candidate.city_b;
    const type = isA ? candidate.type_a : candidate.type_b;
    const rba = isA ? candidate.rba_a : candidate.rba_b;
    return {
      primary: addr || 'No address',
      secondary: [city, type].filter(Boolean).join(' · '),
      tertiary: rba ? `${Number(rba).toLocaleString()} SF` : null,
    };
  }
  if (entityType === 'contact') {
    const name = isA ? candidate.name_a : candidate.name_b;
    const email = isA ? candidate.email_a : candidate.email_b;
    const phone = isA ? candidate.phone_a : candidate.phone_b;
    const title = isA ? candidate.title_a : candidate.title_b;
    return {
      primary: name || 'Unknown',
      secondary: [title, email].filter(Boolean).join(' · '),
      tertiary: phone || null,
    };
  }
  if (entityType === 'company') {
    const name = isA ? candidate.name_a : candidate.name_b;
    const type = isA ? candidate.type_a : candidate.type_b;
    const city = isA ? candidate.city_a : candidate.city_b;
    const industry = isA ? candidate.industry_a : candidate.industry_b;
    return {
      primary: name || 'Unknown',
      secondary: [type, industry].filter(Boolean).join(' · '),
      tertiary: city || null,
    };
  }
  return { primary: 'Unknown' };
}

// Build comparison fields for the detail view
function getComparisonFields(entityType, candidate) {
  const sA = candidate.property_a_summary || candidate.entity_a_summary || {};
  const sB = candidate.property_b_summary || candidate.entity_b_summary || {};

  if (entityType === 'property') {
    return [
      { label: 'Address', a: sA.address, b: sB.address },
      { label: 'Name', a: sA.name, b: sB.name },
      { label: 'City', a: sA.city, b: sB.city },
      { label: 'RBA', a: sA.rba, b: sB.rba },
      { label: 'Contacts', a: String(sA.contacts || 0), b: String(sB.contacts || 0) },
      { label: 'Deals', a: String(sA.deals || 0), b: String(sB.deals || 0) },
      { label: 'Comps', a: String((sA.lease_comps || 0) + (sA.sale_comps || 0)), b: String((sB.lease_comps || 0) + (sB.sale_comps || 0)) },
    ];
  }
  if (entityType === 'contact') {
    return [
      { label: 'Name', a: sA.name, b: sB.name },
      { label: 'Email', a: sA.email, b: sB.email },
      { label: 'Companies', a: String(sA.companies || 0), b: String(sB.companies || 0) },
      { label: 'Properties', a: String(sA.properties || 0), b: String(sB.properties || 0) },
      { label: 'Deals', a: String(sA.deals || 0), b: String(sB.deals || 0) },
      { label: 'Activity', a: String(sA.interactions || 0), b: String(sB.interactions || 0) },
    ];
  }
  if (entityType === 'company') {
    return [
      { label: 'Name', a: sA.name, b: sB.name },
      { label: 'City', a: sA.city, b: sB.city },
      { label: 'Contacts', a: String(sA.contacts || 0), b: String(sB.contacts || 0) },
      { label: 'Properties', a: String(sA.properties || 0), b: String(sB.properties || 0) },
      { label: 'Deals', a: String(sA.deals || 0), b: String(sB.deals || 0) },
      { label: 'Lease Comps', a: String(sA.lease_comps || 0), b: String(sB.lease_comps || 0) },
    ];
  }
  return [];
}

function CandidateCard({ candidate, entityType, onMerge, onDismiss, onDefer }) {
  const [keepId, setKeepId] = useState(null);
  const [merging, setMerging] = useState(false);
  const c = candidate;
  const api = ENTITY_API[entityType];
  const isPending = c.status === 'pending';
  const idA = c[api.idA];
  const idB = c[api.idB];
  const summA = c.property_a_summary || c.entity_a_summary || {};
  const summB = c.property_b_summary || c.entity_b_summary || {};
  const entityLabel = entityType === 'property' ? 'Property' : entityType === 'contact' ? 'Contact' : 'Company';

  const handleMerge = async () => {
    if (!keepId) return;
    const removeId = keepId === idA ? idB : idA;
    setMerging(true);
    await onMerge(c.id, keepId, removeId, idA);
    setMerging(false);
  };

  const compFields = getComparisonFields(entityType, c);

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

      {/* Side-by-side entity cards */}
      <div className="p-4">
        <div className="flex gap-3 mb-3">
          <EntityCard
            label={`${entityLabel} A`}
            fields={getEntityFields(entityType, c, 'a')}
            summary={summA}
            isSelected={keepId === idA}
            onSelect={() => setKeepId(keepId === idA ? null : idA)}
            isPending={isPending}
          />
          <EntityCard
            label={`${entityLabel} B`}
            fields={getEntityFields(entityType, c, 'b')}
            summary={summB}
            isSelected={keepId === idB}
            onSelect={() => setKeepId(keepId === idB ? null : idB)}
            isPending={isPending}
          />
        </div>

        {/* Detail comparison */}
        {compFields.length > 0 && (
          <details className="mb-3">
            <summary className="text-[10px] text-crm-muted cursor-pointer hover:text-crm-text transition-colors">
              Compare details
            </summary>
            <div className="mt-2 bg-crm-deep/30 rounded-lg p-3">
              <div className="grid grid-cols-[100px_1fr_1fr] gap-2 pb-1 border-b border-crm-border/50 text-[10px] font-semibold text-crm-muted uppercase tracking-wider">
                <span>Field</span><span>{entityLabel} A</span><span>{entityLabel} B</span>
              </div>
              {compFields.map(f => (
                <SummaryField key={f.label} label={f.label} valA={f.a} valB={f.b} />
              ))}
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
              {merging ? 'Merging...' : keepId ? 'Merge (keep selected)' : `Select a ${entityType} to keep`}
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
  const [entityType, setEntityType] = useState('property');
  const [candidates, setCandidates] = useState([]);
  const [stats, setStats] = useState({ pending: 0, merged: 0, dismissed: 0, deferred: 0 });
  const [allStats, setAllStats] = useState({ property: 0, contact: 0, company: 0 });
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);

  const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const api = ENTITY_API[entityType];

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [candRes, statsRes] = await Promise.all([
        fetch(`${API}${api.candidates}?status=${activeTab}`, { headers }),
        fetch(`${API}${api.stats}`, { headers }),
      ]);
      const candData = await candRes.json();
      const statsData = await statsRes.json();
      setCandidates(candData.rows || []);
      setStats(statsData);
    } catch (err) {
      console.error('Failed to load dedup data:', err);
      addToast('Failed to load dedup candidates', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab, entityType, token]);

  // Load all entity pending counts for the entity tabs + sidebar badge
  const loadAllStats = useCallback(async () => {
    try {
      const [propRes, contRes, compRes] = await Promise.all([
        fetch(`${API}/api/dedup/stats`, { headers }),
        fetch(`${API}/api/dedup/contact-stats`, { headers }).catch(() => ({ json: () => ({ pending: 0 }) })),
        fetch(`${API}/api/dedup/company-stats`, { headers }).catch(() => ({ json: () => ({ pending: 0 }) })),
      ]);
      const [propData, contData, compData] = await Promise.all([
        propRes.json(), contRes.json(), compRes.json(),
      ]);
      const newAllStats = {
        property: propData.pending || 0,
        contact: contData.pending || 0,
        company: compData.pending || 0,
      };
      setAllStats(newAllStats);
      onCountChange?.(newAllStats.property + newAllStats.contact + newAllStats.company);
    } catch (err) {
      console.error('Failed to load all dedup stats:', err);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadAllStats(); }, [loadAllStats]);

  // Reload all stats after merge/resolve
  const refreshAfterAction = () => {
    loadData();
    loadAllStats();
  };

  const handleMerge = async (candidateId, keepId, removeId) => {
    try {
      const res = await fetch(`${API}${api.merge}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ candidateId, keepId, removeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast(`Merged! ${data.fieldsFilled} fields filled, ${data.linksMoved} links moved.`, 'success');
      refreshAfterAction();
    } catch (err) {
      addToast(`Merge failed: ${err.message}`, 'error');
    }
  };

  const handleResolve = async (candidateId, status) => {
    try {
      const res = await fetch(`${API}${api.resolve}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ candidateId, status }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      addToast(status === 'dismissed' ? 'Marked as not a duplicate' : 'Deferred for later', 'success');
      refreshAfterAction();
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

        {/* Entity type tabs */}
        <div className="flex gap-1 mb-2">
          {ENTITY_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setEntityType(tab.key); setActiveTab('pending'); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                entityType === tab.key
                  ? 'bg-crm-accent/15 text-crm-accent border border-crm-accent/30'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover border border-transparent'
              }`}
            >
              {tab.label}
              {allStats[tab.key] > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  entityType === tab.key ? 'bg-crm-accent/20' : 'bg-crm-border'
                }`}>
                  {allStats[tab.key]}
                </span>
              )}
            </button>
          ))}
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
              {activeTab === 'pending'
                ? `No pending ${entityType} duplicates to review.`
                : `No ${activeTab} candidates.`}
            </p>
          </div>
        ) : (
          candidates.map(c => (
            <CandidateCard
              key={c.id}
              candidate={c}
              entityType={entityType}
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
