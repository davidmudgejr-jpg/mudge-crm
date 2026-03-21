import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STAGE_CONFIG = [
  { key: 'scout_queue',    label: 'Scout',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  { key: 'enricher_queue', label: 'Enricher', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  { key: 'matcher_queue',  label: 'Matcher',  color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30' },
  { key: 'review',         label: 'Review',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
];

export default function PipelineDashboard({ agents, pending, recentLogs }) {
  const [pipeline, setPipeline] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPipeline() {
      try {
        const token = localStorage.getItem('crm-auth-token');
        const res = await fetch(`${API_BASE}/api/ai/dashboard/pipeline`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setPipeline(data);
      } catch {
        setPipeline({});
      } finally {
        setLoading(false);
      }
    }
    fetchPipeline();
  }, []);

  const getCount = (key) => {
    if (!pipeline) return '—';
    if (key === 'review') {
      const total = Array.isArray(pending)
        ? pending.reduce((sum, p) => sum + (p.count || 0), 0)
        : 0;
      return total;
    }
    return pipeline[key] ?? 0;
  };

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-2xl font-bold text-white">Pipeline Dashboard</h2>
        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Stage Flow */}
      <div className="flex items-center gap-2">
        {STAGE_CONFIG.map((stage, idx) => (
          <React.Fragment key={stage.key}>
            <div className={`flex-1 rounded-xl border ${stage.border} ${stage.bg} p-5 text-center`}>
              <div className={`text-xs font-semibold uppercase tracking-widest mb-2 ${stage.color}`}>
                {stage.label}
              </div>
              <div className="text-4xl font-bold text-white">
                {loading ? <span className="text-crm-muted text-2xl">…</span> : getCount(stage.key)}
              </div>
              <div className="text-xs text-crm-muted mt-1">in queue</div>
            </div>
            {idx < STAGE_CONFIG.length - 1 && (
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-crm-muted opacity-60"
                      style={{ animation: `flowDot 1.4s ease-in-out ${i * 0.3}s infinite` }}
                    />
                  ))}
                </div>
                <svg className="w-4 h-4 text-crm-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Stats Table */}
      <div className="bg-crm-card rounded-xl border border-crm-border p-5">
        <h3 className="text-sm font-semibold text-crm-muted uppercase tracking-wider mb-4">Today's Stats</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between py-3 border-b border-crm-border">
            <span className="text-crm-text text-sm">Approved Today</span>
            <span className="text-emerald-400 font-bold text-lg">
              {loading ? '—' : pipeline?.approved_today ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-crm-border">
            <span className="text-crm-text text-sm">Rejected Today</span>
            <span className="text-red-400 font-bold text-lg">
              {loading ? '—' : pipeline?.rejected_today ?? 0}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-crm-text text-sm">Active Agents</span>
            <span className="text-blue-400 font-bold text-lg">{agents?.length ?? 0}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <span className="text-crm-text text-sm">Recent Log Entries</span>
            <span className="text-purple-400 font-bold text-lg">{recentLogs?.length ?? 0}</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes flowDot {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
