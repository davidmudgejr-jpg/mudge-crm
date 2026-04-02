-- Migration 049: Contact & Company Dedup Candidates
-- Extends the dedup system (migration 033) to contacts and companies.
-- Same review workflow: scan → review side-by-side → merge/dismiss/defer.

CREATE TABLE IF NOT EXISTS contact_dedup_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    contact_a_id UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,
    contact_b_id UUID NOT NULL REFERENCES contacts(contact_id) ON DELETE CASCADE,

    confidence TEXT NOT NULL DEFAULT 'medium',
    match_type TEXT NOT NULL,
    match_score NUMERIC,
    match_reason TEXT,

    entity_a_summary JSONB DEFAULT '{}',
    entity_b_summary JSONB DEFAULT '{}',

    status TEXT NOT NULL DEFAULT 'pending',
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    merge_direction TEXT,
    merge_notes TEXT,

    scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(contact_a_id, contact_b_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_dedup_status ON contact_dedup_candidates(status);
CREATE INDEX IF NOT EXISTS idx_contact_dedup_confidence ON contact_dedup_candidates(confidence);

CREATE TABLE IF NOT EXISTS company_dedup_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    company_a_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    company_b_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,

    confidence TEXT NOT NULL DEFAULT 'medium',
    match_type TEXT NOT NULL,
    match_score NUMERIC,
    match_reason TEXT,

    entity_a_summary JSONB DEFAULT '{}',
    entity_b_summary JSONB DEFAULT '{}',

    status TEXT NOT NULL DEFAULT 'pending',
    resolved_by TEXT,
    resolved_at TIMESTAMPTZ,
    merge_direction TEXT,
    merge_notes TEXT,

    scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(company_a_id, company_b_id)
);

CREATE INDEX IF NOT EXISTS idx_company_dedup_status ON company_dedup_candidates(status);
CREATE INDEX IF NOT EXISTS idx_company_dedup_confidence ON company_dedup_candidates(confidence);
