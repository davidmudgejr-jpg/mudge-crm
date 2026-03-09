// Express API Server — standalone backend for Railway deployment
// Mirrors all Electron IPC handlers as REST endpoints

const express = require('express');
const cors = require('cors');
const path = require('path');
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
    'property_address', 'property_name', 'city', 'county', 'state', 'zip',
    'rba', 'land_area_ac', 'land_sf', 'far', 'property_type', 'building_class',
    'year_built', 'year_renovated', 'ceiling_ht', 'clear_ht', 'number_of_loading_docks', 'drive_ins',
    'column_spacing', 'sprinklers', 'power', 'construction_material', 'zoning', 'features',
    'last_sale_date', 'last_sale_price', 'plsf', 'loan_amount', 'debt_date',
    'cap_rate', 'vacancy_pct', 'percent_leased', 'owner_name', 'contacted', 'notes',
    'costar_url', 'off_market_deal', 'market_name', 'submarket_name', 'submarket_cluster',
    'building_park', 'tenancy', 'parking_ratio', 'owner_type', 'owner_contact',
    'building_tax', 'building_opex', 'leasing_company', 'broker_contact', 'for_sale_price',
    'ops_expense_psf', 'sewer', 'water', 'gas', 'heating',
    'total_available_sf', 'direct_available_sf', 'direct_vacant_space',
    'number_of_cranes', 'rail_lines', 'parcel_number', 'landvision_url',
    'sb_county_zoning', 'google_maps_url', 'zoning_map_url', 'listing_url',
    'avg_weighted_rent', 'building_image_path', 'latitude', 'longitude',
    'owner_user_or_investor', 'out_of_area_owner', 'office_courtesy',
    // migration 004
    'units', 'stories', 'parking_spaces', 'price_per_sqft', 'noi', 'owner_email', 'owner_mailing_address',
  ]),
  contacts: new Set([
    'full_name', 'first_name', 'type', 'title', 'email', 'email_2', 'email_3',
    'phone_1', 'phone_2', 'phone_3', 'phone_hot', 'email_hot', 'email_kickback',
    'home_address', 'work_address', 'work_city', 'work_state', 'work_zip',
    'born', 'age', 'client_level', 'active_need', 'notes', 'linkedin',
    'follow_up', 'last_contacted', 'data_source', 'tags',
    'white_pages_url', 'been_verified_url', 'zoom_info_url',
    'property_type_interest', 'lease_months_left', 'tenant_space_fit',
    'tenant_ownership_intent', 'business_trajectory', 'last_call_outcome',
    'follow_up_behavior', 'decision_authority', 'price_cost_awareness',
    'frustration_signals', 'exit_trigger_events',
  ]),
  companies: new Set([
    'company_name', 'company_type', 'industry_type', 'website', 'sf', 'employees',
    'revenue', 'company_growth', 'company_hq', 'lease_exp', 'lease_months_left',
    'move_in_date', 'notes', 'city', 'tenant_sic', 'tenant_naics', 'suite', 'tags',
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
      const pRes = await pool.query('SELECT property_id, property_address, normalized_address, city, zip FROM properties');
      properties = pRes.rows;
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
    const { target, rows, source, matchProperties, matchCompanies, onDuplicate = 'skip' } = req.body;
    if (!target || !IMPORT_COLS[target]) {
      return res.status(400).json({ error: `Invalid target table: ${target}` });
    }
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Non-empty rows array required' });
    }

    const allowedCols = IMPORT_COLS[target];
    const idCol = TABLE_ID_COL[target];

    // Load reference data for matching
    let properties = [], companies = [];
    if (matchProperties) {
      const pRes = await pool.query('SELECT property_id, property_address, normalized_address, city, zip FROM properties');
      properties = pRes.rows;
    }
    if (matchCompanies) {
      const cRes = await pool.query('SELECT company_id, company_name, city FROM companies');
      companies = cRes.rows;
    }

    let inserted = 0, skipped = 0, updated = 0, errors = 0;
    const flaggedRows = [];
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // Filter to allowed columns only
        const cleanRow = {};
        for (const [key, val] of Object.entries(row)) {
          if (allowedCols.has(key) && val != null && val !== '') {
            cleanRow[key] = val;
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

        const cols = Object.keys(cleanRow);
        if (cols.length === 0) { skipped++; continue; }

        const vals = cols.map((_, idx) => `$${idx + 1}`);
        const params = cols.map(c => cleanRow[c]);

        try {
          await client.query(
            `INSERT INTO ${target} (${cols.join(', ')}) VALUES (${vals.join(', ')})`,
            params
          );
          inserted++;
        } catch (insertErr) {
          if (insertErr.code === '23505') { // unique violation
            if (onDuplicate === 'skip') { skipped++; }
            else if (onDuplicate === 'update') {
              // Update existing record — find by address or name
              // For now, skip duplicates (update logic can be added per-table)
              skipped++;
            }
          } else {
            console.error(`[import] Row ${i} error:`, insertErr.message);
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

    res.json({ inserted, skipped, updated, flagged: flaggedRows.length, errors, flaggedRows });
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
