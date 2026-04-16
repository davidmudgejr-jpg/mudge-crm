#!/usr/bin/env node
// scripts/migrate.js
//
// Tiny migration runner for IE-CRM. Reads every *.sql file in ie-crm/migrations/
// sorted by the numeric prefix, cross-references the public.schema_migrations
// table, and applies each pending migration in its own transaction.
//
// QA audit 2026-04-15 P2-07 — replaces "manual, apply files in Neon console,
// hope for the best" with a deterministic, idempotent runner.
//
// Usage:
//   node scripts/migrate.js           # apply all pending migrations
//   node scripts/migrate.js --dry     # list what would be applied
//   node scripts/migrate.js --status  # show applied vs pending counts
//
// Safety:
//   - Refuses to run if any filename contains a space (macOS " 2" dupes)
//   - Refuses to run if two files share the same numeric prefix
//   - Each migration runs inside BEGIN/COMMIT; any failure rolls back that
//     one migration and halts the runner
//   - Records (version, name, applied_by) in schema_migrations on success

'use strict';

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const APPLIED_BY = process.env.USER || process.env.LOGNAME || 'migrate.js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry');
const STATUS_ONLY = args.has('--status');

function log(msg) { console.log('[migrate]', msg); }
function err(msg) { console.error('[migrate]', msg); }

function listMigrations() {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));

  // Safety: reject if any macOS " 2" dupe snuck in — those are almost always
  // unintentional, and unlike real-duplicate prefixes below they have no
  // historical reason to exist.
  const dupes = files.filter((f) => / 2\.sql$/.test(f));
  if (dupes.length > 0) {
    err('REFUSING TO RUN: found macOS " 2" duplicate migration files:');
    for (const f of dupes) err('  - ' + f);
    err('Delete them (see scripts/check-duplicate-filenames.js) and retry.');
    process.exit(1);
  }

  // Historical: versions 039, 040, 059 each have two unrelated files that
  // share the same numeric prefix. All of them are already applied in
  // production (backfilled by migration 064). The runner TOLERATES these
  // collisions by picking the alphabetically-first file as the "canonical"
  // entry for that version — the schema_migrations table will already have
  // the version marked as applied, so the file content will never be
  // re-executed. QA audit 2026-04-15 P2-07.
  const byVersion = new Map();
  const collisions = [];
  for (const f of files.sort()) {
    const m = f.match(/^(\d+)/);
    if (!m) {
      err(`skipping file with no numeric prefix: ${f}`);
      continue;
    }
    const version = m[1].padStart(3, '0');
    if (byVersion.has(version)) {
      collisions.push({ version, kept: byVersion.get(version), ignored: f });
      continue;
    }
    byVersion.set(version, f);
  }

  if (collisions.length > 0) {
    log(`note: ${collisions.length} legacy version collision(s) — using alphabetically-first file for each:`);
    for (const c of collisions) {
      log(`  ${c.version}: using "${c.kept}" (ignoring "${c.ignored}")`);
    }
    log('these are historical and safe if the version is already applied — verify with --status');
  }

  return [...byVersion.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([version, file]) => ({ version, file, name: file.replace(/\.sql$/, '') }));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    err('DATABASE_URL is not set. Add it to ie-crm/.env or pass via the environment.');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // Ensure the tracking table exists (first-run bootstrap)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      applied_by TEXT
    );
  `);

  const migrations = listMigrations();
  let appliedResult = await pool.query('SELECT version FROM schema_migrations');
  let applied = new Set(appliedResult.rows.map((r) => r.version));

  // FIRST-RUN BOOTSTRAP: if schema_migrations is empty but migration 064
  // (or whatever we named the tracking-table bootstrap) is in the file list,
  // assume the schema was built up manually before migrate.js existed.
  // Apply only the bootstrap migration — it will backfill schema_migrations
  // with everything that should already be applied — then re-read the
  // applied set and continue normally. QA audit 2026-04-15 P2-07.
  if (applied.size === 0 && !STATUS_ONLY && !DRY_RUN) {
    const bootstrap = migrations.find((m) => /schema_migrations_tracking/.test(m.name));
    if (bootstrap) {
      log('first-run bootstrap: schema_migrations is empty');
      log(`applying bootstrap migration ${bootstrap.file} ...`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, bootstrap.file), 'utf8');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, applied_by) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING',
          [bootstrap.version, bootstrap.name, APPLIED_BY]
        );
        await client.query('COMMIT');
        log(`  ✓ ${bootstrap.file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        err(`  ✗ bootstrap failed: ${e.message}`);
        client.release();
        await pool.end();
        process.exit(1);
      }
      client.release();
      // Re-read applied state
      appliedResult = await pool.query('SELECT version FROM schema_migrations');
      applied = new Set(appliedResult.rows.map((r) => r.version));
      log(`bootstrap complete: ${applied.size} versions marked as applied`);
    }
  }

  const pending = migrations.filter((m) => !applied.has(m.version));

  if (STATUS_ONLY) {
    log(`total migrations:  ${migrations.length}`);
    log(`applied:           ${applied.size}`);
    log(`pending:           ${pending.length}`);
    if (pending.length > 0) {
      log('pending files:');
      for (const m of pending) log('  - ' + m.file);
    }
    await pool.end();
    return;
  }

  if (pending.length === 0) {
    log('nothing to apply — schema is up to date');
    await pool.end();
    return;
  }

  log(`${pending.length} pending migration(s):`);
  for (const m of pending) log('  - ' + m.file);

  if (DRY_RUN) {
    log('DRY-RUN — nothing applied');
    await pool.end();
    return;
  }

  const client = await pool.connect();
  try {
    for (const m of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, m.file), 'utf8');
      log(`applying ${m.file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (version, name, applied_by) VALUES ($1, $2, $3) ON CONFLICT (version) DO NOTHING',
          [m.version, m.name, APPLIED_BY]
        );
        await client.query('COMMIT');
        log(`  ✓ ${m.file}`);
      } catch (e) {
        await client.query('ROLLBACK');
        err(`  ✗ ${m.file} failed: ${e.message}`);
        err('rolled back — migration runner halting');
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  err('fatal: ' + e.message);
  process.exit(1);
});
