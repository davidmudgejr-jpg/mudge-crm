// Pure utility for grouping table rows by a column value + computing aggregates.
// No React dependency — usable in useMemo.

const EMPTY_KEY = '__empty__';

/**
 * Group rows by a column, sort groups, and compute aggregates per group.
 *
 * @param {Array} rows - flat row array
 * @param {string} groupByColumn - column key to group by
 * @param {Array} columnDefs - column definitions (for type/format detection)
 * @param {Object} customOrders - { [columnKey]: string[] } custom sort orders
 * @returns {Array<{ groupValue, displayValue, rows, aggregates }>}
 */
export function groupAndSort(rows, groupByColumn, columnDefs, customOrders = {}) {
  if (!groupByColumn || !rows.length) return [];

  // 1. Bucket rows by group value
  const buckets = new Map();
  for (const row of rows) {
    const raw = row[groupByColumn];
    const key = (raw == null || raw === '') ? EMPTY_KEY : String(raw);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  // 2. Sort group keys
  const keys = [...buckets.keys()];
  const customOrder = customOrders[groupByColumn];

  keys.sort((a, b) => {
    // Empty always last
    if (a === EMPTY_KEY) return 1;
    if (b === EMPTY_KEY) return -1;

    if (customOrder) {
      const ai = customOrder.indexOf(a);
      const bi = customOrder.indexOf(b);
      // Both in custom order
      if (ai !== -1 && bi !== -1) return ai - bi;
      // Only one in custom order — known values first
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
    }
    // Alphabetical fallback (case-insensitive)
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });

  // 3. Build output with aggregates
  return keys.map(key => ({
    groupValue: key,
    displayValue: key === EMPTY_KEY ? '(No value)' : key,
    rows: buckets.get(key),
    aggregates: computeAggregates(buckets.get(key), columnDefs),
  }));
}

/**
 * Compute summary stats per column for a group of rows.
 *
 * @param {Array} rows - rows in this group
 * @param {Array} columnDefs - column definitions
 * @returns {Object} { [columnKey]: { sum?, avg?, min?, max?, nonEmpty, mode? } }
 */
export function computeAggregates(rows, columnDefs) {
  const result = {};
  if (!rows.length || !columnDefs) return result;

  for (const col of columnDefs) {
    // Skip linked record columns and computed-only columns
    if (col.key.startsWith('linked_')) continue;

    const format = col.format;
    const type = col.type;
    const isCurrency = format === 'currency';
    const isNumber = isCurrency || type === 'number' || format === 'number';
    const isDate = type === 'date' || format === 'date' || format === 'datetime';
    const isSelect = type === 'select' || format === 'single_select';

    const entry = { nonEmpty: 0 };

    if (isNumber) {
      let sum = 0, count = 0, min = Infinity, max = -Infinity;
      for (const row of rows) {
        const raw = row[col.key];
        if (raw == null || raw === '') continue;
        entry.nonEmpty++;
        const n = typeof raw === 'number' ? raw : parseFloat(raw);
        if (isNaN(n)) continue;
        sum += n;
        count++;
        if (n < min) min = n;
        if (n > max) max = n;
      }
      if (count > 0) {
        entry.sum = sum;
        entry.avg = sum / count;
        entry.min = min;
        entry.max = max;
        entry.isCurrency = isCurrency;
      }
    } else if (isDate) {
      let minTs = Infinity, maxTs = -Infinity;
      let minVal = null, maxVal = null;
      for (const row of rows) {
        const raw = row[col.key];
        if (raw == null || raw === '') continue;
        entry.nonEmpty++;
        const ts = new Date(raw).getTime();
        if (isNaN(ts)) continue;
        if (ts < minTs) { minTs = ts; minVal = raw; }
        if (ts > maxTs) { maxTs = ts; maxVal = raw; }
      }
      if (minVal !== null) {
        entry.min = minVal;
        entry.max = maxVal;
      }
    } else if (isSelect) {
      const counts = {};
      for (const row of rows) {
        const raw = row[col.key];
        if (raw == null || raw === '') continue;
        entry.nonEmpty++;
        const key = String(raw);
        counts[key] = (counts[key] || 0) + 1;
      }
      // Mode = most common value
      let modeVal = null, modeCount = 0;
      for (const [val, c] of Object.entries(counts)) {
        if (c > modeCount) { modeVal = val; modeCount = c; }
      }
      if (modeVal) entry.mode = modeVal;
    } else {
      // Everything else: just count non-empty
      for (const row of rows) {
        const raw = row[col.key];
        if (raw != null && raw !== '') entry.nonEmpty++;
      }
    }

    result[col.key] = entry;
  }

  return result;
}

/**
 * Pick the most interesting aggregates for display in group headers.
 * Returns up to 3 formatted summary strings.
 *
 * @param {Object} aggregates - from computeAggregates
 * @param {Array} visibleColumns - currently visible column defs
 * @param {number} totalRows - total rows in the group
 * @returns {Array<string>} formatted summary strings
 */
export function pickDisplayAggregates(aggregates, visibleColumns, totalRows) {
  const summaries = [];
  if (!aggregates || !visibleColumns) return summaries;

  // Pass 1: first currency column with non-zero sum
  for (const col of visibleColumns) {
    if (summaries.length >= 3) break;
    const agg = aggregates[col.key];
    if (!agg || !agg.isCurrency || !agg.sum) continue;
    summaries.push(`${col.label}: $${formatCompact(agg.sum)}`);
    break;
  }

  // Pass 2: first non-currency number column with avg
  for (const col of visibleColumns) {
    if (summaries.length >= 3) break;
    const agg = aggregates[col.key];
    if (!agg || agg.isCurrency || agg.avg == null) continue;
    if (col.format !== 'number' && col.type !== 'number') continue;
    summaries.push(`Avg ${col.label}: ${agg.avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
    break;
  }

  // Pass 3: first date column with a range
  for (const col of visibleColumns) {
    if (summaries.length >= 3) break;
    const agg = aggregates[col.key];
    if (!agg || !agg.min || !agg.max) continue;
    if (col.format !== 'date' && col.format !== 'datetime' && col.type !== 'date') continue;
    const minD = formatShortDate(agg.min);
    const maxD = formatShortDate(agg.max);
    if (minD && maxD && minD !== maxD) {
      summaries.push(`${col.label}: ${minD} – ${maxD}`);
    }
    break;
  }

  return summaries;
}

function formatCompact(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatShortDate(val) {
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch { return null; }
}
