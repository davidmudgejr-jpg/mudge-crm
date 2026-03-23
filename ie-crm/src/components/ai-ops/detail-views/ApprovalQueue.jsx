import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const TABS = [
  { key: 'contacts',    label: 'Contacts' },
  { key: 'enrichments', label: 'Enrichments' },
  { key: 'signals',     label: 'Signals' },
  { key: 'outreach',    label: 'Outreach' },
];

const STATUS_COLORS = {
  pending:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border-red-500/30',
};

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function ApprovalQueue({ agents, pending }) {
  const [activeTab, setActiveTab] = useState('contacts');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState({});

  const getPendingCount = (key) => {
    if (!Array.isArray(pending)) return 0;
    const match = pending.find(p => p.table === key || p.type === key);
    return match?.count || 0;
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('crm-auth-token');
      const res = await fetch(`${API_BASE}/api/ai/sandbox/${activeTab}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setItems(Array.isArray(data) ? data : data.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleAction = async (id, action) => {
    setActionPending(prev => ({ ...prev, [id]: action }));
    try {
      const token2 = localStorage.getItem('crm-auth-token');
      const res = await fetch(`${API_BASE}/api/ai/sandbox/${activeTab}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token2 ? { 'Authorization': `Bearer ${token2}` } : {}) },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // Optimistic: remove from list
      setItems(prev => prev.filter(item => item.id !== id));
    } catch {
      // Revert on error
    } finally {
      setActionPending(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  // Build display columns from first item keys
  const displayKeys = items.length > 0
    ? Object.keys(items[0]).filter(k => !['id', 'metadata', 'raw_data', 'sandbox_data'].includes(k)).slice(0, 5)
    : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <h2 className="text-2xl font-bold text-white">Approval Queue</h2>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-crm-card rounded-xl border border-crm-border w-fit">
        {TABS.map(tab => {
          const count = getPendingCount(tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-crm-accent text-white'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="bg-crm-card rounded-xl border border-crm-border overflow-hidden">
        {loading ? (
          <div className="text-crm-muted text-sm text-center py-12">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-crm-muted text-sm text-center py-12">
            No pending items in {activeTab}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-crm-border">
                  {displayKeys.map(k => (
                    <th key={k} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-crm-muted">
                      {k.replace(/_/g, ' ')}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-crm-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr
                    key={item.id || i}
                    className="border-b border-crm-border last:border-0 hover:bg-crm-hover transition-colors"
                  >
                    {displayKeys.map(k => (
                      <td key={k} className="px-4 py-3 text-sm">
                        {k === 'status' ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[item[k]] || STATUS_COLORS.pending}`}>
                            {item[k] || 'pending'}
                          </span>
                        ) : k.endsWith('_at') ? (
                          <span className="text-crm-muted">{formatDate(item[k])}</span>
                        ) : (
                          <span className="text-crm-text truncate max-w-xs block">
                            {String(item[k] ?? '—')}
                          </span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleAction(item.id, 'approved')}
                          disabled={!!actionPending[item.id]}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-medium transition-colors disabled:opacity-40"
                        >
                          {actionPending[item.id] === 'approved' ? '…' : '✓ Approve'}
                        </button>
                        <button
                          onClick={() => handleAction(item.id, 'rejected')}
                          disabled={!!actionPending[item.id]}
                          className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-medium transition-colors disabled:opacity-40"
                        >
                          {actionPending[item.id] === 'rejected' ? '…' : '✕ Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
