// Active filter pills strip. Shows removable chips for each condition.

import React, { useState, useMemo } from 'react';

function formatFilterPill(condition) {
  const { column, operator, value } = condition;
  const label = column.replace(/_/g, ' ');

  switch (operator) {
    case 'equals': return `${label} = ${value}`;
    case 'not_equals': return `${label} \u2260 ${value}`;
    case 'contains': return `${label} ~ ${value}`;
    case 'not_contains': return `${label} !~ ${value}`;
    case 'gt': case 'after': return `${label} > ${value}`;
    case 'gte': return `${label} \u2265 ${value}`;
    case 'lt': case 'before': return `${label} < ${value}`;
    case 'lte': return `${label} \u2264 ${value}`;
    case 'between': {
      const [min, max] = Array.isArray(value) ? value : [value, value];
      return `${label} ${Number(min).toLocaleString()}\u2013${Number(max).toLocaleString()}`;
    }
    case 'is_empty': return `${label} is empty`;
    case 'is_not_empty': return `${label} has value`;
    case 'in': return `${label} in [${Array.isArray(value) ? value.join(', ') : value}]`;
    default: return `${label} ${operator} ${value}`;
  }
}

export default function FilterBar({
  filters,
  filterLogic,
  updateFilters,
  onAddFilter,
  totalCount,
  filteredCount,
  activeViewId,
  onSaveAsView,
}) {
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState('');

  // Flatten filters for pill display (recursively extracts leaf conditions from compound groups)
  const conditions = useMemo(() => {
    function flatten(items) {
      if (!items) return [];
      if (Array.isArray(items)) return items.filter(c => c.column);
      if (items.conditions) {
        return items.conditions.flatMap(c => c.logic ? flatten(c) : [c]);
      }
      return [];
    }
    return flatten(filters);
  }, [filters]);

  const removeFilter = (index) => {
    // Rebuild from flattened conditions (works for both flat arrays and compound objects)
    const next = conditions.filter((_, i) => i !== index);
    updateFilters(next, filterLogic);
  };

  return (
    <div className="flex items-center gap-1.5 px-5 py-1.5 border-b border-crm-border/50 flex-wrap">
      {conditions.length > 0 && (
        <span className="text-[10px] text-crm-muted/60 uppercase tracking-wider mr-1">
          Filters{filterLogic === 'OR' ? ' (OR)' : ''}:
        </span>
      )}

      {conditions.map((cond, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 text-[11px] bg-crm-accent/12 text-crm-accent/80 px-2.5 py-0.5 rounded-full"
        >
          {formatFilterPill(cond)}
          <button
            onClick={() => removeFilter(i)}
            className="opacity-50 hover:opacity-100 transition-opacity ml-0.5"
          >
            ✕
          </button>
        </span>
      ))}

      <button
        onClick={onAddFilter}
        className="text-[10px] text-crm-accent px-2 py-0.5 hover:underline"
      >
        + Add Filter
      </button>

      {/* Save as View (when on "All" tab with active filters) */}
      {!activeViewId && conditions.length > 0 && !naming && (
        <button
          onClick={() => setNaming(true)}
          className="text-[10px] bg-crm-accent/80 text-white px-3 py-0.5 rounded-full font-medium hover:bg-crm-accent transition-colors"
        >
          Save as View
        </button>
      )}
      {naming && (
        <div className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && viewName.trim()) { onSaveAsView(viewName.trim()); setNaming(false); setViewName(''); }
              if (e.key === 'Escape') { setNaming(false); setViewName(''); }
            }}
            placeholder="View name..."
            className="bg-crm-hover/60 border border-crm-accent text-crm-text text-[11px] px-2 py-0.5 rounded-md w-40 outline-none"
          />
          <button
            onClick={() => { if (viewName.trim()) { onSaveAsView(viewName.trim()); setNaming(false); setViewName(''); } }}
            className="text-[10px] bg-crm-accent/80 text-white px-2 py-0.5 rounded-md"
          >
            Save
          </button>
        </div>
      )}

      <div className="flex-1" />

      {totalCount != null && filteredCount != null && (
        <span className="text-[10px] text-crm-muted/60">
          Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()}
        </span>
      )}
    </div>
  );
}
