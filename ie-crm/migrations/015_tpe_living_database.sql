-- Migration 015: TPE Living Database — Phase 1
-- Adds temporal decay config keys and recreates VIEW with:
--   - Post-expiry lease scoring (month-to-month signal)
--   - Loan maturity decay (12-month window)
--   - Distress event decay (12-month window with 50% mid-tier)
--   - Owner/tenant split call reasons with contact lookups
-- Safe to re-run: uses ON CONFLICT DO NOTHING, DROP VIEW IF EXISTS

BEGIN;

-- ============================================================
-- SECTION 1: New config keys for temporal decay
-- ============================================================

INSERT INTO tpe_config (config_category, config_key, config_value, description)
VALUES
  ('lease', 'lease_expired_0_3mo_points', 8, 'Points for leases expired 0-3 months (month-to-month window)'),
  ('lease', 'lease_expired_3_6mo_points', 4, 'Points for leases expired 3-6 months (stale lease)'),
  ('maturity', 'maturity_past_0_3mo_points', 15, 'Points for loans matured 0-3 months ago'),
  ('maturity', 'maturity_past_3_6mo_points', 8, 'Points for loans matured 3-6 months ago'),
  ('maturity', 'maturity_past_6_12mo_points', 3, 'Points for loans matured 6-12 months ago'),
  ('distress', 'distress_decay_6_12mo_pct', 50, 'Percentage of distress score retained 6-12 months after event')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================
-- SECTION 2: Recreate property_tpe_scores VIEW
-- ============================================================

DROP VIEW IF EXISTS property_tpe_scores;

CREATE VIEW property_tpe_scores AS
WITH config AS (
  SELECT config_key, config_value FROM tpe_config
),
-- Pivot config into named variables
cfg AS (
  SELECT
    -- Lease scoring
    MAX(CASE WHEN config_key = 'lease_12mo_points' THEN config_value END) AS lease_12,
    MAX(CASE WHEN config_key = 'lease_18mo_points' THEN config_value END) AS lease_18,
    MAX(CASE WHEN config_key = 'lease_24mo_points' THEN config_value END) AS lease_24,
    MAX(CASE WHEN config_key = 'lease_36mo_points' THEN config_value END) AS lease_36,
    -- NEW: Post-expiry lease decay
    MAX(CASE WHEN config_key = 'lease_expired_0_3mo_points' THEN config_value END) AS lease_exp_0_3,
    MAX(CASE WHEN config_key = 'lease_expired_3_6mo_points' THEN config_value END) AS lease_exp_3_6,
    -- Ownership
    MAX(CASE WHEN config_key = 'entity_individual_points' THEN config_value END) AS entity_individual,
    MAX(CASE WHEN config_key = 'entity_trust_points' THEN config_value END) AS entity_trust,
    MAX(CASE WHEN config_key = 'hold_15yr_points' THEN config_value END) AS hold_15,
    MAX(CASE WHEN config_key = 'hold_10yr_points' THEN config_value END) AS hold_10,
    MAX(CASE WHEN config_key = 'hold_7yr_points' THEN config_value END) AS hold_7,
    MAX(CASE WHEN config_key = 'owner_user_bonus' THEN config_value END) AS owner_user,
    MAX(CASE WHEN config_key = 'ownership_cap' THEN config_value END) AS ownership_cap,
    -- Age
    MAX(CASE WHEN config_key = 'age_70_points' THEN config_value END) AS age_70,
    MAX(CASE WHEN config_key = 'age_65_points' THEN config_value END) AS age_65,
    MAX(CASE WHEN config_key = 'age_60_points' THEN config_value END) AS age_60,
    MAX(CASE WHEN config_key = 'age_55_points' THEN config_value END) AS age_55,
    -- Growth
    MAX(CASE WHEN config_key = 'growth_30pct_points' THEN config_value END) AS growth_30,
    MAX(CASE WHEN config_key = 'growth_20pct_points' THEN config_value END) AS growth_20,
    MAX(CASE WHEN config_key = 'growth_10pct_points' THEN config_value END) AS growth_10,
    -- Stress
    MAX(CASE WHEN config_key = 'balloon_high_points' THEN config_value END) AS balloon_high,
    MAX(CASE WHEN config_key = 'balloon_medium_points' THEN config_value END) AS balloon_med,
    MAX(CASE WHEN config_key = 'balloon_low_points' THEN config_value END) AS balloon_low,
    MAX(CASE WHEN config_key = 'lien_points' THEN config_value END) AS lien_pts,
    MAX(CASE WHEN config_key = 'stress_cap' THEN config_value END) AS stress_cap,
    -- Commission
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
    -- Time multiplier
    MAX(CASE WHEN config_key = 'time_mult_6mo' THEN config_value END) AS time_6,
    MAX(CASE WHEN config_key = 'time_mult_12mo' THEN config_value END) AS time_12,
    MAX(CASE WHEN config_key = 'time_mult_24mo' THEN config_value END) AS time_24,
    MAX(CASE WHEN config_key = 'time_mult_sale' THEN config_value END) AS time_sale,
    -- Blended weights
    MAX(CASE WHEN config_key = 'tpe_weight' THEN config_value END) AS tpe_w,
    MAX(CASE WHEN config_key = 'ecv_weight' THEN config_value END) AS ecv_w,
    -- Maturity model
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
    -- NEW: Post-maturity decay
    MAX(CASE WHEN config_key = 'maturity_past_0_3mo_points' THEN config_value END) AS mat_past_0_3,
    MAX(CASE WHEN config_key = 'maturity_past_3_6mo_points' THEN config_value END) AS mat_past_3_6,
    MAX(CASE WHEN config_key = 'maturity_past_6_12mo_points' THEN config_value END) AS mat_past_6_12,
    -- Distress model
    MAX(CASE WHEN config_key = 'auction_points' THEN config_value END) AS dist_auction,
    MAX(CASE WHEN config_key = 'matured_distress_points' THEN config_value END) AS dist_matured,
    MAX(CASE WHEN config_key = 'nod_points' THEN config_value END) AS dist_nod,
    MAX(CASE WHEN config_key = 'mature_1mo_points' THEN config_value END) AS dist_1mo,
    MAX(CASE WHEN config_key = 'mature_3mo_points' THEN config_value END) AS dist_3mo,
    MAX(CASE WHEN config_key = 'mature_6mo_points' THEN config_value END) AS dist_6mo,
    MAX(CASE WHEN config_key = 'mature_9mo_points' THEN config_value END) AS dist_9mo,
    MAX(CASE WHEN config_key = 'mature_12mo_points' THEN config_value END) AS dist_12mo,
    -- NEW: Distress decay
    MAX(CASE WHEN config_key = 'distress_decay_6_12mo_pct' THEN config_value END) AS dist_decay_pct,
    -- Tier thresholds
    MAX(CASE WHEN config_key = 'tier_a_threshold' THEN config_value END) AS tier_a,
    MAX(CASE WHEN config_key = 'tier_b_threshold' THEN config_value END) AS tier_b,
    MAX(CASE WHEN config_key = 'tier_c_threshold' THEN config_value END) AS tier_c
  FROM config
),
-- ============================================================
-- Aggregate tenant growth per property (best growth signal wins)
-- ============================================================
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
    filing_date AS event_date,
    -- NEW: Compute months since distress event for decay
    CASE
      WHEN filing_date IS NOT NULL AND filing_date < NOW()
      THEN EXTRACT(EPOCH FROM (NOW() - filing_date)) / 2629800.0
      ELSE 0
    END AS months_since_distress
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
-- Owner age (case-insensitive role match + fallback to static contacts.age)
owner_age AS (
  SELECT DISTINCT ON (pc.property_id)
    pc.property_id,
    COALESCE(
      EXTRACT(YEAR FROM AGE(NOW(), ct.date_of_birth))::integer,
      ct.age::integer
    ) AS owner_age_years
  FROM property_contacts pc
  JOIN contacts ct ON ct.contact_id = pc.contact_id
  WHERE (ct.date_of_birth IS NOT NULL OR ct.age IS NOT NULL)
    AND LOWER(pc.role) = 'owner'
  ORDER BY pc.property_id, ct.date_of_birth ASC NULLS LAST, ct.age DESC NULLS LAST
),
-- ============================================================
-- CHANGED: Lease months — removed > NOW() guard to allow negative months_to_exp
-- This enables post-expiry scoring (month-to-month, stale lease)
-- ============================================================
lease_months AS (
  SELECT DISTINCT ON (pc.property_id)
    pc.property_id,
    co.lease_exp AS lease_expiration,
    CASE
      WHEN co.lease_exp IS NOT NULL
      THEN EXTRACT(EPOCH FROM (co.lease_exp::timestamp - NOW())) / 2629800.0
      ELSE NULL
    END AS months_to_exp
  FROM property_companies pc
  JOIN companies co ON co.company_id = pc.company_id
  WHERE co.lease_exp IS NOT NULL
  ORDER BY pc.property_id, co.lease_exp ASC
),
-- ============================================================
-- NEW: Owner contact lookup (for clickable owner outreach card)
-- ============================================================
owner_contact AS (
  SELECT DISTINCT ON (pc.property_id)
    pc.property_id,
    ct.contact_id AS owner_contact_id,
    ct.full_name AS owner_name,
    ct.phone_1 AS owner_phone
  FROM property_contacts pc
  JOIN contacts ct ON ct.contact_id = pc.contact_id
  WHERE LOWER(pc.role) = 'owner'
  ORDER BY pc.property_id, ct.date_of_birth ASC NULLS LAST
),
-- ============================================================
-- NEW: Tenant company lookup (for clickable tenant outreach card)
-- ============================================================
tenant_company AS (
  SELECT DISTINCT ON (pco.property_id)
    pco.property_id,
    co.company_id AS tenant_company_id,
    co.company_name AS tenant_name
  FROM property_companies pco
  JOIN companies co ON co.company_id = pco.company_id
  ORDER BY pco.property_id, co.lease_exp DESC NULLS LAST
),
-- ============================================================
-- MAIN SCORING: Compute all models per property
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
    p.owner_user_or_investor,
    oa.owner_age_years,
    p.owner_call_status,
    p.tenant_call_status,
    p.has_lien_or_delinquency,
    lm.lease_expiration,
    p.last_sale_date,
    p.last_sale_price,
    p.year_built,
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
    bdist.months_since_distress,
    -- NEW: Owner contact info
    oc.owner_contact_id,
    oc.owner_name,
    oc.owner_phone,
    -- NEW: Tenant company info
    tc.tenant_company_id,
    tc.tenant_name,

    -- ── MODEL 1: TPE Score (0-100) ──

    -- Category 1: Lease Expiration (0-30) — NOW WITH POST-EXPIRY DECAY
    CASE
      WHEN lm.months_to_exp IS NULL THEN 0
      -- Pre-expiry tiers (approaching)
      WHEN lm.months_to_exp >= 0 AND lm.months_to_exp <= 12 THEN c.lease_12
      WHEN lm.months_to_exp >= 0 AND lm.months_to_exp <= 18 THEN c.lease_18
      WHEN lm.months_to_exp >= 0 AND lm.months_to_exp <= 24 THEN c.lease_24
      WHEN lm.months_to_exp >= 0 AND lm.months_to_exp <= 36 THEN c.lease_36
      -- Post-expiry decay (month-to-month → stale → gone)
      WHEN lm.months_to_exp < 0 AND lm.months_to_exp >= -3 THEN COALESCE(c.lease_exp_0_3, 8)
      WHEN lm.months_to_exp < -3 AND lm.months_to_exp >= -6 THEN COALESCE(c.lease_exp_3_6, 4)
      WHEN lm.months_to_exp < -6 THEN 0
      ELSE 0
    END AS lease_score,

    -- Category 2: Ownership Profile (0-30, stacking with cap)
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

    -- Category 5: Debt/Stress (0-15, stacking with cap)
    LEAST(
      COALESCE(
        CASE TRIM(bd.balloon_confidence)
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
    CASE
      WHEN p.rba IS NOT NULL AND p.rba > 0 THEN
        CASE
          WHEN (p.rba * c.sale_psf) <= 5000000 THEN (p.rba * c.sale_psf) * c.comm_5m
          WHEN (p.rba * c.sale_psf) <= 10000000 THEN (p.rba * c.sale_psf) * c.comm_10m
          ELSE (p.rba * c.sale_psf) * c.comm_over10m
        END
      ELSE 0
    END AS sale_commission_est,

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

    -- Time multiplier — also handles post-expiry leases
    CASE
      WHEN lm.months_to_exp IS NOT NULL AND lm.months_to_exp <= 6 AND lm.months_to_exp >= 0 THEN c.time_6
      WHEN lm.months_to_exp IS NOT NULL AND lm.months_to_exp <= 12 AND lm.months_to_exp >= 0 THEN c.time_12
      WHEN lm.months_to_exp IS NOT NULL AND lm.months_to_exp <= 24 AND lm.months_to_exp >= 0 THEN c.time_24
      WHEN lm.months_to_exp IS NOT NULL AND lm.months_to_exp < 0 THEN c.time_sale  -- expired leases get base multiplier (opportunity may have passed)
      ELSE c.time_sale
    END AS time_multiplier,

    -- Config references for blended calc
    c.tpe_w,
    c.ecv_w,
    c.comm_divisor,

    -- ── MODEL 4: Maturity Boost — NOW WITH POST-MATURITY DECAY ──
    CASE
      WHEN bm.maturity_date IS NULL THEN 0
      -- Pre-maturity tiers (approaching)
      WHEN bm.maturity_date > NOW() AND bm.maturity_date <= NOW() + INTERVAL '30 days' THEN c.mat_30d
      WHEN bm.maturity_date > NOW() AND bm.maturity_date <= NOW() + INTERVAL '90 days' THEN c.mat_90d
      WHEN bm.maturity_date > NOW() THEN c.mat_over90d
      -- Post-maturity decay
      WHEN bm.maturity_date <= NOW() AND EXTRACT(EPOCH FROM (NOW() - bm.maturity_date)) / 2629800.0 <= 3
        THEN COALESCE(c.mat_past_0_3, 15)
      WHEN bm.maturity_date <= NOW() AND EXTRACT(EPOCH FROM (NOW() - bm.maturity_date)) / 2629800.0 <= 6
        THEN COALESCE(c.mat_past_3_6, 8)
      WHEN bm.maturity_date <= NOW() AND EXTRACT(EPOCH FROM (NOW() - bm.maturity_date)) / 2629800.0 <= 12
        THEN COALESCE(c.mat_past_6_12, 3)
      ELSE 0  -- 12+ months past: fully decayed
    END
    + COALESCE(CASE WHEN bm.ltv >= 85 THEN c.ltv_85 WHEN bm.ltv >= 75 THEN c.ltv_75 WHEN bm.ltv >= 65 THEN c.ltv_65 ELSE 0 END, 0)
    + COALESCE(CASE WHEN bm.loan_term_years <= 2.5 THEN c.dur_25 WHEN bm.loan_term_years <= 4 THEN c.dur_4 ELSE 0 END, 0)
    + COALESCE(CASE WHEN bm.loan_purpose = 'Acquisition' THEN c.purp_acq WHEN bm.loan_purpose = 'Construction' THEN c.purp_const ELSE 0 END, 0)
    AS maturity_boost,

    -- ── MODEL 5: Distress Score — NOW WITH TEMPORAL DECAY ──
    (CASE
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
    END
    -- Apply temporal decay multiplier (only for non-active distress types;
    -- Auction/NOD/Matured are active proceedings that don't decay with age)
    * CASE
        WHEN bdist.distress_type IN ('Auction', 'NOD', 'Matured') THEN 1
        WHEN bdist.months_since_distress > 12 THEN 0
        WHEN bdist.months_since_distress > 6 THEN COALESCE(c.dist_decay_pct, 50) / 100.0
        ELSE 1
      END
    ) AS distress_score,

    -- Pass growth_rate for display
    bg.growth_pct AS growth_rate,

    -- Tier thresholds (pass through so outer SELECT doesn't need CROSS JOIN cfg)
    c.tier_a,
    c.tier_b,
    c.tier_c

  FROM properties p
  CROSS JOIN cfg c
  LEFT JOIN hold h ON h.property_id = p.property_id
  LEFT JOIN owner_age oa ON oa.property_id = p.property_id
  LEFT JOIN lease_months lm ON lm.property_id = p.property_id
  LEFT JOIN best_growth bg ON bg.property_id = p.property_id
  LEFT JOIN best_debt bd ON bd.property_id = p.property_id
  LEFT JOIN best_maturity bm ON bm.property_id = p.property_id
  LEFT JOIN best_distress bdist ON bdist.property_id = p.property_id
  LEFT JOIN owner_contact oc ON oc.property_id = p.property_id
  LEFT JOIN tenant_company tc ON tc.property_id = p.property_id
)
SELECT
  s.*,

  -- TPE Score (capped at 100)
  LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score
    + s.maturity_boost + s.distress_score, 100)
    AS tpe_score,

  -- ECV: best of sale or lease commission, time-adjusted, scaled
  ROUND(
    GREATEST(s.sale_commission_est, s.lease_commission_est)
    * s.time_multiplier
    / NULLIF(s.comm_divisor, 0),
    1
  ) AS ecv_score,

  -- Blended Priority
  ROUND(
    LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score
      + s.maturity_boost + s.distress_score, 100) * s.tpe_w
    + LEAST(
        GREATEST(s.sale_commission_est, s.lease_commission_est)
        * s.time_multiplier
        / NULLIF(s.comm_divisor, 0),
        100
      ) * s.ecv_w,
    1
  ) AS blended_priority,

  -- 4-tier classification
  CASE
    WHEN LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score + s.maturity_boost + s.distress_score, 100) * s.tpe_w
       + LEAST(GREATEST(s.sale_commission_est, s.lease_commission_est) * s.time_multiplier / NULLIF(s.comm_divisor, 0), 100) * s.ecv_w
       >= s.tier_a THEN 'A'
    WHEN LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score + s.maturity_boost + s.distress_score, 100) * s.tpe_w
       + LEAST(GREATEST(s.sale_commission_est, s.lease_commission_est) * s.time_multiplier / NULLIF(s.comm_divisor, 0), 100) * s.ecv_w
       >= s.tier_b THEN 'B'
    WHEN LEAST(s.lease_score + s.ownership_score + s.age_score + s.growth_score + s.stress_score + s.maturity_boost + s.distress_score, 100) * s.tpe_w
       + LEAST(GREATEST(s.sale_commission_est, s.lease_commission_est) * s.time_multiplier / NULLIF(s.comm_divisor, 0), 100) * s.ecv_w
       >= s.tier_c THEN 'C'
    ELSE 'D'
  END AS tpe_tier,

  -- ============================================================
  -- NEW: Owner call reason (waterfall within owner signals only)
  -- ============================================================
  CASE
    WHEN s.distress_score >= 20 THEN 'DISTRESS: ' || COALESCE(s.distress_type, 'Unknown') || ' — immediate outreach'
    WHEN s.maturity_boost >= 20 THEN 'LOAN MATURING: ' || TO_CHAR(s.maturity_date, 'Mon YYYY') || ' — refi/sell pressure'
    WHEN s.age_score >= 15 THEN 'OWNER AGE: Est. ' || COALESCE(s.owner_age_years::text, '?') || ' yrs — succession planning'
    WHEN s.ownership_score >= 15 THEN 'LONG HOLD: ' || COALESCE(ROUND(s.hold_years::numeric, 0)::text, '?') || ' years — equity harvesting'
    WHEN s.stress_score >= 5 THEN 'DEBT STRESS: Balloon or lien — motivated seller'
    -- Post-maturity decay signals (lower threshold)
    WHEN s.maturity_boost > 0 AND s.maturity_date IS NOT NULL AND s.maturity_date <= NOW()
      THEN 'MATURED LOAN: ' || TO_CHAR(s.maturity_date, 'Mon YYYY') || ' — verify refi status'
    ELSE NULL
  END AS owner_call_reason,

  -- Owner signal points (sum of owner-facing signals)
  (s.maturity_boost + s.distress_score + s.age_score + s.ownership_score + s.stress_score)
    AS owner_signal_pts,

  -- ============================================================
  -- NEW: Tenant call reason (waterfall within tenant signals only)
  -- ============================================================
  CASE
    WHEN s.lease_score >= 22 AND s.months_to_exp >= 0
      THEN 'LEASE EXPIRING: ' || TO_CHAR(s.lease_expiration, 'Mon YYYY') || ' — decision window'
    WHEN s.growth_score >= 10
      THEN 'TENANT GROWTH: ' || ROUND(s.growth_pct::numeric, 0) || '% growth — expansion need'
    WHEN s.lease_score > 0 AND s.months_to_exp IS NOT NULL AND s.months_to_exp < 0 AND s.months_to_exp >= -3
      THEN 'MONTH-TO-MONTH: Lease expired — renegotiation window'
    WHEN s.lease_score > 0 AND s.months_to_exp IS NOT NULL AND s.months_to_exp < -3
      THEN 'STALE LEASE: Expired ' || ABS(ROUND(s.months_to_exp::numeric, 0)) || ' months — update status'
    WHEN s.lease_score >= 15 AND s.months_to_exp > 0
      THEN 'LEASE EXPIRING: ' || TO_CHAR(s.lease_expiration, 'Mon YYYY') || ' — early planning'
    ELSE NULL
  END AS tenant_call_reason,

  -- Tenant signal points (sum of tenant-facing signals)
  (s.lease_score + s.growth_score)
    AS tenant_signal_pts,

  -- Backward-compatible call_reason (highest overall signal)
  CASE
    WHEN s.distress_score >= 20 THEN 'DISTRESS: ' || COALESCE(s.distress_type, 'Unknown') || ' — immediate outreach'
    WHEN s.maturity_boost >= 20 THEN 'LOAN MATURING: ' || TO_CHAR(s.maturity_date, 'Mon YYYY') || ' — refi/sell pressure'
    WHEN s.lease_score >= 22 THEN 'LEASE EXPIRING: ' || TO_CHAR(s.lease_expiration, 'Mon YYYY') || ' — tenant decision window'
    WHEN s.age_score >= 15 THEN 'OWNER AGE: Est. ' || COALESCE(s.owner_age_years::text, '?') || ' years — succession planning'
    WHEN s.ownership_score >= 15 THEN 'LONG HOLD: ' || COALESCE(ROUND(s.hold_years::numeric, 0)::text, '?') || ' years — equity harvesting'
    WHEN s.growth_score >= 10 THEN 'TENANT GROWTH: ' || COALESCE(ROUND(s.growth_pct::numeric, 0)::text, '?') || '% growth — expansion need'
    WHEN s.stress_score >= 5 THEN 'DEBT STRESS: Balloon or lien — motivated seller'
    WHEN s.lease_score > 0 AND s.months_to_exp < 0 THEN 'MONTH-TO-MONTH: Lease expired — renegotiation window'
    ELSE 'LOW PRIORITY: No strong transaction signals'
  END AS call_reason

FROM scores s;

COMMENT ON VIEW property_tpe_scores IS 'TPE Living Database — temporal decay, owner/tenant split call reasons, contact lookups. Dynamic weights from tpe_config.';

COMMIT;
