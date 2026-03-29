// Auth context — shared across all screens via React context
// Each screen that calls useAuth() gets the SAME user state

import React, { useState, useEffect, useCallback, useContext, createContext } from 'react';
import { getToken, setToken, clearToken, API_BASE } from '../lib/api';
import { disconnectSocket } from '../lib/socket';

export interface User {
  user_id: string;
  email: string;
  display_name: string;
  role: 'broker' | 'agent' | 'admin';
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  login: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Validate existing token on mount
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          await clearToken();
        }
      } catch {
        // Network error — try to decode token locally
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          setUser({
            user_id: payload.user_id,
            email: payload.email,
            display_name: payload.display_name,
            role: payload.role,
          });
        } catch {
          await clearToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Login failed');
      }
      const { token, user: userData } = await res.json();
      await setToken(token);
      setUser(userData);
      setLoading(false);
    } catch (err: any) {
      setUser(null);
      setLoading(false);
      setError(err.message);
    }
  }, []);

  const logout = useCallback(async () => {
    disconnectSocket();
    await clearToken();
    setUser(null);
    setError(null);
  }, []);

  return React.createElement(
    AuthContext.Provider,
    { value: { user, loading, error, login, logout } },
    children
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
