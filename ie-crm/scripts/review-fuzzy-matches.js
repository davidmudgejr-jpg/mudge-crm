#!/usr/bin/env node
// review-fuzzy-matches.js — Consolidated fuzzy match review across ALL imports.
//
// Scans /tmp/ for import report JSON files, extracts all fuzzy match entries,
// classifies risk levels, and queries the database for data quality issues.
//
// Usage:
//   node scripts/review-fuzzy-matches.js
//   node scripts/review-fuzzy-matches.js --threshold=3
//   node scripts/review-fuzzy-matches.js --category=properties
//   node scripts/review-fuzzy-matches.js --category=companies
//   node scripts/review-fuzzy-matches.js --category=contacts
//   node scripts/review-fuzzy-matches.js --show-low-risk

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { normalizeAddress, levenshtein, similarity } = require('../server/utils/addressNormalizer');

const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
  || 'postgresql://neondb_owner:npg_LFY9Gyds7VDA@ep-withered-mode-aktp7v63-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require';

// ─── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const catArg = args.find(a => a.startsWith('--category='));
const category = catArg ? catArg.split('=')[1].toLowerCase() : 'all';
const threshArg = args.find(a => a.startsWith('--threshold='));
const threshold = threshArg ? parseInt(threshArg.split('=')[1], 10) : 3;
const showLowRisk = args.includes('--show-low-risk');

const MAX_PER_SECTION = 80;

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the leading street number from an address string. */
function extractStreetNumber(addr) {
  if (!addr) return null;
  const m = addr.match(/^\s*(\d+)/);
  return m ? m[1] : null;
}

/** Extract the street name portion (everything after the number). */
function extractStreetName(addr) {
  if (!addr) return null;
  return addr.replace(/^\s*\d+\s*/, '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
}

/** Classify an address fuzzy match as HIGH or LOW risk. */
function classifyAddressRisk(original, matchedTo) {
  const numA = extractStreetNumber(original);
  const numB = extractStreetNumber(matchedTo);
  if (!numA || !numB) return 'HIGH'; // Can't parse — flag for review
  if (numA !== numB) return 'HIGH';  // Different street numbers — likely wrong match

  // Same number — check if street names are similar (abbreviation diffs)
  const nameA = extractStreetName(original);
  const nameB = extractStreetName(matchedTo);
  const normA = normalizeAddress(original);
  const normB = normalizeAddress(matchedTo);
  if (normA === normB) return 'LOW'; // Identical after normalization
  if (nameA === nameB) return 'LOW'; // Same street name
  return 'MEDIUM';
}

/** Format a similarity value as percentage string. */
function pct(sim) {
  return (sim * 100).toFixed(1) + '%';
}

/** Deduplicate fuzzy matches (same original+matchedTo pair). */
function dedup(matches) {
  const seen = new Set();
  return matches.filter(m => {
    const key = `${m.type}|${(m.original || '').toLowerCase()}|${(m.matchedTo || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Part 1: Scan /tmp/ for import reports ─────────────────────────────────────

function scanReportFiles() {
  const reportDir = '/tmp';
  const files = [];
  try {
    const entries = fs.readdirSync(reportDir);
    for (const entry of entries) {
      if (entry.endsWith('.json') && entry.includes('report')) {
        // Match patterns: *-report-live-*.json, *-report-dry-*.json, *-report-*.json
        if (entry.includes('import-report') || entry.includes('-report-')) {
          files.push(path.join(reportDir, entry));
        }
      }
    }
  } catch (err) {
    console.error(`  Warning: Could not scan ${reportDir}: ${err.message}`);
  }
  return files.sort();
}

function loadFuzzyMatches(files) {
  const allMatches = [];
  const fileSummary = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const fm = data.fuzzyMatches || [];
      const basename = path.basename(file);
      // Determine source type from filename
      let source = 'unknown';
      if (basename.includes('tpe-')) source = 'TPE';
      else if (basename.includes('companies')) source = 'Airtable Companies';
      else if (basename.includes('contacts')) source = 'Airtable Contacts';
      else if (basename.includes('campaigns')) source = 'Airtable Campaigns';
      else if (basename.includes('lease-comp')) source = 'Lease Comps';
      else if (basename.includes('airtable-import')) source = 'Airtable Properties';

      const isDry = basename.includes('-dry-');
      const isLive = basename.includes('-live-');
      const mode = isDry ? 'DRY' : isLive ? 'LIVE' : '???';

      // Extract timestamp from filename
      const tsMatch = basename.match(/(\d{13})/);
      const ts = tsMatch ? new Date(parseInt(tsMatch[1])).toISOString().slice(0, 19) : '?';

      fileSummary.push({ file: basename, source, mode, count: fm.length, timestamp: ts });

      for (const m of fm) {
        allMatches.push({ ...m, source, sourceFile: basename });
      }
    } catch (err) {
      console.error(`  Warning: Could not parse ${path.basename(file)}: ${err.message}`);
    }
  }

  return { allMatches, fileSummary };
}

// ─── Part 2: Classify and group ────────────────────────────────────────────────

function classifyMatches(allMatches) {
  const property = { high: [], medium: [], low: [] };
  const company = [];
  const contact = [];
  const campaign = [];
  const other = [];

  for (const m of allMatches) {
    switch (m.type) {
      case 'property': {
        const risk = classifyAddressRisk(m.original, m.matchedTo);
        m.risk = risk;
        if (risk === 'HIGH') property.high.push(m);
        else if (risk === 'MEDIUM') property.medium.push(m);
        else property.low.push(m);
        break;
      }
      case 'company':
        company.push(m);
        break;
      case 'contact':
        contact.push(m);
        break;
      case 'campaign':
        campaign.push(m);
        break;
      default:
        other.push(m);
    }
  }

  return { property, company, contact, campaign, other };
}

// ─── Part 3: Database quality checks ───────────────────────────────────────────

async function runDatabaseChecks(pool) {
  const results = {};

  // NULL city properties
  try {
    const { rows } = await pool.query(`
      SELECT property_id, property_address, normalized_address, city, state
      FROM properties WHERE city IS NULL OR TRIM(city) = ''
      ORDER BY property_id LIMIT 50
    `);
    results.nullCityProperties = rows;
  } catch (e) { results.nullCityProperties = []; }

  // NULL full_name contacts
  try {
    const { rows } = await pool.query(`
      SELECT contact_id, first_name, last_name, full_name, email
      FROM contacts WHERE full_name IS NULL OR TRIM(full_name) = ''
      ORDER BY contact_id LIMIT 50
    `);
    results.nullNameContacts = rows;
  } catch (e) { results.nullNameContacts = []; }

  // NULL company_name companies
  try {
    const { rows } = await pool.query(`
      SELECT company_id, company_name
      FROM companies WHERE company_name IS NULL OR TRIM(company_name) = ''
      ORDER BY company_id LIMIT 50
    `);
    results.nullNameCompanies = rows;
  } catch (e) { results.nullNameCompanies = []; }

  // Exact duplicate normalized_address (same city)
  try {
    const { rows } = await pool.query(`
      SELECT normalized_address, LOWER(city) AS city, COUNT(*) AS cnt,
             ARRAY_AGG(property_id ORDER BY property_id) AS ids,
             ARRAY_AGG(property_address ORDER BY property_id) AS addresses
      FROM properties
      WHERE normalized_address IS NOT NULL AND city IS NOT NULL
      GROUP BY normalized_address, LOWER(city)
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC, normalized_address
      LIMIT 50
    `);
    results.exactDuplicateProperties = rows;
  } catch (e) { results.exactDuplicateProperties = []; }

  // Near-duplicate properties (Levenshtein ≤ threshold, same city) — JS fallback
  try {
    const { rows } = await pool.query(`
      SELECT property_id, normalized_address, city, state, property_address
      FROM properties
      WHERE normalized_address IS NOT NULL AND city IS NOT NULL
      ORDER BY city, normalized_address
    `);
    const pairs = [];
    const byCity = {};
    for (const r of rows) {
      const key = (r.city || '').toLowerCase();
      (byCity[key] = byCity[key] || []).push(r);
    }
    for (const city of Object.keys(byCity)) {
      const group = byCity[city];
      for (let i = 0; i < group.length && pairs.length < MAX_PER_SECTION; i++) {
        for (let j = i + 1; j < group.length && pairs.length < MAX_PER_SECTION; j++) {
          const a = group[i], b = group[j];
          // Skip exact duplicates (already caught above)
          if (a.normalized_address === b.normalized_address) continue;
          const dist = levenshtein(
            (a.normalized_address || '').toLowerCase(),
            (b.normalized_address || '').toLowerCase()
          );
          if (dist > 0 && dist <= threshold) {
            const risk = classifyAddressRisk(a.property_address || a.normalized_address, b.property_address || b.normalized_address);
            pairs.push({ ...a, id_a: a.property_id, addr_a: a.normalized_address, id_b: b.property_id, addr_b: b.normalized_address, city: a.city, dist, risk });
          }
        }
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);
    results.nearDuplicateProperties = pairs.slice(0, MAX_PER_SECTION);
  } catch (e) { results.nearDuplicateProperties = []; }

  // Summary counts
  try {
    const { rows: [counts] } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM properties) AS total_properties,
        (SELECT COUNT(*) FROM contacts) AS total_contacts,
        (SELECT COUNT(*) FROM companies) AS total_companies,
        (SELECT COUNT(*) FROM campaigns) AS total_campaigns
    `);
    results.counts = counts;
  } catch (e) { results.counts = {}; }

  return results;
}

// ─── Part 4: Display ───────────────────────────────────────────────────────────

function printHeader(title) {
  console.log('\n' + '='.repeat(78));
  console.log('  ' + title);
  console.log('='.repeat(78));
}

function printSubHeader(title) {
  console.log('\n  ' + '-'.repeat(74));
  console.log('  ' + title);
  console.log('  ' + '-'.repeat(74));
}

function printPropertyMatch(m, i) {
  const riskLabel = m.risk === 'HIGH' ? '\x1b[31mHIGH RISK\x1b[0m'
    : m.risk === 'MEDIUM' ? '\x1b[33mMEDIUM\x1b[0m'
    : '\x1b[32mLOW RISK\x1b[0m';
  const numA = extractStreetNumber(m.original) || '?';
  const numB = extractStreetNumber(m.matchedTo) || '?';
  const numDiff = numA !== numB ? ` [${numA} vs ${numB}]` : '';
  console.log(`  ${String(i).padStart(4)}. ${riskLabel}  Sim: ${pct(m.similarity)}  ${m.review ? '(flagged)' : ''}  [${m.source}]`);
  console.log(`        Original:  "${m.original}"`);
  console.log(`        Matched:   "${m.matchedTo}"${numDiff}`);
}

function printGenericMatch(m, i) {
  const reviewTag = m.review ? ' \x1b[33m(needs review)\x1b[0m' : '';
  console.log(`  ${String(i).padStart(4)}. Sim: ${pct(m.similarity)}${reviewTag}  [${m.source}]`);
  console.log(`        Original:  "${m.original}"`);
  console.log(`        Matched:   "${m.matchedTo}"`);
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '='.repeat(78));
  console.log('  CONSOLIDATED FUZZY MATCH REVIEW');
  console.log('  Scans all import reports + database for data quality issues');
  console.log('  ' + new Date().toISOString().slice(0, 19));
  console.log('='.repeat(78));

  // ── Step 1: Load report files ──
  printHeader('STEP 1: IMPORT REPORT FILES');
  const files = scanReportFiles();
  if (files.length === 0) {
    console.log('\n  No import report files found in /tmp/');
  } else {
    console.log(`\n  Found ${files.length} report file(s):\n`);
  }

  const { allMatches: rawMatches, fileSummary } = loadFuzzyMatches(files);
  const allMatches = dedup(rawMatches);

  for (const f of fileSummary) {
    const modeColor = f.mode === 'LIVE' ? '\x1b[32m' : '\x1b[33m';
    console.log(`    ${modeColor}${f.mode}\x1b[0m  ${f.source.padEnd(22)} ${String(f.count).padStart(5)} fuzzy matches  ${f.timestamp}  ${f.file}`);
  }
  console.log(`\n  Total raw fuzzy matches: ${rawMatches.length}`);
  console.log(`  After deduplication:     ${allMatches.length}`);

  // ── Step 2: Classify matches ──
  const classified = classifyMatches(allMatches);

  const totalProperty = classified.property.high.length + classified.property.medium.length + classified.property.low.length;
  const totalCompany = classified.company.length;
  const totalContact = classified.contact.length;
  const totalCampaign = classified.campaign.length;

  printHeader('STEP 2: FUZZY MATCH SUMMARY');
  console.log(`
  Property address matches:  ${totalProperty}
    HIGH RISK (different street #):  ${classified.property.high.length}
    MEDIUM (ambiguous):              ${classified.property.medium.length}
    LOW RISK (formatting only):      ${classified.property.low.length}

  Company name matches:   ${totalCompany}
  Contact name matches:   ${totalContact}
  Campaign name matches:  ${totalCampaign}
  Other:                  ${classified.other.length}
  `);

  // ── Step 3: Property address matches — HIGH RISK ──
  if (category === 'all' || category === 'properties') {
    printHeader('PROPERTY ADDRESS MATCHES — HIGH RISK (different street numbers)');
    console.log('  These are likely FALSE MATCHES that merged two different properties.\n');

    const highRisk = classified.property.high.slice(0, MAX_PER_SECTION);
    if (highRisk.length === 0) {
      console.log('  None found.\n');
    } else {
      highRisk.forEach((m, i) => printPropertyMatch(m, i + 1));
      if (classified.property.high.length > MAX_PER_SECTION) {
        console.log(`\n  ... and ${classified.property.high.length - MAX_PER_SECTION} more`);
      }
    }

    // MEDIUM risk
    if (classified.property.medium.length > 0) {
      printSubHeader(`PROPERTY ADDRESS MATCHES — MEDIUM RISK (${classified.property.medium.length})`);
      classified.property.medium.slice(0, 20).forEach((m, i) => printPropertyMatch(m, i + 1));
    }

    // LOW risk (only if --show-low-risk)
    if (showLowRisk && classified.property.low.length > 0) {
      printSubHeader(`PROPERTY ADDRESS MATCHES — LOW RISK (${classified.property.low.length})`);
      classified.property.low.slice(0, 20).forEach((m, i) => printPropertyMatch(m, i + 1));
    } else if (classified.property.low.length > 0) {
      console.log(`\n  (${classified.property.low.length} low-risk property matches hidden — use --show-low-risk to see them)`);
    }
  }

  // ── Step 4: Company matches ──
  if (category === 'all' || category === 'companies') {
    printHeader(`COMPANY NAME MATCHES (${totalCompany})`);
    if (totalCompany === 0) {
      console.log('\n  None found.\n');
    } else {
      // Split into review-flagged vs auto-accepted
      const needsReview = classified.company.filter(m => m.review);
      const autoAccepted = classified.company.filter(m => !m.review);

      if (needsReview.length > 0) {
        printSubHeader(`Flagged for Review (${needsReview.length})`);
        needsReview.slice(0, MAX_PER_SECTION).forEach((m, i) => printGenericMatch(m, i + 1));
      }
      if (autoAccepted.length > 0) {
        printSubHeader(`Auto-Accepted (${autoAccepted.length}) — high confidence`);
        autoAccepted.slice(0, 30).forEach((m, i) => printGenericMatch(m, i + 1));
      }
    }
  }

  // ── Step 5: Contact matches ──
  if (category === 'all' || category === 'contacts') {
    printHeader(`CONTACT NAME MATCHES (${totalContact})`);
    if (totalContact === 0) {
      console.log('\n  None found.\n');
    } else {
      const needsReview = classified.contact.filter(m => m.review);
      const autoAccepted = classified.contact.filter(m => !m.review);

      if (needsReview.length > 0) {
        printSubHeader(`Flagged for Review (${needsReview.length})`);
        needsReview.slice(0, MAX_PER_SECTION).forEach((m, i) => printGenericMatch(m, i + 1));
      }
      if (autoAccepted.length > 0) {
        printSubHeader(`Auto-Accepted (${autoAccepted.length}) — high confidence`);
        autoAccepted.slice(0, 30).forEach((m, i) => printGenericMatch(m, i + 1));
      }
    }
  }

  // ── Step 5b: Campaign matches ──
  if (category === 'all' || category === 'campaigns') {
    printHeader(`CAMPAIGN NAME MATCHES (${totalCampaign})`);
    if (totalCampaign === 0) {
      console.log('\n  None found.\n');
    } else {
      const needsReview = classified.campaign.filter(m => m.review);
      const autoAccepted = classified.campaign.filter(m => !m.review);

      if (needsReview.length > 0) {
        printSubHeader(`Flagged for Review (${needsReview.length})`);
        needsReview.slice(0, MAX_PER_SECTION).forEach((m, i) => printGenericMatch(m, i + 1));
      }
      if (autoAccepted.length > 0) {
        printSubHeader(`Auto-Accepted (${autoAccepted.length}) — high confidence`);
        autoAccepted.slice(0, 30).forEach((m, i) => printGenericMatch(m, i + 1));
      }
    }
  }

  // ── Step 6: Database quality checks ──
  printHeader('STEP 3: DATABASE QUALITY CHECKS (read-only)');

  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    const db = await runDatabaseChecks(pool);

    // Record counts
    if (db.counts) {
      console.log(`\n  Database record counts:`);
      console.log(`    Properties: ${db.counts.total_properties}`);
      console.log(`    Contacts:   ${db.counts.total_contacts}`);
      console.log(`    Companies:  ${db.counts.total_companies}`);
      console.log(`    Campaigns:  ${db.counts.total_campaigns}`);
    }

    // NULL city properties
    printSubHeader(`Properties with NULL city (${db.nullCityProperties.length})`);
    if (db.nullCityProperties.length === 0) {
      console.log('  None found.');
    } else {
      for (const p of db.nullCityProperties) {
        console.log(`    ID ${String(p.property_id).padStart(5)}: "${p.property_address || p.normalized_address || '(no address)'}"`);
      }
    }

    // NULL name contacts
    printSubHeader(`Contacts with NULL full_name (${db.nullNameContacts.length})`);
    if (db.nullNameContacts.length === 0) {
      console.log('  None found.');
    } else {
      for (const c of db.nullNameContacts) {
        console.log(`    ID ${String(c.contact_id).padStart(5)}: first="${c.first_name || ''}" last="${c.last_name || ''}" email="${c.email || ''}"`);
      }
    }

    // NULL name companies
    printSubHeader(`Companies with NULL company_name (${db.nullNameCompanies.length})`);
    if (db.nullNameCompanies.length === 0) {
      console.log('  None found.');
    } else {
      for (const c of db.nullNameCompanies) {
        console.log(`    ID ${String(c.company_id).padStart(5)}`);
      }
    }

    // Exact duplicate properties
    printSubHeader(`Exact Duplicate Properties (same normalized_address + city) (${db.exactDuplicateProperties.length})`);
    if (db.exactDuplicateProperties.length === 0) {
      console.log('  None found.');
    } else {
      for (const d of db.exactDuplicateProperties) {
        console.log(`    "${d.normalized_address}" in ${d.city} — ${d.cnt} records: IDs [${d.ids.join(', ')}]`);
        if (d.addresses) {
          for (let i = 0; i < d.addresses.length; i++) {
            console.log(`      ID ${d.ids[i]}: "${d.addresses[i]}"`);
          }
        }
      }
    }

    // Near-duplicate properties
    printSubHeader(`Near-Duplicate Properties (Levenshtein dist 1-${threshold}, same city) (${db.nearDuplicateProperties.length})`);
    if (db.nearDuplicateProperties.length === 0) {
      console.log('  None found.');
    } else {
      for (const p of db.nearDuplicateProperties) {
        const riskLabel = p.risk === 'HIGH' ? '\x1b[31mHIGH\x1b[0m' : p.risk === 'MEDIUM' ? '\x1b[33mMED\x1b[0m' : '\x1b[32mLOW\x1b[0m';
        console.log(`    ${riskLabel} dist=${p.dist}  [ID ${p.id_a}] "${p.addr_a}"  vs  [ID ${p.id_b}] "${p.addr_b}"  (${p.city})`);
      }
    }

  } catch (err) {
    console.error(`  Database check error: ${err.message}`);
  } finally {
    await pool.end();
  }

  // ── Final summary ──
  printHeader('FINAL SUMMARY');
  console.log(`
  Import Report Files Scanned:     ${files.length}
  Total Fuzzy Matches (deduped):   ${allMatches.length}

  Property Matches:                ${totalProperty}
    HIGH RISK (wrong street #):    ${classified.property.high.length}   <-- ACTION NEEDED
    MEDIUM:                        ${classified.property.medium.length}
    LOW RISK (formatting only):    ${classified.property.low.length}

  Company Matches:                 ${totalCompany}
  Contact Matches:                 ${totalContact}
  Campaign Matches:                ${totalCampaign}

  Recommended Actions:
    1. Review HIGH RISK property matches — these likely merged wrong properties
    2. Check exact duplicate properties — merge or clean up
    3. Review flagged company/contact matches for correctness
    4. Fix NULL city/name records for better future matching
  `);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
