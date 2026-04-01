import { useState, useEffect, useCallback, useMemo } from 'react';
import { readPivot, clearPivot } from '../utils/pivotNav';

const ENTITY_PK = {
  contacts: 'contact_id',
  properties: 'property_id',
  deals: 'deal_id',
  companies: 'company_id',
  interactions: 'interaction_id',
  campaigns: 'campaign_id',
};

/**
 * Hook to manage pivot filter state for a page.
 * Reads from sessionStorage on mount and listens for pivot events.
 *
 * Returns: { pivotFilter, dismiss, mergeFilters }
 *   - pivotFilter: { ids, label } or null
 *   - dismiss: clears the pivot
 *   - mergeFilters: (existingFilters) => filters with pivot IDs baked in as an `in` filter
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

  /**
   * Merge pivot IDs into a filter array as an `in` condition on the entity's PK.
   * Use this when saving a view — it bakes the pivot IDs into the view's filters
   * so the view is self-contained and doesn't need the pivot anymore.
   */
  const mergeFilters = useCallback((existingFilters) => {
    if (!pivotFilter?.ids?.length) return existingFilters;
    const pk = ENTITY_PK[entityType];
    if (!pk) return existingFilters;
    // Add the ID filter — remove any existing pivot filter on the same column first
    const cleaned = (existingFilters || []).filter(f => f.column !== pk || f.operator !== 'in');
    return [...cleaned, { column: pk, operator: 'in', value: pivotFilter.ids }];
  }, [pivotFilter, entityType]);

  return { pivotFilter, dismiss, mergeFilters };
}
