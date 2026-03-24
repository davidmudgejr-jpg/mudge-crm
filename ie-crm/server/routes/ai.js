// AI Master System API — Endpoints for external AI agents (OpenClaw fleet)
// Auth: X-Agent-Key header (checked against AGENT_API_KEY env var)
// Mounted BEFORE the general requireAuth middleware in index.js

const express = require('express');
const rateLimit = require('express-rate-limit');

const router = express.Router();

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
      const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-DO-NOT-USE-IN-PRODUCTION';
      const token = header.slice(7);
      const payload = jwt.verify(token, JWT_SECRET);
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
      `SELECT contact_id AS id, full_name, first_name, email, phone_1, title, type, work_city AS city
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
    const counts = await pool.query(`
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
    `);

    const recent = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM interactions WHERE created_at > NOW() - INTERVAL '7 days')::int AS interactions_7d,
        (SELECT COUNT(*) FROM contacts WHERE created_at > NOW() - INTERVAL '7 days')::int AS new_contacts_7d,
        (SELECT COUNT(*) FROM deals WHERE modified > NOW() - INTERVAL '7 days')::int AS deals_updated_7d
    `);

    res.json({
      counts: counts.rows[0],
      recent_activity: recent.rows[0],
      timestamp: new Date().toISOString(),
    });
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
    } = req.body;

    if (!agent_name) {
      return res.status(400).json({ error: 'agent_name is required' });
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
        const allowedFields = [
          'email', 'email_2', 'email_3', 'phone_1', 'phone_2', 'phone_3',
          'home_address', 'work_address', 'work_city', 'work_state', 'work_zip',
          'title', 'linkedin', 'type', 'full_name', 'first_name', 'company_name',
        ];
        if (allowedFields.includes(item.field_name)) {
          await pool.query(
            `UPDATE contacts SET ${item.field_name} = $1, modified = NOW() WHERE contact_id = $2`,
            [item.new_value, item.contact_id]
          );
          await pool.query(
            `UPDATE ${sandboxTable} SET status = 'promoted', promoted_at = NOW() WHERE id = $1`,
            [id]
          );
          promoted = true;
        }
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
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-DO-NOT-USE-IN-PRODUCTION';

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
      const payload = jwt.verify(token, JWT_SECRET);
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
    const payload = jwt.verify(token, JWT_SECRET);
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

    // Validate field names against actual columns
    const validFields = await pool.query(
      'SELECT column_name FROM information_schema.columns WHERE table_name = $1',
      [table]
    );
    const validFieldNames = validFields.rows.map(r => r.column_name);

    // Protected fields that Houston Command can NEVER write to
    const protectedFields = [idCol, 'airtable_id', 'created_at', 'modified'];

    const filled = [];
    const conflicted = [];
    const skipped = [];

    for (const [fieldName, newValue] of Object.entries(fields)) {
      // Skip invalid or protected fields
      if (!validFieldNames.includes(fieldName)) {
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
          `UPDATE ${table} SET "${fieldName}" = $1 WHERE "${idCol}" = $2`,
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
      current_value, suggested_value, source_detail, confidence,
      data_tier, is_ownership_change, workflow_id, batch_id,
    } = req.body;

    if (!entity_type || !entity_id || !field_name || !suggested_value) {
      return res.status(400).json({ error: 'entity_type, entity_id, field_name, and suggested_value are required' });
    }

    // Dedup: don't create duplicate suggestions for same entity+field+value
    const existing = await pool.query(
      `SELECT id FROM suggested_updates
       WHERE entity_type = $1 AND entity_id = $2 AND field_name = $3
         AND suggested_value = $4 AND status = 'pending'`,
      [entity_type, entity_id, field_name, suggested_value]
    );
    if (existing.rows.length > 0) {
      return res.json({ ok: true, skipped: true, reason: 'Duplicate suggestion already pending', id: existing.rows[0].id });
    }

    const result = await pool.query(
      `INSERT INTO suggested_updates
         (entity_type, entity_id, entity_name, field_name, field_label,
          current_value, suggested_value, source, source_detail, confidence,
          data_tier, is_ownership_change, agent_name, workflow_id, batch_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        entity_type, entity_id, entity_name || null, field_name, field_label || field_name,
        current_value || null, suggested_value, req.agentName || 'enricher', source_detail || null,
        confidence || 50, data_tier || 'bronze', is_ownership_change || false,
        req.agentName || 'enricher', workflow_id || null, batch_id || null,
      ]
    );

    res.json({ ok: true, suggestion: result.rows[0] });
  } catch (err) {
    console.error('[AI API] POST /suggested-updates error:', err.message);
    res.status(500).json({ error: 'Failed to submit suggested update' });
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
        // Validate the field name to prevent SQL injection
        const validFields = await pool.query(
          `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
          [table]
        );
        const validFieldNames = validFields.rows.map(r => r.column_name);

        if (validFieldNames.includes(s.field_name)) {
          await pool.query(
            `UPDATE ${table} SET "${s.field_name}" = $1 WHERE "${idCol}" = $2`,
            [s.suggested_value, s.entity_id]
          );

          // Mark as applied
          await pool.query(
            'UPDATE suggested_updates SET applied = true, applied_at = NOW() WHERE id = $1',
            [id]
          );
        }
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
          const validFields = await pool.query(
            `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
            [table]
          );
          if (validFields.rows.map(r => r.column_name).includes(s.field_name)) {
            await pool.query(
              `UPDATE ${table} SET "${s.field_name}" = $1 WHERE "${idCol}" = $2`,
              [s.suggested_value, s.entity_id]
            );
            await pool.query('UPDATE suggested_updates SET applied = true, applied_at = NOW() WHERE id = $1', [id]);
            appliedCount++;
          }
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
      `SELECT contact_id, full_name, email, email_2, email_3, track_emails_since
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
// IMPROVEMENT PROPOSALS — Tier 2/Tier 1 improvement workflow
// ============================================================

// 29. POST /api/ai/proposals — Submit an improvement proposal
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
