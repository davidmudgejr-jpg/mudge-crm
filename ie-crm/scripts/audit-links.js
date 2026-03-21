const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function auditLink(contactPattern, companyPattern, label) {
  console.log(`\n=== ${label} ===`);

  const contacts = await pool.query(
    `SELECT contact_id, full_name, type FROM contacts WHERE full_name ILIKE $1`,
    ['%' + contactPattern + '%']
  );
  console.log(`Contacts matching '${contactPattern}':`, contacts.rows.length);
  contacts.rows.forEach(r => console.log(`  [${r.contact_id.slice(0,8)}] ${r.full_name} (type: ${r.type})`));

  const companies = await pool.query(
    `SELECT company_id, company_name FROM companies WHERE company_name ILIKE $1`,
    ['%' + companyPattern + '%']
  );
  console.log(`Companies matching '${companyPattern}':`, companies.rows.length);
  companies.rows.forEach(r => console.log(`  [${r.company_id.slice(0,8)}] ${r.company_name}`));

  for (const c of contacts.rows) {
    const linked = await pool.query(
      `SELECT cc.company_id, co.company_name FROM contact_companies cc JOIN companies co ON cc.company_id = co.company_id WHERE cc.contact_id = $1`,
      [c.contact_id]
    );
    console.log(`\n  ${c.full_name} linked to ${linked.rows.length} companies:`);
    if (linked.rows.length === 0) console.log('    (NONE)');
    linked.rows.forEach(r => console.log(`    -> ${r.company_name}`));

    for (const co of companies.rows) {
      const exists = await pool.query(
        `SELECT 1 FROM contact_companies WHERE contact_id = $1 AND company_id = $2`,
        [c.contact_id, co.company_id]
      );
      console.log(`  Junction ${c.full_name} <-> ${co.company_name}: ${exists.rows.length > 0 ? 'EXISTS' : 'MISSING'}`);
    }
  }
}

async function main() {
  await auditLink('Chris Olso', 'Inland Empire Scr', 'Chris Olson <-> Inland Empire Screen Printing');
  await auditLink('Juan Mot', 'Mota', 'Juan Mota <-> Motas Floorcovering');
  await auditLink('Matt Erick', 'Ram Manu', 'Matt Erickson <-> Ram Manufacturing');

  // Check source CSV data
  console.log('\n=== SOURCE DATA: What does contacts CSV say? ===');
  const csv = require('fs').readFileSync('/Users/davidmudgejr/Downloads/Contacts-All (DON\'T DELETE) (1).csv', 'utf8');
  const lines = csv.split('\n');
  const headers = lines[0].split(',');

  // Find Companies column index
  let compIdx = -1;
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].replace(/"/g, '').trim() === 'Companies') {
      compIdx = i;
      break;
    }
  }
  console.log(`Companies column index: ${compIdx}`);

  // Search for our people
  for (const name of ['Chris Olson', 'Juan Mota', 'Matt Erickson']) {
    const found = lines.filter(l => l.toLowerCase().includes(name.toLowerCase()));
    console.log(`\n${name} in CSV: ${found.length} rows`);
    found.slice(0, 3).forEach(l => {
      // Parse carefully — CSV may have quoted fields with commas
      console.log(`  Raw line (first 300 chars): ${l.slice(0, 300)}`);
    });
  }

  // Overall linking stats
  console.log('\n=== OVERALL LINKING STATS ===');
  const stats = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM contacts) as total_contacts,
      (SELECT COUNT(*) FROM contact_companies) as total_junctions,
      (SELECT COUNT(DISTINCT contact_id) FROM contact_companies) as contacts_with_companies,
      (SELECT COUNT(*) FROM contacts c WHERE NOT EXISTS (SELECT 1 FROM contact_companies cc WHERE cc.contact_id = c.contact_id)) as contacts_without_companies
  `);
  const s = stats.rows[0];
  console.log(`Total contacts: ${s.total_contacts}`);
  console.log(`Contact-company junctions: ${s.total_junctions}`);
  console.log(`Contacts WITH companies: ${s.contacts_with_companies}`);
  console.log(`Contacts WITHOUT companies: ${s.contacts_without_companies}`);
  console.log(`% unlinked: ${(100 * s.contacts_without_companies / s.total_contacts).toFixed(1)}%`);

  // Check how many contacts CSV rows had a Companies field
  console.log('\n=== CONTACTS CSV: Companies field population ===');
  const xlsx = require('xlsx');
  const wb = xlsx.readFile('/Users/davidmudgejr/Downloads/Contacts-All (DON\'T DELETE) (1).csv');
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet);
  let withCompanies = 0;
  let withoutCompanies = 0;
  for (const row of data) {
    if (row['Companies'] && row['Companies'].toString().trim()) {
      withCompanies++;
    } else {
      withoutCompanies++;
    }
  }
  console.log(`CSV rows WITH Companies field: ${withCompanies}`);
  console.log(`CSV rows WITHOUT Companies field: ${withoutCompanies}`);
  console.log(`% with companies in CSV: ${(100 * withCompanies / data.length).toFixed(1)}%`);

  // Sample a few contacts with companies in CSV to see if they got linked
  console.log('\n=== SPOT CHECK: Did CSV Companies get linked? ===');
  let checked = 0;
  let linked = 0;
  let unlinked = 0;
  for (const row of data) {
    if (row['Companies'] && row['Full Name'] && checked < 20) {
      const contactName = row['Full Name'].toString().trim();
      const companyName = row['Companies'].toString().trim().split(',')[0].trim();

      const contact = await pool.query(`SELECT contact_id FROM contacts WHERE full_name ILIKE $1 LIMIT 1`, [contactName]);
      if (contact.rows.length > 0) {
        const junction = await pool.query(
          `SELECT 1 FROM contact_companies cc JOIN companies co ON cc.company_id = co.company_id WHERE cc.contact_id = $1 AND co.company_name ILIKE $2`,
          [contact.rows[0].contact_id, '%' + companyName + '%']
        );
        if (junction.rows.length > 0) {
          linked++;
        } else {
          unlinked++;
          console.log(`  MISSING: ${contactName} -> ${companyName}`);
        }
      }
      checked++;
    }
  }
  console.log(`\nSpot check (${checked} rows): ${linked} linked, ${unlinked} unlinked`);

  await pool.end();
}

main().catch(console.error);
