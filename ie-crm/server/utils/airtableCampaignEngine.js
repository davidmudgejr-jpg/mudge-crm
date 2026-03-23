// Airtable Campaigns Import Engine — reusable fan-out engine.
// One CSV row → campaigns + campaign_contacts junction + interactions.
// Used by: migration script, agent API endpoint, CRM import UI.

const { normalizeContactName, similarity } = require('./addressNormalizer');

// ============================================================
// CACHE MANAGEMENT
// ============================================================

async function loadCaches(client) {
  const campaignCache = new Map();  // "normalizedName" → { campaign_id, name, ... }
  const contactCache = new Map();   // "normalizedName" → [{ contact_id, full_name }, ...]

  // Load campaigns
  const { rows: campaigns } = await client.query(
    `SELECT campaign_id, name, type, status, sent_date, notes, assignee, day_time_hits, overflow
     FROM campaigns`
  );
  for (const c of campaigns) {
    const norm = normalizeCampaignName(c.name);
    if (norm) campaignCache.set(norm, c);
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

  return { campaignCache, contactCache };
}

// ============================================================
// NORMALIZATION
// ============================================================

function normalizeCampaignName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw.toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim() || null;
}

// ============================================================
// MATCHING
// ============================================================

function findCampaign(name, caches, fuzzyLog, rowNum) {
  const norm = normalizeCampaignName(name);
  if (!norm) return null;

  // Tier 1: exact normalized match
  if (caches.campaignCache.has(norm)) return caches.campaignCache.get(norm);

  // Tier 2: fuzzy ≥90%
  let bestMatch = null, bestSim = 0;
  for (const [cachedNorm, campaign] of caches.campaignCache.entries()) {
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) { bestSim = sim; bestMatch = campaign; }
  }

  if (bestSim >= 0.90) {
    fuzzyLog.push({ type: 'campaign', original: name, matchedTo: bestMatch.name, similarity: bestSim, rowNum });
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
// CAMPAIGN ENRICH FIELD MAP — canonical row key → DB column
// ============================================================

const CAMPAIGN_ENRICH_FIELDS = {
  campaignType: 'type',
  status: 'status',
  sentDate: 'sent_date',
  assignee: 'assignee',
};

// ============================================================
// FAN-OUT — process a single row
// ============================================================

async function processRow(row, rowNum, client, caches, report, dryRun) {
  if (!row.name) {
    report.warnings.push({ rowNum, message: 'Skipped — no Name' });
    return;
  }

  // 1. CAMPAIGN — find or create, enrich-only
  let existing = findCampaign(row.name, caches, report.fuzzyMatches, rowNum);
  let campaignId;

  if (existing) {
    campaignId = existing.campaign_id;
    report.campaigns.matched++;

    // Enrich — fill blank fields only
    const updates = [];
    const vals = [];
    let idx = 1;

    for (const [rowKey, dbCol] of Object.entries(CAMPAIGN_ENRICH_FIELDS)) {
      if (row[rowKey] != null && existing[dbCol] == null) {
        updates.push(`${dbCol} = $${idx++}`);
        vals.push(row[rowKey]);
      }
    }

    // Notes → notes column (fill if blank)
    if (row.notes && !existing.notes) {
      updates.push(`notes = $${idx++}`);
      vals.push(row.notes);
    }

    // Overflow: merge day/time/hits into day_time_hits, file into overflow JSONB
    if (row.overflow) {
      // day_time_hits column
      const dayTimeHits = [row.overflow.day, row.overflow.time, row.overflow.hits].filter(Boolean).join(' | ');
      if (dayTimeHits && !existing.day_time_hits) {
        updates.push(`day_time_hits = $${idx++}`);
        vals.push(dayTimeHits);
      }

      // Merge file into overflow JSONB
      if (row.overflow.file) {
        const existingOverflow = existing.overflow
          ? (typeof existing.overflow === 'string' ? JSON.parse(existing.overflow) : existing.overflow)
          : {};
        if (!existingOverflow.file) {
          const merged = { ...existingOverflow, file: row.overflow.file };
          updates.push(`overflow = $${idx++}`);
          vals.push(JSON.stringify(merged));
        }
      }
    }

    if (updates.length > 0) {
      if (!dryRun) {
        vals.push(campaignId);
        await client.query(
          `UPDATE campaigns SET ${updates.join(', ')} WHERE campaign_id = $${idx}`,
          vals
        );
        // Update cache
        for (const [rowKey, dbCol] of Object.entries(CAMPAIGN_ENRICH_FIELDS)) {
          if (row[rowKey] != null && existing[dbCol] == null) {
            existing[dbCol] = row[rowKey];
          }
        }
        if (row.notes && !existing.notes) existing.notes = row.notes;
      }
      report.campaigns.enriched++;
    }
  } else {
    // Create new campaign
    const insertCols = ['name'];
    const insertVals = [row.name];

    for (const [rowKey, dbCol] of Object.entries(CAMPAIGN_ENRICH_FIELDS)) {
      if (row[rowKey] != null) {
        insertCols.push(dbCol);
        insertVals.push(row[rowKey]);
      }
    }

    // Notes
    if (row.notes) {
      insertCols.push('notes');
      insertVals.push(row.notes);
    }

    // day_time_hits
    if (row.overflow) {
      const dayTimeHits = [row.overflow.day, row.overflow.time, row.overflow.hits].filter(Boolean).join(' | ');
      if (dayTimeHits) {
        insertCols.push('day_time_hits');
        insertVals.push(dayTimeHits);
      }
      if (row.overflow.file) {
        insertCols.push('overflow');
        insertVals.push(JSON.stringify({ file: row.overflow.file }));
      }
    }

    if (!dryRun) {
      const placeholders = insertVals.map((_, i) => `$${i + 1}`);
      const { rows } = await client.query(
        `INSERT INTO campaigns (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING campaign_id`,
        insertVals
      );
      campaignId = rows[0].campaign_id;

      // Add to cache
      const norm = normalizeCampaignName(row.name);
      if (norm) {
        const cacheEntry = { campaign_id: campaignId, name: row.name };
        for (const [rowKey, dbCol] of Object.entries(CAMPAIGN_ENRICH_FIELDS)) {
          if (row[rowKey] != null) cacheEntry[dbCol] = row[rowKey];
        }
        caches.campaignCache.set(norm, cacheEntry);
      }
    }
    report.campaigns.created++;
  }

  if (!campaignId && !dryRun) return;

  // 2. CONTACTS — fuzzy match names → upsert campaign_contacts junction
  for (const contactName of row.contacts || []) {
    const contact = findContact(contactName, caches, report.fuzzyMatches, rowNum);
    if (contact && !dryRun) {
      await upsertJunction(client, 'campaign_contacts', {
        campaign_id: campaignId, contact_id: contact.contact_id
      }, report);
      report.contacts.linked++;
    } else if (!contact) {
      report.warnings.push({ rowNum, message: `Contact not found: "${contactName}"` });
      report.contacts.notFound++;
    } else {
      report.contacts.linked++;
    }
  }

  // 3. NOTES — already stored directly on campaigns.notes column above (enrich/create)
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

async function processAirtableCampaigns(rows, pool, options = {}) {
  const { dryRun = false } = options;
  const client = await pool.connect();

  const report = {
    campaigns: { created: 0, matched: 0, enriched: 0 },
    contacts: { linked: 0, notFound: 0 },
    junctions: { created: 0, skipped: 0 },
    fuzzyMatches: [],
    warnings: [],
    errors: [],
  };

  const BATCH_SIZE = 50;

  try {
    console.log(`[campaign-engine] Loading caches from database...`);
    const caches = await loadCaches(client);
    console.log(`[campaign-engine] Loaded ${caches.campaignCache.size} campaigns, ${caches.contactCache.size} contacts`);

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
          report.errors.push({ rowNum: i, campaignName: rows[i].name, message: err.message });
        }
      }

      if (!dryRun) await client.query('COMMIT');
      console.log(`[campaign-engine] Committed batch ${batchStart + 1}-${batchEnd}/${rows.length} (${Math.round(batchEnd / rows.length * 100)}%)`);
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
  processAirtableCampaigns,
  loadCaches,
  findCampaign,
  findContact,
  normalizeCampaignName,
};
