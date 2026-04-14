# Current Task List

> Managed per-session. Plan first, track progress, document results.

## Completed — 2026-04-04

- [x] Fix AuthContext token not exposed → dedup pages caused force-logout
- [x] Performance audit across Vercel / Railway / Neon
- [x] Lazy-load all page routes (React.lazy + Suspense)
- [x] Add manualChunks to Vite (three/xlsx/gsap/framer-motion)
- [x] Add compression middleware to Express
- [x] Add 22 missing database indexes
- [x] Add connectionTimeoutMillis + statement_timeout to pool
- [x] Add immutable cache headers for /assets/* in vercel.json
- [x] Add lightweight GET cache in bridge.js (30s TTL)
- [x] Batch dedup countLinkedRecords (400 queries → 8)
- [x] Fix updated_at references in contact/company merge
- [x] Add notes column to Deals table
- [x] Live deal formula recomputation (spreadsheet-style)
- [x] Fix deal_formulas VIEW for Sublease matching
- [x] Restore price_computed after migration 060 conflict
- [x] Create root CLAUDE.md with workflow principles

---

## In Progress — 2026-04-13

### Feature: Group verification queue by `batch_id`

**Goal:** When AI agents enrich a company with multiple fields in one run (e.g., Hunter writes title + name + email for Securitas), show them as ONE approval card with ONE "Approve All" button and per-field ✕ rejects, instead of three separate rows.

**Architecture:** Frontend-only change. `suggested_updates.batch_id` is already populated on 100% of pending rows (249/249, sample format `agent48-2026-04-14-11-1776164407209`). The backend already exposes `POST /api/ai/suggested-updates/batch` for batch approve/reject. Extract a pure `groupByBatch()` helper to `src/utils/` (unit-tested with vitest, matching the existing `filterCompiler.js` pattern), then render grouped batches via a new `BatchedSuggestionCard` component inside `VerificationQueue.jsx`. Single-field batches continue to render as the existing compact `SuggestionCard` — no regression to current happy path.

**Tech Stack:** React 18, Vite 6, Tailwind CSS (crm-* theme tokens), Vitest (for pure-function unit tests, already working in the repo), existing `fetch(...)` + `authHeaders()` pattern (no new libraries).

**User decisions (2026-04-13):**
1. Grouping key: `batch_id` only, no time-window fallback (100% populated)
2. Partial approval: Option B — group "Approve All" + per-field ✕ Reject; dropped fields become rejected when the group is approved
3. Single-field batches: unchanged (render as the existing compact `SuggestionCard`)

**Out of scope (deferred):**
- Schema migration (none needed — `batch_id` already exists, indexed, 100% populated)
- Agent changes (none needed — agents already write `batch_id`)
- Grouping for `sandbox_contacts` (they're already whole-contact proposals)
- Inline editing of suggested_value inside a batched card (use reject-and-rerun if you need to edit)

**Files touched:**
- **Create:** `ie-crm/src/utils/groupByBatch.js` — pure grouping helper
- **Create:** `ie-crm/src/utils/__tests__/groupByBatch.test.js` — vitest unit tests
- **Modify:** `ie-crm/src/pages/VerificationQueue.jsx` — add `BatchedSuggestionCard`, batch handlers, update render loop

---

### Task 1 — Extract `groupByBatch` pure helper (unit-tested)

**Files:**
- Create: `ie-crm/src/utils/groupByBatch.js`
- Test: `ie-crm/src/utils/__tests__/groupByBatch.test.js`

- [ ] **Step 1.1: Create `groupByBatch.js` with scaffolding only — I write this**

File contents (body is intentionally empty for Step 1.2):

```javascript
/**
 * Groups merged verification-queue items so that multi-field agent-run batches
 * collapse into a single "batched" display unit, while sandbox contacts and
 * single-field batches pass through unchanged.
 *
 * INPUT ITEM SHAPE (from VerificationQueue.jsx merge):
 *   {
 *     _source: 'update' | 'new_contact',
 *     id: number,
 *     batch_id: string | null,   // 100% populated for _source === 'update'
 *     agent_name: string,
 *     entity_name: string,
 *     entity_type: string,
 *     field_label: string,
 *     suggested_value: string,
 *     confidence: number,
 *     created_at: string,        // ISO timestamp
 *     status: 'pending' | 'accepted' | 'rejected',
 *     ...
 *   }
 *
 * OUTPUT: An array of display entries preserving original sort order, where
 * each entry is EITHER:
 *   { type: 'batch',  batchId, items: Item[] }   // 2+ items sharing a batch_id
 *   { type: 'single', item: Item }               // sandbox, or a batch-of-1
 *
 * GROUPING RULES:
 *   1. Only items where `_source === 'update'` are eligible for batching.
 *      Sandbox contacts always emit as { type: 'single' }.
 *   2. Within eligible items, group by `batch_id`.
 *   3. A batch_id group with 2+ items → ONE { type: 'batch' } entry placed at
 *      the position of the group's FIRST (= newest, since input is sorted DESC)
 *      item in the input array.
 *   4. A batch_id group with exactly 1 item → emit as { type: 'single' } so
 *      it renders as the existing compact SuggestionCard (no visual regression).
 *   5. Items with null/missing batch_id (shouldn't happen, but be defensive)
 *      emit as { type: 'single' }.
 *   6. Preserve input order for items that don't get grouped; grouped entries
 *      appear at the slot of their newest member.
 *
 * @param {Array} items - Merged, sorted items from VerificationQueue (_source-tagged, newest first)
 * @returns {Array<{type: 'batch', batchId: string, items: Array} | {type: 'single', item: object}>}
 */
export function groupByBatch(items) {
  // TODO(user): implement per rules above.
  // Hint: single pass over `items`. Track which batch_ids have been emitted so
  // you don't double-emit when you encounter the 2nd/3rd member. Collect each
  // batch_id's members into a Map so you can return them together. Aim for ~8-12 lines.
  throw new Error('not implemented');
}
```

- [ ] **Step 1.2: USER writes the body of `groupByBatch` (learning-mode contribution)**

**Why this matters:** This function encodes product judgment about where a batch *appears* in the sorted list. Does it slot at the position of the newest member, the oldest, or always at the bottom? My tests in Step 1.3 assume "position of the newest member" — but you should implement the behavior you actually want. The tests will tell us if your choice differs, and we can adjust together.

**Constraints to encode:**
1. Preserve input order for non-grouped items
2. Batches appear at the position of their newest (first-encountered) member
3. Batch-of-1 emits as `{ type: 'single' }`, not `{ type: 'batch' }`
4. Sandbox contacts (`_source !== 'update'`) always emit as single
5. Null `batch_id` → single (defensive)

**Stop here and hand off to the user. Do not proceed until the function body is written.**

- [ ] **Step 1.3: Create test file — I write this**

File: `ie-crm/src/utils/__tests__/groupByBatch.test.js`

```javascript
import { describe, it, expect } from 'vitest';
import { groupByBatch } from '../groupByBatch';

const make = (overrides) => ({
  _source: 'update',
  id: 1,
  batch_id: 'b1',
  agent_name: 'agent_test',
  entity_name: 'Test Co',
  entity_type: 'company',
  field_label: 'field',
  suggested_value: 'val',
  confidence: 95,
  created_at: '2026-04-13T20:00:00Z',
  status: 'pending',
  ...overrides,
});

describe('groupByBatch', () => {
  it('returns empty array for empty input', () => {
    expect(groupByBatch([])).toEqual([]);
  });

  it('emits a single update as type=single', () => {
    const items = [make({ id: 1, batch_id: 'b1' })];
    const result = groupByBatch(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'single', item: items[0] });
  });

  it('groups 2+ updates sharing a batch_id into one batch entry', () => {
    const items = [
      make({ id: 1, batch_id: 'agent48-abc' }),
      make({ id: 2, batch_id: 'agent48-abc' }),
      make({ id: 3, batch_id: 'agent48-abc' }),
    ];
    const result = groupByBatch(items);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('batch');
    expect(result[0].batchId).toBe('agent48-abc');
    expect(result[0].items).toHaveLength(3);
    expect(result[0].items.map(i => i.id)).toEqual([1, 2, 3]);
  });

  it('emits a batch-of-1 as type=single, not type=batch', () => {
    const items = [make({ id: 1, batch_id: 'loner' })];
    const result = groupByBatch(items);
    expect(result[0].type).toBe('single');
  });

  it('keeps sandbox contacts as type=single even when they share a batch_id', () => {
    const items = [
      make({ _source: 'new_contact', id: 1, batch_id: 'x' }),
      make({ _source: 'new_contact', id: 2, batch_id: 'x' }),
    ];
    const result = groupByBatch(items);
    expect(result).toHaveLength(2);
    expect(result.every(e => e.type === 'single')).toBe(true);
  });

  it('places batches at the position of their newest member', () => {
    // Input is newest-first (matches VerificationQueue sort order)
    const items = [
      make({ id: 100, batch_id: 'newer', created_at: '2026-04-13T21:00:00Z' }),
      make({ id: 99,  batch_id: 'older', created_at: '2026-04-13T20:00:00Z' }),
      make({ id: 98,  batch_id: 'older', created_at: '2026-04-13T19:58:00Z' }),
      make({ id: 97,  batch_id: 'older', created_at: '2026-04-13T19:55:00Z' }),
    ];
    const result = groupByBatch(items);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('single');
    expect(result[0].item.id).toBe(100);
    expect(result[1].type).toBe('batch');
    expect(result[1].batchId).toBe('older');
    expect(result[1].items.map(i => i.id)).toEqual([99, 98, 97]);
  });

  it('treats items with null batch_id as type=single (defensive)', () => {
    const items = [make({ id: 1, batch_id: null })];
    const result = groupByBatch(items);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('single');
  });

  it('handles mixed _source inputs preserving slot order', () => {
    const items = [
      make({ _source: 'update',      id: 1, batch_id: 'upd' }),
      make({ _source: 'new_contact', id: 2, batch_id: null }),
      make({ _source: 'update',      id: 3, batch_id: 'upd' }),
    ];
    const result = groupByBatch(items);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ type: 'batch', batchId: 'upd' });
    expect(result[0].items.map(i => i.id)).toEqual([1, 3]);
    expect(result[1]).toMatchObject({ type: 'single' });
    expect(result[1].item.id).toBe(2);
  });
});
```

- [ ] **Step 1.4: Run tests**

```bash
cd /Users/davidmudgejr/Desktop/ClaudeCustomCRM-real/ie-crm
npx vitest run src/utils/__tests__/groupByBatch.test.js
```

Expected output: `Test Files  1 passed (1)` · `Tests  8 passed (8)`

If a test fails, iterate on the user's Step 1.2 implementation until all 8 pass. Do NOT proceed to Task 2 until this is green.

- [ ] **Step 1.5: Commit**

```bash
cd /Users/davidmudgejr/Desktop/ClaudeCustomCRM-real
git add ie-crm/src/utils/groupByBatch.js ie-crm/src/utils/__tests__/groupByBatch.test.js
git commit -m "feat(verification-queue): extract groupByBatch pure helper with tests"
```

---

### Task 2 — Add `BatchedSuggestionCard` component

**Files:**
- Modify: `ie-crm/src/pages/VerificationQueue.jsx` (insert new component between the closing brace of `SuggestionCard` and the opening of `SandboxContactCard`)

- [ ] **Step 2.1: Insert the `BatchedSuggestionCard` component**

Locate the line `// ── Sandbox Contact Card (New Contact) ──────────────────────` (currently line 238). Insert the following block IMMEDIATELY BEFORE that comment (so the new card sits between `SuggestionCard` and `SandboxContactCard`):

```javascript
// ── Batched Suggestion Card (Multiple Fields, Same Batch) ───
function BatchedSuggestionCard({ items, onApproveBatch, onRejectBatch }) {
  const [reviewing, setReviewing] = useState(false);
  const [droppedIds, setDroppedIds] = useState(new Set());

  // All items in a batch share the same entity (guaranteed by the fact that
  // batch_id is unique per agent run, and a run always targets one entity).
  // So we pull display-common fields from the first item.
  const head = items[0];
  const badge = ENTITY_BADGES[head.entity_type] || { label: head.entity_type, cls: 'bg-crm-hover text-crm-muted' };
  const keptIds = items.filter(i => !droppedIds.has(i.id)).map(i => i.id);
  const rejectedIds = [...droppedIds];

  const toggleDrop = (id) => {
    setDroppedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleApproveAll = async () => {
    if (keptIds.length === 0) {
      // User dropped every field — treat as reject-all
      return handleRejectAll();
    }
    setReviewing(true);
    try {
      await onApproveBatch({ accept: keptIds, reject: rejectedIds });
    } finally {
      setReviewing(false);
    }
  };

  const handleRejectAll = async () => {
    setReviewing(true);
    try {
      await onRejectBatch(items.map(i => i.id));
    } finally {
      setReviewing(false);
    }
  };

  return (
    <div className="rounded-xl border border-crm-border/50 bg-crm-card/60 hover:bg-crm-card hover:border-crm-border transition-all duration-200">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-crm-border/30">
        <span className="text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
          Batch · {items.length}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0 ${badge.cls}`}>
          {badge.label}
        </span>
        <span className="text-crm-text font-medium truncate flex-1">{head.entity_name || 'Unknown'}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-crm-hover overflow-hidden">
            <div className={`h-full rounded-full ${confidenceBarColor(head.confidence)}`} style={{ width: `${head.confidence}%` }} />
          </div>
          <span className={`text-xs font-medium tabular-nums ${confidenceColor(head.confidence)}`}>{head.confidence}%</span>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-crm-hover text-crm-muted flex-shrink-0">{head.source || head.agent_name}</span>
        <span className="text-crm-muted text-[10px] flex-shrink-0 w-14 text-right">{formatTimeAgo(head.created_at)}</span>
      </div>

      {/* Field rows */}
      <div className="px-4 py-2 space-y-1.5">
        {items.map((item) => {
          const dropped = droppedIds.has(item.id);
          return (
            <div
              key={item.id}
              className={`flex items-center gap-3 py-1 ${dropped ? 'opacity-40' : ''}`}
            >
              <span className="text-crm-muted text-xs flex-shrink-0 w-40 text-right truncate">
                {item.field_label || item.field_name}:
              </span>
              {item.current_value ? (
                <span className="text-crm-muted text-xs font-mono line-through truncate max-w-[140px]">{item.current_value}</span>
              ) : (
                <span className="text-crm-muted/50 text-xs italic">(empty)</span>
              )}
              <svg className="w-3 h-3 text-crm-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className={`text-xs font-mono font-medium truncate flex-1 ${dropped ? 'text-crm-muted line-through' : 'text-green-400'}`}>
                {item.suggested_value}
              </span>
              <button
                onClick={() => toggleDrop(item.id)}
                title={dropped ? 'Keep this field' : 'Drop this field from approval'}
                className={`flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors ${
                  dropped
                    ? 'bg-crm-hover text-crm-muted hover:text-crm-text'
                    : 'text-crm-muted hover:bg-red-500/15 hover:text-red-400'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {dropped
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />}
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-crm-border/30">
        {droppedIds.size > 0 && (
          <span className="text-[10px] text-crm-muted mr-auto italic">
            {droppedIds.size} dropped, {keptIds.length} kept
          </span>
        )}
        <button
          onClick={handleApproveAll}
          disabled={reviewing}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-colors text-xs font-medium disabled:opacity-50"
        >
          {reviewing ? (
            <div className="w-3.5 h-3.5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          Approve {keptIds.length === items.length ? 'All' : `${keptIds.length} of ${items.length}`}
        </button>
        <button
          onClick={handleRejectAll}
          disabled={reviewing}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors text-xs font-medium disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Reject All
        </button>
      </div>
    </div>
  );
}

```

- [ ] **Step 2.2: Commit (component only — not yet wired up, won't render)**

```bash
cd /Users/davidmudgejr/Desktop/ClaudeCustomCRM-real
git add ie-crm/src/pages/VerificationQueue.jsx
git commit -m "feat(verification-queue): add BatchedSuggestionCard component"
```

---

### Task 3 — Wire batch handlers and swap the render loop

**Files:**
- Modify: `ie-crm/src/pages/VerificationQueue.jsx` (4 edits in this one file)

- [ ] **Step 3.1: Import `groupByBatch` at the top of the file**

At line 1-2, the current imports are:

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '../components/shared/Toast';
```

Add one new import below them:

```javascript
import { groupByBatch } from '../utils/groupByBatch';
```

- [ ] **Step 3.2: Add two new handlers inside `VerificationQueue` — after `handleAcceptAll`**

Locate the `handleAcceptAll` function (it ends around line 579 with `} catch { addToast('Network error', 'error'); } };`). Insert the following IMMEDIATELY AFTER `handleAcceptAll`'s closing brace:

```javascript
// ── Handlers for BatchedSuggestionCard ──
const handleBatchApprove = async ({ accept, reject }) => {
  try {
    // Two sequential calls — the backend /batch endpoint only accepts one
    // status per request, and we may have both accepted and rejected IDs
    // when the user drops some fields before approving. Reject first so
    // that if the reject call fails, nothing has been committed yet.
    if (reject.length > 0) {
      const rejRes = await fetch(`${API}/api/ai/suggested-updates/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ids: reject, status: 'rejected' }),
      });
      if (!rejRes.ok) {
        const data = await rejRes.json().catch(() => ({}));
        addToast(data.error || 'Failed to reject dropped fields', 'error');
        return;
      }
    }
    if (accept.length > 0) {
      const accRes = await fetch(`${API}/api/ai/suggested-updates/batch`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ ids: accept, status: 'accepted' }),
      });
      const data = await accRes.json();
      if (accRes.ok) {
        const dropMsg = reject.length > 0 ? ` (${reject.length} dropped)` : '';
        addToast(`${data.processed || accept.length} fields approved${dropMsg}`, 'success');
      } else {
        addToast(data.error || 'Batch approve failed', 'error');
        return;
      }
    }
    fetchData();
  } catch {
    addToast('Network error', 'error');
  }
};

const handleBatchReject = async (ids) => {
  try {
    const res = await fetch(`${API}/api/ai/suggested-updates/batch`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ ids, status: 'rejected' }),
    });
    const data = await res.json();
    if (res.ok) {
      addToast(`${data.processed || ids.length} fields rejected`, 'success');
      fetchData();
    } else {
      addToast(data.error || 'Batch reject failed', 'error');
    }
  } catch {
    addToast('Network error', 'error');
  }
};
```

- [ ] **Step 3.3: Compute `displayGroups` inside the component body**

Find the line (currently 472-475):

```javascript
const allItems = [
  ...suggestedItems.map(s => ({ ...s, _source: 'update' })),
  ...sandboxItems.map(c => ({ ...c, _source: 'new_contact' })),
].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
```

Immediately after it, add:

```javascript
const displayGroups = groupByBatch(allItems);

// Single-item-eligible IDs for the "Select all updates" checkbox.
// We exclude items that live inside a batch entry because batched cards
// don't render their own checkbox — batching them into selectedIds would
// make "Approve Selected" operate on items the user can't see as selected.
const selectableSingleUpdateIds = displayGroups
  .filter(e => e.type === 'single' && e.item._source === 'update' && e.item.status === 'pending')
  .map(e => e.item.id);
```

- [ ] **Step 3.4: Replace the render `.map` block (currently lines 749-768)**

Find this block (the `{allItems.map((item) => ( ... ))}` starting around line 749):

```javascript
{allItems.map((item) => (
  <div key={`${item._source}-${item.id}`} className="flex items-center gap-2">
    {/* Checkbox only for suggested_updates on pending tab */}
    {activeTab === 'pending' && item.status === 'pending' && item._source === 'update' && (
      <input
        type="checkbox"
        checked={selectedIds.has(item.id)}
        onChange={() => toggleSelect(item.id)}
        className="rounded border-crm-border text-crm-accent focus:ring-crm-accent/30 flex-shrink-0"
      />
    )}
    <div className="flex-1">
      {item._source === 'update' ? (
        <SuggestionCard item={item} onReview={handleReview} />
      ) : (
        <SandboxContactCard item={item} onReview={handleSandboxReview} />
      )}
    </div>
  </div>
))}
```

Replace with:

```javascript
{displayGroups.map((entry) => {
  if (entry.type === 'batch') {
    return (
      <div key={`batch-${entry.batchId}`}>
        <BatchedSuggestionCard
          items={entry.items}
          onApproveBatch={handleBatchApprove}
          onRejectBatch={handleBatchReject}
        />
      </div>
    );
  }
  const item = entry.item;
  return (
    <div key={`${item._source}-${item.id}`} className="flex items-center gap-2">
      {activeTab === 'pending' && item.status === 'pending' && item._source === 'update' && (
        <input
          type="checkbox"
          checked={selectedIds.has(item.id)}
          onChange={() => toggleSelect(item.id)}
          className="rounded border-crm-border text-crm-accent focus:ring-crm-accent/30 flex-shrink-0"
        />
      )}
      <div className="flex-1">
        {item._source === 'update' ? (
          <SuggestionCard item={item} onReview={handleReview} />
        ) : (
          <SandboxContactCard item={item} onReview={handleSandboxReview} />
        )}
      </div>
    </div>
  );
})}
```

- [ ] **Step 3.5: Fix the "Select all updates" checkbox to use only single-item IDs**

Find the select-all block (currently around lines 731-747). The current `onChange` sets `selectedIds` using `suggestedItems.filter(...)`, which captures EVERY pending update — including those inside batches. Change it to use `selectableSingleUpdateIds`:

Find:

```javascript
{activeTab === 'pending' && pendingUpdateCount > 1 && (
  <label className="flex items-center gap-2 px-4 py-2 text-xs text-crm-muted cursor-pointer hover:text-crm-text">
    <input
      type="checkbox"
      checked={selectedIds.size === pendingUpdateCount && selectedIds.size > 0}
      onChange={(e) => {
        if (e.target.checked) {
          setSelectedIds(new Set(suggestedItems.filter(i => i.status === 'pending').map(i => i.id)));
        } else {
          setSelectedIds(new Set());
        }
      }}
      className="rounded border-crm-border text-crm-accent focus:ring-crm-accent/30"
    />
    Select all updates
  </label>
)}
```

Replace with:

```javascript
{activeTab === 'pending' && selectableSingleUpdateIds.length > 1 && (
  <label className="flex items-center gap-2 px-4 py-2 text-xs text-crm-muted cursor-pointer hover:text-crm-text">
    <input
      type="checkbox"
      checked={selectedIds.size === selectableSingleUpdateIds.length && selectedIds.size > 0}
      onChange={(e) => {
        if (e.target.checked) {
          setSelectedIds(new Set(selectableSingleUpdateIds));
        } else {
          setSelectedIds(new Set());
        }
      }}
      className="rounded border-crm-border text-crm-accent focus:ring-crm-accent/30"
    />
    Select all single-field updates
  </label>
)}
```

- [ ] **Step 3.6: Commit**

```bash
cd /Users/davidmudgejr/Desktop/ClaudeCustomCRM-real
git add ie-crm/src/pages/VerificationQueue.jsx
git commit -m "feat(verification-queue): render multi-field batches as BatchedSuggestionCard

- Import groupByBatch helper
- Add handleBatchApprove + handleBatchReject
- Swap flat .map for groupByBatch-based render
- Narrow 'Select all updates' to single-item entries only"
```

---

### Task 4 — Manual verification in the browser

**Files:** None (smoke test only).

- [ ] **Step 4.1: Start dev servers**

Use your `start-servers` skill, or manually:

```bash
cd /Users/davidmudgejr/Desktop/ClaudeCustomCRM-real/ie-crm
npm run dev:web
```

Expected: Vite on :5173 and Express on :3001 both running.

- [ ] **Step 4.2: Open the Verification Queue page**

Navigate to `http://localhost:5173/#/verification-queue` (or click it in the sidebar).

- [ ] **Step 4.3: Verify Securitas renders as ONE batched card with 3 rows**

Expected: a single card with:
- "Batch · 3" chip in the header
- Entity badge + "Securitas Security Services USA" as the single entity name
- Three field rows: `decision_maker_title`, `decision_maker_name`, `email_1`
- ONE "Approve All" button and ONE "Reject All" button at the bottom

- [ ] **Step 4.4: Verify Protech renders as ONE batched card with 3 rows**

Same shape as Securitas, for "Protech Staffing Services Inc."

- [ ] **Step 4.5: Test "Approve All" commits all 3 fields**

On the Protech card, click **Approve All**. Expected:
- Toast: "3 fields approved"
- Card disappears from the queue
- Navigate to Companies → Protech Staffing Services Inc → all 3 fields populated

- [ ] **Step 4.6: Test per-field ✕ drop + Approve All**

Trigger new enrichment (or use another batch that appears). On its card:
- Click the ✕ on one field row → that row goes dim with strikethrough
- Header note reads "1 dropped, 2 kept"
- Button text reads "Approve 2 of 3"
- Click Approve 2 of 3 → Toast: "2 fields approved (1 dropped)"
- Card disappears
- Navigate to the entity → 2 fields populated, 1 still empty
- Check DB via Claude panel: `SELECT status FROM suggested_updates WHERE id = <dropped_id>` → should be `rejected`

- [ ] **Step 4.7: Test Reject All**

On another batch card: click **Reject All**. Expected:
- Toast: "N fields rejected"
- Card disappears
- DB: all IDs in that batch are `status = 'rejected'`

- [ ] **Step 4.8: Verify single-field updates still render as compact SuggestionCard**

Find an agent run that only touched one field (a batch of 1). Expected: renders as the OLD compact card layout (one row, inline Approve/Reject buttons), not as a `BatchedSuggestionCard`.

- [ ] **Step 4.9: Verify SandboxContactCards unchanged**

New-contact proposals should still render as the full-contact card layout.

- [ ] **Step 4.10: Verify "Select all updates" checkbox works correctly**

If you have both single-item updates AND batched cards in the queue:
- Click "Select all single-field updates"
- Verify only the single-item checkboxes light up
- Verify batched cards are NOT affected
- Click "Approve Selected (N)" → N should match the single-item count, not the total pending count

- [ ] **Step 4.11: Verify tab counts stay accurate**

The "N pending" stat in the page header should still count individual fields, not batches (each field is still a DB row). If you had 249 pending before and batches exist, you should still see "249 pending" in the header.

- [ ] **Step 4.12: Commit any final touch-up fixes**

If any tweaks were needed during manual testing, commit them:

```bash
git add -A
git commit -m "fix(verification-queue): <describe the tweak>"
```

---

### Task 5 — Review and document

- [ ] **Step 5.1: Fill in the Review section below with outcomes**
- [ ] **Step 5.2: If any new lessons learned, append them to `tasks/lessons.md`**
- [ ] **Step 5.3: Push to main (triggers Vercel + Railway auto-deploy)**

```bash
git push origin main
```

---

## Review — Feature: Group verification queue by batch_id

_Filled in after implementation._

**What worked:**

**What broke:**

**What we'd do differently:**

**Follow-ups (if any):**

---
