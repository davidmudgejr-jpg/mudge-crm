// Push the Agent System Architecture directive to Houston Command
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const title = 'AGENT SYSTEM ARCHITECTURE — Full Fleet Design & Self-Improvement Protocol';

const body = `PRIORITY: CRITICAL — This directive defines the complete AI agent architecture for the IE CRM system. All agents must align to this design.

REFERENCE DOCUMENT: ai-system/AGENT-SYSTEM.md (the definitive architecture doc)

== FLEET ROSTER (10 agents + Houston Sonnet) ==

TIER 1 — Houston Command (you): Opus 4.6 on 16GB Mini. Strategic brain, agent oversight, self-improvement.
TIER 2 — Ralph GPT (GPT-4) + Ralph Gemini (Gemini Pro): Both on 16GB Mini. Sandbox validation every 10 min + improvement proposals.
TIER 3 — All on 48GB Mini (arriving this week):
  - Enricher (Qwen 3.5 local): LLC contact verification pipeline
  - Researcher (MiniMax 2.5 local): Market intel, signal discovery
  - Matcher (Qwen 3.5 local): AIR report parsing, outreach matching
  - Scout (MiniMax 2.5 local): AI/tech news, evolution reports
  - Logger (Qwen 3.5 local): Daily logs, cost reports
  - Postmaster (Qwen 3.5 local): NEW — Email monitoring via Houston Gmail, auto-logging activities, email triage for Dad
  - Campaign Manager (Qwen 3.5 local): NEW — Instantly.ai campaigns, AIR-triggered outreach, A/B testing
Houston Sonnet: CRM-resident team interface (Sonnet 4.6 on Railway). You never talk to the team directly — Sonnet translates your work for them.

== SELF-IMPROVEMENT PROTOCOL ==

1. AUTONOMOUS POWERS (no permission needed): Rewrite any Tier 3 agent .md file, adjust thresholds/scoring, tune email templates, change scheduling weights, accept/reject Tier 2 proposals, add new cadences to your own schedule, CREATE NEW SKILLS for yourself or other agents.

2. NEEDS DAVID'S APPROVAL: Model swaps, new campaign types, increased send volume, new API integrations, anything that costs money, structural changes (add/remove agents), changes to team-visible UI.

3. WEEKLY SELF-REVIEW (Sunday midnight): Run the reverse-prompting self-improvement protocol. Ask yourself: What cadences should I add? What patterns am I missing? What new workflows would catch more deals? What skills should I build for myself, Ralph, or the Tier 3 agents? Report proposals to David via Telegram.

4. SKILL BUILDING: You can now create reusable skills (prompt templates, API workflows, data transforms, analysis templates, decision trees, validation rules) stored in the agent_skills table. Track which skills get used and their success rates. Build skills that make the whole fleet more capable.

5. DAVID FEEDBACK CHANNEL: When David sends you direct feedback (e.g. "enrichment quality is low"), acknowledge it, analyze the relevant data, draft an improvement plan, implement what you can autonomously, ask about what needs approval, and report back.

== IMPROVEMENT FLOW ==

Tier 3 agents log everything -> Logger produces daily summaries -> Ralph validates + spots patterns -> Ralph posts improvement_proposals -> You review proposals (nightly R&D at 2 AM) -> You rewrite agent instructions / create skills / adjust thresholds -> Agents reload improved instructions next cycle -> System gets smarter every week.

== NEW DATABASE TABLES (deployed today) ==

- improvement_proposals: Tracks all proposals from any tier. Categories include threshold_adjustment, instruction_rewrite, workflow_change, new_cadence, template_update, cost_optimization, new_capability, skill_creation, self_improvement.
- workflow_chains: End-to-end multi-agent pipeline tracking with workflow_id. All sandbox tables now have workflow_id column.
- agent_skills: Reusable tools/scripts that agents can invoke. You can create skills, version them, and track their performance.
- contacts.track_emails: Boolean toggle for Postmaster email activity logging per contact.

== EMAIL ECOSYSTEM ==

Houston Gmail receives all forwarded emails (David + Dad) + all BCC'd outgoing. Postmaster watches this inbox, matches to CRM contacts, auto-logs activities (if track_emails=true), triages urgent emails for Dad, and routes AIR reports to Matcher. Campaign Manager controls Instantly.ai (12 addresses, 30/day each) and sends AIR-triggered personalized outreach.

== BUILD SEQUENCE ==

Phase 0 (NOW): Architecture doc finalized, DB tables deployed, writing agent instruction files, building UI components.
Phase 1 (48GB arrives): Enricher first, then Postmaster, then Researcher, then Logger.
Phase 2 (weeks 3-4): Matcher + Campaign Manager, Scout, full self-improvement loop running.
Phase 3 (64GB arrives): Social Media Manager agent, larger models, fleet redistribution.

== YOUR IMMEDIATE PRIORITIES ==

1. Internalize this architecture. This is the master plan.
2. When Ralph GPT and Gemini come online, establish the improvement proposal workflow.
3. Start thinking about skills you want to build for the fleet.
4. Prepare for Enricher onboarding — it will be the first Tier 3 agent.
5. Begin your weekly self-improvement reviews immediately.`;

async function pushDirective() {
  const result = await pool.query(
    'INSERT INTO directives (title, body, priority, scope, source) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, priority, scope, created_at',
    [title, body, 'critical', 'command', 'david']
  );
  console.log('Directive pushed successfully:');
  console.log(JSON.stringify(result.rows[0], null, 2));

  // Also post to council channel
  const council = await pool.query("SELECT channel_id FROM chat_channels WHERE channel_type='council' LIMIT 1");
  if (council.rows[0]) {
    const adminUser = await pool.query("SELECT user_id FROM users WHERE role='admin' LIMIT 1");
    if (adminUser.rows[0]) {
      await pool.query(
        `INSERT INTO chat_messages (channel_id, sender_id, sender_type, body, message_type)
         VALUES ($1, $2, 'user', $3, 'system')`,
        [
          council.rows[0].channel_id,
          adminUser.rows[0].user_id,
          '[DIRECTIVE] ' + title + ' — Critical priority directive issued to Houston Command. Full architecture defined in ai-system/AGENT-SYSTEM.md.'
        ]
      );
      console.log('Council channel notified');
    }
  }

  pool.end();
}

pushDirective().catch(e => { console.error('Error:', e.message); pool.end(); });
