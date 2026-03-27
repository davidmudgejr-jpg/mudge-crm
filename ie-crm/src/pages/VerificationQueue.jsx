import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/shared/Toast';
import { formatDatePacific } from '../utils/timezone';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function authHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const STATUS_COLORS = {
  pending: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  in_progress: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  confirmed: 'bg-green-500/15 text-green-400 border border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border border-red-500/30',
  updated: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  not_found: 'bg-gray-500/15 text-gray-400 border border-gray-500/30',
  expired: 'bg-gray-500/10 text-gray-500 border border-gray-500/20',
};

const PRIORITY_COLORS = {
  urgent: 'text-red-400',
  high: 'text-orange-400',
  normal: 'text-crm-muted',
  low: 'text-gray-500',
};

const TYPE_LABELS = {
  verify_email: 'Verify Email',
  verify_phone: 'Verify Phone',
  verify_identity: 'Verify Identity',
  check_zoominfo: 'Check ZoomInfo',
  confirm_decision_maker: 'Decision Maker',
  verify_address: 'Verify Address',
  other: 'Other',
};

function VerificationCard({ item, onResolve, onViewStart }) {
  const [expanded, setExpanded] = useState(false);
  const [response, setResponse] = useState('');
  const [updatedEmail, setUpdatedEmail] = useState('');
  const [updatedPhone, setUpdatedPhone] = useState('');
  const [updatedName, setUpdatedName] = useState('');
  const [resolving, setResolving] = useState(false);

  const isPending = item.status === 'pending' || item.status === 'in_progress';
  const suggested = item.suggested_data || {};
  const trail = item.research_trail || {};

  const handleExpand = () => {
    if (!expanded && item.status === 'pending') {
      onViewStart(item.id);
    }
    setExpanded(!expanded);
  };

  const handleResolve = async (status) => {
    setResolving(true);
    let updated_data = null;
    if (status === 'updated') {
      updated_data = { ...suggested };
      if (updatedEmail) updated_data.email = updatedEmail;
      if (updatedPhone) updated_data.phone = updatedPhone;
      if (updatedName) updated_data.name = updatedName;
    }
    await onResolve(item.id, status, response, updated_data);
    setResolving(false);
    setExpanded(false);
  };

  return (
    <div className={`rounded-xl border transition-all duration-200 ${
      expanded ? 'border-crm-accent/40 bg-crm-card shadow-lg' : 'border-crm-border/50 bg-crm-card/60 hover:bg-crm-card hover:border-crm-border'
    }`}>
      {/* Header row — always visible */}
      <button
        onClick={handleExpand}
        className="w-full text-left px-4 py-3 flex items-center gap-3"
      >
        {/* Priority dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          item.priority === 'urgent' ? 'bg-red-500 animate-pulse' :
          item.priority === 'high' ? 'bg-orange-400' :
          item.priority === 'normal' ? 'bg-crm-muted' : 'bg-gray-600'
        }`} />

        {/* Contact info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-crm-text font-medium truncate">
              {item.contact_name || item.contact_first_name || 'Unknown Contact'}
            </span>
            {item.company_name && (
              <span className="text-crm-muted text-xs truncate">@ {item.company_name}</span>
            )}
          </div>
          <p className="text-crm-muted text-xs truncate mt-0.5">{item.request_details}</p>
        </div>

        {/* Type badge */}
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-crm-hover text-crm-muted flex-shrink-0">
          {TYPE_LABELS[item.request_type] || item.request_type}
        </span>

        {/* Status badge */}
        <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[item.status]}`}>
          {item.status.replace('_', ' ')}
        </span>

        {/* Time ago */}
        <span className="text-crm-muted text-[10px] flex-shrink-0 w-16 text-right">
          {formatTimeAgo(item.created_at)}
        </span>

        {/* Chevron */}
        <svg className={`w-4 h-4 text-crm-muted transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-crm-border/30">
          {/* Suggested data */}
          {suggested && Object.keys(suggested).length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-crm-bg/50 border border-crm-border/30">
              <p className="text-[10px] text-crm-muted uppercase tracking-wider mb-2">Our Suggestion</p>
              <div className="grid grid-cols-2 gap-2">
                {suggested.email && (
                  <div>
                    <span className="text-crm-muted text-xs">Email: </span>
                    <span className="text-crm-text text-xs font-mono">{suggested.email}</span>
                  </div>
                )}
                {suggested.phone && (
                  <div>
                    <span className="text-crm-muted text-xs">Phone: </span>
                    <span className="text-crm-text text-xs font-mono">{suggested.phone}</span>
                  </div>
                )}
                {suggested.name && (
                  <div>
                    <span className="text-crm-muted text-xs">Name: </span>
                    <span className="text-crm-text text-xs">{suggested.name}</span>
                  </div>
                )}
                {suggested.position && (
                  <div>
                    <span className="text-crm-muted text-xs">Position: </span>
                    <span className="text-crm-text text-xs">{suggested.position}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Research Trail — everything Ralph already found */}
          {trail && Object.keys(trail).length > 0 && (
            <div className="mt-3 p-3 rounded-lg bg-crm-bg/50 border border-crm-border/30">
              <p className="text-[10px] text-crm-muted uppercase tracking-wider mb-2">Research Trail — What Ralph Found</p>
              <div className="space-y-2">
                {trail.google_maps && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 flex-shrink-0 mt-0.5">Maps</span>
                    <div className="text-xs text-crm-text">
                      {trail.google_maps.business && <span className="font-medium">{trail.google_maps.business}</span>}
                      {trail.google_maps.website && <span className="text-crm-muted ml-2">→ {trail.google_maps.website}</span>}
                      {trail.google_maps.phone && <span className="text-crm-muted ml-2">📞 {trail.google_maps.phone}</span>}
                    </div>
                  </div>
                )}
                {trail.ca_sos && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 flex-shrink-0 mt-0.5">SOS</span>
                    <div className="text-xs text-crm-text">
                      {trail.ca_sos.entity && <span className="font-medium">{trail.ca_sos.entity}</span>}
                      {trail.ca_sos.agent && <span className="text-crm-muted ml-2">Agent: {trail.ca_sos.agent}</span>}
                      {trail.ca_sos.status && <span className={`ml-2 ${trail.ca_sos.status === 'Active' ? 'text-green-400' : 'text-red-400'}`}>{trail.ca_sos.status}</span>}
                    </div>
                  </div>
                )}
                {trail.hunter_io && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 flex-shrink-0 mt-0.5">Hunter</span>
                    <div className="text-xs text-crm-text">
                      {trail.hunter_io.emails_found != null && <span>{trail.hunter_io.emails_found} emails found</span>}
                      {trail.hunter_io.pattern && <span className="text-crm-muted ml-2">Pattern: <code className="font-mono text-[11px]">{trail.hunter_io.pattern}</code></span>}
                      {trail.hunter_io.top_emails && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {trail.hunter_io.top_emails.map((em, i) => (
                            <span key={i} className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-crm-hover">{em}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {trail.whitepages && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 flex-shrink-0 mt-0.5">WP</span>
                    <div className="text-xs text-crm-text">
                      {trail.whitepages.profiles_checked != null && <span>{trail.whitepages.profiles_checked} profiles checked</span>}
                      {trail.whitepages.best_match && <span className="text-crm-muted ml-2">— {trail.whitepages.best_match}</span>}
                    </div>
                  </div>
                )}
                {trail.beenverified && (
                  <div className="flex items-start gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 flex-shrink-0 mt-0.5">BV</span>
                    <div className="text-xs text-crm-text">
                      {trail.beenverified.profiles_checked != null && <span>{trail.beenverified.profiles_checked} profiles checked</span>}
                      {trail.beenverified.confirmed_email && <span className="text-crm-muted ml-2">Confirmed: <code className="font-mono text-[11px]">{trail.beenverified.confirmed_email}</code></span>}
                    </div>
                  </div>
                )}
                {trail.confidence_summary && (
                  <div className="mt-2 p-2 rounded bg-yellow-500/5 border border-yellow-500/10">
                    <p className="text-xs text-yellow-400/80 italic">{trail.confidence_summary}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Context */}
          <div className="mt-3 flex items-center gap-4 text-xs text-crm-muted">
            <span>Requested by: <span className="text-crm-text">{item.requested_by}</span></span>
            <span>Contact type: <span className="text-crm-text">{item.contact_type || '—'}</span></span>
            {item.current_email && <span>Current email: <span className="text-crm-text font-mono">{item.current_email}</span></span>}
            {item.confidence_before && <span>Confidence: <span className="text-crm-text">{item.confidence_before}</span></span>}
          </div>

          {/* Action buttons — only for pending/in_progress */}
          {isPending && (
            <div className="mt-4 space-y-3">
              {/* Notes field */}
              <textarea
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Notes (optional) — what did you find?"
                className="w-full bg-crm-bg border border-crm-border/50 rounded-lg px-3 py-2 text-sm text-crm-text placeholder-crm-muted/50 focus:outline-none focus:border-crm-accent/50 resize-none"
                rows={2}
              />

              {/* Update fields (shown inline) */}
              <details className="group">
                <summary className="text-xs text-crm-accent cursor-pointer hover:underline">
                  Need to update info? Click here
                </summary>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <input
                    value={updatedEmail}
                    onChange={(e) => setUpdatedEmail(e.target.value)}
                    placeholder="Corrected email"
                    className="bg-crm-bg border border-crm-border/50 rounded-lg px-3 py-1.5 text-sm text-crm-text placeholder-crm-muted/50 focus:outline-none focus:border-crm-accent/50"
                  />
                  <input
                    value={updatedPhone}
                    onChange={(e) => setUpdatedPhone(e.target.value)}
                    placeholder="Corrected phone"
                    className="bg-crm-bg border border-crm-border/50 rounded-lg px-3 py-1.5 text-sm text-crm-text placeholder-crm-muted/50 focus:outline-none focus:border-crm-accent/50"
                  />
                  <input
                    value={updatedName}
                    onChange={(e) => setUpdatedName(e.target.value)}
                    placeholder="Corrected name"
                    className="bg-crm-bg border border-crm-border/50 rounded-lg px-3 py-1.5 text-sm text-crm-text placeholder-crm-muted/50 focus:outline-none focus:border-crm-accent/50"
                  />
                </div>
              </details>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleResolve('confirmed')}
                  disabled={resolving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm
                </button>
                <button
                  onClick={() => handleResolve('rejected')}
                  disabled={resolving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors text-sm font-medium disabled:opacity-50"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Reject
                </button>
                {(updatedEmail || updatedPhone || updatedName) && (
                  <button
                    onClick={() => handleResolve('updated')}
                    disabled={resolving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-500/15 text-purple-400 border border-purple-500/30 hover:bg-purple-500/25 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Update & Confirm
                  </button>
                )}
                <button
                  onClick={() => handleResolve('not_found')}
                  disabled={resolving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-crm-hover text-crm-muted hover:text-crm-text transition-colors text-sm disabled:opacity-50"
                >
                  Not Found
                </button>
              </div>
            </div>
          )}

          {/* Resolved state */}
          {!isPending && item.resolved_at && (
            <div className="mt-3 p-3 rounded-lg bg-crm-bg/30 border border-crm-border/20">
              <div className="flex items-center gap-3 text-xs text-crm-muted">
                <span>Resolved: {formatDatePacific(item.resolved_at)}</span>
                {item.resolution_time_seconds && (
                  <span>Time: {formatDuration(item.resolution_time_seconds)}</span>
                )}
                {item.confidence_after && (
                  <span>Confidence → <span className="text-green-400">{item.confidence_after}</span></span>
                )}
              </div>
              {item.david_response && (
                <p className="text-crm-text text-sm mt-1">{item.david_response}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export default function VerificationQueue() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  const fetchQueue = useCallback(async () => {
    try {
      const statusParam = activeTab === 'all'
        ? 'pending,in_progress,confirmed,rejected,updated,not_found,expired'
        : activeTab;
      const res = await fetch(`${API}/api/verification/queue?status=${statusParam}&limit=50`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setItems(data.verifications || []);
      }
    } catch (err) {
      console.error('Failed to fetch verification queue:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/verification/stats?days=30`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setStats(data.overall);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchQueue();
  }, [fetchQueue]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleViewStart = async (id) => {
    try {
      // Mark as in_progress when David opens it (via viewed_at)
      await fetch(`${API}/api/verification/queue`, { method: 'GET' }); // just refresh
    } catch { /* silent */ }
  };

  const handleResolve = async (verificationId, status, davidResponse, updatedData) => {
    try {
      const res = await fetch(`${API}/api/verification/resolve`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          verification_id: verificationId,
          status,
          david_response: davidResponse || null,
          updated_data: updatedData || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message || 'Resolved', 'success');
        fetchQueue();
        fetchStats();
      } else {
        addToast(data.error || 'Failed to resolve', 'error');
      }
    } catch (err) {
      addToast('Network error', 'error');
    }
  };

  const pendingCount = stats?.pending || 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-crm-text">Verification Queue</h1>
            <p className="text-crm-muted text-sm mt-0.5">
              Review AI-enriched contacts that need manual verification
            </p>
          </div>

          {/* Stats badges */}
          {stats && (
            <div className="flex items-center gap-3">
              {pendingCount > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                  <span className="text-yellow-400 text-sm font-medium">{pendingCount} pending</span>
                </div>
              )}
              {stats.confirmation_rate_pct && (
                <div className="px-3 py-1.5 rounded-lg bg-crm-hover">
                  <span className="text-crm-muted text-xs">Accuracy: </span>
                  <span className={`text-sm font-medium ${
                    parseFloat(stats.confirmation_rate_pct) >= 80 ? 'text-green-400' :
                    parseFloat(stats.confirmation_rate_pct) >= 60 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{stats.confirmation_rate_pct}%</span>
                </div>
              )}
              {stats.confirmed && (
                <div className="px-3 py-1.5 rounded-lg bg-crm-hover">
                  <span className="text-crm-muted text-xs">Confirmed: </span>
                  <span className="text-green-400 text-sm font-medium">{stats.confirmed}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-crm-bg/50 rounded-lg border border-crm-border/30 w-fit">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                activeTab === tab.key
                  ? 'bg-crm-accent text-white shadow-sm'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Queue list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-crm-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-crm-accent/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-crm-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-crm-text">
              {activeTab === 'pending' ? 'No pending verifications' : `No ${activeTab} items`}
            </p>
            <p className="text-xs text-crm-muted">When Houston or Ralph flag contacts for review, they'll appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <VerificationCard
                key={item.id}
                item={item}
                onResolve={handleResolve}
                onViewStart={handleViewStart}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
