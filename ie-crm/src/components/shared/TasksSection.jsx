import React, { useState } from 'react';
import Section from './Section';
import { useSlideOver } from './SlideOverContext';
import { formatDatePacific } from '../../utils/timezone';

const CIRCLE_COLORS = {
  Todo: 'border-red-500/60',
  Reminders: 'border-blue-500/60',
  'In progress': 'border-yellow-500/60',
  Done: 'border-green-500 bg-green-500',
  Dead: 'border-gray-500/40',
  Email: 'border-cyan-500/60',
  'Needs and Wants': 'border-purple-500/60',
};

const INITIAL_SHOW = 5;

export default function TasksSection({ tasks }) {
  const [expanded, setExpanded] = useState(false);
  const { open } = useSlideOver();

  const shown = expanded ? tasks : tasks.slice(0, INITIAL_SHOW);
  const hasMore = tasks.length > INITIAL_SHOW;

  const isOverdue = (task) =>
    task.due_date && task.status !== 'Done' && task.status !== 'Dead' &&
    new Date(task.due_date).toISOString().split('T')[0] < new Date().toISOString().split('T')[0];

  return (
    <Section
      title="Tasks"
      badge={tasks.length}
      defaultOpen={tasks.length > 0}
    >
      {tasks.length === 0 ? (
        <p className="text-xs text-crm-muted">No tasks linked</p>
      ) : (
        <div className="space-y-1">
          {shown.map((task) => {
            const circleColor = CIRCLE_COLORS[task.status] || 'border-gray-400/40';
            const overdue = isOverdue(task);
            return (
              <button
                key={task.action_item_id}
                onClick={() => open('action_item', task.action_item_id)}
                className="w-full flex gap-3 px-2 py-1.5 -mx-2 rounded-lg hover:bg-crm-card/60 transition-colors cursor-pointer text-left"
              >
                <div className={`w-[14px] h-[14px] rounded-full border-2 flex-shrink-0 mt-0.5 ${circleColor}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs font-medium truncate ${task.status === 'Done' ? 'line-through text-crm-muted' : ''}`}>
                      {task.name || 'Untitled Task'}
                    </span>
                    {task.high_priority && <span className="text-red-400 text-[10px]">★</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-crm-muted">{task.status}</span>
                    {task.due_date && (
                      <span className={`text-[10px] ${overdue ? 'text-red-400' : 'text-crm-muted'}`}>
                        {overdue ? '⚠ ' : ''}{formatDatePacific(task.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {hasMore && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-crm-accent hover:text-crm-accent/70 py-1 transition-colors"
            >
              Show all ({tasks.length})
            </button>
          )}
          {hasMore && expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-crm-muted hover:text-crm-text py-1 transition-colors"
            >
              Show less
            </button>
          )}
        </div>
      )}
    </Section>
  );
}
