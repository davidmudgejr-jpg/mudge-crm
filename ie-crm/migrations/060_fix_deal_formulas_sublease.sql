-- Fix deal_formulas VIEW to include 'Sublease' matching (from migration 055 normalization)
-- AND preserve the price_computed column from migration 059.
--
-- This supersedes migration 059's VIEW definition with the Sublease fix.

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

      -- Lease types: total rent over the term (handles both 'Sub-Lease' and 'Sublease')
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
