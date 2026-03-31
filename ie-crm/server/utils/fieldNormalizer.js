/**
 * Field Normalizer — Universal data source → CRM field mapper
 *
 * Every data source (AIR, CoStar, RE Apps, Reonomy, Title Reps, manual CSV)
 * uses different field names for the same data. This normalizer maps them all
 * to our canonical CRM schema.
 *
 * Usage:
 *   const { normalizeRecord } = require('./fieldNormalizer');
 *   const normalized = normalizeRecord(rawData, 'properties');
 *   // normalized.rba = 45000 regardless of whether source said building_sf, total_sf, etc.
 */

// ============================================================
// CANONICAL FIELD MAPS — source field → CRM field
// Each key is a lowercase version of what any source might call the field.
// The value is our canonical CRM column name.
// ============================================================

const FIELD_MAPS = {
  properties: {
    // Address & location
    address: 'property_address', 'property address': 'property_address', property_address: 'property_address',
    'street address': 'property_address', 'building address': 'property_address',
    'property name': 'property_name', property_name: 'property_name', 'building name': 'property_name',
    city: 'city', state: 'state', zip: 'zip', 'zip code': 'zip', county: 'county',
    latitude: 'latitude', lat: 'latitude',
    longitude: 'longitude', lng: 'longitude', lon: 'longitude',
    submarket: 'submarket_name', 'submarket name': 'submarket_name', submarket_name: 'submarket_name',

    // Size & physical — ALL map to 'rba' (Rentable Building Area)
    rba: 'rba', 'building sf': 'rba', building_sf: 'rba', 'building sqft': 'rba',
    'rentable building area': 'rba', total_sf: 'rba', 'total sf': 'rba',
    square_footage: 'rba', 'square footage': 'rba', sf: 'rba', 'bldg sf': 'rba',
    'gross building area': 'rba', gba: 'rba',

    // Land
    'land sf': 'land_sf', land_sf: 'land_sf', 'land area sf': 'land_sf', 'lot size sf': 'land_sf',
    'land area ac': 'land_area_ac', land_area_ac: 'land_area_ac', 'land acres': 'land_area_ac',
    'lot size': 'land_area_ac', 'lot acres': 'land_area_ac',

    // Building characteristics
    'property type': 'property_type', property_type: 'property_type', type: 'property_type',
    'building class': 'building_class', building_class: 'building_class', class: 'building_class',
    'year built': 'year_built', year_built: 'year_built', vintage: 'year_built',
    'year renovated': 'year_renovated', year_renovated: 'year_renovated',
    'ceiling ht': 'ceiling_ht', ceiling_ht: 'ceiling_ht', 'ceiling height': 'ceiling_ht',
    'clear ht': 'clear_ht', clear_ht: 'clear_ht', 'clear height': 'clear_ht', clear_height: 'clear_ht',
    'number of loading docks': 'number_of_loading_docks', 'loading docks': 'number_of_loading_docks',
    dock_high_doors: 'number_of_loading_docks', 'dock high doors': 'number_of_loading_docks',
    'drive ins': 'drive_ins', drive_ins: 'drive_ins', 'grade level doors': 'drive_ins',
    grade_level_doors: 'drive_ins',
    'construction status': 'building_status', construction_status: 'building_status',
    'building status': 'building_status', building_status: 'building_status',
    zoning: 'zoning', sprinklers: 'sprinklers', power: 'power',

    // Financial
    'last sale date': 'last_sale_date', last_sale_date: 'last_sale_date',
    'last sale price': 'last_sale_price', last_sale_price: 'last_sale_price',
    'price psf': 'price_psf', price_psf: 'price_psf', '$/sf': 'price_psf',
    'cap rate': 'cap_rate', cap_rate: 'cap_rate',
    'rent psf': 'listing_asking_lease_rate', rent_psf_mo: 'listing_asking_lease_rate',
    listing_asking_lease_rate: 'listing_asking_lease_rate', 'asking rent': 'listing_asking_lease_rate',
    'asking lease rate': 'listing_asking_lease_rate', 'asking rate': 'listing_asking_lease_rate',

    // Availability
    'total available sf': 'total_available_sf', total_available_sf: 'total_available_sf',
    available_sf: 'total_available_sf', 'available sf': 'total_available_sf',
    'direct available sf': 'direct_available_sf', direct_available_sf: 'direct_available_sf',
    'vacancy pct': 'vacancy_pct', vacancy_pct: 'vacancy_pct', 'vacancy rate': 'vacancy_pct',
    'percent leased': 'percent_leased', percent_leased: 'percent_leased',

    // Owner info
    'owner name': 'owner_name', owner_name: 'owner_name', owner: 'owner_name',
    'owner phone': 'owner_phone', owner_phone: 'owner_phone',
    'owner entity type': 'owner_entity_type', owner_entity_type: 'owner_entity_type',

    // Notes & metadata
    notes: 'notes', source: 'notes', // source-specific notes go into notes
    'data source': 'data_source', data_source: 'data_source',
  },

  lease_comps: {
    // Tenant
    tenant: 'tenant_name', 'tenant name': 'tenant_name', tenant_name: 'tenant_name',
    'company name': 'tenant_name',

    // Size
    sf: 'sf', 'square feet': 'sf', 'square footage': 'sf', 'sq ft': 'sf',
    'square footage leased': 'sf', 'leased sf': 'sf', size: 'sf',
    rba: 'building_rba', building_rba: 'building_rba', 'building rba': 'building_rba',
    building_sf: 'building_rba', 'building sf': 'building_rba',

    // Rate
    rate: 'rate', rent: 'rate', 'asking rent': 'rate', 'contract rent': 'rate',
    'actual rate': 'rate', 'lease rate': 'rate', asking_rate: 'rate',

    // Type
    'rent type': 'rent_type', rent_type: 'rent_type', rate_type: 'rent_type',
    'lease type': 'lease_type', lease_type: 'lease_type',
    'property type': 'property_type', property_type: 'property_type',
    'space use': 'space_use', space_use: 'space_use',

    // Dates
    'sign date': 'sign_date', sign_date: 'sign_date', signed: 'sign_date',
    'commencement date': 'commencement_date', commencement: 'commencement_date',
    'expiration date': 'expiration_date', expiration: 'expiration_date', expires: 'expiration_date',
    'lease term': 'term_months', term: 'term_months', 'term (months)': 'term_months',
    term_months: 'term_months',

    // Reps
    'tenant rep': 'tenant_rep_agents', tenant_rep: 'tenant_rep_agents',
    'tenant rep agents': 'tenant_rep_agents', 'tenant rep company': 'tenant_rep_company',
    'landlord rep': 'landlord_rep_agents', landlord_rep: 'landlord_rep_agents',
    'landlord rep agents': 'landlord_rep_agents', 'landlord rep company': 'landlord_rep_company',

    // Location (for property matching)
    address: 'property_address', 'property address': 'property_address', property_address: 'property_address',
    city: 'city', state: 'state', zip: 'zip',

    notes: 'notes', source: 'source',
  },

  sale_comps: {
    // Price
    'sale price': 'sale_price', sale_price: 'sale_price', price: 'sale_price',
    asking_price: 'sale_price',
    'price psf': 'price_psf', price_psf: 'price_psf', '$/sf': 'price_psf',
    'cap rate': 'cap_rate', cap_rate: 'cap_rate', cap: 'cap_rate',

    // Size
    sf: 'sf', 'square feet': 'sf', 'building sf': 'sf', building_sf: 'sf', size: 'sf',
    'land sf': 'land_sf', land_sf: 'land_sf',

    // Parties
    buyer: 'buyer_name', buyer_name: 'buyer_name', 'buyer name': 'buyer_name',
    seller: 'seller_name', seller_name: 'seller_name', 'seller name': 'seller_name',

    // Date
    'sale date': 'sale_date', sale_date: 'sale_date', date: 'sale_date',

    // Type
    'property type': 'property_type', property_type: 'property_type',

    // Location
    address: 'property_address', 'property address': 'property_address', property_address: 'property_address',
    city: 'city', state: 'state', zip: 'zip',

    notes: 'notes', source: 'source',
  },

  market_tracking: {
    address: 'property_address', 'property address': 'property_address', property_address: 'property_address',
    city: 'submarket', submarket: 'submarket',
    'property type': 'property_type', property_type: 'property_type',
    building_sf: 'building_sf', 'building sf': 'building_sf', rba: 'building_sf', sf: 'building_sf',
    'asking rate': 'asking_lease_rate', asking_rate: 'asking_lease_rate', rate: 'asking_lease_rate',
    'asking price': 'asking_price', asking_price: 'asking_price', price: 'asking_price',
    'price psf': 'asking_price_psf', price_psf: 'asking_price_psf',
    'listing broker': 'listing_broker', listing_broker: 'listing_broker',
    'listing agents': 'listing_agents', listing_agents: 'listing_agents',
    available_sf: 'available_sf', 'available sf': 'available_sf',
    office_sf: 'office_sf', 'office sf': 'office_sf',
    clear_height: 'clear_height', 'clear height': 'clear_height',
    dock_high_doors: 'dock_high_doors', 'dock high doors': 'dock_high_doors',
    grade_level_doors: 'grade_level_doors', 'grade level doors': 'grade_level_doors',
    construction_status: 'construction_status', 'construction status': 'construction_status',
    property_name: 'property_name', 'property name': 'property_name',
  },
};

// ============================================================
// VALUE NORMALIZERS — clean up values before storing
// ============================================================

const VALUE_NORMALIZERS = {
  // Strip dollar signs, commas from numeric fields
  numeric: (val) => {
    if (val == null || val === '' || val === 'N/A' || val === 'TBD' || val === 'NFL') return null;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/[$,\s]/g, '').replace(/['"]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  },

  // Strip foot marks from heights (e.g., "32'" → 32)
  height: (val) => {
    if (val == null || val === '') return null;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/['"′″\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  },

  // Normalize dates to ISO format
  date: (val) => {
    if (!val || val === 'N/A' || val === 'TBD') return null;
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  },

  // Clean text strings
  text: (val) => {
    if (val == null || val === '') return null;
    return String(val).trim();
  },
};

// Which normalizer to apply to which fields
const FIELD_NORMALIZER_MAP = {
  // Numeric fields
  rba: 'numeric', sf: 'numeric', land_sf: 'numeric', land_area_ac: 'numeric',
  building_sf: 'numeric', available_sf: 'numeric', office_sf: 'numeric',
  total_available_sf: 'numeric', direct_available_sf: 'numeric',
  building_rba: 'numeric', rate: 'numeric', sale_price: 'numeric',
  price_psf: 'numeric', asking_price: 'numeric', asking_price_psf: 'numeric',
  asking_lease_rate: 'numeric', cap_rate: 'numeric', vacancy_pct: 'numeric',
  percent_leased: 'numeric', term_months: 'numeric', last_sale_price: 'numeric',
  number_of_loading_docks: 'numeric', drive_ins: 'numeric',
  dock_high_doors: 'numeric', grade_level_doors: 'numeric',
  listing_asking_lease_rate: 'numeric', price_per_sqft: 'numeric', noi: 'numeric',

  // Height fields
  clear_ht: 'height', ceiling_ht: 'height', clear_height: 'height',

  // Date fields
  sign_date: 'date', sale_date: 'date', commencement_date: 'date',
  expiration_date: 'date', last_sale_date: 'date', move_in_date: 'date',

  // Everything else defaults to 'text'
};

// ============================================================
// NORMALIZER FUNCTIONS
// ============================================================

/**
 * Normalize a single record from any data source into CRM canonical fields.
 *
 * @param {Object} rawRecord — the incoming record with source-specific field names
 * @param {string} entityType — 'properties', 'lease_comps', 'sale_comps', 'market_tracking'
 * @param {string} [source] — optional source tag ('air_sheet', 'costar', 're_apps', 'reonomy', 'manual')
 * @returns {Object} — record with canonical CRM field names and cleaned values
 */
function normalizeRecord(rawRecord, entityType, source) {
  const fieldMap = FIELD_MAPS[entityType];
  if (!fieldMap) {
    throw new Error(`Unknown entity type: ${entityType}. Valid types: ${Object.keys(FIELD_MAPS).join(', ')}`);
  }

  const normalized = {};

  for (const [rawKey, rawValue] of Object.entries(rawRecord)) {
    const lookupKey = rawKey.toLowerCase().trim();
    const canonicalField = fieldMap[lookupKey];

    if (canonicalField) {
      // Apply value normalizer
      const normalizerType = FIELD_NORMALIZER_MAP[canonicalField] || 'text';
      const normalizer = VALUE_NORMALIZERS[normalizerType];
      normalized[canonicalField] = normalizer ? normalizer(rawValue) : rawValue;
    }
    // If no mapping found, skip the field (don't store unknown fields)
  }

  // Add source tag if provided
  if (source && !normalized.data_source) {
    normalized.data_source = source;
  }

  return normalized;
}

/**
 * Normalize an array of records.
 */
function normalizeRecords(rawRecords, entityType, source) {
  return rawRecords.map(r => normalizeRecord(r, entityType, source));
}

/**
 * Get all known aliases for a canonical field name.
 * Useful for showing users what field names are supported.
 */
function getFieldAliases(entityType, canonicalField) {
  const fieldMap = FIELD_MAPS[entityType];
  if (!fieldMap) return [];
  return Object.entries(fieldMap)
    .filter(([_, target]) => target === canonicalField)
    .map(([alias]) => alias);
}

/**
 * List all canonical fields for an entity type.
 */
function getCanonicalFields(entityType) {
  const fieldMap = FIELD_MAPS[entityType];
  if (!fieldMap) return [];
  return [...new Set(Object.values(fieldMap))].sort();
}

module.exports = {
  normalizeRecord,
  normalizeRecords,
  getFieldAliases,
  getCanonicalFields,
  FIELD_MAPS,
  VALUE_NORMALIZERS,
  FIELD_NORMALIZER_MAP,
};
