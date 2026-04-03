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

// NOTE: 401 handling is done globally by AuthContext's fetch interceptor.
// bridge.js should NOT independently handle 401s — that caused race conditions
// where both bridge and AuthContext tried to refresh/clear the token simultaneously.

// ── Lightweight GET cache ────────────────────────────────────────
// Deduplicates in-flight requests and caches GET responses for 30s.
// Write operations (POST) automatically invalidate matching cache entries.
const GET_CACHE = new Map();   // path -> { data, expiry, promise? }
const CACHE_TTL = 30_000;      // 30 seconds

function getCached(path) {
  const entry = GET_CACHE.get(path);
  if (!entry) return null;
  if (Date.now() > entry.expiry) { GET_CACHE.delete(path); return null; }
  return entry;
}

function invalidateCache(pathPrefix) {
  // Clear any cached GETs that match the prefix (e.g., /api/db/ after a write)
  for (const key of GET_CACHE.keys()) {
    if (key.startsWith(pathPrefix)) GET_CACHE.delete(key);
  }
}

// Public: force-clear the entire cache (called after mutations like save/delete)
export function clearApiCache() { GET_CACHE.clear(); }

async function httpPost(path, body = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  // Invalidate related GET caches after any write
  const prefix = path.split('/').slice(0, 3).join('/'); // e.g., /api/db
  invalidateCache(prefix);
  return res.json();
}

async function httpGet(path) {
  // Check cache first
  const cached = getCached(path);
  if (cached?.data) return cached.data;
  // Deduplicate in-flight requests for the same path
  if (cached?.promise) return cached.promise;

  const promise = (async () => {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      GET_CACHE.delete(path);
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const data = await res.json();
    GET_CACHE.set(path, { data, expiry: Date.now() + CACHE_TTL });
    return data;
  })();

  // Store the in-flight promise so duplicate calls share it
  GET_CACHE.set(path, { promise, expiry: Date.now() + CACHE_TTL });
  return promise;
}

// ── Database bridge ──────────────────────────────────────────────
export const db = {
  query: (sql, params) => {
    if (isElectron()) return window.iecrm.db.query(sql, params);
    return httpPost('/api/db/query', { sql, params });
  },
  update: (entity, id, fields) => {
    if (isElectron()) return window.iecrm.db.query(
      `UPDATE ${entity} SET ${Object.keys(fields).map((k,i) => `${k} = $${i+2}`).join(', ')} WHERE ${entity.slice(0,-1)}_id = $1 RETURNING *`,
      [id, ...Object.values(fields)]
    );
    return httpPost('/api/db/update', { entity, id, fields });
  },
  create: (entity, fields, skipDuplicateCheck = false) => {
    if (isElectron()) return httpPost('/api/db/create', { entity, fields, skipDuplicateCheck });
    return httpPost('/api/db/create', { entity, fields, skipDuplicateCheck });
  },
  link: (junction, col1, id1, col2, id2, extras) => {
    if (isElectron()) return window.iecrm.db.query(
      (() => {
        const cols = [col1, col2]; const vals = [id1, id2];
        if (extras) Object.entries(extras).forEach(([k, v]) => { cols.push(k); vals.push(v); });
        return { sql: `INSERT INTO ${junction} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i+1}`).join(', ')}) ON CONFLICT DO NOTHING RETURNING *`, params: vals };
      })().sql,
      (() => { const vals = [id1, id2]; if (extras) Object.values(extras).forEach(v => vals.push(v)); return vals; })()
    );
    return httpPost('/api/db/link', { junction, col1, id1, col2, id2, extras });
  },
  unlink: (junction, col1, id1, col2, id2) => {
    if (isElectron()) return window.iecrm.db.query(
      `DELETE FROM ${junction} WHERE ${col1} = $1 AND ${col2} = $2 RETURNING *`, [id1, id2]
    );
    return httpPost('/api/db/unlink', { junction, col1, id1, col2, id2 });
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
