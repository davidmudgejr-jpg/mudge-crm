import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { clearApiCache } from '../api/bridge';

const AuthContext = createContext(null);

const API_BASE = import.meta.env.VITE_API_URL || '';
const TOKEN_KEY = 'crm-auth-token';

// decodeJwtPayload(token): safely parse a JWT's claims payload.
// Returns null for anything that isn't a well-formed 3-segment JWT with a
// base64url-decodable JSON payload. Also clears the bad token from
// localStorage so the calling code doesn't get stuck in a loop. QA P1-13.
function decodeJwtPayload(token) {
  if (typeof token !== 'string' || token.length === 0) return null;
  const parts = token.split('.');
  if (parts.length !== 3) {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    return null;
  }
  try {
    // atob accepts standard base64, JWTs use base64url — swap the two chars
    // and pad to a multiple of 4 so atob doesn't throw on missing padding.
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '==='.slice((b64.length + 3) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    return null;
  }
}

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
          const payload = decodeJwtPayload(token);
          if (payload) {
            setUser({ user_id: payload.user_id, email: payload.email, role: payload.role, display_name: payload.display_name });
          }
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
        const payload = decodeJwtPayload(token);
        if (payload) {
          setUser({ user_id: payload.user_id, email: payload.email, role: payload.role, display_name: payload.display_name });
        }
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
    // Evict every cached GET response so the next user on a shared device
    // can't see the previous user's data. QA audit 2026-04-15 P2-09.
    try { clearApiCache(); } catch { /* bridge not loaded — fine */ }
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
  //
  // Previously used a Set<url> to detect retry loops, which had a race
  // condition: two concurrent requests to the same URL would both 401,
  // the second request would see the first one's "in-flight retry" marker
  // and incorrectly conclude "we already retried and failed" — triggering
  // a premature logout. Replacing with a Map<url, retryCount> that tolerates
  // N concurrent retries per URL before logging out. QA audit P3-01.
  useEffect(() => {
    if (!user) return;
    const originalFetch = window.fetch;
    const MAX_RETRIES_PER_URL = 1; // 1 refresh-retry per URL per interceptor lifetime
    const retryCounts = new Map(); // url -> number of retries attempted so far

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
          const attempts = retryCounts.get(url) || 0;
          if (attempts >= MAX_RETRIES_PER_URL) {
            // We already retried this URL and it still 401'd — log out
            console.warn('[auth] Retry also returned 401 — logging out');
            retryCounts.delete(url);
            localStorage.removeItem(TOKEN_KEY);
            setUser(null);
            return res;
          }

          // Try to refresh the token (refreshToken dedupes concurrent callers)
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
            // Bump the retry count BEFORE awaiting the retry so concurrent
            // 401 on the same URL don't both count as attempt #1.
            retryCounts.set(url, attempts + 1);
            try {
              const retryRes = await window.fetch(input, newInit);
              // On success, clear the counter — next 401 starts fresh.
              if (retryRes.status !== 401) retryCounts.delete(url);
              return retryRes;
            } catch (retryErr) {
              retryCounts.delete(url);
              throw retryErr;
            }
          } else {
            // Refresh failed — token is truly expired, log out
            console.warn('[auth] Token refresh failed — logging out');
            retryCounts.delete(url);
            localStorage.removeItem(TOKEN_KEY);
            setUser(null);
          }
        }
      }
      return res;
    };

    return () => { window.fetch = originalFetch; };
  }, [user, refreshToken]);

  const token = localStorage.getItem(TOKEN_KEY);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
