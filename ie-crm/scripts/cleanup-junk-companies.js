const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DRY_RUN = process.argv.includes('--dry-run');

// Junk patterns: names that are just corporate suffixes, single chars, placeholders, or blank
const JUNK_PATTERNS = [
  /^(inc\.?|llc|lp|llp|corp\.?|co\.?|ltd\.?|company|group|multi)$/i,
  /^[a-z]$/i,
  /^n\/?a$/i,
  /^(tbd|tba|unknown|none|test|xxx|---?|\.+|\?+)$/i,
  /^\s*$/,
];

const FK_TABLES = [
  'action_item_companies', 'contact_companies', 'deal_companies',
  'interaction_companies', 'property_companies', 'tenant_growth'
];

function isJunk(name) {
  if (!name || !name.trim()) return true;
  const trimmed = name.trim();
  return JUNK_PATTERNS.some(p => p.test(trimmed));
}

(async () => {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made\n' : '🗑️  LIVE RUN — deleting junk companies\n');

  const { rows: companies } = await pool.query('SELECT company_id, company_name FROM companies ORDER BY company_name');
  const junkCompanies = companies.filter(c => isJunk(c.company_name));

  console.log(`Found ${junkCompanies.length} junk companies out of ${companies.length} total:\n`);
  for (const c of junkCompanies) {
    console.log(`  "${c.company_name || '(empty)'}" — ${c.company_id}`);
  }

  if (DRY_RUN || junkCompanies.length === 0) {
    console.log(DRY_RUN ? '\nRe-run without --dry-run to delete.' : '\nNo junk companies found.');
    await pool.end();
    return;
  }

  let deleted = 0, fkDeleted = 0, errors = 0;

  for (const company of junkCompanies) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const t of FK_TABLES) {
        const r = await client.query(`DELETE FROM ${t} WHERE company_id = $1`, [company.company_id]);
        fkDeleted += r.rowCount;
      }

      await client.query('DELETE FROM companies WHERE company_id = $1', [company.company_id]);
      await client.query('COMMIT');
      deleted++;
      console.log(`✅ Deleted "${company.company_name || '(empty)'}"`);
    } catch (e) {
      await client.query('ROLLBACK');
      errors++;
      console.log(`❌ "${company.company_name}": ${e.message.substring(0, 120)}`);
    } finally {
      client.release();
    }
  }

  console.log(`\nDone! Deleted ${deleted} junk companies, removed ${fkDeleted} FK links, errors: ${errors}`);
  const final = await pool.query('SELECT COUNT(*) FROM companies');
  console.log('Companies remaining:', final.rows[0].count);
  await pool.end();
})();
