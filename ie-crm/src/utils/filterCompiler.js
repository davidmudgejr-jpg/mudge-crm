// Compiles filter conditions + column definitions into parameterized SQL.
// Security: column whitelist from columnDefs, operator whitelist from OPERATOR_SQL,
// all values go through $N positional parameters. Zero string interpolation.

const EMPTY = Object.freeze({ whereClause: '', params: [] });

/**
 * @param {Array|Object|null} filters — filter conditions (array = flat AND, object = compound)
 * @param {Array} columnDefs — column definitions with { key, type, filterable }
 * @param {number} [startIndex=1] — starting $N parameter index
 * @returns {{ whereClause: string, params: any[] }}
 */
export function compileFilters(filters, columnDefs, startIndex = 1) {
  if (!filters) return EMPTY;
  if (Array.isArray(filters) && filters.length === 0) return EMPTY;
  if (typeof filters !== 'object') return EMPTY;

  // Build column whitelist from definitions
  const allowedColumns = new Set(
    columnDefs.filter(c => c.filterable !== false).map(c => c.key)
  );

  if (Array.isArray(filters)) {
    return compileConditionList(filters, allowedColumns, 'AND', startIndex);
  }

  // Compound object format: { logic, conditions }
  if (filters.logic && Array.isArray(filters.conditions)) {
    return compileCompound(filters, allowedColumns, startIndex, 0);
  }

  return EMPTY;
}

// --- internals ---

const MAX_DEPTH = 2;

const OPERATOR_SQL = {
  equals:       (col, i) => ({ sql: `${col} = $${i}`, count: 1 }),
  not_equals:   (col, i) => ({ sql: `${col} != $${i}`, count: 1 }),
  contains:     (col, i) => ({ sql: `${col} ILIKE $${i}`, count: 1, transform: v => `%${v.replace(/[%_\\]/g, '\\$&')}%` }),
  not_contains: (col, i) => ({ sql: `${col} NOT ILIKE $${i}`, count: 1, transform: v => `%${v.replace(/[%_\\]/g, '\\$&')}%` }),
  gt:           (col, i) => ({ sql: `${col} > $${i}`, count: 1 }),
  gte:          (col, i) => ({ sql: `${col} >= $${i}`, count: 1 }),
  lt:           (col, i) => ({ sql: `${col} < $${i}`, count: 1 }),
  lte:          (col, i) => ({ sql: `${col} <= $${i}`, count: 1 }),
  between:      (col, i) => ({ sql: `${col} BETWEEN $${i} AND $${i + 1}`, count: 2 }),
  is_empty:     (col)    => ({ sql: `${col} IS NULL`, count: 0 }),
  is_not_empty: (col)    => ({ sql: `${col} IS NOT NULL`, count: 0 }),
  in:           (col, i) => ({ sql: `${col} = ANY($${i})`, count: 1 }),
  // Date-friendly aliases
  before:       (col, i) => ({ sql: `${col} < $${i}`, count: 1 }),
  after:        (col, i) => ({ sql: `${col} > $${i}`, count: 1 }),
};

function compileSingleCondition(cond, allowedColumns, idx) {
  const { column, operator, value } = cond;
  if (!allowedColumns.has(column)) return null;

  const opFn = OPERATOR_SQL[operator];
  if (!opFn) return null;

  const op = opFn(column, idx);

  if (op.count === 0) {
    return { sql: op.sql, params: [], consumed: 0 };
  } else if (op.count === 1) {
    const transformed = op.transform ? op.transform(value) : value;
    return { sql: op.sql, params: [transformed], consumed: 1 };
  } else if (op.count === 2) {
    return {
      sql: op.sql,
      params: [Array.isArray(value) ? value[0] : value, Array.isArray(value) ? value[1] : value],
      consumed: 2,
    };
  }
  return null;
}

function compileConditionList(conditions, allowedColumns, logic, startIndex) {
  const clauses = [];
  const params = [];
  let idx = startIndex;

  for (const cond of conditions) {
    if (cond.logic && cond.conditions) continue; // skip sub-groups in flat list
    const result = compileSingleCondition(cond, allowedColumns, idx);
    if (!result) continue;
    clauses.push(result.sql);
    params.push(...result.params);
    idx += result.consumed;
  }

  if (clauses.length === 0) return EMPTY;
  return { whereClause: `WHERE ${clauses.join(` ${logic} `)}`, params };
}

function compileCompound(group, allowedColumns, startIndex, depth) {
  // At max depth, flatten: compile all conditions as a flat list (no further nesting)
  if (depth >= MAX_DEPTH) {
    return compileConditionList(
      group.conditions.filter(c => !c.logic),
      allowedColumns,
      group.logic === 'OR' ? 'OR' : 'AND',
      startIndex
    );
  }

  const logic = group.logic === 'OR' ? 'OR' : 'AND';
  const clauses = [];
  const params = [];
  let idx = startIndex;

  for (const item of group.conditions) {
    if (item.logic && Array.isArray(item.conditions)) {
      // Nested group
      const sub = compileCompound(item, allowedColumns, idx, depth + 1);
      if (sub.whereClause) {
        const subSql = sub.whereClause.replace(/^WHERE\s+/, '');
        clauses.push(`(${subSql})`);
        params.push(...sub.params);
        idx += sub.params.length;
      }
    } else {
      const result = compileSingleCondition(item, allowedColumns, idx);
      if (!result) continue;
      clauses.push(result.sql);
      params.push(...result.params);
      idx += result.consumed;
    }
  }

  if (clauses.length === 0) return EMPTY;
  const joined = clauses.length === 1 ? clauses[0] : clauses.join(` ${logic} `);
  return { whereClause: `WHERE ${joined}`, params };
}
