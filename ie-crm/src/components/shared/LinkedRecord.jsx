import React from 'react';
import { useSlideOver } from './SlideOverContext';
import ENTITY_TYPES from '../../config/entityTypes';

// Clickable chip that opens a SlideOver for the linked entity.
// If onUnlink is provided, an X button appears for removing the link.

export default function LinkedRecord({ entityType, entityId, label, secondary, onUnlink }) {
  const { open } = useSlideOver();
  const meta = ENTITY_TYPES[entityType];
  const color = meta?.chipColor || 'bg-crm-card text-crm-muted border-crm-border';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded border cursor-pointer hover:brightness-125 transition-all group ${color}`}
      onClick={() => open(entityType, entityId)}
      title={secondary ? `${label} — ${secondary}` : label}
    >
      <span className="truncate max-w-[180px]">{label}</span>
      {onUnlink && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onUnlink(entityId);
          }}
          className="opacity-0 group-hover:opacity-100 text-current hover:text-red-400 transition-opacity ml-0.5 -mr-0.5"
          title="Remove link"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
