import React from 'react';

const TIER_STYLES = {
  A: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  B: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  C: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  D: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

export default function TierBadge({ tier, size = 'sm' }) {
  const style = TIER_STYLES[tier] || TIER_STYLES.C;
  const sizeClass = size === 'lg'
    ? 'text-sm px-2.5 py-1 font-bold'
    : 'text-[11px] px-1.5 py-0.5 font-semibold';
  return (
    <span className={`inline-flex items-center justify-center rounded-full border ${style} ${sizeClass}`}>
      {tier}
    </span>
  );
}
