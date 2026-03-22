// API Bridge — transparent adapter for Electron IPC ↔ HTTP REST
// In Electron: routes through window.iecrm (preload.js → ipcMain)
// In browser:  routes through HTTP fetch to Express server (/api/*)

const isElectron = () => typeof window !== 'undefined' && !!window.iecrm;

// Base URL for HTTP mode — empty string uses relative URLs (same origin)
const API_BASE = '';

function getAuthHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Track if we're already trying to refresh to prevent loops
let isRefreshing = false;

async function handle401(res) {
  if (res.status === 401 && !isRefreshing) {
    isRefreshing = true;
    try {
      // Try to refresh the token first
      const token = localStorage.getItem('crm-auth-token');
      if (token) {
        const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          localStorage.setItem('crm-auth-token', data.token);
          isRefreshing = false;
          return; // Token refreshed — caller can retry
        }
      }
      // Refresh failed — actually logged out
      localStorage.removeItem('crm-auth-token');
      window.location.hash = '#/';
      window.location.reload();
    } catch {
      // Network error — don't log out, server might be down
      console.warn('[bridge] 401 refresh failed — keeping token, server may be restarting');
    } finally {
      isRefreshing = false;
    }
  }
}

async function httpPost(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    handle401(res);
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function httpGet(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    handle401(res);
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Database bridge ──────────────────────────────────────────────
export const db = {
  query: (sql, params) => {
    if (isElectron()) return window.iecrm.db.query(sql, params);
    return httpPost('/api/db/query', { sql, params });
  },
  status: () => {
    if (isElectron()) return window.iecrm.db.status();
    return httpGet('/api/db/status');
  },
  schema: () => {
    if (isElectron()) return window.iecrm.db.schema();
    return httpGet('/api/db/schema');
  },
};

// ── Claude AI bridge ─────────────────────────────────────────────
export const claude = {
  chat: (messages, systemPrompt, options) => {
    if (isElectron()) return window.iecrm.claude.chat(messages, systemPrompt, options);
    // Use OAuth proxy route (Bearer token via ANTHROPIC_OAUTH_TOKEN)
    return httpPost('/api/ai/chat/sync', { messages, system: systemPrompt, options });
  },
  status: () => {
    if (isElectron()) return window.iecrm.claude.status();
    return httpGet('/api/ai/status');
  },
};

// ── File parsing bridge ──────────────────────────────────────────
export const file = {
  parse: async (arrayBuffer, fileName) => {
    if (isElectron()) return window.iecrm.file.parse(arrayBuffer, fileName);
    // HTTP mode: convert ArrayBuffer to base64 and POST
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    );
    return httpPost('/api/file/parse', { base64, fileName });
  },
};

// ── Airtable bridge ──────────────────────────────────────────────
export const airtable = {
  fetch: (tableName, offset) => {
    if (isElectron()) return window.iecrm.airtable.fetch(tableName, offset);
    const params = new URLSearchParams({ tableName });
    if (offset) params.set('offset', offset);
    return httpGet(`/api/airtable/fetch?${params}`);
  },
  test: (tableName) => {
    if (isElectron()) return window.iecrm.airtable.test(tableName);
    return httpGet(`/api/airtable/test?${new URLSearchParams({ tableName })}`);
  },
  status: () => {
    if (isElectron()) return window.iecrm.airtable.status();
    return httpGet('/api/airtable/status');
  },
};

// ── Bulk operations bridge ───────────────────────────────────
export const bulkOps = {
  delete: (table, ids) => httpPost('/api/bulk-delete', { table, ids }),
};

// ── Import bridge ────────────────────────────────────────────
export const importApi = {
  detect: (headers) => httpPost('/api/import/detect', { headers }),
  preview: (target, rows, opts = {}) => httpPost('/api/import/preview', { target, rows, ...opts }),
  batch: (target, rows, opts = {}) => httpPost('/api/import/batch', { target, rows, ...opts }),
};

// ── Settings bridge ──────────────────────────────────────────────
export const settings = {
  getEnv: (key) => {
    if (isElectron()) return window.iecrm.settings.getEnv(key);
    const params = key ? `?key=${encodeURIComponent(key)}` : '';
    return httpGet(`/api/settings/env${params}`);
  },
};

// ── Theme bridge ─────────────────────────────────────────────────
export const theme = {
  onChange: (callback) => {
    if (isElectron()) {
      window.iecrm.theme.onChange(callback);
    }
    // HTTP mode: use matchMedia to detect system theme changes
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = (e) => callback(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  },
};
