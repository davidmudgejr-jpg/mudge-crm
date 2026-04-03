import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../shared/Toast';

const API = import.meta.env.VITE_API_URL || '';

/**
 * Panel showing recent merge history with undo capability.
 */
export default function MergeHistory({ entityType, onUndone }) {
  const { token } = useAuth();
  const { addToast } = useToast();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [undoing, setUndoing] = useState(null);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/dedup/merge-history?entityType=${entityType}&limit=20`, { headers });
      const data = await res.json();
      setHistory(data.rows || []);
    } catch (err) {
      console.error('Failed to load merge history:', err);
    } finally {
      setLoading(false);
    }
  }, [entityType, token]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleUndo = async (auditId) => {
    setUndoing(auditId);
    try {
      const res = await fetch(`${API}/api/dedup/undo-merge`, {
        method: 'POST', headers,
        body: JSON.stringify({ auditId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast(`Undo complete — ${data.restored} record(s) restored`, 'success');
      loadHistory();
      onUndone?.();
    } catch (err) {
      addToast(`Undo failed: ${err.message}`, 'error');
    } finally {
      setUndoing(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-12 rounded-lg bg-crm-card border border-crm-border animate-shimmer" />
        ))}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-crm-muted text-sm">
        No merges yet
      </div>
    );
  }

  return (
    <div className="space-y-2 p-2">
      {history.map(h => (
        <div
          key={h.id}
          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
            h.undone ? 'border-crm-border/30 bg-crm-deep/20 opacity-50' : 'border-crm-border bg-crm-card'
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="text-crm-text font-medium truncate">
              {h.keeper_name || 'Unknown'}
            </div>
            <div className="text-crm-muted text-[10px]">
              Merged {h.records_merged + 1} records · {new Date(h.merged_at).toLocaleDateString()}{' '}
              {new Date(h.merged_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {h.merged_by && ` · by ${h.merged_by}`}
            </div>
          </div>
          {!h.undone && (
            <button
              onClick={() => handleUndo(h.id)}
              disabled={undoing === h.id}
              className="text-[10px] font-medium text-crm-accent hover:text-crm-accent/80 transition-colors shrink-0 ml-2 disabled:opacity-50"
            >
              {undoing === h.id ? 'Undoing...' : 'Undo'}
            </button>
          )}
          {h.undone && (
            <span className="text-[10px] text-crm-muted shrink-0 ml-2">Undone</span>
          )}
        </div>
      ))}
    </div>
  );
}
