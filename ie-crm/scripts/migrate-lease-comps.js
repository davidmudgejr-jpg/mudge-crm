#!/usr/bin/env node
// Lease Comp Migration Script — one-time bulk import from CoStar Excel.
// Usage: node scripts/migrate-lease-comps.js [--dry-run] [--sheet=all|1|2|3]

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const XLSX = require('@e965/xlsx');
const { parseCoStarExcelRow } = require('../server/utils/rowParsers');
const { processLeaseComps } = require('../server/utils/leaseCompEngine');

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const sheetArg = (args.find(a => a.startsWith('--sheet=')) || '--sheet=all').split('=')[1];
const filePath = args.find(a => !a.startsWith('--')) ||
  '/Users/davidmudgejr/Desktop/Industrial sale:lease comps REapps/Lease comps 1.1.18-2.15.26.xlsx';

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
