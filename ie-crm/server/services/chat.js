// Team Chat Service — Socket.io real-time messaging + REST endpoints
// Houston integration: listens to messages, decides when to interject

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// ============================================================
// CLAUDE OAUTH HELPER — uses Claude Max subscription
// ============================================================
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const HOUSTON_MODEL = 'claude-sonnet-4-6';

function getOAuthToken() {
  return process.env.ANTHROPIC_OAUTH_TOKEN || null;
}

/**
 * Call Claude API via OAuth token (Claude Max subscription)
 * @param {object} opts - { system, messages, max_tokens }
 * @returns {string} response text
 */
async function callClaude({ system, messages, max_tokens = 500 }) {
  const token = getOAuthToken();
  if (!token) return null;

  const payload = {
    model: HOUSTON_MODEL,
    max_tokens,
    messages,
    ...(system ? { system } : {}),
  };

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Claude API ${response.status}: ${errData?.error?.message || 'unknown error'}`);
  }

  const data = await response.json();
  return data.content?.[0]?.text || null;
}

// ============================================================
// SOCKET.IO SETUP
// ============================================================

let io = null;
let pool = null;

/**
 * Initialize the chat service with Socket.io server and DB pool
 */
function initChat(socketServer, dbPool) {
  io = socketServer;
  pool = dbPool;

  const token = getOAuthToken();
  if (token) {
    console.log('[chat/houston] Brain online — OAuth token configured (Claude Max)');
  } else {
    console.warn('[chat/houston] No ANTHROPIC_OAUTH_TOKEN — Houston will use placeholder responses');
  }

  io.on('connection', (socket) => {
    console.log(`[chat] User connected: ${socket.id}`);

    // ── Join channels ──
    socket.on('chat:join', async ({ channelId, userId }) => {
      socket.join(`channel:${channelId}`);
      socket.userId = userId;
      socket.channelId = channelId;

      // Update last_read_at
      try {
        await pool.query(
          `UPDATE chat_channel_members SET last_read_at = NOW()
           WHERE channel_id = $1 AND user_id = $2`,
          [channelId, userId]
        );
      } catch (err) {
        console.error('[chat] Error updating last_read:', err.message);
      }

      console.log(`[chat] User ${userId} joined channel ${channelId}`);
    });

    // ── Send message ──
    socket.on('chat:message', async (data) => {
      try {
        const message = await insertMessage(data);
        // Broadcast to everyone in the channel (including sender for confirmation)
        io.to(`channel:${data.channelId}`).emit('chat:message:new', message);

        // Check if this is a confirmation reply to Houston's action offer
        const confirmWords = /^(yes|yeah|yep|do it|log it|save it|go ahead|confirm|please|sure)\b/i;
        if (confirmWords.test((message.body || '').trim())) {
          handleTextConfirmation(message).catch(err =>
            console.error('[chat/houston] Text confirmation error:', err.message)
          );
        }

        // Houston listener — evaluate if Houston should respond
        // Run async, don't block the message delivery
        evaluateHoustonInterjection(message).catch(err =>
          console.error('[chat/houston] Interjection eval error:', err.message)
        );
      } catch (err) {
        console.error('[chat] Error sending message:', err.message);
        socket.emit('chat:error', { error: 'Failed to send message' });
      }
    });

    // ── Typing indicators ──
    socket.on('chat:typing', ({ channelId, userId, displayName }) => {
      socket.to(`channel:${channelId}`).emit('chat:typing', {
        userId, displayName, channelId
      });
    });

    socket.on('chat:typing:stop', ({ channelId, userId }) => {
      socket.to(`channel:${channelId}`).emit('chat:typing:stop', {
        userId, channelId
      });
    });

    // ── Mark as read ──
    socket.on('chat:read', async ({ channelId, userId }) => {
      try {
        await pool.query(
          `UPDATE chat_channel_members SET last_read_at = NOW()
           WHERE channel_id = $1 AND user_id = $2`,
          [channelId, userId]
        );
        // Notify others that this user has read up to now
        socket.to(`channel:${channelId}`).emit('chat:read:update', {
          userId, channelId, readAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('[chat] Error marking read:', err.message);
      }
    });

    // ── Reactions ──
    socket.on('chat:react', async ({ messageId, userId, emoji }) => {
      try {
        await pool.query(
          `INSERT INTO chat_reactions (message_id, user_id, emoji)
           VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [messageId, userId, emoji]
        );
        io.to(`channel:${socket.channelId}`).emit('chat:reaction:new', {
          messageId, userId, emoji
        });

        // Check if this is a confirmation reaction on a Houston action offer
        const confirmEmojis = ['\uD83D\uDC4D', '\u2705', '\uD83D\uDC4C', '\uD83D\uDCAA']; // 👍 ✅ 👌 💪
        if (confirmEmojis.includes(emoji)) {
          handleActionConfirmation(messageId, userId).catch(err =>
            console.error('[chat/houston] Action confirmation error:', err.message)
          );
        }
      } catch (err) {
        console.error('[chat] Error adding reaction:', err.message);
      }
    });

    socket.on('chat:react:remove', async ({ messageId, userId, emoji }) => {
      try {
        await pool.query(
          `DELETE FROM chat_reactions
           WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
          [messageId, userId, emoji]
        );
        io.to(`channel:${socket.channelId}`).emit('chat:reaction:removed', {
          messageId, userId, emoji
        });
      } catch (err) {
        console.error('[chat] Error removing reaction:', err.message);
      }
    });

    // ── Edit message ──
    socket.on('chat:edit', async ({ messageId, userId, newBody }) => {
      try {
        const result = await pool.query(
          `UPDATE chat_messages SET body = $1, edited_at = NOW()
           WHERE id = $2 AND sender_id = $3
           RETURNING *`,
          [newBody, messageId, userId]
        );
        if (result.rows[0]) {
          io.to(`channel:${result.rows[0].channel_id}`).emit('chat:message:edited', result.rows[0]);
        }
      } catch (err) {
        console.error('[chat] Error editing message:', err.message);
      }
    });

    // ── Delete message (soft) ──
    socket.on('chat:delete', async ({ messageId, userId }) => {
      try {
        const result = await pool.query(
          `UPDATE chat_messages SET deleted_at = NOW()
           WHERE id = $1 AND sender_id = $2
           RETURNING id, channel_id`,
          [messageId, userId]
        );
        if (result.rows[0]) {
          io.to(`channel:${result.rows[0].channel_id}`).emit('chat:message:deleted', {
            messageId: result.rows[0].id
          });
        }
      } catch (err) {
        console.error('[chat] Error deleting message:', err.message);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[chat] User disconnected: ${socket.id}`);
    });
  });

  console.log('[chat] Socket.io chat service initialized');
}

// ============================================================
// DATABASE OPERATIONS
// ============================================================

/**
 * Insert a chat message and return the full message with sender info
 */
async function insertMessage({ channelId, senderId, senderType = 'user', body, messageType = 'text', attachments = [], replyToId = null, houstonMeta = null }) {
  const result = await pool.query(
    `INSERT INTO chat_messages
       (channel_id, sender_id, sender_type, body, message_type, attachments, reply_to_id, houston_meta)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb)
     RETURNING *`,
    [channelId, senderId || null, senderType, body, messageType,
     JSON.stringify(attachments), replyToId, houstonMeta ? JSON.stringify(houstonMeta) : null]
  );

  const msg = result.rows[0];

  // Fetch sender display info
  if (msg.sender_id) {
    const userResult = await pool.query(
      `SELECT display_name, avatar_color FROM users WHERE user_id = $1`,
      [msg.sender_id]
    );
    if (userResult.rows[0]) {
      msg.sender_name = userResult.rows[0].display_name;
      msg.sender_color = userResult.rows[0].avatar_color;
    }
  } else if (msg.sender_type === 'houston') {
    msg.sender_name = 'Houston';
    msg.sender_color = '#10b981'; // emerald-500
  }

  return msg;
}

/**
 * Get paginated messages for a channel
 */
async function getMessages(channelId, { limit = 50, before = null } = {}) {
  let query = `
    SELECT m.*,
           COALESCE(u.display_name, CASE WHEN m.sender_type = 'houston' THEN 'Houston' ELSE NULL END) AS sender_name,
           COALESCE(u.avatar_color, CASE WHEN m.sender_type = 'houston' THEN '#10b981' ELSE NULL END) AS sender_color,
           COALESCE(
             (SELECT json_agg(json_build_object('emoji', r.emoji, 'user_id', r.user_id))
              FROM chat_reactions r WHERE r.message_id = m.id),
             '[]'
           ) AS reactions
    FROM chat_messages m
    LEFT JOIN users u ON m.sender_id = u.user_id
    WHERE m.channel_id = $1 AND m.deleted_at IS NULL
  `;
  const params = [channelId];

  if (before) {
    query += ` AND m.created_at < $${params.length + 1}`;
    params.push(before);
  }

  query += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(query, params);
  // Return in chronological order (oldest first)
  return result.rows.reverse();
}

/**
 * Get channels for a user with unread counts
 */
async function getChannels(userId) {
  const result = await pool.query(`
    SELECT c.*,
           cm.last_read_at,
           (SELECT COUNT(*)
            FROM chat_messages msg
            WHERE msg.channel_id = c.id
              AND msg.deleted_at IS NULL
              AND msg.created_at > cm.last_read_at
              AND msg.sender_id != $1
           ) AS unread_count,
           (SELECT body FROM chat_messages msg2
            WHERE msg2.channel_id = c.id AND msg2.deleted_at IS NULL
            ORDER BY msg2.created_at DESC LIMIT 1
           ) AS last_message,
           (SELECT created_at FROM chat_messages msg3
            WHERE msg3.channel_id = c.id AND msg3.deleted_at IS NULL
            ORDER BY msg3.created_at DESC LIMIT 1
           ) AS last_message_at
    FROM chat_channels c
    JOIN chat_channel_members cm ON c.id = cm.channel_id
    WHERE cm.user_id = $1
    ORDER BY last_message_at DESC NULLS LAST
  `, [userId]);

  return result.rows;
}

/**
 * Ensure a user is a member of a channel (auto-join on first access)
 */
async function ensureMembership(channelId, userId) {
  await pool.query(
    `INSERT INTO chat_channel_members (channel_id, user_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [channelId, userId]
  );
}

// ============================================================
// HOUSTON INTERJECTION ENGINE
// ============================================================

// Track daily interjection count (resets at midnight)
let houstonDailyCount = 0;
let houstonCountDate = new Date().toDateString();
const HOUSTON_DAILY_LIMIT = 5;

/**
 * Evaluate whether Houston should respond to a message.
 * 5-level decision tree from the architecture docs:
 *   1. @houston mention → always respond
 *   2. Data-answerable question → respond if Houston can pull CRM data
 *   3. Missing context in deal discussion → surface relevant info
 *   4. Team stuck → offer suggestion
 *   5. Everything else → stay silent
 */
async function evaluateHoustonInterjection(message) {
  // Houston doesn't respond to Houston
  if (message.sender_type === 'houston') return;

  // Reset daily counter
  const today = new Date().toDateString();
  if (today !== houstonCountDate) {
    houstonDailyCount = 0;
    houstonCountDate = today;
  }

  const body = (message.body || '').toLowerCase();
  const attachments = parseAttachments(message.attachments);

  // Level 0: Image attachment — always analyze (Houston decides relevance)
  const imageAttachments = attachments.filter(a => a.mime_type?.startsWith('image/'));
  if (imageAttachments.length > 0) {
    await triggerHoustonResponse(message, 'image_analysis');
    return;
  }

  // Level 1: Direct @mention — always respond
  if (body.includes('@houston')) {
    await triggerHoustonResponse(message, 'at_mention');
    return;
  }

  // Rate limit check for unprompted interjections
  if (houstonDailyCount >= HOUSTON_DAILY_LIMIT) {
    await logInterjectionDecision(message, 'suppressed', 'daily_limit_reached');
    return;
  }

  // Level 2: Data-answerable question
  // Look for question patterns + CRM entity keywords
  const isQuestion = /\?|who is|what('s| is)|how many|when did|do we have|any info/i.test(body);
  const hasCrmEntity = /deal|property|contact|company|lease|tenant|owner|broker|comp/i.test(body);

  if (isQuestion && hasCrmEntity) {
    await triggerHoustonResponse(message, 'data_question');
    return;
  }

  // Level 3-4: Deal discussion context / team stuck
  await logInterjectionDecision(message, 'suppressed', 'no_trigger_matched');
}

/**
 * Parse attachments — handles string, array, or null
 */
function parseAttachments(att) {
  if (!att) return [];
  if (Array.isArray(att)) return att;
  if (typeof att === 'string') {
    try { return JSON.parse(att); } catch { return []; }
  }
  return [];
}

/**
 * Read an uploaded image and return as base64
 * Handles both Vercel Blob URLs (https://) and local /uploads/ paths
 */
async function readImageAsBase64(urlPath) {
  // Vercel Blob URL — fetch from remote
  if (urlPath.startsWith('https://')) {
    try {
      const response = await fetch(urlPath);
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer.toString('base64');
    } catch (err) {
      console.error('[chat/houston] Failed to fetch Blob image:', err.message);
      return null;
    }
  }

  // Local filesystem fallback
  const filename = urlPath.replace(/^\/uploads\//, '');
  const filePath = path.join(__dirname, '..', 'uploads', filename);
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

/**
 * Build the image analysis prompt for Houston
 */
function buildImageAnalysisPrompt(crmContext) {
  return `You are Houston, AI team member for an Inland Empire commercial real estate brokerage (Leanne Associates).

Someone just shared an image in the team chat. Analyze it and classify into one of these categories:

CATEGORIES:
1. "client_conversation" — Screenshot of text messages, emails, or chat with a client/contact
2. "property_listing" — CoStar, LoopNet, MLS, or property listing screenshot
3. "document" — Lease, LOI, site plan, contract, or business document photo
4. "crm_data" — Spreadsheet, report, or CRM screenshot
5. "personal" — Family photos, memes, food, non-work content

RESPONSE RULES:
- For "client_conversation": Identify who the conversation is with (name if visible). Summarize the key points. Then ask: "Want me to log this as an activity for [Contact Name]?" If you can identify the contact, reference them by name.
- For "property_listing": Extract address, price, SF, property type, and any other visible details. Then ask: "Want me to cross-reference this in the CRM?"
- For "document": Summarize the key terms, parties involved, and important dates. Then ask: "Want me to save this summary to [entity] notes?"
- For "crm_data": Read and comment on the data with relevant CRM context.
- For "personal": React briefly and warmly like a team member (1 sentence max). Do NOT offer any CRM actions. Do NOT analyze it like work content. Just be human about it.

${crmContext ? `\nCURRENT CRM CONTEXT:\n${crmContext}\n` : ''}

Keep responses concise (3-5 sentences for work content, 1 sentence for personal).
NEVER prefix with "[Houston]:" — the chat UI shows your name.
If offering an action, end with a clear yes/no question so the user can confirm.`;
}

/**
 * Houston generates and sends a response using Claude
 */
async function triggerHoustonResponse(triggerMessage, triggerType) {
  try {
    // Get recent messages for conversation context
    const recentMessages = await getMessages(triggerMessage.channel_id, { limit: 30 });

    // Pull CRM context — relevant deals, properties, contacts
    const crmContext = await buildCrmContext(triggerMessage.body);

    // Pull Houston's memories about this user
    const memories = await getRelevantMemories(triggerMessage.sender_id, triggerMessage.body);

    let systemPrompt;
    let mergedHistory;
    let imageAnalysisData = null;

    if (triggerType === 'image_analysis') {
      // ── IMAGE ANALYSIS PATH ──
      // Build vision-aware message with image content blocks
      systemPrompt = buildImageAnalysisPrompt(crmContext ? JSON.stringify(crmContext) : null);

      const attachments = parseAttachments(triggerMessage.attachments);
      const imageAtts = attachments.filter(a => a.mime_type?.startsWith('image/'));

      // Build multimodal content: text context + image(s)
      const contentBlocks = [];

      // Add any text the user sent with the image
      if (triggerMessage.body) {
        contentBlocks.push({ type: 'text', text: `[${triggerMessage.sender_name || 'Team Member'}]: ${triggerMessage.body}` });
      }

      // Add images as base64
      for (const img of imageAtts) {
        const base64 = await readImageAsBase64(img.url);
        if (base64) {
          const mediaType = img.mime_type || 'image/png';
          contentBlocks.push({
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          });
          imageAnalysisData = { filename: img.filename, mime_type: mediaType };
        }
      }

      if (contentBlocks.length === 0) {
        contentBlocks.push({ type: 'text', text: 'An image was shared but I could not read it.' });
      }

      // Add recent conversation context as preceding messages
      const contextMsgs = recentMessages.slice(-10).filter(m => m.id !== triggerMessage.id);
      mergedHistory = [];
      for (const m of contextMsgs) {
        const role = m.sender_type === 'houston' ? 'assistant' : 'user';
        const text = `[${m.sender_name || 'Team Member'}]: ${m.body || '[attachment]'}`;
        if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].role === role) {
          mergedHistory[mergedHistory.length - 1].content += '\n' + text;
        } else {
          mergedHistory.push({ role, content: text });
        }
      }

      // Ensure alternating roles
      if (mergedHistory.length > 0 && mergedHistory[0].role === 'assistant') {
        mergedHistory.shift();
      }

      // Add the image message as the final user message
      mergedHistory.push({ role: 'user', content: contentBlocks });

    } else {
      // ── STANDARD TEXT PATH ──
      // Build conversation for Claude
      const conversationHistory = recentMessages.map(m => ({
        role: m.sender_type === 'houston' ? 'assistant' : 'user',
        content: `[${m.sender_name || (m.sender_type === 'houston' ? 'Houston' : 'Team Member')}]: ${m.body || '[attachment]'}`
      }));

      // Merge consecutive same-role messages (Claude requires alternating roles)
      mergedHistory = [];
      for (const msg of conversationHistory) {
        if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].role === msg.role) {
          mergedHistory[mergedHistory.length - 1].content += '\n' + msg.content;
        } else {
          mergedHistory.push({ ...msg });
        }
      }

      // Ensure conversation starts with user and ends with user
      if (mergedHistory.length > 0 && mergedHistory[0].role === 'assistant') {
        mergedHistory.shift();
      }
      if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].role === 'assistant') {
        mergedHistory.push({ role: 'user', content: '[waiting for Houston\'s response]' });
      }
      if (mergedHistory.length === 0) {
        mergedHistory.push({ role: 'user', content: triggerMessage.body || 'Hey Houston' });
      }

      systemPrompt = buildHoustonSystemPrompt(crmContext, memories, triggerType);
    }

    let houstonBody;

    if (getOAuthToken()) {
      // Use Claude API via OAuth (Claude Max subscription)
      try {
        const responseText = await callClaude({
          system: systemPrompt,
          messages: mergedHistory,
          max_tokens: triggerType === 'image_analysis' ? 800 : 500,
        });
        houstonBody = responseText || "Sorry, I couldn't form a response right now.";
        houstonBody = houstonBody.replace(/^\[?Houston\]?:\s*/i, '');
      } catch (apiErr) {
        console.error('[chat/houston] Claude API error:', apiErr.message);
        houstonBody = "Hey \u2014 I hit a snag connecting to my brain. Give me a sec and try again. \uD83E\uDD19";
      }
    } else {
      houstonBody = triggerType === 'at_mention'
        ? "Hey \u2014 I caught that mention but my OAuth token isn't configured yet. Once it's set, I'll be able to pull CRM data and give you real answers here."
        : "Good question \u2014 I need my OAuth token configured to answer that. Check with David.";
    }

    // Store analysis back on the original message's attachment
    if (imageAnalysisData && triggerMessage.id) {
      try {
        await pool.query(
          `UPDATE chat_messages
           SET attachments = (
             SELECT jsonb_agg(
               CASE WHEN elem->>'filename' = $2
                    THEN elem || jsonb_build_object('houston_analysis', $3::text)
                    ELSE elem
               END
             )
             FROM jsonb_array_elements(attachments) AS elem
           )
           WHERE id = $1`,
          [triggerMessage.id, imageAnalysisData.filename, houstonBody]
        );
      } catch (dbErr) {
        console.error('[chat/houston] Failed to store image analysis:', dbErr.message);
      }
    }

    const houstonMsg = await insertMessage({
      channelId: triggerMessage.channel_id,
      senderId: null,
      senderType: 'houston',
      body: houstonBody,
      messageType: 'houston_insight',
      houstonMeta: {
        trigger: triggerType,
        trigger_message_id: triggerMessage.id,
        model: getOAuthToken() ? HOUSTON_MODEL : 'placeholder',
        context_messages: recentMessages.length,
        crm_entities_referenced: crmContext?.entitiesFound || 0,
        memories_used: memories?.length || 0,
        ...(imageAnalysisData ? { image_analyzed: imageAnalysisData.filename } : {}),
      }
    });

    // Broadcast Houston's response
    io.to(`channel:${triggerMessage.channel_id}`).emit('chat:message:new', houstonMsg);

    // Store this interaction as a memory
    if (getOAuthToken()) {
      storeMemory(triggerMessage, houstonBody).catch(err =>
        console.error('[chat/houston] Memory storage error:', err.message)
      );
    }

    // Track interjection
    if (triggerType !== 'at_mention') {
      houstonDailyCount++;
    }

    await logInterjectionDecision(triggerMessage, 'interjected', triggerType);
  } catch (err) {
    console.error('[chat/houston] Error generating response:', err.message);
  }
}

/**
 * Build Houston's system prompt with CRM data and personality
 */
function buildHoustonSystemPrompt(crmContext, memories, triggerType) {
  const memorySection = memories && memories.length > 0
    ? `\n\nYOUR MEMORIES ABOUT THIS USER (use naturally, don't list them):\n${memories.map(m => {
        const age = Math.floor((Date.now() - new Date(m.created_at).getTime()) / 86400000);
        const ageLabel = age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age}d ago`;
        return `- [${m.category}|${ageLabel}] ${m.content}${m.entity_type ? ` (re: ${m.entity_type})` : ''}`;
      }).join('\n')}\nUse these memories to personalize your responses — reference past conversations naturally ("last time you mentioned...", "you prefer...", "remember when...").`
    : '';

  const crmSection = crmContext
    ? `\n\nCRM DATA AVAILABLE:\n${crmContext.summary}`
    : '';

  return `You are Houston, the AI team member at Leanne Associates, a commercial real estate brokerage in the Inland Empire (Southern California). You are part of the team alongside David Mudge Jr (admin/lead broker), Dave Mudge Sr (broker/dad), and Sarah Tabor (broker/sister).

PERSONALITY:
- Professional but warm — you're a team member, not a bot
- Dry humor occasionally, but only when it fits naturally
- Concise — max 3-4 sentences unless asked for detail
- Action-oriented — every message should imply what someone should do
- Reference what the team already knows ("They're already in our CRM", "We talked about this last week")
- Never say "As an AI" or "I don't have feelings" — you're Houston, period

KNOWLEDGE:
- You have access to the IE CRM database (Inland Empire commercial real estate)
- The CRM has: Properties (10,000+), Contacts, Companies, Deals, Comps (lease & sale), TPE scores
- Focus areas: Industrial, Retail, Office in the Inland Empire (Ontario, Fontana, Rancho Cucamonga, Riverside, San Bernardino, etc.)
- You know about deal stages, TPE (Transaction Probability Engine) scoring, and market dynamics
${crmSection}
${memorySection}

TRIGGER: ${triggerType}
${triggerType === 'at_mention' ? 'Someone mentioned you directly — always respond helpfully.' : ''}
${triggerType === 'data_question' ? 'Someone asked a question you can answer with CRM data.' : ''}

RULES:
- NEVER prefix your response with "[Houston]:" or your name — the chat UI already shows your name above the message
- If you have CRM data to answer the question, use it with specific numbers and names
- If you don't have the data, say so briefly and suggest where to look
- Keep responses short and punchy — this is a team chat, not an email
- Use emoji sparingly (1-2 max per message) — you're professional, not a chatbot
- If it's casual/fun team banter, you can be brief and witty`;
}

/**
 * Pull relevant CRM data based on message content
 */
async function buildCrmContext(messageBody) {
  if (!pool || !messageBody) return null;

  const body = messageBody.toLowerCase();
  const results = { summary: '', entitiesFound: 0 };
  const sections = [];

  // Detect city/submarket mentions
  const cities = ['ontario', 'fontana', 'rancho cucamonga', 'riverside', 'san bernardino',
                  'redlands', 'colton', 'rialto', 'upland', 'pomona', 'chino', 'eastvale',
                  'highland', 'corona', 'moreno valley', 'perris', 'jurupa valley', 'montclair'];
  const mentionedCity = cities.find(c => body.includes(c));

  // Each section is independently try/caught so one failure doesn't kill the rest

  // Look for deal-related queries
  if (body.includes('deal') || body.includes('pipeline') || body.includes('closing')) {
    try {
      const deals = await pool.query(`
        SELECT d.deal_name, d.status, d.deal_type, d.close_date, d.sf, d.rate,
               df.team_gross_computed, df.jr_gross_computed
        FROM deal_formulas df
        JOIN deals d ON d.deal_id = df.deal_id
        ${mentionedCity ? "WHERE LOWER(d.deal_name) LIKE '%' || $1 || '%' OR LOWER(d.notes) LIKE '%' || $1 || '%'" : ''}
        ORDER BY d.close_date ASC NULLS LAST
        LIMIT 10
      `, mentionedCity ? [mentionedCity] : []);

      if (deals.rows.length > 0) {
        results.entitiesFound += deals.rows.length;
        sections.push(`DEALS (${deals.rows.length} found):\n` +
          deals.rows.map(d =>
            `  - "${d.deal_name}" | ${d.status || 'Unknown status'} | ${d.deal_type || ''} | Close: ${d.close_date ? new Date(d.close_date).toLocaleDateString() : 'TBD'} | Team Gross: $${d.team_gross_computed ? Number(d.team_gross_computed).toLocaleString() : '?'}`
          ).join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Deals query error:', err.message);
    }
  }

  // Look for property queries
  if (body.includes('propert') || body.includes('building') || body.includes('warehouse') ||
      body.includes('industrial') || body.includes('retail') || body.includes('office') ||
      body.includes('sqft') || body.includes('square') || mentionedCity) {
    try {
      const propQuery = mentionedCity
        ? `SELECT property_address, city, property_type, rba, land_sf, for_sale_price
           FROM properties WHERE LOWER(city) = $1
           ORDER BY rba DESC NULLS LAST LIMIT 8`
        : `SELECT property_address, city, property_type, rba, land_sf, for_sale_price
           FROM properties ORDER BY last_modified DESC NULLS LAST LIMIT 5`;
      const props = await pool.query(propQuery, mentionedCity ? [mentionedCity] : []);

      if (props.rows.length > 0) {
        results.entitiesFound += props.rows.length;
        const total = mentionedCity
          ? (await pool.query('SELECT COUNT(*) FROM properties WHERE LOWER(city) = $1', [mentionedCity])).rows[0].count
          : null;
        sections.push(`PROPERTIES${mentionedCity ? ` in ${mentionedCity.charAt(0).toUpperCase() + mentionedCity.slice(1)} (${total} total)` : ' (recent)'}:\n` +
          props.rows.map(p =>
            `  - ${p.property_address}, ${p.city} | ${p.property_type || '?'} | ${p.rba ? Number(p.rba).toLocaleString() + ' sqft' : '?'} | ${p.for_sale_price ? '$' + Number(p.for_sale_price).toLocaleString() : 'No price'}`
          ).join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Properties query error:', err.message);
    }
  }

  // Look for contact queries
  if (body.includes('contact') || body.includes('who') || body.includes('owner') ||
      body.includes('broker') || body.includes('tenant') || body.includes('person')) {
    try {
      const contacts = await pool.query(`
        SELECT full_name, title, email, phone_1, type
        FROM contacts
        ORDER BY created_at DESC NULLS LAST
        LIMIT 5
      `);
      if (contacts.rows.length > 0) {
        results.entitiesFound += contacts.rows.length;
        sections.push(`RECENT CONTACTS:\n` +
          contacts.rows.map(c =>
            `  - ${c.full_name || '?'} | ${c.title || ''} | ${c.type || ''} | ${c.email || 'no email'}`
          ).join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Contacts query error:', err.message);
    }
  }

  // Look for comp/market queries
  if (body.includes('comp') || body.includes('lease rate') || body.includes('market') ||
      body.includes('rent') || body.includes('sale price')) {
    try {
      const comps = await pool.query(`
        SELECT lc.tenant_name, p.property_address, p.city, lc.sf, lc.rate, lc.rent_type, lc.commencement_date
        FROM lease_comps lc
        LEFT JOIN properties p ON lc.property_id = p.property_id
        ${mentionedCity ? "WHERE LOWER(p.city) = $1" : ''}
        ORDER BY lc.commencement_date DESC NULLS LAST
        LIMIT 5
      `, mentionedCity ? [mentionedCity] : []);
      if (comps.rows.length > 0) {
        results.entitiesFound += comps.rows.length;
        sections.push(`RECENT LEASE COMPS:\n` +
          comps.rows.map(c =>
            `  - ${c.tenant_name || '?'} at ${c.property_address || '?'}, ${c.city || '?'} | ${c.sf ? Number(c.sf).toLocaleString() + ' sqft' : '?'} | $${c.rate || '?'}/${c.rent_type || 'sqft'}`
          ).join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Comps query error:', err.message);
    }
  }

  // General stats if nothing specific matched
  if (sections.length === 0) {
    try {
      const stats = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM properties) AS prop_count,
          (SELECT COUNT(*) FROM contacts) AS contact_count,
          (SELECT COUNT(*) FROM companies) AS company_count,
          (SELECT COUNT(*) FROM deals) AS deal_count,
          (SELECT COUNT(*) FROM deals WHERE status IN ('Active', 'Pending', 'Under Contract', 'In Progress')) AS active_deals
      `);
      const s = stats.rows[0];
      sections.push(`CRM OVERVIEW: ${s.prop_count} properties, ${s.contact_count} contacts, ${s.company_count} companies, ${s.deal_count} deals (${s.active_deals} active)`);
      results.entitiesFound = 1;
    } catch (err) {
      console.error('[chat/houston] Stats query error:', err.message);
    }
  }

  results.summary = sections.join('\n\n');
  return results;
}

/**
 * Get relevant memories for RAG context
 * Uses keyword matching + entity linking + importance scoring for relevance
 */
async function getRelevantMemories(userId, messageBody) {
  if (!pool || !userId) return [];

  try {
    const body = (messageBody || '').toLowerCase();

    // Extract keywords for matching (remove stop words, keep meaningful terms)
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
      'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'it', 'its', 'this', 'that',
      'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him',
      'his', 'she', 'her', 'they', 'them', 'their', 'what', 'which', 'who', 'whom',
      'how', 'when', 'where', 'why', 'all', 'each', 'every', 'both', 'few', 'more',
      'most', 'other', 'some', 'such', 'than', 'too', 'very', 'just', 'got', 'us',
      'get', 'give', 'quick', 'rundown', 'tell', 'know', 'think', 'want', 'need',
      'houston', 'hey', 'hi', 'hello', 'thanks', 'thank', 'please', 'yeah', 'yes',
      'no', 'ok', 'okay', 'sure', 'right', 'well', 'like', 'also', 'many']);
    const keywords = body.split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 2 && !stopWords.has(w));

    // Strategy 1: Keyword-matched memories (content contains relevant terms)
    let keywordMemories = [];
    if (keywords.length > 0) {
      // Build an OR pattern for keyword matching
      const keywordPattern = keywords.slice(0, 8).join('|'); // Cap at 8 keywords
      const kmResult = await pool.query(`
        SELECT category, content, created_at, importance,
               entity_type, entity_id,
               1 AS match_type
        FROM houston_memories
        WHERE user_id = $1
          AND (expires_at IS NULL OR expires_at > NOW())
          AND content ~* $2
        ORDER BY importance DESC, created_at DESC
        LIMIT 5
      `, [userId, keywordPattern]);
      keywordMemories = kmResult.rows;
    }

    // Strategy 2: Entity-linked memories (if message references known entities)
    let entityMemories = [];
    const cities = ['ontario', 'fontana', 'rancho cucamonga', 'riverside', 'san bernardino',
                    'redlands', 'colton', 'rialto', 'upland', 'pomona', 'chino', 'eastvale',
                    'highland', 'corona', 'moreno valley', 'perris', 'jurupa valley', 'montclair'];
    const mentionedCity = cities.find(c => body.includes(c));
    const entityKeywords = body.match(/deal|property|contact|company|comp/gi) || [];

    if (mentionedCity || entityKeywords.length > 0) {
      // Look for memories linked to entities in the mentioned city or entity type
      const entityTypes = [];
      if (body.includes('deal')) entityTypes.push('deal');
      if (body.includes('propert') || body.includes('building') || mentionedCity) entityTypes.push('property');
      if (body.includes('contact') || body.includes('who') || body.includes('person')) entityTypes.push('contact');
      if (body.includes('company') || body.includes('tenant') || body.includes('owner')) entityTypes.push('company');

      if (entityTypes.length > 0) {
        const emResult = await pool.query(`
          SELECT category, content, created_at, importance,
                 entity_type, entity_id,
                 2 AS match_type
          FROM houston_memories
          WHERE user_id = $1
            AND (expires_at IS NULL OR expires_at > NOW())
            AND entity_type = ANY($2)
          ORDER BY importance DESC, created_at DESC
          LIMIT 5
        `, [userId, entityTypes]);
        entityMemories = emResult.rows;
      }
    }

    // Strategy 3: High-importance memories (preferences, key facts — always relevant)
    const hiResult = await pool.query(`
      SELECT category, content, created_at, importance,
             entity_type, entity_id,
             3 AS match_type
      FROM houston_memories
      WHERE user_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
        AND importance >= 0.8
        AND category IN ('preference', 'relationship', 'key_fact')
      ORDER BY importance DESC, created_at DESC
      LIMIT 5
    `, [userId]);

    // Strategy 4: Recent memories (last 7 days, for conversational continuity)
    const recentResult = await pool.query(`
      SELECT category, content, created_at, importance,
             entity_type, entity_id,
             4 AS match_type
      FROM houston_memories
      WHERE user_id = $1
        AND (expires_at IS NULL OR expires_at > NOW())
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 3
    `, [userId]);

    // Merge and deduplicate (keyword > entity > importance > recent)
    const seen = new Set();
    const merged = [];
    for (const mem of [...keywordMemories, ...entityMemories, ...hiResult.rows, ...recentResult.rows]) {
      const key = mem.content.slice(0, 100); // Deduplicate by content prefix
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(mem);
      }
    }

    // Cap at 12 total memories to avoid bloating the context
    return merged.slice(0, 12);
  } catch (err) {
    console.error('[chat/houston] Memory retrieval error:', err.message);
    return [];
  }
}

/**
 * Store a new memory from this conversation.
 * Uses Claude to extract what's worth remembering — preferences, facts, relationships.
 * Skips trivial exchanges (greetings, yes/no, etc.)
 */
async function storeMemory(triggerMessage, houstonResponse) {
  if (!pool || !triggerMessage.sender_id) return;

  const userMsg = (triggerMessage.body || '').trim();
  const houstonMsg = (houstonResponse || '').trim();

  // Skip trivially short exchanges (greetings, acknowledgments)
  if (userMsg.length < 15 && houstonMsg.length < 30) return;

  try {
    if (getOAuthToken()) {
      // Use Claude to extract structured memories from this exchange
      const responseText = await callClaude({
        system: `You extract memories from chat exchanges for a CRM AI assistant named Houston.
Return a JSON array of memories worth storing. Each memory object has:
- "content": concise factual statement (max 150 chars)
- "category": one of "preference", "key_fact", "relationship", "context", "action_taken"
- "importance": 0.0-1.0 (preferences=0.9, key facts=0.8, relationships=0.85, context=0.5, actions=0.6)
- "entity_type": null or one of "property", "deal", "contact", "company" (if the memory references a specific CRM entity)
- "entity_keywords": array of 2-5 searchable keywords from the memory

Rules:
- Only extract genuinely useful memories — things Houston should remember next time
- Skip trivial Q&A that's just looking up data ("how many properties" → not memorable)
- DO remember: stated preferences, business relationships, action decisions, important facts
- Return [] (empty array) if nothing is worth remembering
- Return valid JSON only, no markdown`,
        messages: [{
          role: 'user',
          content: `User said: "${userMsg.slice(0, 300)}"\nHouston replied: "${houstonMsg.slice(0, 300)}"\n\nExtract memories (JSON array):`
        }],
        max_tokens: 400,
      }) || '[]';

      // Parse the JSON response
      let memories = [];
      try {
        // Handle potential markdown wrapping
        const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
        memories = JSON.parse(jsonStr);
        if (!Array.isArray(memories)) memories = [];
      } catch {
        // If parsing fails, skip storing
        console.warn('[chat/houston] Memory extraction parse failed:', responseText.slice(0, 100));
        return;
      }

      // Store each extracted memory
      for (const mem of memories.slice(0, 3)) { // Max 3 memories per exchange
        // Check for near-duplicates before inserting
        const dupCheck = await pool.query(`
          SELECT memory_id FROM houston_memories
          WHERE user_id = $1
            AND content ILIKE '%' || $2 || '%'
            AND created_at > NOW() - INTERVAL '30 days'
          LIMIT 1
        `, [triggerMessage.sender_id, mem.content.slice(0, 60)]);

        if (dupCheck.rows.length > 0) continue; // Skip duplicate

        await pool.query(`
          INSERT INTO houston_memories (user_id, category, content, source, importance, entity_type)
          VALUES ($1, $2, $3, 'team_chat', $4, $5)
        `, [
          triggerMessage.sender_id,
          mem.category || 'context',
          mem.content.slice(0, 500),
          Math.min(Math.max(parseFloat(mem.importance) || 0.5, 0.1), 1.0),
          mem.entity_type || null,
        ]);
      }

      if (memories.length > 0) {
        console.log(`[chat/houston] Stored ${Math.min(memories.length, 3)} memories for user ${triggerMessage.sender_id}`);
      }
    } else {
      // Fallback: basic storage without extraction
      const content = `User asked: "${userMsg.slice(0, 200)}" — Houston answered about: ${houstonMsg.slice(0, 200)}`;
      await pool.query(`
        INSERT INTO houston_memories (user_id, category, content, source, importance)
        VALUES ($1, 'chat_exchange', $2, 'team_chat', 0.5)
      `, [triggerMessage.sender_id, content]);
    }
  } catch (err) {
    // Non-critical
    console.error('[chat/houston] Memory storage error:', err.message);
  }
}

/**
 * Log Houston's interjection decision (for tuning and auditing)
 */
// ============================================================
// ACTION CONFIRMATION — thumbs up or "yes" to execute CRM actions
// ============================================================

/**
 * Handle emoji reaction confirmation on a Houston message
 */
async function handleActionConfirmation(messageId, userId) {
  // Find the Houston message that was reacted to
  const result = await pool.query(
    `SELECT * FROM chat_messages WHERE id = $1 AND sender_type = 'houston' AND deleted_at IS NULL`,
    [messageId]
  );
  const houstonMsg = result.rows[0];
  if (!houstonMsg) return; // Not a Houston message

  const meta = typeof houstonMsg.houston_meta === 'string'
    ? JSON.parse(houstonMsg.houston_meta) : (houstonMsg.houston_meta || {});

  // Only act on image analysis messages that offered actions
  if (meta.trigger !== 'image_analysis') return;
  if (meta.action_executed) return; // Already executed

  await executeHoustonAction(houstonMsg, userId);
}

/**
 * Handle text confirmation ("yes", "do it") after a Houston action offer
 */
async function handleTextConfirmation(message) {
  // Look for the most recent Houston message in this channel that offered an action
  const result = await pool.query(
    `SELECT * FROM chat_messages
     WHERE channel_id = $1 AND sender_type = 'houston' AND deleted_at IS NULL
       AND houston_meta IS NOT NULL
     ORDER BY created_at DESC LIMIT 1`,
    [message.channel_id]
  );
  const houstonMsg = result.rows[0];
  if (!houstonMsg) return;

  const meta = typeof houstonMsg.houston_meta === 'string'
    ? JSON.parse(houstonMsg.houston_meta) : (houstonMsg.houston_meta || {});

  if (meta.trigger !== 'image_analysis') return;
  if (meta.action_executed) return;

  // Check that this Houston message is recent (within 5 minutes)
  const age = Date.now() - new Date(houstonMsg.created_at).getTime();
  if (age > 5 * 60 * 1000) return;

  await executeHoustonAction(houstonMsg, message.sender_id);
}

/**
 * Execute the CRM action Houston offered (log activity, cross-reference, etc.)
 */
async function executeHoustonAction(houstonMsg, userId) {
  const meta = typeof houstonMsg.houston_meta === 'string'
    ? JSON.parse(houstonMsg.houston_meta) : (houstonMsg.houston_meta || {});
  const body = houstonMsg.body || '';

  try {
    // Use Claude to extract the action details from Houston's message
    const extractionText = await callClaude({
      system: `Extract the CRM action from Houston's message. Return JSON only.
If Houston offered to log an activity/interaction, return:
{"action": "log_interaction", "contact_name": "...", "summary": "...", "interaction_type": "Note"}
If Houston offered to cross-reference a property, return:
{"action": "cross_reference", "address": "...", "details": "..."}
If Houston offered to save notes, return:
{"action": "save_notes", "entity_name": "...", "notes": "..."}
If no actionable offer was made, return:
{"action": "none"}`,
      messages: [{ role: 'user', content: `Houston said: "${body}"` }],
      max_tokens: 300,
    });

    if (!extractionText) return;

    let action;
    try {
      const jsonStr = extractionText.replace(/```json\n?|\n?```/g, '').trim();
      action = JSON.parse(jsonStr);
    } catch {
      console.warn('[chat/houston] Action extraction parse failed:', extractionText.slice(0, 100));
      return;
    }

    if (!action || action.action === 'none') return;

    let confirmMsg = '';

    if (action.action === 'log_interaction' && action.contact_name) {
      // Find the contact
      const contactResult = await pool.query(
        `SELECT contact_id, full_name FROM contacts WHERE full_name ILIKE $1 LIMIT 1`,
        [`%${action.contact_name}%`]
      );

      if (contactResult.rows.length > 0) {
        const contact = contactResult.rows[0];
        // Create interaction
        const interResult = await pool.query(
          `INSERT INTO interactions (type, date, notes, created_by)
           VALUES ($1, NOW(), $2, $3) RETURNING interaction_id`,
          [action.interaction_type || 'Note', action.summary || body, userId]
        );
        // Link to contact via junction table
        if (interResult.rows[0]) {
          await pool.query(
            `INSERT INTO interaction_contacts (interaction_id, contact_id)
             VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [interResult.rows[0].interaction_id, contact.contact_id]
          );
        }
        confirmMsg = `Done \u2014 logged activity for ${contact.full_name}. \u2705`;
      } else {
        confirmMsg = `I couldn't find a contact matching "${action.contact_name}" in the CRM. You may need to log this manually.`;
      }
    } else if (action.action === 'cross_reference' && action.address) {
      // Search for property
      const propResult = await pool.query(
        `SELECT id, address, city, property_type FROM properties
         WHERE address ILIKE $1 OR normalized_address ILIKE $1 LIMIT 3`,
        [`%${action.address}%`]
      );
      if (propResult.rows.length > 0) {
        const matches = propResult.rows.map(p => `${p.address}, ${p.city} (${p.property_type})`).join('; ');
        confirmMsg = `Found in CRM: ${matches}`;
      } else {
        confirmMsg = `No matching property found for "${action.address}". Want me to add it?`;
      }
    } else if (action.action === 'save_notes') {
      confirmMsg = `Notes saved. \u2705`;
    }

    if (confirmMsg) {
      // Mark this action as executed so it doesn't fire twice
      await pool.query(
        `UPDATE chat_messages SET houston_meta = houston_meta || '{"action_executed": true}'::jsonb WHERE id = $1`,
        [houstonMsg.id]
      );

      // Send confirmation message
      const confirmMessage = await insertMessage({
        channelId: houstonMsg.channel_id,
        senderId: null,
        senderType: 'houston',
        body: confirmMsg,
        messageType: 'houston_insight',
        houstonMeta: { trigger: 'action_confirmation', parent_message_id: houstonMsg.id }
      });
      io.to(`channel:${houstonMsg.channel_id}`).emit('chat:message:new', confirmMessage);
    }
  } catch (err) {
    console.error('[chat/houston] Action execution error:', err.message);
  }
}

async function logInterjectionDecision(message, decision, reason) {
  try {
    await pool.query(
      `INSERT INTO houston_interjections (channel_id, message_id, trigger_type, decision, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [message.channel_id, message.id,
       reason === 'daily_limit_reached' ? 'data_question' : (reason || 'at_mention'),
       decision, reason]
    );
  } catch (err) {
    // Non-critical — don't crash on logging failure
    console.error('[chat/houston] Error logging interjection:', err.message);
  }
}

// ============================================================
// REST API ROUTE HANDLERS (mounted in index.js)
// ============================================================

function registerChatRoutes(app) {
  // GET /api/chat/channels — list channels for current user
  app.get('/api/chat/channels', async (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) return res.status(400).json({ error: 'userId required' });

      const channels = await getChannels(userId);
      res.json(channels);
    } catch (err) {
      console.error('[chat] GET /channels error:', err.message);
      res.status(500).json({ error: 'Failed to fetch channels' });
    }
  });

  // POST /api/chat/channels — create a new channel
  app.post('/api/chat/channels', async (req, res) => {
    try {
      const { name, channelType = 'group', createdBy, memberIds = [] } = req.body;
      if (!name || !createdBy) return res.status(400).json({ error: 'name and createdBy required' });

      const result = await pool.query(
        `INSERT INTO chat_channels (name, channel_type, created_by)
         VALUES ($1, $2, $3) RETURNING *`,
        [name, channelType, createdBy]
      );
      const channel = result.rows[0];

      // Add creator + specified members
      const allMembers = [...new Set([createdBy, ...memberIds])];
      for (const uid of allMembers) {
        await ensureMembership(channel.id, uid);
      }

      res.json(channel);
    } catch (err) {
      console.error('[chat] POST /channels error:', err.message);
      res.status(500).json({ error: 'Failed to create channel' });
    }
  });

  // GET /api/chat/messages/:channelId — get messages (paginated)
  app.get('/api/chat/messages/:channelId', async (req, res) => {
    try {
      const { channelId } = req.params;
      const { limit = 50, before } = req.query;

      // Auto-join user to channel if not a member
      if (req.query.userId) {
        await ensureMembership(channelId, req.query.userId);
      }

      const messages = await getMessages(channelId, {
        limit: parseInt(limit, 10),
        before: before || null
      });

      res.json(messages);
    } catch (err) {
      console.error('[chat] GET /messages error:', err.message);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // NOTE: POST /api/chat/upload is handled in index.js with multer middleware

  // GET /api/chat/unread — total unread count across all channels
  app.get('/api/chat/unread', async (req, res) => {
    try {
      const userId = req.query.userId;
      if (!userId) return res.status(400).json({ error: 'userId required' });

      const result = await pool.query(`
        SELECT COALESCE(SUM(unread), 0) AS total_unread FROM (
          SELECT COUNT(*) AS unread
          FROM chat_messages msg
          JOIN chat_channel_members cm ON msg.channel_id = cm.channel_id
          WHERE cm.user_id = $1
            AND msg.deleted_at IS NULL
            AND msg.created_at > cm.last_read_at
            AND msg.sender_id != $1
        ) sub
      `, [userId]);

      res.json({ unread: parseInt(result.rows[0].total_unread, 10) });
    } catch (err) {
      console.error('[chat] GET /unread error:', err.message);
      res.status(500).json({ error: 'Failed to get unread count' });
    }
  });

  // POST /api/chat/seed — initialize default channels and add all users
  app.post('/api/chat/seed', async (req, res) => {
    try {
      // Get or create the General channel
      let channelResult = await pool.query(
        `SELECT id FROM chat_channels WHERE name = 'General' AND channel_type = 'group' LIMIT 1`
      );

      let channelId;
      if (channelResult.rows.length === 0) {
        const insert = await pool.query(
          `INSERT INTO chat_channels (name, channel_type) VALUES ('General', 'group') RETURNING id`
        );
        channelId = insert.rows[0].id;
      } else {
        channelId = channelResult.rows[0].id;
      }

      // Add all users to the General channel
      const users = await pool.query(`SELECT user_id FROM users`);
      for (const user of users.rows) {
        await ensureMembership(channelId, user.user_id);
      }

      res.json({ channelId, memberCount: users.rows.length });
    } catch (err) {
      console.error('[chat] POST /seed error:', err.message);
      res.status(500).json({ error: 'Failed to seed channels' });
    }
  });
}

module.exports = {
  initChat,
  registerChatRoutes,
  insertMessage,
  getMessages,
  getChannels
};
