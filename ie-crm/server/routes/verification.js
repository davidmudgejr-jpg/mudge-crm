/**
 * Verification Queue Routes — Human-in-the-Loop Enrichment
 *
 * Enables Houston/Ralph to flag contacts for David's manual verification.
 * David reviews in the CRM UI, confirms/rejects/updates, and the system
 * auto-promotes verified data to Gold tier.
 *
 * Endpoints:
 *   POST /api/ai/verification/request   — Create a verification request
 *   GET  /api/ai/verification/queue      — Get pending verifications
 *   POST /api/ai/verification/resolve    — David resolves a verification
 *   GET  /api/ai/verification/stats      — Enrichment quality scorecard
 */

const express = require('express');

function mountVerificationRoutes(app, { getPool, requireAuth, optionalAuth }) {
  const router = express.Router();

  // Dual-auth middleware: accept JWT (CRM dashboard) OR X-Agent-Key (Houston/Ralph)
  router.use((req, res, next) => {
    // Set pool
    req.pool = getPool();
    if (!req.pool) return res.status(503).json({ error: 'Database not configured' });

    // Check X-Agent-Key first (for agents)
    const agentKey = req.headers['x-agent-key'];
    if (agentKey && agentKey === process.env.AGENT_API_KEY) {
      req.authType = 'agent';
      return next();
    }

    // Check JWT Bearer token (for CRM frontend)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.slice(7);
        const { EFFECTIVE_JWT_SECRET } = require('../middleware/auth');
        const decoded = jwt.verify(token, EFFECTIVE_JWT_SECRET);
        req.user = decoded;
        req.authType = 'jwt';
        return next();
      } catch (err) {
        return res.status(401).json({ error: 'Invalid JWT token' });
      }
    }

    return res.status(401).json({ error: 'Authentication required — provide JWT or X-Agent-Key' });
  });

  function requireWritableUserOrAgent(req, res, next) {
    if (req.authType === 'agent') return next();
    if (req.user && ['admin', 'broker'].includes(req.user.role || 'broker')) return next();
    return res.status(403).json({ error: 'admin or broker role required' });
  }

  // ──────────────────────────────────────────────────
  // POST /api/ai/verification/request
  // Houston or Ralph creates a verification request
  // ──────────────────────────────────────────────────
  router.post('/request', async (req, res) => {
    try {
      const {
        contact_id,
        property_id,
        requested_by,
        request_type,
        request_details,
        suggested_data,
        research_trail,
        priority = 'normal',
        confidence_before
      } = req.body;

      // Validate required fields
      if (!contact_id || !requested_by || !request_type || !request_details) {
        return res.status(400).json({
          error: 'Missing required fields: contact_id, requested_by, request_type, request_details'
        });
      }

      // Check daily limit (max 10 pending per day to not flood David)
      const todayCount = await req.pool.query(`
        SELECT COUNT(*) as cnt FROM verification_requests
        WHERE created_at > NOW() - INTERVAL '24 hours'
          AND status = 'pending'
      `);
      if (parseInt(todayCount.rows[0].cnt) >= 10) {
        return res.status(429).json({
          error: 'Daily verification limit reached (10/day). Queue existing items first.',
          pending_count: parseInt(todayCount.rows[0].cnt)
        });
      }

      // Check for duplicate pending request on same contact + type
      const duplicate = await req.pool.query(`
        SELECT id FROM verification_requests
        WHERE contact_id = $1 AND request_type = $2 AND status IN ('pending', 'in_progress')
        LIMIT 1
      `, [contact_id, request_type]);

      if (duplicate.rows.length > 0) {
        return res.status(409).json({
          error: 'Duplicate: a pending verification already exists for this contact and type',
          existing_id: duplicate.rows[0].id
        });
      }

      const result = await req.pool.query(`
        INSERT INTO verification_requests
          (contact_id, property_id, requested_by, request_type, request_details, suggested_data, research_trail, priority, confidence_before)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [contact_id, property_id || null, requested_by, request_type, request_details,
          suggested_data ? JSON.stringify(suggested_data) : null,
          research_trail ? JSON.stringify(research_trail) : null,
          priority, confidence_before || null]);

      res.json({
        success: true,
        verification: result.rows[0]
      });

    } catch (err) {
      console.error('[verification/request] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────
  // GET /api/ai/verification/queue
  // Returns pending verifications with contact context
  // ──────────────────────────────────────────────────
  router.get('/queue', async (req, res) => {
    try {
      const {
        status = 'pending',
        limit = 20,
        offset = 0
      } = req.query;

      // Lazy expiration — expire stale requests
      await req.pool.query(`
        UPDATE verification_requests
        SET status = 'expired', resolved_at = NOW()
        WHERE status = 'pending' AND expires_at < NOW()
      `);

      // Build status filter
      const statusList = status.split(',').map(s => s.trim());
      const statusPlaceholders = statusList.map((_, i) => `$${i + 1}`).join(', ');

      const result = await req.pool.query(`
        SELECT
          vr.*,
          c.full_name as contact_name,
          c.first_name as contact_first_name,
          c.type as contact_type,
          c.email_1 as current_email,
          c.phone_1 as current_phone,
          c.data_source as current_data_source
        FROM verification_requests vr
        LEFT JOIN contacts c ON c.contact_id = vr.contact_id
        WHERE vr.status IN (${statusPlaceholders})
        ORDER BY
          CASE vr.priority
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 3
          END,
          vr.created_at DESC
        LIMIT $${statusList.length + 1} OFFSET $${statusList.length + 2}
      `, [...statusList, parseInt(limit), parseInt(offset)]);

      // Get total count for pagination
      const countResult = await req.pool.query(`
        SELECT COUNT(*) as total FROM verification_requests
        WHERE status IN (${statusPlaceholders})
      `, statusList);

      res.json({
        verifications: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset)
      });

    } catch (err) {
      console.error('[verification/queue] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────
  // POST /api/ai/verification/resolve
  // David resolves a verification request
  // Triggers auto-promote via DB trigger
  // ──────────────────────────────────────────────────
  router.post('/resolve', requireWritableUserOrAgent, async (req, res) => {
    try {
      const {
        verification_id,
        status,
        david_response,
        updated_data
      } = req.body;

      if (!verification_id || !status) {
        return res.status(400).json({
          error: 'Missing required fields: verification_id, status'
        });
      }

      const validStatuses = ['confirmed', 'rejected', 'updated', 'not_found'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      // If status is 'updated', require updated_data
      if (status === 'updated' && !updated_data) {
        return res.status(400).json({
          error: 'Status "updated" requires updated_data with the corrected information'
        });
      }

      // Verify the request exists and is resolvable
      const existing = await req.pool.query(
        'SELECT * FROM verification_requests WHERE id = $1',
        [verification_id]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Verification request not found' });
      }

      if (['confirmed', 'rejected', 'updated', 'not_found', 'expired'].includes(existing.rows[0].status)) {
        return res.status(409).json({
          error: `Already resolved with status: ${existing.rows[0].status}`,
          resolved_at: existing.rows[0].resolved_at
        });
      }

      // Resolve — the DB trigger handles auto-promote for confirmed/updated
      const result = await req.pool.query(`
        UPDATE verification_requests
        SET
          status = $1,
          david_response = $2,
          updated_data = $3,
          resolved_at = NOW()
        WHERE id = $4
        RETURNING *
      `, [status, david_response || null,
          updated_data ? JSON.stringify(updated_data) : null,
          verification_id]);

      const resolved = result.rows[0];

      // If rejected, log it for enrichment self-improvement
      if (status === 'rejected' && resolved.contact_id) {
        await req.pool.query(`
          INSERT INTO enrichment_logs (contact_id, source, lookup_type, success, notes, agent)
          VALUES ($1, 'manual_verification', $2, FALSE, $3, 'david')
        `, [resolved.contact_id, resolved.request_type,
            `Rejected: ${david_response || 'No reason given'}`]).catch(() => {
          // enrichment_logs table might not exist yet, silently fail
        });
      }

      res.json({
        success: true,
        verification: resolved,
        auto_promoted: ['confirmed', 'updated'].includes(status),
        message: status === 'confirmed'
          ? 'Data confirmed and promoted to Gold tier'
          : status === 'updated'
          ? 'Updated data promoted to Gold tier'
          : status === 'rejected'
          ? 'Marked as rejected — logged for enrichment improvement'
          : 'Marked as not found'
      });

    } catch (err) {
      console.error('[verification/resolve] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ──────────────────────────────────────────────────
  // GET /api/ai/verification/stats
  // Enrichment quality scorecard
  // ──────────────────────────────────────────────────
  router.get('/stats', async (req, res) => {
    try {
      const { days = 30 } = req.query;

      // Overall stats
      const overall = await req.pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
          COUNT(*) FILTER (WHERE status = 'updated') as updated,
          COUNT(*) FILTER (WHERE status = 'not_found') as not_found,
          COUNT(*) FILTER (WHERE status = 'expired') as expired,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          ROUND(AVG(resolution_time_seconds) FILTER (WHERE resolved_at IS NOT NULL))::INTEGER as avg_resolution_seconds,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'confirmed') /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('confirmed', 'rejected', 'updated', 'not_found')), 0),
            1
          ) as confirmation_rate_pct
        FROM verification_requests
        WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
      `, [days]);

      // By request type
      const byType = await req.pool.query(`
        SELECT
          request_type,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'confirmed') /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('confirmed', 'rejected', 'updated', 'not_found')), 0),
            1
          ) as confirmation_rate_pct
        FROM verification_requests
        WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
        GROUP BY request_type
        ORDER BY total DESC
      `, [days]);

      // By agent (who requested)
      const byAgent = await req.pool.query(`
        SELECT
          requested_by,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE status = 'confirmed') /
            NULLIF(COUNT(*) FILTER (WHERE status IN ('confirmed', 'rejected', 'updated', 'not_found')), 0),
            1
          ) as confirmation_rate_pct
        FROM verification_requests
        WHERE created_at > NOW() - ($1 || ' days')::INTERVAL
        GROUP BY requested_by
        ORDER BY total DESC
      `, [days]);

      res.json({
        period_days: parseInt(days),
        overall: overall.rows[0],
        by_request_type: byType.rows,
        by_agent: byAgent.rows
      });

    } catch (err) {
      console.error('[verification/stats] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Mount all routes
  app.use('/api/verification', router);
}

module.exports = { mountVerificationRoutes };
