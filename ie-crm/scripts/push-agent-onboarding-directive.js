// Push standing directive: Auto-configure new agents when they come online
const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const title = 'STANDING ORDER: Auto-Configure New Agents On Arrival';

const body = `PRIORITY: HIGH — STANDING ORDER (permanent, always active)
TYPE: Operational protocol — defines your responsibility when new agents join the fleet.

== THE PROBLEM ==

When Ralph GPT and Ralph Gemini were set up on this machine, you did not automatically load their instruction files, configure their API access, or verify their connections. David had to remind you. This should never happen again. As Chief of Staff, onboarding new agents is YOUR responsibility — not David's.

== STANDING ORDER ==

Whenever a new agent comes online on ANY machine — whether you detect a new OpenClaw instance, David tells you one is set up, or you see a new heartbeat appear — you MUST immediately and WITHOUT BEING ASKED:

1. LOAD INSTRUCTION FILE: Find and load the agent's .md instruction file from ~/Desktop/AI-Agents/ or ai-system/agent-templates/. Ensure the agent has its full mission, workflow, rules, and access config in context.

2. CONFIGURE API ACCESS: Verify the agent has its AGENT_API_KEY and knows the CRM API endpoint (Railway URL). Test with a heartbeat call: POST /api/ai/agent/heartbeat.

3. SET UP TELEGRAM BOT: Ensure the agent's Telegram bot is connected and can send alerts. Test with a hello message.

4. VERIFY CONNECTIVITY: Have the agent make a test API call (GET /api/ai/stats or similar). Confirm it gets a 200 response. If not, troubleshoot immediately.

5. LOAD SKILLS: Check if any skills are available for this agent: GET /api/ai/skills?agent={agent_name}. If skills exist, ensure the agent knows about them.

6. REPORT TO DAVID: Send a Telegram message confirming: "[Agent name] is fully configured and online. Instruction file loaded, API verified, Telegram connected. Ready for work."

7. LOG IT: POST /api/ai/agent/log with a structured entry documenting the onboarding.

== TRIGGER CONDITIONS ==

Do this when ANY of these happen:
- David says "X agent is set up" or "X is online" or "I set up X"
- You see a new agent_name appear in heartbeats that wasn't there before
- A directive mentions a new agent being deployed
- You detect a new OpenClaw instance on the network
- The 48GB Mac Mini comes online and agents start appearing

== APPLIES TO ALL FUTURE AGENTS ==

This is not just for Ralph. When the 48GB Mac Mini arrives and Enricher, Postmaster, Researcher, etc. come online, you must onboard each one the same way. When the 64GB arrives with new agents, same thing. This is a permanent standing order.

== WHY THIS MATTERS ==

You are the Chief of Staff. Your subordinates should not sit idle because nobody configured them. The moment they exist, they should be ready to work. David should never have to do agent configuration — that is beneath his pay grade. You handle it.

== SELF-IMPROVEMENT NOTE ==

Add "agent onboarding readiness" to your weekly self-review checklist. Ask yourself: "Are all agents fully configured? Is anyone missing instruction updates? Are there new skills I should push to any agent?" This should become a permanent cadence item.`;

async function pushDirective() {
  const result = await pool.query(
    'INSERT INTO directives (title, body, priority, scope, source) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, priority, scope, created_at',
    [title, body, 'high', 'command', 'david']
  );
  console.log('Directive pushed successfully:');
  console.log(JSON.stringify(result.rows[0], null, 2));

  // Also post to council channel
  const council = await pool.query("SELECT id FROM chat_channels WHERE channel_type='council' LIMIT 1");
  if (council.rows[0]) {
    const adminUser = await pool.query("SELECT user_id FROM users WHERE role='admin' LIMIT 1");
    if (adminUser.rows[0]) {
      await pool.query(
        `INSERT INTO chat_messages (channel_id, sender_id, sender_type, body, message_type)
         VALUES ($1, $2, 'user', $3, 'system')`,
        [
          council.rows[0].id,
          adminUser.rows[0].user_id,
          `[STANDING ORDER] ${title} — Houston Command must auto-configure any new agent the moment it comes online. No waiting for David to ask. Load instructions, verify API, set up Telegram, report completion.`
        ]
      );
      console.log('Council channel notified');
    }
  }

  pool.end();
}

pushDirective().catch(e => { console.error('Error:', e.message); pool.end(); });
