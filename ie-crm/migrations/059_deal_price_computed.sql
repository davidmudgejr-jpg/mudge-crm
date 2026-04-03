-- Migration 059: Add price_computed to deal_formulas VIEW
--
-- Price is now a COMPUTED field (not manually editable):
--   Buy/Sale/Investment: sf * rate  (total purchase price)
--   Lease/Sublease/Renewal (no escalation): sf * rate * term  (total rent)
--   Lease/Sublease/Renewal (with escalation): geometric series for total rent
--
-- Team Gross now derives from price_computed * commission_rate for ALL deal types,
-- ensuring price and gross commission stay in sync.

DROP VIEW IF EXISTS deal_formulas;
CREATE VIEW deal_formulas AS
WITH base AS (
  SELECT
    d.*,
    -- Compute total consideration / price from inputs
    CASE
      -- Sale / Purchase / Buy / Investment: price = sf * rate
      WHEN d.deal_type IN ('Sale', 'Purchase', 'Buy', 'Investment')
           AND d.sf > 0 AND d.rate > 0 THEN
        d.sf::numeric * d.rate

      -- Lease types: total rent over the term
      WHEN d.deal_type IN ('Lease', 'Sub-Lease', 'Sublease', 'Renewal')
           AND d.sf > 0 AND d.rate > 0 AND d.term > 0 THEN
        CASE
          WHEN d.increases IS NULL OR d.increases = 0 THEN
            -- No escalation: simple total rent
            d.sf::numeric * d.rate * d.term
          ELSE
            -- With escalation: geometric series for annual rent + stub months
            (
              d.sf::numeric * d.rate * 12.0
                * (POW(1.0 + d.increases / 100.0, FLOOR(d.term / 12.0)::int) - 1.0)
                / NULLIF(d.increases / 100.0, 0)
              + d.sf::numeric * d.rate
                * POW(1.0 + d.increases / 100.0, FLOOR(d.term / 12.0)::int)
                * (d.term - FLOOR(d.term / 12.0)::int * 12)
            )
        END

      ELSE NULL
    END AS _total_consideration
  FROM deals d
)
SELECT
  base.*,
  ROUND(_total_consideration::numeric, 2)                                    AS price_computed,
  ROUND((_total_consideration * NULLIF(base.commission_rate, 0) / 100.0)::numeric, 2) AS team_gross_computed,
  ROUND((_total_consideration * NULLIF(base.commission_rate, 0) / 300.0)::numeric, 2) AS jr_gross_computed,
  ROUND((_total_consideration * NULLIF(base.commission_rate, 0) / 300.0 * 0.75)::numeric, 2) AS jr_net_computed,
  ROUND((_total_consideration * NULLIF(base.commission_rate, 0) / 300.0 * 0.75)::numeric, 2) AS missy_net_computed
FROM base;
