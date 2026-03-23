# Airtable Properties CSV Import — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import ~12,938 Airtable property CSV rows into IE CRM, fanning out across properties, companies, contacts, interactions, and junction tables with fuzzy matching and enrich-only semantics.

**Architecture:** Parser (`airtablePropertyParser.js`) converts CSV rows to canonical shape → Engine (`airtablePropertyEngine.js`) loads in-memory caches, matches/creates/enriches entities with SAVEPOINT-per-row transactions → CLI runner (`migrate-airtable-properties.js`) orchestrates the pipeline with dry-run and live modes.

**Tech Stack:** Node.js, pg (PostgreSQL), xlsx (CSV parsing), shared `addressNormalizer.js` and `rowParsers.js` utilities.

**Spec:** `docs/superpowers/specs/2026-03-14-airtable-properties-import-design.md`

---

## Chunk 1: Parser + Engine + Runner

### Task 1: Create airtablePropertyParser.js

**Files:**
- Create: `ie-crm/server/utils/airtablePropertyParser.js`

- [ ] **Step 1: Create the parser file**

This parser converts raw CSV rows into the canonical shape the engine expects. It reuses `cleanStr`, `cleanNum`, `cleanDate` from `rowParsers.js`.

```javascript
// ie-crm/server/utils/airtablePropertyParser.js
// Airtable Properties CSV row parser — converts raw CSV row to canonical shape.
// Reuses cleanStr/cleanNum/cleanDate from rowParsers.js.

const { cleanStr, cleanNum, cleanDate } = require('./rowParsers');

/**
 * Parse a raw Airtable properties CSV row into canonical shape.
 * @param {Object} raw — key/value from xlsx sheet_to_json
 * @returns {Object} canonical row
 */
function parseAirtableRow(raw) {
  // --- Properties fields ---
  const address = cleanStr(raw['Property Address']);
  const city = cleanStr(raw['City']);
  const state = cleanStr(raw['State']) || 'CA';
  const zip = cleanStr(raw['Zip']);
  const propertyType = cleanStr(raw['PropertyType']);
  const propertyName = cleanStr(raw['Property Name']);
  const buildingStatus = cleanStr(raw['Building Status']);
  const buildingClass = cleanStr(raw['Building Class']);
  const yearBuilt = cleanNum(raw['Year Built']);
  const yearRenovated = cleanNum(raw['Year Renovated']);
  const rba = cleanNum(raw['RBA']);
  const stories = cleanNum(raw['Number Of Stories']);
  const landAreaAc = cleanNum(raw['Land Area (AC)']);
  const landSf = cleanNum(raw['Land SF']);
  const far = cleanNum(raw['FAR']);
  const zoning = cleanStr(raw['Zoning']);
  const power = cleanStr(raw['Power']);
  const ceilingHt = cleanNum(raw['Ceiling Ht']);
  const clearHt = cleanNum(raw['Clear Ht']);
  const loadingDocks = cleanNum(raw['Number Of Loading Docks']);
  const driveIns = cleanNum(raw['Drive Ins']);
  const columnSpacing = cleanStr(raw['Column Spacing']);
  const sprinklers = cleanStr(raw['Sprinklers']);
  const cranes = cleanNum(raw['Number Of Cranes']);
  const constructionMaterial = cleanStr(raw['Construction Material']);
  const railLines = cleanStr(raw['Rail Lines']);
  const parkingSpaces = cleanNum(raw['Number Of Parking Spaces']);
  const parkingRatio = cleanNum(raw['Parking Ratio']);
  const features = cleanStr(raw['Features']);
  const lastSaleDate = cleanDate(raw['Last Sale Date']);
  const lastSalePrice = cleanNum(raw['Last Sale Price']);
  const pricePsf = cleanNum(raw['Price PSF']);
  const rentPsfMo = cleanNum(raw['Rent/SF/Mo']);
  const debtDate = cleanDate(raw['Debt Date']);
  const loanAmount = cleanNum(raw['Loan Amount']);
  const buildingPark = cleanStr(raw['Building Park']);
  const county = cleanStr(raw['County']);
  const ownerType = cleanStr(raw['Owner Type']);
  const costarUrl = cleanStr(raw['Costar']);
  const landvisionUrl = cleanStr(raw['Landvision']);
  const heating = cleanStr(raw['Heating']);
  const sewer = cleanStr(raw['Sewer']);
  const water = cleanStr(raw['Water']);
  const gas = cleanStr(raw['Gas']);

  // Contacted? — comma-separated multi-select → array
  const contactedRaw = cleanStr(raw['Contacted?']);
  const contacted = contactedRaw
    ? contactedRaw.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  // Overflow JSONB fields (no dedicated column)
  const overflow = {};
  const rateType = cleanStr(raw['Rate Type']);
  if (rateType) overflow.rate_type = rateType;
  const maxContiguous = cleanNum(raw['Max Building Contiguous Space']);
  if (maxContiguous) overflow.max_contiguous_sf = maxContiguous;

  // --- Contacts ---
  const ownerContact = cleanStr(raw['Owner Contact']);
  const brokerContact = cleanStr(raw['Broker Contact']);

  // --- Companies ---
  const companyOwner = cleanStr(raw['(Company) Owner']);

  // (Company) Tenants — may be comma-separated
  const tenantsRaw = cleanStr(raw['(Company) Tenants']);
  const companyTenants = tenantsRaw
    ? tenantsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const industryType = cleanStr(raw['Industry Type (from (Company) Tenants) 2']);

  // --- Notes ---
  const notes = cleanStr(raw['Notes']);

  // --- Reference (logged but not auto-linked) ---
  const jrDealsCopy = cleanStr(raw['Jr Deals copy']);

  return {
    // Properties
    address, city, state, zip, propertyType, propertyName,
    buildingStatus, buildingClass, yearBuilt, yearRenovated,
    rba, stories, landAreaAc, landSf, far, zoning, power,
    ceilingHt, clearHt, loadingDocks, driveIns, columnSpacing,
    sprinklers, cranes, constructionMaterial, railLines,
    parkingSpaces, parkingRatio, features,
    lastSaleDate, lastSalePrice, pricePsf, rentPsfMo,
    debtDate, loanAmount, buildingPark, county, ownerType,
    costarUrl, landvisionUrl, heating, sewer, water, gas,
    contacted, overflow,
    // Contacts
    ownerContact, brokerContact,
    // Companies
    companyOwner, companyTenants, industryType,
    // Notes
    notes,
    // Reference
    jrDealsCopy,
    // Source
    source: 'Airtable',
  };
}

/**
 * Parse free-text notes into individual interaction entries.
 * Splits on newlines/semicolons and extracts embedded dates.
 * @param {string} rawNotes
 * @returns {Array<{date: string|null, text: string}>}
 */
function parseNotes(rawNotes) {
  if (!rawNotes || typeof rawNotes !== 'string') return [];

  const DATE_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s*\d{2,4})/gi;

  // Split on newlines and semicolons
  const segments = rawNotes
    .split(/[\n;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (segments.length === 0) return [];

  return segments.map(segment => {
    const dateMatch = segment.match(DATE_RE);
    let date = null;

    if (dateMatch) {
      date = parseFreeTextDate(dateMatch[0]);
      // Remove the date from the text
      const text = segment.replace(dateMatch[0], '').replace(/^\s*[-–—:]\s*/, '').trim();
      return { date, text: text || segment };
    }

    return { date: null, text: segment };
  });
}

/**
 * Parse a date string from free text, handling 2-digit years.
 * @param {string} raw
 * @returns {string|null} ISO date string (YYYY-MM-DD)
 */
function parseFreeTextDate(raw) {
  if (!raw) return null;

  // Handle M/D/YY or MM/DD/YYYY
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    let [, month, day, year] = slashMatch;
    year = parseInt(year, 10);
    // 2-digit year expansion
    if (year < 100) {
      year = year >= 50 ? 1900 + year : 2000 + year;
    }
    const d = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  // Fallback to Date constructor
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

module.exports = {
  parseAirtableRow,
  parseNotes,
  parseFreeTextDate,
};
```

- [ ] **Step 2: Verify parser loads without errors**

Run: `cd ie-crm && node -e "const p = require('./server/utils/airtablePropertyParser'); console.log(Object.keys(p));"`
Expected: `[ 'parseAirtableRow', 'parseNotes', 'parseFreeTextDate' ]`

- [ ] **Step 3: Test parser against real CSV data**

Run:
```bash
cd ie-crm && node -e "
const XLSX = require('xlsx');
const { parseAirtableRow, parseNotes } = require('./server/utils/airtablePropertyParser');
const wb = XLSX.readFile('/Users/davidmudgejr/Downloads/Properties-All (DONT DELETE).csv');
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
const parsed = parseAirtableRow(rows[0]);
console.log('First row parsed:');
console.log(JSON.stringify(parsed, null, 2));
// Count non-null fields
const filled = Object.entries(parsed).filter(([k,v]) => v !== null && v !== undefined && (!Array.isArray(v) || v.length > 0)).length;
console.log('Filled fields:', filled, '/', Object.keys(parsed).length);
// Test notes parsing
const notesRows = rows.filter(r => r['Notes']).slice(0, 3);
for (const r of notesRows) {
  console.log('\\nNotes:', r['Notes']);
  console.log('Parsed:', JSON.stringify(parseNotes(r['Notes'])));
}
"
```
Expected: Parsed row with address, city, property fields filled. Notes parsed into segments.

- [ ] **Step 4: Commit**

```bash
git add ie-crm/server/utils/airtablePropertyParser.js
git commit -m "feat: add Airtable properties CSV parser"
```

---

### Task 2: Create airtablePropertyEngine.js

**Files:**
- Create: `ie-crm/server/utils/airtablePropertyEngine.js`

- [ ] **Step 1: Create the engine file**

This is the core fan-out engine. It follows the same pattern as `leaseCompEngine.js` but adapted for property-centric data with notes→interactions support.

```javascript
// ie-crm/server/utils/airtablePropertyEngine.js
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
            last_sale_date, last_sale_price, price_psf, rent_psf_mo,
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
  rentPsfMo: 'rent_psf_mo',
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

  // 2. OWNER COMPANY — find or create
  let ownerCompanyId = null;
  if (row.companyOwner) {
    const existing = findCompany(row.companyOwner, caches, report.fuzzyMatches, rowNum);
    if (existing) {
      ownerCompanyId = existing.company_id;
      report.companies.matched++;
    } else {
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO companies (company_name, company_type) VALUES ($1, 'owner') RETURNING company_id`,
          [row.companyOwner]
        );
        ownerCompanyId = rows[0].company_id;
        const norm = normalizeCompanyName(row.companyOwner);
        if (norm) caches.companyCache.set(norm, { company_id: ownerCompanyId, company_name: row.companyOwner, company_type: 'owner' });
      }
      report.companies.created++;
    }
    // Junction: property_companies (role='owner')
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

  // 4. OWNER CONTACT — find or create
  let ownerContactId = null;
  if (row.ownerContact) {
    const existing = findContact(row.ownerContact, caches, report.fuzzyMatches, rowNum);
    if (existing) {
      ownerContactId = existing.contact_id;
      report.contacts.matched++;
    } else {
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO contacts (full_name, type) VALUES ($1, 'owner') RETURNING contact_id`,
          [row.ownerContact]
        );
        ownerContactId = rows[0].contact_id;
        const norm = normalizeContactName(row.ownerContact);
        if (norm) {
          const entry = { contact_id: ownerContactId, full_name: row.ownerContact };
          if (!caches.contactCache.has(norm)) caches.contactCache.set(norm, []);
          caches.contactCache.get(norm).push(entry);
        }
      }
      report.contacts.created++;
    }
    if (ownerContactId && propertyId && !dryRun) {
      await upsertJunction(client, 'property_contacts', { property_id: propertyId, contact_id: ownerContactId, role: 'owner' }, report);
    }
    // Link owner contact to owner company
    if (ownerContactId && ownerCompanyId && !dryRun) {
      await upsertJunction(client, 'contact_companies', { contact_id: ownerContactId, company_id: ownerCompanyId }, report);
    }
  }

  // 5. BROKER CONTACT — find or create
  // Track which contacts are already linked to avoid PK violation
  const linkedContactIds = new Set();
  if (ownerContactId) linkedContactIds.add(ownerContactId);

  if (row.brokerContact) {
    const existing = findContact(row.brokerContact, caches, report.fuzzyMatches, rowNum);
    let brokerContactId;
    if (existing) {
      brokerContactId = existing.contact_id;
      report.contacts.matched++;
    } else {
      if (!dryRun) {
        const { rows } = await client.query(
          `INSERT INTO contacts (full_name, type) VALUES ($1, 'broker') RETURNING contact_id`,
          [row.brokerContact]
        );
        brokerContactId = rows[0].contact_id;
        const norm = normalizeContactName(row.brokerContact);
        if (norm) {
          const entry = { contact_id: brokerContactId, full_name: row.brokerContact };
          if (!caches.contactCache.has(norm)) caches.contactCache.set(norm, []);
          caches.contactCache.get(norm).push(entry);
        }
      }
      report.contacts.created++;
    }
    // Edge case: same person as owner + broker → skip second junction insert
    if (brokerContactId && propertyId && !linkedContactIds.has(brokerContactId) && !dryRun) {
      await upsertJunction(client, 'property_contacts', { property_id: propertyId, contact_id: brokerContactId, role: 'broker' }, report);
    } else if (brokerContactId && linkedContactIds.has(brokerContactId)) {
      report.warnings.push({ rowNum, message: `Same contact "${row.brokerContact}" is both owner and broker for property "${row.address}" — first role (owner) kept` });
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

  try {
    console.log(`[airtable-engine] Loading caches from database...`);
    const caches = await loadCaches(client);
    console.log(`[airtable-engine] Loaded ${caches.propertyCache.size} properties, ${caches.companyCache.size} companies, ${caches.contactCache.size} contacts`);

    if (!dryRun) await client.query('BEGIN');

    for (let i = 0; i < rows.length; i++) {
      try {
        if (!dryRun) await client.query(`SAVEPOINT row_${i}`);
        await processRow(rows[i], i, client, caches, report, dryRun);
        if (!dryRun) await client.query(`RELEASE SAVEPOINT row_${i}`);
      } catch (err) {
        if (!dryRun) await client.query(`ROLLBACK TO SAVEPOINT row_${i}`);
        report.errors.push({ rowNum: i, address: rows[i].address, message: err.message });
      }

      if ((i + 1) % 500 === 0) {
        console.log(`[airtable-engine] Processed ${i + 1}/${rows.length} rows...`);
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
  processAirtableProperties,
  generateGapReport,
  loadCaches,
  findProperty,
  findCompany,
  findContact,
};
```

- [ ] **Step 2: Verify engine loads without errors**

Run: `cd ie-crm && node -e "const e = require('./server/utils/airtablePropertyEngine'); console.log(Object.keys(e));"`
Expected: `[ 'processAirtableProperties', 'generateGapReport', 'loadCaches', 'findProperty', 'findCompany', 'findContact' ]`

- [ ] **Step 3: Commit**

```bash
git add ie-crm/server/utils/airtablePropertyEngine.js
git commit -m "feat: add Airtable properties import engine with fuzzy matching"
```

---

### Task 3: Create migrate-airtable-properties.js CLI runner

**Files:**
- Create: `ie-crm/scripts/migrate-airtable-properties.js`

- [ ] **Step 1: Create the CLI runner**

```javascript
#!/usr/bin/env node
// migrate-airtable-properties.js — CLI runner for Airtable properties CSV import.
// Usage:
//   node scripts/migrate-airtable-properties.js --dry-run   # preview only
//   node scripts/migrate-airtable-properties.js --live       # commit to DB

const { Pool } = require('pg');
const XLSX = require('xlsx');
const { parseAirtableRow } = require('../server/utils/airtablePropertyParser');
const { processAirtableProperties } = require('../server/utils/airtablePropertyEngine');

const CSV_PATH = process.env.CSV_PATH || '/Users/davidmudgejr/Downloads/Properties-All (DONT DELETE).csv';
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const live = args.includes('--live');

  if (!dryRun && !live) {
    console.error('Usage: node scripts/migrate-airtable-properties.js [--dry-run | --live]');
    process.exit(1);
  }

  if (!DATABASE_URL) {
    console.error('Missing DATABASE_URL or NEON_DATABASE_URL environment variable');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Airtable Properties CSV Import — ${dryRun ? 'DRY RUN' : '🔴 LIVE'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Read CSV
  console.log(`[cli] Reading CSV: ${CSV_PATH}`);
  const wb = XLSX.readFile(CSV_PATH);
  const sheetName = wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
  console.log(`[cli] Parsed ${rawRows.length} rows from sheet "${sheetName}"`);

  // Parse all rows
  console.log(`[cli] Parsing rows...`);
  const parsedRows = rawRows.map(raw => parseAirtableRow(raw));
  const withAddress = parsedRows.filter(r => r.address);
  console.log(`[cli] ${withAddress.length} rows have addresses (${parsedRows.length - withAddress.length} skipped — no address)`);

  // Run engine
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    const report = await processAirtableProperties(withAddress, pool, { dryRun });

    // Print report
    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESULTS — ${dryRun ? 'DRY RUN (no data written)' : 'COMMITTED'}`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`Properties:  ${report.properties.created} created, ${report.properties.matched} matched, ${report.properties.enriched} enriched`);
    console.log(`Companies:   ${report.companies.created} created, ${report.companies.matched} matched`);
    console.log(`Contacts:    ${report.contacts.created} created, ${report.contacts.matched} matched`);
    console.log(`Interactions: ${report.interactions.created} created`);
    console.log(`Junctions:   ${report.junctions.created} created, ${report.junctions.skipped} skipped`);
    console.log(`Errors:      ${report.errors.length}`);
    console.log(`Warnings:    ${report.warnings.length}`);

    if (report.fuzzyMatches.length > 0) {
      console.log(`\n--- Fuzzy Matches (${report.fuzzyMatches.length}) ---`);
      const reviews = report.fuzzyMatches.filter(m => m.review);
      console.log(`  ⚠️  ${reviews.length} flagged for REVIEW (90-94% similarity)`);
      for (const m of reviews.slice(0, 20)) {
        console.log(`  [row ${m.rowNum}] ${m.type}: "${m.original}" → "${m.matchedTo}" (${(m.similarity * 100).toFixed(1)}%)`);
      }
      if (reviews.length > 20) console.log(`  ... and ${reviews.length - 20} more`);
    }

    if (report.errors.length > 0) {
      console.log(`\n--- Errors (${report.errors.length}) ---`);
      for (const e of report.errors.slice(0, 20)) {
        console.log(`  [row ${e.rowNum}] ${e.address || 'no address'}: ${e.message}`);
      }
      if (report.errors.length > 20) console.log(`  ... and ${report.errors.length - 20} more`);
    }

    if (report.warnings.length > 0) {
      console.log(`\n--- Warnings (${report.warnings.length}) ---`);
      for (const w of report.warnings.slice(0, 10)) {
        console.log(`  [row ${w.rowNum}] ${w.message}`);
      }
    }

    if (report.dealRefs.length > 0) {
      console.log(`\n--- Deal References (${report.dealRefs.length}) — manual review needed ---`);
      for (const d of report.dealRefs.slice(0, 10)) {
        console.log(`  [row ${d.rowNum}] ${d.address}: "${d.dealRef}"`);
      }
      if (report.dealRefs.length > 10) console.log(`  ... and ${report.dealRefs.length - 10} more`);
    }

    if (report.dataGaps) {
      console.log(`\n--- Data Gap Report ---`);
      const g = report.dataGaps;
      console.log(`  Total properties:     ${g.total}`);
      console.log(`  Missing lat/long:     ${g.missing_lat_long} (${pct(g.missing_lat_long, g.total)})`);
      console.log(`  Missing RBA:          ${g.missing_rba} (${pct(g.missing_rba, g.total)})`);
      console.log(`  Missing last sale:    ${g.missing_last_sale} (${pct(g.missing_last_sale, g.total)})`);
      console.log(`  Missing year built:   ${g.missing_year_built} (${pct(g.missing_year_built, g.total)})`);
      console.log(`  Missing zoning:       ${g.missing_zoning} (${pct(g.missing_zoning, g.total)})`);
      console.log(`  Missing owner contact: ${g.missing_owner_contact} (${pct(g.missing_owner_contact, g.total)})`);
    }

    // Write full report to JSON file
    const reportPath = `/tmp/airtable-import-report-${dryRun ? 'dry' : 'live'}-${Date.now()}.json`;
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nFull report saved to: ${reportPath}`);

  } finally {
    await pool.end();
  }
}

function pct(n, total) {
  return total > 0 ? `${((n / total) * 100).toFixed(1)}%` : '0%';
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify script loads**

Run: `cd ie-crm && node scripts/migrate-airtable-properties.js`
Expected: Error message "Usage: node scripts/migrate-airtable-properties.js [--dry-run | --live]"

- [ ] **Step 3: Commit**

```bash
git add ie-crm/scripts/migrate-airtable-properties.js
git commit -m "feat: add Airtable properties CSV migration CLI runner"
```

---

### Task 4: Run dry-run migration

- [ ] **Step 1: Run dry run against real data**

Run:
```bash
cd ie-crm && node scripts/migrate-airtable-properties.js --dry-run
```

Expected: Report showing counts of properties/companies/contacts that would be created/matched/enriched. Zero errors. Fuzzy matches flagged for review.

- [ ] **Step 2: Review dry-run output**

Check:
- Row count matches expected (~12,938 with addresses)
- Properties created + matched = total rows with addresses
- No unexpected errors
- Fuzzy matches look reasonable (address typos, not different buildings)

- [ ] **Step 3: Fix any issues found during dry run**

If errors or unexpected results, fix the parser or engine and re-run dry run.

---

### Task 5: Run live migration

- [ ] **Step 1: Run live migration**

Run:
```bash
cd ie-crm && node scripts/migrate-airtable-properties.js --live
```

Expected: Same counts as dry run, data committed to database.

- [ ] **Step 2: Verify counts in database**

Run verification queries:
```bash
cd ie-crm && node -e "
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.NEON_DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const r = await pool.query('SELECT COUNT(*) FROM properties');
  console.log('Properties:', r.rows[0].count);
  const c = await pool.query('SELECT COUNT(*) FROM companies');
  console.log('Companies:', c.rows[0].count);
  const ct = await pool.query('SELECT COUNT(*) FROM contacts');
  console.log('Contacts:', ct.rows[0].count);
  const i = await pool.query('SELECT COUNT(*) FROM interactions WHERE lead_source = \'airtable_import\'');
  console.log('Interactions (airtable):', i.rows[0].count);
  await pool.end();
})();
"
```

- [ ] **Step 3: Spot-check a few records**

Verify a property with known data has correct owner contact, tenant company, and notes linked.

- [ ] **Step 4: Commit all files**

```bash
git add -A
git commit -m "feat: complete Airtable properties CSV import — 12,938 rows migrated"
```
