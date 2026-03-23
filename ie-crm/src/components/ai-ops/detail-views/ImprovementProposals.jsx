import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const STATUS_TABS = [
  { key: 'pending',     label: 'Pending',      emoji: '⏳' },
  { key: 'accepted',    label: 'Accepted',      emoji: '✅' },
  { key: 'implemented', label: 'Implemented',   emoji: '🚀' },
  { key: 'rejected',    label: 'Rejected',      emoji: '❌' },
  { key: 'needs_david', label: 'Needs Approval', emoji: '👤' },
];

const CATEGORY_LABELS = {
  threshold_adjustment:   { label: 'Threshold',   color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  instruction_update:     { label: 'Instructions', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  template_improvement:   { label: 'Template',     color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  new_validation_rule:    { label: 'Validation',   color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  performance_alert:      { label: 'Performance',  color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  workflow_optimization:  { label: 'Workflow',      color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  system_gap:             { label: 'Gap',           color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  new_cadence:            { label: 'Cadence',       color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
  skill_creation:         { label: 'Skill',         color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
};

const CONFIDENCE_COLORS = {
  high:   'text-emerald-400',
  medium: 'text-amber-400',
  low:    'text-red-400',
};

const EFFORT_LABELS = {
  low:    { label: 'Low effort', color: 'text-emerald-400' },
  medium: { label: 'Med effort', color: 'text-amber-400' },
  high:   { label: 'High effort', color: 'text-red-400' },
};

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function getToken() {
  return localStorage.getItem('crm-auth-token');
}

export default function ImprovementProposals() {
  const [activeTab, setActiveTab] = useState('pending');
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [actionPending, setActionPending] = useState({});
  const [counts, setCounts] = useState({});

  // Fetch proposals for current tab
  const fetchProposals = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${API_BASE}/api/ai/proposals?status=${activeTab}&limit=50`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setProposals(data.proposals || []);
    } catch {
      setProposals([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  // Fetch counts for all tabs
  const fetchCounts = useCallback(async () => {
    try {
      const token = getToken();
      const results = {};
      await Promise.all(
        STATUS_TABS.map(async (tab) => {
          const res = await fetch(
            `${API_BASE}/api/ai/proposals?status=${tab.key}&limit=1`,
            { headers: token ? { Authorization: `Bearer ${token}` } : {} }
          );
          if (res.ok) {
            const data = await res.json();
            results[tab.key] = data.count || 0;
          }
        })
      );
      setCounts(results);
    } catch {
      // Silently fail — counts are cosmetic
    }
  }, []);

  useEffect(() => { fetchProposals(); }, [fetchProposals]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  // Handle accept / reject / needs_david actions
  const handleAction = async (id, status, notes = '') => {
    setActionPending((prev) => ({ ...prev, [id]: status }));
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/ai/proposals/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status, review_notes: notes }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optimistic: remove from current list
      setProposals((prev) => prev.filter((p) => p.id !== id));
      // Update counts
      setCounts((prev) => ({
        ...prev,
        [activeTab]: Math.max(0, (prev[activeTab] || 0) - 1),
        [status]: (prev[status] || 0) + 1,
      }));
    } catch {
      // Could add error toast here
    } finally {
      setActionPending((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-crm-border">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">💡</span>
          <h2 className="text-xl font-semibold text-crm-text">Improvement Proposals</h2>
        </div>
        <p className="text-sm text-crm-muted ml-9">
          Ideas from Ralph GPT, Gemini, and Houston Command to improve the agent system
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 py-3 border-b border-crm-border overflow-x-auto">
        {STATUS_TABS.map((tab) => {
          const count = counts[tab.key] || 0;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                transition-all whitespace-nowrap
                ${isActive
                  ? 'bg-crm-accent/20 text-crm-accent border border-crm-accent/30'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover border border-transparent'
                }
              `}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              {count > 0 && (
                <span className={`
                  ml-1 px-1.5 py-0.5 rounded-full text-xs
                  ${isActive ? 'bg-crm-accent/30 text-crm-accent' : 'bg-crm-hover text-crm-muted'}
                `}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Proposals List */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-crm-accent/30 border-t-crm-accent rounded-full animate-spin" />
          </div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-16 text-crm-muted">
            <span className="text-4xl mb-3 block">
              {activeTab === 'pending' ? '🎉' : '📭'}
            </span>
            <p className="text-sm">
              {activeTab === 'pending'
                ? 'No pending proposals — system is running smooth'
                : `No ${activeTab} proposals yet`}
            </p>
          </div>
        ) : (
          proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onAction={handleAction}
              isPending={!!actionPending[p.id]}
              showActions={activeTab === 'pending' || activeTab === 'needs_david'}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Individual Proposal Card
// ─────────────────────────────────────────────────
function ProposalCard({ proposal: p, expanded, onToggle, onAction, isPending, showActions }) {
  const cat = CATEGORY_LABELS[p.category] || { label: p.category, color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' };
  const conf = CONFIDENCE_COLORS[p.confidence] || 'text-crm-muted';
  const effort = EFFORT_LABELS[p.effort_level] || EFFORT_LABELS.medium;

  let evidence = null;
  try {
    evidence = typeof p.evidence === 'string' ? JSON.parse(p.evidence) : p.evidence;
  } catch { /* ignore */ }

  return (
    <div className={`
      rounded-xl border transition-all
      ${expanded
        ? 'bg-crm-card/80 border-crm-accent/30 shadow-lg shadow-crm-accent/5'
        : 'bg-crm-card/50 border-crm-border hover:border-crm-accent/20'
      }
    `}>
      {/* Collapsed Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-start gap-3 text-left"
      >
        {/* Source Agent Avatar */}
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-crm-hover flex items-center justify-center text-xs font-bold text-crm-muted mt-0.5">
          {(p.source_agent || '?').slice(0, 2).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row: category + about agent + confidence + effort */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${cat.color}`}>
              {cat.label}
            </span>
            {p.about_agent && (
              <span className="text-xs text-crm-muted">
                re: <span className="text-crm-text font-medium">{p.about_agent}</span>
              </span>
            )}
            <span className={`text-xs ${conf}`}>
              {p.confidence} confidence
            </span>
            <span className={`text-xs ${effort.color}`}>
              {effort.label}
            </span>
          </div>

          {/* Proposal text (truncated when collapsed) */}
          <p className={`text-sm text-crm-text ${expanded ? '' : 'line-clamp-2'}`}>
            {p.proposal}
          </p>

          {/* Meta row */}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-crm-muted">
            <span>from {p.source_agent || 'unknown'}</span>
            <span>{formatDate(p.created_at)}</span>
            {p.reviewed_by && (
              <span>reviewed by {p.reviewed_by}</span>
            )}
          </div>
        </div>

        {/* Expand indicator */}
        <svg
          className={`w-4 h-4 text-crm-muted flex-shrink-0 mt-1 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-crm-border/50 space-y-4">
          {/* Observation */}
          {p.observation && (
            <div>
              <h4 className="text-xs font-semibold text-crm-muted uppercase tracking-wide mb-1">Observation</h4>
              <p className="text-sm text-crm-text/80 leading-relaxed">{p.observation}</p>
            </div>
          )}

          {/* Expected Impact */}
          {p.expected_impact && (
            <div>
              <h4 className="text-xs font-semibold text-crm-muted uppercase tracking-wide mb-1">Expected Impact</h4>
              <p className="text-sm text-crm-text/80 leading-relaxed">{p.expected_impact}</p>
            </div>
          )}

          {/* Evidence */}
          {evidence && Object.keys(evidence).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-crm-muted uppercase tracking-wide mb-1">Evidence</h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(evidence).map(([key, val]) => (
                  <div key={key} className="bg-crm-hover/50 rounded-lg px-3 py-2">
                    <div className="text-xs text-crm-muted">{key.replace(/_/g, ' ')}</div>
                    <div className="text-sm font-medium text-crm-text">{String(val)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review Notes (if already reviewed) */}
          {p.review_notes && (
            <div>
              <h4 className="text-xs font-semibold text-crm-muted uppercase tracking-wide mb-1">Review Notes</h4>
              <p className="text-sm text-crm-text/80 italic">{p.review_notes}</p>
            </div>
          )}

          {/* Implementation Notes */}
          {p.implementation_notes && (
            <div>
              <h4 className="text-xs font-semibold text-crm-muted uppercase tracking-wide mb-1">Implementation Notes</h4>
              <p className="text-sm text-crm-text/80">{p.implementation_notes}</p>
            </div>
          )}

          {/* Action Buttons (only for pending / needs_david) */}
          {showActions && (
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => onAction(p.id, 'accepted')}
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30
                  hover:bg-emerald-500/30 transition-all text-sm font-medium disabled:opacity-50"
              >
                ✅ Accept
              </button>
              <button
                onClick={() => onAction(p.id, 'rejected')}
                disabled={isPending}
                className="px-4 py-2 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30
                  hover:bg-red-500/30 transition-all text-sm font-medium disabled:opacity-50"
              >
                ❌ Reject
              </button>
              {activeTab === 'pending' && (
                <button
                  onClick={() => onAction(p.id, 'needs_david')}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30
                    hover:bg-amber-500/30 transition-all text-sm font-medium disabled:opacity-50"
                >
                  👤 Needs David
                </button>
              )}
              {isPending && (
                <div className="w-4 h-4 border-2 border-crm-accent/30 border-t-crm-accent rounded-full animate-spin ml-2" />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
