/**
 * Client-side deal formula computation.
 *
 * Mirrors the SQL VIEW `deal_formulas` (migration 059 + 060) exactly so that
 * computed commission fields can update live as the user types in the
 * Deals table — without waiting for a server round-trip.
 *
 * The formulas here MUST stay in sync with the PostgreSQL VIEW.
 *
 * Flow: inputs → _total_consideration (price) → team_gross → jr_gross → jr_net
 */

// Fields that, when edited, should trigger a live recomputation
export const FORMULA_TRIGGER_FIELDS = new Set([
  'sf', 'rate', 'term', 'commission_rate', 'increases', 'price', 'deal_type',
]);

// Deal types that use the lease formula (rent-based)
const LEASE_TYPES = new Set(['Lease', 'Sub-Lease', 'Sublease', 'Renewal']);

// Deal types that use the sale formula (price = sf × rate)
const SALE_TYPES = new Set(['Sale', 'Purchase', 'Buy', 'Investment']);

/**
 * Compute deal formula fields from input values.
 *
 * @param {Object} deal — row object with at least: deal_type, sf, rate, term,
 *                         commission_rate, increases
 * @returns {{ price_computed: number|null,
 *             team_gross_computed: number|null,
 *             jr_gross_computed: number|null,
 *             jr_net_computed: number|null }}
 */
export function computeDealFormulas(deal) {
  const NULL_RESULT = {
    price_computed: null,
    team_gross_computed: null,
    jr_gross_computed: null,
    jr_net_computed: null,
  };

  if (!deal || !deal.deal_type) return NULL_RESULT;

  const sf = Number(deal.sf);
  const rate = Number(deal.rate);
  const commRate = Number(deal.commission_rate) || 0;

  let totalConsideration = null;

  if (SALE_TYPES.has(deal.deal_type)) {
    // Sale / Purchase / Buy / Investment: price = sf × rate
    if (!(sf > 0 && rate > 0)) return NULL_RESULT;
    totalConsideration = sf * rate;

  } else if (LEASE_TYPES.has(deal.deal_type)) {
    // Lease types: total rent over the term
    const term = Number(deal.term);
    if (!(sf > 0 && rate > 0 && term > 0)) return NULL_RESULT;

    const increases = Number(deal.increases) || 0;

    if (increases === 0) {
      // No escalation — simple total rent
      totalConsideration = sf * rate * term;
    } else {
      // Geometric series with annual escalation
      const growthRate = increases / 100;
      const fullYears = Math.floor(term / 12);
      const stubMonths = term - fullYears * 12;

      // Sum of full years: SF × rate × 12 × (r^n - 1) / (r - 1)
      const fullYearTotal = sf * rate * 12
        * (Math.pow(1 + growthRate, fullYears) - 1)
        / growthRate;

      // Stub months at the final escalated rate
      const stubTotal = sf * rate
        * Math.pow(1 + growthRate, fullYears)
        * stubMonths;

      totalConsideration = fullYearTotal + stubTotal;
    }
  } else {
    return NULL_RESULT;
  }

  // Derive commission fields from total consideration
  // team_gross = totalConsideration × (commission_rate / 100)
  // jr_gross = totalConsideration × (commission_rate / 300) = team_gross / 3
  // jr_net = jr_gross × 0.75
  const teamGross = commRate > 0 ? totalConsideration * (commRate / 100) : null;
  const jrGross = commRate > 0 ? totalConsideration * (commRate / 300) : null;
  const jrNet = jrGross != null ? jrGross * 0.75 : null;

  return {
    price_computed: round2(totalConsideration),
    team_gross_computed: round2(teamGross),
    jr_gross_computed: round2(jrGross),
    jr_net_computed: round2(jrNet),
  };
}

/** Round to 2 decimal places (matching PostgreSQL ROUND behaviour) */
function round2(n) {
  if (n == null || isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}
