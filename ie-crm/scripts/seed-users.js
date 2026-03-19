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

const TEMP_PASSWORD = 'Houstonishere!';

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    const hash = await bcrypt.hash(TEMP_PASSWORD, 10);

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

    console.log('\nAll 3 users seeded. Temp password: Houstonishere!');
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
