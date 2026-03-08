import React from 'react';
import TYPE_ICONS from '../../config/typeIcons';
import { formatDateCompact } from '../../utils/timezone';

function displayText(int) {
  if (int.type === 'Note' && int.notes) {
    const clean = int.notes.split(/\n\n---\s/)[0].trim();
    return clean.length > 40 ? clean.slice(0, 40) + '...' : clean;
  }
  const base = int.type || 'Activity';
  const detail = int.email_heading || int.subject;
  if (detail) {
    const combined = `${base} — ${detail}`;
    return combined.length > 45 ? combined.slice(0, 45) + '...' : combined;
  }
  return base;
}

export default function ActivityCellPreview({ interactions, onExpand }) {
  if (!interactions || interactions.length === 0) {
    return <span className="text-crm-muted">--</span>;
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); onExpand(); }}
      className="cursor-pointer hover:bg-crm-hover/40 -mx-1 px-1 rounded transition-colors"
    >
      {interactions.slice(0, 3).map((int) => {
        const typeInfo = TYPE_ICONS[int.type] || TYPE_ICONS.Other;
        return (
          <div key={int.interaction_id} className="flex items-center gap-1.5 py-[2px]">
            <div className={`w-[14px] h-[14px] rounded-full flex items-center justify-center flex-shrink-0 ${typeInfo.color}`}>
              <svg className="w-[8px] h-[8px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={typeInfo.icon} />
              </svg>
            </div>
            <span className="text-[11px] truncate flex-1 min-w-0">{displayText(int)}</span>
            <span className="text-[10px] text-crm-muted flex-shrink-0 ml-auto">{formatDateCompact(int.date)}</span>
          </div>
        );
      })}
      {interactions.length > 3 && (
        <span className="text-[10px] text-crm-accent">+{interactions.length - 3} more</span>
      )}
    </div>
  );
}
