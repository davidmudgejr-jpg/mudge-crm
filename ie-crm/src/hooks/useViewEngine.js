// Generic View Engine hook — manages views, filters, sort, columns per entity type.
// One instance per page. Integrates with filterCompiler + views API + localStorage.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { compileFilters } from '../utils/filterCompiler';
import { listViews, createView, updateView, deleteView } from '../api/views';

const LS_PREFIX = 'views_';
const SORT_PREFIX = 'sort_'; // Fallback sort persistence when no view is active

const SEED_VIEWS = {
  deals: [
    { view_name: 'Active Pipeline', filters: [{ column: 'status', operator: 'equals', value: 'Active' }], filter_logic: 'AND' },
    { view_name: 'Priority Deals', filters: [{ column: 'priority_deal', operator: 'equals', value: 'Yes' }], filter_logic: 'AND' },
    { view_name: 'Closing This Month', filters: [{ column: 'close_date', operator: 'this_month', value: null }], filter_logic: 'AND' },
  ],
  properties: [
    { view_name: 'Expiring Leases (90 days)', filters: [{ column: 'lease_exp', operator: 'in_next_n_days', value: 90 }], filter_logic: 'AND' },
  ],
  contacts: [],
  companies: [
    { view_name: 'Lease Expiring Soon', filters: [{ column: 'lease_exp', operator: 'in_next_n_days', value: 90 }], filter_logic: 'AND' },
  ],
  interactions: [],
  campaigns: [],
};

function readCache(entityType) {
  try {
    const raw = localStorage.getItem(`${LS_PREFIX}${entityType}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(entityType, views) {
  try {
    localStorage.setItem(`${LS_PREFIX}${entityType}`, JSON.stringify(views));
  } catch { /* localStorage full — non-critical */ }
}

function readSortState(entityType) {
  try {
    const raw = localStorage.getItem(`${SORT_PREFIX}${entityType}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeSortState(entityType, sort) {
  try {
    localStorage.setItem(`${SORT_PREFIX}${entityType}`, JSON.stringify(sort));
  } catch { /* non-critical */ }
}

function readActiveId(entityType) {
  try {
    return localStorage.getItem(`${LS_PREFIX}${entityType}_active`) || null;
  } catch { return null; }
}

function writeActiveId(entityType, id) {
  try {
    if (id) {
      localStorage.setItem(`${LS_PREFIX}${entityType}_active`, id);
    } else {
      localStorage.removeItem(`${LS_PREFIX}${entityType}_active`);
    }
  } catch { /* non-critical */ }
}

export default function useViewEngine(entityType, columnDefs, { defaultSort = { column: 'created_at', direction: 'DESC' } } = {}) {
  // --- View list ---
  const [views, setViews] = useState(() => readCache(entityType) || []);
  const [activeViewId, setActiveViewId] = useState(() => readActiveId(entityType));
  const [isDirty, setIsDirty] = useState(false);

  // --- Filter state ---
  const [filters, setFilters] = useState([]);
  const [filterLogic, setFilterLogic] = useState('AND');

  // --- Sort state (restore from localStorage, then page default) ---
  const [sort, setSort] = useState(() => readSortState(entityType) || defaultSort);

  // --- Column state ---
  const [visibleColumnKeys, setVisibleColumnKeys] = useState(null); // null = show defaults

  // Ref to track if initial load has happened
  const loadedRef = useRef(false);

  // Refs for auto-save on unmount (avoids stale closure in cleanup)
  const dirtyRef = useRef(false);
  const activeIdRef = useRef(activeViewId);
  const stateRef = useRef({ filters, filterLogic, sort, visibleColumnKeys });
  dirtyRef.current = isDirty;
  activeIdRef.current = activeViewId;
  stateRef.current = { filters, filterLogic, sort, visibleColumnKeys };

  // Auto-save dirty view when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      if (dirtyRef.current && activeIdRef.current) {
        const { filters: f, filterLogic: fl, sort: s, visibleColumnKeys: vc } = stateRef.current;
        updateView(activeIdRef.current, {
          filters: f,
          filter_logic: fl,
          sort_column: s.column,
          sort_direction: s.direction,
          visible_columns: vc,
        }).catch(err => console.error('[useViewEngine] Auto-save on unmount failed:', err));
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Derived: active view object ---
  const activeView = useMemo(
    () => views.find(v => v.view_id === activeViewId) || null,
    [views, activeViewId]
  );

  // --- Derived: compiled SQL filters ---
  const sqlFilters = useMemo(
    () => compileFilters(filters, columnDefs),
    [filters, columnDefs]
  );

  // --- Derived: visible column definitions ---
  const visibleColumns = useMemo(() => {
    if (!visibleColumnKeys) return columnDefs; // no view override → use page defaults
    const keyOrder = new Map(visibleColumnKeys.map((k, i) => [k, i]));
    return columnDefs
      .filter(c => keyOrder.has(c.key))
      .sort((a, b) => (keyOrder.get(a.key) ?? 999) - (keyOrder.get(b.key) ?? 999));
  }, [columnDefs, visibleColumnKeys]);

  // --- Apply a view's state to local state ---
  const applyViewState = useCallback((view) => {
    setActiveViewId(view.view_id);
    writeActiveId(entityType, view.view_id);
    setFilters(view.filters || []);
    setFilterLogic(view.filter_logic || 'AND');
    const viewSort = view.sort_column
      ? { column: view.sort_column, direction: view.sort_direction || 'DESC' }
      : defaultSort;
    setSort(viewSort);
    writeSortState(entityType, viewSort);
    setVisibleColumnKeys(view.visible_columns || null);
    setIsDirty(false);
  }, [entityType, defaultSort]);

  // --- Load views from server on mount ---
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const serverViews = await listViews(entityType);
        if (cancelled) return;
        setViews(serverViews);
        writeCache(entityType, serverViews);

        // Seed default views if none exist yet
        const seededKey = `${LS_PREFIX}${entityType}_seeded`;
        if (serverViews.length === 0 && !localStorage.getItem(seededKey)) {
          const seeds = SEED_VIEWS[entityType] || [];
          if (seeds.length > 0) {
            try {
              const created = [];
              for (let i = 0; i < seeds.length; i++) {
                const view = await createView({
                  entity_type: entityType,
                  view_name: seeds[i].view_name,
                  filters: seeds[i].filters,
                  filter_logic: seeds[i].filter_logic,
                  sort_column: null,
                  sort_direction: 'DESC',
                  visible_columns: null,
                  position: i,
                });
                created.push(view);
              }
              if (cancelled) return;
              setViews(created);
              writeCache(entityType, created);
            } catch (err) {
              console.error(`[useViewEngine] Failed to seed views for ${entityType}:`, err);
            }
          }
          localStorage.setItem(seededKey, 'true');
        }

        // Auto-apply default view if no active selection
        if (!loadedRef.current) {
          loadedRef.current = true;
          const savedId = readActiveId(entityType);
          const target = savedId
            ? serverViews.find(v => v.view_id === savedId)
            : serverViews.find(v => v.is_default);
          if (target) {
            applyViewState(target);
          }
        }
      } catch (err) {
        console.error(`[useViewEngine] Failed to load views for ${entityType}:`, err);
        // Keep cached views
      }
    }
    load();
    return () => { cancelled = true; };
  }, [entityType]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Listen for Houston-created views and re-fetch ---
  useEffect(() => {
    const handler = async (e) => {
      if (e.detail?.entity_type !== entityType) return;
      try {
        const serverViews = await listViews(entityType);
        setViews(serverViews);
        writeCache(entityType, serverViews);
        // Auto-select the newest view (last in list)
        if (serverViews.length > 0) {
          const newest = serverViews[serverViews.length - 1];
          applyViewState(newest);
        }
      } catch (err) {
        console.error('[useViewEngine] Failed to reload views after Houston create:', err);
      }
    };
    window.addEventListener('houston-view-created', handler);
    return () => window.removeEventListener('houston-view-created', handler);
  }, [entityType, applyViewState]);

  // --- Actions ---
  // Auto-save dirty view before switching to another
  const applyView = useCallback(async (viewId) => {
    if (isDirty && activeViewId) {
      try {
        const updated = await updateView(activeViewId, {
          filters,
          filter_logic: filterLogic,
          sort_column: sort.column,
          sort_direction: sort.direction,
          visible_columns: visibleColumnKeys,
        });
        const next = views.map(v => v.view_id === activeViewId ? updated : v);
        setViews(next);
        writeCache(entityType, next);
      } catch (err) {
        console.error('[useViewEngine] Auto-save failed:', err);
      }
    }
    const view = views.find(v => v.view_id === viewId);
    if (view) applyViewState(view);
  }, [views, applyViewState, isDirty, activeViewId, filters, filterLogic, sort, visibleColumnKeys, entityType]);

  const resetToAll = useCallback(async () => {
    // Auto-save dirty view before clearing
    if (isDirty && activeViewId) {
      try {
        const updated = await updateView(activeViewId, {
          filters,
          filter_logic: filterLogic,
          sort_column: sort.column,
          sort_direction: sort.direction,
          visible_columns: visibleColumnKeys,
        });
        const next = views.map(v => v.view_id === activeViewId ? updated : v);
        setViews(next);
        writeCache(entityType, next);
      } catch (err) {
        console.error('[useViewEngine] Auto-save failed:', err);
      }
    }
    setActiveViewId(null);
    writeActiveId(entityType, null);
    setFilters([]);
    setFilterLogic('AND');
    setSort(defaultSort);
    writeSortState(entityType, defaultSort);
    setVisibleColumnKeys(null);
    setIsDirty(false);
  }, [entityType, defaultSort, isDirty, activeViewId, filters, filterLogic, sort, visibleColumnKeys, views]);

  const updateFilters = useCallback((newFilters, newLogic) => {
    setFilters(newFilters);
    if (newLogic) setFilterLogic(newLogic);
    setIsDirty(true);
  }, []);

  const handleSort = useCallback((columnKey) => {
    setSort(prev => {
      const next = prev.column === columnKey
        ? { column: columnKey, direction: prev.direction === 'ASC' ? 'DESC' : 'ASC' }
        : { column: columnKey, direction: 'ASC' };
      // Always persist sort to localStorage (instant, survives refresh)
      writeSortState(entityType, next);
      return next;
    });
    if (activeViewId) setIsDirty(true);
  }, [activeViewId, entityType]);

  const saveView = useCallback(async (name, { overrideFilters } = {}) => {
    const effectiveFilters = overrideFilters || filters;
    const viewData = {
      entity_type: entityType,
      view_name: name,
      filters: effectiveFilters,
      filter_logic: filterLogic,
      sort_column: sort.column,
      sort_direction: sort.direction,
      visible_columns: visibleColumnKeys,
      position: views.length,
    };

    if (activeViewId) {
      // Update existing
      const updated = await updateView(activeViewId, {
        filters: effectiveFilters,
        filter_logic: filterLogic,
        sort_column: sort.column,
        sort_direction: sort.direction,
        visible_columns: visibleColumnKeys,
      });
      const next = views.map(v => v.view_id === activeViewId ? updated : v);
      setViews(next);
      writeCache(entityType, next);
      if (overrideFilters) setFilters(overrideFilters);
      setIsDirty(false);
      return updated;
    } else {
      // Create new
      const created = await createView(viewData);
      const next = [...views, created];
      setViews(next);
      writeCache(entityType, next);
      setActiveViewId(created.view_id);
      writeActiveId(entityType, created.view_id);
      if (overrideFilters) setFilters(overrideFilters);
      setIsDirty(false);
      return created;
    }
  }, [entityType, activeViewId, filters, filterLogic, sort, visibleColumnKeys, views]);

  // Force-create a brand new view — NEVER updates an existing one.
  // Uses createView API (POST) regardless of activeViewId.
  const createNewView = useCallback(async (name, { overrideFilters } = {}) => {
    const effectiveFilters = overrideFilters || filters;
    const viewData = {
      entity_type: entityType,
      view_name: name,
      filters: effectiveFilters,
      filter_logic: filterLogic,
      sort_column: sort.column,
      sort_direction: sort.direction,
      visible_columns: visibleColumnKeys,
      position: views.length,
    };
    // Always POST — never PATCH
    const created = await createView(viewData);
    const next = [...views, created];
    setViews(next);
    writeCache(entityType, next);
    setActiveViewId(created.view_id);
    writeActiveId(entityType, created.view_id);
    if (overrideFilters) setFilters(overrideFilters);
    setIsDirty(false);
    return created;
  }, [entityType, activeViewId, filters, filterLogic, sort, visibleColumnKeys, views]);

  const renameView = useCallback(async (viewId, newName) => {
    const updated = await updateView(viewId, { view_name: newName });
    const next = views.map(v => v.view_id === viewId ? updated : v);
    setViews(next);
    writeCache(entityType, next);
  }, [entityType, views]);

  const removeView = useCallback(async (viewId) => {
    await deleteView(viewId);
    const next = views.filter(v => v.view_id !== viewId);
    setViews(next);
    writeCache(entityType, next);
    if (activeViewId === viewId) {
      resetToAll();
    }
  }, [entityType, views, activeViewId, resetToAll]);

  const duplicateView = useCallback(async (viewId) => {
    const source = views.find(v => v.view_id === viewId);
    if (!source) return;
    const created = await createView({
      entity_type: entityType,
      view_name: `${source.view_name} (copy)`,
      filters: source.filters,
      filter_logic: source.filter_logic,
      sort_column: source.sort_column,
      sort_direction: source.sort_direction,
      visible_columns: source.visible_columns,
      position: views.length,
    });
    const next = [...views, created];
    setViews(next);
    writeCache(entityType, next);
    return created;
  }, [entityType, views]);

  const setDefault = useCallback(async (viewId) => {
    await updateView(viewId, { is_default: true });
    // Refresh all views (the server clears old defaults)
    const serverViews = await listViews(entityType);
    setViews(serverViews);
    writeCache(entityType, serverViews);
  }, [entityType]);

  const reorderViews = useCallback(async (orderedIds) => {
    // Optimistic reorder
    const reordered = orderedIds
      .map(id => views.find(v => v.view_id === id))
      .filter(Boolean)
      .map((v, i) => ({ ...v, position: i }));
    setViews(reordered);
    writeCache(entityType, reordered);
    // Persist each position (fire and forget)
    for (let i = 0; i < orderedIds.length; i++) {
      updateView(orderedIds[i], { position: i }).catch(() => {});
    }
  }, [entityType, views]);

  return {
    // View state
    views,
    activeView,
    activeViewId,
    isDirty,

    // Filter state
    filters,
    filterLogic,
    sqlFilters,

    // Sort state
    sort,
    handleSort,

    // Column state
    visibleColumns,
    visibleColumnKeys,
    setVisibleColumnKeys,

    // Actions
    applyView,
    updateFilters,
    saveView,
    createNewView,
    renameView,
    deleteView: removeView,
    duplicateView,
    reorderViews,
    setDefault,
    resetToAll,
  };
}
