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
