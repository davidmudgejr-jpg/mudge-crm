import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function authHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

const TYPE_COLORS = {
  contact: '#3B82F6',
  company: '#10B981',
  property: '#F59E0B',
  deal: '#8B5CF6',
  market: '#6B7280',
  decision: '#EF4444',
};

function Badge({ label, color }) {
  return (
    <span
      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{ backgroundColor: color + '22', color }}
    >
      {label}
    </span>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function InboxPanel({ isOpen, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedSlug, setExpandedSlug] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [mergeTargets, setMergeTargets] = useState({});

  const fetchInbox = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/inbox`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Inbox fetch failed: ${res.status}`);
      const data = await res.json();
      setItems(data.items || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchInbox();
  }, [isOpen, fetchInbox]);

  const handleMerge = useCallback(
    async (slug) => {
      const mergeTarget = mergeTargets[slug];
      if (!mergeTarget) return;
      setActionLoading(slug);
      try {
        const res = await fetch(`${API_BASE}/api/knowledge/node/${slug}`, {
          method: 'PATCH',
          headers: authHeaders(),
          body: JSON.stringify({ merge_target_slug: mergeTarget }),
        });
        if (!res.ok) throw new Error('Merge failed');
        // Remove from list after successful action
        setItems((prev) => prev.filter((it) => it.slug !== slug));
        setExpandedSlug(null);
      } catch {
        // Could add error toast here
      } finally {
        setActionLoading(null);
      }
    },
    [mergeTargets]
  );

  const handleReject = useCallback(async (slug) => {
    setActionLoading(slug);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/node/${slug}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status: 'archive' }),
      });
      if (!res.ok) throw new Error('Reject failed');
      setItems((prev) => prev.filter((it) => it.slug !== slug));
      setExpandedSlug(null);
    } catch {
      // Could add error toast here
    } finally {
      setActionLoading(null);
    }
  }, []);

  const handleFlag = useCallback(async (slug) => {
    setActionLoading(slug);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/node/${slug}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ status: 'pending-review', tags: ['flagged-for-david'] }),
      });
      if (!res.ok) throw new Error('Flag failed');
      // Keep in list but show flagged state
      setItems((prev) =>
        prev.map((it) =>
          it.slug === slug ? { ...it, tags: ['flagged-for-david'] } : it
        )
      );
      setExpandedSlug(null);
    } catch {
      // Could add error toast here
    } finally {
      setActionLoading(null);
    }
  }, []);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 bottom-0 w-[450px] z-50 bg-crm-card border-l border-crm-border flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-crm-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-crm-text">Knowledge Inbox</h2>
            <span className="text-xs text-crm-muted">
              {items.length} pending
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-crm-muted hover:text-crm-text p-1"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded bg-crm-hover animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="p-4 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={fetchInbox}
                className="mt-2 text-xs text-crm-accent hover:text-crm-accent-hover"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="p-8 text-center text-sm text-crm-muted">
              Inbox is empty. All clear!
            </div>
          )}

          {!loading &&
            items.map((item) => {
              const isExpanded = expandedSlug === item.slug;
              const isActioning = actionLoading === item.slug;

              return (
                <div
                  key={item.slug}
                  className="border-b border-crm-border"
                >
                  {/* Summary row */}
                  <button
                    onClick={() => setExpandedSlug(isExpanded ? null : item.slug)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-crm-hover transition-colors"
                  >
                    <Badge
                      label={item.type}
                      color={TYPE_COLORS[item.type] || '#9CA3AF'}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-crm-text font-medium truncate">
                        {item.title}
                      </div>
                      {item.source_context && (
                        <div className="text-xs text-crm-muted truncate mt-0.5">
                          {item.source_context}
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-crm-muted flex-shrink-0 mt-0.5">
                      {timeAgo(item.created_at)}
                    </span>
                    <svg
                      className={`text-crm-muted flex-shrink-0 mt-1 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      width="12"
                      height="12"
                      viewBox="0 0 16 16"
                      fill="currentColor"
                    >
                      <path d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
                    </svg>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4">
                      <div className="text-xs text-crm-text whitespace-pre-wrap leading-relaxed bg-crm-bg rounded p-3 mb-3 max-h-48 overflow-y-auto">
                        {item.content || 'No content'}
                      </div>

                      {/* Merge target input */}
                      <div className="mb-3">
                        <label className="block text-[10px] text-crm-muted mb-1 uppercase tracking-wider">
                          Merge into (slug)
                        </label>
                        <input
                          type="text"
                          value={mergeTargets[item.slug] || ''}
                          onChange={(e) =>
                            setMergeTargets((prev) => ({
                              ...prev,
                              [item.slug]: e.target.value,
                            }))
                          }
                          placeholder="target-node-slug"
                          className="w-full px-2 py-1 text-xs rounded border border-crm-border bg-crm-bg text-crm-text
                                     placeholder:text-crm-muted focus:outline-none focus:border-crm-accent"
                        />
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleMerge(item.slug)}
                          disabled={isActioning || !mergeTargets[item.slug]}
                          className="flex-1 px-3 py-1.5 text-xs font-medium rounded bg-crm-accent text-white
                                     hover:bg-crm-accent-hover disabled:opacity-40 transition-colors"
                        >
                          {isActioning ? 'Merging...' : 'Merge'}
                        </button>
                        <button
                          onClick={() => handleReject(item.slug)}
                          disabled={isActioning}
                          className="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-crm-border text-crm-muted
                                     hover:bg-crm-hover hover:text-crm-text disabled:opacity-40 transition-colors"
                        >
                          {isActioning ? 'Rejecting...' : 'Reject'}
                        </button>
                        <button
                          onClick={() => handleFlag(item.slug)}
                          disabled={isActioning}
                          className="flex-1 px-3 py-1.5 text-xs font-medium rounded border border-yellow-600/50 text-yellow-500
                                     hover:bg-yellow-900/20 hover:text-yellow-400 disabled:opacity-40 transition-colors"
                        >
                          {isActioning ? 'Flagging...' : 'Flag for David'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
