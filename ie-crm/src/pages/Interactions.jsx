import React, { useState, useEffect, useCallback } from 'react';
import { getInteractions, getAllNotes, deleteNote } from '../api/database';
import TYPE_ICONS, { INTERACTION_TYPES } from '../config/typeIcons';
import InteractionDetail, { formatDate, formatTime } from './InteractionDetail';
import NewInteractionModal from '../components/shared/NewInteractionModal';
import { useToast } from '../components/shared/Toast';

const TYPES = INTERACTION_TYPES;

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function noteEntityLabel(note) {
  const parts = [];
  if (note.contact_name) parts.push({ type: 'contact', label: note.contact_name });
  if (note.company_name) parts.push({ type: 'company', label: note.company_name });
  if (note.property_address) parts.push({ type: 'property', label: note.property_address });
  if (note.deal_name) parts.push({ type: 'deal', label: note.deal_name });
  if (note.interaction_heading || note.interaction_type) parts.push({ type: 'interaction', label: note.interaction_heading || note.interaction_type });
  if (note.campaign_name) parts.push({ type: 'campaign', label: note.campaign_name });
  return parts;
}

export default function Interactions({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [orderBy, setOrderBy] = useState('date');
  const [order, setOrder] = useState('DESC');
  const [detailId, setDetailId] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [activeTab, setActiveTab] = useState('interactions');
  const [notes, setNotes] = useState([]);
  const [notesLoading, setNotesLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      if (filterType) filters.type = filterType;

      const result = await getInteractions({ limit: 500, orderBy, order, filters });
      setRows(result.rows || []);
      const count = result.rows?.length || 0;
      setTotalCount(count);
      if (onCountChange) onCountChange(count);
    } catch (err) {
      console.error('Failed to fetch interactions:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterType, orderBy, order, onCountChange]);

  const fetchNotes = useCallback(async () => {
    setNotesLoading(true);
    try {
      const result = await getAllNotes(500);
      setNotes(result.rows || []);
    } catch (err) {
      console.error('Failed to fetch notes:', err);
      setNotes([]);
    } finally {
      setNotesLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (activeTab === 'notes') fetchNotes(); }, [activeTab, fetchNotes]);

  const handleDeleteNote = async (noteId) => {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.note_id !== noteId));
      addToast('Note deleted');
    } catch (err) {
      console.error('Failed to delete note:', err);
      addToast('Failed to delete note');
    }
  };

  const handleSort = (key) => {
    if (orderBy === key) {
      setOrder(order === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setOrderBy(key);
      setOrder(key === 'date' ? 'DESC' : 'ASC');
    }
  };

  // Timeline-style view
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold">Activity</h1>
            <p className="text-xs text-crm-muted">
              {activeTab === 'interactions'
                ? `${totalCount.toLocaleString()} interactions`
                : `${notes.length.toLocaleString()} notes`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'interactions' && (
              <button
                onClick={() => setShowQuickAdd(true)}
                className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Activity
              </button>
            )}
            <button
              onClick={activeTab === 'interactions' ? fetchData : fetchNotes}
              className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-3">
          {['interactions', 'notes'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                activeTab === tab
                  ? 'bg-crm-accent/15 text-crm-accent'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover/50'
              }`}
            >
              {tab === 'interactions' ? 'Interactions' : 'Notes'}
            </button>
          ))}
        </div>

        {/* Filters */}
        {activeTab === 'interactions' && <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes, email subjects..."
              className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
          >
            <option value="">All Types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* Sort toggle */}
          <button
            onClick={() => handleSort('date')}
            className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text transition-colors flex items-center gap-1"
          >
            Date {orderBy === 'date' && <span className="text-crm-accent">{order === 'ASC' ? '↑' : '↓'}</span>}
          </button>
        </div>}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {activeTab === 'interactions' ? (
          /* Interactions Feed */
          loading ? (
            <div className="flex items-center justify-center h-40 text-crm-muted text-sm">Loading...</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-crm-muted">
              <p className="text-sm">No activity found</p>
              <p className="text-xs mt-1">Try adjusting your filters or sync from Airtable</p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-crm-border" />
              <div className="space-y-1">
                {rows.map((row) => {
                  const typeInfo = TYPE_ICONS[row.type] || TYPE_ICONS.Other;
                  const hasFollowUp = row.follow_up && new Date(row.follow_up) >= new Date();
                  const isOverdue = row.follow_up && new Date(row.follow_up) < new Date();

                  return (
                    <div
                      key={row.interaction_id}
                      onClick={() => setDetailId(row.interaction_id)}
                      className="relative pl-10 py-3 rounded-lg cursor-pointer hover:bg-crm-hover/50 transition-colors group"
                    >
                      <div className={`absolute left-1.5 top-4 w-[18px] h-[18px] rounded-full flex items-center justify-center ${typeInfo.color} ring-2 ring-crm-bg`}>
                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeInfo.icon} />
                        </svg>
                      </div>

                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${typeInfo.color}`}>
                              {row.type || 'Other'}
                            </span>
                            {row.team_member && (
                              <span className="text-[10px] text-crm-muted">by {row.team_member}</span>
                            )}
                            {hasFollowUp && (
                              <span className="text-[10px] bg-crm-accent/15 text-crm-accent px-1.5 py-0.5 rounded">
                                Follow up {formatDate(row.follow_up)}
                              </span>
                            )}
                            {isOverdue && (
                              <span className="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">
                                Overdue
                              </span>
                            )}
                          </div>
                          {row.email_heading ? (
                            <p className="text-sm font-medium truncate">{row.email_heading}</p>
                          ) : row.notes ? (
                            <p className="text-sm text-crm-text/80 line-clamp-2">{row.notes}</p>
                          ) : (
                            <p className="text-sm text-crm-muted italic">No notes</p>
                          )}
                        </div>

                        <div className="flex-shrink-0 text-right">
                          <p className="text-xs text-crm-muted">{formatDate(row.date)}</p>
                          {formatTime(row.date) && (
                            <p className="text-[10px] text-crm-muted/60">{formatTime(row.date)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        ) : (
          /* Notes Feed */
          notesLoading ? (
            <div className="flex items-center justify-center h-40 text-crm-muted text-sm">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-crm-muted">
              <p className="text-sm">No notes yet</p>
              <p className="text-xs mt-1">Add notes from any record's detail page</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notes.map((note) => {
                const entities = noteEntityLabel(note);
                return (
                  <div
                    key={note.note_id}
                    className="bg-crm-card border border-crm-border rounded-lg p-3 group hover:border-crm-accent/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-crm-text whitespace-pre-wrap">{note.content}</p>
                        {entities.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {entities.map((e, i) => (
                              <span
                                key={i}
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-crm-hover text-crm-muted"
                              >
                                {e.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] text-crm-muted">{timeAgo(note.created_at)}</span>
                        <button
                          onClick={() => handleDeleteNote(note.note_id)}
                          className="opacity-0 group-hover:opacity-100 text-crm-muted hover:text-red-400 transition-all"
                          title="Delete note"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Interaction Detail Slide-in */}
      {detailId && (
        <InteractionDetail
          interactionId={detailId}
          onClose={() => setDetailId(null)}
          onRefresh={fetchData}
        />
      )}

      {showQuickAdd && (
        <NewInteractionModal
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Activity created'); fetchData(); }}
        />
      )}
    </div>
  );
}
