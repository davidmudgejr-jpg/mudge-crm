#!/usr/bin/env node
// scripts/check-duplicate-filenames.js
//
// Fails (exit 1) if any file in the repo matches the macOS Finder " 2" dupe
// pattern — e.g. `foo 2.js`, `migrations/060_... 2.sql`. These show up when
// a file is dragged/dropped into a directory that already has a same-named
// file and Finder auto-appends " 2" to the copy. They're almost never
// intentional, they confuse Vite's module resolution, and they can silently
// overwrite newer migrations with older ones (QA audit 2026-04-15 P1-05,
// P2-05, P2-06).
//
// Excludes: node_modules, dist, build, and git-ignored directories that
// aren't part of the source tree.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'ios',
  'android',
  '.vite',
  '.vercel',
]);

// Pattern for " 2." in the basename AND paths containing a colon-prefixed
// textures dir (Finder display-form artifacts like `:public:textures:/...`)
const DUPE_BASENAME_RE = / 2\.[^/]+$/;

const offenders = [];

function walk(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    // permission or stale; ignore
    return;
  }
  for (const entry of entries) {
    // Skip known directories we never want to scan
    if (SKIP_DIRS.has(entry.name)) continue;
    // Skip Finder colon-prefixed directories (they're also bad, flag them)
    if (entry.name.startsWith(':')) {
      offenders.push(path.relative(ROOT, path.join(dir, entry.name)));
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile()) {
      if (DUPE_BASENAME_RE.test(entry.name)) {
        offenders.push(path.relative(ROOT, full));
      }
    }
  }
}

walk(ROOT);

if (offenders.length > 0) {
  console.error(`[check-duplicate-filenames] FATAL: found ${offenders.length} macOS " 2" dupe files / directories:`);
  for (const f of offenders) console.error('  - ' + f);
  console.error('');
  console.error('These are almost always unintentional Finder drag-and-drop artifacts. Delete them or, if you');
  console.error("need the content, rename the file so its basename doesn't match ` 2.<ext>`. If this is a false");
  console.error('positive, update scripts/check-duplicate-filenames.js to allowlist it.');
  process.exit(1);
}

console.log('[check-duplicate-filenames] clean ✓');
