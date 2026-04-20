-- 067_brain_queue_idempotent_enqueue.sql
-- Mudge Brain Phase 1 fix: make trigger enqueues idempotent.
--
-- Problem (flagged by Houston Command):
--   The three trigger functions in 066 do a bare INSERT into brain_recompile_queue.
--   Without a dedup guard, the same entity can accumulate many pending rows (e.g.
--   a rapid edit burst, or a junction change that also fires a parent-row trigger).
--   Once we add a uniqueness guarantee to keep the queue clean, those same INSERTs
--   would raise unique-violation errors and abort the originating write.
--
-- Fix has three parts:
--   1. Collapse any existing duplicate PENDING rows so the unique index can build.
--   2. Add a partial UNIQUE index on (entity_type, entity_id) WHERE status='pending'.
--      Partial is the right shape: once a row leaves 'pending' (processing/completed/
--      failed), the same entity is legitimately re-queuable on the next edit.
--   3. CREATE OR REPLACE the three trigger functions so every enqueue INSERT has
--      ON CONFLICT (entity_type, entity_id) WHERE status='pending' DO NOTHING.
--
-- Conflict target note:
--   Houston's note said "ON CONFLICT (entity_id)". We use composite
--   (entity_type, entity_id) because the queue spans multiple entity types and some
--   source tables use SERIAL ids (directives, council_meetings) — so entity_id is
--   not guaranteed unique across types.
--
-- Conflict action note:
--   DO NOTHING per directive. If we later want high-priority enqueues to bump an
--   existing pending row's priority, swap the action for
--     DO UPDATE SET priority = LEAST(brain_recompile_queue.priority, EXCLUDED.priority)
--   (first-writer-wins on reason, highest-priority-wins on priority).

BEGIN;

-- ============================================================
-- 1. Collapse duplicate PENDING rows (keeps one per entity).
--    Keeps the row with the highest priority (lowest number), then oldest.
--    Safe no-op if no duplicates exist.
-- ============================================================
DELETE FROM brain_recompile_queue q
USING (
  SELECT id,
         row_number() OVER (
           PARTITION BY entity_type, entity_id
           ORDER BY priority ASC, created_at ASC, id ASC
         ) AS rn
  FROM brain_recompile_queue
  WHERE status = 'pending'
) ranked
WHERE q.id = ranked.id
  AND ranked.rn > 1;

-- ============================================================
-- 2. Partial UNIQUE index — "at most one pending row per entity".
--    The predicate must match the ON CONFLICT WHERE clause below.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_brain_queue_pending_entity
  ON brain_recompile_queue (entity_type, entity_id)
  WHERE status = 'pending';

-- ============================================================
-- 3a. Generic trigger function — idempotent enqueue.
-- ============================================================
CREATE OR REPLACE FUNCTION brain_queue_recompile()
RETURNS TRIGGER AS $$
DECLARE
  _entity_type TEXT;
  _entity_id TEXT;
  _source_id TEXT;
  _reason TEXT;
BEGIN
  _entity_type := TG_ARGV[0];
  _reason := TG_TABLE_NAME || '_' || lower(TG_OP);

  IF TG_OP = 'DELETE' THEN
    EXECUTE format('SELECT ($1).%I::TEXT', TG_ARGV[1]) INTO _entity_id USING OLD;
    BEGIN
      EXECUTE format('SELECT ($1).%I::TEXT', 'id') INTO _source_id USING OLD;
    EXCEPTION WHEN undefined_column THEN
      _source_id := _entity_id;
    END;
  ELSE
    EXECUTE format('SELECT ($1).%I::TEXT', TG_ARGV[1]) INTO _entity_id USING NEW;
    BEGIN
      EXECUTE format('SELECT ($1).%I::TEXT', 'id') INTO _source_id USING NEW;
    EXCEPTION WHEN undefined_column THEN
      _source_id := _entity_id;
    END;
  END IF;

  IF _entity_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  INSERT INTO brain_recompile_queue (entity_type, entity_id, reason, source_table, source_id)
  VALUES (_entity_type, _entity_id, _reason, TG_TABLE_NAME, _source_id)
  ON CONFLICT (entity_type, entity_id) WHERE status = 'pending' DO NOTHING;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3b. Junction trigger function — idempotent enqueue on BOTH sides.
-- ============================================================
CREATE OR REPLACE FUNCTION brain_queue_junction_recompile()
RETURNS TRIGGER AS $$
DECLARE
  _row RECORD;
  _id_a TEXT;
  _id_b TEXT;
BEGIN
  _row := COALESCE(NEW, OLD);

  EXECUTE format('SELECT ($1).%I::TEXT', TG_ARGV[1]) INTO _id_a USING _row;
  EXECUTE format('SELECT ($1).%I::TEXT', TG_ARGV[3]) INTO _id_b USING _row;

  IF _id_a IS NOT NULL THEN
    INSERT INTO brain_recompile_queue (entity_type, entity_id, reason, source_table)
    VALUES (TG_ARGV[0], _id_a, TG_TABLE_NAME || '_' || lower(TG_OP), TG_TABLE_NAME)
    ON CONFLICT (entity_type, entity_id) WHERE status = 'pending' DO NOTHING;
  END IF;

  IF _id_b IS NOT NULL THEN
    INSERT INTO brain_recompile_queue (entity_type, entity_id, reason, source_table)
    VALUES (TG_ARGV[2], _id_b, TG_TABLE_NAME || '_' || lower(TG_OP), TG_TABLE_NAME)
    ON CONFLICT (entity_type, entity_id) WHERE status = 'pending' DO NOTHING;
  END IF;

  RETURN _row;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 3c. Suggested-updates trigger function — idempotent enqueue.
-- ============================================================
CREATE OR REPLACE FUNCTION brain_queue_suggested_update()
RETURNS TRIGGER AS $$
DECLARE
  _row RECORD;
BEGIN
  _row := COALESCE(NEW, OLD);

  IF _row.entity_type IS NOT NULL AND _row.entity_id IS NOT NULL THEN
    INSERT INTO brain_recompile_queue (entity_type, entity_id, reason, source_table, source_id)
    VALUES (_row.entity_type, _row.entity_id::TEXT,
            'suggested_updates_' || lower(TG_OP), 'suggested_updates', _row.id::TEXT)
    ON CONFLICT (entity_type, entity_id) WHERE status = 'pending' DO NOTHING;
  END IF;

  RETURN _row;
END;
$$ LANGUAGE plpgsql;

COMMIT;
