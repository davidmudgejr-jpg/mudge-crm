import { useState, useEffect, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || '';

// Known agent schedules (static config — updated as agents come online)
const AGENT_SCHEDULES = {
  houston_command: {
    name: 'Houston Command',
    model: 'Opus 4.6',
    color: '#10b981',
    machine: '16GB Mac Mini',
    status: 'online',
    crons: [
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
      { id: 'directive-poll', label: 'Directive Poll', schedule: 'Every 5 min', type: 'operations' },
      { id: 'token-monitor', label: 'Token Monitor', schedule: 'Every 30 min', type: 'health' },
      { id: 'daily-summary', label: 'Daily Summary', schedule: 'Daily 11:59 PM', type: 'reporting' },
      { id: 'daily-memory', label: 'Memory Consolidation', schedule: 'Daily 2:00 AM', type: 'learning' },
      { id: 'council-of-minds', label: 'Council of Minds', schedule: 'Tue/Fri/Sun 2:00 AM', type: 'strategic' },
      { id: 'weekly-review', label: 'Weekly Self-Review', schedule: 'Sunday 12:00 AM', type: 'strategic' },
      { id: 'nightly-health', label: 'Nightly Health Check', schedule: 'Daily 3:00 AM', type: 'health' },
    ],
  },
  ralph_gpt: {
    name: 'Ralph GPT',
    model: 'GPT-4',
    color: '#f59e0b',
    machine: 'M1 Mac Mini (pending)',
    status: 'offline',
    crons: [
      { id: 'validation-cycle', label: 'Sandbox Validation', schedule: 'Every 10 min', type: 'operations' },
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
    ],
  },
  ralph_gemini: {
    name: 'Ralph Gemini',
    model: 'Gemini Pro',
    color: '#ef4444',
    machine: 'M1 Mac Mini (pending)',
    status: 'offline',
    crons: [
      { id: 'validation-cycle', label: 'Sandbox Validation', schedule: 'Every 10 min', type: 'operations' },
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
    ],
  },
  enricher: {
    name: 'Enricher',
    model: 'Qwen 3.5',
    color: '#8b5cf6',
    machine: '48GB Mac Mini (arriving April 14-21)',
    status: 'offline',
    crons: [
      { id: 'enrichment-cycle', label: 'Enrichment Cycle', schedule: 'Every 15 min', type: 'operations' },
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
    ],
  },
  researcher: {
    name: 'Researcher',
    model: 'MiniMax 2.5',
    color: '#06b6d4',
    machine: '48GB Mac Mini (arriving April 14-21)',
    status: 'offline',
    crons: [
      { id: 'research-scan', label: 'Market Scan', schedule: 'Every 30 min', type: 'operations' },
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
    ],
  },
  matcher: {
    name: 'Matcher',
    model: 'Qwen 3.5',
    color: '#f97316',
    machine: '48GB Mac Mini (arriving April 14-21)',
    status: 'offline',
    crons: [
      { id: 'match-cycle', label: 'AIR Match Cycle', schedule: 'On new AIR report', type: 'operations' },
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
    ],
  },
  postmaster: {
    name: 'Postmaster',
    model: 'Qwen 3.5',
    color: '#ec4899',
    machine: '48GB Mac Mini (arriving April 14-21)',
    status: 'offline',
    crons: [
      { id: 'email-scan', label: 'Email Inbox Scan', schedule: 'Every 5 min', type: 'operations' },
      { id: 'triage-summary', label: 'Daily Triage Summary', schedule: 'Daily 8:00 AM', type: 'reporting' },
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
    ],
  },
  campaign_manager: {
    name: 'Campaign Manager',
    model: 'Qwen 3.5',
    color: '#14b8a6',
    machine: '48GB Mac Mini (arriving April 14-21)',
    status: 'offline',
    crons: [
      { id: 'campaign-cycle', label: 'Campaign Send Cycle', schedule: 'Daily 9:00 AM', type: 'operations' },
      { id: 'analytics-pull', label: 'Analytics Pull', schedule: 'Every 6 hours', type: 'reporting' },
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
    ],
  },
  scout: {
    name: 'Scout',
    model: 'MiniMax 2.5',
    color: '#a855f7',
    machine: '48GB Mac Mini (arriving April 14-21)',
    status: 'offline',
    crons: [
      { id: 'news-scan', label: 'AI/Tech News Scan', schedule: 'Every 2 hours', type: 'operations' },
      { id: 'evolution-report', label: 'Weekly Evolution Report', schedule: 'Sunday 1:00 AM', type: 'reporting' },
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
    ],
  },
  logger: {
    name: 'Logger',
    model: 'Qwen 3.5',
    color: '#64748b',
    machine: '48GB Mac Mini (arriving April 14-21)',
    status: 'offline',
    crons: [
      { id: 'daily-log', label: 'Daily Summary', schedule: 'Daily 11:30 PM', type: 'reporting' },
      { id: 'cost-report', label: 'Weekly Cost Report', schedule: 'Sunday 6:00 AM', type: 'reporting' },
      { id: 'heartbeat', label: 'Heartbeat', schedule: 'Every 1 min', type: 'health' },
    ],
  },
};

const TYPE_COLORS = {
  health: '#22c55e',
  operations: '#3b82f6',
  reporting: '#f59e0b',
  learning: '#8b5cf6',
  strategic: '#ec4899',
};

const TYPE_ICONS = {
  health: '💚',
  operations: '⚙️',
  reporting: '📊',
  learning: '🧠',
  strategic: '🎯',
};

function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StatusDot({ status }) {
  const colors = { online: '#22c55e', offline: '#6b7280', error: '#ef4444' };
  return (
    <span style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: colors[status] || '#6b7280',
      marginRight: 6,
      boxShadow: status === 'online' ? `0 0 6px ${colors.online}` : 'none',
    }} />
  );
}

function CronRow({ cron, lastExecution }) {
  const isRecent = lastExecution && (Date.now() - new Date(lastExecution.created_at).getTime()) < 3600000;
  const failed = lastExecution?.log_type === 'error';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      borderRadius: 6,
      background: 'rgba(255,255,255,0.02)',
      marginBottom: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        <span style={{ fontSize: 12 }}>{TYPE_ICONS[cron.type] || '⚙️'}</span>
        <span style={{ fontSize: 13, color: '#d1d5db', fontWeight: 500 }}>{cron.label}</span>
        <span style={{
          fontSize: 10,
          padding: '1px 6px',
          borderRadius: 4,
          background: `${TYPE_COLORS[cron.type] || '#6b7280'}15`,
          color: TYPE_COLORS[cron.type] || '#6b7280',
        }}>
          {cron.type}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12, color: '#6b7280', minWidth: 120, textAlign: 'right' }}>
          {cron.schedule}
        </span>
        {lastExecution ? (
          <span style={{
            fontSize: 11,
            color: failed ? '#ef4444' : isRecent ? '#22c55e' : '#9ca3af',
            minWidth: 80,
            textAlign: 'right',
            fontWeight: failed ? 600 : 400,
          }}>
            {failed ? '❌ ' : '✅ '}{timeAgo(lastExecution.created_at)}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: '#4b5563', minWidth: 80, textAlign: 'right' }}>
            — no data
          </span>
        )}
      </div>
    </div>
  );
}

export default function AgentSchedules() {
  const [cronLogs, setCronLogs] = useState({});
  const [heartbeats, setHeartbeats] = useState({});
  const [filter, setFilter] = useState('all'); // 'all', 'online', 'offline'
  const [typeFilter, setTypeFilter] = useState('all');

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = useCallback(async () => {
    try {
      // Fetch recent cron-related logs
      const logsRes = await fetch(`${API}/api/ai/agent/logs?limit=200`, { headers });
      if (logsRes.ok) {
        const data = await logsRes.json();
        // Group latest log by agent + cron id pattern
        const grouped = {};
        (data.logs || []).forEach(log => {
          const agent = log.agent_name;
          if (!grouped[agent]) grouped[agent] = {};
          // Try to extract cron id from log body
          const cronMatch = log.body?.match(/\[([\w-]+)\]/);
          if (cronMatch) {
            const cronId = cronMatch[1];
            if (!grouped[agent][cronId]) {
              grouped[agent][cronId] = log;
            }
          }
        });
        setCronLogs(grouped);
      }

      // Fetch heartbeats for online status
      const hbRes = await fetch(`${API}/api/ai/dashboard/summary`, { headers });
      if (hbRes.ok) {
        const data = await hbRes.json();
        const hbMap = {};
        (data.agents || []).forEach(a => {
          hbMap[a.agent_name] = a;
        });
        setHeartbeats(hbMap);
      }
    } catch (err) {
      console.error('Failed to fetch schedule data:', err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  // Determine agent online status from heartbeats
  const getAgentStatus = (agentKey) => {
    const hb = heartbeats[agentKey];
    if (!hb) return 'offline';
    const age = Date.now() - new Date(hb.last_heartbeat || hb.updated_at).getTime();
    return age < 120000 ? 'online' : 'offline'; // 2 min threshold
  };

  // Filter agents
  const agentEntries = Object.entries(AGENT_SCHEDULES).filter(([key, agent]) => {
    const status = getAgentStatus(key);
    if (filter === 'online' && status !== 'online') return false;
    if (filter === 'offline' && status !== 'offline') return false;
    return true;
  });

  // Count totals
  const totalOnline = Object.keys(AGENT_SCHEDULES).filter(k => getAgentStatus(k) === 'online').length;
  const totalCrons = Object.values(AGENT_SCHEDULES).reduce((sum, a) => sum + a.crons.length, 0);

  return (
    <div style={{ padding: 20, height: '100%', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#e5e7eb', margin: 0 }}>
          Agent Schedules
        </h2>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
          {totalOnline} agents online — {totalCrons} scheduled tasks across the fleet
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {['all', 'online', 'offline'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '4px 12px',
              borderRadius: 6,
              border: filter === f ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
              background: filter === f ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)',
              color: filter === f ? '#10b981' : '#9ca3af',
              fontSize: 12,
              cursor: 'pointer',
              fontWeight: filter === f ? 600 : 400,
              textTransform: 'capitalize',
            }}
          >
            {f}
          </button>
        ))}
        <span style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
        {['all', ...Object.keys(TYPE_COLORS)].map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: typeFilter === t
                ? `1px solid ${TYPE_COLORS[t] || 'rgba(16,185,129,0.4)'}40`
                : '1px solid rgba(255,255,255,0.08)',
              background: typeFilter === t
                ? `${TYPE_COLORS[t] || 'rgba(16,185,129,0.15)'}15`
                : 'rgba(255,255,255,0.04)',
              color: typeFilter === t ? (TYPE_COLORS[t] || '#10b981') : '#9ca3af',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: typeFilter === t ? 600 : 400,
              textTransform: 'capitalize',
            }}
          >
            {t === 'all' ? 'All types' : `${TYPE_ICONS[t] || ''} ${t}`}
          </button>
        ))}
      </div>

      {/* Agent cards */}
      {agentEntries.map(([agentKey, agent]) => {
        const status = getAgentStatus(agentKey);
        const agentCronLogs = cronLogs[agentKey] || {};
        const filteredCrons = typeFilter === 'all'
          ? agent.crons
          : agent.crons.filter(c => c.type === typeFilter);

        if (filteredCrons.length === 0) return null;

        return (
          <div
            key={agentKey}
            style={{
              marginBottom: 16,
              borderRadius: 10,
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}
          >
            {/* Agent header */}
            <div style={{
              padding: '12px 16px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StatusDot status={status} />
                <span style={{ fontWeight: 600, fontSize: 14, color: agent.color }}>
                  {agent.name}
                </span>
                <span style={{
                  fontSize: 10,
                  padding: '1px 6px',
                  borderRadius: 6,
                  background: `${agent.color}15`,
                  color: agent.color,
                }}>
                  {agent.model}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                {agent.machine}
              </div>
            </div>

            {/* Cron rows */}
            <div style={{ padding: '8px 12px' }}>
              {filteredCrons.map(cron => (
                <CronRow
                  key={cron.id}
                  cron={cron}
                  lastExecution={agentCronLogs[cron.id]}
                />
              ))}
            </div>
          </div>
        );
      })}

      {agentEntries.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, padding: 40 }}>
          No agents match the current filter.
        </div>
      )}
    </div>
  );
}
