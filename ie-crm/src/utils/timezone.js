// Centralized timezone utilities — all dates use America/Los_Angeles (Pacific Time)

const TZ = 'America/Los_Angeles';

/**
 * Get the current date/time as an ISO string with the correct Pacific offset.
 * e.g. "2026-03-04T07:57:00.000-08:00"
 */
export function nowPacificISO() {
  const now = new Date();
  // Format parts in Pacific time
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value || '00';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;

  // Calculate the Pacific UTC offset at this moment
  const utcMs = now.getTime();
  const pacificStr = now.toLocaleString('en-US', { timeZone: TZ });
  const pacificMs = new Date(pacificStr).getTime();
  const offsetMin = Math.round((pacificMs - utcMs) / 60000);
  const sign = offsetMin >= 0 ? '+' : '-';
  const absMin = Math.abs(offsetMin);
  const offsetHH = String(Math.floor(absMin / 60)).padStart(2, '0');
  const offsetMM = String(absMin % 60).padStart(2, '0');

  return `${dateStr}${sign}${offsetHH}:${offsetMM}`;
}

/**
 * Get today's date (YYYY-MM-DD) in Pacific time.
 * Use for date-only input fields.
 */
export function todayPacific() {
  return new Date().toLocaleDateString('en-CA', { timeZone: TZ });
}

/**
 * Format a date value for display: "March 4, 2026"
 */
export function formatDatePacific(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    return d.toLocaleDateString('en-US', {
      timeZone: TZ,
      month: 'long', day: 'numeric', year: 'numeric',
    });
  } catch { return String(val); }
}

/**
 * Numeric date format for table cells: "3/15/2026"
 */
export function formatDateNumeric(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    return d.toLocaleDateString('en-US', {
      timeZone: TZ,
      month: 'numeric', day: 'numeric', year: 'numeric',
    });
  } catch { return String(val); }
}

/**
 * Compact date format for space-constrained UIs (Activity, Tasks): "Mar 4, 2026"
 */
export function formatDateCompact(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    return d.toLocaleDateString('en-US', {
      timeZone: TZ,
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return String(val); }
}

/**
 * Format a time value for display: "7:57 AM"
 */
export function formatTimePacific(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d)) return null;
    return d.toLocaleTimeString('en-US', {
      timeZone: TZ,
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return null; }
}

/**
 * Format a datetime value for display: "March 4, 2026, 7:57 AM"
 */
export function formatDateTimePacific(val) {
  if (!val) return null;
  try {
    const d = new Date(val);
    if (isNaN(d)) return String(val);
    return d.toLocaleString('en-US', {
      timeZone: TZ,
      month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch { return String(val); }
}

/**
 * Format just the time for logging/sync: "7:57:30 AM"
 */
export function formatTimeLogPacific() {
  return new Date().toLocaleTimeString('en-US', { timeZone: TZ });
}

export { TZ };
