// Express API Server — standalone backend for Railway deployment
// Mirrors all Electron IPC handlers as REST endpoints

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ============================================================
// DATABASE CONNECTION
// ============================================================
let pool;
function initDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('[server] DATABASE_URL not set — database features disabled');
    return;
  }
  pool = new Pool({
    connectionString,
    ssl: (connectionString.includes('railway.app') || connectionString.includes('rlwy.net'))
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', (err) => console.error('[server] Pool error:', err.message));
  console.log('[server] Database pool created');
}

// ============================================================
// ANTHROPIC CLIENT
// ============================================================
let anthropic;
function initAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn('[server] ANTHROPIC_API_KEY not set — Claude features disabled');
    return;
  }
  anthropic = new Anthropic({ apiKey });
  console.log('[server] Anthropic client ready');
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send('User-agent: *\nAllow: /');
});

// ============================================================
// DATABASE ROUTES
// ============================================================
app.post('/api/db/query', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected. Set DATABASE_URL.' });
  try {
    const { sql, params } = req.body;
    const result = await pool.query(sql, params || []);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/db/status', async (_req, res) => {
  if (!pool) return res.json({ connected: false, error: 'No DATABASE_URL configured' });
  try {
    await pool.query('SELECT 1');
    res.json({ connected: true });
  } catch (err) {
    res.json({ connected: false, error: err.message });
  }
});

app.get('/api/db/schema', async (_req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const columnsResult = await pool.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
    const countsResult = await pool.query(`
      SELECT relname AS table_name, n_live_tup AS row_count
      FROM pg_stat_user_tables
      WHERE schemaname = 'public'
      ORDER BY relname
    `);

    const tables = {};
    for (const row of columnsResult.rows) {
      if (!tables[row.table_name]) tables[row.table_name] = { columns: [], rowCount: 0 };
      tables[row.table_name].columns.push({
        name: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        default: row.column_default,
      });
    }
    for (const row of countsResult.rows) {
      if (tables[row.table_name]) {
        tables[row.table_name].rowCount = parseInt(row.row_count, 10) || 0;
      }
    }
    res.json(tables);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ============================================================
// CLAUDE AI ROUTES
// ============================================================
app.post('/api/claude/chat', async (req, res) => {
  if (!anthropic) return res.status(503).json({ error: 'Claude not configured. Set ANTHROPIC_API_KEY.' });
  try {
    const { messages, systemPrompt, options = {} } = req.body;

    const apiParams = {
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: systemPrompt,
      messages,
    };

    if (options.enableWebSearch) {
      apiParams.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
    }

    let currentMessages = [...messages];
    let allTextParts = [];
    let allSearchResults = [];
    const MAX_TURNS = 8;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      apiParams.messages = currentMessages;
      const response = await anthropic.messages.create(apiParams);

      for (const block of response.content) {
        if (block.type === 'text') {
          allTextParts.push(block.text);
        } else if (block.type === 'web_search_tool_result') {
          if (block.content && Array.isArray(block.content)) {
            for (const item of block.content) {
              if (item.type === 'web_search_result') {
                allSearchResults.push({
                  title: item.title,
                  url: item.url,
                  snippet: item.encrypted_content ? '(encrypted)' : '',
                });
              }
            }
          }
        }
      }

      if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop') break;

      if (response.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: response.content });
        const toolResults = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: 'Search executed by server.' });
          }
        }
        currentMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      break;
    }

    res.json({
      content: allTextParts.join('\n\n'),
      searchResults: allSearchResults.length > 0 ? allSearchResults : null,
      usage: null,
    });
  } catch (err) {
    console.error('[server] claude/chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/claude/status', (_req, res) => {
  res.json({ configured: !!anthropic });
});

// ============================================================
// FILE PARSING ROUTES
// ============================================================
app.post('/api/file/parse', async (req, res) => {
  try {
    const { base64, fileName } = req.body;
    const ext = path.extname(fileName).toLowerCase();
    const buffer = Buffer.from(base64, 'base64');

    if (ext === '.pdf') {
      return res.json({ type: 'document', mediaType: 'application/pdf', data: base64, fileName });
    }

    const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
    if (imageTypes[ext]) {
      return res.json({ type: 'image', mediaType: imageTypes[ext], data: base64, fileName });
    }

    if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') {
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets = [];
      for (const sheetName of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        sheets.push(`=== Sheet: ${sheetName} ===\n${csv}`);
      }
      return res.json({ type: 'text', text: sheets.join('\n\n'), fileName });
    }

    if (['.csv', '.txt', '.tsv', '.json'].includes(ext)) {
      return res.json({ type: 'text', text: buffer.toString('utf-8'), fileName });
    }

    res.status(400).json({ error: `Unsupported file type: ${ext}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// CSV IMPORT ROUTES
// ============================================================
const { normalizeAddress, parseAddress, normalizeCompanyName } = require('./utils/addressNormalizer');
const { matchProperty, matchCompany, matchContact, detectTable } = require('./utils/compositeMatcher');

// Column whitelist per table (matches database.js ALLOWED_COLS — import-safe subset, no IDs/timestamps)
const IMPORT_COLS = {
  properties: new Set([
    // Address & location
    'property_address', 'property_name', 'city', 'county', 'state', 'zip', 'latitude', 'longitude',
    // Size & physical
    'rba', 'land_area_ac', 'land_sf', 'far', 'stories', 'units', 'parking_spaces', 'parking_ratio',
    // Type & classification
    'property_type', 'building_class', 'building_status', 'tenancy', 'lease_type',
    // Construction
    'year_built', 'year_renovated', 'ceiling_ht', 'clear_ht', 'number_of_loading_docks', 'drive_ins',
    'column_spacing', 'sprinklers', 'power', 'construction_material', 'number_of_cranes', 'rail_lines',
    'sewer', 'water', 'gas', 'heating', 'zoning', 'features',
    // Financial
    'last_sale_date', 'last_sale_price', 'price_psf', 'price_per_sqft', 'plsf',
    'loan_amount', 'debt_date', 'holding_period_years', 'rent_psf_mo',
    'cap_rate', 'vacancy_pct', 'percent_leased', 'noi', 'for_sale_price',
    'ops_expense_psf', 'building_tax', 'building_opex', 'avg_weighted_rent',
    // Availability
    'total_available_sf', 'direct_available_sf', 'direct_vacant_space',
    // Owner info
    'owner_name', 'owner_phone', 'owner_email', 'owner_address', 'owner_city_state_zip',
    'owner_mailing_address', 'recorded_owner_name', 'true_owner_name',
    'owner_type', 'owner_entity_type', 'owner_user_or_investor', 'out_of_area_owner',
    'num_properties_owned', 'owner_call_status', 'tenant_call_status', 'has_lien_or_delinquency',
    // Status & flags
    'contacted', 'priority', 'off_market_deal', 'target', 'target_for', 'data_confirmed',
    'office_courtesy', 'tags',
    // Market / location context
    'building_park', 'market_name', 'submarket_name', 'submarket_cluster',
    // Reference / contacts (text columns)
    'owner_contact', 'broker_contact', 'leasing_company',
    // URLs & IDs
    'costar_url', 'landvision_url', 'sb_county_zoning', 'google_maps_url',
    'zoning_map_url', 'listing_url', 'building_image_path', 'parcel_number', 'airtable_id',
    // Notes & misc
    'notes', 'overflow',
  ]),
  contacts: new Set([
    'full_name', 'first_name', 'type', 'title', 'email', 'email_2', 'email_3',
    'phone_1', 'phone_2', 'phone_3', 'phone_hot', 'email_hot', 'email_kickback',
    'home_address', 'work_address', 'work_city', 'work_state', 'work_zip',
    'born', 'age', 'client_level', 'active_need', 'notes', 'linkedin',
    'follow_up', 'last_contacted', 'data_source', 'tags', 'airtable_id', 'overflow',
    'white_pages_url', 'been_verified_url', 'zoom_info_url',
    'property_type_interest', 'lease_months_left', 'tenant_space_fit',
    'tenant_ownership_intent', 'business_trajectory', 'last_call_outcome',
    'follow_up_behavior', 'decision_authority', 'price_cost_awareness',
    'frustration_signals', 'exit_trigger_events',
  ]),
  companies: new Set([
    'company_name', 'company_type', 'industry_type', 'website', 'sf', 'employees',
    'revenue', 'company_growth', 'company_hq', 'lease_exp', 'lease_months_left',
    'move_in_date', 'notes', 'city', 'tenant_sic', 'tenant_naics', 'suite',
    'tags', 'airtable_id', 'overflow',
  ]),
  deals: new Set([
    'deal_name', 'deal_type', 'deal_source', 'status', 'repping', 'term', 'rate', 'sf',
    'price', 'commission_rate', 'gross_fee_potential', 'net_potential', 'close_date',
    'important_date', 'deal_dead_reason', 'notes', 'priority_deal',
    'increases', 'escrow_url', 'surveys_brochures_url',
    'run_by', 'other_broker', 'industry', 'deadline', 'fell_through_reason',
  ]),
  interactions: new Set([
    'type', 'subject', 'date', 'notes', 'email_heading', 'email_body',
    'follow_up', 'follow_up_notes', 'lead_source', 'team_member', 'email_url', 'email_id',
  ]),
  campaigns: new Set([
    'name', 'type', 'status', 'notes', 'sent_date', 'assignee', 'day_time_hits',
  ]),
  action_items: new Set([
    'name', 'notes', 'notes_on_date', 'responsibility', 'high_priority',
    'status', 'due_date', 'date_completed', 'source',
  ]),
  lease_comps: new Set([
    'property_id', 'company_id', 'tenant_name', 'property_type', 'space_use', 'space_type',
    'sf', 'building_rba', 'floor_suite', 'sign_date', 'commencement_date', 'move_in_date',
    'expiration_date', 'term_months', 'rate', 'escalations', 'rent_type', 'lease_type',
    'concessions', 'free_rent_months', 'ti_psf',
    'tenant_rep_company', 'tenant_rep_agents', 'landlord_rep_company', 'landlord_rep_agents',
    'notes', 'source',
  ]),
  sale_comps: new Set([
    'property_id', 'sale_date', 'sale_price', 'price_psf', 'price_plsf',
    'cap_rate', 'sf', 'land_sf', 'buyer_name', 'seller_name', 'property_type', 'notes', 'source',
  ]),
  loan_maturities: new Set([
    'property_id', 'lender', 'loan_amount', 'maturity_date', 'ltv',
    'loan_purpose', 'loan_duration_years', 'interest_rate', 'notes', 'source',
  ]),
  property_distress: new Set([
    'property_id', 'distress_type', 'filing_date', 'amount', 'trustee', 'notes', 'source',
  ]),
  tenant_growth: new Set([
    'company_id', 'headcount_current', 'headcount_previous', 'growth_rate',
    'revenue_current', 'revenue_previous', 'data_date', 'source',
  ]),
};

// ID column name per table
const TABLE_ID_COL = {
  properties: 'property_id', contacts: 'contact_id', companies: 'company_id',
  deals: 'deal_id', interactions: 'interaction_id', campaigns: 'campaign_id',
  action_items: 'action_item_id',
  lease_comps: 'id', sale_comps: 'id',
  loan_maturities: 'id', property_distress: 'id', tenant_growth: 'id',
};

// ── Bulk delete records ──────────────────────────────────────────
app.post('/api/bulk-delete', async (req, res) => {
  try {
    const { table, ids } = req.body;
    const idCol = TABLE_ID_COL[table];
    if (!idCol) return res.status(400).json({ error: `Unknown table: ${table}` });
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });

    // Use parameterized ANY($1) instead of string interpolation for safety
    const result = await pool.query(
      `DELETE FROM ${table} WHERE ${idCol} = ANY($1::uuid[])`,
      [ids]
    );

    res.json({ deleted: result.rowCount });
  } catch (err) {
    console.error('[bulk-delete]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Auto-detect table from CSV headers
app.post('/api/import/detect', (req, res) => {
  try {
    const { headers } = req.body;
    if (!headers || !Array.isArray(headers)) {
      return res.status(400).json({ error: 'headers array required' });
    }
    const results = detectTable(headers);
    res.json({ detections: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Preview import — run matching without inserting
app.post('/api/import/preview', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { target, rows, matchProperties, matchCompanies, matchContacts } = req.body;
    if (!target || !IMPORT_COLS[target]) {
      return res.status(400).json({ error: `Invalid target table: ${target}` });
    }
    if (!rows || !Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows array required' });
    }

    // Load reference data for matching
    let properties = [], companies = [], contacts = [];
    if (matchProperties) {
      try {
        const pRes = await pool.query('SELECT property_id, property_address, normalized_address, city, zip FROM properties');
        properties = pRes.rows;
      } catch {
        const pRes = await pool.query('SELECT property_id, property_address, city, zip FROM properties');
        properties = pRes.rows;
      }
    }
    if (matchCompanies) {
      const cRes = await pool.query('SELECT company_id, company_name, city FROM companies');
      companies = cRes.rows;
    }
    if (matchContacts) {
      const ctRes = await pool.query('SELECT contact_id, full_name, email, email_2, email_3 FROM contacts');
      contacts = ctRes.rows;
    }

    // Process each row — run matching and categorize
    const previewRows = rows.slice(0, 50).map((row, idx) => {
      const result = { index: idx, row, matches: {} };

      if (matchProperties) {
        result.matches.property = matchProperty(row, properties);
      }
      if (matchCompanies && row.tenant_name) {
        result.matches.company = matchCompany(row.tenant_name || row.company_name, companies, row.city);
      }
      if (matchContacts && (row.email || row.full_name)) {
        result.matches.contact = matchContact(row, contacts);
      }

      return result;
    });

    // Summary stats
    const stats = {
      total: rows.length,
      previewed: previewRows.length,
      autoLinked: 0,
      flagged: 0,
      newRecords: 0,
    };

    for (const pr of previewRows) {
      const pMatch = pr.matches.property;
      if (pMatch?.match?.confidence >= 85) stats.autoLinked++;
      else if (pMatch?.candidates?.length > 0) stats.flagged++;
      else if (pMatch) stats.newRecords++;
    }

    res.json({ preview: previewRows, stats });
  } catch (err) {
    console.error('[server] import/preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Batch import — insert rows in a single transaction
app.post('/api/import/batch', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { target, rows, source, matchProperties, matchCompanies, linkRecords: doLinkRecords, onDuplicate = 'skip' } = req.body;
    if (!target || !IMPORT_COLS[target]) {
      return res.status(400).json({ error: `Invalid target table: ${target}` });
    }
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Non-empty rows array required' });
    }

    const allowedCols = IMPORT_COLS[target];
    const idCol = TABLE_ID_COL[target];

    // Columns that are text[] arrays in PostgreSQL — values must be wrapped
    const ARRAY_COLS = new Set([
      'tags', 'contacted', 'deal_dead_reason', 'deal_source', 'repping', 'run_by', 'responsibility',
    ]);

    // Columns that are numeric/integer in PostgreSQL — must strip $, commas, ranges
    const NUMERIC_COLS = new Set([
      // properties
      'avg_weighted_rent','cap_rate','ceiling_ht','clear_ht','direct_available_sf','direct_vacant_space',
      'drive_ins','far','for_sale_price','holding_period_years','land_area_ac','land_sf','last_sale_price',
      'latitude','loan_amount','longitude','noi','num_properties_owned','number_of_cranes',
      'number_of_loading_docks','ops_expense_psf','parking_ratio','parking_spaces','percent_leased',
      'plsf','price_per_sqft','price_psf','rba','rent_psf_mo','stories','total_available_sf','units',
      'vacancy_pct','year_built','year_renovated',
      // contacts
      'age','lease_months_left',
      // companies
      'employees','revenue','sf',
      // deals
      'commission_rate','gross_fee_potential','increases','net_potential','price','rate','term',
    ]);

    // Sanitize a string into a number, or return null if impossible
    function sanitizeNumeric(val) {
      if (typeof val === 'number') return val;
      let s = String(val).trim();
      // Strip $, commas, % signs
      s = s.replace(/[$,%]/g, '').replace(/,/g, '');
      // If it's a range like "0.74 – 0.91 (Est.)" or "100 - 200", take the first number
      const rangeMatch = s.match(/^([0-9.]+)/);
      if (!rangeMatch) return null;
      const n = parseFloat(rangeMatch[1]);
      return isNaN(n) ? null : n;
    }

    // Link field configs per target table
    // { junction, col1 (source FK), col2 (linked FK), role (if junction has role col), type: 'contact'|'company'|'property', textCol (optional static text column) }
    const LINK_CONFIGS = {
      properties: {
        _link_owner_contact:  { junction: 'property_contacts',  col1: 'property_id', col2: 'contact_id', role: 'owner',   type: 'contact', textCol: 'owner_contact' },
        _link_broker_contact: { junction: 'property_contacts',  col1: 'property_id', col2: 'contact_id', role: 'broker',  type: 'contact', textCol: 'broker_contact' },
        _link_company_owner:  { junction: 'property_companies', col1: 'property_id', col2: 'company_id', role: 'owner',   type: 'company', textCol: null },
        _link_company_tenant: { junction: 'property_companies', col1: 'property_id', col2: 'company_id', role: 'tenant',  type: 'company', textCol: null },
        _link_leasing_company:{ junction: 'property_companies', col1: 'property_id', col2: 'company_id', role: 'leasing', type: 'company', textCol: 'leasing_company' },
      },
      contacts: {
        _link_company:        { junction: 'contact_companies',  col1: 'contact_id', col2: 'company_id',  role: null,     type: 'company',  textCol: null },
        _link_campaign:       { junction: 'campaign_contacts',  col1: 'contact_id', col2: 'campaign_id', role: null,     type: 'campaign', textCol: null },
        _link_owner_property: { junction: 'property_contacts',  col1: 'contact_id', col2: 'property_id', role: 'owner',  type: 'property', textCol: null },
        _link_broker_property:{ junction: 'property_contacts',  col1: 'contact_id', col2: 'property_id', role: 'broker', type: 'property', textCol: null },
      },
      companies: {
        _link_contact: { junction: 'contact_companies', col1: 'company_id', col2: 'contact_id', role: null, type: 'contact', textCol: null },
      },
      deals: {
        _link_contact:  { junction: 'deal_contacts',   col1: 'deal_id', col2: 'contact_id',  role: null, type: 'contact',  textCol: null },
        _link_company:  { junction: 'deal_companies',  col1: 'deal_id', col2: 'company_id',  role: null, type: 'company',  textCol: null },
        _link_property: { junction: 'deal_properties', col1: 'deal_id', col2: 'property_id', role: null, type: 'property', textCol: null },
      },
      campaigns: {
        _link_contact: { junction: 'campaign_contacts', col1: 'campaign_id', col2: 'contact_id', role: null, type: 'contact', textCol: null },
      },
      interactions: {
        _link_contact:  { junction: 'interaction_contacts',   col1: 'interaction_id', col2: 'contact_id',  role: null, type: 'contact',  textCol: null },
        _link_company:  { junction: 'interaction_companies',  col1: 'interaction_id', col2: 'company_id',  role: null, type: 'company',  textCol: null },
        _link_deal:     { junction: 'interaction_deals',      col1: 'interaction_id', col2: 'deal_id',     role: null, type: 'deal',     textCol: null },
        _link_property: { junction: 'interaction_properties', col1: 'interaction_id', col2: 'property_id', role: null, type: 'property', textCol: null },
      },
    };
    const LINK_FIELD_CONFIG = LINK_CONFIGS[target] || {};

    // Load reference data for matching
    const linkConfig = LINK_CONFIGS[target] || {};
    const linkTypes = new Set(Object.values(linkConfig).map(c => c.type));

    let properties = [], companies = [], contacts = [];
    if (matchProperties || (doLinkRecords && linkTypes.has('property'))) {
      try {
        const pRes = await pool.query('SELECT property_id, property_address, normalized_address, city, zip FROM properties');
        properties = pRes.rows;
      } catch {
        // Fallback if normalized_address column doesn't exist yet (migration 002)
        const pRes = await pool.query('SELECT property_id, property_address, city, zip FROM properties');
        properties = pRes.rows;
      }
    }
    if (matchCompanies || (doLinkRecords && linkTypes.has('company'))) {
      const cRes = await pool.query('SELECT company_id, company_name, city FROM companies');
      companies = cRes.rows;
    }
    if (doLinkRecords && linkTypes.has('contact')) {
      const ctRes = await pool.query('SELECT contact_id, full_name, email, email_2, email_3 FROM contacts');
      contacts = ctRes.rows;
    }
    let deals = [];
    if (doLinkRecords && linkTypes.has('deal')) {
      const dRes = await pool.query('SELECT deal_id, deal_name FROM deals');
      deals = dRes.rows;
    }
    let campaigns = [];
    if (doLinkRecords && linkTypes.has('campaign')) {
      const campRes = await pool.query('SELECT campaign_id, name FROM campaigns');
      campaigns = campRes.rows;
    }

    // Track newly created records during this import (name → id) to reuse across rows
    const createdContacts = new Map(); // lowercase name → contact_id
    const createdCompanies = new Map(); // lowercase name → company_id
    const createdCampaigns = new Map(); // lowercase name → campaign_id

    let inserted = 0, skipped = 0, updated = 0, errors = 0, linked = 0;
    const flaggedRows = [];
    let firstError = null; // Capture first error for debugging
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Filter to allowed columns only
        const cleanRow = {};
        for (const [key, val] of Object.entries(row)) {
          if (allowedCols.has(key) && val != null && val !== '') {
            if (ARRAY_COLS.has(key)) {
              // Convert plain text to PostgreSQL text[] array
              if (Array.isArray(val)) {
                cleanRow[key] = val;
              } else {
                cleanRow[key] = String(val).split(',').map(s => s.trim()).filter(Boolean);
              }
            } else if (NUMERIC_COLS.has(key)) {
              // Strip $, commas, %, ranges — extract clean number
              const num = sanitizeNumeric(val);
              if (num !== null) cleanRow[key] = num;
              // If null, skip this column entirely (don't insert bad data)
            } else {
              cleanRow[key] = val;
            }
          }
        }

        // Add source tag if provided
        if (source && allowedCols.has('source') && !cleanRow.source) {
          cleanRow.source = source;
        }

        // Run property matching if applicable
        if (matchProperties && allowedCols.has('property_id') && !cleanRow.property_id) {
          const result = matchProperty(row, properties);
          if (result.match && result.match.confidence >= 85) {
            cleanRow.property_id = result.match.id;
          } else if (result.candidates.length > 0) {
            flaggedRows.push({
              rowIndex: i,
              address: row.property_address || row.address || '',
              reason: result.level || 'ambiguous',
              candidates: result.candidates.slice(0, 5),
            });
          }
        }

        // Run company matching if applicable
        if (matchCompanies && allowedCols.has('company_id') && !cleanRow.company_id) {
          const companyName = row.tenant_name || row.company_name;
          if (companyName) {
            const result = matchCompany(companyName, companies, row.city);
            if (result.match && result.match.confidence >= 85) {
              cleanRow.company_id = result.match.id;
            }
          }
        }

        // Also store link field text values in the static text columns
        if (doLinkRecords) {
          for (const [linkField, config] of Object.entries(LINK_FIELD_CONFIG)) {
            const name = row[linkField];
            if (name && config.textCol && allowedCols.has(config.textCol) && !cleanRow[config.textCol]) {
              cleanRow[config.textCol] = name.trim();
            }
          }
        }

        const cols = Object.keys(cleanRow);
        if (cols.length === 0) { skipped++; continue; }

        const vals = cols.map((_, idx) => `$${idx + 1}`);
        const params = cols.map(c => cleanRow[c]);

        try {
          await client.query(`SAVEPOINT row_${i}`);
          const insertResult = await client.query(
            `INSERT INTO ${target} (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING ${idCol}`,
            params
          );
          await client.query(`RELEASE SAVEPOINT row_${i}`);
          inserted++;

          // Auto-link from _link_* fields (works for all target tables)
          // Airtable exports multi-linked records as comma-separated text: "John Smith,Jane Doe"
          // We split on commas and create a junction link for EACH value
          if (doLinkRecords && insertResult.rows.length > 0) {
            const sourceId = insertResult.rows[0][idCol];

            for (const [linkField, config] of Object.entries(LINK_FIELD_CONFIG)) {
              const rawCell = (row[linkField] || '').trim();
              if (!rawCell) continue;

              // Split multi-value cells — Airtable uses comma-separated linked records
              const names = rawCell.split(',').map(s => s.trim()).filter(Boolean);

              for (const singleName of names) {
              try {
                let linkedId = null;
                const nameLower = singleName.toLowerCase();

                if (config.type === 'contact') {
                  if (createdContacts.has(nameLower)) {
                    linkedId = createdContacts.get(nameLower);
                  } else {
                    const matchResult = matchContact({ full_name: singleName }, contacts);
                    if (matchResult.match && matchResult.match.confidence >= 70) {
                      linkedId = matchResult.match.id;
                    } else {
                      const newId = crypto.randomUUID();
                      await client.query(
                        'INSERT INTO contacts (contact_id, full_name, first_name) VALUES ($1, $2, $3)',
                        [newId, singleName, singleName.split(' ')[0] || singleName]
                      );
                      linkedId = newId;
                      contacts.push({ contact_id: newId, full_name: singleName, email: null, email_2: null, email_3: null });
                    }
                    createdContacts.set(nameLower, linkedId);
                  }
                } else if (config.type === 'company') {
                  if (createdCompanies.has(nameLower)) {
                    linkedId = createdCompanies.get(nameLower);
                  } else {
                    const matchResult = matchCompany(singleName, companies);
                    if (matchResult.match && matchResult.match.confidence >= 85) {
                      linkedId = matchResult.match.id;
                    } else {
                      const newId = crypto.randomUUID();
                      await client.query(
                        'INSERT INTO companies (company_id, company_name) VALUES ($1, $2)',
                        [newId, singleName]
                      );
                      linkedId = newId;
                      companies.push({ company_id: newId, company_name: singleName, city: null });
                    }
                    createdCompanies.set(nameLower, linkedId);
                  }
                } else if (config.type === 'property') {
                  // Try to match existing property by address
                  const matchResult = matchProperty({ property_address: singleName }, properties);
                  if (matchResult.match && matchResult.match.confidence >= 70) {
                    linkedId = matchResult.match.id;
                  }
                  // Don't auto-create properties — too complex (need address, city, etc.)
                } else if (config.type === 'deal') {
                  // Try to match existing deal by name (simple case-insensitive match)
                  const found = deals.find(d => d.deal_name && d.deal_name.toLowerCase() === nameLower);
                  if (found) linkedId = found.deal_id;
                  // Don't auto-create deals — need deal type, status, etc.
                } else if (config.type === 'campaign') {
                  // Find or create campaign by name
                  if (createdCampaigns.has(nameLower)) {
                    linkedId = createdCampaigns.get(nameLower);
                  } else {
                    const found = campaigns.find(c => c.name && c.name.toLowerCase() === nameLower);
                    if (found) {
                      linkedId = found.campaign_id;
                    } else {
                      // Auto-create new campaign with just a name
                      const newId = crypto.randomUUID();
                      await client.query(
                        'INSERT INTO campaigns (campaign_id, name) VALUES ($1, $2)',
                        [newId, singleName]
                      );
                      linkedId = newId;
                      campaigns.push({ campaign_id: newId, name: singleName });
                    }
                    createdCampaigns.set(nameLower, linkedId);
                  }
                }

                // Create the junction table link
                if (linkedId) {
                  if (config.role) {
                    await client.query(
                      `INSERT INTO ${config.junction} (${config.col1}, ${config.col2}, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
                      [sourceId, linkedId, config.role]
                    );
                  } else {
                    await client.query(
                      `INSERT INTO ${config.junction} (${config.col1}, ${config.col2}) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                      [sourceId, linkedId]
                    );
                  }
                  linked++;
                }
              } catch (linkErr) {
                console.error(`[import] Link error for row ${i} field ${linkField} name "${singleName}":`, linkErr.message);
              }
              } // end for singleName
            } // end for linkField
          }

          // ── Notes → Activity: split notes text into interaction records ──
          if (doLinkRecords && insertResult.rows.length > 0) {
            const notesRaw = (row['_notes_to_activity'] || '').trim();
            if (notesRaw) {
              const sourceId = insertResult.rows[0][idCol];
              // Determine junction table based on import target
              const notesJunction = target === 'contacts' ? 'interaction_contacts'
                                  : target === 'deals' ? 'interaction_deals'
                                  : target === 'companies' ? 'interaction_companies'
                                  : target === 'properties' ? 'interaction_properties'
                                  : null;
              const notesFk = target === 'contacts' ? 'contact_id'
                            : target === 'deals' ? 'deal_id'
                            : target === 'companies' ? 'company_id'
                            : target === 'properties' ? 'property_id'
                            : null;

              if (notesJunction && notesFk) {
                // Split on newlines, group dated entries with their following undated lines
                const lines = notesRaw.split(/\n/).map(l => l.trim()).filter(Boolean);
                const entries = []; // { date: Date|null, text: string }

                // Date patterns: M/D/YY, M/D/YYYY, M.D.YY, M.D.YYYY, "Month YYYY", "M-D-YY"
                const dateRe = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\s*[:;\-–—]?\s*/;
                const monthNameRe = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\s*[:;\-–—,]?\s*/i;

                for (const line of lines) {
                  let dateMatch = line.match(dateRe);
                  let monthMatch = !dateMatch ? line.match(monthNameRe) : null;

                  if (dateMatch) {
                    let [, m, d, y] = dateMatch;
                    if (y.length === 2) y = (parseInt(y) > 50 ? '19' : '20') + y;
                    const parsed = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
                    const text = line.slice(dateMatch[0].length).trim();
                    entries.push({ date: isNaN(parsed) ? null : parsed, text });
                  } else if (monthMatch) {
                    const [, monthName, year] = monthMatch;
                    const parsed = new Date(`${monthName} 1, ${year}`);
                    const text = line.slice(monthMatch[0].length).trim();
                    entries.push({ date: isNaN(parsed) ? null : parsed, text });
                  } else if (entries.length > 0) {
                    // Append undated line to previous entry
                    entries[entries.length - 1].text += '\n' + line;
                  } else {
                    // First line has no date — create entry with no date
                    entries.push({ date: null, text: line });
                  }
                }

                // Create an interaction for each entry
                for (const entry of entries) {
                  if (!entry.text) continue;
                  try {
                    const intId = crypto.randomUUID();
                    await client.query(
                      'INSERT INTO interactions (interaction_id, type, notes, date) VALUES ($1, $2, $3, $4)',
                      [intId, 'note', entry.text, entry.date]
                    );
                    await client.query(
                      `INSERT INTO ${notesJunction} (interaction_id, ${notesFk}) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                      [intId, sourceId]
                    );
                    linked++;
                  } catch (noteErr) {
                    console.error(`[import] Note→activity error row ${i}:`, noteErr.message);
                  }
                }
              }
            }
          }

        } catch (insertErr) {
          await client.query(`ROLLBACK TO SAVEPOINT row_${i}`);
          if (insertErr.code === '23505') { // unique violation
            if (onDuplicate === 'skip') { skipped++; }
            else if (onDuplicate === 'update') {
              // Update existing record — find by address or name
              // For now, skip duplicates (update logic can be added per-table)
              skipped++;
            }
          } else {
            console.error(`[import] Row ${i} error:`, insertErr.message);
            if (!firstError) {
              const rowCols = Object.keys(cleanRow);
              firstError = { row: i, message: insertErr.message, code: insertErr.code, columns: rowCols };
              console.error(`[import] FIRST ERROR detail — cols: [${rowCols.join(', ')}], values: [${rowCols.map(c => String(cleanRow[c]).substring(0, 30)).join(', ')}]`);
            }
            errors++;
          }
        }
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ inserted, skipped, updated, flagged: flaggedRows.length, errors, linked, flaggedRows, firstError });
  } catch (err) {
    console.error('[server] import/batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// AIRTABLE ROUTES
// ============================================================
app.get('/api/airtable/fetch', async (req, res) => {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appQaZNM0Mt4Zul3q';
  if (!apiKey) return res.status(503).json({ error: 'AIRTABLE_API_KEY not set' });

  const { tableName, offset } = req.query;
  let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?pageSize=100`;
  if (offset) url += `&offset=${offset}`;

  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: text });
    }
    const data = await resp.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/airtable/test', async (req, res) => {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appQaZNM0Mt4Zul3q';
  if (!apiKey) return res.json({ error: 'AIRTABLE_API_KEY not set', apiKey: null, baseId });

  const { tableName } = req.query;
  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?pageSize=5`;

  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    res.json({
      status: resp.status, ok: resp.ok, baseId, tableName, url,
      rawBody: text.slice(0, 5000), parsed,
      recordCount: parsed?.records?.length || 0,
      fieldNames: parsed?.records?.[0] ? Object.keys(parsed.records[0].fields) : [],
    });
  } catch (err) {
    res.json({ error: err.message, baseId, tableName, url });
  }
});

app.get('/api/airtable/status', (_req, res) => {
  const hasKey = !!process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appQaZNM0Mt4Zul3q';
  res.json({ configured: hasKey, baseId });
});

// ============================================================
// SETTINGS ROUTES
// ============================================================
app.get('/api/settings/env', (req, res) => {
  const key = req.query.key;
  const safe = {
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID || 'appQaZNM0Mt4Zul3q',
    HAS_DATABASE_URL: !!process.env.DATABASE_URL,
    HAS_ANTHROPIC_KEY: !!process.env.ANTHROPIC_API_KEY,
    HAS_AIRTABLE_KEY: !!process.env.AIRTABLE_API_KEY,
  };
  res.json(key ? { [key]: safe[key] } : safe);
});

// ============================================================
// TPE DATA ROUTE — scored properties from the materialized view
// ============================================================
app.get('/api/ai/tpe', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const limit = Math.min(parseInt(req.query.limit) || 2000, 5000);
    const result = await pool.query(
      `SELECT * FROM property_tpe_scores ORDER BY blended_priority DESC NULLS LAST LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('TPE fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// TPE CONFIG ROUTES
// ============================================================

// GET /api/ai/tpe-config — fetch all config values
app.get('/api/ai/tpe-config', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const result = await pool.query(
      'SELECT config_category, config_key, config_value, description FROM tpe_config ORDER BY config_category, config_key'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/ai/tpe-config — update one or more config values
app.patch('/api/ai/tpe-config', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const updates = Array.isArray(req.body) ? req.body : [req.body];
    const results = [];
    for (const { config_key, config_value } of updates) {
      if (!config_key || config_value == null) continue;
      const r = await pool.query(
        'UPDATE tpe_config SET config_value = $1 WHERE config_key = $2 RETURNING *',
        [config_value, config_key]
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ error: `Config key not found: ${config_key}` });
      }
      results.push(r.rows[0]);
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/tpe-config/reset — restore all config values to seed defaults
app.post('/api/ai/tpe-config/reset', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const defaults = {
      lease_12mo_points: 30, lease_18mo_points: 22, lease_24mo_points: 15, lease_36mo_points: 8,
      entity_individual_points: 8, entity_trust_points: 10, hold_15yr_points: 12, hold_10yr_points: 7, hold_7yr_points: 4, owner_user_bonus: 10, ownership_cap: 30,
      age_70_points: 20, age_65_points: 15, age_60_points: 10, age_55_points: 5,
      growth_30pct_points: 15, growth_20pct_points: 10, growth_10pct_points: 5,
      balloon_high_points: 12, balloon_medium_points: 7, balloon_low_points: 4, lien_points: 7, stress_cap: 15,
      sale_price_psf: 250, lease_rate_small: 1.15, lease_rate_mid: 1.00, lease_rate_large: 0.90, lease_term_months: 60,
      sale_commission_5m: 0.03, sale_commission_10m: 0.02, sale_commission_over10m: 0.01,
      lease_new_commission_rate: 0.04, lease_renewal_commission_rate: 0.02, commission_divisor: 2500,
      time_mult_6mo: 1.20, time_mult_12mo: 1.10, time_mult_24mo: 1.00, time_mult_sale: 0.85,
      tpe_weight: 0.70, ecv_weight: 0.30,
      matured_points: 25, mature_30d_points: 20, mature_90d_points: 15, mature_over90d_points: 10,
      ltv_85_bonus: 5, ltv_75_bonus: 3, ltv_65_bonus: 1, duration_25yr_bonus: 3, duration_4yr_bonus: 1,
      purpose_acquisition_bonus: 2, purpose_construction_bonus: 2,
      auction_points: 25, matured_distress_points: 25, nod_points: 20,
      mature_1mo_points: 22, mature_3mo_points: 18, mature_6mo_points: 15, mature_9mo_points: 12, mature_12mo_points: 10,
      tier_a_threshold: 50, tier_b_threshold: 40, tier_c_threshold: 30,
      // Living database: temporal decay keys
      lease_expired_0_3mo_points: 8, lease_expired_3_6mo_points: 4,
      maturity_past_0_3mo_points: 15, maturity_past_3_6mo_points: 8, maturity_past_6_12mo_points: 3,
      distress_decay_6_12mo_pct: 50,
    };
    for (const [key, value] of Object.entries(defaults)) {
      await pool.query('UPDATE tpe_config SET config_value = $1 WHERE config_key = $2', [value, key]);
    }
    const result = await pool.query('SELECT * FROM tpe_config ORDER BY config_category, config_key');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SERVE STATIC FRONTEND (production)
// ============================================================
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ============================================================
// START
// ============================================================
initDatabase();
initAnthropic();

app.listen(PORT, () => {
  console.log(`[server] IE CRM API running on port ${PORT}`);
  console.log(`[server] Database: ${pool ? 'connected' : 'not configured'}`);
  console.log(`[server] Claude: ${anthropic ? 'ready' : 'not configured'}`);
  console.log(`[server] Airtable: ${process.env.AIRTABLE_API_KEY ? 'configured' : 'not configured'}`);
});
