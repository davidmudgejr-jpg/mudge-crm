// Database API — all PostgreSQL operations go through IPC (Electron) or HTTP (browser)

import { db } from './bridge';

export async function query(sql, params = []) {
  return db.query(sql, params);
}

export async function getStatus() {
  return db.status();
}

// ============================================================
// SQL INJECTION PREVENTION — Column & table whitelists
// ============================================================
const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

const ALLOWED_COLS = {
  properties: new Set([
    'property_id', 'airtable_id', 'property_address', 'property_name', 'city', 'county', 'state', 'zip',
    'rba', 'land_area_ac', 'land_sf', 'far', 'property_type', 'building_class', 'building_status',
    'year_built', 'year_renovated', 'ceiling_ht', 'clear_ht', 'number_of_loading_docks', 'drive_ins',
    'column_spacing', 'sprinklers', 'power', 'construction_material', 'zoning', 'features',
    'last_sale_date', 'last_sale_price', 'price_psf', 'plsf', 'loan_amount', 'debt_date',
    'holding_period_years', 'listing_asking_lease_rate', 'cap_rate', 'vacancy_pct', 'percent_leased',
    'listing_status', 'listing_first_seen_date',
    'owner_name', 'owner_phone', 'owner_address', 'owner_city_state_zip',
    'recorded_owner_name', 'true_owner_name', 'contacted', 'priority', 'off_market_deal',
    'target', 'target_for', 'building_park', 'market_name', 'submarket_name', 'submarket_cluster',
    'tenancy', 'lease_type', 'notes', 'costar_url', 'num_properties_owned', 'data_confirmed',
    'tags', 'created_at', 'last_modified',
    // New columns (migration 001)
    'parking_ratio', 'owner_type', 'owner_contact', 'building_tax', 'building_opex',
    'leasing_company', 'broker_contact', 'for_sale_price', 'ops_expense_psf',
    'sewer', 'water', 'gas', 'heating',
    'total_available_sf', 'direct_available_sf', 'direct_vacant_space',
    'number_of_cranes', 'rail_lines', 'parcel_number', 'landvision_url',
    'sb_county_zoning', 'google_maps_url', 'zoning_map_url', 'listing_url',
    'avg_weighted_rent', 'building_image_path', 'latitude', 'longitude',
    'owner_user_or_investor', 'out_of_area_owner', 'office_courtesy',
    // migration 004
    'units', 'stories', 'parking_spaces', 'price_per_sqft', 'noi', 'owner_email', 'owner_mailing_address',
    // migration 006 — TPE-related columns
    'owner_call_status', 'tenant_call_status', 'has_lien_or_delinquency', 'costar_star_rating',
    // migration 046 — listing/market intelligence
    'listing_status', 'listing_first_seen_date',
  ]),
  contacts: new Set([
    'contact_id', 'airtable_id', 'full_name', 'first_name', 'type', 'title',
    'email_1', 'email_2', 'email_3', 'phone_1', 'phone_2', 'phone_3',
    'phone_hot', 'email_hot', 'email_kickback',
    'home_address', 'work_address', 'work_city', 'work_state', 'work_zip',
    'date_of_birth', 'age', 'client_level', 'active_need', 'notes', 'linkedin',
    'follow_up', 'last_contacted', 'data_source',
    'white_pages_url', 'been_verified_url', 'zoom_info_url',
    'property_type_interest', 'lease_months_left', 'tenant_space_fit',
    'tenant_ownership_intent', 'business_trajectory', 'last_call_outcome',
    'follow_up_behavior', 'decision_authority', 'price_cost_awareness',
    'frustration_signals', 'exit_trigger_events',
    'tags', 'created_at', 'modified',
  ]),
  companies: new Set([
    'company_id', 'airtable_id', 'company_name', 'company_type', 'industry_type',
    'website', 'sf', 'employees', 'revenue', 'company_growth', 'company_hq',
    'lease_exp', 'lease_months_left', 'move_in_date', 'notes', 'city',
    'tenant_sic', 'tenant_naics', 'suite',
    'tags', 'created_at', 'modified',
  ]),
  deals: new Set([
    'deal_id', 'airtable_id', 'deal_name', 'deal_type', 'deal_source', 'status',
    'repping', 'term', 'rate', 'sf', 'price', 'commission_rate',
    'gross_fee_potential', 'net_potential', 'close_date', 'important_date',
    'deal_dead_reason', 'notes', 'priority_deal',
    'increases', 'escrow_url', 'surveys_brochures_url', 'photo_url',
    'run_by', 'other_broker', 'industry', 'deadline', 'fell_through_reason',
    'created_at', 'modified', 'lead_count',
    'team_gross_computed', 'jr_gross_computed', 'jr_net_computed', 'missy_net_computed',
  ]),
  interactions: new Set([
    'interaction_id', 'airtable_id', 'type', 'subject', 'date',
    'notes', 'email_heading', 'email_body',
    'follow_up', 'follow_up_notes', 'lead_source', 'lead_status', 'lead_interest', 'team_member',
    'email_url', 'email_id',
    'created_at',
  ]),
  campaigns: new Set([
    'campaign_id', 'airtable_id', 'name', 'type', 'status', 'notes', 'sent_date',
    'assignee', 'day_time_hits',
    'created_at', 'modified',
  ]),
  action_items: new Set([
    'action_item_id', 'name', 'notes', 'notes_on_date', 'responsibility',
    'high_priority', 'status', 'due_date', 'date_completed', 'source',
    'created_at', 'updated_at',
  ]),
  lease_comps: new Set([
    'id', 'property_id', 'company_id', 'tenant_name', 'property_type',
    'space_use', 'space_type', 'sf', 'building_rba', 'floor_suite',
    'sign_date', 'commencement_date', 'move_in_date', 'expiration_date', 'term_months',
    'rate', 'escalations', 'rent_type', 'lease_type', 'concessions',
    'free_rent_months', 'ti_psf',
    'tenant_rep_company', 'tenant_rep_agents', 'landlord_rep_company', 'landlord_rep_agents',
    'cam_expenses', 'zoning', 'doors_with_lease',
    'notes', 'source', 'created_at', 'updated_at',
  ]),
  sale_comps: new Set([
    'id', 'property_id', 'sale_date', 'sale_price', 'price_psf', 'price_plsf',
    'cap_rate', 'sf', 'land_sf', 'buyer_name', 'seller_name', 'property_type',
    'notes', 'source', 'created_at', 'updated_at',
  ]),
  loan_maturities: new Set([
    'id', 'property_id', 'lender', 'loan_amount', 'maturity_date', 'ltv',
    'loan_purpose', 'loan_duration_years', 'interest_rate',
    'notes', 'source', 'created_at', 'updated_at',
  ]),
  property_distress: new Set([
    'id', 'property_id', 'distress_type', 'filing_date', 'amount', 'trustee',
    'notes', 'source', 'created_at', 'updated_at',
  ]),
  tenant_growth: new Set([
    'id', 'company_id', 'headcount_current', 'headcount_previous', 'growth_rate',
    'revenue_current', 'revenue_previous', 'data_date',
    'source', 'created_at', 'updated_at',
  ]),
};

const ALLOWED_JUNCTION_TABLES = new Set([
  'property_contacts', 'property_companies', 'contact_companies',
  'deal_properties', 'deal_contacts', 'deal_companies',
  'interaction_contacts', 'interaction_properties', 'interaction_deals', 'interaction_companies',
  'campaign_contacts',
  'deal_campaigns',
  'action_item_contacts', 'action_item_properties', 'action_item_deals', 'action_item_companies',
]);

const ALLOWED_JUNCTION_COLS = new Set([
  'property_id', 'contact_id', 'company_id', 'deal_id', 'interaction_id', 'campaign_id',
  'action_item_id', 'role',
]);

function sanitizeCol(col, table, fallback) {
  if (ALLOWED_COLS[table]?.has(col)) return col;
  return fallback;
}

function sanitizeDir(dir) {
  const baseDir = dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return `${baseDir} NULLS LAST`;
}

function validateFieldKeys(keys, table) {
  const allowed = ALLOWED_COLS[table];
  if (!allowed) throw new Error(`Unknown table: ${table}`);
  for (const k of keys) {
    if (!allowed.has(k)) throw new Error(`Disallowed column "${k}" for table "${table}"`);
  }
}

function validateJunction(table, cols) {
  if (!ALLOWED_JUNCTION_TABLES.has(table)) throw new Error(`Disallowed junction table: ${table}`);
  for (const c of cols) {
    if (!ALLOWED_JUNCTION_COLS.has(c)) throw new Error(`Disallowed junction column: ${c}`);
  }
}

// ============================================================
// FUZZY SEARCH (pg_trgm) — shared across all entity search
// ============================================================

// Text columns searchable per entity (no IDs, dates, or numerics)
const SEARCH_COLUMNS = {
  contacts: [
    'full_name', 'first_name', 'email_1', 'email_2', 'email_3',
    'phone_1', 'phone_2', 'phone_3', 'type', 'title',
    'home_address', 'work_address', 'work_city', 'work_state', 'work_zip',
    'client_level', 'active_need', 'notes', 'linkedin', 'data_source',
    'property_type_interest',
  ],
  contacts_arrays: ['tags'],

  properties: [
    'property_address', 'property_name', 'city', 'county', 'state', 'zip',
    'property_type', 'building_class', 'building_status',
    'owner_name', 'owner_phone', 'owner_address', 'owner_city_state_zip', 'owner_email',
    'leasing_company', 'broker_contact', 'building_park', 'market_name', 'submarket_name',
    'zoning', 'features', 'notes', 'parcel_number',
  ],
  properties_arrays: ['tags'],

  companies: [
    'company_name', 'company_type', 'industry_type', 'website', 'city',
    'company_hq', 'company_growth', 'notes', 'tenant_sic', 'tenant_naics', 'suite',
  ],
  companies_arrays: ['tags'],

  deals: [
    'deal_name', 'deal_type', 'status', 'notes',
    'other_broker', 'industry', 'fell_through_reason',
  ],
  deals_arrays: ['run_by', 'repping', 'deal_source', 'tags'],

  campaigns: ['name', 'type', 'status', 'notes', 'assignee'],
  campaigns_arrays: [],

  lease_comps: [
    'tenant_name', 'property_type', 'space_use', 'space_type', 'floor_suite',
    'rent_type', 'lease_type', 'escalations', 'concessions', 'notes', 'source',
    'tenant_rep_company', 'tenant_rep_agents', 'landlord_rep_company', 'landlord_rep_agents', 'zoning',
  ],
  lease_comps_arrays: [],

  sale_comps: ['buyer_name', 'seller_name', 'property_type', 'notes', 'source'],
  sale_comps_arrays: [],
};

/**
 * Build a SQL concat_ws expression for all searchable text columns
 * @param {string} table - entity table name
 * @param {string} [alias] - optional table alias prefix (e.g. 'c' → 'c.full_name')
 */
function getSearchExpr(table, alias) {
  const prefix = alias ? `${alias}.` : '';
  const textCols = SEARCH_COLUMNS[table] || [];
  const arrayCols = SEARCH_COLUMNS[`${table}_arrays`] || [];
  const parts = [
    ...textCols.map(c => `${prefix}${c}`),
    ...arrayCols.map(c => `array_to_string(${prefix}${c}, ' ')`),
  ];
  return `concat_ws(' ', ${parts.join(', ')})`;
}

/**
 * Build fuzzy search WHERE condition + relevance score expression.
 * Uses dual ILIKE (exact substring) + word_similarity (typo tolerance).
 *
 * word_similarity() compares the search term against individual words/substrings
 * in the target text, so short search terms like "Jon" work well even against
 * long concatenated text (unlike similarity() which dilutes short terms).
 *
 * @param {string} table - entity table name
 * @param {string} searchTerm - user's search input
 * @param {number} paramIndex - next $N index for query params
 * @param {string} [alias] - optional table alias
 * @returns {{ condition: string, scoreExpr: string, params: string[], nextParamIndex: number }}
 */
export function buildFuzzySearch(table, searchTerm, paramIndex, alias) {
  const searchExpr = getSearchExpr(table, alias);
  // ILIKE catches exact substrings; word_similarity catches typos against individual words
  const condition = `(${searchExpr} ILIKE $${paramIndex} OR word_similarity($${paramIndex + 1}, ${searchExpr}) > 0.3)`;
  const scoreExpr = `word_similarity($${paramIndex + 1}, ${searchExpr})`;
  return {
    condition,
    scoreExpr,
    params: [`%${searchTerm}%`, searchTerm],
    nextParamIndex: paramIndex + 2,
  };
}

// ============================================================
// GENERIC FILTERED QUERY (for View Engine)
// ============================================================
const VALID_VIEW_TABLES = new Set([
  'properties', 'contacts', 'companies', 'deals', 'interactions', 'campaigns',
  'lease_comps', 'sale_comps', 'action_items',
]);

// Map entity tables to their computed VIEWs (for formula columns)
const TABLE_VIEW_MAP = { deals: 'deal_formulas', campaigns: 'campaigns_with_counts' };

export async function queryWithFilters(table, { whereClause = '', params = [], orderBy, order, limit = 200, offset = 0 } = {}) {
  if (!VALID_VIEW_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
  const queryTable = TABLE_VIEW_MAP[table] || table;
  const safeOrder = sanitizeCol(orderBy, table, 'created_at');
  const safeDir = sanitizeDir(order);
  const n = params.length;
  const sql = `SELECT * FROM ${queryTable} ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${n + 1} OFFSET $${n + 2}`;
  return query(sql, [...params, limit, offset]);
}

export async function countWithFilters(table, { whereClause = '', params = [] } = {}) {
  if (!VALID_VIEW_TABLES.has(table)) throw new Error(`Invalid table: ${table}`);
  const queryTable = TABLE_VIEW_MAP[table] || table;
  const sql = `SELECT COUNT(*) AS total FROM ${queryTable} ${whereClause}`;
  const result = await query(sql, params);
  return parseInt(result.rows?.[0]?.total || '0', 10);
}

// ============================================================
// PROPERTIES
// ============================================================
export async function getProperties({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.city) { where.push(`city ILIKE $${i++}`); params.push(`%${filters.city}%`); }
  if (filters.property_type) { where.push(`property_type = $${i++}`); params.push(filters.property_type); }
  if (filters.priority) { where.push(`priority = $${i++}`); params.push(filters.priority); }
  if (filters.contacted) { where.push(`$${i++} = ANY(contacted)`); params.push(filters.contacted); }
  let searchScore = null;
  if (filters.search) {
    const fuzzy = buildFuzzySearch('properties', filters.search, i);
    where.push(fuzzy.condition);
    params.push(...fuzzy.params);
    searchScore = fuzzy.scoreExpr;
    i = fuzzy.nextParamIndex;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'properties', 'created_at');
  const safeDir = sanitizeDir(order);
  const orderClause = searchScore
    ? `${searchScore} DESC, ${safeOrder} ${safeDir}`
    : `${safeOrder} ${safeDir}`;
  const sql = `SELECT * FROM properties ${whereClause} ORDER BY ${orderClause} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getProperty(id) {
  return query('SELECT * FROM properties WHERE property_id = $1', [id]);
}

export async function updateProperty(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'properties');
  return db.update('properties', id, fields);
}

export async function getPropertyContacts(propertyId) {
  return query(`
    SELECT c.*, pc.role FROM contacts c
    JOIN property_contacts pc ON c.contact_id = pc.contact_id
    WHERE pc.property_id = $1
    ORDER BY c.full_name
  `, [propertyId]);
}

export async function getPropertyCompanies(propertyId) {
  return query(`
    SELECT co.*, pc.role FROM companies co
    JOIN property_companies pc ON co.company_id = pc.company_id
    WHERE pc.property_id = $1
    ORDER BY co.company_name
  `, [propertyId]);
}

export async function getPropertyDeals(propertyId) {
  return query(`
    SELECT d.* FROM deals d
    JOIN deal_properties dp ON d.deal_id = dp.deal_id
    WHERE dp.property_id = $1
    ORDER BY d.created_at DESC
  `, [propertyId]);
}

export async function getPropertyInteractions(propertyId) {
  return query(`
    SELECT i.* FROM interactions i
    JOIN interaction_properties ip ON i.interaction_id = ip.interaction_id
    WHERE ip.property_id = $1
    ORDER BY i.date DESC
  `, [propertyId]);
}

// ============================================================
// CONTACTS
// ============================================================
export async function getContacts({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.type) { where.push(`type = $${i++}`); params.push(filters.type); }
  let searchScore = null;
  if (filters.search) {
    const fuzzy = buildFuzzySearch('contacts', filters.search, i, 'c');
    where.push(fuzzy.condition);
    params.push(...fuzzy.params);
    searchScore = fuzzy.scoreExpr;
    i = fuzzy.nextParamIndex;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'contacts', 'created_at');
  const safeDir = sanitizeDir(order);
  const orderClause = searchScore
    ? `${searchScore} DESC, ${safeOrder} ${safeDir}`
    : `${safeOrder} ${safeDir}`;
  const sql = `SELECT c.*,
    (SELECT MAX(intr.date) FROM interaction_contacts ic JOIN interactions intr ON intr.interaction_id = ic.interaction_id WHERE ic.contact_id = c.contact_id) AS last_contacted
  FROM contacts c ${whereClause} ORDER BY ${orderClause} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getContact(id) {
  return query('SELECT * FROM contacts WHERE contact_id = $1', [id]);
}

export async function updateContact(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'contacts');
  return db.update('contacts', id, fields);
}

// ============================================================
// COMPANIES
// ============================================================
export async function getCompanies({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  let searchScore = null;
  if (filters.search) {
    const fuzzy = buildFuzzySearch('companies', filters.search, i, 'co');
    where.push(fuzzy.condition);
    params.push(...fuzzy.params);
    searchScore = fuzzy.scoreExpr;
    i = fuzzy.nextParamIndex;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'companies', 'created_at');
  const safeDir = sanitizeDir(order);
  const orderClause = searchScore
    ? `${searchScore} DESC, ${safeOrder} ${safeDir}`
    : `${safeOrder} ${safeDir}`;
  const sql = `SELECT co.*,
    (SELECT MAX(intr.date) FROM interaction_companies ico JOIN interactions intr ON intr.interaction_id = ico.interaction_id WHERE ico.company_id = co.company_id) AS last_contacted
  FROM companies co ${whereClause} ORDER BY ${orderClause} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getCompany(id) {
  return query('SELECT * FROM companies WHERE company_id = $1', [id]);
}

export async function updateCompany(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'companies');
  return db.update('companies', id, fields);
}

// ============================================================
// DEALS
// ============================================================
export async function getDeals({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.status) { where.push(`status = $${i++}`); params.push(filters.status); }
  let searchScore = null;
  if (filters.search) {
    const fuzzy = buildFuzzySearch('deals', filters.search, i, 'df');
    where.push(fuzzy.condition);
    params.push(...fuzzy.params);
    searchScore = fuzzy.scoreExpr;
    i = fuzzy.nextParamIndex;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'deals', 'created_at');
  const safeDir = sanitizeDir(order);
  const orderClause = searchScore
    ? `${searchScore} DESC, ${safeOrder} ${safeDir}`
    : `${safeOrder} ${safeDir}`;
  const sql = `SELECT df.*, (SELECT COUNT(*) FROM interaction_deals id2 JOIN interactions i2 ON i2.interaction_id = id2.interaction_id WHERE id2.deal_id = df.deal_id AND i2.type = 'Lead') AS lead_count FROM deal_formulas df ${whereClause} ORDER BY ${orderClause} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getDeal(id) {
  return query('SELECT * FROM deals WHERE deal_id = $1', [id]);
}

export async function updateDeal(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'deals');
  return db.update('deals', id, fields);
}

// ============================================================
// INTERACTIONS
// ============================================================
export async function getInteractions({ limit = 200, offset = 0, orderBy = 'date', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.type) { where.push(`type = $${i++}`); params.push(filters.type); }
  if (filters.search) {
    where.push(`(notes ILIKE $${i} OR email_heading ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'interactions', 'date');
  const safeDir = sanitizeDir(order);
  const sql = `SELECT i.*,
    (SELECT string_agg(c.full_name, ', ') FROM interaction_contacts ic JOIN contacts c ON c.contact_id = ic.contact_id WHERE ic.interaction_id = i.interaction_id) AS linked_contact_names,
    (SELECT string_agg(p.property_address, ', ') FROM interaction_properties ip JOIN properties p ON p.property_id = ip.property_id WHERE ip.interaction_id = i.interaction_id) AS linked_property_names,
    (SELECT string_agg(d.deal_name, ', ') FROM interaction_deals id2 JOIN deals d ON d.deal_id = id2.deal_id WHERE id2.interaction_id = i.interaction_id) AS linked_deal_names,
    (SELECT string_agg(co.company_name, ', ') FROM interaction_companies ico JOIN companies co ON co.company_id = ico.company_id WHERE ico.interaction_id = i.interaction_id) AS linked_company_names
  FROM interactions i ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

// ============================================================
// INTERACTION — single record + reverse lookups
// ============================================================
export async function getInteraction(id) {
  return query('SELECT * FROM interactions WHERE interaction_id = $1', [id]);
}

export async function updateInteraction(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'interactions');
  return db.update('interactions', id, fields);
}

export async function getInteractionContacts(interactionId) {
  return query(`
    SELECT c.* FROM contacts c
    JOIN interaction_contacts ic ON c.contact_id = ic.contact_id
    WHERE ic.interaction_id = $1
    ORDER BY c.full_name
  `, [interactionId]);
}

export async function getInteractionProperties(interactionId) {
  return query(`
    SELECT p.* FROM properties p
    JOIN interaction_properties ip ON p.property_id = ip.property_id
    WHERE ip.interaction_id = $1
    ORDER BY p.property_address
  `, [interactionId]);
}

export async function getInteractionDeals(interactionId) {
  return query(`
    SELECT d.* FROM deals d
    JOIN interaction_deals id ON d.deal_id = id.deal_id
    WHERE id.interaction_id = $1
    ORDER BY d.deal_name
  `, [interactionId]);
}

// ============================================================
// REVERSE RELATIONSHIP QUERIES
// ============================================================
export async function getContactProperties(contactId) {
  return query(`
    SELECT p.*, pc.role FROM properties p
    JOIN property_contacts pc ON p.property_id = pc.property_id
    WHERE pc.contact_id = $1
    ORDER BY p.property_address
  `, [contactId]);
}

export async function getContactCompanies(contactId) {
  return query(`
    SELECT co.* FROM companies co
    JOIN contact_companies cc ON co.company_id = cc.company_id
    WHERE cc.contact_id = $1
    ORDER BY co.company_name
  `, [contactId]);
}

export async function getContactDeals(contactId) {
  return query(`
    SELECT d.* FROM deals d
    JOIN deal_contacts dc ON d.deal_id = dc.deal_id
    WHERE dc.contact_id = $1
    ORDER BY d.created_at DESC
  `, [contactId]);
}

export async function getContactInteractions(contactId) {
  return query(`
    SELECT i.* FROM interactions i
    JOIN interaction_contacts ic ON i.interaction_id = ic.interaction_id
    WHERE ic.contact_id = $1
    ORDER BY i.date DESC
  `, [contactId]);
}

export async function getCompanyInteractions(companyId) {
  return query(`
    SELECT i.* FROM interactions i
    JOIN interaction_companies ic ON i.interaction_id = ic.interaction_id
    WHERE ic.company_id = $1
    ORDER BY i.date DESC
  `, [companyId]);
}

export async function getDealInteractions(dealId) {
  return query(`
    SELECT i.*, c.contact_id AS linked_contact_id, c.full_name AS linked_contact_name
    FROM interactions i
    JOIN interaction_deals id ON i.interaction_id = id.interaction_id
    LEFT JOIN interaction_contacts ic ON ic.interaction_id = i.interaction_id
    LEFT JOIN contacts c ON c.contact_id = ic.contact_id
    WHERE id.deal_id = $1
    ORDER BY i.date DESC
  `, [dealId]);
}

export async function getDealLeads(dealId) {
  return query(`
    SELECT i.interaction_id, i.type, i.subject, i.notes, i.date,
           i.lead_source, i.lead_status, i.lead_interest,
           c.contact_id, c.full_name AS contact_name
    FROM interactions i
    JOIN interaction_deals id ON id.interaction_id = i.interaction_id
    LEFT JOIN interaction_contacts ic ON ic.interaction_id = i.interaction_id
    LEFT JOIN contacts c ON c.contact_id = ic.contact_id
    WHERE id.deal_id = $1 AND i.type = 'Lead'
    ORDER BY i.date DESC, i.created_at DESC
  `, [dealId]);
}

export async function getCompanyContacts(companyId) {
  return query(`
    SELECT c.* FROM contacts c
    JOIN contact_companies cc ON c.contact_id = cc.contact_id
    WHERE cc.company_id = $1
    ORDER BY c.full_name
  `, [companyId]);
}

export async function getCompanyProperties(companyId) {
  return query(`
    SELECT p.*, pc.role FROM properties p
    JOIN property_companies pc ON p.property_id = pc.property_id
    WHERE pc.company_id = $1
    ORDER BY p.property_address
  `, [companyId]);
}

export async function getCompanyDeals(companyId) {
  return query(`
    SELECT d.* FROM deals d
    JOIN deal_companies dc ON d.deal_id = dc.deal_id
    WHERE dc.company_id = $1
    ORDER BY d.created_at DESC
  `, [companyId]);
}

export async function getDealProperties(dealId) {
  return query(`
    SELECT p.* FROM properties p
    JOIN deal_properties dp ON p.property_id = dp.property_id
    WHERE dp.deal_id = $1
    ORDER BY p.property_address
  `, [dealId]);
}

export async function getDealContacts(dealId) {
  return query(`
    SELECT c.* FROM contacts c
    JOIN deal_contacts dc ON c.contact_id = dc.contact_id
    WHERE dc.deal_id = $1
    ORDER BY c.full_name
  `, [dealId]);
}

export async function getDealCampaigns(dealId) {
  return query(`
    SELECT ca.* FROM campaigns ca
    JOIN deal_campaigns dc ON ca.campaign_id = dc.campaign_id
    WHERE dc.deal_id = $1
    ORDER BY ca.sent_date DESC NULLS LAST, ca.name
  `, [dealId]);
}

export async function getDealCompanies(dealId) {
  return query(`
    SELECT co.* FROM companies co
    JOIN deal_companies dc ON co.company_id = dc.company_id
    WHERE dc.deal_id = $1
    ORDER BY co.company_name
  `, [dealId]);
}

// ============================================================
// GENERIC LINK / UNLINK
// ============================================================
export async function linkRecords(junctionTable, col1, id1, col2, id2, extras = {}) {
  const cols = [col1, col2];
  const vals = [id1, id2];
  const extraKeys = Object.keys(extras);
  extraKeys.forEach((k) => { cols.push(k); vals.push(extras[k]); });
  validateJunction(junctionTable, cols);
  const placeholders = vals.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO ${junctionTable} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING RETURNING *`;
  console.log('[linkRecords]', { junctionTable, cols, vals, sql });
  const result = await query(sql, vals);
  console.log('[linkRecords] result:', JSON.stringify(result));
  return result;
}

export async function unlinkRecords(junctionTable, col1, id1, col2, id2) {
  validateJunction(junctionTable, [col1, col2]);
  const sql = `DELETE FROM ${junctionTable} WHERE ${col1} = $1 AND ${col2} = $2 RETURNING *`;
  return query(sql, [id1, id2]);
}

// ============================================================
// CREATE FUNCTIONS
// ============================================================
// Contacts, properties, companies route through /api/db/create for duplicate detection.
// skipDuplicateCheck defaults to false — caller can pass true to force create.
export async function createProperty(fields, skipDuplicateCheck = false) {
  return db.create('properties', fields, skipDuplicateCheck);
}

export async function createContact(fields, skipDuplicateCheck = false) {
  return db.create('contacts', fields, skipDuplicateCheck);
}

export async function createCompany(fields, skipDuplicateCheck = false) {
  return db.create('companies', fields, skipDuplicateCheck);
}

export async function createDeal(fields, skipDuplicateCheck = false) {
  return db.create('deals', fields, skipDuplicateCheck);
}

export async function createInteraction(fields, skipDuplicateCheck = false) {
  return db.create('interactions', fields, skipDuplicateCheck);
}

export async function createCampaign(fields, skipDuplicateCheck = false) {
  return db.create('campaigns', fields, skipDuplicateCheck);
}

// ============================================================
// SEARCH FUNCTIONS (for link picker typeahead)
// ============================================================
export async function searchContacts(term) {
  const searchExpr = getSearchExpr('contacts');
  const result = await query(
    `SELECT contact_id, full_name, email_1, phone_1, type,
            word_similarity($2, ${searchExpr}) AS relevance
     FROM contacts
     WHERE ${searchExpr} ILIKE $1 OR word_similarity($2, ${searchExpr}) > 0.3
     ORDER BY relevance DESC LIMIT 20`,
    [`%${term}%`, term]
  );
  return result.rows;
}

export async function searchCompanies(term) {
  const searchExpr = getSearchExpr('companies');
  const result = await query(
    `SELECT company_id, company_name, city,
            word_similarity($2, ${searchExpr}) AS relevance
     FROM companies
     WHERE ${searchExpr} ILIKE $1 OR word_similarity($2, ${searchExpr}) > 0.3
     ORDER BY relevance DESC LIMIT 20`,
    [`%${term}%`, term]
  );
  return result.rows;
}

export async function searchProperties(term) {
  const searchExpr = getSearchExpr('properties');
  const result = await query(
    `SELECT property_id, property_address, property_name, city,
            word_similarity($2, ${searchExpr}) AS relevance
     FROM properties
     WHERE ${searchExpr} ILIKE $1 OR word_similarity($2, ${searchExpr}) > 0.3
     ORDER BY relevance DESC LIMIT 20`,
    [`%${term}%`, term]
  );
  return result.rows;
}

export async function searchDeals(term) {
  const searchExpr = getSearchExpr('deals');
  const result = await query(
    `SELECT deal_id, deal_name, deal_type, status,
            word_similarity($2, ${searchExpr}) AS relevance
     FROM deals
     WHERE ${searchExpr} ILIKE $1 OR word_similarity($2, ${searchExpr}) > 0.3
     ORDER BY relevance DESC LIMIT 20`,
    [`%${term}%`, term]
  );
  return result.rows;
}

export async function searchCampaigns(term) {
  const searchExpr = getSearchExpr('campaigns');
  const result = await query(
    `SELECT campaign_id, name, type, status,
            word_similarity($2, ${searchExpr}) AS relevance
     FROM campaigns
     WHERE ${searchExpr} ILIKE $1 OR word_similarity($2, ${searchExpr}) > 0.3
     ORDER BY relevance DESC LIMIT 20`,
    [`%${term}%`, term]
  );
  return result.rows;
}

export async function getContactCampaigns(contactId) {
  return query(
    `SELECT ca.campaign_id, ca.name, ca.type, ca.status, ca.sent_date
     FROM campaigns ca
     JOIN campaign_contacts cc ON ca.campaign_id = cc.campaign_id
     WHERE cc.contact_id = $1
     ORDER BY ca.name`,
    [contactId]
  );
}

export async function getCampaignContacts(campaignId) {
  return query(
    `SELECT c.contact_id, c.full_name, c.type, c.phone_1, c.email_1
     FROM contacts c
     JOIN campaign_contacts cc ON c.contact_id = cc.contact_id
     WHERE cc.campaign_id = $1
     ORDER BY c.full_name`,
    [campaignId]
  );
}

// ============================================================
// CAMPAIGNS
// ============================================================
export async function getCampaigns({ limit = 200, offset = 0, orderBy = 'modified', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;
  let searchScore = null;

  if (filters.type) { where.push(`c.type = $${i++}`); params.push(filters.type); }
  if (filters.status) { where.push(`c.status = $${i++}`); params.push(filters.status); }
  if (filters.search) {
    const fuzzy = buildFuzzySearch('campaigns', filters.search, i, 'c');
    where.push(fuzzy.condition);
    params.push(...fuzzy.params);
    searchScore = fuzzy.scoreExpr;
    i = fuzzy.nextParamIndex;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'campaigns', 'modified');
  const safeDir = sanitizeDir(order);
  const orderClause = searchScore
    ? `${searchScore} DESC, c.${safeOrder} ${safeDir}`
    : `c.${safeOrder} ${safeDir}`;
  const sql = `SELECT c.*, COUNT(cc.contact_id)::int AS contact_count
     FROM campaigns c
     LEFT JOIN campaign_contacts cc ON c.campaign_id = cc.campaign_id
     ${whereClause}
     GROUP BY c.campaign_id
     ORDER BY ${orderClause}
     LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);
  return query(sql, params);
}

export async function getCampaign(id) {
  return query('SELECT * FROM campaigns WHERE campaign_id = $1', [id]);
}

export async function updateCampaign(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'campaigns');
  return db.update('campaigns', id, fields);
}

// ============================================================
// ACTION ITEMS
// ============================================================
export async function getActionItems({ limit = 200, offset = 0, orderBy = 'due_date', order = 'ASC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.status) { where.push(`status = $${i++}`); params.push(filters.status); }
  if (filters.responsibility) { where.push(`$${i++} = ANY(responsibility)`); params.push(filters.responsibility); }
  if (filters.source) { where.push(`source = $${i++}`); params.push(filters.source); }
  if (filters.high_priority) { where.push(`high_priority = TRUE`); }
  if (filters.search) {
    where.push(`(name ILIKE $${i} OR notes ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'action_items', 'due_date');
  const safeDir = sanitizeDir(order);
  const sql = `SELECT * FROM action_items ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getActionItem(id) {
  return query('SELECT * FROM action_items WHERE action_item_id = $1', [id]);
}

export async function createActionItem(fields, skipDuplicateCheck = false) {
  return db.create('action_items', fields, skipDuplicateCheck);
}

export async function updateActionItem(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'action_items');
  return db.update('action_items', id, fields);
}

export async function deleteActionItem(id) {
  return query('DELETE FROM action_items WHERE action_item_id = $1 RETURNING *', [id]);
}

export async function deleteProperty(id) {
  return query('DELETE FROM properties WHERE property_id = $1 RETURNING *', [id]);
}
export async function deleteContact(id) {
  return query('DELETE FROM contacts WHERE contact_id = $1 RETURNING *', [id]);
}
export async function deleteCompany(id) {
  return query('DELETE FROM companies WHERE company_id = $1 RETURNING *', [id]);
}
export async function deleteDeal(id) {
  return query('DELETE FROM deals WHERE deal_id = $1 RETURNING *', [id]);
}
export async function deleteCampaign(id) {
  return query('DELETE FROM campaigns WHERE campaign_id = $1 RETURNING *', [id]);
}
export async function deleteInteraction(id) {
  return query('DELETE FROM interactions WHERE interaction_id = $1 RETURNING *', [id]);
}

// Action item linked record queries
export async function getActionItemContacts(actionItemId) {
  return query(`
    SELECT c.* FROM contacts c
    JOIN action_item_contacts ac ON c.contact_id = ac.contact_id
    WHERE ac.action_item_id = $1
    ORDER BY c.full_name
  `, [actionItemId]);
}

export async function getActionItemProperties(actionItemId) {
  return query(`
    SELECT p.* FROM properties p
    JOIN action_item_properties ap ON p.property_id = ap.property_id
    WHERE ap.action_item_id = $1
    ORDER BY p.property_address
  `, [actionItemId]);
}

export async function getActionItemDeals(actionItemId) {
  return query(`
    SELECT d.* FROM deals d
    JOIN action_item_deals ad ON d.deal_id = ad.deal_id
    WHERE ad.action_item_id = $1
    ORDER BY d.deal_name
  `, [actionItemId]);
}

export async function getDealActionItems(dealId) {
  return query(`
    SELECT a.* FROM action_items a
    JOIN action_item_deals ad ON a.action_item_id = ad.action_item_id
    WHERE ad.deal_id = $1
    ORDER BY a.due_date ASC NULLS LAST
  `, [dealId]);
}

export async function getActionItemCompanies(actionItemId) {
  return query(`
    SELECT co.* FROM companies co
    JOIN action_item_companies ac ON co.company_id = ac.company_id
    WHERE ac.action_item_id = $1
    ORDER BY co.company_name
  `, [actionItemId]);
}

// ============================================================
// LEASE COMPS
// ============================================================
export async function getLeaseComps({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.property_type) { where.push(`property_type = $${i++}`); params.push(filters.property_type); }
  if (filters.rent_type) { where.push(`rent_type = $${i++}`); params.push(filters.rent_type); }
  if (filters.source) { where.push(`source = $${i++}`); params.push(filters.source); }
  let searchScore = null;
  if (filters.search) {
    const fuzzy = buildFuzzySearch('lease_comps', filters.search, i, 'lc');
    where.push(fuzzy.condition);
    params.push(...fuzzy.params);
    searchScore = fuzzy.scoreExpr;
    i = fuzzy.nextParamIndex;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'lease_comps', 'created_at');
  const safeDir = sanitizeDir(order);
  const orderClause = searchScore
    ? `${searchScore} DESC, lc.${safeOrder} ${safeDir}`
    : `lc.${safeOrder} ${safeDir}`;
  const sql = `SELECT lc.*, p.property_address AS linked_property_address, co.company_name AS linked_company_name
    FROM lease_comps lc
    LEFT JOIN properties p ON lc.property_id = p.property_id
    LEFT JOIN companies co ON lc.company_id = co.company_id
    ${whereClause} ORDER BY ${orderClause} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getLeaseComp(id) {
  return query(`SELECT lc.*, p.property_address AS linked_property_address, co.company_name AS linked_company_name
    FROM lease_comps lc
    LEFT JOIN properties p ON lc.property_id = p.property_id
    LEFT JOIN companies co ON lc.company_id = co.company_id
    WHERE lc.id = $1`, [id]);
}

export async function createLeaseComp(fields, skipDuplicateCheck = false) {
  return db.create('lease_comps', fields, skipDuplicateCheck);
}

export async function updateLeaseComp(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'lease_comps');
  return db.update('lease_comps', id, fields);
}

export async function deleteLeaseComp(id) {
  return query('DELETE FROM lease_comps WHERE id = $1 RETURNING *', [id]);
}

// ============================================================
// SALE COMPS
// ============================================================
export async function getSaleComps({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.property_type) { where.push(`property_type = $${i++}`); params.push(filters.property_type); }
  if (filters.source) { where.push(`source = $${i++}`); params.push(filters.source); }
  let searchScore = null;
  if (filters.search) {
    const fuzzy = buildFuzzySearch('sale_comps', filters.search, i, 'sc');
    where.push(fuzzy.condition);
    params.push(...fuzzy.params);
    searchScore = fuzzy.scoreExpr;
    i = fuzzy.nextParamIndex;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'sale_comps', 'created_at');
  const safeDir = sanitizeDir(order);
  const orderClause = searchScore
    ? `${searchScore} DESC, sc.${safeOrder} ${safeDir}`
    : `sc.${safeOrder} ${safeDir}`;
  const sql = `SELECT sc.*, p.property_address AS linked_property_address,
      p.ceiling_ht AS bldg_clear_height, p.power AS bldg_power,
      p.drive_ins AS bldg_gl_doors, p.number_of_loading_docks AS bldg_dock_doors
    FROM sale_comps sc
    LEFT JOIN properties p ON sc.property_id = p.property_id
    ${whereClause} ORDER BY ${orderClause} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getSaleComp(id) {
  return query(`SELECT sc.*, p.property_address AS linked_property_address,
      p.ceiling_ht AS bldg_clear_height, p.power AS bldg_power,
      p.drive_ins AS bldg_gl_doors, p.number_of_loading_docks AS bldg_dock_doors
    FROM sale_comps sc
    LEFT JOIN properties p ON sc.property_id = p.property_id
    WHERE sc.id = $1`, [id]);
}

export async function createSaleComp(fields, skipDuplicateCheck = false) {
  return db.create('sale_comps', fields, skipDuplicateCheck);
}

export async function updateSaleComp(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'sale_comps');
  return db.update('sale_comps', id, fields);
}

export async function deleteSaleComp(id) {
  return query('DELETE FROM sale_comps WHERE id = $1 RETURNING *', [id]);
}

// Property ↔ Comps lookups (for property detail view)
export async function batchGetPropertyCompCounts(propertyIds) {
  if (!propertyIds.length) return {};
  const r = await query(`
    SELECT p.property_id,
      COALESCE(lc.cnt, 0)::int AS lease_count,
      COALESCE(sc.cnt, 0)::int AS sale_count
    FROM unnest($1::uuid[]) AS p(property_id)
    LEFT JOIN (SELECT property_id, COUNT(*) AS cnt FROM lease_comps WHERE property_id = ANY($1) GROUP BY property_id) lc ON lc.property_id = p.property_id
    LEFT JOIN (SELECT property_id, COUNT(*) AS cnt FROM sale_comps WHERE property_id = ANY($1) GROUP BY property_id) sc ON sc.property_id = p.property_id
    WHERE COALESCE(lc.cnt, 0) + COALESCE(sc.cnt, 0) > 0
  `, [propertyIds]);
  const result = {};
  for (const row of r.rows) {
    result[row.property_id] = [row];
  }
  return result;
}

export async function getPropertyLeaseComps(propertyId) {
  return query('SELECT * FROM lease_comps WHERE property_id = $1 ORDER BY commencement_date DESC', [propertyId]);
}

export async function getPropertySaleComps(propertyId) {
  return query('SELECT * FROM sale_comps WHERE property_id = $1 ORDER BY sale_date DESC', [propertyId]);
}

export async function getCompanyLeaseComps(companyId) {
  return query(`SELECT lc.*, p.property_address FROM lease_comps lc LEFT JOIN properties p ON lc.property_id = p.property_id WHERE lc.company_id = $1 ORDER BY lc.commencement_date DESC`, [companyId]);
}

// ============================================================
// FORMULA COLUMNS
// ============================================================
export async function getFormulaColumns(tableName) {
  return query('SELECT * FROM formula_columns WHERE table_name = $1 ORDER BY created_at', [tableName]);
}

export async function createFormulaColumn(tableName, columnName, displayName, expression, columnType = 'text') {
  return query(
    `INSERT INTO formula_columns (table_name, column_name, display_name, expression, column_type)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tableName, columnName, displayName, expression, columnType]
  );
}

// ============================================================
// UNDO LOG
// ============================================================
export async function logUndo(description, sqlExecuted, reverseSql, rowsAffected) {
  return query(
    `INSERT INTO undo_log (action_description, sql_executed, reverse_sql, rows_affected)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [description, sqlExecuted, reverseSql, rowsAffected]
  );
}

export async function executeUndo(undoId) {
  const result = await query('SELECT * FROM undo_log WHERE undo_id = $1 AND undone = FALSE', [undoId]);
  if (!result.rows.length) throw new Error('Nothing to undo');
  const undo = result.rows[0];
  await query(undo.reverse_sql);
  await query('UPDATE undo_log SET undone = TRUE WHERE undo_id = $1', [undoId]);
  return undo;
}

export async function getLastUndo() {
  return query('SELECT * FROM undo_log WHERE undone = FALSE ORDER BY executed_at DESC LIMIT 1');
}

// ============================================================
// BATCH LINKED RECORD FETCHING (for table column view)
// ============================================================

function groupBy(rows, key) {
  const grouped = {};
  for (const row of rows) {
    (grouped[row[key]] ||= []).push(row);
  }
  return grouped;
}

// -- Property linked records --
export async function batchGetPropertyContacts(propertyIds) {
  if (!propertyIds.length) return {};
  const r = await query(`
    SELECT c.contact_id, c.full_name, c.type, pc.property_id, pc.role
    FROM contacts c JOIN property_contacts pc ON c.contact_id = pc.contact_id
    WHERE pc.property_id = ANY($1) ORDER BY c.full_name
  `, [propertyIds]);
  return groupBy(r.rows, 'property_id');
}

export async function batchGetPropertyCompanies(propertyIds) {
  if (!propertyIds.length) return {};
  const r = await query(`
    SELECT co.company_id, co.company_name, co.company_type, pc.property_id, pc.role
    FROM companies co JOIN property_companies pc ON co.company_id = pc.company_id
    WHERE pc.property_id = ANY($1) ORDER BY co.company_name
  `, [propertyIds]);
  return groupBy(r.rows, 'property_id');
}

export async function batchGetPropertyDeals(propertyIds) {
  if (!propertyIds.length) return {};
  const r = await query(`
    SELECT d.deal_id, d.deal_name, d.status, dp.property_id
    FROM deals d JOIN deal_properties dp ON d.deal_id = dp.deal_id
    WHERE dp.property_id = ANY($1) ORDER BY d.deal_name
  `, [propertyIds]);
  return groupBy(r.rows, 'property_id');
}

// -- Contact linked records --
export async function batchGetContactProperties(contactIds) {
  if (!contactIds.length) return {};
  const r = await query(`
    SELECT p.property_id, p.property_address, p.property_type, pc.contact_id
    FROM properties p JOIN property_contacts pc ON p.property_id = pc.property_id
    WHERE pc.contact_id = ANY($1) ORDER BY p.property_address
  `, [contactIds]);
  return groupBy(r.rows, 'contact_id');
}

export async function batchGetContactCompanies(contactIds) {
  if (!contactIds.length) return {};
  const r = await query(`
    SELECT co.company_id, co.company_name, co.company_type, cc.contact_id
    FROM companies co JOIN contact_companies cc ON co.company_id = cc.company_id
    WHERE cc.contact_id = ANY($1) ORDER BY co.company_name
  `, [contactIds]);
  return groupBy(r.rows, 'contact_id');
}

export async function batchGetContactDeals(contactIds) {
  if (!contactIds.length) return {};
  const r = await query(`
    SELECT d.deal_id, d.deal_name, d.status, dc.contact_id
    FROM deals d JOIN deal_contacts dc ON d.deal_id = dc.deal_id
    WHERE dc.contact_id = ANY($1) ORDER BY d.deal_name
  `, [contactIds]);
  return groupBy(r.rows, 'contact_id');
}

export async function batchGetContactCampaigns(contactIds) {
  if (!contactIds.length) return {};
  const r = await query(`
    SELECT ca.campaign_id, ca.name AS campaign_name, cc.contact_id
    FROM campaigns ca JOIN campaign_contacts cc ON ca.campaign_id = cc.campaign_id
    WHERE cc.contact_id = ANY($1) ORDER BY ca.name
  `, [contactIds]);
  return groupBy(r.rows, 'contact_id');
}

// -- Company linked records --
export async function batchGetCompanyContacts(companyIds) {
  if (!companyIds.length) return {};
  const r = await query(`
    SELECT c.contact_id, c.full_name, c.type, cc.company_id
    FROM contacts c JOIN contact_companies cc ON c.contact_id = cc.contact_id
    WHERE cc.company_id = ANY($1) ORDER BY c.full_name
  `, [companyIds]);
  return groupBy(r.rows, 'company_id');
}

export async function batchGetCompanyProperties(companyIds) {
  if (!companyIds.length) return {};
  const r = await query(`
    SELECT p.property_id, p.property_address, p.property_type, pc.company_id
    FROM properties p JOIN property_companies pc ON p.property_id = pc.property_id
    WHERE pc.company_id = ANY($1) ORDER BY p.property_address
  `, [companyIds]);
  return groupBy(r.rows, 'company_id');
}

export async function batchGetCompanyDeals(companyIds) {
  if (!companyIds.length) return {};
  const r = await query(`
    SELECT d.deal_id, d.deal_name, d.status, dc.company_id
    FROM deals d JOIN deal_companies dc ON d.deal_id = dc.deal_id
    WHERE dc.company_id = ANY($1) ORDER BY d.deal_name
  `, [companyIds]);
  return groupBy(r.rows, 'company_id');
}

// -- Deal linked records --
export async function batchGetDealProperties(dealIds) {
  if (!dealIds.length) return {};
  const r = await query(`
    SELECT p.property_id, p.property_address, p.property_type, dp.deal_id
    FROM properties p JOIN deal_properties dp ON p.property_id = dp.property_id
    WHERE dp.deal_id = ANY($1) ORDER BY p.property_address
  `, [dealIds]);
  return groupBy(r.rows, 'deal_id');
}

export async function batchGetDealContacts(dealIds) {
  if (!dealIds.length) return {};
  const r = await query(`
    SELECT c.contact_id, c.full_name, c.type, dc.deal_id
    FROM contacts c JOIN deal_contacts dc ON c.contact_id = dc.contact_id
    WHERE dc.deal_id = ANY($1) ORDER BY c.full_name
  `, [dealIds]);
  return groupBy(r.rows, 'deal_id');
}

export async function batchGetDealCompanies(dealIds) {
  if (!dealIds.length) return {};
  const r = await query(`
    SELECT co.company_id, co.company_name, co.company_type, dc.deal_id
    FROM companies co JOIN deal_companies dc ON co.company_id = dc.company_id
    WHERE dc.deal_id = ANY($1) ORDER BY co.company_name
  `, [dealIds]);
  return groupBy(r.rows, 'deal_id');
}

export async function batchGetDealCampaigns(dealIds) {
  if (!dealIds.length) return {};
  const r = await query(`
    SELECT ca.campaign_id, ca.name AS campaign_name, ca.status, ca.sent_date, dc.deal_id
    FROM campaigns ca JOIN deal_campaigns dc ON ca.campaign_id = dc.campaign_id
    WHERE dc.deal_id = ANY($1) ORDER BY ca.sent_date DESC NULLS LAST, ca.name
  `, [dealIds]);
  return groupBy(r.rows, 'deal_id');
}

// -- Interaction linked records (batch) --
export async function batchGetContactInteractions(contactIds) {
  if (!contactIds.length) return {};
  const r = await query(`
    SELECT ranked.* FROM (
      SELECT i.interaction_id, i.type, i.subject, i.date, i.notes, i.email_heading,
             ic.contact_id,
             ROW_NUMBER() OVER (PARTITION BY ic.contact_id ORDER BY i.date DESC NULLS LAST) AS rn
      FROM interactions i
      JOIN interaction_contacts ic ON i.interaction_id = ic.interaction_id
      WHERE ic.contact_id = ANY($1)
    ) ranked WHERE rn <= 5
    ORDER BY ranked.contact_id, ranked.date DESC NULLS LAST
  `, [contactIds]);
  return groupBy(r.rows, 'contact_id');
}

export async function batchGetPropertyInteractions(propertyIds) {
  if (!propertyIds.length) return {};
  const r = await query(`
    SELECT ranked.* FROM (
      SELECT i.interaction_id, i.type, i.subject, i.date, i.notes, i.email_heading,
             ip.property_id,
             ROW_NUMBER() OVER (PARTITION BY ip.property_id ORDER BY i.date DESC NULLS LAST) AS rn
      FROM interactions i
      JOIN interaction_properties ip ON i.interaction_id = ip.interaction_id
      WHERE ip.property_id = ANY($1)
    ) ranked WHERE rn <= 5
    ORDER BY ranked.property_id, ranked.date DESC NULLS LAST
  `, [propertyIds]);
  return groupBy(r.rows, 'property_id');
}

export async function batchGetCompanyInteractions(companyIds) {
  if (!companyIds.length) return {};
  const r = await query(`
    SELECT ranked.* FROM (
      SELECT i.interaction_id, i.type, i.subject, i.date, i.notes, i.email_heading,
             ic.company_id,
             ROW_NUMBER() OVER (PARTITION BY ic.company_id ORDER BY i.date DESC NULLS LAST) AS rn
      FROM interactions i
      JOIN interaction_companies ic ON i.interaction_id = ic.interaction_id
      WHERE ic.company_id = ANY($1)
    ) ranked WHERE rn <= 5
    ORDER BY ranked.company_id, ranked.date DESC NULLS LAST
  `, [companyIds]);
  return groupBy(r.rows, 'company_id');
}

export async function batchGetDealInteractions(dealIds) {
  if (!dealIds.length) return {};
  const r = await query(`
    SELECT ranked.* FROM (
      SELECT i.interaction_id, i.type, i.subject, i.date, i.notes, i.email_heading,
             id.deal_id,
             ROW_NUMBER() OVER (PARTITION BY id.deal_id ORDER BY i.date DESC NULLS LAST) AS rn
      FROM interactions i
      JOIN interaction_deals id ON i.interaction_id = id.interaction_id
      WHERE id.deal_id = ANY($1)
    ) ranked WHERE rn <= 5
    ORDER BY ranked.deal_id, ranked.date DESC NULLS LAST
  `, [dealIds]);
  return groupBy(r.rows, 'deal_id');
}

export async function getDealAggregatedInteractions(dealId) {
  return query(`
    SELECT DISTINCT ON (i.interaction_id) i.*, 'deal' AS source_type, NULL AS source_name
    FROM interactions i
    JOIN interaction_deals id ON i.interaction_id = id.interaction_id
    WHERE id.deal_id = $1

    UNION ALL

    SELECT DISTINCT ON (i.interaction_id) i.*, 'contact' AS source_type, c.full_name AS source_name
    FROM interactions i
    JOIN interaction_contacts ic ON i.interaction_id = ic.interaction_id
    JOIN contacts c ON ic.contact_id = c.contact_id
    JOIN deal_contacts dc ON ic.contact_id = dc.contact_id
    WHERE dc.deal_id = $1
    AND i.interaction_id NOT IN (
      SELECT id2.interaction_id FROM interaction_deals id2 WHERE id2.deal_id = $1
    )

    UNION ALL

    SELECT DISTINCT ON (i.interaction_id) i.*, 'property' AS source_type, p.property_address AS source_name
    FROM interactions i
    JOIN interaction_properties ip ON i.interaction_id = ip.interaction_id
    JOIN properties p ON ip.property_id = p.property_id
    JOIN deal_properties dp ON ip.property_id = dp.property_id
    WHERE dp.deal_id = $1
    AND i.interaction_id NOT IN (
      SELECT id2.interaction_id FROM interaction_deals id2 WHERE id2.deal_id = $1
    )
    AND i.interaction_id NOT IN (
      SELECT ic2.interaction_id FROM interaction_contacts ic2
      JOIN deal_contacts dc2 ON ic2.contact_id = dc2.contact_id
      WHERE dc2.deal_id = $1
    )

    ORDER BY date DESC NULLS LAST
  `, [dealId]);
}

// -- Action Item linked records (batch) --
export async function batchGetActionItemContacts(actionItemIds) {
  if (!actionItemIds.length) return {};
  const r = await query(`
    SELECT c.contact_id, c.full_name, c.type, ac.action_item_id
    FROM contacts c JOIN action_item_contacts ac ON c.contact_id = ac.contact_id
    WHERE ac.action_item_id = ANY($1) ORDER BY c.full_name
  `, [actionItemIds]);
  return groupBy(r.rows, 'action_item_id');
}

export async function batchGetActionItemProperties(actionItemIds) {
  if (!actionItemIds.length) return {};
  const r = await query(`
    SELECT p.property_id, p.property_address, p.property_type, ap.action_item_id
    FROM properties p JOIN action_item_properties ap ON p.property_id = ap.property_id
    WHERE ap.action_item_id = ANY($1) ORDER BY p.property_address
  `, [actionItemIds]);
  return groupBy(r.rows, 'action_item_id');
}

export async function batchGetActionItemDeals(actionItemIds) {
  if (!actionItemIds.length) return {};
  const r = await query(`
    SELECT d.deal_id, d.deal_name, d.status, ad.action_item_id
    FROM deals d JOIN action_item_deals ad ON d.deal_id = ad.deal_id
    WHERE ad.action_item_id = ANY($1) ORDER BY d.deal_name
  `, [actionItemIds]);
  return groupBy(r.rows, 'action_item_id');
}

export async function batchGetActionItemCompanies(actionItemIds) {
  if (!actionItemIds.length) return {};
  const r = await query(`
    SELECT co.company_id, co.company_name, co.company_type, ac.action_item_id
    FROM companies co JOIN action_item_companies ac ON co.company_id = ac.company_id
    WHERE ac.action_item_id = ANY($1) ORDER BY co.company_name
  `, [actionItemIds]);
  return groupBy(r.rows, 'action_item_id');
}

// ============================================================
// TABLE COUNTS
// ============================================================
const ALLOWED_COUNT_TABLES = new Set(['properties', 'contacts', 'companies', 'deals', 'interactions', 'campaigns', 'action_items', 'lease_comps', 'sale_comps']);

export async function getTableCounts() {
  const tables = ['properties', 'contacts', 'companies', 'deals', 'interactions', 'campaigns', 'action_items', 'lease_comps', 'sale_comps'];
  const results = {};
  for (const t of tables) {
    if (!ALLOWED_COUNT_TABLES.has(t)) throw new Error(`Disallowed table: ${t}`);
    const r = await query(`SELECT COUNT(*) as count FROM ${t}`);
    results[t] = parseInt(r.rows[0].count, 10);
  }
  return results;
}
