#!/usr/bin/env node
// TPE Data Migration Script — bulk import from TPE Master List Excel.
// Usage:
//   node scripts/migrate-tpe-data.js --dry-run                    # preview all sheets
//   node scripts/migrate-tpe-data.js --dry-run --sheet=distress   # preview one sheet
//   node scripts/migrate-tpe-data.js --live                       # commit all sheets
//   node scripts/migrate-tpe-data.js --live --sheet=debt          # commit one sheet
//
// Sheets: all, distress, loans, growth, debt

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const { parseAllSheets } = require('../server/utils/tpeParser');
const { processTPEData } = require('../server/utils/tpeImportEngine');

const DEFAULT_FILE = '/Users/davidmudgejr/Desktop/Claude Custom CRM/docs/TPE_Master_List_v2_20_11.xlsx';
const DATABASE_URL = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const live = args.includes('--live');
  const sheetArg = (args.find(a => a.startsWith('--sheet=')) || '--sheet=all').split('=')[1];
  const filePath = args.find(a => !a.startsWith('--')) || DEFAULT_FILE;

  if (!dryRun && !live) {
    console.error('Usage: node scripts/migrate-tpe-data.js [--dry-run | --live] [--sheet=all|distress|loans|growth|debt]');
    process.exit(1);
  }

  if (!DATABASE_URL) {
    console.error('Missing DATABASE_URL or NEON_DATABASE_URL environment variable');
    process.exit(1);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  TPE DATA IMPORT ${dryRun ? '(DRY RUN)' : '(LIVE)'}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`File:   ${filePath}`);
  console.log(`Sheet:  ${sheetArg}`);
  console.log(`Mode:   ${dryRun ? 'DRY RUN -- no writes' : 'LIVE -- writing to database'}\n`);

  // Parse Excel
  console.log(`[cli] Parsing Excel file...`);
  const sheets = parseAllSheets(filePath);

  const totalRows =
    (sheets.distress ? sheets.distress.length : 0) +
    (sheets.loans ? sheets.loans.length : 0) +
    (sheets.growth ? sheets.growth.length : 0) +
    (sheets.debt ? sheets.debt.length : 0);
  console.log(`[cli] Total parsed rows: ${totalRows}\n`);

  // Determine which sheets to process
  const validSheets = ['distress', 'loans', 'growth', 'debt'];
  const selectedSheets = sheetArg === 'all' ? validSheets : validSheets.filter(s => s === sheetArg);

  if (selectedSheets.length === 0) {
    console.error(`Unknown sheet: "${sheetArg}". Valid options: all, distress, loans, growth, debt`);
    process.exit(1);
  }

  // Connect to DB
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL.includes('neon') ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const startTime = Date.now();
    const report = await processTPEData(sheets, pool, { dryRun, selectedSheets });
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Print report
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  MIGRATION REPORT ${dryRun ? '(DRY RUN -- no data written)' : '(COMMITTED)'}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Time: ${elapsed}s\n`);

    console.log(`Properties:`);
    console.log(`  Matched:  ${report.properties.matched}`);
    console.log(`  Enriched: ${report.properties.enriched}`);

    console.log(`\nCompanies:`);
    console.log(`  Created: ${report.companies.created}`);
    console.log(`  Matched: ${report.companies.matched}`);

    console.log(`\nRecords Created:`);
    console.log(`  Distress:     ${report.distress.created}`);
    console.log(`  Loan Maturity: ${report.loans.created}`);
    console.log(`  Tenant Growth: ${report.growth.created}`);
    console.log(`  Debt & Stress: ${report.debt.created}`);

    console.log(`\nJunctions: ${report.junctions.created} created, ${report.junctions.skipped} skipped`);

    if (report.skipped.length > 0) {
      console.log(`\n--- Skipped Rows (${report.skipped.length}) ---`);
      // Group by reason
      const reasonCounts = {};
      for (const s of report.skipped) {
        const key = `[${s.sheet}] ${s.reason}`;
        reasonCounts[key] = (reasonCounts[key] || 0) + 1;
      }
      for (const [reason, count] of Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])) {
        console.log(`  ${reason}: ${count}`);
      }
    }

    if (report.errors.length > 0) {
      console.log(`\n--- Errors (${report.errors.length}) ---`);
      for (const e of report.errors.slice(0, 20)) {
        console.log(`  [${e.sheet} row ${e.rowNum}] ${e.address || 'no address'}: ${e.message}`);
      }
      if (report.errors.length > 20) console.log(`  ... and ${report.errors.length - 20} more`);
    }

    if (report.fuzzyMatches.length > 0) {
      console.log(`\n--- Fuzzy Matches (${report.fuzzyMatches.length}) ---`);
      const reviews = report.fuzzyMatches.filter(m => m.review);
      if (reviews.length > 0) {
        console.log(`  ** ${reviews.length} flagged for REVIEW (90-94% similarity)`);
        for (const m of reviews.slice(0, 20)) {
          console.log(`  [row ${m.rowNum}] ${m.type}: "${m.original}" -> "${m.matchedTo}" (${(m.similarity * 100).toFixed(1)}%)`);
        }
        if (reviews.length > 20) console.log(`  ... and ${reviews.length - 20} more`);
      }
      const confident = report.fuzzyMatches.filter(m => !m.review);
      if (confident.length > 0) {
        console.log(`  ${confident.length} confident fuzzy matches (95%+)`);
      }
    }

    // Save full report to JSON
    const reportPath = `/tmp/tpe-import-report-${dryRun ? 'dry' : 'live'}-${Date.now()}.json`;
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
