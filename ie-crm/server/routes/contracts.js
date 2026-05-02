/**
 * Contracts Routes — AIR CRE Contract Package Management
 *
 * Packages group multiple AIR CRE forms (e.g., OFA + BBE + AD) linked to a deal.
 * Each form within a package has its own field values and template.
 *
 * Endpoints:
 *   GET    /api/contracts              — List all packages (with form counts)
 *   GET    /api/contracts/templates    — Available form templates
 *   GET    /api/contracts/by-deal/:id  — Packages for a deal
 *   GET    /api/contracts/:pkgId       — Get package + all forms + templates
 *   POST   /api/contracts              — Create new package (with 1+ forms)
 *   POST   /api/contracts/:pkgId/forms — Add a form to existing package
 *   PATCH  /api/contracts/:pkgId/forms/:contractId — Update form field values
 *   DELETE /api/contracts/:pkgId/forms/:contractId — Remove form from package
 *   DELETE /api/contracts/:pkgId       — Delete entire package
 *   GET    /api/contracts/:pkgId/export/pdf   — Export all forms as one PDF
 *   GET    /api/contracts/:pkgId/export/wafpkg — Export as multi-form WAFPKG
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const { autoFillFields } = require('../utils/airFieldMapping');
const { exportWafpkg } = require('../utils/wafpkgExporter');

const PARSED_DIR = path.join(__dirname, '..', '..', 'air-cre-data', 'parsed');

function mountContractRoutes(app, { getPool, requireAuth, denyReadOnly }) {
  const router = express.Router();
  router.use(requireAuth);

  function pool(req, res) {
    const p = getPool();
    if (!p) { res.status(503).json({ error: 'Database not configured' }); return null; }
    return p;
  }

  // Helper: load CRM data for auto-fill (deal + property + contacts)
  async function loadCrmData(p, dealId) {
    const { rows: deals } = await p.query('SELECT * FROM deals WHERE deal_id = $1', [dealId]);
    if (!deals.length) return null;
    const deal = deals[0];

    const { rows: propLinks } = await p.query(`
      SELECT p.* FROM properties p
      JOIN deal_properties dp ON dp.property_id = p.property_id
      WHERE dp.deal_id = $1 LIMIT 1
    `, [dealId]);

    const { rows: contactLinks } = await p.query(`
      SELECT c.* FROM contacts c
      JOIN deal_contacts dc ON dc.contact_id = c.contact_id
      WHERE dc.deal_id = $1
    `, [dealId]);

    return {
      deal,
      property: propLinks[0] || null,
      buyerContact: contactLinks[0] || null,
      sellerContact: contactLinks[1] || null,
    };
  }

  // Tight whitelist for formCode — prevents path traversal via crafted names.
  // Real form codes follow the AIR CRE convention: uppercase letters, digits,
  // hyphens, underscores, dots (no slashes, no spaces, no '..').
  // QA audit 2026-04-15 P2-17.
  const FORM_CODE_RE = /^[A-Z0-9][A-Z0-9._-]{0,64}$/;

  // Helper: create one form within a package, with auto-fill
  async function createForm(p, packageId, dealId, formCode, formOrder, crmData, author) {
    if (typeof formCode !== 'string' || !FORM_CODE_RE.test(formCode)) {
      throw new Error('Invalid form code: ' + formCode);
    }
    const templatePath = path.join(PARSED_DIR, formCode + '.json');
    // Belt-and-suspenders: after path.join, verify the resolved template
    // actually lives inside PARSED_DIR (catches symlink and other edge cases).
    const resolvedParsed = path.resolve(PARSED_DIR);
    const resolvedTemplate = path.resolve(templatePath);
    if (!resolvedTemplate.startsWith(resolvedParsed + path.sep)) {
      throw new Error('Invalid form code: ' + formCode);
    }
    if (!fs.existsSync(templatePath)) throw new Error('Unknown form code: ' + formCode);
    const template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));

    const fieldValues = crmData ? autoFillFields(template.fields, crmData) : {};

    const { rows } = await p.query(`
      INSERT INTO contracts (package_id, deal_id, form_code, template_id, name, field_values, author, form_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [packageId, dealId, formCode, template.templateId, template.name, JSON.stringify(fieldValues), author, formOrder]);

    return { contract: rows[0], autoFilledCount: Object.keys(fieldValues).length };
  }

  // ── GET /api/contracts — List all packages ──
  router.get('/', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const { rows } = await p.query(`
        SELECT cp.*, d.deal_name,
          (SELECT count(*) FROM contracts c WHERE c.package_id = cp.package_id) AS form_count,
          (SELECT array_agg(c.form_code ORDER BY c.form_order) FROM contracts c WHERE c.package_id = cp.package_id) AS form_codes
        FROM contract_packages cp
        LEFT JOIN deals d ON d.deal_id = cp.deal_id
        ORDER BY cp.updated_at DESC
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

  // ── GET /api/contracts/by-deal/:dealId — Packages for a deal ──
  router.get('/by-deal/:dealId', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const { rows } = await p.query(`
        SELECT cp.*, d.deal_name,
          (SELECT array_agg(c.form_code ORDER BY c.form_order) FROM contracts c WHERE c.package_id = cp.package_id) AS form_codes
        FROM contract_packages cp
        LEFT JOIN deals d ON d.deal_id = cp.deal_id
        WHERE cp.deal_id = $1
        ORDER BY cp.created_at DESC
      `, [req.params.dealId]);
      res.json({ rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/contracts/:pkgId — Get package + all forms + templates ──
  router.get('/:pkgId', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const pkgId = parseInt(req.params.pkgId, 10);
      if (isNaN(pkgId)) return res.status(400).json({ error: 'Invalid package ID' });

      const { rows: pkgs } = await p.query(`
        SELECT cp.*, d.deal_name
        FROM contract_packages cp
        LEFT JOIN deals d ON d.deal_id = cp.deal_id
        WHERE cp.package_id = $1
      `, [pkgId]);
      if (!pkgs.length) return res.status(404).json({ error: 'Package not found' });

      // Load all forms in this package
      const { rows: forms } = await p.query(`
        SELECT * FROM contracts WHERE package_id = $1 ORDER BY form_order, contract_id
      `, [pkgId]);

      // Load template for each form
      const formsWithTemplates = forms.map(form => {
        const templatePath = path.join(PARSED_DIR, form.form_code + '.json');
        let template = null;
        if (fs.existsSync(templatePath)) {
          template = JSON.parse(fs.readFileSync(templatePath, 'utf-8'));
        }
        return { ...form, template };
      });

      res.json({ package: pkgs[0], forms: formsWithTemplates });
    } catch (err) {
      console.error('GET /api/contracts/:pkgId error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/contracts — Create new package with 1+ forms ──
  router.post('/', denyReadOnly, async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const { dealId, formCodes, name } = req.body;
      // Support both old (formCode: string) and new (formCodes: string[]) API
      const codes = formCodes || (req.body.formCode ? [req.body.formCode] : []);
      if (!dealId || !codes.length || !name) {
        return res.status(400).json({ error: 'dealId, formCodes (or formCode), and name are required' });
      }

      const author = req.user?.username || req.user?.email || 'david mudge';
      const crmData = await loadCrmData(p, dealId);
      if (!crmData) return res.status(404).json({ error: 'Deal not found' });

      // Create the package
      const { rows: pkgRows } = await p.query(`
        INSERT INTO contract_packages (deal_id, name, author)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [dealId, name, author]);
      const pkg = pkgRows[0];

      // Create each form within the package
      const createdForms = [];
      for (let i = 0; i < codes.length; i++) {
        const result = await createForm(p, pkg.package_id, dealId, codes[i], i, crmData, author);
        createdForms.push(result);
      }

      res.status(201).json({
        package: pkg,
        forms: createdForms.map(f => f.contract),
        autoFilledCounts: createdForms.map(f => f.autoFilledCount),
      });
    } catch (err) {
      console.error('POST /api/contracts error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/contracts/:pkgId/forms — Add a form to existing package ──
  router.post('/:pkgId/forms', denyReadOnly, async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const pkgId = parseInt(req.params.pkgId, 10);
      if (isNaN(pkgId)) return res.status(400).json({ error: 'Invalid package ID' });

      const { formCode } = req.body;
      if (!formCode) return res.status(400).json({ error: 'formCode is required' });

      // Get package info
      const { rows: pkgs } = await p.query('SELECT * FROM contract_packages WHERE package_id = $1', [pkgId]);
      if (!pkgs.length) return res.status(404).json({ error: 'Package not found' });

      // Get current max form_order
      const { rows: maxOrder } = await p.query(
        'SELECT COALESCE(MAX(form_order), -1) + 1 AS next_order FROM contracts WHERE package_id = $1', [pkgId]
      );

      const author = req.user?.username || req.user?.email || 'david mudge';
      const crmData = await loadCrmData(p, pkgs[0].deal_id);
      const result = await createForm(p, pkgId, pkgs[0].deal_id, formCode, maxOrder[0].next_order, crmData, author);

      // Touch package updated_at
      await p.query('UPDATE contract_packages SET updated_at = NOW() WHERE package_id = $1', [pkgId]);

      res.status(201).json(result);
    } catch (err) {
      console.error('POST /api/contracts/:pkgId/forms error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/contracts/:pkgId/forms/:contractId — Update form field values ──
  router.patch('/:pkgId/forms/:contractId', denyReadOnly, async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const contractId = parseInt(req.params.contractId, 10);
      if (isNaN(contractId)) return res.status(400).json({ error: 'Invalid contract ID' });

      const { fieldValues, name, notes } = req.body;
      const updates = [];
      const params = [];
      let idx = 1;

      if (fieldValues) {
        updates.push(`field_values = field_values || $${idx}::jsonb`);
        params.push(JSON.stringify(fieldValues));
        idx++;
      }
      if (name !== undefined) { updates.push(`name = $${idx}`); params.push(name); idx++; }
      if (notes !== undefined) { updates.push(`notes = $${idx}`); params.push(notes); idx++; }

      if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

      params.push(contractId);
      const { rows } = await p.query(
        `UPDATE contracts SET ${updates.join(', ')} WHERE contract_id = $${idx} RETURNING *`,
        params
      );
      if (!rows.length) return res.status(404).json({ error: 'Form not found' });

      // Touch package updated_at
      if (rows[0].package_id) {
        await p.query('UPDATE contract_packages SET updated_at = NOW() WHERE package_id = $1', [rows[0].package_id]);
      }

      res.json({ contract: rows[0] });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/contracts/:pkgId/forms/:contractId — Remove form from package ──
  router.delete('/:pkgId/forms/:contractId', denyReadOnly, async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const contractId = parseInt(req.params.contractId, 10);
      if (isNaN(contractId)) return res.status(400).json({ error: 'Invalid contract ID' });

      const { rowCount } = await p.query('DELETE FROM contracts WHERE contract_id = $1', [contractId]);
      if (rowCount === 0) return res.status(404).json({ error: 'Form not found' });

      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── DELETE /api/contracts/:pkgId — Delete entire package ──
  router.delete('/:pkgId', denyReadOnly, async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const pkgId = parseInt(req.params.pkgId, 10);
      if (isNaN(pkgId)) return res.status(400).json({ error: 'Invalid package ID' });

      // CASCADE deletes forms too
      const { rowCount } = await p.query('DELETE FROM contract_packages WHERE package_id = $1', [pkgId]);
      if (rowCount === 0) return res.status(404).json({ error: 'Package not found' });

      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/contracts/:pkgId/export/wafpkg — Export as multi-form WAFPKG ──
  router.get('/:pkgId/export/wafpkg', async (req, res) => {
    const p = pool(req, res); if (!p) return;
    try {
      const pkgId = parseInt(req.params.pkgId, 10);
      if (isNaN(pkgId)) return res.status(400).json({ error: 'Invalid package ID' });

      const { rows: pkgs } = await p.query('SELECT * FROM contract_packages WHERE package_id = $1', [pkgId]);
      if (!pkgs.length) return res.status(404).json({ error: 'Package not found' });

      const { rows: forms } = await p.query(
        'SELECT * FROM contracts WHERE package_id = $1 ORDER BY form_order', [pkgId]
      );

      const encrypted = req.query.encrypt !== 'false';
      const buffer = exportWafpkg(pkgs[0], forms, encrypted);

      const filename = (pkgs[0].name || 'package').replace(/[^a-zA-Z0-9 _-]/g, '') + '.wafpkg';
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      console.error('WAFPKG export error:', err.message);
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/api/contracts', router);
}

module.exports = { mountContractRoutes };
