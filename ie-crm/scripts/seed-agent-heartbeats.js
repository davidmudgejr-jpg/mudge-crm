const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const agents = [
  { name: 'enricher', tier: 3, status: 'running', task: 'Verifying: John Smith (john@prologis.com)', processed: 142, queue: 12 },
  { name: 'researcher', tier: 3, status: 'running', task: 'Scanning IE industrial news feeds', processed: 38, queue: 5 },
  { name: 'scout', tier: 3, status: 'running', task: 'Monitoring HN + Reddit for IE mentions', processed: 247, queue: 18 },
  { name: 'matcher', tier: 3, status: 'idle', task: null, processed: 89, queue: 0 },
  { name: 'ralph', tier: 2, status: 'running', task: 'Reviewing enricher output batch #47', processed: 156, queue: 23 },
  { name: 'gemini', tier: 2, status: 'running', task: 'Cross-validating researcher signals', processed: 34, queue: 8 },
  { name: 'houston', tier: 1, status: 'running', task: 'Overseeing daily operations', processed: 0, queue: 4 },
];

const logs = [
  { agent: 'enricher', type: 'activity', content: 'Verified 3 contacts for Prologis — all emails valid' },
  { agent: 'researcher', type: 'activity', content: 'Found lease signal: Prologis expanding IE footprint (CoStar)' },
  { agent: 'scout', type: 'activity', content: 'Discovered 3 new HN mentions of IE industrial growth' },
  { agent: 'ralph', type: 'activity', content: 'Flagged low-confidence enrichment: catch-all domain detected' },
  { agent: 'matcher', type: 'activity', content: 'Linked John Smith ↔ Prologis lease signal (confidence: 87%)' },
  { agent: 'ralph', type: 'error', content: 'API timeout on OpenAI verification call — retry #3' },
  { agent: 'houston', type: 'daily_summary', content: 'Daily report: 247 scouted, 142 enriched, 89 matched, 23 pending review. Cost: $2.41' },
  { agent: 'enricher', type: 'activity', content: 'Batch #46 complete: 12 contacts verified, 2 flagged for review' },
  { agent: 'scout', type: 'activity', content: 'New signal: Amazon lease expansion in San Bernardino (Mercury News)' },
  { agent: 'researcher', type: 'activity', content: 'Cross-referenced 5 CoStar listings with existing property records' },
];

async function seed() {
  for (const a of agents) {
    await pool.query(`
      INSERT INTO agent_heartbeats (agent_name, tier, status, current_task, items_processed_today, items_in_queue, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (agent_name) DO UPDATE SET
        tier = $2, status = $3, current_task = $4,
        items_processed_today = $5, items_in_queue = $6, updated_at = NOW()
    `, [a.name, a.tier, a.status, a.task, a.processed, a.queue]);
  }

  for (const l of logs) {
    await pool.query(
      'INSERT INTO agent_logs (agent_name, log_type, content) VALUES ($1, $2, $3)',
      [l.agent, l.type, l.content]
    );
  }

  console.log('Seeded', agents.length, 'heartbeats and', logs.length, 'logs');
  await pool.end();
}

seed().catch(console.error);
