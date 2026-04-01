// Client-side filtering for linked record columns (linked_contacts, linked_properties, etc.)
// These columns are arrays injected after the DB query, so they can't be filtered in SQL.
// This utility applies is_empty/is_not_empty/contains filters on augmented rows.

const LINKED_KEYS = new Set([
  'linked_contacts', 'linked_properties', 'linked_deals',
  'linked_companies', 'linked_interactions', 'linked_campaigns',
  'linked_owner_contacts', 'linked_broker_contacts',
  'linked_tenant_companies', 'linked_owner_companies', 'linked_leasing_companies',
]);

/**
 * Extract filters that target linked record columns.
 * @param {Array} filters - array of filter conditions
 * @returns {{ linkedFilters: Array, dbFilters: Array }}
 */
export function splitLinkedFilters(filters) {
  if (!Array.isArray(filters) || filters.length === 0) {
    return { linkedFilters: [], dbFilters: [] };
  }
  const linkedFilters = [];
  const dbFilters = [];
  for (const f of filters) {
    if (LINKED_KEYS.has(f.column)) {
      linkedFilters.push(f);
    } else {
      dbFilters.push(f);
    }
  }
  return { linkedFilters, dbFilters };
}

/**
 * Apply linked record filters to augmented rows.
 * @param {Array} rows - augmented rows with linked_* arrays
 * @param {Array} linkedFilters - filter conditions for linked columns
 * @returns {Array} filtered rows
 */
export function applyLinkedFilters(rows, linkedFilters) {
  if (!linkedFilters || linkedFilters.length === 0) return rows;

  return rows.filter(row => {
    return linkedFilters.every(f => {
      const val = row[f.column];
      const isEmpty = !val || (Array.isArray(val) && val.length === 0);

      switch (f.operator) {
        case 'is_empty':
          return isEmpty;
        case 'is_not_empty':
          return !isEmpty;
        case 'contains': {
          if (isEmpty) return false;
          const search = (f.value || '').toLowerCase();
          // Search through linked record display values
          return val.some(item => {
            const text = Object.values(item).join(' ').toLowerCase();
            return text.includes(search);
          });
        }
        case 'not_contains': {
          if (isEmpty) return true;
          const search = (f.value || '').toLowerCase();
          return !val.some(item => {
            const text = Object.values(item).join(' ').toLowerCase();
            return text.includes(search);
          });
        }
        default:
          return true; // Unknown operator — don't filter
      }
    });
  });
}
