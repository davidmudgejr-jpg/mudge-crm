import { describe, it, expect } from 'vitest';
import service from '../suggestedUpdatesApply';

const {
  classifySuggestionApply,
  applyOneSuggestion,
  getDesiredValue,
  isEmptyCrmValue,
  valuesMatch,
} = service;

describe('suggestedUpdatesApply helpers', () => {
  it('treats null and blank strings as empty CRM values', () => {
    expect(isEmptyCrmValue(null)).toBe(true);
    expect(isEmptyCrmValue(undefined)).toBe(true);
    expect(isEmptyCrmValue('   ')).toBe(true);
    expect(isEmptyCrmValue('value')).toBe(false);
    expect(isEmptyCrmValue(0)).toBe(false);
    expect(isEmptyCrmValue(false)).toBe(false);
  });

  it('uses reviewer edited applied_value when present', () => {
    expect(getDesiredValue({
      suggested_value: 'original@example.com',
      updated_data: { applied_value: 'edited@example.com' },
    })).toBe('edited@example.com');
  });

  it('falls back to suggested_value when no applied_value is present', () => {
    expect(getDesiredValue({
      suggested_value: 'original@example.com',
      updated_data: {},
    })).toBe('original@example.com');
  });

  it('compares values after string normalization', () => {
    expect(valuesMatch('  Ontario ', 'Ontario')).toBe(true);
    expect(valuesMatch(42, '42')).toBe(true);
    expect(valuesMatch('Ontario', 'Riverside')).toBe(false);
  });

  it('classifies empty target fields as safe to apply', () => {
    expect(classifySuggestionApply({ suggested_value: 'new@example.com' }, '').action).toBe('apply_empty');
    expect(classifySuggestionApply({ suggested_value: 'new@example.com' }, null).action).toBe('apply_empty');
  });

  it('classifies matching target fields as already applied', () => {
    expect(classifySuggestionApply({ suggested_value: 'new@example.com' }, 'new@example.com').action).toBe('already_applied');
  });

  it('classifies non-empty mismatches as conflicts', () => {
    expect(classifySuggestionApply({ suggested_value: 'new@example.com' }, 'old@example.com').action).toBe('conflict');
  });

  it('does not write to the target CRM record on dry-run conflicts', async () => {
    const queries = [];
    const pool = {
      async query(sql, params) {
        queries.push({ sql, params });
        return { rows: [{ current_value: 'old@example.com' }], rowCount: 1 };
      },
    };

    const result = await applyOneSuggestion(pool, {
      id: 1,
      entity_type: 'company',
      entity_id: 10,
      field_name: 'email_1',
      suggested_value: 'new@example.com',
    }, { dryRun: true });

    expect(result.outcome).toBe('conflict');
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('SELECT "email_1" AS current_value');
  });

  it('marks live conflicts for manual review without updating the target CRM record', async () => {
    const queries = [];
    const pool = {
      async query(sql, params) {
        queries.push({ sql, params });
        if (sql.includes('SELECT "email_1" AS current_value')) {
          return { rows: [{ current_value: 'old@example.com' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
    };

    const result = await applyOneSuggestion(pool, {
      id: 1,
      entity_type: 'company',
      entity_id: 10,
      field_name: 'email_1',
      suggested_value: 'new@example.com',
      review_notes: '',
      updated_data: {},
    });

    expect(result.outcome).toBe('conflict');
    expect(queries.some((q) => q.sql.includes('UPDATE "companies"'))).toBe(false);
    const suggestionUpdate = queries.find((q) => q.sql.includes('UPDATE suggested_updates'));
    expect(suggestionUpdate).toBeTruthy();
    expect(suggestionUpdate.params[1]).toBe(false);
    expect(suggestionUpdate.params[3]).toContain('needs_manual_overwrite_review');
  });
});
