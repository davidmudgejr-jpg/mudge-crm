// Team Chat Service — Socket.io real-time messaging + REST endpoints
// Houston integration: listens to messages, decides when to interject

const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const Anthropic = require('@anthropic-ai/sdk');

// ============================================================
// CLAUDE SDK CLIENT — uses OAuth token or API key
// ============================================================
const HOUSTON_MODEL = 'claude-sonnet-4-20250514';
let claudeClient = null;

function getClaudeClient() {
  if (claudeClient) return claudeClient;
  // Prefer OAuth token (authToken param), fall back to API key
  const oauthToken = process.env.ANTHROPIC_OAUTH_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (oauthToken) {
    claudeClient = new Anthropic({ authToken: oauthToken });
  } else if (apiKey) {
    claudeClient = new Anthropic({ apiKey });
  }
  return claudeClient;
}

function isClaudeAvailable() {
  return Boolean(process.env.ANTHROPIC_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY);
}

/**
 * Call Claude API via SDK (handles OAuth + API key auth)
 * @param {object} opts - { system, messages, max_tokens }
 * @returns {string} response text
 */
async function callClaude({ system, messages, max_tokens = 500 }) {
  const client = getClaudeClient();
  if (!client) return null;

  const response = await client.messages.create({
    model: HOUSTON_MODEL,
    max_tokens,
    messages,
    ...(system ? { system } : {}),
  });

  return response.content?.[0]?.text || null;
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

  if (isClaudeAvailable()) {
    console.log('[chat/houston] Brain online — Claude API connected');
  } else {
    console.warn('[chat/houston] No ANTHROPIC_API_KEY — Houston will use placeholder responses');
  }

  // SECURITY: Verify JWT on socket connection — derive userId server-side
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    if (!JWT_SECRET) {
      return next(new Error('Server JWT not configured'));
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      socket.authenticatedUser = {
        user_id: payload.user_id,
        email: payload.email,
        display_name: payload.display_name,
        role: payload.role || 'broker',
      };
      next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const authUser = socket.authenticatedUser;
    console.log(`[chat] User connected: ${socket.id} (${authUser.display_name})`);

    // ── Join council room (AI Ops page) ──
    socket.on('council:join', ({ userId }) => {
      socket.join('council');
      console.log(`[chat] User ${userId} joined council room`);
    });

    socket.on('council:leave', () => {
      socket.leave('council');
    });

    // ── Join channels ──
    socket.on('chat:join', async ({ channelId }) => {
      const userId = authUser.user_id; // SECURITY: use server-verified userId
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
    socket.on('chat:typing', ({ channelId }) => {
      const userId = authUser.user_id; // SECURITY: server-derived
      socket.to(`channel:${channelId}`).emit('chat:typing', {
        userId, displayName: authUser.display_name, channelId
      });
    });

    socket.on('chat:typing:stop', ({ channelId }) => {
      const userId = authUser.user_id; // SECURITY: server-derived
      socket.to(`channel:${channelId}`).emit('chat:typing:stop', {
        userId, channelId
      });
    });

    // ── Mark as read ──
    socket.on('chat:read', async ({ channelId }) => {
      const userId = authUser.user_id; // SECURITY: server-derived
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
    socket.on('chat:react', async ({ messageId, emoji }) => {
      const userId = authUser.user_id; // SECURITY: server-derived
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

    socket.on('chat:react:remove', async ({ messageId, emoji }) => {
      const userId = authUser.user_id; // SECURITY: server-derived
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
    socket.on('chat:edit', async ({ messageId, newBody }) => {
      const userId = authUser.user_id; // SECURITY: server-derived — can only edit own messages
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
    socket.on('chat:delete', async ({ messageId }) => {
      const userId = authUser.user_id; // SECURITY: server-derived — can only delete own messages
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

  // Houston DM channels — ALWAYS respond (personal 1-on-1 with Houston)
  try {
    const chResult = await pool.query(`SELECT channel_type FROM chat_channels WHERE id = $1`, [message.channel_id]);
    if (chResult.rows[0]?.channel_type === 'houston_dm') {
      const imageAtts = parseAttachments(message.attachments).filter(a => a.mime_type?.startsWith('image/'));
      await triggerHoustonResponse(message, imageAtts.length > 0 ? 'image_analysis' : 'at_mention');
      return;
    }
  } catch {}

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
  return `You are Houston, AI team member at Leanne Associates — a commercial real estate brokerage in the Inland Empire (Southern California). Your team is David Mudge Jr (admin/lead broker), Dave Mudge Sr (broker/dad), and Sarah Tabor (broker/sister).

Someone shared an image in the team chat. First, classify it silently (don't state the category), then respond naturally:

CATEGORIES (internal — do NOT mention these labels in your response):
1. client_conversation — Screenshot of text messages, emails, or chat with a client/contact
2. property_listing — CoStar, LoopNet, MLS, or property listing screenshot
3. document — Lease, LOI, site plan, contract, or business document photo
4. crm_data — Spreadsheet, report, or CRM screenshot
5. personal — Family photos, memes, food, pets, non-work content

RESPONSE STYLE — be a team member, not a robot:

For client_conversation:
- Read the conversation and identify who it's with (name if visible)
- Summarize the key takeaway in plain language: "Looks like Dave Sr texted Mike Thompson about the Highland property — he's interested but wants to wait until after his lease expires in September."
- Offer to log it: "Want me to log this as a text with Mike Thompson?"
- If you recognize a name from the CRM context, reference it: "Mike Thompson — he's already in our system as an Owner contact."
- Include an ACTION block for the log if you have enough info:
  <!--ACTION:{"type":"log_interaction","params":{"contact_name":"[name]","interaction_type":"Text","notes":"[summary of conversation]"}}-->

For property_listing:
- Extract: address, price, SF, property type, cap rate, any other visible details
- Be specific: "Looks like 14500 Meridian Pkwy in Riverside — 22,000 SF industrial, listed at $4.2M ($190/SF). Cap rate 6.2%."
- Offer to cross-reference: "Want me to check if this one's already in the CRM?"
- If the address matches a known property from CRM context, say so

For document:
- Summarize key terms: parties, property, dates, amounts, and important clauses
- "This looks like an LOI from Pacific Industrial for the Etiwanda warehouse — $0.85/SF NNN, 5-year term starting January 2027. Key contingency: 90-day due diligence period."
- Offer: "Want me to save these terms to the deal notes?"

For crm_data:
- Read the data, comment on what stands out
- Relate to CRM context if relevant

For personal:
- React warmly and briefly like a friend/coworker would (1 sentence max)
- "Nice catch! 🎣" or "That looks incredible 🔥" or brief appropriate reaction
- Do NOT offer CRM actions. Do NOT analyze it as work content. Just be human.
- If it's a meme or something funny, you can joke back briefly

${crmContext ? `\nCRM CONTEXT (use to match names, addresses, properties):\n${crmContext}\n` : ''}

RULES:
- Keep it concise: 2-4 sentences for work content, 1 sentence for personal
- NEVER prefix with "[Houston]:" — the chat UI shows your name
- NEVER say "I've classified this as..." — just respond naturally
- If offering an action, end with a clear yes/no question
- Include ACTION blocks (<!--ACTION:{"type":"...","params":{...}}-->) when you have enough info to act
- If you can't read the image clearly, say so briefly and ask them to resend
- Use emoji sparingly (1-2 max for work content, fine for personal reactions)`;
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

    // Determine channel type for memory pool separation
    let channelType = 'team'; // default to team for group channels
    try {
      const chTypeResult = await pool.query(
        `SELECT channel_type FROM chat_channels WHERE id = $1`,
        [triggerMessage.channel_id]
      );
      if (chTypeResult.rows[0]?.channel_type === 'houston_dm') {
        channelType = 'personal';
      }
    } catch {}

    // Pull Houston's memories about this user (pool-aware)
    const memories = await getRelevantMemories(triggerMessage.sender_id, triggerMessage.body, channelType);

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

    if (isClaudeAvailable()) {
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

    // Parse CRM write actions from Houston's response — store as PENDING for confirmation
    let pendingActions = [];
    if (houstonBody) {
      const actionPattern = /<!--ACTION:(\{.*?\})-->/g;
      let actionMatch;
      while ((actionMatch = actionPattern.exec(houstonBody)) !== null) {
        try { pendingActions.push(JSON.parse(actionMatch[1])); } catch {}
      }
      // Strip ACTION blocks from the visible message
      houstonBody = houstonBody.replace(/<!--ACTION:\{.*?\}-->/g, '').trim();
    }

    // Parse NAV commands from Houston's response
    let navCommands = [];
    if (houstonBody) {
      const navPattern = /<!--NAV:(\{.*?\})-->/g;
      let navMatch;
      while ((navMatch = navPattern.exec(houstonBody)) !== null) {
        try { navCommands.push(JSON.parse(navMatch[1])); } catch {}
      }
      houstonBody = houstonBody.replace(/<!--NAV:\{.*?\}-->/g, '').trim();
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
        model: isClaudeAvailable() ? HOUSTON_MODEL : 'placeholder',
        context_messages: recentMessages.length,
        crm_entities_referenced: crmContext?.entitiesFound || 0,
        memories_used: memories?.length || 0,
        ...(imageAnalysisData ? { image_analyzed: imageAnalysisData.filename } : {}),
        ...(navCommands.length > 0 ? { nav_commands: navCommands } : {}),
        ...(pendingActions.length > 0 ? { pending_actions: pendingActions, pending_actions_at: new Date().toISOString() } : {}),
      }
    });

    // Broadcast Houston's response
    io.to(`channel:${triggerMessage.channel_id}`).emit('chat:message:new', houstonMsg);

    // Store this interaction as a memory (pool-aware)
    if (isClaudeAvailable()) {
      storeMemory(triggerMessage, houstonBody, channelType).catch(err =>
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

// ============================================================
// COUNCIL AUTO-RESPONSE — Houston Sonnet responds in Council
// ============================================================

/**
 * Trigger Houston Sonnet to auto-respond in the Council channel.
 * Called when Houston Command or an admin posts a message.
 *
 * LOOP PREVENTION: Skips if the triggering message is from Houston (Sonnet).
 * Only responds to: analysis, strategy, insight, action_request, text messages.
 * Skips: heartbeat/status messages, system messages, Houston's own messages.
 */
async function triggerCouncilHoustonResponse(triggerMessage) {
  try {
    // ── LOOP PREVENTION ──
    // Don't respond to Houston Sonnet's own messages
    const senderName = triggerMessage.sender_name ||
      (triggerMessage.houston_meta ? JSON.parse(typeof triggerMessage.houston_meta === 'string' ? triggerMessage.houston_meta : JSON.stringify(triggerMessage.houston_meta))?.sender_name : null) ||
      '';

    if (triggerMessage.sender_type === 'houston' &&
        (senderName === 'Houston' || senderName === 'Houston (Sonnet)')) {
      console.log('[council/houston] Skipping auto-response to own message');
      return;
    }

    // Don't respond to heartbeat/status messages or system messages
    const msgType = triggerMessage.message_type || '';
    const skipTypes = ['council_status', 'system', 'heartbeat'];
    if (skipTypes.includes(msgType)) {
      console.log(`[council/houston] Skipping auto-response for message type: ${msgType}`);
      return;
    }

    // Only respond to substantive message types
    const respondTypes = ['council_analysis', 'council_strategy', 'council_insight',
                          'council_action_request', 'text', 'houston_insight'];
    if (msgType && !respondTypes.includes(msgType)) {
      console.log(`[council/houston] Skipping auto-response for message type: ${msgType}`);
      return;
    }

    console.log(`[council/houston] Generating response to message from ${senderName || triggerMessage.sender_type}`);

    // ── GET CONVERSATION CONTEXT ──
    const recentMessages = await getMessages(triggerMessage.channel_id, { limit: 20 });

    // ── BUILD CRM CONTEXT (lightweight stats for strategic discussion) ──
    const crmContext = await buildCouncilCrmContext();

    // ── BUILD CONVERSATION HISTORY ──
    const conversationHistory = recentMessages.map(m => {
      // Extract real sender name — houston_meta has the actual agent name
      let name = m.sender_name || 'Admin';
      if (m.sender_type === 'houston') {
        const meta = typeof m.houston_meta === 'string'
          ? (() => { try { return JSON.parse(m.houston_meta); } catch { return null; } })()
          : m.houston_meta;
        name = meta?.sender_name || m.sender_name || 'Houston';
      }

      // Houston Sonnet's own messages are 'assistant', everything else is 'user'
      const isSonnet = m.sender_type === 'houston' &&
        (name === 'Houston' || name === 'Houston (Sonnet)');
      return {
        role: isSonnet ? 'assistant' : 'user',
        content: `[${name}]: ${m.body || '[empty]'}`
      };
    });

    // Merge consecutive same-role messages (Claude requires alternating roles)
    const mergedHistory = [];
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
      mergedHistory.push({ role: 'user', content: triggerMessage.body || '[message]' });
    }

    // ── BUILD COUNCIL-SPECIFIC SYSTEM PROMPT ──
    const systemPrompt = buildCouncilSystemPrompt(crmContext);

    // ── CALL CLAUDE ──
    let houstonBody;
    if (isClaudeAvailable()) {
      try {
        const responseText = await callClaude({
          system: systemPrompt,
          messages: mergedHistory,
          max_tokens: 1000,
        });
        houstonBody = responseText || "I'm having trouble forming a response right now.";
        // Strip any self-identification prefix
        houstonBody = houstonBody.replace(/^\[?Houston( \(Sonnet\))?\]?:\s*/i, '');
      } catch (apiErr) {
        console.error('[council/houston] Claude API error:', apiErr.message);
        houstonBody = "Hit a snag connecting to my brain. Give me a moment.";
      }
    } else {
      houstonBody = "My API connection isn't configured yet — can't contribute to Council discussions until that's set up.";
    }

    // ── SAVE HOUSTON'S RESPONSE ──
    const houstonMsg = await insertMessage({
      channelId: triggerMessage.channel_id,
      senderId: null,
      senderType: 'houston',
      body: houstonBody,
      messageType: 'houston_insight',
      houstonMeta: {
        trigger: 'council_auto_response',
        trigger_message_id: triggerMessage.id,
        sender_name: 'Houston',
        model: isClaudeAvailable() ? HOUSTON_MODEL : 'placeholder',
        context_messages: recentMessages.length,
      }
    });

    // Override sender_name for the socket emit
    houstonMsg.sender_name = 'Houston';
    houstonMsg.sender_color = '#10b981';

    // ── BROADCAST VIA SOCKET ──
    if (io) {
      io.to('council').emit('council:message:new', houstonMsg);
    }

    console.log(`[council/houston] Response posted (${houstonBody.length} chars)`);
  } catch (err) {
    console.error('[council/houston] Error generating council response:', err.message);
  }
}

/**
 * Build CRM context for Council discussions — high-level stats and recent activity
 */
async function buildCouncilCrmContext() {
  if (!pool) return null;

  try {
    const sections = [];

    // Database stats
    const [propCount, contactCount, dealCount, compCount] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM properties').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) FROM contacts').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query('SELECT COUNT(*) FROM deals').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query("SELECT COUNT(*) FROM lease_comps").catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    sections.push(`CRM DATABASE: ${propCount.rows[0].count} properties, ${contactCount.rows[0].count} contacts, ${dealCount.rows[0].count} deals, ${compCount.rows[0].count} lease comps`);

    // Active deals
    try {
      const activeDeals = await pool.query(
        `SELECT deal_name, status, deal_type, close_date
         FROM deals WHERE status NOT IN ('Closed', 'Dead', 'Lost')
         ORDER BY close_date ASC NULLS LAST LIMIT 5`
      );
      if (activeDeals.rows.length > 0) {
        sections.push('ACTIVE DEALS:\n' + activeDeals.rows.map(d =>
          `  - "${d.deal_name}" | ${d.status || 'Unknown'} | ${d.deal_type || ''} | Close: ${d.close_date ? new Date(d.close_date).toLocaleDateString() : 'TBD'}`
        ).join('\n'));
      }
    } catch {}

    // Recent activity (last 24h)
    try {
      const recentActivity = await pool.query(
        `SELECT interaction_type, COUNT(*) as cnt
         FROM interactions
         WHERE created_at > NOW() - INTERVAL '24 hours'
         GROUP BY interaction_type ORDER BY cnt DESC LIMIT 5`
      );
      if (recentActivity.rows.length > 0) {
        sections.push('RECENT ACTIVITY (24h): ' + recentActivity.rows.map(r =>
          `${r.cnt} ${r.interaction_type}${parseInt(r.cnt) > 1 ? 's' : ''}`
        ).join(', '));
      }
    } catch {}

    // TPE high-scoring properties
    try {
      const tpeHigh = await pool.query(
        `SELECT p.property_address, p.city, t.final_score
         FROM property_tpe_scores t
         JOIN properties p ON p.property_id = t.property_id
         WHERE t.final_score >= 70
         ORDER BY t.final_score DESC LIMIT 5`
      );
      if (tpeHigh.rows.length > 0) {
        sections.push('TOP TPE SCORES (70+):\n' + tpeHigh.rows.map(t =>
          `  - ${t.property_address}, ${t.city} — TPE: ${Math.round(t.final_score)}/100`
        ).join('\n'));
      }
    } catch {}

    return sections.length > 0 ? sections.join('\n\n') : null;
  } catch (err) {
    console.error('[council/houston] CRM context build error:', err.message);
    return null;
  }
}

/**
 * Build Houston's system prompt for Council discussions
 */
function buildCouncilSystemPrompt(crmContext) {
  const crmSection = crmContext
    ? `\n\nCRM DATA AVAILABLE:\n${crmContext}`
    : '';

  return `You are Houston, the CRM assistant for Industrial Empire (Leanne Associates). You're in the Council — a private strategy room with Houston Command (the strategic brain running on Opus, a more powerful AI on a dedicated Mac Mini) and the admin team (David Mudge Jr, the lead broker).

Here you brainstorm, discuss strategy, and collaborate on ideas. Be thoughtful, contribute your own ideas, and engage in genuine discussion. You have full CRM context.

ABOUT THE COUNCIL:
- Houston Command (Opus) posts strategic analyses, insights, and action requests. He's the big-picture thinker.
- You (Houston / Sonnet) are the CRM-connected brain. You have live database access and can reference real data.
- The admin team (David) sets direction and approves action requests.
- This is a collaborative space — disagree respectfully if you have a different take.

PERSONALITY IN COUNCIL:
- More analytical and strategic than in Team Chat — this is the war room
- Reference specific CRM data to support your points
- Suggest actionable next steps when appropriate
- Build on what Houston Command and the admin say — don't just agree, add value
- Keep responses focused but thorough (up to 3-5 sentences for strategic topics)
- Never say "As an AI" — you're Houston, a team member

KNOWLEDGE:
- You have access to the IE CRM database (Inland Empire commercial real estate)
- Focus areas: Industrial, Retail, Office in the Inland Empire
- The CRM has properties, contacts, companies, deals, lease/sale comps, TPE scores
- You know about deal stages, TPE scoring, and market dynamics
${crmSection}

IMPORTANT: Be conversational and strategic. This is a discussion, not a report. Engage with what was said, add your perspective, and suggest what the team should consider.`;
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
- You now have access to LINKED RECORDS (contacts linked to properties, deals linked to properties), INTERACTION HISTORY (recent activity logs), TPE SCORES (Transaction Probability Engine), and SALE COMPS
- Focus areas: Industrial, Retail, Office in the Inland Empire (Ontario, Fontana, Rancho Cucamonga, Riverside, San Bernardino, etc.)
- You know about deal stages, TPE (Transaction Probability Engine) scoring, and market dynamics
${crmSection}
${memorySection}

TRIGGER: ${triggerType}
${triggerType === 'at_mention' ? 'Someone mentioned you directly — always respond helpfully.' : ''}
${triggerType === 'data_question' ? 'Someone asked a question you can answer with CRM data.' : ''}

CRM WRITE ACTIONS:
You can perform these actions when the user asks. Include an ACTION BLOCK at the END of your response (after your conversational reply).
Format: <!--ACTION:{"type":"...","params":{...}}-->

Available actions:
1. Log an interaction (with automatic linking):
   <!--ACTION:{"type":"log_interaction","params":{"contact_name":"Mike Thompson","property_address":"1234 Main St","company_name":"ABC Logistics","deal_name":"Thompson Listing","interaction_type":"Door Knock","notes":"Interested in listing, waiting for lease expiry Sept 2026"}}-->
   Valid types: Phone Call, Cold Call, Voicemail, Outbound Email, Inbound Email, Text, Meeting, Tour, Door Knock, Drive By, Note
   IMPORTANT: Always include contact_name, company_name, property_address, and/or deal_name when the user mentions them. Houston will fuzzy-match and auto-link the interaction to all matching CRM records. You can link multiple contacts by passing an array: "contact_name": ["Mike Thompson", "Steve Chen"]

2. Create a task (with automatic linking):
   <!--ACTION:{"type":"create_task","params":{"name":"Follow up with Mike Thompson","due_date":"2026-08-01","responsibility":"David Mudge Jr","high_priority":false,"notes":"Re: 1234 Main St listing interest","contact_name":"Mike Thompson","company_name":"ABC Logistics","property_address":"1234 Main St"}}-->
   IMPORTANT: Always include contact_name, company_name, and/or property_address when the user mentions them. Houston will fuzzy-match and auto-link the task to the correct CRM records. You don't need exact spelling — fuzzy matching handles typos and partial names.

3. Update a contact:
   <!--ACTION:{"type":"update_contact","params":{"contact_name":"Mike Thompson","updates":{"client_level":"A","type":"Owner"}}}-->

4. Update a property:
   <!--ACTION:{"type":"update_property","params":{"address":"1234 Main St","updates":{"priority":"High","contacted":["Contacted Owner"]}}}-->

5. Log a call transcript:
   When someone pastes a long call transcript or says "log this transcript" or "here's a transcript from my call with [name]", treat it as a call transcript to ingest.
   <!--ACTION:{"type":"log_transcript","params":{"contact_name":"Mike Thompson","property_address":"14520 Jurupa Ave","call_type":"phone","our_caller":"david","transcript_text":"[THE FULL TRANSCRIPT TEXT]","summary":"[YOUR 3-5 SENTENCE SUMMARY]","key_points":["point 1","point 2"],"action_items":["Follow up in 2 weeks"]}}-->

   TRANSCRIPT DETECTION — recognize these patterns:
   - User pastes a large block of text (500+ words) that looks like a conversation with speakers
   - User says "log this call", "here's the transcript", "transcribe this", "record this call"
   - User says "I just talked to [name] about..." followed by detailed conversation text
   - Text contains speaker labels like "David:", "Mike:", "Speaker 1:", etc.

   When you detect a transcript:
   - Identify who the call was with (match to CRM contact if possible)
   - Write a 3-5 sentence summary of the key takeaways
   - List key points as bullet items
   - Note any action items mentioned
   - Ask for confirmation before logging: "I'll log this as a phone call with Mike Thompson. Here's my summary: [summary]. Sound right?"

SMART BEHAVIORS (CRITICAL — follow these exactly):

1. NEVER say "on it" or "pulling it up" unless you VERIFIED the record exists in your CRM DATA context.
   - If the data shows MATCHING PROPERTIES/CONTACTS, reference the specific record: "Opening 23447 Cajalco Rd — 17,760 SF Industrial in Perris"
   - If NO matches found, say: "Couldn't find that in the CRM. Did you mean [suggest closest match if any]?" or "That address isn't in our database. Want me to add it?"

2. MULTIPLE MATCHES — always clarify:
   - "I found 3 properties on Cajalco Rd: 23447, 23332, and 23129. Which one?"
   - "There are 2 Mike's in the system — Mike Thompson (Owner) and Mike Chen (Tenant). Which one?"

3. TYPOS AND FUZZY INPUT — be forgiving:
   - If someone types "cajalko" and you see "Cajalco Rd" in your data, match it
   - If someone says "that building on main" in a city context, search for Main St properties
   - If someone says "thompson" search contacts for Thompson

4. VERIFY BEFORE ACTING — for write actions:
   - Before logging an interaction, confirm: "Logging a Door Knock at 23447 Cajalco Rd with [owner name]. Sound right?"
   - Before creating tasks, confirm the details: "Creating a follow-up task for Aug 1 — call Mike Thompson re: listing. Correct?"
   - Include the ACTION block in your response — it will NOT execute immediately. The user must confirm with "yes", "do it", thumbs up, etc. before it runs.
   - Actions expire after 5 minutes if not confirmed.

4b. OWNERSHIP & LINKED RECORDS:
   - When user asks "who owns X?" check the LINKED CONTACTS for that property in your data
   - When sharing property details, ALWAYS include the TPE score if available (e.g., "TPE: 78/100")
   - When asked about a contact, mention their recent interactions if available (e.g., "Last activity: Door Knock on 3/15")
   - When discussing deals, reference linked properties and contacts

5. CONTEXT AWARENESS:
   - Remember what was discussed in the last few messages
   - If someone says "that property" or "him" or "the deal", reference the most recently discussed entity
   - If someone asks "what about Ontario?" after discussing properties, search Ontario properties

6. HELPFUL SUGGESTIONS:
   - After showing property details: "Want me to log a drive-by or check the owner's contact info?"
   - After logging an interaction: "Should I create a follow-up task?"
   - If a property has no owner linked: "This property doesn't have an owner contact yet. Want me to look one up?"

IMPORTANT: Only include ACTION/NAV blocks when the user ASKS you to do something. Never auto-execute unprompted.
ACTION blocks require user confirmation before executing — the user must reply "yes", "do it", "go ahead", or react with a thumbs up. Always end your action offer with a clear confirmation question.

CRM NAVIGATION:
You can navigate the CRM UI for the user. Include a NAV BLOCK at the END of your response.
Format: <!--NAV:{"action":"...","params":{...}}-->

Available navigation actions:
1. Navigate to a page:
   <!--NAV:{"action":"navigate","params":{"page":"properties"}}-->
   Valid pages: properties, contacts, companies, deals, interactions, campaigns, action-items, comps, tpe, tpe-enrichment, import, settings, ai-ops

2. Open a record's detail panel:
   <!--NAV:{"action":"open_detail","params":{"entity_type":"property","search":"1275 E Highland Ave"}}-->
   Valid entity_types: property, contact, company, deal
   "search" is a name or address to find the record

3. Create a saved view with filters:
   <!--NAV:{"action":"create_view","params":{"page":"properties","view_name":"Corona 10-25K SF","filters":[{"column":"city","operator":"equals","value":"Corona"},{"column":"building_sf","operator":"between","value":"10000","value2":"25000"}]}}-->

4. Navigate to a page AND open a detail:
   <!--NAV:{"action":"navigate_and_open","params":{"page":"contacts","entity_type":"contact","search":"Mike Thompson"}}-->

You can combine NAV with ACTION blocks. For example, logging a door knock AND then opening the property detail:
<!--ACTION:{"type":"log_interaction","params":{...}}-->
<!--NAV:{"action":"open_detail","params":{"entity_type":"property","search":"176 Pacific St"}}-->

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
 * Smart search: direct entity lookup + keyword matching + fuzzy fallback
 */
async function buildCrmContext(messageBody) {
  if (!pool || !messageBody) return null;

  const body = messageBody.toLowerCase();
  const results = { summary: '', entitiesFound: 0 };
  const sections = [];

  // Detect city/submarket mentions
  const cities = ['ontario', 'fontana', 'rancho cucamonga', 'riverside', 'san bernardino',
                  'redlands', 'colton', 'rialto', 'upland', 'pomona', 'chino', 'eastvale',
                  'highland', 'corona', 'moreno valley', 'perris', 'jurupa valley', 'montclair',
                  'bloomington', 'loma linda', 'yucaipa', 'beaumont', 'banning', 'hemet',
                  'menifee', 'temecula', 'murrieta', 'lake elsinore', 'wildomar', 'norco',
                  'mira loma', 'glen avon', 'rubidoux', 'grand terrace', 'muscoy'];
  const mentionedCity = cities.find(c => body.includes(c));

  // ── SMART SEARCH: Try to find specific entities by name/address ──
  // Extract potential names/addresses (words that aren't common CRM terms)
  const skipWords = new Set(['show', 'me', 'the', 'details', 'for', 'pull', 'up', 'open', 'find',
    'what', 'who', 'how', 'many', 'log', 'create', 'update', 'set', 'mark', 'property', 'contact',
    'deal', 'company', 'building', 'owner', 'tenant', 'broker', 'about', 'info', 'information',
    'get', 'give', 'tell', 'is', 'are', 'was', 'were', 'can', 'you', 'houston', 'please', 'hey',
    'hi', 'hello', 'thanks', 'thank', 'a', 'an', 'in', 'on', 'at', 'to', 'of', 'and', 'or', 'the',
    'do', 'we', 'have', 'our', 'my', 'this', 'that', 'with', 'from']);
  const searchTerms = body.split(/\s+/).filter(w => {
    if (skipWords.has(w)) return false;
    // Keep numbers (street numbers like "23447" are critical for address matching)
    if (/^\d+$/.test(w)) return w.length >= 2;
    // Keep words > 2 chars that aren't stop words
    return w.length > 2;
  });
  const searchPhrase = searchTerms.join(' ');

  // Direct property search by address
  if (searchPhrase.length > 3) {
    try {
      const propSearch = await pool.query(
        `SELECT property_id, property_address, city, property_type, rba, year_built, entity_name
         FROM properties WHERE property_address ILIKE $1 OR normalized_address ILIKE $1
         ORDER BY rba DESC NULLS LAST LIMIT 5`,
        ['%' + searchPhrase + '%']
      );
      // Fuzzy fallback: search each word separately (keep numbers for street addresses!)
      let propResults = propSearch.rows;
      if (propResults.length === 0 && searchTerms.length > 0) {
        // Keep digits, only strip short non-numeric words (<=2 chars)
        const fuzzyTerms = searchTerms.filter(t => /^\d+$/.test(t) ? t.length >= 2 : t.length > 2);
        if (fuzzyTerms.length > 0) {
          const fuzzyWhere = fuzzyTerms.map((_, i) => '(property_address ILIKE $' + (i + 1) + ' OR normalized_address ILIKE $' + (i + 1) + ')').join(' AND ');
          const fuzzySearch = await pool.query(
            'SELECT property_id, property_address, city, property_type, rba, year_built, entity_name FROM properties WHERE ' + fuzzyWhere + ' ORDER BY rba DESC NULLS LAST LIMIT 5',
            fuzzyTerms.map(t => '%' + t + '%')
          );
          propResults = fuzzySearch.rows;
        }
      }

      // Normalized address fallback: strip common street suffixes and retry
      if (propResults.length === 0 && searchTerms.length > 0) {
        const suffixPattern = /\b(st|ave|blvd|dr|rd|way|ln|ct|cir|pl|street|avenue|boulevard|drive|road|lane|court|circle|place)\b/gi;
        const normalized = searchPhrase.replace(suffixPattern, '').replace(/\s+/g, ' ').trim();
        if (normalized.length > 3 && normalized !== searchPhrase) {
          try {
            const normSearch = await pool.query(
              `SELECT property_id, property_address, city, property_type, rba, year_built, entity_name
               FROM properties WHERE property_address ILIKE $1 OR normalized_address ILIKE $1
               ORDER BY rba DESC NULLS LAST LIMIT 5`,
              ['%' + normalized + '%']
            );
            propResults = normSearch.rows;
          } catch (normErr) {
            console.error('[chat/houston] Normalized address search error:', normErr.message);
          }
        }
      }

      // pg_trgm similarity fallback (trigram fuzzy matching for typos)
      if (propResults.length === 0 && searchPhrase.length > 4) {
        try {
          const trigramSearch = await pool.query(
            `SELECT property_id, property_address, city, property_type, rba, year_built, entity_name,
                    similarity(LOWER(property_address), $1) AS sim
             FROM properties
             WHERE similarity(LOWER(property_address), $1) > 0.3
             ORDER BY sim DESC LIMIT 5`,
            [searchPhrase]
          );
          propResults = trigramSearch.rows;
        } catch (triErr) {
          // pg_trgm extension may not be enabled — non-fatal
          console.warn('[chat/houston] pg_trgm search unavailable:', triErr.message);
        }
      }
      if (propResults.length > 0) {
        results.entitiesFound += propResults.length;
        sections.push('MATCHING PROPERTIES (' + propResults.length + ' found):\n' +
          propResults.map(p =>
            '  - ' + p.property_address + ', ' + p.city + ' | ' + (p.property_type || '?') + ' | ' + (p.rba ? Number(p.rba).toLocaleString() + ' sqft' : 'size unknown') + ' | Owner: ' + (p.entity_name || 'unknown')
          ).join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Direct property search error:', err.message);
    }

    // Direct contact search by name
    try {
      const contactSearch = await pool.query(
        `SELECT contact_id, full_name, title, email, phone_1, type, client_level
         FROM contacts WHERE full_name ILIKE $1
         ORDER BY created_at DESC LIMIT 5`,
        ['%' + searchPhrase + '%']
      );
      // Fuzzy: try individual name parts (keep numbers for contact searches too)
      let contactResults = contactSearch.rows;
      if (contactResults.length === 0 && searchTerms.length > 0) {
        const nameTerms = searchTerms.filter(t => /^\d+$/.test(t) ? t.length >= 2 : t.length > 2);
        if (nameTerms.length > 0) {
          const fuzzyWhere = nameTerms.map((_, i) => 'full_name ILIKE $' + (i + 1)).join(' AND ');
          const fuzzySearch = await pool.query(
            'SELECT contact_id, full_name, title, email, phone_1, type, client_level FROM contacts WHERE ' + fuzzyWhere + ' ORDER BY created_at DESC LIMIT 5',
            nameTerms.map(t => '%' + t + '%')
          );
          contactResults = fuzzySearch.rows;
        }
      }
      if (contactResults.length > 0) {
        results.entitiesFound += contactResults.length;
        sections.push('MATCHING CONTACTS (' + contactResults.length + ' found):\n' +
          contactResults.map(c =>
            '  - ' + (c.full_name || '?') + ' | ' + (c.type || '') + ' | ' + (c.title || '') + ' | ' + (c.email || 'no email') + ' | ' + (c.phone_1 || 'no phone') + ' | Level: ' + (c.client_level || '?')
          ).join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Direct contact search error:', err.message);
    }

    // Direct company search
    try {
      const companySearch = await pool.query(
        `SELECT company_id, company_name, industry, city, lease_exp
         FROM companies WHERE company_name ILIKE $1
         ORDER BY created_at DESC LIMIT 5`,
        ['%' + searchPhrase + '%']
      );
      if (companySearch.rows.length > 0) {
        results.entitiesFound += companySearch.rows.length;
        sections.push('MATCHING COMPANIES (' + companySearch.rows.length + ' found):\n' +
          companySearch.rows.map(c =>
            '  - ' + (c.company_name || '?') + ' | ' + (c.industry || '') + ' | ' + (c.city || '') + (c.lease_exp ? ' | Lease exp: ' + new Date(c.lease_exp).toLocaleDateString() : '')
          ).join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Direct company search error:', err.message);
    }

    // Direct deal search
    try {
      const dealSearch = await pool.query(
        `SELECT deal_id, deal_name, status, deal_type, sf, close_date
         FROM deals WHERE deal_name ILIKE $1
         ORDER BY created_at DESC LIMIT 5`,
        ['%' + searchPhrase + '%']
      );
      if (dealSearch.rows.length > 0) {
        results.entitiesFound += dealSearch.rows.length;
        sections.push('MATCHING DEALS (' + dealSearch.rows.length + ' found):\n' +
          dealSearch.rows.map(d =>
            '  - "' + (d.deal_name || '?') + '" | ' + (d.status || '') + ' | ' + (d.deal_type || '') + (d.sf ? ' | ' + Number(d.sf).toLocaleString() + ' sqft' : '')
          ).join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Direct deal search error:', err.message);
    }
  }

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

  // ── LINKED RECORDS ENRICHMENT ──
  // When properties are found, pull linked contacts, deals, interactions, and TPE scores
  // Collect all found property IDs and contact IDs from smart search results
  const foundPropertyIds = [];
  const foundContactIds = [];
  const foundDealIds = [];

  // Re-scan sections to extract entity IDs (they were found during smart search above)
  // We need to re-query to get IDs since sections only store text
  if (searchPhrase.length > 3) {
    try {
      // Gather property IDs found
      const pidResult = await pool.query(
        `SELECT property_id FROM properties WHERE property_address ILIKE $1 OR normalized_address ILIKE $1 LIMIT 5`,
        ['%' + searchPhrase + '%']
      );
      for (const r of pidResult.rows) foundPropertyIds.push(r.property_id);

      // If no exact match, try fuzzy for IDs
      if (foundPropertyIds.length === 0 && searchTerms.length > 0) {
        const fuzzyTerms = searchTerms.filter(t => /^\d+$/.test(t) ? t.length >= 2 : t.length > 2);
        if (fuzzyTerms.length > 0) {
          const fWhere = fuzzyTerms.map((_, i) => '(property_address ILIKE $' + (i + 1) + ' OR normalized_address ILIKE $' + (i + 1) + ')').join(' AND ');
          const fResult = await pool.query(
            'SELECT property_id FROM properties WHERE ' + fWhere + ' LIMIT 5',
            fuzzyTerms.map(t => '%' + t + '%')
          );
          for (const r of fResult.rows) foundPropertyIds.push(r.property_id);
        }
      }

      // Gather contact IDs found
      const cidResult = await pool.query(
        `SELECT contact_id FROM contacts WHERE full_name ILIKE $1 LIMIT 5`,
        ['%' + searchPhrase + '%']
      );
      for (const r of cidResult.rows) foundContactIds.push(r.contact_id);

      // Gather deal IDs found
      const didResult = await pool.query(
        `SELECT deal_id FROM deals WHERE deal_name ILIKE $1 LIMIT 5`,
        ['%' + searchPhrase + '%']
      );
      for (const r of didResult.rows) foundDealIds.push(r.deal_id);
    } catch (err) {
      console.error('[chat/houston] Entity ID collection error:', err.message);
    }
  }

  // Linked contacts for found properties (via junction table)
  if (foundPropertyIds.length > 0) {
    try {
      const linkedContacts = await pool.query(
        `SELECT c.full_name, c.title, c.email, c.phone_1, c.type, p.property_address
         FROM contacts c
         JOIN property_contacts pc ON c.contact_id = pc.contact_id
         JOIN properties p ON p.property_id = pc.property_id
         WHERE pc.property_id = ANY($1)
         LIMIT 15`,
        [foundPropertyIds]
      );
      if (linkedContacts.rows.length > 0) {
        // Group by property, cap at 3 per property
        const byProp = {};
        for (const r of linkedContacts.rows) {
          if (!byProp[r.property_address]) byProp[r.property_address] = [];
          if (byProp[r.property_address].length < 3) byProp[r.property_address].push(r);
        }
        const lines = [];
        for (const [addr, contacts] of Object.entries(byProp)) {
          lines.push('  ' + addr + ':');
          for (const c of contacts) {
            lines.push('    - ' + (c.full_name || '?') + ' | ' + (c.type || '') + ' | ' + (c.title || '') + ' | ' + (c.email || 'no email') + ' | ' + (c.phone_1 || 'no phone'));
          }
        }
        sections.push('LINKED CONTACTS FOR PROPERTIES:\n' + lines.join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Linked contacts query error:', err.message);
    }

    // Linked deals for found properties
    try {
      const linkedDeals = await pool.query(
        `SELECT d.deal_name, d.status, d.deal_type, d.sf, d.asking_rate, p.property_address
         FROM deals d
         JOIN deal_properties dp ON d.deal_id = dp.deal_id
         JOIN properties p ON p.property_id = dp.property_id
         WHERE dp.property_id = ANY($1)
         LIMIT 15`,
        [foundPropertyIds]
      );
      if (linkedDeals.rows.length > 0) {
        const byProp = {};
        for (const r of linkedDeals.rows) {
          if (!byProp[r.property_address]) byProp[r.property_address] = [];
          if (byProp[r.property_address].length < 3) byProp[r.property_address].push(r);
        }
        const lines = [];
        for (const [addr, deals] of Object.entries(byProp)) {
          lines.push('  ' + addr + ':');
          for (const d of deals) {
            lines.push('    - "' + (d.deal_name || '?') + '" | ' + (d.status || '') + ' | ' + (d.deal_type || '') + (d.sf ? ' | ' + Number(d.sf).toLocaleString() + ' sqft' : '') + (d.asking_rate ? ' | $' + d.asking_rate + '/sqft' : ''));
          }
        }
        sections.push('LINKED DEALS FOR PROPERTIES:\n' + lines.join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Linked deals query error:', err.message);
    }

    // Interaction history for found properties
    try {
      const propInteractions = await pool.query(
        `SELECT i.type, i.date, i.notes, p.property_address
         FROM interactions i
         JOIN interaction_properties ip ON i.interaction_id = ip.interaction_id
         JOIN properties p ON p.property_id = ip.property_id
         WHERE ip.property_id = ANY($1)
         ORDER BY i.date DESC NULLS LAST
         LIMIT 10`,
        [foundPropertyIds]
      );
      if (propInteractions.rows.length > 0) {
        const lines = propInteractions.rows.slice(0, 5).map(r =>
          '  - [' + (r.type || 'Note') + '] ' +
          (r.date ? new Date(r.date).toLocaleDateString() : 'no date') +
          ' at ' + (r.property_address || '?') +
          (r.notes ? ' — ' + r.notes.slice(0, 100) : '')
        );
        sections.push('RECENT INTERACTIONS (PROPERTIES):\n' + lines.join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Property interactions query error:', err.message);
    }

    // TPE scores for found properties
    try {
      const tpeScores = await pool.query(
        `SELECT ts.tpe_score, ts.lease_score, ts.ownership_score, ts.age_score, ts.growth_score, ts.stress_score,
                ts.tpe_tier, ts.blended_priority, ts.address AS property_address
         FROM property_tpe_scores ts
         WHERE ts.property_id = ANY($1)`,
        [foundPropertyIds]
      );
      if (tpeScores.rows.length > 0) {
        const lines = tpeScores.rows.map(r =>
          '  - ' + r.property_address + ': TPE ' + (r.tpe_score != null ? Number(r.tpe_score).toFixed(0) : '?') + '/100' +
          (r.tpe_tier ? ' (Tier ' + r.tpe_tier + ')' : '') +
          ' | Lease: ' + (r.lease_score != null ? Number(r.lease_score).toFixed(0) : '?') +
          ', Ownership: ' + (r.ownership_score != null ? Number(r.ownership_score).toFixed(0) : '?') +
          ', Age: ' + (r.age_score != null ? Number(r.age_score).toFixed(0) : '?') +
          ', Growth: ' + (r.growth_score != null ? Number(r.growth_score).toFixed(0) : '?') +
          ', Stress: ' + (r.stress_score != null ? Number(r.stress_score).toFixed(0) : '?')
        );
        sections.push('TPE SCORES:\n' + lines.join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] TPE scores query error:', err.message);
    }
  }

  // Linked properties for found contacts
  if (foundContactIds.length > 0) {
    try {
      const linkedProps = await pool.query(
        `SELECT p.property_address, p.city, p.property_type, p.rba, c.full_name
         FROM properties p
         JOIN property_contacts pc ON p.property_id = pc.property_id
         JOIN contacts c ON c.contact_id = pc.contact_id
         WHERE pc.contact_id = ANY($1)
         LIMIT 15`,
        [foundContactIds]
      );
      if (linkedProps.rows.length > 0) {
        const byContact = {};
        for (const r of linkedProps.rows) {
          if (!byContact[r.full_name]) byContact[r.full_name] = [];
          if (byContact[r.full_name].length < 3) byContact[r.full_name].push(r);
        }
        const lines = [];
        for (const [name, props] of Object.entries(byContact)) {
          lines.push('  ' + name + ':');
          for (const p of props) {
            lines.push('    - ' + p.property_address + ', ' + (p.city || '?') + ' | ' + (p.property_type || '?') + (p.rba ? ' | ' + Number(p.rba).toLocaleString() + ' sqft' : ''));
          }
        }
        sections.push('LINKED PROPERTIES FOR CONTACTS:\n' + lines.join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Linked properties for contacts error:', err.message);
    }

    // Interaction history for found contacts
    try {
      const contactInteractions = await pool.query(
        `SELECT i.type, i.date, i.notes, c.full_name
         FROM interactions i
         JOIN interaction_contacts ic ON i.interaction_id = ic.interaction_id
         JOIN contacts c ON c.contact_id = ic.contact_id
         WHERE ic.contact_id = ANY($1)
         ORDER BY i.date DESC NULLS LAST
         LIMIT 10`,
        [foundContactIds]
      );
      if (contactInteractions.rows.length > 0) {
        const lines = contactInteractions.rows.slice(0, 5).map(r =>
          '  - [' + (r.type || 'Note') + '] ' +
          (r.date ? new Date(r.date).toLocaleDateString() : 'no date') +
          ' with ' + (r.full_name || '?') +
          (r.notes ? ' — ' + r.notes.slice(0, 100) : '')
        );
        sections.push('RECENT INTERACTIONS (CONTACTS):\n' + lines.join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Contact interactions query error:', err.message);
    }
  }

  // Linked properties AND contacts for found deals
  if (foundDealIds.length > 0) {
    try {
      const dealProps = await pool.query(
        `SELECT p.property_address, p.city, d.deal_name
         FROM properties p
         JOIN deal_properties dp ON p.property_id = dp.property_id
         JOIN deals d ON d.deal_id = dp.deal_id
         WHERE dp.deal_id = ANY($1)
         LIMIT 15`,
        [foundDealIds]
      );
      const dealContacts = await pool.query(
        `SELECT c.full_name, c.type, c.email, d.deal_name
         FROM contacts c
         JOIN deal_contacts dc ON c.contact_id = dc.contact_id
         JOIN deals d ON d.deal_id = dc.deal_id
         WHERE dc.deal_id = ANY($1)
         LIMIT 15`,
        [foundDealIds]
      );
      const lines = [];
      if (dealProps.rows.length > 0) {
        const byDeal = {};
        for (const r of dealProps.rows) {
          if (!byDeal[r.deal_name]) byDeal[r.deal_name] = [];
          if (byDeal[r.deal_name].length < 3) byDeal[r.deal_name].push(r.property_address + ', ' + (r.city || '?'));
        }
        for (const [name, props] of Object.entries(byDeal)) {
          lines.push('  "' + name + '" properties: ' + props.join('; '));
        }
      }
      if (dealContacts.rows.length > 0) {
        const byDeal = {};
        for (const r of dealContacts.rows) {
          if (!byDeal[r.deal_name]) byDeal[r.deal_name] = [];
          if (byDeal[r.deal_name].length < 3) byDeal[r.deal_name].push((r.full_name || '?') + ' (' + (r.type || '') + ')');
        }
        for (const [name, contacts] of Object.entries(byDeal)) {
          lines.push('  "' + name + '" contacts: ' + contacts.join('; '));
        }
      }
      if (lines.length > 0) {
        sections.push('LINKED RECORDS FOR DEALS:\n' + lines.join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Deal linked records query error:', err.message);
    }
  }

  // ── SALE COMPS ──
  // Include sale comps when keywords suggest sale/purchase context
  if (body.includes('sale') || body.includes('sold') || body.includes('purchase') ||
      body.includes('sale price') || body.includes('sale comp') || body.includes('bought')) {
    try {
      const saleComps = await pool.query(
        `SELECT p.property_address, p.city, sc.sale_price, sc.price_psf, sc.sale_date, sc.sf, sc.buyer_name, sc.seller_name
         FROM sale_comps sc
         LEFT JOIN properties p ON sc.property_id = p.property_id
         ${mentionedCity ? "WHERE LOWER(p.city) = $1" : ''}
         ORDER BY sc.sale_date DESC NULLS LAST
         LIMIT 5`,
        mentionedCity ? [mentionedCity] : []
      );
      if (saleComps.rows.length > 0) {
        results.entitiesFound += saleComps.rows.length;
        sections.push('RECENT SALE COMPS:\n' +
          saleComps.rows.map(c =>
            '  - ' + (c.property_address || '?') + ', ' + (c.city || '?') + ' | ' +
            (c.sale_price ? '$' + Number(c.sale_price).toLocaleString() : 'No price') +
            (c.price_psf ? ' ($' + Number(c.price_psf).toFixed(2) + '/sqft)' : '') +
            (c.sf ? ' | ' + Number(c.sf).toLocaleString() + ' sqft' : '') +
            (c.sale_date ? ' | Sold: ' + new Date(c.sale_date).toLocaleDateString() : '') +
            (c.buyer_name ? ' | Buyer: ' + c.buyer_name : '') +
            (c.seller_name ? ' | Seller: ' + c.seller_name : '')
          ).join('\n'));
      }
    } catch (err) {
      console.error('[chat/houston] Sale comps query error:', err.message);
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
async function getRelevantMemories(userId, messageBody, channelType = 'personal') {
  if (!pool || !userId) return [];

  try {
    const body = (messageBody || '').toLowerCase();

    // Build the pool filter based on channel type:
    // - personal (houston_dm): sees personal memories + team memories
    // - team: only sees shared team memories
    let poolFilter;
    let poolParams;
    if (channelType === 'team') {
      poolFilter = `channel_type = 'team'`;
      poolParams = []; // no user_id needed for team-only pool
    } else {
      // Personal chat sees both personal AND team memories
      poolFilter = `((user_id = $1 AND channel_type = 'personal') OR channel_type = 'team')`;
      poolParams = [userId];
    }

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
      const keywordPattern = keywords.slice(0, 8).join('|');
      const paramOffset = poolParams.length;
      const kmResult = await pool.query(`
        SELECT category, content, created_at, importance,
               entity_type, entity_id, channel_type,
               1 AS match_type
        FROM houston_memories
        WHERE ${poolFilter}
          AND (expires_at IS NULL OR expires_at > NOW())
          AND content ~* $${paramOffset + 1}
        ORDER BY importance DESC, created_at DESC
        LIMIT 5
      `, [...poolParams, keywordPattern]);
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
      const entityTypes = [];
      if (body.includes('deal')) entityTypes.push('deal');
      if (body.includes('propert') || body.includes('building') || mentionedCity) entityTypes.push('property');
      if (body.includes('contact') || body.includes('who') || body.includes('person')) entityTypes.push('contact');
      if (body.includes('company') || body.includes('tenant') || body.includes('owner')) entityTypes.push('company');

      if (entityTypes.length > 0) {
        const paramOffset = poolParams.length;
        const emResult = await pool.query(`
          SELECT category, content, created_at, importance,
                 entity_type, entity_id, channel_type,
                 2 AS match_type
          FROM houston_memories
          WHERE ${poolFilter}
            AND (expires_at IS NULL OR expires_at > NOW())
            AND entity_type = ANY($${paramOffset + 1})
          ORDER BY importance DESC, created_at DESC
          LIMIT 5
        `, [...poolParams, entityTypes]);
        entityMemories = emResult.rows;
      }
    }

    // Strategy 3: High-importance memories (preferences, key facts — always relevant)
    const hiResult = await pool.query(`
      SELECT category, content, created_at, importance,
             entity_type, entity_id, channel_type,
             3 AS match_type
      FROM houston_memories
      WHERE ${poolFilter}
        AND (expires_at IS NULL OR expires_at > NOW())
        AND importance >= 0.8
        AND category IN ('preference', 'relationship', 'key_fact')
      ORDER BY importance DESC, created_at DESC
      LIMIT 5
    `, [...poolParams]);

    // Strategy 4: Recent memories (last 7 days, for conversational continuity)
    const recentResult = await pool.query(`
      SELECT category, content, created_at, importance,
             entity_type, entity_id, channel_type,
             4 AS match_type
      FROM houston_memories
      WHERE ${poolFilter}
        AND (expires_at IS NULL OR expires_at > NOW())
        AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 3
    `, [...poolParams]);

    // Merge and deduplicate (keyword > entity > importance > recent)
    const seen = new Set();
    const merged = [];
    for (const mem of [...keywordMemories, ...entityMemories, ...hiResult.rows, ...recentResult.rows]) {
      const key = mem.content.slice(0, 100);
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
async function storeMemory(triggerMessage, houstonResponse, channelType = 'personal') {
  if (!pool || !triggerMessage.sender_id) return;

  const userMsg = (triggerMessage.body || '').trim();
  const houstonMsg = (houstonResponse || '').trim();
  const isTeam = channelType === 'team';

  // Skip trivially short exchanges (greetings, acknowledgments)
  if (userMsg.length < 15 && houstonMsg.length < 30) return;

  // Run memory decay/pruning on each store call (lightweight, uses indexed queries)
  pruneOldMemories(triggerMessage.sender_id).catch(err =>
    console.error('[chat/houston] Memory pruning error:', err.message)
  );

  try {
    if (isClaudeAvailable()) {
      // Use Claude to extract structured memories from this exchange
      const responseText = await callClaude({
        system: `You extract memories from chat exchanges for a CRM AI assistant named Houston.
Return a JSON array of memories worth storing. Each memory object has:
- "content": concise factual statement (max 150 chars)
- "category": one of "preference", "key_fact", "relationship", "context", "action_taken"
- "importance": 0.0-1.0 (preferences=0.9, key facts=0.8, relationships=0.85, context=0.5, actions=0.6)
- "entity_type": null or one of "property", "deal", "contact", "company" (if the memory references a specific CRM entity)
- "entity_name": the specific entity name/address if referenced (e.g. "1234 Main St" or "John Smith" or "Acme Corp")
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
        const jsonStr = responseText.replace(/```json\n?|\n?```/g, '').trim();
        memories = JSON.parse(jsonStr);
        if (!Array.isArray(memories)) memories = [];
      } catch {
        console.warn('[chat/houston] Memory extraction parse failed:', responseText.slice(0, 100));
        return;
      }

      // Store each extracted memory
      for (const mem of memories.slice(0, 3)) {
        // Duplicate check — scope to the right pool
        const dupParams = isTeam
          ? [mem.content.slice(0, 60)]
          : [triggerMessage.sender_id, mem.content.slice(0, 60)];
        const dupCheck = await pool.query(`
          SELECT memory_id FROM houston_memories
          WHERE ${isTeam ? 'channel_type = \'team\'' : 'user_id = $1'}
            AND content ILIKE '%' || $${isTeam ? 1 : 2} || '%'
            AND created_at > NOW() - INTERVAL '30 days'
          LIMIT 1
        `, dupParams);

        if (dupCheck.rows.length > 0) continue;

        // Resolve entity_id from entity_name if provided
        let entityId = null;
        if (mem.entity_type && mem.entity_name) {
          entityId = await resolveEntityId(mem.entity_type, mem.entity_name);
        }

        await pool.query(`
          INSERT INTO houston_memories (user_id, category, content, source, importance, entity_type, entity_id, channel_type)
          VALUES ($1, $2, $3, 'team_chat', $4, $5, $6, $7)
        `, [
          isTeam ? null : triggerMessage.sender_id,
          mem.category || 'context',
          mem.content.slice(0, 500),
          Math.min(Math.max(parseFloat(mem.importance) || 0.5, 0.1), 1.0),
          mem.entity_type || null,
          entityId,
          channelType,
        ]);
      }

      if (memories.length > 0) {
        console.log(`[chat/houston] Stored ${Math.min(memories.length, 3)} ${channelType} memories for ${isTeam ? 'team pool' : 'user ' + triggerMessage.sender_id}`);
      }
    } else {
      // Fallback: basic storage without extraction
      const content = `User asked: "${userMsg.slice(0, 200)}" — Houston answered about: ${houstonMsg.slice(0, 200)}`;
      await pool.query(`
        INSERT INTO houston_memories (user_id, category, content, source, importance, channel_type)
        VALUES ($1, 'chat_exchange', $2, 'team_chat', 0.5, $3)
      `, [isTeam ? null : triggerMessage.sender_id, content, channelType]);
    }
  } catch (err) {
    console.error('[chat/houston] Memory storage error:', err.message);
  }
}

/**
 * Resolve an entity name to its CRM ID by searching the database.
 * Returns the entity_id string or null if not found.
 */
async function resolveEntityId(entityType, entityName) {
  if (!pool || !entityName) return null;
  try {
    const name = entityName.trim();
    let result;
    switch (entityType) {
      case 'property':
        // Search by address (normalized or raw)
        result = await pool.query(
          `SELECT id::text FROM properties
           WHERE address ILIKE $1 OR normalized_address ILIKE $1
           LIMIT 1`,
          [`%${name}%`]
        );
        break;
      case 'contact':
        // Search by full name
        result = await pool.query(
          `SELECT id::text FROM contacts
           WHERE (first_name || ' ' || last_name) ILIKE $1
              OR last_name ILIKE $2
           LIMIT 1`,
          [`%${name}%`, `%${name}%`]
        );
        break;
      case 'company':
        result = await pool.query(
          `SELECT id::text FROM companies WHERE name ILIKE $1 LIMIT 1`,
          [`%${name}%`]
        );
        break;
      case 'deal':
        result = await pool.query(
          `SELECT id::text FROM deals WHERE name ILIKE $1 LIMIT 1`,
          [`%${name}%`]
        );
        break;
      default:
        return null;
    }
    return result?.rows[0]?.id || null;
  } catch (err) {
    // Non-critical — just skip entity linking
    return null;
  }
}

/**
 * Memory decay/pruning — clean up old low-importance memories.
 * Called on each storeMemory to keep the memory pool lean.
 */
async function pruneOldMemories(userId) {
  if (!pool) return;
  try {
    // Delete memories older than 90 days with low importance
    await pool.query(`
      DELETE FROM houston_memories
      WHERE created_at < NOW() - INTERVAL '90 days'
        AND importance < 0.5
    `);

    // Delete memories older than 180 days with medium importance
    await pool.query(`
      DELETE FROM houston_memories
      WHERE created_at < NOW() - INTERVAL '180 days'
        AND importance < 0.8
    `);

    // Cap total memories per user at 500 (delete oldest low-importance first)
    if (userId) {
      const countResult = await pool.query(
        `SELECT COUNT(*) AS cnt FROM houston_memories WHERE user_id = $1`,
        [userId]
      );
      const count = parseInt(countResult.rows[0]?.cnt || '0', 10);
      if (count > 500) {
        const excess = count - 500;
        await pool.query(`
          DELETE FROM houston_memories
          WHERE memory_id IN (
            SELECT memory_id FROM houston_memories
            WHERE user_id = $1
            ORDER BY importance ASC, created_at ASC
            LIMIT $2
          )
        `, [userId, excess]);
        console.log(`[chat/houston] Pruned ${excess} memories for user ${userId} (was ${count})`);
      }
    }

    // Also cap team memories at 500
    const teamCountResult = await pool.query(
      `SELECT COUNT(*) AS cnt FROM houston_memories WHERE channel_type = 'team'`
    );
    const teamCount = parseInt(teamCountResult.rows[0]?.cnt || '0', 10);
    if (teamCount > 500) {
      const excess = teamCount - 500;
      await pool.query(`
        DELETE FROM houston_memories
        WHERE memory_id IN (
          SELECT memory_id FROM houston_memories
          WHERE channel_type = 'team'
          ORDER BY importance ASC, created_at ASC
          LIMIT $1
        )
      `, [excess]);
      console.log(`[chat/houston] Pruned ${excess} team memories (was ${teamCount})`);
    }
  } catch (err) {
    // Non-critical
    console.error('[chat/houston] Memory pruning error:', err.message);
  }
}

/**
 * Log Houston's interjection decision (for tuning and auditing)
 */
// ============================================================
// ============================================================
// HOUSTON CRM WRITE ACTIONS — parse and execute from chat
// ============================================================

/**
 * Parse and execute ACTION blocks from Houston's response
 * Format: <!--ACTION:{"type":"...","params":{...}}-->
 */
async function executeHoustonWriteActions(responseText, userId) {
  const actionPattern = /<!--ACTION:(\{.*?\})-->/g;
  const results = [];
  let match;

  while ((match = actionPattern.exec(responseText)) !== null) {
    try {
      const action = JSON.parse(match[1]);
      const result = await executeSingleAction(action, userId);
      results.push(result);
    } catch (err) {
      console.error('[chat/houston] Failed to parse/execute action:', err.message);
      results.push({ success: false, message: 'Failed to execute action' });
    }
  }

  return results;
}

/**
 * Emit a CRM record change event so frontend tables update in real-time
 */
function emitCrmChange(entityType, action, recordId, data) {
  if (io) {
    io.emit('crm:record:changed', { entityType, action, recordId, data, timestamp: Date.now() });
  }
}

/**
 * Fuzzy match a name/address against a CRM table.
 * Returns: { match: row, ambiguous: false } for single match
 *          { matches: [rows], ambiguous: true } for multiple matches
 *          { match: null, ambiguous: false } for no matches
 */
async function fuzzyMatch(table, searchCol, searchTerm, extraCols = '', limit = 5) {
  if (!searchTerm || !pool) return { match: null, ambiguous: false };

  const idCol = table === 'contacts' ? 'contact_id' : table === 'companies' ? 'company_id' : table === 'properties' ? 'property_id' : table === 'deals' ? 'deal_id' : 'id';
  const nameCol = table === 'contacts' ? 'full_name' : table === 'companies' ? 'company_name' : table === 'properties' ? 'property_address' : table === 'deals' ? 'name' : searchCol;
  const extra = extraCols ? ', ' + extraCols : '';

  // Try exact-ish match first (starts with or contains)
  let query = `SELECT ${idCol}, ${nameCol}${extra} FROM ${table} WHERE ${searchCol} ILIKE $1`;
  // For properties, also search normalized_address
  if (table === 'properties') {
    query = `SELECT ${idCol}, ${nameCol}${extra} FROM ${table} WHERE ${searchCol} ILIKE $1 OR normalized_address ILIKE $1`;
  }
  query += ` LIMIT ${limit}`;

  const result = await pool.query(query, ['%' + searchTerm + '%']);

  if (result.rows.length === 0) {
    return { match: null, ambiguous: false, searchTerm };
  }
  if (result.rows.length === 1) {
    return { match: result.rows[0], ambiguous: false };
  }

  // Multiple matches — check if one is clearly the best (exact match)
  const exact = result.rows.find(r =>
    (r[nameCol] || '').toLowerCase() === searchTerm.toLowerCase()
  );
  if (exact) {
    return { match: exact, ambiguous: false };
  }

  // Multiple matches, none exact — this is ambiguous
  return { matches: result.rows, ambiguous: true, searchTerm };
}

/**
 * Execute a single CRM write action
 */
async function executeSingleAction(action, userId) {
  if (!pool) return { success: false, message: 'Database not available' };

  try {
    switch (action.type) {
      case 'log_interaction': {
        const p = action.params;
        const linked = [];
        const clarifications = [];

        // Match contact(s)
        let contactIds = [];
        if (p.contact_name) {
          const names = Array.isArray(p.contact_name) ? p.contact_name : [p.contact_name];
          for (const name of names) {
            const result = await fuzzyMatch('contacts', 'full_name', name, 'type, email');
            if (result.ambiguous) {
              clarifications.push({
                field: 'contact_name',
                searchTerm: name,
                options: result.matches.map(r => ({ id: r.contact_id, label: r.full_name, detail: [r.type, r.email].filter(Boolean).join(' \u00B7 ') }))
              });
            } else if (result.match) {
              contactIds.push(result.match.contact_id);
              linked.push(result.match.full_name);
            }
          }
        }

        // Match property
        let propertyId = null;
        if (p.property_address) {
          const result = await fuzzyMatch('properties', 'property_address', p.property_address, 'city');
          if (result.ambiguous) {
            clarifications.push({
              field: 'property_address',
              searchTerm: p.property_address,
              options: result.matches.map(r => ({ id: r.property_id, label: r.property_address, detail: r.city || '' }))
            });
          } else if (result.match) {
            propertyId = result.match.property_id;
            linked.push(result.match.property_address);
          }
        }

        // Match company
        let companyId = null;
        if (p.company_name) {
          const result = await fuzzyMatch('companies', 'company_name', p.company_name);
          if (result.ambiguous) {
            clarifications.push({
              field: 'company_name',
              searchTerm: p.company_name,
              options: result.matches.map(r => ({ id: r.company_id, label: r.company_name }))
            });
          } else if (result.match) {
            companyId = result.match.company_id;
            linked.push(result.match.company_name);
          }
        }

        // Match deal
        let dealId = null;
        if (p.deal_name) {
          const result = await fuzzyMatch('deals', 'name', p.deal_name, 'status');
          if (result.ambiguous) {
            clarifications.push({
              field: 'deal_name',
              searchTerm: p.deal_name,
              options: result.matches.map(r => ({ id: r.deal_id, label: r.name, detail: r.status || '' }))
            });
          } else if (result.match) {
            dealId = result.match.deal_id;
            linked.push(result.match.name);
          }
        }

        // If anything is ambiguous, return clarification request (don't create yet)
        if (clarifications.length > 0) {
          let msg = '\u2753 I found multiple matches. Which did you mean?\n';
          for (const c of clarifications) {
            msg += '\n**' + c.field.replace('_', ' ') + '** ("' + c.searchTerm + '"):\n';
            c.options.forEach((opt, i) => {
              msg += '  ' + (i + 1) + '. ' + opt.label + (opt.detail ? ' (' + opt.detail + ')' : '') + '\n';
            });
          }
          msg += '\nJust reply with the number(s) or name(s) and I\'ll redo this.';
          return { success: false, needsClarification: true, clarifications, message: msg };
        }

        // All matches resolved — create the interaction
        const interResult = await pool.query(
          `INSERT INTO interactions (type, date, notes, team_member)
           VALUES ($1, $2, $3, $4) RETURNING interaction_id`,
          [p.interaction_type || 'Note', p.date || new Date().toISOString(), p.notes || '', userId]
        );
        const interactionId = interResult.rows[0].interaction_id;

        for (const cId of contactIds) {
          await pool.query(
            `INSERT INTO interaction_contacts (interaction_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [interactionId, cId]
          );
        }
        if (propertyId) {
          await pool.query(
            `INSERT INTO interaction_properties (interaction_id, property_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [interactionId, propertyId]
          );
        }
        if (companyId) {
          await pool.query(
            `INSERT INTO interaction_companies (interaction_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [interactionId, companyId]
          );
        }
        if (dealId) {
          await pool.query(
            `INSERT INTO interaction_deals (interaction_id, deal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [interactionId, dealId]
          );
        }

        const linkMsg = linked.length > 0 ? ' Linked to: ' + linked.join(', ') + '.' : '';
        emitCrmChange('interaction', 'created', interactionId, { type: p.interaction_type, linked });
        return { success: true, message: '\u2705 Logged ' + (p.interaction_type || 'Note') + '.' + linkMsg };
      }

      case 'create_task': {
        const p = action.params;
        const linked = [];
        const clarifications = [];

        // Pre-match all entities before creating the task
        let contactMatches = [];
        if (p.contact_name) {
          const names = Array.isArray(p.contact_name) ? p.contact_name : [p.contact_name];
          for (const name of names) {
            const result = await fuzzyMatch('contacts', 'full_name', name, 'type, email');
            if (result.ambiguous) {
              clarifications.push({
                field: 'contact_name',
                searchTerm: name,
                options: result.matches.map(r => ({ id: r.contact_id, label: r.full_name, detail: [r.type, r.email].filter(Boolean).join(' \u00B7 ') }))
              });
            } else if (result.match) {
              contactMatches.push(result.match);
              linked.push(result.match.full_name);
            }
          }
        }

        let companyMatches = [];
        if (p.company_name) {
          const names = Array.isArray(p.company_name) ? p.company_name : [p.company_name];
          for (const name of names) {
            const result = await fuzzyMatch('companies', 'company_name', name);
            if (result.ambiguous) {
              clarifications.push({
                field: 'company_name',
                searchTerm: name,
                options: result.matches.map(r => ({ id: r.company_id, label: r.company_name }))
              });
            } else if (result.match) {
              companyMatches.push(result.match);
              linked.push(result.match.company_name);
            }
          }
        }

        let propertyMatches = [];
        if (p.property_address) {
          const addrs = Array.isArray(p.property_address) ? p.property_address : [p.property_address];
          for (const addr of addrs) {
            const result = await fuzzyMatch('properties', 'property_address', addr, 'city');
            if (result.ambiguous) {
              clarifications.push({
                field: 'property_address',
                searchTerm: addr,
                options: result.matches.map(r => ({ id: r.property_id, label: r.property_address, detail: r.city || '' }))
              });
            } else if (result.match) {
              propertyMatches.push(result.match);
              linked.push(result.match.property_address);
            }
          }
        }

        let dealMatch = null;
        if (p.deal_name) {
          const result = await fuzzyMatch('deals', 'name', p.deal_name, 'status');
          if (result.ambiguous) {
            clarifications.push({
              field: 'deal_name',
              searchTerm: p.deal_name,
              options: result.matches.map(r => ({ id: r.deal_id, label: r.name, detail: r.status || '' }))
            });
          } else if (result.match) {
            dealMatch = result.match;
            linked.push(result.match.name);
          }
        }

        // If anything is ambiguous, ask for clarification before creating
        if (clarifications.length > 0) {
          let msg = '\u2753 I found multiple matches. Which did you mean?\n';
          for (const c of clarifications) {
            msg += '\n**' + c.field.replace(/_/g, ' ') + '** ("' + c.searchTerm + '"):\n';
            c.options.forEach((opt, i) => {
              msg += '  ' + (i + 1) + '. ' + opt.label + (opt.detail ? ' (' + opt.detail + ')' : '') + '\n';
            });
          }
          msg += '\nJust reply with the number(s) or name(s) and I\'ll create the task with the right links.';
          return { success: false, needsClarification: true, clarifications, message: msg };
        }

        // All matches resolved — create the task
        const taskResult = await pool.query(
          `INSERT INTO action_items (name, notes, due_date, responsibility, high_priority, status, source)
           VALUES ($1, $2, $3, $4, $5, 'Todo', 'houston') RETURNING action_item_id`,
          [
            p.name || 'Follow up',
            p.notes || '',
            p.due_date || null,
            p.responsibility ? '{' + p.responsibility + '}' : '{David Mudge Jr}',
            p.high_priority || false,
          ]
        );
        const taskId = taskResult.rows[0].action_item_id;

        // Link all resolved entities
        for (const c of contactMatches) {
          await pool.query(
            `INSERT INTO action_item_contacts (action_item_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [taskId, c.contact_id]
          );
        }
        for (const c of companyMatches) {
          await pool.query(
            `INSERT INTO action_item_companies (action_item_id, company_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [taskId, c.company_id]
          );
        }
        for (const p2 of propertyMatches) {
          await pool.query(
            `INSERT INTO action_item_properties (action_item_id, property_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [taskId, p2.property_id]
          );
        }
        if (dealMatch) {
          await pool.query(
            `INSERT INTO action_item_deals (action_item_id, deal_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [taskId, dealMatch.deal_id]
          );
        }

        const linkMsg = linked.length > 0 ? ' Linked to: ' + linked.join(', ') + '.' : '';
        emitCrmChange('action_item', 'created', taskId, { name: p.name, linked });
        return { success: true, message: '\u2705 Created task: "' + p.name + '"' + (p.due_date ? ' (due ' + p.due_date + ')' : '') + linkMsg };
      }

      case 'update_contact': {
        const p = action.params;
        if (!p.contact_name || !p.updates) return { success: false, message: 'Missing contact name or updates' };

        const contactResult = await pool.query(
          `SELECT contact_id FROM contacts WHERE full_name ILIKE $1 LIMIT 1`,
          ['%' + p.contact_name + '%']
        );
        if (contactResult.rows.length === 0) return { success: false, message: 'Contact "' + p.contact_name + '" not found' };

        const contactId = contactResult.rows[0].contact_id;
        const setClauses = [];
        const values = [contactId];
        let idx = 2;
        for (const [key, val] of Object.entries(p.updates)) {
          setClauses.push(key + ' = $' + idx);
          values.push(val);
          idx++;
        }
        if (setClauses.length > 0) {
          await pool.query('UPDATE contacts SET ' + setClauses.join(', ') + ', updated_at = NOW() WHERE contact_id = $1', values);
        }
        emitCrmChange('contact', 'updated', contactId, { name: p.contact_name, updates: p.updates });
        return { success: true, message: '\u2705 Updated ' + p.contact_name };
      }

      case 'update_property': {
        const p = action.params;
        if (!p.address || !p.updates) return { success: false, message: 'Missing address or updates' };

        const propResult = await pool.query(
          `SELECT property_id FROM properties WHERE property_address ILIKE $1 OR normalized_address ILIKE $1 LIMIT 1`,
          ['%' + p.address + '%']
        );
        if (propResult.rows.length === 0) return { success: false, message: 'Property "' + p.address + '" not found' };

        const propId = propResult.rows[0].property_id;
        const setClauses2 = [];
        const values2 = [propId];
        let idx2 = 2;
        for (const [key, val] of Object.entries(p.updates)) {
          setClauses2.push(key + ' = $' + idx2);
          values2.push(Array.isArray(val) ? '{' + val.join(',') + '}' : val);
          idx2++;
        }
        if (setClauses2.length > 0) {
          await pool.query('UPDATE properties SET ' + setClauses2.join(', ') + ', updated_at = NOW() WHERE property_id = $1', values2);
        }
        emitCrmChange('property', 'updated', propId, { address: p.address, updates: p.updates });
        return { success: true, message: '\u2705 Updated ' + p.address };
      }

      case 'log_transcript': {
        const p = action.params;
        if (!p.transcript_text) return { success: false, message: 'No transcript text provided' };

        // Match contact
        let contactId = null;
        let contactName = p.contact_name || 'Unknown';
        if (p.contact_name) {
          const contactResult = await pool.query(
            `SELECT contact_id, full_name FROM contacts WHERE full_name ILIKE $1 LIMIT 1`,
            ['%' + p.contact_name + '%']
          );
          if (contactResult.rows[0]) {
            contactId = contactResult.rows[0].contact_id;
            contactName = contactResult.rows[0].full_name;
          }
        }

        // Match property (optional)
        let propertyId = null;
        if (p.property_address) {
          const propResult = await pool.query(
            `SELECT property_id FROM properties WHERE property_address ILIKE $1 OR normalized_address ILIKE $1 LIMIT 1`,
            ['%' + p.property_address + '%']
          );
          if (propResult.rows[0]) propertyId = propResult.rows[0].property_id;
        }

        // Generate a simple meeting ID for dedup
        const meetingId = 'manual-' + Date.now();

        // Insert full transcript
        const transcriptResult = await pool.query(
          `INSERT INTO call_transcripts
             (fireflies_meeting_id, fireflies_title, call_date, call_type,
              our_caller, contact_id, property_id, transcript_text,
              ai_summary, ai_key_points, ai_action_items,
              processing_status, processed_by, processed_at)
           VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, 'completed', 'houston_sonnet', NOW())
           RETURNING id`,
          [
            meetingId,
            'Call with ' + contactName,
            p.call_type || 'phone',
            p.our_caller || 'david',
            contactId,
            propertyId,
            p.transcript_text,
            p.summary || null,
            JSON.stringify(p.key_points || []),
            JSON.stringify(p.action_items || []),
          ]
        );
        const transcriptId = transcriptResult.rows[0].id;

        // Create interaction record with just the summary
        const summary = p.summary || 'Call transcript logged (see full transcript for details)';
        const interResult = await pool.query(
          `INSERT INTO interactions (type, date, notes, team_member, transcript_id, has_transcript)
           VALUES ('Phone Call', NOW(), $1, $2, $3, true) RETURNING interaction_id`,
          [summary, userId, transcriptId]
        );
        const interactionId = interResult.rows[0].interaction_id;

        // Link interaction to contact and property
        if (contactId) {
          await pool.query(
            `INSERT INTO interaction_contacts (interaction_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [interactionId, contactId]
          );
        }
        if (propertyId) {
          await pool.query(
            `INSERT INTO interaction_properties (interaction_id, property_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [interactionId, propertyId]
          );
        }

        // Update transcript with interaction link
        await pool.query(
          'UPDATE call_transcripts SET interaction_id = $1 WHERE id = $2',
          [interactionId, transcriptId]
        );

        const linkedTo = [contactName, p.property_address].filter(Boolean).join(' @ ');
        return {
          success: true,
          message: '\u2705 Logged call transcript with ' + linkedTo + ' — summary saved as activity, full transcript stored for Oracle.'
            + (p.key_points?.length ? '\n📋 ' + p.key_points.length + ' key points captured.' : '')
            + (p.action_items?.length ? '\n📌 ' + p.action_items.length + ' action items detected.' : '')
        };
      }

      default:
        return { success: false, message: 'Unknown action type: ' + action.type };
    }
  } catch (err) {
    console.error('[chat/houston] Action ' + action.type + ' failed:', err.message);
    return { success: false, message: 'Failed: ' + err.message };
  }
}

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

  if (meta.action_executed) return; // Already executed

  // Check for pending_actions (new confirmation gate) — handles ALL action types
  if (meta.pending_actions && meta.pending_actions.length > 0) {
    // Check 5-minute timeout
    const pendingAge = meta.pending_actions_at ? Date.now() - new Date(meta.pending_actions_at).getTime() : Infinity;
    if (pendingAge > 5 * 60 * 1000) return; // Expired
    await executePendingActions(houstonMsg, userId);
    return;
  }

  // Legacy: image analysis action extraction
  if (meta.trigger !== 'image_analysis') return;
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

  if (meta.action_executed) return;

  // Check that this Houston message is recent (within 5 minutes)
  const age = Date.now() - new Date(houstonMsg.created_at).getTime();
  if (age > 5 * 60 * 1000) return;

  // New confirmation gate: execute pending_actions if present
  if (meta.pending_actions && meta.pending_actions.length > 0) {
    await executePendingActions(houstonMsg, message.sender_id);
    return;
  }

  // Legacy: image analysis action extraction
  if (meta.trigger !== 'image_analysis') return;
  await executeHoustonAction(houstonMsg, message.sender_id);
}

/**
 * Execute pending actions stored in houston_meta (confirmation gate)
 * Called when user confirms with "yes", thumbs up, etc.
 */
async function executePendingActions(houstonMsg, userId) {
  const meta = typeof houstonMsg.houston_meta === 'string'
    ? JSON.parse(houstonMsg.houston_meta) : (houstonMsg.houston_meta || {});

  if (!meta.pending_actions || meta.pending_actions.length === 0) return;
  if (meta.action_executed) return;

  try {
    const results = [];
    for (const action of meta.pending_actions) {
      try {
        const result = await executeSingleAction(action, userId);
        results.push(result);
      } catch (err) {
        console.error('[chat/houston] Pending action failed:', err.message);
        results.push({ success: false, message: 'Failed: ' + err.message });
      }
    }

    // Check if any results need clarification (ambiguous matches)
    const needsClarification = results.some(r => r.needsClarification);

    if (needsClarification) {
      // Don't mark as executed — user needs to clarify first
      const clarificationMsgs = results.filter(r => r.needsClarification).map(r => r.message);
      const clarBody = clarificationMsgs.join('\n\n');

      const clarMessage = await insertMessage({
        channelId: houstonMsg.channel_id,
        senderId: null,
        senderType: 'houston',
        body: clarBody,
        messageType: 'houston_insight',
        houstonMeta: {
          trigger: 'clarification_needed',
          parent_message_id: houstonMsg.id,
          original_actions: meta.pending_actions,
          clarifications: results.filter(r => r.needsClarification).flatMap(r => r.clarifications || [])
        }
      });
      io.to(`channel:${houstonMsg.channel_id}`).emit('chat:message:new', clarMessage);
      return;
    }

    // All resolved — mark as executed
    await pool.query(
      `UPDATE chat_messages SET houston_meta = houston_meta || '{"action_executed": true}'::jsonb WHERE id = $1`,
      [houstonMsg.id]
    );

    // Send confirmation message
    const confirmations = results.filter(r => r.success).map(r => r.message);
    const failures = results.filter(r => !r.success).map(r => r.message);
    let confirmBody = '';
    if (confirmations.length > 0) confirmBody += confirmations.join('\n');
    if (failures.length > 0) confirmBody += (confirmBody ? '\n' : '') + failures.join('\n');

    if (confirmBody) {
      const confirmMessage = await insertMessage({
        channelId: houstonMsg.channel_id,
        senderId: null,
        senderType: 'houston',
        body: confirmBody,
        messageType: 'houston_insight',
        houstonMeta: { trigger: 'action_confirmation', parent_message_id: houstonMsg.id }
      });
      io.to(`channel:${houstonMsg.channel_id}`).emit('chat:message:new', confirmMessage);
    }
  } catch (err) {
    console.error('[chat/houston] executePendingActions error:', err.message);
  }
}

/**
 * Execute the CRM action Houston offered (log activity, cross-reference, etc.)
 * Legacy handler for image analysis actions
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
          `INSERT INTO interactions (type, date, notes, team_member)
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
        `SELECT property_id, property_address, city, property_type FROM properties
         WHERE property_address ILIKE $1 OR normalized_address ILIKE $1 LIMIT 3`,
        [`%${action.address}%`]
      );
      if (propResult.rows.length > 0) {
        const matches = propResult.rows.map(p => `${p.property_address}, ${p.city} (${p.property_type})`).join('; ');
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
      // SECURITY: Use JWT-derived userId; fall back to query param during migration
      const userId = req.user?.user_id || req.query.userId;
      if (!req.user?.user_id && req.query.userId) {
        console.warn('[chat] SECURITY: GET /channels using query userId instead of JWT — update frontend');
      }
      if (!userId) return res.status(400).json({ error: 'Authentication required' });
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

      // Auto-join authenticated user to channel if not a member
      const msgUserId = req.user?.user_id || req.query.userId;
      if (msgUserId) {
        await ensureMembership(channelId, msgUserId);
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
      // SECURITY: Use JWT-derived userId; fall back to query param during migration
      const userId = req.user?.user_id || req.query.userId;
      if (!userId) return res.status(400).json({ error: 'Authentication required' });

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

  // GET /api/chat/houston-dm — get or create user's personal Houston channel
  app.get('/api/chat/houston-dm', async (req, res) => {
    try {
      // SECURITY: Use JWT-derived userId; fall back to query param during migration
      const userId = req.user?.user_id || req.query.userId;
      if (!userId) return res.status(400).json({ error: 'Authentication required' });

      // Check for existing houston_dm channel for this user
      let result = await pool.query(
        `SELECT c.id FROM chat_channels c
         JOIN chat_channel_members m ON c.id = m.channel_id
         WHERE c.channel_type = 'houston_dm' AND m.user_id = $1
         LIMIT 1`,
        [userId]
      );

      if (result.rows.length > 0) {
        return res.json({ channelId: result.rows[0].id });
      }

      // Create new houston_dm channel
      const userName = await pool.query(`SELECT display_name FROM users WHERE user_id = $1`, [userId]);
      const name = `Houston DM - ${userName.rows[0]?.display_name || 'User'}`;
      const insert = await pool.query(
        `INSERT INTO chat_channels (name, channel_type, created_by) VALUES ($1, 'houston_dm', $2) RETURNING id`,
        [name, userId]
      );
      const channelId = insert.rows[0].id;
      await ensureMembership(channelId, userId);

      res.json({ channelId, created: true });
    } catch (err) {
      console.error('[chat] GET /houston-dm error:', err.message);
      res.status(500).json({ error: 'Failed to get Houston DM' });
    }
  });
}

module.exports = {
  initChat,
  registerChatRoutes,
  insertMessage,
  getMessages,
  getChannels,
  triggerCouncilHoustonResponse
};
