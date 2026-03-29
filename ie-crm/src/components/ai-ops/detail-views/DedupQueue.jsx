import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CONFIDENCE_STYLES = {
  high:   'bg-red-500/20 text-red-300 border-red-500/30',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low:    'bg-sky-500/20 text-sky-300 border-sky-500/30',
};

const MATCH_TYPE_LABELS = {
  exact_normalized:  'Exact address match',
  fuzzy_address_sf:  'Fuzzy address + SF',
  same_name_city:    'Same name & city',
  same_parcel:       'Same parcel',
};

const STATUS_TABS = [
  { key: 'pending',   label: 'Pending' },
  { key: 'deferred',  label: 'Deferred' },
  { key: 'merged',    label: 'Merged' },
  { key: 'dismissed', label: 'Dismissed' },
];

// Fields shown in the side-by-side merge picker
const MERGE_FIELDS = [
  { key: 'property_address', label: 'Address' },
  { key: 'property_name',    label: 'Name' },
  { key: 'rba',              label: 'Building SF', fmt: v => v ? Number(v).toLocaleString() : null },
  { key: 'property_type',    label: 'Type' },
  { key: 'building_class',   label: 'Class' },
  { key: 'year_built',       label: 'Year Built' },
  { key: 'city',             label: 'City' },
  { key: 'zip',              label: 'ZIP' },
  { key: 'owner_name',       label: 'Owner' },
  { key: 'clear_ht',         label: 'Clear Height', fmt: v => v ? `${v}′` : null },
  { key: 'zoning',           label: 'Zoning' },
];

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function authHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// ── Contact list shown under each property card ──────────────────
function ContactList({ contacts, loading }) {
  if (loading) return <div className="text-xs text-crm-muted mt-2">Loading contacts…</div>;
  if (!contacts?.length) return <div className="text-xs text-crm-muted mt-2 italic">No contacts linked</div>;
  return (
    <div className="mt-3 space-y-1">
      <div className="text-xs font-semibold text-crm-muted uppercase tracking-wider mb-1">Contacts</div>
      {contacts.map(c => (
        <div key={c.contact_id} className="flex items-center gap-2 text-xs">
          <span className="text-crm-text">{c.first_name} {c.last_name}</span>
          {c.role && (
            <span className="px-1.5 py-0.5 rounded bg-crm-deep text-crm-muted capitalize">{c.role}</span>
          )}
          {c.company_name && (
            <span className="text-crm-muted truncate">{c.company_name}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Property card (summary stats + contacts) ─────────────────────
function PropertyCard({ prop, summary = {}, contacts, contactsLoading, label }) {
  const sf = prop?.rba ?? summary?.rba;
  return (
    <div className="flex-1 rounded-xl p-4 border bg-crm-card border-crm-border">
      <div className="text-xs font-semibold uppercase tracking-wider text-crm-muted mb-2">{label}</div>
      <div className="text-sm font-medium text-crm-text mb-0.5 leading-snug">
        {prop?.property_address ?? summary?.address ?? '—'}
      </div>
      {prop?.property_name && prop.property_name !== prop.property_address && (
        <div className="text-xs text-crm-muted mb-0.5 italic">{prop.property_name}</div>
      )}
      <div className="text-xs text-crm-muted mb-3">{prop?.city ?? summary?.city ?? '—'}</div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: 'SF', value: sf ? Number(sf).toLocaleString() : '—' },
          { label: 'Contacts', value: summary?.contacts ?? contacts?.length ?? '—' },
          { label: 'Comps', value: summary?.comps ?? '—' },
        ].map(({ label: l, value }) => (
          <div key={l} className="bg-crm-deep rounded-lg py-1.5 px-1">
            <div className="text-crm-text font-semibold text-sm">{value}</div>
            <div className="text-crm-muted text-xs">{l}</div>
          </div>
        ))}
      </div>
      {summary?.deals > 0 && (
        <div className="mt-2 text-xs text-emerald-400">{summary.deals} deal{summary.deals > 1 ? 's' : ''}</div>
      )}
      <ContactList contacts={contacts} loading={contactsLoading} />
    </div>
  );
}

// ── Field-level merge picker ─────────────────────────────────────
function MergePicker({ propA, propB, mergeDir, onConfirm, onCancel, busy }) {
  const winner = mergeDir === 'a_absorbs_b' ? 'a' : 'b';
  const loser  = mergeDir === 'a_absorbs_b' ? 'b' : 'a';
  const props  = { a: propA, b: propB };

  // Default: keep winner's values for all fields
  const [overrides, setOverrides] = useState(() => {
    const init = {};
    for (const { key } of MERGE_FIELDS) {
      init[key] = winner; // start with winner's side selected
    }
    return init;
  });

  const winnerProp = props[winner];
  const loserProp  = props[loser];

  // Only show rows where the two values actually differ
  const diffFields = MERGE_FIELDS.filter(({ key }) => {
    const va = String(propA?.[key] ?? '');
    const vb = String(propB?.[key] ?? '');
    return va !== vb && (va || vb);
  });

  const fieldOverridesForAPI = {};
  for (const [key, side] of Object.entries(overrides)) {
    if (diffFields.find(f => f.key === key) && side !== winner) {
      fieldOverridesForAPI[key] = side;
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-crm-text mb-1">Choose field values</div>
        <div className="text-xs text-crm-muted">
          Winner: <span className="text-emerald-400 font-medium">{winnerProp?.property_address}</span>.
          The loser record will be deleted. Pick which value to keep for each field.
        </div>
      </div>

      {diffFields.length === 0 ? (
        <div className="text-xs text-crm-muted italic">All key fields are identical — no choices needed.</div>
      ) : (
        <div className="rounded-xl border border-crm-border overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[160px_1fr_1fr] gap-0 border-b border-crm-border bg-crm-deep">
            <div className="px-3 py-2 text-xs font-semibold text-crm-muted uppercase tracking-wider">Field</div>
            <div className="px-3 py-2 text-xs font-semibold text-crm-muted uppercase tracking-wider border-l border-crm-border">
              Property A {winner === 'a' && <span className="text-emerald-400 ml-1">(winner)</span>}
            </div>
            <div className="px-3 py-2 text-xs font-semibold text-crm-muted uppercase tracking-wider border-l border-crm-border">
              Property B {winner === 'b' && <span className="text-emerald-400 ml-1">(winner)</span>}
            </div>
          </div>
          {diffFields.map(({ key, label, fmt }) => {
            const va = fmt ? fmt(propA?.[key]) ?? propA?.[key] : propA?.[key];
            const vb = fmt ? fmt(propB?.[key]) ?? propB?.[key] : propB?.[key];
            return (
              <div key={key} className="grid grid-cols-[160px_1fr_1fr] gap-0 border-b border-crm-border last:border-0 hover:bg-crm-hover transition-colors">
                <div className="px-3 py-2.5 text-xs text-crm-muted self-center">{label}</div>
                {['a', 'b'].map(side => {
                  const val = side === 'a' ? va : vb;
                  const selected = overrides[key] === side;
                  return (
                    <button
                      key={side}
                      onClick={() => setOverrides(prev => ({ ...prev, [key]: side }))}
                      className={`px-3 py-2.5 text-sm text-left border-l border-crm-border transition-colors flex items-center gap-2 ${
                        selected
                          ? 'bg-emerald-500/10 text-emerald-300'
                          : 'text-crm-muted hover:text-crm-text'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                        selected ? 'border-emerald-400 bg-emerald-400' : 'border-crm-border'
                      }`}>
                        {selected && <span className="w-1.5 h-1.5 rounded-full bg-crm-deep" />}
                      </span>
                      <span className="truncate">{val != null && val !== '' ? String(val) : <span className="italic opacity-50">empty</span>}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={() => onConfirm(mergeDir, fieldOverridesForAPI)}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-sm font-medium transition-colors disabled:opacity-40"
        >
          {busy ? 'Merging…' : 'Confirm merge'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-crm-card hover:bg-crm-hover text-crm-muted border border-crm-border text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Single candidate row ─────────────────────────────────────────
function CandidateRow({ candidate, onAction }) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [mergeDir, setMergeDir] = useState(null);
  const [busy, setBusy] = useState(false);

  const sumA = typeof candidate.property_a_summary === 'string'
    ? JSON.parse(candidate.property_a_summary)
    : (candidate.property_a_summary || {});
  const sumB = typeof candidate.property_b_summary === 'string'
    ? JSON.parse(candidate.property_b_summary)
    : (candidate.property_b_summary || {});

  // Lazy-load full details when expanded
  useEffect(() => {
    if (!expanded || details || detailsLoading) return;
    setDetailsLoading(true);
    fetch(`${API_BASE}/api/ai/dedup/${candidate.id}/details`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => setDetails(data))
      .catch(() => {})
      .finally(() => setDetailsLoading(false));
  }, [expanded, candidate.id, details, detailsLoading]);

  const dispatch = async (action, opts = {}) => {
    setBusy(true);
    try {
      const headers = { 'Content-Type': 'application/json', ...authHeaders() };
      if (action === 'merge') {
        await fetch(`${API_BASE}/api/ai/dedup/merge/${candidate.id}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ direction: opts.direction, field_overrides: opts.field_overrides }),
        });
      } else {
        await fetch(`${API_BASE}/api/ai/dedup/${candidate.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: action, notes: opts.notes }),
        });
      }
      onAction(candidate.id);
    } catch (err) {
      console.error('[DedupQueue] action error', err);
    } finally {
      setBusy(false);
      setMergeDir(null);
    }
  };

  const propA = details?.property_a;
  const propB = details?.property_b;
  const contactsA = details?.contacts_a;
  const contactsB = details?.contacts_b;

  return (
    <div className="border border-crm-border rounded-xl overflow-hidden">
      {/* Summary row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-4 px-5 py-4 text-left hover:bg-crm-hover transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${CONFIDENCE_STYLES[candidate.confidence] || CONFIDENCE_STYLES.medium}`}>
              {candidate.confidence}
            </span>
            <span className="text-xs text-crm-muted bg-crm-deep px-2 py-0.5 rounded-full">
              {MATCH_TYPE_LABELS[candidate.match_type] || candidate.match_type}
            </span>
          </div>
          <div className="text-sm text-crm-text truncate">{candidate.match_reason || '—'}</div>
          <div className="text-xs text-crm-muted mt-0.5">{formatDate(candidate.scan_date)}</div>
        </div>
        <div className="text-crm-muted text-xs mt-1 shrink-0">{expanded ? '▲' : '▼'}</div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-crm-border">

          {/* Side-by-side property cards */}
          <div className="flex gap-3 pt-4">
            <PropertyCard
              prop={propA}
              summary={sumA}
              contacts={contactsA}
              contactsLoading={detailsLoading}
              label="Property A"
            />
            <div className="flex items-center text-crm-muted text-lg self-start mt-12">⟷</div>
            <PropertyCard
              prop={propB}
              summary={sumB}
              contacts={contactsB}
              contactsLoading={detailsLoading}
              label="Property B"
            />
          </div>

          {/* Merge picker or action buttons */}
          {mergeDir ? (
            <MergePicker
              propA={propA}
              propB={propB}
              mergeDir={mergeDir}
              onConfirm={(direction, field_overrides) => dispatch('merge', { direction, field_overrides })}
              onCancel={() => setMergeDir(null)}
              busy={busy}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setMergeDir('a_absorbs_b')}
                disabled={busy || detailsLoading}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition-colors disabled:opacity-40"
              >
                A absorbs B →
              </button>
              <button
                onClick={() => setMergeDir('b_absorbs_a')}
                disabled={busy || detailsLoading}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition-colors disabled:opacity-40"
              >
                ← B absorbs A
              </button>
              <div className="flex-1" />
              <button
                onClick={() => dispatch('deferred')}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-crm-card hover:bg-crm-hover text-crm-muted border border-crm-border text-xs font-medium transition-colors disabled:opacity-40"
              >
                {busy ? '…' : 'Defer'}
              </button>
              <button
                onClick={() => dispatch('dismissed', { notes: 'Same building, different units' })}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-medium transition-colors disabled:opacity-40"
              >
                Same building, diff units
              </button>
              <button
                onClick={() => dispatch('dismissed')}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium transition-colors disabled:opacity-40"
              >
                {busy ? '…' : 'Not a duplicate'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main DedupQueue page ─────────────────────────────────────────
export default function DedupQueue() {
  const [activeTab, setActiveTab] = useState('pending');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/dedup/candidates?status=${activeTab}&limit=100`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch {
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/dedup/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const data = await res.json();
      setLastScan(data);
      if (activeTab === 'pending') fetchCandidates();
    } catch (err) {
      console.error('[DedupQueue] scan error', err);
    } finally {
      setScanning(false);
    }
  };

  const handleAction = (id) => {
    setCandidates(prev => prev.filter(c => c.id !== id));
  };

  const highCount = candidates.filter(c => c.confidence === 'high').length;
  const medCount  = candidates.filter(c => c.confidence === 'medium').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Property Dedup Queue</h2>
          <p className="text-crm-muted text-sm mt-0.5">Review and resolve potential duplicate property records</p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-4 py-2 rounded-xl bg-crm-accent hover:bg-crm-accent-hover text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {scanning ? (
            <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" />Scanning…</>
          ) : '⟳ Run scan now'}
        </button>
      </div>

      {/* Last scan result */}
      {lastScan && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-300">
          Scan complete — {lastScan.candidates_found} new candidates found
          {lastScan.strategies && (
            <span className="text-emerald-400/70 ml-2">
              ({lastScan.strategies.exact_normalized} exact · {lastScan.strategies.fuzzy_address_sf} fuzzy · {lastScan.strategies.same_name_city} name)
            </span>
          )}
        </div>
      )}

      {/* Confidence summary */}
      {activeTab === 'pending' && !loading && candidates.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {highCount > 0 && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-red-300 text-sm font-medium">{highCount} high confidence</span>
            </div>
          )}
          {medCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-amber-300 text-sm font-medium">{medCount} medium confidence</span>
            </div>
          )}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-1 p-1 bg-crm-card rounded-xl border border-crm-border w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-crm-accent text-white'
                : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Candidate list */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-crm-muted text-sm text-center py-16">Loading…</div>
        ) : candidates.length === 0 ? (
          <div className="text-crm-muted text-sm text-center py-16 bg-crm-card rounded-xl border border-crm-border">
            {activeTab === 'pending'
              ? 'No pending duplicates — run a scan to check for new ones'
              : `No ${activeTab} candidates`}
          </div>
        ) : (
          candidates.map(c => (
            <CandidateRow key={c.id} candidate={c} onAction={handleAction} />
          ))
        )}
      </div>
    </div>
  );
}
