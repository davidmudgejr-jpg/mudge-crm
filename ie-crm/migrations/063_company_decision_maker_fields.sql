-- Add decision-maker denormalized fields to the companies table.
--
-- Context: the AI enrichment agent fleet (agent_m_hunter_domain_search,
-- agent_48_enrichment, etc.) writes suggested_updates with entity_type='company'
-- and field_name='decision_maker_title' / 'decision_maker_name' / 'email_1'.
-- Those columns did not exist on the companies table, so every approve attempt
-- failed at the Postgres layer with "column does not exist", which cascaded
-- through validateColumn() → /api/ai/suggested-updates/batch → generic 500.
--
-- This migration unblocks those approvals by adding the columns the agents
-- have been writing to. Denormalization trade-off acknowledged: one decision
-- maker per company. If we later need N decision-makers, we migrate the data
-- into the contacts table via a one-time backfill script.
--
-- Idempotent (IF NOT EXISTS). Reversible via ALTER TABLE companies DROP COLUMN.
-- Defaults to NULL — no existing data is touched.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS decision_maker_title TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS decision_maker_name  TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS email_1              TEXT;
