import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const AGENT_COLORS = {
  enricher:   '#10b981',
  researcher: '#3b82f6',
  scout:      '#f59e0b',
  matcher:    '#8b5cf6',
  ralph:      '#ef4444',
  gemini:     '#06b6d4',
  houston:    '#fbbf24',
};

const PERIOD_OPTIONS = [
  { key: 'day',   label: 'Day' },
  { key: 'week',  label: 'Week' },
  { key: 'month', label: 'Month' },
];

function formatCost(n) {
  if (n == null) return '$0.00';
  return `$${Number(n).toFixed(4)}`;
}

function formatTokens(n) {
  if (n == null) return '0';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function CostBreakdown() {
  const [period, setPeriod] = useState('day');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCosts() {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/ai/dashboard/costs?period=${period}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(Array.isArray(json) ? json : json.rows || []);
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    }
    fetchCosts();
  }, [period]);

  const totalCost = data.reduce((s, r) => s + Number(r.total_cost || r.cost_usd || 0), 0);
  const totalCalls = data.reduce((s, r) => s + Number(r.api_calls || 0), 0);
  const totalTokens = data.reduce((s, r) => s + Number(r.total_tokens || 0), 0);

  // Aggregate by agent for the bar chart
  const agentTotals = {};
  data.forEach(r => {
    const name = r.agent_name || 'unknown';
    const cost = Number(r.total_cost || r.cost_usd || 0);
    agentTotals[name] = (agentTotals[name] || 0) + cost;
  });
  const maxAgentCost = Math.max(...Object.values(agentTotals), 0.0001);

  return (
    <div className="p-6 space-y-6">
      {/* Header + Period Selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Cost Breakdown</h2>
        <div className="flex gap-1 p-1 bg-crm-card rounded-lg border border-crm-border">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setPeriod(opt.key)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                period === opt.key
                  ? 'bg-crm-accent text-white'
                  : 'text-crm-muted hover:text-crm-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-crm-card rounded-xl border border-crm-border p-5 text-center">
          <div className="text-3xl font-bold text-emerald-400">
            {loading ? '…' : `$${totalCost.toFixed(4)}`}
          </div>
          <div className="text-xs text-crm-muted mt-1">Total Spend</div>
        </div>
        <div className="bg-crm-card rounded-xl border border-crm-border p-5 text-center">
          <div className="text-3xl font-bold text-blue-400">
            {loading ? '…' : totalCalls.toLocaleString()}
          </div>
          <div className="text-xs text-crm-muted mt-1">API Calls</div>
        </div>
        <div className="bg-crm-card rounded-xl border border-crm-border p-5 text-center">
          <div className="text-3xl font-bold text-purple-400">
            {loading ? '…' : formatTokens(totalTokens)}
          </div>
          <div className="text-xs text-crm-muted mt-1">Total Tokens</div>
        </div>
      </div>

      {/* Agent Bar Chart */}
      <div className="bg-crm-card rounded-xl border border-crm-border p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-crm-muted mb-4">
          Spend by Agent
        </h3>
        {loading ? (
          <div className="text-crm-muted text-sm text-center py-6">Loading…</div>
        ) : Object.keys(agentTotals).length === 0 ? (
          <div className="text-crm-muted text-sm text-center py-6">No cost data for this period</div>
        ) : (
          <div className="space-y-3">
            {Object.entries(agentTotals)
              .sort((a, b) => b[1] - a[1])
              .map(([name, cost]) => {
                const color = AGENT_COLORS[name] || '#6b7280';
                const pct = (cost / maxAgentCost) * 100;
                return (
                  <div key={name} className="flex items-center gap-3">
                    <span className="text-xs text-crm-text w-20 shrink-0 capitalize">{name}</span>
                    <div className="flex-1 bg-crm-bg rounded-full h-3 overflow-hidden">
                      <div
                        className="h-3 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                    <span className="text-xs text-crm-muted w-16 text-right shrink-0">
                      {formatCost(cost)}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="bg-crm-card rounded-xl border border-crm-border overflow-hidden">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-crm-muted px-5 py-3 border-b border-crm-border">
          Detail Records
        </h3>
        {loading ? (
          <div className="text-crm-muted text-sm text-center py-8">Loading…</div>
        ) : data.length === 0 ? (
          <div className="text-crm-muted text-sm text-center py-8">No records for this period</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-crm-border">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-crm-muted">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-crm-muted">Agent</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-crm-muted">Tokens</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-crm-muted">Calls</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-crm-muted">Cost</th>
                </tr>
              </thead>
              <tbody>
                {[...data]
                  .sort((a, b) => new Date(b.period || 0) - new Date(a.period || 0))
                  .map((row, i) => {
                    const color = AGENT_COLORS[row.agent_name] || '#6b7280';
                    return (
                      <tr key={i} className="border-b border-crm-border last:border-0 hover:bg-crm-hover transition-colors">
                        <td className="px-4 py-3 text-sm text-crm-muted">{row.period || '—'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                            <span className="text-crm-text capitalize">{row.agent_name || '—'}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-crm-text text-right">
                          {formatTokens(row.total_tokens)}
                        </td>
                        <td className="px-4 py-3 text-sm text-crm-text text-right">
                          {row.api_calls ?? 0}
                        </td>
                        <td className="px-4 py-3 text-sm text-emerald-400 text-right font-medium">
                          {formatCost(row.total_cost || row.cost_usd)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
