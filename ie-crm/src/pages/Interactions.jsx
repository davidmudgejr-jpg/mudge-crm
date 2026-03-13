import React, { useState, useEffect, useCallback } from 'react';
import { getInteractions } from '../api/database';
import TYPE_ICONS, { INTERACTION_TYPES, getTypeInfo } from '../config/typeIcons';
import InteractionDetail, { formatDate, formatTime } from './InteractionDetail';
import NewInteractionModal from '../components/shared/NewInteractionModal';
import { useToast } from '../components/shared/Toast';
import { todayPacific } from '../utils/timezone';
import useDetailPanel from '../hooks/useDetailPanel';

const TYPES = INTERACTION_TYPES;

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
  useDetailPanel(detailId);
  const [totalCount, setTotalCount] = useState(0);

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

  useEffect(() => { fetchData(); }, [fetchData]);

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
              {`${totalCount.toLocaleString()} interactions`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowQuickAdd(true)}
              className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Activity
            </button>
            <button
              onClick={fetchData}
              className="bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes, email subjects..."
              className="w-full bg-crm-hover border-0 rounded-[10px] pl-9 pr-3 py-2.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:ring-2 focus:ring-crm-accent/30"
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
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
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
                  const typeInfo = getTypeInfo(row.type);
                  const todayStr = todayPacific();
                  const hasFollowUp = row.follow_up && row.follow_up.slice(0, 10) >= todayStr;
                  const isOverdue = row.follow_up && row.follow_up.slice(0, 10) < todayStr;

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
                              {typeInfo.displayName || 'Other'}
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
                          {row.type === 'Note' && row.notes ? (
                            <p className="text-sm font-medium truncate">
                              {(() => {
                                const original = row.notes.split(/\n\n---\s/)[0].trim();
                                const firstLine = original.split('\n')[0];
                                return firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
                              })()}
                            </p>
                          ) : row.email_heading ? (
                            <p className="text-sm font-medium truncate">{row.email_heading}</p>
                          ) : row.notes ? (
                            <p className="text-sm text-crm-text/80 truncate">
                              {(() => {
                                const original = row.notes.split(/\n\n---\s/)[0].trim();
                                const firstLine = original.split('\n')[0];
                                return firstLine.length > 60 ? firstLine.slice(0, 60) + '...' : firstLine;
                              })()}
                            </p>
                          ) : (
                            <p className="text-sm text-crm-muted/60 italic">(no subject)</p>
                          )}
                          {/* Linked entity names */}
                          {(() => {
                            const parts = [row.linked_contact_names, row.linked_property_names, row.linked_deal_names, row.linked_company_names].filter(Boolean);
                            return parts.length > 0 && (
                              <p className="text-[10px] text-crm-muted/70 mt-0.5 truncate">{parts.join(' · ')}</p>
                            );
                          })()}
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
