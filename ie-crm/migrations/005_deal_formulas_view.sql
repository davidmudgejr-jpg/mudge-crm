-- Migration 005: deal_formulas VIEW
-- Computes Team Gross, Jr Gross, Jr/Missy Net live from stored inputs.
-- SELECT from this view instead of deals table for list/detail queries.
-- Writes (INSERT/UPDATE) still go directly to deals table.
--
-- Formula for Lease Team Gross:
--   sf * commission_rate * total_rent_value
--   total_rent_value = sum of monthly rents over term with annual escalation
--   = rate * 12 * ((1+increases)^full_years - 1) / increases  [geometric series]
--     + rate * (1+increases)^full_years * remaining_months     [stub year]
--   If increases is NULL or 0: simplified to rate * term (no compounding)
--
-- Formula for Sale/Purchase Team Gross:
--   price * commission_rate
--
-- Splits (per HANDOFF.md):
--   jr_gross  = team_gross / 3
--   jr_net    = team_gross / 3 * 0.75  (Jr and Missy share)
--   dave_net  = TBD (placeholder same as jr_net for now)

CREATE OR REPLACE VIEW deal_formulas AS
WITH base AS (
  SELECT
    d.*,
    CASE
      -- Lease types: geometric rent escalation formula
      WHEN d.deal_type IN ('Lease', 'Sub-Lease', 'Renewal')
           AND d.sf > 0 AND d.rate > 0 AND d.term > 0 AND d.commission_rate > 0 THEN
        CASE
          WHEN d.increases IS NULL OR d.increases = 0 THEN
            -- No escalation: simple total
            d.sf::numeric * d.rate * d.term * d.commission_rate
          ELSE
            (
              -- Full years via geometric series
              d.sf::numeric * d.rate * 12.0
                * (POW(1.0 + d.increases, FLOOR(d.term / 12.0)::int) - 1.0)
                / NULLIF(d.increases, 0)
              -- Stub/remaining months at final escalated rate
              + d.sf::numeric * d.rate
                * POW(1.0 + d.increases, FLOOR(d.term / 12.0)::int)
                * (d.term - FLOOR(d.term / 12.0)::int * 12)
            ) * d.commission_rate
        END
      -- Sale / Purchase: flat commission on price
      WHEN d.deal_type IN ('Sale', 'Purchase')
           AND d.price > 0 AND d.commission_rate > 0 THEN
        d.price * d.commission_rate
      ELSE NULL
    END AS _team_gross
  FROM deals d
)
SELECT
  base.*,
  ROUND(_team_gross::numeric, 2)              AS team_gross_computed,
  ROUND((_team_gross / 3.0)::numeric, 2)      AS jr_gross_computed,
  ROUND((_team_gross / 3.0 * 0.75)::numeric, 2) AS jr_net_computed,
  ROUND((_team_gross / 3.0 * 0.75)::numeric, 2) AS missy_net_computed
FROM base;
