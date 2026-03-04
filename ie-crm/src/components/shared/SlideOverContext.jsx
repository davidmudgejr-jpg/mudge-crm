import React, { createContext, useContext, useState, useCallback } from 'react';

const MAX_DEPTH = 2;

const SlideOverContext = createContext(null);

export function SlideOverProvider({ children }) {
  // Stack of { entityType, entityId } objects
  const [stack, setStack] = useState([]);

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

  const canNest = stack.length < MAX_DEPTH;

  return (
    <SlideOverContext.Provider value={{ stack, open, close, closeAll, canNest }}>
      {children}
    </SlideOverContext.Provider>
  );
}

export function useSlideOver() {
  const ctx = useContext(SlideOverContext);
  if (!ctx) throw new Error('useSlideOver must be used inside SlideOverProvider');
  return ctx;
}
