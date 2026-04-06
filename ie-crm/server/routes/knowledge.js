// Knowledge Graph API — Endpoints for vault-backed knowledge nodes + edges
// Auth: dual-auth (X-Agent-Key for Houston sync, JWT for CRM dashboard)
// Mounted BEFORE requireAuth in index.js

const express = require('express');
const router = express.Router();

let getPool = () => null;

// ============================================================
// AUTH MIDDLEWARE — accept Agent Key OR JWT Bearer
// ============================================================

function requireAgentKeyOrJwt(req, res, next) {
  const agentKey = req.headers['x-agent-key'];
  const validKey = process.env.AGENT_API_KEY;
  if (validKey && agentKey === validKey) {
    req.agentName = req.headers['x-agent-name'] || 'unknown';
    req.authType = 'agent';
    return next();
  }

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
    } catch { /* invalid JWT */ }
  }

  return res.status(401).json({ error: 'Authentication required — provide X-Agent-Key or Bearer JWT' });
}

function requireAgentKeyOnly(req, res, next) {
  const agentKey = req.headers['x-agent-key'];
  const validKey = process.env.AGENT_API_KEY;
  if (!validKey) return res.status(503).json({ error: 'Agent API not configured' });
  if (!agentKey || agentKey !== validKey) return res.status(401).json({ error: 'Invalid or missing X-Agent-Key' });
  req.agentName = req.headers['x-agent-name'] || 'unknown';
  req.authType = 'agent';
  next();
}

// ============================================================
// VISIBILITY FILTER — enforces business/david-only/internal
// ============================================================

function visibilityFilter(req) {
  // Agents see everything (including internal)
  if (req.authType === 'agent') return '';
  // David sees business + david-only
  const email = req.user?.email || '';
  if (email === 'david@mudgeteam.com' || email === 'david@leeassociates.com' || req.user?.role === 'admin') {
    return `AND visibility != 'internal'`;
  }
  // Team members see business only
  return `AND visibility = 'business'`;
}

// Apply auth to all routes
router.use(requireAgentKeyOrJwt);

// ============================================================
// GET /api/knowledge/graph — All nodes + edges for rendering
// ============================================================

router.get('/graph', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { type, status, tags } = req.query;
    const vf = visibilityFilter(req);

    let where = `WHERE 1=1 ${vf}`;
    const params = [];

    if (type) {
      params.push(type);
      where += ` AND type = $${params.length}`;
    }
    if (status) {
      params.push(status);
      where += ` AND status = $${params.length}`;
    }
    if (tags) {
      params.push(tags);
      where += ` AND tags ? $${params.length}`;
    }

    const nodesResult = await pool.query(
      `SELECT id, slug, type, title, aliases, crm_id, last_verified, stale_after,
              status, visibility, tags, links_to, source_context,
              merge_requested_at, merged_at,
              created_at, updated_at
       FROM knowledge_nodes ${where}
       ORDER BY type, title`,
      params
    );

    // Get all edges where both endpoints are in the visible node set
    const slugs = nodesResult.rows.map(n => n.slug);
    let edgesResult = { rows: [] };
    if (slugs.length > 0) {
      edgesResult = await pool.query(
        `SELECT id, from_slug, to_slug, context
         FROM knowledge_edges
         WHERE from_slug = ANY($1) AND to_slug = ANY($1)`,
        [slugs]
      );
    }

    res.json({
      nodes: nodesResult.rows,
      edges: edgesResult.rows,
      meta: { nodeCount: nodesResult.rows.length, edgeCount: edgesResult.rows.length },
    });
  } catch (err) {
    console.error('[knowledge/graph] Error:', err.message);
    res.status(500).json({ error: 'Failed to load graph data' });
  }
});

// ============================================================
// GET /api/knowledge/node/:slug — Full node with content + CRM join
// ============================================================

router.get('/node/:slug', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const vf = visibilityFilter(req);
    const result = await pool.query(
      `SELECT * FROM knowledge_nodes WHERE slug = $1 ${vf}`,
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }

    const node = result.rows[0];

    // Fetch connected edges
    const edges = await pool.query(
      `SELECT * FROM knowledge_edges WHERE from_slug = $1 OR to_slug = $1`,
      [node.slug]
    );

    // If crm_id exists, fetch CRM data
    let crmData = null;
    if (node.crm_id) {
      const tableMap = {
        contact: 'contacts',
        company: 'companies',
        property: 'properties',
        deal: 'deals',
      };
      const table = tableMap[node.type];
      if (table) {
        const idCol = table === 'contacts' ? 'contact_id'
          : table === 'companies' ? 'company_id'
          : table === 'properties' ? 'property_id'
          : 'deal_id';
        try {
          const crmResult = await pool.query(
            `SELECT * FROM ${table} WHERE ${idCol} = $1 LIMIT 1`,
            [node.crm_id]
          );
          if (crmResult.rows.length > 0) crmData = crmResult.rows[0];
        } catch (e) {
          console.warn(`[knowledge/node] CRM join failed for ${node.type}/${node.crm_id}:`, e.message);
        }
      }
    }

    // Fetch connected node summaries for the connections list
    const connectedSlugs = [
      ...edges.rows.map(e => e.from_slug === node.slug ? e.to_slug : e.from_slug),
    ];
    let connections = [];
    if (connectedSlugs.length > 0) {
      const connResult = await pool.query(
        `SELECT slug, type, title, status, tags FROM knowledge_nodes WHERE slug = ANY($1) ${vf}`,
        [connectedSlugs]
      );
      connections = connResult.rows;
    }

    res.json({ node, edges: edges.rows, connections, crmData });
  } catch (err) {
    console.error('[knowledge/node] Error:', err.message);
    res.status(500).json({ error: 'Failed to load node' });
  }
});

// ============================================================
// GET /api/knowledge/search — Full-text search
// ============================================================

router.get('/search', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ error: 'Query must be at least 2 characters' });
    }

    const vf = visibilityFilter(req);
    const searchTerms = q.trim().split(/\s+/).map(t => t + ':*').join(' & ');

    const result = await pool.query(
      `SELECT slug, type, title, aliases, status, tags, summary,
              ts_rank(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')),
                      to_tsquery('english', $1)) AS rank
       FROM knowledge_nodes
       WHERE to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))
             @@ to_tsquery('english', $1) ${vf}
       ORDER BY rank DESC
       LIMIT 20`,
      [searchTerms]
    );

    res.json({ results: result.rows, query: q });
  } catch (err) {
    console.error('[knowledge/search] Error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ============================================================
// GET /api/knowledge/inbox — Pending review items
// ============================================================

router.get('/inbox', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const vf = visibilityFilter(req);
    const result = await pool.query(
      `SELECT * FROM knowledge_nodes
       WHERE status = 'pending-review' ${vf}
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ items: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[knowledge/inbox] Error:', err.message);
    res.status(500).json({ error: 'Failed to load inbox' });
  }
});

// ============================================================
// GET /api/knowledge/entity/:table/:id — Check if CRM entity has a knowledge node
// ============================================================

router.get('/entity/:table/:id', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const vf = visibilityFilter(req);
    const result = await pool.query(
      `SELECT slug, type, title, status FROM knowledge_nodes
       WHERE crm_id = $1 ${vf}
       LIMIT 1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.json({ found: false });
    }
    res.json({ found: true, node: result.rows[0] });
  } catch (err) {
    console.error('[knowledge/entity] Error:', err.message);
    res.status(500).json({ error: 'Failed to check entity' });
  }
});

// ============================================================
// PATCH /api/knowledge/node/:slug — Update status, tags, request merge
// ============================================================

router.patch('/node/:slug', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { status, tags, merge_target_slug } = req.body;
    const sets = [];
    const params = [req.params.slug];

    if (status) {
      params.push(status);
      sets.push(`status = $${params.length}`);
    }
    if (tags) {
      params.push(JSON.stringify(tags));
      sets.push(`tags = $${params.length}::jsonb`);
    }
    if (merge_target_slug) {
      sets.push(`merge_requested_at = NOW()`);
      params.push(merge_target_slug);
      sets.push(`merge_target_slug = $${params.length}`);
    }

    sets.push('updated_at = NOW()');

    if (sets.length === 1) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await pool.query(
      `UPDATE knowledge_nodes SET ${sets.join(', ')} WHERE slug = $1 RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Node not found' });
    }

    res.json({ ok: true, node: result.rows[0] });
  } catch (err) {
    console.error('[knowledge/node/patch] Error:', err.message);
    res.status(500).json({ error: 'Failed to update node' });
  }
});

// ============================================================
// POST /api/knowledge/sync — Bulk upsert from sync script (Agent only)
// ============================================================

router.post('/sync', requireAgentKeyOnly, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const { nodes, edges } = req.body;
    if (!nodes || !Array.isArray(nodes)) {
      return res.status(400).json({ error: 'nodes array required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let upsertedNodes = 0;
      let upsertedEdges = 0;

      // Upsert nodes
      for (const node of nodes) {
        await client.query(
          `INSERT INTO knowledge_nodes
            (file_path, slug, type, title, aliases, crm_id, last_verified, stale_after,
             status, visibility, source_context, tags, frontmatter, content, summary, links_to)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, $14, $15, $16::jsonb)
           ON CONFLICT (slug) DO UPDATE SET
             file_path = EXCLUDED.file_path,
             type = EXCLUDED.type,
             title = EXCLUDED.title,
             aliases = EXCLUDED.aliases,
             crm_id = COALESCE(EXCLUDED.crm_id, knowledge_nodes.crm_id),
             last_verified = EXCLUDED.last_verified,
             stale_after = EXCLUDED.stale_after,
             status = CASE WHEN knowledge_nodes.status = 'pending-review' AND knowledge_nodes.merge_requested_at IS NOT NULL
                           THEN knowledge_nodes.status
                           ELSE EXCLUDED.status END,
             visibility = EXCLUDED.visibility,
             source_context = EXCLUDED.source_context,
             tags = EXCLUDED.tags,
             frontmatter = EXCLUDED.frontmatter,
             content = EXCLUDED.content,
             summary = EXCLUDED.summary,
             links_to = EXCLUDED.links_to,
             updated_at = NOW()`,
          [
            node.file_path, node.slug, node.type, node.title,
            JSON.stringify(node.aliases || []),
            node.crm_id || null,
            node.last_verified || null, node.stale_after || null,
            node.status || 'active', node.visibility || 'business',
            node.source_context || null,
            JSON.stringify(node.tags || []),
            JSON.stringify(node.frontmatter || {}),
            node.content || null, node.summary || null,
            JSON.stringify(node.links_to || []),
          ]
        );
        upsertedNodes++;
      }

      // Replace edges — delete old, insert new
      if (edges && Array.isArray(edges) && edges.length > 0) {
        const fromSlugs = [...new Set(edges.map(e => e.from_slug))];
        await client.query(
          'DELETE FROM knowledge_edges WHERE from_slug = ANY($1)',
          [fromSlugs]
        );

        for (const edge of edges) {
          await client.query(
            `INSERT INTO knowledge_edges (from_slug, to_slug, context)
             VALUES ($1, $2, $3)
             ON CONFLICT (from_slug, to_slug) DO UPDATE SET context = EXCLUDED.context`,
            [edge.from_slug, edge.to_slug, edge.context || null]
          );
          upsertedEdges++;
        }
      }

      // Clean up nodes whose files no longer exist in the vault
      const syncedPaths = nodes.map(n => n.file_path);
      if (syncedPaths.length > 0) {
        await client.query(
          `DELETE FROM knowledge_nodes
           WHERE file_path NOT IN (SELECT unnest($1::text[]))
             AND status != 'pending-review'`,
          [syncedPaths]
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true, upsertedNodes, upsertedEdges });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[knowledge/sync] Error:', err.message);
    res.status(500).json({ error: 'Sync failed: ' + err.message });
  }
});

// ============================================================
// POST /api/knowledge/sync/trigger — Trigger on-demand sync (debounced)
// ============================================================

let lastSyncTrigger = 0;

router.post('/sync/trigger', async (req, res) => {
  const now = Date.now();
  if (now - lastSyncTrigger < 30000) {
    return res.json({ ok: true, skipped: true, message: 'Sync debounced (ran within 30s)' });
  }
  lastSyncTrigger = now;

  // The actual sync runs on Houston's machine — this endpoint just records the trigger
  // Houston polls for pending sync triggers, or we can extend this to hit a webhook
  const pool = getPool();
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO knowledge_nodes (file_path, slug, type, title, status, content)
         VALUES ('__sync_trigger__', '__sync_trigger_' || extract(epoch from now())::text, 'decision', 'Sync Trigger', 'archive', $1)
         ON CONFLICT DO NOTHING`,
        [JSON.stringify({ triggered_at: new Date().toISOString(), triggered_by: req.user?.email || req.agentName })]
      );
    } catch { /* non-critical */ }
  }

  res.json({ ok: true, skipped: false, message: 'Sync trigger recorded' });
});

// ============================================================
// GET /api/knowledge/stats — Quick counts for badges
// ============================================================

router.get('/stats', async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: 'Database not configured' });

  try {
    const vf = visibilityFilter(req);
    const result = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE 1=1 ${vf}) AS total_nodes,
        COUNT(*) FILTER (WHERE status = 'pending-review' ${vf}) AS inbox_pending,
        COUNT(*) FILTER (WHERE stale_after < CURRENT_DATE AND status = 'active' ${vf}) AS stale_count
       FROM knowledge_nodes`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[knowledge/stats] Error:', err.message);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ============================================================
// MOUNT
// ============================================================

function mountKnowledgeRoutes(app, deps) {
  getPool = deps.getPool;
  app.use('/api/knowledge', router);
  console.log('[server] Knowledge Graph API mounted at /api/knowledge');
}

module.exports = { mountKnowledgeRoutes };
