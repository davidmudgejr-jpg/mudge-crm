import React from 'react';

const BAR_COLORS = {
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  amber: 'bg-amber-500',
  green: 'bg-emerald-500',
  red: 'bg-red-500',
};

export default function ScoreBar({ label, score, max, color = 'blue', annotation }) {
  const pct = max > 0 ? Math.min((score / max) * 100, 100) : 0;
  const barColor = BAR_COLORS[color] || BAR_COLORS.blue;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-crm-muted">{label}</span>
        <span className="font-medium tabular-nums">{score}/{max}</span>
      </div>
      <div className="h-2 bg-crm-card rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {annotation && (
        <div className="text-[10px] text-crm-muted">{annotation}</div>
      )}
    </div>
  );
}
