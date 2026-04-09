// AI Master System API — Endpoints for external AI agents (OpenClaw fleet)
// Auth: X-Agent-Key header (checked against AGENT_API_KEY env var)
// Mounted BEFORE the general requireAuth middleware in index.js

const express = require('express');
const rateLimit = require('express-rate-limit');

const instantly = require('../services/instantly');
const { normalizeRecord } = require('../utils/fieldNormalizer');
const { validateColumn, quoteIdentifier, validateTable } = require('../utils/sqlSafety'); // SECURITY: Houston audit C4 — 2026-03-30
const { matchContact, matchContactTargeted, matchProperty, matchCompany } = require('../utils/compositeMatcher');

const router = express.Router();

// Simple in-memory cache for expensive queries (stats, counts)
const queryCache = new Map();
function cached(key, ttlMs, fetcher) {
  const entry = queryCache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return Promise.resolve(entry.data);
  return fetcher().then(data => {
    queryCache.set(key, { data, ts: Date.now() });
    return data;
  });
}

// These get injected via the mount function (getters for lazy access —
// pool and io are created after route registration, so we use getters)
let getPool = () => null;
let getIo = () => null;
let getCouncilResponder = () => null;

// ============================================================
// AUTH MIDDLEWARE — X-Agent-Key
// ============================================================

function requireAgentKey(req, res, next) {
  const agentKey = req.headers['x-agent-key'];
  const validKey = process.env.AGENT_API_KEY;

  if (!validKey) {
    return res.status(503).json({ error: 'Agent API not configured — set AGENT_API_KEY env var' });
  }
  if (!agentKey || agentKey !== validKey) {
    return res.status(401).json({ error: 'Invalid or missing X-Agent-Key' });
  }

  // Extract agent name from X-Agent-Name header (optional, for logging)
  req.agentName = req.headers['x-agent-name'] || 'unknown';
  next();
}

// Rate limit: 200 requests/minute per key
const agentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  keyGenerator: (req) => req.headers['x-agent-key'] || 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  validate: false, // Disable validation warnings (IPv6, X-Forwarded-For)
  message: { error: 'Agent rate limit exceeded (200/min)' },
});

// Auth: accept EITHER X-Agent-Key (for external agents) OR JWT Bearer token (for CRM dashboard)
function requireAgentKeyOrJwt(req, res, next) {
  // Try agent key first
  const agentKey = req.headers['x-agent-key'];
  const validKey = process.env.AGENT_API_KEY;
  if (validKey && agentKey === validKey) {
    req.agentName = req.headers['x-agent-name'] || 'unknown';
    req.authType = 'agent';
    return next();
  }

  // Try JWT Bearer token (for admin dashboard access)
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const { EFFECTIVE_JWT_SECRET } = require('../middleware/auth');
      const token = header.slice(7);
      const payload = jwt.verify(token, EFFECTIVE_JWT_SECRET);
      req.user = {
        user_id: payload.user_id,
        email: payload.email,
        display_name: payload.display_name,
        role: payload.role || 'broker',
      };
      req.agentName = 'dashboard-user';
      req.authType = 'jwt';
      return next();
    } catch { /* fall through */ }
  }

  if (!validKey) {
    return res.status(503).json({ error: 'Agent API not configured — set AGENT_API_KEY env var' });
  }
  return res.status(401).json({ error: 'Invalid or missing X-Agent-Key or JWT' });
}

// Apply to all AI routes
router.use(agentLimiter);
router.use(requireAgentKeyOrJwt);

// Logging middleware
router.use((req, _res, next) => {
  console.log(`[AI API] ${req.method} ${req.originalUrl} from agent: ${req.agentName}`);
  next();
});

// Helper: get pool or send 503
function dbPool(res) {
  const pool = getPool();
  if (!pool) {
    res.status(503).json({ error: 'Database not configured' });
    return null;
  }
  return pool;
}

// Helper: clamp limit parameter
function clampLimit(val, defaultVal = 20, maxVal = 100) {
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, maxVal);
}

// Helper: safe parseFloat — returns null if invalid (prevents NaN in SQL)
function safeFloat(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

// ============================================================
// 1. GET /api/ai/contacts — Search contacts
// ============================================================
router.get('/contacts', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { search, city, type, company, limit } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(full_name ILIKE $${idx} OR first_name ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (city) {
      conditions.push(`work_city ILIKE $${idx}`);
      params.push(`%${city}%`);
      idx++;
    }
    if (type) {
      conditions.push(`type = $${idx}`);
      params.push(type);
      idx++;
    }
    if (company) {
      conditions.push(`contact_id IN (
        SELECT cc.contact_id FROM contact_companies cc
        JOIN companies c ON c.company_id = cc.company_id
        WHERE c.company_name ILIKE $${idx}
      )`);
      params.push(`%${company}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const lim = clampLimit(limit);
    params.push(lim);

    const result = await pool.query(
      `SELECT contact_id AS id, full_name, first_name, email_1, phone_1, title, type, work_city AS city
       FROM contacts ${where}
       ORDER BY modified DESC NULLS LAST
       LIMIT $${idx}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[AI API] /contacts error:', err.message);
    res.status(500).json({ error: 'Failed to query contacts' });
  }
});

// ============================================================
// 2. GET /api/ai/properties — Search properties
// ============================================================
router.get('/properties', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { search, city, type, min_sf, max_sf, min_price, max_price, limit } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`property_address ILIKE $${idx}`);
      params.push(`%${search}%`);
      idx++;
    }
    if (city) {
      conditions.push(`city ILIKE $${idx}`);
      params.push(`%${city}%`);
      idx++;
    }
    if (type) {
      conditions.push(`property_type = $${idx}`);
      params.push(type);
      idx++;
    }
    if (min_sf) {
      conditions.push(`rba >= $${idx}`);
      params.push(safeFloat(min_sf));
      idx++;
    }
    if (max_sf) {
      conditions.push(`rba <= $${idx}`);
      params.push(safeFloat(max_sf));
      idx++;
    }
    if (min_price) {
      conditions.push(`last_sale_price >= $${idx}`);
      params.push(safeFloat(min_price));
      idx++;
    }
    if (max_price) {
      conditions.push(`last_sale_price <= $${idx}`);
      params.push(safeFloat(max_price));
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const lim = clampLimit(limit);
    params.push(lim);

    const result = await pool.query(
      `SELECT property_id AS id, property_address AS street_address, city, county,
              property_type AS type, rba AS building_sf, land_sf AS lot_sf,
              last_sale_price AS price, true_owner_name AS entity_name, zoning
       FROM properties ${where}
       ORDER BY last_modified DESC NULLS LAST
       LIMIT $${idx}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[AI API] /properties error:', err.message);
    res.status(500).json({ error: 'Failed to query properties' });
  }
});

// ============================================================
// 3. GET /api/ai/companies — Search companies
// ============================================================
router.get('/companies', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { search, city, type, limit } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`company_name ILIKE $${idx}`);
      params.push(`%${search}%`);
      idx++;
    }
    if (city) {
      conditions.push(`city ILIKE $${idx}`);
      params.push(`%${city}%`);
      idx++;
    }
    if (type) {
      conditions.push(`company_type = $${idx}`);
      params.push(type);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const lim = clampLimit(limit);
    params.push(lim);

    const result = await pool.query(
      `SELECT company_id AS id, company_name, city, 'CA' AS state, company_type AS type, lease_exp
       FROM companies ${where}
       ORDER BY modified DESC NULLS LAST
       LIMIT $${idx}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[AI API] /companies error:', err.message);
    res.status(500).json({ error: 'Failed to query companies' });
  }
});

// ============================================================
// 4. GET /api/ai/comps — Lease and sale comps
// ============================================================
router.get('/comps', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { city, type, min_sf, max_sf, limit } = req.query;
    const lim = clampLimit(limit);
    const isSale = type === 'sale';

    const conditions = [];
    const params = [];
    let idx = 1;
    const sfAlias = isSale ? 'sc' : 'lc';

    if (city) {
      conditions.push(`p.city ILIKE $${idx}`);
      params.push(`%${city}%`);
      idx++;
    }
    if (min_sf) {
      conditions.push(`${sfAlias}.sf >= $${idx}`);
      params.push(safeFloat(min_sf));
      idx++;
    }
    if (max_sf) {
      conditions.push(`${sfAlias}.sf <= $${idx}`);
      params.push(safeFloat(max_sf));
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(lim);

    if (isSale) {
      const result = await pool.query(
        `SELECT sc.id, sc.sale_date, sc.sale_price, sc.price_psf, sc.cap_rate,
                sc.sf, sc.buyer_name, sc.seller_name, sc.property_type,
                p.property_address, p.city
         FROM sale_comps sc
         LEFT JOIN properties p ON p.property_id = sc.property_id
         ${where}
         ORDER BY sc.sale_date DESC NULLS LAST
         LIMIT $${idx}`,
        params
      );
      res.json(result.rows);
    } else {
      const result = await pool.query(
        `SELECT lc.id, lc.tenant_name, lc.property_type, lc.sf, lc.rate,
                lc.lease_type, lc.sign_date, lc.expiration_date, lc.term_months,
                p.property_address, p.city
         FROM lease_comps lc
         LEFT JOIN properties p ON p.property_id = lc.property_id
         ${where}
         ORDER BY lc.sign_date DESC NULLS LAST
         LIMIT $${idx}`,
        params
      );
      res.json(result.rows);
    }
  } catch (err) {
    console.error('[AI API] /comps error:', err.message);
    res.status(500).json({ error: 'Failed to query comps' });
  }
});

// ============================================================
// 5. GET /api/ai/deals — Deals with linked info
// ============================================================
router.get('/deals', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { status, deal_type, limit } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) {
      conditions.push(`d.status = $${idx}`);
      params.push(status);
      idx++;
    }
    if (deal_type) {
      conditions.push(`d.deal_type = $${idx}`);
      params.push(deal_type);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const lim = clampLimit(limit, 20, 100);
    params.push(lim);

    const result = await pool.query(
      `SELECT d.deal_id AS id, d.deal_name, d.deal_type, d.status, d.sf, d.rate, d.price,
              d.close_date, d.priority_deal,
              (SELECT string_agg(p.property_address, ', ')
               FROM deal_properties pd JOIN properties p ON p.property_id = pd.property_id
               WHERE pd.deal_id = d.deal_id) AS properties,
              (SELECT string_agg(c.full_name, ', ')
               FROM deal_contacts dc JOIN contacts c ON c.contact_id = dc.contact_id
               WHERE dc.deal_id = d.deal_id) AS contacts
       FROM deals d ${where}
       ORDER BY d.modified DESC NULLS LAST
       LIMIT $${idx}`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[AI API] /deals error:', err.message);
    res.status(500).json({ error: 'Failed to query deals' });
  }
});

// ============================================================
// 6. GET /api/ai/stats — CRM entity counts and summary
// ============================================================
router.get('/stats', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const data = await cached('ai_stats', 30_000, async () => {
      const [counts, recent] = await Promise.all([
        pool.query(`
          SELECT
            (SELECT COUNT(*) FROM contacts)::int AS contacts,
            (SELECT COUNT(*) FROM properties)::int AS properties,
            (SELECT COUNT(*) FROM companies)::int AS companies,
            (SELECT COUNT(*) FROM deals)::int AS deals,
            (SELECT COUNT(*) FROM deals WHERE status = 'Active')::int AS active_deals,
            (SELECT COUNT(*) FROM interactions)::int AS interactions,
            (SELECT COUNT(*) FROM action_items WHERE status != 'Done')::int AS open_tasks,
            (SELECT COUNT(*) FROM lease_comps)::int AS lease_comps,
            (SELECT COUNT(*) FROM sale_comps)::int AS sale_comps,
            (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'pending')::int AS pending_sandbox_contacts,
            (SELECT COUNT(*) FROM sandbox_enrichments WHERE status = 'pending')::int AS pending_sandbox_enrichments,
            (SELECT COUNT(*) FROM sandbox_signals WHERE status = 'pending')::int AS pending_sandbox_signals,
            (SELECT COUNT(*) FROM sandbox_outreach WHERE status = 'pending')::int AS pending_sandbox_outreach
        `),
        pool.query(`
          SELECT
            (SELECT COUNT(*) FROM interactions WHERE created_at > NOW() - INTERVAL '7 days')::int AS interactions_7d,
            (SELECT COUNT(*) FROM contacts WHERE created_at > NOW() - INTERVAL '7 days')::int AS new_contacts_7d,
            (SELECT COUNT(*) FROM deals WHERE modified > NOW() - INTERVAL '7 days')::int AS deals_updated_7d
        `),
      ]);
      return { counts: counts.rows[0], recent_activity: recent.rows[0] };
    });
    res.set('Cache-Control', 'private, max-age=15');
    res.json({ ...data, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[AI API] /stats error:', err.message);
    res.status(500).json({ error: 'Failed to query stats' });
  }
});

// ============================================================
// 7. POST /api/ai/sandbox/contact — Create sandbox contact
// ============================================================
router.post('/sandbox/contact', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      full_name, first_name, email, phone_1, company_name, title, type,
      city, state, sources, source_urls, confidence_score, agent_name, notes,
      skipDuplicateCheck,
    } = req.body;

    if (!agent_name) {
      return res.status(400).json({ error: 'agent_name is required' });
    }

    // Check for duplicates against live contacts AND existing sandbox contacts
    if (!skipDuplicateCheck) {
      const dupResult = await matchContactTargeted(pool, { full_name, email_1: email });
      if (dupResult.match || dupResult.candidates?.length > 0) {
        return res.status(200).json({
          duplicateWarning: true,
          match: dupResult.match,
          candidates: dupResult.candidates || [],
          level: dupResult.level,
          message: 'Possible duplicate contact exists in live database',
        });
      }

      // Also check sandbox for pending duplicates
      const pendingSandbox = await pool.query(
        `SELECT id, full_name, email FROM sandbox_contacts WHERE status = 'pending'`
      );
      if (pendingSandbox.rows.length > 0) {
        const sandboxDup = matchContact(
          { full_name, email, email_1: email },
          pendingSandbox.rows.map(r => ({ contact_id: r.id, full_name: r.full_name, email_1: r.email }))
        );
        if (sandboxDup.match) {
          return res.status(200).json({
            duplicateWarning: true,
            match: sandboxDup.match,
            candidates: sandboxDup.candidates || [],
            level: sandboxDup.level,
            message: 'Duplicate already pending in sandbox',
          });
        }
      }
    }

    const result = await pool.query(
      `INSERT INTO sandbox_contacts
         (full_name, first_name, email, phone_1, company_name, title, type,
          work_city, work_state, sources, source_urls, confidence_score, agent_name, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, status`,
      [
        full_name || null, first_name || null, email || null, phone_1 || null,
        company_name || null, title || null, type || null, city || null, state || null,
        sources || null, source_urls ? JSON.stringify(source_urls) : '{}',
        confidence_score || 0, agent_name, notes || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[AI API] /sandbox/contact error:', err.message);
    res.status(500).json({ error: 'Failed to create sandbox contact' });
  }
});

// ============================================================
// 8. POST /api/ai/sandbox/enrichment — Create enrichment proposal
// ============================================================
router.post('/sandbox/enrichment', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      contact_id, field_name, old_value, new_value,
      source, source_url, confidence_score, agent_name, notes,
    } = req.body;

    if (!agent_name || !field_name || !new_value) {
      return res.status(400).json({ error: 'agent_name, field_name, and new_value are required' });
    }

    const result = await pool.query(
      `INSERT INTO sandbox_enrichments
         (contact_id, field_name, old_value, new_value, source, source_url,
          confidence_score, agent_name, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, status`,
      [
        contact_id || null, field_name, old_value || null, new_value,
        source || null, source_url || null, confidence_score || 0,
        agent_name, notes || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[AI API] /sandbox/enrichment error:', err.message);
    res.status(500).json({ error: 'Failed to create sandbox enrichment' });
  }
});

// ============================================================
// 9. POST /api/ai/sandbox/signal — Create market signal
// ============================================================
router.post('/sandbox/signal', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      headline, description, signal_type, source_url, source_name,
      confidence_score, crm_match, crm_entity_type, crm_entity_id, agent_name, notes,
    } = req.body;

    if (!agent_name || !headline || !signal_type) {
      return res.status(400).json({ error: 'agent_name, headline, and signal_type are required' });
    }

    const crm_company_ids = crm_entity_type === 'company' && crm_entity_id ? [crm_entity_id] : null;
    const crm_property_ids = crm_entity_type === 'property' && crm_entity_id ? [crm_entity_id] : null;

    const result = await pool.query(
      `INSERT INTO sandbox_signals
         (headline, details, signal_type, source_url, source_name,
          confidence_score, crm_match, crm_company_ids, crm_property_ids,
          agent_name, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, status`,
      [
        headline, description || null, signal_type, source_url || null, source_name || null,
        confidence_score || 0, crm_match || false,
        crm_company_ids, crm_property_ids,
        agent_name, notes || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[AI API] /sandbox/signal error:', err.message);
    res.status(500).json({ error: 'Failed to create sandbox signal' });
  }
});

// ============================================================
// 10. POST /api/ai/sandbox/outreach — Create draft outreach
// ============================================================
router.post('/sandbox/outreach', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      contact_id, email, subject, body, match_reason,
      property_id, confidence_score, agent_name, dedup_key, notes,
    } = req.body;

    if (!agent_name || !email || !subject || !body) {
      return res.status(400).json({ error: 'agent_name, email, subject, and body are required' });
    }

    let property_address = null;
    if (property_id) {
      const prop = await pool.query(
        'SELECT property_address FROM properties WHERE property_id = $1', [property_id]
      );
      if (prop.rows[0]) property_address = prop.rows[0].property_address;
    }

    let contact_name = null;
    if (contact_id) {
      const ct = await pool.query(
        'SELECT full_name FROM contacts WHERE contact_id = $1', [contact_id]
      );
      if (ct.rows[0]) contact_name = ct.rows[0].full_name;
    }

    const result = await pool.query(
      `INSERT INTO sandbox_outreach
         (contact_id, contact_name, email, subject, body, match_reason,
          property_address, confidence_score, agent_name, dedup_key, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, status`,
      [
        contact_id || null, contact_name, email, subject, body,
        match_reason || null, property_address,
        confidence_score || 0, agent_name, dedup_key || null, notes || null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[AI API] /sandbox/outreach error:', err.message);
    res.status(500).json({ error: 'Failed to create sandbox outreach' });
  }
});

// ============================================================
// 11. POST /api/ai/agent/heartbeat — Upsert agent status
// ============================================================
router.post('/agent/heartbeat', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      agent_name, tier, status, current_task,
      items_processed_today, items_in_queue, metadata,
    } = req.body;

    if (!agent_name || !tier) {
      return res.status(400).json({ error: 'agent_name and tier are required' });
    }

    await pool.query(
      `INSERT INTO agent_heartbeats
         (agent_name, tier, status, current_task, items_processed_today, items_in_queue, metadata, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (agent_name) DO UPDATE SET
         tier = EXCLUDED.tier,
         status = EXCLUDED.status,
         current_task = EXCLUDED.current_task,
         items_processed_today = EXCLUDED.items_processed_today,
         items_in_queue = EXCLUDED.items_in_queue,
         metadata = EXCLUDED.metadata,
         updated_at = NOW()`,
      [
        agent_name, tier, status || 'idle', current_task || null,
        items_processed_today || 0, items_in_queue || 0,
        metadata ? JSON.stringify(metadata) : '{}',
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[AI API] /agent/heartbeat error:', err.message);
    res.status(500).json({ error: 'Failed to upsert heartbeat' });
  }
});

// ============================================================
// 12. POST /api/ai/agent/log — Insert agent log entry
// ============================================================
router.post('/agent/log', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { agent_name, log_type, message, details, level } = req.body;

    if (!agent_name || !message) {
      return res.status(400).json({ error: 'agent_name and message are required' });
    }

    const resolvedType = log_type || (level === 'error' ? 'error' : 'activity');

    await pool.query(
      `INSERT INTO agent_logs (agent_name, log_type, content, metrics)
       VALUES ($1, $2, $3, $4)`,
      [
        agent_name, resolvedType, message,
        details ? JSON.stringify(details) : '{}',
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[AI API] /agent/log error:', err.message);
    res.status(500).json({ error: 'Failed to insert agent log' });
  }
});

// ============================================================
// 13. GET /api/ai/queue/pending — All pending sandbox items
// ============================================================
router.get('/queue/pending', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const [contacts, enrichments, signals, outreach] = await Promise.all([
      pool.query(
        `SELECT id, 'contacts' AS table_name, full_name AS preview,
                confidence_score, agent_name, created_at
         FROM sandbox_contacts WHERE status = 'pending'
         ORDER BY created_at DESC`
      ),
      pool.query(
        `SELECT id, 'enrichments' AS table_name,
                field_name || ': ' || COALESCE(old_value, '(empty)') || ' -> ' || new_value AS preview,
                confidence_score, agent_name, created_at
         FROM sandbox_enrichments WHERE status = 'pending'
         ORDER BY created_at DESC`
      ),
      pool.query(
        `SELECT id, 'signals' AS table_name, headline AS preview,
                confidence_score, agent_name, created_at
         FROM sandbox_signals WHERE status = 'pending'
         ORDER BY created_at DESC`
      ),
      pool.query(
        `SELECT id, 'outreach' AS table_name,
                email || ' — ' || subject AS preview,
                confidence_score, agent_name, created_at
         FROM sandbox_outreach WHERE status = 'pending'
         ORDER BY created_at DESC`
      ),
    ]);

    const all = [
      ...contacts.rows,
      ...enrichments.rows,
      ...signals.rows,
      ...outreach.rows,
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json(all);
  } catch (err) {
    console.error('[AI API] /queue/pending error:', err.message);
    res.status(500).json({ error: 'Failed to query pending queue' });
  }
});

// ============================================================
// 14. POST /api/ai/queue/approve/:table/:id — Approve + promote
// ============================================================
const VALID_SANDBOX_TABLES = ['contacts', 'enrichments', 'signals', 'outreach'];

router.post('/queue/approve/:table/:id', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { table, id } = req.params;
    if (!VALID_SANDBOX_TABLES.includes(table)) {
      return res.status(400).json({ error: `Invalid table. Must be one of: ${VALID_SANDBOX_TABLES.join(', ')}` });
    }

    const sandboxTable = `sandbox_${table}`;
    let promoted = false;

    const updateResult = await pool.query(
      `UPDATE ${sandboxTable} SET status = 'approved', reviewed_at = NOW()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found or already processed' });
    }

    const item = updateResult.rows[0];

    if (table === 'contacts') {
      // Check for duplicate contacts before promoting
      const { skipDuplicateCheck } = req.body;
      if (!skipDuplicateCheck) {
        const dupResult = await matchContactTargeted(pool, { full_name: item.full_name, email_1: item.email });
        if (dupResult.match || dupResult.candidates?.length > 0) {
          // Revert the status change — don't promote yet
          await pool.query(
            `UPDATE ${sandboxTable} SET status = 'pending', reviewed_at = NULL WHERE id = $1`,
            [id]
          );
          return res.json({
            ok: false,
            duplicateWarning: true,
            match: dupResult.match,
            candidates: dupResult.candidates || [],
            level: dupResult.level,
            sandboxId: id,
          });
        }
      }

      const insertResult = await pool.query(
        `INSERT INTO contacts
           (full_name, first_name, email, phone_1, title, type,
            work_city, work_state, data_source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING contact_id`,
        [
          item.full_name, item.first_name, item.email, item.phone_1,
          item.title, item.type, item.work_city, item.work_state,
          item.data_source || `ai-agent:${item.agent_name}`,
          item.notes,
        ]
      );
      await pool.query(
        `UPDATE ${sandboxTable} SET status = 'promoted', promoted_at = NOW(), promoted_to_id = $1
         WHERE id = $2`,
        [insertResult.rows[0].contact_id, id]
      );
      promoted = true;
    } else if (table === 'enrichments') {
      if (item.contact_id && item.field_name && item.new_value) {
        // SECURITY: Houston audit C4 — 2026-03-30
        // Validate field_name via sqlSafety whitelist instead of local allowedFields
        validateColumn(item.field_name, 'contacts');
        await pool.query(
          `UPDATE contacts SET ${quoteIdentifier(item.field_name)} = $1, modified = NOW() WHERE contact_id = $2`,
          [item.new_value, item.contact_id]
        );
        await pool.query(
          `UPDATE ${sandboxTable} SET status = 'promoted', promoted_at = NOW() WHERE id = $1`,
          [id]
        );
        promoted = true;
      }
    } else if (table === 'signals') {
      const insertResult = await pool.query(
        `INSERT INTO action_items (name, notes, source, status)
         VALUES ($1, $2, 'ai-signal', 'Todo')
         RETURNING action_item_id`,
        [
          item.headline,
          `Signal type: ${item.signal_type}\n${item.details || ''}\nSource: ${item.source_url || 'N/A'}`,
        ]
      );
      await pool.query(
        `UPDATE ${sandboxTable} SET status = 'promoted', promoted_at = NOW(),
                promoted_action_item_id = $1 WHERE id = $2`,
        [insertResult.rows[0].action_item_id, id]
      );
      promoted = true;
    } else if (table === 'outreach') {
      // Already marked approved above — separate email sending step
      promoted = false;
    }

    res.json({ ok: true, promoted });
  } catch (err) {
    console.error('[AI API] /queue/approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve item' });
  }
});

// ============================================================
// 15. POST /api/ai/queue/reject/:table/:id — Reject with feedback
// ============================================================
router.post('/queue/reject/:table/:id', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { table, id } = req.params;
    const { reason, feedback } = req.body;

    if (!VALID_SANDBOX_TABLES.includes(table)) {
      return res.status(400).json({ error: `Invalid table. Must be one of: ${VALID_SANDBOX_TABLES.join(', ')}` });
    }

    const sandboxTable = `sandbox_${table}`;
    const result = await pool.query(
      `UPDATE ${sandboxTable} SET
         status = 'rejected',
         reviewed_at = NOW(),
         review_notes = $1
       WHERE id = $2 AND status = 'pending'
       RETURNING id`,
      [`${reason || 'Rejected'}${feedback ? ` — ${feedback}` : ''}`, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found or already processed' });
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[AI API] /queue/reject error:', err.message);
    res.status(500).json({ error: 'Failed to reject item' });
  }
});

// ============================================================
// 16. POST /api/ai/chat/post — Houston posts to Team Chat
// ============================================================
router.post('/chat/post', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { channel_id, message, sender_name } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    let targetChannelId = channel_id;
    if (!targetChannelId) {
      const ch = await pool.query(
        "SELECT id FROM chat_channels WHERE name = 'General' AND channel_type = 'group' LIMIT 1"
      );
      if (ch.rows.length === 0) {
        return res.status(404).json({ error: 'No General channel found' });
      }
      targetChannelId = ch.rows[0].id;
    }

    const displayName = sender_name || 'Houston';
    const result = await pool.query(
      `INSERT INTO chat_messages
         (channel_id, sender_id, sender_type, body, message_type, houston_meta)
       VALUES ($1, NULL, 'houston', $2, 'houston_insight', $3)
       RETURNING *`,
      [
        targetChannelId,
        message,
        JSON.stringify({
          trigger: 'external_agent',
          sender_name: displayName,
          agent: req.agentName,
        }),
      ]
    );

    const newMessage = result.rows[0];

    // Emit via Socket.io for real-time delivery
    const io = getIo();
    if (io) {
      io.to(`channel:${targetChannelId}`).emit('chat:message:new', newMessage);
    }

    res.json({ ok: true, message_id: newMessage.id });
  } catch (err) {
    console.error('[AI API] /chat/post error:', err.message);
    res.status(500).json({ error: 'Failed to post chat message' });
  }
});

// ============================================================
// 17. POST /api/ai/council/post — Houston Command posts to Council channel
// ============================================================
router.post('/council/post', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { message, sender_name, message_type } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const validTypes = ['analysis', 'strategy', 'action_request', 'recommendation', 'insight', 'status'];
    const resolvedType = validTypes.includes(message_type) ? message_type : 'insight';
    const dbMessageType = `council_${resolvedType}`;
    const displayName = sender_name || 'Houston Command';

    // Find council channel
    const ch = await pool.query(
      "SELECT id FROM chat_channels WHERE channel_type = 'council' LIMIT 1"
    );
    if (ch.rows.length === 0) {
      return res.status(404).json({ error: 'Council channel not found' });
    }
    const councilChannelId = ch.rows[0].id;

    // Build houston_meta — recommendations get special metadata
    const houstonMeta = {
      trigger: 'council_post',
      sender_name: displayName,
      message_type: resolvedType,
      agent: req.agentName,
    };
    if (resolvedType === 'recommendation') {
      houstonMeta.recommendation = {
        type: 'recommendation',
        status: 'pending',
        approved_by: null,
        approved_at: null,
      };
    }

    // Insert the message
    const result = await pool.query(
      `INSERT INTO chat_messages
         (channel_id, sender_id, sender_type, body, message_type, houston_meta)
       VALUES ($1, NULL, 'houston', $2, $3, $4)
       RETURNING *`,
      [
        councilChannelId,
        message,
        dbMessageType,
        JSON.stringify(houstonMeta),
      ]
    );

    const newMessage = result.rows[0];
    newMessage.sender_name = displayName;
    newMessage.sender_color = resolvedType === 'recommendation' ? '#AF52DE'
      : resolvedType === 'action_request' ? '#AF52DE'
      : '#818cf8';

    // If action_request or recommendation, create a council proposal
    if (resolvedType === 'action_request' || resolvedType === 'recommendation') {
      await pool.query(
        `INSERT INTO council_proposals (message_id, channel_id, proposal_text, sender_name)
         VALUES ($1, $2, $3, $4)`,
        [newMessage.id, councilChannelId, message, displayName]
      );
    }

    // Emit via Socket.io for real-time delivery
    const io = getIo();
    if (io) {
      io.to('council').emit('council:message:new', newMessage);
    }

    // Trigger Houston Sonnet auto-response (async, don't block the response)
    const councilResponder = getCouncilResponder();
    if (councilResponder) {
      councilResponder(newMessage).catch(err =>
        console.error('[AI API] Houston council auto-response error:', err.message)
      );
    }

    res.json({ ok: true, message_id: newMessage.id });
  } catch (err) {
    console.error('[AI API] /council/post error:', err.message);
    res.status(500).json({ error: 'Failed to post council message' });
  }
});

// ============================================================
// DIRECTIVES — Decision Cascade System
// Separate router with dual auth: X-Agent-Key OR JWT (admin)
// ============================================================

const directivesRouter = express.Router();
directivesRouter.use(agentLimiter);

const jwt = require('jsonwebtoken');
const { EFFECTIVE_JWT_SECRET } = require('../middleware/auth');

// Middleware: accepts either agent key or JWT admin auth
function requireAgentOrAdmin(req, res, next) {
  // Try agent key first
  const agentKey = req.headers['x-agent-key'];
  const validKey = process.env.AGENT_API_KEY;
  if (validKey && agentKey === validKey) {
    req.agentName = req.headers['x-agent-name'] || 'unknown';
    req.authType = 'agent';
    return next();
  }

  // Try JWT
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.slice(7);
      const payload = jwt.verify(token, EFFECTIVE_JWT_SECRET);
      req.user = {
        user_id: payload.user_id,
        email: payload.email,
        display_name: payload.display_name,
        role: payload.role || 'broker',
      };
      req.authType = 'jwt';
      return next();
    } catch { /* fall through */ }
  }

  return res.status(401).json({ error: 'Authentication required (agent key or JWT)' });
}

// Middleware: JWT admin only
function requireJwtAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, EFFECTIVE_JWT_SECRET);
    req.user = {
      user_id: payload.user_id,
      email: payload.email,
      display_name: payload.display_name,
      role: payload.role || 'broker',
    };
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin role required' });
    }
    req.authType = 'jwt';
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const COUNCIL_CHANNEL_ID = '0fddc747-10ad-4b20-ac01-5e2242e8755f';

// 18. POST /api/ai/directive — Create a new directive
directivesRouter.post('/directive', requireAgentOrAdmin, async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { title, body, priority, scope, source } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'title and body are required' });
    }

    const result = await pool.query(
      `INSERT INTO directives (title, body, priority, scope, source)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        title,
        body,
        priority || 'normal',
        scope || 'all',
        source || (req.authType === 'jwt' ? 'admin' : req.agentName || 'agent'),
      ]
    );

    const directive = result.rows[0];

    // Post summary to the Council channel
    const summary = body.length > 100 ? body.slice(0, 100) + '...' : body;
    try {
      await pool.query(
        `INSERT INTO chat_messages
           (channel_id, sender_id, sender_type, body, message_type, houston_meta)
         VALUES ($1, NULL, 'houston', $2, 'system', $3)`,
        [
          COUNCIL_CHANNEL_ID,
          `\ud83d\udccb New Directive: ${title} \u2014 ${summary}`,
          JSON.stringify({ trigger: 'directive_created', directive_id: directive.id }),
        ]
      );
    } catch (chatErr) {
      console.error('[AI API] Failed to post directive to council:', chatErr.message);
    }

    // Emit socket event
    const io = getIo();
    if (io) {
      io.to('council').emit('directive:new', directive);
      // Also emit the council message
      io.to('council').emit('council:message:new', {
        id: directive.id + '-notif',
        channel_id: COUNCIL_CHANNEL_ID,
        sender_type: 'houston',
        sender_name: 'System',
        body: `\ud83d\udccb New Directive: ${title} \u2014 ${summary}`,
        message_type: 'system',
        created_at: new Date().toISOString(),
      });
    }

    res.status(201).json(directive);
  } catch (err) {
    console.error('[AI API] /directive error:', err.message);
    res.status(500).json({ error: 'Failed to create directive' });
  }
});

// 19. GET /api/ai/directives — List directives (filtered)
directivesRouter.get('/directives', requireAgentOrAdmin, async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { scope, status, since } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    // Agents only see directives for 'all' or their specific scope
    if (scope) {
      conditions.push(`(scope = 'all' OR scope = $${idx})`);
      params.push(scope);
      idx++;
    }

    if (status) {
      conditions.push(`status = $${idx}`);
      params.push(status);
      idx++;
    } else {
      // Default to active directives
      conditions.push(`status = 'active'`);
    }

    if (since) {
      conditions.push(`created_at > $${idx}`);
      params.push(since);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT * FROM directives ${where} ORDER BY
        CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 END,
        created_at DESC`,
      params
    );

    res.json(result.rows);
  } catch (err) {
    console.error('[AI API] /directives error:', err.message);
    res.status(500).json({ error: 'Failed to query directives' });
  }
});

// 20. POST /api/ai/directive/:id/acknowledge — Agent acknowledges a directive
directivesRouter.post('/directive/:id/acknowledge', requireAgentKey, async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { id } = req.params;
    const { agent_name } = req.body;

    if (!agent_name) {
      return res.status(400).json({ error: 'agent_name is required' });
    }

    // Add agent_name to acknowledged_by array (if not already present)
    const result = await pool.query(
      `UPDATE directives
       SET acknowledged_by = CASE
         WHEN NOT (acknowledged_by @> $2::jsonb)
         THEN acknowledged_by || $2::jsonb
         ELSE acknowledged_by
       END,
       updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(agent_name)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Directive not found' });
    }

    // Emit socket event
    const io = getIo();
    if (io) {
      io.to('council').emit('directive:acknowledged', { id, agent_name });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[AI API] /directive/:id/acknowledge error:', err.message);
    res.status(500).json({ error: 'Failed to acknowledge directive' });
  }
});

// 21. PATCH /api/ai/directive/:id — Update directive (admin only via JWT)
directivesRouter.patch('/directive/:id', requireJwtAdmin, async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { id } = req.params;
    const { status, body, priority } = req.body;

    const updates = [];
    const params = [];
    let idx = 1;

    if (status) {
      const validStatuses = ['active', 'superseded', 'archived'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
      }
      updates.push(`status = $${idx}`);
      params.push(status);
      idx++;
    }
    if (body !== undefined) {
      updates.push(`body = $${idx}`);
      params.push(body);
      idx++;
    }
    if (priority) {
      updates.push(`priority = $${idx}`);
      params.push(priority);
      idx++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    const result = await pool.query(
      `UPDATE directives SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Directive not found' });
    }

    // Emit socket event
    const io = getIo();
    if (io) {
      io.to('council').emit('directive:updated', result.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[AI API] PATCH /directive/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update directive' });
  }
});

// ============================================================
// 22. PUT /api/ai/council/recommendation/:messageId — Approve/Reject/Discuss a recommendation
// ============================================================
directivesRouter.put('/council/recommendation/:messageId', requireJwtAdmin, async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { messageId } = req.params;
    const { status, reviewer } = req.body;

    const validStatuses = ['approved', 'rejected', 'discuss'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
    }

    const reviewerName = reviewer || req.user.display_name || 'Admin';

    // Update the council_proposals table
    const proposalResult = await pool.query(
      `UPDATE council_proposals
       SET status = $1, approved_by = $2, approval_notes = $3, reviewed_at = NOW()
       WHERE message_id = $4 AND status = 'pending'
       RETURNING *`,
      [
        status === 'discuss' ? 'pending' : status,
        req.user.user_id,
        status === 'discuss' ? 'Marked for discussion' : null,
        messageId,
      ]
    );

    if (proposalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Recommendation not found or already reviewed' });
    }

    const proposal = proposalResult.rows[0];

    // Update houston_meta on the original message with recommendation status
    await pool.query(
      `UPDATE chat_messages
       SET houston_meta = houston_meta || $1::jsonb
       WHERE id = $2`,
      [
        JSON.stringify({
          recommendation: {
            type: 'recommendation',
            status,
            approved_by: reviewerName,
            approved_at: new Date().toISOString(),
          },
        }),
        messageId,
      ]
    );

    // Find council channel
    const ch = await pool.query(
      "SELECT id FROM chat_channels WHERE channel_type = 'council' LIMIT 1"
    );
    const councilChannelId = ch.rows.length > 0 ? ch.rows[0].id : null;

    const io = getIo();

    if (status === 'approved') {
      // Post confirmation to Council
      if (councilChannelId) {
        const confirmMsg = await pool.query(
          `INSERT INTO chat_messages
             (channel_id, sender_id, sender_type, body, message_type)
           VALUES ($1, $2, 'user', $3, 'system')
           RETURNING *`,
          [
            councilChannelId,
            req.user.user_id,
            `✅ Recommendation approved by ${reviewerName}. Executing now...`,
          ]
        );
        if (io) {
          const msg = confirmMsg.rows[0];
          msg.sender_name = reviewerName;
          io.to('council').emit('council:message:new', msg);
        }
      }

      // Trigger Houston Sonnet to execute the recommendation
      const councilResponder = getCouncilResponder();
      if (councilResponder) {
        // Create a synthetic message that tells Houston to execute the recommendation
        const executionMessage = {
          id: messageId + '-exec',
          channel_id: councilChannelId,
          sender_type: 'user',
          sender_name: reviewerName,
          body: `Houston Command recommended: ${proposal.proposal_text}\n\n${reviewerName} approved this recommendation. Execute it now. Take the recommended action and report back what you did.`,
          message_type: 'text',
          created_at: new Date().toISOString(),
        };
        councilResponder(executionMessage).catch(err =>
          console.error('[AI API] Recommendation execution error:', err.message)
        );
      }

      // Post summary to Team Chat (General channel)
      try {
        const generalCh = await pool.query(
          "SELECT id FROM chat_channels WHERE name = 'General' AND channel_type = 'group' LIMIT 1"
        );
        if (generalCh.rows.length > 0) {
          const summary = proposal.proposal_text.length > 150
            ? proposal.proposal_text.slice(0, 150) + '...'
            : proposal.proposal_text;
          const relayMsg = await pool.query(
            `INSERT INTO chat_messages
               (channel_id, sender_id, sender_type, body, message_type, houston_meta)
             VALUES ($1, NULL, 'houston', $2, 'houston_insight', $3)
             RETURNING *`,
            [
              generalCh.rows[0].id,
              `Hey team — Houston Command identified a recommendation: ${summary}\n\n${reviewerName} approved it and I'm executing it now. I'll report back when complete.`,
              JSON.stringify({
                trigger: 'recommendation_approved',
                sender_name: 'Houston',
                recommendation_message_id: messageId,
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
      } catch (relayErr) {
        console.error('[AI API] Failed to relay recommendation to team chat:', relayErr.message);
      }
    } else if (status === 'rejected') {
      // Post rejection to Council
      if (councilChannelId) {
        const rejectMsg = await pool.query(
          `INSERT INTO chat_messages
             (channel_id, sender_id, sender_type, body, message_type)
           VALUES ($1, $2, 'user', $3, 'system')
           RETURNING *`,
          [councilChannelId, req.user.user_id, `❌ Recommendation rejected by ${reviewerName}.`]
        );
        if (io) {
          const msg = rejectMsg.rows[0];
          msg.sender_name = reviewerName;
          io.to('council').emit('council:message:new', msg);
        }
      }
    } else if (status === 'discuss') {
      // Trigger Houston Sonnet to discuss the recommendation
      const councilResponder = getCouncilResponder();
      if (councilResponder) {
        const discussMessage = {
          id: messageId + '-discuss',
          channel_id: councilChannelId,
          sender_type: 'user',
          sender_name: reviewerName,
          body: `${reviewerName} wants to discuss this recommendation: ${proposal.proposal_text}\n\nWhat are the pros, cons, and alternatives? Help me think through this.`,
          message_type: 'text',
          created_at: new Date().toISOString(),
        };
        councilResponder(discussMessage).catch(err =>
          console.error('[AI API] Recommendation discuss error:', err.message)
        );
      }
    }

    // Emit proposal update via socket
    if (io) {
      io.to('council').emit('council:proposal:updated', {
        messageId,
        status: status === 'discuss' ? 'pending' : status,
        reviewedBy: reviewerName,
        notes: status === 'discuss' ? 'Marked for discussion' : null,
      });
      // Also emit recommendation-specific event
      io.to('council').emit('council:recommendation:updated', {
        messageId,
        status,
        reviewedBy: reviewerName,
        reviewedAt: new Date().toISOString(),
      });
    }

    res.json({ ok: true, status, proposal: proposalResult.rows[0] });
  } catch (err) {
    console.error('[AI API] PUT /council/recommendation error:', err.message);
    res.status(500).json({ error: 'Failed to update recommendation' });
  }
});

// ============================================================
// HOUSTON COMMAND WRITE ACCESS — Controlled DB writes with trust tiers
// ============================================================

// 46. POST /api/ai/command/fill-empty — Fill empty fields on a record (Silver+ tier)
// Houston Command can fill fields that are currently NULL/empty
// but CANNOT overwrite existing data (that goes through suggested_updates)
router.post('/command/fill-empty', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { entity_type, entity_id, fields, source_detail } = req.body;
    // fields: { email: "john@acme.com", phone_1: "909-555-1234", ... }

    if (!entity_type || !entity_id || !fields || Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'entity_type, entity_id, and fields are required' });
    }

    const tableMap = { contact: 'contacts', property: 'properties', company: 'companies' };
    const idColMap = { contact: 'contact_id', property: 'property_id', company: 'company_id' };
    const table = tableMap[entity_type];
    const idCol = idColMap[entity_type];

    if (!table) return res.status(400).json({ error: 'Invalid entity_type' });

    // Get current record
    const current = await pool.query(`SELECT * FROM ${table} WHERE "${idCol}" = $1`, [entity_id]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    const record = current.rows[0];

    // SECURITY: Houston audit C4 — 2026-03-30
    // Validate field names via sqlSafety whitelist instead of information_schema query
    const protectedFields = [idCol, 'airtable_id', 'created_at', 'modified'];

    const filled = [];
    const conflicted = [];
    const skipped = [];

    for (const [fieldName, newValue] of Object.entries(fields)) {
      // Skip invalid or protected fields
      try { validateColumn(fieldName, table); } catch (_) {
        skipped.push({ field: fieldName, reason: 'invalid_column' });
        continue;
      }
      if (protectedFields.includes(fieldName)) {
        skipped.push({ field: fieldName, reason: 'protected' });
        continue;
      }

      const currentValue = record[fieldName];

      // If field is empty → fill it directly
      if (currentValue === null || currentValue === '' || currentValue === undefined) {
        await pool.query(
          `UPDATE ${table} SET ${quoteIdentifier(fieldName)} = $1 WHERE ${quoteIdentifier(idCol)} = $2`,
          [newValue, entity_id]
        );
        filled.push({ field: fieldName, value: newValue });
      }
      // If field is Gold (manual) → NEVER touch, create suggestion
      else if (record.data_source === 'manual') {
        await pool.query(
          `INSERT INTO suggested_updates
             (entity_type, entity_id, entity_name, field_name, current_value, suggested_value,
              source, source_detail, data_tier, agent_name, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, 'houston_command', $7, 'silver', 'houston_command', 75)`,
          [entity_type, entity_id, record.full_name || record.name || record.address || '',
           fieldName, String(currentValue), newValue, source_detail || 'Houston Command analysis']
        );
        conflicted.push({ field: fieldName, current: currentValue, suggested: newValue, action: 'suggested_update_created' });
      }
      // If field has existing non-manual data that DIFFERS → create suggestion
      else if (String(currentValue).toLowerCase() !== String(newValue).toLowerCase()) {
        await pool.query(
          `INSERT INTO suggested_updates
             (entity_type, entity_id, entity_name, field_name, current_value, suggested_value,
              source, source_detail, data_tier, agent_name, confidence)
           VALUES ($1, $2, $3, $4, $5, $6, 'houston_command', $7, 'silver', 'houston_command', 70)`,
          [entity_type, entity_id, record.full_name || record.name || record.address || '',
           fieldName, String(currentValue), newValue, source_detail || 'Houston Command analysis']
        );
        conflicted.push({ field: fieldName, current: currentValue, suggested: newValue, action: 'suggested_update_created' });
      }
      // Same value → skip
      else {
        skipped.push({ field: fieldName, reason: 'same_value' });
      }
    }

    // Update enrichment tracking
    if (filled.length > 0) {
      await pool.query(
        `UPDATE ${table} SET last_enriched_at = NOW(), data_source = COALESCE(NULLIF(data_source, ''), 'enricher_verified')
         WHERE "${idCol}" = $1 AND (data_source IS NULL OR data_source = '' OR data_source = 'import')`,
        [entity_id]
      );
    }

    res.json({
      ok: true,
      filled: filled.length,
      conflicted: conflicted.length,
      skipped: skipped.length,
      details: { filled, conflicted, skipped },
    });
  } catch (err) {
    console.error('[AI API] POST /command/fill-empty error:', err.message);
    res.status(500).json({ error: 'Failed to fill empty fields' });
  }
});

// 47. POST /api/ai/command/log-interaction — Houston Command logs an interaction
// Writes directly to interactions table (no sandbox needed — Command is trusted)
router.post('/command/log-interaction', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      contact_id, property_id, company_id, deal_id,
      type, notes, direction, date,
    } = req.body;

    if (!type || !notes) {
      return res.status(400).json({ error: 'type and notes are required' });
    }

    const result = await pool.query(
      `INSERT INTO interactions
         (type, notes, direction, contact_id, property_id, company_id, interaction_date, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'houston_command')
       RETURNING *`,
      [
        type, notes, direction || 'outbound',
        contact_id || null, property_id || null, company_id || null,
        date || new Date().toISOString(),
      ]
    );

    // Link to deal if provided
    if (deal_id && result.rows[0]) {
      await pool.query(
        `INSERT INTO deal_interactions (deal_id, interaction_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [deal_id, result.rows[0].interaction_id || result.rows[0].id]
      ).catch(() => {}); // Ignore if junction doesn't exist yet
    }

    // Emit for live UI update
    const io = getIo();
    if (io) {
      io.emit('crm:record-created', { table: 'interactions', record: result.rows[0] });
    }

    res.json({ ok: true, interaction: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /command/log-interaction error:', err.message);
    res.status(500).json({ error: 'Failed to log interaction' });
  }
});

// 48. POST /api/ai/command/create-task — Houston Command creates an action item
router.post('/command/create-task', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      task_name, due_date, assigned_to, priority,
      contact_id, company_id, property_id, deal_id, notes,
    } = req.body;

    if (!task_name) {
      return res.status(400).json({ error: 'task_name is required' });
    }

    const result = await pool.query(
      `INSERT INTO action_items
         (task_name, due_date, assigned_to, high_priority, notes, source)
       VALUES ($1, $2, $3, $4, $5, 'houston_command')
       RETURNING *`,
      [
        task_name,
        due_date || new Date().toISOString().split('T')[0],
        assigned_to || 'David Mudge Jr',
        priority === 'high' || priority === true || false,
        notes || null,
      ]
    );

    const taskId = result.rows[0].action_item_id || result.rows[0].id;

    // Link to entities if provided
    if (contact_id) {
      await pool.query(
        'INSERT INTO action_item_contacts (action_item_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [taskId, contact_id]
      ).catch(() => {});
    }
    if (company_id) {
      await pool.query(
        'INSERT INTO action_item_companies (action_item_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [taskId, company_id]
      ).catch(() => {});
    }
    if (property_id) {
      await pool.query(
        'INSERT INTO action_item_properties (action_item_id, property_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [taskId, property_id]
      ).catch(() => {});
    }
    if (deal_id) {
      await pool.query(
        'INSERT INTO action_item_deals (action_item_id, deal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [taskId, deal_id]
      ).catch(() => {});
    }

    // Emit for live UI update
    const io = getIo();
    if (io) {
      io.emit('crm:record-created', { table: 'action_items', record: result.rows[0] });
    }

    res.json({ ok: true, task: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /command/create-task error:', err.message);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// 49. POST /api/ai/command/flag-ownership-change — Flag a potential ownership change
// Special endpoint because ownership changes are high-impact and always need David's review
router.post('/command/flag-ownership-change', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      property_id, current_owner, new_owner, source_detail, confidence,
    } = req.body;

    if (!property_id || !new_owner) {
      return res.status(400).json({ error: 'property_id and new_owner are required' });
    }

    // Get property info
    const prop = await pool.query(
      'SELECT property_id, address, city FROM properties WHERE property_id = $1',
      [property_id]
    );
    const propName = prop.rows.length > 0 ? `${prop.rows[0].address}, ${prop.rows[0].city}` : property_id;

    // Create a high-priority suggested update with ownership change flag
    const result = await pool.query(
      `INSERT INTO suggested_updates
         (entity_type, entity_id, entity_name, field_name, field_label,
          current_value, suggested_value, source, source_detail,
          confidence, data_tier, is_ownership_change, agent_name)
       VALUES ('property', $1, $2, 'owner_entity', 'Property Owner',
          $3, $4, 'houston_command', $5, $6, 'gold', true, 'houston_command')
       RETURNING *`,
      [property_id, propName, current_owner || 'Unknown', new_owner,
       source_detail || 'Detected by Houston Command', confidence || 80]
    );

    // Also alert via Team Chat
    const generalCh = await pool.query(
      "SELECT id FROM chat_channels WHERE name = 'General' AND channel_type = 'group' LIMIT 1"
    );
    if (generalCh.rows.length > 0) {
      const alertMsg = await pool.query(
        `INSERT INTO chat_messages
           (channel_id, sender_id, sender_type, body, message_type, houston_meta)
         VALUES ($1, NULL, 'houston', $2, 'houston_insight', $3)
         RETURNING *`,
        [
          generalCh.rows[0].id,
          `🏠 **Ownership Change Detected**\n\n**Property:** ${propName}\n**Previous:** ${current_owner || 'Unknown'}\n**New:** ${new_owner}\n\n_Source: ${source_detail || 'Houston Command analysis'}_\n\nThis needs your review — check Suggested Updates in AI Ops.`,
          JSON.stringify({ trigger: 'ownership_change', property_id, confidence }),
        ]
      );

      const io = getIo();
      if (io) {
        const msg = alertMsg.rows[0];
        msg.sender_name = 'Houston';
        msg.sender_color = '#10b981';
        io.to(`channel:${generalCh.rows[0].id}`).emit('chat:message:new', msg);
      }
    }

    res.json({ ok: true, suggestion: result.rows[0], alert_sent: true });
  } catch (err) {
    console.error('[AI API] POST /command/flag-ownership-change error:', err.message);
    res.status(500).json({ error: 'Failed to flag ownership change' });
  }
});

// ============================================================
// SUGGESTED UPDATES — Data Trust Tier Review System
// ============================================================

// 39. POST /api/ai/suggested-updates — Submit a suggested update for review
// Called by Enricher when it finds data that conflicts with existing CRM data
router.post('/suggested-updates', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      entity_type, entity_id, entity_name, field_name, field_label,
      current_value, suggested_value, source, source_detail, confidence,
      data_tier, is_ownership_change, workflow_id, batch_id,
    } = req.body;

    if (!entity_type || !entity_id || !field_name || !suggested_value) {
      return res.status(400).json({ error: 'entity_type, entity_id, field_name, and suggested_value are required' });
    }

    // Coerce confidence: string labels → int, numbers pass through, default 50
    const CONFIDENCE_MAP = { high: 90, medium: 65, low: 40 };
    let safeConfidence = 50;
    if (typeof confidence === 'number') {
      safeConfidence = Math.round(confidence);
    } else if (typeof confidence === 'string') {
      safeConfidence = CONFIDENCE_MAP[confidence.toLowerCase()] ?? (parseInt(confidence, 10) || 50);
    }

    const safeSource = source || req.agentName || 'enricher';

    // Dedup: don't create duplicate suggestions for same entity+field+value
    const existing = await pool.query(
      `SELECT id FROM suggested_updates
       WHERE entity_type = $1 AND entity_id = $2::uuid AND field_name = $3
         AND suggested_value = $4 AND status = 'pending'`,
      [entity_type, entity_id, field_name, suggested_value]
    );
    if (existing.rows.length > 0) {
      return res.json({ success: true, skipped: true, reason: 'Duplicate suggestion already pending', id: existing.rows[0].id });
    }

    const result = await pool.query(
      `INSERT INTO suggested_updates
         (entity_type, entity_id, entity_name, field_name, field_label,
          current_value, suggested_value, source, source_detail, confidence,
          data_tier, is_ownership_change, agent_name, workflow_id, batch_id)
       VALUES ($1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        entity_type, entity_id, entity_name || null, field_name, field_label || field_name,
        current_value || null, suggested_value, safeSource, source_detail || null,
        safeConfidence, data_tier || 'bronze', is_ownership_change || false,
        req.agentName || safeSource, workflow_id || null, batch_id || null,
      ]
    );

    res.json({ success: true, id: result.rows[0].id, suggestion: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /suggested-updates error:', err.message);
    const detail = process.env.NODE_ENV === 'production' ? undefined : err.message;
    res.status(500).json({ error: 'Failed to submit suggested update', detail });
  }
});

// 40. GET /api/ai/suggested-updates — List suggested updates (with filters)
// Called by CRM dashboard for the review UI and by Houston Command for oversight
router.get('/suggested-updates', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { status = 'pending', entity_type, entity_id, is_ownership_change, batch_id, limit = 50 } = req.query;

    let query = 'SELECT * FROM suggested_updates WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status !== 'all') {
      query += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (entity_type) {
      query += ` AND entity_type = $${idx++}`;
      params.push(entity_type);
    }
    if (entity_id) {
      query += ` AND entity_id = $${idx++}`;
      params.push(entity_id);
    }
    if (is_ownership_change === 'true') {
      query += ' AND is_ownership_change = true';
    }
    if (batch_id) {
      query += ` AND batch_id = $${idx++}`;
      params.push(batch_id);
    }

    query += ` ORDER BY CASE WHEN is_ownership_change THEN 0 ELSE 1 END, confidence DESC, created_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);

    // Also get counts by status
    const counts = await pool.query(
      `SELECT status, COUNT(*) as count FROM suggested_updates GROUP BY status`
    );
    const statusCounts = {};
    counts.rows.forEach(r => { statusCounts[r.status] = parseInt(r.count); });

    res.json({ suggestions: result.rows, count: result.rows.length, status_counts: statusCounts });
  } catch (err) {
    console.error('[AI API] GET /suggested-updates error:', err.message);
    res.status(500).json({ error: 'Failed to fetch suggested updates' });
  }
});

// 41. PATCH /api/ai/suggested-updates/:id — Accept or reject a suggested update
// Called from the CRM dashboard review UI
router.patch('/suggested-updates/:id', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { id } = req.params;
    const { status, review_notes } = req.body;

    if (!status || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be "accepted" or "rejected"' });
    }

    // Get the suggestion
    const suggestion = await pool.query('SELECT * FROM suggested_updates WHERE id = $1', [id]);
    if (suggestion.rows.length === 0) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }
    const s = suggestion.rows[0];

    // Update the suggestion status
    const reviewerName = req.agentName || req.user?.display_name || 'admin';
    await pool.query(
      `UPDATE suggested_updates
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3, updated_at = NOW()
       WHERE id = $4`,
      [status, reviewerName, review_notes || null, id]
    );

    // If accepted, apply the change to the actual record
    if (status === 'accepted') {
      const tableMap = { contact: 'contacts', property: 'properties', company: 'companies' };
      const idColMap = { contact: 'contact_id', property: 'property_id', company: 'company_id' };
      const table = tableMap[s.entity_type];
      const idCol = idColMap[s.entity_type];

      if (table && idCol) {
        // SECURITY: Houston audit C4 — 2026-03-30
        // Validate field name via sqlSafety whitelist instead of information_schema
        validateColumn(s.field_name, table);
        await pool.query(
          `UPDATE ${table} SET ${quoteIdentifier(s.field_name)} = $1 WHERE ${quoteIdentifier(idCol)} = $2`,
          [s.suggested_value, s.entity_id]
        );

        // Mark as applied
        await pool.query(
          'UPDATE suggested_updates SET applied = true, applied_at = NOW() WHERE id = $1',
          [id]
        );
      }
    }

    // Emit socket event for live UI update
    const io = getIo();
    if (io) {
      io.emit('suggested-update:reviewed', { id: parseInt(id), status, entity_type: s.entity_type, entity_id: s.entity_id });
    }

    res.json({ ok: true, status, applied: status === 'accepted' });
  } catch (err) {
    console.error('[AI API] PATCH /suggested-updates/:id error:', err.message);
    res.status(500).json({ error: 'Failed to review suggested update' });
  }
});

// 42. POST /api/ai/suggested-updates/batch — Accept or reject multiple suggestions at once
router.post('/suggested-updates/batch', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { ids, status, review_notes } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids array is required' });
    }
    if (!status || !['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'status must be "accepted" or "rejected"' });
    }

    const reviewerName = req.agentName || req.user?.display_name || 'admin';
    let appliedCount = 0;

    for (const id of ids) {
      // Get suggestion
      const suggestion = await pool.query('SELECT * FROM suggested_updates WHERE id = $1 AND status = $2', [id, 'pending']);
      if (suggestion.rows.length === 0) continue;
      const s = suggestion.rows[0];

      // Update status
      await pool.query(
        `UPDATE suggested_updates
         SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3, updated_at = NOW()
         WHERE id = $4`,
        [status, reviewerName, review_notes || null, id]
      );

      // Apply if accepted
      if (status === 'accepted') {
        const tableMap = { contact: 'contacts', property: 'properties', company: 'companies' };
        const idColMap = { contact: 'contact_id', property: 'property_id', company: 'company_id' };
        const table = tableMap[s.entity_type];
        const idCol = idColMap[s.entity_type];

        if (table && idCol) {
          // SECURITY: Houston audit C4 — 2026-03-30
          validateColumn(s.field_name, table);
          await pool.query(
            `UPDATE ${table} SET ${quoteIdentifier(s.field_name)} = $1 WHERE ${quoteIdentifier(idCol)} = $2`,
            [s.suggested_value, s.entity_id]
          );
          await pool.query('UPDATE suggested_updates SET applied = true, applied_at = NOW() WHERE id = $1', [id]);
          appliedCount++;
        }
      }
    }

    const io = getIo();
    if (io) {
      io.emit('suggested-updates:batch-reviewed', { ids, status, applied_count: appliedCount });
    }

    res.json({ ok: true, reviewed: ids.length, applied: appliedCount });
  } catch (err) {
    console.error('[AI API] POST /suggested-updates/batch error:', err.message);
    res.status(500).json({ error: 'Failed to batch review suggestions' });
  }
});

// 43. POST /api/ai/deal-dossiers — Create or update a deal dossier
router.post('/deal-dossiers', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      deal_id, title, content_md, key_people, deal_timeline,
      transcript_refs, houston_analysis, oracle_score, oracle_signals,
      file_path,
    } = req.body;

    if (!deal_id || !title) {
      return res.status(400).json({ error: 'deal_id and title are required' });
    }

    // Upsert: update if exists for this deal, create if not
    const existing = await pool.query('SELECT id FROM deal_dossiers WHERE deal_id = $1', [deal_id]);

    let result;
    if (existing.rows.length > 0) {
      result = await pool.query(
        `UPDATE deal_dossiers SET
          title = COALESCE($1, title),
          content_md = COALESCE($2, content_md),
          key_people = COALESCE($3, key_people),
          deal_timeline = COALESCE($4, deal_timeline),
          transcript_refs = COALESCE($5, transcript_refs),
          houston_analysis = COALESCE($6, houston_analysis),
          oracle_score = COALESCE($7, oracle_score),
          oracle_signals = COALESCE($8, oracle_signals),
          file_path = COALESCE($9, file_path),
          updated_by = $10,
          updated_at = NOW()
         WHERE deal_id = $11
         RETURNING *`,
        [title, content_md, key_people ? JSON.stringify(key_people) : null,
         deal_timeline ? JSON.stringify(deal_timeline) : null,
         transcript_refs ? JSON.stringify(transcript_refs) : null,
         houston_analysis || null, oracle_score || null,
         oracle_signals ? JSON.stringify(oracle_signals) : null,
         file_path || null, req.agentName || 'houston_command', deal_id]
      );
    } else {
      result = await pool.query(
        `INSERT INTO deal_dossiers
           (deal_id, title, content_md, key_people, deal_timeline, transcript_refs,
            houston_analysis, oracle_score, oracle_signals, file_path, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [deal_id, title, content_md || '', key_people ? JSON.stringify(key_people) : '[]',
         deal_timeline ? JSON.stringify(deal_timeline) : '[]',
         transcript_refs ? JSON.stringify(transcript_refs) : '[]',
         houston_analysis || null, oracle_score || null,
         oracle_signals ? JSON.stringify(oracle_signals) : '[]',
         file_path || null, req.agentName || 'houston_command']
      );
    }

    res.json({ ok: true, dossier: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /deal-dossiers error:', err.message);
    res.status(500).json({ error: 'Failed to save deal dossier' });
  }
});

// 44. GET /api/ai/deal-dossiers/:dealId — Get a deal's dossier
router.get('/deal-dossiers/:dealId', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { dealId } = req.params;
    const result = await pool.query('SELECT * FROM deal_dossiers WHERE deal_id = $1', [dealId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No dossier found for this deal' });
    }

    res.json({ dossier: result.rows[0] });
  } catch (err) {
    console.error('[AI API] GET /deal-dossiers/:dealId error:', err.message);
    res.status(500).json({ error: 'Failed to fetch deal dossier' });
  }
});

// 45. GET /api/ai/deal-dossiers — List all deal dossiers
router.get('/deal-dossiers', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT dd.*, d.name as deal_name, d.type as deal_type, d.status as deal_status
       FROM deal_dossiers dd
       JOIN deals d ON dd.deal_id = d.deal_id
       ORDER BY dd.updated_at DESC`
    );
    res.json({ dossiers: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[AI API] GET /deal-dossiers error:', err.message);
    res.status(500).json({ error: 'Failed to fetch deal dossiers' });
  }
});

// ============================================================
// FIREFLIES TRANSCRIPT ENDPOINTS — Call transcript ingestion
// ============================================================

// 39. POST /api/ai/transcripts/ingest — Receive a Fireflies transcript webhook
// Called by Fireflies webhook OR by an agent polling the Fireflies API
router.post('/transcripts/ingest', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      fireflies_meeting_id,
      fireflies_title,
      recording_url,
      audio_url,
      call_date,
      duration_seconds,
      call_type,
      caller,
      speakers,
      transcript_text,
      transcript_segments,
      our_caller,        // 'david', 'dad', 'sister'
      contact_id,        // Optional: pre-matched contact
      contact_name,      // Optional: for auto-matching
      contact_email,     // Optional: for auto-matching
      property_id,       // Optional: if property-specific
    } = req.body;

    if (!fireflies_meeting_id || !transcript_text) {
      return res.status(400).json({ error: 'fireflies_meeting_id and transcript_text are required' });
    }

    // Dedup check
    const existing = await pool.query(
      'SELECT id FROM call_transcripts WHERE fireflies_meeting_id = $1',
      [fireflies_meeting_id]
    );
    if (existing.rows.length > 0) {
      return res.json({ ok: true, skipped: true, reason: 'Already ingested this transcript', transcript_id: existing.rows[0].id });
    }

    // Auto-match contact if not provided
    let resolvedContactId = contact_id || null;
    if (!resolvedContactId && (contact_name || contact_email)) {
      let matchQuery = 'SELECT contact_id, full_name FROM contacts WHERE ';
      const matchParams = [];
      if (contact_email) {
        matchQuery += '(email = $1 OR email_2 = $1 OR email_3 = $1)';
        matchParams.push(contact_email);
      } else {
        matchQuery += 'full_name ILIKE $1';
        matchParams.push('%' + contact_name + '%');
      }
      matchQuery += ' LIMIT 1';
      const match = await pool.query(matchQuery, matchParams);
      if (match.rows.length > 0) {
        resolvedContactId = match.rows[0].contact_id;
      }
    }

    // Insert transcript
    const result = await pool.query(
      `INSERT INTO call_transcripts
         (fireflies_meeting_id, fireflies_title, recording_url, audio_url,
          call_date, duration_seconds, call_type, caller, speakers,
          transcript_text, transcript_segments, our_caller,
          contact_id, property_id, processing_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
       RETURNING id`,
      [
        fireflies_meeting_id,
        fireflies_title || null,
        recording_url || null,
        audio_url || null,
        call_date || new Date().toISOString(),
        duration_seconds || null,
        call_type || 'phone',
        caller || null,
        JSON.stringify(speakers || []),
        transcript_text,
        JSON.stringify(transcript_segments || []),
        our_caller || 'unknown',
        resolvedContactId,
        property_id || null,
      ]
    );

    const transcriptId = result.rows[0].id;

    // Log to agent activity
    console.log(`[AI API] Transcript ingested: ${fireflies_meeting_id} → ${transcriptId} (contact: ${resolvedContactId || 'unmatched'})`);

    res.json({
      ok: true,
      transcript_id: transcriptId,
      contact_matched: !!resolvedContactId,
      contact_id: resolvedContactId,
      processing_status: 'pending',
      message: 'Transcript ingested. Pending AI processing (summary + signals).',
    });
  } catch (err) {
    console.error('[AI API] POST /transcripts/ingest error:', err.message);
    res.status(500).json({ error: 'Failed to ingest transcript' });
  }
});

// 40. POST /api/ai/transcripts/:id/process — Process a transcript (generate summary + signals)
// Called by Houston Sonnet, Postmaster, or Oracle after ingestion
router.post('/transcripts/:id/process', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { id } = req.params;
    const {
      ai_summary,
      ai_key_points,
      ai_action_items,
      ai_topics,
      oracle_signals,
      sentiment_score,
      sentiment_label,
      sentiment_trajectory,
      create_interaction,  // boolean: should we create an activity record?
    } = req.body;

    // Update transcript with AI analysis
    const updates = ['processing_status = $1', 'processed_by = $2', 'processed_at = NOW()'];
    const params = ['completed', req.agentName || 'unknown'];
    let idx = 3;

    if (ai_summary) { updates.push(`ai_summary = $${idx++}`); params.push(ai_summary); }
    if (ai_key_points) { updates.push(`ai_key_points = $${idx++}`); params.push(JSON.stringify(ai_key_points)); }
    if (ai_action_items) { updates.push(`ai_action_items = $${idx++}`); params.push(JSON.stringify(ai_action_items)); }
    if (ai_topics) { updates.push(`ai_topics = $${idx++}`); params.push(JSON.stringify(ai_topics)); }
    if (oracle_signals) {
      updates.push(`oracle_signals = $${idx++}`);
      params.push(JSON.stringify(oracle_signals));
      updates.push(`oracle_signal_count = $${idx++}`);
      params.push(oracle_signals.length);
    }
    if (sentiment_score !== undefined) { updates.push(`sentiment_score = $${idx++}`); params.push(sentiment_score); }
    if (sentiment_label) { updates.push(`sentiment_label = $${idx++}`); params.push(sentiment_label); }
    if (sentiment_trajectory) { updates.push(`sentiment_trajectory = $${idx++}`); params.push(sentiment_trajectory); }

    params.push(id);
    const transcript = await pool.query(
      `UPDATE call_transcripts SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (transcript.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }

    const t = transcript.rows[0];
    let interactionId = null;

    // Create interaction (activity) record with just the summary
    if (create_interaction && t.contact_id && ai_summary) {
      const interResult = await pool.query(
        `INSERT INTO interactions
           (contact_id, type, date, notes, transcript_id, has_transcript)
         VALUES ($1, 'Phone Call', $2, $3, $4, true)
         RETURNING interaction_id`,
        [
          t.contact_id,
          t.call_date,
          ai_summary,
          id,
        ]
      );
      interactionId = interResult.rows[0].interaction_id;

      // Update transcript with interaction link
      await pool.query(
        'UPDATE call_transcripts SET interaction_id = $1 WHERE id = $2',
        [interactionId, id]
      );

      // Link interaction to property if known
      if (t.property_id) {
        await pool.query(
          `INSERT INTO interaction_properties (interaction_id, property_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [interactionId, t.property_id]
        );
      }
    }

    res.json({
      ok: true,
      transcript_id: id,
      interaction_id: interactionId,
      signal_count: oracle_signals ? oracle_signals.length : 0,
      sentiment: sentiment_label || null,
    });
  } catch (err) {
    console.error('[AI API] POST /transcripts/:id/process error:', err.message);
    res.status(500).json({ error: 'Failed to process transcript' });
  }
});

// 41. GET /api/ai/transcripts — List transcripts (with filters)
router.get('/transcripts', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { contact_id, status, our_caller, limit = 50 } = req.query;

    let query = 'SELECT id, fireflies_title, call_date, duration_seconds, call_type, our_caller, contact_id, ai_summary, oracle_signal_count, sentiment_label, processing_status, created_at FROM call_transcripts WHERE 1=1';
    const params = [];
    let idx = 1;

    if (contact_id) { query += ` AND contact_id = $${idx++}`; params.push(contact_id); }
    if (status) { query += ` AND processing_status = $${idx++}`; params.push(status); }
    if (our_caller) { query += ` AND our_caller = $${idx++}`; params.push(our_caller); }

    query += ` ORDER BY call_date DESC LIMIT $${idx++}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ transcripts: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[AI API] GET /transcripts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch transcripts' });
  }
});

// 42. GET /api/ai/transcripts/:id — Get full transcript with all analysis
router.get('/transcripts/:id', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM call_transcripts WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transcript not found' });
    }
    res.json({ transcript: result.rows[0] });
  } catch (err) {
    console.error('[AI API] GET /transcripts/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch transcript' });
  }
});

// 43. GET /api/ai/transcripts/contact/:contactId/signals — Get all Oracle signals for a contact
// Used by Oracle to build voice profiles and sentiment trajectories
router.get('/transcripts/contact/:contactId/signals', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { contactId } = req.params;
    const result = await pool.query(
      `SELECT id, call_date, oracle_signals, oracle_signal_count,
              sentiment_score, sentiment_label, sentiment_trajectory,
              duration_seconds, ai_summary
       FROM call_transcripts
       WHERE contact_id = $1 AND oracle_signal_count > 0
       ORDER BY call_date DESC`,
      [contactId]
    );
    res.json({
      contact_id: contactId,
      transcripts_with_signals: result.rows.length,
      total_signals: result.rows.reduce((sum, r) => sum + (r.oracle_signal_count || 0), 0),
      data: result.rows,
    });
  } catch (err) {
    console.error('[AI API] GET /transcripts/contact/:id/signals error:', err.message);
    res.status(500).json({ error: 'Failed to fetch contact signals' });
  }
});

// ============================================================
// POSTMASTER ENDPOINTS — Email monitoring & activity logging
// ============================================================

// 23. POST /api/ai/email/activity — Log an email as a CRM activity (interaction)
// Called by Postmaster when it matches an email to a CRM contact with track_emails=true
router.post('/email/activity', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      contact_id,        // UUID — the CRM contact this email is for
      direction,         // 'inbound' or 'outbound'
      subject,           // Email subject line
      body_summary,      // Short summary of email content (not full body)
      sender_email,      // Who sent it
      recipient_email,   // Who received it
      email_date,        // When the email was sent (ISO timestamp)
      gmail_message_id,  // Gmail message ID for dedup
      workflow_id,       // Optional: workflow chain reference
    } = req.body;

    if (!contact_id || !direction || !subject) {
      return res.status(400).json({ error: 'contact_id, direction, and subject are required' });
    }

    // Check if contact has track_emails enabled
    const contact = await pool.query(
      'SELECT contact_id, full_name, track_emails FROM contacts WHERE contact_id = $1',
      [contact_id]
    );
    if (contact.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    if (!contact.rows[0].track_emails) {
      return res.json({ ok: true, skipped: true, reason: 'track_emails is OFF for this contact' });
    }

    // Dedup: check if we already logged this gmail_message_id
    if (gmail_message_id) {
      const existing = await pool.query(
        "SELECT id FROM interactions WHERE notes LIKE '%' || $1 || '%' AND contact_id = $2",
        [gmail_message_id, contact_id]
      );
      if (existing.rows.length > 0) {
        return res.json({ ok: true, skipped: true, reason: 'Already logged this email' });
      }
    }

    // Write to sandbox_signals first (goes through Ralph validation)
    const result = await pool.query(
      `INSERT INTO sandbox_signals
         (signal_type, title, body, source, confidence_score, agent_name, status, workflow_id)
       VALUES ('email_activity', $1, $2, 'houston_gmail', $3, $4, 'pending', $5)
       RETURNING id`,
      [
        `${direction === 'inbound' ? '📥' : '📤'} Email: ${subject}`,
        JSON.stringify({
          contact_id,
          contact_name: contact.rows[0].full_name,
          direction,
          subject,
          body_summary,
          sender_email,
          recipient_email,
          email_date,
          gmail_message_id,
        }),
        85, // High confidence — email matching is pretty reliable
        req.agentName || 'postmaster',
        workflow_id || null,
      ]
    );

    res.json({
      ok: true,
      sandbox_signal_id: result.rows[0].id,
      message: 'Email activity queued for validation',
    });
  } catch (err) {
    console.error('[AI API] POST /email/activity error:', err.message);
    res.status(500).json({ error: 'Failed to log email activity' });
  }
});

// 24. POST /api/ai/email/triage — Flag an urgent/important email for the team
// Called by Postmaster when it detects a time-sensitive email that needs attention
router.post('/email/triage', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      recipient_name,   // 'david' or 'dad' — who should see this
      sender_name,      // Who sent the email
      sender_email,
      subject,
      urgency,          // 'high', 'normal'
      reason,           // Why this is flagged (e.g. 'deal-relevant, unread >2hrs')
      contact_id,       // Optional: matched CRM contact
      summary,          // Brief summary for the notification
    } = req.body;

    if (!recipient_name || !subject || !reason) {
      return res.status(400).json({ error: 'recipient_name, subject, and reason are required' });
    }

    // Post as a Houston insight in Team Chat (General channel)
    const generalCh = await pool.query(
      "SELECT id FROM chat_channels WHERE name = 'General' AND channel_type = 'group' LIMIT 1"
    );
    if (generalCh.rows.length === 0) {
      return res.status(404).json({ error: 'General channel not found' });
    }

    const alertEmoji = urgency === 'high' ? '🚨' : '📧';
    const body = `${alertEmoji} **Email alert for ${recipient_name}:** ${sender_name || sender_email} sent "${subject}"\n\n${summary || ''}\n\n_Flagged by Postmaster: ${reason}_`;

    const msg = await pool.query(
      `INSERT INTO chat_messages
         (channel_id, sender_id, sender_type, body, message_type, houston_meta)
       VALUES ($1, NULL, 'houston', $2, 'houston_insight', $3)
       RETURNING *`,
      [
        generalCh.rows[0].id,
        body,
        JSON.stringify({
          trigger: 'email_triage',
          sender_name: 'Postmaster',
          urgency,
          contact_id: contact_id || null,
          original_sender: sender_email,
        }),
      ]
    );

    // Emit via socket
    const io = getIo();
    if (io) {
      const message = msg.rows[0];
      message.sender_name = 'Houston';
      message.sender_color = '#10b981';
      io.to(`channel:${generalCh.rows[0].id}`).emit('chat:message:new', message);
    }

    res.json({ ok: true, message_id: msg.rows[0].id });
  } catch (err) {
    console.error('[AI API] POST /email/triage error:', err.message);
    res.status(500).json({ error: 'Failed to create email triage alert' });
  }
});

// 25. GET /api/ai/email/contacts — Get contacts with track_emails enabled
// Called by Postmaster to know which contacts' emails should be logged
router.get('/email/contacts', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT contact_id, full_name, email_1, email_2, email_3, track_emails_since
       FROM contacts
       WHERE track_emails = true
       ORDER BY full_name`
    );
    res.json({ contacts: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[AI API] GET /email/contacts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch tracked contacts' });
  }
});

// ============================================================
// CAMPAIGN MANAGER ENDPOINTS — Outbound email campaigns
// ============================================================

// 26. POST /api/ai/campaign/outreach — Submit outreach draft for validation
// Called by Campaign Manager when it generates AIR-triggered or campaign outreach
router.post('/campaign/outreach', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      contact_id,
      subject,
      body_html,
      body_text,
      campaign_type,       // 'air_triggered', 'drip_campaign', 'one_off'
      send_from,           // Email address to send from
      property_address,    // Optional: property context
      property_details,    // Optional: JSONB property data
      air_report_id,       // Optional: which AIR report triggered this
      workflow_id,         // Optional: workflow chain reference
      dedup_key,           // Hash for deduplication
    } = req.body;

    if (!contact_id || !subject || !body_text) {
      return res.status(400).json({ error: 'contact_id, subject, and body_text are required' });
    }

    // Dedup check
    if (dedup_key) {
      const existing = await pool.query(
        'SELECT id FROM sandbox_outreach WHERE dedup_key = $1',
        [dedup_key]
      );
      if (existing.rows.length > 0) {
        return res.json({ ok: true, skipped: true, reason: 'Duplicate outreach (dedup_key match)' });
      }
    }

    const result = await pool.query(
      `INSERT INTO sandbox_outreach
         (contact_id, subject, body_html, body_text, property_address, property_details,
          agent_name, confidence_score, status, dedup_key, workflow_id, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10, $11)
       RETURNING id`,
      [
        contact_id,
        subject,
        body_html || null,
        body_text,
        property_address || null,
        property_details ? JSON.stringify(property_details) : null,
        req.agentName || 'campaign_manager',
        75, // Default confidence for campaign-generated outreach
        dedup_key || null,
        workflow_id || null,
        JSON.stringify({ campaign_type, send_from, air_report_id }),
      ]
    );

    res.json({
      ok: true,
      sandbox_outreach_id: result.rows[0].id,
      message: 'Outreach draft queued for Ralph validation',
    });
  } catch (err) {
    console.error('[AI API] POST /campaign/outreach error:', err.message);
    res.status(500).json({ error: 'Failed to submit outreach draft' });
  }
});

// 27. POST /api/ai/campaign/send — Send an approved outreach email
// Called AFTER Ralph approves the outreach — this queues it for actual delivery
router.post('/campaign/send', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      sandbox_outreach_id,  // Which approved outreach to send
      send_via,             // 'instantly' or 'direct' (david@mudgeteam.com)
      send_from,            // Email address
      scheduled_at,         // Optional: schedule for later
    } = req.body;

    if (!sandbox_outreach_id || !send_via || !send_from) {
      return res.status(400).json({ error: 'sandbox_outreach_id, send_via, and send_from are required' });
    }

    // Verify the outreach was approved
    const outreach = await pool.query(
      'SELECT * FROM sandbox_outreach WHERE id = $1 AND status = $2',
      [sandbox_outreach_id, 'approved']
    );
    if (outreach.rows.length === 0) {
      return res.status(400).json({ error: 'Outreach not found or not approved' });
    }

    const o = outreach.rows[0];

    // Queue in outbound_email_queue
    const result = await pool.query(
      `INSERT INTO outbound_email_queue
         (contact_id, subject, body_html, body_text, send_from, status, workflow_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        o.contact_id,
        o.subject,
        o.body_html,
        o.body_text,
        send_from,
        scheduled_at ? 'queued' : 'queued',
        o.workflow_id || null,
      ]
    );

    res.json({
      ok: true,
      email_queue_id: result.rows[0].id,
      message: `Outreach queued for delivery via ${send_via}`,
    });
  } catch (err) {
    console.error('[AI API] POST /campaign/send error:', err.message);
    res.status(500).json({ error: 'Failed to queue email for sending' });
  }
});

// 28. GET /api/ai/campaign/analytics — Campaign performance data
// Called by Campaign Manager and Houston Command to analyze email performance
router.get('/campaign/analytics', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { days = 30 } = req.query;

    // Sent, opened, replied, bounced counts
    const stats = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'sent') AS sent,
         COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
         COUNT(*) FILTER (WHERE replied_at IS NOT NULL) AS replied,
         COUNT(*) FILTER (WHERE bounced_at IS NOT NULL) AS bounced,
         COUNT(*) FILTER (WHERE unsubscribed_at IS NOT NULL) AS unsubscribed,
         COUNT(*) FILTER (WHERE status = 'queued') AS queued,
         COUNT(*) FILTER (WHERE status = 'failed') AS failed
       FROM outbound_email_queue
       WHERE created_at > NOW() - ($1 || ' days')::INTERVAL`,
      [days]
    );

    // Open rate and reply rate
    const s = stats.rows[0];
    const totalSent = parseInt(s.sent) || 1; // avoid divide by zero
    const openRate = ((parseInt(s.opened) / totalSent) * 100).toFixed(1);
    const replyRate = ((parseInt(s.replied) / totalSent) * 100).toFixed(1);
    const bounceRate = ((parseInt(s.bounced) / totalSent) * 100).toFixed(1);

    res.json({
      period_days: parseInt(days),
      ...s,
      open_rate: openRate + '%',
      reply_rate: replyRate + '%',
      bounce_rate: bounceRate + '%',
    });
  } catch (err) {
    console.error('[AI API] GET /campaign/analytics error:', err.message);
    res.status(500).json({ error: 'Failed to fetch campaign analytics' });
  }
});

// ============================================================
// ============================================================
// AIR INGEST — Parse AIR super sheets into CRM
// ============================================================

// 53. POST /api/ai/air/ingest — Ingest parsed AIR data into CRM
// Called by Matcher agent (or Houston Command) with classified JSON from the parser
router.post('/air/ingest', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      parsed_date,
      source_file,
      new_listings_for_lease = [],
      new_listings_for_sale = [],
      lease_comps = [],
      sale_comps = [],
      updated_listings = [],
      summary = {},
    } = req.body;

    if (!parsed_date) {
      return res.status(400).json({ error: 'parsed_date is required' });
    }

    const results = {
      properties_created: 0,
      properties_updated: 0,
      lease_comps_created: 0,
      sale_comps_created: 0,
      market_tracking_created: 0,
      market_tracking_updated: 0,
      errors: [],
    };

    // Helper: find or create property by address + city
    // Uses compositeMatcher for fuzzy matching, falls back to create
    // Load all properties once for matching across the full ingest
    const allProperties = (await pool.query(
      `SELECT property_id, property_address, city, zip FROM properties`
    )).rows;

    async function findOrCreateProperty(rawEntry) {
      const norm = normalizeRecord(rawEntry, 'properties', 'air_sheet');
      const addr = (rawEntry.address || norm.property_address || '').trim();
      const city = (rawEntry.city || norm.city || '').trim();
      if (!addr) return null;

      // Use compositeMatcher for consistent fuzzy matching
      const matchResult = matchProperty(
        { property_address: addr, city, zip: rawEntry.zip || '' },
        allProperties
      );

      if (matchResult.match && matchResult.match.confidence >= 75) {
        return matchResult.match.id;
      }

      // Create new property using normalized fields
      const newProp = await pool.query(
        `INSERT INTO properties (property_address, city, state, zip, property_type, rba, property_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING property_id`,
        [addr, city, rawEntry.state || 'CA', rawEntry.zip,
         norm.property_type || rawEntry.property_type || 'Industrial',
         norm.rba || rawEntry.building_sf || rawEntry.sf,
         norm.property_name || rawEntry.property_name]
      );
      results.properties_created++;
      // Add to in-memory list so subsequent entries in same batch can match
      allProperties.push({ property_id: newProp.rows[0].property_id, property_address: addr, city, zip: rawEntry.zip || '' });
      return newProp.rows[0].property_id;
    }

    // ── NEW LISTINGS FOR LEASE ──
    for (const listing of new_listings_for_lease) {
      try {
        const propertyId = await findOrCreateProperty(listing);

        // Check if already in market_tracking — use air_entry_number first, fall back to address
        const exists = listing.air_entry_number
          ? await pool.query(
              `SELECT id FROM market_tracking
               WHERE air_entry_number = $1 AND market_status = 'for_lease'
               AND first_seen_source = 'air_sheet'`,
              [listing.air_entry_number]
            )
          : await pool.query(
              `SELECT id FROM market_tracking
               WHERE LOWER(property_address) = LOWER($1) AND market_status = 'for_lease'
               AND outcome_type IS NULL`,
              [listing.address]
            );

        if (exists.rows.length === 0) {
          await pool.query(
            `INSERT INTO market_tracking
               (property_id, property_address, submarket, property_type, building_sf,
                market_status, first_seen_date, first_seen_source,
                asking_lease_rate, available_sf, office_sf, clear_height,
                dock_high_doors, grade_level_doors, construction_status,
                property_name, listing_broker, listing_agents,
                air_entry_number, last_air_sheet_date)
             VALUES ($1,$2,$3,$4,$5,'for_lease',$6,'air_sheet',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
            [propertyId, listing.address, listing.submarket || listing.city,
             listing.property_type || 'Industrial', listing.building_sf,
             parsed_date, listing.asking_rate, listing.available_sf,
             listing.office_sf, listing.clear_height, listing.dock_high_doors,
             listing.grade_level_doors, listing.construction_status,
             listing.property_name, listing.listing_broker, listing.listing_agents,
             listing.air_entry_number, parsed_date]
          );
          results.market_tracking_created++;
        } else {
          // Update last_air_sheet_date on existing record so we know it's still active
          await pool.query(
            `UPDATE market_tracking SET last_air_sheet_date = $1 WHERE id = $2`,
            [parsed_date, exists.rows[0].id]
          );
          results.market_tracking_updated++;
        }

        // Sync listing data back to properties row
        if (propertyId) {
          await pool.query(
            `UPDATE properties SET
               listing_status = 'for_lease',
               listing_asking_lease_rate = COALESCE($2, listing_asking_lease_rate),
               total_available_sf = COALESCE($3, total_available_sf),
               listing_first_seen_date = COALESCE(listing_first_seen_date, $4)
             WHERE property_id = $1`,
            [propertyId, listing.asking_rate, listing.available_sf, parsed_date]
          );
        }
      } catch (err) {
        results.errors.push({ type: 'new_listing_lease', address: listing.address, error: err.message });
      }
    }

    // ── NEW LISTINGS FOR SALE ──
    for (const listing of new_listings_for_sale) {
      try {
        const propertyId = await findOrCreateProperty(listing);

        const exists = listing.air_entry_number
          ? await pool.query(
              `SELECT id FROM market_tracking
               WHERE air_entry_number = $1 AND market_status = 'for_sale'
               AND first_seen_source = 'air_sheet'`,
              [listing.air_entry_number]
            )
          : await pool.query(
              `SELECT id FROM market_tracking
               WHERE LOWER(property_address) = LOWER($1) AND market_status = 'for_sale'
               AND outcome_type IS NULL`,
              [listing.address]
            );

        if (exists.rows.length === 0) {
          await pool.query(
            `INSERT INTO market_tracking
               (property_id, property_address, submarket, property_type, building_sf,
                market_status, first_seen_date, first_seen_source,
                asking_price, asking_price_psf,
                property_name, listing_broker, listing_agents,
                air_entry_number, last_air_sheet_date)
             VALUES ($1,$2,$3,$4,$5,'for_sale',$6,'air_sheet',$7,$8,$9,$10,$11,$12,$13)`,
            [propertyId, listing.address, listing.submarket || listing.city,
             listing.property_type || 'Industrial', listing.building_sf,
             parsed_date, listing.asking_price, listing.price_psf,
             listing.property_name, listing.listing_broker, listing.listing_agents,
             listing.air_entry_number, parsed_date]
          );
          results.market_tracking_created++;
        } else {
          await pool.query(
            `UPDATE market_tracking SET last_air_sheet_date = $1 WHERE id = $2`,
            [parsed_date, exists.rows[0].id]
          );
          results.market_tracking_updated++;
        }

        // Sync listing data back to properties row
        if (propertyId) {
          await pool.query(
            `UPDATE properties SET
               listing_status = 'for_sale',
               for_sale_price = COALESCE($2, for_sale_price),
               listing_first_seen_date = COALESCE(listing_first_seen_date, $3)
             WHERE property_id = $1`,
            [propertyId, listing.asking_price, parsed_date]
          );
        }
      } catch (err) {
        results.errors.push({ type: 'new_listing_sale', address: listing.address, error: err.message });
      }
    }

    // ── LEASE COMPS ──
    for (const comp of lease_comps) {
      try {
        const propertyId = await findOrCreateProperty(comp);

        // Dedup: use air_entry_number first, fall back to address + tenant
        const exists = comp.air_entry_number
          ? await pool.query(
              `SELECT id FROM lease_comps
               WHERE air_entry_number = $1 AND source = 'air_sheet'`,
              [comp.air_entry_number]
            )
          : await pool.query(
              `SELECT id FROM lease_comps
               WHERE LOWER(property_address) = LOWER($1)
               AND LOWER(tenant_name) = LOWER($2)`,
              [comp.address, comp.tenant_name || '']
            );

        if (exists.rows.length === 0) {
          await pool.query(
            `INSERT INTO lease_comps
               (property_id, property_address, city, tenant_name, sf, rate, rent_type,
                sign_date, term_months, building_rba,
                tenant_rep_agents, landlord_rep_agents,
                source, air_sheet_date, air_entry_number, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'air_sheet',$13,$14,$15)`,
            [propertyId, comp.address, comp.city, comp.tenant_name,
             comp.sf, comp.rate, comp.rate_type,
             comp.sign_date, comp.term_months, comp.building_sf,
             comp.tenant_rep, comp.landlord_rep,
             parsed_date, comp.air_entry_number, comp.notes]
          );
          results.lease_comps_created++;

          // Also update market_tracking if this property was listed
          const compDate = comp.sign_date || parsed_date;
          await pool.query(
            `UPDATE market_tracking SET
               outcome_type = 'transacted',
               outcome_date = $1::date,
               lease_rate = $2,
               days_on_market = CASE WHEN first_seen_date IS NOT NULL
                 THEN ($1::date - first_seen_date) ELSE NULL END
             WHERE LOWER(property_address) = LOWER($3)
             AND market_status = 'for_lease' AND outcome_type IS NULL`,
            [compDate, comp.rate, comp.address]
          );

          // Update property listing_status (multi-tenant aware)
          if (propertyId) {
            const remaining = await pool.query(
              `SELECT market_status FROM market_tracking
               WHERE property_id = $1 AND outcome_type IS NULL`,
              [propertyId]
            );
            if (remaining.rows.length > 0) {
              // Still has active listings — prefer for_sale over for_lease
              const hasForSale = remaining.rows.some(r => r.market_status === 'for_sale');
              await pool.query(
                `UPDATE properties SET listing_status = $2 WHERE property_id = $1`,
                [propertyId, hasForSale ? 'for_sale' : 'for_lease']
              );
            } else {
              // No active listings remain — mark as leased
              await pool.query(
                `UPDATE properties SET listing_status = 'leased' WHERE property_id = $1`,
                [propertyId]
              );
            }
          }
        }
      } catch (err) {
        results.errors.push({ type: 'lease_comp', address: comp.address, error: err.message });
      }
    }

    // ── SALE COMPS ──
    for (const comp of sale_comps) {
      try {
        const propertyId = await findOrCreateProperty(comp);

        // Dedup: use air_entry_number first, fall back to address + sale_date
        const exists = comp.air_entry_number
          ? await pool.query(
              `SELECT id FROM sale_comps
               WHERE air_entry_number = $1`,
              [comp.air_entry_number]
            )
          : await pool.query(
              `SELECT id FROM sale_comps
               WHERE LOWER(property_address) = LOWER($1)
               AND sale_date = $2`,
              [comp.address, comp.sale_date || parsed_date]
            );

        if (exists.rows.length === 0) {
          await pool.query(
            `INSERT INTO sale_comps
               (property_id, property_address, city, sale_date, sale_price, price_psf,
                sf, building_sf, cap_rate, buyer_name, seller_name,
                property_type, source, air_sheet_date, air_entry_number, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'air_sheet',$13,$14,$15)`,
            [propertyId, comp.address, comp.city,
             comp.sale_date, comp.sale_price, comp.price_psf,
             comp.sf, comp.building_sf, comp.cap_rate,
             comp.buyer_name, comp.seller_name,
             comp.property_type || 'Industrial',
             parsed_date, comp.air_entry_number, comp.notes]
          );
          results.sale_comps_created++;

          // Update market_tracking
          await pool.query(
            `UPDATE market_tracking SET
               outcome_type = 'transacted', outcome_date = $1,
               sale_price = $2, sale_price_psf = $3,
               days_on_market = CASE WHEN first_seen_date IS NOT NULL
                 THEN ($1::date - first_seen_date) ELSE NULL END
             WHERE LOWER(property_address) = LOWER($4)
             AND market_status = 'for_sale' AND outcome_type IS NULL`,
            [comp.sale_date || parsed_date, comp.sale_price, comp.price_psf, comp.address]
          );

          // Update property listing_status (multi-tenant aware)
          if (propertyId) {
            const remaining = await pool.query(
              `SELECT market_status FROM market_tracking
               WHERE property_id = $1 AND outcome_type IS NULL`,
              [propertyId]
            );
            if (remaining.rows.length > 0) {
              // Still has active listings — prefer for_sale over for_lease
              const hasForSale = remaining.rows.some(r => r.market_status === 'for_sale');
              await pool.query(
                `UPDATE properties SET listing_status = $2 WHERE property_id = $1`,
                [propertyId, hasForSale ? 'for_sale' : 'for_lease']
              );
            } else {
              // No active listings remain — mark as sold
              await pool.query(
                `UPDATE properties SET listing_status = 'sold' WHERE property_id = $1`,
                [propertyId]
              );
            }
          }
        }
      } catch (err) {
        results.errors.push({ type: 'sale_comp', address: comp.address, error: err.message });
      }
    }

    // ── UPDATED LISTINGS ──
    for (const update of updated_listings) {
      try {
        // Find the existing market_tracking entry
        const existing = await pool.query(
          `SELECT id, asking_lease_rate, asking_price, market_status, available_sf
           FROM market_tracking
           WHERE LOWER(property_address) = LOWER($1) AND outcome_type IS NULL
           ORDER BY first_seen_date DESC LIMIT 1`,
          [update.address]
        );

        if (existing.rows.length > 0) {
          const mt = existing.rows[0];

          // Log the change
          await pool.query(
            `INSERT INTO market_tracking_changes
               (market_tracking_id, property_address, field_changed,
                previous_value, new_value, change_type,
                air_sheet_date, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [mt.id, update.address, update.field_changed || 'unknown',
             update.previous_value, update.new_value,
             update.change_type || 'update',
             parsed_date, update.notes]
          );

          // Update the market_tracking row with new values if applicable
          if (update.field_changed === 'asking_rate' || update.field_changed === 'asking_lease_rate') {
            await pool.query(
              `UPDATE market_tracking SET asking_lease_rate = $1, last_air_sheet_date = $2,
               change_count = change_count + 1 WHERE id = $3`,
              [parseFloat(update.new_value) || null, parsed_date, mt.id]
            );
          } else if (update.field_changed === 'asking_price') {
            await pool.query(
              `UPDATE market_tracking SET asking_price = $1, last_air_sheet_date = $2,
               change_count = change_count + 1 WHERE id = $3`,
              [parseFloat(update.new_value) || null, parsed_date, mt.id]
            );
          } else if (update.field_changed === 'available_sf') {
            await pool.query(
              `UPDATE market_tracking SET available_sf = $1, last_air_sheet_date = $2,
               change_count = change_count + 1 WHERE id = $3`,
              [parseFloat(update.new_value) || null, parsed_date, mt.id]
            );
          } else {
            // Generic update — just bump the sheet date and change count
            await pool.query(
              `UPDATE market_tracking SET last_air_sheet_date = $1,
               change_count = change_count + 1 WHERE id = $2`,
              [parsed_date, mt.id]
            );
          }

          results.market_tracking_updated++;
        } else {
          // No existing record — might be a listing we haven't seen before
          results.errors.push({
            type: 'updated_listing',
            address: update.address,
            error: 'No existing market_tracking record found for update',
          });
        }
      } catch (err) {
        results.errors.push({ type: 'updated_listing', address: update.address, error: err.message });
      }
    }

    // ── LOG THE PARSE RUN ──
    await pool.query(
      `INSERT INTO air_parse_runs
         (source_file, parsed_date, agent_name,
          new_listings_lease, new_listings_sale, lease_comps_found, sale_comps_found,
          updated_listings, total_entries,
          properties_created, properties_updated,
          lease_comps_created, sale_comps_created,
          market_tracking_created, market_tracking_updated,
          errors, status, error_log)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [source_file || `air-sheet-${parsed_date}.pdf`,
       parsed_date,
       req.agentName || 'matcher',
       new_listings_for_lease.length,
       new_listings_for_sale.length,
       lease_comps.length,
       sale_comps.length,
       updated_listings.length,
       summary.total_entries || (new_listings_for_lease.length + new_listings_for_sale.length +
         lease_comps.length + sale_comps.length + updated_listings.length),
       results.properties_created,
       results.properties_updated,
       results.lease_comps_created,
       results.sale_comps_created,
       results.market_tracking_created,
       results.market_tracking_updated,
       results.errors.length,
       results.errors.length === 0 ? 'completed' : 'partial',
       JSON.stringify(results.errors)]
    );

    res.json({
      ok: true,
      parsed_date,
      results,
      summary: {
        new_listings: new_listings_for_lease.length + new_listings_for_sale.length,
        comps: lease_comps.length + sale_comps.length,
        updates: updated_listings.length,
        properties_created: results.properties_created,
        errors: results.errors.length,
      },
    });
  } catch (err) {
    console.error('[AI API] POST /air/ingest error:', err.message);
    res.status(500).json({ error: 'Failed to ingest AIR data' });
  }
});

// 54. GET /api/ai/air/runs — List AIR parse run history
router.get('/air/runs', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { limit = 20 } = req.query;
    const result = await pool.query(
      `SELECT * FROM air_parse_runs ORDER BY parsed_date DESC LIMIT $1`,
      [parseInt(limit)]
    );
    res.json({ runs: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[AI API] GET /air/runs error:', err.message);
    res.status(500).json({ error: 'Failed to fetch parse runs' });
  }
});

// 55. GET /api/ai/air/changes — List market tracking changes
router.get('/air/changes', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { address, field, limit = 50 } = req.query;
    let query = 'SELECT * FROM market_tracking_changes WHERE 1=1';
    const params = [];
    let idx = 1;

    if (address) {
      query += ` AND LOWER(property_address) LIKE LOWER($${idx++})`;
      params.push(`%${address}%`);
    }
    if (field) {
      query += ` AND field_changed = $${idx++}`;
      params.push(field);
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ changes: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[AI API] GET /air/changes error:', err.message);
    res.status(500).json({ error: 'Failed to fetch changes' });
  }
});

// ============================================================
// ============================================================
// BRAIN SESSIONS — Three-way team meetings (David + Houston + Claude Code)
// ============================================================

// 60. POST /api/ai/brain-session/start — Start a new brain session
router.post('/brain-session/start', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { topic } = req.body;
    if (!topic) {
      return res.status(400).json({ error: 'topic is required' });
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    // Count existing sessions today
    const count = await pool.query(
      "SELECT COUNT(*) FROM council_meetings WHERE meeting_id LIKE $1",
      [`session-${dateStr}%`]
    );
    const seqNum = parseInt(count.rows[0].count) + 1;
    const meetingId = `session-${dateStr}-${seqNum}`;

    const result = await pool.query(
      `INSERT INTO council_meetings
         (meeting_id, title, topic, status, meeting_type, participants, started_at)
       VALUES ($1, $2, $3, 'in_progress', 'team_session', $4, NOW())
       RETURNING *`,
      [
        meetingId,
        `Team Session — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} — ${topic}`,
        topic,
        '{david,houston_command,claude_code}',
      ]
    );

    res.json({ ok: true, meeting: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /brain-session/start error:', err.message);
    res.status(500).json({ error: 'Failed to start brain session' });
  }
});

// 61. POST /api/ai/brain-session/post — Post a message to the active brain session
router.post('/brain-session/post', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { meeting_id, author, body, round = 'discussion' } = req.body;

    if (!meeting_id || !author || !body) {
      return res.status(400).json({ error: 'meeting_id, author, and body are required' });
    }

    const displayNames = {
      david: 'David Mudge Jr',
      houston_command: 'Houston Command',
      claude_code: 'Claude Code',
      houston_sonnet: 'Houston Sonnet',
    };
    const modelNames = {
      houston_command: 'Opus 4.6',
      claude_code: 'Opus 4.6',
      houston_sonnet: 'Sonnet 4.6',
      ralph_gpt: 'GPT-4',
      ralph_gemini: 'Gemini Pro',
    };

    const result = await pool.query(
      `INSERT INTO council_meeting_posts
         (meeting_id, author, author_display_name, author_model, round, body, word_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        meeting_id,
        author,
        displayNames[author] || author,
        modelNames[author] || null,
        round,
        body,
        body.split(/\s+/).length,
      ]
    );

    // Emit via socket for real-time updates in the UI
    const io = getIo();
    if (io) {
      io.to('council').emit('council:meeting:post', {
        meeting_id,
        post: result.rows[0],
      });
    }

    res.json({ ok: true, post: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /brain-session/post error:', err.message);
    res.status(500).json({ error: 'Failed to post to brain session' });
  }
});

// 62. POST /api/ai/brain-session/end — End the brain session with a summary
router.post('/brain-session/end', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { meeting_id, summary, action_items = [], decisions = [] } = req.body;

    if (!meeting_id) {
      return res.status(400).json({ error: 'meeting_id is required' });
    }

    // Post the summary as the final message
    if (summary) {
      await pool.query(
        `INSERT INTO council_meeting_posts
           (meeting_id, author, author_display_name, author_model, round, body, word_count)
         VALUES ($1, 'claude_code', 'Claude Code', 'Opus 4.6', 'summary', $2, $3)`,
        [meeting_id, summary, summary.split(/\s+/).length]
      );
    }

    // Calculate duration
    const meeting = await pool.query(
      'SELECT started_at FROM council_meetings WHERE meeting_id = $1',
      [meeting_id]
    );
    const durationMin = meeting.rows.length > 0
      ? Math.round((Date.now() - new Date(meeting.rows[0].started_at).getTime()) / 60000)
      : null;

    // Count posts
    const postCount = await pool.query(
      'SELECT COUNT(*) FROM council_meeting_posts WHERE meeting_id = $1',
      [meeting_id]
    );

    // Update the meeting record
    const result = await pool.query(
      `UPDATE council_meetings SET
         status = 'completed',
         completed_at = NOW(),
         summary = $1,
         action_items = $2,
         top_recommendations = $3,
         duration_minutes = $4,
         updated_at = NOW()
       WHERE meeting_id = $5
       RETURNING *`,
      [
        summary,
        JSON.stringify(action_items),
        JSON.stringify(decisions),
        durationMin,
        meeting_id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({
      ok: true,
      meeting: result.rows[0],
      stats: {
        duration_minutes: durationMin,
        total_posts: parseInt(postCount.rows[0].count),
        action_items: action_items.length,
        decisions: decisions.length,
      },
    });
  } catch (err) {
    console.error('[AI API] POST /brain-session/end error:', err.message);
    res.status(500).json({ error: 'Failed to end brain session' });
  }
});

// 63. GET /api/ai/brain-session/active — Get the currently active brain session
router.get('/brain-session/active', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const result = await pool.query(
      `SELECT m.*,
         (SELECT COUNT(*) FROM council_meeting_posts WHERE meeting_id = m.meeting_id) AS post_count
       FROM council_meetings m
       WHERE m.status = 'in_progress' AND m.meeting_type = 'team_session'
       ORDER BY m.started_at DESC LIMIT 1`
    );
    if (result.rows.length === 0) {
      return res.json({ active: false, meeting: null });
    }
    res.json({ active: true, meeting: result.rows[0] });
  } catch (err) {
    console.error('[AI API] GET /brain-session/active error:', err.message);
    res.status(500).json({ error: 'Failed to check active session' });
  }
});

// ============================================================
// DEDUP SCANNER — Find and merge duplicate properties
// ============================================================

// 56. POST /api/ai/dedup/scan — Run dedup scan across all properties
// Uses multiple signals: normalized_address, city, rba (building SF), property_name
router.post('/dedup/scan', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    // Find potential duplicates using multiple matching strategies

    // Strategy 1: Exact normalized address match (HIGH confidence)
    const exactMatches = await pool.query(`
      SELECT
        a.property_id AS a_id, a.property_address AS a_addr, a.city AS a_city,
        a.rba AS a_rba, a.property_name AS a_name,
        b.property_id AS b_id, b.property_address AS b_addr, b.city AS b_city,
        b.rba AS b_rba, b.property_name AS b_name
      FROM properties a
      JOIN properties b ON a.normalized_address = b.normalized_address
        AND a.property_id < b.property_id
      WHERE a.normalized_address IS NOT NULL
        AND a.normalized_address != ''
        AND LOWER(COALESCE(a.city,'')) = LOWER(COALESCE(b.city,''))
    `);

    // Strategy 2: Same street number + similar street name + same city + similar SF (MEDIUM confidence)
    const fuzzyMatches = await pool.query(`
      SELECT
        a.property_id AS a_id, a.property_address AS a_addr, a.city AS a_city,
        a.rba AS a_rba, a.property_name AS a_name,
        b.property_id AS b_id, b.property_address AS b_addr, b.city AS b_city,
        b.rba AS b_rba, b.property_name AS b_name
      FROM properties a
      JOIN properties b ON a.property_id < b.property_id
      WHERE a.property_address IS NOT NULL AND b.property_address IS NOT NULL
        AND LOWER(COALESCE(a.city,'')) = LOWER(COALESCE(b.city,''))
        -- Same street number (first token)
        AND SPLIT_PART(LOWER(a.property_address), ' ', 1) = SPLIT_PART(LOWER(b.property_address), ' ', 1)
        -- Street number is actually numeric
        AND SPLIT_PART(LOWER(a.property_address), ' ', 1) ~ '^[0-9]+$'
        -- Similar building size (within 10%)
        AND a.rba IS NOT NULL AND b.rba IS NOT NULL AND a.rba > 0
        AND ABS(a.rba - b.rba) / GREATEST(a.rba, b.rba) < 0.1
        -- Not already caught by exact match
        AND (a.normalized_address IS NULL OR b.normalized_address IS NULL
             OR a.normalized_address != b.normalized_address)
      LIMIT 200
    `);

    // Strategy 3: Same property_name + same city (MEDIUM confidence)
    const nameMatches = await pool.query(`
      SELECT
        a.property_id AS a_id, a.property_address AS a_addr, a.city AS a_city,
        a.rba AS a_rba, a.property_name AS a_name,
        b.property_id AS b_id, b.property_address AS b_addr, b.city AS b_city,
        b.rba AS b_rba, b.property_name AS b_name
      FROM properties a
      JOIN properties b ON LOWER(a.property_name) = LOWER(b.property_name)
        AND a.property_id < b.property_id
      WHERE a.property_name IS NOT NULL AND a.property_name != ''
        AND LOWER(COALESCE(a.city,'')) = LOWER(COALESCE(b.city,''))
        AND a.property_address != b.property_address
      LIMIT 100
    `);

    // Helper: build property summary with linked record counts
    async function buildSummary(propId) {
      const [contacts, leaseComps, saleComps, deals, interactions] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM property_contacts WHERE property_id = $1', [propId]),
        pool.query('SELECT COUNT(*) FROM lease_comps WHERE property_id = $1', [propId]),
        pool.query('SELECT COUNT(*) FROM sale_comps WHERE property_id = $1', [propId]),
        pool.query('SELECT COUNT(*) FROM deal_properties WHERE property_id = $1', [propId]),
        pool.query('SELECT COUNT(*) FROM interaction_properties WHERE property_id = $1', [propId]),
      ]);
      return {
        contacts: parseInt(contacts.rows[0].count),
        lease_comps: parseInt(leaseComps.rows[0].count),
        sale_comps: parseInt(saleComps.rows[0].count),
        deals: parseInt(deals.rows[0].count),
        interactions: parseInt(interactions.rows[0].count),
        total_linked: parseInt(contacts.rows[0].count) + parseInt(leaseComps.rows[0].count) +
          parseInt(saleComps.rows[0].count) + parseInt(deals.rows[0].count) +
          parseInt(interactions.rows[0].count),
      };
    }

    let created = 0;
    let skipped = 0;

    // Process all matches
    const allMatches = [
      ...exactMatches.rows.map(r => ({ ...r, confidence: 'high', match_type: 'exact_normalized' })),
      ...fuzzyMatches.rows.map(r => ({ ...r, confidence: 'medium', match_type: 'fuzzy_address_sf' })),
      ...nameMatches.rows.map(r => ({ ...r, confidence: 'medium', match_type: 'same_name_city' })),
    ];

    // Deduplicate pairs (same pair might be caught by multiple strategies)
    const seenPairs = new Set();

    for (const match of allMatches) {
      const pairKey = [match.a_id, match.b_id].sort().join('|');
      if (seenPairs.has(pairKey)) { skipped++; continue; }
      seenPairs.add(pairKey);

      try {
        // Check if this pair already exists (pending or deferred)
        const existing = await pool.query(
          `SELECT id FROM dedup_candidates
           WHERE (property_a_id = $1 AND property_b_id = $2)
              OR (property_a_id = $2 AND property_b_id = $1)`,
          [match.a_id, match.b_id]
        );

        if (existing.rows.length > 0) { skipped++; continue; }

        // Build summaries
        const [summA, summB] = await Promise.all([
          buildSummary(match.a_id),
          buildSummary(match.b_id),
        ]);

        const reason = match.match_type === 'exact_normalized'
          ? `Both normalize to same address in ${match.a_city || 'same city'}`
          : match.match_type === 'fuzzy_address_sf'
          ? `Same street number, same city, similar SF (${match.a_rba} vs ${match.b_rba})`
          : `Same property name "${match.a_name}" in ${match.a_city}`;

        await pool.query(
          `INSERT INTO dedup_candidates
             (property_a_id, property_b_id, confidence, match_type, match_reason,
              property_a_summary, property_b_summary, scan_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
           ON CONFLICT (property_a_id, property_b_id) DO NOTHING`,
          [
            match.a_id, match.b_id, match.confidence, match.match_type, reason,
            JSON.stringify({ address: match.a_addr, city: match.a_city, rba: match.a_rba, name: match.a_name, ...summA }),
            JSON.stringify({ address: match.b_addr, city: match.b_city, rba: match.b_rba, name: match.b_name, ...summB }),
          ]
        );
        created++;
      } catch (err) {
        console.error(`[Dedup] Error processing pair ${match.a_id}/${match.b_id}:`, err.message);
      }
    }

    res.json({
      ok: true,
      scan_date: new Date().toISOString().slice(0, 10),
      candidates_found: created,
      duplicates_skipped: skipped,
      strategies: {
        exact_normalized: exactMatches.rows.length,
        fuzzy_address_sf: fuzzyMatches.rows.length,
        same_name_city: nameMatches.rows.length,
      },
    });
  } catch (err) {
    console.error('[AI API] POST /dedup/scan error:', err.message);
    res.status(500).json({ error: 'Failed to run dedup scan' });
  }
});

// 57. GET /api/ai/dedup/candidates — List dedup candidates for review
router.get('/dedup/candidates', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { status = 'pending', confidence, limit = 50 } = req.query;

    let query = 'SELECT * FROM dedup_candidates WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status !== 'all') {
      query += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (confidence) {
      query += ` AND confidence = $${idx++}`;
      params.push(confidence);
    }

    query += ` ORDER BY confidence = 'high' DESC, created_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ candidates: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[AI API] GET /dedup/candidates error:', err.message);
    res.status(500).json({ error: 'Failed to fetch dedup candidates' });
  }
});

// 58. POST /api/ai/dedup/merge/:id — Merge two properties
// Moves all linked records from loser → winner, then deletes loser
router.post('/dedup/merge/:id', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { id } = req.params;
    const { direction, notes } = req.body; // 'a_absorbs_b' or 'b_absorbs_a'

    if (!direction || !['a_absorbs_b', 'b_absorbs_a'].includes(direction)) {
      return res.status(400).json({ error: 'direction must be a_absorbs_b or b_absorbs_a' });
    }

    // Get the candidate
    const candidate = await pool.query('SELECT * FROM dedup_candidates WHERE id = $1', [id]);
    if (candidate.rows.length === 0) {
      return res.status(404).json({ error: 'Dedup candidate not found' });
    }

    const c = candidate.rows[0];
    const winnerId = direction === 'a_absorbs_b' ? c.property_a_id : c.property_b_id;
    const loserId = direction === 'a_absorbs_b' ? c.property_b_id : c.property_a_id;

    // Move all linked records from loser to winner
    const junctionTables = [
      { table: 'property_contacts', col: 'property_id' },
      { table: 'deal_properties', col: 'property_id' },
      { table: 'interaction_properties', col: 'property_id' },
    ];

    let recordsMoved = 0;
    for (const { table, col } of junctionTables) {
      // Delete any existing links that would create duplicates
      await pool.query(
        `DELETE FROM ${table} WHERE ${col} = $1 AND contact_id IN (
           SELECT contact_id FROM ${table} WHERE ${col} = $2
         )`,
        [loserId, winnerId]
      ).catch(() => {}); // Some tables don't have contact_id

      const moved = await pool.query(
        `UPDATE ${table} SET ${col} = $1 WHERE ${col} = $2`,
        [winnerId, loserId]
      );
      recordsMoved += moved.rowCount;
    }

    // Move comps
    const leaseCompsMoved = await pool.query(
      'UPDATE lease_comps SET property_id = $1 WHERE property_id = $2',
      [winnerId, loserId]
    );
    const saleCompsMoved = await pool.query(
      'UPDATE sale_comps SET property_id = $1 WHERE property_id = $2',
      [winnerId, loserId]
    );
    recordsMoved += leaseCompsMoved.rowCount + saleCompsMoved.rowCount;

    // Move market_tracking
    await pool.query(
      'UPDATE market_tracking SET property_id = $1 WHERE property_id = $2',
      [winnerId, loserId]
    );

    // Fill in any empty fields on the winner from the loser
    const winner = await pool.query('SELECT * FROM properties WHERE property_id = $1', [winnerId]);
    const loser = await pool.query('SELECT * FROM properties WHERE property_id = $1', [loserId]);

    if (winner.rows.length > 0 && loser.rows.length > 0) {
      const w = winner.rows[0];
      const l = loser.rows[0];
      const fillUpdates = [];
      const fillParams = [];
      let fIdx = 1;

      // List of fields to fill if empty on winner
      const fillFields = ['rba', 'property_name', 'property_type', 'year_built', 'clear_ht',
        'number_of_loading_docks', 'drive_ins', 'zoning', 'owner_name', 'owner_phone',
        'owner_entity_type', 'land_sf', 'land_area_ac', 'listing_asking_lease_rate', 'cap_rate',
        'parking_ratio', 'parcel_number', 'costar_url'];

      for (const field of fillFields) {
        if ((w[field] == null || w[field] === '') && l[field] != null && l[field] !== '') {
          fillUpdates.push(`${field} = $${fIdx++}`);
          fillParams.push(l[field]);
        }
      }

      if (fillUpdates.length > 0) {
        fillParams.push(winnerId);
        await pool.query(
          `UPDATE properties SET ${fillUpdates.join(', ')} WHERE property_id = $${fIdx}`,
          fillParams
        );
      }
    }

    // Delete the loser property
    await pool.query('DELETE FROM properties WHERE property_id = $1', [loserId]);

    // Update the candidate record
    await pool.query(
      `UPDATE dedup_candidates SET
         status = 'merged', resolved_by = $1, resolved_at = NOW(),
         merge_direction = $2, merge_notes = $3, updated_at = NOW()
       WHERE id = $4`,
      [req.agentName || req.user?.display_name || 'admin', direction, notes || null, id]
    );

    // Also dismiss any other candidates involving the deleted property
    await pool.query(
      `UPDATE dedup_candidates SET status = 'dismissed', merge_notes = 'Auto-dismissed: one property was merged elsewhere'
       WHERE (property_a_id = $1 OR property_b_id = $1) AND status = 'pending'`,
      [loserId]
    );

    res.json({
      ok: true,
      winner: winnerId,
      loser_deleted: loserId,
      records_moved: recordsMoved,
      message: `Merged ${loserId} into ${winnerId}. ${recordsMoved} linked records moved.`,
    });
  } catch (err) {
    console.error('[AI API] POST /dedup/merge error:', err.message);
    res.status(500).json({ error: 'Failed to merge properties' });
  }
});

// 59. PATCH /api/ai/dedup/:id — Dismiss or defer a candidate
router.patch('/dedup/:id', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { id } = req.params;
    const { status, notes } = req.body; // 'dismissed' or 'deferred'

    if (!status || !['dismissed', 'deferred'].includes(status)) {
      return res.status(400).json({ error: 'status must be dismissed or deferred' });
    }

    const result = await pool.query(
      `UPDATE dedup_candidates SET
         status = $1, resolved_by = $2, resolved_at = NOW(),
         merge_notes = $3, updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, req.agentName || req.user?.display_name || 'admin', notes || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Candidate not found' });
    }

    res.json({ ok: true, candidate: result.rows[0] });
  } catch (err) {
    console.error('[AI API] PATCH /dedup/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update candidate' });
  }
});

// ============================================================
// CONTACT & COMPANY DEDUP SCANNERS
// ============================================================

// 60. POST /api/ai/dedup/scan-contacts — Find duplicate contacts
router.post('/dedup/scan-contacts', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    // Strategy 1: Exact email match (HIGH confidence)
    const emailMatches = await pool.query(`
      SELECT a.contact_id AS a_id, a.full_name AS a_name, a.email_1 AS a_email,
             b.contact_id AS b_id, b.full_name AS b_name, b.email_1 AS b_email,
             COALESCE(
               NULLIF(a.email_1,''), NULLIF(a.email_2,''), NULLIF(a.email_3,'')
             ) AS matched_email
      FROM contacts a JOIN contacts b ON a.contact_id < b.contact_id
      WHERE (
        (a.email_1 IS NOT NULL AND a.email_1 != '' AND a.email_1 IN (b.email_1, b.email_2, b.email_3))
        OR (a.email_2 IS NOT NULL AND a.email_2 != '' AND a.email_2 IN (b.email_1, b.email_2, b.email_3))
        OR (a.email_3 IS NOT NULL AND a.email_3 != '' AND a.email_3 IN (b.email_1, b.email_2, b.email_3))
      )
    `);

    // Strategy 2: Same name + same linked company (MEDIUM confidence)
    const nameCompanyMatches = await pool.query(`
      SELECT DISTINCT a.contact_id AS a_id, a.full_name AS a_name, a.email_1 AS a_email,
             b.contact_id AS b_id, b.full_name AS b_name, b.email_1 AS b_email
      FROM contacts a
      JOIN contacts b ON a.contact_id < b.contact_id
        AND LOWER(TRIM(a.full_name)) = LOWER(TRIM(b.full_name))
      JOIN contact_companies ca ON ca.contact_id = a.contact_id
      JOIN contact_companies cb ON cb.contact_id = b.contact_id
        AND ca.company_id = cb.company_id
      WHERE a.full_name IS NOT NULL AND a.full_name != ''
      LIMIT 200
    `);

    // Strategy 3: Same name + same phone (MEDIUM confidence)
    const namePhoneMatches = await pool.query(`
      SELECT a.contact_id AS a_id, a.full_name AS a_name, a.email_1 AS a_email,
             b.contact_id AS b_id, b.full_name AS b_name, b.email_1 AS b_email
      FROM contacts a JOIN contacts b ON a.contact_id < b.contact_id
        AND LOWER(TRIM(a.full_name)) = LOWER(TRIM(b.full_name))
      WHERE a.full_name IS NOT NULL AND a.full_name != ''
        AND (
          (a.phone_1 IS NOT NULL AND a.phone_1 != '' AND a.phone_1 IN (b.phone_1, b.phone_2, b.phone_3))
          OR (a.phone_2 IS NOT NULL AND a.phone_2 != '' AND a.phone_2 IN (b.phone_1, b.phone_2, b.phone_3))
          OR (a.phone_3 IS NOT NULL AND a.phone_3 != '' AND a.phone_3 IN (b.phone_1, b.phone_2, b.phone_3))
        )
      LIMIT 200
    `);

    // Helper: build contact summary
    async function buildContactSummary(contactId) {
      const [companies, properties, deals, interactions, actionItems] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM contact_companies WHERE contact_id = $1', [contactId]),
        pool.query('SELECT COUNT(*) FROM property_contacts WHERE contact_id = $1', [contactId]),
        pool.query('SELECT COUNT(*) FROM deal_contacts WHERE contact_id = $1', [contactId]),
        pool.query('SELECT COUNT(*) FROM interaction_contacts WHERE contact_id = $1', [contactId]),
        pool.query('SELECT COUNT(*) FROM action_item_contacts WHERE contact_id = $1', [contactId]),
      ]);
      return {
        companies: parseInt(companies.rows[0].count),
        properties: parseInt(properties.rows[0].count),
        deals: parseInt(deals.rows[0].count),
        interactions: parseInt(interactions.rows[0].count),
        action_items: parseInt(actionItems.rows[0].count),
        total_linked: parseInt(companies.rows[0].count) + parseInt(properties.rows[0].count) +
          parseInt(deals.rows[0].count) + parseInt(interactions.rows[0].count) +
          parseInt(actionItems.rows[0].count),
      };
    }

    let created = 0, skipped = 0;
    const allMatches = [
      ...emailMatches.rows.map(r => ({ ...r, confidence: 'high', match_type: 'exact_email' })),
      ...nameCompanyMatches.rows.map(r => ({ ...r, confidence: 'medium', match_type: 'same_name_company' })),
      ...namePhoneMatches.rows.map(r => ({ ...r, confidence: 'medium', match_type: 'same_name_phone' })),
    ];

    const seenPairs = new Set();
    for (const match of allMatches) {
      const pairKey = [match.a_id, match.b_id].sort().join('|');
      if (seenPairs.has(pairKey)) { skipped++; continue; }
      seenPairs.add(pairKey);

      try {
        const existing = await pool.query(
          `SELECT id FROM contact_dedup_candidates
           WHERE (contact_a_id = $1 AND contact_b_id = $2)
              OR (contact_a_id = $2 AND contact_b_id = $1)`,
          [match.a_id, match.b_id]
        );
        if (existing.rows.length > 0) { skipped++; continue; }

        const [summA, summB] = await Promise.all([
          buildContactSummary(match.a_id),
          buildContactSummary(match.b_id),
        ]);

        const reason = match.match_type === 'exact_email'
          ? `Same email address: ${match.matched_email || match.a_email}`
          : match.match_type === 'same_name_company'
          ? `Same name "${match.a_name}" linked to same company`
          : `Same name "${match.a_name}" with matching phone number`;

        await pool.query(
          `INSERT INTO contact_dedup_candidates
             (contact_a_id, contact_b_id, confidence, match_type, match_reason,
              entity_a_summary, entity_b_summary, scan_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_DATE)
           ON CONFLICT (contact_a_id, contact_b_id) DO NOTHING`,
          [
            match.a_id, match.b_id, match.confidence, match.match_type, reason,
            JSON.stringify({ name: match.a_name, email: match.a_email, ...summA }),
            JSON.stringify({ name: match.b_name, email: match.b_email, ...summB }),
          ]
        );
        created++;
      } catch (err) {
        console.error(`[Dedup] Contact pair error ${match.a_id}/${match.b_id}:`, err.message);
      }
    }

    res.json({
      ok: true,
      scan_date: new Date().toISOString().slice(0, 10),
      candidates_found: created,
      duplicates_skipped: skipped,
      strategies: {
        exact_email: emailMatches.rows.length,
        same_name_company: nameCompanyMatches.rows.length,
        same_name_phone: namePhoneMatches.rows.length,
      },
    });
  } catch (err) {
    console.error('[AI API] POST /dedup/scan-contacts error:', err.message);
    res.status(500).json({ error: 'Failed to run contact dedup scan' });
  }
});

// 61. POST /api/ai/dedup/scan-companies — Find duplicate companies
router.post('/dedup/scan-companies', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { normalizeCompanyName, similarity } = require('../utils/addressNormalizer');

    // Load all companies
    const { rows: allCompanies } = await pool.query(
      `SELECT company_id, company_name, city FROM companies WHERE company_name IS NOT NULL AND TRIM(company_name) != ''`
    );

    // Build normalized name map
    const normalized = allCompanies.map(c => ({
      ...c,
      norm: normalizeCompanyName(c.company_name),
    })).filter(c => c.norm);

    // Strategy 1: Exact normalized name match (HIGH confidence)
    const exactMatches = [];
    const normGroups = {};
    for (const c of normalized) {
      const key = c.norm;
      if (!normGroups[key]) normGroups[key] = [];
      normGroups[key].push(c);
    }
    for (const group of Object.values(normGroups)) {
      if (group.length < 2) continue;
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          exactMatches.push({
            a_id: group[i].company_id, a_name: group[i].company_name, a_city: group[i].city,
            b_id: group[j].company_id, b_name: group[j].company_name, b_city: group[j].city,
            confidence: 'high', match_type: 'exact_normalized_name',
          });
        }
      }
    }

    // Strategy 2: Fuzzy name match (MEDIUM confidence, similarity >= 0.85)
    const fuzzyMatches = [];
    for (let i = 0; i < normalized.length && fuzzyMatches.length < 300; i++) {
      for (let j = i + 1; j < normalized.length && fuzzyMatches.length < 300; j++) {
        if (normalized[i].norm === normalized[j].norm) continue; // already caught by exact
        const sim = similarity(normalized[i].norm, normalized[j].norm);
        if (sim >= 0.85) {
          fuzzyMatches.push({
            a_id: normalized[i].company_id, a_name: normalized[i].company_name, a_city: normalized[i].city,
            b_id: normalized[j].company_id, b_name: normalized[j].company_name, b_city: normalized[j].city,
            confidence: 'medium', match_type: 'fuzzy_name', match_score: Math.round(sim * 100),
          });
        }
      }
    }

    // Helper: build company summary
    async function buildCompanySummary(companyId) {
      const [contacts, properties, deals, interactions, actionItems, leaseComps] = await Promise.all([
        pool.query('SELECT COUNT(*) FROM contact_companies WHERE company_id = $1', [companyId]),
        pool.query('SELECT COUNT(*) FROM property_companies WHERE company_id = $1', [companyId]),
        pool.query('SELECT COUNT(*) FROM deal_companies WHERE company_id = $1', [companyId]),
        pool.query('SELECT COUNT(*) FROM interaction_companies WHERE company_id = $1', [companyId]),
        pool.query('SELECT COUNT(*) FROM action_item_companies WHERE company_id = $1', [companyId]),
        pool.query('SELECT COUNT(*) FROM lease_comps WHERE company_id = $1', [companyId]),
      ]);
      return {
        contacts: parseInt(contacts.rows[0].count),
        properties: parseInt(properties.rows[0].count),
        deals: parseInt(deals.rows[0].count),
        interactions: parseInt(interactions.rows[0].count),
        action_items: parseInt(actionItems.rows[0].count),
        lease_comps: parseInt(leaseComps.rows[0].count),
        total_linked: parseInt(contacts.rows[0].count) + parseInt(properties.rows[0].count) +
          parseInt(deals.rows[0].count) + parseInt(interactions.rows[0].count) +
          parseInt(actionItems.rows[0].count) + parseInt(leaseComps.rows[0].count),
      };
    }

    let created = 0, skipped = 0;
    const allMatches = [...exactMatches, ...fuzzyMatches];
    const seenPairs = new Set();

    for (const match of allMatches) {
      const pairKey = [match.a_id, match.b_id].sort().join('|');
      if (seenPairs.has(pairKey)) { skipped++; continue; }
      seenPairs.add(pairKey);

      try {
        const existing = await pool.query(
          `SELECT id FROM company_dedup_candidates
           WHERE (company_a_id = $1 AND company_b_id = $2)
              OR (company_a_id = $2 AND company_b_id = $1)`,
          [match.a_id, match.b_id]
        );
        if (existing.rows.length > 0) { skipped++; continue; }

        const [summA, summB] = await Promise.all([
          buildCompanySummary(match.a_id),
          buildCompanySummary(match.b_id),
        ]);

        const reason = match.match_type === 'exact_normalized_name'
          ? `Both normalize to same name: "${match.a_name}" / "${match.b_name}"`
          : `Fuzzy name match (${match.match_score}%): "${match.a_name}" ≈ "${match.b_name}"`;

        await pool.query(
          `INSERT INTO company_dedup_candidates
             (company_a_id, company_b_id, confidence, match_type, match_score, match_reason,
              entity_a_summary, entity_b_summary, scan_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_DATE)
           ON CONFLICT (company_a_id, company_b_id) DO NOTHING`,
          [
            match.a_id, match.b_id, match.confidence, match.match_type,
            match.match_score || null, reason,
            JSON.stringify({ name: match.a_name, city: match.a_city, ...summA }),
            JSON.stringify({ name: match.b_name, city: match.b_city, ...summB }),
          ]
        );
        created++;
      } catch (err) {
        console.error(`[Dedup] Company pair error ${match.a_id}/${match.b_id}:`, err.message);
      }
    }

    res.json({
      ok: true,
      scan_date: new Date().toISOString().slice(0, 10),
      candidates_found: created,
      duplicates_skipped: skipped,
      strategies: {
        exact_normalized_name: exactMatches.length,
        fuzzy_name: fuzzyMatches.length,
      },
    });
  } catch (err) {
    console.error('[AI API] POST /dedup/scan-companies error:', err.message);
    res.status(500).json({ error: 'Failed to run company dedup scan' });
  }
});

// ============================================================
// INSTANTLY.AI PROXY — Direct access to Instantly API for agents + dashboard
// ============================================================

// 39. GET /api/ai/instantly/campaigns — List all Instantly campaigns
router.get('/instantly/campaigns', async (req, res) => {
  try {
    const data = await instantly.listCampaigns(req.query);
    res.json(data);
  } catch (err) {
    console.error('[AI API] GET /instantly/campaigns error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 40. GET /api/ai/instantly/campaigns/:id — Get campaign details
router.get('/instantly/campaigns/:id', async (req, res) => {
  try {
    const data = await instantly.getCampaign(req.params.id);
    res.json(data);
  } catch (err) {
    console.error('[AI API] GET /instantly/campaigns/:id error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 41. GET /api/ai/instantly/campaigns/:id/analytics — Campaign analytics
router.get('/instantly/campaigns/:id/analytics', async (req, res) => {
  try {
    const data = await instantly.getCampaignAnalytics(req.params.id);
    res.json(data);
  } catch (err) {
    console.error('[AI API] GET /instantly/campaigns/:id/analytics error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 42. GET /api/ai/instantly/analytics/overview — Analytics across all campaigns
router.get('/instantly/analytics/overview', async (req, res) => {
  try {
    const data = await instantly.getAnalyticsOverview(req.query);
    res.json(data);
  } catch (err) {
    console.error('[AI API] GET /instantly/analytics/overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 43. POST /api/ai/instantly/leads/bulk-add — Add leads to a campaign
router.post('/instantly/leads/bulk-add', async (req, res) => {
  try {
    const data = await instantly.bulkAddLeads(req.body);
    res.json(data);
  } catch (err) {
    console.error('[AI API] POST /instantly/leads/bulk-add error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 44. GET /api/ai/instantly/accounts — List email accounts (the 12 senders)
router.get('/instantly/accounts', async (req, res) => {
  try {
    const data = await instantly.listAccounts(req.query);
    res.json(data);
  } catch (err) {
    console.error('[AI API] GET /instantly/accounts error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 45. GET /api/ai/instantly/accounts/:id/test-vitals — Test sender health
router.get('/instantly/accounts/:id/test-vitals', async (req, res) => {
  try {
    const data = await instantly.testAccountVitals(req.params.id);
    res.json(data);
  } catch (err) {
    console.error('[AI API] GET /instantly/accounts/:id/test-vitals error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 46. POST /api/ai/instantly/campaigns — Create a new campaign
router.post('/instantly/campaigns', async (req, res) => {
  try {
    const data = await instantly.createCampaign(req.body);
    res.json(data);
  } catch (err) {
    console.error('[AI API] POST /instantly/campaigns error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 47. POST /api/ai/instantly/campaigns/:id/activate — Start a campaign
router.post('/instantly/campaigns/:id/activate', async (req, res) => {
  try {
    const data = await instantly.activateCampaign(req.params.id);
    res.json(data);
  } catch (err) {
    console.error('[AI API] POST /instantly/campaigns/:id/activate error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 48. POST /api/ai/instantly/campaigns/:id/stop — Pause a campaign
router.post('/instantly/campaigns/:id/stop', async (req, res) => {
  try {
    const data = await instantly.stopCampaign(req.params.id);
    res.json(data);
  } catch (err) {
    console.error('[AI API] POST /instantly/campaigns/:id/stop error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 49. POST /api/ai/instantly/webhooks — Create an Instantly webhook
router.post('/instantly/webhooks', async (req, res) => {
  try {
    const data = await instantly.createWebhook(req.body);
    res.json(data);
  } catch (err) {
    console.error('[AI API] POST /instantly/webhooks error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 50. POST /api/ai/instantly/webhook/event — Receive Instantly webhook events
// This is the INBOUND endpoint that Instantly calls when emails are opened/replied/bounced
router.post('/instantly/webhook/event', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const event = req.body;
    const eventType = event.event_type || event.type;

    console.log(`[Instantly Webhook] Event: ${eventType}`, JSON.stringify(event).substring(0, 200));

    // Log the event to outbound_email_queue if we can match it
    if (event.lead_email) {
      const updateFields = {};
      if (eventType === 'email_opened' || eventType === 'open') {
        updateFields.opened_at = 'NOW()';
      } else if (eventType === 'email_replied' || eventType === 'reply') {
        updateFields.replied_at = 'NOW()';
      } else if (eventType === 'email_bounced' || eventType === 'bounce') {
        updateFields.bounced_at = 'NOW()';
      } else if (eventType === 'email_unsubscribed' || eventType === 'unsubscribe') {
        updateFields.unsubscribed_at = 'NOW()';
      }

      if (Object.keys(updateFields).length > 0) {
        // SECURITY: Houston audit C4 — 2026-03-30
        // Hardcoded column whitelist for outbound_email_queue (not in sqlSafety ALLOWED_COLS)
        const ALLOWED_EMAIL_COLS = new Set(['opened_at', 'replied_at', 'bounced_at', 'unsubscribed_at']);
        const safeSetClauses = [];
        for (const k of Object.keys(updateFields)) {
          if (!ALLOWED_EMAIL_COLS.has(k)) throw new Error(`[sqlSafety] Disallowed column "${k}" for outbound_email_queue`);
          safeSetClauses.push(`${quoteIdentifier(k)} = NOW()`);
        }
        const firstCol = quoteIdentifier(Object.keys(updateFields)[0]);
        await pool.query(
          `UPDATE outbound_email_queue SET ${safeSetClauses.join(', ')}
           WHERE contact_id IN (
             SELECT contact_id FROM contacts
             WHERE email = $1 OR email_2 = $1 OR email_3 = $1
           ) AND ${firstCol} IS NULL`,
          [event.lead_email]
        );
      }

      // Also log as agent activity
      await pool.query(
        `INSERT INTO agent_logs (agent_name, log_type, message, metadata)
         VALUES ('campaign_manager', 'email_event', $1, $2)`,
        [
          `${eventType}: ${event.lead_email}`,
          JSON.stringify(event),
        ]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[Instantly Webhook] Error:', err.message);
    res.status(500).json({ error: 'Failed to process webhook event' });
  }
});

// 51. GET /api/ai/instantly/workspace — Get workspace/plan info
router.get('/instantly/workspace', async (req, res) => {
  try {
    const [workspace, plan] = await Promise.all([
      instantly.getWorkspace(),
      instantly.getPlan().catch(() => null),
    ]);
    res.json({ workspace, plan });
  } catch (err) {
    console.error('[AI API] GET /instantly/workspace error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// IMPROVEMENT PROPOSALS — Tier 2/Tier 1 improvement workflow
// ============================================================

// 52. POST /api/ai/proposals — Submit an improvement proposal
// Called by Ralph GPT/Gemini or Houston Command when they spot an improvement opportunity
router.post('/proposals', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      about_agent,
      category,
      observation,
      proposal,
      expected_impact,
      effort_level,
      evidence,
      confidence,
    } = req.body;

    if (!category || !observation || !proposal) {
      return res.status(400).json({ error: 'category, observation, and proposal are required' });
    }

    const result = await pool.query(
      `INSERT INTO improvement_proposals
         (source_agent, about_agent, category, observation, proposal,
          expected_impact, effort_level, evidence, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.agentName || 'unknown',
        about_agent || null,
        category,
        observation,
        proposal,
        expected_impact || null,
        effort_level || 'medium',
        evidence ? JSON.stringify(evidence) : '{}',
        confidence || 'medium',
      ]
    );

    // Also post to priority board for Houston Command to pick up
    await pool.query(
      `INSERT INTO agent_priority_board
         (source_agent, target_agent, priority_type, payload, reason, urgency)
       VALUES ($1, 'houston_command', 'improvement_proposal', $2, $3, $4)`,
      [
        req.agentName || 'unknown',
        JSON.stringify({ proposal_id: result.rows[0].id, category, about_agent }),
        `Improvement proposal: ${proposal.substring(0, 100)}`,
        confidence === 'high' ? 'high' : 'normal',
      ]
    );

    res.json({ ok: true, proposal: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /proposals error:', err.message);
    res.status(500).json({ error: 'Failed to submit improvement proposal' });
  }
});

// 30. GET /api/ai/proposals — List improvement proposals (with filters)
// Called by Houston Command (for review) and CRM dashboard (for AI Ops UI)
router.get('/proposals', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { status = 'pending', about_agent, category, limit = 50 } = req.query;

    let query = 'SELECT * FROM improvement_proposals WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status !== 'all') {
      query += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (about_agent) {
      query += ` AND about_agent = $${idx++}`;
      params.push(about_agent);
    }
    if (category) {
      query += ` AND category = $${idx++}`;
      params.push(category);
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ proposals: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[AI API] GET /proposals error:', err.message);
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// 31. PATCH /api/ai/proposals/:id — Update proposal status (accept/reject/implement)
// Called by Houston Command or admin dashboard
router.patch('/proposals/:id', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { id } = req.params;
    const { status, review_notes, implementation_notes, version_before, version_after } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const updates = ['status = $1', 'updated_at = NOW()'];
    const params = [status];
    let idx = 2;

    if (status === 'accepted' || status === 'rejected' || status === 'needs_david') {
      updates.push(`reviewed_by = $${idx++}`);
      params.push(req.agentName || req.user?.display_name || 'admin');
      updates.push(`reviewed_at = NOW()`);
    }
    if (review_notes) {
      updates.push(`review_notes = $${idx++}`);
      params.push(review_notes);
    }
    if (status === 'implemented') {
      updates.push(`implemented_at = NOW()`);
      if (implementation_notes) {
        updates.push(`implementation_notes = $${idx++}`);
        params.push(implementation_notes);
      }
      if (version_before) {
        updates.push(`version_before = $${idx++}`);
        params.push(version_before);
      }
      if (version_after) {
        updates.push(`version_after = $${idx++}`);
        params.push(version_after);
      }
    }

    params.push(id);
    const result = await pool.query(
      `UPDATE improvement_proposals SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    res.json({ ok: true, proposal: result.rows[0] });
  } catch (err) {
    console.error('[AI API] PATCH /proposals/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update proposal' });
  }
});

// ============================================================
// WORKFLOW CHAINS — Multi-agent pipeline tracking
// ============================================================

// 32. POST /api/ai/workflows — Create a new workflow chain
router.post('/workflows', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      workflow_type,
      steps,              // Array of step definitions
      trigger_source,
      trigger_data,
      directive_id,
    } = req.body;

    if (!workflow_type) {
      return res.status(400).json({ error: 'workflow_type is required' });
    }

    // Generate human-readable workflow ID
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM workflow_chains WHERE workflow_id LIKE $1",
      [`WF-${dateStr}-%`]
    );
    const seqNum = String(parseInt(countResult.rows[0].count) + 1).padStart(3, '0');
    const workflowId = `WF-${dateStr}-${seqNum}`;

    const result = await pool.query(
      `INSERT INTO workflow_chains
         (workflow_id, workflow_type, steps, trigger_source, trigger_data, directive_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        workflowId,
        workflow_type,
        JSON.stringify(steps || []),
        trigger_source || null,
        trigger_data ? JSON.stringify(trigger_data) : '{}',
        directive_id || null,
      ]
    );

    res.json({ ok: true, workflow: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /workflows error:', err.message);
    res.status(500).json({ error: 'Failed to create workflow chain' });
  }
});

// 33. PATCH /api/ai/workflows/:workflowId — Update workflow step progress
router.patch('/workflows/:workflowId', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { workflowId } = req.params;
    const { current_step, status, step_update, result_summary, items_produced } = req.body;

    const updates = ['last_activity_at = NOW()'];
    const params = [];
    let idx = 1;

    if (current_step !== undefined) {
      updates.push(`current_step = $${idx++}`);
      params.push(current_step);
    }
    if (status) {
      updates.push(`status = $${idx++}`);
      params.push(status);
      if (status === 'completed' || status === 'failed') {
        updates.push('completed_at = NOW()');
      }
    }
    if (step_update) {
      // Update a specific step in the steps JSONB array
      // step_update: { step_index: 0, ...fields }
      updates.push(`steps = jsonb_set(steps, ARRAY[$${idx++}::text], steps->$${idx - 1}::int || $${idx++}::jsonb)`);
      params.push(String(step_update.step_index));
      params.push(JSON.stringify(step_update));
    }
    if (result_summary) {
      updates.push(`result_summary = $${idx++}`);
      params.push(result_summary);
    }
    if (items_produced !== undefined) {
      updates.push(`items_produced = $${idx++}`);
      params.push(items_produced);
    }

    params.push(workflowId);
    const result = await pool.query(
      `UPDATE workflow_chains SET ${updates.join(', ')} WHERE workflow_id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({ ok: true, workflow: result.rows[0] });
  } catch (err) {
    console.error('[AI API] PATCH /workflows/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// 34. GET /api/ai/workflows — List workflow chains
router.get('/workflows', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { status = 'active', workflow_type, limit = 50 } = req.query;

    let query = 'SELECT * FROM workflow_chains WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status !== 'all') {
      query += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (workflow_type) {
      query += ` AND workflow_type = $${idx++}`;
      params.push(workflow_type);
    }

    query += ` ORDER BY last_activity_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ workflows: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[AI API] GET /workflows error:', err.message);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// ============================================================
// AGENT SKILLS — Reusable tools created by Houston Command
// ============================================================

// 35. POST /api/ai/skills — Create a new skill
router.post('/skills', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const {
      skill_id,
      name,
      description,
      available_to,
      skill_type,
      content,
      parameters,
    } = req.body;

    if (!skill_id || !name || !description || !skill_type || !content) {
      return res.status(400).json({ error: 'skill_id, name, description, skill_type, and content are required' });
    }

    const result = await pool.query(
      `INSERT INTO agent_skills
         (skill_id, name, description, created_by, available_to, skill_type, content, parameters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        skill_id,
        name,
        description,
        req.agentName || 'houston_command',
        available_to || '{all}',
        skill_type,
        content,
        parameters ? JSON.stringify(parameters) : '{}',
      ]
    );

    res.json({ ok: true, skill: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique violation
      return res.status(409).json({ error: 'Skill ID already exists. Use PUT to update.' });
    }
    console.error('[AI API] POST /skills error:', err.message);
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

// 36. GET /api/ai/skills — List skills (optionally filtered by agent)
router.get('/skills', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { agent, skill_type, status = 'active' } = req.query;

    let query = 'SELECT * FROM agent_skills WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status !== 'all') {
      query += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (agent) {
      query += ` AND ($${idx++} = ANY(available_to) OR 'all' = ANY(available_to))`;
      params.push(agent);
    }
    if (skill_type) {
      query += ` AND skill_type = $${idx++}`;
      params.push(skill_type);
    }

    query += ' ORDER BY times_used DESC, created_at DESC';

    const result = await pool.query(query, params);
    res.json({ skills: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[AI API] GET /skills error:', err.message);
    res.status(500).json({ error: 'Failed to fetch skills' });
  }
});

// 37. PUT /api/ai/skills/:skillId — Update/version-up a skill
router.put('/skills/:skillId', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { skillId } = req.params;
    const { content, description, parameters, available_to, status } = req.body;

    // Get current skill for versioning
    const current = await pool.query(
      'SELECT * FROM agent_skills WHERE skill_id = $1',
      [skillId]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    const old = current.rows[0];

    const updates = ['updated_at = NOW()', `version = ${old.version + 1}`];
    const params = [];
    let idx = 1;

    if (content) {
      updates.push(`content = $${idx++}`);
      params.push(content);
    }
    if (description) {
      updates.push(`description = $${idx++}`);
      params.push(description);
    }
    if (parameters) {
      updates.push(`parameters = $${idx++}`);
      params.push(JSON.stringify(parameters));
    }
    if (available_to) {
      updates.push(`available_to = $${idx++}`);
      params.push(available_to);
    }
    if (status) {
      updates.push(`status = $${idx++}`);
      params.push(status);
    }

    // Track previous version
    updates.push(`previous_version_id = $${idx++}`);
    params.push(old.id);

    params.push(skillId);
    const result = await pool.query(
      `UPDATE agent_skills SET ${updates.join(', ')} WHERE skill_id = $${idx} RETURNING *`,
      params
    );

    res.json({ ok: true, skill: result.rows[0], previous_version: old.version });
  } catch (err) {
    console.error('[AI API] PUT /skills/:skillId error:', err.message);
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

// 38. POST /api/ai/skills/:skillId/use — Record a skill usage (called by agent after using a skill)
router.post('/skills/:skillId/use', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { skillId } = req.params;
    const { success } = req.body; // boolean: did the skill produce good results?

    const result = await pool.query(
      `UPDATE agent_skills
       SET times_used = times_used + 1,
           last_used_at = NOW(),
           last_used_by = $1,
           avg_success_rate = CASE
             WHEN times_used = 0 THEN $2::numeric
             ELSE ((avg_success_rate * times_used) + $2::numeric) / (times_used + 1)
           END
       WHERE skill_id = $3
       RETURNING skill_id, times_used, avg_success_rate`,
      [
        req.agentName || 'unknown',
        success ? 100 : 0,
        skillId,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    res.json({ ok: true, ...result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /skills/:skillId/use error:', err.message);
    res.status(500).json({ error: 'Failed to record skill usage' });
  }
});

// ============================================================
// COUNCIL OF MINDS — Threaded meeting system
// ============================================================

// 39. POST /api/ai/council-meetings — Create a new council meeting thread
router.post('/council-meetings', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { title, topic, participants, scheduled_at } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title is required' });
    }

    // Generate meeting_id
    const dateStr = new Date().toISOString().slice(0, 10);
    const countResult = await pool.query(
      "SELECT COUNT(*) FROM council_meetings WHERE meeting_id LIKE $1",
      [`council-${dateStr}%`]
    );
    const seq = parseInt(countResult.rows[0].count) + 1;
    const meetingId = seq > 1 ? `council-${dateStr}-${seq}` : `council-${dateStr}`;

    // Get meeting number (sequential count of all meetings)
    const totalCount = await pool.query("SELECT COUNT(*) FROM council_meetings");
    const meetingNumber = parseInt(totalCount.rows[0].count) + 1;

    const result = await pool.query(
      `INSERT INTO council_meetings
         (meeting_id, title, topic, participants, scheduled_at, meeting_number, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        meetingId,
        title,
        topic || null,
        participants || '{houston_command,ralph_gpt,ralph_gemini}',
        scheduled_at || null,
        meetingNumber,
        'in_progress',
      ]
    );

    res.json({ ok: true, meeting: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /council-meetings error:', err.message);
    res.status(500).json({ error: 'Failed to create council meeting' });
  }
});

// 40. GET /api/ai/council-meetings — List all council meetings
router.get('/council-meetings', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { status, limit = 20, offset = 0 } = req.query;

    let query = 'SELECT * FROM council_meetings WHERE 1=1';
    const params = [];
    let idx = 1;

    if (status && status !== 'all') {
      query += ` AND status = $${idx++}`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    // Also get post counts per meeting
    const meetingIds = result.rows.map(m => m.meeting_id);
    let postCounts = {};
    if (meetingIds.length > 0) {
      const counts = await pool.query(
        `SELECT meeting_id, COUNT(*) as post_count,
                COUNT(*) FILTER (WHERE has_proposal) as proposal_count
         FROM council_meeting_posts
         WHERE meeting_id = ANY($1)
         GROUP BY meeting_id`,
        [meetingIds]
      );
      counts.rows.forEach(r => {
        postCounts[r.meeting_id] = { posts: parseInt(r.post_count), proposals: parseInt(r.proposal_count) };
      });
    }

    const meetings = result.rows.map(m => ({
      ...m,
      post_count: postCounts[m.meeting_id]?.posts || 0,
      proposal_count: postCounts[m.meeting_id]?.proposals || 0,
    }));

    res.json({ meetings, count: meetings.length });
  } catch (err) {
    console.error('[AI API] GET /council-meetings error:', err.message);
    res.status(500).json({ error: 'Failed to fetch council meetings' });
  }
});

// 41. GET /api/ai/council-meetings/:meetingId — Get a single meeting with all posts
router.get('/council-meetings/:meetingId', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { meetingId } = req.params;

    const meeting = await pool.query(
      'SELECT * FROM council_meetings WHERE meeting_id = $1',
      [meetingId]
    );
    if (meeting.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const posts = await pool.query(
      `SELECT * FROM council_meeting_posts
       WHERE meeting_id = $1
       ORDER BY created_at ASC`,
      [meetingId]
    );

    res.json({
      meeting: meeting.rows[0],
      posts: posts.rows,
    });
  } catch (err) {
    console.error('[AI API] GET /council-meetings/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch meeting' });
  }
});

// 42. POST /api/ai/council-meetings/:meetingId/posts — Add a post to a meeting thread
router.post('/council-meetings/:meetingId/posts', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { meetingId } = req.params;
    const {
      author,
      author_display_name,
      author_model,
      round,
      round_number,
      body,
      has_proposal,
      proposal_id,
    } = req.body;

    if (!author || !body) {
      return res.status(400).json({ error: 'author and body are required' });
    }

    // Verify meeting exists
    const meeting = await pool.query(
      'SELECT * FROM council_meetings WHERE meeting_id = $1',
      [meetingId]
    );
    if (meeting.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    const wordCount = body.split(/\s+/).length;

    const result = await pool.query(
      `INSERT INTO council_meeting_posts
         (meeting_id, author, author_display_name, author_model, round, round_number,
          body, has_proposal, proposal_id, word_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        meetingId,
        author,
        author_display_name || author,
        author_model || null,
        round || null,
        round_number || null,
        body,
        has_proposal || false,
        proposal_id || null,
        wordCount,
      ]
    );

    // Update meeting proposals_generated count if this post has a proposal
    if (has_proposal) {
      await pool.query(
        'UPDATE council_meetings SET proposals_generated = proposals_generated + 1 WHERE meeting_id = $1',
        [meetingId]
      );
    }

    // Emit via socket for live updates
    const io = getIo();
    if (io) {
      io.to('council').emit('council:meeting:new_post', {
        meetingId,
        post: result.rows[0],
      });
    }

    res.json({ ok: true, post: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /council-meetings/:id/posts error:', err.message);
    res.status(500).json({ error: 'Failed to add post to meeting' });
  }
});

// 43. PATCH /api/ai/council-meetings/:meetingId — Update meeting status/summary
router.patch('/council-meetings/:meetingId', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { meetingId } = req.params;
    const { status, summary, top_recommendations, action_items, duration_minutes } = req.body;

    const updates = ['updated_at = NOW()'];
    const params = [];
    let idx = 1;

    if (status) {
      updates.push(`status = $${idx++}`);
      params.push(status);
      if (status === 'completed') {
        updates.push('completed_at = NOW()');
      }
    }
    if (summary) {
      updates.push(`summary = $${idx++}`);
      params.push(summary);
    }
    if (top_recommendations) {
      updates.push(`top_recommendations = $${idx++}`);
      params.push(JSON.stringify(top_recommendations));
    }
    if (action_items) {
      updates.push(`action_items = $${idx++}`);
      params.push(JSON.stringify(action_items));
    }
    if (duration_minutes) {
      updates.push(`duration_minutes = $${idx++}`);
      params.push(duration_minutes);
    }

    params.push(meetingId);
    const result = await pool.query(
      `UPDATE council_meetings SET ${updates.join(', ')} WHERE meeting_id = $${idx} RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meeting not found' });
    }

    res.json({ ok: true, meeting: result.rows[0] });
  } catch (err) {
    console.error('[AI API] PATCH /council-meetings/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update meeting' });
  }
});

// 44. POST /api/ai/council-meetings/:meetingId/posts/:postId/react — David reacts to a post
router.post('/council-meetings/:meetingId/posts/:postId/react', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { postId } = req.params;
    const { reaction } = req.body; // 'agree', 'disagree', 'interesting', 'implement'

    if (!reaction) {
      return res.status(400).json({ error: 'reaction is required' });
    }

    const result = await pool.query(
      'UPDATE council_meeting_posts SET david_reaction = $1 WHERE id = $2 RETURNING *',
      [reaction, postId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // If reaction is 'implement', auto-create an improvement proposal
    if (reaction === 'implement') {
      const post = result.rows[0];
      const proposal = await pool.query(
        `INSERT INTO improvement_proposals
           (source_agent, about_agent, category, observation, proposal,
            confidence, status, meeting_id, david_decision, david_decision_at)
         VALUES ($1, 'system', 'other', $2, $3, 'high', 'accepted', $4, 'approved', NOW())
         RETURNING id`,
        [
          post.author,
          `David marked this Council of Minds post for implementation`,
          post.body.substring(0, 500),
          post.meeting_id,
        ]
      );

      // Link proposal back to the post
      await pool.query(
        'UPDATE council_meeting_posts SET has_proposal = true, proposal_id = $1 WHERE id = $2',
        [proposal.rows[0].id, postId]
      );
    }

    res.json({ ok: true, post: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /react error:', err.message);
    res.status(500).json({ error: 'Failed to react to post' });
  }
});

// ============================================================
// IMPROVEMENT PROPOSALS — David approve/disapprove
// ============================================================

// 45. PATCH /api/ai/proposals/:id/david-decision — David approves or rejects a proposal
router.patch('/proposals/:id/david-decision', async (req, res) => {
  const pool = dbPool(res);
  if (!pool) return;
  try {
    const { id } = req.params;
    const { decision, notes } = req.body; // 'approved', 'rejected', 'needs_discussion'

    if (!decision) {
      return res.status(400).json({ error: 'decision is required (approved, rejected, needs_discussion)' });
    }

    // Update the proposal with David's decision
    const result = await pool.query(
      `UPDATE improvement_proposals
       SET david_decision = $1,
           david_decision_at = NOW(),
           david_notes = $2,
           status = CASE
             WHEN $1 = 'approved' THEN 'accepted'
             WHEN $1 = 'rejected' THEN 'rejected'
             ELSE status
           END,
           reviewed_by = COALESCE(reviewed_by, 'david'),
           reviewed_at = COALESCE(reviewed_at, NOW()),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [decision, notes || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // If approved, push a directive to Houston Command to implement
    if (decision === 'approved') {
      const proposal = result.rows[0];
      await pool.query(
        `INSERT INTO directives
           (title, body, priority, scope, source, status)
         VALUES ($1, $2, 'normal', 'houston_command', 'david', 'active')`,
        [
          `Implement approved proposal: ${proposal.category}`,
          `David approved this improvement proposal. Implement it.\n\nProposal: ${proposal.proposal}\n\nAbout: ${proposal.about_agent || 'system'}\n\nEvidence: ${JSON.stringify(proposal.evidence)}`,
        ]
      );
    }

    res.json({ ok: true, proposal: result.rows[0] });
  } catch (err) {
    console.error('[AI API] PATCH /proposals/:id/david-decision error:', err.message);
    res.status(500).json({ error: 'Failed to record David decision' });
  }
});

// ============================================================
// ENRICHMENT PIPELINE — Ralph GPT endpoints
// ============================================================

/**
 * GET /api/ai/contacts/enrichment-queue
 * Returns contacts sorted by TPE × view_score that need enrichment (missing email).
 * Respects Gold data rule: never returns contacts with data_source='manual' emails.
 * Query params: limit (default 10), offset (default 0), type ('owner'|'tenant'|'all')
 */
router.get('/contacts/enrichment-queue', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not ready' });

  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const offset = parseInt(req.query.offset) || 0;
    const contactType = req.query.type || 'all'; // 'owner', 'tenant', 'all'

    let typeFilter = '';
    if (contactType === 'owner') {
      typeFilter = `AND c.type = 'owner'`;
    } else if (contactType === 'tenant') {
      typeFilter = `AND c.type = 'tenant'`;
    }

    const result = await pool.query(`
      SELECT
        c.contact_id,
        c.full_name,
        c.first_name,
        c.type,
        c.email_1,
        c.email_2,
        c.phone_1,
        c.phone_2,
        c.date_of_birth,
        c.data_source,
        c.enriched_by,
        c.enrichment_decay_check,
        MAX(t.tpe_score) as max_tpe_score
      FROM contacts c
      LEFT JOIN property_contacts pc ON pc.contact_id = c.contact_id
      LEFT JOIN property_tpe_scores t ON t.property_id = pc.property_id
      WHERE
        -- Missing email = needs enrichment
        (c.email_1 IS NULL OR c.email_1 = '')
        -- Not already being enriched
        AND c.enriched_by IS NULL
        -- Not opted out
        AND COALESCE(c.opted_out, FALSE) = FALSE
        ${typeFilter}
      GROUP BY c.contact_id
      ORDER BY
        MAX(t.tpe_score) DESC NULLS LAST,
        c.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    // Also get total count for pagination
    const countResult = await pool.query(`
      SELECT COUNT(*) as total
      FROM contacts c
      WHERE
        (c.email_1 IS NULL OR c.email_1 = '')
        AND c.enriched_by IS NULL
        AND COALESCE(c.opted_out, FALSE) = FALSE
        ${typeFilter}
    `);

    res.json({
      ok: true,
      contacts: result.rows,
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
    });
  } catch (err) {
    console.error('[AI API] GET /contacts/enrichment-queue error:', err.message);
    res.status(500).json({ error: 'Failed to fetch enrichment queue' });
  }
});

/**
 * POST /api/ai/command/enrich-contact
 * Update a contact's enrichment fields. Enforces Gold data rules:
 * - If data_source='manual' on existing email_1, enrichment goes to email_2
 * - Never overwrites Gold data
 * - Auto-sets enrichment_decay_check based on contact type
 *
 * Body: { contact_id, fields: { email_1, email_1_confidence, ... } }
 */
router.post('/command/enrich-contact', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not ready' });

  try {
    const { contact_id, fields } = req.body;
    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id is required' });
    }
    if (!fields || typeof fields !== 'object' || Object.keys(fields).length === 0) {
      return res.status(400).json({ error: 'fields object is required' });
    }

    // Fetch current contact to check Gold data rules
    const existing = await pool.query(
      `SELECT contact_id, email_1, data_source, opted_out FROM contacts WHERE contact_id = $1`,
      [contact_id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = existing.rows[0];

    // Block enrichment of opted-out contacts
    if (contact.opted_out) {
      return res.status(403).json({ error: 'Contact has opted out — cannot enrich' });
    }

    // Gold data protection: if existing email_1 was manually entered, don't overwrite
    if (contact.data_source === 'manual' && contact.email_1 && fields.email_1) {
      // Move enriched email to email_2 instead
      if (!fields.email_2) {
        fields.email_2 = fields.email_1;
        fields.email_2_confidence = fields.email_1_confidence || null;
        fields.email_2_source = fields.email_1_source || null;
        fields.email_2_verified = fields.email_1_verified || false;
      }
      // Remove email_1 fields — Gold data protected
      delete fields.email_1;
      delete fields.email_1_confidence;
      delete fields.email_1_source;
      delete fields.email_1_verified;
    }

    // Whitelist of allowed enrichment fields
    const ALLOWED_FIELDS = new Set([
      'email_1', 'email_2',
      'email_1_confidence', 'email_2_confidence',
      'email_1_source', 'email_2_source',
      'email_1_verified', 'email_2_verified',
      'phone_1', 'phone_2',
      'phone_1_type', 'phone_2_type',
      'phone_1_verified', 'phone_2_verified',
      'phone_1_source', 'phone_2_source',
      'date_of_birth',
      'owner_name_verified',
      'enrichment_source_trail',
      'enriched_by',
      'enrichment_notes',
      'campaign_ready',
      'company_name',
      'first_name', 'last_name',
    ]);

    // Filter to only allowed fields
    const safeFields = {};
    for (const [key, value] of Object.entries(fields)) {
      if (ALLOWED_FIELDS.has(key)) {
        safeFields[key] = value;
      }
    }

    if (Object.keys(safeFields).length === 0) {
      return res.status(400).json({ error: 'No valid enrichment fields provided' });
    }

    // Always set enriched_at timestamp
    safeFields.enriched_at = new Date().toISOString();

    // Build parameterized UPDATE
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(safeFields)) {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(contact_id);
    const updateSQL = `
      UPDATE contacts
      SET ${setClauses.join(', ')}
      WHERE contact_id = $${paramIndex}
      RETURNING contact_id, email_1, email_2, campaign_ready, enriched_by, enrichment_decay_check
    `;

    const result = await pool.query(updateSQL, values);

    // Log to agent activity
    const io = getIo();
    if (io) {
      io.emit('agent:enrichment', {
        agent: req.agentName || 'unknown',
        contact_id,
        fields_updated: Object.keys(safeFields),
        campaign_ready: result.rows[0]?.campaign_ready,
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      ok: true,
      contact: result.rows[0],
      gold_data_protected: contact.data_source === 'manual' && contact.email_1 ? true : false,
      fields_updated: Object.keys(safeFields),
    });
  } catch (err) {
    console.error('[AI API] POST /command/enrich-contact error:', err.message);
    res.status(500).json({ error: 'Failed to enrich contact', detail: err.message });
  }
});

/**
 * POST /api/ai/command/log-enrichment-result
 * Ralph logs the result of each lookup attempt (success or failure).
 * This feeds the self-improvement loop — Houston reviews hit rates and patterns.
 *
 * Body: { contact_id, source, action, success, data, error?, notes? }
 */
router.post('/command/log-enrichment-result', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not ready' });

  try {
    const { contact_id, source, action, success, data, error: errorMsg, notes } = req.body;

    if (!contact_id || !source || !action) {
      return res.status(400).json({
        error: 'contact_id, source, and action are required',
      });
    }

    // Ensure the enrichment_logs table exists (created on first call)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS enrichment_logs (
        id SERIAL PRIMARY KEY,
        contact_id UUID REFERENCES contacts(contact_id) ON DELETE SET NULL,
        agent_name TEXT DEFAULT 'unknown',
        source TEXT NOT NULL,
        action TEXT NOT NULL,
        success BOOLEAN DEFAULT FALSE,
        data JSONB,
        error TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const result = await pool.query(`
      INSERT INTO enrichment_logs
        (contact_id, agent_name, source, action, success, data, error, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at
    `, [
      contact_id,
      req.agentName || 'unknown',
      source,     // 'whitepages', 'beenverified', 'hunter.io', 'twilio', 'ca_sos', 'google_maps'
      action,     // 'lookup', 'verify_email', 'validate_phone', 'domain_search'
      success,
      data ? JSON.stringify(data) : null,
      errorMsg || null,
      notes || null,
    ]);

    res.json({
      ok: true,
      log_id: result.rows[0].id,
      created_at: result.rows[0].created_at,
    });
  } catch (err) {
    console.error('[AI API] POST /command/log-enrichment-result error:', err.message);
    res.status(500).json({ error: 'Failed to log enrichment result' });
  }
});

// ============================================================
// VERIFICATION QUEUE (Human-in-the-Loop)
// Houston / Ralph create requests → David resolves in CRM
// ============================================================

/**
 * POST /api/ai/verification/request
 * Houston or Ralph creates a new verification request for David.
 * Body: { contact_id, request_type, request_details, suggested_data, research_trail?, requested_by, priority?, confidence_before? }
 */
router.post('/verification/request', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not ready' });

  try {
    const {
      contact_id,
      property_id,
      request_type,
      request_details,
      suggested_data,
      research_trail,
      requested_by,
      priority = 'normal',
      confidence_before,
    } = req.body;

    if (!contact_id || !request_type || !request_details || !requested_by) {
      return res.status(400).json({
        error: 'contact_id, request_type, request_details, and requested_by are required',
      });
    }

    const VALID_TYPES = ['verify_email', 'verify_phone', 'verify_identity', 'check_zoominfo', 'confirm_decision_maker', 'verify_address', 'other'];
    if (!VALID_TYPES.includes(request_type)) {
      return res.status(400).json({ error: `request_type must be one of: ${VALID_TYPES.join(', ')}` });
    }

    const VALID_REQUESTERS = ['ralph_gpt', 'houston_command', 'claude_code'];
    if (!VALID_REQUESTERS.includes(requested_by)) {
      return res.status(400).json({ error: `requested_by must be one of: ${VALID_REQUESTERS.join(', ')}` });
    }

    // Check contact exists and is not opted out
    const contact = await pool.query(
      `SELECT contact_id, full_name, opted_out FROM contacts WHERE contact_id = $1`,
      [contact_id]
    );
    if (contact.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }
    if (contact.rows[0].opted_out) {
      return res.status(403).json({ error: 'Contact has opted out — cannot create verification request' });
    }

    // Count pending requests for this contact — avoid flooding David
    const pendingCount = await pool.query(
      `SELECT COUNT(*) FROM verification_requests WHERE contact_id = $1 AND status IN ('pending', 'in_progress')`,
      [contact_id]
    );
    if (parseInt(pendingCount.rows[0].count) >= 3) {
      return res.status(409).json({
        error: 'This contact already has 3 pending verification requests — resolve existing ones first',
        pending_count: parseInt(pendingCount.rows[0].count),
      });
    }

    const result = await pool.query(`
      INSERT INTO verification_requests
        (contact_id, property_id, requested_by, request_type, request_details,
         suggested_data, research_trail, priority, confidence_before)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, contact_id, status, created_at, expires_at
    `, [
      contact_id,
      property_id || null,
      requested_by,
      request_type,
      request_details,
      suggested_data ? JSON.stringify(suggested_data) : null,
      research_trail ? JSON.stringify(research_trail) : null,
      priority,
      confidence_before || null,
    ]);

    // Notify CRM via websocket
    const io = getIo();
    if (io) {
      io.emit('verification:new_request', {
        id: result.rows[0].id,
        contact_id,
        contact_name: contact.rows[0].full_name,
        request_type,
        requested_by,
        priority,
      });
    }

    res.status(201).json({
      ok: true,
      verification_request: result.rows[0],
    });
  } catch (err) {
    console.error('[AI API] POST /verification/request error:', err.message);
    res.status(500).json({ error: 'Failed to create verification request', detail: err.message });
  }
});

/**
 * GET /api/ai/verification/queue
 * Returns pending/in_progress verification requests for David to action.
 * Params: status (default 'pending'), limit (default 25), offset (default 0)
 */
router.get('/verification/queue', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not ready' });

  try {
    const {
      status = 'pending',
      limit = 25,
      offset = 0,
    } = req.query;

    const VALID_STATUSES = ['pending', 'in_progress', 'confirmed', 'rejected', 'updated', 'not_found', 'expired', 'all'];
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // Lazy expire any stale pending requests before returning queue
    await pool.query(`
      UPDATE verification_requests
      SET status = 'expired', resolved_at = NOW()
      WHERE status = 'pending' AND expires_at < NOW()
    `);

    const statusFilter = status === 'all'
      ? ''
      : `AND vr.status = $3`;

    const params = status === 'all'
      ? [parseInt(limit), parseInt(offset)]
      : [parseInt(limit), parseInt(offset), status];

    const result = await pool.query(`
      SELECT
        vr.id,
        vr.contact_id,
        vr.property_id,
        vr.requested_by,
        vr.request_type,
        vr.request_details,
        vr.suggested_data,
        vr.research_trail,
        vr.priority,
        vr.status,
        vr.david_response,
        vr.updated_data,
        vr.created_at,
        vr.viewed_at,
        vr.resolved_at,
        vr.expires_at,
        vr.confidence_before,
        vr.confidence_after,
        vr.resolution_time_seconds,
        -- Contact context
        c.full_name AS contact_name,
        c.first_name AS contact_first_name,
        c.type AS contact_type,
        c.email_1,
        c.phone_1,
        c.email_1_confidence,
        -- Property context (if linked)
        p.address AS property_address,
        p.city AS property_city
      FROM verification_requests vr
      JOIN contacts c ON c.contact_id = vr.contact_id
      LEFT JOIN properties p ON p.id = vr.property_id
      WHERE TRUE ${statusFilter}
      ORDER BY
        CASE vr.priority
          WHEN 'urgent' THEN 1
          WHEN 'high' THEN 2
          WHEN 'normal' THEN 3
          WHEN 'low' THEN 4
          ELSE 5
        END ASC,
        vr.created_at DESC
      LIMIT $1 OFFSET $2
    `, params);

    const countResult = await pool.query(`
      SELECT COUNT(*) FROM verification_requests vr ${status !== 'all' ? 'WHERE status = $1' : ''}
    `, status !== 'all' ? [status] : []);

    res.json({
      ok: true,
      requests: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    console.error('[AI API] GET /verification/queue error:', err.message);
    res.status(500).json({ error: 'Failed to fetch verification queue', detail: err.message });
  }
});

/**
 * POST /api/ai/verification/resolve
 * David (or CRM UI) resolves a verification request.
 * Body: { verification_id, status, david_response?, updated_data? }
 *
 * On confirmed/updated: DB trigger fn_verification_auto_promote fires
 * and promotes data to Gold tier on the contact automatically.
 */
router.post('/verification/resolve', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not ready' });

  try {
    const { verification_id, status, david_response, updated_data } = req.body;

    if (!verification_id || !status) {
      return res.status(400).json({ error: 'verification_id and status are required' });
    }

    const VALID_RESOLUTION_STATUSES = ['confirmed', 'rejected', 'updated', 'not_found'];
    if (!VALID_RESOLUTION_STATUSES.includes(status)) {
      return res.status(400).json({
        error: `status must be one of: ${VALID_RESOLUTION_STATUSES.join(', ')}`,
      });
    }

    if (status === 'updated' && !updated_data) {
      return res.status(400).json({ error: 'updated_data is required when status is "updated"' });
    }

    // Fetch current request
    const existing = await pool.query(
      `SELECT id, contact_id, status, request_type, suggested_data FROM verification_requests WHERE id = $1`,
      [verification_id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Verification request not found' });
    }
    if (['confirmed', 'rejected', 'updated', 'not_found', 'expired'].includes(existing.rows[0].status)) {
      return res.status(409).json({
        error: 'This request has already been resolved',
        current_status: existing.rows[0].status,
      });
    }

    // Mark viewed_at if first touch
    await pool.query(
      `UPDATE verification_requests SET viewed_at = COALESCE(viewed_at, NOW()) WHERE id = $1`,
      [verification_id]
    );

    // Resolve — DB trigger fn_verification_auto_promote handles contact promotion
    const result = await pool.query(`
      UPDATE verification_requests
      SET
        status = $2,
        david_response = $3,
        updated_data = $4,
        resolved_at = NOW()
      WHERE id = $1
      RETURNING id, status, contact_id, resolved_at, resolution_time_seconds,
                confidence_before, confidence_after
    `, [
      verification_id,
      status,
      david_response || null,
      updated_data ? JSON.stringify(updated_data) : null,
    ]);

    const resolved = result.rows[0];

    // Notify CRM
    const io = getIo();
    if (io) {
      io.emit('verification:resolved', {
        id: resolved.id,
        status,
        contact_id: resolved.contact_id,
        auto_promoted: ['confirmed', 'updated'].includes(status),
      });
    }

    res.json({
      ok: true,
      resolved: resolved,
      auto_promoted: ['confirmed', 'updated'].includes(status),
      message: ['confirmed', 'updated'].includes(status)
        ? 'Contact data promoted to Gold tier automatically'
        : `Request marked as ${status}`,
    });
  } catch (err) {
    console.error('[AI API] POST /verification/resolve error:', err.message);
    res.status(500).json({ error: 'Failed to resolve verification request', detail: err.message });
  }
});

/**
 * GET /api/ai/verification/stats
 * Enrichment quality scorecard — confirmation rates, resolution times, agent accuracy.
 * Params: days (default 30)
 */
router.get('/verification/stats', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not ready' });

  try {
    const { days = 30 } = req.query;
    const since = `NOW() - INTERVAL '${parseInt(days)} days'`;

    const [totals, byType, byAgent, avgResolution] = await Promise.all([
      // Overall totals
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE TRUE) AS total_requested,
          COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed,
          COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
          COUNT(*) FILTER (WHERE status = 'updated') AS updated,
          COUNT(*) FILTER (WHERE status = 'not_found') AS not_found,
          COUNT(*) FILTER (WHERE status = 'expired') AS expired,
          COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress')) AS pending,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status IN ('confirmed', 'updated')) /
            NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('pending', 'in_progress', 'expired')), 0),
            1
          ) AS confirmation_rate_pct
        FROM verification_requests
        WHERE created_at >= ${since}
      `),

      // By request type
      pool.query(`
        SELECT
          request_type,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status IN ('confirmed', 'updated')) AS confirmed,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status IN ('confirmed', 'updated')) /
            NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('pending', 'in_progress', 'expired')), 0),
            1
          ) AS confirmation_rate_pct
        FROM verification_requests
        WHERE created_at >= ${since}
        GROUP BY request_type
        ORDER BY total DESC
      `),

      // By requesting agent
      pool.query(`
        SELECT
          requested_by,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status IN ('confirmed', 'updated')) AS confirmed,
          COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status IN ('confirmed', 'updated')) /
            NULLIF(COUNT(*) FILTER (WHERE status NOT IN ('pending', 'in_progress', 'expired')), 0),
            1
          ) AS accuracy_pct
        FROM verification_requests
        WHERE created_at >= ${since}
        GROUP BY requested_by
        ORDER BY total DESC
      `),

      // Average resolution time
      pool.query(`
        SELECT
          ROUND(AVG(resolution_time_seconds) / 60.0, 1) AS avg_resolution_minutes,
          MIN(resolution_time_seconds) AS fastest_seconds,
          MAX(resolution_time_seconds) AS slowest_seconds
        FROM verification_requests
        WHERE status NOT IN ('pending', 'in_progress', 'expired')
          AND resolution_time_seconds IS NOT NULL
          AND created_at >= ${since}
      `),
    ]);

    res.json({
      ok: true,
      period_days: parseInt(days),
      totals: totals.rows[0],
      by_request_type: byType.rows,
      by_agent: byAgent.rows,
      resolution_time: avgResolution.rows[0],
    });
  } catch (err) {
    console.error('[AI API] GET /verification/stats error:', err.message);
    res.status(500).json({ error: 'Failed to fetch verification stats', detail: err.message });
  }
});

// ============================================================
// MOUNT FUNCTION — called from server/index.js
// ============================================================

/**
 * Mount the AI API routes onto the Express app.
 * Must be called BEFORE app.use('/api', requireAuth) so these routes
 * use their own X-Agent-Key auth instead of JWT.
 *
 * Uses getter functions so pool/io can be initialized after mounting.
 *
 * @param {express.Application} app - Express app
 * @param {object} deps - { getPool: () => pool, getIo: () => io }
 */
function mountAiRoutes(app, deps) {
  getPool = deps.getPool;
  getIo = deps.getIo;
  if (deps.getCouncilResponder) {
    getCouncilResponder = deps.getCouncilResponder;
  }
  app.use('/api/ai', router);
  app.use('/api/ai', directivesRouter);
  console.log('[server] AI Master System API mounted at /api/ai (+ directives)');
}

module.exports = { mountAiRoutes };
