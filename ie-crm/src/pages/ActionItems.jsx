import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getActionItems, updateActionItem } from '../api/database';
import ActionItemDetail, { STATUSES } from './ActionItemDetail';
import QuickAddModal from '../components/shared/QuickAddModal';
import { useToast } from '../components/shared/Toast';
import EmptyState from '../components/shared/EmptyState';
import { formatDatePacific } from '../utils/timezone';
import useDetailPanel from '../hooks/useDetailPanel';
import useLiveUpdates from '../hooks/useLiveUpdates';

const CIRCLE_COLORS = {
  Todo: 'border-red-500/60',
  Reminders: 'border-blue-500/60',
  'In progress': 'border-yellow-500/60',
  Done: 'border-green-500 bg-green-500',
  Dead: 'border-gray-500/40',
  Email: 'border-cyan-500/60',
  'Needs and Wants': 'border-purple-500/60',
};

const STATUS_BADGE = {
  'In progress': 'bg-yellow-500/15 text-yellow-400',
  'Follow Up': 'bg-orange-500/15 text-orange-400',
  Reminders: 'bg-blue-500/15 text-blue-400',
  Email: 'bg-cyan-500/15 text-cyan-400',
  'Needs and Wants': 'bg-purple-500/15 text-purple-400',
  Dead: 'bg-gray-500/15 text-gray-400',
};

const VIEW_TABS = [
  { key: 'all', label: 'All' },
  { key: 'today', label: 'Today' },
  { key: 'dave', label: 'Dave', filter: 'Dave Mudge' },
  { key: 'missy', label: 'Missy', filter: 'Missy' },
  { key: 'jr', label: 'David Jr', filter: 'David Mudge Jr' },
  { key: 'houston', label: 'Houston', filter: 'Houston' },
];

function parseResponsibility(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string' && val.startsWith('{') && val.endsWith('}')) {
    return val.slice(1, -1).split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  }
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

function TaskRow({ task, onToggleDone, onSelect, isNew, isTransitioning, onTransitionComplete }) {
  const [justCompleted, setJustCompleted] = useState(false);
  const [sliding, setSliding] = useState(false);
  const transitionTimerRef = useRef(null);

  const isDone = task.status === 'Done' || justCompleted;
  const isDead = task.status === 'Dead';
  const dimmed = (isDone && !justCompleted && !isTransitioning) || isDead;

  const today = new Date().toISOString().split('T')[0];
  const dueDay = task.due_date ? task.due_date.split('T')[0] : null;
  const isOverdue = dueDay && !isDone && !isDead && dueDay < today;
  const isDueToday = dueDay === today && !isDone && !isDead;

  const assignees = parseResponsibility(task.responsibility);
  const isHouston = task.source && task.source.startsWith('houston_');
  const badge = !isDone && !isDead && STATUS_BADGE[task.status];

  const circleColor = justCompleted
    ? 'border-green-500 bg-green-500 scale-110'
    : CIRCLE_COLORS[task.status] || 'border-crm-border';

  const handleToggle = (e) => {
    e.stopPropagation();
    if (task.status === 'Done') {
      onToggleDone(task);
    } else {
      setJustCompleted(true);
      onToggleDone(task);
    }
  };

  // When transitioning (completed but staying in active list), slide out after 5 seconds
  useEffect(() => {
    if (isTransitioning && isDone && !transitionTimerRef.current) {
      transitionTimerRef.current = setTimeout(() => setSliding(true), 4500);
      const completeTimer = setTimeout(() => {
        if (onTransitionComplete) onTransitionComplete(task.action_item_id);
      }, 5200);
      return () => {
        clearTimeout(transitionTimerRef.current);
        clearTimeout(completeTimer);
        transitionTimerRef.current = null;
      };
    }
  }, [isTransitioning, isDone, task.action_item_id, onTransitionComplete]);

  return (
    <div
      className={`group flex items-start gap-3 px-5 py-2.5 cursor-pointer transition-all duration-300
        ${dimmed ? 'opacity-50' : ''} ${justCompleted && !sliding ? 'opacity-70' : ''}
        ${sliding ? 'opacity-0 -translate-x-4 max-h-0 py-0 overflow-hidden' : 'max-h-24'}
        ${isNew ? 'animate-live-insert' : ''} ${!sliding ? 'hover:bg-crm-hover/40' : ''}`}
      style={sliding ? { transition: 'all 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)' } : undefined}
      onClick={() => !sliding && onSelect(task.action_item_id)}
    >
      <button
        onClick={handleToggle}
        className={`w-[20px] h-[20px] rounded-full border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all duration-300 hover:scale-110 ${circleColor}`}
        title={isDone ? 'Mark incomplete' : 'Mark done'}
      >
        {isDone && (
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className={`text-sm ${isDone ? 'line-through text-crm-muted' : 'text-crm-text'}`}>
          {task.high_priority && !isDone && <span className="text-red-400 mr-1">★</span>}
          {task.name || 'Untitled Task'}
          {isHouston && <span className="ml-2 text-[10px] text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded align-middle">Houston</span>}
        </div>
        {task.notes && !isDone && (
          <p className="text-xs text-crm-muted mt-0.5 line-clamp-1">{task.notes.split('\n')[0]}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {dueDay && (
            <span className={`text-[11px] flex items-center gap-0.5 ${
              isOverdue ? 'text-red-400 font-medium' : isDueToday ? 'text-orange-400' : 'text-crm-muted'
            }`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {formatDatePacific(task.due_date)}
            </span>
          )}
          {assignees.length > 0 && (
            <span className="text-[11px] text-crm-muted">{assignees.join(', ')}</span>
          )}
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge}`}>{task.status}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ActionItems({ onCountChange }) {
  const { addToast } = useToast();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeView, setActiveView] = useState('all');
  const [orderBy, setOrderBy] = useState('due_date');
  const [order, setOrder] = useState('ASC');
  const [detailId, setDetailId] = useState(null);
  useDetailPanel(detailId);
  const [totalCount, setTotalCount] = useState(0);
  const [showCompleted, setShowCompleted] = useState(false);
  const [transitioningIds, setTransitioningIds] = useState(new Set());
  const suppressRefetchRef = useRef(0);

  const { myTasks, houstonTasks } = useMemo(() => {
    const my = [];
    const houston = [];
    rows.forEach((row) => {
      if (row.source && row.source.startsWith('houston_')) houston.push(row);
      else my.push(row);
    });
    return { myTasks: my, houstonTasks: houston };
  }, [rows]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      if (filterStatus) filters.status = filterStatus;

      const viewTab = VIEW_TABS.find((t) => t.key === activeView);
      if (viewTab?.filter) filters.responsibility = viewTab.filter;

      const result = await getActionItems({ limit: 500, orderBy, order, filters });
      let resultRows = result.rows || [];

      if (activeView === 'today') {
        const today = new Date().toISOString().split('T')[0];
        resultRows = resultRows.filter((r) => {
          if (!r.due_date) return false;
          return r.due_date.split('T')[0] <= today;
        });
      }

      setRows(resultRows);
      const count = resultRows.length;
      setTotalCount(count);
      if (onCountChange) onCountChange(count);
    } catch (err) {
      console.error('Failed to fetch action items:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterStatus, activeView, orderBy, order, onCountChange]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Wrap fetchData to suppress live-update refetches during completion transitions
  const guardedFetchData = useCallback(() => {
    if (suppressRefetchRef.current > Date.now()) return;
    fetchData();
  }, [fetchData]);
  const { newRecordId } = useLiveUpdates('action_item', guardedFetchData);

  const handleToggleDone = async (task) => {
    const newStatus = task.status === 'Done' ? 'Todo' : 'Done';
    const updates = { status: newStatus };
    if (newStatus === 'Done') {
      updates.date_completed = new Date().toISOString();
      // Keep the task in the active list for 5+ seconds before moving to completed
      setTransitioningIds(prev => new Set(prev).add(task.action_item_id));
      // Suppress live-update refetches so the transition isn't interrupted
      suppressRefetchRef.current = Date.now() + 7000;
    } else {
      updates.date_completed = null;
    }

    // Optimistic update
    setRows(prev => prev.map(r =>
      r.action_item_id === task.action_item_id ? { ...r, ...updates } : r
    ));

    try {
      await updateActionItem(task.action_item_id, updates);
      addToast(newStatus === 'Done' ? 'Task completed' : 'Task reopened');
    } catch (err) {
      console.error('Failed to update task:', err);
      setTransitioningIds(prev => {
        const next = new Set(prev);
        next.delete(task.action_item_id);
        return next;
      });
      fetchData();
    }
  };

  // Called when a task's slide-out animation finishes
  const handleTransitionComplete = useCallback((id) => {
    setTransitioningIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const showHoustonSection = houstonTasks.length > 0;
  const displayTasks = showHoustonSection ? myTasks : rows;

  const { activeTasks, doneTasks } = useMemo(() => {
    const active = [];
    const done = [];
    displayTasks.forEach(t => {
      // Keep transitioning tasks in the active list so they can animate out
      if (t.status === 'Done' && !transitioningIds.has(t.action_item_id)) done.push(t);
      else active.push(t);
    });
    return { activeTasks: active, doneTasks: done };
  }, [displayTasks, transitioningIds]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <svg className="w-5 h-5 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Action Items
            </h1>
            <p className="text-xs text-crm-muted">{totalCount.toLocaleString()} items</p>
          </div>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="text-xs btn-primary px-3 py-1.5 flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Task
          </button>
        </div>

        <div className="flex items-center gap-1 mb-3">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveView(tab.key)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                activeView === tab.key
                  ? 'bg-crm-accent/20 text-crm-accent font-medium'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1" />
          <div className="w-48 relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks..."
              className="w-full bg-crm-hover border-0 rounded-[10px] pl-9 pr-3 py-2.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:ring-2 focus:ring-crm-accent/30" />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50">
            <option value="">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={fetchData} title="Refresh" className="bg-crm-card border border-crm-border rounded-lg p-1.5 text-crm-muted hover:text-crm-text hover:border-crm-accent/50 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-crm-accent/30 border-t-crm-accent rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 && !search && !filterStatus && activeView === 'all' ? (
          <EmptyState entity="tasks" entityLabel="Tasks" onAdd={() => setShowQuickAdd(true)} addLabel="+ New Task" />
        ) : rows.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-crm-muted">No action items found</p>
            <p className="text-xs text-crm-muted/60 mt-1">
              {activeView === 'today' ? 'Nothing due today — nice work!' : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          <>
            {showHoustonSection && activeTasks.length + doneTasks.length > 0 && (
              <div className="px-5 pt-3 pb-1">
                <h2 className="text-[11px] font-semibold text-crm-muted uppercase tracking-wider">My Tasks</h2>
              </div>
            )}

            <div className="divide-y divide-crm-border/30">
              {activeTasks.map((task) => (
                <TaskRow key={task.action_item_id} task={task} onToggleDone={handleToggleDone} onSelect={setDetailId} isNew={task.action_item_id === newRecordId} isTransitioning={transitioningIds.has(task.action_item_id)} onTransitionComplete={handleTransitionComplete} />
              ))}
            </div>

            {doneTasks.length > 0 && (
              <>
                <div className="px-5 pt-4 pb-1">
                  <button
                    onClick={() => setShowCompleted(!showCompleted)}
                    className="text-[11px] font-semibold text-crm-muted uppercase tracking-wider hover:text-crm-text transition-colors flex items-center gap-1"
                  >
                    <svg className={`w-3 h-3 transition-transform ${showCompleted ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Completed ({doneTasks.length})
                  </button>
                </div>
                {showCompleted && (
                  <div className="divide-y divide-crm-border/30">
                    {doneTasks.map((task) => (
                      <TaskRow key={task.action_item_id} task={task} onToggleDone={handleToggleDone} onSelect={setDetailId} isNew={task.action_item_id === newRecordId} />
                    ))}
                  </div>
                )}
              </>
            )}

            {showHoustonSection && (
              <>
                <div className="px-5 pt-5 pb-1 border-t border-crm-border mt-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[11px] font-semibold text-cyan-400 uppercase tracking-wider">Houston's Suggestions</h2>
                    <span className="text-[10px] text-crm-muted bg-crm-card px-1.5 py-0.5 rounded">{houstonTasks.length}</span>
                  </div>
                </div>
                <div className="divide-y divide-crm-border/30">
                  {houstonTasks.map((task) => (
                    <TaskRow key={task.action_item_id} task={task} onToggleDone={handleToggleDone} onSelect={setDetailId} isNew={task.action_item_id === newRecordId} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {detailId && (
        <ActionItemDetail actionItemId={detailId} onClose={() => setDetailId(null)} onSave={() => { setDetailId(null); fetchData(); }} onRefresh={fetchData} />
      )}

      {showQuickAdd && (
        <QuickAddModal
          entityType="action_item"
          onClose={() => setShowQuickAdd(false)}
          onCreated={() => { setShowQuickAdd(false); addToast('Task created'); fetchData(); }}
        />
      )}
    </div>
  );
}
