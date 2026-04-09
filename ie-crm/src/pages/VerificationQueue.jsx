import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/shared/Toast';

const API = import.meta.env.VITE_API_URL || '';

function authHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

const STATUS_COLORS = {
  pending: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
  accepted: 'bg-green-500/15 text-green-400 border border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

const ENTITY_BADGES = {
  contact: { label: 'Contact', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  property: { label: 'Property', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  company: { label: 'Company', cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  deal: { label: 'Deal', cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
};

function confidenceColor(val) {
  if (val >= 90) return 'text-green-400';
  if (val >= 70) return 'text-yellow-400';
  if (val >= 50) return 'text-orange-400';
  return 'text-red-400';
}

function confidenceBarColor(val) {
  if (val >= 90) return 'bg-green-500';
  if (val >= 70) return 'bg-yellow-500';
  if (val >= 50) return 'bg-orange-500';
  return 'bg-red-500';
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Suggestion Card ─────────────────────────────────────────
function SuggestionCard({ item, onReview }) {
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(item.suggested_value);
  const isPending = item.status === 'pending';
  const badge = ENTITY_BADGES[item.entity_type] || { label: item.entity_type, cls: 'bg-crm-hover text-crm-muted' };

  const handleApproveClick = () => {
    setEditValue(item.suggested_value);
    setEditing(true);
  };

  const handleConfirm = async () => {
    setReviewing(true);
    await onReview(item.id, 'accepted', editValue);
    setReviewing(false);
    setEditing(false);
  };

  const handleReject = async () => {
    setReviewing(true);
    await onReview(item.id, 'rejected');
    setReviewing(false);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditValue(item.suggested_value);
  };

  const wasEdited = item.updated_data?.applied_value && item.updated_data.applied_value !== item.updated_data.original_suggestion;

  return (
    <div className={`rounded-xl border transition-all duration-200 px-4 py-3 ${
      editing ? 'border-crm-accent/40 bg-crm-card shadow-lg' : 'border-crm-border/50 bg-crm-card/60 hover:bg-crm-card hover:border-crm-border'
    }`}>
      <div className="flex items-center gap-3">
        {/* Entity type badge */}
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${badge.cls}`}>
          {badge.label}
        </span>

        {/* Entity name + field */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-crm-text font-medium truncate">{item.entity_name || 'Unknown'}</span>
            <span className="text-crm-muted text-xs">›</span>
            <span className="text-crm-muted text-xs truncate">{item.field_label || item.field_name}</span>
          </div>

          {/* Current → Suggested */}
          <div className="flex items-center gap-2 mt-1">
            {item.current_value ? (
              <span className="text-crm-muted text-xs font-mono line-through truncate max-w-[200px]">{item.current_value}</span>
            ) : (
              <span className="text-crm-muted/50 text-xs italic">(empty)</span>
            )}
            <svg className="w-3 h-3 text-crm-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="text-green-400 text-xs font-mono font-medium truncate">{item.suggested_value}</span>
            {/* Show applied value if it was edited */}
            {wasEdited && (
              <>
                <svg className="w-3 h-3 text-purple-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
                <span className="text-purple-400 text-xs font-mono font-medium truncate">{item.updated_data.applied_value}</span>
                <span className="text-[10px] text-purple-400/60 italic">(edited)</span>
              </>
            )}
          </div>
        </div>

        {/* Confidence */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-crm-hover overflow-hidden">
            <div className={`h-full rounded-full ${confidenceBarColor(item.confidence)}`} style={{ width: `${item.confidence}%` }} />
          </div>
          <span className={`text-xs font-medium tabular-nums ${confidenceColor(item.confidence)}`}>{item.confidence}%</span>
        </div>

        {/* Source */}
        <div className="flex-shrink-0 text-right min-w-[100px]">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-crm-hover text-crm-muted">{item.source || item.agent_name}</span>
          {item.source_detail && (
            <p className="text-[10px] text-crm-muted/60 mt-0.5 truncate">{item.source_detail}</p>
          )}
        </div>

        {/* Status / Actions */}
        {isPending && !editing ? (
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            <button
              onClick={handleApproveClick}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors text-xs font-medium"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Approve
            </button>
            <button
              onClick={handleReject}
              disabled={reviewing}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors text-xs font-medium disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reject
            </button>
          </div>
        ) : !isPending ? (
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[item.status] || 'bg-crm-hover text-crm-muted'}`}>
              {item.status}
            </span>
            <span className="text-[10px] text-crm-muted">{formatTimeAgo(item.reviewed_at || item.created_at)}</span>
          </div>
        ) : null}

        {/* Time */}
        {isPending && !editing && (
          <span className="text-crm-muted text-[10px] flex-shrink-0 w-14 text-right">{formatTimeAgo(item.created_at)}</span>
        )}
      </div>

      {/* Inline edit row — appears when Approve is clicked */}
      {editing && (
        <div className="mt-3 pt-3 border-t border-crm-border/30 flex items-center gap-3">
          <span className="text-crm-muted text-xs flex-shrink-0 w-24 text-right">{item.field_label || item.field_name}:</span>
          <input
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') handleCancel();
            }}
            className="flex-1 bg-crm-bg border border-crm-accent/40 rounded-lg px-3 py-1.5 text-sm text-crm-text font-mono focus:outline-none focus:border-crm-accent focus:ring-1 focus:ring-crm-accent/30"
          />
          {editValue !== item.suggested_value && (
            <span className="text-[10px] text-purple-400 flex-shrink-0 italic">edited</span>
          )}
          <button
            onClick={handleConfirm}
            disabled={reviewing || !editValue.trim()}
            className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors text-xs font-medium disabled:opacity-50"
          >
            {reviewing ? (
              <div className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            Confirm
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 rounded-lg bg-crm-hover text-crm-muted hover:text-crm-text transition-colors text-xs"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────
export default function VerificationQueue({ onCountChange }) {
  const [items, setItems] = useState([]);
  const [statusCounts, setStatusCounts] = useState({});
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const { addToast } = useToast();

  const fetchSuggestions = useCallback(async () => {
    try {
      const statusParam = activeTab === 'all' ? '' : `status=${activeTab}&`;
      const res = await fetch(`${API}/api/ai/suggested-updates?${statusParam}limit=50`, { headers: authHeaders() });
      if (res.ok) {
        const data = await res.json();
        setItems(data.suggestions || []);
        setStatusCounts(data.status_counts || {});
        if (onCountChange) onCountChange(data.suggestions?.length || 0);
      }
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, onCountChange]);

  useEffect(() => {
    setLoading(true);
    setSelectedIds(new Set());
    fetchSuggestions();
  }, [fetchSuggestions]);

  const handleReview = async (id, status, appliedValue) => {
    try {
      const body = { status };
      // If accepting with a (possibly edited) value, send it
      if (status === 'accepted' && appliedValue !== undefined) {
        body.applied_value = appliedValue;
      }
      const res = await fetch(`${API}/api/ai/suggested-updates/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(status === 'accepted' ? 'Confirmed — value written to record' : 'Rejected', 'success');
        fetchSuggestions();
      } else {
        addToast(data.error || 'Failed to review', 'error');
      }
    } catch {
      addToast('Network error', 'error');
    }
  };

  const handleBatchReview = async (status) => {
    if (selectedIds.size === 0) return;
    try {
      const res = await fetch(`${API}/api/ai/suggested-updates/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ids: [...selectedIds], status }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(`${data.processed || selectedIds.size} items ${status}`, 'success');
        setSelectedIds(new Set());
        fetchSuggestions();
      } else {
        addToast(data.error || 'Batch failed', 'error');
      }
    } catch {
      addToast('Network error', 'error');
    }
  };

  const handleAcceptAll = async () => {
    const pendingIds = items.filter(i => i.status === 'pending').map(i => i.id);
    if (pendingIds.length === 0) return;
    try {
      const res = await fetch(`${API}/api/ai/suggested-updates/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ids: pendingIds, status: 'accepted' }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(`${data.processed || pendingIds.length} suggestions approved`, 'success');
        fetchSuggestions();
      } else {
        addToast(data.error || 'Batch failed', 'error');
      }
    } catch {
      addToast('Network error', 'error');
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const pendingCount = statusCounts.pending || 0;
  const acceptedCount = statusCounts.accepted || 0;
  const rejectedCount = statusCounts.rejected || 0;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-crm-text">Suggested Updates</h1>
            <p className="text-crm-muted text-sm mt-0.5">
              Review AI-enriched data before it's written to your records
            </p>
          </div>

          {/* Stats badges */}
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                <span className="text-yellow-400 text-sm font-medium">{pendingCount} pending</span>
              </div>
            )}
            {acceptedCount > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-crm-hover">
                <span className="text-crm-muted text-xs">Accepted: </span>
                <span className="text-green-400 text-sm font-medium">{acceptedCount}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tabs + batch actions */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 p-1 bg-crm-bg/50 rounded-lg border border-crm-border/30 w-fit">
            {STATUS_TABS.map((tab) => {
              const count = tab.key === 'all' ? null : statusCounts[tab.key];
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-all flex items-center gap-1.5 ${
                    activeTab === tab.key
                      ? 'bg-crm-accent text-white shadow-sm'
                      : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
                  }`}
                >
                  {tab.label}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      activeTab === tab.key ? 'bg-white/20' : 'bg-crm-hover'
                    }`}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Batch actions */}
          {activeTab === 'pending' && items.length > 0 && (
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <>
                  <button
                    onClick={() => handleBatchReview('accepted')}
                    className="px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors text-xs font-medium"
                  >
                    Approve Selected ({selectedIds.size})
                  </button>
                  <button
                    onClick={() => handleBatchReview('rejected')}
                    className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors text-xs font-medium"
                  >
                    Reject Selected
                  </button>
                </>
              )}
              <button
                onClick={handleAcceptAll}
                className="px-3 py-1.5 rounded-lg bg-crm-hover text-crm-muted hover:text-crm-text transition-colors text-xs"
              >
                Accept All ({items.filter(i => i.status === 'pending').length})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* List */}
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
              {activeTab === 'pending' ? 'No pending suggestions' : `No ${activeTab} items`}
            </p>
            <p className="text-xs text-crm-muted">AI enrichment suggestions will appear here for review.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select-all checkbox for pending tab */}
            {activeTab === 'pending' && items.length > 1 && (
              <label className="flex items-center gap-2 px-4 py-2 text-xs text-crm-muted cursor-pointer hover:text-crm-text">
                <input
                  type="checkbox"
                  checked={selectedIds.size === items.filter(i => i.status === 'pending').length && selectedIds.size > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(items.filter(i => i.status === 'pending').map(i => i.id)));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  className="rounded border-crm-border text-crm-accent focus:ring-crm-accent/30"
                />
                Select all
              </label>
            )}

            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                {activeTab === 'pending' && item.status === 'pending' && (
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="rounded border-crm-border text-crm-accent focus:ring-crm-accent/30 flex-shrink-0"
                  />
                )}
                <div className="flex-1">
                  <SuggestionCard item={item} onReview={handleReview} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
