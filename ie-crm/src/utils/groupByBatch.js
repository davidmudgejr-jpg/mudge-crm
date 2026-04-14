/**
 * Groups merged verification-queue items by (batch_id, entity_id) so that
 * multi-field enrichment runs targeting the SAME entity collapse into a
 * single approval card, while updates for DIFFERENT entities within the
 * same agent run stay as separate cards.
 *
 * ⚠️ This grouping key was originally just `batch_id`, but that was wrong:
 * your agents put ALL updates for a single run under one `batch_id`
 * regardless of which entity each row targets. A single batch can contain
 * updates for Walker Stamping AND Union Pacific — those MUST render as two
 * cards, not one, or the UI silently mixes data between companies on
 * approval. The fix: include entity_id in the grouping key.
 *
 * INPUT: items array from VerificationQueue.jsx's merge step. Each item
 * carries `_source` ('update' | 'new_contact'), `batch_id` (100% populated
 * for `_source === 'update'` per current schema — migration 029),
 * `entity_id` (the UUID of the target record), `entity_name`, and all
 * standard `suggested_updates` columns.
 *
 * OUTPUT: an array of groups, each shaped as { batch_id, items, entity_name }.
 * All items in a group share the same batch_id AND entity_id (so they all
 * represent updates to ONE entity from ONE agent run). Consumers branch on
 * `items.length > 1` to decide between BatchedSuggestionCard (multi-field)
 * and the existing compact SuggestionCard / SandboxContactCard.
 *
 * RULES:
 *   1. Only items where `_source === 'update'` are eligible for batching.
 *      Sandbox contacts flow through as their own 1-item groups.
 *   2. Within eligible items, group by `(batch_id, entity_id)` equality —
 *      BOTH must match for items to share a group.
 *   3. A group appears in the output at the position of its FIRST-encountered
 *      member. Since VerificationQueue sorts newest-first, batches slot at
 *      the position of their newest field.
 *   4. Items missing `batch_id` OR `entity_id`, or with `_source !== 'update'`,
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
    // Real batch key ONLY if this is a true update with BOTH a populated
    // batch_id AND entity_id. Everything else (sandboxes, missing keys)
    // gets a unique solo key so it emits as its own 1-item group and
    // renders as a compact card downstream.
    const key = (item._source === 'update' && item.batch_id && item.entity_id)
      ? `batch:${item.batch_id}:${item.entity_id}`
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
