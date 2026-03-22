import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'crm-auth-token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshingRef = useRef(false);
  const refreshPromiseRef = useRef(null);

  // Validate existing token on mount
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          // Token is truly invalid — clear it
          localStorage.removeItem(TOKEN_KEY);
          setUser(null);
          return null;
        }
        if (!res.ok) {
          // Server error (500, 502, 503) — keep the token, assume server is recovering
          console.warn('[auth] Server returned', res.status, '— keeping token, assuming cold start');
          // Decode the JWT locally to get user info while server recovers
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            setUser({ user_id: payload.user_id, email: payload.email, role: payload.role, display_name: payload.display_name });
          } catch { /* can't decode — just wait */ }
          return null;
        }
        return res.json();
      })
      .then((userData) => {
        if (userData) setUser(userData);
      })
      .catch((err) => {
        // Network error (server down, no internet) — keep the token
        console.warn('[auth] Network error on startup — keeping token:', err.message);
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUser({ user_id: payload.user_id, email: payload.email, role: payload.role, display_name: payload.display_name });
        } catch { /* can't decode */ }
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed');
    }

    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  // Attempt to refresh the token — returns true if successful
  const refreshToken = useCallback(async () => {
    // Deduplicate concurrent refresh attempts
    if (refreshingRef.current) {
      return refreshPromiseRef.current;
    }
    refreshingRef.current = true;

    const promise = (async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) return false;

      try {
        const res = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) return false;

        const data = await res.json();
        if (data.token) {
          localStorage.setItem(TOKEN_KEY, data.token);
          setUser(data.user);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        refreshingRef.current = false;
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, []);

  // Proactive token refresh — refresh the token every 7 days while the session is active
  // This prevents the 30-day token from ever expiring during active use
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) { setUser(null); return; }

      // Try to refresh proactively
      const success = await refreshToken();
      if (!success) {
        // If refresh fails, validate current token
        try {
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.status === 401 || res.status === 403) {
            // Token is truly invalid/expired — log out
            console.warn('[auth] Token expired during session — logging out');
            localStorage.removeItem(TOKEN_KEY);
            setUser(null);
          } else if (!res.ok) {
            // Server error (500, 502, etc.) — keep the token, server is recovering
            console.warn('[auth] Server returned', res.status, 'during refresh check — keeping token');
          }
        } catch {
          // Network error — don't log out, just wait for next check
        }
      }
    }, 7 * 24 * 60 * 60 * 1000); // Every 7 days
    return () => clearInterval(interval);
  }, [user, refreshToken]);

  // Global 401 interceptor — catch expired tokens from any fetch call
  // Instead of immediately logging out, try to refresh the token first
  useEffect(() => {
    if (!user) return;
    const originalFetch = window.fetch;
    let retryingUrls = new Set();

    window.fetch = async (...args) => {
      let res;
      try {
        res = await originalFetch(...args);
      } catch (networkErr) {
        // Network failure — don't logout, just rethrow
        throw networkErr;
      }

      if (res.status === 401 && localStorage.getItem(TOKEN_KEY)) {
        const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

        // Only intercept our API calls, not auth endpoints themselves
        if (url.includes('/api/') && !url.includes('/api/auth/')) {
          // Prevent infinite retry loops
          if (retryingUrls.has(url)) {
            retryingUrls.delete(url);
            console.warn('[auth] Retry also returned 401 — logging out');
            localStorage.removeItem(TOKEN_KEY);
            setUser(null);
            return res;
          }

          // Try to refresh the token
          const refreshed = await refreshToken();
          if (refreshed) {
            // Retry the original request with the new token
            const newToken = localStorage.getItem(TOKEN_KEY);
            const [input, init] = args;
            const newInit = { ...init };
            if (newInit.headers instanceof Headers) {
              newInit.headers = new Headers(newInit.headers);
              newInit.headers.set('Authorization', `Bearer ${newToken}`);
            } else if (typeof newInit.headers === 'object') {
              newInit.headers = { ...newInit.headers, Authorization: `Bearer ${newToken}` };
            } else {
              newInit.headers = { Authorization: `Bearer ${newToken}` };
            }
            retryingUrls.add(url);
            const retryRes = await window.fetch(input, newInit);
            retryingUrls.delete(url);
            return retryRes;
          } else {
            // Refresh failed — token is truly expired, log out
            console.warn('[auth] Token refresh failed — logging out');
            localStorage.removeItem(TOKEN_KEY);
            setUser(null);
          }
        }
      }
      return res;
    };

    return () => { window.fetch = originalFetch; };
  }, [user, refreshToken]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
