import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Hook for Airtable-style column resizing with localStorage persistence.
 * @param {string} tableKey - Unique key for localStorage (e.g. 'properties')
 * @param {Array} columns - Column definitions with { key, defaultWidth }
 * @returns {{ widths, onResizeStart }}
 */
export function useColumnResize(tableKey, columns) {
  const storageKey = `crm-col-widths-${tableKey}`;

  const [widths, setWidths] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {}
    // Default widths from column defs
    const defaults = {};
    columns.forEach((col) => {
      defaults[col.key] = col.defaultWidth || 150;
    });
    return defaults;
  });

  const dragRef = useRef(null);

  // Persist to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(widths));
    } catch {}
  }, [widths, storageKey]);

  const onResizeStart = useCallback((colKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widths[colKey] || 150;

    const onMouseMove = (moveEvent) => {
      const diff = moveEvent.clientX - startX;
      const newWidth = Math.max(60, startWidth + diff);
      setWidths((prev) => ({ ...prev, [colKey]: newWidth }));
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    dragRef.current = { colKey, startX, startWidth };
  }, [widths]);

  return { widths, onResizeStart };
}
