#!/usr/bin/env node
// migrate-airtable-campaigns.js — CLI runner for Airtable campaigns CSV import.
// Usage:
//   node scripts/migrate-airtable-campaigns.js --dry-run   # preview only
//   node scripts/migrate-airtable-campaigns.js --live       # commit to DB

const { Pool } = require('pg');
const XLSX = require('xlsx');
const { parseAirtableCampaignRow } = require('../server/utils/airtableCampaignParser');
const { processAirtableCampaigns } = require('../server/utils/airtableCampaignEngine');

const CSV_PATH = process.env.CSV_PATH || '/Users/davidmudgejr/Downloads/Campaigns-All Campaigns.csv';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: true });
const DATABASE_URL = process.env.DATABASE_URL;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const live = args.includes('--live');

  if (!dryRun && !live) {
    console.error('Usage: node scripts/migrate-airtable-campaigns.js [--dry-run | --live]');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Airtable Campaigns CSV Import — ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Read CSV
  console.log(`[cli] Reading CSV: ${CSV_PATH}`);
  const wb = XLSX.readFile(CSV_PATH);
  const sheetName = wb.SheetNames[0];
  const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
  console.log(`[cli] Parsed ${rawRows.length} rows from sheet "${sheetName}"`);

  // Parse all rows
  console.log(`[cli] Parsing rows...`);
  const parsedRows = rawRows.map(raw => parseAirtableCampaignRow(raw));

  // Filter: must have Name
  const validRows = parsedRows.filter(r => r.name);
  const skippedCount = parsedRows.length - validRows.length;
  console.log(`[cli] ${validRows.length} valid rows (${skippedCount} skipped — no name)`);

  // Run engine
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    const report = await processAirtableCampaigns(validRows, pool, { dryRun });

    // Print report
    console.log(`\n${'='.repeat(60)}`);
    console.log(`RESULTS — ${dryRun ? 'DRY RUN (no data written)' : 'COMMITTED'}`);
    console.log(`${'='.repeat(60)}\n`);

    console.log(`Campaigns:    ${report.campaigns.created} created, ${report.campaigns.matched} matched, ${report.campaigns.enriched} enriched`);
    console.log(`Contacts:     ${report.contacts.linked} linked, ${report.contacts.notFound} not found`);
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
        console.log(`  [row ${e.rowNum}] ${e.campaignName || 'unknown'}: ${e.message}`);
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
    const reportPath = `/tmp/airtable-campaigns-import-report-${dryRun ? 'dry' : 'live'}-${Date.now()}.json`;
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
