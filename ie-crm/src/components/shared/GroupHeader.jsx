import React, { useMemo } from 'react';
import { pickDisplayAggregates } from '../../utils/groupRows';

export default function GroupHeader({
  groupLabel,       // column label (e.g., "Status")
  groupValue,       // display value (e.g., "Active")
  rowCount,
  aggregates,
  visibleColumns,
  collapsed,
  onToggle,
  colSpan,
}) {
  const summaries = useMemo(
    () => pickDisplayAggregates(aggregates, visibleColumns, rowCount),
    [aggregates, visibleColumns, rowCount]
  );

  return (
    <tr
      className="group/gh cursor-pointer select-none bg-crm-bg/80 border-b border-crm-border/30 hover:bg-crm-hover/50 transition-colors"
      onClick={onToggle}
    >
      <td colSpan={colSpan} className="px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Chevron */}
          <svg
            className="w-3.5 h-3.5 text-crm-muted shrink-0 transition-transform duration-200"
            style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" />
          </svg>

          {/* Group label + value */}
          <span className="text-xs font-medium text-crm-muted shrink-0">{groupLabel}:</span>
          <span className="text-xs font-semibold text-crm-text truncate">{groupValue}</span>

          {/* Count badge */}
          <span className="text-[10px] text-crm-muted bg-crm-card border border-crm-border rounded-full px-1.5 py-0 shrink-0">
            {rowCount}
          </span>

          {/* Aggregate summaries */}
          {summaries.length > 0 && (
            <span className="text-[10px] text-crm-muted ml-1 truncate hidden sm:inline">
              {summaries.join('  ·  ')}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}
