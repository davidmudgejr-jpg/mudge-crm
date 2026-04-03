// Express API Server — standalone backend for Railway deployment
// Mirrors all Electron IPC handlers as REST endpoints

const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');
const Anthropic = require('@anthropic-ai/sdk');
const { Server: SocketServer } = require('socket.io');
const multer = require('multer');
const { initChat, registerChatRoutes, triggerCouncilHoustonResponse } = require('./services/chat');
const { mountAiRoutes } = require('./routes/ai');
const { mountVerificationRoutes } = require('./routes/verification');
const { mountContractRoutes } = require('./routes/contracts');
const { uploadFile, deleteFile } = require('./services/fileUpload');
const { normalizeAddress, parseAddress, normalizeCompanyName } = require('./utils/addressNormalizer');
const { matchProperty, matchCompany, matchContact, matchContactTargeted, detectTable } = require('./utils/compositeMatcher');
const { buildClusters } = require('./utils/clusterBuilder');

// Load env
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Railway/Vercel)
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// ── Socket.io for real-time chat ──
const ALLOWED_ORIGINS_WS = [
  'https://ie-crm.vercel.app',
  'https://ie-crm-davidmudgejr-3693s-projects.vercel.app',
  'https://ie-crm-git-main-davidmudgejr-3693s-projects.vercel.app',
];
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS_WS.push('http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173');
}
const io = new SocketServer(server, {
  cors: { origin: ALLOWED_ORIGINS_WS, methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── File upload (multer) for chat images/attachments ──
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx|csv|txt)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'), false);
    }
  }
});

// Middleware
const ALLOWED_ORIGINS = [
  'https://ie-crm.vercel.app',
  'https://ie-crm-davidmudgejr-3693s-projects.vercel.app',
  'https://ie-crm-git-main-davidmudgejr-3693s-projects.vercel.app',
];

// Allow localhost in development
if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:5173');
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));

const rateLimit = require('express-rate-limit');

// General API rate limit: 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Too many requests, please try again later' },
});

// Strict limiter for auth endpoints: 10 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
});

app.use('/api', apiLimiter);

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
  // ── Fix pg driver DATE/TIMESTAMP parsing ──
  // By default, pg converts DATE columns to JS Date objects at midnight UTC,
  // which shifts dates by a day when displayed in Pacific time.
  // Override: return DATE as raw "YYYY-MM-DD" strings, TIMESTAMP as raw ISO strings.
  const pg = require('pg');
  const TYPES = {
    DATE: 1082,
    TIMESTAMP: 1114,
    TIMESTAMPTZ: 1184,
  };
  pg.types.setTypeParser(TYPES.DATE, (val) => val);           // "2026-03-31" stays "2026-03-31"
  pg.types.setTypeParser(TYPES.TIMESTAMP, (val) => val);      // Keep raw string
  pg.types.setTypeParser(TYPES.TIMESTAMPTZ, (val) => val);    // Keep raw string

  pool = new Pool({
    connectionString,
    ssl: (connectionString.includes('railway.app') || connectionString.includes('rlwy.net') || connectionString.includes('neon.tech'))
      ? { rejectUnauthorized: false }
      : false,
    max: 10,
    idleTimeoutMillis: 30000,
  });

  // Set session timezone to Pacific so NOW() returns Pacific time
  pool.on('connect', (client) => {
    client.query("SET timezone = 'America/Los_Angeles'");
  });

  pool.on('error', (err) => console.error('[server] Pool error:', err.message));
  console.log('[server] Database pool created (timezone: America/Los_Angeles)');
}

// ============================================================
// ANTHROPIC CLIENT (OAuth — Claude Max subscription)
// ============================================================
let anthropic;
function initAnthropic() {
  // Prefer OAuth token (Claude Max), fall back to API key
  const oauthToken = process.env.ANTHROPIC_OAUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (oauthToken) {
    anthropic = new Anthropic({ authToken: oauthToken });
    console.log('[server] Anthropic client ready (OAuth — Claude Max)');
  } else if (apiKey && apiKey.trim().length > 0) {
    anthropic = new Anthropic({ apiKey });
    console.log('[server] Anthropic client ready (API key)');
  } else {
    console.warn('[server] No ANTHROPIC_OAUTH_TOKEN or ANTHROPIC_API_KEY — Claude features disabled');
  }
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
// AUTHENTICATION
// ============================================================
const bcrypt = require('bcryptjs');
const { requireAuth, optionalAuth, requireRole, signToken } = require('./middleware/auth');
const denyReadOnly = requireRole('admin', 'broker');

// POST /api/auth/login — email + password → JWT
app.post('/api/auth/login', authLimiter, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = result.rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    // Update last_login
    await pool.query('UPDATE users SET last_login = now() WHERE user_id = $1', [user.user_id]);

    const token = signToken(user);
    res.json({
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        avatar_color: user.avatar_color,
      },
    });
  } catch (err) {
    console.error('[auth/login] Error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me — validate token, return user profile
app.get('/api/auth/me', requireAuth, async (req, res) => {
  if (!pool) return res.json(req.user);
  try {
    const result = await pool.query(
      'SELECT user_id, email, display_name, role, avatar_color FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    res.json(result.rows[0] || req.user);
  } catch {
    res.json(req.user);
  }
});

// POST /api/auth/refresh — issue a new token from a valid existing token
app.post('/api/auth/refresh', requireAuth, async (req, res) => {
  try {
    // Token is already verified by requireAuth — just issue a fresh one
    let userData = req.user;
    if (pool) {
      const result = await pool.query(
        'SELECT user_id, email, display_name, role, avatar_color FROM users WHERE user_id = $1',
        [req.user.user_id]
      );
      if (result.rows[0]) userData = result.rows[0];
    }
    const token = signToken(userData);
    res.json({
      token,
      user: {
        user_id: userData.user_id,
        email: userData.email,
        display_name: userData.display_name,
        role: userData.role,
        avatar_color: userData.avatar_color,
      },
    });
  } catch (err) {
    console.error('[auth/refresh] Error:', err.message);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', authLimiter, requireAuth, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both passwords required' });

    const result = await pool.query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.user_id]);
    const user = result.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, req.user.user_id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth/change-password] Error:', err.message);
    res.status(500).json({ error: 'Password change failed' });
  }
});

// Mount AI Master System API (uses X-Agent-Key auth, not JWT)
// Must be mounted BEFORE requireAuth so agent routes bypass JWT check
mountAiRoutes(app, {
  getPool: () => pool,
  getIo: () => io,
  getCouncilResponder: () => triggerCouncilHoustonResponse,
});

// Mount Verification Queue routes BEFORE requireAuth — has its own dual-auth (JWT or X-Agent-Key)
mountVerificationRoutes(app, { getPool: () => pool, requireAuth, optionalAuth });

// Protect all API routes below this line (except Houston completions which use optionalAuth)
app.use('/api', requireAuth);

// Mount Contracts routes (after requireAuth — needs JWT)
mountContractRoutes(app, { getPool: () => pool, requireAuth });

// ============================================================
// USER MANAGEMENT (admin only)
// ============================================================
app.get('/api/users', requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const result = await pool.query(
      'SELECT user_id, email, display_name, role, avatar_color, created_at, last_login FROM users ORDER BY created_at'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[users] List error:', err.message);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

app.post('/api/users', requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { email, display_name, password, role, avatar_color } = req.body;
    if (!email || !display_name || !password) {
      return res.status(400).json({ error: 'Email, name, and password required' });
    }
    if (!['admin', 'broker', 'readonly'].includes(role || 'broker')) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await pool.query('SELECT user_id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, display_name, password_hash, role, avatar_color)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING user_id, email, display_name, role, avatar_color, created_at`,
      [email.toLowerCase().trim(), display_name, password_hash, role || 'broker', avatar_color || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[users] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/users/:id', requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { id } = req.params;
    const { display_name, role, avatar_color } = req.body;

    const sets = [];
    const params = [];
    let idx = 1;

    if (display_name !== undefined) { sets.push(`display_name = $${idx++}`); params.push(display_name); }
    if (role !== undefined) {
      if (!['admin', 'broker', 'readonly'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      sets.push(`role = $${idx++}`); params.push(role);
    }
    if (avatar_color !== undefined) { sets.push(`avatar_color = $${idx++}`); params.push(avatar_color); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(id);
    const result = await pool.query(
      `UPDATE users SET ${sets.join(', ')} WHERE user_id = $${idx}
       RETURNING user_id, email, display_name, role, avatar_color, created_at, last_login`,
      params
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[users] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.post('/api/users/:id/reset-password', requireRole('admin'), async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const hash = await bcrypt.hash(newPassword, 12); // Houston audit H5/L5 — increased rounds
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE user_id = $2 RETURNING user_id',
      [hash, id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[users] Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ============================================================
// DATABASE ROUTES
// ============================================================
app.post('/api/db/query', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected. Set DATABASE_URL.' });

  // SECURITY: Admin-only — this endpoint executes raw SQL
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required for raw SQL queries' });
  }

  // SECURITY: Restrict to read-only queries (Houston audit C3 — 2026-03-30)
  const { sql, params } = req.body;
  if (!sql || typeof sql !== 'string') {
    return res.status(400).json({ error: 'sql string required' });
  }
  const trimmed = sql.trim();
  const upper = trimmed.toUpperCase();

  // Only allow SELECT and WITH...SELECT (read-only)
  if (!upper.startsWith('SELECT ') && !upper.startsWith('WITH ')) {
    return res.status(403).json({ error: 'Only SELECT queries are allowed via this endpoint' });
  }
  // Block chained statements (prevents SELECT 1; DROP TABLE ...)
  if (trimmed.includes(';')) {
    return res.status(403).json({ error: 'Multiple statements (semicolons) are not allowed' });
  }
  // Block DML keywords anywhere in the query (CTE abuse prevention)
  const dmlKeywords = /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|EXECUTE)\b/i;
  if (dmlKeywords.test(trimmed)) {
    return res.status(403).json({ error: 'Write operations are not allowed via this endpoint' });
  }

  try {
    const result = await pool.query(sql, params || []);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (err) {
    // Don't expose internal error details in production
    const safeMessage = process.env.NODE_ENV === 'production' ? 'Query failed' : err.message;
    res.status(400).json({ error: safeMessage });
  }
});

// ── Safe parameterized write endpoint (replaces raw SQL for mutations) ──
const ENTITY_TABLES = {
  properties:   { table: 'properties',   pk: 'property_id',    timestamp: 'last_modified' },
  contacts:     { table: 'contacts',     pk: 'contact_id',     timestamp: 'modified' },
  companies:    { table: 'companies',    pk: 'company_id',     timestamp: 'modified' },
  deals:        { table: 'deals',        pk: 'deal_id',        timestamp: 'modified' },
  interactions: { table: 'interactions', pk: 'interaction_id', timestamp: null },
  campaigns:    { table: 'campaigns',    pk: 'campaign_id',    timestamp: 'modified' },
  action_items: { table: 'action_items', pk: 'action_item_id', timestamp: 'updated_at' },
  lease_comps:  { table: 'lease_comps',  pk: 'id',             timestamp: 'updated_at' },
  sale_comps:   { table: 'sale_comps',   pk: 'id',             timestamp: 'updated_at' },
};

// Column whitelists per table (same as frontend ALLOWED_COLS)
const SERVER_ALLOWED_COLS = {
  deals: new Set([
    'deal_name', 'deal_type', 'deal_source', 'status', 'repping', 'term', 'rate', 'sf',
    'price', 'commission_rate', 'gross_fee_potential', 'net_potential', 'close_date',
    'important_date', 'deal_dead_reason', 'notes', 'priority_deal', 'increases',
    'escrow_url', 'surveys_brochures_url', 'photo_url', 'run_by', 'other_broker',
    'industry', 'deadline', 'fell_through_reason', 'lead_count', 'tags', 'overflow',
  ]),
  properties: new Set([
    'property_address', 'property_name', 'city', 'county', 'state', 'zip', 'rba',
    'land_area_ac', 'land_sf', 'far', 'property_type', 'building_class', 'building_status',
    'year_built', 'year_renovated', 'ceiling_ht', 'clear_ht', 'number_of_loading_docks',
    'drive_ins', 'column_spacing', 'sprinklers', 'power', 'construction_material', 'zoning',
    'features', 'last_sale_date', 'last_sale_price', 'price_psf', 'plsf', 'loan_amount',
    'debt_date', 'holding_period_years', 'listing_asking_lease_rate', 'cap_rate',
    'vacancy_pct', 'percent_leased', 'listing_status', 'listing_first_seen_date',
    'owner_name', 'owner_phone', 'owner_email', 'owner_address', 'tenant_name',
    'costar_url', 'google_maps_url', 'zoning_map_url', 'landvision_url',
    'notes', 'tags', 'overflow', 'building_image_path',
  ]),
  contacts: new Set([
    'full_name', 'first_name', 'last_name', 'email', 'phone', 'mobile', 'title',
    'company_name', 'notes', 'city', 'tags', 'overflow', 'type', 'source',
  ]),
  companies: new Set([
    'company_name', 'company_type', 'industry_type', 'website', 'sf', 'employees',
    'revenue', 'company_growth', 'company_hq', 'lease_exp', 'lease_months_left',
    'move_in_date', 'notes', 'city', 'tenant_sic', 'tenant_naics', 'suite', 'tags', 'overflow',
  ]),
  interactions: new Set([
    'type', 'subject', 'date', 'notes', 'email_heading', 'email_body',
    'follow_up', 'follow_up_notes', 'lead_source', 'lead_status', 'lead_interest',
    'team_member', 'email_url', 'email_id',
  ]),
  campaigns: new Set([
    'name', 'status', 'sent_date', 'subject', 'body', 'notes', 'tags',
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
};

app.post('/api/db/update', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { entity, id, fields } = req.body;
  if (!entity || !id || !fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'entity, id, and fields required' });
  }
  const meta = ENTITY_TABLES[entity];
  if (!meta) return res.status(400).json({ error: `Unknown entity: ${entity}` });

  const allowed = SERVER_ALLOWED_COLS[entity];
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

  // Validate all field names against whitelist
  for (const k of keys) {
    if (allowed && !allowed.has(k)) {
      return res.status(400).json({ error: `Disallowed field "${k}" for ${entity}` });
    }
    if (!/^[a-z_][a-z0-9_]*$/.test(k)) {
      return res.status(400).json({ error: `Invalid field name: ${k}` });
    }
  }

  try {
    const sets = keys.map((k, i) => `${k} = $${i + 2}`);
    if (meta.timestamp) sets.push(`${meta.timestamp} = NOW()`);
    const sql = `UPDATE ${meta.table} SET ${sets.join(', ')} WHERE ${meta.pk} = $1 RETURNING *`;
    const result = await pool.query(sql, [id, ...Object.values(fields)]);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (err) {
    console.error(`[db/update] ${entity} error:`, err.message);
    res.status(400).json({ error: err.message });
  }
});

// ── Safe parameterized create endpoint with duplicate detection ──
// compositeMatcher is required below with CSV import routes (matchProperty, matchCompany, matchContact)

app.post('/api/db/create', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  const { entity, fields, skipDuplicateCheck } = req.body;
  if (!entity || !fields || typeof fields !== 'object') {
    return res.status(400).json({ error: 'entity and fields required' });
  }
  const meta = ENTITY_TABLES[entity];
  if (!meta) return res.status(400).json({ error: `Unknown entity: ${entity}` });

  const allowed = SERVER_ALLOWED_COLS[entity];
  const keys = Object.keys(fields);
  if (keys.length === 0) return res.status(400).json({ error: 'No fields provided' });

  // Validate all field names against whitelist
  for (const k of keys) {
    if (allowed && !allowed.has(k)) {
      return res.status(400).json({ error: `Disallowed field "${k}" for ${entity}` });
    }
    if (!/^[a-z_][a-z0-9_]*$/.test(k)) {
      return res.status(400).json({ error: `Invalid field name: ${k}` });
    }
  }

  try {
    // Duplicate detection for contacts, properties, companies
    if (!skipDuplicateCheck && ['contacts', 'properties', 'companies'].includes(entity)) {
      let matchResult = null;

      if (entity === 'contacts') {
        matchResult = await matchContactTargeted(pool, { full_name: fields.full_name, email_1: fields.email });
      } else if (entity === 'properties') {
        const existing = await pool.query(
          `SELECT property_id, property_address, city, zip FROM properties`
        );
        matchResult = matchProperty(
          { property_address: fields.property_address, city: fields.city, zip: fields.zip },
          existing.rows
        );
      } else if (entity === 'companies') {
        const existing = await pool.query(
          `SELECT company_id, company_name, city FROM companies`
        );
        matchResult = matchCompany(fields.company_name, existing.rows, fields.city);
      }

      if (matchResult && (matchResult.match || matchResult.candidates?.length > 0)) {
        return res.json({
          duplicateWarning: true,
          match: matchResult.match,
          candidates: matchResult.candidates || [],
          level: matchResult.level,
        });
      }
    }

    // No duplicates (or skipped check) — insert
    const id = require('crypto').randomUUID();
    const cols = [meta.pk, ...keys];
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const sql = `INSERT INTO ${meta.table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = await pool.query(sql, [id, ...Object.values(fields)]);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (err) {
    console.error(`[db/create] ${entity} error:`, err.message);
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
      model: 'claude-sonnet-4-20250514',
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
// AI PROXY ROUTES (OAuth Bearer token — Claude Max subscription)
// ============================================================
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const AI_MODEL = 'claude-sonnet-4-20250514';
const AI_MAX_TOKENS = 4096;

// Rate limiter for AI endpoints: 30 requests/minute per user
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.user_id || 'anon',
  validate: { xForwardedForHeader: false, default: true },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit reached. Try again in a minute.' },
});

// Get auth credentials — prefers API key, falls back to OAuth token
function getAnthropicAuth() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) return { type: 'api-key', token: apiKey };
  const oauthToken = process.env.ANTHROPIC_OAUTH_TOKEN;
  if (oauthToken) return { type: 'oauth', token: oauthToken };
  return null;
}

function buildAnthropicHeaders(auth) {
  const headers = {
    'Content-Type': 'application/json',
    'anthropic-version': '2023-06-01',
  };
  if (auth.type === 'api-key') {
    headers['x-api-key'] = auth.token;
  } else {
    headers['Authorization'] = `Bearer ${auth.token}`;
  }
  return headers;
}

function buildAnthropicPayload(body) {
  const { messages, system, max_tokens } = body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { error: 'messages array is required' };
  }
  return {
    model: AI_MODEL,
    max_tokens: max_tokens || AI_MAX_TOKENS,
    messages,
    ...(system ? { system } : {}),
  };
}

function handleAnthropicError(status, data) {
  if (status === 429) return { code: 429, message: 'Claude is rate limited. Please wait a moment and try again.' };
  if (status === 529) return { code: 529, message: 'Claude is temporarily overloaded. Try again in a few seconds.' };
  if (status === 401) return { code: 401, message: 'OAuth token is invalid or expired. Check ANTHROPIC_OAUTH_TOKEN on Railway.' };
  return { code: status, message: data?.error?.message || `Anthropic API error (${status})` };
}

// POST /api/ai/chat — SSE streaming proxy
app.post('/api/ai/chat', aiLimiter, async (req, res) => {
  const auth = getAnthropicAuth();
  if (!auth) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY on Railway.' });

  const payload = buildAnthropicPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: { ...buildAnthropicHeaders(auth) },
      body: JSON.stringify({ ...payload, stream: true }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const err = handleAnthropicError(response.status, errData);
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      res.end();
      return;
    }

    // Pipe the SSE stream from Anthropic to the client
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }

    res.end();
  } catch (err) {
    console.error('[ai/chat] Stream error:', err.message);
    res.write(`data: ${JSON.stringify({ type: 'error', error: 'Connection to Claude failed' })}\n\n`);
    res.end();
  }
});

// POST /api/ai/chat/sync — non-streaming JSON response
app.post('/api/ai/chat/sync', aiLimiter, async (req, res) => {
  const auth = getAnthropicAuth();
  if (!auth) return res.status(503).json({ error: 'AI not configured. Set ANTHROPIC_API_KEY on Railway.' });

  const payload = buildAnthropicPayload(req.body);
  if (payload.error) return res.status(400).json({ error: payload.error });

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: { ...buildAnthropicHeaders(auth) },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const err = handleAnthropicError(response.status, data);
      return res.status(err.code).json({ error: err.message });
    }

    // Extract text content from response
    const text = (data.content || [])
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n\n');

    res.json({
      content: text,
      model: data.model,
      usage: data.usage,
      stop_reason: data.stop_reason,
    });
  } catch (err) {
    console.error('[ai/chat/sync] Error:', err.message);
    res.status(500).json({ error: 'Failed to reach Claude' });
  }
});

// GET /api/ai/status — health check
app.get('/api/ai/status', async (_req, res) => {
  const auth = getAnthropicAuth();
  if (!auth) return res.json({ status: 'not_configured', configured: false, message: 'ANTHROPIC_API_KEY not set' });

  return res.json({ status: 'connected', configured: true, model: AI_MODEL, auth: auth.type });

  /* Legacy validation code — kept for reference but disabled to avoid unnecessary API calls
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      }),
    });

    if (response.ok) {
      res.json({ status: 'connected', configured: true, model: AI_MODEL });
    } else {
      const data = await response.json().catch(() => ({}));
      const err = handleAnthropicError(response.status, data);
      res.json({ status: 'error', message: err.message });
    }
  } catch (err) {
    res.json({ status: 'error', message: err.message });
  }
  */
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
// compositeMatcher and addressNormalizer already required at top of file

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
    'loan_amount', 'debt_date', 'holding_period_years', 'listing_asking_lease_rate',
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
    // Listing / market intelligence
    'listing_status', 'listing_first_seen_date',
    // Notes & misc
    'notes', 'overflow',
  ]),
  contacts: new Set([
    'full_name', 'first_name', 'type', 'title', 'email_1', 'email_2', 'email_3',
    'phone_1', 'phone_2', 'phone_3', 'phone_hot', 'email_hot', 'email_kickback',
    'home_address', 'work_address', 'work_city', 'work_state', 'work_zip',
    'date_of_birth', 'client_level', 'active_need', 'notes', 'linkedin',
    'follow_up', 'last_contacted', 'data_source', 'tags', 'airtable_id', 'overflow',
    'white_pages_url', 'been_verified_url', 'zoom_info_url',
    'property_type_interest', 'lease_months_left', 'tenant_space_fit',
    'tenant_ownership_intent', 'business_trajectory', 'last_call_result',
    'follow_up_behavior', 'decision_authority', 'price_cost_awareness',
    'frustration_signals', 'exit_trigger_events',
    'owner_name_verified', 'email_1_confidence', 'email_2_confidence',
    'email_1_source', 'email_2_source', 'email_1_verified', 'email_2_verified',
    'phone_1_type', 'phone_2_type', 'phone_1_verified', 'phone_2_verified',
    'phone_1_source', 'phone_2_source', 'enrichment_source_trail',
    'campaign_ready', 'enriched_by', 'enrichment_notes', 'enrichment_decay_check',
    'last_email_sent', 'last_email_opened', 'last_email_replied', 'email_bounce_count',
    'last_text_sent', 'last_text_replied', 'last_call_attempted', 'outreach_stage',
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
app.post('/api/bulk-delete', requireRole('admin'), async (req, res) => {
  try {
    const { table, ids } = req.body;
    // SECURITY: Explicit whitelist validation (Houston audit C1 — 2026-03-30)
    const VALID_BULK_DELETE_TABLES = Object.keys(TABLE_ID_COL);
    if (!VALID_BULK_DELETE_TABLES.includes(table)) return res.status(400).json({ error: `Invalid table: ${table}` });
    const idCol = TABLE_ID_COL[table];
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'No IDs provided' });
    if (ids.length > 500) return res.status(400).json({ error: 'Max 500 IDs per request' });

    // Use parameterized ANY($1) instead of string interpolation for safety
    const result = await pool.query(
      `DELETE FROM "${table}" WHERE "${idCol}" = ANY($1::uuid[])`,
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
      const ctRes = await pool.query('SELECT contact_id, full_name, email_1, email_2, email_3 FROM contacts');
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
      if (matchContacts && (row.email_1 || row.email || row.full_name)) {
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
app.post('/api/import/batch', denyReadOnly, async (req, res) => {
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
      'plsf','price_per_sqft','price_psf','rba','listing_asking_lease_rate','stories','total_available_sf','units',
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
        _link_campaign: { junction: 'deal_campaigns',  col1: 'deal_id', col2: 'campaign_id', role: null, type: 'campaign', textCol: null },
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
      const ctRes = await pool.query('SELECT contact_id, full_name, email_1, email_2, email_3 FROM contacts');
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
// AI OPS — Sandbox Management & Agent Infrastructure
// ============================================================

// Allowed sandbox tables (whitelist for security)
const SANDBOX_TABLES = ['sandbox_contacts', 'sandbox_enrichments', 'sandbox_signals', 'sandbox_outreach'];

// GET /api/ai/sandbox/:table — List sandbox items with filtering
app.get('/api/ai/sandbox/:table', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const table = req.params.table;
    if (!SANDBOX_TABLES.includes(table)) return res.status(400).json({ error: 'Invalid sandbox table' });
    const status = req.query.status || 'pending';
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    const validStatuses = ['pending', 'approved', 'rejected', 'promoted', 'sent'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status filter' });
    const result = await pool.query(
      `SELECT * FROM ${table} WHERE status = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM ${table} WHERE status = $1`,
      [status]
    );
    res.json({ rows: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    console.error('[ai/sandbox] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/sandbox/:table/review — Approve or reject a sandbox item
app.post('/api/ai/sandbox/:table/review', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const table = req.params.table;
    if (!SANDBOX_TABLES.includes(table)) return res.status(400).json({ error: 'Invalid sandbox table' });
    const { id, decision, review_notes, reviewed_by } = req.body;
    if (!id || !decision) return res.status(400).json({ error: 'id and decision required' });
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be approved or rejected' });
    const result = await pool.query(
      `UPDATE ${table} SET status = $1, review_notes = $2, reviewed_by = $3, reviewed_at = NOW(), updated_at = NOW() WHERE id = $4 AND status = 'pending' RETURNING *`,
      [decision, review_notes || null, reviewed_by || 'david', id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found or already reviewed' });
    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error('[ai/sandbox/review] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/ai/sandbox/contacts/promote — Promote approved sandbox contact to production
app.post('/api/ai/sandbox/contacts/promote', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const { sandbox_id } = req.body;
    if (!sandbox_id) return res.status(400).json({ error: 'sandbox_id required' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sandbox = await client.query('SELECT * FROM sandbox_contacts WHERE id = $1 AND status = $2', [sandbox_id, 'approved']);
      if (sandbox.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'No approved sandbox contact with that ID' }); }
      const sc = sandbox.rows[0];
      let existingId = null;
      if (sc.email_1 || sc.email) {
        const existing = await client.query('SELECT contact_id FROM contacts WHERE email_1 = $1', [sc.email_1 || sc.email]);
        if (existing.rows.length > 0) existingId = existing.rows[0].contact_id;
      }
      let contactId;
      if (existingId) {
        await client.query(
          `UPDATE contacts SET phone_1 = COALESCE($1, phone_1), phone_2 = COALESCE($2, phone_2),
            home_address = COALESCE($3, home_address), work_address = COALESCE($4, work_address),
            title = COALESCE($5, title), linkedin = COALESCE($6, linkedin), last_modified = NOW()
          WHERE contact_id = $7`,
          [sc.phone_1, sc.phone_2, sc.home_address, sc.work_address, sc.title, sc.linkedin, existingId]
        );
        contactId = existingId;
      } else {
        const insert = await client.query(
          `INSERT INTO contacts (full_name, first_name, email_1, email_2, email_3, phone_1, phone_2, phone_3,
            home_address, work_address, work_city, work_state, work_zip, title, type, linkedin, data_source)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING contact_id`,
          [sc.full_name, sc.first_name, sc.email_1 || sc.email, sc.email_2, sc.email_3, sc.phone_1, sc.phone_2, sc.phone_3,
           sc.home_address, sc.work_address, sc.work_city, sc.work_state, sc.work_zip, sc.title, sc.type, sc.linkedin,
           sc.data_source || 'AI Agent: ' + sc.agent_name]
        );
        contactId = insert.rows[0].contact_id;
      }
      await client.query(`UPDATE sandbox_contacts SET status = 'promoted', promoted_at = NOW(), promoted_to_id = $1, updated_at = NOW() WHERE id = $2`, [contactId, sandbox_id]);
      await client.query('COMMIT');
      res.json({ success: true, contact_id: contactId, was_merge: !!existingId });
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }
  } catch (err) {
    console.error('[ai/sandbox/promote] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ai/heartbeats — Agent fleet health status
app.get('/api/ai/heartbeats', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const result = await pool.query('SELECT * FROM agent_heartbeats ORDER BY agent_name');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai/heartbeat — Agent heartbeat upsert
app.post('/api/ai/heartbeat', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const { agent_name, tier, status, current_task, items_processed_today, items_in_queue, last_error, metadata } = req.body;
    if (!agent_name || !tier) return res.status(400).json({ error: 'agent_name and tier required' });
    const result = await pool.query(
      `INSERT INTO agent_heartbeats (agent_name, tier, status, current_task, items_processed_today, items_in_queue, last_error, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (agent_name) DO UPDATE SET
         tier = $2, status = $3, current_task = $4, items_processed_today = $5,
         items_in_queue = $6, last_error = $7, metadata = $8, updated_at = NOW()
       RETURNING *`,
      [agent_name, tier, status || 'idle', current_task, items_processed_today || 0, items_in_queue || 0, last_error, metadata || {}]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/ai/log — Agent activity log
app.post('/api/ai/log', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const { agent_name, log_type, content, metrics } = req.body;
    if (!agent_name || !content) return res.status(400).json({ error: 'agent_name and content required' });
    const result = await pool.query(
      `INSERT INTO agent_logs (agent_name, log_type, content, metrics) VALUES ($1, $2, $3, $4) RETURNING *`,
      [agent_name, log_type || 'activity', content, metrics || {}]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai/sandbox/summary — Dashboard summary across all sandbox tables
app.get('/api/ai/sandbox/summary', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const counts = {};
    for (const table of SANDBOX_TABLES) {
      const result = await pool.query(`SELECT status, COUNT(*) as count FROM ${table} GROUP BY status`);
      counts[table] = {};
      result.rows.forEach(r => { counts[table][r.status] = parseInt(r.count); });
    }
    res.json(counts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/ai/convergence — Detect signal convergence (multiple agents flagging same entity)
app.get('/api/ai/convergence', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not configured' });
    const hours = parseInt(req.query.hours) || 48;
    const result = await pool.query(`
      WITH recent_signals AS (
        SELECT unnest(crm_property_ids) AS entity_id, 'property' AS entity_type,
               signal_type, agent_name, confidence_score, created_at
        FROM sandbox_signals
        WHERE created_at > NOW() - ($1 || ' hours')::interval AND crm_property_ids IS NOT NULL
        UNION ALL
        SELECT contact_id AS entity_id, 'contact' AS entity_type,
               'outreach' AS signal_type, agent_name, confidence_score, created_at
        FROM sandbox_outreach
        WHERE created_at > NOW() - ($1 || ' hours')::interval AND contact_id IS NOT NULL
        UNION ALL
        SELECT contact_id AS entity_id, 'contact' AS entity_type,
               'enrichment' AS signal_type, agent_name, confidence_score, created_at
        FROM sandbox_enrichments
        WHERE created_at > NOW() - ($1 || ' hours')::interval AND contact_id IS NOT NULL
      ),
      convergence AS (
        SELECT entity_id, entity_type,
               COUNT(DISTINCT agent_name) AS agent_count, COUNT(*) AS signal_count,
               AVG(confidence_score) AS avg_confidence,
               array_agg(DISTINCT agent_name) AS agents_involved,
               array_agg(DISTINCT signal_type) AS signal_types,
               MIN(created_at) AS first_signal, MAX(created_at) AS last_signal
        FROM recent_signals
        GROUP BY entity_id, entity_type
        HAVING COUNT(DISTINCT agent_name) >= 2 OR COUNT(*) >= 3
      )
      SELECT c.*, (c.agent_count * 15 + c.signal_count * 10 + c.avg_confidence * 0.5)::integer AS convergence_score
      FROM convergence c ORDER BY convergence_score DESC LIMIT 20
    `, [hours]);
    res.json(result.rows);
  } catch (err) {
    console.error('[ai/convergence] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
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
      mature_30d_points: 20, mature_90d_points: 15, mature_over90d_points: 10,
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

// ── TPE Data Gap Endpoints ──
app.get('/api/ai/tpe-gaps', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected. Set DATABASE_URL.' });
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    const gapType = req.query.gap_type;
    const typeFilters = {
      age: 'AND age_gap_pts > 0',
      growth: 'AND growth_gap_pts > 0',
      stress: 'AND stress_gap_pts > 0',
      ownership: 'AND ownership_gap_pts > 0',
    };
    const typeFilter = typeFilters[gapType] || '';
    const result = await pool.query(
      `SELECT * FROM property_data_gaps
       WHERE total_gap_pts > 0 ${typeFilter}
       ORDER BY impact_priority DESC
       LIMIT $1`,
      [limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai/tpe-gaps/stats', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected. Set DATABASE_URL.' });
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE age_gap_pts > 0) AS missing_owner_dob,
        COUNT(*) FILTER (WHERE growth_gap_pts > 0) AS missing_tenant_growth,
        COUNT(*) FILTER (WHERE stress_gap_pts > 0) AS missing_loan_data,
        COUNT(*) FILTER (WHERE ownership_gap_pts > 0) AS missing_owner_link,
        COUNT(*) AS total_properties_with_gaps
      FROM property_data_gaps
      WHERE total_gap_pts > 0
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// AI OPS DASHBOARD ROUTES
// ============================================================

// Dashboard summary: agent statuses + pending counts + pipeline + costs
app.get('/api/ai/dashboard/summary', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const [heartbeats, pending, logRecent, pipeline, costs] = await Promise.all([
      pool.query('SELECT agent_name, tier, status, current_task, items_processed_today, items_in_queue, last_error, metadata, updated_at FROM agent_heartbeats ORDER BY tier, agent_name'),
      pool.query(`
        SELECT 'contacts' as table_name, COUNT(*) as count FROM sandbox_contacts WHERE status = 'pending'
        UNION ALL SELECT 'enrichments', COUNT(*) FROM sandbox_enrichments WHERE status = 'pending'
        UNION ALL SELECT 'signals', COUNT(*) FROM sandbox_signals WHERE status = 'pending'
        UNION ALL SELECT 'outreach', COUNT(*) FROM sandbox_outreach WHERE status = 'pending'
      `),
      pool.query("SELECT agent_name, log_type, content, created_at FROM agent_logs ORDER BY created_at DESC LIMIT 20"),
      // Pipeline stage counts
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM sandbox_signals WHERE status = 'pending') as scout_queue,
          (SELECT COUNT(*) FROM sandbox_enrichments WHERE status = 'pending') as enricher_queue,
          (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'pending') as matcher_queue,
          (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'approved') as approved,
          (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'rejected') as rejected
      `).catch(() => ({ rows: [{}] })),
      // Cost totals (today + this month)
      pool.query(`
        SELECT
          COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= CURRENT_DATE), 0) as cost_today,
          COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)), 0) as cost_month,
          COALESCE(SUM(tokens_used) FILTER (WHERE created_at >= CURRENT_DATE), 0) as tokens_today,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as calls_today
        FROM ai_usage_tracking
      `).catch(() => ({ rows: [{}] })),
    ]);
    res.json({
      agents: heartbeats.rows,
      pending: pending.rows,
      recentLogs: logRecent.rows,
      pipeline: pipeline.rows[0] || {},
      costs: costs.rows[0] || {},
    });
  } catch (err) {
    console.error('[ai/dashboard/summary] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Pipeline: counts per stage
app.get('/api/ai/dashboard/pipeline', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sandbox_signals WHERE status = 'pending') as scout_queue,
        (SELECT COUNT(*) FROM sandbox_enrichments WHERE status = 'pending') as enricher_queue,
        (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'pending') as matcher_queue,
        (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'approved') as approved_today,
        (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'rejected') as rejected_today
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[ai/dashboard/pipeline] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Costs: usage tracking aggregation
app.get('/api/ai/dashboard/costs', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { period = 'day' } = req.query;
    const trunc = period === 'week' ? 'week' : period === 'month' ? 'month' : 'day';
    const result = await pool.query(`
      SELECT
        DATE_TRUNC($1, created_at) as period,
        agent_name,
        SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost,
        COUNT(*) as api_calls
      FROM ai_usage_tracking
      GROUP BY 1, 2
      ORDER BY 1 DESC, 2
      LIMIT 200
    `, [trunc]);
    res.json(result.rows);
  } catch (err) {
    console.error('[ai/dashboard/costs] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Logs: filterable, paginated
app.get('/api/ai/logs', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { agent, type, limit = 50 } = req.query;
    let where = [];
    let params = [];
    let idx = 1;
    if (agent) { where.push(`agent_name = $${idx++}`); params.push(agent); }
    if (type) { where.push(`log_type = $${idx++}`); params.push(type); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(Math.min(parseInt(limit) || 50, 500));
    const result = await pool.query(
      `SELECT id, agent_name, log_type, content, metrics, created_at
       FROM agent_logs ${whereClause}
       ORDER BY created_at DESC LIMIT $${idx}`, params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[ai/logs] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// COUNCIL CHANNEL ROUTES (JWT auth — user-facing)
// ============================================================

// GET /api/council/messages — Read council messages (paginated)
app.get('/api/council/messages', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { limit = 50, before } = req.query;
    const lim = Math.min(parseInt(limit) || 50, 200);

    // Find council channel
    const ch = await pool.query(
      "SELECT id FROM chat_channels WHERE channel_type = 'council' LIMIT 1"
    );
    if (ch.rows.length === 0) {
      return res.json([]);
    }
    const councilChannelId = ch.rows[0].id;

    let query = `
      SELECT m.*,
             CASE
               WHEN m.sender_type = 'houston' THEN COALESCE(m.houston_meta->>'sender_name', 'Houston')
               ELSE COALESCE(u.display_name, 'Admin')
             END AS sender_name,
             CASE
               WHEN m.sender_type = 'houston' AND m.message_type = 'council_action_request' THEN '#AF52DE'
               WHEN m.sender_type = 'houston' AND m.message_type = 'council_recommendation' THEN '#AF52DE'
               WHEN m.sender_type = 'houston' THEN '#818cf8'
               ELSE COALESCE(u.avatar_color, '#007AFF')
             END AS sender_color,
             m.houston_meta->>'message_type' AS council_message_type,
             p.id AS proposal_id,
             p.status AS proposal_status,
             p.approval_notes,
             p.reviewed_at AS proposal_reviewed_at,
             (SELECT display_name FROM users WHERE user_id = p.approved_by) AS proposal_reviewed_by
      FROM chat_messages m
      LEFT JOIN users u ON m.sender_id = u.user_id
      LEFT JOIN council_proposals p ON p.message_id = m.id
      WHERE m.channel_id = $1 AND m.deleted_at IS NULL
    `;
    const params = [councilChannelId];

    if (before) {
      query += ` AND m.created_at < $${params.length + 1}`;
      params.push(before);
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(lim);

    const result = await pool.query(query, params);
    // Return chronological order (oldest first)
    res.json(result.rows.reverse());
  } catch (err) {
    console.error('[council/messages] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch council messages' });
  }
});

// POST /api/council/message — Admin posts message to council
app.post('/api/council/message', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const ch = await pool.query(
      "SELECT id FROM chat_channels WHERE channel_type = 'council' LIMIT 1"
    );
    if (ch.rows.length === 0) {
      return res.status(404).json({ error: 'Council channel not found' });
    }
    const councilChannelId = ch.rows[0].id;

    const result = await pool.query(
      `INSERT INTO chat_messages
         (channel_id, sender_id, sender_type, body, message_type)
       VALUES ($1, $2, 'user', $3, 'text')
       RETURNING *`,
      [councilChannelId, req.user.user_id, message]
    );

    const newMessage = result.rows[0];
    // Fetch sender info
    const userInfo = await pool.query(
      'SELECT display_name, avatar_color FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    if (userInfo.rows[0]) {
      newMessage.sender_name = userInfo.rows[0].display_name;
      newMessage.sender_color = userInfo.rows[0].avatar_color;
    }

    // Emit via Socket.io
    if (io) {
      io.to('council').emit('council:message:new', newMessage);
    }

    // Trigger Houston Sonnet auto-response (async, don't block the response)
    triggerCouncilHoustonResponse(newMessage).catch(err =>
      console.error('[council/message] Houston auto-response error:', err.message)
    );

    res.json({ ok: true, message: newMessage });
  } catch (err) {
    console.error('[council/message] Error:', err.message);
    res.status(500).json({ error: 'Failed to post council message' });
  }
});

// POST /api/council/approve — Approve or reject a council proposal
app.post('/api/council/approve', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { messageId, approved, notes } = req.body;
    if (!messageId || typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'messageId and approved (boolean) are required' });
    }

    const newStatus = approved ? 'approved' : 'rejected';
    const result = await pool.query(
      `UPDATE council_proposals
       SET status = $1, approved_by = $2, approval_notes = $3, reviewed_at = NOW()
       WHERE message_id = $4 AND status = 'pending'
       RETURNING *`,
      [newStatus, req.user.user_id, notes || null, messageId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found or already reviewed' });
    }

    // Post a system message about the decision
    const ch = await pool.query(
      "SELECT id FROM chat_channels WHERE channel_type = 'council' LIMIT 1"
    );
    if (ch.rows.length > 0) {
      const statusEmoji = approved ? '✅' : '❌';
      const statusLabel = approved ? 'APPROVED' : 'REJECTED';
      const systemMsg = await pool.query(
        `INSERT INTO chat_messages
           (channel_id, sender_id, sender_type, body, message_type)
         VALUES ($1, $2, 'user', $3, 'system')
         RETURNING *`,
        [
          ch.rows[0].id,
          req.user.user_id,
          `${statusEmoji} Proposal ${statusLabel} by ${req.user.display_name}${notes ? `: ${notes}` : ''}`,
        ]
      );

      // Emit via Socket.io
      if (io) {
        const msg = systemMsg.rows[0];
        msg.sender_name = req.user.display_name;
        io.to('council').emit('council:message:new', msg);
        io.to('council').emit('council:proposal:updated', {
          messageId,
          status: newStatus,
          reviewedBy: req.user.display_name,
          notes,
        });
      }

      // If approved, relay to Team Chat
      if (approved) {
        const generalCh = await pool.query(
          "SELECT id FROM chat_channels WHERE name = 'General' AND channel_type = 'group' LIMIT 1"
        );
        if (generalCh.rows.length > 0) {
          const relayMsg = await pool.query(
            `INSERT INTO chat_messages
               (channel_id, sender_id, sender_type, body, message_type, houston_meta)
             VALUES ($1, NULL, 'houston', $2, 'houston_insight', $3)
             RETURNING *`,
            [
              generalCh.rows[0].id,
              `📋 **Council Approved:** ${result.rows[0].proposal_text}`,
              JSON.stringify({
                trigger: 'council_approval',
                sender_name: 'Houston',
                proposal_id: result.rows[0].id,
              }),
            ]
          );
          if (io) {
            const relayed = relayMsg.rows[0];
            relayed.sender_name = 'Houston';
            relayed.sender_color = '#10b981';
            io.to(`channel:${generalCh.rows[0].id}`).emit('chat:message:new', relayed);
          }
        }
      }
    }

    res.json({ ok: true, proposal: result.rows[0] });
  } catch (err) {
    console.error('[council/approve] Error:', err.message);
    res.status(500).json({ error: 'Failed to update proposal' });
  }
});

// GET /api/council/proposals — Get pending proposals
app.get('/api/council/proposals', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { status = 'pending' } = req.query;
    const result = await pool.query(
      `SELECT p.*, m.body AS message_body, m.created_at AS message_created_at
       FROM council_proposals p
       JOIN chat_messages m ON m.id = p.message_id
       WHERE p.status = $1
       ORDER BY p.created_at DESC`,
      [status]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[council/proposals] Error:', err.message);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// GET /api/council/channel-id — Get the council channel ID
app.get('/api/council/channel-id', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const ch = await pool.query(
      "SELECT id FROM chat_channels WHERE channel_type = 'council' LIMIT 1"
    );
    if (ch.rows.length === 0) {
      return res.status(404).json({ error: 'Council channel not found' });
    }
    res.json({ channelId: ch.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// SAVED VIEWS ROUTES
// ============================================================

const VALID_VIEW_ENTITY_TYPES = new Set([
  'properties', 'contacts', 'companies', 'deals', 'interactions', 'campaigns',
]);

// GET /api/views — list views for an entity type
app.get('/api/views', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not connected. Set DATABASE_URL.' });
    const { entity_type } = req.query;
    if (!entity_type || !VALID_VIEW_ENTITY_TYPES.has(entity_type)) {
      return res.status(400).json({ error: 'Invalid or missing entity_type' });
    }
    const result = await pool.query(
      'SELECT * FROM saved_views WHERE entity_type = $1 ORDER BY position ASC, created_at ASC',
      [entity_type]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/views — create a new view
app.post('/api/views', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not connected. Set DATABASE_URL.' });
    const { entity_type, view_name, filters, filter_logic, sort_column, sort_direction, visible_columns, position, column_order, group_by_column } = req.body;
    if (!entity_type || !VALID_VIEW_ENTITY_TYPES.has(entity_type)) {
      return res.status(400).json({ error: 'Invalid or missing entity_type' });
    }
    if (!view_name || !view_name.trim()) {
      return res.status(400).json({ error: 'view_name is required' });
    }
    const createdBy = req.user?.display_name || null;
    const result = await pool.query(
      `INSERT INTO saved_views (entity_type, view_name, filters, filter_logic, sort_column, sort_direction, visible_columns, position, column_order, group_by_column, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        entity_type,
        view_name.trim(),
        JSON.stringify(filters || []),
        filter_logic === 'OR' ? 'OR' : 'AND',
        sort_column || null,
        sort_direction === 'ASC' ? 'ASC' : 'DESC',
        visible_columns ? JSON.stringify(visible_columns) : null,
        position || 0,
        column_order ? JSON.stringify(column_order) : null,
        group_by_column || null,
        createdBy,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/views/:viewId — update a view (partial)
app.patch('/api/views/:viewId', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not connected. Set DATABASE_URL.' });
    const { viewId } = req.params;
    const updates = req.body;

    // Handle is_default in a transaction (clear old default first)
    if (updates.is_default === true) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const viewRes = await client.query('SELECT entity_type FROM saved_views WHERE view_id = $1', [viewId]);
        if (viewRes.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'View not found' });
        }
        const entityType = viewRes.rows[0].entity_type;
        await client.query(
          'UPDATE saved_views SET is_default = FALSE WHERE entity_type = $1 AND view_id != $2',
          [entityType, viewId]
        );
        await client.query(
          'UPDATE saved_views SET is_default = TRUE, updated_at = NOW() WHERE view_id = $1',
          [viewId]
        );
        await client.query('COMMIT');
        const result = await client.query('SELECT * FROM saved_views WHERE view_id = $1', [viewId]);
        res.json(result.rows[0]);
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      return;
    }

    // Normal partial update
    const allowed = ['view_name', 'filters', 'filter_logic', 'sort_column', 'sort_direction', 'visible_columns', 'is_default', 'position', 'column_order', 'group_by_column'];
    const sets = [];
    const params = [viewId]; // $1 = viewId
    let i = 2;
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        const val = (key === 'filters' || key === 'visible_columns' || key === 'column_order')
          ? JSON.stringify(updates[key])
          : updates[key];
        sets.push(`${key} = $${i}`);
        params.push(val);
        i++;
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

    sets.push('updated_at = NOW()');
    const sql = `UPDATE saved_views SET ${sets.join(', ')} WHERE view_id = $1 RETURNING *`;
    const result = await pool.query(sql, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'View not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/views/:viewId — delete a view
app.delete('/api/views/:viewId', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not connected. Set DATABASE_URL.' });
    const { viewId } = req.params;
    const result = await pool.query('DELETE FROM saved_views WHERE view_id = $1 RETURNING view_id', [viewId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'View not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PDF EXPORT TEMPLATES
// ============================================================

// GET /api/pdf-templates?entity_type=contacts
app.get('/api/pdf-templates', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not connected.' });
    const { entity_type } = req.query;
    const result = entity_type
      ? await pool.query('SELECT * FROM pdf_templates WHERE entity_type = $1 ORDER BY created_at ASC', [entity_type])
      : await pool.query('SELECT * FROM pdf_templates ORDER BY entity_type, created_at ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/pdf-templates — create a template
app.post('/api/pdf-templates', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not connected.' });
    const { entity_type, name, primary_fields, linked_types } = req.body;
    if (!entity_type || !name?.trim()) return res.status(400).json({ error: 'entity_type and name required' });
    const result = await pool.query(
      `INSERT INTO pdf_templates (entity_type, name, primary_fields, linked_types, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [entity_type, name.trim(), JSON.stringify(primary_fields || []), JSON.stringify(linked_types || {}), req.user?.name || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/pdf-templates/:id
app.delete('/api/pdf-templates/:id', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database not connected.' });
    const result = await pool.query('DELETE FROM pdf_templates WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Template not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// HOUSTON VOICE — ElevenLabs Conversational AI (Custom LLM)
// ============================================================
const { buildPrompt: buildHoustonPrompt } = require('./services/houstonRAG');

// GET /api/houston/context — Pre-flight context for Houston dynamic variables
app.get('/api/houston/context', async (req, res) => {
  try {
    const userId = req.user?.user_id;

    // Parallel queries for speed
    const [dealsRes, tasksRes, userRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS count FROM deals WHERE status NOT IN ('Closed Won', 'Closed Lost', 'Dead')`
      ),
      pool.query(
        `SELECT COUNT(*) AS count FROM action_items WHERE completed = false AND (due_date IS NULL OR due_date <= CURRENT_DATE + INTERVAL '1 day')`
      ),
      userId
        ? pool.query('SELECT last_login FROM users WHERE user_id = $1', [userId])
        : Promise.resolve({ rows: [] }),
    ]);

    // Time of day (Pacific)
    const pt = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const hour = pt.getHours();
    const timeOfDay = hour >= 5 && hour < 12 ? 'morning'
      : hour >= 12 && hour < 17 ? 'afternoon'
      : hour >= 17 && hour < 21 ? 'evening' : 'night';

    res.json({
      active_deal_count: parseInt(dealsRes.rows[0]?.count || '0'),
      pending_tasks: parseInt(tasksRes.rows[0]?.count || '0'),
      time_of_day: timeOfDay,
      last_login: userRes.rows[0]?.last_login || null,
    });
  } catch (err) {
    console.error('[houston] Context error:', err.message);
    res.json({ active_deal_count: 0, pending_tasks: 0, time_of_day: 'unknown', last_login: null });
  }
});

// GET /api/houston/signed-url — Get a temporary WebSocket URL from ElevenLabs
app.get('/api/houston/signed-url', async (req, res) => {
  try {
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (!agentId) {
      return res.status(500).json({ error: 'ElevenLabs agent not configured' });
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY } }
    );

    if (!response.ok) {
      const body = await response.text();
      console.error('[houston] Signed URL failed:', response.status, body);
      return res.status(502).json({ error: 'Failed to get signed URL from ElevenLabs' });
    }

    const data = await response.json();
    res.json({ url: data.signed_url });
  } catch (err) {
    console.error('[houston] Signed URL error:', err.message);
    res.status(500).json({ error: 'Failed to generate signed URL' });
  }
});

// Houston completions handler — shared between both route aliases
async function houstonCompletions(req, res) {
  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    if (!anthropic) {
      return res.status(503).json({ error: 'Claude not configured' });
    }

    // Extract latest user message for logging
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const message = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : lastUserMsg?.content?.map(c => c.text || '').join('') || '';

    // Extract user identity from ElevenLabs custom_llm_extra_body
    const userName = req.body.user_name || req.body.custom_llm_extra_body?.user_name || null;
    console.log('[houston] ConvAI completions from', userName || 'unknown', ':', message.slice(0, 80));

    // Build RAG system prompt with live CRM data + user personalization
    const systemPrompt = await buildHoustonPrompt(pool, userName);

    // Strip ElevenLabs' system message, keep user/assistant turns
    const conversationMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? m.content
          : m.content?.map(c => c.text || '').join('') || '',
      }));

    // Stream Claude response in OpenAI SSE format
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const chunkId = `chatcmpl-${Date.now()}`;
    const created = Math.floor(Date.now() / 1000);
    let isFirstChunk = true;

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      system: systemPrompt,
      messages: conversationMessages,
      max_tokens: 300,
    });

    let fullResponse = '';

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        const text = event.delta.text;
        fullResponse += text;

        const delta = isFirstChunk
          ? { role: 'assistant', content: text }
          : { content: text };
        isFirstChunk = false;

        res.write(`data: ${JSON.stringify({
          id: chunkId,
          object: 'chat.completion.chunk',
          created,
          model: 'claude-sonnet-4-20250514',
          choices: [{ index: 0, delta, finish_reason: null }],
        })}\n\n`);
      }
    }

    // Send stop chunk
    res.write(`data: ${JSON.stringify({
      id: chunkId,
      object: 'chat.completion.chunk',
      created,
      model: 'claude-sonnet-4-20250514',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();

    console.log('[houston] Response complete:', fullResponse.slice(0, 80));

  } catch (err) {
    console.error('[houston] Completions error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat completion failed' });
    } else {
      res.write(`data: ${JSON.stringify({
        id: `chatcmpl-err-${Date.now()}`,
        object: 'chat.completion.chunk',
        choices: [{ delta: { content: '' }, index: 0, finish_reason: 'error' }],
      })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }
}

// POST /api/houston/completions — direct route
app.post('/api/houston/completions', houstonCompletions);

// POST /v1/chat/completions — OpenAI-compatible alias that ElevenLabs calls
// ElevenLabs appends /chat/completions to the Server URL automatically
// SECURITY: Requires either Agent API key or valid JWT — this is NOT under /api so requireAuth doesn't cover it
app.post('/v1/chat/completions', (req, res, next) => {
  // Check for agent key (ElevenLabs / external integrations)
  const agentKey = req.headers['x-agent-key'] || req.headers['authorization']?.replace('Bearer ', '');
  const validAgentKey = process.env.AGENT_API_KEY;
  if (validAgentKey && agentKey === validAgentKey) {
    return next();
  }

  // Check for JWT (browser-based calls)
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const { EFFECTIVE_JWT_SECRET } = require('./middleware/auth');
      jwt.verify(header.slice(7), EFFECTIVE_JWT_SECRET);
      return next();
    } catch { /* invalid JWT, fall through */ }
  }

  return res.status(401).json({ error: 'Authentication required — provide X-Agent-Key or Bearer JWT' });
}, houstonCompletions);

// ============================================================
// TEAM CHAT — REST endpoints + file upload
// ============================================================
registerChatRoutes(app);

// POST /api/files/upload — Generic file upload (Vercel Blob + local fallback)
// Query param: ?folder=deals|properties|chat|general (default: general)
app.post('/api/files/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const file = req.file;
    const folder = req.query.folder || 'general';

    // Read the temp file multer wrote to disk, then upload via shared service
    const filePath = path.join(uploadsDir, file.filename);
    const fileBuffer = fs.readFileSync(filePath);
    const result = await uploadFile(fileBuffer, file.filename, folder, file.mimetype, file.size);

    // Clean up multer's temp file if Blob upload succeeded (URL won't be local)
    if (!result.url.startsWith('/uploads/')) {
      try { fs.unlinkSync(filePath); } catch {}
    }

    res.json({ ...result, original_name: file.originalname });
  } catch (err) {
    console.error('[files] Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// POST /api/chat/upload — Chat file upload (uses shared service, folder = "chat")
app.post('/api/chat/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const file = req.file;

    const filePath = path.join(uploadsDir, file.filename);
    const fileBuffer = fs.readFileSync(filePath);
    const result = await uploadFile(fileBuffer, file.filename, 'chat', file.mimetype, file.size);

    if (!result.url.startsWith('/uploads/')) {
      try { fs.unlinkSync(filePath); } catch {}
    }

    res.json({
      url: result.url,
      filename: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
    });
  } catch (err) {
    console.error('[chat] Upload error:', err.message);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Serve locally uploaded files (fallback for dev)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ============================================================
// DATA TRUST TIERS ENDPOINTS
// ============================================================

const TRUST_TIER_SQL = `CASE
  WHEN data_source ILIKE '%Own%' THEN 'gold'
  WHEN data_source LIKE '%,%,%' THEN 'gold'
  WHEN data_source LIKE '%,%' THEN 'silver'
  WHEN data_source IS NOT NULL AND data_source != '' THEN 'bronze'
  ELSE 'untracked'
END`;

// GET /api/data-trust/overview — aggregate counts
app.get('/api/data-trust/overview', requireAuth, async (req, res) => {
  try {
    const { rows: tiers } = await pool.query(`
      SELECT ${TRUST_TIER_SQL} AS tier, count(*)::int AS count
      FROM contacts GROUP BY tier ORDER BY count DESC
    `);
    const { rows: [enrichment] } = await pool.query(`
      SELECT
        count(*)::int AS total,
        count(email_1)::int AS has_email,
        count(CASE WHEN campaign_ready THEN 1 END)::int AS campaign_ready,
        count(CASE WHEN enrichment_status != 'not_started' THEN 1 END)::int AS enrichment_started
      FROM contacts
    `);
    const { rows: [suggestions] } = await pool.query(`
      SELECT count(*)::int AS pending FROM suggested_updates WHERE status = 'pending'
    `);
    res.json({
      tiers: Object.fromEntries(tiers.map(r => [r.tier, r.count])),
      enrichment,
      pendingSuggestions: suggestions.pending,
    });
  } catch (err) {
    console.error('[data-trust] overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-trust/contacts — paginated contacts with computed tier
app.get('/api/data-trust/contacts', requireAuth, async (req, res) => {
  try {
    const tier = req.query.tier || 'all';
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    const tierFilter = tier !== 'all'
      ? `WHERE (${TRUST_TIER_SQL}) = $3`
      : '';
    const params = tier !== 'all' ? [limit, offset, tier] : [limit, offset];

    const { rows } = await pool.query(`
      SELECT contact_id, full_name, type, email_1, phone_1,
             data_source, enrichment_status, campaign_ready,
             ${TRUST_TIER_SQL} AS trust_tier
      FROM contacts
      ${tierFilter}
      ORDER BY
        CASE ${TRUST_TIER_SQL}
          WHEN 'gold' THEN 1 WHEN 'silver' THEN 2
          WHEN 'bronze' THEN 3 ELSE 4
        END,
        full_name ASC NULLS LAST
      LIMIT $1 OFFSET $2
    `, params);

    const { rows: [{ count }] } = await pool.query(`
      SELECT count(*)::int FROM contacts ${tierFilter}
    `, tier !== 'all' ? [tier] : []);

    res.json({ rows, total: count, page, limit });
  } catch (err) {
    console.error('[data-trust] contacts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-trust/suggestions — list suggested updates
app.get('/api/data-trust/suggestions', requireAuth, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await pool.query(`
      SELECT * FROM suggested_updates
      WHERE status = $1
      ORDER BY confidence DESC, created_at DESC
      LIMIT 100
    `, [status]);
    res.json({ rows, total: rows.length });
  } catch (err) {
    console.error('[data-trust] suggestions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data-trust/suggestions/:id/resolve — accept or reject
app.post('/api/data-trust/suggestions/:id/resolve', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { action, notes } = req.body; // action: 'accepted' or 'rejected'
    if (!['accepted', 'rejected'].includes(action)) {
      return res.status(400).json({ error: 'Action must be accepted or rejected' });
    }

    await client.query('BEGIN');

    // Update the suggestion
    const { rows: [suggestion] } = await client.query(`
      UPDATE suggested_updates
      SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3, updated_at = NOW()
      WHERE id = $4 RETURNING *
    `, [action, req.user?.email || 'user', notes || null, id]);

    if (!suggestion) throw new Error('Suggestion not found');

    // If accepted, apply the change to the actual record
    if (action === 'accepted') {
      const { validateColumn, quoteIdentifier, validateTable } = require('./utils/sqlSafety');
      const table = { contact: 'contacts', property: 'properties', company: 'companies' }[suggestion.entity_type];
      const idCol = { contact: 'contact_id', property: 'property_id', company: 'company_id' }[suggestion.entity_type];
      if (table && idCol) {
        // SECURITY: Validate field_name against whitelist (Houston audit C5 — 2026-03-30)
        validateColumn(suggestion.field_name, table);
        await client.query(
          `UPDATE "${table}" SET ${quoteIdentifier(suggestion.field_name)} = $1, updated_at = NOW() WHERE "${idCol}" = $2`,
          [suggestion.suggested_value, suggestion.entity_id]
        );
        await client.query(
          `UPDATE suggested_updates SET applied = true, applied_at = NOW() WHERE id = $1`,
          [id]
        );
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, applied: action === 'accepted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[data-trust] resolve error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// DEDUP REVIEW ENDPOINTS
// ============================================================

// GET /api/dedup/candidates — list dedup candidates with optional status filter
app.get('/api/dedup/candidates', requireAuth, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await pool.query(`
      SELECT dc.*,
             pa.property_address AS addr_a, pa.city AS city_a, pa.property_type AS type_a, pa.rba AS rba_a,
             pb.property_address AS addr_b, pb.city AS city_b, pb.property_type AS type_b, pb.rba AS rba_b
      FROM dedup_candidates dc
      JOIN properties pa ON pa.property_id = dc.property_a_id
      JOIN properties pb ON pb.property_id = dc.property_b_id
      WHERE dc.status = $1
      ORDER BY
        CASE dc.confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        dc.created_at DESC
    `, [status]);
    res.json({ rows, total: rows.length });
  } catch (err) {
    console.error('[dedup] list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dedup/stats — quick counts by status
app.get('/api/dedup/stats', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT status, count(*)::int AS count FROM dedup_candidates GROUP BY status
    `);
    const stats = { pending: 0, merged: 0, dismissed: 0, deferred: 0 };
    rows.forEach(r => { stats[r.status] = r.count; });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dedup/resolve — dismiss or defer a candidate
app.post('/api/dedup/resolve', requireAuth, async (req, res) => {
  try {
    const { candidateId, status, notes } = req.body;
    if (!['dismissed', 'deferred'].includes(status)) {
      return res.status(400).json({ error: 'Status must be dismissed or deferred' });
    }
    await pool.query(`
      UPDATE dedup_candidates
      SET status = $1, resolved_by = $2, resolved_at = NOW(), merge_notes = $3, updated_at = NOW()
      WHERE id = $4
    `, [status, req.user?.username || 'user', notes || null, candidateId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[dedup] resolve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dedup/merge — merge two properties (keep one, absorb the other)
app.post('/api/dedup/merge', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { candidateId, keepId, removeId } = req.body;
    if (!keepId || !removeId || keepId === removeId) {
      return res.status(400).json({ error: 'Invalid keepId/removeId' });
    }

    await client.query('BEGIN');

    // 1. Merge data: fill NULL fields in keeper with data from duplicate
    const { rows: [keeper] } = await client.query('SELECT * FROM properties WHERE property_id = $1', [keepId]);
    const { rows: [dupe] } = await client.query('SELECT * FROM properties WHERE property_id = $1', [removeId]);
    if (!keeper || !dupe) throw new Error('Property not found');

    // Build SET clause for NULL fields in keeper that have values in dupe
    const skipCols = new Set(['property_id', 'created_at', 'updated_at', 'normalized_address']);
    const fills = [];
    const vals = [];
    let paramIdx = 1;
    for (const [col, val] of Object.entries(dupe)) {
      if (skipCols.has(col)) continue;
      if (val != null && val !== '' && (keeper[col] == null || keeper[col] === '')) {
        fills.push(`${col} = $${paramIdx}`);
        vals.push(val);
        paramIdx++;
      }
    }
    if (fills.length > 0) {
      vals.push(keepId);
      await client.query(`UPDATE properties SET ${fills.join(', ')}, updated_at = NOW() WHERE property_id = $${paramIdx}`, vals);
    }

    // 2. Reassign all junction table references from removeId to keepId
    const junctions = [
      { table: 'property_contacts', col: 'property_id' },
      { table: 'property_companies', col: 'property_id' },
      { table: 'property_deals', col: 'property_id' },
      { table: 'deal_properties', col: 'property_id' },
      { table: 'interaction_properties', col: 'property_id' },
      { table: 'action_item_properties', col: 'property_id' },
    ];
    let movedLinks = 0;
    for (const { table, col } of junctions) {
      // Delete rows that would conflict (same entity already linked to keeper)
      try {
        const otherCols = (await client.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name != $2 AND column_name != 'role'`,
          [table, col]
        )).rows.map(r => r.column_name);

        if (otherCols.length > 0) {
          // Delete conflicting rows where the other entity is already linked to keepId
          for (const oc of otherCols) {
            await client.query(
              `DELETE FROM ${table} WHERE ${col} = $1 AND ${oc} IN (SELECT ${oc} FROM ${table} WHERE ${col} = $2)`,
              [removeId, keepId]
            );
          }
        }
        // Move remaining rows
        const { rowCount } = await client.query(`UPDATE ${table} SET ${col} = $1 WHERE ${col} = $2`, [keepId, removeId]);
        movedLinks += rowCount;
      } catch (e) {
        // Table might not exist or column mismatch — skip silently
      }
    }

    // 3. Also reassign lease_comps and sale_comps
    const { rowCount: lc } = await client.query('UPDATE lease_comps SET property_id = $1 WHERE property_id = $2', [keepId, removeId]);
    const { rowCount: sc } = await client.query('UPDATE sale_comps SET property_id = $1 WHERE property_id = $2', [keepId, removeId]);
    movedLinks += lc + sc;

    // 4. Delete the duplicate property
    await client.query('DELETE FROM properties WHERE property_id = $1', [removeId]);

    // 5. Update dedup_candidates record
    const direction = keepId === req.body.propertyAId ? 'a_absorbs_b' : 'b_absorbs_a';
    await client.query(`
      UPDATE dedup_candidates
      SET status = 'merged', resolved_by = $1, resolved_at = NOW(),
          merge_direction = $2, merge_notes = $3, updated_at = NOW()
      WHERE id = $4
    `, [req.user?.username || 'user', direction, `Merged. ${fills.length} fields filled, ${movedLinks} links moved.`, candidateId]);

    // 6. Dismiss any other candidates referencing the removed property
    await client.query(`
      UPDATE dedup_candidates
      SET status = 'dismissed', resolved_by = 'auto', resolved_at = NOW(),
          merge_notes = 'Auto-dismissed: property was merged in another candidate', updated_at = NOW()
      WHERE status = 'pending' AND (property_a_id = $1 OR property_b_id = $1)
    `, [removeId]);

    await client.query('COMMIT');
    res.json({ ok: true, fieldsFilled: fills.length, linksMoved: movedLinks });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[dedup] merge error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// CONTACT DEDUP REVIEW ENDPOINTS
// ============================================================

app.get('/api/dedup/contact-candidates', requireAuth, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await pool.query(`
      SELECT dc.*,
             ca.full_name AS name_a, ca.email_1 AS email_a, ca.phone_1 AS phone_a, ca.title AS title_a,
             cb.full_name AS name_b, cb.email_1 AS email_b, cb.phone_1 AS phone_b, cb.title AS title_b
      FROM contact_dedup_candidates dc
      JOIN contacts ca ON ca.contact_id = dc.contact_a_id
      JOIN contacts cb ON cb.contact_id = dc.contact_b_id
      WHERE dc.status = $1
      ORDER BY
        CASE dc.confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        dc.created_at DESC
    `, [status]);
    res.json({ rows, total: rows.length });
  } catch (err) {
    console.error('[dedup] contact list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dedup/contact-stats', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT status, count(*)::int AS count FROM contact_dedup_candidates GROUP BY status`
    );
    const stats = { pending: 0, merged: 0, dismissed: 0, deferred: 0 };
    rows.forEach(r => { stats[r.status] = r.count; });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dedup/contact-resolve', requireAuth, async (req, res) => {
  try {
    const { candidateId, status, notes } = req.body;
    if (!['dismissed', 'deferred'].includes(status)) {
      return res.status(400).json({ error: 'Status must be dismissed or deferred' });
    }
    await pool.query(`
      UPDATE contact_dedup_candidates
      SET status = $1, resolved_by = $2, resolved_at = NOW(), merge_notes = $3, updated_at = NOW()
      WHERE id = $4
    `, [status, req.user?.username || 'user', notes || null, candidateId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[dedup] contact resolve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dedup/contact-merge', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { candidateId, keepId, removeId } = req.body;
    if (!keepId || !removeId || keepId === removeId) {
      return res.status(400).json({ error: 'Invalid keepId/removeId' });
    }

    await client.query('BEGIN');

    // 1. Backfill NULL fields in keeper from dupe
    const { rows: [keeper] } = await client.query('SELECT * FROM contacts WHERE contact_id = $1', [keepId]);
    const { rows: [dupe] } = await client.query('SELECT * FROM contacts WHERE contact_id = $1', [removeId]);
    if (!keeper || !dupe) throw new Error('Contact not found');

    const skipCols = new Set(['contact_id', 'created_at', 'updated_at']);
    const fills = [], vals = [];
    let paramIdx = 1;
    for (const [col, val] of Object.entries(dupe)) {
      if (skipCols.has(col)) continue;
      if (val != null && val !== '' && (keeper[col] == null || keeper[col] === '')) {
        fills.push(`"${col}" = $${paramIdx}`);
        vals.push(val);
        paramIdx++;
      }
    }
    if (fills.length > 0) {
      vals.push(keepId);
      await client.query(`UPDATE contacts SET ${fills.join(', ')}, updated_at = NOW() WHERE contact_id = $${paramIdx}`, vals);
    }

    // 2. Reassign junction table links
    const junctions = [
      'contact_companies', 'property_contacts', 'deal_contacts',
      'interaction_contacts', 'action_item_contacts', 'campaign_contacts',
    ];
    let movedLinks = 0;
    for (const table of junctions) {
      // Delete conflicting rows first
      try {
        await client.query(
          `DELETE FROM ${table} WHERE contact_id = $1 AND EXISTS (
            SELECT 1 FROM ${table} k WHERE k.contact_id = $2 AND k.ctid != ${table}.ctid
          )`, [removeId, keepId]
        ).catch(() => {});
        // Move remaining
        const { rowCount } = await client.query(
          `UPDATE ${table} SET contact_id = $1 WHERE contact_id = $2`, [keepId, removeId]
        );
        movedLinks += rowCount;
      } catch (e) {
        if (e.message.includes('duplicate key') || e.message.includes('unique constraint')) {
          await client.query(`DELETE FROM ${table} WHERE contact_id = $1`, [removeId]);
        }
      }
    }

    // 3. Delete the duplicate
    await client.query('DELETE FROM contacts WHERE contact_id = $1', [removeId]);

    // 4. Update candidate record
    await client.query(`
      UPDATE contact_dedup_candidates
      SET status = 'merged', resolved_by = $1, resolved_at = NOW(),
          merge_notes = $2, updated_at = NOW()
      WHERE id = $3
    `, [req.user?.username || 'user', `Merged. ${fills.length} fields filled, ${movedLinks} links moved.`, candidateId]);

    // 5. Auto-dismiss other candidates referencing the removed contact
    await client.query(`
      UPDATE contact_dedup_candidates
      SET status = 'dismissed', resolved_by = 'auto', resolved_at = NOW(),
          merge_notes = 'Auto-dismissed: contact was merged in another candidate', updated_at = NOW()
      WHERE status = 'pending' AND (contact_a_id = $1 OR contact_b_id = $1)
    `, [removeId]);

    await client.query('COMMIT');
    res.json({ ok: true, fieldsFilled: fills.length, linksMoved: movedLinks });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[dedup] contact merge error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// COMPANY DEDUP REVIEW ENDPOINTS
// ============================================================

app.get('/api/dedup/company-candidates', requireAuth, async (req, res) => {
  try {
    const status = req.query.status || 'pending';
    const { rows } = await pool.query(`
      SELECT dc.*,
             ca.company_name AS name_a, ca.company_type AS type_a, ca.city AS city_a, ca.industry_type AS industry_a,
             cb.company_name AS name_b, cb.company_type AS type_b, cb.city AS city_b, cb.industry_type AS industry_b
      FROM company_dedup_candidates dc
      JOIN companies ca ON ca.company_id = dc.company_a_id
      JOIN companies cb ON cb.company_id = dc.company_b_id
      WHERE dc.status = $1
      ORDER BY
        CASE dc.confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
        dc.created_at DESC
    `, [status]);
    res.json({ rows, total: rows.length });
  } catch (err) {
    console.error('[dedup] company list error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dedup/company-stats', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT status, count(*)::int AS count FROM company_dedup_candidates GROUP BY status`
    );
    const stats = { pending: 0, merged: 0, dismissed: 0, deferred: 0 };
    rows.forEach(r => { stats[r.status] = r.count; });
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dedup/company-resolve', requireAuth, async (req, res) => {
  try {
    const { candidateId, status, notes } = req.body;
    if (!['dismissed', 'deferred'].includes(status)) {
      return res.status(400).json({ error: 'Status must be dismissed or deferred' });
    }
    await pool.query(`
      UPDATE company_dedup_candidates
      SET status = $1, resolved_by = $2, resolved_at = NOW(), merge_notes = $3, updated_at = NOW()
      WHERE id = $4
    `, [status, req.user?.username || 'user', notes || null, candidateId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[dedup] company resolve error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/dedup/company-merge', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { candidateId, keepId, removeId } = req.body;
    if (!keepId || !removeId || keepId === removeId) {
      return res.status(400).json({ error: 'Invalid keepId/removeId' });
    }

    await client.query('BEGIN');

    // 1. Backfill NULL fields in keeper from dupe
    const { rows: [keeper] } = await client.query('SELECT * FROM companies WHERE company_id = $1', [keepId]);
    const { rows: [dupe] } = await client.query('SELECT * FROM companies WHERE company_id = $1', [removeId]);
    if (!keeper || !dupe) throw new Error('Company not found');

    const skipCols = new Set(['company_id', 'created_at', 'updated_at']);
    const fills = [], vals = [];
    let paramIdx = 1;
    for (const [col, val] of Object.entries(dupe)) {
      if (skipCols.has(col)) continue;
      if (val != null && val !== '' && (keeper[col] == null || keeper[col] === '')) {
        fills.push(`"${col}" = $${paramIdx}`);
        vals.push(val);
        paramIdx++;
      }
    }
    if (fills.length > 0) {
      vals.push(keepId);
      await client.query(`UPDATE companies SET ${fills.join(', ')}, updated_at = NOW() WHERE company_id = $${paramIdx}`, vals);
    }

    // 2. Reassign junction table links
    const fkTables = [
      'contact_companies', 'property_companies', 'deal_companies',
      'interaction_companies', 'action_item_companies', 'tenant_growth',
    ];
    let movedLinks = 0;
    for (const table of fkTables) {
      try {
        await client.query(
          `DELETE FROM ${table} WHERE company_id = $1 AND EXISTS (
            SELECT 1 FROM ${table} k WHERE k.company_id = $2 AND k.ctid != ${table}.ctid
          )`, [removeId, keepId]
        ).catch(() => {});
        const { rowCount } = await client.query(
          `UPDATE ${table} SET company_id = $1 WHERE company_id = $2`, [keepId, removeId]
        );
        movedLinks += rowCount;
      } catch (e) {
        if (e.message.includes('duplicate key') || e.message.includes('unique constraint')) {
          await client.query(`DELETE FROM ${table} WHERE company_id = $1`, [removeId]);
        }
      }
    }

    // 3. Reassign lease_comps
    try {
      const { rowCount } = await client.query(
        'UPDATE lease_comps SET company_id = $1 WHERE company_id = $2', [keepId, removeId]
      );
      movedLinks += rowCount;
    } catch (e) { /* no company_id col or conflict — skip */ }

    // 4. Delete the duplicate
    await client.query('DELETE FROM companies WHERE company_id = $1', [removeId]);

    // 5. Update candidate record
    await client.query(`
      UPDATE company_dedup_candidates
      SET status = 'merged', resolved_by = $1, resolved_at = NOW(),
          merge_notes = $2, updated_at = NOW()
      WHERE id = $3
    `, [req.user?.username || 'user', `Merged. ${fills.length} fields filled, ${movedLinks} links moved.`, candidateId]);

    // 6. Auto-dismiss other candidates referencing the removed company
    await client.query(`
      UPDATE company_dedup_candidates
      SET status = 'dismissed', resolved_by = 'auto', resolved_at = NOW(),
          merge_notes = 'Auto-dismissed: company was merged in another candidate', updated_at = NOW()
      WHERE status = 'pending' AND (company_a_id = $1 OR company_b_id = $1)
    `, [removeId]);

    await client.query('COMMIT');
    res.json({ ok: true, fieldsFilled: fills.length, linksMoved: movedLinks });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[dedup] company merge error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// CLUSTER-BASED DEDUP ENDPOINTS (v2)
// ============================================================

// Centralized config for all entity types
const DEDUP_CONFIG = {
  property: {
    table: 'properties', idCol: 'property_id',
    candidateTable: 'dedup_candidates', idACol: 'property_a_id', idBCol: 'property_b_id',
    displayCol: 'property_address',
    junctions: [
      { table: 'property_contacts', col: 'property_id' },
      { table: 'property_companies', col: 'property_id' },
      { table: 'property_deals', col: 'property_id' },
      { table: 'deal_properties', col: 'property_id' },
      { table: 'interaction_properties', col: 'property_id' },
      { table: 'action_item_properties', col: 'property_id' },
    ],
    directTables: [
      { table: 'lease_comps', col: 'property_id' },
      { table: 'sale_comps', col: 'property_id' },
    ],
    skipCols: new Set(['property_id', 'created_at', 'updated_at', 'normalized_address']),
  },
  contact: {
    table: 'contacts', idCol: 'contact_id',
    candidateTable: 'contact_dedup_candidates', idACol: 'contact_a_id', idBCol: 'contact_b_id',
    displayCol: 'full_name',
    junctions: [
      { table: 'contact_companies', col: 'contact_id' },
      { table: 'property_contacts', col: 'contact_id' },
      { table: 'deal_contacts', col: 'contact_id' },
      { table: 'interaction_contacts', col: 'contact_id' },
      { table: 'action_item_contacts', col: 'contact_id' },
      { table: 'campaign_contacts', col: 'contact_id' },
    ],
    directTables: [],
    skipCols: new Set(['contact_id', 'created_at', 'updated_at']),
  },
  company: {
    table: 'companies', idCol: 'company_id',
    candidateTable: 'company_dedup_candidates', idACol: 'company_a_id', idBCol: 'company_b_id',
    displayCol: 'company_name',
    junctions: [
      { table: 'contact_companies', col: 'company_id' },
      { table: 'property_companies', col: 'company_id' },
      { table: 'deal_companies', col: 'company_id' },
      { table: 'interaction_companies', col: 'company_id' },
      { table: 'action_item_companies', col: 'company_id' },
    ],
    directTables: [
      { table: 'tenant_growth', col: 'company_id' },
      { table: 'lease_comps', col: 'company_id' },
    ],
    skipCols: new Set(['company_id', 'created_at', 'updated_at']),
  },
};

// Count linked records for an entity
async function countLinkedRecords(pool, entityType, entityId) {
  const cfg = DEDUP_CONFIG[entityType];
  const counts = {};
  for (const j of [...cfg.junctions, ...cfg.directTables]) {
    try {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS n FROM ${j.table} WHERE ${j.col} = $1`, [entityId]
      );
      counts[j.table] = rows[0]?.n || 0;
    } catch { counts[j.table] = 0; }
  }
  counts.total = Object.values(counts).reduce((s, n) => s + n, 0);
  return counts;
}

// GET /api/dedup/clusters — clustered dedup candidates with full entity records
app.get('/api/dedup/clusters', requireAuth, async (req, res) => {
  try {
    const entityType = req.query.entityType || 'property';
    const status = req.query.status || 'pending';
    const cfg = DEDUP_CONFIG[entityType];
    if (!cfg) return res.status(400).json({ error: 'Invalid entityType' });

    // 1. Fetch all candidates for this status
    const { rows: candidates } = await pool.query(
      `SELECT * FROM ${cfg.candidateTable} WHERE status = $1
       ORDER BY CASE confidence WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`,
      [status]
    );

    // 2. Build clusters via Union-Find
    const clusters = buildClusters(candidates, cfg.idACol, cfg.idBCol);

    // 3. Collect all unique entity IDs across all clusters
    const allIds = new Set();
    for (const cl of clusters) {
      for (const id of cl.entityIds) allIds.add(id);
    }
    if (allIds.size === 0) return res.json({ clusters: [], stats: {} });

    // 4. Batch-fetch full records
    const idArr = [...allIds];
    const placeholders = idArr.map((_, i) => `$${i + 1}`).join(',');
    const { rows: entities } = await pool.query(
      `SELECT * FROM ${cfg.table} WHERE ${cfg.idCol} IN (${placeholders})`, idArr
    );
    const entityMap = new Map(entities.map(e => [e[cfg.idCol], e]));

    // 5. Batch-fetch linked record counts
    const linkCountMap = new Map();
    await Promise.all(idArr.map(async (id) => {
      linkCountMap.set(id, await countLinkedRecords(pool, entityType, id));
    }));

    // 6. Assemble response
    const result = clusters.map(cl => ({
      clusterId: cl.clusterId,
      confidence: cl.confidence,
      matchTypes: cl.matchTypes,
      candidateIds: cl.candidates.map(c => c.id),
      entities: cl.entityIds.map(id => ({
        ...entityMap.get(id),
        _linkedCounts: linkCountMap.get(id) || {},
      })).filter(e => e[cfg.idCol]), // filter out any deleted entities
    }));

    // Also fetch stats
    const { rows: statsRows } = await pool.query(
      `SELECT status, count(*)::int AS count FROM ${cfg.candidateTable} GROUP BY status`
    );
    const stats = { pending: 0, merged: 0, dismissed: 0, deferred: 0 };
    for (const r of statsRows) stats[r.status] = r.count;

    res.json({ clusters: result, stats });
  } catch (err) {
    console.error('[dedup] clusters error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dedup/cluster-merge — field-level multi-record merge
app.post('/api/dedup/cluster-merge', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { entityType, keeperId, removeIds, fieldOverrides = {} } = req.body;
    const cfg = DEDUP_CONFIG[entityType];
    if (!cfg) return res.status(400).json({ error: 'Invalid entityType' });
    if (!keeperId || !removeIds || removeIds.length === 0) {
      return res.status(400).json({ error: 'keeperId and removeIds required' });
    }

    await client.query('BEGIN');

    // 1. Snapshot all records for audit
    const allIds = [keeperId, ...removeIds];
    const ph = allIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows: allRecords } = await client.query(
      `SELECT * FROM ${cfg.table} WHERE ${cfg.idCol} IN (${ph})`, allIds
    );
    const recordMap = new Map(allRecords.map(r => [r[cfg.idCol], r]));
    const keeper = recordMap.get(keeperId);
    if (!keeper) throw new Error('Keeper record not found');

    const keeperSnapshot = { ...keeper };
    const removedSnapshots = removeIds.map(id => recordMap.get(id)).filter(Boolean);

    // 2. Apply explicit field overrides to keeper
    let overrideCount = 0;
    const overrideSets = [];
    const overrideVals = [];
    let pi = 1;
    for (const [field, { value }] of Object.entries(fieldOverrides)) {
      if (cfg.skipCols.has(field)) continue;
      overrideSets.push(`${field} = $${pi}`);
      overrideVals.push(value);
      pi++;
      overrideCount++;
    }
    if (overrideSets.length > 0) {
      overrideVals.push(keeperId);
      await client.query(
        `UPDATE ${cfg.table} SET ${overrideSets.join(', ')}, updated_at = NOW() WHERE ${cfg.idCol} = $${pi}`,
        overrideVals
      );
    }

    // 3. Backfill remaining NULLs from removed records (first non-null wins)
    // Re-fetch keeper after overrides
    const { rows: [updatedKeeper] } = await client.query(
      `SELECT * FROM ${cfg.table} WHERE ${cfg.idCol} = $1`, [keeperId]
    );
    const fills = [];
    const fillVals = [];
    let fi = 1;
    for (const col of Object.keys(updatedKeeper)) {
      if (cfg.skipCols.has(col)) continue;
      if (updatedKeeper[col] != null && updatedKeeper[col] !== '') continue;
      // Find first non-null from removes
      for (const rid of removeIds) {
        const rec = recordMap.get(rid);
        if (rec && rec[col] != null && rec[col] !== '') {
          fills.push(`${col} = $${fi}`);
          fillVals.push(rec[col]);
          fi++;
          break;
        }
      }
    }
    if (fills.length > 0) {
      fillVals.push(keeperId);
      await client.query(
        `UPDATE ${cfg.table} SET ${fills.join(', ')}, updated_at = NOW() WHERE ${cfg.idCol} = $${fi}`,
        fillVals
      );
    }

    // 4. Reassign junction tables for each removed record
    let movedLinks = 0;
    const junctionChanges = [];
    for (const removeId of removeIds) {
      for (const { table: jTable, col: jCol } of cfg.junctions) {
        try {
          const otherCols = (await client.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name != $2 AND column_name != 'role'`,
            [jTable, jCol]
          )).rows.map(r => r.column_name);

          let deleted = 0;
          if (otherCols.length > 0) {
            for (const oc of otherCols) {
              const { rowCount } = await client.query(
                `DELETE FROM ${jTable} WHERE ${jCol} = $1 AND ${oc} IN (SELECT ${oc} FROM ${jTable} WHERE ${jCol} = $2)`,
                [removeId, keeperId]
              );
              deleted += rowCount;
            }
          }
          const { rowCount } = await client.query(
            `UPDATE ${jTable} SET ${jCol} = $1 WHERE ${jCol} = $2`, [keeperId, removeId]
          );
          movedLinks += rowCount;
          if (rowCount > 0 || deleted > 0) {
            junctionChanges.push({ table: jTable, removeId, moved: rowCount, deleted });
          }
        } catch (e) { /* table may not exist */ }
      }

      // 5. Reassign direct tables (comps, tenant_growth)
      for (const { table: dTable, col: dCol } of cfg.directTables) {
        try {
          const { rowCount } = await client.query(
            `UPDATE ${dTable} SET ${dCol} = $1 WHERE ${dCol} = $2`, [keeperId, removeId]
          );
          movedLinks += rowCount;
        } catch (e) { /* table may not exist */ }
      }
    }

    // 6. Delete removed records
    for (const removeId of removeIds) {
      await client.query(`DELETE FROM ${cfg.table} WHERE ${cfg.idCol} = $1`, [removeId]);
    }

    // 7. Mark all related candidates as merged
    for (const removeId of removeIds) {
      await client.query(`
        UPDATE ${cfg.candidateTable}
        SET status = 'merged', resolved_by = $1, resolved_at = NOW(),
            merge_notes = 'Cluster merge', updated_at = NOW()
        WHERE status = 'pending' AND (${cfg.idACol} = $2 OR ${cfg.idBCol} = $2 OR ${cfg.idACol} = $3 OR ${cfg.idBCol} = $3)
      `, [req.user?.username || 'user', removeId, keeperId]);
    }

    // 8. Write audit record
    const { rows: [audit] } = await client.query(`
      INSERT INTO dedup_merge_audit (entity_type, keeper_id, removed_ids, keeper_snapshot, removed_snapshots, field_overrides, junction_changes, merged_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [entityType, keeperId, removeIds, JSON.stringify(keeperSnapshot), JSON.stringify(removedSnapshots),
        JSON.stringify(fieldOverrides), JSON.stringify(junctionChanges), req.user?.username || 'user']);

    await client.query('COMMIT');
    res.json({ ok: true, fieldsFilled: fills.length, fieldsOverridden: overrideCount, linksMoved: movedLinks, auditId: audit.id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[dedup] cluster-merge error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// POST /api/dedup/undo-merge — reverse a merge using audit snapshot
app.post('/api/dedup/undo-merge', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { auditId } = req.body;
    if (!auditId) return res.status(400).json({ error: 'auditId required' });

    const { rows: [audit] } = await client.query(
      'SELECT * FROM dedup_merge_audit WHERE id = $1', [auditId]
    );
    if (!audit) return res.status(404).json({ error: 'Audit record not found' });
    if (audit.undone) return res.status(400).json({ error: 'Already undone' });

    const cfg = DEDUP_CONFIG[audit.entity_type];
    if (!cfg) return res.status(400).json({ error: 'Invalid entity type in audit' });

    await client.query('BEGIN');

    const keeperSnapshot = typeof audit.keeper_snapshot === 'string' ? JSON.parse(audit.keeper_snapshot) : audit.keeper_snapshot;
    const removedSnapshots = typeof audit.removed_snapshots === 'string' ? JSON.parse(audit.removed_snapshots) : audit.removed_snapshots;

    // 1. Restore keeper to pre-merge state
    const keeperCols = Object.keys(keeperSnapshot).filter(c => !cfg.skipCols.has(c) && c !== cfg.idCol);
    if (keeperCols.length > 0) {
      const sets = keeperCols.map((c, i) => `${c} = $${i + 1}`);
      const vals = keeperCols.map(c => keeperSnapshot[c]);
      vals.push(audit.keeper_id);
      await client.query(
        `UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE ${cfg.idCol} = $${vals.length}`, vals
      );
    }

    // 2. Re-insert removed records
    for (const snap of removedSnapshots) {
      const cols = Object.keys(snap);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      const vals = cols.map(c => snap[c]);
      await client.query(
        `INSERT INTO ${cfg.table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT (${cfg.idCol}) DO NOTHING`, vals
      );
    }

    // 3. Re-open related candidates
    for (const rid of audit.removed_ids) {
      await client.query(`
        UPDATE ${cfg.candidateTable}
        SET status = 'pending', resolved_by = NULL, resolved_at = NULL,
            merge_notes = 'Reopened via undo', updated_at = NOW()
        WHERE (${cfg.idACol} = $1 OR ${cfg.idBCol} = $1 OR ${cfg.idACol} = $2 OR ${cfg.idBCol} = $2)
          AND status = 'merged'
      `, [rid, audit.keeper_id]);
    }

    // 4. Mark audit as undone
    await client.query(
      'UPDATE dedup_merge_audit SET undone = true, undone_at = NOW() WHERE id = $1', [auditId]
    );

    await client.query('COMMIT');
    res.json({ ok: true, restored: removedSnapshots.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[dedup] undo-merge error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/dedup/merge-history — recent merge audit records
app.get('/api/dedup/merge-history', requireAuth, async (req, res) => {
  try {
    const entityType = req.query.entityType || 'property';
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const { rows } = await pool.query(`
      SELECT id, entity_type, keeper_id, removed_ids, field_overrides,
             merged_by, merged_at, undone, undone_at,
             array_length(removed_ids, 1) AS records_merged
      FROM dedup_merge_audit
      WHERE entity_type = $1
      ORDER BY merged_at DESC
      LIMIT $2
    `, [entityType, limit]);

    // Fetch keeper display names
    const cfg = DEDUP_CONFIG[entityType];
    if (cfg && rows.length > 0) {
      const keeperIds = rows.map(r => r.keeper_id);
      const ph = keeperIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows: keepers } = await pool.query(
        `SELECT ${cfg.idCol}, ${cfg.displayCol} FROM ${cfg.table} WHERE ${cfg.idCol} IN (${ph})`, keeperIds
      );
      const nameMap = new Map(keepers.map(k => [k[cfg.idCol], k[cfg.displayCol]]));
      for (const r of rows) {
        r.keeper_name = nameMap.get(r.keeper_id) || '(deleted)';
      }
    }

    res.json({ rows });
  } catch (err) {
    console.error('[dedup] merge-history error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/dedup/auto-merge — auto-merge 100% exact match clusters
app.post('/api/dedup/auto-merge', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const entityType = req.body.entityType || 'property';
    const cfg = DEDUP_CONFIG[entityType];
    if (!cfg) return res.status(400).json({ error: 'Invalid entityType' });

    // 1. Fetch pending candidates and build clusters
    const { rows: candidates } = await client.query(
      `SELECT * FROM ${cfg.candidateTable} WHERE status = 'pending'`
    );
    const clusters = buildClusters(candidates, cfg.idACol, cfg.idBCol);

    let autoMerged = 0;
    let skipped = 0;

    for (const cluster of clusters) {
      // 2. Fetch full records for the cluster
      const ph = cluster.entityIds.map((_, i) => `$${i + 1}`).join(',');
      const { rows: records } = await client.query(
        `SELECT * FROM ${cfg.table} WHERE ${cfg.idCol} IN (${ph})`, cluster.entityIds
      );
      if (records.length < 2) { skipped++; continue; }

      // 3. Check if 100% exact: all non-system fields either identical or only one non-null
      let isExact = true;
      const allCols = Object.keys(records[0]).filter(c => !cfg.skipCols.has(c) && c !== cfg.idCol);
      for (const col of allCols) {
        const nonNullVals = records.map(r => r[col]).filter(v => v != null && v !== '');
        const uniqueVals = new Set(nonNullVals.map(v => JSON.stringify(v)));
        if (uniqueVals.size > 1) {
          isExact = false;
          break;
        }
      }
      if (!isExact) { skipped++; continue; }

      // 4. Pick keeper: record with most linked records
      let bestKeeper = records[0];
      let bestCount = 0;
      for (const rec of records) {
        const counts = await countLinkedRecords(client, entityType, rec[cfg.idCol]);
        if (counts.total > bestCount) {
          bestCount = counts.total;
          bestKeeper = rec;
        }
      }

      // 5. Merge using same logic as cluster-merge (inline for transaction safety)
      const keeperId = bestKeeper[cfg.idCol];
      const removeIds = records.filter(r => r[cfg.idCol] !== keeperId).map(r => r[cfg.idCol]);

      await client.query('BEGIN');

      // Backfill NULLs
      const fills = [];
      const fillVals = [];
      let fi = 1;
      for (const col of allCols) {
        if (bestKeeper[col] != null && bestKeeper[col] !== '') continue;
        for (const rec of records) {
          if (rec[cfg.idCol] === keeperId) continue;
          if (rec[col] != null && rec[col] !== '') {
            fills.push(`${col} = $${fi}`);
            fillVals.push(rec[col]);
            fi++;
            break;
          }
        }
      }
      if (fills.length > 0) {
        fillVals.push(keeperId);
        await client.query(
          `UPDATE ${cfg.table} SET ${fills.join(', ')}, updated_at = NOW() WHERE ${cfg.idCol} = $${fi}`, fillVals
        );
      }

      // Reassign junctions + direct tables
      for (const removeId of removeIds) {
        for (const { table: jTable, col: jCol } of [...cfg.junctions, ...cfg.directTables]) {
          try {
            await client.query(`UPDATE ${jTable} SET ${jCol} = $1 WHERE ${jCol} = $2`, [keeperId, removeId]);
          } catch (e) { /* skip */ }
        }
        await client.query(`DELETE FROM ${cfg.table} WHERE ${cfg.idCol} = $1`, [removeId]);
      }

      // Mark candidates
      for (const removeId of removeIds) {
        await client.query(`
          UPDATE ${cfg.candidateTable}
          SET status = 'merged', resolved_by = 'auto-merge', resolved_at = NOW(),
              merge_notes = 'Auto-merged: 100% exact match', updated_at = NOW()
          WHERE status = 'pending' AND (${cfg.idACol} = $1 OR ${cfg.idBCol} = $1 OR ${cfg.idACol} = $2 OR ${cfg.idBCol} = $2)
        `, [removeId, keeperId]);
      }

      // Write audit
      await client.query(`
        INSERT INTO dedup_merge_audit (entity_type, keeper_id, removed_ids, keeper_snapshot, removed_snapshots, field_overrides, junction_changes, merged_by)
        VALUES ($1, $2, $3, $4, $5, '{}', '[]', 'auto-merge')
      `, [entityType, keeperId, removeIds, JSON.stringify(bestKeeper),
          JSON.stringify(records.filter(r => r[cfg.idCol] !== keeperId))]);

      await client.query('COMMIT');
      autoMerged++;
    }

    res.json({ ok: true, autoMerged, skipped, totalClusters: clusters.length });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[dedup] auto-merge error:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
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

// Initialize Socket.io chat service (pool is created in initDatabase)
setTimeout(() => {
  if (pool) {
    initChat(io, pool);
  } else {
    console.warn('[chat] No database pool — chat service not initialized');
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`[server] IE CRM API running on port ${PORT}`);
  console.log(`[server] Socket.io: ready`);
  console.log(`[server] Database: ${pool ? 'connected' : 'not configured'}`);
  console.log(`[server] Claude: ${anthropic ? 'ready' : 'not configured'}`);
  console.log(`[server] Airtable: ${process.env.AIRTABLE_API_KEY ? 'configured' : 'not configured'}`);

  // ── Houston Sonnet Self-Heartbeat ──
  // Reports Houston Sonnet as online in AI Ops dashboard.
  // Sonnet is the CRM server itself — no external heartbeat cron needed.
  if (pool) {
    const sendSonnetHeartbeat = async () => {
      try {
        await pool.query(
          `INSERT INTO agent_heartbeats (agent_name, tier, status, current_task, items_processed_today, items_in_queue, metadata, updated_at)
           VALUES ('houston', 1, 'running', 'Overseeing daily CRM operations', 0, 0, '{}', NOW())
           ON CONFLICT (agent_name) DO UPDATE SET
             status = 'running', current_task = 'Overseeing daily CRM operations', updated_at = NOW()`
        );
      } catch (err) {
        // Silent — heartbeat failures shouldn't crash the server
      }
    };
    sendSonnetHeartbeat(); // Send immediately on startup
    setInterval(sendSonnetHeartbeat, 60000); // Then every 60 seconds
    console.log('[server] Houston Sonnet heartbeat: active (60s interval)');

    // ── Auto-delete completed tasks older than 30 days ──
    const cleanupCompletedTasks = async () => {
      try {
        const result = await pool.query(
          `DELETE FROM action_items WHERE status = 'Done' AND date_completed IS NOT NULL AND date_completed < NOW() - INTERVAL '30 days' RETURNING action_item_id`
        );
        if (result.rowCount > 0) {
          console.log(`[server] Cleaned up ${result.rowCount} completed task(s) older than 30 days`);
        }
      } catch (err) {
        console.error('[server] Task cleanup failed:', err.message);
      }
    };
    cleanupCompletedTasks(); // Run on startup
    setInterval(cleanupCompletedTasks, 24 * 60 * 60 * 1000); // Then every 24 hours
    console.log('[server] Task auto-cleanup: active (30-day retention)');
  }
});
