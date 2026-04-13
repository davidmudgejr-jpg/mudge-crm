/**
 * Client-side relevance ranking for search results.
 *
 * The server's fuzzy filter (ILIKE + word_similarity) finds matching rows,
 * but sorts by the view's default column — burying exact matches.
 * This re-ranks the (already filtered, max 500) rows so exact and close
 * matches on the most important fields appear first.
 *
 * @param {Object[]} rows - fetched rows from server
 * @param {string} term - user's search input
 * @param {string[]} fields - column keys in priority order (e.g. ['property_address', 'owner_name', 'city'])
 * @returns {Object[]} rows sorted by relevance (new array, doesn't mutate)
 */
export function rankByRelevance(rows, term, fields) {
  if (!term || !fields?.length) return rows;
  const lower = term.toLowerCase().trim();
  if (!lower) return rows;

  const score = (row) => {
    for (let i = 0; i < fields.length; i++) {
      const val = (row[fields[i]] || '').toLowerCase();
      if (!val) continue;
      const base = Math.max(100 - i * 15, 30);
      if (val === lower) return base;
      if (val.startsWith(lower)) return base - 5;
      if (val.includes(lower)) return base - 10;
    }
    return 0;
  };

  return [...rows].sort((a, b) => score(b) - score(a));
}
