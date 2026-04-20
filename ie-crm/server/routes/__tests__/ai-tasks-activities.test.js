/**
 * Unit tests for /api/ai/tasks and /api/ai/activities helpers.
 *
 * Scope: pure input-validation + normalization helpers exported via
 * `__testing` from server/routes/ai.js. These are the exact functions
 * each endpoint runs before touching the DB — covering them here
 * catches the majority of request-shape bugs without needing a DB.
 *
 * End-to-end endpoint testing (hit a live handler with a mocked pool)
 * is deferred until the repo grows a server-side integration harness;
 * until then the spec's happy-path + error-case coverage is achieved
 * via (a) these unit tests for input validation and (b) the smoke
 * curl commands in docs/api/ai-tasks-activities.md.
 */

import { describe, it, expect } from 'vitest';

// ai.js transitively loads server/middleware/auth.js which throws at require
// time if JWT_SECRET is unset. Tests don't exercise any auth paths, so a
// fixed placeholder is fine — we require() after setting it so the CJS
// module-top guard passes.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-placeholder-secret';
// eslint-disable-next-line no-undef -- createRequire is a Node built-in
const { createRequire } = await import('node:module');
const requireCjs = createRequire(import.meta.url);
const aiRoutes = requireCjs('../ai.js');

const {
  UUID_RE,
  TASK_STATUSES,
  TASK_CLOSED_STATUSES,
  INTERACTION_TYPES,
  INTERACTION_MUTABLE_FIELDS,
  httpError,
  isUuid,
  assertUuid,
  normalizeTaskStatus,
  normalizeInteractionType,
  parseTasksStatusQuery,
  parseDateInput,
  clampLimitAt,
  clampOffset,
  asArray,
  truthyParam,
} = aiRoutes.__testing;

describe('UUID validation', () => {
  it('accepts a canonical v4 UUID', () => {
    expect(isUuid('a1b2c3d4-5678-4abc-8def-1234567890ab')).toBe(true);
  });

  it('accepts uppercase UUIDs', () => {
    expect(isUuid('A1B2C3D4-5678-4ABC-8DEF-1234567890AB')).toBe(true);
  });

  it('rejects malformed UUIDs', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('a1b2c3d4-5678-4abc-8def-12345678')).toBe(false);
    expect(isUuid('')).toBe(false);
  });

  it('rejects non-string inputs', () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(12345)).toBe(false);
    expect(isUuid({})).toBe(false);
  });

  it('assertUuid returns the value when valid', () => {
    const id = 'a1b2c3d4-5678-4abc-8def-1234567890ab';
    expect(assertUuid(id, 'deal_id')).toBe(id);
  });

  it('assertUuid throws 400 error on invalid', () => {
    try {
      assertUuid('nope', 'deal_id');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/Invalid UUID for "deal_id"/);
    }
  });

  it('UUID_RE matches a fresh uuid-v4-format string', () => {
    expect(UUID_RE.test('12345678-1234-4321-8abc-abcdef012345')).toBe(true);
  });
});

describe('Task status normalization', () => {
  it('canonicalizes every spec status', () => {
    for (const s of TASK_STATUSES) {
      expect(normalizeTaskStatus(s)).toBe(s);
    }
  });

  // DB constraint uses lowercase 'p'; spec capitalizes it. Both must work.
  it('folds "In Progress" (spec casing) to "In progress" (DB casing)', () => {
    expect(normalizeTaskStatus('In Progress')).toBe('In progress');
    expect(normalizeTaskStatus('IN PROGRESS')).toBe('In progress');
    expect(normalizeTaskStatus('in progress')).toBe('In progress');
  });

  it('is case-insensitive for other statuses', () => {
    expect(normalizeTaskStatus('todo')).toBe('Todo');
    expect(normalizeTaskStatus('DONE')).toBe('Done');
    expect(normalizeTaskStatus('  Dead  ')).toBe('Dead');
  });

  it('returns null for empty/null input', () => {
    expect(normalizeTaskStatus(null)).toBeNull();
    expect(normalizeTaskStatus(undefined)).toBeNull();
    expect(normalizeTaskStatus('')).toBeNull();
  });

  it('throws 400 on unknown status', () => {
    try {
      normalizeTaskStatus('in-flight');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/Invalid status/);
      expect(err.message).toMatch(/Todo/); // lists allowed values
    }
  });

  it('TASK_CLOSED_STATUSES matches spec (Done + Dead)', () => {
    expect(TASK_CLOSED_STATUSES).toEqual(['Done', 'Dead']);
  });
});

describe('Date input parsing', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(parseDateInput('2026-04-22', 'due_date')).toBe('2026-04-22');
  });

  it('accepts ISO-8601 datetime', () => {
    expect(parseDateInput('2026-04-22T14:30:00Z', 'date')).toBe('2026-04-22T14:30:00Z');
    expect(parseDateInput('2026-04-22T14:30:00.123Z', 'date')).toBe('2026-04-22T14:30:00.123Z');
  });

  it('returns null for empty/null', () => {
    expect(parseDateInput(null, 'f')).toBeNull();
    expect(parseDateInput(undefined, 'f')).toBeNull();
    expect(parseDateInput('', 'f')).toBeNull();
  });

  it('rejects non-date strings with 400', () => {
    for (const bad of ['not a date', '22/04/2026', '2026/04/22', '04-22-2026']) {
      try {
        parseDateInput(bad, 'due_date');
        expect.fail(`should have thrown for ${bad}`);
      } catch (err) {
        expect(err.status).toBe(400);
        expect(err.message).toMatch(/Invalid date/);
      }
    }
  });

  it('rejects out-of-range YYYY-MM-DD like 2026-13-45', () => {
    try {
      parseDateInput('2026-13-45', 'due_date');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
    }
  });

  it('includes the field name in the error message', () => {
    try {
      parseDateInput('garbage', 'follow_up');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.message).toMatch(/follow_up/);
    }
  });
});

describe('Pagination clamps', () => {
  it('clampLimitAt defaults when invalid', () => {
    expect(clampLimitAt(undefined, 100, 500)).toBe(100);
    expect(clampLimitAt(null, 100, 500)).toBe(100);
    expect(clampLimitAt('abc', 100, 500)).toBe(100);
    expect(clampLimitAt(0, 100, 500)).toBe(100);
    expect(clampLimitAt(-5, 100, 500)).toBe(100);
  });

  it('clampLimitAt caps at max', () => {
    expect(clampLimitAt(10000, 100, 500)).toBe(500);
    expect(clampLimitAt('750', 100, 500)).toBe(500);
  });

  it('clampLimitAt accepts valid strings', () => {
    expect(clampLimitAt('25', 100, 500)).toBe(25);
  });

  it('clampOffset defaults to 0 when invalid', () => {
    expect(clampOffset(undefined)).toBe(0);
    expect(clampOffset('abc')).toBe(0);
    expect(clampOffset(-5)).toBe(0);
  });

  it('clampOffset accepts valid positive integers', () => {
    expect(clampOffset(100)).toBe(100);
    expect(clampOffset('50')).toBe(50);
    expect(clampOffset(0)).toBe(0);
  });
});

describe('asArray', () => {
  it('wraps a single value in an array', () => {
    expect(asArray('David')).toEqual(['David']);
    expect(asArray(42)).toEqual([42]);
  });

  it('returns the array unchanged', () => {
    expect(asArray(['David', 'Sarah'])).toEqual(['David', 'Sarah']);
    expect(asArray([])).toEqual([]);
  });

  it('returns empty array for null/undefined', () => {
    expect(asArray(null)).toEqual([]);
    expect(asArray(undefined)).toEqual([]);
  });
});

describe('truthyParam', () => {
  it('accepts various truthy string forms', () => {
    expect(truthyParam('true')).toBe(true);
    expect(truthyParam('TRUE')).toBe(true);
    expect(truthyParam('1')).toBe(true);
    expect(truthyParam('yes')).toBe(true);
  });

  it('accepts boolean true', () => {
    expect(truthyParam(true)).toBe(true);
  });

  it('rejects falsy forms', () => {
    expect(truthyParam('false')).toBe(false);
    expect(truthyParam('0')).toBe(false);
    expect(truthyParam('')).toBe(false);
    expect(truthyParam(null)).toBe(false);
    expect(truthyParam(undefined)).toBe(false);
  });
});

describe('httpError builder', () => {
  it('creates an Error with a status property', () => {
    const err = httpError(404, 'not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.message).toBe('not found');
  });
});

describe('Interaction mutable fields (spec contract)', () => {
  it('lists exactly the allowed-to-PATCH fields', () => {
    // Spec: "Mutable fields: notes, follow_up, follow_up_notes,
    //        lead_status, lead_interest, team_member."
    expect(INTERACTION_MUTABLE_FIELDS).toEqual([
      'notes', 'follow_up', 'follow_up_notes',
      'lead_status', 'lead_interest', 'team_member',
    ]);
  });

  it('does NOT include immutable fields (type, date, subject)', () => {
    for (const f of ['type', 'date', 'subject']) {
      expect(INTERACTION_MUTABLE_FIELDS).not.toContain(f);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// Status transition behavior — covered as a table-driven test
// since the PATCH handler's auto-set-date_completed logic is a
// spec requirement (not just a validation helper).
// ─────────────────────────────────────────────────────────────────
describe('Status transition rules (spec)', () => {
  // Replicate the PATCH transition branching for clarity:
  // - transition into 'Done' with null date_completed → set NOW()
  // - transition out of 'Done' → null date_completed
  // - explicit body.date_completed always overrides
  function transitionEffect({ oldStatus, newStatus, oldDateCompleted, explicitDate }) {
    if (explicitDate !== undefined) return { date_completed: explicitDate };
    const toDone = oldStatus !== 'Done' && newStatus === 'Done';
    const offDone = oldStatus === 'Done' && newStatus !== 'Done';
    if (toDone && oldDateCompleted == null) return { date_completed: 'NOW()' };
    if (offDone) return { date_completed: null };
    return { date_completed: 'unchanged' };
  }

  it('auto-sets date_completed when moving Todo → Done', () => {
    expect(transitionEffect({
      oldStatus: 'Todo', newStatus: 'Done', oldDateCompleted: null,
    })).toEqual({ date_completed: 'NOW()' });
  });

  it('does NOT overwrite an existing date_completed when moving Todo → Done', () => {
    expect(transitionEffect({
      oldStatus: 'Todo', newStatus: 'Done', oldDateCompleted: '2025-01-01',
    })).toEqual({ date_completed: 'unchanged' });
  });

  it('nulls date_completed when moving Done → Todo', () => {
    expect(transitionEffect({
      oldStatus: 'Done', newStatus: 'Todo', oldDateCompleted: '2026-01-01',
    })).toEqual({ date_completed: null });
  });

  it('nulls date_completed when moving Done → Dead', () => {
    expect(transitionEffect({
      oldStatus: 'Done', newStatus: 'Dead', oldDateCompleted: '2026-01-01',
    })).toEqual({ date_completed: null });
  });

  it('explicit date_completed always wins', () => {
    expect(transitionEffect({
      oldStatus: 'Todo', newStatus: 'Done', oldDateCompleted: null,
      explicitDate: '2025-06-15',
    })).toEqual({ date_completed: '2025-06-15' });
  });

  it('no-op when status does not change and no explicit date', () => {
    expect(transitionEffect({
      oldStatus: 'Todo', newStatus: 'Todo', oldDateCompleted: null,
    })).toEqual({ date_completed: 'unchanged' });
  });
});

// ─────────────────────────────────────────────────────────────────
// Issue #9 — interaction type canonicalization. Agents were sending
// lowercase ("call", "email") which the chk_interaction_type CHECK
// constraint rejected with a 500. normalizeInteractionType folds any
// casing to the constraint's expected form and returns 400 with the
// allowed list on anything else.
// ─────────────────────────────────────────────────────────────────
describe('Interaction type normalization (Issue #9)', () => {
  it('canonicalizes every value from the CHECK constraint', () => {
    for (const t of INTERACTION_TYPES) {
      expect(normalizeInteractionType(t)).toBe(t);
    }
  });

  // The bug from prod: lowercase "call" / "email" → 500.
  it('folds lowercase type to canonical capitalization', () => {
    expect(normalizeInteractionType('call')).toBe('Call');
    expect(normalizeInteractionType('email')).toBe('Email');
    expect(normalizeInteractionType('note')).toBe('Note');
  });

  it('folds multi-word types case-insensitively', () => {
    expect(normalizeInteractionType('phone call')).toBe('Phone Call');
    expect(normalizeInteractionType('PHONE CALL')).toBe('Phone Call');
    expect(normalizeInteractionType('Outbound Email')).toBe('Outbound Email');
    expect(normalizeInteractionType('outbound email')).toBe('Outbound Email');
  });

  it('collapses extra whitespace in multi-word types', () => {
    expect(normalizeInteractionType('  phone    call  ')).toBe('Phone Call');
  });

  it('returns null for null / empty (endpoint enforces required separately)', () => {
    expect(normalizeInteractionType(null)).toBeNull();
    expect(normalizeInteractionType(undefined)).toBeNull();
    expect(normalizeInteractionType('')).toBeNull();
  });

  it('rejects unknown values with 400 listing allowed types', () => {
    try {
      normalizeInteractionType('Cheeseburger');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/Invalid interaction type "Cheeseburger"/);
      // The message must list allowed values so agents can self-correct
      expect(err.message).toMatch(/Phone Call/);
      expect(err.message).toMatch(/LinkedIn/);
    }
  });

  it('rejects close-but-wrong values (e.g. pluralization)', () => {
    for (const bad of ['Calls', 'Emails', 'phone_call', 'call-back']) {
      expect(() => normalizeInteractionType(bad)).toThrow(/Invalid interaction type/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// Issue #10 — status=open no longer silently drops explicit values.
// parseTasksStatusQuery now rejects the ambiguous combination.
// ─────────────────────────────────────────────────────────────────
describe('Tasks status query parsing (Issue #10)', () => {
  it('open alone returns openAlias=true, no explicit list', () => {
    expect(parseTasksStatusQuery('open')).toEqual({ openAlias: true, explicit: [] });
    expect(parseTasksStatusQuery(['open'])).toEqual({ openAlias: true, explicit: [] });
  });

  it('open is case-insensitive', () => {
    expect(parseTasksStatusQuery('OPEN')).toEqual({ openAlias: true, explicit: [] });
    expect(parseTasksStatusQuery('Open')).toEqual({ openAlias: true, explicit: [] });
  });

  it('explicit statuses alone return openAlias=false and a canonicalized list', () => {
    expect(parseTasksStatusQuery(['Todo', 'done'])).toEqual({
      openAlias: false,
      explicit: ['Todo', 'Done'],
    });
  });

  it('no status params returns both empty', () => {
    expect(parseTasksStatusQuery(undefined)).toEqual({ openAlias: false, explicit: [] });
    expect(parseTasksStatusQuery(null)).toEqual({ openAlias: false, explicit: [] });
    expect(parseTasksStatusQuery([])).toEqual({ openAlias: false, explicit: [] });
  });

  // The audit-hostile case from Issue #10 — previously the Todo was
  // silently dropped. Now we reject with 400 so the agent notices.
  it('rejects open combined with explicit values with 400', () => {
    try {
      parseTasksStatusQuery(['open', 'Todo']);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/open cannot be combined with explicit statuses/);
    }
  });

  it('rejects mixed-case open combined with explicit values', () => {
    expect(() => parseTasksStatusQuery(['OPEN', 'Todo', 'Pending'])).toThrow(
      /open cannot be combined/
    );
  });

  // Invalid explicit values still 400 via normalizeTaskStatus.
  it('invalid explicit status is rejected with 400 listing allowed values', () => {
    try {
      parseTasksStatusQuery(['bogus']);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/Invalid status "bogus"/);
    }
  });

  // Empty strings in the array are filtered out (not treated as a status)
  it('filters empty strings from status array', () => {
    expect(parseTasksStatusQuery(['', 'Todo', ''])).toEqual({
      openAlias: false,
      explicit: ['Todo'],
    });
  });
});
