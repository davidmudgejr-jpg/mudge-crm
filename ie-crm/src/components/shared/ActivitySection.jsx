import React, { useState } from 'react';
import Section from './Section';
import { getTypeInfo } from '../../config/typeIcons';
import { formatDateCompact } from '../../utils/timezone';

const INITIAL_SHOW = 5;

export default function ActivitySection({ interactions, onNewInteraction, onSelectInteraction }) {
  const [expanded, setExpanded] = useState(false);

  const shown = expanded ? interactions : interactions.slice(0, INITIAL_SHOW);
  const hasMore = interactions.length > INITIAL_SHOW;

  return (
    <Section
      title="Activity"
      badge={interactions.length}
      defaultOpen={interactions.length > 0}
      actions={
        onNewInteraction && (
          <button onClick={onNewInteraction} className="text-crm-accent hover:text-crm-accent/70 text-xs font-medium">+ Activity</button>
        )
      }
    >
      {interactions.length === 0 ? (
        <p className="text-xs text-crm-muted">No interactions</p>
      ) : (
        <div className="space-y-1">
          {shown.map((int) => {
            const typeInfo = getTypeInfo(int.type);
            return (
              <button
                key={int.interaction_id}
                onClick={() => onSelectInteraction?.(int.interaction_id)}
                className="w-full flex gap-3 px-2 py-1.5 -mx-2 rounded-lg hover:bg-crm-card/60 transition-colors cursor-pointer text-left"
              >
                <div className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${typeInfo.color}`}>
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeInfo.icon} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">
                    {typeInfo.displayName}{int.email_heading ? ` — ${int.email_heading}` : ''}
                  </div>
                  {int.notes && (
                    <div className="text-xs text-crm-muted mt-0.5 line-clamp-2">{int.notes.split(/\n\n---\s/)[0].trim()}</div>
                  )}
                  <div className="text-[10px] text-crm-muted mt-0.5">{formatDateCompact(int.date) || ''}</div>
                </div>
              </button>
            );
          })}
          {hasMore && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="text-xs text-crm-accent hover:text-crm-accent/70 py-1 transition-colors"
            >
              Show all ({interactions.length})
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
