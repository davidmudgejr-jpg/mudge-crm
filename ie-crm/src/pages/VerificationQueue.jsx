import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/shared/Toast';
import { groupByBatch } from '../utils/groupByBatch';

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
  approved: 'bg-green-500/15 text-green-400 border border-green-500/30',
  promoted: 'bg-green-500/15 text-green-400 border border-green-500/30',
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

// ── Suggestion Card (Update Existing) ───────────────────────
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
        {/* Source type badge */}
        <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 bg-blue-500/10 text-blue-400 border-blue-500/20">
          Update
        </span>

        {/* Entity type badge */}
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${badge.cls}`}>
          {badge.label}
        </span>

        {/* Entity name + field */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-crm-text font-medium truncate">{item.entity_name || 'Unknown'}</span>
            <span className="text-crm-muted text-xs">&rsaquo;</span>
            <span className="text-crm-muted text-xs truncate">{item.field_label || item.field_name}</span>
          </div>

          {/* Current -> Suggested */}
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

// ── Batched Suggestion Card (Multiple Fields, Same Batch) ───
function BatchedSuggestionCard({ items, onApproveBatch, onRejectBatch }) {
  const [reviewing, setReviewing] = useState(false);
  const [droppedIds, setDroppedIds] = useState(new Set());

  // All items in a group share the same entity because groupByBatch keys on
  // (batch_id, entity_id) — same agent run AND same target entity. So we
  // can safely pull display-common fields (entity_name, entity_type,
  // confidence, agent_name) from the first item.
  const head = items[0];
  const badge = ENTITY_BADGES[head.entity_type] || { label: head.entity_type, cls: 'bg-crm-hover text-crm-muted' };
  const keptIds = items.filter(i => !droppedIds.has(i.id)).map(i => i.id);
  const rejectedIds = [...droppedIds];

  const toggleDrop = (id) => {
    setDroppedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleRejectAll = async () => {
    setReviewing(true);
    try {
      await onRejectBatch(items.map(i => i.id));
    } finally {
      setReviewing(false);
    }
  };

  const handleApproveAll = async () => {
    if (keptIds.length === 0) {
      // User dropped every field — treat as reject-all
      return handleRejectAll();
    }
    setReviewing(true);
    try {
      await onApproveBatch({ accept: keptIds, reject: rejectedIds });
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="rounded-xl border border-crm-border/50 bg-crm-card/60 hover:bg-crm-card hover:border-crm-border transition-all duration-200">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-crm-border/30">
        <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
          Batch · {items.length}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-crm-text font-medium truncate flex-1">{head.entity_name || 'Unknown'}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-crm-hover overflow-hidden">
            <div className={`h-full rounded-full ${confidenceBarColor(head.confidence)}`} style={{ width: `${head.confidence}%` }} />
          </div>
          <span className={`text-xs font-medium tabular-nums ${confidenceColor(head.confidence)}`}>{head.confidence}%</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-crm-hover text-crm-muted flex-shrink-0">{head.source || head.agent_name}</span>
        <span className="text-crm-muted text-[10px] flex-shrink-0 w-14 text-right">{formatTimeAgo(head.created_at)}</span>
      </div>

      {/* Field rows */}
      <div className="px-4 py-2 space-y-1.5">
        {items.map((item) => {
          const dropped = droppedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 py-1 ${dropped ? 'opacity-40' : ''}`}
            >
              <span className="text-crm-muted text-xs flex-shrink-0 w-40 text-right truncate">
                {item.field_label || item.field_name}:
              </span>
              {item.current_value ? (
                <span className="text-crm-muted text-xs font-mono line-through truncate max-w-[140px]">{item.current_value}</span>
              ) : (
                <span className="text-crm-muted/50 text-xs italic">(empty)</span>
              )}
              <svg className="w-3 h-3 text-crm-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className={`text-xs font-mono font-medium truncate flex-1 ${dropped ? 'text-crm-muted line-through' : 'text-green-400'}`}>
                {item.suggested_value}
              </span>
              <button
                onClick={() => toggleDrop(item.id)}
                title={dropped ? 'Keep this field' : 'Drop this field from approval'}
                className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                  dropped
                    ? 'bg-crm-hover text-crm-muted hover:text-crm-text'
                    : 'text-crm-muted hover:bg-red-500/15 hover:text-red-400'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {dropped
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />}
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-crm-border/30">
        {droppedIds.size > 0 && (
          <span className="text-[10px] text-crm-muted mr-auto italic">
            {droppedIds.size} dropped, {keptIds.length} kept
          </span>
        )}
        <button
          onClick={handleApproveAll}
          disabled={reviewing}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors text-xs font-medium disabled:opacity-50"
        >
          {reviewing ? (
            <div className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          Approve {keptIds.length === items.length ? 'All' : `${keptIds.length} of ${items.length}`}
        </button>
        <button
          onClick={handleRejectAll}
          disabled={reviewing}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors text-xs font-medium disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reject All
        </button>
      </div>
    </div>
  );
}

// ── Sandbox Contact Card (New Contact) ──────────────────────
function SandboxContactCard({ item, onReview }) {
  const [reviewing, setReviewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    full_name: item.full_name || '',
    email: item.email || '',
    title: item.title || '',
  });
  const isPending = item.status === 'pending';
  const confidence = item.confidence_score ?? 0;

  const handleApproveClick = () => {
    setEditFields({
      full_name: item.full_name || '',
      email: item.email || '',
      title: item.title || '',
    });
    setEditing(true);
  };

  const handleConfirm = async () => {
    setReviewing(true);
    // Only send changed fields
    const changes = {};
    if (editFields.full_name !== (item.full_name || '')) changes.full_name = editFields.full_name;
    if (editFields.email !== (item.email || '')) changes.email = editFields.email;
    if (editFields.title !== (item.title || '')) changes.title = editFields.title;
    await onReview(item.id, 'approved', Object.keys(changes).length > 0 ? changes : null);
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
    setEditFields({
      full_name: item.full_name || '',
      email: item.email || '',
      title: item.title || '',
    });
  };

  const hasEdits =
    editFields.full_name !== (item.full_name || '') ||
    editFields.email !== (item.email || '') ||
    editFields.title !== (item.title || '');

  // Normalize status label for display
  const displayStatus = item.status === 'approved' || item.status === 'promoted' ? 'accepted' : item.status;

  return (
    <div className={`rounded-xl border transition-all duration-200 px-4 py-3 ${
      editing ? 'border-green-500/40 bg-crm-card shadow-lg' : 'border-crm-border/50 bg-crm-card/60 hover:bg-crm-card hover:border-crm-border'
    }`}>
      <div className="flex items-center gap-3">
        {/* Source type badge */}
        <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 bg-green-500/10 text-green-400 border-green-500/20">
          New Contact
        </span>

        {/* Contact info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-crm-text font-medium truncate">{item.full_name || 'Unknown'}</span>
            {item.title && (
              <>
                <span className="text-crm-muted text-xs">&middot;</span>
                <span className="text-crm-muted text-xs truncate">{item.title}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs">
            {item.email && (
              <span className="text-crm-accent truncate">{item.email}</span>
            )}
            {item.phone_1 && (
              <span className="text-crm-muted whitespace-nowrap">{item.phone_1}</span>
            )}
            {item.company_name && (
              <span className="text-crm-muted truncate">
                <span className="text-crm-muted/50">@</span> {item.company_name}
              </span>
            )}
            {item.linkedin && (
              <a
                href={item.linkedin.startsWith('http') ? item.linkedin : `https://${item.linkedin}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-blue-400 hover:underline truncate"
                title={item.linkedin}
              >
                LinkedIn
              </a>
            )}
          </div>
        </div>

        {/* Confidence */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-crm-hover overflow-hidden">
            <div className={`h-full rounded-full ${confidenceBarColor(confidence)}`} style={{ width: `${confidence}%` }} />
          </div>
          <span className={`text-xs font-medium tabular-nums ${confidenceColor(confidence)}`}>{confidence}%</span>
        </div>

        {/* Source */}
        <div className="flex-shrink-0 text-right min-w-[100px]">
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-crm-hover text-crm-muted">{item.agent_name || item.data_source}</span>
          {item.data_source && item.agent_name && (
            <p className="text-[10px] text-crm-muted/60 mt-0.5 truncate">{item.data_source}</p>
          )}
        </div>

        {/* Actions */}
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
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS_COLORS[displayStatus] || 'bg-crm-hover text-crm-muted'}`}>
              {displayStatus}
            </span>
            <span className="text-[10px] text-crm-muted">{formatTimeAgo(item.reviewed_at || item.created_at)}</span>
          </div>
        ) : null}

        {/* Time */}
        {isPending && !editing && (
          <span className="text-crm-muted text-[10px] flex-shrink-0 w-14 text-right">{formatTimeAgo(item.created_at)}</span>
        )}
      </div>

      {/* Inline edit panel — appears when Approve is clicked */}
      {editing && (
        <div className="mt-3 pt-3 border-t border-crm-border/30 grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 items-center">
          <span className="text-crm-muted text-xs text-right">Name:</span>
          <input
            autoFocus
            value={editFields.full_name}
            onChange={(e) => setEditFields(f => ({ ...f, full_name: e.target.value }))}
            className="bg-crm-bg border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-text font-mono focus:outline-none focus:border-crm-accent focus:ring-1 focus:ring-crm-accent/30"
          />

          <span className="text-crm-muted text-xs text-right">Email:</span>
          <input
            value={editFields.email}
            onChange={(e) => setEditFields(f => ({ ...f, email: e.target.value }))}
            className="bg-crm-bg border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-text font-mono focus:outline-none focus:border-crm-accent focus:ring-1 focus:ring-crm-accent/30"
          />

          <span className="text-crm-muted text-xs text-right">Title:</span>
          <input
            value={editFields.title}
            onChange={(e) => setEditFields(f => ({ ...f, title: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm();
              if (e.key === 'Escape') handleCancel();
            }}
            className="bg-crm-bg border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-text font-mono focus:outline-none focus:border-crm-accent focus:ring-1 focus:ring-crm-accent/30"
          />

          <div className="col-span-2 flex items-center gap-3 justify-end mt-1">
            {hasEdits && <span className="text-[10px] text-purple-400 italic">edited</span>}
            <button
              onClick={handleConfirm}
              disabled={reviewing || !editFields.full_name.trim()}
              className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors text-xs font-medium disabled:opacity-50"
            >
              {reviewing ? (
                <div className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
              )}
              Confirm &amp; Create
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 rounded-lg bg-crm-hover text-crm-muted hover:text-crm-text transition-colors text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────
export default function VerificationQueue({ onCountChange }) {
  const [suggestedItems, setSuggestedItems] = useState([]);
  const [sandboxItems, setSandboxItems] = useState([]);
  // suGroupCounts holds group_counts from the API — the number of CARDS
  // (distinct batch_id + entity_id pairs) per status. This is what the
  // header stats and tab labels display, matching what the user sees.
  const [suGroupCounts, setSuGroupCounts] = useState({});
  const [scCounts, setScCounts] = useState({});
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set()); // only for suggested_updates
  const { addToast } = useToast();

  // Combined status counts for tab badges. These reflect the CARD count
  // (post-grouping by batch_id + entity_id), not the raw field-update row
  // count — otherwise the user sees "282 pending" when they really have
  // ~94 actionable cards, which is misleading and demoralizing.
  const pendingCount = (suGroupCounts.pending || 0) + (scCounts.pending || 0);
  const acceptedCount = (suGroupCounts.accepted || 0) + (scCounts.approved || 0) + (scCounts.promoted || 0);
  const rejectedCount = (suGroupCounts.rejected || 0) + (scCounts.rejected || 0);
  const statusCounts = { pending: pendingCount, accepted: acceptedCount, rejected: rejectedCount };

  // Merge both sources, tagged and sorted by created_at (newest first)
  const allItems = [
    ...suggestedItems.map(s => ({ ...s, _source: 'update' })),
    ...sandboxItems.map(c => ({ ...c, _source: 'new_contact' })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Group multi-field agent-run batches into single display units.
  // Groups have uniform shape { batch_id, items, entity_name }; consumers
  // branch on items.length > 1 to decide between BatchedSuggestionCard
  // (multi-field) and the existing compact SuggestionCard (single-field).
  const displayGroups = groupByBatch(allItems);

  // IDs the "Select all updates" checkbox is allowed to select. We exclude
  // items living inside batched cards because those cards don't render a
  // checkbox — batching them into selectedIds would cause "Approve Selected"
  // to silently operate on items the user can't see as selected.
  const selectableSingleUpdateIds = displayGroups
    .filter(g => g.items.length === 1 && g.items[0]._source === 'update' && g.items[0].status === 'pending')
    .map(g => g.items[0].id);

  // ── Fetch both sources in parallel ──
  const fetchData = useCallback(async () => {
    try {
      const statusParam = activeTab === 'all' ? '' : `status=${activeTab}&`;

      const [suRes, scRes] = await Promise.all([
        fetch(`${API}/api/ai/suggested-updates?${statusParam}limit=50`, { headers: authHeaders() }),
        fetch(`${API}/api/sandbox-contacts?${statusParam}limit=50`, { headers: authHeaders() }),
      ]);

      let suData = { suggestions: [], status_counts: {} };
      let scData = { contacts: [], status_counts: {} };

      if (suRes.ok) suData = await suRes.json();
      if (scRes.ok) scData = await scRes.json();

      setSuggestedItems(suData.suggestions || []);
      setSandboxItems(scData.contacts || []);
      // Store GROUP counts, not raw row counts — the header and tab labels
      // display these as "N pending cards" rather than "N pending rows".
      setSuGroupCounts(suData.group_counts || suData.status_counts || {});
      setScCounts(scData.status_counts || {});

      // Report total for the current tab
      const totalItems = (suData.suggestions?.length || 0) + (scData.contacts?.length || 0);
      if (onCountChange) onCountChange(totalItems);
    } catch (err) {
      console.error('Failed to fetch verification data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeTab, onCountChange]);

  useEffect(() => {
    setLoading(true);
    setSelectedIds(new Set());
    fetchData();
  }, [fetchData]);

  // ── Handlers for suggested_updates ──
  const handleReview = async (id, status, appliedValue) => {
    try {
      const body = { status };
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
        addToast(status === 'accepted' ? 'Confirmed -- value written to record' : 'Rejected', 'success');
        fetchData();
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
        fetchData();
      } else {
        addToast(data.error || 'Batch failed', 'error');
      }
    } catch {
      addToast('Network error', 'error');
    }
  };

  const handleAcceptAll = async () => {
    // Only batch-accept suggested_updates (sandbox contacts need individual review)
    const pendingUpdateIds = suggestedItems.filter(i => i.status === 'pending').map(i => i.id);
    if (pendingUpdateIds.length === 0) return;
    try {
      const res = await fetch(`${API}/api/ai/suggested-updates/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ids: pendingUpdateIds, status: 'accepted' }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(`${data.processed || pendingUpdateIds.length} updates approved`, 'success');
        fetchData();
      } else {
        addToast(data.error || 'Batch failed', 'error');
      }
    } catch {
      addToast('Network error', 'error');
    }
  };

  // ── Handlers for BatchedSuggestionCard ──
  //
  // These handlers understand the server's new response shape:
  //   { ok, reviewed, applied, failed_count, failed: [{id, error}] }
  // Partial successes return 200 with failed_count > 0, so we check
  // failed_count (not res.ok) to decide between success and warning toasts.

  const handleBatchApprove = async ({ accept, reject }) => {
    try {
      let totalApplied = 0;
      let totalFailed = 0;
      const allFailures = [];

      // Step 1: reject dropped fields (if any). We reject BEFORE accepting
      // so that if the reject fails mid-way, we haven't committed yet.
      if (reject.length > 0) {
        const rejRes = await fetch(`${API}/api/ai/suggested-updates/batch`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ ids: reject, status: 'rejected' }),
        });
        if (!rejRes.ok) {
          const data = await rejRes.json().catch(() => ({}));
          addToast(data.error || 'Failed to reject dropped fields', 'error');
          return;
        }
        const rejData = await rejRes.json();
        totalFailed += rejData.failed_count || 0;
        if (rejData.failed?.length) allFailures.push(...rejData.failed);
      }

      // Step 2: accept the kept fields
      if (accept.length > 0) {
        const accRes = await fetch(`${API}/api/ai/suggested-updates/batch`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ ids: accept, status: 'accepted' }),
        });
        if (!accRes.ok) {
          const data = await accRes.json().catch(() => ({}));
          addToast(data.error || 'Batch approve failed', 'error');
          return;
        }
        const accData = await accRes.json();
        totalApplied += accData.applied || 0;
        totalFailed += accData.failed_count || 0;
        if (accData.failed?.length) allFailures.push(...accData.failed);
      }

      // Build the toast message based on what actually happened
      if (totalFailed > 0 && totalApplied === 0) {
        // Total failure — show first error so user has something actionable
        const firstErr = allFailures[0]?.error || 'unknown error';
        addToast(`All ${totalFailed} updates failed: ${firstErr}`, 'error');
      } else if (totalFailed > 0) {
        // Partial success
        const firstErr = allFailures[0]?.error || 'see server logs';
        addToast(`${totalApplied} approved, ${totalFailed} failed (${firstErr})`, 'warning');
      } else {
        // Clean success
        const dropMsg = reject.length > 0 ? ` (${reject.length} dropped)` : '';
        addToast(`${totalApplied} fields approved${dropMsg}`, 'success');
      }

      fetchData();
    } catch {
      addToast('Network error', 'error');
    }
  };

  const handleBatchReject = async (ids) => {
    try {
      const res = await fetch(`${API}/api/ai/suggested-updates/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ids, status: 'rejected' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        addToast(data.error || 'Batch reject failed', 'error');
        return;
      }
      const data = await res.json();
      if (data.failed_count > 0) {
        const firstErr = data.failed?.[0]?.error || 'unknown error';
        addToast(`${data.reviewed} rejected, ${data.failed_count} failed (${firstErr})`, 'warning');
      } else {
        addToast(`${data.reviewed || ids.length} fields rejected`, 'success');
      }
      fetchData();
    } catch {
      addToast('Network error', 'error');
    }
  };

  // ── Handler for sandbox_contacts ──
  const handleSandboxReview = async (id, status, fields) => {
    try {
      const body = { status };
      if (fields) body.fields = fields;
      const res = await fetch(`${API}/api/sandbox-contacts/${id}`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        const msg = status === 'approved'
          ? `Contact created${data.was_merge ? ' (merged with existing)' : ''}`
          : 'Contact rejected';
        addToast(msg, 'success');
        fetchData();
      } else {
        addToast(data.error || 'Failed to review', 'error');
      }
    } catch {
      addToast('Network error', 'error');
    }
  };

  // ── Selection (only for suggested_updates) ──
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const pendingUpdateCount = suggestedItems.filter(i => i.status === 'pending').length;
  const pendingSandboxCount = sandboxItems.filter(i => i.status === 'pending').length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-crm-text">Verification Queue</h1>
            <p className="text-crm-muted text-sm mt-0.5">
              Review AI-enriched data and new contacts before they reach your records
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
            {pendingSandboxCount > 0 && (
              <div className="px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                <span className="text-green-400 text-xs font-medium">{pendingSandboxCount} new contact{pendingSandboxCount !== 1 ? 's' : ''}</span>
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

          {/* Batch actions (suggested_updates only) */}
          {activeTab === 'pending' && allItems.length > 0 && (
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
              {pendingUpdateCount > 0 && (
                <button
                  onClick={handleAcceptAll}
                  className="px-3 py-1.5 rounded-lg bg-crm-hover text-crm-muted hover:text-crm-text transition-colors text-xs"
                >
                  Accept All Updates ({pendingUpdateCount})
                </button>
              )}
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
        ) : allItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-crm-accent/10 flex items-center justify-center">
              <svg className="w-6 h-6 text-crm-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-crm-text">
              {activeTab === 'pending' ? 'No pending items' : `No ${activeTab} items`}
            </p>
            <p className="text-xs text-crm-muted">AI enrichment suggestions and new contacts will appear here for review.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Select-all checkbox for pending tab (suggested_updates only) */}
            {activeTab === 'pending' && selectableSingleUpdateIds.length > 1 && (
              <label className="flex items-center gap-2 px-4 py-2 text-xs text-crm-muted cursor-pointer hover:text-crm-text">
                <input
                  type="checkbox"
                  checked={selectedIds.size === selectableSingleUpdateIds.length && selectedIds.size > 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedIds(new Set(selectableSingleUpdateIds));
                    } else {
                      setSelectedIds(new Set());
                    }
                  }}
                  className="rounded border-crm-border text-crm-accent focus:ring-crm-accent/30"
                />
                Select all single-field updates
              </label>
            )}

            {displayGroups.map((group) => {
              // Multi-item groups with _source === 'update' → BatchedSuggestionCard
              if (group.items.length > 1 && group.items[0]._source === 'update') {
                return (
                  <div key={`batch-${group.batch_id}`}>
                    <BatchedSuggestionCard
                      items={group.items}
                      onApproveBatch={handleBatchApprove}
                      onRejectBatch={handleBatchReject}
                    />
                  </div>
                );
              }
              // Single-item groups → existing compact cards (no regression)
              const item = group.items[0];
              return (
                <div key={`${item._source}-${item.id}`} className="flex items-center gap-2">
                  {/* Checkbox only for suggested_updates on pending tab */}
                  {activeTab === 'pending' && item.status === 'pending' && item._source === 'update' && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      className="rounded border-crm-border text-crm-accent focus:ring-crm-accent/30 flex-shrink-0"
                    />
                  )}
                  <div className="flex-1">
                    {item._source === 'update' ? (
                      <SuggestionCard item={item} onReview={handleReview} />
                    ) : (
                      <SandboxContactCard item={item} onReview={handleSandboxReview} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
