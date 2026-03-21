const {Pool} = require('pg');
const pool = new Pool({connectionString: 'postgresql://neondb_owner:npg_LFY9Gyds7VDA@ep-withered-mode-aktp7v63-pooler.c-3.us-west-2.aws.neon.tech/neondb?sslmode=require'});

const SKIP_NAMES = ['Inc.', 'Inc', 'LLC', 'LP', 'LLP', 'Corp', 'Corp.', 'Co', 'Co.', 'Ltd', 'Ltd.', 'Multi'];

const FK_TABLES = [
  'action_item_companies', 'contact_companies', 'deal_companies',
  'interaction_companies', 'property_companies', 'tenant_growth'
];

(async () => {
  const dupes = await pool.query(`
    SELECT company_name, array_agg(company_id ORDER BY created_at) as ids, COUNT(*) as cnt
    FROM companies WHERE company_name IS NOT NULL
    GROUP BY company_name HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
  `);
  
  const realDupes = dupes.rows.filter(r => !SKIP_NAMES.includes(r.company_name));
  console.log('Merging', realDupes.length, 'real duplicate company groups');
  
  let totalMerged = 0, totalMoved = 0, errors = 0;
  
  for (const group of realDupes) {
    const keepId = group.ids[0];
    const removeIds = group.ids.slice(1);
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      for (const removeId of removeIds) {
        let moved = 0;
        for (const t of FK_TABLES) {
          // Delete conflicting junction rows first (same entity already linked to keepId)
          await client.query(`DELETE FROM ${t} WHERE company_id = $1 AND EXISTS (
            SELECT 1 FROM ${t} k WHERE k.company_id = $2
            AND k.ctid != ${t}.ctid
          )`, [removeId, keepId]).catch(() => {
            // If self-join fails, try simpler approach: delete removeId rows that would conflict
          });
          // Try update; on PK conflict, just delete the removeId row
          try {
            const r = await client.query(`UPDATE ${t} SET company_id = $1 WHERE company_id = $2`, [keepId, removeId]);
            moved += r.rowCount;
          } catch (e) {
            if (e.message.includes('duplicate key') || e.message.includes('unique constraint')) {
              await client.query(`DELETE FROM ${t} WHERE company_id = $1`, [removeId]);
            } else throw e;
          }
        }
        
        const [keeper, dupe] = await Promise.all([
          client.query('SELECT * FROM companies WHERE company_id = $1', [keepId]),
          client.query('SELECT * FROM companies WHERE company_id = $1', [removeId])
        ]);
        if (keeper.rows[0] && dupe.rows[0]) {
          const k = keeper.rows[0], d = dupe.rows[0];
          const updates = [], values = [keepId];
          let idx = 2;
          for (const col of Object.keys(d)) {
            if (['company_id', 'created_at', 'updated_at'].includes(col)) continue;
            if (d[col] !== null && d[col] !== '' && (k[col] === null || k[col] === '')) {
              updates.push(`"${col}" = $${idx}`);
              values.push(d[col]);
              idx++;
            }
          }
          if (updates.length > 0) await client.query(`UPDATE companies SET ${updates.join(', ')} WHERE company_id = $1`, values);
        }
        
        await client.query('DELETE FROM companies WHERE company_id = $1', [removeId]);
        totalMoved += moved;
        totalMerged++;
      }
      
      await client.query('COMMIT');
      console.log('✅', group.company_name, '(' + group.cnt + '→1)');
    } catch (e) {
      await client.query('ROLLBACK');
      errors++;
      console.log('❌', group.company_name + ':', e.message.substring(0, 120));
    } finally {
      client.release();
    }
  }
  
  console.log('\nDone! Merged', totalMerged, ', moved', totalMoved, 'FK, errors:', errors);
  const final = await pool.query('SELECT COUNT(*) FROM companies');
  console.log('Companies remaining:', final.rows[0].count);
  await pool.end();
})();
