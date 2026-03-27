// Airtable Contacts Import Engine — reusable fan-out engine.
// One CSV row → contacts + companies + properties + campaigns + interactions + action_items + junctions.
// Used by: migration script, agent API endpoint, CRM import UI.

const { normalizeAddress, normalizeCompanyName, normalizeContactName, similarity } = require('./addressNormalizer');
const { parseNotes } = require('./airtablePropertyParser');

// ============================================================
// CACHE MANAGEMENT
// ============================================================

async function loadCaches(client) {
  const contactCache = new Map();   // "normalizedName" → [{ contact_id, full_name, company_ids: Set }, ...]
  const companyCache = new Map();    // "normalizedName" → { company_id, company_name }
  const propertyCache = new Map();   // "normalizedAddr|city" → { property_id, property_address, city }
  const campaignCache = new Map();   // "lowercaseName" → { campaign_id, name }

  // Load contacts with their company links for disambiguation
  const { rows: contacts } = await client.query(
    `SELECT c.contact_id, c.full_name, c.email_1, c.phone_1,
            ARRAY_AGG(cc.company_id) FILTER (WHERE cc.company_id IS NOT NULL) AS company_ids
     FROM contacts c
     LEFT JOIN contact_companies cc ON c.contact_id = cc.contact_id
     GROUP BY c.contact_id`
  );
  for (const c of contacts) {
    const norm = normalizeContactName(c.full_name);
    if (norm) {
      const entry = {
        contact_id: c.contact_id,
        full_name: c.full_name,
        email_1: c.email_1,
        phone_1: c.phone_1,
        company_ids: new Set(c.company_ids || []),
      };
      if (!contactCache.has(norm)) contactCache.set(norm, []);
      contactCache.get(norm).push(entry);
    }
  }

  // Load companies
  const { rows: companies } = await client.query(
    `SELECT company_id, company_name FROM companies`
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

  // Load campaigns
  const { rows: camps } = await client.query(
    `SELECT campaign_id, name FROM campaigns`
  );
  for (const c of camps) {
    if (c.name) campaignCache.set(c.name.toLowerCase().trim(), c);
  }

  return { contactCache, companyCache, propertyCache, campaignCache };
}

// ============================================================
// MATCHING
// ============================================================

/**
 * Find a contact by name. Disambiguate by company if multiple matches.
 * @param {string} name - Full name from CSV
 * @param {string[]} csvCompanyNames - Company names from same CSV row (for disambiguation)
 * @param {Object} caches
 * @param {Array} fuzzyLog
 * @param {number} rowNum
 * @returns {{ contact: Object|null, created: boolean }}
 */
function findContact(name, csvCompanyNames, caches, fuzzyLog, rowNum) {
  const norm = normalizeContactName(name);
  if (!norm) return null;

  // Tier 1: exact normalized match
  const exact = caches.contactCache.get(norm) || [];
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    // Disambiguate by company
    const disambiguated = disambiguateByCompany(exact, csvCompanyNames, caches);
    if (disambiguated) return disambiguated;
    return exact[0]; // fallback to first
  }

  // Tier 2/3: fuzzy
  let bestMatch = null, bestSim = 0;
  for (const [cachedNorm, arr] of caches.contactCache.entries()) {
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) { bestSim = sim; bestMatch = arr; }
  }

  if (bestSim >= 0.90) {
    const match = bestMatch.length > 1
      ? (disambiguateByCompany(bestMatch, csvCompanyNames, caches) || bestMatch[0])
      : bestMatch[0];
    fuzzyLog.push({ type: 'contact', original: name, matchedTo: match.full_name, similarity: bestSim, rowNum });
    return match;
  }
  if (bestSim >= 0.85) {
    const match = bestMatch.length > 1
      ? (disambiguateByCompany(bestMatch, csvCompanyNames, caches) || bestMatch[0])
      : bestMatch[0];
    fuzzyLog.push({ type: 'contact', original: name, matchedTo: match.full_name, similarity: bestSim, rowNum, review: true });
    return match;
  }
  return null;
}

/**
 * Disambiguate multiple contacts with the same name by checking company links.
 */
function disambiguateByCompany(contacts, csvCompanyNames, caches) {
  if (!csvCompanyNames || csvCompanyNames.length === 0) return null;

  // Resolve CSV company names to company IDs
  const csvCompanyIds = new Set();
  for (const compName of csvCompanyNames) {
    const comp = findCompany(compName, caches, [], 0);
    if (comp) csvCompanyIds.add(comp.company_id);
  }
  if (csvCompanyIds.size === 0) return null;

  // Find the contact linked to one of these companies
  for (const c of contacts) {
    for (const cid of csvCompanyIds) {
      if (c.company_ids.has(cid)) return c;
    }
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
  if (bestSim >= 0.85) {
    if (fuzzyLog) {
      fuzzyLog.push({ type: 'company', original: name, matchedTo: bestMatch.company_name, similarity: bestSim, rowNum, review: bestSim < 0.90 });
    }
    return bestMatch;
  }
  return null;
}

function findProperty(addressStr, caches, fuzzyLog, rowNum) {
  const norm = normalizeAddress(addressStr);
  if (!norm) return null;

  // Try all cities (Owner Properties addresses often don't include city)
  // First: exact match across all cities
  for (const [cachedKey, prop] of caches.propertyCache.entries()) {
    const [cachedNorm] = cachedKey.split('|');
    if (cachedNorm === norm) return prop;
  }

  // Fuzzy match with cross-city guard
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

function findCampaign(name, caches, fuzzyLog, rowNum) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();

  // Tier 1: case-insensitive exact match
  if (caches.campaignCache.has(lower)) return caches.campaignCache.get(lower);

  // Tier 2: fuzzy
  let bestMatch = null, bestSim = 0;
  for (const [cachedLower, camp] of caches.campaignCache.entries()) {
    const sim = similarity(lower, cachedLower);
    if (sim > bestSim) { bestSim = sim; bestMatch = camp; }
  }
  if (bestSim >= 0.90) {
    fuzzyLog.push({ type: 'campaign', original: name, matchedTo: bestMatch.name, similarity: bestSim, rowNum });
    return bestMatch;
  }
  return null;
}

// ============================================================
// CONTACT FIELD MAP — canonical row key → DB column
// ============================================================

const CONTACT_FIELDS = {
  firstName: 'first_name',
  type: 'type',
  title: 'title',
  born: 'date_of_birth',
  workAddress: 'work_address',
  homeAddress: 'home_address',
  email: 'email_1',
  email2: 'email_2',
  email3: 'email_3',
  emailHot: 'email_hot',
  emailKickback: 'email_kickback',
  phone1: 'phone_1',
  phone2: 'phone_2',
  phone3: 'phone_3',
  phoneHot: 'phone_hot',
  linkedin: 'linkedin',
  propertyTypeInterest: 'property_type_interest',
  clientLevel: 'client_level',
  dataSource: 'data_source',
  lastContacted: 'last_contacted',
  followUp: 'follow_up',
  whitePagesUrl: 'white_pages_url',
  beenVerifiedUrl: 'been_verified_url',
  zoomInfoUrl: 'zoom_info_url',
};

// ============================================================
// FAN-OUT — process a single row
// ============================================================

async function processRow(row, rowNum, client, caches, report, dryRun) {
  if (!row.fullName) {
    report.warnings.push({ rowNum, message: 'Skipped — no Full Name' });
    return;
  }

  // 1. CONTACT — find or create, enrich-only
  let contact = findContact(row.fullName, row.companies, caches, report.fuzzyMatches, rowNum);
  let contactId;
  let isNewContact = false;

  if (contact) {
    contactId = contact.contact_id;
    report.contacts.matched++;

    // Enrich — fill blank fields only
    const updates = [];
    const vals = [];
    let idx = 1;

    // Check each field: only fill if CSV has value and DB is blank
    // We need to load the full contact record for enrich checks
    const { rows: [fullRecord] } = await client.query(
      `SELECT * FROM contacts WHERE contact_id = $1`, [contactId]
    );

    for (const [rowKey, dbCol] of Object.entries(CONTACT_FIELDS)) {
      if (row[rowKey] != null && row[rowKey] !== false && fullRecord[dbCol] == null) {
        updates.push(`${dbCol} = $${idx++}`);
        vals.push(row[rowKey]);
      }
    }

    // Handle contact_verified → overflow JSONB
    if (row.contactVerified && fullRecord.overflow) {
      const existing = typeof fullRecord.overflow === 'string' ? JSON.parse(fullRecord.overflow) : fullRecord.overflow;
      if (!existing.contact_verified) {
        updates.push(`overflow = jsonb_set(COALESCE(overflow, '{}'::jsonb), '{contact_verified}', $${idx++}::jsonb)`);
        vals.push(JSON.stringify(row.contactVerified));
      }
    }

    if (updates.length > 0) {
      if (!dryRun) {
        vals.push(contactId);
        await client.query(
          `UPDATE contacts SET ${updates.join(', ')} WHERE contact_id = $${idx}`,
          vals
        );
      }
      report.contacts.enriched++;
    }
  } else {
    // Create new contact
    isNewContact = true;
    const insertCols = ['full_name'];
    const insertVals = [row.fullName];

    for (const [rowKey, dbCol] of Object.entries(CONTACT_FIELDS)) {
      if (row[rowKey] != null && row[rowKey] !== false) {
        insertCols.push(dbCol);
        insertVals.push(row[rowKey]);
      }
    }

    // overflow for contact_verified
    if (row.contactVerified) {
      insertCols.push('overflow');
      insertVals.push(JSON.stringify({ contact_verified: true }));
    }

    if (!dryRun) {
      const placeholders = insertVals.map((_, i) => `$${i + 1}`);
      const { rows } = await client.query(
        `INSERT INTO contacts (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING contact_id`,
        insertVals
      );
      contactId = rows[0].contact_id;

      // Add to cache
      const norm = normalizeContactName(row.fullName);
      if (norm) {
        const entry = { contact_id: contactId, full_name: row.fullName, company_ids: new Set() };
        if (!caches.contactCache.has(norm)) caches.contactCache.set(norm, []);
        caches.contactCache.get(norm).push(entry);
      }
    }
    report.contacts.created++;
  }

  if (!contactId && !dryRun) return;

  // 2. COMPANIES — find or create each, link via contact_companies
  for (const companyName of row.companies || []) {
    const existing = findCompany(companyName, caches, report.fuzzyMatches, rowNum);
    let companyId;

    if (existing) {
      companyId = existing.company_id;
      report.companies.matched++;
    } else {
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO companies (company_name) VALUES ($1) RETURNING company_id`,
          [companyName]
        );
        companyId = rows[0].company_id;
        const norm = normalizeCompanyName(companyName);
        if (norm) caches.companyCache.set(norm, { company_id: companyId, company_name: companyName });
      }
      report.companies.created++;
    }

    if (companyId && contactId && !dryRun) {
      await upsertJunction(client, 'contact_companies', { contact_id: contactId, company_id: companyId }, report);
      // Update cache for disambiguation
      const norm = normalizeContactName(row.fullName);
      if (norm) {
        const entries = caches.contactCache.get(norm) || [];
        const entry = entries.find(e => e.contact_id === contactId);
        if (entry) entry.company_ids.add(companyId);
      }
    }
  }

  // 3. OWNER PROPERTIES — fuzzy match addresses, link via property_contacts role='owner'
  for (const addrStr of row.ownerProperties || []) {
    const prop = findProperty(addrStr, caches, report.fuzzyMatches, rowNum);
    if (prop && contactId && !dryRun) {
      await upsertJunction(client, 'property_contacts', { property_id: prop.property_id, contact_id: contactId, role: 'owner' }, report);
      report.properties.linked++;
    } else if (!prop) {
      report.warnings.push({ rowNum, message: `Owner Property not found: "${addrStr}"` });
    }
  }

  // 4. CAMPAIGNS — find or create, link via campaign_contacts
  for (const campName of row.campaigns || []) {
    let camp = findCampaign(campName, caches, report.fuzzyMatches, rowNum);
    let campaignId;

    if (camp) {
      campaignId = camp.campaign_id;
      report.campaigns.matched++;
    } else {
      // Create new campaign
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO campaigns (name, status) VALUES ($1, 'imported') RETURNING campaign_id`,
          [campName]
        );
        campaignId = rows[0].campaign_id;
        caches.campaignCache.set(campName.toLowerCase().trim(), { campaign_id: campaignId, name: campName });
      }
      report.campaigns.created++;
    }

    if (campaignId && contactId && !dryRun) {
      await upsertJunction(client, 'campaign_contacts', { campaign_id: campaignId, contact_id: contactId }, report);
    }
  }

  // 5. NOTES → interactions table
  if (row.notes && contactId) {
    const entries = parseNotes(row.notes);
    for (const entry of entries) {
      if (!entry.text) continue;

      // Dedup: check if interaction with same notes text exists for this contact
      if (!dryRun) {
        const { rows: existing } = await client.query(
          `SELECT i.interaction_id FROM interactions i
           JOIN interaction_contacts ic ON i.interaction_id = ic.interaction_id
           WHERE ic.contact_id = $1 AND i.notes = $2`,
          [contactId, entry.text]
        );
        if (existing.length > 0) continue;

        const { rows: [inserted] } = await client.query(
          `INSERT INTO interactions (type, subject, date, notes, lead_source)
           VALUES ('note', 'Airtable Contact Import Note', $1, $2, 'airtable_contact_import')
           RETURNING interaction_id`,
          [entry.date || new Date().toISOString().split('T')[0], entry.text]
        );
        await upsertJunction(client, 'interaction_contacts', { interaction_id: inserted.interaction_id, contact_id: contactId }, report);
        report.interactions.created++;
      } else {
        report.interactions.created++;
      }
    }
  }

  // 6. INTERACTIONS field → interactions table
  if (row.interactions && contactId) {
    const entries = parseNotes(row.interactions);
    for (const entry of entries) {
      if (!entry.text) continue;

      if (!dryRun) {
        const { rows: existing } = await client.query(
          `SELECT i.interaction_id FROM interactions i
           JOIN interaction_contacts ic ON i.interaction_id = ic.interaction_id
           WHERE ic.contact_id = $1 AND i.notes = $2`,
          [contactId, entry.text]
        );
        if (existing.length > 0) continue;

        const { rows: [inserted] } = await client.query(
          `INSERT INTO interactions (type, subject, date, notes, lead_source)
           VALUES ('interaction', 'Airtable Contact Import Interaction', $1, $2, 'airtable_contact_import')
           RETURNING interaction_id`,
          [entry.date || new Date().toISOString().split('T')[0], entry.text]
        );
        await upsertJunction(client, 'interaction_contacts', { interaction_id: inserted.interaction_id, contact_id: contactId }, report);
        report.interactions.created++;
      } else {
        report.interactions.created++;
      }
    }
  }

  // 7. ACTION ITEMS → action_items table
  if (row.actionItems && contactId) {
    const entries = parseNotes(row.actionItems);
    for (const entry of entries) {
      if (!entry.text) continue;

      if (!dryRun) {
        // Dedup: check if action item with same name exists for this contact
        const { rows: existing } = await client.query(
          `SELECT ai.action_item_id FROM action_items ai
           JOIN action_item_contacts aic ON ai.action_item_id = aic.action_item_id
           WHERE aic.contact_id = $1 AND ai.name = $2`,
          [contactId, entry.text]
        );
        if (existing.length > 0) continue;

        const { rows: [inserted] } = await client.query(
          `INSERT INTO action_items (name, due_date, status, source)
           VALUES ($1, $2, 'pending', 'airtable_contact_import')
           RETURNING action_item_id`,
          [entry.text, entry.date]
        );
        await upsertJunction(client, 'action_item_contacts', { action_item_id: inserted.action_item_id, contact_id: contactId }, report);
        report.actionItems.created++;
      } else {
        report.actionItems.created++;
      }
    }
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

async function processAirtableContacts(rows, pool, options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();

  const report = {
    contacts: { created: 0, matched: 0, enriched: 0 },
    companies: { created: 0, matched: 0 },
    properties: { linked: 0 },
    campaigns: { created: 0, matched: 0 },
    interactions: { created: 0 },
    actionItems: { created: 0 },
    junctions: { created: 0, skipped: 0 },
    fuzzyMatches: [],
    warnings: [],
    errors: [],
  };

  const BATCH_SIZE = 500;

  try {
    console.log(`[contact-engine] Loading caches from database...`);
    const caches = await loadCaches(client);
    console.log(`[contact-engine] Loaded ${caches.contactCache.size} contacts, ${caches.companyCache.size} companies, ${caches.propertyCache.size} properties, ${caches.campaignCache.size} campaigns`);

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
          report.errors.push({ rowNum: i, fullName: rows[i].fullName, message: err.message });
        }
      }

      if (!dryRun) await client.query('COMMIT');
      console.log(`[contact-engine] Committed batch ${batchStart + 1}-${batchEnd}/${rows.length} (${Math.round(batchEnd / rows.length * 100)}%)`);
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
  processAirtableContacts,
  loadCaches,
  findContact,
  findCompany,
  findProperty,
  findCampaign,
};
