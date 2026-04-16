#!/usr/bin/env node
// scripts/purge-duplicate-filenames.js
//
// Diffs every `foo 2.ext` file against its non-" 2" sibling and reports
// which are identical (safe to delete) vs divergent (print the diff).
// By default it's DRY-RUN. Pass `--apply` to actually delete.
//
//   node scripts/purge-duplicate-filenames.js             # dry-run (default)
//   node scripts/purge-duplicate-filenames.js --apply     # delete identical dupes
//   node scripts/purge-duplicate-filenames.js --apply-all # delete everything (divergent too)
//
// QA audit 2026-04-15 P2-05.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', '.vite', '.vercel']);
const DUPE_BASENAME_RE = / 2\.[^/]+$/;

const args = new Set(process.argv.slice(2));
const APPLY = args.has('--apply');
const APPLY_ALL = args.has('--apply-all');

const offenders = [];
const colonDirs = [];

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(':')) {
      colonDirs.push(path.join(dir, entry.name));
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && DUPE_BASENAME_RE.test(entry.name)) {
      offenders.push(full);
    }
  }
}

walk(ROOT);

function siblingPath(dupePath) {
  // "/a/b/foo 2.ext" → "/a/b/foo.ext"
  const dir = path.dirname(dupePath);
  const base = path.basename(dupePath);
  const restored = base.replace(/ 2(\.[^.]+)$/, '$1');
  return path.join(dir, restored);
}

function sha256(p) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex');
}

const identical = [];
const divergent = [];
const orphan = [];

for (const dupe of offenders) {
  const sib = siblingPath(dupe);
  if (!fs.existsSync(sib)) {
    orphan.push(dupe);
    continue;
  }
  try {
    if (sha256(dupe) === sha256(sib)) {
      identical.push({ dupe, sib });
    } else {
      divergent.push({ dupe, sib });
    }
  } catch (err) {
    console.error(`[purge] error diffing ${dupe}: ${err.message}`);
  }
}

console.log(`== purge-duplicate-filenames ==`);
console.log(`mode: ${APPLY_ALL ? 'APPLY-ALL (delete divergent too)' : APPLY ? 'APPLY (delete identical only)' : 'DRY-RUN'}`);
console.log();

console.log(`identical dupes (safe to delete): ${identical.length}`);
for (const { dupe } of identical) console.log('  [IDENT]  ' + path.relative(ROOT, dupe));
console.log();

console.log(`divergent dupes (non-" 2" wins; need manual review): ${divergent.length}`);
for (const { dupe } of divergent) console.log('  [DIVERG] ' + path.relative(ROOT, dupe));
console.log();

console.log(`orphan dupes (no non-" 2" sibling): ${orphan.length}`);
for (const p of orphan) console.log('  [ORPHAN] ' + path.relative(ROOT, p));
console.log();

console.log(`colon-prefixed Finder directories: ${colonDirs.length}`);
for (const p of colonDirs) console.log('  [COLON]  ' + path.relative(ROOT, p));
console.log();

if (!APPLY && !APPLY_ALL) {
  console.log('DRY-RUN — no files deleted. Re-run with --apply to delete identical dupes, --apply-all to delete everything.');
  process.exit(0);
}

let deleted = 0;
for (const { dupe } of identical) {
  fs.unlinkSync(dupe);
  deleted++;
}
if (APPLY_ALL) {
  for (const { dupe } of divergent) {
    fs.unlinkSync(dupe);
    deleted++;
  }
  for (const p of orphan) {
    fs.unlinkSync(p);
    deleted++;
  }
  // Colon dirs: rmdir recursively (they're the Finder display-form artifact)
  for (const p of colonDirs) {
    fs.rmSync(p, { recursive: true, force: true });
    deleted++;
  }
}

console.log(`DELETED ${deleted} item(s).`);
process.exit(0);
