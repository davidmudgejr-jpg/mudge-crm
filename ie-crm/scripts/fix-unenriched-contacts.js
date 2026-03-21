#!/usr/bin/env node
/**
 * Fix 508 unenriched contacts (type=null) by matching them against the contacts CSV
 * and enriching with email, phone, type, company links, etc.
 */

const { Pool } = require('pg');
const xlsx = require('xlsx');
const { normalizeContactName, normalizeCompanyName } = require('../server/utils/addressNormalizer');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_LFY9Gyds7VDA@ep-withered-mode-aktp7v63-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require';
const dryRun = !process.argv.includes('--live');

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Fix Unenriched Contacts — ${dryRun ? '🟡 DRY RUN' : '🔴 LIVE'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Load contacts CSV into a lookup by normalized name
  console.log('[1/4] Loading contacts CSV...');
  const wb = xlsx.readFile("/Users/davidmudgejr/Downloads/Contacts-All (DON'T DELETE) (1).csv");
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const csvRows = xlsx.utils.sheet_to_json(sheet);
  console.log(`  ${csvRows.length} rows in CSV`);

  // Build CSV lookup: normalized name → CSV row (first match wins)
  const csvLookup = new Map();
  for (const row of csvRows) {
    const name = (row['Full Name'] || '').toString().trim();
    if (!name) continue;
    const norm = normalizeContactName(name);
    if (norm && !csvLookup.has(norm)) {
      csvLookup.set(norm, row);
    }
  }
  console.log(`  ${csvLookup.size} unique normalized names in CSV`);

  // Connect to DB
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  // Load company cache
  console.log('[2/4] Loading company cache...');
  const { rows: allCompanies } = await client.query('SELECT company_id, company_name FROM companies');
  const companyCache = new Map();
  for (const c of allCompanies) {
    const norm = normalizeCompanyName(c.company_name);
    if (norm) companyCache.set(norm, c.company_id);
  }
  console.log(`  ${companyCache.size} companies cached`);

  // Load campaign cache
  const { rows: allCampaigns } = await client.query('SELECT campaign_id, name FROM campaigns');
  const campaignCache = new Map();
  for (const c of allCampaigns) {
    if (c.name) campaignCache.set(c.name.toLowerCase().trim(), c.campaign_id);
  }

  // Find unenriched contacts
  console.log('[3/4] Finding unenriched contacts...');
  const { rows: unenriched } = await client.query(
    `SELECT contact_id, full_name FROM contacts WHERE type IS NULL`
  );
  console.log(`  ${unenriched.length} contacts with type=null`);

  // Match and enrich
  console.log('[4/4] Enriching...');
  const report = { matched: 0, enriched: 0, companiesLinked: 0, campaignsLinked: 0, notFound: 0, errors: 0 };

  if (!dryRun) await client.query('BEGIN');

  for (const contact of unenriched) {
    const norm = normalizeContactName(contact.full_name);
    if (!norm) continue;

    const csvRow = csvLookup.get(norm);
    if (!csvRow) {
      report.notFound++;
      continue;
    }

    report.matched++;

    try {
      if (!dryRun) await client.query(`SAVEPOINT fix_${contact.contact_id.replace(/-/g, '').slice(0, 20)}`);

      // Build SET clause for enrichment (fill blanks only)
      const fields = {};
      const clean = (v) => v && v.toString().trim() ? v.toString().trim() : null;
      const types = clean(csvRow['Type']);
      if (types) fields.type = types;
      if (clean(csvRow['First Name'])) fields.first_name = clean(csvRow['First Name']);
      if (clean(csvRow['Title'])) fields.title = clean(csvRow['Title']);
      if (clean(csvRow['Email'])) fields.email = clean(csvRow['Email']);
      if (clean(csvRow['2nd Email'])) fields.email_2 = clean(csvRow['2nd Email']);
      if (clean(csvRow['3rd Email'])) fields.email_3 = clean(csvRow['3rd Email']);
      if (clean(csvRow['Phone 1'])) fields.phone_1 = clean(csvRow['Phone 1']);
      if (clean(csvRow['Phone 2'])) fields.phone_2 = clean(csvRow['Phone 2']);
      if (clean(csvRow['Phone 3'])) fields.phone_3 = clean(csvRow['Phone 3']);
      if (clean(csvRow['Work Address'])) fields.work_address = clean(csvRow['Work Address']);
      if (clean(csvRow['Home Address'])) fields.home_address = clean(csvRow['Home Address']);
      if (clean(csvRow['Office/Ind'])) fields.property_type_interest = clean(csvRow['Office/Ind']);
      if (clean(csvRow['Client Level'])) fields.client_level = clean(csvRow['Client Level']);
      if (clean(csvRow['Data Source'])) fields.data_source = clean(csvRow['Data Source']);
      if (csvRow['Email HOT']) fields.email_hot = true;
      if (csvRow['Phone HOT']) fields.phone_hot = true;

      if (Object.keys(fields).length > 0 && !dryRun) {
        const setClauses = Object.keys(fields).map((k, i) => `${k} = COALESCE(${k}, $${i + 2})`);
        const values = Object.values(fields);
        await client.query(
          `UPDATE contacts SET ${setClauses.join(', ')} WHERE contact_id = $1`,
          [contact.contact_id, ...values]
        );
        report.enriched++;
      }

      // Link to companies
      const companiesRaw = clean(csvRow['Companies']);
      if (companiesRaw && !dryRun) {
        const companyNames = companiesRaw.split(',').map(s => s.replace(/\s*\((?:owner|tenant|broker)\)\s*$/i, '').trim()).filter(Boolean);
        for (const compName of companyNames) {
          const normComp = normalizeCompanyName(compName);
          let companyId = normComp ? companyCache.get(normComp) : null;

          if (!companyId) {
            // Try case-insensitive exact match
            const { rows } = await client.query(
              `SELECT company_id FROM companies WHERE company_name ILIKE $1 LIMIT 1`,
              [compName]
            );
            if (rows.length > 0) companyId = rows[0].company_id;
          }

          if (!companyId) {
            // Create the company
            const { rows } = await client.query(
              `INSERT INTO companies (company_name) VALUES ($1) RETURNING company_id`,
              [compName]
            );
            companyId = rows[0].company_id;
            const normNew = normalizeCompanyName(compName);
            if (normNew) companyCache.set(normNew, companyId);
          }

          if (companyId) {
            await client.query(
              `INSERT INTO contact_companies (contact_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [contact.contact_id, companyId]
            );
            report.companiesLinked++;
          }
        }
      }

      // Link to campaigns
      const campaignsRaw = clean(csvRow['Campaigns']);
      if (campaignsRaw && !dryRun) {
        const campNames = campaignsRaw.split(',').map(s => s.trim()).filter(Boolean);
        for (const campName of campNames) {
          const normCamp = campName.toLowerCase().trim();
          let campaignId = campaignCache.get(normCamp);

          if (!campaignId) {
            const { rows } = await client.query(
              `SELECT campaign_id FROM campaigns WHERE name ILIKE $1 LIMIT 1`,
              [campName]
            );
            if (rows.length > 0) campaignId = rows[0].campaign_id;
          }

          if (campaignId) {
            await client.query(
              `INSERT INTO campaign_contacts (campaign_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
              [campaignId, contact.contact_id]
            );
            report.campaignsLinked++;
          }
        }
      }

      if (!dryRun) await client.query(`RELEASE SAVEPOINT fix_${contact.contact_id.replace(/-/g, '').slice(0, 20)}`);
    } catch (err) {
      report.errors++;
      console.error(`  Error on ${contact.full_name}: ${err.message}`);
      if (!dryRun) await client.query(`ROLLBACK TO SAVEPOINT fix_${contact.contact_id.replace(/-/g, '').slice(0, 20)}`).catch(() => {});
    }
  }

  if (!dryRun) await client.query('COMMIT');

  console.log(`\n${'='.repeat(60)}`);
  console.log('REPORT');
  console.log(`${'='.repeat(60)}`);
  console.log(`Unenriched contacts found: ${unenriched.length}`);
  console.log(`Matched in CSV: ${report.matched}`);
  console.log(`Enriched with data: ${report.enriched}`);
  console.log(`Company links created: ${report.companiesLinked}`);
  console.log(`Campaign links created: ${report.campaignsLinked}`);
  console.log(`Not found in CSV: ${report.notFound}`);
  console.log(`Errors: ${report.errors}`);

  client.release();
  await pool.end();
}

main().catch(console.error);
