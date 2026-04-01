// Modal filter editor with AND/OR logic, condition rows, value inputs.

import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';

/**
 * Searchable select — portal-rendered so dropdown escapes modal overflow.
 * `options` can be plain strings OR { value, label } objects.
 * `placeholder` shown when no value selected.
 * `widthClass` controls the trigger button width (e.g. 'w-[140px]').
 */
function SearchableSelect({ options, value, onChange, className, placeholder = 'Select...', widthClass = 'flex-1' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);
  const dropRef = useRef(null);

  // Normalize options to { value, label }
  const normalized = useMemo(() =>
    options.map(o => typeof o === 'string' ? { value: o, label: o } : o),
    [options]
  );

  const displayLabel = useMemo(() => {
    const match = normalized.find(o => o.value === value);
    return match ? match.label : '';
  }, [normalized, value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (dropRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = () => {
    if (!open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    setOpen(!open);
    setSearch('');
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return normalized;
    const q = search.toLowerCase();
    return normalized.filter(o => o.label.toLowerCase().includes(q));
  }, [normalized, search]);

  const dropdown = open && rect && ReactDOM.createPortal(
    <div
      ref={dropRef}
      style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 180), zIndex: 99999 }}
      className="bg-crm-card border border-crm-border rounded-lg shadow-2xl overflow-hidden"
    >
      {normalized.length > 6 && (
        <div className="p-1.5">
          <input
            autoFocus
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded px-2 py-1 text-xs bg-crm-bg border border-crm-border text-crm-text placeholder:text-crm-muted outline-none focus:border-crm-accent [color-scheme:dark]"
          />
        </div>
      )}
      <div className="max-h-48 overflow-y-auto">
        {filtered.length === 0 && (
          <p className="text-xs text-crm-muted italic px-2.5 py-1.5">No matches</p>
        )}
        {filtered.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => { onChange(opt.value); setOpen(false); setSearch(''); }}
            className={`w-full text-left px-2.5 py-1.5 text-xs hover:bg-crm-hover truncate ${opt.value === value ? 'text-crm-accent' : 'text-crm-text'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>,
    document.body
  );

  return (
    <div className={widthClass}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`${className} w-full text-left truncate`}
      >
        {displayLabel || placeholder}
      </button>
      {dropdown}
    </div>
  );
}

const OPERATORS_BY_TYPE = {
  text: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'not contains' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  number: [
    { value: 'equals', label: '=' },
    { value: 'not_equals', label: '\u2260' },
    { value: 'gt', label: '>' },
    { value: 'gte', label: '\u2265' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '\u2264' },
    { value: 'between', label: 'between' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
  date: [
    { value: 'equals', label: 'equals' },
    { value: 'before', label: 'before' },
    { value: 'after', label: 'after' },
    { value: 'between', label: 'between' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
    { value: 'in_next_n_days', label: 'in the next N days' },
    { value: 'in_last_n_days', label: 'in the last N days' },
    { value: 'this_week', label: 'this week' },
    { value: 'this_month', label: 'this month' },
    { value: 'this_quarter', label: 'this quarter' },
    { value: 'this_year', label: 'this year' },
    { value: 'is_overdue', label: 'is overdue' },
  ],
  select: [
    { value: 'equals', label: 'equals' },
    { value: 'not_equals', label: 'not equals' },
    { value: 'in', label: 'is any of' },
    { value: 'is_empty', label: 'is empty' },
    { value: 'is_not_empty', label: 'is not empty' },
  ],
};

function ConditionRow({ condition, index, columnDefs, onChange, onRemove }) {
  const col = columnDefs.find(c => c.key === condition.column);
  const colType = col?.type || 'text';
  const operators = OPERATORS_BY_TYPE[colType] || OPERATORS_BY_TYPE.text;
  const needsNoValue = ['is_empty', 'is_not_empty', 'this_week', 'this_month', 'this_quarter', 'this_year', 'is_overdue'].includes(condition.operator);
  const needsDaysInput = ['in_next_n_days', 'in_last_n_days'].includes(condition.operator);
  const isBetween = condition.operator === 'between';

  return (
    <div className="flex gap-2 items-center mb-2.5">
      {/* Column select */}
      <SearchableSelect
        options={columnDefs.map(c => ({ value: c.key, label: c.label }))}
        value={condition.column || ''}
        onChange={(val) => onChange(index, { ...condition, column: val, operator: 'equals', value: '' })}
        className="bg-crm-hover border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs"
        placeholder="Select column..."
        widthClass="w-[140px]"
      />

      {/* Operator select */}
      <SearchableSelect
        options={operators}
        value={condition.operator || 'equals'}
        onChange={(val) => onChange(index, { ...condition, operator: val, value: val === 'between' ? ['', ''] : '' })}
        className="bg-crm-hover border border-crm-border text-crm-accent px-2.5 py-1.5 rounded-md text-xs"
        placeholder="Operator..."
        widthClass="w-[100px]"
      />

      {/* Value input */}
      {!needsNoValue && (
        isBetween ? (
          <div className="flex gap-1 items-center flex-1">
            <input
              type={colType === 'date' ? 'date' : colType === 'number' ? 'number' : 'text'}
              value={Array.isArray(condition.value) ? condition.value[0] || '' : ''}
              onChange={(e) => {
                const v = Array.isArray(condition.value) ? [...condition.value] : ['', ''];
                v[0] = colType === 'number' ? Number(e.target.value) : e.target.value;
                onChange(index, { ...condition, value: v });
              }}
              className="bg-crm-hover border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs w-20"
            />
            <span className="text-[11px] text-crm-muted/60">and</span>
            <input
              type={colType === 'date' ? 'date' : colType === 'number' ? 'number' : 'text'}
              value={Array.isArray(condition.value) ? condition.value[1] || '' : ''}
              onChange={(e) => {
                const v = Array.isArray(condition.value) ? [...condition.value] : ['', ''];
                v[1] = colType === 'number' ? Number(e.target.value) : e.target.value;
                onChange(index, { ...condition, value: v });
              }}
              className="bg-crm-hover border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs w-20"
            />
          </div>
        ) : col?.filterOptions ? (
          <SearchableSelect
            options={col.filterOptions}
            value={condition.value || ''}
            onChange={(val) => onChange(index, { ...condition, value: val })}
            className="bg-crm-hover border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs"
            placeholder="Select..."
          />
        ) : (
          <input
            type={colType === 'date' ? 'date' : colType === 'number' ? 'number' : 'text'}
            value={condition.value || ''}
            onChange={(e) => onChange(index, {
              ...condition,
              value: colType === 'number' ? Number(e.target.value) : e.target.value,
            })}
            placeholder="Value..."
            className="bg-crm-hover border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs flex-1"
          />
        )
      )}

      {needsDaysInput && (
        <div className="flex items-center gap-1.5 flex-1">
          <input
            type="number"
            min="1"
            value={condition.value || 30}
            onChange={(e) => onChange(index, { ...condition, value: parseInt(e.target.value) || 30 })}
            className="bg-crm-hover border border-crm-border text-crm-text px-2.5 py-1.5 rounded-md text-xs w-20"
          />
          <span className="text-[11px] text-crm-muted/60">days</span>
        </div>
      )}

      {/* Remove button */}
      <button
        onClick={() => onRemove(index)}
        className="text-crm-muted/40 hover:text-crm-muted text-sm px-1"
      >
        ✕
      </button>
    </div>
  );
}

export default function FilterBuilder({
  isOpen,
  onClose,
  columnDefs,
  initialFilters = [],
  initialLogic = 'AND',
  onApply,
}) {
  const [conditions, setConditions] = useState(
    () => (Array.isArray(initialFilters) && initialFilters.length > 0)
      ? initialFilters
      : [{ column: '', operator: 'equals', value: '' }]
  );
  const [logic, setLogic] = useState(initialLogic);

  // Reset when opened — always pick up current filters
  React.useEffect(() => {
    if (isOpen) {
      setConditions(
        (Array.isArray(initialFilters) && initialFilters.length > 0)
          ? [...initialFilters, { column: '', operator: 'equals', value: '' }]
          : [{ column: '', operator: 'equals', value: '' }]
      );
      setLogic(initialLogic);
    }
  }, [isOpen, initialFilters, initialLogic]);

  const filterableColumns = useMemo(
    () => columnDefs.filter(c => c.filterable !== false && c.type),
    [columnDefs]
  );

  const handleChange = (index, updated) => {
    setConditions(prev => prev.map((c, i) => i === index ? updated : c));
  };

  const handleRemove = (index) => {
    setConditions(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  };

  const addCondition = () => {
    setConditions(prev => [...prev, { column: '', operator: 'equals', value: '' }]);
  };

  const handleApply = () => {
    // Filter out incomplete conditions
    const valid = conditions.filter(c => c.column && c.operator);
    onApply(valid, logic);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
      <div
        className="relative bg-crm-card border border-crm-border rounded-xl shadow-2xl p-6 w-[520px] max-h-[80vh] overflow-y-auto animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <span className="text-sm font-bold text-crm-text">Edit Filters</span>
          <div className="flex gap-1 bg-crm-hover/60 rounded-md p-0.5">
            <button
              onClick={() => setLogic('AND')}
              className={`text-[11px] px-2.5 py-1 rounded transition-colors ${
                logic === 'AND'
                  ? 'bg-crm-accent/20 text-crm-accent font-semibold'
                  : 'text-crm-muted/60'
              }`}
            >
              AND
            </button>
            <button
              onClick={() => setLogic('OR')}
              className={`text-[11px] px-2.5 py-1 rounded transition-colors ${
                logic === 'OR'
                  ? 'bg-crm-accent/20 text-crm-accent font-semibold'
                  : 'text-crm-muted/60'
              }`}
            >
              OR
            </button>
          </div>
        </div>

        {/* Condition rows */}
        {conditions.map((cond, i) => (
          <ConditionRow
            key={i}
            condition={cond}
            index={i}
            columnDefs={filterableColumns}
            onChange={handleChange}
            onRemove={handleRemove}
          />
        ))}

        {/* Add condition */}
        <div className="flex gap-3 mb-5">
          <button onClick={addCondition} className="text-xs text-crm-accent hover:underline">
            + Add condition
          </button>
        </div>

        {/* Actions */}
        <div className="border-t border-crm-border pt-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="bg-transparent border border-crm-border text-crm-muted px-4 py-1.5 rounded-md text-xs hover:bg-crm-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="bg-crm-accent text-white px-4 py-1.5 rounded-md text-xs font-semibold hover:bg-crm-accent-hover transition-colors"
          >
            Apply Filters
          </button>
        </div>
      </div>
    </div>
  );
}
