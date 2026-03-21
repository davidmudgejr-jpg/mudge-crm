// TPE Import Engine — core engine for importing 4 TPE data sheets.
// Loads caches, fuzzy-matches properties/companies, inserts into 4 tables, enriches properties.
// Pattern: same as leaseCompEngine.js and airtablePropertyEngine.js

const { normalizeAddress, normalizeCompanyName, similarity } = require('./addressNormalizer');

// ============================================================
// CACHE MANAGEMENT
// ============================================================

async function loadCaches(client) {
  const propertyCache = new Map();   // "normalizedAddr|city" -> { property_id, ... }
  const companyCache = new Map();    // "normalizedName" -> { company_id, ... }

  // Dedup caches for each table
  const distressDedupCache = new Set();  // "property_id|distress_type|auction_date"
  const loanDedupCache = new Set();      // "property_id|lender|maturity_date"
  const growthDedupCache = new Set();    // "company_id|property_id|data_date"
  const debtDedupCache = new Set();      // "property_id|lender|origination_date|origination_amount"

  // Load properties (wide select for enrich checks)
  const { rows: props } = await client.query(
    `SELECT property_id, property_address, normalized_address, property_name,
            property_type, rba, city, state, zip, year_built, owner_name,
            last_sale_price, owner_entity_type, owner_type
     FROM properties`
  );
  for (const p of props) {
    const norm = p.normalized_address || normalizeAddress(p.property_address) || '';
    const city = (p.city || '').toLowerCase().trim();
    propertyCache.set(`${norm}|${city}`, p);
  }

  // Load companies
  const { rows: companies } = await client.query(
    `SELECT company_id, company_name, company_type FROM companies`
  );
  for (const c of companies) {
    const norm = normalizeCompanyName(c.company_name);
    if (norm) companyCache.set(norm, c);
  }

  // Load existing property_distress for dedup
  const { rows: distressRows } = await client.query(
    `SELECT property_id, distress_type, filing_date, auction_date FROM property_distress`
  );
  for (const r of distressRows) {
    const dateKey = r.auction_date ? String(r.auction_date).split('T')[0] :
                    r.filing_date ? String(r.filing_date).split('T')[0] : '';
    distressDedupCache.add(`${r.property_id}|${(r.distress_type || '').toLowerCase()}|${dateKey}`);
  }

  // Load existing loan_maturities for dedup
  const { rows: loanRows } = await client.query(
    `SELECT property_id, lender, maturity_date FROM loan_maturities`
  );
  for (const r of loanRows) {
    const dateKey = r.maturity_date ? String(r.maturity_date).split('T')[0] : '';
    loanDedupCache.add(`${r.property_id}|${(r.lender || '').toLowerCase()}|${dateKey}`);
  }

  // Load existing tenant_growth for dedup
  const { rows: growthRows } = await client.query(
    `SELECT company_id, property_id, data_date FROM tenant_growth`
  );
  for (const r of growthRows) {
    const dateKey = r.data_date ? String(r.data_date).split('T')[0] : '';
    growthDedupCache.add(`${r.company_id}|${r.property_id || ''}|${dateKey}`);
  }

  // Load existing debt_stress for dedup
  const { rows: debtRows } = await client.query(
    `SELECT property_id, lender, origination_date, origination_amount FROM debt_stress`
  );
  for (const r of debtRows) {
    const dateKey = r.origination_date ? String(r.origination_date).split('T')[0] : '';
    debtDedupCache.add(`${r.property_id}|${(r.lender || '').toLowerCase()}|${dateKey}|${r.origination_amount || ''}`);
  }

  return {
    propertyCache, companyCache,
    distressDedupCache, loanDedupCache, growthDedupCache, debtDedupCache,
  };
}

// ============================================================
// MATCHING (same tiered approach as other engines)
// ============================================================

function findProperty(row, caches, fuzzyLog, rowNum) {
  const norm = normalizeAddress(row.address);
  if (!norm) return null;
  const city = (row.city || '').toLowerCase().trim();
  const key = `${norm}|${city}`;

  // Tier 1: exact
  if (caches.propertyCache.has(key)) return caches.propertyCache.get(key);

  // Tier 2/3: fuzzy with city guard
  let bestMatch = null, bestSim = 0;
  for (const [cachedKey, prop] of caches.propertyCache.entries()) {
    const [cachedNorm, cachedCity] = cachedKey.split('|');
    if (city && cachedCity && cachedCity !== city) continue;
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

// ============================================================
// PROPERTY ENRICHMENT — fill blank fields, never overwrite
// ============================================================

async function enrichProperty(property, enrichData, client, dryRun) {
  const updates = [];
  const vals = [];
  let idx = 1;
  let enriched = false;

  for (const [dbCol, value] of Object.entries(enrichData)) {
    if (value != null && property[dbCol] == null) {
      updates.push(`${dbCol} = $${idx++}`);
      vals.push(value);
    }
  }

  if (updates.length > 0) {
    if (!dryRun) {
      vals.push(property.property_id);
      await client.query(
        `UPDATE properties SET ${updates.join(', ')} WHERE property_id = $${idx}`,
        vals
      );
      // Update cache in-memory
      for (const [dbCol, value] of Object.entries(enrichData)) {
        if (value != null && property[dbCol] == null) property[dbCol] = value;
      }
    }
    enriched = true;
  }
  return enriched;
}

// ============================================================
// SHEET 1: DISTRESS — process a single row
// ============================================================

async function processDistressRow(row, rowNum, client, caches, report, dryRun) {
  if (!row.address) {
    report.skipped.push({ rowNum, sheet: 'distress', reason: 'no address' });
    return;
  }

  // Find property
  const property = findProperty(row, caches, report.fuzzyMatches, rowNum);
  let propertyId = property ? property.property_id : null;

  if (!property) {
    report.skipped.push({ rowNum, sheet: 'distress', reason: `no property match: "${row.address}"` });
    return;
  }

  report.properties.matched++;

  // Enrich property if blank (apn column not on properties table — skip)
  const enrichData = {};
  if (row.owner) enrichData.owner_name = row.owner;
  if (row.ownerType) enrichData.owner_type = row.ownerType;
  if (row.salePrice) enrichData.last_sale_price = row.salePrice;

  if (Object.keys(enrichData).length > 0) {
    const didEnrich = await enrichProperty(property, enrichData, client, dryRun);
    if (didEnrich) report.properties.enriched++;
  }

  // Dedup check
  const dateKey = row.auctionDate || '';
  const dk = `${propertyId}|${(row.distressType || '').toLowerCase()}|${dateKey}`;
  if (caches.distressDedupCache.has(dk)) {
    report.skipped.push({ rowNum, sheet: 'distress', reason: 'duplicate (property + type + date)' });
    return;
  }

  // Insert
  if (!dryRun) {
    await client.query(
      `INSERT INTO property_distress (property_id, distress_type, amount, auction_date, opening_bid,
        default_amount, delinquent_tax_year, delinquent_tax_amount, owner_type, notes, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [propertyId, row.distressType, row.amount, row.auctionDate, row.openingBid,
       row.defaultAmount, row.delinquentTaxYear, row.delinquentTaxAmount, row.ownerType,
       row.notes, row.source]
    );
  }
  caches.distressDedupCache.add(dk);
  report.distress.created++;
}

// ============================================================
// SHEET 2: LOAN MATURITY — process a single row
// ============================================================

async function processLoanRow(row, rowNum, client, caches, report, dryRun) {
  if (!row.address) {
    report.skipped.push({ rowNum, sheet: 'loans', reason: 'no address' });
    return;
  }

  const property = findProperty(row, caches, report.fuzzyMatches, rowNum);
  let propertyId = property ? property.property_id : null;

  if (!property) {
    report.skipped.push({ rowNum, sheet: 'loans', reason: `no property match: "${row.address}"` });
    return;
  }

  report.properties.matched++;

  // Enrich
  const enrichData = {};
  if (row.propertyName) enrichData.property_name = row.propertyName;
  if (row.sf) enrichData.rba = row.sf;
  if (row.yearBuilt) enrichData.year_built = row.yearBuilt;
  if (row.ownerBorrower) enrichData.owner_name = row.ownerBorrower;

  if (Object.keys(enrichData).length > 0) {
    const didEnrich = await enrichProperty(property, enrichData, client, dryRun);
    if (didEnrich) report.properties.enriched++;
  }

  // Dedup
  const dateKey = row.maturityDate ? String(row.maturityDate).split('T')[0] : '';
  const dk = `${propertyId}|${(row.lender || '').toLowerCase()}|${dateKey}`;
  if (caches.loanDedupCache.has(dk)) {
    report.skipped.push({ rowNum, sheet: 'loans', reason: 'duplicate (property + lender + maturity_date)' });
    return;
  }

  // Insert
  if (!dryRun) {
    await client.query(
      `INSERT INTO loan_maturities (property_id, lender, loan_amount, loan_type, interest_rate, rate_type,
        origination_date, maturity_date, months_past_due, ltv, loan_duration_years, loan_purpose,
        est_value, portfolio, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [propertyId, row.lender, row.loanAmount, row.loanType, row.interestRate, row.rateType,
       row.originationDate, row.maturityDate, row.monthsPastDue, row.ltv, row.loanDurationYears,
       row.loanPurpose, row.estValue, row.portfolio, row.source]
    );
  }
  caches.loanDedupCache.add(dk);
  report.loans.created++;
}

// ============================================================
// SHEET 3: TENANT GROWTH — process a single row
// ============================================================

async function processGrowthRow(row, rowNum, client, caches, report, dryRun) {
  if (!row.companyName) {
    report.skipped.push({ rowNum, sheet: 'growth', reason: 'no company name' });
    return;
  }

  // Find or create company
  let company = findCompany(row.companyName, caches, report.fuzzyMatches, rowNum);
  let companyId;

  if (company) {
    companyId = company.company_id;
    report.companies.matched++;
  } else {
    if (!dryRun) {
      const { rows } = await client.query(
        `INSERT INTO companies (company_name, company_type) VALUES ($1, 'tenant') RETURNING company_id`,
        [row.companyName]
      );
      companyId = rows[0].company_id;
      const norm = normalizeCompanyName(row.companyName);
      if (norm) caches.companyCache.set(norm, { company_id: companyId, company_name: row.companyName, company_type: 'tenant' });
    }
    report.companies.created++;
  }

  // Find property (optional for tenant_growth — row is still useful without it)
  let propertyId = null;
  if (row.address) {
    const property = findProperty(row, caches, report.fuzzyMatches, rowNum);
    if (property) {
      propertyId = property.property_id;
      report.properties.matched++;

      // Link company to property via junction if not already linked
      if (!dryRun && companyId) {
        await upsertJunction(client, 'property_companies', { property_id: propertyId, company_id: companyId, role: 'tenant' }, report);
      }
    }
  }

  // Dedup: company_id + property_id + data_date (use today as data_date since no date column)
  const today = new Date().toISOString().split('T')[0];
  const dk = `${companyId || ''}|${propertyId || ''}|${today}`;
  if (caches.growthDedupCache.has(dk)) {
    report.skipped.push({ rowNum, sheet: 'growth', reason: 'duplicate (company + property + data_date)' });
    return;
  }

  // Insert
  if (!dryRun) {
    await client.query(
      `INSERT INTO tenant_growth (company_id, property_id, headcount_current, headcount_previous,
        growth_rate, sf_occupied, sf_per_employee, occupancy_type, time_in_building, growth_score,
        data_date, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [companyId || null, propertyId, row.headcountCurrent, row.headcountPrevious,
       row.growthRate, row.sfOccupied, row.sfPerEmployee, row.occupancyType,
       row.timeInBuilding, row.growthScore, today, row.source]
    );
  }
  caches.growthDedupCache.add(dk);
  report.growth.created++;
}

// ============================================================
// SHEET 4: DEBT & STRESS — process a single row
// ============================================================

async function processDebtRow(row, rowNum, client, caches, report, dryRun) {
  if (!row.address) {
    report.skipped.push({ rowNum, sheet: 'debt', reason: 'no address' });
    return;
  }

  const property = findProperty(row, caches, report.fuzzyMatches, rowNum);
  let propertyId = property ? property.property_id : null;

  if (!property) {
    report.skipped.push({ rowNum, sheet: 'debt', reason: `no property match: "${row.address}"` });
    return;
  }

  report.properties.matched++;

  // Enrich
  const enrichData = {};
  if (row.ownerName) enrichData.owner_name = row.ownerName;
  if (row.buildingSf) enrichData.rba = row.buildingSf;

  if (Object.keys(enrichData).length > 0) {
    const didEnrich = await enrichProperty(property, enrichData, client, dryRun);
    if (didEnrich) report.properties.enriched++;
  }

  // Dedup
  const dateKey = row.originationDate ? String(row.originationDate).split('T')[0] : '';
  const dk = `${propertyId}|${(row.lender || '').toLowerCase()}|${dateKey}|${row.originationAmount || ''}`;
  if (caches.debtDedupCache.has(dk)) {
    report.skipped.push({ rowNum, sheet: 'debt', reason: 'duplicate (property + lender + origination_date + amount)' });
    return;
  }

  // Insert
  if (!dryRun) {
    await client.query(
      `INSERT INTO debt_stress (property_id, lender, loan_type, interest_rate, rate_type,
        origination_date, origination_amount, balloon_5yr, balloon_7yr, balloon_10yr,
        balloon_confidence, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [propertyId, row.lender, row.loanType, row.interestRate, row.rateType,
       row.originationDate, row.originationAmount, row.balloon5yr, row.balloon7yr,
       row.balloon10yr, row.balloonConfidence, row.source]
    );
  }
  caches.debtDedupCache.add(dk);
  report.debt.created++;
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

async function processTPEData(sheets, pool, options = {}) {
  const { dryRun = false, selectedSheets = ['distress', 'loans', 'growth', 'debt'] } = options;
  const client = await pool.connect();

  const BATCH_SIZE = 100;

  const report = {
    properties: { matched: 0, enriched: 0 },
    companies: { created: 0, matched: 0 },
    distress: { created: 0 },
    loans: { created: 0 },
    growth: { created: 0 },
    debt: { created: 0 },
    junctions: { created: 0, skipped: 0 },
    fuzzyMatches: [],
    errors: [],
    skipped: [],
  };

  try {
    console.log(`[tpe-engine] Loading caches from database...`);
    const caches = await loadCaches(client);
    console.log(`[tpe-engine] Loaded ${caches.propertyCache.size} properties, ${caches.companyCache.size} companies`);
    console.log(`[tpe-engine] Dedup: ${caches.distressDedupCache.size} distress, ${caches.loanDedupCache.size} loans, ${caches.growthDedupCache.size} growth, ${caches.debtDedupCache.size} debt`);

    // Process each sheet in order
    const sheetConfigs = [
      { key: 'distress', label: 'Distress', processFn: processDistressRow },
      { key: 'loans', label: 'Loan Maturity', processFn: processLoanRow },
      { key: 'growth', label: 'Tenant Growth', processFn: processGrowthRow },
      { key: 'debt', label: 'Debt & Stress', processFn: processDebtRow },
    ];

    for (const cfg of sheetConfigs) {
      if (!selectedSheets.includes(cfg.key)) continue;
      const rows = sheets[cfg.key];
      if (!rows || rows.length === 0) {
        console.log(`[tpe-engine] ${cfg.label}: no rows, skipping`);
        continue;
      }

      console.log(`\n[tpe-engine] Processing ${cfg.label}: ${rows.length} rows...`);

      // Process in batches
      for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);

        if (!dryRun) await client.query('BEGIN');

        for (let i = batchStart; i < batchEnd; i++) {
          try {
            if (!dryRun) await client.query(`SAVEPOINT row_${cfg.key}_${i}`);
            await cfg.processFn(rows[i], i, client, caches, report, dryRun);
            if (!dryRun) await client.query(`RELEASE SAVEPOINT row_${cfg.key}_${i}`);
          } catch (err) {
            if (!dryRun) await client.query(`ROLLBACK TO SAVEPOINT row_${cfg.key}_${i}`);
            report.errors.push({ rowNum: i, sheet: cfg.key, address: rows[i].address, message: err.message });
          }
        }

        if (!dryRun) await client.query('COMMIT');

        if (batchEnd % 100 === 0 || batchEnd === rows.length) {
          console.log(`[tpe-engine] ${cfg.label}: ${batchEnd}/${rows.length} rows (${Math.round(batchEnd / rows.length * 100)}%)`);
        }
      }
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
  processTPEData,
  loadCaches,
  findProperty,
  findCompany,
  enrichProperty,
};
