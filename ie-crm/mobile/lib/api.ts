// API client — fetch wrapper with JWT auth headers
// Connects to Railway (production) by default, falls back to local for dev

import * as SecureStore from 'expo-secure-store';

// Use Railway production URL — works on any network
// To use local dev server instead, change to: 'http://192.168.1.35:3001'
const API_BASE = 'https://mudge-crm-production.up.railway.app';

const TOKEN_KEY = 'crm-auth-token';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // If 401, try refresh
  if (res.status === 401 && token) {
    const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (refreshRes.ok) {
      const { token: newToken } = await refreshRes.json();
      await setToken(newToken);
      // Retry original request with new token
      headers['Authorization'] = `Bearer ${newToken}`;
      return fetch(`${API_BASE}${path}`, { ...options, headers });
    }
    // Refresh failed — token is dead
    await clearToken();
  }

  return res;
}

// Convenience for JSON responses
export async function apiGet<T = any>(path: string): Promise<T> {
  const res = await apiFetch(path);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(
  path: string,
  body?: any
): Promise<T> {
  const res = await apiFetch(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

export { API_BASE };
