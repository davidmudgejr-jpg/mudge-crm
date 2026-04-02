import React, { useState, useRef, useEffect } from 'react';

/**
 * Dropdown button for selecting which column to group rows by.
 * Matches the visual style of ColumnToggleMenu.
 */
export default function GroupByButton({ columns, groupByColumn, onGroupByChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // Filter to groupable columns (exclude linked, computed-only)
  const groupable = columns.filter(col =>
    !col.key.startsWith('linked_') &&
    !col.key.startsWith('_') &&
    (col.type || col.format || col.editType) // has a real data backing
  );

  const activeLabel = groupByColumn
    ? groupable.find(c => c.key === groupByColumn)?.label || groupByColumn
    : null;

  const isActive = !!groupByColumn;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(p => !p)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
          isActive
            ? 'bg-crm-accent/12 text-crm-accent border-crm-accent/30 hover:bg-crm-accent/20'
            : 'border-crm-border bg-crm-card text-crm-text hover:bg-crm-hover'
        }`}
      >
        {/* Layer group icon */}
        <svg className={`w-3.5 h-3.5 ${isActive ? 'text-crm-accent' : 'text-crm-muted'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        {isActive ? (
          <>
            <span className="truncate max-w-[100px]">{activeLabel}</span>
            {/* Clear button */}
            <span
              role="button"
              className="ml-0.5 hover:text-crm-text transition-colors"
              onClick={(e) => { e.stopPropagation(); onGroupByChange(null); }}
              title="Clear grouping"
            >
              ×
            </span>
          </>
        ) : (
          'Group'
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-52 max-h-72 overflow-y-auto rounded-lg border border-crm-border bg-crm-card shadow-xl animate-sheet-down">
          {/* None option */}
          <button
            onClick={() => { onGroupByChange(null); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-crm-hover transition-colors border-b border-crm-border ${
              !groupByColumn ? 'text-crm-accent font-medium' : 'text-crm-text'
            }`}
          >
            <span className={`w-3 text-center ${!groupByColumn ? 'opacity-100' : 'opacity-0'}`}>✓</span>
            None
          </button>

          {/* Groupable columns */}
          {groupable.map(col => (
            <button
              key={col.key}
              onClick={() => { onGroupByChange(col.key); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-crm-hover transition-colors ${
                groupByColumn === col.key ? 'text-crm-accent font-medium' : 'text-crm-text'
              }`}
            >
              <span className={`w-3 text-center ${groupByColumn === col.key ? 'opacity-100' : 'opacity-0'}`}>✓</span>
              {col.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
