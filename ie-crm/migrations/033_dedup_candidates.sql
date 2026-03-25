-- Migration 033: Dedup Candidates
-- Tracks potential duplicate properties found by the daily dedup scanner.
-- David reviews and decides: merge, dismiss, or flag for later.

CREATE TABLE IF NOT EXISTS dedup_candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- The two properties that might be duplicates
    property_a_id UUID NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,
    property_b_id UUID NOT NULL REFERENCES properties(property_id) ON DELETE CASCADE,

    -- Match info
    confidence TEXT NOT NULL DEFAULT 'medium',    -- 'high', 'medium', 'low'
    match_type TEXT NOT NULL,                      -- 'exact_normalized', 'fuzzy_address', 'same_parcel', 'same_name_city'
    match_score NUMERIC,                           -- 0-100 similarity score
    match_reason TEXT,                             -- Human-readable: "Both normalize to '14520 jurupa ave' in Fontana"

    -- What each record has (for side-by-side comparison)
    property_a_summary JSONB DEFAULT '{}',         -- { address, city, rba, contacts: 3, comps: 2, deals: 1, last_activity: "..." }
    property_b_summary JSONB DEFAULT '{}',

    -- Resolution
    status TEXT NOT NULL DEFAULT 'pending',        -- 'pending', 'merged', 'dismissed', 'deferred'
    resolved_by TEXT,                              -- 'david', 'houston_command'
    resolved_at TIMESTAMPTZ,
    merge_direction TEXT,                          -- 'a_absorbs_b' or 'b_absorbs_a'
    merge_notes TEXT,

    -- Metadata
    scan_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Prevent duplicate entries for the same pair
    UNIQUE(property_a_id, property_b_id)
);

CREATE INDEX IF NOT EXISTS idx_dedup_status ON dedup_candidates(status);
CREATE INDEX IF NOT EXISTS idx_dedup_confidence ON dedup_candidates(confidence);
CREATE INDEX IF NOT EXISTS idx_dedup_scan_date ON dedup_candidates(scan_date);
