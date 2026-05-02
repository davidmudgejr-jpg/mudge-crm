#!/usr/bin/env node
// migrate-airtable-contacts.js — CLI runner for Airtable contacts CSV import.
// Usage:
//   node scripts/migrate-airtable-contacts.js --dry-run   # preview only
//   node scripts/migrate-airtable-contacts.js --live       # commit to DB
//   node scripts/migrate-airtable-contacts.js --live --start-row=500  # resume

const { Pool } = require('pg');
const XLSX = require('@e965/xlsx');
const { parseAirtableContactRow } = require('../server/utils/airtableContactParser');
const { processAirtableContacts } = require('../server/utils/airtableContactEngine');

const CSV_PATH = process.env.CSV_PATH || '/Users/davidmudgejr/Downloads/Contacts-All (DON\'T DELETE) (1).csv';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const live = args.includes('--live');
  const startRowArg = args.find(a => a.startsWith('--start-row='));
  const startRow = startRowArg ? parseInt(startRowArg.split('=')[1], 10) : 0;

  if (!dryRun && !live) {
    console.error('Usage: node scripts/migrate-airtable-contacts.js [--dry-run | --live] [--start-row=N]');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Airtable Contacts CSV Import — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Read CSV
  console.log(`[cli] Reading CSV: ${CSV_PATH}`);
  const wb = XLSX.readFile(CSV_PATH);
  const sheetName = wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
  console.log(`[cli] Parsed ${rawRows.length} rows from sheet "${sheetName}"`);

  // Parse all rows
  console.log(`[cli] Parsing rows...`);
  const parsedRows = rawRows.map(raw => parseAirtableContactRow(raw));

  // Filter: must have Full Name, skip test rows
  const TEST_RE = /^test/i;
  const validRows = parsedRows.filter(r => {
    if (!r.fullName) return false;
    if (TEST_RE.test(r.fullName)) return false;
    return true;
  });
  const skippedCount = parsedRows.length - validRows.length;
  console.log(`[cli] ${validRows.length} valid rows (${skippedCount} skipped — no name or test rows)`);

  // Apply --start-row if resuming
  const rowsToProcess = startRow > 0 ? validRows.slice(startRow) : validRows;
  if (startRow > 0) {
    console.log(`[cli] Resuming from row ${startRow} — processing ${rowsToProcess.length} remaining rows`);
  }

  // Run engine
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    const report = await processAirtableContacts(rowsToProcess, pool, { dryRun });

    // Print report
    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESULTS — ${dryRun ? 'DRY RUN (no data written)' : 'COMMITTED'}`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`Contacts:     ${report.contacts.created} created, ${report.contacts.matched} matched, ${report.contacts.enriched} enriched`);
    console.log(`Companies:    ${report.companies.created} created, ${report.companies.matched} matched`);
    console.log(`Properties:   ${report.properties.linked} linked (owner role)`);
    console.log(`Campaigns:    ${report.campaigns.created} created, ${report.campaigns.matched} matched`);
    console.log(`Interactions: ${report.interactions.created} created`);
    console.log(`Action Items: ${report.actionItems.created} created`);
    console.log(`Junctions:    ${report.junctions.created} created, ${report.junctions.skipped} skipped`);
    console.log(`Errors:       ${report.errors.length}`);
    console.log(`Warnings:     ${report.warnings.length}`);

    if (report.fuzzyMatches.length > 0) {
      console.log(`\n--- Fuzzy Matches (${report.fuzzyMatches.length}) ---`);
      const reviews = report.fuzzyMatches.filter(m => m.review);
      console.log(`  ${reviews.length} flagged for REVIEW (lower confidence)`);
      for (const m of reviews.slice(0, 20)) {
        console.log(`  [row ${m.rowNum}] ${m.type}: "${m.original}" -> "${m.matchedTo}" (${(m.similarity * 100).toFixed(1)}%)`);
      }
      if (reviews.length > 20) console.log(`  ... and ${reviews.length - 20} more`);

      const autoMatches = report.fuzzyMatches.filter(m => !m.review);
      if (autoMatches.length > 0) {
        console.log(`  ${autoMatches.length} auto-matched (high confidence)`);
        for (const m of autoMatches.slice(0, 10)) {
          console.log(`  [row ${m.rowNum}] ${m.type}: "${m.original}" -> "${m.matchedTo}" (${(m.similarity * 100).toFixed(1)}%)`);
        }
        if (autoMatches.length > 10) console.log(`  ... and ${autoMatches.length - 10} more`);
      }
    }

    if (report.errors.length > 0) {
      console.log(`\n--- Errors (${report.errors.length}) ---`);
      for (const e of report.errors.slice(0, 20)) {
        console.log(`  [row ${e.rowNum}] ${e.fullName || 'unknown'}: ${e.message}`);
      }
      if (report.errors.length > 20) console.log(`  ... and ${report.errors.length - 20} more`);
    }

    if (report.warnings.length > 0) {
      console.log(`\n--- Warnings (${report.warnings.length}) ---`);
      for (const w of report.warnings.slice(0, 20)) {
        console.log(`  [row ${w.rowNum}] ${w.message}`);
      }
      if (report.warnings.length > 20) console.log(`  ... and ${report.warnings.length - 20} more`);
    }

    // Write full report to JSON file
    const reportPath = `/tmp/airtable-contacts-import-report-${dryRun ? 'dry' : 'live'}-${Date.now()}.json`;
    require('fs').writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\nFull report saved to: ${reportPath}`);

  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
