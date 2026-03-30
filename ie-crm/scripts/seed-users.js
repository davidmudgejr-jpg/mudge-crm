// Seed script — creates the 3 Leanne Associates team members.
// Run once: node scripts/seed-users.js

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const USERS = [
  { email: 'dmudger@gmail.com',      displayName: 'Dave Mudge Sr',   avatarColor: '#ef4444' },
  { email: 'davidmudgejr@gmail.com', displayName: 'David Mudge Jr',  avatarColor: '#3b82f6' },
  { email: 'sarahmudgie@gmail.com',  displayName: 'Sarah Tabor',     avatarColor: '#a78bfa' },
];

// SECURITY: Use env var or generate random password — never hardcode (Houston audit H4 — 2026-03-30)
const crypto = require('crypto');
const TEMP_PASSWORD = process.env.SEED_PASSWORD || crypto.randomBytes(16).toString('hex');

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    const hash = await bcrypt.hash(TEMP_PASSWORD, 12); // H5: increased from 10 to 12 rounds

    for (const u of USERS) {
      await pool.query(
        `INSERT INTO users (email, password_hash, display_name, avatar_color)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (email) DO UPDATE SET
           password_hash = EXCLUDED.password_hash,
           display_name = EXCLUDED.display_name,
           avatar_color = EXCLUDED.avatar_color`,
        [u.email, hash, u.displayName, u.avatarColor]
      );
      console.log(`  ✓ ${u.displayName} (${u.email})`);
    }

    console.log(`\nAll 3 users seeded. Temp password: ${TEMP_PASSWORD}`);
    if (!process.env.SEED_PASSWORD) {
      console.log('⚠️  Password was randomly generated. Set SEED_PASSWORD env var for a specific password.');
    }
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
