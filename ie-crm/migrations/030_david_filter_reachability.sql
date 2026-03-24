-- Migration 030: David Filter (Reachability Scoring)
-- Date: 2026-03-24
-- Purpose: Adds Model 7 to TPE — filters out unreachable owners, prioritizes
--          LLC/individual owners David can actually win business from.
--
-- Formula: FINAL_PRIORITY = TPE_BLENDED × DAVID_MODIFIER × SIZE_MODIFIER
--
-- The David Filter answers: "Even if this property scores high on TPE,
-- can David actually reach and win this owner?"

BEGIN;

-- ============================================================
-- 1. INSTITUTIONAL BLACKLIST TABLE
-- ============================================================
-- Properties owned by these entities are auto-deprioritized.
-- David can't win business from CBRE Investment Management.

CREATE TABLE IF NOT EXISTS institutional_blacklist (
  id              SERIAL PRIMARY KEY,
  entity_pattern  TEXT NOT NULL,          -- Pattern to match (case-insensitive LIKE)
  entity_type     TEXT DEFAULT 'company', -- 'company', 'reit', 'fund', 'government'
  reason          TEXT,                   -- Why this is blacklisted
  added_by        TEXT DEFAULT 'system',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with known institutional owners in IE industrial market
INSERT INTO institutional_blacklist (entity_pattern, entity_type, reason) VALUES
  -- REITs and institutional funds
  ('Prologis%', 'reit', 'Major REIT — uses in-house brokerage'),
  ('Duke Realty%', 'reit', 'Major REIT — institutional'),
  ('Rexford%', 'reit', 'IE-focused REIT — in-house team'),
  ('STAG Industrial%', 'reit', 'Industrial REIT'),
  ('Terreno%', 'reit', 'Industrial REIT'),
  ('EastGroup%', 'reit', 'Industrial REIT'),
  ('Blackstone%', 'fund', 'PE fund — institutional brokerage'),
  ('KKR%', 'fund', 'PE fund — institutional'),
  ('Brookfield%', 'fund', 'PE fund — institutional'),
  ('Starwood%', 'fund', 'PE fund — institutional'),
  ('GLP%', 'fund', 'Global logistics fund'),
  ('Goodman%', 'fund', 'Global industrial fund'),
  ('Clarion%', 'fund', 'Institutional fund'),
  ('LaSalle%', 'fund', 'Institutional fund'),
  ('Hines%', 'fund', 'Institutional developer'),
  ('Trammell Crow%', 'fund', 'Institutional developer'),
  ('TA Realty%', 'fund', 'Institutional fund'),
  ('Invesco%', 'fund', 'Institutional fund'),
  ('Principal%', 'fund', 'Institutional fund'),
  ('MetLife%', 'fund', 'Insurance company investor'),
  ('Prudential%', 'fund', 'Insurance company investor'),
  ('AEW%', 'fund', 'Institutional fund'),
  ('PGIM%', 'fund', 'Institutional fund'),
  ('Nuveen%', 'fund', 'Institutional fund'),
  -- Brokerage firms (they ARE the competition)
  ('CBRE%', 'company', 'Competing brokerage'),
  ('JLL%', 'company', 'Competing brokerage'),
  ('Jones Lang%', 'company', 'Competing brokerage'),
  ('Cushman%', 'company', 'Competing brokerage'),
  ('Colliers%', 'company', 'Competing brokerage'),
  ('Newmark%', 'company', 'Competing brokerage'),
  ('Marcus & Millichap%', 'company', 'Competing brokerage'),
  ('Kidder Mathews%', 'company', 'Competing brokerage'),
  -- Government
  ('%County of%', 'government', 'Government entity'),
  ('%City of%', 'government', 'Government entity'),
  ('%State of%', 'government', 'Government entity'),
  ('%School District%', 'government', 'Government entity'),
  ('%Water District%', 'government', 'Government entity'),
  ('%Housing Authority%', 'government', 'Government entity')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. DAVID FILTER CONFIG — weights stored in tpe_config
-- ============================================================

INSERT INTO tpe_config (config_category, config_key, config_value, description) VALUES
  -- David modifier weights
  ('david_filter', 'institutional_penalty', -100, 'Penalty for institutional/REIT owners (effectively removes them)'),
  ('david_filter', 'llc_bonus', 15, 'Bonus for LLC owners (most reachable)'),
  ('david_filter', 'individual_bonus', 12, 'Bonus for individual/family owners'),
  ('david_filter', 'trust_bonus', 10, 'Bonus for trust owners'),
  ('david_filter', 'corp_bonus', 5, 'Bonus for small corp owners'),

  -- Size modifier weights (David's sweet spot: 5K-100K SF)
  ('david_filter', 'sweet_spot_min_sf', 5000, 'Minimum SF for sweet spot bonus'),
  ('david_filter', 'sweet_spot_max_sf', 100000, 'Maximum SF for sweet spot bonus'),
  ('david_filter', 'sweet_spot_bonus', 10, 'Bonus for properties in Davids sweet spot'),
  ('david_filter', 'oversized_penalty', -20, 'Penalty for 250K+ SF (institutional territory)'),
  ('david_filter', 'oversized_threshold', 250000, 'SF threshold for oversized penalty'),
  ('david_filter', 'tiny_penalty', -5, 'Penalty for under 2K SF (not worth the time)'),
  ('david_filter', 'tiny_threshold', 2000, 'SF threshold for tiny penalty'),

  -- Engagement bonus (David has existing relationship)
  ('david_filter', 'has_contact_bonus', 8, 'Bonus if owner has a CRM contact record'),
  ('david_filter', 'has_interaction_bonus', 12, 'Bonus if there are logged interactions'),
  ('david_filter', 'recent_interaction_bonus', 15, 'Bonus if interaction within 90 days'),

  -- Reachability factors
  ('david_filter', 'has_email_bonus', 5, 'Bonus if contact has email'),
  ('david_filter', 'has_phone_bonus', 5, 'Bonus if contact has phone'),
  ('david_filter', 'no_contact_penalty', -10, 'Penalty if no contact info at all')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;

-- ============================================================
-- 3. ADD david_filter COLUMNS TO PROPERTIES
-- ============================================================

DO $$
BEGIN
  -- David modifier score
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'david_modifier'
  ) THEN
    ALTER TABLE properties ADD COLUMN david_modifier NUMERIC DEFAULT 0;
  END IF;

  -- Size modifier score
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'size_modifier'
  ) THEN
    ALTER TABLE properties ADD COLUMN size_modifier NUMERIC DEFAULT 0;
  END IF;

  -- Final priority (TPE × david × size)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'final_priority'
  ) THEN
    ALTER TABLE properties ADD COLUMN final_priority NUMERIC DEFAULT 0;
  END IF;

  -- Is this an institutional owner?
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'is_institutional'
  ) THEN
    ALTER TABLE properties ADD COLUMN is_institutional BOOLEAN DEFAULT false;
  END IF;

  -- Blacklist match (which pattern matched)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'blacklist_match'
  ) THEN
    ALTER TABLE properties ADD COLUMN blacklist_match TEXT;
  END IF;

  -- David's reachability score (0-100)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'properties' AND column_name = 'reachability_score'
  ) THEN
    ALTER TABLE properties ADD COLUMN reachability_score INTEGER DEFAULT 0;
  END IF;
END $$;

-- ============================================================
-- 4. CREATE david_filter_scores VIEW
-- ============================================================
-- This VIEW computes the David Filter on top of TPE scores
-- FINAL_PRIORITY = TPE_BLENDED × (1 + DAVID_MODIFIER/100) × (1 + SIZE_MODIFIER/100)

DROP VIEW IF EXISTS david_filter_scores;

CREATE VIEW david_filter_scores AS
WITH config AS (
  SELECT config_key, config_value FROM tpe_config
  WHERE config_category = 'david_filter'
),
cfg AS (
  SELECT
    MAX(CASE WHEN config_key = 'institutional_penalty' THEN config_value END) AS institutional_penalty,
    MAX(CASE WHEN config_key = 'llc_bonus' THEN config_value END) AS llc_bonus,
    MAX(CASE WHEN config_key = 'individual_bonus' THEN config_value END) AS individual_bonus,
    MAX(CASE WHEN config_key = 'trust_bonus' THEN config_value END) AS trust_bonus,
    MAX(CASE WHEN config_key = 'corp_bonus' THEN config_value END) AS corp_bonus,
    MAX(CASE WHEN config_key = 'sweet_spot_min_sf' THEN config_value END) AS sweet_min,
    MAX(CASE WHEN config_key = 'sweet_spot_max_sf' THEN config_value END) AS sweet_max,
    MAX(CASE WHEN config_key = 'sweet_spot_bonus' THEN config_value END) AS sweet_bonus,
    MAX(CASE WHEN config_key = 'oversized_penalty' THEN config_value END) AS oversized_penalty,
    MAX(CASE WHEN config_key = 'oversized_threshold' THEN config_value END) AS oversized_threshold,
    MAX(CASE WHEN config_key = 'tiny_penalty' THEN config_value END) AS tiny_penalty,
    MAX(CASE WHEN config_key = 'tiny_threshold' THEN config_value END) AS tiny_threshold,
    MAX(CASE WHEN config_key = 'has_contact_bonus' THEN config_value END) AS has_contact_bonus,
    MAX(CASE WHEN config_key = 'has_interaction_bonus' THEN config_value END) AS has_interaction_bonus,
    MAX(CASE WHEN config_key = 'recent_interaction_bonus' THEN config_value END) AS recent_interaction_bonus,
    MAX(CASE WHEN config_key = 'has_email_bonus' THEN config_value END) AS has_email_bonus,
    MAX(CASE WHEN config_key = 'has_phone_bonus' THEN config_value END) AS has_phone_bonus,
    MAX(CASE WHEN config_key = 'no_contact_penalty' THEN config_value END) AS no_contact_penalty
  FROM config
),
-- Check for institutional blacklist matches
blacklist_check AS (
  SELECT
    p.property_id,
    BOOL_OR(b.id IS NOT NULL) AS is_institutional,
    MIN(b.entity_pattern) AS blacklist_match
  FROM properties p
  LEFT JOIN institutional_blacklist b
    ON p.owner_name ILIKE b.entity_pattern
    OR p.recorded_owner_name ILIKE b.entity_pattern
    OR p.true_owner_name ILIKE b.entity_pattern
  GROUP BY p.property_id
),
-- Check for CRM contact linkage and interactions
contact_check AS (
  SELECT
    p.property_id,
    COUNT(DISTINCT c.contact_id) AS contact_count,
    MAX(c.email) IS NOT NULL AS has_email,
    MAX(c.phone_1) IS NOT NULL AS has_phone,
    COUNT(DISTINCT i.interaction_id) AS interaction_count,
    MAX(i.date) AS last_interaction_date,
    MAX(i.date) > NOW() - INTERVAL '90 days' AS recent_interaction
  FROM properties p
  LEFT JOIN property_contacts cp ON p.property_id = cp.property_id
  LEFT JOIN contacts c ON cp.contact_id = c.contact_id
  LEFT JOIN interaction_contacts ic ON c.contact_id = ic.contact_id
  LEFT JOIN interactions i ON ic.interaction_id = i.interaction_id
  GROUP BY p.property_id
),
-- Compute modifiers
scored AS (
  SELECT
    tpe.property_id,
    tpe.address,
    tpe.city,
    tpe.property_type,
    tpe.rba AS building_sf,
    tpe.owner_name,
    tpe.blended_priority,
    tpe.tpe_tier,
    tpe.call_reason,

    -- Institutional check
    COALESCE(bc.is_institutional, false) AS is_institutional,
    bc.blacklist_match,

    -- David modifier (entity type + engagement)
    CASE WHEN COALESCE(bc.is_institutional, false) THEN cfg.institutional_penalty
    ELSE
      -- Entity type bonus
      CASE
        WHEN tpe.owner_entity_type ILIKE '%LLC%' THEN COALESCE(cfg.llc_bonus, 15)
        WHEN tpe.owner_entity_type ILIKE '%Trust%' THEN COALESCE(cfg.trust_bonus, 10)
        WHEN tpe.owner_entity_type ILIKE '%Inc%' OR tpe.owner_entity_type ILIKE '%Corp%' THEN COALESCE(cfg.corp_bonus, 5)
        ELSE COALESCE(cfg.individual_bonus, 12) -- Assume individual if no entity markers
      END
      -- Contact/engagement bonuses
      + CASE WHEN COALESCE(cc.contact_count, 0) > 0 THEN COALESCE(cfg.has_contact_bonus, 8) ELSE COALESCE(cfg.no_contact_penalty, -10) END
      + CASE WHEN COALESCE(cc.interaction_count, 0) > 0 THEN COALESCE(cfg.has_interaction_bonus, 12) ELSE 0 END
      + CASE WHEN COALESCE(cc.recent_interaction, false) THEN COALESCE(cfg.recent_interaction_bonus, 15) ELSE 0 END
      + CASE WHEN COALESCE(cc.has_email, false) THEN COALESCE(cfg.has_email_bonus, 5) ELSE 0 END
      + CASE WHEN COALESCE(cc.has_phone, false) THEN COALESCE(cfg.has_phone_bonus, 5) ELSE 0 END
    END AS david_modifier,

    -- Size modifier
    CASE
      WHEN COALESCE(tpe.rba, 0) >= COALESCE(cfg.oversized_threshold, 250000) THEN COALESCE(cfg.oversized_penalty, -20)
      WHEN COALESCE(tpe.rba, 0) <= COALESCE(cfg.tiny_threshold, 2000) AND COALESCE(tpe.rba, 0) > 0 THEN COALESCE(cfg.tiny_penalty, -5)
      WHEN COALESCE(tpe.rba, 0) BETWEEN COALESCE(cfg.sweet_min, 5000) AND COALESCE(cfg.sweet_max, 100000) THEN COALESCE(cfg.sweet_bonus, 10)
      ELSE 0
    END AS size_modifier,

    -- Contact info
    COALESCE(cc.contact_count, 0) AS linked_contacts,
    COALESCE(cc.interaction_count, 0) AS total_interactions,
    cc.last_interaction_date,
    COALESCE(cc.has_email, false) AS has_email,
    COALESCE(cc.has_phone, false) AS has_phone

  FROM property_tpe_scores tpe
  CROSS JOIN cfg
  LEFT JOIN blacklist_check bc ON tpe.property_id = bc.property_id
  LEFT JOIN contact_check cc ON tpe.property_id = cc.property_id
)

SELECT
  s.*,

  -- Reachability score (0-100): how reachable is this owner?
  GREATEST(0, LEAST(100,
    50 -- base score
    + CASE WHEN s.linked_contacts > 0 THEN 15 ELSE -15 END
    + CASE WHEN s.has_email THEN 10 ELSE 0 END
    + CASE WHEN s.has_phone THEN 10 ELSE 0 END
    + CASE WHEN s.total_interactions > 0 THEN 10 ELSE 0 END
    + CASE WHEN s.last_interaction_date > NOW() - INTERVAL '90 days' THEN 10 ELSE 0 END
    + CASE WHEN s.is_institutional THEN -50 ELSE 0 END
  )) AS reachability_score,

  -- FINAL PRIORITY = TPE × (1 + david_modifier/100) × (1 + size_modifier/100)
  -- Clamped to 0-100
  GREATEST(0, LEAST(100, ROUND(
    s.blended_priority
    * (1.0 + s.david_modifier / 100.0)
    * (1.0 + s.size_modifier / 100.0)
  ))) AS final_priority,

  -- Daily call list rank (ORDER BY this)
  ROW_NUMBER() OVER (
    ORDER BY
      CASE WHEN s.is_institutional THEN 1 ELSE 0 END ASC, -- Non-institutional first
      GREATEST(0, LEAST(100, ROUND(
        s.blended_priority * (1.0 + s.david_modifier / 100.0) * (1.0 + s.size_modifier / 100.0)
      ))) DESC
  ) AS call_list_rank

FROM scored s;

COMMENT ON VIEW david_filter_scores IS 'David Filter (Model 7) — Reachability scoring on top of TPE. FINAL_PRIORITY = TPE × DAVID_MODIFIER × SIZE_MODIFIER. Filters institutional owners, prioritizes LLC/individual in 5K-100K SF.';

COMMIT;
