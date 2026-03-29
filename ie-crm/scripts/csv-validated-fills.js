#!/usr/bin/env node
/**
 * CSV Validated Fills — Cross-references the legacy CRM CSV export against
 * the live IE CRM database to fill two categories of gaps:
 *
 * 1. PROPERTY OWNER FILLS — CSV owners whose address matches a CRM property
 *    with a blank owner_name field. Validated by comparing the CSV contact's
 *    last-revised date against the property's last_sale_date: if the building
 *    sold AFTER the contact was updated, the owner data is stale and skipped.
 *
 * 2. CONTACT GAP FILLS — Existing CRM contacts (matched by full_name) that
 *    are missing email or phone. Only fills blank fields; never overwrites
 *    existing CRM data (CRM is source of truth).
 *
 * Usage:
 *   node scripts/csv-validated-fills.js                # dry run (default)
 *   node scripts/csv-validated-fills.js --apply         # apply changes
 *   node scripts/csv-validated-fills.js --apply --verbose
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { normalizeAddress } = require('../server/utils/addressNormalizer');

// ── Config ──────────────────────────────────────────────────────────────────
const CSV_PATH = path.resolve(__dirname, '../../../CSV files/contacts.csv');
const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://neondb_owner:npg_V3iYAZdSb0Ke@ep-withered-mode-aktp7v63-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require';

const pool = new Pool({ connectionString: DATABASE_URL });

// ── CSV Parser (handles quoted fields) ──────────────────────────────────────
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes; }
    else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += line[i]; }
  }
  result.push(current.trim());
  return result;
}

function loadCSV(filePath) {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (fields[idx] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function normalizeCity(city) {
  return (city || '').toLowerCase().trim();
}

function addrKey(address, city) {
  const norm = normalizeAddress(address);
  return norm ? `${norm}|${normalizeCity(city)}` : null;
}

function formatPhone(raw) {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits[0] === '1') return digits.slice(1);
  return digits.length >= 7 ? digits : null;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  CSV VALIDATED FILLS — ${DRY_RUN ? 'DRY RUN' : '⚡ APPLYING CHANGES'}`);
  console.log(`${'═'.repeat(60)}\n`);

  // Load CSV
  console.log('Loading CSV...');
  const csvRows = loadCSV(CSV_PATH);
  console.log(`  ${csvRows.length} contacts loaded\n`);

  // ── Load CRM data ───────────────────────────────────────────────────────
  console.log('Loading CRM data...');

  const [propsResult, contactsResult, saleCompsResult] = await Promise.all([
    pool.query(`SELECT property_id, property_address, city, state,
                       owner_name, owner_phone, owner_email,
                       last_sale_date
                FROM properties WHERE property_address IS NOT NULL`),
    pool.query(`SELECT contact_id, full_name, first_name, email,
                       phone_1, phone_2, type
                FROM contacts`),
    pool.query(`SELECT DISTINCT ON (property_id)
                       property_id, sale_date
                FROM sale_comps
                WHERE sale_date IS NOT NULL
                ORDER BY property_id, sale_date DESC`),
  ]);

  const crmProps = new Map();
  for (const r of propsResult.rows) {
    const key = addrKey(r.property_address, r.city);
    if (key) crmProps.set(key, r);
  }

  const crmContacts = new Map();
  for (const c of contactsResult.rows) {
    if (c.full_name) crmContacts.set(c.full_name.toLowerCase().trim(), c);
  }

  const latestSaleComp = new Map();
  for (const s of saleCompsResult.rows) {
    latestSaleComp.set(s.property_id, new Date(s.sale_date));
  }

  console.log(`  ${crmProps.size} properties, ${crmContacts.size} contacts, ${latestSaleComp.size} sale comps\n`);

  // ══════════════════════════════════════════════════════════════════════════
  // PART 1: Property Owner Fills
  // ══════════════════════════════════════════════════════════════════════════
  console.log('─── PART 1: Property Owner Fills ───────────────────────────\n');

  const ownerFills = [];   // validated fills
  const staleOwners = [];  // rejected — building sold after contact date

  for (const row of csvRows) {
    if (row.Category !== 'Owner') continue;
    const fn = row.FirstName;
    const ln = row.LastName;
    if (!fn && !ln) continue;

    const fullName = `${fn} ${ln}`.trim();
    // Skip if already in CRM as a contact
    if (crmContacts.has(fullName.toLowerCase())) continue;

    const key = addrKey(row.Address1, row.City);
    if (!key) continue;

    const prop = crmProps.get(key);
    if (!prop) continue;

    // Only fill blank owner fields
    if (prop.owner_name && prop.owner_name.trim() !== '') continue;

    // ── Sale-date validation ──
    const contactDate = row.RevisedDateTime || row.CreatedDateTime;
    if (!contactDate) continue; // can't validate without a date

    const contactDateObj = new Date(contactDate);

    // Best sale date: property field or most recent sale comp
    let bestSaleDate = prop.last_sale_date ? new Date(prop.last_sale_date) : null;
    const scDate = latestSaleComp.get(prop.property_id);
    if (scDate && (!bestSaleDate || scDate > bestSaleDate)) bestSaleDate = scDate;

    if (bestSaleDate && bestSaleDate > contactDateObj) {
      staleOwners.push({
        name: fullName,
        company: row.CompanyName,
        address: prop.property_address,
        city: prop.city,
        contactDate: contactDate.substring(0, 10),
        saleDate: bestSaleDate.toISOString().substring(0, 10),
      });
      continue; // building sold after contact — stale
    }

    ownerFills.push({
      propertyId: prop.property_id,
      address: prop.property_address,
      city: prop.city,
      ownerName: fullName,
      company: row.CompanyName,
      phone: formatPhone(row.DirectPhone) || formatPhone(row.MobilePhone),
      email: row.WorkEmail || null,
      contactDate: contactDate.substring(0, 10),
      saleInfo: bestSaleDate
        ? `Last sale ${bestSaleDate.toISOString().substring(0, 10)} (before contact)`
        : 'No sale recorded',
    });
  }

  console.log(`  Validated owner fills: ${ownerFills.length}`);
  console.log(`  Rejected (sold since):  ${staleOwners.length}\n`);

  if (VERBOSE || DRY_RUN) {
    if (ownerFills.length > 0) {
      console.log('  ✓ WILL FILL:');
      for (const f of ownerFills) {
        console.log(`    ${f.address}, ${f.city}`);
        console.log(`      → owner_name: "${f.ownerName}" (${f.company})`);
        if (f.phone) console.log(`      → owner_phone: ${f.phone}`);
        if (f.email) console.log(`      → owner_email: ${f.email}`);
        console.log(`      Contact date: ${f.contactDate} | ${f.saleInfo}`);
      }
    }
    if (staleOwners.length > 0 && VERBOSE) {
      console.log('\n  ✗ REJECTED (building sold after contact):');
      for (const s of staleOwners) {
        console.log(`    ${s.address}, ${s.city} — ${s.name} (contact: ${s.contactDate}, sold: ${s.saleDate})`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART 2: Contact Gap Fills (email + phone)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n─── PART 2: Contact Email/Phone Gap Fills ─────────────────\n');

  const emailFills = [];
  const phoneFills = [];

  for (const row of csvRows) {
    // Skip brokers/agents per David's instruction
    if (row.Category === 'Broker' || row.Category === 'Agent') continue;

    const fn = row.FirstName;
    const ln = row.LastName;
    if (!fn && !ln) continue;

    const fullName = `${fn} ${ln}`.toLowerCase().trim();
    const crm = crmContacts.get(fullName);
    if (!crm) continue;

    // Only fill for owner and tenant types in CRM (skip broker-typed contacts)
    const crmType = (crm.type || '').toLowerCase();
    if (crmType.includes('broker')) continue;

    const csvEmail = row.WorkEmail;
    const csvPhone = formatPhone(row.DirectPhone) || formatPhone(row.MobilePhone);

    // Fill email only if CRM email is blank
    if (csvEmail && (!crm.email || crm.email.trim() === '')) {
      // Skip obvious broker emails (lee-associates, cbre, jll, etc.)
      const emailLower = csvEmail.toLowerCase();
      const brokerDomains = ['lee-associates', 'lee-assoc', 'cbre', 'jll', 'cushman', 'colliers', 'newmark', 'marcus', 'millichap'];
      const isBrokerEmail = brokerDomains.some(d => emailLower.includes(d));
      if (!isBrokerEmail) {
        emailFills.push({
          contactId: crm.contact_id,
          fullName: crm.full_name,
          crmType: crm.type,
          email: csvEmail,
        });
      }
    }

    // Fill phone only if CRM phone_1 is blank
    if (csvPhone && (!crm.phone_1 || crm.phone_1.trim() === '')) {
      phoneFills.push({
        contactId: crm.contact_id,
        fullName: crm.full_name,
        crmType: crm.type,
        phone: csvPhone,
      });
    }
  }

  console.log(`  Email fills: ${emailFills.length}`);
  console.log(`  Phone fills: ${phoneFills.length}\n`);

  if (VERBOSE || DRY_RUN) {
    if (emailFills.length > 0) {
      console.log('  ✓ EMAIL FILLS:');
      for (const f of emailFills) {
        console.log(`    ${f.fullName} (${f.crmType}) → email: ${f.email}`);
      }
    }
    if (phoneFills.length > 0) {
      console.log('\n  ✓ PHONE FILLS:');
      for (const f of phoneFills.slice(0, DRY_RUN ? 999 : 20)) {
        console.log(`    ${f.fullName} (${f.crmType}) → phone: ${f.phone}`);
      }
      if (!DRY_RUN && phoneFills.length > 20) {
        console.log(`    ... and ${phoneFills.length - 20} more`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // APPLY CHANGES
  // ══════════════════════════════════════════════════════════════════════════
  if (DRY_RUN) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  DRY RUN COMPLETE — no changes made.');
    console.log('  Run with --apply to execute updates.');
    console.log(`${'─'.repeat(60)}\n`);
  } else {
    console.log(`\n${'─'.repeat(60)}`);
    console.log('  APPLYING CHANGES...');
    console.log(`${'─'.repeat(60)}\n`);

    let propUpdated = 0;
    let emailUpdated = 0;
    let phoneUpdated = 0;

    // Part 1: Property owner fills
    for (const f of ownerFills) {
      const setClauses = [`owner_name = $2`];
      const params = [f.propertyId, f.ownerName];
      let paramIdx = 3;

      if (f.phone) {
        setClauses.push(`owner_phone = $${paramIdx}`);
        params.push(f.phone);
        paramIdx++;
      }
      if (f.email) {
        setClauses.push(`owner_email = $${paramIdx}`);
        params.push(f.email);
        paramIdx++;
      }

      await pool.query(
        `UPDATE properties SET ${setClauses.join(', ')} WHERE property_id = $1`,
        params
      );
      propUpdated++;
      if (VERBOSE) console.log(`  ✓ Property: ${f.address}, ${f.city} → ${f.ownerName}`);
    }

    // Part 2a: Email fills
    for (const f of emailFills) {
      await pool.query(
        `UPDATE contacts SET email = $2 WHERE contact_id = $1 AND (email IS NULL OR email = '')`,
        [f.contactId, f.email]
      );
      emailUpdated++;
    }

    // Part 2b: Phone fills
    for (const f of phoneFills) {
      await pool.query(
        `UPDATE contacts SET phone_1 = $2 WHERE contact_id = $1 AND (phone_1 IS NULL OR phone_1 = '')`,
        [f.contactId, f.phone]
      );
      phoneUpdated++;
    }

    console.log(`\n  DONE:`);
    console.log(`    Properties updated (owner name): ${propUpdated}`);
    console.log(`    Contacts updated (email):        ${emailUpdated}`);
    console.log(`    Contacts updated (phone):        ${phoneUpdated}`);
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Property owner fills (validated):  ${ownerFills.length}`);
  console.log(`  Property owner rejected (stale):   ${staleOwners.length}`);
  console.log(`  Contact email fills:               ${emailFills.length}`);
  console.log(`  Contact phone fills:               ${phoneFills.length}`);
  console.log(`  Total updates:                     ${ownerFills.length + emailFills.length + phoneFills.length}`);
  console.log(`${'═'.repeat(60)}\n`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  pool.end();
  process.exit(1);
});
