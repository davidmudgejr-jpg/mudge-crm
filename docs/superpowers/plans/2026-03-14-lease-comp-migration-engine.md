# Lease Comp Migration Engine — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable engine that fans out CoStar lease comp rows across properties, companies, contacts, lease_comps, and junction tables — then run the initial 9,730-row migration.

**Architecture:** One core engine (`leaseCompEngine.js`) with fuzzy matching and fan-out logic, consumed by a migration script (one-time), an agent API endpoint (recurring), and a gap report generator. Pre-migration schema fixes in migration 009.

**Tech Stack:** Node.js, PostgreSQL (Neon), `xlsx` npm package for Excel parsing, existing `addressNormalizer.js` + `compositeMatcher.js` utilities.

**Spec:** `docs/superpowers/specs/2026-03-14-lease-comp-migration-engine-design.md`

---

## Task 1: Migration 009 — Pre-Migration Schema Fixes

**Files:**
- Create: `ie-crm/migrations/009_pre_migration_fixes.sql`

Three schema issues must be fixed before the engine can run.

- [ ] **Step 1: Write migration 009**

```sql
-- Migration 009: Pre-migration fixes for lease comp engine
-- 1. lease_comps.escalations NUMERIC → TEXT (CoStar sends "2.00%", "$0.03/sf/yr")
-- 2. property_companies PK adds role (allows same company as tenant + leasing on same property)
-- 3. normalized_address trigger aligned with JS normalizer (~20 abbreviations)

BEGIN;

-- 1. escalations: NUMERIC → TEXT
ALTER TABLE lease_comps ALTER COLUMN escalations TYPE TEXT;

-- 2. property_companies: expand PK to include role
-- MUST update NULLs and dedup BEFORE changing PK (NOT NULL constraint would fail otherwise)
UPDATE property_companies SET role = 'unknown' WHERE role IS NULL;
-- Remove duplicates that would collide under new composite PK (keep one)
DELETE FROM property_companies a USING property_companies b
  WHERE a.ctid < b.ctid
    AND a.property_id = b.property_id
    AND a.company_id = b.company_id
    AND a.role = b.role;
ALTER TABLE property_companies ALTER COLUMN role SET NOT NULL;
ALTER TABLE property_companies ALTER COLUMN role SET DEFAULT 'unknown';
ALTER TABLE property_companies DROP CONSTRAINT property_companies_pkey;
ALTER TABLE property_companies ADD PRIMARY KEY (property_id, company_id, role);

-- 3. Align normalized_address trigger with JS normalizer
-- The JS normalizer handles ~20 street abbreviations; the trigger only had 3.
CREATE OR REPLACE FUNCTION compute_normalized_address()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.property_address IS NOT NULL THEN
    NEW.normalized_address := TRIM(REGEXP_REPLACE(
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE(
              REGEXP_REPLACE(
                LOWER(SPLIT_PART(NEW.property_address, ',', 1)),
                '[.,#]', ' ', 'g'
              ),
              '\s+', ' ', 'g'
            ),
            '\s+(suite|ste|unit|apt|apartment|bldg|building|fl|floor|rm|room)\s.*$', '', 'i'
          ),
          -- Street type abbreviations (matching addressNormalizer.js STREET_ABBREVS)
          '\m(street)\M', 'st', 'gi'
        ),
        '\m(avenue)\M', 'ave', 'gi'
      ),
      '\m(boulevard)\M', 'blvd', 'gi'
    ));
    -- Additional abbreviations via sequential replaces
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(drive)\M', 'dr', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(road)\M', 'rd', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(lane)\M', 'ln', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(circle)\M', 'cir', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(court)\M', 'ct', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(place)\M', 'pl', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(terrace)\M', 'ter', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(trail)\M', 'trl', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(parkway)\M', 'pkwy', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(highway)\M', 'hwy', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(freeway)\M', 'fwy', 'gi');
    -- Directional abbreviations
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(north)\M', 'n', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(south)\M', 's', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(east)\M', 'e', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(west)\M', 'w', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(northeast)\M', 'ne', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(northwest)\M', 'nw', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(southeast)\M', 'se', 'gi');
    NEW.normalized_address := REGEXP_REPLACE(NEW.normalized_address, '\m(southwest)\M', 'sw', 'gi');
    -- Collapse whitespace one more time after all replacements
    NEW.normalized_address := TRIM(REGEXP_REPLACE(NEW.normalized_address, '\s+', ' ', 'g'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-normalize all existing properties with the updated trigger logic
UPDATE properties SET property_address = property_address WHERE property_address IS NOT NULL;

COMMIT;
```

- [ ] **Step 2: Run migration against Neon DB**

```bash
cd ie-crm && psql "$DATABASE_URL" -f migrations/009_pre_migration_fixes.sql
```

Expected: All 3 statements succeed. Verify with:
```bash
psql "$DATABASE_URL" -c "\d lease_comps" | grep escalations
# Should show: escalations | text

psql "$DATABASE_URL" -c "\d property_companies"
# PK should show (property_id, company_id, role)
```

- [ ] **Step 3: Commit migration**

```bash
git add ie-crm/migrations/009_pre_migration_fixes.sql
git commit -m "migration(009): pre-migration fixes for lease comp engine

- escalations NUMERIC → TEXT (CoStar mixed formats)
- property_companies PK adds role (multi-role junctions)
- normalized_address trigger aligned with JS normalizer (~20 abbreviations)"
```

---

## Task 2: Add `normalizeContactName()` to addressNormalizer.js

**Files:**
- Modify: `ie-crm/server/utils/addressNormalizer.js`

- [ ] **Step 1: Add the function after `normalizeCompanyName()`**

Add this function at line ~177 (after `normalizeCompanyName`, before `levenshtein`):

```javascript
/**
 * Normalize a contact name for matching.
 * Strips CRE designations (SIOR, CCIM, etc.), lowercases, trims.
 */
function normalizeContactName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw
    .replace(/,?\s*\b(SIOR|CCIM|CPA|Esq|Jr|Sr|III|II|MBA|PhD|PE|AIA|LEED\s*AP)\b\.?/gi, '')
    .replace(/[.,]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim() || null;
}
```

- [ ] **Step 2: Add to module.exports**

Update the `module.exports` block to include `normalizeContactName`:

```javascript
module.exports = {
  normalizeAddress,
  parseAddress,
  normalizeUnit,
  normalizeCompanyName,
  normalizeContactName,
  levenshtein,
  similarity,
};
```

- [ ] **Step 3: Verify with a quick test**

```bash
cd ie-crm && node -e "
const { normalizeContactName } = require('./server/utils/addressNormalizer');
console.log(normalizeContactName('Joey Sugar, SIOR'));       // 'joey sugar'
console.log(normalizeContactName('Clyde Stauff, SIOR'));     // 'clyde stauff'
console.log(normalizeContactName('Mike Chavez'));             // 'mike chavez'
console.log(normalizeContactName('John Smith Jr'));           // 'john smith'
console.log(normalizeContactName('Jane Doe, CCIM, SIOR'));   // 'jane doe'
console.log(normalizeContactName(null));                      // null
"
```

- [ ] **Step 4: Commit**

```bash
git add ie-crm/server/utils/addressNormalizer.js
git commit -m "feat: add normalizeContactName() for broker designation stripping"
```

---

## Task 3: Build Row Parsers (`rowParsers.js`)

**Files:**
- Create: `ie-crm/server/utils/rowParsers.js`

This module converts source-specific raw data into a normalized row shape consumed by the engine.

- [ ] **Step 1: Create rowParsers.js**

```javascript
// Row Parsers — source-specific normalization for the lease comp engine.
// Each parser converts raw input (Excel, agent JSON, etc.) into a canonical row shape.

const SKIP_BROKER = new Set(['no broker involved', 'n/a', 'none', '']);

const DESIGNATIONS = /,?\s*\b(SIOR|CCIM|CPA|Esq|Jr|Sr|III|II|MBA|PhD|PE|AIA|LEED\s*AP)\b\.?/gi;

/**
 * Parse a CoStar Excel row into normalized shape.
 * Handles all 3 sheet variants (main, expiring, matched).
 */
function parseCoStarExcelRow(raw, sheetName) {
  // Address fields
  const address = cleanStr(raw['Building Address']);
  const city = cleanStr(raw['City']);
  const state = cleanStr(raw['State']) || 'CA'; // CoStar IE data is all CA

  // Property fields
  const propertyName = cleanStr(raw['Property Name']);
  const propertyType = cleanStr(raw['Property Type      (office, industrial or retail)']
    || raw['Property Type ']
    || raw['Property Type']);
  const rba = cleanNum(raw['RBA']);
  const lastSaleDate = cleanDate(raw['Last Sale Date']);

  // Comp fields
  const spaceUse = cleanStr(raw['Space Use']);
  const spaceType = cleanStr(raw['Space Type \n(New, Relet, Sublet)']
    || raw['Space Type \r\n(New, Relet, Sublet)']);
  const sf = cleanNum(raw['Square Footage Leased']);
  const floorSuite = cleanStr(raw['Floor/ Suite #']);
  const signDate = cleanDate(raw['Sign Date']);
  const commencementDate = cleanDate(raw['Commencement Date']);
  const moveInDate = cleanDate(raw['Move-In Date']);
  const expirationDate = cleanDate(raw['Expiration Date']);
  const leaseType = cleanStr(raw['New/ Renewal/ Sublease']);
  const concessions = cleanStr(raw['Concessions (Free rent, TI, moving allowance, etc.)']);

  // Parse term: "360 months" → 360
  const termRaw = raw['Lease\nTerm'] || raw['Lease\r\nTerm'] || '';
  const termMonths = parseTermMonths(termRaw);

  // Contract rent — numeric $/SF/month
  const rate = cleanNum(raw['Contract Rent']);

  // Escalations — keep as TEXT (mixed formats: "2.00%", "0.04", "$0.03/sf/yr")
  const escalations = cleanStr(raw['Escalations']);

  // Rent type
  const rentType = cleanStr(raw['Rent Type (Full Service/ Modified Gross/ NNN)*']
    || raw['Rent Type ']
    || raw['Rent Type']);

  // Tenant
  const tenantName = cleanStr(raw['Tenant Name']);

  // Broker companies (may be comma-separated, may include "No Broker Involved")
  const tenantRepCompanies = splitAndCleanBrokers(raw['Tenant Rep Company']);
  const landlordRepCompanies = splitAndCleanBrokers(raw['Landlord Rep Company']);

  // Broker agents (may be comma-separated, strip designations)
  const tenantRepAgents = splitAndCleanAgents(raw['Tenant Rep Agents']);
  const landlordRepAgents = splitAndCleanAgents(raw['Landlord Rep Agents']);

  return {
    // Property
    address, city, state, propertyName, propertyType, rba, lastSaleDate,
    // Comp
    spaceUse, spaceType, sf, floorSuite, signDate, commencementDate,
    moveInDate, expirationDate, termMonths, rate, escalations, rentType,
    leaseType, concessions, tenantName,
    // Brokers
    tenantRepCompanies, landlordRepCompanies,
    tenantRepAgents, landlordRepAgents,
    // Metadata
    source: 'CoStar',
    sheetName,
  };
}

// --- Helpers ---

function cleanStr(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  return s === '' || s.toLowerCase() === 'nan' ? null : s;
}

function cleanNum(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const s = String(val).replace(/[$,]/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function cleanDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0];
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function parseTermMonths(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  const match = s.match(/^(\d+)\s*months?$/);
  if (match) return parseInt(match[1], 10);
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

/**
 * Split comma-separated broker companies, deduplicate, filter "No Broker Involved".
 * Returns array of clean company names (may be empty).
 */
function splitAndCleanBrokers(raw) {
  if (!raw) return [];
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  // Case-insensitive dedup (CoStar casing may vary)
  const seen = new Set();
  const unique = parts.filter(p => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.filter(name => !SKIP_BROKER.has(name.toLowerCase().trim()));
}

/**
 * Split comma-separated agent names, strip designations, deduplicate.
 * Returns array of { original, cleaned } objects (may be empty).
 */
function splitAndCleanAgents(raw) {
  if (!raw) return [];
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const result = [];
  for (const original of parts) {
    const cleaned = original
      .replace(DESIGNATIONS, '')
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      result.push({ original, cleaned });
    }
  }
  return result;
}

module.exports = {
  parseCoStarExcelRow,
  splitAndCleanBrokers,
  splitAndCleanAgents,
  cleanStr,
  cleanNum,
  cleanDate,
  parseTermMonths,
  SKIP_BROKER,
};
```

- [ ] **Step 2: Verify parsers**

```bash
cd ie-crm && node -e "
const { parseTermMonths, splitAndCleanBrokers, splitAndCleanAgents } = require('./server/utils/rowParsers');
console.log(parseTermMonths('360 months'));  // 360
console.log(parseTermMonths('61 months'));   // 61
console.log(splitAndCleanBrokers('CBRE, CBRE, Daum Commercial Real Estate'));
// ['CBRE', 'Daum Commercial Real Estate']
console.log(splitAndCleanBrokers('No Broker Involved'));
// []
console.log(splitAndCleanAgents('Joey Sugar, SIOR, Mitch Embrey'));
// [{ original: 'Joey Sugar', cleaned: 'Joey Sugar' }, { original: 'SIOR', ... }] -- wait, SIOR alone gets stripped
console.log(splitAndCleanAgents('Clyde Stauff, SIOR, Jace Gan'));
// [{ original: 'Clyde Stauff, SIOR', ... }] -- hmm, comma-split issue
"
```

**Important edge case:** CoStar agent names like `"Clyde Stauff, SIOR, Jace Gan"` — the comma separates both the designation AND the next agent. The designation stripping happens after split, so "SIOR" becomes an empty string after stripping and gets filtered. This is correct behavior — the split produces `["Clyde Stauff", "SIOR", "Jace Gan"]`, SIOR gets stripped to empty and filtered, leaving `["Clyde Stauff", "Jace Gan"]`.

- [ ] **Step 3: Commit**

```bash
git add ie-crm/server/utils/rowParsers.js
git commit -m "feat: add CoStar Excel row parser for lease comp engine"
```

---

## Task 4: Build Core Engine (`leaseCompEngine.js`)

**Files:**
- Create: `ie-crm/server/utils/leaseCompEngine.js`

This is the main engine. It receives an array of normalized rows and a DB client, then executes the full fan-out with fuzzy matching.

- [ ] **Step 1: Create leaseCompEngine.js — cache loading + matching helpers**

```javascript
// Lease Comp Engine — reusable fan-out engine for CoStar lease comp data.
// One row → properties + companies + contacts + lease_comps + junctions.
// Used by: migration script, agent API endpoint, CRM import UI.

const { normalizeAddress, normalizeCompanyName, normalizeContactName, similarity } = require('./addressNormalizer');

// ============================================================
// CACHE MANAGEMENT
// ============================================================

/**
 * Pre-load all existing records into in-memory caches for fast matching.
 */
async function loadCaches(client) {
  const propertyCache = new Map();   // "normalizedAddr|city" → { property_id, ... }
  const companyCache = new Map();    // "normalizedName" → { company_id, ... }
  const contactCache = new Map();    // "normalizedName" → { contact_id, ... }
  const compDedupCache = new Set();  // "property_id|tenant|commence|sf" → exists

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
    if (norm) contactCache.set(norm, c);
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

  if (bestSim >= 0.90) {
    fuzzyLog.push({ type: 'property', original: row.address, matchedTo: bestMatch.property_address, similarity: bestSim, rowNum });
    return bestMatch;
  }
  if (bestSim >= 0.80) {
    fuzzyLog.push({ type: 'property', original: row.address, matchedTo: bestMatch.property_address, similarity: bestSim, rowNum, review: true });
    return bestMatch;
  }

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

  if (bestSim >= 0.85) {
    fuzzyLog.push({ type: 'company', original: name, matchedTo: bestMatch.company_name, similarity: bestSim, rowNum });
    return bestMatch;
  }

  return null; // will create new
}

function findContact(name, caches, fuzzyLog, rowNum, brokerageCompanyId) {
  const norm = normalizeContactName(name);
  if (!norm) return null;

  // Exact — may have multiple contacts with same normalized name
  const exactMatches = [];
  for (const [cachedNorm, contact] of caches.contactCache.entries()) {
    if (cachedNorm === norm) exactMatches.push(contact);
  }

  if (exactMatches.length === 1) return exactMatches[0];
  if (exactMatches.length > 1 && brokerageCompanyId) {
    // Disambiguate by brokerage — prefer contact already linked to this company
    const linked = exactMatches.find(c => c._companyIds && c._companyIds.has(brokerageCompanyId));
    if (linked) return linked;
  }
  if (exactMatches.length > 0) return exactMatches[0]; // fallback to first

  // Fuzzy
  let bestMatch = null;
  let bestSim = 0;
  for (const [cachedNorm, contact] of caches.contactCache.entries()) {
    const sim = similarity(norm, cachedNorm);
    if (sim > bestSim) {
      bestSim = sim;
      bestMatch = contact;
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
      // Update cache (conditional — mirror "fill blanks" guard from SQL)
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
      // Add to cache
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

  // 3. BROKER COMPANIES — find or create (skip "No Broker Involved")
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
    const companyId = brokerCompanyIds.tenantRep[0] || null; // associate with first tenant rep company
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
    // Tenant company → property (role=tenant)
    if (tenantCompanyId) {
      await upsertJunction(client, 'property_companies', { property_id: propertyId, company_id: tenantCompanyId, role: 'tenant' }, report);
    }
    // Landlord rep companies → property (role=leasing)
    for (const compId of brokerCompanyIds.landlordRep) {
      await upsertJunction(client, 'property_companies', { property_id: propertyId, company_id: compId, role: 'leasing' }, report);
    }
    // Broker contacts → property (role=broker)
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
    // Link to company if not already linked
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
    if (norm) caches.contactCache.set(norm, { contact_id: id, full_name: name });
    // Link to company
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
      report.junctions.skipped++; // duplicate or FK violation — expected
    } else {
      throw err; // unexpected error — bubble up
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

/**
 * Process an array of normalized lease comp rows.
 * @param {object[]} rows - Normalized rows (from any parser)
 * @param {Pool} pool - pg Pool instance
 * @param {object} options - { dryRun: boolean, source: string }
 * @returns {object} Report with counts, fuzzy matches, errors, gaps
 */
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

      // Progress logging every 500 rows
      if ((i + 1) % 500 === 0) {
        console.log(`[engine] Processed ${i + 1}/${rows.length} rows...`);
      }
    }

    if (!dryRun) await client.query('COMMIT');

    // Generate gap report
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
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/server/utils/leaseCompEngine.js
git commit -m "feat: lease comp migration engine with fan-out, fuzzy matching, gap report"
```

---

## Task 5: Build Migration Script

**Files:**
- Create: `ie-crm/scripts/migrate-lease-comps.js`

- [ ] **Step 1: Install xlsx package**

```bash
cd ie-crm && npm install xlsx
```

- [ ] **Step 2: Create migration script**

```javascript
#!/usr/bin/env node
// Lease Comp Migration Script — one-time bulk import from CoStar Excel.
// Usage: node scripts/migrate-lease-comps.js [--dry-run] [--sheet=all|1|2|3]

const { Pool } = require('pg');
const XLSX = require('xlsx');
const path = require('path');
const { parseCoStarExcelRow } = require('../server/utils/rowParsers');
const { processLeaseComps } = require('../server/utils/leaseCompEngine');

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sheetArg = (args.find(a => a.startsWith('--sheet=')) || '--sheet=all').split('=')[1];
const filePath = args.find(a => !a.startsWith('--')) ||
  path.resolve(__dirname, '../../Industrial sale:lease comps REapps/Lease comps 1.1.18-2.15.26.xlsx');

console.log(`\n═══════════════════════════════════════════════`);
console.log(`  LEASE COMP MIGRATION ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
console.log(`═══════════════════════════════════════════════`);
console.log(`File: ${filePath}`);
console.log(`Sheet: ${sheetArg}`);
console.log(`Mode: ${dryRun ? 'DRY RUN — no writes' : 'LIVE — writing to database'}\n`);

async function main() {
  // Read Excel
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  console.log(`Sheets found: ${sheetNames.join(', ')}`);

  // Sheet order: 3 (richest) → 2 → 1 (largest)
  const sheetOrder = [
    { name: sheetNames[2], label: 'Matched - 10yr+ Hold & Expiring' },
    { name: sheetNames[1], label: 'Expiring Leases 18mo' },
    { name: sheetNames[0], label: 'CoStarPowerBrokerLease' },
  ];

  // Filter sheets based on --sheet arg
  const sheetsToProcess = sheetArg === 'all' ? sheetOrder :
    sheetOrder.filter((_, i) => String(3 - i) === sheetArg); // 1=main, 2=expiring, 3=matched

  // Parse all rows across selected sheets
  const allRows = [];
  for (const sheet of sheetsToProcess) {
    const ws = workbook.Sheets[sheet.name];
    const rawRows = XLSX.utils.sheet_to_json(ws);
    console.log(`  ${sheet.label}: ${rawRows.length} rows`);
    for (const raw of rawRows) {
      allRows.push(parseCoStarExcelRow(raw, sheet.label));
    }
  }

  console.log(`\nTotal rows to process: ${allRows.length}`);

  // Connect to DB
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('ERROR: DATABASE_URL not set');
    process.exit(1);
  }
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('neon') ? { rejectUnauthorized: false } : undefined,
  });

  // Run engine
  const startTime = Date.now();
  const report = await processLeaseComps(allRows, pool, { dryRun, source: 'CoStar' });
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Print report
  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  MIGRATION REPORT ${dryRun ? '(DRY RUN)' : '(COMMITTED)'}`);
  console.log(`═══════════════════════════════════════════════`);
  console.log(`Time: ${elapsed}s\n`);

  console.log(`Properties:`);
  console.log(`  Created:  ${report.properties.created}`);
  console.log(`  Enriched: ${report.properties.enriched}`);
  console.log(`  Matched:  ${report.properties.matched}`);

  console.log(`\nCompanies:`);
  console.log(`  Created: ${report.companies.created}`);
  console.log(`  Matched: ${report.companies.matched}`);

  console.log(`\nContacts:`);
  console.log(`  Created: ${report.contacts.created}`);
  console.log(`  Matched: ${report.contacts.matched}`);

  console.log(`\nLease Comps: ${report.leaseComps.created} created`);
  console.log(`Junctions:   ${report.junctions.created} created, ${report.junctions.skipped} skipped`);

  if (report.skipped.length > 0) {
    console.log(`\nSkipped: ${report.skipped.length} rows`);
    for (const s of report.skipped.slice(0, 10)) {
      console.log(`  Row ${s.rowNum}: ${s.reason}`);
    }
    if (report.skipped.length > 10) console.log(`  ... and ${report.skipped.length - 10} more`);
  }

  if (report.errors.length > 0) {
    console.log(`\nErrors: ${report.errors.length}`);
    for (const e of report.errors.slice(0, 10)) {
      console.log(`  Row ${e.rowNum}: ${e.message}`);
    }
    if (report.errors.length > 10) console.log(`  ... and ${report.errors.length - 10} more`);
  }

  if (report.fuzzyMatches.length > 0) {
    console.log(`\nFuzzy Matches (${report.fuzzyMatches.length}):`);
    for (const f of report.fuzzyMatches.slice(0, 20)) {
      console.log(`  [${f.type}] "${f.original}" → "${f.matchedTo}" (${(f.similarity * 100).toFixed(1)}%)${f.review ? ' ⚠ REVIEW' : ''}`);
    }
    if (report.fuzzyMatches.length > 20) console.log(`  ... and ${report.fuzzyMatches.length - 20} more`);
  }

  // Gap report
  if (report.dataGaps) {
    const g = report.dataGaps;
    console.log(`\n═══════════════════════════════════════════════`);
    console.log(`  DATA GAP REPORT`);
    console.log(`═══════════════════════════════════════════════`);
    console.log(`Properties: ${g.properties.total} total`);
    console.log(`  Missing lat/long:     ${g.properties.missing_lat_long} (${pct(g.properties.missing_lat_long, g.properties.total)})`);
    console.log(`  Missing RBA:          ${g.properties.missing_rba} (${pct(g.properties.missing_rba, g.properties.total)})`);
    console.log(`  Missing last_sale:    ${g.properties.missing_last_sale} (${pct(g.properties.missing_last_sale, g.properties.total)})`);
    console.log(`  Missing year_built:   ${g.properties.missing_year_built} (${pct(g.properties.missing_year_built, g.properties.total)})`);
    console.log(`  Missing cap_rate:     ${g.properties.missing_cap_rate} (${pct(g.properties.missing_cap_rate, g.properties.total)})`);
    console.log(`  Missing NOI:          ${g.properties.missing_noi} (${pct(g.properties.missing_noi, g.properties.total)})`);
    console.log(`  Missing star_rating:  ${g.properties.missing_star_rating} (${pct(g.properties.missing_star_rating, g.properties.total)})`);
    console.log(`\nCompanies (tenants): ${g.companies.total} total`);
    console.log(`  Missing lease_exp: ${g.companies.missing_lease_exp} (${pct(g.companies.missing_lease_exp, g.companies.total)})`);
    console.log(`\nContacts (brokers): ${g.contacts.total} total`);
    console.log(`  Missing email: ${g.contacts.missing_email} (${pct(g.contacts.missing_email, g.contacts.total)})`);
  }

  await pool.end();
}

function pct(n, total) {
  if (!total) return '0%';
  return `${Math.round(n / total * 100)}%`;
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Commit**

```bash
git add ie-crm/scripts/migrate-lease-comps.js ie-crm/package.json ie-crm/package-lock.json
git commit -m "feat: lease comp migration script with dry-run support"
```

---

## Task 6: Add Agent API Endpoint + Gap Report Endpoint

**Files:**
- Modify: `ie-crm/server/index.js`

- [ ] **Step 1: Add require at top of server/index.js**

Near the existing requires (around line 10), add:
```javascript
const { processLeaseComps, generateGapReport } = require('./utils/leaseCompEngine');
```

- [ ] **Step 2: Add POST /api/import/lease-comps endpoint**

Add after the existing `/api/import/batch` endpoint (around line 898):

```javascript
// Lease comp engine import — used by agents for recurring CoStar uploads
app.post('/api/import/lease-comps', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { rows, source = 'agent', dryRun = false } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows array required' });
    }
    const report = await processLeaseComps(rows, pool, { dryRun, source });
    res.json(report);
  } catch (err) {
    console.error('[server] lease-comp import error:', err);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 3: Add GET /api/reports/data-gaps endpoint**

Add right after the lease-comps endpoint:

```javascript
// Data gap report — shows what fields are missing across the database
app.get('/api/reports/data-gaps', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const client = await pool.connect();
    try {
      const gaps = await generateGapReport(client);
      res.json(gaps);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('[server] data-gaps error:', err);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add ie-crm/server/index.js
git commit -m "feat: add lease comp agent API + data gap report endpoints"
```

---

## Task 7: Run Migration — Dry Run

- [ ] **Step 1: Run dry run**

```bash
cd ie-crm && DATABASE_URL="$DATABASE_URL" node scripts/migrate-lease-comps.js --dry-run
```

Expected: Full report printed with counts of what *would* be created. Zero errors. Review the fuzzy match log for any bad matches.

- [ ] **Step 2: Review fuzzy matches and fix any issues**

Check the fuzzy match output. If there are false positives (wrong matches), adjust similarity thresholds in leaseCompEngine.js and re-run.

- [ ] **Step 3: If dry run looks good, commit any threshold tweaks**

```bash
git add -A && git commit -m "fix: tune fuzzy matching thresholds after dry run"
```

---

## Task 8: Run Migration — Live

- [ ] **Step 1: Execute the live migration**

```bash
cd ie-crm && DATABASE_URL="$DATABASE_URL" node scripts/migrate-lease-comps.js
```

Expected: Full report showing ~4,215 properties, ~5,880 companies, ~1,300 contacts, ~9,730 lease comps created. Data gap report at the end.

- [ ] **Step 2: Verify in database**

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM properties;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM companies;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM contacts;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM lease_comps;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM property_companies;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM property_contacts;"
```

- [ ] **Step 3: Spot check some records**

```bash
psql "$DATABASE_URL" -c "SELECT property_address, city, property_type, rba, last_sale_date FROM properties LIMIT 5;"
psql "$DATABASE_URL" -c "SELECT tenant_name, sf, rate, commencement_date, expiration_date FROM lease_comps LIMIT 5;"
psql "$DATABASE_URL" -c "SELECT full_name, type FROM contacts WHERE type = 'broker' LIMIT 5;"
```

- [ ] **Step 4: Commit final state**

```bash
git add -A && git commit -m "feat: lease comp migration complete — 9,730 rows processed"
```
