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

// Apply to all AI routes
router.use(agentLimiter);
router.use(requireAgentKey);

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
      params.push(parseFloat(min_sf));
      idx++;
    }
    if (max_sf) {
      conditions.push(`rba <= $${idx}`);
      params.push(parseFloat(max_sf));
      idx++;
    }
    if (min_price) {
      conditions.push(`last_sale_price >= $${idx}`);
      params.push(parseFloat(min_price));
      idx++;
    }
    if (max_price) {
      conditions.push(`last_sale_price <= $${idx}`);
      params.push(parseFloat(max_price));
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
      params.push(parseFloat(min_sf));
      idx++;
    }
    if (max_sf) {
      conditions.push(`${sfAlias}.sf <= $${idx}`);
      params.push(parseFloat(max_sf));
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
               FROM property_deals pd JOIN properties p ON p.property_id = pd.property_id
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
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

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
