const { Pool } = require('pg');
const { normalizeContactName } = require('../server/utils/addressNormalizer');
const pool = new Pool({ connectionString: 'postgresql://neondb_owner:npg_LFY9Gyds7VDA@ep-withered-mode-aktp7v63-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require' });

async function main() {
  // Check Chris Olson's full record
  console.log('=== Chris Olson full record ===');
  const co = await pool.query(`SELECT contact_id, full_name, email, phone_1, type, data_source, client_level FROM contacts WHERE full_name ILIKE '%Chris Olson%'`);
  co.rows.forEach(r => {
    console.log('  contact_id:', r.contact_id.slice(0, 8));
    console.log('  email:', r.email);
    console.log('  phone_1:', r.phone_1);
    console.log('  type:', r.type);
    console.log('  data_source:', r.data_source);
    console.log('  client_level:', r.client_level);
  });

  // Check normalization
  console.log('\nNormalized "Chris Olson":', normalizeContactName('Chris Olson'));
  console.log('Normalized "chris olson":', normalizeContactName('chris olson'));

  // Check Inland Empire Screen Printing
  console.log('\n=== Inland Empire Screen Printing ===');
  const iesp = await pool.query(`SELECT company_id, company_name FROM companies WHERE company_name ILIKE '%Inland Empire Screen%'`);
  iesp.rows.forEach(r => console.log('  ', r.company_id.slice(0, 8), r.company_name));

  if (iesp.rows.length > 0) {
    const linked = await pool.query(
      `SELECT c.full_name, c.contact_id FROM contact_companies cc JOIN contacts c ON cc.contact_id = c.contact_id WHERE cc.company_id = $1`,
      [iesp.rows[0].company_id]
    );
    console.log('  Contacts linked to IESP:', linked.rows.length);
    linked.rows.forEach(r => console.log('    -', r.full_name));
  }

  // KEY QUESTION: Did the contacts CSV import match Chris Olson?
  // The engine processes each CSV row. For Chris Olson, it should:
  // 1. normalizeContactName('Chris Olson') -> 'chris olson'
  // 2. Find existing contact with same normalized name
  // 3. Enrich it with email, phone, etc.
  // 4. Process the Companies field -> find/create Inland Empire Screen Printing
  // 5. Create contact_companies junction

  // Let's check if the engine's enrichment happened
  console.log('\n=== Did enrichment happen? ===');
  // If email is still null, the engine didn't match this contact
  // The CSV shows: info@iescreenprinting.com for Chris Olson

  // Check: how many contacts with type=null have NO email?
  const nullNoEmail = await pool.query(`SELECT COUNT(*) FROM contacts WHERE type IS NULL AND email IS NULL`);
  const nullWithEmail = await pool.query(`SELECT COUNT(*) FROM contacts WHERE type IS NULL AND email IS NOT NULL`);
  console.log('type=null contacts without email:', nullNoEmail.rows[0].count);
  console.log('type=null contacts with email:', nullWithEmail.rows[0].count);

  // Check: was there a batch commit issue? The contacts import uses batch commits.
  // Maybe the batch containing Chris Olson failed and got rolled back?

  // Let's check if the ENRICHMENT is working at all — find contacts that WERE enriched
  console.log('\n=== Enrichment verification ===');
  const enriched = await pool.query(`SELECT COUNT(*) FROM contacts WHERE type IS NOT NULL AND email IS NOT NULL`);
  console.log('Contacts with both type AND email:', enriched.rows[0].count);

  const typeNotNull = await pool.query(`SELECT COUNT(*) FROM contacts WHERE type IS NOT NULL`);
  console.log('Contacts with type (from contacts CSV):', typeNotNull.rows[0].count);

  // The contacts CSV had 13,255 rows. How many contacts have type set?
  // If type=null means it was NOT touched by the contacts import...
  const typeNull = await pool.query(`SELECT COUNT(*) FROM contacts WHERE type IS NULL`);
  console.log('Contacts with type=null (NOT from contacts CSV):', typeNull.rows[0].count);
  console.log('Total contacts:', (await pool.query(`SELECT COUNT(*) FROM contacts`)).rows[0].count);

  // HYPOTHESIS: The contacts import created NEW contacts instead of matching existing ones
  // Let's verify by checking if there are near-duplicates
  console.log('\n=== Near-duplicate check ===');
  for (const name of ['Chris Olson', 'Juan Mota', 'Matt Erickson']) {
    const r = await pool.query(`SELECT contact_id, full_name, type, email FROM contacts WHERE full_name ILIKE $1`, ['%' + name.split(' ')[1] + '%']);
    const matches = r.rows.filter(row => row.full_name.toLowerCase().includes(name.split(' ')[0].toLowerCase()));
    console.log('\nAll contacts matching "' + name + '":');
    matches.forEach(row => console.log('  [' + row.contact_id.slice(0, 8) + '] ' + row.full_name + ' type=' + row.type + ' email=' + (row.email || 'null')));
  }

  await pool.end();
}

main().catch(console.error);
