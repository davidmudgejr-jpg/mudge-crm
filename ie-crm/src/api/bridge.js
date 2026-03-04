// API Bridge — transparent adapter for Electron IPC ↔ HTTP REST
// In Electron: routes through window.iecrm (preload.js → ipcMain)
// In browser:  routes through HTTP fetch to Express server (/api/*)

const isElectron = () => typeof window !== 'undefined' && !!window.iecrm;

// Base URL for HTTP mode — empty string uses relative URLs (same origin)
const API_BASE = '';

async function httpPost(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function httpGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
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
    return httpPost('/api/claude/chat', { messages, systemPrompt, options });
  },
  status: () => {
    if (isElectron()) return window.iecrm.claude.status();
    return httpGet('/api/claude/status');
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
