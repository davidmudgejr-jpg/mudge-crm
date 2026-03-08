import React from 'react';
import { useSlideOver } from './SlideOverContext';
import ENTITY_TYPES from '../../config/entityTypes';

const CHIP_COLORS = {
  contact: 'bg-purple-500/15 text-purple-400',
  property: 'bg-blue-500/15 text-blue-400',
  company: 'bg-yellow-500/15 text-yellow-400',
  deal: 'bg-orange-500/15 text-orange-400',
  campaign: 'bg-teal-500/15 text-teal-400',
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
  const color = CHIP_COLORS[type] || 'bg-crm-border text-crm-muted';
  const idCol = ENTITY_TYPES[type]?.idCol;

  return (
    <div className="flex flex-wrap gap-0.5">
      {shown.map((item, i) => (
        <span
          key={i}
          className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-full font-medium truncate max-w-[120px] cursor-pointer hover:brightness-125 transition-all ${color}`}
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
        <span className="text-[10px] text-crm-muted px-1">+{overflow}</span>
      )}
    </div>
  );
}
