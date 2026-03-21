import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STATUS_FILTERS = ['all', 'pending', 'approved', 'rejected'];

const STATUS_COLORS = {
  pending:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
};

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function ConfidencePip({ value }) {
  const pct = Math.round((value || 0) * 100);
  const color = pct >= 70 ? 'bg-emerald-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 bg-crm-bg rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-crm-muted">{pct}%</span>
    </div>
  );
}

export default function TerritoryIntel() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    async function fetchSignals() {
      setLoading(true);
      try {
        const token = localStorage.getItem('crm-auth-token');
        const res = await fetch(`${API_BASE}/api/ai/sandbox/signals`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSignals(Array.isArray(data) ? data : data.items || []);
      } catch {
        setSignals([]);
      } finally {
        setLoading(false);
      }
    }
    fetchSignals();
  }, []);

  const filtered = statusFilter === 'all'
    ? signals
    : signals.filter(s => s.status === statusFilter);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white">Territory Intelligence</h2>
        <p className="text-crm-muted text-sm mt-1">Map coming in Phase 2</p>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-crm-muted">Status:</span>
        <div className="flex gap-1 p-1 bg-crm-card rounded-lg border border-crm-border">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded text-xs font-medium capitalize transition-colors ${
                statusFilter === f
                  ? 'bg-crm-accent text-white'
                  : 'text-crm-muted hover:text-crm-text'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-crm-muted text-xs ml-auto">{filtered.length} signals</span>
      </div>

      {/* Table */}
      <div className="bg-crm-card rounded-xl border border-crm-border overflow-hidden">
        {loading ? (
          <div className="text-crm-muted text-sm text-center py-12">Loading signals…</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <svg className="w-10 h-10 text-crm-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            <p className="text-crm-muted text-sm">No signals discovered yet</p>
            <p className="text-crm-muted text-xs">Scout agents will surface territory signals here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-crm-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-crm-muted">Source</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-crm-muted">Content</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-crm-muted">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-crm-muted">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-crm-muted">Discovered</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((signal, i) => (
                  <tr key={signal.id || i} className="border-b border-crm-border last:border-0 hover:bg-crm-hover transition-colors">
                    <td className="px-4 py-3 text-sm text-crm-muted">{signal.source || '—'}</td>
                    <td className="px-4 py-3 text-sm text-crm-text max-w-sm">
                      <span className="line-clamp-2">{signal.content || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <ConfidencePip value={signal.confidence} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[signal.status] || STATUS_COLORS.pending}`}>
                        {signal.status || 'pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-crm-muted">{formatDate(signal.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
