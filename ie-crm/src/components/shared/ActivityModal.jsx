import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  createInteraction, linkRecords,
  getContactInteractions, getPropertyInteractions, getDealInteractions, getCompanyInteractions,
  getDealAggregatedInteractions,
} from '../../api/database';
import { getTypeInfo } from '../../config/typeIcons';
import { todayPacific, formatDateCompact } from '../../utils/timezone';
import InteractionDetail from '../../pages/InteractionDetail';

const FETCH_FN = {
  contact: getContactInteractions,
  property: getPropertyInteractions,
  deal: getDealAggregatedInteractions,
  company: getCompanyInteractions,
};

const JUNCTION_MAP = {
  contact: { table: 'interaction_contacts', col: 'contact_id' },
  property: { table: 'interaction_properties', col: 'property_id' },
  deal: { table: 'interaction_deals', col: 'deal_id' },
  company: { table: 'interaction_companies', col: 'company_id' },
};

export default function ActivityModal({ entityType, entityId, entityLabel, onClose, onActivityCreated }) {
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState(null);
  const textareaRef = useRef(null);

  const fetchInteractions = useCallback(async () => {
    setLoading(true);
    try {
      const fn = FETCH_FN[entityType];
      if (!fn) return;
      const result = await fn(entityId);
      setInteractions(result?.rows || []);
    } catch (err) {
      console.error('Failed to fetch interactions:', err);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => { fetchInteractions(); }, [fetchInteractions]);
  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleAddNote = async () => {
    if (!noteText.trim() || saving) return;
    setSaving(true);
    try {
      const fields = {
        type: 'Note',
        subject: 'Quick note',
        date: todayPacific(),
        notes: noteText.trim(),
      };
      const result = await createInteraction(fields);
      const row = result?.rows?.[0] || result;
      const interactionId = row?.interaction_id;
      if (!interactionId) throw new Error('Failed to create interaction');

      const junc = JUNCTION_MAP[entityType];
      if (junc) {
        await linkRecords(junc.table, 'interaction_id', interactionId, junc.col, entityId);
      }

      setNoteText('');
      fetchInteractions();
      if (onActivityCreated) onActivityCreated();
    } catch (err) {
      console.error('Failed to add note:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddNote();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh]" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50" />
        <div
          className="relative bg-crm-card border border-crm-border rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-crm-border flex items-center justify-between flex-shrink-0">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">Activity — {entityLabel}</h3>
              <p className="text-[10px] text-crm-muted">{interactions.length} interaction{interactions.length !== 1 ? 's' : ''}</p>
            </div>
            <button onClick={onClose} className="text-crm-muted hover:text-crm-text transition-colors flex-shrink-0 ml-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Quick note */}
          <div className="px-4 py-3 border-b border-crm-border flex-shrink-0">
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a quick note..."
                rows={2}
                className="flex-1 bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-xs text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50 resize-none"
              />
              <button
                onClick={handleAddNote}
                disabled={!noteText.trim() || saving}
                className="self-end px-3 py-1.5 text-xs bg-crm-accent text-white rounded-lg hover:bg-crm-accent/90 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {saving ? '...' : 'Add'}
              </button>
            </div>
            <p className="text-[10px] text-crm-muted mt-1">Cmd+Enter to submit</p>
          </div>

          {/* Interactions list */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {loading ? (
              <div className="space-y-3 py-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-crm-border" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 bg-crm-border rounded w-3/4" />
                      <div className="h-2.5 bg-crm-border rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : interactions.length === 0 ? (
              <p className="text-xs text-crm-muted py-6 text-center">No activity yet. Add your first note above.</p>
            ) : (
              <div className="space-y-0.5">
                {interactions.map((int) => {
                  const typeInfo = getTypeInfo(int.type);
                  return (
                    <button
                      key={int.interaction_id}
                      onClick={() => setSelectedInteraction(int.interaction_id)}
                      className="w-full flex gap-3 px-2 py-2 -mx-2 rounded-lg hover:bg-crm-card/60 transition-colors cursor-pointer text-left"
                    >
                      <div className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${typeInfo.color}`}>
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeInfo.icon} />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">
                          {typeInfo.displayName}{int.email_heading ? ` — ${int.email_heading}` : (int.subject ? ` — ${int.subject}` : '')}
                        </div>
                        {int.notes && (
                          <div className="text-xs text-crm-muted mt-0.5 line-clamp-2">{int.notes.split(/\n\n---\s/)[0].trim()}</div>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-crm-muted">{formatDateCompact(int.date) || ''}</span>
                          {int.source_type && int.source_type !== 'deal' && int.source_name && (
                            <span className="text-[10px] text-crm-muted italic">via {int.source_name}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interaction detail slide-over — wrap in z-[70] to stay above the modal */}
      {selectedInteraction && (
        <div className="relative z-[70]">
          <InteractionDetail
            interactionId={selectedInteraction}
            onClose={() => setSelectedInteraction(null)}
            onSave={() => { setSelectedInteraction(null); fetchInteractions(); }}
          />
        </div>
      )}
    </>
  );
}
