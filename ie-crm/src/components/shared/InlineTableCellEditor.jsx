import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * Infer the edit input type from a column's format string.
 */
function inferEditType(format) {
  switch (format) {
    case 'number': case 'currency': case 'percent': return 'number';
    case 'date': case 'datetime': return 'date';
    case 'bool': case 'checkbox': return 'boolean';
    case 'tags': return 'tags';
    case 'priority': case 'status': case 'type': case 'level': case 'single_select': return 'select';
    case 'email': return 'email';
    case 'phone': return 'tel';
    case 'url': return 'url';
    default: return 'text';
  }
}

/**
 * Parse a raw draft value into the correct type for saving.
 */
function parseValue(raw, editType) {
  if (raw === '' || raw === null || raw === undefined) return null;
  if (editType === 'number') {
    const n = Number(raw);
    return isNaN(n) ? null : n;
  }
  return raw;
}

/**
 * Inline cell editor for native (DB-backed) table columns.
 * Supports: text, number, date, select, multi-select, boolean, tags, email, tel, url.
 */
export default function InlineTableCellEditor({ value, column, onSave, onCancel, onChange }) {
  const editType = column.editType || inferEditType(column.format);
  const options = column.editOptions || [];

  // ── Boolean: toggle immediately ──
  if (editType === 'boolean') {
    const cur = value === true || value === 'true';
    // Fire save synchronously and return null (no visible editor)
    Promise.resolve().then(() => onSave(!cur));
    return null;
  }

  // ── Multi-select (TEXT[] with fixed options) ──
  if (editType === 'multi-select' && options.length > 0) {
    return <MultiSelectEditor value={value} options={options} onSave={onSave} onCancel={onCancel} />;
  }

  // ── Tags (freeform TEXT[] — comma-separated input) ──
  if (editType === 'tags') {
    return <TagsEditor value={value} onSave={onSave} onCancel={onCancel} />;
  }

  // ── Select (single value from options) ──
  if (editType === 'select') {
    return <SelectEditor value={value} options={options} onSave={onSave} onCancel={onCancel} onChange={onChange} />;
  }

  // ── Standard input (text, number, date, email, tel, url) ──
  return <TextEditor value={value} editType={editType} onSave={onSave} onCancel={onCancel} onChange={onChange} />;
}

/* ── Text / Number / Date / Email / URL / Tel ─────────────────────── */

function TextEditor({ value, editType, onSave, onCancel, onChange }) {
  const inputType = editType === 'number' ? 'number'
    : editType === 'date' ? 'date'
    : editType === 'email' ? 'email'
    : editType === 'tel' ? 'tel'
    : editType === 'url' ? 'url'
    : 'text';

  const initial = editType === 'date' && value
    ? new Date(value).toISOString().split('T')[0]
    : (value ?? '');

  const [draft, setDraft] = useState(initial);
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.focus();
      if (inputType === 'text' || inputType === 'email' || inputType === 'url' || inputType === 'tel') {
        ref.current.select();
      }
    }
  }, []);

  const commit = () => {
    const parsed = parseValue(draft, editType);
    onSave(parsed);
  };

  return (
    <input
      ref={ref}
      type={inputType}
      value={draft}
      step={inputType === 'number' ? 'any' : undefined}
      onChange={(e) => { setDraft(e.target.value); onChange?.(e.target.value); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      className="w-full bg-crm-card border border-crm-accent/50 rounded px-1.5 py-0.5 text-sm text-crm-text focus:outline-none"
    />
  );
}

/* ── Select (single) ──────────────────────────────────────────────── */

function SelectEditor({ value, options, onSave, onCancel, onChange }) {
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <select
      ref={ref}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange?.(e.target.value);
        onSave(e.target.value || null);
      }}
      onBlur={() => onSave(draft || null)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      className="w-full bg-crm-card border border-crm-accent/50 rounded px-1.5 py-0.5 text-sm text-crm-text focus:outline-none"
    >
      <option value="">—</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

/* ── Multi-select (TEXT[] with checkboxes) ─────────────────────────── */

function MultiSelectEditor({ value, options, onSave, onCancel }) {
  const arr = Array.isArray(value) ? [...value] : (value ? [value] : []);
  const [selected, setSelected] = useState(arr);
  const anchorRef = useRef(null);
  const dropdownRef = useRef(null);
  const [pos, setPos] = useState(null);

  // Position the dropdown relative to the anchor, using fixed positioning
  // so it escapes any overflow:auto scroll containers.
  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownH = Math.min(options.length * 28 + 8, 192); // estimate
    const openAbove = spaceBelow < dropdownH && rect.top > dropdownH;
    setPos({
      top: openAbove ? rect.top - dropdownH - 4 : rect.bottom + 4,
      left: rect.left,
      minWidth: Math.max(rect.width, 180),
    });
  }, [options.length]);

  // Close on outside click → save
  useEffect(() => {
    const handler = (e) => {
      if (
        anchorRef.current && !anchorRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        onSave(selected.length ? selected : null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selected, onSave]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  const toggle = (opt) => {
    setSelected((prev) => {
      if (prev.includes(opt)) return prev.filter((v) => v !== opt);
      return [...prev, opt];
    });
  };

  const dropdown = pos && createPortal(
    <div
      ref={dropdownRef}
      className="fixed bg-crm-card border border-crm-border rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto"
      style={{ top: pos.top, left: pos.left, minWidth: pos.minWidth, zIndex: 9999 }}
    >
      {options.map((opt) => {
        const checked = selected.includes(opt);
        return (
          <button
            key={opt}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); toggle(opt); }}
            className="w-full text-left px-3 py-1 text-xs text-crm-text hover:bg-crm-hover transition-colors flex items-center gap-2"
          >
            <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-crm-accent border-crm-accent' : 'border-crm-border'}`}>
              {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </span>
            {opt}
          </button>
        );
      })}
    </div>,
    document.body
  );

  return (
    <div ref={anchorRef}>
      <div className="flex flex-wrap gap-0.5 min-h-[24px]">
        {selected.length ? selected.map((v, i) => (
          <span key={i} className="text-[10px] bg-crm-card border border-crm-border rounded px-1 py-0">{v}</span>
        )) : <span className="text-crm-muted text-xs">Select...</span>}
      </div>
      {dropdown}
    </div>
  );
}

/* ── Tags (freeform comma-separated TEXT[]) ────────────────────────── */

function TagsEditor({ value, onSave, onCancel }) {
  const arr = Array.isArray(value) ? value : [];
  const [draft, setDraft] = useState(arr.join(', '));
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) { ref.current.focus(); ref.current.select(); }
  }, []);

  const commit = () => {
    const tags = draft.split(',').map((s) => s.trim()).filter(Boolean);
    onSave(tags.length ? tags : null);
  };

  return (
    <input
      ref={ref}
      type="text"
      value={draft}
      placeholder="tag1, tag2, ..."
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      className="w-full bg-crm-card border border-crm-accent/50 rounded px-1.5 py-0.5 text-sm text-crm-text focus:outline-none"
    />
  );
}
