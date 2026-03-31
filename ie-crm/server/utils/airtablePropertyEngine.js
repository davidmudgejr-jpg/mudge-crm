// Airtable Properties Import Engine — reusable fan-out engine.
// One CSV row → properties + companies + contacts + interactions + junctions.
// Used by: migration script, agent API endpoint, CRM import UI.

const { normalizeAddress, normalizeCompanyName, normalizeContactName, similarity } = require('./addressNormalizer');
const { parseNotes } = require('./airtablePropertyParser');

// ============================================================
// CACHE MANAGEMENT
// ============================================================

async function loadCaches(client) {
  const propertyCache = new Map();   // "normalizedAddr|city" → { property_id, ... }
  const companyCache = new Map();    // "normalizedName" → { company_id, ... }
  const contactCache = new Map();    // "normalizedName" → [{ contact_id, ... }, ...]

  // Load properties — wide select for enrich-only checks
  const { rows: props } = await client.query(
    `SELECT property_id, property_address, normalized_address, property_name,
            property_type, rba, city, state, zip, building_status, building_class,
            year_built, year_renovated, stories, land_area_ac, land_sf, far,
            zoning, power, ceiling_ht, clear_ht, number_of_loading_docks, drive_ins,
            column_spacing, sprinklers, number_of_cranes, construction_material,
            rail_lines, parking_spaces, parking_ratio, features,
            last_sale_date, last_sale_price, price_psf, listing_asking_lease_rate,
            debt_date, loan_amount, building_park, county, owner_type,
            costar_url, landvision_url, heating, sewer, water, gas, contacted, overflow
     FROM properties`
  );
  for (const p of props) {
    const norm = p.normalized_address || normalizeAddress(p.property_address) || '';
    const city = (p.city || '').toLowerCase().trim();
    propertyCache.set(`${norm}|${city}`, p);
  }

  // Load companies
  const { rows: companies } = await client.query(
    `SELECT company_id, company_name, company_type, industry_type FROM companies`
  );
  for (const c of companies) {
    const norm = normalizeCompanyName(c.company_name);
    if (norm) companyCache.set(norm, c);
  }

  // Load contacts
  const { rows: contacts } = await client.query(
    `SELECT c.contact_id, c.full_name
     FROM contacts c`
  );
  for (const c of contacts) {
    const norm = normalizeContactName(c.full_name);
    if (norm) {
      if (!contactCache.has(norm)) contactCache.set(norm, []);
      contactCache.get(norm).push(c);
    }
  }

  return { propertyCache, companyCache, contactCache };
}

// ============================================================
// MATCHING (same tiered approach as leaseCompEngine)
// ============================================================

function findProperty(row, caches, fuzzyLog, rowNum) {
  const norm = normalizeAddress(row.address);
  if (!norm) return null;
  const city = (row.city || '').toLowerCase().trim();
  const key = `${norm}|${city}`;

  // Tier 1: exact
  if (caches.propertyCache.has(key)) return caches.propertyCache.get(key);

  // Tier 2/3: fuzzy
  let bestMatch = null, bestSim = 0;
  for (const [cachedKey, prop] of caches.propertyCache.entries()) {
    const [cachedNorm, cachedCity] = cachedKey.split('|');
    if (cachedCity !== city) continue;
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) { bestSim = sim; bestMatch = prop; }
  }

  if (bestSim >= 0.95) {
    fuzzyLog.push({ type: 'property', original: row.address, matchedTo: bestMatch.property_address, similarity: bestSim, rowNum });
    return bestMatch;
  }
  if (bestSim >= 0.90) {
    fuzzyLog.push({ type: 'property', original: row.address, matchedTo: bestMatch.property_address, similarity: bestSim, rowNum, review: true });
    return bestMatch;
  }
  return null;
}

function findCompany(name, caches, fuzzyLog, rowNum) {
  const norm = normalizeCompanyName(name);
  if (!norm) return null;
  if (caches.companyCache.has(norm)) return caches.companyCache.get(norm);

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

function findContact(name, caches, fuzzyLog, rowNum) {
  const norm = normalizeContactName(name);
  if (!norm) return null;
  const exact = caches.contactCache.get(norm) || [];
  if (exact.length > 0) return exact[0];

  let bestMatch = null, bestSim = 0;
  for (const [cachedNorm, arr] of caches.contactCache.entries()) {
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) { bestSim = sim; bestMatch = arr[0]; }
  }
  if (bestSim >= 0.85) {
    fuzzyLog.push({ type: 'contact', original: name, matchedTo: bestMatch.full_name, similarity: bestSim, rowNum });
    return bestMatch;
  }
  return null;
}

// ============================================================
// PROPERTY FIELD MAP — canonical row key → DB column
// ============================================================

const PROPERTY_FIELDS = {
  propertyName: 'property_name',
  propertyType: 'property_type',
  buildingStatus: 'building_status',
  buildingClass: 'building_class',
  yearBuilt: 'year_built',
  yearRenovated: 'year_renovated',
  rba: 'rba',
  stories: 'stories',
  landAreaAc: 'land_area_ac',
  landSf: 'land_sf',
  far: 'far',
  zoning: 'zoning',
  power: 'power',
  ceilingHt: 'ceiling_ht',
  clearHt: 'clear_ht',
  loadingDocks: 'number_of_loading_docks',
  driveIns: 'drive_ins',
  columnSpacing: 'column_spacing',
  sprinklers: 'sprinklers',
  cranes: 'number_of_cranes',
  constructionMaterial: 'construction_material',
  railLines: 'rail_lines',
  parkingSpaces: 'parking_spaces',
  parkingRatio: 'parking_ratio',
  features: 'features',
  lastSaleDate: 'last_sale_date',
  lastSalePrice: 'last_sale_price',
  pricePsf: 'price_psf',
  rentPsfMo: 'listing_asking_lease_rate',
  debtDate: 'debt_date',
  loanAmount: 'loan_amount',
  buildingPark: 'building_park',
  county: 'county',
  ownerType: 'owner_type',
  costarUrl: 'costar_url',
  landvisionUrl: 'landvision_url',
  heating: 'heating',
  sewer: 'sewer',
  water: 'water',
  gas: 'gas',
};

// ============================================================
// FAN-OUT — process a single row
// ============================================================

async function processRow(row, rowNum, client, caches, report, dryRun) {
  // 1. PROPERTY — find or create, enrich-only
  let property = findProperty(row, caches, report.fuzzyMatches, rowNum);
  let propertyId;

  if (property) {
    propertyId = property.property_id;
    report.properties.matched++;

    // Enrich — fill blank fields only
    const updates = [];
    const vals = [];
    let idx = 1;

    for (const [rowKey, dbCol] of Object.entries(PROPERTY_FIELDS)) {
      if (row[rowKey] != null && property[dbCol] == null) {
        updates.push(`${dbCol} = $${idx++}`);
        vals.push(row[rowKey]);
      }
    }

    // Handle contacted array (merge, don't overwrite)
    if (row.contacted && Array.isArray(row.contacted)) {
      const existing = property.contacted || [];
      const merged = [...new Set([...existing, ...row.contacted])];
      if (merged.length > existing.length) {
        updates.push(`contacted = $${idx++}::text[]`);
        vals.push(`{${merged.join(',')}}`);
      }
    }

    // Handle overflow JSONB (merge keys)
    if (row.overflow && Object.keys(row.overflow).length > 0) {
      const existingOverflow = property.overflow || {};
      const mergedOverflow = { ...existingOverflow };
      let added = false;
      for (const [k, v] of Object.entries(row.overflow)) {
        if (v != null && !mergedOverflow[k]) {
          mergedOverflow[k] = v;
          added = true;
        }
      }
      if (added) {
        updates.push(`overflow = $${idx++}`);
        vals.push(JSON.stringify(mergedOverflow));
      }
    }

    if (updates.length > 0) {
      if (!dryRun) {
        vals.push(propertyId);
        await client.query(
          `UPDATE properties SET ${updates.join(', ')} WHERE property_id = $${idx}`,
          vals
        );
        // Update cache in-memory
        for (const [rowKey, dbCol] of Object.entries(PROPERTY_FIELDS)) {
          if (row[rowKey] != null && property[dbCol] == null) property[dbCol] = row[rowKey];
        }
      }
      report.properties.enriched++;
    }
  } else if (row.address) {
    // Create new property
    const insertCols = ['property_address', 'city', 'state', 'zip'];
    const insertVals = [row.address, row.city, row.state, row.zip];

    for (const [rowKey, dbCol] of Object.entries(PROPERTY_FIELDS)) {
      if (row[rowKey] != null) {
        insertCols.push(dbCol);
        insertVals.push(row[rowKey]);
      }
    }

    if (row.contacted) {
      insertCols.push('contacted');
      insertVals.push(`{${row.contacted.join(',')}}`); // PostgreSQL TEXT[] literal
    }

    if (row.overflow && Object.keys(row.overflow).length > 0) {
      insertCols.push('overflow');
      insertVals.push(JSON.stringify(row.overflow));
    }

    if (!dryRun) {
      const placeholders = insertVals.map((_, i) => `$${i + 1}`);
      const { rows } = await client.query(
        `INSERT INTO properties (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING property_id`,
        insertVals
      );
      propertyId = rows[0].property_id;
      const norm = normalizeAddress(row.address);
      const city = (row.city || '').toLowerCase().trim();
      const cacheEntry = { property_id: propertyId, property_address: row.address, city: row.city, state: row.state, zip: row.zip };
      for (const [rowKey, dbCol] of Object.entries(PROPERTY_FIELDS)) {
        if (row[rowKey] != null) cacheEntry[dbCol] = row[rowKey];
      }
      caches.propertyCache.set(`${norm}|${city}`, cacheEntry);
    }
    report.properties.created++;
  }

  if (!propertyId && !dryRun) return;

  // 2. OWNER COMPANIES — loop over all (Airtable linked fields are comma-separated)
  const ownerCompanyIds = [];
  for (const ownerName of row.companyOwners || []) {
    const existing = findCompany(ownerName, caches, report.fuzzyMatches, rowNum);
    let ownerCompanyId;
    if (existing) {
      ownerCompanyId = existing.company_id;
      report.companies.matched++;
    } else {
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO companies (company_name, company_type) VALUES ($1, 'owner') RETURNING company_id`,
          [ownerName]
        );
        ownerCompanyId = rows[0].company_id;
        const norm = normalizeCompanyName(ownerName);
        if (norm) caches.companyCache.set(norm, { company_id: ownerCompanyId, company_name: ownerName, company_type: 'owner' });
      }
      report.companies.created++;
    }
    if (ownerCompanyId) ownerCompanyIds.push(ownerCompanyId);
    if (ownerCompanyId && propertyId && !dryRun) {
      await upsertJunction(client, 'property_companies', { property_id: propertyId, company_id: ownerCompanyId, role: 'owner' }, report);
    }
  }

  // 3. TENANT COMPANIES — split, find or create each
  for (const tenantName of row.companyTenants || []) {
    const existing = findCompany(tenantName, caches, report.fuzzyMatches, rowNum);
    let tenantCompanyId;
    if (existing) {
      tenantCompanyId = existing.company_id;
      report.companies.matched++;
      // Enrich industry_type if blank
      if (row.industryType && !existing.industry_type && !dryRun) {
        await client.query(`UPDATE companies SET industry_type = $1 WHERE company_id = $2`, [row.industryType, tenantCompanyId]);
        existing.industry_type = row.industryType;
      }
    } else {
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO companies (company_name, company_type, industry_type) VALUES ($1, 'tenant', $2) RETURNING company_id`,
          [tenantName, row.industryType]
        );
        tenantCompanyId = rows[0].company_id;
        const norm = normalizeCompanyName(tenantName);
        if (norm) caches.companyCache.set(norm, { company_id: tenantCompanyId, company_name: tenantName, company_type: 'tenant', industry_type: row.industryType });
      }
      report.companies.created++;
    }
    if (tenantCompanyId && propertyId && !dryRun) {
      await upsertJunction(client, 'property_companies', { property_id: propertyId, company_id: tenantCompanyId, role: 'tenant' }, report);
    }
  }

  // 4. OWNER CONTACTS — loop over all (Airtable linked fields are comma-separated)
  const ownerContactIds = [];
  for (const contactName of row.ownerContacts || []) {
    const existing = findContact(contactName, caches, report.fuzzyMatches, rowNum);
    let ownerContactId;
    if (existing) {
      ownerContactId = existing.contact_id;
      report.contacts.matched++;
    } else {
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO contacts (full_name, type) VALUES ($1, 'owner') RETURNING contact_id`,
          [contactName]
        );
        ownerContactId = rows[0].contact_id;
        const norm = normalizeContactName(contactName);
        if (norm) {
          const entry = { contact_id: ownerContactId, full_name: contactName };
          if (!caches.contactCache.has(norm)) caches.contactCache.set(norm, []);
          caches.contactCache.get(norm).push(entry);
        }
      }
      report.contacts.created++;
    }
    if (ownerContactId) ownerContactIds.push(ownerContactId);
    if (ownerContactId && propertyId && !dryRun) {
      await upsertJunction(client, 'property_contacts', { property_id: propertyId, contact_id: ownerContactId, role: 'owner' }, report);
    }
    // Link owner contact to all owner companies
    for (const compId of ownerCompanyIds) {
      if (ownerContactId && !dryRun) {
        await upsertJunction(client, 'contact_companies', { contact_id: ownerContactId, company_id: compId }, report);
      }
    }
  }

  // 5. BROKER CONTACTS — loop over all (Airtable linked fields are comma-separated)
  // Track which contacts are already linked to avoid PK violation
  const linkedContactIds = new Set(ownerContactIds);

  for (const brokerName of row.brokerContacts || []) {
    const existing = findContact(brokerName, caches, report.fuzzyMatches, rowNum);
    let brokerContactId;
    if (existing) {
      brokerContactId = existing.contact_id;
      report.contacts.matched++;
    } else {
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO contacts (full_name, type) VALUES ($1, 'broker') RETURNING contact_id`,
          [brokerName]
        );
        brokerContactId = rows[0].contact_id;
        const norm = normalizeContactName(brokerName);
        if (norm) {
          const entry = { contact_id: brokerContactId, full_name: brokerName };
          if (!caches.contactCache.has(norm)) caches.contactCache.set(norm, []);
          caches.contactCache.get(norm).push(entry);
        }
      }
      report.contacts.created++;
    }
    // Edge case: same person as owner + broker → skip second junction insert
    if (brokerContactId && propertyId && !linkedContactIds.has(brokerContactId) && !dryRun) {
      await upsertJunction(client, 'property_contacts', { property_id: propertyId, contact_id: brokerContactId, role: 'broker' }, report);
      linkedContactIds.add(brokerContactId);
    }
  }

  // 6. NOTES → INTERACTIONS
  if (row.notes && propertyId && !dryRun) {
    const entries = parseNotes(row.notes);
    for (const entry of entries) {
      // Dedup: check if interaction with same notes text exists for this property
      const { rows: existing } = await client.query(
        `SELECT i.interaction_id FROM interactions i
         JOIN interaction_properties ip ON i.interaction_id = ip.interaction_id
         WHERE ip.property_id = $1 AND i.notes = $2`,
        [propertyId, entry.text]
      );
      if (existing.length > 0) continue; // already exists

      const { rows: [inserted] } = await client.query(
        `INSERT INTO interactions (type, subject, date, notes, lead_source)
         VALUES ('note', 'Airtable Import Note', $1, $2, 'airtable_import')
         RETURNING interaction_id`,
        [entry.date || new Date().toISOString().split('T')[0], entry.text]
      );

      // Link to property
      await upsertJunction(client, 'interaction_properties', { interaction_id: inserted.interaction_id, property_id: propertyId }, report);

      // Link to owner contact if exists
      if (ownerContactId) {
        await upsertJunction(client, 'interaction_contacts', { interaction_id: inserted.interaction_id, contact_id: ownerContactId }, report);
      }

      report.interactions.created++;
    }
  }

  // Log Jr Deals copy reference for manual review
  if (row.jrDealsCopy) {
    report.dealRefs.push({ rowNum, address: row.address, dealRef: row.jrDealsCopy });
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
      COUNT(*) FILTER (WHERE zoning IS NULL) AS missing_zoning
    FROM properties
  `);

  const { rows: [ownerCounts] } = await client.query(`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE NOT EXISTS (
             SELECT 1 FROM property_contacts pc WHERE pc.property_id = p.property_id
           )) AS missing_owner_contact
    FROM properties p
  `);

  return {
    total: parseInt(counts.total),
    missing_lat_long: parseInt(counts.missing_lat_long),
    missing_rba: parseInt(counts.missing_rba),
    missing_last_sale: parseInt(counts.missing_last_sale),
    missing_year_built: parseInt(counts.missing_year_built),
    missing_zoning: parseInt(counts.missing_zoning),
    missing_owner_contact: parseInt(ownerCounts.missing_owner_contact),
  };
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================

async function processAirtableProperties(rows, pool, options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();

  const report = {
    properties: { created: 0, enriched: 0, matched: 0 },
    companies: { created: 0, matched: 0 },
    contacts: { created: 0, matched: 0 },
    interactions: { created: 0 },
    junctions: { created: 0, skipped: 0 },
    fuzzyMatches: [],
    warnings: [],
    errors: [],
    dealRefs: [],
    dataGaps: null,
  };

  const BATCH_SIZE = 500;

  try {
    console.log(`[airtable-engine] Loading caches from database...`);
    const caches = await loadCaches(client);
    console.log(`[airtable-engine] Loaded ${caches.propertyCache.size} properties, ${caches.companyCache.size} companies, ${caches.contactCache.size} contacts`);

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
          report.errors.push({ rowNum: i, address: rows[i].address, message: err.message });
        }
      }

      if (!dryRun) await client.query('COMMIT');
      console.log(`[airtable-engine] ✅ Committed batch ${batchStart + 1}-${batchEnd}/${rows.length} (${Math.round(batchEnd / rows.length * 100)}%)`);
    }

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
  processAirtableProperties,
  generateGapReport,
  loadCaches,
  findProperty,
  findCompany,
  findContact,
};
