/**
 * Contracts Routes — AIR CRE Contract Management
 *
 * CRUD + auto-fill + export for AIR CRE contract packages.
 * All contracts are linked to deals and store field values as JSONB.
 *
 * Endpoints:
 *   GET    /api/contracts              — List all contracts
 *   GET    /api/contracts/:id          — Get single contract
 *   GET    /api/contracts/by-deal/:id  — Contracts for a deal
 *   GET    /api/contracts/templates    — Available form templates
 *   POST   /api/contracts              — Create new contract
 *   PATCH  /api/contracts/:id          — Update field values
 *   PATCH  /api/contracts/:id/finalize — Finalize contract
 *   DELETE /api/contracts/:id          — Delete draft contract
 *   GET    /api/contracts/:id/export/wafpkg — Export as WAFPKG
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { autoFillFields } = require('../utils/airFieldMapping');
const { exportWafpkg } = require('../utils/wafpkgExporter');

const PARSED_DIR = path.join(__dirname, '..', '..', 'air-cre-data', 'parsed');

function mountContractRoutes(app, { getPool, requireAuth }) {
  const router = express.Router();
  router.use(requireAuth);

  // Helper: get pool or 503
  function pool(req, res) {
    const p = getPool();
    if (!p) { res.status(503).json({ error: 'Database not configured' }); return null; }
    return p;
  }

  // ── GET /api/contracts — List all ──
  router.get('/', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const { rows } = await p.query(`
        SELECT c.*, d.deal_name
        FROM contracts c
        LEFT JOIN deals d ON d.deal_id = c.deal_id
        ORDER BY c.updated_at DESC
      `);
      res.json({ rows });
    } catch (err) {
      console.error('GET /api/contracts error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/contracts/templates — Available form templates ──
  router.get('/templates', (req, res) => {
    try {
      const indexPath = path.join(PARSED_DIR, 'index.json');
      if (!fs.existsSync(indexPath)) {
        return res.status(404).json({ error: 'Templates not parsed. Run scripts/parse-air-templates.js' });
      }
      const catalog = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      res.json({ templates: catalog });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/contracts/by-deal/:dealId — Contracts for a deal ──
  router.get('/by-deal/:dealId', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const dealId = req.params.dealId;
      if (!dealId) return res.status(400).json({ error: 'Invalid deal ID' });

      const { rows } = await p.query(`
        SELECT contract_id, form_code, name, status, created_at, updated_at
        FROM contracts
        WHERE deal_id = $1
        ORDER BY created_at DESC
      `, [dealId]);
      res.json({ rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/contracts/:id — Single contract ──
  router.get('/:id', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid contract ID' });

      const { rows } = await p.query(`
        SELECT c.*, d.deal_name
        FROM contracts c
        LEFT JOIN deals d ON d.deal_id = c.deal_id
        WHERE c.contract_id = $1
      `, [id]);

      if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });

      // Load template fields for the editor
      const templatePath = path.join(PARSED_DIR, rows[0].form_code + '.json');
      let template = null;
      if (fs.existsSync(templatePath)) {
        template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
      }

      res.json({ contract: rows[0], template });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/contracts — Create new contract ──
  router.post('/', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const { dealId, formCode, name } = req.body;
      if (!dealId || !formCode || !name) {
        return res.status(400).json({ error: 'dealId, formCode, and name are required' });
      }

      // Load template
      const templatePath = path.join(PARSED_DIR, formCode + '.json');
      if (!fs.existsSync(templatePath)) {
        return res.status(404).json({ error: 'Unknown form code: ' + formCode });
      }
      const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));

      // Load deal + linked records for auto-fill
      const { rows: deals } = await p.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
      if (deals.length === 0) return res.status(404).json({ error: 'Deal not found' });
      const deal = deals[0];

      // Get linked property (first one)
      const { rows: propLinks } = await p.query(`
        SELECT p.* FROM properties p
        JOIN deal_properties dp ON dp.property_id = p.property_id
        WHERE dp.deal_id = $1
        LIMIT 1
      `, [dealId]);
      const property = propLinks[0] || null;

      // Get linked contacts (deal_contacts has no role column)
      const { rows: contactLinks } = await p.query(`
        SELECT c.* FROM contacts c
        JOIN deal_contacts dc ON dc.contact_id = c.contact_id
        WHERE dc.deal_id = $1
      `, [dealId]);

      // Determine buyer/seller: first contact as buyer, second as seller
      let buyerContact = contactLinks.length > 0 ? contactLinks[0] : null;
      let sellerContact = contactLinks.length > 1 ? contactLinks[1] : null;

      // full_name already exists on contacts table — no need to build it

      // Auto-fill fields from CRM data
      const fieldValues = autoFillFields(template.fields, {
        deal, property, buyerContact, sellerContact,
      });

      const author = req.user?.username || req.user?.email || 'david mudge';

      const { rows: inserted } = await p.query(`
        INSERT INTO contracts (deal_id, form_code, template_id, name, field_values, author)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [dealId, formCode, template.templateId, name, JSON.stringify(fieldValues), author]);

      res.status(201).json({ contract: inserted[0], autoFilledCount: Object.keys(fieldValues).length });
    } catch (err) {
      console.error('POST /api/contracts error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/contracts/:id — Update field values ──
  router.patch('/:id', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid contract ID' });

      // Check contract exists and is draft
      const { rows: existing } = await p.query(
        'SELECT status FROM contracts WHERE contract_id = $1', [id]
      );
      if (existing.length === 0) return res.status(404).json({ error: 'Contract not found' });
      if (existing[0].status === 'Final') {
        return res.status(403).json({ error: 'Cannot edit a finalized contract' });
      }

      const { fieldValues, name, notes } = req.body;
      const updates = [];
      const params = [];
      let idx = 1;

      if (fieldValues) {
        // Merge new field values into existing JSONB
        updates.push(`field_values = field_values || $${idx}::jsonb`);
        params.push(JSON.stringify(fieldValues));
        idx++;
      }
      if (name !== undefined) {
        updates.push(`name = $${idx}`);
        params.push(name);
        idx++;
      }
      if (notes !== undefined) {
        updates.push(`notes = $${idx}`);
        params.push(notes);
        idx++;
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      params.push(id);
      const { rows } = await p.query(
        `UPDATE contracts SET ${updates.join(', ')} WHERE contract_id = $${idx} RETURNING *`,
        params
      );

      res.json({ contract: rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/contracts/:id/finalize — Set status to Final ──
  router.patch('/:id/finalize', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid contract ID' });

      const { rows } = await p.query(
        `UPDATE contracts SET status = 'Final' WHERE contract_id = $1 AND status = 'Draft' RETURNING *`,
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Contract not found or already finalized' });
      }
      res.json({ contract: rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/contracts/:id — Delete draft contract ──
  router.delete('/:id', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid contract ID' });

      const { rowCount } = await p.query(
        `DELETE FROM contracts WHERE contract_id = $1 AND status = 'Draft'`,
        [id]
      );
      if (rowCount === 0) {
        return res.status(404).json({ error: 'Contract not found or is finalized (cannot delete)' });
      }
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/contracts/:id/export/wafpkg — Export as WAFPKG ──
  router.get('/:id/export/wafpkg', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) return res.status(400).json({ error: 'Invalid contract ID' });

      const { rows } = await p.query('SELECT * FROM contracts WHERE contract_id = $1', [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Contract not found' });

      const contract = rows[0];
      const encrypted = req.query.encrypt !== 'false'; // default: encrypted
      const buffer = exportWafpkg(contract, encrypted);

      const filename = (contract.name || 'contract').replace(/[^a-zA-Z0-9 _-]/g, '') + '.wafpkg';
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      console.error('WAFPKG export error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // Mount under /api/contracts
  app.use('/api/contracts', router);
}

module.exports = { mountContractRoutes };
