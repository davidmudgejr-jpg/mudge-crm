import { useState, useEffect, useCallback } from 'react';
import { readPivot, clearPivot } from '../utils/pivotNav';

/**
 * Hook to manage pivot filter state for a page.
 * Reads from sessionStorage on mount and listens for pivot events.
 * Returns [pivotFilter, dismissPivot].
 */
export default function usePivotFilter(entityType) {
  const [pivotFilter, setPivotFilter] = useState(() => readPivot(entityType));

  // Listen for pivot events (when navigating from another tab to an already-mounted page)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.target === entityType) {
        const pivot = readPivot(entityType);
        if (pivot) setPivotFilter(pivot);
      }
    };
    window.addEventListener('crm-pivot', handler);
    return () => window.removeEventListener('crm-pivot', handler);
  }, [entityType]);

  const dismiss = useCallback(() => {
    clearPivot(entityType);
    setPivotFilter(null);
  }, [entityType]);

  return [pivotFilter, dismiss];
}
