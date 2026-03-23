// Lease Comp Engine — reusable fan-out engine for CoStar lease comp data.
// One row → properties + companies + contacts + lease_comps + junctions.
// Used by: migration script, agent API endpoint, CRM import UI.

const { normalizeAddress, normalizeCompanyName, normalizeContactName, similarity } = require('./addressNormalizer');

// ============================================================
// CACHE MANAGEMENT
// ============================================================

async function loadCaches(client) {
  const propertyCache = new Map();   // "normalizedAddr|city" → { property_id, ... }
  const companyCache = new Map();    // "normalizedName" → { company_id, ... }
  const contactCache = new Map();    // "normalizedName" → [{ contact_id, ... }, ...]
  const compDedupCache = new Set();  // "property_id|tenant|commence|sf"

  // Load properties
  const { rows: props } = await client.query(
    `SELECT property_id, property_address, normalized_address, property_name,
            property_type, rba, last_sale_date, city, state, zip
     FROM properties`
  );
  for (const p of props) {
    const norm = p.normalized_address || normalizeAddress(p.property_address) || '';
    const city = (p.city || '').toLowerCase().trim();
    const key = `${norm}|${city}`;
    propertyCache.set(key, p);
  }

  // Load companies
  const { rows: companies } = await client.query(
    `SELECT company_id, company_name, company_type, city, lease_exp FROM companies`
  );
  for (const c of companies) {
    const norm = normalizeCompanyName(c.company_name);
    if (norm) companyCache.set(norm, c);
  }

  // Load contacts with their company links (for brokerage disambiguation)
  const { rows: contacts } = await client.query(
    `SELECT c.contact_id, c.full_name, array_agg(cc.company_id) FILTER (WHERE cc.company_id IS NOT NULL) AS company_ids
     FROM contacts c LEFT JOIN contact_companies cc ON c.contact_id = cc.contact_id
     GROUP BY c.contact_id, c.full_name`
  );
  for (const c of contacts) {
    c._companyIds = new Set((c.company_ids || []).map(String));
    const norm = normalizeContactName(c.full_name);
    if (norm) {
      if (!contactCache.has(norm)) contactCache.set(norm, []);
      contactCache.get(norm).push(c);
    }
  }

  // Load existing lease comps for dedup
  const { rows: comps } = await client.query(
    `SELECT id, property_id, tenant_name, commencement_date, sf FROM lease_comps`
  );
  for (const c of comps) {
    const key = dedupKey(c.property_id, c.tenant_name, c.commencement_date, c.sf);
    compDedupCache.add(key);
  }

  return { propertyCache, companyCache, contactCache, compDedupCache, allProps: props, allCompanies: companies, allContacts: contacts };
}

function dedupKey(propertyId, tenantName, commencementDate, sf) {
  const t = (tenantName || '').toLowerCase().trim();
  const d = commencementDate ? String(commencementDate).split('T')[0] : '';
  const s = sf != null ? String(sf) : '';
  return `${propertyId || ''}|${t}|${d}|${s}`;
}

// ============================================================
// MATCHING
// ============================================================

function findProperty(row, caches, fuzzyLog, rowNum) {
  const norm = normalizeAddress(row.address);
  if (!norm) return null;
  const city = (row.city || '').toLowerCase().trim();
  const key = `${norm}|${city}`;

  // Tier 1: exact
  if (caches.propertyCache.has(key)) {
    return caches.propertyCache.get(key);
  }

  // Tier 2/3: fuzzy — scan all properties
  let bestMatch = null;
  let bestSim = 0;
  for (const [cachedKey, prop] of caches.propertyCache.entries()) {
    const [cachedNorm, cachedCity] = cachedKey.split('|');
    if (cachedCity !== city) continue;
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = prop;
    }
  }

  if (bestSim >= 0.95) {
    fuzzyLog.push({ type: 'property', original: row.address, matchedTo: bestMatch.property_address, similarity: bestSim, rowNum });
    return bestMatch;
  }
  // 90-94%: log for review but still match (typos, abbreviation differences)
  if (bestSim >= 0.90) {
    fuzzyLog.push({ type: 'property', original: row.address, matchedTo: bestMatch.property_address, similarity: bestSim, rowNum, review: true });
    return bestMatch;
  }
  // Below 90%: too risky — different street numbers match at 80-89%, create new instead

  return null; // will create new
}

function findCompany(name, caches, fuzzyLog, rowNum) {
  const norm = normalizeCompanyName(name);
  if (!norm) return null;

  // Exact
  if (caches.companyCache.has(norm)) {
    return caches.companyCache.get(norm);
  }

  // Fuzzy
  let bestMatch = null;
  let bestSim = 0;
  for (const [cachedNorm, company] of caches.companyCache.entries()) {
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = company;
    }
  }

  if (bestSim >= 0.90) {
    fuzzyLog.push({ type: 'company', original: name, matchedTo: bestMatch.company_name, similarity: bestSim, rowNum });
    return bestMatch;
  }

  return null; // will create new
}

function findContact(name, caches, fuzzyLog, rowNum, brokerageCompanyId) {
  const norm = normalizeContactName(name);
  if (!norm) return null;

  // Exact — may have multiple contacts with same normalized name
  const exactMatches = caches.contactCache.get(norm) || [];

  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1 && brokerageCompanyId) {
    // Disambiguate by brokerage — prefer contact already linked to this company
    const linked = exactMatches.find(c => c._companyIds && c._companyIds.has(String(brokerageCompanyId)));
    if (linked) return linked;
  }
  if (exactMatches.length > 0) return exactMatches[0]; // fallback to first

  // Fuzzy
  let bestMatch = null;
  let bestSim = 0;
  for (const [cachedNorm, contactArr] of caches.contactCache.entries()) {
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = contactArr[0]; // take first from the array
    }
  }

  if (bestSim >= 0.85) {
    fuzzyLog.push({ type: 'contact', original: name, matchedTo: bestMatch.full_name, similarity: bestSim, rowNum });
    return bestMatch;
  }

  return null; // will create new
}

// ============================================================
// FAN-OUT — process a single row
// ============================================================

async function processRow(row, rowNum, client, caches, report, dryRun) {
  // 1. PROPERTY — find or create
  let property = findProperty(row, caches, report.fuzzyMatches, rowNum);
  let propertyId;

  if (property) {
    propertyId = property.property_id;
    // Enrich only — fill blanks
    const updates = [];
    const vals = [];
    let idx = 1;
    if (!property.property_name && row.propertyName) { updates.push(`property_name = $${idx++}`); vals.push(row.propertyName); }
    if (!property.property_type && row.propertyType) { updates.push(`property_type = $${idx++}`); vals.push(row.propertyType); }
    if (!property.rba && row.rba) { updates.push(`rba = $${idx++}`); vals.push(row.rba); }
    if (!property.last_sale_date && row.lastSaleDate) { updates.push(`last_sale_date = $${idx++}`); vals.push(row.lastSaleDate); }

    if (updates.length > 0 && !dryRun) {
      vals.push(propertyId);
      await client.query(
        `UPDATE properties SET ${updates.join(', ')} WHERE property_id = $${idx}`,
        vals
      );
      if (!property.property_name && row.propertyName) property.property_name = row.propertyName;
      if (!property.property_type && row.propertyType) property.property_type = row.propertyType;
      if (!property.rba && row.rba) property.rba = row.rba;
      if (!property.last_sale_date && row.lastSaleDate) property.last_sale_date = row.lastSaleDate;
      report.properties.enriched++;
    } else if (updates.length > 0) {
      report.properties.enriched++;
    }
    report.properties.matched++;
  } else if (row.address) {
    // Create new property
    if (!dryRun) {
      const { rows } = await client.query(
        `INSERT INTO properties (property_address, city, state, property_name, property_type, rba, last_sale_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING property_id`,
        [row.address, row.city, row.state, row.propertyName, row.propertyType, row.rba, row.lastSaleDate]
      );
      propertyId = rows[0].property_id;
      const norm = normalizeAddress(row.address);
      const city = (row.city || '').toLowerCase().trim();
      const cacheEntry = { property_id: propertyId, property_address: row.address, normalized_address: norm, city: row.city, state: row.state, property_name: row.propertyName, property_type: row.propertyType, rba: row.rba, last_sale_date: row.lastSaleDate };
      caches.propertyCache.set(`${norm}|${city}`, cacheEntry);
    }
    report.properties.created++;
  }

  if (!propertyId && !dryRun) return; // can't proceed without property in live mode

  // 2. TENANT COMPANY — find or create
  let tenantCompanyId = null;
  if (row.tenantName) {
    const existing = findCompany(row.tenantName, caches, report.fuzzyMatches, rowNum);
    if (existing) {
      tenantCompanyId = existing.company_id;
      report.companies.matched++;
      // Enrich lease_exp if newer
      if (row.expirationDate && !dryRun) {
        const existingExp = existing.lease_exp ? new Date(existing.lease_exp) : null;
        const newExp = new Date(row.expirationDate);
        if (!existingExp || newExp > existingExp) {
          await client.query(`UPDATE companies SET lease_exp = $1 WHERE company_id = $2`, [row.expirationDate, tenantCompanyId]);
          existing.lease_exp = row.expirationDate;
        }
      }
    } else {
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO companies (company_name, company_type, lease_exp) VALUES ($1, 'tenant', $2) RETURNING company_id`,
          [row.tenantName, row.expirationDate]
        );
        tenantCompanyId = rows[0].company_id;
        const norm = normalizeCompanyName(row.tenantName);
        if (norm) caches.companyCache.set(norm, { company_id: tenantCompanyId, company_name: row.tenantName, company_type: 'tenant', lease_exp: row.expirationDate });
      }
      report.companies.created++;
    }
  }

  // 3. BROKER COMPANIES — find or create
  const brokerCompanyIds = { tenantRep: [], landlordRep: [] };

  for (const name of row.tenantRepCompanies || []) {
    const id = await findOrCreateCompany(name, 'brokerage', client, caches, report, dryRun, rowNum);
    if (id) brokerCompanyIds.tenantRep.push(id);
  }
  for (const name of row.landlordRepCompanies || []) {
    const id = await findOrCreateCompany(name, 'brokerage', client, caches, report, dryRun, rowNum);
    if (id) brokerCompanyIds.landlordRep.push(id);
  }

  // 4. BROKER CONTACTS — find or create, link to company
  const brokerContactIds = { tenantRep: [], landlordRep: [] };

  for (let i = 0; i < (row.tenantRepAgents || []).length; i++) {
    const agent = row.tenantRepAgents[i];
    const companyId = brokerCompanyIds.tenantRep[0] || null;
    const id = await findOrCreateContact(agent.cleaned, companyId, client, caches, report, dryRun, rowNum);
    if (id) brokerContactIds.tenantRep.push(id);
  }
  for (let i = 0; i < (row.landlordRepAgents || []).length; i++) {
    const agent = row.landlordRepAgents[i];
    const companyId = brokerCompanyIds.landlordRep[0] || null;
    const id = await findOrCreateContact(agent.cleaned, companyId, client, caches, report, dryRun, rowNum);
    if (id) brokerContactIds.landlordRep.push(id);
  }

  // 5. LEASE_COMP — insert if no duplicate
  const dk = dedupKey(propertyId, row.tenantName, row.commencementDate, row.sf);
  if (caches.compDedupCache.has(dk)) {
    report.skipped.push({ rowNum, reason: 'duplicate lease comp (same property + tenant + commencement + sf)' });
  } else {
    if (!dryRun) {
      await client.query(
        `INSERT INTO lease_comps (property_id, company_id, tenant_name, property_type, space_use, space_type,
          sf, building_rba, floor_suite, sign_date, commencement_date, move_in_date, expiration_date,
          term_months, rate, escalations, rent_type, lease_type, concessions,
          tenant_rep_company, tenant_rep_agents, landlord_rep_company, landlord_rep_agents, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
        [
          propertyId, tenantCompanyId, row.tenantName, row.propertyType, row.spaceUse, row.spaceType,
          row.sf, row.rba, row.floorSuite, row.signDate, row.commencementDate, row.moveInDate, row.expirationDate,
          row.termMonths, row.rate, row.escalations, row.rentType, row.leaseType, row.concessions,
          (row.tenantRepCompanies || []).join(', ') || null,
          (row.tenantRepAgents || []).map(a => a.original).join(', ') || null,
          (row.landlordRepCompanies || []).join(', ') || null,
          (row.landlordRepAgents || []).map(a => a.original).join(', ') || null,
          row.source
        ]
      );
    }
    caches.compDedupCache.add(dk);
    report.leaseComps.created++;
  }

  // 6. JUNCTION LINKS — idempotent
  if (!dryRun && propertyId) {
    if (tenantCompanyId) {
      await upsertJunction(client, 'property_companies', { property_id: propertyId, company_id: tenantCompanyId, role: 'tenant' }, report);
    }
    for (const compId of brokerCompanyIds.landlordRep) {
      await upsertJunction(client, 'property_companies', { property_id: propertyId, company_id: compId, role: 'leasing' }, report);
    }
    for (const contactId of [...brokerContactIds.tenantRep, ...brokerContactIds.landlordRep]) {
      await upsertJunction(client, 'property_contacts', { property_id: propertyId, contact_id: contactId, role: 'broker' }, report);
    }
  }
}

// ============================================================
// HELPERS
// ============================================================

async function findOrCreateCompany(name, type, client, caches, report, dryRun, rowNum) {
  const existing = findCompany(name, caches, report.fuzzyMatches, rowNum);
  if (existing) {
    report.companies.matched++;
    return existing.company_id;
  }
  if (!dryRun) {
    const { rows } = await client.query(
      `INSERT INTO companies (company_name, company_type) VALUES ($1, $2) RETURNING company_id`,
      [name, type]
    );
    const id = rows[0].company_id;
    const norm = normalizeCompanyName(name);
    if (norm) caches.companyCache.set(norm, { company_id: id, company_name: name, company_type: type });
    report.companies.created++;
    return id;
  }
  report.companies.created++;
  return null;
}

async function findOrCreateContact(name, companyId, client, caches, report, dryRun, rowNum) {
  const existing = findContact(name, caches, report.fuzzyMatches, rowNum, companyId);
  if (existing) {
    report.contacts.matched++;
    if (companyId && !dryRun) {
      await upsertJunction(client, 'contact_companies', { contact_id: existing.contact_id, company_id: companyId }, report);
    }
    return existing.contact_id;
  }
  if (!dryRun) {
    const { rows } = await client.query(
      `INSERT INTO contacts (full_name, type) VALUES ($1, 'broker') RETURNING contact_id`,
      [name]
    );
    const id = rows[0].contact_id;
    const norm = normalizeContactName(name);
    if (norm) {
      const entry = { contact_id: id, full_name: name, _companyIds: new Set(companyId ? [String(companyId)] : []) };
      if (!caches.contactCache.has(norm)) caches.contactCache.set(norm, []);
      caches.contactCache.get(norm).push(entry);
    }
    if (companyId) {
      await upsertJunction(client, 'contact_companies', { contact_id: id, company_id: companyId }, report);
    }
    report.contacts.created++;
    return id;
  }
  report.contacts.created++;
  return null;
}

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
// GAP REPORT
// ============================================================

async function generateGapReport(client) {
  const { rows: [counts] } = await client.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) AS missing_lat_long,
      COUNT(*) FILTER (WHERE rba IS NULL) AS missing_rba,
      COUNT(*) FILTER (WHERE last_sale_date IS NULL) AS missing_last_sale,
      COUNT(*) FILTER (WHERE year_built IS NULL) AS missing_year_built,
      COUNT(*) FILTER (WHERE cap_rate IS NULL) AS missing_cap_rate,
      COUNT(*) FILTER (WHERE noi IS NULL) AS missing_noi,
      COUNT(*) FILTER (WHERE percent_leased IS NULL) AS missing_percent_leased,
      COUNT(*) FILTER (WHERE costar_star_rating IS NULL) AS missing_star_rating
    FROM properties
  `);

  const { rows: [companyCounts] } = await client.query(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE lease_exp IS NULL) AS missing_lease_exp
    FROM companies WHERE company_type = 'tenant'
  `);

  const { rows: [contactCounts] } = await client.query(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE email IS NULL) AS missing_email
    FROM contacts WHERE type = 'broker'
  `);

  return {
    properties: {
      total: parseInt(counts.total),
      missing_lat_long: parseInt(counts.missing_lat_long),
      missing_rba: parseInt(counts.missing_rba),
      missing_last_sale: parseInt(counts.missing_last_sale),
      missing_year_built: parseInt(counts.missing_year_built),
      missing_cap_rate: parseInt(counts.missing_cap_rate),
      missing_noi: parseInt(counts.missing_noi),
      missing_percent_leased: parseInt(counts.missing_percent_leased),
      missing_star_rating: parseInt(counts.missing_star_rating),
    },
    companies: {
      total: parseInt(companyCounts.total),
      missing_lease_exp: parseInt(companyCounts.missing_lease_exp),
    },
    contacts: {
      total: parseInt(contactCounts.total),
      missing_email: parseInt(contactCounts.missing_email),
    },
  };
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function processLeaseComps(rows, pool, options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();

  const report = {
    properties: { created: 0, enriched: 0, matched: 0 },
    companies: { created: 0, matched: 0 },
    contacts: { created: 0, matched: 0 },
    leaseComps: { created: 0 },
    junctions: { created: 0, skipped: 0 },
    fuzzyMatches: [],
    errors: [],
    skipped: [],
    dataGaps: null,
  };

  try {
    console.log(`[engine] Loading caches from database...`);
    const caches = await loadCaches(client);
    console.log(`[engine] Loaded ${caches.propertyCache.size} properties, ${caches.companyCache.size} companies, ${caches.contactCache.size} contacts, ${caches.compDedupCache.size} existing comps`);

    if (!dryRun) await client.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!dryRun) await client.query(`SAVEPOINT row_${i}`);
        await processRow(row, i, client, caches, report, dryRun);
        if (!dryRun) await client.query(`RELEASE SAVEPOINT row_${i}`);
      } catch (err) {
        if (!dryRun) await client.query(`ROLLBACK TO SAVEPOINT row_${i}`);
        report.errors.push({ rowNum: i, message: err.message });
      }

      if ((i + 1) % 500 === 0) {
        console.log(`[engine] Processed ${i + 1}/${rows.length} rows...`);
      }
    }

    if (!dryRun) await client.query('COMMIT');

    report.dataGaps = await generateGapReport(client);

    return report;
  } catch (err) {
    if (!dryRun) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  processLeaseComps,
  generateGapReport,
  loadCaches,
  findProperty,
  findCompany,
  findContact,
  dedupKey,
};
