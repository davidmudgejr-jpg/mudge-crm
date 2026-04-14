import { describe, it, expect } from 'vitest';
import { groupByBatch } from '../groupByBatch';

// Helper to build a test item with sensible defaults, overridable per-test.
const make = (overrides = {}) => ({
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

  it('emits a single update as a 1-item group with correct shape', () => {
    const items = [make({ id: 1, batch_id: 'b1' })];
    const result = groupByBatch(items);

    expect(result).toHaveLength(1);
    expect(result[0].batch_id).toBe('b1');
    expect(result[0].entity_name).toBe('Test Co');
    expect(result[0].items).toHaveLength(1);
    expect(result[0].items[0]).toBe(items[0]); // identity, not a copy
  });

  it('groups 2+ updates sharing a batch_id into one multi-item group', () => {
    const items = [
      make({ id: 1, batch_id: 'agent48-2026-04-14-11-1776164407209' }),
      make({ id: 2, batch_id: 'agent48-2026-04-14-11-1776164407209' }),
      make({ id: 3, batch_id: 'agent48-2026-04-14-11-1776164407209' }),
    ];
    const result = groupByBatch(items);

    expect(result).toHaveLength(1);
    expect(result[0].batch_id).toBe('agent48-2026-04-14-11-1776164407209');
    expect(result[0].items).toHaveLength(3);
    expect(result[0].items.map(i => i.id)).toEqual([1, 2, 3]);
  });

  it('keeps sandbox contacts as their own 1-item groups even when sharing batch_id', () => {
    // Sandboxes should NEVER merge into a batched card — they're whole-contact
    // proposals, not field updates. Each one is its own review unit.
    const items = [
      make({ _source: 'new_contact', id: 1, batch_id: 'x' }),
      make({ _source: 'new_contact', id: 2, batch_id: 'x' }),
    ];
    const result = groupByBatch(items);

    expect(result).toHaveLength(2);
    expect(result[0].items).toEqual([items[0]]);
    expect(result[1].items).toEqual([items[1]]);
  });

  it('places batches at the position of their newest (first-seen) member', () => {
    // Input is sorted newest-first, matching VerificationQueue's merge step.
    // 'newer' is a batch-of-1 (becomes single, at slot 0).
    // 'older' is a batch-of-3 (becomes multi, at slot 1 — where id 99 was).
    const items = [
      make({ id: 100, batch_id: 'newer', created_at: '2026-04-13T21:00:00Z' }),
      make({ id: 99,  batch_id: 'older', created_at: '2026-04-13T20:00:00Z' }),
      make({ id: 98,  batch_id: 'older', created_at: '2026-04-13T19:58:00Z' }),
      make({ id: 97,  batch_id: 'older', created_at: '2026-04-13T19:55:00Z' }),
    ];
    const result = groupByBatch(items);

    expect(result).toHaveLength(2);
    expect(result[0].batch_id).toBe('newer');
    expect(result[0].items).toHaveLength(1);
    expect(result[1].batch_id).toBe('older');
    expect(result[1].items).toHaveLength(3);
    expect(result[1].items.map(i => i.id)).toEqual([99, 98, 97]);
  });

  it('treats items with null batch_id as their own 1-item groups (defensive)', () => {
    const items = [make({ id: 1, batch_id: null })];
    const result = groupByBatch(items);

    expect(result).toHaveLength(1);
    expect(result[0].batch_id).toBeNull();
    expect(result[0].items).toHaveLength(1);
  });

  it('handles mixed _source inputs preserving slot order', () => {
    const items = [
      make({ _source: 'update',      id: 1, batch_id: 'upd' }),
      make({ _source: 'new_contact', id: 2, batch_id: null }),
      make({ _source: 'update',      id: 3, batch_id: 'upd' }),
    ];
    const result = groupByBatch(items);

    expect(result).toHaveLength(2);
    // 'upd' batch slot is at position 0 (where id 1 was); id 3 joins it.
    expect(result[0].batch_id).toBe('upd');
    expect(result[0].items.map(i => i.id)).toEqual([1, 3]);
    // Sandbox at position 1 (where id 2 was).
    expect(result[1].batch_id).toBeNull();
    expect(result[1].items.map(i => i.id)).toEqual([2]);
  });

  it('handles an empty-string batch_id as defensive null (falsy)', () => {
    // Edge: if an agent ever POSTs an empty-string batch_id by mistake,
    // we should NOT merge those rows into one giant bogus group.
    const items = [
      make({ id: 1, batch_id: '' }),
      make({ id: 2, batch_id: '' }),
    ];
    const result = groupByBatch(items);

    expect(result).toHaveLength(2); // each becomes its own solo group
    expect(result[0].items).toHaveLength(1);
    expect(result[1].items).toHaveLength(1);
  });
});
