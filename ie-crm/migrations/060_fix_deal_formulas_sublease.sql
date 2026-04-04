-- Fix deal_formulas VIEW to match normalized deal_type values from migration 055.
-- 'Sub-Lease' was normalized to 'Sublease' but the VIEW still checked for 'Sub-Lease'.

DROP VIEW IF EXISTS deal_formulas CASCADE;

CREATE OR REPLACE VIEW deal_formulas AS
WITH base AS (
  SELECT
    d.*,
    CASE
      WHEN d.deal_type IN ('Lease', 'Sublease', 'Sub-Lease', 'Renewal')
           AND d.sf > 0 AND d.rate > 0 AND d.term > 0 AND d.commission_rate > 0 THEN
        CASE
          WHEN d.increases IS NULL OR d.increases = 0 THEN
            d.sf::numeric * d.rate * d.term * (d.commission_rate / 100.0)
          ELSE
            (
              d.sf::numeric * d.rate * 12.0
                * (POW(1.0 + d.increases / 100.0, FLOOR(d.term / 12.0)::int) - 1.0)
                / NULLIF(d.increases / 100.0, 0)
              + d.sf::numeric * d.rate
                * POW(1.0 + d.increases / 100.0, FLOOR(d.term / 12.0)::int)
                * (d.term - FLOOR(d.term / 12.0)::int * 12)
            ) * (d.commission_rate / 100.0)
        END
      WHEN d.deal_type IN ('Sale', 'Purchase', 'Buy')
           AND d.price > 0 AND d.commission_rate > 0 THEN
        d.price * (d.commission_rate / 100.0)
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
