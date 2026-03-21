import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const KEY_ENDPOINTS = [
  { label: 'Dashboard Summary', url: '/api/ai/dashboard/summary' },
  { label: 'Pipeline',          url: '/api/ai/dashboard/pipeline' },
  { label: 'Agent Logs',        url: '/api/ai/logs?limit=1' },
  { label: 'DB Status',         url: '/api/db/status' },
];

function formatRelative(ts) {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isStaleAgent(updatedAt) {
  if (!updatedAt) return true;
  return Date.now() - new Date(updatedAt).getTime() > 5 * 60 * 1000;
}

const AGENT_COLORS = {
  enricher:   '#10b981',
  researcher: '#3b82f6',
  scout:      '#f59e0b',
  matcher:    '#8b5cf6',
  ralph:      '#ef4444',
  gemini:     '#06b6d4',
  houston:    '#fbbf24',
};

export default function SystemHealth({ agents }) {
  const [dbStatus, setDbStatus] = useState(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [endpointStatuses, setEndpointStatuses] = useState({});

  useEffect(() => {
    // Check DB status
    async function checkDb() {
      setDbLoading(true);
      try {
        const token = localStorage.getItem('crm-auth-token');
        const res = await fetch(`${API_BASE}/api/db/status`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setDbStatus({ ok: true, ...data });
      } catch (err) {
        setDbStatus({ ok: false, error: err.message });
      } finally {
        setDbLoading(false);
      }
    }

    // Check each key endpoint
    async function checkEndpoints() {
      const results = {};
      await Promise.all(
        KEY_ENDPOINTS.map(async ep => {
          const start = Date.now();
          try {
            const res = await fetch(`${API_BASE}${ep.url}`, {
              headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            });
            results[ep.url] = { ok: res.ok, status: res.status, latency: Date.now() - start };
          } catch (err) {
            results[ep.url] = { ok: false, error: err.message, latency: Date.now() - start };
          }
        })
      );
      setEndpointStatuses(results);
    }

    checkDb();
    checkEndpoints();
  }, []);

  // Uptime: time since the latest heartbeat
  const latestHeartbeat = agents?.reduce((latest, a) => {
    const t = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    return t > latest ? t : latest;
  }, 0);

  const freshAgents = agents?.filter(a => !isStaleAgent(a.updated_at)) || [];
  const staleAgents = agents?.filter(a => isStaleAgent(a.updated_at)) || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-bold text-white">System Health</h2>

      {/* DB Status */}
      <div className="bg-crm-card rounded-xl border border-crm-border p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-crm-muted mb-3">Database</h3>
        {dbLoading ? (
          <div className="text-crm-muted text-sm">Checking…</div>
        ) : (
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${dbStatus?.ok ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <span className={`text-sm font-medium ${dbStatus?.ok ? 'text-emerald-400' : 'text-red-400'}`}>
              {dbStatus?.ok ? 'Connected' : 'Disconnected'}
            </span>
            {dbStatus?.ok && dbStatus?.pool_size && (
              <span className="text-crm-muted text-xs">Pool: {dbStatus.pool_size}</span>
            )}
            {!dbStatus?.ok && dbStatus?.error && (
              <span className="text-red-300 text-xs font-mono">{dbStatus.error}</span>
            )}
          </div>
        )}
      </div>

      {/* API Health */}
      <div className="bg-crm-card rounded-xl border border-crm-border p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-crm-muted mb-3">API Endpoints</h3>
        <div className="space-y-2">
          {KEY_ENDPOINTS.map(ep => {
            const s = endpointStatuses[ep.url];
            const checked = !!s;
            return (
              <div key={ep.url} className="flex items-center justify-between py-2 border-b border-crm-border last:border-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${!checked ? 'bg-crm-muted animate-pulse' : s.ok ? 'bg-emerald-400' : 'bg-red-400'}`}
                  />
                  <span className="text-sm text-crm-text">{ep.label}</span>
                  <span className="text-xs text-crm-muted font-mono">{ep.url}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {checked && (
                    <>
                      <span className={s.ok ? 'text-emerald-400' : 'text-red-400'}>
                        {s.ok ? `${s.status} OK` : `${s.status || 'ERR'}`}
                      </span>
                      <span className="text-crm-muted">{s.latency}ms</span>
                    </>
                  )}
                  {!checked && <span className="text-crm-muted">checking…</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Heartbeat Freshness */}
      <div className="bg-crm-card rounded-xl border border-crm-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-crm-muted">Agent Heartbeats</h3>
          {latestHeartbeat > 0 && (
            <span className="text-xs text-crm-muted">
              Latest: {formatRelative(new Date(latestHeartbeat).toISOString())}
            </span>
          )}
        </div>

        {!agents || agents.length === 0 ? (
          <div className="text-crm-muted text-sm text-center py-4">No agents registered</div>
        ) : (
          <div className="space-y-2">
            {[...agents].sort((a, b) => {
              const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
              const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
              return tb - ta;
            }).map(agent => {
              const color = AGENT_COLORS[agent.agent_name] || '#6b7280';
              const stale = isStaleAgent(agent.updated_at);
              return (
                <div
                  key={agent.agent_name}
                  className="flex items-center justify-between py-2.5 border-b border-crm-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${stale ? '' : 'animate-pulse'}`}
                      style={{ backgroundColor: stale ? '#6b7280' : color }}
                    />
                    <span className="text-sm text-crm-text capitalize">{agent.agent_name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-crm-muted">{formatRelative(agent.updated_at)}</span>
                    {stale && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        stale
                      </span>
                    )}
                    {!stale && (
                      <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        live
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary line */}
        {agents && agents.length > 0 && (
          <div className="mt-3 pt-3 border-t border-crm-border flex gap-4 text-xs">
            <span className="text-emerald-400">{freshAgents.length} live</span>
            <span className="text-amber-400">{staleAgents.length} stale</span>
            <span className="text-crm-muted">{agents.length} total</span>
          </div>
        )}
      </div>
    </div>
  );
}
