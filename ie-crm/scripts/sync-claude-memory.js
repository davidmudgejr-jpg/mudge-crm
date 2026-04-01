#!/usr/bin/env node
// sync-claude-memory.js — Syncs Claude Code memory files between local disk and Neon DB
// Usage:
//   node sync-claude-memory.js pull   — Download latest memory from Neon to local
//   node sync-claude-memory.js push   — Upload local memory files to Neon
//   node sync-claude-memory.js sync   — Pull then push (default, used by hooks)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { Pool } = require('pg');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('[memory-sync] No DATABASE_URL found');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const MACHINE_NAME = os.hostname();

// Find the Claude Code memory directory for this project
// Supports both the "Claude Custom CRM" and "ClaudeCustomCRM-real/ie-crm" project paths
function findMemoryDir() {
  const homeDir = os.homedir();
  const claudeProjectsDir = path.join(homeDir, '.claude', 'projects');

  if (!fs.existsSync(claudeProjectsDir)) return null;

  // Look for any project directory that has a memory/ subfolder
  const entries = fs.readdirSync(claudeProjectsDir);
  for (const entry of entries) {
    // Match project folders that relate to Claude Custom CRM or ie-crm
    if (entry.includes('Claude-Custom-CRM') || entry.includes('ClaudeCustomCRM') || entry.includes('ie-crm')) {
      const memDir = path.join(claudeProjectsDir, entry, 'memory');
      if (fs.existsSync(memDir)) return memDir;
    }
  }

  // If no memory dir found, try the most common path and create it
  for (const entry of entries) {
    if (entry.includes('Claude-Custom-CRM') || entry.includes('ClaudeCustomCRM') || entry.includes('ie-crm')) {
      const memDir = path.join(claudeProjectsDir, entry, 'memory');
      fs.mkdirSync(memDir, { recursive: true });
      return memDir;
    }
  }

  return null;
}

async function pull(memoryDir) {
  const rows = (await pool.query('SELECT filename, content, updated_at FROM claude_code_memory')).rows;
  let pulled = 0;

  for (const row of rows) {
    const localPath = path.join(memoryDir, row.filename);
    let shouldWrite = true;

    if (fs.existsSync(localPath)) {
      const localMtime = fs.statSync(localPath).mtime;
      const dbMtime = new Date(row.updated_at);
      // Only overwrite if DB version is newer
      if (localMtime >= dbMtime) shouldWrite = false;
    }

    if (shouldWrite) {
      fs.writeFileSync(localPath, row.content, 'utf8');
      pulled++;
    }
  }

  console.log(`[memory-sync] Pulled ${pulled} file(s) from Neon to ${memoryDir}`);
}

async function push(memoryDir) {
  const files = fs.readdirSync(memoryDir).filter(f => f.endsWith('.md'));
  let pushed = 0;

  for (const filename of files) {
    const localPath = path.join(memoryDir, filename);
    const content = fs.readFileSync(localPath, 'utf8');
    const localMtime = fs.statSync(localPath).mtime;

    // Parse frontmatter for type and description
    let memoryType = null;
    let description = null;
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const typeMatch = fmMatch[1].match(/type:\s*(.+)/);
      const descMatch = fmMatch[1].match(/description:\s*(.+)/);
      if (typeMatch) memoryType = typeMatch[1].trim();
      if (descMatch) description = descMatch[1].trim();
    }

    // Check if DB version is newer before overwriting
    const existing = await pool.query(
      'SELECT updated_at FROM claude_code_memory WHERE filename = $1',
      [filename]
    );

    if (existing.rows.length > 0) {
      const dbMtime = new Date(existing.rows[0].updated_at);
      if (dbMtime >= localMtime) continue; // DB is same or newer, skip
    }

    await pool.query(`
      INSERT INTO claude_code_memory (filename, content, memory_type, description, updated_by_machine, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (filename) DO UPDATE SET
        content = EXCLUDED.content,
        memory_type = EXCLUDED.memory_type,
        description = EXCLUDED.description,
        updated_by_machine = EXCLUDED.updated_by_machine,
        updated_at = EXCLUDED.updated_at
    `, [filename, content, memoryType, description, MACHINE_NAME, localMtime]);
    pushed++;
  }

  console.log(`[memory-sync] Pushed ${pushed} file(s) from ${memoryDir} to Neon`);
}

async function main() {
  const action = process.argv[2] || 'sync';
  const memoryDir = findMemoryDir();

  if (!memoryDir) {
    console.error('[memory-sync] Could not find Claude Code memory directory');
    process.exit(1);
  }

  try {
    if (action === 'pull') {
      await pull(memoryDir);
    } else if (action === 'push') {
      await push(memoryDir);
    } else if (action === 'sync') {
      await pull(memoryDir);
      await push(memoryDir);
    } else {
      console.error(`[memory-sync] Unknown action: ${action}. Use pull, push, or sync`);
    }
  } catch (err) {
    console.error('[memory-sync] Error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
