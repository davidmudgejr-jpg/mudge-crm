-- Migration 038: Add enriched_at column to contacts
-- Fix: migration 035 added enriched_by/enrichment_notes/etc. but missed enriched_at.
-- Referenced in enrich-contact API endpoint and fn_verification_auto_promote trigger.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
