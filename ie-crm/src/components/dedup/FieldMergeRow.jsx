import React from 'react';
import { formatFieldValue } from '../../config/dedupFieldConfig';

/**
 * A single row in the merge comparison grid.
 * Shows the field label + one cell per entity record. Clickable to select.
 */
export default function FieldMergeRow({ field, entities, idCol, selections, onSelect }) {
  const values = entities.map(e => e[field.key]);
  const hasConflict = (() => {
    const nonNull = values.filter(v => v != null && v !== '');
    const unique = new Set(nonNull.map(v => JSON.stringify(v)));
    return unique.size > 1;
  })();

  const selectedId = selections[field.key]?.sourceId;

  return (
    <div className="grid items-center gap-2 py-1.5 border-b border-crm-border/30 text-xs"
         style={{ gridTemplateColumns: `160px repeat(${entities.length}, 1fr)` }}>
      {/* Label */}
      <span className={`font-medium truncate ${hasConflict ? 'text-yellow-400' : 'text-crm-muted'}`}>
        {field.label}
      </span>

      {/* Value cells */}
      {entities.map((entity) => {
        const raw = entity[field.key];
        const display = formatFieldValue(raw, field.format) || '—';
        const isEmpty = raw == null || raw === '';
        const isSelected = selectedId === entity[idCol];

        return (
          <button
            key={entity[idCol]}
            onClick={() => onSelect(field.key, entity[idCol], raw)}
            className={`text-left px-2 py-1 rounded transition-all truncate ${
              isSelected
                ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30'
                : isEmpty
                  ? 'text-crm-muted/40 hover:bg-crm-hover/50'
                  : hasConflict
                    ? 'text-yellow-300 hover:bg-yellow-500/10'
                    : 'text-crm-text hover:bg-crm-hover/50'
            }`}
            title={raw != null ? String(raw) : 'Empty'}
          >
            {isSelected && <span className="mr-1 text-emerald-400">&#10003;</span>}
            {display}
          </button>
        );
      })}
    </div>
  );
}
