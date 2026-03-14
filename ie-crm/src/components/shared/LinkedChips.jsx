import React from 'react';
import { useSlideOver } from './SlideOverContext';
import ENTITY_TYPES from '../../config/entityTypes';

export const CHIP_STYLES = {
  contact: {
    background: 'linear-gradient(135deg, rgba(175,82,222,0.18), rgba(94,92,230,0.18))',
    color: '#BF5AF2',
    boxShadow: '0 1px 4px rgba(175,82,222,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  property: {
    background: 'linear-gradient(135deg, rgba(0,122,255,0.18), rgba(88,86,214,0.18))',
    color: '#64D2FF',
    boxShadow: '0 1px 4px rgba(0,122,255,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  company: {
    background: 'linear-gradient(135deg, rgba(255,214,10,0.18), rgba(255,159,10,0.18))',
    color: '#FFD60A',
    boxShadow: '0 1px 4px rgba(255,214,10,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  deal: {
    background: 'linear-gradient(135deg, rgba(255,159,10,0.18), rgba(255,69,58,0.18))',
    color: '#FF9F0A',
    boxShadow: '0 1px 4px rgba(255,159,10,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
  },
  campaign: {
    background: 'linear-gradient(135deg, rgba(48,209,88,0.18), rgba(90,200,250,0.18))',
    color: '#30D158',
    boxShadow: '0 1px 4px rgba(48,209,88,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
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
          className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-full font-medium truncate max-w-[120px] cursor-pointer hover:brightness-125 hover:scale-[1.02] transition-all ${!chipStyle ? 'bg-crm-border text-crm-muted' : ''}`}
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
        <span className="text-[10px] text-crm-muted px-1">+{overflow}</span>
      )}
    </div>
  );
}
