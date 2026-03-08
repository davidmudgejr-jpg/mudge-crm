import React, { useState, useRef, useEffect } from 'react';
import { formatDatePacific } from '../../utils/timezone';

/**
 * Click-to-edit field component.
 * Read mode: shows formatted value with subtle hover indicator.
 * Click → edit mode with focused input. Blur/Enter saves, Escape cancels.
 *
 * Props:
 *  - label: string
 *  - value: current value
 *  - field: field key (passed to onSave)
 *  - onSave: async (field, newValue) => void
 *  - type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'boolean' | 'url' | 'email' | 'phone'
 *  - options: array of { value, label } for select type, or string[] (auto-mapped)
 *  - format: (value) => ReactNode — custom read-mode rendering
 *  - readOnly: boolean — disables editing
 *  - placeholder: string
 *  - parse: (rawValue) => parsedValue — transform before saving (e.g. parseInt)
 */
export default function InlineField({
  label,
  value,
  field,
  onSave,
  type = 'text',
  options,
  format,
  readOnly = false,
  placeholder,
  parse,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  // Sync draft when value changes externally
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.select && type !== 'textarea') {
        inputRef.current.select();
      }
    }
  }, [editing, type]);

  const normalizeOptions = () => {
    if (!options) return [];
    return options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  };

  const activate = () => {
    if (readOnly || saving) return;
    setDraft(value ?? '');
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  const save = async () => {
    const parsed = parse ? parse(draft) : draft;
    // Don't save if unchanged
    if (parsed === value || (parsed === '' && (value === null || value === undefined))) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(field, parsed === '' ? null : parsed);
    } catch (err) {
      console.error(`InlineField save failed for ${field}:`, err);
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
    if (e.key === 'Enter' && type !== 'textarea') {
      e.preventDefault();
      save();
    }
  };

  // -- Multi-select (tags/checkboxes) --
  if (type === 'multi-select') {
    const arr = Array.isArray(value) ? value : (value ? [value] : []);
    const opts = options || [];
    const [msOpen, setMsOpen] = useState(false);
    const msRef = useRef(null);

    // Close on outside click
    useEffect(() => {
      if (!msOpen) return;
      const handler = (e) => { if (msRef.current && !msRef.current.contains(e.target)) setMsOpen(false); };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [msOpen]);

    const toggleOption = async (opt) => {
      const next = arr.includes(opt) ? arr.filter((v) => v !== opt) : [...arr, opt];
      setSaving(true);
      try { await onSave(field, next.length ? next : null); }
      catch (err) { console.error(err); }
      finally { setSaving(false); }
    };

    return (
      <div className="mb-3 relative" ref={msRef}>
        <div className="text-[10px] text-crm-muted uppercase tracking-wider mb-0.5">{label}</div>
        {readOnly ? (
          <div className="flex flex-wrap gap-1">
            {arr.length ? arr.map((v, i) => (
              <span key={i} className="text-[10px] bg-crm-card border border-crm-border rounded px-1.5 py-0.5">{v}</span>
            )) : <span className="text-crm-muted italic text-sm">--</span>}
          </div>
        ) : (
          <>
            <button
              onClick={() => setMsOpen((v) => !v)}
              className="w-full text-left text-sm rounded px-1 -mx-1 py-0.5 hover:bg-crm-border/30 transition-colors"
            >
              {arr.length ? (
                <span className="flex flex-wrap gap-1">
                  {arr.map((v, i) => (
                    <span key={i} className="text-[10px] bg-crm-card border border-crm-border rounded px-1.5 py-0.5">{v}</span>
                  ))}
                </span>
              ) : (
                <span className="text-crm-muted italic">{placeholder || '--'}</span>
              )}
            </button>
            {msOpen && (
              <div className="absolute left-0 top-full mt-1 bg-crm-card border border-crm-border rounded-lg shadow-xl z-50 py-1 max-h-60 overflow-y-auto min-w-[200px]">
                {opts.map((opt) => {
                  const optStr = typeof opt === 'string' ? opt : opt.value;
                  const checked = arr.includes(optStr);
                  return (
                    <button
                      key={optStr}
                      onClick={() => toggleOption(optStr)}
                      className="w-full text-left px-3 py-1.5 text-xs text-crm-text hover:bg-crm-hover transition-colors flex items-center gap-2"
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${checked ? 'bg-crm-accent border-crm-accent' : 'border-crm-border'}`}>
                        {checked && <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                      </span>
                      {optStr}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // -- Boolean toggle (no edit mode, just click to toggle) --
  if (type === 'boolean') {
    const boolVal = value === true || value === 'true';
    return (
      <div className="mb-3">
        <div className="text-[10px] text-crm-muted uppercase tracking-wider mb-0.5">{label}</div>
        {readOnly ? (
          <div className="text-sm">{boolVal ? 'Yes' : 'No'}</div>
        ) : (
          <button
            onClick={async () => {
              setSaving(true);
              try { await onSave(field, !boolVal); }
              catch (err) { console.error(err); }
              finally { setSaving(false); }
            }}
            disabled={saving}
            className="text-sm px-2 py-0.5 rounded border border-crm-border hover:border-crm-accent/50 transition-colors disabled:opacity-50"
          >
            {saving ? '...' : boolVal ? 'Yes' : 'No'}
          </button>
        )}
      </div>
    );
  }

  // -- Select field: blur/change saves immediately --
  if (type === 'select' && editing) {
    const opts = normalizeOptions();
    return (
      <div className="mb-3">
        <label className="block text-[10px] text-crm-muted uppercase tracking-wider mb-1">{label}</label>
        <select
          ref={inputRef}
          value={draft ?? ''}
          onChange={(e) => {
            setDraft(e.target.value);
            // Save on select change
            const parsed = parse ? parse(e.target.value) : e.target.value;
            setSaving(true);
            onSave(field, parsed === '' ? null : parsed)
              .catch((err) => console.error(err))
              .finally(() => { setSaving(false); setEditing(false); });
          }}
          onBlur={cancel}
          onKeyDown={handleKeyDown}
          className="w-full bg-crm-card border border-crm-accent/50 rounded px-2 py-1.5 text-sm text-crm-text focus:outline-none"
        >
          <option value="">—</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  // -- Read mode --
  if (!editing) {
    const displayValue = format ? format(value) : type === 'date' ? formatDatePacific(value) : value;
    const isEmpty = displayValue === null || displayValue === undefined || displayValue === '';
    return (
      <div
        className={`mb-3 group ${readOnly ? '' : 'cursor-pointer'}`}
        onClick={activate}
      >
        <div className="text-[10px] text-crm-muted uppercase tracking-wider mb-0.5">{label}</div>
        <div
          className={`text-sm rounded px-1 -mx-1 py-0.5 transition-colors ${
            readOnly ? '' : 'group-hover:bg-crm-border/30'
          } ${saving ? 'opacity-50' : ''}`}
        >
          {saving ? (
            <span className="text-crm-muted text-xs">Saving...</span>
          ) : isEmpty ? (
            <span className="text-crm-muted italic">{placeholder || '--'}</span>
          ) : (
            displayValue
          )}
        </div>
      </div>
    );
  }

  // -- Edit mode: textarea --
  if (type === 'textarea') {
    return (
      <div className="mb-3">
        <label className="block text-[10px] text-crm-muted uppercase tracking-wider mb-1">{label}</label>
        <textarea
          ref={inputRef}
          value={draft ?? ''}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            // Ctrl+Enter saves for textarea
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
          }}
          rows={3}
          className="w-full bg-crm-card border border-crm-accent/50 rounded px-2 py-1.5 text-sm text-crm-text focus:outline-none resize-none"
        />
      </div>
    );
  }

  // -- Edit mode: text, number, date, url, email, phone --
  const inputType = {
    text: 'text', number: 'number', date: 'date',
    url: 'url', email: 'email', phone: 'tel',
  }[type] || 'text';

  return (
    <div className="mb-3">
      <label className="block text-[10px] text-crm-muted uppercase tracking-wider mb-1">{label}</label>
      <input
        ref={inputRef}
        type={inputType}
        value={draft ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="w-full bg-crm-card border border-crm-accent/50 rounded px-2 py-1.5 text-sm text-crm-text focus:outline-none"
      />
    </div>
  );
}
