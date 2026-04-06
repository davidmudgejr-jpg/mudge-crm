#!/usr/bin/env node

// sync-vault.js — Parse Houston's markdown knowledge vault and sync to CRM database
// Runs on Houston's Mac Mini via cron: */5 * * * *
// Usage: node sync-vault.js [--vault-path /path/to/knowledge] [--api-url https://...]

const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIG
// ============================================================

const VAULT_PATH = process.env.VAULT_PATH
  || process.argv.find((a, i) => process.argv[i - 1] === '--vault-path')
  || '/Users/houstonmudge/.openclaw/workspace/knowledge';

const API_BASE = process.env.CRM_API_URL
  || process.argv.find((a, i) => process.argv[i - 1] === '--api-url')
  || 'https://mudge-crm-production.up.railway.app';

const API_KEY = process.env.CRM_AGENT_KEY
  || 'ak_iecrm_2026_Kx9mWvPqLt7nRjF3hYbZ8dUc';

const SKIP_FOLDERS = new Set(['personal', 'templates']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(val) {
  return val && typeof val === 'string' && UUID_RE.test(val);
}

// ============================================================
// YAML FRONTMATTER PARSER (lightweight — no gray-matter dependency)
// ============================================================

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, content };

  const yamlStr = match[1];
  const body = match[2];
  const data = {};

  for (const line of yamlStr.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    // Parse arrays: [item1, item2]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    }
    // Parse booleans
    else if (val === 'true') val = true;
    else if (val === 'false') val = false;
    // Parse empty
    else if (val === '' || val === 'null') val = null;
    // Strip quotes
    else val = val.replace(/^['"]|['"]$/g, '');

    data[key] = val;
  }

  return { data, content: body };
}

// ============================================================
// WIKILINK EXTRACTOR
// ============================================================

function extractWikilinks(content, fromSlug) {
  const regex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  const links = [];
  const seen = new Set();
  let match;

  while ((match = regex.exec(content)) !== null) {
    const slug = normalizeSlug(match[1]);
    if (slug === fromSlug || seen.has(slug)) continue;
    seen.add(slug);

    // Extract surrounding sentence for context tooltip
    const start = Math.max(0, match.index - 60);
    const end = Math.min(content.length, match.index + match[0].length + 60);
    const context = content.slice(start, end).replace(/\n/g, ' ').trim();

    links.push({ to_slug: slug, context });
  }

  return links;
}

function normalizeSlug(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ============================================================
// SUMMARY EXTRACTOR — pull "## Current State" section
// ============================================================

function extractSummary(content) {
  const match = content.match(/## Current State\s*\n([\s\S]*?)(?=\n## |\n---|\Z)/);
  if (!match) return null;
  return match[1].trim().slice(0, 1000); // Cap at 1000 chars
}

// ============================================================
// VAULT WALKER
// ============================================================

function walkVault(dir, basePath) {
  if (!basePath) basePath = dir;
  const results = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_FOLDERS.has(entry.name)) continue;
      results.push(...walkVault(path.join(dir, entry.name), basePath));
    } else if (entry.name.endsWith('.md')) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(basePath, fullPath);

      // Skip the build spec itself and any non-entity files at root level
      if (relativePath === 'CLAUDE-CODE-FRONTEND-SPEC.md') continue;
      if (relativePath === 'README.md') continue;

      results.push({ fullPath, relativePath });
    }
  }

  return results;
}

// ============================================================
// PARSE SINGLE FILE
// ============================================================

function parseFile(fullPath, relativePath) {
  const raw = fs.readFileSync(fullPath, 'utf8');
  const { data: fm, content } = parseFrontmatter(raw);

  const slug = normalizeSlug(path.basename(fullPath, '.md'));
  const title = fm.title || path.basename(fullPath, '.md').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Determine type from frontmatter or folder
  let type = fm.type || 'decision';
  if (!fm.type) {
    if (relativePath.includes('contacts')) type = 'contact';
    else if (relativePath.includes('companies')) type = 'company';
    else if (relativePath.includes('properties')) type = 'property';
    else if (relativePath.includes('deals')) type = 'deal';
    else if (relativePath.includes('markets')) type = 'market';
    else if (relativePath.includes('agent-inbox')) type = 'decision';
  }

  const links = extractWikilinks(content, slug);
  const summary = extractSummary(content);

  // Determine status for agent-inbox items
  let status = fm.status || 'active';
  if (relativePath.startsWith('agent-inbox/') && !fm.status) {
    status = 'pending-review';
  }

  return {
    node: {
      file_path: relativePath,
      slug,
      type,
      title,
      aliases: fm.aliases || [],
      crm_id: isValidUuid(fm.crm_id) ? fm.crm_id : null,
      last_verified: fm.last_verified || null,
      stale_after: fm.stale_after || null,
      status,
      visibility: fm.visibility || 'business',
      source_context: fm.source_context || null,
      tags: fm.tags || [],
      frontmatter: fm,
      content,
      summary,
      links_to: links.map(l => l.to_slug),
    },
    edges: links.map(l => ({
      from_slug: slug,
      to_slug: l.to_slug,
      context: l.context,
    })),
  };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('[sync-vault] Scanning ' + VAULT_PATH + '...');

  if (!fs.existsSync(VAULT_PATH)) {
    console.error('[sync-vault] Vault path not found: ' + VAULT_PATH);
    process.exitCode = 1;
    return;
  }

  const files = walkVault(VAULT_PATH);
  console.log('[sync-vault] Found ' + files.length + ' markdown files');

  const allNodes = [];
  const allEdges = [];

  for (const { fullPath, relativePath } of files) {
    try {
      const { node, edges } = parseFile(fullPath, relativePath);
      allNodes.push(node);
      allEdges.push(...edges);
    } catch (err) {
      console.warn('[sync-vault] Failed to parse ' + relativePath + ': ' + err.message);
    }
  }

  console.log('[sync-vault] Parsed ' + allNodes.length + ' nodes, ' + allEdges.length + ' edges');

  // Push to CRM API
  const url = API_BASE + '/api/knowledge/sync';
  console.log('[sync-vault] Syncing to ' + url + '...');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Key': API_KEY,
        'X-Agent-Name': 'houston_sync_vault',
      },
      body: JSON.stringify({ nodes: allNodes, edges: allEdges }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error('[sync-vault] API error (' + res.status + '):', data);
      process.exitCode = 1;
      return;
    }

    console.log('[sync-vault] Synced: ' + data.upsertedNodes + ' nodes, ' + data.upsertedEdges + ' edges');
  } catch (err) {
    console.error('[sync-vault] Network error:', err.message);
    process.exitCode = 1;
  }
}

main();
