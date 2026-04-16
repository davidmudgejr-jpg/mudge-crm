-- Migration 064: schema_migrations tracking table
-- QA audit 2026-04-15 P2-07.
--
-- Prior state: no way to know which migrations had been applied. Migrations
-- were applied ad-hoc via the Neon console. Re-applying the repo risked
-- duplicate indexes, VIEW redefinition errors, and constraint conflicts.
--
-- This migration is designed to be safe to apply MANUALLY one time (the
-- IF NOT EXISTS makes it idempotent). After that, scripts/migrate.js reads
-- this table to decide what else to apply.
--
-- We also backfill known-applied versions (everything up to 063 is currently
-- in production, verified by Phase 2 of the audit). If you have a fresh DB
-- and are running migrations from scratch, delete the INSERT block below
-- and let scripts/migrate.js insert rows as it applies each file.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  applied_by TEXT
);

-- Backfill for the current production state. Every listed version is known
-- to be applied in production per the 2026-04-15 QA audit (Phase 2 verified
-- 136 tables, 4 views, 200+ indexes, plus deal_formulas → migration 060 and
-- property_tpe_scores → migration 015). These INSERTs are idempotent via
-- ON CONFLICT DO NOTHING so re-applying this migration is safe.
INSERT INTO schema_migrations (version, name, applied_by) VALUES
  ('001', '001_initial_schema',                      'backfill-audit-2026-04-15'),
  ('002', '002_normalized_address',                  'backfill-audit-2026-04-15'),
  ('003', '003_tpe_config',                          'backfill-audit-2026-04-15'),
  ('004', '004_tpe_audit_log',                       'backfill-audit-2026-04-15'),
  ('005', '005_deal_formulas_view',                  'backfill-audit-2026-04-15'),
  ('006', '006_oracle_prediction_engine',            'backfill-audit-2026-04-15'),
  ('007', '007_sandbox_tables',                      'backfill-audit-2026-04-15'),
  ('008', '008_fk_fix_and_tpe_view',                 'backfill-audit-2026-04-15'),
  ('009', '009_pre_migration_fixes',                 'backfill-audit-2026-04-15'),
  ('010', '010_property_contacts_pk',                'backfill-audit-2026-04-15'),
  ('011', '011_tpe_import_columns',                  'backfill-audit-2026-04-15'),
  ('012', '012_tpe_config_seed',                     'backfill-audit-2026-04-15'),
  ('013', '013_tpe_dynamic_tiers',                   'backfill-audit-2026-04-15'),
  ('014', '014_tpe_scoring_v2',                      'backfill-audit-2026-04-15'),
  ('015', '015_tpe_living_database',                 'backfill-audit-2026-04-15'),
  ('016', '016_dedup_tables',                        'backfill-audit-2026-04-15'),
  ('017', '017_custom_fields',                       'backfill-audit-2026-04-15'),
  ('018', '018_action_items',                        'backfill-audit-2026-04-15'),
  ('019', '019_auth_users',                          'backfill-audit-2026-04-15'),
  ('020', '020_team_chat',                           'backfill-audit-2026-04-15'),
  ('021', '021_memory_pools',                        'backfill-audit-2026-04-15'),
  ('022', '022_council_channel',                     'backfill-audit-2026-04-15'),
  ('023', '023_directives',                          'backfill-audit-2026-04-15'),
  ('024', '024_agent_system_expansion',              'backfill-audit-2026-04-15'),
  ('025', '025_oracle_prediction_engine',            'backfill-audit-2026-04-15'),
  ('026', '026_call_transcripts',                    'backfill-audit-2026-04-15'),
  -- 027 was never created (gap documented in QA audit)
  ('028', '028_fix_directives_scope',                'backfill-audit-2026-04-15'),
  ('029', '029_agent_ready_contacts',                'backfill-audit-2026-04-15'),
  ('030', '030_knowledge_nodes',                     'backfill-audit-2026-04-15'),
  ('031', '031_knowledge_edges',                     'backfill-audit-2026-04-15'),
  ('032', '032_context_store',                       'backfill-audit-2026-04-15'),
  ('033', '033_email_parsing',                       'backfill-audit-2026-04-15'),
  ('034', '034_email_outbox',                        'backfill-audit-2026-04-15'),
  ('035', '035_voice_capture',                       'backfill-audit-2026-04-15'),
  ('036', '036_fireflies_transcripts',               'backfill-audit-2026-04-15'),
  ('037', '037_tenant_growth',                       'backfill-audit-2026-04-15'),
  ('038', '038_distress_tracking',                   'backfill-audit-2026-04-15'),
  ('039', '039_contracts',                           'backfill-audit-2026-04-15'),
  ('040', '040_contract_packages',                   'backfill-audit-2026-04-15'),
  ('041', '041_council_proposals',                   'backfill-audit-2026-04-15'),
  ('042', '042_data_source_tracking',                'backfill-audit-2026-04-15'),
  ('043', '043_link_orphan_interactions',            'backfill-audit-2026-04-15'),
  ('044', '044_deal_email_campaign',                 'backfill-audit-2026-04-15'),
  ('045', '045_deal_campaigns',                      'backfill-audit-2026-04-15'),
  ('046', '046_suggested_updates',                   'backfill-audit-2026-04-15'),
  ('047', '047_deal_photos',                         'backfill-audit-2026-04-15'),
  ('048', '048_agent_heartbeats',                    'backfill-audit-2026-04-15'),
  ('049', '049_agent_logs',                          'backfill-audit-2026-04-15'),
  ('050', '050_fleet_health',                        'backfill-audit-2026-04-15'),
  ('051', '051_verification_queue',                  'backfill-audit-2026-04-15'),
  ('052', '052_verification_batch',                  'backfill-audit-2026-04-15'),
  ('053', '053_enrichment_flags',                    'backfill-audit-2026-04-15'),
  ('054', '054_outreach_stage',                      'backfill-audit-2026-04-15'),
  ('055', '055_deal_type_normalization',             'backfill-audit-2026-04-15'),
  ('056', '056_contact_enrichment_tracking',         'backfill-audit-2026-04-15'),
  ('057', '057_knowledge_versions',                  'backfill-audit-2026-04-15'),
  ('058', '058_tpe_config_versions',                 'backfill-audit-2026-04-15'),
  ('059', '059_deal_price_computed',                 'backfill-audit-2026-04-15'),
  ('060', '060_fix_deal_formulas_sublease',          'backfill-audit-2026-04-15'),
  ('061', '061_action_items_updated_at',             'backfill-audit-2026-04-15'),
  ('062', '062_suggested_updates_applied_value',     'backfill-audit-2026-04-15'),
  ('063', '063_companies_decision_maker_columns',    'backfill-audit-2026-04-15')
ON CONFLICT (version) DO NOTHING;
