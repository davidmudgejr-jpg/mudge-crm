/**
 * Groups merged verification-queue items by `batch_id` so that multi-field
 * enrichment runs (e.g., Hunter writing decision_maker_title + decision_maker_name
 * + email_1 for the same company in one pass) can be approved or rejected as a
 * single unit rather than one click per field.
 *
 * INPUT: items array from VerificationQueue.jsx's merge step. Each item carries
 * `_source` ('update' | 'new_contact'), `batch_id` (100% populated for
 * `_source === 'update'` per current schema — see migration 029), `entity_name`,
 * and all the standard `suggested_updates` columns.
 *
 * OUTPUT: an array of groups, each shaped as { batch_id, items, entity_name }.
 * Uniform shape regardless of cardinality — consumers branch on
 * `items.length > 1` to decide between BatchedSuggestionCard (multi-field) and
 * the existing compact SuggestionCard / SandboxContactCard (single-field).
 *
 * RULES:
 *   1. Only items where `_source === 'update'` are eligible for batching.
 *      Sandbox contacts flow through as their own 1-item groups.
 *   2. Within eligible items, group by `batch_id` equality.
 *   3. A group appears in the output at the position of its FIRST-encountered
 *      member. Since VerificationQueue sorts items newest-first, batches
 *      slot at the position of their newest field.
 *   4. Items with null/missing `batch_id`, or with `_source !== 'update'`,
 *      always become their own 1-item groups (defensive — keeps them
 *      rendering as the existing compact cards).
 *
 * @param {Array<Object>} items - Merged, sorted items (newest first)
 * @returns {Array<{batch_id: string|null, items: Array<Object>, entity_name: string}>}
 */
export function groupByBatch(items) {
  const groups = new Map();
  const order = [];
  for (const item of items) {
    // Real batch key ONLY if this is a true update with a populated batch_id.
    // Everything else (sandboxes, null batch_ids) gets a unique solo key so it
    // emits as its own 1-item group and renders as a compact card downstream.
    const key = (item._source === 'update' && item.batch_id)
      ? `batch:${item.batch_id}`
      : `solo:${item._source}:${item.id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        batch_id: item.batch_id ?? null,
        items: [],
        entity_name: item.entity_name,
      });
      order.push(key);
    }
    groups.get(key).items.push(item);
  }
  return order.map(k => groups.get(k));
}
