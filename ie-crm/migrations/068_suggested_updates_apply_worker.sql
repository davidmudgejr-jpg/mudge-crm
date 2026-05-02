-- Support the accepted-suggestion apply worker.
-- The worker scans accepted/unapplied rows frequently, so make that lookup cheap.

CREATE INDEX IF NOT EXISTS idx_suggested_updates_accepted_unapplied
  ON suggested_updates (reviewed_at, id)
  WHERE status = 'accepted' AND COALESCE(applied, false) = false;
