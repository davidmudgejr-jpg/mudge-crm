import React, { useState, useEffect, useCallback } from 'react';
import { createNote, getNotesForEntity, deleteNote } from '../../api/database';

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function NotesSection({ entityType, entityId, extraLinks = {} }) {
  const [notes, setNotes] = useState([]);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    if (!entityType || !entityId) return;
    try {
      const res = await getNotesForEntity(entityType, entityId);
      setNotes(res.rows || []);
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setSaving(true);
    try {
      const fkCol = { contact: 'contact_id', company: 'company_id', property: 'property_id', deal: 'deal_id', interaction: 'interaction_id', campaign: 'campaign_id' }[entityType];
      const links = { [fkCol]: entityId, ...extraLinks };
      await createNote(text, links);
      setDraft('');
      await load();
    } catch (err) {
      console.error('Failed to create note:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleDelete = async (noteId) => {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.note_id !== noteId));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  return (
    <div className="border-b border-crm-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold uppercase tracking-wider text-crm-muted hover:text-crm-text transition-colors"
      >
        <span className="flex items-center gap-2">
          Notes
          {notes.length > 0 && (
            <span className="text-[10px] font-normal bg-crm-card border border-crm-border rounded-full px-1.5 py-0.5 text-crm-muted">
              {notes.length}
            </span>
          )}
        </span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-4">
          {/* Add note input */}
          <div className="flex gap-2 mb-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Add a note..."
              rows={2}
              className="flex-1 bg-crm-card border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50 resize-none"
            />
            <button
              onClick={handleAdd}
              disabled={!draft.trim() || saving}
              className="self-end px-3 py-1.5 text-xs font-medium rounded-lg bg-crm-accent hover:bg-crm-accent-hover text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? '...' : 'Add'}
            </button>
          </div>

          {/* Notes list */}
          {notes.length === 0 ? (
            <p className="text-xs text-crm-muted">No notes yet</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <div key={n.note_id} className="group flex gap-2">
                  <div className="w-1 rounded-full bg-crm-accent/30 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-crm-text whitespace-pre-wrap">{n.content}</p>
                    <p className="text-[10px] text-crm-muted mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(n.note_id)}
                    className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-crm-muted hover:text-red-400 transition-opacity text-xs flex-shrink-0 self-start mt-0.5"
                    title="Delete note"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
