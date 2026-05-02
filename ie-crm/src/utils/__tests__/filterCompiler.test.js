import { describe, it, expect } from 'vitest';
import { compileFilters } from '../filterCompiler';

const COLUMN_DEFS = [
  { key: 'city', label: 'City', type: 'text', filterable: true },
  { key: 'property_type', label: 'Type', type: 'select', filterable: true },
  { key: 'rba', label: 'Bldg SF', type: 'number', filterable: true },
  { key: 'lease_exp', label: 'Lease Exp', type: 'date', filterable: true },
  { key: 'priority', label: 'Priority', type: 'select', filterable: true },
];

describe('compileFilters', () => {
  // --- Empty / null / undefined ---
  it('returns empty clause for empty array', () => {
    expect(compileFilters([], COLUMN_DEFS)).toEqual({ whereClause: '', params: [] });
  });

  it('returns empty clause for null filters', () => {
    expect(compileFilters(null, COLUMN_DEFS)).toEqual({ whereClause: '', params: [] });
  });

  it('returns empty clause for undefined filters', () => {
    expect(compileFilters(undefined, COLUMN_DEFS)).toEqual({ whereClause: '', params: [] });
  });

  // --- Single condition operators ---
  it('compiles a single equals condition', () => {
    const filters = [{ column: 'city', operator: 'equals', value: 'Riverside' }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE city = $1',
      params: ['Riverside'],
    });
  });

  it('compiles contains with ILIKE wrapping', () => {
    const filters = [{ column: 'city', operator: 'contains', value: 'River' }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE city ILIKE $1',
      params: ['%River%'],
    });
  });

  it('escapes ILIKE wildcards in contains values', () => {
    const filters = [{ column: 'city', operator: 'contains', value: '50%' }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE city ILIKE $1',
      params: ['%50\\%%'],
    });
  });

  it('coerces non-string contains values before escaping', () => {
    const filters = [{ column: 'city', operator: 'contains', value: 92507 }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE city ILIKE $1',
      params: ['%92507%'],
    });
  });

  it('compiles between with two params', () => {
    const filters = [{ column: 'rba', operator: 'between', value: [10000, 50000] }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE rba BETWEEN $1 AND $2',
      params: [10000, 50000],
    });
  });

  it('compiles is_empty with no params', () => {
    const filters = [{ column: 'lease_exp', operator: 'is_empty' }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: "WHERE (lease_exp IS NULL OR CAST(lease_exp AS TEXT) = '')",
      params: [],
    });
  });

  it('compiles in operator with ANY', () => {
    const filters = [{ column: 'priority', operator: 'in', value: ['Hot', 'Warm'] }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE priority = ANY($1)',
      params: [['Hot', 'Warm']],
    });
  });

  it('compiles before (date alias for lt)', () => {
    const filters = [{ column: 'lease_exp', operator: 'before', value: '2026-12-31' }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE lease_exp < $1',
      params: ['2026-12-31'],
    });
  });

  it('compiles after (date alias for gt)', () => {
    const filters = [{ column: 'lease_exp', operator: 'after', value: '2025-01-01' }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE lease_exp > $1',
      params: ['2025-01-01'],
    });
  });

  it('clamps relative date windows to a bounded interval', () => {
    const filters = [{ column: 'lease_exp', operator: 'in_next_n_days', value: '999999' }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: "WHERE (lease_exp >= CURRENT_DATE AND lease_exp <= CURRENT_DATE + INTERVAL '3650 days')",
      params: [],
    });
  });

  // --- Multiple flat conditions (AND) ---
  it('ANDs multiple flat conditions', () => {
    const filters = [
      { column: 'property_type', operator: 'equals', value: 'Industrial' },
      { column: 'rba', operator: 'between', value: [10000, 50000] },
      { column: 'city', operator: 'equals', value: 'Riverside' },
    ];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE property_type = $1 AND rba BETWEEN $2 AND $3 AND city = $4',
      params: ['Industrial', 10000, 50000, 'Riverside'],
    });
  });

  // --- Security ---
  it('skips unknown columns (column whitelist)', () => {
    const filters = [
      { column: 'city', operator: 'equals', value: 'Riverside' },
      { column: 'evil_column', operator: 'equals', value: 'hack' },
    ];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE city = $1',
      params: ['Riverside'],
    });
  });

  it('skips unknown operators (operator whitelist)', () => {
    const filters = [
      { column: 'city', operator: 'equals', value: 'Riverside' },
      { column: 'rba', operator: 'DROP_TABLE', value: 'hack' },
    ];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE city = $1',
      params: ['Riverside'],
    });
  });

  it('returns empty when all conditions are invalid', () => {
    const filters = [{ column: 'evil', operator: 'equals', value: 'hack' }];
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({ whereClause: '', params: [] });
  });

  // --- Compound filters (AND + OR groups) ---
  it('compiles compound object with nested OR group', () => {
    const filters = {
      logic: 'AND',
      conditions: [
        { column: 'city', operator: 'equals', value: 'Riverside' },
        {
          logic: 'OR',
          conditions: [
            { column: 'property_type', operator: 'equals', value: 'Industrial' },
            { column: 'property_type', operator: 'equals', value: 'Office' },
          ],
        },
      ],
    };
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE city = $1 AND (property_type = $2 OR property_type = $3)',
      params: ['Riverside', 'Industrial', 'Office'],
    });
  });

  it('handles startIndex parameter for offset', () => {
    const filters = [{ column: 'city', operator: 'equals', value: 'Riverside' }];
    expect(compileFilters(filters, COLUMN_DEFS, 5)).toEqual({
      whereClause: 'WHERE city = $5',
      params: ['Riverside'],
    });
  });

  it('handles top-level OR logic', () => {
    const filters = {
      logic: 'OR',
      conditions: [
        { column: 'city', operator: 'equals', value: 'Riverside' },
        { column: 'city', operator: 'equals', value: 'Ontario' },
      ],
    };
    expect(compileFilters(filters, COLUMN_DEFS)).toEqual({
      whereClause: 'WHERE city = $1 OR city = $2',
      params: ['Riverside', 'Ontario'],
    });
  });
});
