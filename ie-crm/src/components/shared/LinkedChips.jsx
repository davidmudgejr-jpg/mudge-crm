import React from 'react';
import { useSlideOver } from './SlideOverContext';
import ENTITY_TYPES from '../../config/entityTypes';

export const CHIP_STYLES = {
  contact: {
    background: 'var(--chip-contact-bg)',
    color: 'var(--chip-contact-color)',
    boxShadow: 'var(--chip-contact-shadow)',
  },
  property: {
    background: 'var(--chip-property-bg)',
    color: 'var(--chip-property-color)',
    boxShadow: 'var(--chip-property-shadow)',
  },
  company: {
    background: 'var(--chip-company-bg)',
    color: 'var(--chip-company-color)',
    boxShadow: 'var(--chip-company-shadow)',
  },
  deal: {
    background: 'var(--chip-deal-bg)',
    color: 'var(--chip-deal-color)',
    boxShadow: 'var(--chip-deal-shadow)',
  },
  campaign: {
    background: 'var(--chip-campaign-bg)',
    color: 'var(--chip-campaign-color)',
    boxShadow: 'var(--chip-campaign-shadow)',
  },
};

/**
 * Renders an array of linked records as compact colored chips.
 * Clicking a chip opens that record's detail panel (via SlideOverContext),
 * stopping propagation so the parent row click doesn't fire.
 * Shows up to `max` items with a "+N" overflow indicator.
 */
export default function LinkedChips({ items, type, labelKey, max = 2 }) {
  const { open } = useSlideOver();

  if (!items?.length) return <span className="text-crm-muted">--</span>;

  const shown = items.slice(0, max);
  const overflow = items.length - max;
  const chipStyle = CHIP_STYLES[type] || null;
  const idCol = ENTITY_TYPES[type]?.idCol;

  return (
    <div className="flex flex-wrap gap-0.5">
      {shown.map((item, i) => (
        <span
          key={i}
          className={`text-xs leading-snug px-2 py-1 rounded-full font-medium truncate max-w-[150px] cursor-pointer hover:brightness-125 hover:scale-[1.02] transition-all ${!chipStyle ? 'bg-crm-border text-crm-muted' : ''}`}
          style={{
            transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            ...(chipStyle || {}),
          }}
          title={item[labelKey]}
          onClick={(e) => {
            e.stopPropagation();
            if (idCol && item[idCol]) open(type, item[idCol]);
          }}
        >
          {item[labelKey]}
        </span>
      ))}
      {overflow > 0 && (
        <span className="text-xs text-crm-muted px-1">+{overflow}</span>
      )}
    </div>
  );
}
