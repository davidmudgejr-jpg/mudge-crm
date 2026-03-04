import React, { useState, useRef, useEffect } from 'react';
import { FIELD_TYPES } from '../../config/fieldTypes';

/**
 * Airtable-style "Add Field" panel.
 *
 * Phase 1 — pick a field type from the list.
 * Phase 2 — enter a field name (and options for single select), then confirm.
 *
 * @param {{ onAdd: (name, type, options?) => void, onClose: () => void }} props
 */
export default function AddFieldPanel({ onAdd, onClose }) {
  const [phase, setPhase] = useState('pick'); // 'pick' | 'name'
  const [selectedType, setSelectedType] = useState(null);
  const [fieldName, setFieldName] = useState('');
  const [search, setSearch] = useState('');
  const [selectOptions, setSelectOptions] = useState('');
  const panelRef = useRef(null);
  const nameRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Auto-focus name input
  useEffect(() => {
    if (phase === 'name' && nameRef.current) nameRef.current.focus();
  }, [phase]);

  const filteredTypes = FIELD_TYPES.filter((ft) =>
    ft.label.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (ft) => {
    setSelectedType(ft);
    setFieldName(ft.label);
    setSelectOptions(ft.defaultOptions ? ft.defaultOptions.join(', ') : '');
    setPhase('name');
  };

  const handleConfirm = () => {
    if (!fieldName.trim()) return;
    const options =
      selectedType.type === 'single_select' && selectOptions.trim()
        ? selectOptions.split(',').map((s) => s.trim()).filter(Boolean)
        : selectedType.defaultOptions || undefined;
    onAdd(fieldName.trim(), selectedType.type, options);
    onClose();
  };

  return (
    <div
      ref={panelRef}
      className="absolute top-0 right-0 z-50 w-72 bg-crm-sidebar border border-crm-border rounded-lg shadow-xl animate-fade-in overflow-hidden"
      style={{ maxHeight: '70vh' }}
    >
      {phase === 'pick' && (
        <>
          {/* Search */}
          <div className="p-2 border-b border-crm-border">
            <input
              type="text"
              placeholder="Find a field type"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              className="w-full bg-crm-card border border-crm-border rounded px-2.5 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
            />
          </div>

          {/* Field type list */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 52px)' }}>
            <div className="px-2 pt-2 pb-1">
              <span className="text-[10px] uppercase tracking-wider text-crm-muted font-medium px-1">
                Standard fields
              </span>
            </div>
            {filteredTypes.map((ft) => (
              <button
                key={ft.type}
                onClick={() => handleSelect(ft)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-crm-text hover:bg-crm-hover transition-colors text-left"
              >
                <span
                  className={`w-6 h-6 flex items-center justify-center rounded bg-crm-card border border-crm-border text-crm-muted ${ft.iconClass}`}
                >
                  {ft.icon}
                </span>
                <span>{ft.label}</span>
              </button>
            ))}
            {filteredTypes.length === 0 && (
              <p className="px-3 py-4 text-xs text-crm-muted text-center">No matching field types</p>
            )}
          </div>
        </>
      )}

      {phase === 'name' && selectedType && (
        <div className="p-3 space-y-3">
          {/* Back + type indicator */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPhase('pick')}
              className="text-crm-muted hover:text-crm-text transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span
              className={`w-5 h-5 flex items-center justify-center rounded bg-crm-card border border-crm-border text-crm-muted text-xs ${selectedType.iconClass}`}
            >
              {selectedType.icon}
            </span>
            <span className="text-xs text-crm-muted">{selectedType.label}</span>
          </div>

          {/* Field name */}
          <div>
            <label className="block text-xs text-crm-muted mb-1">Field name</label>
            <input
              ref={nameRef}
              type="text"
              value={fieldName}
              onChange={(e) => setFieldName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
              className="w-full bg-crm-card border border-crm-border rounded px-2.5 py-1.5 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
            />
          </div>

          {/* Single select options */}
          {selectedType.type === 'single_select' && (
            <div>
              <label className="block text-xs text-crm-muted mb-1">Options (comma-separated)</label>
              <input
                type="text"
                value={selectOptions}
                onChange={(e) => setSelectOptions(e.target.value)}
                placeholder="Option 1, Option 2, Option 3"
                className="w-full bg-crm-card border border-crm-border rounded px-2.5 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleConfirm}
              disabled={!fieldName.trim()}
              className="flex-1 bg-crm-accent hover:bg-crm-accent-hover disabled:opacity-40 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
            >
              Add field
            </button>
            <button
              onClick={onClose}
              className="text-xs text-crm-muted hover:text-crm-text px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
