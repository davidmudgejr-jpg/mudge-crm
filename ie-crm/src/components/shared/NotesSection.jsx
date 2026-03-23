import React, { useState } from 'react';
import { createInteraction, linkRecords } from '../../api/database';
import { nowPacificISO } from '../../utils/timezone';

export default function NotesSection({ entityType, entityId, onRefresh }) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(true);

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text || saving) return;
    setError(null);
    setSaving(true);
    try {
      const junctionMap = {
        contact: { table: 'interaction_contacts', col: 'contact_id' },
        property: { table: 'interaction_properties', col: 'property_id' },
        company: { table: 'interaction_companies', col: 'company_id' },
        deal: { table: 'interaction_deals', col: 'deal_id' },
      };
      const junction = junctionMap[entityType];
      if (!junction) throw new Error(`Unsupported entity type: ${entityType}`);

      const res = await createInteraction({
        type: 'Note',
        notes: text,
        date: nowPacificISO(),
      });
      const interactionId = res.rows?.[0]?.interaction_id;
      if (interactionId) {
        await linkRecords(junction.table, 'interaction_id', interactionId, junction.col, entityId);
      }

      setDraft('');
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to create note:', err);
      setError(err.message || 'Failed to save note');
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

  return (
    <div className="border-b border-crm-border">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold uppercase tracking-wider text-crm-muted hover:text-crm-text transition-colors"
      >
        <span className="flex items-center gap-2">Quick Note</span>
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
          <div className="flex gap-2">
            <textarea
              value={draft}
              onChange={(e) => { setDraft(e.target.value); if (error) setError(null); }}
              onKeyDown={handleKeyDown}
              placeholder="Add a quick note..."
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
          {error && (
            <p className="text-xs text-red-400 mt-2">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
