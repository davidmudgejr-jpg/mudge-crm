-- Migration 056: Dedup merge redesign — audit trail + clustering support

-- 1. Audit table for undo capability
CREATE TABLE IF NOT EXISTS dedup_merge_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type TEXT NOT NULL,             -- 'property', 'contact', 'company'
    keeper_id UUID NOT NULL,
    removed_ids UUID[] NOT NULL,
    keeper_snapshot JSONB NOT NULL,         -- full record before merge
    removed_snapshots JSONB NOT NULL,       -- array of full records before deletion
    field_overrides JSONB DEFAULT '{}',     -- { field: { value, sourceId } }
    junction_changes JSONB DEFAULT '[]',    -- array of { table, action, rows } for reversal
    merged_by TEXT,
    merged_at TIMESTAMPTZ DEFAULT NOW(),
    undone BOOLEAN DEFAULT false,
    undone_at TIMESTAMPTZ
);

CREATE INDEX idx_merge_audit_entity ON dedup_merge_audit (entity_type, merged_at DESC);
CREATE INDEX idx_merge_audit_keeper ON dedup_merge_audit (keeper_id);
CREATE INDEX idx_merge_audit_undone ON dedup_merge_audit (undone) WHERE undone = false;

-- 2. Add cluster_id to candidate tables for optional pre-computed grouping
ALTER TABLE dedup_candidates
    ADD COLUMN IF NOT EXISTS cluster_id UUID;

ALTER TABLE contact_dedup_candidates
    ADD COLUMN IF NOT EXISTS cluster_id UUID;

ALTER TABLE company_dedup_candidates
    ADD COLUMN IF NOT EXISTS cluster_id UUID;

CREATE INDEX idx_dedup_cluster ON dedup_candidates (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_contact_dedup_cluster ON contact_dedup_candidates (cluster_id) WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_company_dedup_cluster ON company_dedup_candidates (cluster_id) WHERE cluster_id IS NOT NULL;
