// REST client for saved views CRUD.
// Calls Express endpoints directly (same pattern as TPE config).

const API_BASE = ''; // relative URLs — same origin

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('crm-auth-token');
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (networkErr) {
    // Network-layer error (no internet, server down, DNS) — surface a
    // clear message rather than crashing whatever component called us.
    // QA audit 2026-04-15 P1-14.
    throw new Error(`Network error calling ${path}: ${networkErr.message || 'unreachable'}`);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function listViews(entityType) {
  return apiFetch(`/api/views?entity_type=${encodeURIComponent(entityType)}`);
}

export async function createView(viewData) {
  return apiFetch('/api/views', {
    method: 'POST',
    body: JSON.stringify(viewData),
  });
}

export async function updateView(viewId, updates) {
  return apiFetch(`/api/views/${viewId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function deleteView(viewId) {
  return apiFetch(`/api/views/${viewId}`, {
    method: 'DELETE',
  });
}
