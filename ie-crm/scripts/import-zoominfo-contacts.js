#!/usr/bin/env node
// ZoomInfo Master Contacts Import Script
// Reads Zoom_Info_Master_Contacts.xlsx, deduplicates against existing CRM data,
// creates new contacts/companies (or enriches existing ones), and links them.
//
// Usage:
//   node scripts/import-zoominfo-contacts.js --dry-run          # Preview only
//   node scripts/import-zoominfo-contacts.js --live             # Commit to DB
//   node scripts/import-zoominfo-contacts.js --live --start-row=500  # Resume

const path = require('path');
const { Pool } = require('pg');
const XLSX = require('@e965/xlsx');
const { matchContact, matchCompany } = require('../server/utils/compositeMatcher');
const { normalizeCompanyName, normalizeContactName, similarity } = require('../server/utils/addressNormalizer');

// ============================================================
// CONFIG
// ============================================================

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true });

const args = process.argv.slice(2);
const dryRun = !args.includes('--live');
const startRow = parseInt((args.find(a => a.startsWith('--start-row=')) || '').split('=')[1] || '0', 10);

const XLSX_PATH = args.find(a => !a.startsWith('--')) ||
  path.join(require('os').homedir(), 'Desktop/Zoom exports/Zoom_Info_Master_Contacts.xlsx');
const DATABASE_URL = process.env.DATABASE_URL;
const BATCH_SIZE = 500;

if (!DATABASE_URL) {
  console.error('[zoominfo] DATABASE_URL not set. Copy .env from Railway or run: vercel env pull');
  process.exit(1);
}

// ============================================================
// COLUMN MAPPING: ZoomInfo → CRM
// ============================================================

// Contact fields: ZoomInfo column → CRM column
const CONTACT_FIELDS = {
  full_name:    null,  // constructed from First Name + Last Name
  first_name:   'First Name',
  email_1:      'Email Address',
  title:        'Job Title',
  phone_1:      'Direct Phone Number',
  phone_2:      'Mobile phone',
  phone_3:      'Company HQ Phone',
  work_address: 'Company Street Address',
  work_city:    'Company City',
  work_state:   'Company State',
  work_zip:     'Company Zip Code',
  linkedin:     'LinkedIn Contact Profile URL',
  zoom_info_url:'ZoomInfo Contact Profile URL',
};

// Company fields: CRM column → ZoomInfo column
const COMPANY_FIELDS = {
  company_name: 'Company Name',
  website:      'Website',
  employees:    'Employees',
  revenue:      'Revenue (in 000s USD)',
  industry_type:'Primary Industry',
  tenant_sic:   'SIC Code 1',
  tenant_naics: 'NAICS Code 1',
  city:         'Company City',
  company_hq:   'Full Address',
};

// ============================================================
// ROW PARSING
// ============================================================

function parseRow(raw) {
  const firstName = (raw['First Name'] || '').trim();
  const lastName = (raw['Last Name'] || '').trim();
  const middleName = (raw['Middle Name'] || '').trim();
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');

  // Build home address from person fields
  const personParts = [
    raw['Person Street'],
    raw['Person City'],
    raw['Person State'],
    raw['Person Zip Code'],
  ].filter(Boolean);
  const homeAddress = personParts.length > 0 ? personParts.join(', ') : null;

  // Contact overflow — rich ZoomInfo metadata
  const contactOverflow = {};
  const addOverflow = (key, val) => { if (val != null && val !== '') contactOverflow[key] = val; };
  addOverflow('zi_contact_id', raw['ZoomInfo Contact ID']);
  addOverflow('zi_accuracy_score', raw['Contact Accuracy Score']);
  addOverflow('zi_accuracy_grade', raw['Contact Accuracy Grade']);
  addOverflow('management_level', raw['Management Level']);
  addOverflow('job_function', raw['Job Function']);
  addOverflow('department', raw['Department']);
  addOverflow('salutation', raw['Salutation']);
  addOverflow('suffix', raw['Suffix']);
  addOverflow('previous_job_title', raw['Previous Job Title']);
  addOverflow('previous_company_name', raw['Previous Company Name']);
  addOverflow('job_start_date', raw['Job Start Date']);
  addOverflow('highest_education', raw['Highest Level of Education']);
  addOverflow('buying_group', raw['Buying Group']);
  addOverflow('last_job_change_type', raw['Last Job Change Type']);
  addOverflow('last_job_change_date', raw['Last Job Change Date']);

  // Company overflow — rich ZoomInfo metadata
  const companyOverflow = {};
  const addCoOverflow = (key, val) => { if (val != null && val !== '') companyOverflow[key] = val; };
  addCoOverflow('zi_company_id', raw['ZoomInfo Company ID']);
  addCoOverflow('ownership_type', raw['Ownership Type']);
  addCoOverflow('business_model', raw['Business Model']);
  addCoOverflow('founded_year', raw['Founded Year']);
  addCoOverflow('revenue_range', raw['Revenue Range (in USD)']);
  addCoOverflow('employee_range', raw['Employee Range']);
  addCoOverflow('total_funding_k', raw['Total Funding Amount (in 000s USD)']);
  addCoOverflow('recent_funding_k', raw['Recent Funding Amount (in 000s USD)']);
  addCoOverflow('recent_funding_round', raw['Recent Funding Round']);
  addCoOverflow('recent_funding_date', raw['Recent Funding Date']);
  addCoOverflow('recent_investors', raw['Recent Investors']);
  addCoOverflow('all_industries', raw['All Industries']);
  addCoOverflow('all_sub_industries', raw['All Sub-Industries']);
  addCoOverflow('linkedin_url', raw['LinkedIn Company Profile URL']);
  addCoOverflow('facebook_url', raw['Facebook Company Profile URL']);
  addCoOverflow('twitter_url', raw['Twitter Company Profile URL']);
  addCoOverflow('number_of_locations', raw['Number of Locations']);
  addCoOverflow('alexa_rank', raw['Alexa Rank']);
  addCoOverflow('certified_active', raw['Certified Active Company']);

  return {
    // Contact
    full_name: fullName || null,
    first_name: firstName || null,
    email_1: (raw['Email Address'] || '').trim().toLowerCase() || null,
    title: raw['Job Title'] || null,
    phone_1: raw['Direct Phone Number'] || null,
    phone_2: raw['Mobile phone'] || null,
    phone_3: raw['Company HQ Phone'] || null,
    home_address: homeAddress,
    work_address: raw['Company Street Address'] || null,
    work_city: raw['Company City'] || null,
    work_state: raw['Company State'] || null,
    work_zip: raw['Company Zip Code'] ? String(raw['Company Zip Code']) : null,
    linkedin: raw['LinkedIn Contact Profile URL'] || null,
    zoom_info_url: raw['ZoomInfo Contact Profile URL'] || null,
    data_source: 'ZoomInfo',
    contactOverflow,

    // Company
    company_name: (raw['Company Name'] || '').trim() || null,
    website: raw['Website'] || null,
    employees: raw['Employees'] ? parseInt(raw['Employees'], 10) || null : null,
    revenue: raw['Revenue (in 000s USD)'] ? (parseFloat(raw['Revenue (in 000s USD)']) * 1000) || null : null,
    industry_type: raw['Primary Industry'] || null,
    tenant_sic: raw['SIC Code 1'] ? String(raw['SIC Code 1']) : null,
    tenant_naics: raw['NAICS Code 1'] ? String(raw['NAICS Code 1']) : null,
    company_city: raw['Company City'] || null,
    company_hq: raw['Full Address'] || null,
    companyOverflow,

    // Matching keys
    country: raw['Country'] || null,
  };
}

// ============================================================
// ENRICHMENT — fill blanks only, never overwrite
// ============================================================

async function enrichContact(client, contactId, row, existingRecord) {
  const updates = [];
  const vals = [];
  let idx = 1;

  const ENRICH_COLS = [
    'first_name', 'title', 'phone_1', 'phone_2', 'phone_3',
    'home_address', 'work_address', 'work_city', 'work_state', 'work_zip',
    'linkedin', 'zoom_info_url', 'data_source',
  ];

  for (const col of ENRICH_COLS) {
    if (row[col] != null && row[col] !== '' && (existingRecord[col] == null || existingRecord[col] === '')) {
      updates.push(`${col} = $${idx++}`);
      vals.push(row[col]);
    }
  }

  // Merge overflow (add new keys, don't replace existing ones)
  if (Object.keys(row.contactOverflow).length > 0) {
    const existingOverflow = existingRecord.overflow || {};
    const merged = { ...row.contactOverflow };
    let hasNew = false;
    for (const [k, v] of Object.entries(merged)) {
      if (existingOverflow[k] != null) delete merged[k];
      else hasNew = true;
    }
    if (hasNew && Object.keys(merged).length > 0) {
      updates.push(`overflow = overflow || $${idx++}::jsonb`);
      vals.push(JSON.stringify(merged));
    }
  }

  if (updates.length === 0) return 0;

  vals.push(contactId);
  await client.query(
    `UPDATE contacts SET ${updates.join(', ')}, modified = NOW() WHERE contact_id = $${idx}`,
    vals
  );
  return updates.length;
}

async function enrichCompany(client, companyId, row, existingRecord) {
  const updates = [];
  const vals = [];
  let idx = 1;

  const ENRICH_COLS = {
    website: 'website',
    employees: 'employees',
    revenue: 'revenue',
    industry_type: 'industry_type',
    tenant_sic: 'tenant_sic',
    tenant_naics: 'tenant_naics',
    company_city: 'city',
    company_hq: 'company_hq',
  };

  for (const [rowKey, dbCol] of Object.entries(ENRICH_COLS)) {
    if (row[rowKey] != null && row[rowKey] !== '' && (existingRecord[dbCol] == null || existingRecord[dbCol] === '')) {
      updates.push(`${dbCol} = $${idx++}`);
      vals.push(row[rowKey]);
    }
  }

  // Merge overflow
  if (Object.keys(row.companyOverflow).length > 0) {
    const existingOverflow = existingRecord.overflow || {};
    const merged = { ...row.companyOverflow };
    for (const k of Object.keys(merged)) {
      if (existingOverflow[k] != null) delete merged[k];
    }
    if (Object.keys(merged).length > 0) {
      updates.push(`overflow = overflow || $${idx++}::jsonb`);
      vals.push(JSON.stringify(merged));
    }
  }

  if (updates.length === 0) return 0;

  vals.push(companyId);
  await client.query(
    `UPDATE companies SET ${updates.join(', ')}, modified = NOW() WHERE company_id = $${idx}`,
    vals
  );
  return updates.length;
}

// ============================================================
// SMART FUZZY RESOLUTION — auto-link high-confidence fuzzy matches
// ============================================================

/**
 * Strip middle initials/names from a full name to get "First Last" core.
 * "Albert H. Arteaga" → "albert arteaga"
 * "Drew S Marloe" → "drew marloe"
 * "Scott M. Thompson" → "scott thompson"
 */
function coreContactName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[.,]/g, '')
    // Remove single-letter middle initials (with or without period)
    .replace(/\s+[a-z]\s+/g, ' ')
    // Remove CRE designations
    .replace(/\b(sior|ccim|cpa|esq|jr|sr|iii|ii|mba|phd|pe|aia|leed\s*ap)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Try to resolve a fuzzy contact match to a confident match.
 * Returns the candidate ID if high confidence, null otherwise.
 */
function resolveContactFuzzy(row, candidates, existingContacts) {
  const incomingCore = coreContactName(row.full_name);
  if (!incomingCore) return null;

  for (const cand of candidates) {
    const existingCore = coreContactName(cand.name);
    // Exact core name match (just middle initial difference)
    if (incomingCore === existingCore) return cand.id;
    // Very high similarity on core name (95%+)
    if (similarity(incomingCore, existingCore) >= 0.95) return cand.id;
  }
  return null;
}

/**
 * Try to resolve a fuzzy company match to a confident match.
 * Handles: "Services" vs "Service", "The X" vs "X", trailing "Inc/LLC" edge cases.
 */
function resolveCompanyFuzzy(rawName, candidates) {
  const norm = normalizeCompanyName(rawName);
  if (!norm) return null;

  for (const cand of candidates) {
    const candNorm = normalizeCompanyName(cand.name);
    // Already normalized — try similarity at 92%+ (tighter than the matcher's 80%)
    if (similarity(norm, candNorm) >= 0.92) return cand.id;
    // Handle singular/plural: "Services" vs "Service", "Solutions" vs "Solution"
    const normS = norm.replace(/s$/, '');
    const candS = candNorm.replace(/s$/, '');
    if (normS === candS) return cand.id;
    // Handle "The X" vs "X"
    const normNoThe = norm.replace(/^the\s+/, '');
    const candNoThe = candNorm.replace(/^the\s+/, '');
    if (normNoThe === candNoThe) return cand.id;
    // Handle abbreviated suffixes: "Assoc" vs "Associates", "Svc" vs "Services"
    const expand = (s) => s
      .replace(/\bassoc\b/g, 'associates')
      .replace(/\bsvc\b/g, 'services')
      .replace(/\bsvcs\b/g, 'services')
      .replace(/\bmfg\b/g, 'manufacturing')
      .replace(/\bmgmt\b/g, 'management')
      .replace(/\bintl\b/g, 'international')
      .replace(/\bnatl\b/g, 'national');
    if (expand(norm) === expand(candNorm)) return cand.id;
  }
  return null;
}

// ============================================================
// MAIN IMPORT
// ============================================================

async function main() {
  console.log(`[zoominfo] Mode: ${dryRun ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`[zoominfo] Reading: ${XLSX_PATH}`);

  // 1. Read XLSX
  const wb = XLSX.readFile(XLSX_PATH);
  const allRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
  console.log(`[zoominfo] Total rows in file: ${allRows.length}`);

  // 2. Filter: US-only + has email
  const filtered = allRows.filter(r => {
    const country = (r['Country'] || '').trim();
    const email = (r['Email Address'] || '').trim();
    return email && (country === 'United States' || country === '');
  });
  console.log(`[zoominfo] After US + email filter: ${filtered.length}`);

  // 3. Parse rows
  const parsed = filtered.map(parseRow);

  // 4. Internal dedup by ZoomInfo Contact ID
  const seen = new Set();
  const deduped = [];
  for (const row of parsed) {
    const ziId = row.contactOverflow.zi_contact_id;
    if (ziId && seen.has(ziId)) continue;
    if (ziId) seen.add(ziId);
    deduped.push(row);
  }
  console.log(`[zoominfo] After internal dedup: ${deduped.length} (removed ${parsed.length - deduped.length} dupes)`);

  // Apply start-row offset
  const rows = deduped.slice(startRow);
  if (startRow > 0) console.log(`[zoominfo] Starting from row ${startRow}, processing ${rows.length} rows`);

  // 5. Connect to DB
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();

  const report = {
    contacts: { created: 0, matched: 0, enriched: 0 },
    companies: { created: 0, matched: 0, enriched: 0 },
    junctions: { created: 0, skipped: 0 },
    fuzzyContacts: [],
    fuzzyCompanies: [],
    errors: [],
  };

  try {
    // 6. Load all existing contacts + companies for matching
    console.log(`[zoominfo] Loading existing records from database...`);
    const { rows: existingContacts } = await client.query(
      `SELECT contact_id, full_name, email_1, email_2, email_3, phone_1, title,
              work_address, work_city, work_state, work_zip, linkedin, zoom_info_url,
              first_name, home_address, data_source, overflow
       FROM contacts`
    );
    const { rows: existingCompanies } = await client.query(
      `SELECT company_id, company_name, city, website, employees, revenue,
              industry_type, tenant_sic, tenant_naics, company_hq, overflow
       FROM companies`
    );
    console.log(`[zoominfo] Loaded ${existingContacts.length} contacts, ${existingCompanies.length} companies`);

    // Build company lookup by ZoomInfo Company ID (for dedup across rows sharing a company)
    const companyByZiId = new Map();  // zi_company_id → company_id (for newly created companies in this run)
    const companyByNorm = new Map();  // normalized name → company_id

    // Pre-populate from existing DB companies
    for (const c of existingCompanies) {
      const norm = normalizeCompanyName(c.company_name);
      if (norm) companyByNorm.set(norm, c.company_id);
    }

    // 7. Process rows in batches
    for (let batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, rows.length);

      if (!dryRun) await client.query('BEGIN');

      for (let i = batchStart; i < batchEnd; i++) {
        const row = rows[i];
        const rowNum = startRow + i;

        try {
          if (!dryRun) await client.query(`SAVEPOINT row_${rowNum}`);

          // ── COMPANY ──────────────────────────────────
          let companyId = null;

          if (row.company_name) {
            const ziCoId = row.companyOverflow.zi_company_id;

            // Check if we already processed this company in this run
            if (ziCoId && companyByZiId.has(ziCoId)) {
              companyId = companyByZiId.get(ziCoId);
              report.companies.matched++;
            } else {
              // Match against existing DB companies
              const compMatch = matchCompany(row.company_name, existingCompanies, row.company_city);

              if (compMatch.match) {
                companyId = compMatch.match.id;
                report.companies.matched++;

                // Enrich existing company (fill blanks only)
                if (!dryRun) {
                  const existing = existingCompanies.find(c => c.company_id === companyId);
                  if (existing) {
                    const enriched = await enrichCompany(client, companyId, row, existing);
                    if (enriched > 0) report.companies.enriched++;
                  }
                }
              } else if (compMatch.candidates.length > 0) {
                // Fuzzy match — try smart resolution first
                const resolvedId = resolveCompanyFuzzy(row.company_name, compMatch.candidates);
                if (resolvedId) {
                  // High-confidence fuzzy → treat as match, enrich
                  companyId = resolvedId;
                  report.companies.matched++;
                  if (!dryRun) {
                    const existing = existingCompanies.find(c => c.company_id === companyId);
                    if (existing) {
                      const enriched = await enrichCompany(client, companyId, row, existing);
                      if (enriched > 0) report.companies.enriched++;
                    }
                  }
                } else {
                  // Unresolved fuzzy — different company, create new
                  if (!dryRun) {
                    companyId = await insertCompany(client, row);
                    report.companies.created++;
                    existingCompanies.push({ company_id: companyId, company_name: row.company_name, city: row.company_city });
                  } else {
                    report.companies.created++;
                  }
                }
              } else {
                // No match — create new company
                if (!dryRun) {
                  companyId = await insertCompany(client, row);
                  report.companies.created++;
                  existingCompanies.push({ company_id: companyId, company_name: row.company_name, city: row.company_city });
                } else {
                  report.companies.created++;
                }
              }

              // Cache for subsequent rows with same ZoomInfo Company ID
              if (ziCoId && companyId) companyByZiId.set(ziCoId, companyId);
              const norm = normalizeCompanyName(row.company_name);
              if (norm && companyId) companyByNorm.set(norm, companyId);
            }
          }

          // ── CONTACT ──────────────────────────────────
          const contactMatch = matchContact(row, existingContacts);

          if (contactMatch.match) {
            const contactId = contactMatch.match.id;
            report.contacts.matched++;

            // Enrich existing contact (fill blanks only)
            if (!dryRun) {
              const existing = existingContacts.find(c => c.contact_id === contactId);
              if (existing) {
                const enriched = await enrichContact(client, contactId, row, existing);
                if (enriched > 0) report.contacts.enriched++;
              }
            }

            // Link to company if not already linked
            if (companyId && !dryRun) {
              await upsertJunction(client, 'contact_companies', { contact_id: contactId, company_id: companyId }, report);
            }
          } else if (contactMatch.candidates.length > 0) {
            // Fuzzy match — try smart resolution first
            const resolvedId = resolveContactFuzzy(row, contactMatch.candidates, existingContacts);
            if (resolvedId) {
              // High-confidence fuzzy → treat as match, enrich
              report.contacts.matched++;
              if (!dryRun) {
                const existing = existingContacts.find(c => c.contact_id === resolvedId);
                if (existing) {
                  const enriched = await enrichContact(client, resolvedId, row, existing);
                  if (enriched > 0) report.contacts.enriched++;
                }
                if (companyId) await upsertJunction(client, 'contact_companies', { contact_id: resolvedId, company_id: companyId }, report);
              }
            } else {
              // Unresolved fuzzy — different person, create new
              if (!dryRun) {
                const contactId = await insertContact(client, row);
                report.contacts.created++;
                existingContacts.push({ contact_id: contactId, full_name: row.full_name, email_1: row.email_1 });
                if (companyId) await upsertJunction(client, 'contact_companies', { contact_id: contactId, company_id: companyId }, report);
              } else {
                report.contacts.created++;
              }
            }
          } else {
            // No match — create new contact
            if (!dryRun) {
              const contactId = await insertContact(client, row);
              report.contacts.created++;
              existingContacts.push({ contact_id: contactId, full_name: row.full_name, email_1: row.email_1 });
              if (companyId) await upsertJunction(client, 'contact_companies', { contact_id: contactId, company_id: companyId }, report);
            } else {
              report.contacts.created++;
            }
          }

          if (!dryRun) await client.query(`RELEASE SAVEPOINT row_${rowNum}`);
        } catch (err) {
          if (!dryRun) await client.query(`ROLLBACK TO SAVEPOINT row_${rowNum}`).catch(() => {});
          report.errors.push({ rowNum, name: row.full_name, email: row.email_1, message: err.message });
        }

        // Progress every 200 rows
        if ((i + 1) % 200 === 0) {
          const pct = Math.round(((i + 1) / rows.length) * 100);
          process.stdout.write(`\r[zoominfo] Progress: ${i + 1}/${rows.length} (${pct}%)`);
        }
      }

      if (!dryRun) await client.query('COMMIT');
      console.log(`\n[zoominfo] Committed batch ${batchStart + 1}-${batchEnd}/${rows.length}`);
    }

    // 8. Print report
    console.log('\n' + '='.repeat(60));
    console.log('  ZoomInfo Import Report');
    console.log('='.repeat(60));
    console.log(`  Mode:       ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`  Source:     ${allRows.length} total → ${filtered.length} after filter → ${deduped.length} after dedup`);
    console.log('');
    console.log(`  Companies:  ${report.companies.created} created / ${report.companies.matched} matched / ${report.companies.enriched} enriched`);
    console.log(`  Contacts:   ${report.contacts.created} created / ${report.contacts.matched} matched / ${report.contacts.enriched} enriched`);
    console.log(`  Links:      ${report.junctions.created} contact_companies created / ${report.junctions.skipped} already existed`);
    console.log(`  Errors:     ${report.errors.length}`);
    console.log('');

    if (report.fuzzyContacts.length > 0) {
      console.log(`  Fuzzy contact matches (${report.fuzzyContacts.length}) — review these:`);
      for (const f of report.fuzzyContacts.slice(0, 20)) {
        console.log(`    Row ${f.rowNum}: "${f.name}" (${f.email}) → candidates: ${f.candidates.map(c => c.name).join(', ')}`);
      }
      if (report.fuzzyContacts.length > 20) console.log(`    ... and ${report.fuzzyContacts.length - 20} more`);
      console.log('');
    }

    if (report.fuzzyCompanies.length > 0) {
      console.log(`  Fuzzy company matches (${report.fuzzyCompanies.length}) — review these:`);
      for (const f of report.fuzzyCompanies.slice(0, 20)) {
        console.log(`    Row ${f.rowNum}: "${f.name}" → candidates: ${f.candidates.map(c => c.name).join(', ')}`);
      }
      if (report.fuzzyCompanies.length > 20) console.log(`    ... and ${report.fuzzyCompanies.length - 20} more`);
      console.log('');
    }

    if (report.errors.length > 0) {
      console.log(`  Errors (${report.errors.length}):`);
      for (const e of report.errors.slice(0, 20)) {
        console.log(`    Row ${e.rowNum}: ${e.name} — ${e.message}`);
      }
      console.log('');
    }

    console.log('='.repeat(60));

  } catch (err) {
    if (!dryRun) await client.query('ROLLBACK').catch(() => {});
    console.error('[zoominfo] Fatal error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

// ============================================================
// INSERT HELPERS
// ============================================================

async function insertContact(client, row) {
  const cols = [];
  const vals = [];

  const DIRECT_COLS = [
    'full_name', 'first_name', 'email_1', 'title',
    'phone_1', 'phone_2', 'phone_3',
    'home_address', 'work_address', 'work_city', 'work_state', 'work_zip',
    'linkedin', 'zoom_info_url', 'data_source',
  ];

  for (const col of DIRECT_COLS) {
    if (row[col] != null && row[col] !== '') {
      cols.push(col);
      vals.push(row[col]);
    }
  }

  // Add overflow
  if (Object.keys(row.contactOverflow).length > 0) {
    cols.push('overflow');
    vals.push(JSON.stringify(row.contactOverflow));
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`);
  const { rows } = await client.query(
    `INSERT INTO contacts (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING contact_id`,
    vals
  );
  return rows[0].contact_id;
}

async function insertCompany(client, row) {
  const cols = ['company_name'];
  const vals = [row.company_name];

  const ENRICH_MAP = {
    website: 'website',
    employees: 'employees',
    revenue: 'revenue',
    industry_type: 'industry_type',
    tenant_sic: 'tenant_sic',
    tenant_naics: 'tenant_naics',
    company_city: 'city',
    company_hq: 'company_hq',
  };

  for (const [rowKey, dbCol] of Object.entries(ENRICH_MAP)) {
    if (row[rowKey] != null && row[rowKey] !== '') {
      cols.push(dbCol);
      vals.push(row[rowKey]);
    }
  }

  // Add overflow
  if (Object.keys(row.companyOverflow).length > 0) {
    cols.push('overflow');
    vals.push(JSON.stringify(row.companyOverflow));
  }

  const placeholders = vals.map((_, i) => `$${i + 1}`);
  const { rows } = await client.query(
    `INSERT INTO companies (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING company_id`,
    vals
  );
  return rows[0].company_id;
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
// RUN
// ============================================================

main().catch(err => {
  console.error('[zoominfo] Failed:', err);
  process.exit(1);
});
