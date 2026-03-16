-- Migration 013: Dynamic Tier Thresholds for TPE Scoring VIEW
-- Makes tier A/B thresholds configurable via tpe_config instead of hardcoded 70/40
-- Safe to re-run: uses INSERT ON CONFLICT DO NOTHING, DROP VIEW IF EXISTS

BEGIN;

-- ============================================================
-- SECTION 1: Add tier threshold config rows
-- ============================================================

INSERT INTO tpe_config (config_category, config_key, config_value, description)
VALUES
  ('blended', 'tier_a_threshold', 70, 'Blended priority score threshold for Tier A classification'),
  ('blended', 'tier_b_threshold', 40, 'Blended priority score threshold for Tier B classification')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================
-- SECTION 2: Recreate property_tpe_scores VIEW with dynamic tiers
-- Uses DROP + CREATE (not CREATE OR REPLACE) because cfg CTE gains columns
-- ============================================================

DROP VIEW IF EXISTS property_tpe_scores;

CREATE VIEW property_tpe_scores AS
WITH config AS (
  SELECT config_key, config_value FROM tpe_config
),
-- Pivot config into named variables
cfg AS (
  SELECT
    MAX(CASE WHEN config_key = 'lease_12mo_points' THEN config_value END) AS lease_12,
    MAX(CASE WHEN config_key = 'lease_18mo_points' THEN config_value END) AS lease_18,
    MAX(CASE WHEN config_key = 'lease_24mo_points' THEN config_value END) AS lease_24,
    MAX(CASE WHEN config_key = 'lease_36mo_points' THEN config_value END) AS lease_36,
    MAX(CASE WHEN config_key = 'entity_individual_points' THEN config_value END) AS entity_individual,
    MAX(CASE WHEN config_key = 'entity_trust_points' THEN config_value END) AS entity_trust,
    MAX(CASE WHEN config_key = 'hold_15yr_points' THEN config_value END) AS hold_15,
    MAX(CASE WHEN config_key = 'hold_10yr_points' THEN config_value END) AS hold_10,
    MAX(CASE WHEN config_key = 'hold_7yr_points' THEN config_value END) AS hold_7,
    MAX(CASE WHEN config_key = 'owner_user_bonus' THEN config_value END) AS owner_user,
    MAX(CASE WHEN config_key = 'ownership_cap' THEN config_value END) AS ownership_cap,
    MAX(CASE WHEN config_key = 'age_70_points' THEN config_value END) AS age_70,
    MAX(CASE WHEN config_key = 'age_65_points' THEN config_value END) AS age_65,
    MAX(CASE WHEN config_key = 'age_60_points' THEN config_value END) AS age_60,
    MAX(CASE WHEN config_key = 'age_55_points' THEN config_value END) AS age_55,
    MAX(CASE WHEN config_key = 'growth_30pct_points' THEN config_value END) AS growth_30,
    MAX(CASE WHEN config_key = 'growth_20pct_points' THEN config_value END) AS growth_20,
    MAX(CASE WHEN config_key = 'growth_10pct_points' THEN config_value END) AS growth_10,
    MAX(CASE WHEN config_key = 'balloon_high_points' THEN config_value END) AS balloon_high,
    MAX(CASE WHEN config_key = 'balloon_medium_points' THEN config_value END) AS balloon_med,
    MAX(CASE WHEN config_key = 'balloon_low_points' THEN config_value END) AS balloon_low,
    MAX(CASE WHEN config_key = 'lien_points' THEN config_value END) AS lien_pts,
    MAX(CASE WHEN config_key = 'stress_cap' THEN config_value END) AS stress_cap,
    MAX(CASE WHEN config_key = 'sale_price_psf' THEN config_value END) AS sale_psf,
    MAX(CASE WHEN config_key = 'lease_rate_small' THEN config_value END) AS rate_small,
    MAX(CASE WHEN config_key = 'lease_rate_mid' THEN config_value END) AS rate_mid,
    MAX(CASE WHEN config_key = 'lease_rate_large' THEN config_value END) AS rate_large,
    MAX(CASE WHEN config_key = 'lease_term_months' THEN config_value END) AS term_months,
    MAX(CASE WHEN config_key = 'sale_commission_5m' THEN config_value END) AS comm_5m,
    MAX(CASE WHEN config_key = 'sale_commission_10m' THEN config_value END) AS comm_10m,
    MAX(CASE WHEN config_key = 'sale_commission_over10m' THEN config_value END) AS comm_over10m,
    MAX(CASE WHEN config_key = 'lease_new_commission_rate' THEN config_value END) AS lease_new_rate,
    MAX(CASE WHEN config_key = 'lease_renewal_commission_rate' THEN config_value END) AS lease_renew_rate,
    MAX(CASE WHEN config_key = 'commission_divisor' THEN config_value END) AS comm_divisor,
    MAX(CASE WHEN config_key = 'time_mult_6mo' THEN config_value END) AS time_6,
    MAX(CASE WHEN config_key = 'time_mult_12mo' THEN config_value END) AS time_12,
    MAX(CASE WHEN config_key = 'time_mult_24mo' THEN config_value END) AS time_24,
    MAX(CASE WHEN config_key = 'time_mult_sale' THEN config_value END) AS time_sale,
    MAX(CASE WHEN config_key = 'tpe_weight' THEN config_value END) AS tpe_w,
    MAX(CASE WHEN config_key = 'ecv_weight' THEN config_value END) AS ecv_w,
    MAX(CASE WHEN config_key = 'matured_points' THEN config_value END) AS mat_matured,
    MAX(CASE WHEN config_key = 'mature_30d_points' THEN config_value END) AS mat_30d,
    MAX(CASE WHEN config_key = 'mature_90d_points' THEN config_value END) AS mat_90d,
    MAX(CASE WHEN config_key = 'mature_over90d_points' THEN config_value END) AS mat_over90d,
    MAX(CASE WHEN config_key = 'ltv_85_bonus' THEN config_value END) AS ltv_85,
    MAX(CASE WHEN config_key = 'ltv_75_bonus' THEN config_value END) AS ltv_75,
    MAX(CASE WHEN config_key = 'ltv_65_bonus' THEN config_value END) AS ltv_65,
    MAX(CASE WHEN config_key = 'duration_25yr_bonus' THEN config_value END) AS dur_25,
    MAX(CASE WHEN config_key = 'duration_4yr_bonus' THEN config_value END) AS dur_4,
    MAX(CASE WHEN config_key = 'purpose_acquisition_bonus' THEN config_value END) AS purp_acq,
    MAX(CASE WHEN config_key = 'purpose_construction_bonus' THEN config_value END) AS purp_const,
    MAX(CASE WHEN config_key = 'auction_points' THEN config_value END) AS dist_auction,
    MAX(CASE WHEN config_key = 'matured_distress_points' THEN config_value END) AS dist_matured,
    MAX(CASE WHEN config_key = 'nod_points' THEN config_value END) AS dist_nod,
    MAX(CASE WHEN config_key = 'mature_1mo_points' THEN config_value END) AS dist_1mo,
    MAX(CASE WHEN config_key = 'mature_3mo_points' THEN config_value END) AS dist_3mo,
    MAX(CASE WHEN config_key = 'mature_6mo_points' THEN config_value END) AS dist_6mo,
    MAX(CASE WHEN config_key = 'mature_9mo_points' THEN config_value END) AS dist_9mo,
    MAX(CASE WHEN config_key = 'mature_12mo_points' THEN config_value END) AS dist_12mo,
    MAX(CASE WHEN config_key = 'tier_a_threshold' THEN config_value END) AS tier_a,
    MAX(CASE WHEN config_key = 'tier_b_threshold' THEN config_value END) AS tier_b
  FROM config
),
-- Aggregate tenant growth per property (best growth signal wins)
-- tenant_growth is per-company; JOIN through property_companies to get per-property
best_growth AS (
  SELECT DISTINCT ON (pc.property_id)
    pc.property_id,
    tg.growth_rate AS growth_pct
  FROM property_companies pc
  JOIN tenant_growth tg ON tg.company_id = pc.company_id
  ORDER BY pc.property_id, tg.growth_rate DESC
),
-- Best debt stress signal per property (closest balloon wins)
best_debt AS (
  SELECT DISTINCT ON (property_id)
    property_id,
    balloon_confidence,
    LEAST(balloon_5yr, balloon_7yr, balloon_10yr) AS nearest_balloon
  FROM debt_stress
  ORDER BY property_id, LEAST(balloon_5yr, balloon_7yr, balloon_10yr) ASC NULLS LAST
),
-- Best confirmed loan maturity per property
best_maturity AS (
  SELECT DISTINCT ON (property_id)
    property_id,
    maturity_date,
    ltv,
    loan_duration_years AS loan_term_years,
    loan_purpose
  FROM loan_maturities
  ORDER BY property_id, maturity_date ASC
),
-- Best distress signal per property (highest severity wins)
best_distress AS (
  SELECT DISTINCT ON (property_id)
    property_id,
    distress_type,
    filing_date AS event_date
  FROM property_distress
  ORDER BY property_id,
    CASE distress_type
      WHEN 'Auction' THEN 1
      WHEN 'NOD' THEN 2
      WHEN 'Matured' THEN 3
      ELSE 4
    END ASC
),
-- Holding period in years
hold AS (
  SELECT
    property_id,
    CASE
      WHEN last_sale_date IS NOT NULL
      THEN EXTRACT(EPOCH FROM AGE(NOW(), last_sale_date)) / 31557600.0
      ELSE NULL
    END AS hold_years
  FROM properties
),
-- Owner age computed from contacts.date_of_birth
-- JOINs through property_contacts (Owner role) to find the oldest owner per property
owner_age AS (
  SELECT DISTINCT ON (pc.property_id)
    pc.property_id,
    EXTRACT(YEAR FROM AGE(NOW(), ct.date_of_birth))::integer AS owner_age_years
  FROM property_contacts pc
  JOIN contacts ct ON ct.contact_id = pc.contact_id
  WHERE ct.date_of_birth IS NOT NULL
    AND (pc.role IS NULL OR pc.role = 'Owner')
  ORDER BY pc.property_id, ct.date_of_birth ASC  -- oldest owner wins (earliest DOB)
),
-- Months until lease expiration (lease_exp lives on companies table)
-- JOINs through property_companies to find the soonest-expiring tenant lease per property
lease_months AS (
  SELECT DISTINCT ON (pc.property_id)
    pc.property_id,
    co.lease_exp AS lease_expiration,
    CASE
      WHEN co.lease_exp IS NOT NULL AND co.lease_exp > NOW()
      THEN EXTRACT(EPOCH FROM (co.lease_exp::timestamp - NOW())) / 2629800.0
      ELSE NULL
    END AS months_to_exp
  FROM property_companies pc
  JOIN companies co ON co.company_id = pc.company_id
  WHERE co.lease_exp IS NOT NULL
  ORDER BY pc.property_id, co.lease_exp ASC
),
-- ============================================================
-- MAIN SCORING: Compute all 5 models per property
-- ============================================================
scores AS (
  SELECT
    p.property_id,
    p.property_address AS address,
    p.city,
    p.property_type,
    p.building_class,
    p.costar_star_rating,
    p.rba,
    p.owner_entity_type,
    oa.owner_age_years,
    p.owner_call_status,
    p.tenant_call_status,
    p.has_lien_or_delinquency,
    lm.lease_expiration,
    p.last_sale_date,
    p.last_sale_price,
    h.hold_years,
    lm.months_to_exp,
    bg.growth_pct,
    bd.balloon_confidence,
    bm.maturity_date,
    bm.ltv,
    bm.loan_term_years,
    bm.loan_purpose,
    bdist.distress_type,
    bdist.event_date AS distress_event_date,

    -- ── MODEL 1: TPE Score (0-100) ──

    -- Category 1: Lease Expiration (0-30)
    CASE
      WHEN lm.months_to_exp IS NULL THEN 0
      WHEN lm.months_to_exp <= 12 THEN c.lease_12
      WHEN lm.months_to_exp <= 18 THEN c.lease_18
      WHEN lm.months_to_exp <= 24 THEN c.lease_24
      WHEN lm.months_to_exp <= 36 THEN c.lease_36
      ELSE 0
    END AS lease_score,

    -- Category 2: Ownership Profile (0-25, stacking with cap)
    LEAST(
      COALESCE(
        CASE p.owner_entity_type
          WHEN 'Individual' THEN c.entity_individual
          WHEN 'Private' THEN c.entity_individual
          WHEN 'Partnership' THEN c.entity_individual
          WHEN 'Trust' THEN c.entity_trust
          ELSE 0
        END, 0
      )
      + COALESCE(
        CASE
          WHEN h.hold_years >= 15 THEN c.hold_15
          WHEN h.hold_years >= 10 THEN c.hold_10
          WHEN h.hold_years >= 7  THEN c.hold_7
          ELSE 0
        END, 0
      )
      + CASE WHEN p.owner_user_or_investor = 'Owner/User' THEN c.owner_user ELSE 0 END,
      c.ownership_cap
    ) AS ownership_score,

    -- Category 3: Owner Age (0-20)
    CASE
      WHEN oa.owner_age_years IS NULL THEN 0
      WHEN oa.owner_age_years >= 70 THEN c.age_70
      WHEN oa.owner_age_years >= 65 THEN c.age_65
      WHEN oa.owner_age_years >= 60 THEN c.age_60
      WHEN oa.owner_age_years >= 55 THEN c.age_55
      ELSE 0
    END AS age_score,

    -- Category 4: Tenant Growth (0-15)
    CASE
      WHEN bg.growth_pct IS NULL THEN 0
      WHEN bg.growth_pct >= 30 THEN c.growth_30
      WHEN bg.growth_pct >= 20 THEN c.growth_20
      WHEN bg.growth_pct >= 10 THEN c.growth_10
      ELSE 0
    END AS growth_score,

    -- Category 5: Debt/Stress (0-10, stacking with cap)
    LEAST(
      COALESCE(
        CASE bd.balloon_confidence
          WHEN 'HIGH' THEN c.balloon_high
          WHEN 'MEDIUM' THEN c.balloon_med
          WHEN 'LOW' THEN c.balloon_low
          ELSE 0
        END, 0
      )
      + CASE WHEN p.has_lien_or_delinquency = TRUE THEN c.lien_pts ELSE 0 END,
      c.stress_cap
    ) AS stress_score,

    -- ── MODEL 2: ECV (Estimated Commission Value) ──
    -- Sale commission estimate
    CASE
      WHEN p.rba IS NOT NULL AND p.rba > 0 THEN
        CASE
          WHEN (p.rba * c.sale_psf) <= 5000000 THEN
            (p.rba * c.sale_psf) * c.comm_5m
          WHEN (p.rba * c.sale_psf) <= 10000000 THEN
            (p.rba * c.sale_psf) * c.comm_10m
          ELSE
            (p.rba * c.sale_psf) * c.comm_over10m
        END
      ELSE 0
    END AS sale_commission_est,

    -- Lease commission estimate
    CASE
      WHEN p.rba IS NOT NULL AND p.rba > 0 THEN
        p.rba *
        CASE
          WHEN p.rba < 30000 THEN c.rate_small
          WHEN p.rba < 50000 THEN c.rate_mid
          ELSE c.rate_large
        END
        * c.term_months * c.lease_new_rate
      ELSE 0
    END AS lease_commission_est,

    -- Time multiplier for ECV
    CASE
      WHEN lm.months_to_exp IS NOT NULL AND lm.months_to_exp <= 6 THEN c.time_6
      WHEN lm.months_to_exp IS NOT NULL AND lm.months_to_exp <= 12 THEN c.time_12
      WHEN lm.months_to_exp IS NOT NULL AND lm.months_to_exp <= 24 THEN c.time_24
      ELSE c.time_sale
    END AS time_multiplier,

    -- Config references for blended calc
    c.tpe_w,
    c.ecv_w,
    c.comm_divisor,

    -- ── MODEL 4: Maturity Boost ──
    CASE
      WHEN bm.maturity_date IS NULL THEN 0
      WHEN bm.maturity_date <= NOW() THEN c.mat_matured
      WHEN bm.maturity_date <= NOW() + INTERVAL '30 days' THEN c.mat_30d
      WHEN bm.maturity_date <= NOW() + INTERVAL '90 days' THEN c.mat_90d
      ELSE c.mat_over90d
    END
    + COALESCE(CASE WHEN bm.ltv >= 85 THEN c.ltv_85 WHEN bm.ltv >= 75 THEN c.ltv_75 WHEN bm.ltv >= 65 THEN c.ltv_65 ELSE 0 END, 0)
    + COALESCE(CASE WHEN bm.loan_term_years <= 2.5 THEN c.dur_25 WHEN bm.loan_term_years <= 4 THEN c.dur_4 ELSE 0 END, 0)
    + COALESCE(CASE WHEN bm.loan_purpose = 'Acquisition' THEN c.purp_acq WHEN bm.loan_purpose = 'Construction' THEN c.purp_const ELSE 0 END, 0)
    AS maturity_boost,

    -- ── MODEL 5: Distress Score ──
    CASE
      WHEN bdist.distress_type IS NULL THEN 0
      WHEN bdist.distress_type = 'Auction' THEN c.dist_auction
      WHEN bdist.distress_type = 'Matured' THEN c.dist_matured
      WHEN bdist.distress_type = 'NOD' THEN c.dist_nod
      ELSE
        CASE
          WHEN bdist.event_date <= NOW() + INTERVAL '1 month' THEN c.dist_1mo
          WHEN bdist.event_date <= NOW() + INTERVAL '3 months' THEN c.dist_3mo
          WHEN bdist.event_date <= NOW() + INTERVAL '6 months' THEN c.dist_6mo
          WHEN bdist.event_date <= NOW() + INTERVAL '9 months' THEN c.dist_9mo
          WHEN bdist.event_date <= NOW() + INTERVAL '12 months' THEN c.dist_12mo
          ELSE 0
        END
    END AS distress_score

  FROM properties p
  CROSS JOIN cfg c
  LEFT JOIN hold h ON h.property_id = p.property_id
  LEFT JOIN owner_age oa ON oa.property_id = p.property_id
  LEFT JOIN lease_months lm ON lm.property_id = p.property_id
  LEFT JOIN best_growth bg ON bg.property_id = p.property_id
  LEFT JOIN best_debt bd ON bd.property_id = p.property_id
  LEFT JOIN best_maturity bm ON bm.property_id = p.property_id
  LEFT JOIN best_distress bdist ON bdist.property_id = p.property_id
)
SELECT
  s.*,

  -- TPE Score (Model 1): sum of 5 categories, capped at 100
  LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score, 100)
    AS tpe_score,

  -- ECV (Model 2): best of sale or lease commission, time-adjusted, scaled to 0-100
  ROUND(
    GREATEST(s.sale_commission_est, s.lease_commission_est)
    * s.time_multiplier
    / NULLIF(s.comm_divisor, 0),
    1
  ) AS ecv_score,

  -- Blended Priority (Model 3): weighted average of TPE + ECV
  ROUND(
    LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score, 100)
      * s.tpe_w
    + LEAST(
        GREATEST(s.sale_commission_est, s.lease_commission_est)
        * s.time_multiplier
        / NULLIF(s.comm_divisor, 0),
        100
      ) * s.ecv_w,
    1
  ) AS blended_priority,

  -- Tier classification based on blended priority (dynamic thresholds from tpe_config)
  CASE
    WHEN LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score, 100) * s.tpe_w
       + LEAST(GREATEST(s.sale_commission_est, s.lease_commission_est) * s.time_multiplier / NULLIF(s.comm_divisor, 0), 100) * s.ecv_w
       >= cfg.tier_a THEN 'A'
    WHEN LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score, 100) * s.tpe_w
       + LEAST(GREATEST(s.sale_commission_est, s.lease_commission_est) * s.time_multiplier / NULLIF(s.comm_divisor, 0), 100) * s.ecv_w
       >= cfg.tier_b THEN 'B'
    ELSE 'C'
  END AS tpe_tier,

  -- "Who To Call & Why" — plain-English reason for outreach
  CASE
    WHEN s.distress_score >= 20 THEN 'DISTRESS: ' || COALESCE(s.distress_type, 'Unknown') || ' — immediate outreach recommended'
    WHEN s.maturity_boost >= 20 THEN 'LOAN MATURING: Confirmed maturity ' || TO_CHAR(s.maturity_date, 'Mon YYYY') || ' — refinance/sell pressure'
    WHEN s.lease_score >= 22 THEN 'LEASE EXPIRING: ' || TO_CHAR(s.lease_expiration, 'Mon YYYY') || ' — tenant decision window open'
    WHEN s.age_score >= 15 THEN 'OWNER AGE: Est. ' || s.owner_age_years || ' years old — succession/estate planning likely'
    WHEN s.ownership_score >= 15 THEN 'LONG HOLD: ' || ROUND(s.hold_years::numeric, 0) || ' years — equity harvesting opportunity'
    WHEN s.growth_score >= 10 THEN 'TENANT GROWTH: ' || s.growth_pct || '% headcount growth — expansion need likely'
    WHEN s.stress_score >= 5 THEN 'DEBT STRESS: Balloon or lien activity — motivated seller signals'
    ELSE 'LOW PRIORITY: No strong transaction signals detected'
  END AS call_reason

FROM scores s
CROSS JOIN cfg;

-- Update comment
COMMENT ON VIEW property_tpe_scores IS 'Transaction Probability Engine — 5-model live scoring with dynamic tier thresholds from tpe_config table.';

COMMIT;
