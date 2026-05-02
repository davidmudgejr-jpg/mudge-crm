#!/usr/bin/env node

'use strict';

require('dotenv').config();

const { Pool } = require('pg');
const { applyAcceptedSuggestions } = require('../server/services/suggestedUpdatesApply');

function parseArgs(argv) {
  const args = {
    dryRun: false,
    json: false,
    limit: 100,
    ids: [],
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (arg === '--id') args.ids.push(parseInt(argv[++i], 10));
    else if (arg === '--ids') {
      args.ids.push(...String(argv[++i] || '').split(',').map((v) => parseInt(v.trim(), 10)));
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/apply-suggested-updates.js [options]

Safely applies accepted suggested_updates rows where applied=false.

Options:
  --dry-run        Report what would happen without writing
  --limit N        Max rows to scan when --id/--ids is not provided (default 100)
  --id N           Apply one suggestion id; repeatable
  --ids A,B,C      Apply specific suggestion ids
  --json           Print full JSON report
`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  args.ids = args.ids.filter(Number.isInteger);
  return args;
}

function printHuman(report) {
  console.log(`[suggested-updates] dry_run=${report.dry_run} scanned=${report.scanned}`);
  console.log(`[suggested-updates] applied=${report.applied} already_applied=${report.already_applied} conflicts=${report.conflicts} target_missing=${report.target_missing} errors=${report.errors}`);
  for (const row of report.results.slice(0, 50)) {
    const detail = row.error
      ? ` error="${row.error}"`
      : row.field_name
        ? ` ${row.table}.${row.field_name}`
        : '';
    console.log(`- #${row.id}: ${row.outcome}${detail}`);
  }
  if (report.results.length > 50) {
    console.log(`[suggested-updates] ... ${report.results.length - 50} more rows omitted; use --json for full report`);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }

  const pool = new Pool({ connectionString });
  try {
    const report = await applyAcceptedSuggestions(pool, {
      dryRun: args.dryRun,
      limit: args.limit,
      ids: args.ids,
      actor: 'apply-suggested-updates-cli',
    });
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printHuman(report);
    }
    process.exitCode = report.errors > 0 ? 1 : 0;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[suggested-updates] failed:', err.message);
  process.exit(1);
});
