// REST client for saved views CRUD.
// Calls Express endpoints directly (same pattern as TPE config).

const API_BASE = ''; // relative URLs — same origin

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('crm-auth-token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
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
