import React from 'react';
import { useSlideOver } from './SlideOverContext';
import ENTITY_TYPES from '../../config/entityTypes';
import { CHIP_STYLES } from './LinkedChips';

// Clickable chip that opens a SlideOver for the linked entity.
// If onUnlink is provided, an X button appears for removing the link.

export default function LinkedRecord({ entityType, entityId, label, secondary, onUnlink }) {
  const { open } = useSlideOver();
  const chipStyle = CHIP_STYLES[entityType] || null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium cursor-pointer hover:brightness-125 hover:scale-[1.02] transition-all group ${!chipStyle ? 'bg-crm-card text-crm-muted border border-crm-border' : ''}`}
      style={{
        transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
        ...(chipStyle || {}),
      }}
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
