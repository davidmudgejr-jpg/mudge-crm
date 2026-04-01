// Cross-tab pivot navigation — navigate to another entity filtered by specific IDs.
//
// Flow:
//   1. Source page calls setPivot('contacts', [...ids], 'From Companies: Lease Expiring')
//   2. Source page navigates to #/contacts
//   3. Contacts page reads pivot from sessionStorage via readPivot('contacts')
//   4. Applies filter: contact_id = ANY(ids)
//   5. User clicks × → clearPivot('contacts') removes the filter
//
// Uses sessionStorage so pivots survive page refresh but not tab close.
// Each entity type has its own key so pivots don't interfere.

const PREFIX = 'crm-pivot-';

/**
 * Store a pivot filter for the target entity.
 */
export function setPivot(targetEntity, ids, label) {
  try {
    sessionStorage.setItem(`${PREFIX}${targetEntity}`, JSON.stringify({ ids, label }));
  } catch { /* non-critical */ }
}

/**
 * Read the active pivot for this entity (does NOT clear it).
 * Returns null if no pivot is set.
 */
export function readPivot(entityType) {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${entityType}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Clear the pivot for this entity (called when user clicks ×).
 */
export function clearPivot(entityType) {
  try {
    sessionStorage.removeItem(`${PREFIX}${entityType}`);
  } catch { /* non-critical */ }
}

/**
 * Collect unique IDs from linked records across displayed rows.
 */
export function collectLinkedIds(rows, linkedKey, idField) {
  const ids = new Set();
  for (const row of rows) {
    const linked = row[linkedKey];
    if (Array.isArray(linked)) {
      for (const item of linked) {
        if (item[idField]) ids.add(item[idField]);
      }
    }
  }
  return [...ids];
}
