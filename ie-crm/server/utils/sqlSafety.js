/**
 * SQL Safety — Server-side column/table validation for parameterized queries.
 *
 * Mirrors the ALLOWED_COLS whitelist from src/api/database.js but for the
 * Express backend. All dynamic column/table names MUST be validated through
 * these helpers before interpolation into SQL.
 *
 * Created: 2026-03-30 — Houston security audit response (C1, C4, C5, H8)
 */

'use strict';

// Only allow identifiers matching Postgres naming rules
const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

// ── Column whitelists per table (synced from src/api/database.js) ──────────

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
    'parking_ratio', 'owner_type', 'owner_contact', 'building_tax', 'building_opex',
    'leasing_company', 'broker_contact', 'for_sale_price', 'ops_expense_psf',
    'sewer', 'water', 'gas', 'heating',
    'total_available_sf', 'direct_available_sf', 'direct_vacant_space',
    'number_of_cranes', 'rail_lines', 'parcel_number', 'landvision_url',
    'sb_county_zoning', 'google_maps_url', 'zoning_map_url', 'listing_url',
    'avg_weighted_rent', 'building_image_path', 'latitude', 'longitude',
    'owner_user_or_investor', 'out_of_area_owner', 'office_courtesy',
    'units', 'stories', 'parking_spaces', 'price_per_sqft', 'noi', 'owner_email', 'owner_mailing_address',
    'owner_call_status', 'tenant_call_status', 'has_lien_or_delinquency', 'costar_star_rating',
    'normalized_address', 'data_quality_flag', 'updated_at',
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
    'tags', 'created_at', 'modified', 'updated_at',
    'campaign_ready', 'opted_out', 'enrichment_started',
  ]),
  companies: new Set([
    'company_id', 'airtable_id', 'company_name', 'company_type', 'industry_type',
    'website', 'sf', 'employees', 'revenue', 'company_growth', 'company_hq',
    'lease_exp', 'lease_months_left', 'move_in_date', 'notes', 'city',
    'tenant_sic', 'tenant_naics', 'suite',
    'tags', 'created_at', 'modified', 'updated_at',
    'data_quality_flag',
  ]),
  deals: new Set([
    'deal_id', 'airtable_id', 'deal_name', 'deal_type', 'deal_source', 'status',
    'repping', 'term', 'rate', 'sf', 'price', 'commission_rate',
    'gross_fee_potential', 'net_potential', 'close_date', 'important_date',
    'deal_dead_reason', 'notes', 'priority_deal',
    'increases', 'escrow_url', 'surveys_brochures_url',
    'run_by', 'other_broker', 'industry', 'deadline', 'fell_through_reason',
    'created_at', 'modified', 'updated_at', 'lead_count',
  ]),
  interactions: new Set([
    'interaction_id', 'airtable_id', 'type', 'subject', 'date',
    'notes', 'email_heading', 'email_body',
    'follow_up', 'follow_up_notes', 'lead_source', 'lead_status', 'lead_interest', 'team_member',
    'email_url', 'email_id',
    'created_at', 'updated_at',
  ]),
  campaigns: new Set([
    'campaign_id', 'airtable_id', 'name', 'type', 'status', 'notes', 'sent_date',
    'assignee', 'day_time_hits',
    'created_at', 'modified', 'updated_at',
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
    'city', 'property_address',
  ]),
  sale_comps: new Set([
    'id', 'property_id', 'sale_date', 'sale_price', 'price_psf', 'price_plsf',
    'cap_rate', 'sf', 'land_sf', 'buyer_name', 'seller_name', 'property_type',
    'notes', 'source', 'created_at', 'updated_at',
    'city', 'property_address',
  ]),
  knowledge_nodes: new Set([
    'id', 'file_path', 'slug', 'type', 'title', 'aliases', 'crm_id',
    'last_verified', 'stale_after', 'status', 'visibility', 'source_context',
    'tags', 'frontmatter', 'content', 'summary', 'links_to',
    'merge_requested_at', 'merge_target_slug', 'merged_at',
    'created_at', 'updated_at',
  ]),
  knowledge_edges: new Set([
    'id', 'from_slug', 'to_slug', 'context', 'created_at',
  ]),
};

// ── Table → primary key mapping ────────────────────────────────────────────

const TABLE_ID_MAP = {
  properties: 'property_id',
  contacts: 'contact_id',
  companies: 'company_id',
  deals: 'deal_id',
  interactions: 'interaction_id',
  campaigns: 'campaign_id',
  action_items: 'action_item_id',
  lease_comps: 'id',
  sale_comps: 'id',
  knowledge_nodes: 'id',
  knowledge_edges: 'id',
};

// Entity type aliases (agents use "contact" not "contacts")
const ENTITY_TYPE_TO_TABLE = {
  contact: 'contacts',
  contacts: 'contacts',
  property: 'properties',
  properties: 'properties',
  company: 'companies',
  companies: 'companies',
  deal: 'deals',
  deals: 'deals',
  interaction: 'interactions',
  interactions: 'interactions',
  campaign: 'campaigns',
  campaigns: 'campaigns',
};

// ── Validation functions ───────────────────────────────────────────────────

/**
 * Validate a column name against the whitelist for a given table.
 * @throws {Error} if column is not in the whitelist
 */
function validateColumn(col, table) {
  // Resolve entity type aliases
  const resolvedTable = ENTITY_TYPE_TO_TABLE[table] || table;
  const allowed = ALLOWED_COLS[resolvedTable];
  if (!allowed) {
    throw new Error(`[sqlSafety] Unknown table: "${table}"`);
  }
  if (!allowed.has(col)) {
    throw new Error(`[sqlSafety] Disallowed column "${col}" for table "${resolvedTable}"`);
  }
  return col;
}

/**
 * Validate a table name and return { table, idCol }.
 * @throws {Error} if table is not in the whitelist
 */
function validateTable(table) {
  const resolvedTable = ENTITY_TYPE_TO_TABLE[table] || table;
  const idCol = TABLE_ID_MAP[resolvedTable];
  if (!idCol) {
    throw new Error(`[sqlSafety] Unknown table: "${table}"`);
  }
  return { table: resolvedTable, idCol };
}

/**
 * Double-quote a validated identifier for safe SQL interpolation.
 * MUST call validateColumn() or validateTable() first.
 * Extra safety: also checks the identifier regex.
 */
function quoteIdentifier(name) {
  if (!IDENTIFIER_RE.test(name)) {
    throw new Error(`[sqlSafety] Invalid identifier format: "${name}"`);
  }
  return `"${name}"`;
}

/**
 * Validate multiple column names and build parameterized SET clauses.
 * Returns { setClauses: string[], values: any[], nextIdx: number }
 *
 * Usage:
 *   const { setClauses, values, nextIdx } = buildSetClauses(updates, 'contacts', 2);
 *   // setClauses = ['"email_1" = $2', '"phone_1" = $3']
 *   // values = ['new@email.com', '555-1234']
 */
function buildSetClauses(updates, table, startIdx = 1) {
  const resolvedTable = ENTITY_TYPE_TO_TABLE[table] || table;
  const setClauses = [];
  const values = [];
  let idx = startIdx;

  for (const [key, val] of Object.entries(updates)) {
    validateColumn(key, resolvedTable);
    setClauses.push(`${quoteIdentifier(key)} = $${idx}`);
    values.push(val);
    idx++;
  }

  return { setClauses, values, nextIdx: idx };
}

module.exports = {
  ALLOWED_COLS,
  TABLE_ID_MAP,
  ENTITY_TYPE_TO_TABLE,
  validateColumn,
  validateTable,
  quoteIdentifier,
  buildSetClauses,
};
