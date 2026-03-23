import React, { useState } from 'react';

export default function Section({ title, children, defaultOpen = true, badge, actions }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-crm-border">
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } }}
        className="w-full flex items-center justify-between px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-crm-muted hover:text-crm-text transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge != null && (
            <span className="text-[10px] font-normal bg-crm-card border border-crm-border rounded-full px-1.5 py-0.5 text-crm-muted">
              {badge}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {actions && open && (
            <span onClick={(e) => e.stopPropagation()} className="flex items-center gap-1">
              {actions}
            </span>
          )}
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </span>
      </div>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}
