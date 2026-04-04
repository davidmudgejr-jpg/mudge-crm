/**
 * Client-side deal formula computation.
 *
 * Mirrors the SQL VIEW `deal_formulas` (migration 047) exactly so that
 * computed commission fields can update live as the user types in the
 * Deals table — without waiting for a server round-trip.
 *
 * The formulas here MUST stay in sync with the PostgreSQL VIEW.
 */

// Fields that, when edited, should trigger a live recomputation
export const FORMULA_TRIGGER_FIELDS = new Set([
  'sf', 'rate', 'term', 'commission_rate', 'increases', 'price', 'deal_type',
]);

// Deal types that use the lease formula (rent-based)
const LEASE_TYPES = new Set(['Lease', 'Sub-Lease', 'Sublease', 'Renewal']);

// Deal types that use the sale formula (price-based)
const SALE_TYPES = new Set(['Sale', 'Purchase', 'Buy']);

/**
 * Compute deal commission fields from input values.
 *
 * @param {Object} deal — row object with at least: deal_type, sf, rate, term,
 *                         commission_rate, increases, price
 * @returns {{ team_gross_computed: number|null,
 *             jr_gross_computed: number|null,
 *             jr_net_computed: number|null }}
 */
export function computeDealFormulas(deal) {
  const NULL_RESULT = {
    team_gross_computed: null,
    jr_gross_computed: null,
    jr_net_computed: null,
  };

  if (!deal || !deal.deal_type) return NULL_RESULT;

  let teamGross = null;

  if (LEASE_TYPES.has(deal.deal_type)) {
    const sf = Number(deal.sf);
    const rate = Number(deal.rate);
    const term = Number(deal.term);
    const commRate = Number(deal.commission_rate);

    if (!(sf > 0 && rate > 0 && term > 0 && commRate > 0)) return NULL_RESULT;

    const increases = Number(deal.increases) || 0;

    if (increases === 0) {
      // No escalation — simple total rent
      teamGross = sf * rate * term * (commRate / 100);
    } else {
      // Geometric series with annual escalation
      const growthRate = increases / 100;
      const fullYears = Math.floor(term / 12);
      const stubMonths = term - fullYears * 12;

      // Sum of full years: SF * rate * 12 * (r^n - 1) / (r - 1)
      const fullYearTotal = sf * rate * 12
        * (Math.pow(1 + growthRate, fullYears) - 1)
        / growthRate;

      // Stub months at the final escalated rate
      const stubTotal = sf * rate
        * Math.pow(1 + growthRate, fullYears)
        * stubMonths;

      teamGross = (fullYearTotal + stubTotal) * (commRate / 100);
    }
  } else if (SALE_TYPES.has(deal.deal_type)) {
    const price = Number(deal.price);
    const commRate = Number(deal.commission_rate);

    if (!(price > 0 && commRate > 0)) return NULL_RESULT;

    teamGross = price * (commRate / 100);
  } else {
    return NULL_RESULT;
  }

  return {
    team_gross_computed: round2(teamGross),
    jr_gross_computed: round2(teamGross / 3),
    jr_net_computed: round2(teamGross / 3 * 0.75),
  };
}

/** Round to 2 decimal places (matching PostgreSQL ROUND behaviour) */
function round2(n) {
  if (n == null || isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}
