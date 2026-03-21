#!/usr/bin/env node
// migrate-airtable-companies.js — CLI runner for Airtable companies CSV import.
// Usage:
//   node scripts/migrate-airtable-companies.js --dry-run   # preview only
//   node scripts/migrate-airtable-companies.js --live       # commit to DB
//   node scripts/migrate-airtable-companies.js --live --start-row=100  # resume

const { Pool } = require('pg');
const XLSX = require('xlsx');
const { parseAirtableCompanyRow } = require('../server/utils/airtableCompanyParser');
const { processAirtableCompanies } = require('../server/utils/airtableCompanyEngine');

const CSV_PATH = process.env.CSV_PATH || '/Users/davidmudgejr/Downloads/Companies-All Companies.csv';
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
  || 'postgresql://neondb_owner:npg_LFY9Gyds7VDA@ep-withered-mode-aktp7v63-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const live = args.includes('--live');
  const startRowArg = args.find(a => a.startsWith('--start-row='));
  const startRow = startRowArg ? parseInt(startRowArg.split('=')[1], 10) : 0;

  if (!dryRun && !live) {
    console.error('Usage: node scripts/migrate-airtable-companies.js [--dry-run | --live] [--start-row=N]');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Airtable Companies CSV Import — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Read CSV
  console.log(`[cli] Reading CSV: ${CSV_PATH}`);
  const wb = XLSX.readFile(CSV_PATH);
  const sheetName = wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
  console.log(`[cli] Parsed ${rawRows.length} rows from sheet "${sheetName}"`);

  // Parse all rows
  console.log(`[cli] Parsing rows...`);
  const parsedRows = rawRows.map(raw => parseAirtableCompanyRow(raw));

  // Filter: must have Company Name
  const validRows = parsedRows.filter(r => {
    if (!r.companyName) return false;
    return true;
  });
  const skippedCount = parsedRows.length - validRows.length;
  console.log(`[cli] ${validRows.length} valid rows (${skippedCount} skipped — no company name)`);

  // Apply --start-row if resuming
  const rowsToProcess = startRow > 0 ? validRows.slice(startRow) : validRows;
  if (startRow > 0) {
    console.log(`[cli] Resuming from row ${startRow} — processing ${rowsToProcess.length} remaining rows`);
  }

  // Run engine
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    const report = await processAirtableCompanies(rowsToProcess, pool, { dryRun });

    // Print report
    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESULTS — ${dryRun ? 'DRY RUN (no data written)' : 'COMMITTED'}`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`Companies:    ${report.companies.created} created, ${report.companies.matched} matched, ${report.companies.enriched} enriched`);
    console.log(`Properties:   ${report.properties.tenantLinked} tenant links, ${report.properties.ownerLinked} owner links`);
    console.log(`Contacts:     ${report.contacts.linked} linked`);
    console.log(`Interactions: ${report.interactions.created} created`);
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
        console.log(`  [row ${e.rowNum}] ${e.companyName || 'unknown'}: ${e.message}`);
      }
      if (report.errors.length > 20) console.log(`  ... and ${report.errors.length - 20} more`);
    }

    if (report.warnings.length > 0) {
      const propWarnings = report.warnings.filter(w => w.message.includes('not found'));
      const otherWarnings = report.warnings.filter(w => !w.message.includes('not found'));
      console.log(`\n--- Warnings (${report.warnings.length}) ---`);
      console.log(`  ${propWarnings.length} property/contact not found`);
      console.log(`  ${otherWarnings.length} other warnings`);
      for (const w of otherWarnings.slice(0, 20)) {
        console.log(`  [row ${w.rowNum}] ${w.message}`);
      }
      for (const w of propWarnings.slice(0, 20)) {
        console.log(`  [row ${w.rowNum}] ${w.message}`);
      }
      if (propWarnings.length > 20) console.log(`  ... and ${propWarnings.length - 20} more property/contact warnings`);
    }

    // Write full report to JSON file
    const reportPath = `/tmp/airtable-companies-import-report-${dryRun ? 'dry' : 'live'}-${Date.now()}.json`;
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
