import React, { useState } from 'react';
import useAgentLogs from '../../../hooks/useAgentLogs';

const AGENT_COLORS = {
  enricher:   '#10b981',
  researcher: '#3b82f6',
  scout:      '#f59e0b',
  matcher:    '#8b5cf6',
  ralph:      '#ef4444',
  gemini:     '#06b6d4',
  houston:    '#fbbf24',
};

const LOG_TYPE_CONFIG = {
  activity:      { label: 'activity',      cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  error:         { label: 'error',         cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  daily_summary: { label: 'daily_summary', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  system:        { label: 'system',        cls: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
};

const DATE_RANGE_OPTIONS = [
  { key: 'today', label: 'Today' },
  { key: '7d',    label: '7d' },
  { key: '30d',   label: '30d' },
];

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString([], {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function isWithinRange(ts, range) {
  if (!ts) return false;
  const now = Date.now();
  const t = new Date(ts).getTime();
  if (range === 'today') {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return t >= startOfDay.getTime();
  }
  if (range === '7d') return now - t <= 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return now - t <= 30 * 24 * 60 * 60 * 1000;
  return true;
}

export default function LogViewer({ agents }) {
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [dateRange, setDateRange] = useState('today');

  const { logs, loading } = useAgentLogs(
    selectedAgent || null,
    selectedType || null,
    100,
  );

  const agentNames = agents?.map(a => a.agent_name) || [];

  const filteredLogs = logs.filter(log => isWithinRange(log.created_at, dateRange));

  return (
    <div className="p-6 space-y-6 flex flex-col h-full">
      {/* Header */}
      <h2 className="text-2xl font-bold text-white">Log Viewer</h2>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Agent Dropdown */}
        <select
          value={selectedAgent}
          onChange={e => setSelectedAgent(e.target.value)}
          className="bg-crm-card border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text focus:outline-none focus:border-crm-accent"
        >
          <option value="">All Agents</option>
          {agentNames.map(name => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        {/* Type Dropdown */}
        <select
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
          className="bg-crm-card border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text focus:outline-none focus:border-crm-accent"
        >
          <option value="">All Types</option>
          {Object.keys(LOG_TYPE_CONFIG).map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        {/* Date Range Buttons */}
        <div className="flex gap-1 p-1 bg-crm-card rounded-lg border border-crm-border">
          {DATE_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => setDateRange(opt.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                dateRange === opt.key
                  ? 'bg-crm-accent text-white'
                  : 'text-crm-muted hover:text-crm-text'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="text-crm-muted text-xs ml-auto">
          {filteredLogs.length} entries
        </span>
      </div>

      {/* Log List */}
      <div className="bg-crm-card rounded-xl border border-crm-border flex-1 overflow-hidden">
        {loading ? (
          <div className="text-crm-muted text-sm text-center py-12">Loading logs…</div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-crm-muted text-sm text-center py-12">No log entries match your filters</div>
        ) : (
          <div className="overflow-y-auto h-full max-h-[calc(100vh-320px)]">
            {[...filteredLogs].reverse().map((log, i) => {
              const agentColor = AGENT_COLORS[log.agent_name] || '#6b7280';
              const typeConfig = LOG_TYPE_CONFIG[log.log_type] || LOG_TYPE_CONFIG.system;
              return (
                <div
                  key={log.id || i}
                  className="flex items-start gap-3 px-4 py-3 border-b border-crm-border last:border-0 hover:bg-crm-hover transition-colors text-sm"
                >
                  {/* Timestamp */}
                  <span className="text-crm-muted text-xs font-mono shrink-0 pt-0.5 w-36">
                    {formatTimestamp(log.created_at)}
                  </span>

                  {/* Agent badge */}
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: agentColor }}
                    />
                    <span className="text-xs font-medium" style={{ color: agentColor }}>
                      {log.agent_name || '—'}
                    </span>
                  </span>

                  {/* Log type badge */}
                  <span className={`px-1.5 py-0.5 rounded text-xs border shrink-0 ${typeConfig.cls}`}>
                    {log.log_type}
                  </span>

                  {/* Content */}
                  <span className="text-crm-text leading-relaxed break-words min-w-0">
                    {log.content}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
