-- Migration 016: TPE Data Gap Impact Scoring
-- Creates property_data_gaps VIEW that identifies missing data
-- with the highest potential impact on TPE scores.
-- No new tables — queries property_tpe_scores VIEW + tpe_config.
-- Safe to re-run: uses DROP VIEW IF EXISTS.

BEGIN;

DROP VIEW IF EXISTS property_data_gaps;

CREATE VIEW property_data_gaps AS
WITH cfg AS (
  SELECT
    MAX(CASE WHEN config_key = 'age_70_points' THEN config_value END) AS age_max,
    MAX(CASE WHEN config_key = 'growth_30pct_points' THEN config_value END) AS growth_max,
    MAX(CASE WHEN config_key = 'stress_cap' THEN config_value END) AS stress_max,
    MAX(CASE WHEN config_key = 'ownership_cap' THEN config_value END) AS ownership_max,
    MAX(CASE WHEN config_key = 'tier_a_threshold' THEN config_value END) AS tier_a,
    MAX(CASE WHEN config_key = 'tier_b_threshold' THEN config_value END) AS tier_b,
    MAX(CASE WHEN config_key = 'tier_c_threshold' THEN config_value END) AS tier_c
  FROM tpe_config
),
gaps AS (
  SELECT
    t.property_id,
    t.address,
    t.city,
    t.property_type,
    t.tpe_tier,
    t.blended_priority,
    t.owner_name,
    t.tenant_name,
    t.owner_contact_id,
    t.tenant_company_id,
    -- Individual scores for reference
    t.age_score,
    t.growth_score,
    t.stress_score,
    t.ownership_score,
    t.lease_score,
    t.maturity_boost,
    t.distress_score,

    -- Per-model gap calculations:
    -- Gap = score is 0 (or low) AND underlying data is missing
    CASE WHEN t.age_score = 0 AND t.owner_age_years IS NULL
      THEN c.age_max ELSE 0 END AS age_gap_pts,

    CASE WHEN t.growth_score = 0 AND t.growth_rate IS NULL
      THEN c.growth_max ELSE 0 END AS growth_gap_pts,

    CASE WHEN t.stress_score = 0 AND NOT EXISTS (
      SELECT 1 FROM debt_stress ds WHERE ds.property_id = t.property_id
    ) THEN c.stress_max ELSE 0 END AS stress_gap_pts,

    CASE WHEN t.ownership_score < 10 AND t.owner_name IS NULL
      THEN c.ownership_max ELSE 0 END AS ownership_gap_pts,

    -- Tier thresholds for next-tier calc
    c.tier_a,
    c.tier_b,
    c.tier_c
  FROM property_tpe_scores t
  CROSS JOIN cfg c
)
SELECT
  g.*,

  -- Total potential point gain from filling all gaps
  (g.age_gap_pts + g.growth_gap_pts + g.stress_gap_pts + g.ownership_gap_pts) AS total_gap_pts,

  -- Points needed to reach next tier
  CASE g.tpe_tier
    WHEN 'D' THEN GREATEST(g.tier_c - g.blended_priority, 0)
    WHEN 'C' THEN GREATEST(g.tier_b - g.blended_priority, 0)
    WHEN 'B' THEN GREATEST(g.tier_a - g.blended_priority, 0)
    ELSE 0
  END AS pts_to_next_tier,

  -- Projected tier if all gaps were filled with max values
  CASE
    WHEN g.blended_priority + (g.age_gap_pts + g.growth_gap_pts + g.stress_gap_pts + g.ownership_gap_pts) * 0.7 >= g.tier_a THEN 'A'
    WHEN g.blended_priority + (g.age_gap_pts + g.growth_gap_pts + g.stress_gap_pts + g.ownership_gap_pts) * 0.7 >= g.tier_b THEN 'B'
    WHEN g.blended_priority + (g.age_gap_pts + g.growth_gap_pts + g.stress_gap_pts + g.ownership_gap_pts) * 0.7 >= g.tier_c THEN 'C'
    ELSE 'D'
  END AS projected_tier,

  -- Impact priority: gap_pts × (1 / distance_to_next_tier)
  -- Properties closest to a tier jump with biggest gaps surface first
  (g.age_gap_pts + g.growth_gap_pts + g.stress_gap_pts + g.ownership_gap_pts)::float
    * (1.0 / GREATEST(
      CASE g.tpe_tier
        WHEN 'D' THEN GREATEST(g.tier_c - g.blended_priority, 1)
        WHEN 'C' THEN GREATEST(g.tier_b - g.blended_priority, 1)
        WHEN 'B' THEN GREATEST(g.tier_a - g.blended_priority, 1)
        ELSE 1
      END, 1)) AS impact_priority

FROM gaps g
WHERE (g.age_gap_pts + g.growth_gap_pts + g.stress_gap_pts + g.ownership_gap_pts) > 0;

COMMENT ON VIEW property_data_gaps IS 'Identifies missing data with highest potential TPE score impact. Sorted by impact_priority (gap × proximity to next tier).';

COMMIT;
