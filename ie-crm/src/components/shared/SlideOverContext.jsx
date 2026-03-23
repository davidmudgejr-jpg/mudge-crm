import React, { createContext, useContext, useState, useCallback } from 'react';

const MAX_DEPTH = 2;

const SlideOverContext = createContext(null);

export function SlideOverProvider({ children }) {
  // Stack of { entityType, entityId } objects
  const [stack, setStack] = useState([]);
  // Counter for page-level detail panels (not managed by the stack)
  const [pageDetailCount, setPageDetailCount] = useState(0);

  const open = useCallback((entityType, entityId) => {
    setStack((prev) => {
      if (prev.length >= MAX_DEPTH) {
        // At max depth, replace the topmost panel instead of stacking
        return [...prev.slice(0, -1), { entityType, entityId }];
      }
      return [...prev, { entityType, entityId }];
    });
  }, []);

  const close = useCallback(() => {
    setStack((prev) => prev.slice(0, -1));
  }, []);

  const closeAll = useCallback(() => {
    setStack([]);
  }, []);

  // Pages call these when they open/close their own detail panels
  const registerDetail = useCallback(() => setPageDetailCount((c) => c + 1), []);
  const unregisterDetail = useCallback(() => setPageDetailCount((c) => Math.max(0, c - 1)), []);

  const canNest = stack.length < MAX_DEPTH;
  const hasAnyPanel = stack.length > 0 || pageDetailCount > 0;

  return (
    <SlideOverContext.Provider value={{ stack, open, close, closeAll, canNest, hasAnyPanel, registerDetail, unregisterDetail }}>
      {children}
    </SlideOverContext.Provider>
  );
}

export function useSlideOver() {
  const ctx = useContext(SlideOverContext);
  if (!ctx) throw new Error('useSlideOver must be used inside SlideOverProvider');
  return ctx;
}
