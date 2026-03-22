import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../../../contexts/AuthContext';

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
          {msg.proposal_status === 'approved' ? '\u2705' : '\u274C'} {msg.proposal_status.charAt(0).toUpperCase() + msg.proposal_status.slice(1)}
          {msg.proposal_reviewed_by && ` by ${msg.proposal_reviewed_by}`}
          {msg.approval_notes && ` \u2014 ${msg.approval_notes}`}
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
// PRIORITY BADGE (for Directives)
// ============================================================
function PriorityBadge({ priority }) {
  const colors = {
    critical: 'bg-red-500/20 text-red-300 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    normal: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    low: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  };
  return (
    <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded border ${colors[priority] || colors.normal}`}>
      {priority}
    </span>
  );
}

// ============================================================
// DIRECTIVE CARD
// ============================================================
function DirectiveCard({ directive, isAdmin, onArchive }) {
  const [expanded, setExpanded] = useState(false);
  const acked = Array.isArray(directive.acknowledged_by) ? directive.acknowledged_by : [];

  return (
    <div className="px-4 py-3 border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
      <div className="flex items-start gap-2 mb-1">
        <PriorityBadge priority={directive.priority} />
        <span className="text-sm font-medium text-[var(--crm-text)] flex-1">{directive.title}</span>
        <span className="text-[10px] text-[var(--crm-muted)] flex-shrink-0">
          {timeAgo(directive.created_at)}
        </span>
      </div>

      <div
        className={`text-xs text-[var(--crm-text)]/70 leading-relaxed mb-2 ${expanded ? '' : 'line-clamp-2'}`}
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        {directive.body}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-[var(--crm-muted)]">
          Scope: <span className="text-indigo-400">{directive.scope}</span>
        </span>
        <span className="text-[10px] text-[var(--crm-muted)]">
          Source: {directive.source}
        </span>
        {acked.length > 0 && (
          <span className="text-[10px] text-emerald-400">
            ACK: {acked.join(', ')}
          </span>
        )}
        {isAdmin && directive.status === 'active' && (
          <button
            onClick={() => onArchive(directive.id)}
            className="ml-auto text-[10px] text-[var(--crm-muted)] hover:text-red-400 transition-colors"
          >
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// NEW DIRECTIVE FORM
// ============================================================
function NewDirectiveForm({ onSubmit, onCancel }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('normal');
  const [scope, setScope] = useState('all');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ title: title.trim(), body: body.trim(), priority, scope });
      setTitle('');
      setBody('');
      setPriority('normal');
      setScope('all');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-3 border-b border-[var(--crm-border)] bg-white/[0.02]">
      <input
        type="text"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Directive title..."
        className="w-full bg-white/[0.04] border border-[var(--crm-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--crm-text)] placeholder-[var(--crm-muted)] focus:outline-none focus:border-indigo-500/50 mb-2"
      />
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder="Directive body / instructions..."
        rows={3}
        className="w-full bg-white/[0.04] border border-[var(--crm-border)] rounded-lg px-3 py-1.5 text-sm text-[var(--crm-text)] placeholder-[var(--crm-muted)] focus:outline-none focus:border-indigo-500/50 mb-2 resize-none"
      />
      <div className="flex gap-2 mb-2">
        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className="text-xs bg-white/[0.04] border border-[var(--crm-border)] rounded-md px-2 py-1.5 text-[var(--crm-text)] focus:outline-none focus:border-indigo-500/50"
        >
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
        <select
          value={scope}
          onChange={e => setScope(e.target.value)}
          className="text-xs bg-white/[0.04] border border-[var(--crm-border)] rounded-md px-2 py-1.5 text-[var(--crm-text)] focus:outline-none focus:border-indigo-500/50"
        >
          <option value="all">All Agents</option>
          <option value="command">Houston Command</option>
          <option value="sonnet">Houston Sonnet</option>
          <option value="enricher">Enricher</option>
          <option value="ralph">Ralph</option>
          <option value="matcher">Matcher</option>
          <option value="scout">Scout</option>
          <option value="researcher">Researcher</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!title.trim() || !body.trim() || submitting}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-500 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {submitting ? 'Creating...' : 'Issue Directive'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-[var(--crm-muted)] hover:text-[var(--crm-text)] transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ============================================================
// COUNCIL CHAT — Detail View for War Room
// ============================================================
export default function CouncilChat() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  // Data state
  const [agents, setAgents] = useState([]);
  const [messages, setMessages] = useState([]);
  const [logs, setLogs] = useState([]);
  const [directives, setDirectives] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [logFilter, setLogFilter] = useState('all');

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Directives panel state
  const [showDirectives, setShowDirectives] = useState(false);
  const [showNewDirective, setShowNewDirective] = useState(false);

  // Refs
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const socketRef = useRef(null);
  const shouldAutoScroll = useRef(true);

  const token = localStorage.getItem('crm-auth-token');

  // -- Fetch heartbeats separately (for manual refresh) --
  const fetchHeartbeats = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [dashRes, heartbeatsRes] = await Promise.all([
        fetch(`${API_BASE}/api/ai/dashboard/summary`, { headers }),
        fetch(`${API_BASE}/api/ai/heartbeats`, { headers }),
      ]);

      let dashAgents = [];
      if (dashRes.ok) {
        const dash = await dashRes.json();
        dashAgents = dash.agents || [];
      }

      let heartbeats = [];
      if (heartbeatsRes.ok) {
        heartbeats = await heartbeatsRes.json();
      }

      // Build a map of heartbeat statuses (recent = within 5 minutes)
      const heartbeatMap = {};
      const FIVE_MINUTES = 5 * 60 * 1000;
      for (const hb of heartbeats) {
        const isRecent = hb.updated_at && (Date.now() - new Date(hb.updated_at).getTime()) < FIVE_MINUTES;
        heartbeatMap[hb.agent_name] = {
          status: isRecent ? (hb.status || 'active') : 'offline',
          current_task: hb.current_task,
          items_processed_today: hb.items_processed_today || 0,
          updated_at: hb.updated_at,
          tier: hb.tier,
        };
      }

      // Merge heartbeat data into dashboard agents
      if (dashAgents.length > 0) {
        const mergedAgents = dashAgents.map(agent => {
          const hb = heartbeatMap[agent.agent_name];
          if (hb) {
            return { ...agent, ...hb };
          }
          return agent;
        });
        for (const [name, hb] of Object.entries(heartbeatMap)) {
          if (!mergedAgents.some(a => a.agent_name === name)) {
            mergedAgents.push({ agent_name: name, ...hb });
          }
        }
        setAgents(mergedAgents);
      } else if (heartbeats.length > 0) {
        setAgents(Object.entries(heartbeatMap).map(([name, hb]) => ({
          agent_name: name, ...hb,
        })));
      }
    } catch (err) {
      console.error('[CouncilChat] Heartbeat fetch error:', err.message);
    }
  }, [token]);

  // -- Fetch directives --
  const fetchDirectives = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`${API_BASE}/api/ai/directives?status=active`, { headers });
      if (res.ok) {
        const data = await res.json();
        setDirectives(data);
      }
    } catch (err) {
      console.error('[CouncilChat] Directives fetch error:', err.message);
    }
  }, [token]);

  // -- Fetch initial data --
  const fetchData = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [msgsRes, logsRes] = await Promise.all([
        fetch(`${API_BASE}/api/council/messages?limit=100`, { headers }),
        fetch(`${API_BASE}/api/ai/logs?limit=100`, { headers }),
      ]);

      if (msgsRes.ok) {
        const msgs = await msgsRes.json();
        setMessages(msgs);
      }

      if (logsRes.ok) {
        const logData = await logsRes.json();
        setLogs(logData);
      }

      // Also fetch heartbeats and directives
      await Promise.all([fetchHeartbeats(), fetchDirectives()]);
    } catch (err) {
      console.error('[CouncilChat] Fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, [token, fetchHeartbeats, fetchDirectives]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // -- Socket.io connection --
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

    // Directive socket events
    sock.on('directive:new', (directive) => {
      setDirectives(prev => {
        if (prev.some(d => d.id === directive.id)) return prev;
        return [directive, ...prev];
      });
    });

    sock.on('directive:updated', (directive) => {
      setDirectives(prev => prev.map(d => d.id === directive.id ? directive : d));
    });

    sock.on('directive:acknowledged', ({ id, agent_name }) => {
      setDirectives(prev => prev.map(d => {
        if (d.id === id) {
          const acked = Array.isArray(d.acknowledged_by) ? d.acknowledged_by : [];
          if (!acked.includes(agent_name)) {
            return { ...d, acknowledged_by: [...acked, agent_name] };
          }
        }
        return d;
      }));
    });

    sock.connect();

    return () => {
      sock.emit('council:leave');
      sock.disconnect();
      socketRef.current = null;
    };
  }, [user?.user_id, token]);

  // -- Fullscreen keyboard shortcuts --
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Escape exits fullscreen (but does NOT close the detail view)
      if (e.key === 'Escape' && isFullscreen) {
        e.preventDefault();
        e.stopPropagation();
        setIsFullscreen(false);
        return;
      }
      // F key or F11 toggles fullscreen (only when not typing in an input)
      const tag = e.target.tagName.toLowerCase();
      if ((e.key === 'f' || e.key === 'F11') && tag !== 'input' && tag !== 'textarea' && tag !== 'select') {
        e.preventDefault();
        setIsFullscreen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isFullscreen]);

  // -- Auto-scroll --
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

  // -- Send message --
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
      console.error('[CouncilChat] Send error:', err.message);
    } finally {
      setSending(false);
    }
  };

  // -- Approve / Reject proposals --
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
      console.error('[CouncilChat] Approve error:', err.message);
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
      console.error('[CouncilChat] Reject error:', err.message);
    }
  };

  // -- Create directive --
  const handleCreateDirective = async ({ title, body, priority, scope }) => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/directive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title, body, priority, scope }),
      });
      if (res.ok) {
        setShowNewDirective(false);
        // Refresh directives
        fetchDirectives();
      }
    } catch (err) {
      console.error('[CouncilChat] Create directive error:', err.message);
    }
  };

  // -- Archive directive --
  const handleArchiveDirective = async (directiveId) => {
    try {
      await fetch(`${API_BASE}/api/ai/directive/${directiveId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'archived' }),
      });
      setDirectives(prev => prev.filter(d => d.id !== directiveId));
    } catch (err) {
      console.error('[CouncilChat] Archive directive error:', err.message);
    }
  };

  // -- Manual refresh heartbeats --
  const [refreshing, setRefreshing] = useState(false);
  const handleRefreshHeartbeats = async () => {
    setRefreshing(true);
    await fetchHeartbeats();
    setTimeout(() => setRefreshing(false), 500);
  };

  // -- Filtered logs --
  const filteredLogs = logFilter === 'all'
    ? logs
    : logs.filter(l => l.agent_name === logFilter || l.log_type === logFilter);

  const uniqueAgentNames = [...new Set(logs.map(l => l.agent_name).filter(Boolean))];

  // -- Default agents if none from API --
  const displayAgents = agents.length > 0 ? agents : [
    { agent_name: 'Houston Command', tier: 'T1', status: 'offline', current_task: null, updated_at: null },
    { agent_name: 'Houston (Sonnet)', tier: 'T1', status: 'active', current_task: 'CRM Backend', updated_at: new Date().toISOString() },
    { agent_name: 'Ralph', tier: 'T3', status: 'offline', current_task: null, updated_at: null },
  ];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-[var(--crm-muted)] text-sm">Loading Council...</div>
      </div>
    );
  }

  // Fullscreen wrapper classes
  const containerClasses = isFullscreen
    ? 'fixed inset-0 z-50 flex flex-col overflow-hidden bg-[var(--crm-bg)]'
    : 'h-full flex flex-col overflow-hidden bg-[var(--crm-bg)]';

  return (
    <div className={containerClasses}>
      {/* Agent Dashboard (top bar) */}
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
          <div className="flex items-center gap-3">
            {/* Directives toggle */}
            <button
              onClick={() => setShowDirectives(prev => !prev)}
              className={`p-1.5 rounded-lg transition-colors ${showDirectives ? 'bg-indigo-500/20 text-indigo-300' : 'text-[var(--crm-muted)] hover:text-[var(--crm-text)] hover:bg-white/5'}`}
              title="Toggle Directives"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
              </svg>
            </button>

            {/* Refresh heartbeats */}
            <button
              onClick={handleRefreshHeartbeats}
              disabled={refreshing}
              className="p-1.5 rounded-lg text-[var(--crm-muted)] hover:text-[var(--crm-text)] hover:bg-white/5 transition-colors disabled:opacity-40"
              title="Refresh agent status"
            >
              <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
              </svg>
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(prev => !prev)}
              className="p-1.5 rounded-lg text-[var(--crm-muted)] hover:text-[var(--crm-text)] hover:bg-white/5 transition-colors"
              title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen (F)'}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              )}
            </button>

            {/* Connection status */}
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
              <span className="text-xs text-[var(--crm-muted)]">{connected ? 'Live' : 'Disconnected'}</span>
            </div>
          </div>
        </div>

        {/* Agent cards row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {displayAgents.map(agent => (
            <AgentCard key={agent.agent_name} agent={agent} />
          ))}
        </div>
      </div>

      {/* Council Chat + Activity Log / Directives */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Council Chat (left section) */}
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
                placeholder={isAdmin ? "Message the Council as Admin..." : "View only \u2014 admin access required to post"}
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

        {/* Right sidebar: Activity Log or Directives */}
        <div className="w-80 xl:w-96 flex-shrink-0 flex flex-col overflow-hidden">
          {showDirectives ? (
            <>
              {/* Directives header */}
              <div className="flex-shrink-0 px-3 py-3 border-b border-[var(--crm-border)]">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-sm font-semibold text-[var(--crm-text)]">Directives</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--crm-muted)]">{directives.length} active</span>
                    {isAdmin && (
                      <button
                        onClick={() => setShowNewDirective(prev => !prev)}
                        className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors"
                      >
                        + New
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* New directive form */}
              {showNewDirective && isAdmin && (
                <NewDirectiveForm
                  onSubmit={handleCreateDirective}
                  onCancel={() => setShowNewDirective(false)}
                />
              )}

              {/* Directive list */}
              <div
                className="flex-1 overflow-y-auto"
                style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--crm-scroll-thumb) var(--crm-scroll-track)' }}
              >
                {directives.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[var(--crm-muted)]">
                    No active directives. Issue orders to the agent fleet from here.
                  </div>
                ) : (
                  directives.map(d => (
                    <DirectiveCard
                      key={d.id}
                      directive={d}
                      isAdmin={isAdmin}
                      onArchive={handleArchiveDirective}
                    />
                  ))
                )}
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
