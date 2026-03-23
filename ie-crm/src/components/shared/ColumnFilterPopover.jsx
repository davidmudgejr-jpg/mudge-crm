import { useEffect, useRef, useMemo } from 'react';
import TextFilter from './column-filters/TextFilter';
import SelectFilter from './column-filters/SelectFilter';
import NumberRangeFilter from './column-filters/NumberRangeFilter';
import DateFilter from './column-filters/DateFilter';
import BooleanFilter from './column-filters/BooleanFilter';

/**
 * ColumnFilterPopover
 *
 * Props:
 *   column        — column def ({ key, label, type, filterOptions, editType })
 *   anchorRect    — { left, top, width, height } from header getBoundingClientRect()
 *   rows          — current table data rows (used to compute unique text values)
 *   currentFilter — existing filter conditions for this column (array) or undefined
 *   onApply       — (conditions: array) => void
 *   onClose       — () => void
 */
export default function ColumnFilterPopover({
  column,
  anchorRect,
  rows,
  currentFilter,
  onApply,
  onClose,
}) {
  const ref = useRef(null);

  // Close on outside mousedown
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Compute position clamped to viewport
  const style = useMemo(() => {
    const PADDING = 8;
    const popoverWidth = 240;
    const top = (anchorRect?.top ?? 0) + (anchorRect?.height ?? 0) + 4;
    let left = anchorRect?.left ?? 0;
    const maxLeft = window.innerWidth - popoverWidth - PADDING;
    left = Math.max(PADDING, Math.min(left, maxLeft));
    return { position: 'fixed', top, left, zIndex: 9999, width: popoverWidth };
  }, [anchorRect]);

  // Determine filter type
  const isBoolean =
    column.editType === 'boolean' ||
    (Array.isArray(column.filterOptions) &&
      column.filterOptions.some(o => o === 'Yes' || o === 'No'));

  const hasSelectOptions = Array.isArray(column.filterOptions) && column.filterOptions.length > 0;
  const isNumber = column.type === 'number';
  const isDate = column.type === 'date';

  // ---- Extract current values for each filter type ----

  const currentIn = useMemo(() => {
    if (!currentFilter) return [];
    const inFilter = currentFilter.find(f => f.operator === 'in');
    return inFilter ? inFilter.value ?? [] : [];
  }, [currentFilter]);

  const currentMin = useMemo(() => {
    if (!currentFilter) return null;
    const f = currentFilter.find(f => f.operator === 'gte');
    return f ? f.value : null;
  }, [currentFilter]);

  const currentMax = useMemo(() => {
    if (!currentFilter) return null;
    const f = currentFilter.find(f => f.operator === 'lte');
    return f ? f.value : null;
  }, [currentFilter]);

  const currentDateFilter = useMemo(() => {
    if (!currentFilter || currentFilter.length === 0) return null;
    const f = currentFilter[0];
    if (!f) return null;
    return { operator: f.operator, value: f.value };
  }, [currentFilter]);

  const currentBoolean = useMemo(() => {
    if (!currentFilter || currentFilter.length === 0) return null;
    const f = currentFilter.find(f => f.operator === 'equals');
    if (!f) return null;
    return f.value === 'Yes' ? true : f.value === 'No' ? false : null;
  }, [currentFilter]);

  // ---- Unique text values from rows ----
  const textValues = useMemo(() => {
    if (isBoolean || hasSelectOptions || isNumber || isDate) return [];
    if (!rows) return [];
    return rows.map(r => r[column.key]).filter(v => v != null && v !== '');
  }, [rows, column.key, isBoolean, hasSelectOptions, isNumber, isDate]);

  // ---- Handlers that build condition arrays and call onApply ----

  const handleTextChange = (selected) => {
    if (selected.length === 0) {
      onApply([]);
    } else {
      onApply([{ column: column.key, operator: 'in', value: selected }]);
    }
  };

  const handleSelectChange = (selected) => {
    if (selected.length === 0) {
      onApply([]);
    } else {
      onApply([{ column: column.key, operator: 'in', value: selected }]);
    }
  };

  const handleNumberChange = ({ min, max }) => {
    const conditions = [];
    if (min !== null && min !== undefined) conditions.push({ column: column.key, operator: 'gte', value: min });
    if (max !== null && max !== undefined) conditions.push({ column: column.key, operator: 'lte', value: max });
    onApply(conditions);
  };

  const handleDateChange = (filter) => {
    if (!filter) {
      onApply([]);
    } else {
      onApply([{ column: column.key, operator: filter.operator, value: filter.value }]);
    }
  };

  const handleBooleanChange = (val) => {
    if (val === null) {
      onApply([]);
    } else {
      onApply([{ column: column.key, operator: 'equals', value: val ? 'Yes' : 'No' }]);
    }
  };

  return (
    <div
      ref={ref}
      style={style}
      className="bg-crm-card border border-crm-border rounded-lg shadow-2xl p-3"
    >
      <p className="text-[10px] text-crm-muted uppercase tracking-widest mb-2 font-medium">
        Filter: {column.label}
      </p>

      {isBoolean ? (
        <BooleanFilter value={currentBoolean} onChange={handleBooleanChange} />
      ) : hasSelectOptions ? (
        <SelectFilter
          options={column.filterOptions}
          selected={currentIn}
          onChange={handleSelectChange}
        />
      ) : isNumber ? (
        <NumberRangeFilter
          min={currentMin}
          max={currentMax}
          onChange={handleNumberChange}
        />
      ) : isDate ? (
        <DateFilter value={currentDateFilter} onChange={handleDateChange} />
      ) : (
        <TextFilter
          values={textValues}
          selected={currentIn}
          onChange={handleTextChange}
        />
      )}
    </div>
  );
}
