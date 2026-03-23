const { app, BrowserWindow, ipcMain, nativeTheme, session } = require('electron');
const path = require('path');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');

// Load .env — check multiple locations for packaged vs development
function loadEnv() {
  try {
    const dotenv = require('dotenv');
    const candidates = app.isPackaged
      ? [
          // Next to the .app bundle (recommended for users)
          path.join(path.dirname(app.getPath('exe')), '..', '..', '..', '.env'),
          // In the user's home directory
          path.join(app.getPath('home'), '.ie-crm.env'),
        ]
      : [
          // Development: project root
          path.join(__dirname, '..', '.env'),
        ];
    console.log('[IE-CRM] Looking for .env in:', candidates);
    for (const envPath of candidates) {
      const result = dotenv.config({ path: envPath, override: true });
      if (!result.error) {
        console.log('[IE-CRM] Loaded env from:', envPath);
        console.log('[IE-CRM] ANTHROPIC_API_KEY set:', !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.length > 0);
        console.log('[IE-CRM] DATABASE_URL set:', !!process.env.DATABASE_URL && process.env.DATABASE_URL.length > 0);
        return;
      }
    }
    console.warn('[IE-CRM] No .env file found — configure via Settings page');
  } catch (e) {
    console.error('[IE-CRM] dotenv load error:', e.message);
  }
}
loadEnv();

let mainWindow;
let pool;
let anthropic;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1117' : '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In development, load the Vite dev server
  const isDev = !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ============================================================
// DATABASE CONNECTION
// ============================================================
function initDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn('DATABASE_URL not set — database features disabled');
    return;
  }
  pool = new Pool({
    connectionString,
    ssl: (connectionString.includes('railway.app') || connectionString.includes('rlwy.net')) ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  pool.on('error', (err) => {
    console.error('Database pool error:', err);
  });
}

// ============================================================
// ANTHROPIC CLIENT
// ============================================================
function initAnthropic() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn('[IE-CRM] ANTHROPIC_API_KEY not set or empty — Claude features disabled');
    return;
  }
  console.log('[IE-CRM] Initializing Anthropic client (key length:', apiKey.length, ')');
  anthropic = new Anthropic({ apiKey });
  console.log('[IE-CRM] Anthropic client ready');
}

// ============================================================
// IPC HANDLERS — Database
// ============================================================
ipcMain.handle('db:query', async (_event, sql, params) => {
  if (!pool) throw new Error('Database not connected. Set DATABASE_URL in .env');
  try {
    const result = await pool.query(sql, params || []);
    return { rows: result.rows, rowCount: result.rowCount };
  } catch (err) {
    throw new Error(err.message);
  }
});

ipcMain.handle('db:status', async () => {
  if (!pool) return { connected: false, error: 'No DATABASE_URL configured' };
  try {
    await pool.query('SELECT 1');
    return { connected: true };
  } catch (err) {
    return { connected: false, error: err.message };
  }
});

// ============================================================
// IPC HANDLERS — Database Schema
// ============================================================
ipcMain.handle('db:schema', async () => {
  if (!pool) throw new Error('Database not connected');
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
    // Group columns by table
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
    return tables;
  } catch (err) {
    throw new Error(err.message);
  }
});

// ============================================================
// IPC HANDLERS — Claude AI (with web search + multi-block)
// ============================================================
ipcMain.handle('claude:chat', async (_event, messages, systemPrompt, options = {}) => {
  console.log('[IE-CRM] claude:chat called, anthropic ready:', !!anthropic, 'messages:', messages.length);
  if (!anthropic) throw new Error('Claude not configured. Set ANTHROPIC_API_KEY in .env');
  try {
    const apiParams = {
      model: 'claude-sonnet-4-6',
      max_tokens: 16384,
      system: systemPrompt,
      messages: messages,
    };

    // Add web search tool if enabled
    if (options.enableWebSearch) {
      apiParams.tools = [
        {
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        },
      ];
    }

    // Agentic loop — handle tool_use responses (web search)
    let currentMessages = [...messages];
    let allTextParts = [];
    let allSearchResults = [];
    const MAX_TURNS = 8;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      apiParams.messages = currentMessages;
      const response = await anthropic.messages.create(apiParams);

      // Extract text and search results from content blocks
      for (const block of response.content) {
        if (block.type === 'text') {
          allTextParts.push(block.text);
        } else if (block.type === 'web_search_tool_result') {
          // Extract search results for citation display
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

      // If stop_reason is end_turn or stop, we're done
      if (response.stop_reason === 'end_turn' || response.stop_reason === 'stop') {
        break;
      }

      // If stop_reason is tool_use, add assistant message and continue
      if (response.stop_reason === 'tool_use') {
        currentMessages.push({ role: 'assistant', content: response.content });

        // Build tool_result messages for each tool_use block
        const toolResults = [];
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: 'Search executed by server.',
            });
          }
        }
        currentMessages.push({ role: 'user', content: toolResults });
        continue;
      }

      // Any other stop reason — break
      break;
    }

    const finalContent = allTextParts.join('\n\n');
    console.log('[IE-CRM] claude:chat response length:', finalContent.length, 'search results:', allSearchResults.length);
    return {
      content: finalContent,
      searchResults: allSearchResults.length > 0 ? allSearchResults : null,
      usage: null,
    };
  } catch (err) {
    console.error('[IE-CRM] claude:chat error:', err.message);
    throw new Error(err.message);
  }
});

ipcMain.handle('claude:status', async () => {
  console.log('[IE-CRM] claude:status called, configured:', !!anthropic);
  return { configured: !!anthropic };
});

// ============================================================
// IPC HANDLERS — File Parsing
// ============================================================
ipcMain.handle('file:parse', async (_event, arrayBuffer, fileName) => {
  const ext = path.extname(fileName).toLowerCase();
  const buffer = Buffer.from(arrayBuffer);

  // PDF — return as base64 document block for Claude
  if (ext === '.pdf') {
    return {
      type: 'document',
      mediaType: 'application/pdf',
      data: buffer.toString('base64'),
      fileName,
    };
  }

  // Images — return as base64 image block for Claude vision
  const imageTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  if (imageTypes[ext]) {
    return {
      type: 'image',
      mediaType: imageTypes[ext],
      data: buffer.toString('base64'),
      fileName,
    };
  }

  // Excel — parse to CSV text using xlsx
  if (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') {
    try {
      const XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets = [];
      for (const sheetName of workbook.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        sheets.push(`=== Sheet: ${sheetName} ===\n${csv}`);
      }
      return {
        type: 'text',
        text: sheets.join('\n\n'),
        fileName,
      };
    } catch (err) {
      throw new Error(`Failed to parse Excel file: ${err.message}`);
    }
  }

  // CSV / TXT — read as text
  if (ext === '.csv' || ext === '.txt' || ext === '.tsv' || ext === '.json') {
    return {
      type: 'text',
      text: buffer.toString('utf-8'),
      fileName,
    };
  }

  throw new Error(`Unsupported file type: ${ext}`);
});

// ============================================================
// IPC HANDLERS — Airtable
// ============================================================
ipcMain.handle('airtable:fetch', async (_event, tableName, offset) => {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appQaZNM0Mt4Zul3q';
  console.log(`[IE-CRM] airtable:fetch table="${tableName}" baseId="${baseId}" keyLen=${apiKey?.length || 0} offset=${offset || 'none'}`);
  if (!apiKey) throw new Error('AIRTABLE_API_KEY not set in .env');

  let url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?pageSize=100`;
  if (offset) url += `&offset=${offset}`;
  console.log(`[IE-CRM] airtable:fetch URL: ${url}`);

  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`[IE-CRM] Airtable HTTP ${resp.status}:`, text);
    throw new Error(`Airtable error ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  console.log(`[IE-CRM] airtable:fetch got ${data.records?.length || 0} records, hasMore=${!!data.offset}`);
  return data;
});

// Test handler — returns raw API response for a single page (limit 5 records)
ipcMain.handle('airtable:test', async (_event, tableName) => {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appQaZNM0Mt4Zul3q';
  console.log(`[IE-CRM] airtable:test table="${tableName}" baseId="${baseId}" keyLen=${apiKey?.length || 0}`);

  if (!apiKey) return { error: 'AIRTABLE_API_KEY not set in .env', apiKey: null, baseId };

  const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}?pageSize=5`;
  console.log(`[IE-CRM] airtable:test URL: ${url}`);

  try {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const text = await resp.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = null; }

    return {
      status: resp.status,
      ok: resp.ok,
      baseId,
      tableName,
      url,
      rawBody: text.slice(0, 5000), // cap at 5KB for display
      parsed,
      recordCount: parsed?.records?.length || 0,
      fieldNames: parsed?.records?.[0] ? Object.keys(parsed.records[0].fields) : [],
    };
  } catch (err) {
    return { error: err.message, baseId, tableName, url };
  }
});

ipcMain.handle('airtable:status', async () => {
  const hasKey = !!process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID || 'appQaZNM0Mt4Zul3q';
  console.log(`[IE-CRM] airtable:status configured=${hasKey} baseId="${baseId}"`);
  return { configured: hasKey, baseId };
});

// ============================================================
// IPC HANDLERS — Settings
// ============================================================
ipcMain.handle('settings:getEnv', async (_event, key) => {
  // Only return non-sensitive info
  const safe = {
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID || 'appQaZNM0Mt4Zul3q',
    HAS_DATABASE_URL: !!process.env.DATABASE_URL,
    HAS_ANTHROPIC_KEY: !!process.env.ANTHROPIC_API_KEY,
    HAS_AIRTABLE_KEY: !!process.env.AIRTABLE_API_KEY,
  };
  return key ? safe[key] : safe;
});

// ============================================================
// APP LIFECYCLE
// ============================================================
app.whenReady().then(() => {
  // Set Content Security Policy
  const isDev = !app.isPackaged;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data: blob:; font-src 'self' data:"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:"
        ],
      },
    });
  });

  initDatabase();
  initAnthropic();
  createWindow();

  // Forward macOS theme changes to renderer
  nativeTheme.on('updated', () => {
    const isDark = nativeTheme.shouldUseDarkColors;
    mainWindow?.setBackgroundColor(isDark ? '#0f1117' : '#f8fafc');
    mainWindow?.webContents.send('theme:changed', isDark ? 'dark' : 'light');
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (pool) await pool.end();
});
