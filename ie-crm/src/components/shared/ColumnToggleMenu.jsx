import React, { useState, useRef, useEffect } from 'react';

/**
 * Dropdown popover for toggling column visibility.
 *
 * @param {{ allColumns: Array<{key:string, label:string}>, visibleKeys: string[], toggleColumn: (key:string)=>void, showAll: ()=>void, hideAll: ()=>void, resetDefaults: ()=>void }} props
 */
export default function ColumnToggleMenu({ allColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults }) {
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

  const count = visibleKeys.length;
  const total = allColumns.length;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-crm-border bg-crm-card text-crm-text hover:bg-crm-hover transition-colors"
      >
        <svg className="w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
        </svg>
        Columns
        {count < total && (
          <span className="text-[10px] text-crm-muted">({count}/{total})</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 max-h-80 overflow-y-auto rounded-lg border border-crm-border bg-crm-sidebar shadow-xl">
          {/* Header actions */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-crm-border">
            <span className="text-[10px] font-medium text-crm-muted uppercase tracking-wider">Toggle Columns</span>
            <div className="flex gap-2">
              <button onClick={showAll} className="text-[10px] text-crm-accent hover:underline">All</button>
              <button onClick={hideAll} className="text-[10px] text-crm-accent hover:underline">None</button>
              {resetDefaults && (
                <button onClick={resetDefaults} className="text-[10px] text-crm-accent hover:underline">Reset</button>
              )}
            </div>
          </div>

          {/* Column list */}
          <div className="py-1">
            {allColumns.map((col) => {
              const checked = visibleKeys.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => toggleColumn(col.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-left hover:bg-crm-hover transition-colors"
                >
                  <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                    checked ? 'bg-crm-accent border-crm-accent' : 'border-crm-border'
                  }`}>
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-xs text-crm-text truncate">{col.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
