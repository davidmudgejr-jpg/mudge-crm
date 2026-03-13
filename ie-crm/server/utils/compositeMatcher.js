// Composite Matcher — tiered confidence matching for properties, companies, contacts
// Uses multiple data points (address + city + zip, company name + city, email + name)
// to produce confidence scores and auto-link or flag for review.

const { normalizeAddress, parseAddress, normalizeCompanyName, similarity } = require('./addressNormalizer');

// ============================================================
// PROPERTY MATCHING
// ============================================================

/**
 * Match a row against existing properties in the database.
 * Returns { match: { id, confidence, level }, candidates: [...] } or { match: null, candidates: [] }
 *
 * @param {object} row - Import row with address fields
 * @param {object[]} properties - All properties from DB (pre-loaded with normalized_address, city, zip)
 * @param {object} opts - { addressField, cityField, zipField }
 */
function matchProperty(row, properties, opts = {}) {
  const addressField = opts.addressField || 'property_address';
  const cityField = opts.cityField || 'city';
  const zipField = opts.zipField || 'zip';

  const rawAddress = row[addressField];
  if (!rawAddress) return { match: null, candidates: [], level: 'no_address' };

  const parsed = parseAddress(rawAddress);
  const normalized = parsed.normalized || normalizeAddress(rawAddress);
  if (!normalized) return { match: null, candidates: [], level: 'no_address' };

  // Use city/zip from dedicated columns if available, else from parsed address
  const rowCity = (row[cityField] || parsed.city || '').toLowerCase().trim();
  const rowZip = (row[zipField] || parsed.zip || '').trim();

  // Helper: get the normalized address for a property row, falling back to
  // normalizing property_address on the fly when the DB column is missing.
  const pNorm = (p) => p.normalized_address || normalizeAddress(p.property_address || '') || '';

  // Find all properties with matching normalized address
  const addressMatches = properties.filter(p => pNorm(p) === normalized);

  if (addressMatches.length === 0) {
    // Try fuzzy match
    const fuzzyMatches = properties
      .map(p => ({ ...p, sim: similarity(pNorm(p), normalized) }))
      .filter(p => p.sim >= 0.85)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);

    if (fuzzyMatches.length === 0) {
      return { match: null, candidates: [], level: 'no_match' };
    }

    // Check if fuzzy match also has city or zip match
    const confirmed = fuzzyMatches.filter(p => {
      const pCity = (p.city || '').toLowerCase().trim();
      const pZip = (p.zip || '').trim();
      return (rowCity && pCity === rowCity) || (rowZip && pZip === rowZip);
    });

    if (confirmed.length === 1) {
      return {
        match: { id: confirmed[0].property_id || confirmed[0].id, confidence: 75, level: 'fuzzy' },
        candidates: fuzzyMatches.map(formatPropertyCandidate),
      };
    }

    return {
      match: null,
      candidates: fuzzyMatches.map(formatPropertyCandidate),
      level: 'fuzzy_ambiguous',
    };
  }

  if (addressMatches.length === 1) {
    const p = addressMatches[0];
    const pCity = (p.city || '').toLowerCase().trim();
    const pZip = (p.zip || '').trim();

    // Exact: address + city + zip
    if (rowCity && rowZip && pCity === rowCity && pZip === rowZip) {
      return { match: { id: p.property_id || p.id, confidence: 100, level: 'exact' }, candidates: [] };
    }
    // Strong: address + city
    if (rowCity && pCity === rowCity) {
      return { match: { id: p.property_id || p.id, confidence: 95, level: 'strong_city' }, candidates: [] };
    }
    // Strong: address + zip
    if (rowZip && pZip === rowZip) {
      return { match: { id: p.property_id || p.id, confidence: 90, level: 'strong_zip' }, candidates: [] };
    }
    // Moderate: address only, unique
    return { match: { id: p.property_id || p.id, confidence: 85, level: 'moderate' }, candidates: [] };
  }

  // Multiple address matches — ambiguous, need city/zip to disambiguate
  const refined = addressMatches.filter(p => {
    const pCity = (p.city || '').toLowerCase().trim();
    const pZip = (p.zip || '').trim();
    if (rowCity && rowZip) return pCity === rowCity && pZip === rowZip;
    if (rowCity) return pCity === rowCity;
    if (rowZip) return pZip === rowZip;
    return false;
  });

  if (refined.length === 1) {
    return {
      match: { id: refined[0].property_id || refined[0].id, confidence: 95, level: 'disambiguated' },
      candidates: addressMatches.map(formatPropertyCandidate),
    };
  }

  return {
    match: null,
    candidates: addressMatches.map(formatPropertyCandidate),
    level: 'ambiguous',
  };
}

function formatPropertyCandidate(p) {
  return {
    id: p.property_id || p.id,
    address: p.property_address,
    city: p.city,
    zip: p.zip,
    normalized: p.normalized_address,
  };
}

// ============================================================
// COMPANY MATCHING
// ============================================================

/**
 * Match a company name against existing companies.
 * @param {string} rawName - Company name from import row
 * @param {object[]} companies - All companies from DB with company_name, city
 * @param {string} rowCity - Optional city from import row for disambiguation
 */
function matchCompany(rawName, companies, rowCity = null) {
  if (!rawName) return { match: null, candidates: [], level: 'no_name' };

  const normalized = normalizeCompanyName(rawName);
  if (!normalized) return { match: null, candidates: [], level: 'no_name' };

  const city = (rowCity || '').toLowerCase().trim();

  const matches = companies.filter(c => normalizeCompanyName(c.company_name) === normalized);

  if (matches.length === 0) {
    // Fuzzy match
    const fuzzy = companies
      .map(c => ({ ...c, sim: similarity(normalizeCompanyName(c.company_name), normalized) }))
      .filter(c => c.sim >= 0.80)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);

    if (fuzzy.length === 0) return { match: null, candidates: [], level: 'no_match' };

    return {
      match: null,
      candidates: fuzzy.map(formatCompanyCandidate),
      level: 'fuzzy',
    };
  }

  if (matches.length === 1) {
    const c = matches[0];
    const cCity = (c.city || '').toLowerCase().trim();
    if (city && cCity === city) {
      return { match: { id: c.company_id || c.id, confidence: 100, level: 'exact' }, candidates: [] };
    }
    return { match: { id: c.company_id || c.id, confidence: 90, level: 'strong' }, candidates: [] };
  }

  // Multiple matches — try city disambiguation
  if (city) {
    const refined = matches.filter(c => (c.city || '').toLowerCase().trim() === city);
    if (refined.length === 1) {
      return {
        match: { id: refined[0].company_id || refined[0].id, confidence: 95, level: 'disambiguated' },
        candidates: matches.map(formatCompanyCandidate),
      };
    }
  }

  return {
    match: null,
    candidates: matches.map(formatCompanyCandidate),
    level: 'ambiguous',
  };
}

function formatCompanyCandidate(c) {
  return {
    id: c.company_id || c.id,
    name: c.company_name,
    city: c.city,
  };
}

// ============================================================
// CONTACT MATCHING
// ============================================================

/**
 * Match a contact by email first, then by name + company.
 * @param {object} row - { email, full_name, company_name }
 * @param {object[]} contacts - All contacts from DB
 */
function matchContact(row, contacts) {
  const email = (row.email || '').toLowerCase().trim();
  const name = (row.full_name || '').toLowerCase().trim();

  if (!email && !name) return { match: null, candidates: [], level: 'no_data' };

  // Match by email first (most unique)
  if (email) {
    const emailMatches = contacts.filter(c =>
      (c.email || '').toLowerCase().trim() === email ||
      (c.email_2 || '').toLowerCase().trim() === email ||
      (c.email_3 || '').toLowerCase().trim() === email
    );
    if (emailMatches.length === 1) {
      return { match: { id: emailMatches[0].contact_id || emailMatches[0].id, confidence: 100, level: 'exact_email' }, candidates: [] };
    }
    if (emailMatches.length > 1) {
      return {
        match: null,
        candidates: emailMatches.map(formatContactCandidate),
        level: 'ambiguous_email',
      };
    }
  }

  // Fall back to name matching
  if (name) {
    const nameMatches = contacts.filter(c => (c.full_name || '').toLowerCase().trim() === name);
    if (nameMatches.length === 1) {
      return { match: { id: nameMatches[0].contact_id || nameMatches[0].id, confidence: 70, level: 'name_only' }, candidates: [] };
    }
    if (nameMatches.length > 1) {
      return {
        match: null,
        candidates: nameMatches.map(formatContactCandidate),
        level: 'ambiguous_name',
      };
    }

    // Fuzzy name match
    const fuzzy = contacts
      .map(c => ({ ...c, sim: similarity((c.full_name || '').toLowerCase(), name) }))
      .filter(c => c.sim >= 0.80)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 5);

    if (fuzzy.length > 0) {
      return {
        match: null,
        candidates: fuzzy.map(formatContactCandidate),
        level: 'fuzzy_name',
      };
    }
  }

  return { match: null, candidates: [], level: 'no_match' };
}

function formatContactCandidate(c) {
  return {
    id: c.contact_id || c.id,
    name: c.full_name,
    email: c.email,
    company: c.company_name || null,
  };
}

// ============================================================
// AUTO-DETECTION — identify which table a CSV belongs to
// ============================================================

const TABLE_SIGNATURES = {
  lease_comps: {
    strong: ['tenant_name', 'tenant', 'commencement_date', 'commencement', 'term_months', 'lease_term', 'contract_rent', 'rent_type', 'lease_type', 'escalations', 'concessions', 'tenant_rep'],
    moderate: ['rate', 'sf', 'square_feet', 'space_type', 'space_use', 'sign_date', 'expiration', 'rba', 'floor_suite'],
  },
  sale_comps: {
    strong: ['sale_price', 'sale_date', 'buyer', 'buyer_name', 'seller', 'seller_name', 'cap_rate', 'price_psf', 'price_plsf'],
    moderate: ['sf', 'land_sf', 'property_type'],
  },
  contacts: {
    strong: ['full_name', 'first_name', 'email', 'phone', 'phone_1', 'linkedin', 'title', 'born'],
    moderate: ['home_address', 'work_address', 'tags', 'follow_up', 'last_contacted'],
  },
  properties: {
    strong: ['property_address', 'address', 'rba', 'year_built', 'owner_name', 'zoning', 'building_class', 'parcel_number', 'costar_url'],
    moderate: ['city', 'state', 'zip', 'county', 'property_type', 'percent_leased', 'last_sale_price', 'land_sf', 'cap_rate'],
  },
  companies: {
    strong: ['company_name', 'company_type', 'industry_type', 'employees', 'revenue', 'company_growth', 'company_hq'],
    moderate: ['website', 'sf', 'lease_exp', 'tenant_sic', 'tenant_naics'],
  },
  deals: {
    strong: ['deal_name', 'deal_type', 'commission_rate', 'repping', 'deal_source', 'gross_fee_potential', 'net_potential', 'priority_deal'],
    moderate: ['close_date', 'term', 'rate', 'sf', 'price', 'status'],
  },
  loan_maturities: {
    strong: ['maturity_date', 'lender', 'loan_amount', 'ltv', 'loan_purpose', 'loan_duration_years', 'interest_rate'],
    moderate: [],
  },
  property_distress: {
    strong: ['distress_type', 'filing_date', 'trustee', 'lis_pendens', 'nod', 'auction', 'reo'],
    moderate: ['amount'],
  },
  tenant_growth: {
    strong: ['headcount_current', 'headcount_previous', 'growth_rate', 'revenue_current', 'revenue_previous'],
    moderate: ['data_date'],
  },
  action_items: {
    strong: ['responsibility', 'high_priority', 'due_date', 'date_completed', 'notes_on_date'],
    moderate: ['status', 'name', 'notes'],
  },
  campaigns: {
    strong: ['sent_date', 'day_time_hits', 'assignee'],
    moderate: ['name', 'type', 'status', 'notes'],
  },
  interactions: {
    strong: ['email_heading', 'email_body', 'follow_up_notes', 'lead_source', 'team_member', 'email_url', 'email_id'],
    moderate: ['type', 'subject', 'date', 'notes'],
  },
};

/**
 * Auto-detect which table a CSV belongs to based on column headers.
 * Returns [{ table, score, matchedColumns }] sorted by score descending.
 */
function detectTable(headers) {
  if (!headers || !headers.length) return [];

  const normalizedHeaders = headers.map(h =>
    h.toLowerCase().replace(/[_\-#.]/g, ' ').replace(/\s+/g, '_').trim()
  );
  // Also keep space-separated version
  const headerSet = new Set([
    ...normalizedHeaders,
    ...headers.map(h => h.toLowerCase().replace(/[_\-#.]/g, ' ').trim()),
    ...headers.map(h => h.toLowerCase().trim()),
  ]);

  const scores = [];

  for (const [table, sigs] of Object.entries(TABLE_SIGNATURES)) {
    let score = 0;
    const matched = [];

    for (const sig of sigs.strong) {
      if (headerSet.has(sig) || headerSet.has(sig.replace(/_/g, ' '))) {
        score += 3;
        matched.push(sig);
      }
    }
    for (const sig of sigs.moderate) {
      if (headerSet.has(sig) || headerSet.has(sig.replace(/_/g, ' '))) {
        score += 1;
        matched.push(sig);
      }
    }

    if (score > 0) {
      scores.push({ table, score, matchedColumns: matched, totalMatched: matched.length });
    }
  }

  return scores.sort((a, b) => b.score - a.score);
}

module.exports = {
  matchProperty,
  matchCompany,
  matchContact,
  detectTable,
  TABLE_SIGNATURES,
};
