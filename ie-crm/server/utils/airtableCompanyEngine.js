// Airtable Companies Import Engine — reusable fan-out engine.
// One CSV row → companies + properties + contacts + interactions + junctions.
// Used by: migration script, agent API endpoint, CRM import UI.

const { normalizeAddress, normalizeCompanyName, normalizeContactName, similarity } = require('./addressNormalizer');
const { parseNotes } = require('./airtablePropertyParser');

// ============================================================
// CACHE MANAGEMENT
// ============================================================

async function loadCaches(client) {
  const companyCache = new Map();    // "normalizedName" → { company_id, company_name, ... }
  const propertyCache = new Map();   // "normalizedAddr|city" → { property_id, property_address, city }
  const contactCache = new Map();    // "normalizedName" → [{ contact_id, full_name }, ...]

  // Load companies with enrichable fields
  const { rows: companies } = await client.query(
    `SELECT company_id, company_name, website, company_type, industry_type,
            tenant_sic, employees, sf, suite, lease_exp, lease_months_left,
            city, move_in_date, company_hq, overflow
     FROM companies`
  );
  for (const c of companies) {
    const norm = normalizeCompanyName(c.company_name);
    if (norm) companyCache.set(norm, c);
  }

  // Load properties with normalized_address for fuzzy matching
  const { rows: props } = await client.query(
    `SELECT property_id, property_address, normalized_address, city FROM properties`
  );
  for (const p of props) {
    const norm = p.normalized_address || normalizeAddress(p.property_address) || '';
    const city = (p.city || '').toLowerCase().trim();
    propertyCache.set(`${norm}|${city}`, p);
  }

  // Load contacts
  const { rows: contacts } = await client.query(
    `SELECT contact_id, full_name FROM contacts`
  );
  for (const c of contacts) {
    const norm = normalizeContactName(c.full_name);
    if (norm) {
      if (!contactCache.has(norm)) contactCache.set(norm, []);
      contactCache.get(norm).push(c);
    }
  }

  return { companyCache, propertyCache, contactCache };
}

// ============================================================
// MATCHING
// ============================================================

function findCompany(name, caches, fuzzyLog, rowNum) {
  const norm = normalizeCompanyName(name);
  if (!norm) return null;

  // Tier 1: exact normalized match
  if (caches.companyCache.has(norm)) return caches.companyCache.get(norm);

  // Tier 2/3: fuzzy
  let bestMatch = null, bestSim = 0;
  for (const [cachedNorm, company] of caches.companyCache.entries()) {
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) { bestSim = sim; bestMatch = company; }
  }

  if (bestSim >= 0.90) {
    fuzzyLog.push({ type: 'company', original: name, matchedTo: bestMatch.company_name, similarity: bestSim, rowNum });
    return bestMatch;
  }
  if (bestSim >= 0.85) {
    fuzzyLog.push({ type: 'company', original: name, matchedTo: bestMatch.company_name, similarity: bestSim, rowNum, review: true });
    return bestMatch;
  }
  return null;
}

function findProperty(addressStr, caches, fuzzyLog, rowNum) {
  const norm = normalizeAddress(addressStr);
  if (!norm) return null;

  // Exact match across all cities
  for (const [cachedKey, prop] of caches.propertyCache.entries()) {
    const [cachedNorm] = cachedKey.split('|');
    if (cachedNorm === norm) return prop;
  }

  // Fuzzy match
  let bestMatch = null, bestSim = 0;
  for (const [cachedKey, prop] of caches.propertyCache.entries()) {
    const [cachedNorm] = cachedKey.split('|');
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) { bestSim = sim; bestMatch = prop; }
  }

  if (bestSim >= 0.95) {
    fuzzyLog.push({ type: 'property', original: addressStr, matchedTo: bestMatch.property_address, similarity: bestSim, rowNum });
    return bestMatch;
  }
  if (bestSim >= 0.90) {
    fuzzyLog.push({ type: 'property', original: addressStr, matchedTo: bestMatch.property_address, similarity: bestSim, rowNum, review: true });
    return bestMatch;
  }
  return null;
}

function findContact(name, caches, fuzzyLog, rowNum) {
  const norm = normalizeContactName(name);
  if (!norm) return null;

  // Tier 1: exact normalized match
  const exact = caches.contactCache.get(norm) || [];
  if (exact.length >= 1) return exact[0];

  // Tier 2/3: fuzzy
  let bestMatch = null, bestSim = 0;
  for (const [cachedNorm, arr] of caches.contactCache.entries()) {
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) { bestSim = sim; bestMatch = arr[0]; }
  }

  if (bestSim >= 0.90) {
    fuzzyLog.push({ type: 'contact', original: name, matchedTo: bestMatch.full_name, similarity: bestSim, rowNum });
    return bestMatch;
  }
  if (bestSim >= 0.85) {
    fuzzyLog.push({ type: 'contact', original: name, matchedTo: bestMatch.full_name, similarity: bestSim, rowNum, review: true });
    return bestMatch;
  }
  return null;
}

// ============================================================
// COMPANY FIELD MAP — canonical row key → DB column
// ============================================================

const COMPANY_ENRICH_FIELDS = {
  website: 'website',
  companyType: 'company_type',
  industryType: 'industry_type',
  sicCode: 'tenant_sic',
  employees: 'employees',
  sf: 'sf',
  suite: 'suite',
  leaseExp: 'lease_exp',
  leaseMonthsLeft: 'lease_months_left',
  city: 'city',
  moveInDate: 'move_in_date',
};

// ============================================================
// FAN-OUT — process a single row
// ============================================================

async function processRow(row, rowNum, client, caches, report, dryRun) {
  if (!row.companyName) {
    report.warnings.push({ rowNum, message: 'Skipped — no Company Name' });
    return;
  }

  // 1. COMPANY — find or create, enrich-only
  let existing = findCompany(row.companyName, caches, report.fuzzyMatches, rowNum);
  let companyId;

  if (existing) {
    companyId = existing.company_id;
    report.companies.matched++;

    // Enrich — fill blank fields only
    const updates = [];
    const vals = [];
    let idx = 1;

    for (const [rowKey, dbCol] of Object.entries(COMPANY_ENRICH_FIELDS)) {
      if (row[rowKey] != null && existing[dbCol] == null) {
        updates.push(`${dbCol} = $${idx++}`);
        vals.push(row[rowKey]);
      }
    }

    // Handle company_hq from overflow
    if (row.overflow && row.overflow.company_hq && !existing.company_hq) {
      updates.push(`company_hq = $${idx++}`);
      vals.push(row.overflow.company_hq);
    }

    // Merge overflow into existing overflow JSONB
    if (row.overflow) {
      const existingOverflow = existing.overflow
        ? (typeof existing.overflow === 'string' ? JSON.parse(existing.overflow) : existing.overflow)
        : {};
      let hasNewOverflow = false;
      const merged = { ...existingOverflow };
      for (const [k, v] of Object.entries(row.overflow)) {
        if (k === 'company_hq') continue; // handled above as direct column
        if (!existingOverflow[k]) {
          merged[k] = v;
          hasNewOverflow = true;
        }
      }
      if (hasNewOverflow) {
        updates.push(`overflow = $${idx++}`);
        vals.push(JSON.stringify(merged));
      }
    }

    if (updates.length > 0) {
      if (!dryRun) {
        vals.push(companyId);
        await client.query(
          `UPDATE companies SET ${updates.join(', ')} WHERE company_id = $${idx}`,
          vals
        );
        // Update cache
        for (const [rowKey, dbCol] of Object.entries(COMPANY_ENRICH_FIELDS)) {
          if (row[rowKey] != null && existing[dbCol] == null) {
            existing[dbCol] = row[rowKey];
          }
        }
      }
      report.companies.enriched++;
    }
  } else {
    // Create new company
    const insertCols = ['company_name'];
    const insertVals = [row.companyName];

    for (const [rowKey, dbCol] of Object.entries(COMPANY_ENRICH_FIELDS)) {
      if (row[rowKey] != null) {
        insertCols.push(dbCol);
        insertVals.push(row[rowKey]);
      }
    }

    if (row.overflow && row.overflow.company_hq) {
      insertCols.push('company_hq');
      insertVals.push(row.overflow.company_hq);
    }

    if (row.overflow) {
      const overflowOnly = { ...row.overflow };
      delete overflowOnly.company_hq;
      if (Object.keys(overflowOnly).length > 0) {
        insertCols.push('overflow');
        insertVals.push(JSON.stringify(overflowOnly));
      }
    }

    if (!dryRun) {
      const placeholders = insertVals.map((_, i) => `$${i + 1}`);
      const { rows } = await client.query(
        `INSERT INTO companies (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING company_id`,
        insertVals
      );
      companyId = rows[0].company_id;

      // Add to cache
      const norm = normalizeCompanyName(row.companyName);
      if (norm) {
        const cacheEntry = { company_id: companyId, company_name: row.companyName };
        for (const [rowKey, dbCol] of Object.entries(COMPANY_ENRICH_FIELDS)) {
          if (row[rowKey] != null) cacheEntry[dbCol] = row[rowKey];
        }
        caches.companyCache.set(norm, cacheEntry);
      }
    }
    report.companies.created++;
  }

  if (!companyId && !dryRun) return;

  // 2. TENANT PROPERTIES — fuzzy match addresses → property_companies with role='tenant'
  for (const addrStr of row.tenantProperties || []) {
    const prop = findProperty(addrStr, caches, report.fuzzyMatches, rowNum);
    if (prop && !dryRun) {
      await upsertJunction(client, 'property_companies', {
        property_id: prop.property_id, company_id: companyId, role: 'tenant'
      }, report);
      report.properties.tenantLinked++;
    } else if (!prop) {
      report.warnings.push({ rowNum, message: `Tenant property not found: "${addrStr}"` });
    } else {
      report.properties.tenantLinked++;
    }
  }

  // 3. OWNER PROPERTIES — fuzzy match addresses → property_companies with role='owner'
  for (const addrStr of row.ownerProperties || []) {
    const prop = findProperty(addrStr, caches, report.fuzzyMatches, rowNum);
    if (prop && !dryRun) {
      await upsertJunction(client, 'property_companies', {
        property_id: prop.property_id, company_id: companyId, role: 'owner'
      }, report);
      report.properties.ownerLinked++;
    } else if (!prop) {
      report.warnings.push({ rowNum, message: `Owner property not found: "${addrStr}"` });
    } else {
      report.properties.ownerLinked++;
    }
  }

  // 4. CONTACTS — fuzzy match names → contact_companies junction
  for (const contactName of row.contacts || []) {
    const contact = findContact(contactName, caches, report.fuzzyMatches, rowNum);
    if (contact && !dryRun) {
      await upsertJunction(client, 'contact_companies', {
        contact_id: contact.contact_id, company_id: companyId
      }, report);
      report.contacts.linked++;
    } else if (!contact) {
      report.warnings.push({ rowNum, message: `Contact not found: "${contactName}"` });
    } else {
      report.contacts.linked++;
    }
  }

  // 5. NOTES → interactions table linked to company
  if (row.notes && companyId) {
    const entries = parseNotes(row.notes);
    for (const entry of entries) {
      if (!entry.text) continue;

      if (!dryRun) {
        // Dedup: check if interaction with same notes text exists for this company
        const { rows: existingInt } = await client.query(
          `SELECT i.interaction_id FROM interactions i
           JOIN interaction_companies ic ON i.interaction_id = ic.interaction_id
           WHERE ic.company_id = $1 AND i.notes = $2`,
          [companyId, entry.text]
        );
        if (existingInt.length > 0) continue;

        const { rows: [inserted] } = await client.query(
          `INSERT INTO interactions (type, subject, date, notes, lead_source)
           VALUES ('note', 'Airtable Company Import Note', $1, $2, 'airtable_company_import')
           RETURNING interaction_id`,
          [entry.date || new Date().toISOString().split('T')[0], entry.text]
        );
        await upsertJunction(client, 'interaction_companies', {
          interaction_id: inserted.interaction_id, company_id: companyId
        }, report);
        report.interactions.created++;
      } else {
        report.interactions.created++;
      }
    }
  }

  // 6. INTERACTIONS field → interactions table (only 1 row has this)
  if (row.interactions && companyId) {
    const entries = parseNotes(row.interactions);
    for (const entry of entries) {
      if (!entry.text) continue;

      if (!dryRun) {
        const { rows: existingInt } = await client.query(
          `SELECT i.interaction_id FROM interactions i
           JOIN interaction_companies ic ON i.interaction_id = ic.interaction_id
           WHERE ic.company_id = $1 AND i.notes = $2`,
          [companyId, entry.text]
        );
        if (existingInt.length > 0) continue;

        const { rows: [inserted] } = await client.query(
          `INSERT INTO interactions (type, subject, date, notes, lead_source)
           VALUES ('interaction', 'Airtable Company Import Interaction', $1, $2, 'airtable_company_import')
           RETURNING interaction_id`,
          [entry.date || new Date().toISOString().split('T')[0], entry.text]
        );
        await upsertJunction(client, 'interaction_companies', {
          interaction_id: inserted.interaction_id, company_id: companyId
        }, report);
        report.interactions.created++;
      } else {
        report.interactions.created++;
      }
    }
  }

  // 7. DEALS — log only (3 rows), store in overflow if present
  if (row.deals && row.deals.length > 0) {
    report.warnings.push({ rowNum, message: `Jr Deals logged: ${row.deals.join(', ')}` });
  }
}

// ============================================================
// HELPERS
// ============================================================

async function upsertJunction(client, table, data, report) {
  const cols = Object.keys(data);
  const vals = Object.values(data);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  try {
    await client.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`,
      vals
    );
    report.junctions.created++;
  } catch (err) {
    if (err.code === '23505' || err.code === '23503') {
      report.junctions.skipped++;
    } else {
      throw err;
    }
  }
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function processAirtableCompanies(rows, pool, options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();

  const report = {
    companies: { created: 0, matched: 0, enriched: 0 },
    properties: { tenantLinked: 0, ownerLinked: 0 },
    contacts: { linked: 0 },
    interactions: { created: 0 },
    junctions: { created: 0, skipped: 0 },
    fuzzyMatches: [],
    warnings: [],
    errors: [],
  };

  const BATCH_SIZE = 100;

  try {
    console.log(`[company-engine] Loading caches from database...`);
    const caches = await loadCaches(client);
    console.log(`[company-engine] Loaded ${caches.companyCache.size} companies, ${caches.propertyCache.size} properties, ${caches.contactCache.size} contacts`);

    // Process in committed batches so progress survives crashes
    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);

      if (!dryRun) await client.query('BEGIN');

      for (let i = batchStart; i < batchEnd; i++) {
        try {
          if (!dryRun) await client.query(`SAVEPOINT row_${i}`);
          await processRow(rows[i], i, client, caches, report, dryRun);
          if (!dryRun) await client.query(`RELEASE SAVEPOINT row_${i}`);
        } catch (err) {
          if (!dryRun) await client.query(`ROLLBACK TO SAVEPOINT row_${i}`);
          report.errors.push({ rowNum: i, companyName: rows[i].companyName, message: err.message });
        }
      }

      if (!dryRun) await client.query('COMMIT');
      console.log(`[company-engine] Committed batch ${batchStart + 1}-${batchEnd}/${rows.length} (${Math.round(batchEnd / rows.length * 100)}%)`);
    }

    return report;
  } catch (err) {
    if (!dryRun) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  processAirtableCompanies,
  loadCaches,
  findCompany,
  findProperty,
  findContact,
};
