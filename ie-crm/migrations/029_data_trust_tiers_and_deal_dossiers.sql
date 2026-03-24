-- Migration 029: Data Trust Tiers + Deal Dossiers
-- Date: 2026-03-24
-- Purpose:
--   1. Suggested Updates table — Enricher proposes changes, David reviews (accept/reject)
--   2. Deal Dossiers table — Houston Command's deal intelligence files
--   3. Data source tracking improvements on contacts and properties

-- ============================================================
-- 1. SUGGESTED UPDATES — Data Trust Tier Review System
-- ============================================================
-- When the Enricher finds data that CONFLICTS with existing CRM data,
-- it creates a suggested_update instead of overwriting.
-- David reviews and accepts/rejects with one click.
--
-- Trust tiers:
--   Gold   (data_source='manual')           — David's hand research. NEVER overwritten.
--   Silver (data_source='enricher_verified') — 2+ API sources agree. Can fill empty fields.
--   Bronze (data_source='enricher_single')   — Single API source. Suggestion only.

CREATE TABLE IF NOT EXISTS suggested_updates (
  id              SERIAL PRIMARY KEY,

  -- What record and field this suggestion is for
  entity_type     TEXT NOT NULL,                    -- 'contact', 'property', 'company'
  entity_id       UUID NOT NULL,                    -- The record's UUID
  entity_name     TEXT,                             -- Display name for UI (e.g. "Mike Thompson")
  field_name      TEXT NOT NULL,                    -- Column name (e.g. 'email', 'phone_1', 'full_name')
  field_label     TEXT,                             -- Human label (e.g. 'Email', 'Phone', 'Full Name')

  -- Current vs proposed values
  current_value   TEXT,                             -- What's in the CRM now (NULL if empty)
  suggested_value TEXT NOT NULL,                    -- What the Enricher found

  -- Source and confidence
  source          TEXT NOT NULL DEFAULT 'enricher', -- 'enricher', 'researcher', 'postmaster', 'manual'
  source_detail   TEXT,                             -- e.g. 'BeenVerified + WhitePages match'
  confidence      INTEGER DEFAULT 50,              -- 0-100 confidence score
  data_tier       TEXT DEFAULT 'bronze',            -- 'gold', 'silver', 'bronze'

  -- Review status
  status          TEXT NOT NULL DEFAULT 'pending',  -- 'pending', 'accepted', 'rejected', 'expired'
  reviewed_by     TEXT,                             -- Who reviewed it
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,

  -- If accepted, was the field actually updated?
  applied         BOOLEAN DEFAULT false,
  applied_at      TIMESTAMPTZ,

  -- Ownership change detection (special case)
  is_ownership_change BOOLEAN DEFAULT false,        -- TRUE if this suggests a different owner

  -- Metadata
  agent_name      TEXT,                             -- Which agent created this suggestion
  workflow_id     TEXT,                             -- Link to workflow chain if applicable
  batch_id        TEXT,                             -- Group suggestions from same enrichment run
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_suggested_updates_status ON suggested_updates(status);
CREATE INDEX IF NOT EXISTS idx_suggested_updates_entity ON suggested_updates(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_suggested_updates_field ON suggested_updates(entity_type, field_name);
CREATE INDEX IF NOT EXISTS idx_suggested_updates_ownership ON suggested_updates(is_ownership_change) WHERE is_ownership_change = true;
CREATE INDEX IF NOT EXISTS idx_suggested_updates_batch ON suggested_updates(batch_id) WHERE batch_id IS NOT NULL;

-- ============================================================
-- 2. DEAL DOSSIERS — Houston Command's Deal Intelligence
-- ============================================================
-- Houston Command maintains a markdown dossier for each active deal.
-- Contains: key people, deal history, Fireflies transcripts, notes, analysis.
-- Synced between filesystem (~/Desktop/AI-Agents/deals/) and DB.

CREATE TABLE IF NOT EXISTS deal_dossiers (
  id              SERIAL PRIMARY KEY,
  deal_id         UUID REFERENCES deals(deal_id) ON DELETE CASCADE,

  -- Dossier content
  title           TEXT NOT NULL,                    -- Deal name
  content_md      TEXT NOT NULL DEFAULT '',          -- Full markdown content

  -- Structured sections (parsed from markdown)
  key_people      JSONB DEFAULT '[]',               -- [{name, role, contact_id, notes}]
  deal_timeline   JSONB DEFAULT '[]',               -- [{date, event, source}]
  transcript_refs JSONB DEFAULT '[]',               -- [{fireflies_id, date, summary, contact_id}]
  houston_analysis TEXT,                            -- Houston Command's strategic notes

  -- Oracle integration
  oracle_score    INTEGER,                          -- Latest Oracle prediction score
  oracle_signals  JSONB DEFAULT '[]',               -- Signals Oracle is tracking for this deal

  -- Sync state
  file_path       TEXT,                             -- ~/Desktop/AI-Agents/deals/[name].md
  file_hash       TEXT,                             -- MD5 of file content (detect changes)
  last_synced_at  TIMESTAMPTZ,
  sync_direction  TEXT DEFAULT 'bidirectional',     -- 'to_db', 'to_file', 'bidirectional'

  -- Metadata
  created_by      TEXT DEFAULT 'houston_command',
  updated_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_dossiers_deal ON deal_dossiers(deal_id);

-- ============================================================
-- 3. DATA SOURCE IMPROVEMENTS
-- ============================================================

-- Add data_source to properties if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'data_source'
  ) THEN
    ALTER TABLE properties ADD COLUMN data_source TEXT DEFAULT 'import';
  END IF;
END $$;

-- Add data_source to companies if not already there
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'companies' AND column_name = 'data_source'
  ) THEN
    ALTER TABLE companies ADD COLUMN data_source TEXT DEFAULT 'import';
  END IF;
END $$;

-- Add enrichment_status to contacts for tracking pipeline state
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'enrichment_status'
  ) THEN
    ALTER TABLE contacts ADD COLUMN enrichment_status TEXT DEFAULT 'not_started';
    -- Values: 'not_started', 'queued', 'in_progress', 'enriched', 'verified', 'failed'
  END IF;
END $$;

-- Add enrichment_status to properties
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'enrichment_status'
  ) THEN
    ALTER TABLE properties ADD COLUMN enrichment_status TEXT DEFAULT 'not_started';
  END IF;
END $$;

-- Add last_enriched_at timestamps
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'last_enriched_at'
  ) THEN
    ALTER TABLE contacts ADD COLUMN last_enriched_at TIMESTAMPTZ;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'last_enriched_at'
  ) THEN
    ALTER TABLE properties ADD COLUMN last_enriched_at TIMESTAMPTZ;
  END IF;
END $$;

-- Add enrichment_score to contacts (how complete is the record?)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name = 'enrichment_score'
  ) THEN
    ALTER TABLE contacts ADD COLUMN enrichment_score INTEGER DEFAULT 0;
    -- 0-100: calculated based on how many key fields are filled
    -- email=20, phone=20, name parsed=15, address=10, title=10, linkedin=10, data_source=5, notes=10
  END IF;
END $$;
