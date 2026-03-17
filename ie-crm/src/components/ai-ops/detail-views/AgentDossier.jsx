import React, { useState } from 'react';
import useAgentLogs from '../../../hooks/useAgentLogs';

const AGENT_COLORS = {
  enricher: '#10b981',
  researcher: '#3b82f6',
  scout: '#f59e0b',
  matcher: '#8b5cf6',
  ralph: '#ef4444',
  gemini: '#06b6d4',
  houston: '#fbbf24',
};

const LOG_TYPE_COLORS = {
  activity: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  error: 'bg-red-500/20 text-red-300 border-red-500/30',
  daily_summary: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  system: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
};

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

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function AgentDossier({ agentName, agents }) {
  const [metaOpen, setMetaOpen] = useState(false);
  const { logs, loading: logsLoading } = useAgentLogs(agentName, null, 20);

  const agent = agents?.find(a => a.agent_name === agentName);
  const color = AGENT_COLORS[agentName] || '#6b7280';

  const isStale = agent?.updated_at
    ? Date.now() - new Date(agent.updated_at).getTime() > 5 * 60 * 1000
    : true;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
          style={{ backgroundColor: color + '33', border: `2px solid ${color}` }}
        >
          {agentName?.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-white capitalize">{agentName}</h2>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-medium"
              style={{ backgroundColor: color + '22', color, border: `1px solid ${color}55` }}
            >
              {agent?.status || 'unknown'}
            </span>
            {isStale && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                stale
              </span>
            )}
          </div>
          <p className="text-crm-muted text-sm mt-0.5">Last seen {formatRelative(agent?.updated_at)}</p>
        </div>
      </div>

      {/* Current Task */}
      <div className="bg-crm-card rounded-xl border border-crm-border p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-crm-muted mb-2">Current Task</h3>
        <p className="text-crm-text text-sm">
          {agent?.current_task || <span className="text-crm-muted italic">No active task</span>}
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-crm-card rounded-xl border border-crm-border p-4 text-center">
          <div className="text-3xl font-bold text-white">{agent?.items_processed_today ?? '—'}</div>
          <div className="text-xs text-crm-muted mt-1">Items Today</div>
        </div>
        <div className="bg-crm-card rounded-xl border border-crm-border p-4 text-center">
          <div className="text-3xl font-bold text-white">{agent?.queue_depth ?? '—'}</div>
          <div className="text-xs text-crm-muted mt-1">Queue Depth</div>
        </div>
        <div className="bg-crm-card rounded-xl border border-crm-border p-4 text-center">
          <div className="text-base font-semibold text-white">{formatRelative(agent?.updated_at)}</div>
          <div className="text-xs text-crm-muted mt-1">Last Active</div>
        </div>
      </div>

      {/* Error Section */}
      {agent?.last_error && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">Last Error</h3>
          <p className="text-red-300 text-sm font-mono">{agent.last_error}</p>
        </div>
      )}

      {/* Recent Activity Log */}
      <div className="bg-crm-card rounded-xl border border-crm-border p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-crm-muted mb-4">Recent Activity</h3>
        {logsLoading ? (
          <div className="text-crm-muted text-sm text-center py-6">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="text-crm-muted text-sm text-center py-6">No log entries yet</div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {logs.map((log, i) => (
              <div key={log.id || i} className="flex items-start gap-3 text-sm">
                <span className="text-crm-muted text-xs font-mono shrink-0 pt-0.5 w-20">
                  {formatTimestamp(log.created_at)}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs border shrink-0 ${LOG_TYPE_COLORS[log.log_type] || LOG_TYPE_COLORS.system}`}>
                  {log.log_type}
                </span>
                <span className="text-crm-text leading-relaxed">{log.content}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Metadata Viewer */}
      {agent?.metadata && (
        <div className="bg-crm-card rounded-xl border border-crm-border overflow-hidden">
          <button
            onClick={() => setMetaOpen(v => !v)}
            className="w-full flex items-center justify-between px-5 py-3 hover:bg-crm-hover transition-colors"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-crm-muted">
              Metadata
            </span>
            <svg
              className={`w-4 h-4 text-crm-muted transition-transform ${metaOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {metaOpen && (
            <div className="px-5 pb-4">
              <pre className="text-crm-muted text-xs bg-crm-bg rounded-lg p-3 overflow-auto max-h-48">
                {JSON.stringify(agent.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
