import { describe, it, expect } from 'vitest';
import { groupByBatch } from '../groupByBatch';

// Helper to build a test item with sensible defaults, overridable per-test.
// NOTE: entity_id defaults to 'entity-1' so tests that share a batch_id
// also share an entity_id by default, matching the "multi-field enrichment
// of one entity" happy path. Tests that want to verify multi-entity batches
// override entity_id explicitly.
const make = (overrides = {}) => ({
  _source: 'update',
  id: 1,
  batch_id: 'b1',
  entity_id: 'entity-1',
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

  it('CRITICAL: same batch_id but different entity_id produces SEPARATE groups', () => {
    // This is the Walker Stamping / Union Pacific bug: a single agent run
    // (one batch_id) can write updates for MULTIPLE entities. Each entity
    // must get its own card — otherwise approving a card would silently
    // write Entity B's values onto Entity A's record.
    const items = [
      make({ id: 1, batch_id: 'agent48-run-1', entity_id: 'walker-stamping-uuid', field_label: 'decision_maker_title', suggested_value: 'general manager' }),
      make({ id: 2, batch_id: 'agent48-run-1', entity_id: 'walker-stamping-uuid', field_label: 'decision_maker_name',  suggested_value: 'Kimberly Clarke' }),
      make({ id: 3, batch_id: 'agent48-run-1', entity_id: 'walker-stamping-uuid', field_label: 'email_1',              suggested_value: 'kclarke@milleniapg.com' }),
      make({ id: 4, batch_id: 'agent48-run-1', entity_id: 'union-pacific-uuid',   field_label: 'decision_maker_title', suggested_value: 'AVP Mechanical Ops' }),
      make({ id: 5, batch_id: 'agent48-run-1', entity_id: 'union-pacific-uuid',   field_label: 'decision_maker_name',  suggested_value: 'Byron Hoogland' }),
      make({ id: 6, batch_id: 'agent48-run-1', entity_id: 'union-pacific-uuid',   field_label: 'email_1',              suggested_value: 'byronhoogland@up.com' }),
    ];
    const result = groupByBatch(items);

    // Must produce TWO groups, one per entity, NOT one mega-group.
    expect(result).toHaveLength(2);

    expect(result[0].batch_id).toBe('agent48-run-1');
    expect(result[0].items).toHaveLength(3);
    expect(result[0].items.map(i => i.id)).toEqual([1, 2, 3]);
    expect(result[0].items.every(i => i.entity_id === 'walker-stamping-uuid')).toBe(true);

    expect(result[1].batch_id).toBe('agent48-run-1');
    expect(result[1].items).toHaveLength(3);
    expect(result[1].items.map(i => i.id)).toEqual([4, 5, 6]);
    expect(result[1].items.every(i => i.entity_id === 'union-pacific-uuid')).toBe(true);
  });

  it('defensive: missing entity_id on an update falls through to solo group', () => {
    // If an update ever lacks entity_id (shouldn't happen, but defense in depth),
    // don't merge it with siblings that do have entity_id — treat as its own card.
    const items = [
      make({ id: 1, batch_id: 'b', entity_id: 'x' }),
      make({ id: 2, batch_id: 'b', entity_id: undefined }),
      make({ id: 3, batch_id: 'b', entity_id: 'x' }),
    ];
    const result = groupByBatch(items);

    // id 1 + id 3 group together (same batch_id + entity_id).
    // id 2 becomes its own solo group (missing entity_id).
    expect(result).toHaveLength(2);
    expect(result[0].items.map(i => i.id)).toEqual([1, 3]);
    expect(result[1].items.map(i => i.id)).toEqual([2]);
  });
});
