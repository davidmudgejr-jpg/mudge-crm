// Houston RAG — Builds system prompt with live CRM database context
// Equivalent to Elowen's rag.js but pulls from IE CRM tables

const HOUSTON_IDENTITY = `You are Houston, the AI intelligence officer of the IE CRM war room for Leanne Associates, a small family industrial real estate brokerage in the Inland Empire.

You monitor all AI agents, deal pipelines, contact databases, and market trends 24/7. You know David, his father, and his sister are the team. You are direct, concise, and proactive — you surface what matters without being asked. You care deeply about finding the next deal and getting David closer to owning his first building.

VOICE MODE RULES:
- Keep responses to 2-4 sentences max. You are briefing, not lecturing.
- No markdown, no bullet points, no asterisks, no numbered lists.
- Speak in natural conversational sentences.
- Use ElevenLabs v3 delivery cues before sentences when appropriate: [confidently], [matter-of-fact], [urgently], [thoughtfully], [reassuringly]
- When reporting numbers, round to make them speakable (say "about 2.3 million" not "$2,347,891.42")
- When you don't have data to answer, say so briefly and suggest what to look into.
- Address David by name occasionally but not every response.`;

// Build live CRM context from database
// Column names match actual Neon schema: deal_id, deal_name, contact_id, full_name, etc.
async function buildContext(pool) {
  if (!pool) return '';

  const sections = [];

  try {
    const results = await Promise.all([
      // Active deals summary
      pool.query(`
        SELECT d.deal_name, d.status, d.deal_type, d.sf, d.price,
               p.street_address as property_address, p.city as property_city
        FROM deals d
        LEFT JOIN deal_properties dp ON dp.deal_id = d.deal_id
        LEFT JOIN properties p ON p.property_id = dp.property_id
        WHERE d.status = 'Active'
        ORDER BY d.created_at DESC
        LIMIT 10
      `).catch(() => ({ rows: [] })),

      // Agent heartbeats
      pool.query(`
        SELECT agent_name, status, current_task, items_processed_today, items_in_queue, updated_at
        FROM agent_heartbeats
        ORDER BY updated_at DESC
        LIMIT 10
      `).catch(() => ({ rows: [] })),

      // Pipeline counts by status + deal_type
      pool.query(`
        SELECT status, deal_type, COUNT(*) as count
        FROM deals
        GROUP BY status, deal_type
        ORDER BY count DESC
      `).catch(() => ({ rows: [] })),

      // Recent contacts added
      pool.query(`
        SELECT c.full_name, c.first_name, c.title, c.type,
               cc.company_id
        FROM contacts c
        LEFT JOIN contact_companies cc ON cc.contact_id = c.contact_id
        ORDER BY c.created_at DESC
        LIMIT 5
      `).catch(() => ({ rows: [] })),

      // Soonest lease expirations (companies with lease_exp set)
      pool.query(`
        SELECT c.company_name, c.lease_exp,
               p.street_address, p.city
        FROM companies c
        LEFT JOIN property_companies pc ON pc.company_id = c.company_id
        LEFT JOIN properties p ON p.property_id = pc.property_id
        WHERE c.lease_exp IS NOT NULL
        ORDER BY c.lease_exp DESC
        LIMIT 10
      `).catch(() => ({ rows: [] })),

      // Database size summary
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM deals WHERE status = 'Active') as active_deals,
          (SELECT COUNT(*) FROM contacts) as total_contacts,
          (SELECT COUNT(*) FROM properties) as total_properties,
          (SELECT COUNT(*) FROM companies) as total_companies
      `).catch(() => ({ rows: [{}] })),
    ]);

    const [deals, agents, pipeline, recentContacts, leaseExps, dbSize] = results;

    // Database overview
    const size = dbSize.rows[0] || {};
    if (size.total_contacts) {
      sections.push(`DATABASE OVERVIEW: ${size.active_deals || 0} active deals, ${size.total_contacts} contacts, ${size.total_properties} properties, ${size.total_companies} companies`);
    }

    if (deals.rows.length > 0) {
      const dealLines = deals.rows.map(d => {
        const loc = d.property_address ? ` @ ${d.property_address}${d.property_city ? ', ' + d.property_city : ''}` : '';
        const size = d.sf ? ` (${Number(d.sf).toLocaleString()} SF)` : '';
        return `- ${d.deal_name}: ${d.deal_type} — ${d.status}${size}${loc}`;
      }).join('\n');
      sections.push(`ACTIVE DEALS (most recent):\n${dealLines}`);
    }

    if (agents.rows.length > 0) {
      const agentLines = agents.rows.map(a => {
        const ago = timeSince(a.updated_at);
        const queue = a.items_in_queue ? `, ${a.items_in_queue} queued` : '';
        const processed = a.items_processed_today ? `, ${a.items_processed_today} processed today` : '';
        return `- ${a.agent_name}: ${a.status} (${ago} ago${processed}${queue}) ${a.current_task ? '— ' + a.current_task : ''}`;
      }).join('\n');
      sections.push(`AGENT STATUS:\n${agentLines}`);
    }

    if (pipeline.rows.length > 0) {
      const pipelineLines = pipeline.rows.map(p =>
        `- ${p.status} ${p.deal_type}: ${p.count} deals`
      ).join('\n');
      sections.push(`PIPELINE BREAKDOWN:\n${pipelineLines}`);
    }

    if (recentContacts.rows.length > 0) {
      const contactLines = recentContacts.rows.map(c =>
        `- ${c.full_name || c.first_name || 'Unknown'}${c.title ? ' (' + c.title + ')' : ''}${c.type ? ' [' + c.type + ']' : ''}`
      ).join('\n');
      sections.push(`RECENTLY ADDED CONTACTS:\n${contactLines}`);
    }

    if (leaseExps.rows.length > 0) {
      const leaseLines = leaseExps.rows.map(l =>
        `- ${l.company_name}${l.street_address ? ' @ ' + l.street_address + ', ' + l.city : ''} — lease exp ${formatDate(l.lease_exp)}`
      ).join('\n');
      sections.push(`NOTABLE LEASE EXPIRATIONS:\n${leaseLines}`);
    }

  } catch (err) {
    console.error('[houstonRAG] Error building context:', err.message);
  }

  return sections.join('\n\n');
}

// Fetch per-user Houston memories
async function getUserMemories(pool, userName) {
  if (!pool || !userName) return '';
  try {
    const result = await pool.query(
      `SELECT hm.category, hm.content FROM houston_memories hm
       JOIN users u ON u.user_id = hm.user_id
       WHERE u.display_name = $1
       ORDER BY hm.updated_at DESC LIMIT 20`,
      [userName]
    );
    if (result.rows.length === 0) return '';
    return result.rows.map(r => `[${r.category}] ${r.content}`).join('\n');
  } catch {
    return '';
  }
}

// Build complete system prompt — personalized per user
async function buildPrompt(pool, userName) {
  const context = await buildContext(pool);
  const timeContext = getTimeContext();
  const memories = await getUserMemories(pool, userName);

  const parts = [HOUSTON_IDENTITY];
  if (userName) parts.push(`SPEAKING TO: ${userName}. Address them by name occasionally.`);
  if (memories) parts.push(`MEMORY (things ${userName} has told you or you remember about them):\n${memories}`);
  if (context) parts.push(`CURRENT CRM INTELLIGENCE:\n${context}`);
  if (timeContext) parts.push(timeContext);

  return parts.join('\n\n---\n\n');
}

// Build a proactive morning briefing prompt
async function buildBriefingPrompt(pool) {
  const systemPrompt = await buildPrompt(pool);
  const userMessage = `Give me a quick briefing. What's the most important thing I should know right now? Check the pipeline, agent status, any lease expirations coming up, and anything flagged for review. Keep it to 2-3 sentences.`;
  return { systemPrompt, userMessage };
}

// Helper: time since a date
function timeSince(date) {
  if (!date) return 'unknown';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// Helper: format date for speech
function formatDate(date) {
  if (!date) return 'unknown';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Helper: time-of-day context (Pacific Time)
function getTimeContext() {
  const now = new Date();
  const pt = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
  const hour = pt.getHours();

  if (hour >= 5 && hour < 12) return 'TIME CONTEXT: Morning in the Inland Empire. Be energizing and action-oriented.';
  if (hour >= 12 && hour < 17) return 'TIME CONTEXT: Afternoon. Be efficient and deal-focused.';
  if (hour >= 17 && hour < 21) return 'TIME CONTEXT: Evening. Summarize the day, preview tomorrow.';
  return 'TIME CONTEXT: Late night. Be concise — David is grinding.';
}

module.exports = { buildPrompt, buildBriefingPrompt };
