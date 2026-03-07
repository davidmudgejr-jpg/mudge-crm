// Address Normalizer — shared utility for CSV import & migration scripts
// Converts raw addresses from any source into a canonical form for matching.
//
// Usage:
//   const { normalizeAddress, parseAddress } = require('./addressNormalizer');
//   const result = parseAddress("1234 Main Street, Suite 200, Riverside, CA 92507");
//   // { normalized: "1234 main st", unit: "ste 200", city: "riverside", state: "ca", zip: "92507" }

const STREET_ABBREVS = {
  street: 'st', avenue: 'ave', boulevard: 'blvd', drive: 'dr',
  road: 'rd', lane: 'ln', circle: 'cir', court: 'ct',
  place: 'pl', way: 'way', terrace: 'ter', trail: 'trl',
  parkway: 'pkwy', highway: 'hwy', freeway: 'fwy',
  north: 'n', south: 's', east: 'e', west: 'w',
  northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw',
  // Also match already-abbreviated forms (idempotent)
  st: 'st', ave: 'ave', blvd: 'blvd', dr: 'dr', rd: 'rd',
  ln: 'ln', cir: 'cir', ct: 'ct', pl: 'pl', ter: 'ter',
  trl: 'trl', pkwy: 'pkwy', hwy: 'hwy', fwy: 'fwy',
  n: 'n', s: 's', e: 'e', w: 'w',
  ne: 'ne', nw: 'nw', se: 'se', sw: 'sw',
};

const UNIT_PREFIXES = /^(suite|ste|unit|apt|apartment|building|bldg|floor|fl|room|rm|#)\b/i;

const STATE_ABBREVS = {
  california: 'ca', arizona: 'az', nevada: 'nv', oregon: 'or',
  washington: 'wa', texas: 'tx', colorado: 'co', utah: 'ut',
  'new york': 'ny', florida: 'fl', illinois: 'il', ohio: 'oh',
  pennsylvania: 'pa', michigan: 'mi', georgia: 'ga', virginia: 'va',
  'north carolina': 'nc', 'new jersey': 'nj', tennessee: 'tn', indiana: 'in',
};

const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/;
const STATE_RE = /\b([A-Z]{2})\b/;

/**
 * Normalize a raw address string into a canonical form for matching.
 * Strips unit/suite, city, state, zip — returns only the street portion.
 */
function normalizeAddress(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let addr = raw
    .toLowerCase()
    .replace(/[.,]/g, ' ')   // remove periods and commas
    .replace(/#/g, '')        // remove hash symbols
    .replace(/-/g, ' ')       // dashes to spaces (for unit numbers)
    .replace(/\s+/g, ' ')    // collapse whitespace
    .trim();

  // Split by comma or common separators to isolate street vs city/state/zip
  const parts = addr.split(/\s*,\s*|\s+(?=\b(?:suite|ste|unit|apt|bldg)\b)/i);
  let street = parts[0] || '';

  // Remove unit/suite from end of street portion
  street = street.replace(/\s+(suite|ste|unit|apt|apartment|bldg|building|fl|floor|rm|room|#)\s*\S*$/i, '');

  // Apply abbreviations word by word
  street = street
    .split(/\s+/)
    .map(word => {
      const clean = word.replace(/[.]/g, '');
      return STREET_ABBREVS[clean] || clean;
    })
    .join(' ')
    .trim();

  return street || null;
}

/**
 * Parse a full address string into components.
 * Returns { normalized, unit, city, state, zip }
 */
function parseAddress(raw) {
  if (!raw || typeof raw !== 'string') {
    return { normalized: null, unit: null, city: null, state: null, zip: null };
  }

  const original = raw.trim();
  let text = original.toLowerCase().replace(/[.]/g, '');

  // Extract ZIP code
  let zip = null;
  const zipMatch = original.match(ZIP_RE);
  if (zipMatch) {
    zip = zipMatch[1];
    text = text.replace(ZIP_RE, '').trim();
  }

  // Extract state (2-letter abbreviation)
  let state = null;
  const upperOriginal = original.toUpperCase();
  const stateMatch = upperOriginal.match(/\b([A-Z]{2})\b/g);
  if (stateMatch) {
    // Take the last 2-letter match that looks like a state (after city, before zip)
    const knownStates = new Set(['CA', 'AZ', 'NV', 'OR', 'WA', 'TX', 'CO', 'UT', 'NY', 'FL', 'IL', 'OH', 'PA', 'MI', 'GA', 'VA', 'NC', 'NJ', 'TN', 'IN', 'MO', 'MD', 'WI', 'MN', 'SC', 'AL', 'LA', 'KY', 'OK', 'CT', 'IA', 'MS', 'AR', 'KS', 'NM', 'NE', 'ID', 'HI', 'ME', 'NH', 'RI', 'MT', 'DE', 'SD', 'ND', 'AK', 'VT', 'WY', 'DC', 'WV']);
    for (const s of stateMatch.reverse()) {
      if (knownStates.has(s)) {
        state = s.toLowerCase();
        text = text.replace(new RegExp(`\\b${s.toLowerCase()}\\b`), '').trim();
        break;
      }
    }
  }

  // Also check for full state names
  if (!state) {
    for (const [full, abbr] of Object.entries(STATE_ABBREVS)) {
      if (text.includes(full)) {
        state = abbr;
        text = text.replace(full, '').trim();
        break;
      }
    }
  }

  // Split remaining by commas
  const parts = text.split(/\s*,\s*/).map(p => p.trim()).filter(Boolean);

  let streetPart = parts[0] || '';
  let unit = null;
  let city = null;

  // Check subsequent parts for unit or city
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part) continue;
    if (UNIT_PREFIXES.test(part)) {
      unit = normalizeUnit(part);
    } else if (!city && part.length > 1) {
      city = part.replace(/\s+/g, ' ').trim();
    }
  }

  // Check if street part contains embedded unit
  const unitInStreet = streetPart.match(/\s+(suite|ste|unit|apt|apartment|bldg|building|fl|floor|rm|room)\s+(.+)$/i);
  if (unitInStreet && !unit) {
    unit = normalizeUnit(unitInStreet[0].trim());
    streetPart = streetPart.slice(0, unitInStreet.index).trim();
  }

  const normalized = normalizeAddress(streetPart);

  return { normalized, unit, city, state, zip };
}

/**
 * Normalize a unit/suite string.
 */
function normalizeUnit(raw) {
  if (!raw) return null;
  return raw
    .toLowerCase()
    .replace(/suite|apartment/gi, 'ste')
    .replace(/building/gi, 'bldg')
    .replace(/floor/gi, 'fl')
    .replace(/room/gi, 'rm')
    .replace(/[#.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

/**
 * Normalize a company name for matching.
 * Strips Inc, LLC, Corp, etc. and lowercases.
 */
function normalizeCompanyName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\b(inc|llc|corp|corporation|co|ltd|limited|lp|lc|pllc|company|group|holdings)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

/**
 * Simple Levenshtein distance for fuzzy matching.
 */
function levenshtein(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Similarity ratio (0-1) between two strings using Levenshtein.
 */
function similarity(a, b) {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

module.exports = {
  normalizeAddress,
  parseAddress,
  normalizeUnit,
  normalizeCompanyName,
  levenshtein,
  similarity,
};
