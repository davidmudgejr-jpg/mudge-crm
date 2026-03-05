import { useState, useMemo, useCallback } from 'react';

const STORAGE_PREFIX = 'crm_col_vis_';
const LABELS_PREFIX = 'crm_col_labels_';

/**
 * Hook for managing column visibility with localStorage persistence.
 *
 * @param {string} tableKey - Unique key for the table (e.g. 'properties')
 * @param {Array<{key: string, label: string, defaultVisible?: boolean}>} allColumns
 * @returns {{ visibleColumns: Array, toggleColumn: Function, showAll: Function, hideAll: Function, isVisible: Function, renameColumn: Function }}
 */
export default function useColumnVisibility(tableKey, allColumns) {
  const storageKey = STORAGE_PREFIX + tableKey;
  const labelsKey = LABELS_PREFIX + tableKey;

  const defaultVisible = useMemo(
    () => allColumns.filter((c) => c.defaultVisible !== false).map((c) => c.key),
    [allColumns]
  );

  const [visibleKeys, setVisibleKeys] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return defaultVisible;
  });

  const persist = useCallback(
    (keys) => {
      setVisibleKeys(keys);
      try { localStorage.setItem(storageKey, JSON.stringify(keys)); } catch { /* ignore */ }
    },
    [storageKey]
  );

  const toggleColumn = useCallback(
    (key) => {
      setVisibleKeys((prev) => {
        const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    },
    [storageKey]
  );

  const showAll = useCallback(
    () => persist(allColumns.map((c) => c.key)),
    [allColumns, persist]
  );

  const hideAll = useCallback(
    () => persist([]),
    [persist]
  );

  const resetDefaults = useCallback(
    () => persist(defaultVisible),
    [defaultVisible, persist]
  );

  const isVisible = useCallback(
    (key) => visibleKeys.includes(key),
    [visibleKeys]
  );

  // Column label overrides (rename support)
  const [columnLabels, setColumnLabels] = useState(() => {
    try {
      const stored = localStorage.getItem(labelsKey);
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return {};
  });

  const renameColumn = useCallback(
    (key, newLabel) => {
      setColumnLabels((prev) => {
        const next = { ...prev, [key]: newLabel };
        try { localStorage.setItem(labelsKey, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    },
    [labelsKey]
  );

  const visibleColumns = useMemo(
    () => allColumns
      .filter((c) => visibleKeys.includes(c.key))
      .map((c) => (columnLabels[c.key] ? { ...c, label: columnLabels[c.key] } : c)),
    [allColumns, visibleKeys, columnLabels]
  );

  return { visibleColumns, visibleKeys, toggleColumn, showAll, hideAll, resetDefaults, isVisible, renameColumn };
}
