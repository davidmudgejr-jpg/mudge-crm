import React from 'react';

const CHIP_COLORS = {
  contact: 'bg-blue-500/15 text-blue-400',
  property: 'bg-emerald-500/15 text-emerald-400',
  company: 'bg-purple-500/15 text-purple-400',
  deal: 'bg-orange-500/15 text-orange-400',
  campaign: 'bg-pink-500/15 text-pink-400',
};

/**
 * Renders an array of linked records as compact colored chips.
 * Shows up to `max` items with a "+N" overflow indicator.
 */
export default function LinkedChips({ items, type, labelKey, max = 2 }) {
  if (!items?.length) return <span className="text-crm-muted">--</span>;

  const shown = items.slice(0, max);
  const overflow = items.length - max;
  const color = CHIP_COLORS[type] || 'bg-crm-border text-crm-muted';

  return (
    <div className="flex flex-wrap gap-0.5">
      {shown.map((item, i) => (
        <span
          key={i}
          className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-full font-medium truncate max-w-[120px] ${color}`}
          title={item[labelKey]}
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
