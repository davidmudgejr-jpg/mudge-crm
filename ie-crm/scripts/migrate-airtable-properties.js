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
