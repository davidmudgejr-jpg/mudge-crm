// NewViewModal — Clean modal for creating a new saved view
// Shows name input, current filters, sort, and visible columns before saving

import React, { useState, useRef, useEffect } from 'react';

export default function NewViewModal({
  isOpen,
  onClose,
  onSave,
  filters = [],
  filterLogic = 'AND',
  sort = {},
  columnDefs = [],
  visibleColumnKeys = null,
  onOpenFilterBuilder,
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  // Focus name input when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setSaving(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      console.error('[NewViewModal] Save failed:', err);
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onClose();
  };

  const visibleCount = visibleColumnKeys
    ? visibleColumnKeys.length
    : columnDefs.filter(c => c.defaultVisible !== false).length;
  const totalCount = columnDefs.length;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[65] bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed z-[66] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] bg-crm-bg border border-crm-border/50 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-crm-border/30">
          <h3 className="text-sm font-semibold text-crm-text">Create New View</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-crm-hover/50 text-crm-muted hover:text-crm-text transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* View name */}
          <div>
            <label className="block text-[11px] text-crm-muted uppercase tracking-wider mb-1.5">View Name</label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Hot Leads, Riverside Industrial, Closing Soon..."
              className="w-full bg-crm-card/60 border border-crm-border/40 rounded-lg text-sm text-crm-text px-3 py-2.5 outline-none focus:border-crm-accent/50 placeholder-crm-muted/40 transition-colors"
            />
          </div>

          {/* Filters summary */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] text-crm-muted uppercase tracking-wider">Filters</label>
              <button
                onClick={() => { onClose(); onOpenFilterBuilder?.(); }}
                className="text-[11px] text-crm-accent hover:text-crm-accent/80 transition-colors"
              >
                Edit Filters
              </button>
            </div>
            <div className="bg-crm-card/40 rounded-lg border border-crm-border/20 px-3 py-2.5 min-h-[40px]">
              {filters.length === 0 ? (
                <span className="text-xs text-crm-muted/50">No filters — view will show all records</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {filters.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1 bg-crm-accent/10 text-crm-accent text-[11px] px-2 py-1 rounded-md">
                      <span className="font-medium">{f.column}</span>
                      <span className="text-crm-muted">{f.operator}</span>
                      {f.value != null && f.value !== '' && (
                        <span className="text-crm-text">{String(f.value)}</span>
                      )}
                    </span>
                  ))}
                  {filters.length > 1 && (
                    <span className="text-[10px] text-crm-muted/60 self-center">({filterLogic})</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sort + columns summary row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-[11px] text-crm-muted uppercase tracking-wider mb-1.5">Sort</label>
              <div className="bg-crm-card/40 rounded-lg border border-crm-border/20 px-3 py-2 text-xs text-crm-text">
                {sort.column ? (
                  <span>
                    {sort.column.replace(/_/g, ' ')}
                    <span className="text-crm-muted ml-1">{sort.direction === 'ASC' ? '\u2191' : '\u2193'}</span>
                  </span>
                ) : (
                  <span className="text-crm-muted/50">Default</span>
                )}
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-crm-muted uppercase tracking-wider mb-1.5">Columns</label>
              <div className="bg-crm-card/40 rounded-lg border border-crm-border/20 px-3 py-2 text-xs text-crm-text">
                {visibleCount} of {totalCount} visible
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-crm-border/30 bg-crm-card/20">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-crm-muted hover:text-crm-text rounded-lg hover:bg-crm-hover/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="px-5 py-2 text-xs font-semibold bg-crm-accent text-white rounded-lg hover:bg-crm-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Create View'}
          </button>
        </div>
      </div>
    </>
  );
}
