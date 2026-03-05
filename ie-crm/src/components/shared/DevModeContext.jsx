import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'crm-dev-mode';

const DevModeContext = createContext(null);

function readStoredDevMode() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function DevModeProvider({ children }) {
  const [devMode, setDevMode] = useState(readStoredDevMode);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(devMode));
    } catch {
      // localStorage unavailable — silently ignore
    }
  }, [devMode]);

  const toggleDevMode = useCallback(() => {
    setDevMode((prev) => !prev);
  }, []);

  return (
    <DevModeContext.Provider value={{ devMode, setDevMode, toggleDevMode }}>
      {children}
    </DevModeContext.Provider>
  );
}

export function useDevMode() {
  const ctx = useContext(DevModeContext);
  if (!ctx) throw new Error('useDevMode must be used inside DevModeProvider');
  return ctx;
}
