import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../shared/Toast';
import { CURATED_FIELDS, SYSTEM_FIELDS, getAllMergeFields, formatFieldValue } from '../../config/dedupFieldConfig';
import FieldMergeRow from './FieldMergeRow';

const API = import.meta.env.VITE_API_URL || '';

const ID_COL = { property: 'property_id', contact: 'contact_id', company: 'company_id' };
const DISPLAY_COL = { property: 'property_address', contact: 'full_name', company: 'company_name' };

/**
 * Full merge workspace shown in a SlideOver.
 * Displays N entity columns with field-by-field selection.
 */
export default function MergeWorkspace({ cluster, entityType, onClose, onMerged }) {
  const { token } = useAuth();
  const { addToast } = useToast();
  const idCol = ID_COL[entityType];
  const displayCol = DISPLAY_COL[entityType];

  const entities = cluster.entities || [];
  const [primaryIdx, setPrimaryIdx] = useState(0); // index of primary record
  const [showAllFields, setShowAllFields] = useState(false);
  const [merging, setMerging] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Build selections: { fieldKey: { sourceId, value } }
  // Auto-defaults: primary's value if non-null, else first non-null from others
  const [selections, setSelections] = useState({});

  const primaryId = entities[primaryIdx]?.[idCol];

  // Get all fields
  const { curated, extra } = useMemo(
    () => getAllMergeFields(entityType, entities[0]),
    [entityType, entities]
  );
  const visibleFields = showAllFields ? [...curated, ...extra] : curated;

  // Auto-compute default selections when primary changes
  useEffect(() => {
    if (entities.length === 0) return;
    const primary = entities[primaryIdx];
    const allFields = [...curated, ...extra];
    const defaults = {};

    for (const field of allFields) {
      const primaryVal = primary[field.key];
      if (primaryVal != null && primaryVal !== '') {
        defaults[field.key] = { sourceId: primary[idCol], value: primaryVal };
      } else {
        // Find first non-null from other records
        for (const e of entities) {
          if (e[idCol] === primary[idCol]) continue;
          if (e[field.key] != null && e[field.key] !== '') {
            defaults[field.key] = { sourceId: e[idCol], value: e[field.key] };
            break;
          }
        }
      }
    }

    setSelections(defaults);
  }, [primaryIdx, entities, curated, extra, idCol]);

  const handleFieldSelect = useCallback((fieldKey, sourceId, value) => {
    setSelections(prev => ({
      ...prev,
      [fieldKey]: { sourceId, value },
    }));
  }, []);

  // Count how many fields are overridden (selected from non-primary)
  const overrideCount = useMemo(() => {
    let count = 0;
    for (const [, sel] of Object.entries(selections)) {
      if (sel.sourceId !== primaryId) count++;
    }
    return count;
  }, [selections, primaryId]);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const handleMerge = async () => {
    setMerging(true);
    try {
      const keeperId = primaryId;
      const removeIds = entities.filter(e => e[idCol] !== keeperId).map(e => e[idCol]);

      // Build fieldOverrides: only fields where selection differs from primary's original value
      const primary = entities[primaryIdx];
      const fieldOverrides = {};
      for (const [fieldKey, sel] of Object.entries(selections)) {
        if (sel.sourceId !== keeperId) {
          fieldOverrides[fieldKey] = { value: sel.value, sourceId: sel.sourceId };
        }
      }

      const res = await fetch(`${API}/api/dedup/cluster-merge`, {
        method: 'POST', headers,
        body: JSON.stringify({ entityType, keeperId, removeIds, fieldOverrides }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      addToast(
        `Merged ${removeIds.length + 1} records! ${data.fieldsOverridden} overrides, ${data.fieldsFilled} backfills, ${data.linksMoved} links moved.`,
        'success'
      );
      onMerged?.();
      onClose();
    } catch (err) {
      addToast(`Merge failed: ${err.message}`, 'error');
    } finally {
      setMerging(false);
      setConfirmOpen(false);
    }
  };

  // Group fields by section
  const groupedFields = useMemo(() => {
    const groups = new Map();
    for (const f of visibleFields) {
      const g = f.group || 'Other';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(f);
    }
    return groups;
  }, [visibleFields]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-crm-border px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-semibold text-crm-text">Merge {entities.length} Records</h2>
            <p className="text-[11px] text-crm-muted mt-0.5">
              Click any cell to pick its value. Primary record auto-selected as default.
            </p>
          </div>
          <button onClick={onClose} className="text-crm-muted hover:text-crm-text text-lg transition-colors">
            &times;
          </button>
        </div>

        {/* Column headers — one per entity */}
        <div className="grid gap-2 items-end" style={{ gridTemplateColumns: `160px repeat(${entities.length}, 1fr)` }}>
          <span className="text-[10px] text-crm-muted uppercase tracking-wider font-semibold">Field</span>
          {entities.map((entity, idx) => (
            <button
              key={entity[idCol]}
              onClick={() => setPrimaryIdx(idx)}
              className={`text-left px-2 py-1.5 rounded-lg border transition-all ${
                idx === primaryIdx
                  ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30'
                  : 'border-crm-border bg-crm-card hover:border-crm-accent/40'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-bold text-crm-muted">{String.fromCharCode(65 + idx)}</span>
                {idx === primaryIdx && (
                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
                    PRIMARY
                  </span>
                )}
              </div>
              <div className="text-xs font-medium text-crm-text truncate mt-0.5">
                {entity[displayCol] || 'No name'}
              </div>
              {entity._linkedCounts?.total > 0 && (
                <div className="text-[10px] text-crm-muted mt-0.5">
                  {entity._linkedCounts.total} linked records
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable field grid */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {[...groupedFields.entries()].map(([group, fields]) => (
          <div key={group} className="mb-4">
            <div className="text-[10px] font-bold text-crm-muted uppercase tracking-wider mb-1.5 sticky top-0 bg-crm-bg/95 backdrop-blur-sm py-1 z-10">
              {group}
            </div>
            {fields.map(field => (
              <FieldMergeRow
                key={field.key}
                field={field}
                entities={entities}
                idCol={idCol}
                selections={selections}
                onSelect={handleFieldSelect}
              />
            ))}
          </div>
        ))}

        {/* Show all toggle */}
        {extra.length > 0 && (
          <button
            onClick={() => setShowAllFields(!showAllFields)}
            className="text-[11px] text-crm-accent hover:text-crm-accent/80 transition-colors mt-2"
          >
            {showAllFields ? `Hide ${extra.length} additional fields` : `Show ${extra.length} more fields`}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-crm-border px-5 py-3 flex items-center justify-between">
        <div className="text-[11px] text-crm-muted">
          {overrideCount > 0 && (
            <span className="text-yellow-400">{overrideCount} field{overrideCount !== 1 ? 's' : ''} overridden from non-primary</span>
          )}
          {overrideCount === 0 && 'All fields from primary record'}
          <span className="mx-2 text-crm-border">·</span>
          <span className="text-crm-muted/60">Cmd+Enter to merge</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-crm-muted hover:text-crm-text transition-colors"
          >
            Cancel
          </button>
          {!confirmOpen ? (
            <button
              onClick={() => setConfirmOpen(true)}
              className="px-4 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
            >
              Merge {entities.length} records
            </button>
          ) : (
            <button
              onClick={handleMerge}
              disabled={merging}
              className="px-4 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {merging ? 'Merging...' : `Confirm — delete ${entities.length - 1} record${entities.length > 2 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
