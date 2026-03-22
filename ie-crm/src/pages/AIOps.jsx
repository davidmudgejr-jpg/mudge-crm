import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL || '';
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL
  || import.meta.env.VITE_API_URL
  || (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? 'https://mudge-crm-production.up.railway.app'
    : 'http://localhost:3001');

// ============================================================
// HELPER: Format relative time
// ============================================================
function timeAgo(dateStr) {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ============================================================
// AGENT STATUS CARD
// ============================================================
function AgentCard({ agent }) {
  const statusColors = {
    active: { dot: 'bg-emerald-400', glow: 'shadow-emerald-500/30', label: 'Online' },
    idle: { dot: 'bg-amber-400', glow: 'shadow-amber-500/20', label: 'Idle' },
    offline: { dot: 'bg-red-400', glow: '', label: 'Offline' },
    error: { dot: 'bg-red-500', glow: 'shadow-red-500/30', label: 'Error' },
  };
  const s = statusColors[agent.status] || statusColors.offline;
  const isOnline = agent.status === 'active' || agent.status === 'idle';

  return (
    <div className={`
      relative rounded-xl border p-4 transition-all duration-300
      ${isOnline
        ? 'border-white/10 bg-white/[0.04] shadow-lg ' + s.glow
        : 'border-white/5 bg-white/[0.02] opacity-60'}
    `}
    style={isOnline ? { boxShadow: `0 0 20px ${agent.status === 'active' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.1)'}` } : {}}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-2.5 h-2.5 rounded-full ${s.dot} ${isOnline ? 'animate-pulse' : ''}`} />
        <span className="text-sm font-semibold text-[var(--crm-text)]">{agent.agent_name}</span>
        <span className="text-[10px] uppercase tracking-wider text-[var(--crm-muted)] ml-auto">
          {agent.tier || 'T1'}
        </span>
      </div>
      <div className="text-xs text-[var(--crm-muted)] mb-1">{s.label}</div>
      {agent.current_task && (
        <div className="text-xs text-[var(--crm-text)]/60 truncate mb-1">
          {agent.current_task}
        </div>
      )}
      <div className="text-[10px] text-[var(--crm-muted)]">
        Last seen: {timeAgo(agent.updated_at)}
      </div>
      {agent.items_processed_today > 0 && (
        <div className="mt-2 text-[10px] text-emerald-400/80">
          {agent.items_processed_today} processed today
        </div>
      )}
    </div>
  );
}

// ============================================================
// MESSAGE TYPE BADGE
// ============================================================
function MessageTypeBadge({ type }) {
  const badges = {
    council_analysis: { label: 'Analysis', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    council_strategy: { label: 'Strategy', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
    council_action_request: { label: 'Action Request', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    council_insight: { label: 'Insight', color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
    council_status: { label: 'Status', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
    houston_insight: { label: 'Insight', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    system: { label: 'System', color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    text: { label: '', color: '' },
  };
  const b = badges[type] || badges.text;
  if (!b.label) return null;
  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${b.color}`}>
      {b.label}
    </span>
  );
}

// ============================================================
// COUNCIL MESSAGE
// ============================================================
function CouncilMessage({ msg, isAdmin, onApprove, onReject }) {
  const isHouston = msg.sender_type === 'houston';
  const isSystem = msg.message_type === 'system';
  const isActionRequest = msg.message_type === 'council_action_request';
  const senderName = msg.sender_name || (isHouston ? 'Houston' : 'Admin');

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="text-xs text-[var(--crm-muted)] bg-white/5 rounded-full px-3 py-1">
          {msg.body}
        </span>
      </div>
    );
  }

  // Determine sender accent
  const isCommand = isHouston && (senderName === 'Houston Command' || senderName === 'OpenClaw');
  const accentColor = isCommand
    ? 'border-l-indigo-500'
    : isHouston
      ? 'border-l-emerald-500'
      : 'border-l-blue-500';

  const nameColor = isCommand
    ? 'text-indigo-400'
    : isHouston
      ? 'text-emerald-400'
      : 'text-blue-400';

  return (
    <div className={`group px-4 py-3 border-l-2 ${accentColor} hover:bg-white/[0.02] transition-colors`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-sm font-semibold ${nameColor}`}>{senderName}</span>
        <MessageTypeBadge type={msg.message_type} />
        <span className="text-[10px] text-[var(--crm-muted)] ml-auto">
          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <div className="text-sm text-[var(--crm-text)]/90 leading-relaxed whitespace-pre-wrap">
        {msg.body}
      </div>

      {/* Action Request approval buttons */}
      {isActionRequest && msg.proposal_status === 'pending' && isAdmin && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onApprove(msg.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
          >
            Approve
          </button>
          <button
            onClick={() => onReject(msg.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors"
          >
            Reject
          </button>
        </div>
      )}
      {isActionRequest && msg.proposal_status && msg.proposal_status !== 'pending' && (
        <div className={`mt-2 text-xs ${msg.proposal_status === 'approved' ? 'text-emerald-400' : 'text-red-400'}`}>
          {msg.proposal_status === 'approved' ? '✅' : '❌'} {msg.proposal_status.charAt(0).toUpperCase() + msg.proposal_status.slice(1)}
          {msg.proposal_reviewed_by && ` by ${msg.proposal_reviewed_by}`}
          {msg.approval_notes && ` — ${msg.approval_notes}`}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ACTIVITY LOG ENTRY
// ============================================================
function LogEntry({ log }) {
  const levelColors = {
    activity: 'text-[var(--crm-muted)]',
    success: 'text-emerald-400',
    warning: 'text-amber-400',
    error: 'text-red-400',
    info: 'text-[var(--crm-muted)]',
  };
  const levelDots = {
    activity: 'bg-gray-500',
    success: 'bg-emerald-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
  };

  const level = log.log_type || 'activity';

  return (
    <div className="flex gap-2 px-3 py-2 hover:bg-white/[0.02] transition-colors">
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${levelDots[level] || levelDots.activity}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-medium text-indigo-400 truncate">{log.agent_name}</span>
          <span className="text-[10px] text-[var(--crm-muted)] ml-auto flex-shrink-0">
            {timeAgo(log.created_at)}
          </span>
        </div>
        <p className={`text-xs leading-snug ${levelColors[level] || levelColors.activity}`}>
          {log.content}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// MAIN AI OPS PAGE
// ============================================================
export default function AIOps() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Data state
  const [agents, setAgents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [logFilter, setLogFilter] = useState('all');

  // Refs
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const socketRef = useRef(null);
  const shouldAutoScroll = useRef(true);

  const token = localStorage.getItem('crm-auth-token');

  // ── Fetch initial data ──
  const fetchData = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [msgsRes, dashRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/api/council/messages?limit=100`, { headers }),
        fetch(`${API_BASE}/api/ai/dashboard/summary`, { headers }),
        fetch(`${API_BASE}/api/ai/logs?limit=100`, { headers }),
      ]);

      if (msgsRes.ok) {
        const msgs = await msgsRes.json();
        setMessages(msgs);
      }
      if (dashRes.ok) {
        const dash = await dashRes.json();
        setAgents(dash.agents || []);
      }
      if (logsRes.ok) {
        const logData = await logsRes.json();
        setLogs(logData);
      }
    } catch (err) {
      console.error('[AIOps] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Socket.io connection ──
  useEffect(() => {
    if (!user?.user_id) return;

    const sock = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: { token },
    });
    socketRef.current = sock;

    sock.on('connect', () => {
      setConnected(true);
      sock.emit('council:join', { userId: user.user_id });
    });

    sock.on('disconnect', () => setConnected(false));

    sock.on('council:message:new', (msg) => {
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    sock.on('council:proposal:updated', ({ messageId, status, reviewedBy, notes }) => {
      setMessages(prev => prev.map(m => {
        if (m.id === messageId) {
          return {
            ...m,
            proposal_status: status,
            proposal_reviewed_by: reviewedBy,
            approval_notes: notes,
          };
        }
        return m;
      }));
    });

    sock.connect();

    return () => {
      sock.emit('council:leave');
      sock.disconnect();
      socketRef.current = null;
    };
  }, [user?.user_id, token]);

  // ── Auto-scroll ──
  useEffect(() => {
    if (shouldAutoScroll.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const el = chatContainerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    shouldAutoScroll.current = atBottom;
  };

  // ── Send message ──
  const sendMessage = async () => {
    if (!inputValue.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/api/council/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: inputValue.trim() }),
      });
      if (res.ok) setInputValue('');
    } catch (err) {
      console.error('[AIOps] Send error:', err.message);
    } finally {
      setSending(false);
    }
  };

  // ── Approve / Reject proposals ──
  const handleApprove = async (messageId) => {
    try {
      await fetch(`${API_BASE}/api/council/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messageId, approved: true }),
      });
    } catch (err) {
      console.error('[AIOps] Approve error:', err.message);
    }
  };

  const handleReject = async (messageId) => {
    const notes = window.prompt('Rejection reason (optional):');
    try {
      await fetch(`${API_BASE}/api/council/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ messageId, approved: false, notes: notes || '' }),
      });
    } catch (err) {
      console.error('[AIOps] Reject error:', err.message);
    }
  };

  // ── Filtered logs ──
  const filteredLogs = logFilter === 'all'
    ? logs
    : logs.filter(l => l.agent_name === logFilter || l.log_type === logFilter);

  const uniqueAgentNames = [...new Set(logs.map(l => l.agent_name).filter(Boolean))];

  // ── Default agents if none from API ──
  const displayAgents = agents.length > 0 ? agents : [
    { agent_name: 'Houston Command', tier: 'T1', status: 'offline', current_task: null, updated_at: null },
    { agent_name: 'Houston (Sonnet)', tier: 'T1', status: 'active', current_task: 'CRM Backend — Team Chat', updated_at: new Date().toISOString() },
    { agent_name: 'Ralph', tier: 'T3', status: 'offline', current_task: null, updated_at: null },
  ];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--crm-muted)] text-sm">Loading Mission Control...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--crm-bg)]">
      {/* ═══════════════ SECTION A: Agent Dashboard (top bar) ═══════════════ */}
      <div className="flex-shrink-0 border-b border-[var(--crm-border)] px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 0 1-1.59.659H9.06a2.25 2.25 0 0 1-1.591-.659L5 14.5m14 0V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-[var(--crm-text)]">Houston Command Council</h1>
              <p className="text-xs text-[var(--crm-muted)]">AI Operations Center</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
            <span className="text-xs text-[var(--crm-muted)]">{connected ? 'Live' : 'Disconnected'}</span>
          </div>
        </div>

        {/* Agent cards row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {displayAgents.map(agent => (
            <AgentCard key={agent.agent_name} agent={agent} />
          ))}
        </div>
      </div>

      {/* ═══════════════ SECTIONS B + C: Council Chat + Activity Log ═══════════════ */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* ─── SECTION B: Council Chat (left 2/3) ─── */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[var(--crm-border)]">
          {/* Messages area */}
          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--crm-scroll-thumb) var(--crm-scroll-track)' }}
          >
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-[var(--crm-muted)] gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-indigo-400/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-[var(--crm-text)]/50">Council Channel</p>
                  <p className="text-xs mt-1">Houston Command will post strategic insights here.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {messages.map(msg => (
                  <CouncilMessage
                    key={msg.id}
                    msg={msg}
                    isAdmin={isAdmin}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input bar */}
          <div className="flex-shrink-0 border-t border-[var(--crm-border)] p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={isAdmin ? "Message the Council as Admin..." : "View only — admin access required to post"}
                disabled={!isAdmin}
                className="flex-1 bg-white/[0.04] border border-[var(--crm-border)] rounded-lg px-3 py-2 text-sm text-[var(--crm-text)] placeholder-[var(--crm-muted)] focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 disabled:opacity-40"
              />
              <button
                onClick={sendMessage}
                disabled={!isAdmin || !inputValue.trim() || sending}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-medium hover:from-indigo-500 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* ─── SECTION C: Activity Log (right 1/3 sidebar) ─── */}
        <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col overflow-hidden">
          {/* Log header with filter */}
          <div className="flex-shrink-0 px-3 py-3 border-b border-[var(--crm-border)]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-[var(--crm-text)]">Activity Log</h2>
              <span className="text-[10px] text-[var(--crm-muted)]">{filteredLogs.length} entries</span>
            </div>
            <select
              value={logFilter}
              onChange={e => setLogFilter(e.target.value)}
              className="w-full text-xs bg-white/[0.04] border border-[var(--crm-border)] rounded-md px-2 py-1.5 text-[var(--crm-text)] focus:outline-none focus:border-indigo-500/50"
            >
              <option value="all">All Agents</option>
              {uniqueAgentNames.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="error">Errors Only</option>
              <option value="success">Successes Only</option>
            </select>
          </div>

          {/* Log entries */}
          <div
            className="flex-1 overflow-y-auto"
            style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--crm-scroll-thumb) var(--crm-scroll-track)' }}
          >
            {filteredLogs.length === 0 ? (
              <div className="p-4 text-center text-xs text-[var(--crm-muted)]">
                No activity logs yet. Agents will report actions here.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.03]">
                {filteredLogs.map(log => (
                  <LogEntry key={log.id} log={log} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
