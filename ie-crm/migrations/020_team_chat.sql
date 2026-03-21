-- Migration 020: Team Chat — Real-time messaging with Houston integration
-- Adds chat_messages, chat_channels, chat_reactions, chat_mentions tables.
-- Houston is a system participant (sender_type = 'houston').

-- ============================================================
-- CHAT CHANNELS — group/DM containers
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                         -- 'general', 'deals', DM names, etc.
  channel_type TEXT NOT NULL DEFAULT 'group'
    CHECK (channel_type IN ('group', 'dm', 'houston_dm')),
  created_by UUID REFERENCES users(user_id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the default #general channel
INSERT INTO chat_channels (name, channel_type)
VALUES ('General', 'group')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CHAT CHANNEL MEMBERS — who's in each channel
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_channel_members (
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),     -- for unread badge calculation
  PRIMARY KEY (channel_id, user_id)
);

-- ============================================================
-- CHAT MESSAGES — the core messages table
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,

  -- Sender: either a user or Houston
  sender_id UUID REFERENCES users(user_id),   -- NULL when sender_type = 'houston'
  sender_type TEXT NOT NULL DEFAULT 'user'
    CHECK (sender_type IN ('user', 'houston')),

  -- Content
  body TEXT,                                   -- message text (markdown supported)
  message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN (
      'text',           -- normal message
      'image',          -- photo/screenshot upload
      'file',           -- other file attachment
      'system',         -- "David joined the channel", etc.
      'houston_insight' -- Houston proactive interjection
    )),

  -- Image/file support (screenshots of client texts, etc.)
  attachments JSONB DEFAULT '[]',
  -- Format: [{ "url": "/uploads/...", "filename": "screenshot.png",
  --            "mime_type": "image/png", "size_bytes": 12345,
  --            "houston_analysis": "Client interested in 10k sqft warehouse..." }]

  -- Reply threading
  reply_to_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,

  -- Edit/delete
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,                      -- soft delete

  -- Houston metadata (only populated when sender_type = 'houston')
  houston_meta JSONB DEFAULT NULL,
  -- Format: { "trigger": "deal_discussion", "confidence": 0.85,
  --           "interjection_type": "data_surface", "model": "claude-opus-4.6",
  --           "tokens_used": 450, "memory_ids_referenced": ["uuid1","uuid2"] }

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_chat_messages_channel ON chat_messages(channel_id, created_at DESC);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_chat_messages_type ON chat_messages(message_type);
CREATE INDEX idx_chat_messages_reply ON chat_messages(reply_to_id);

-- ============================================================
-- CHAT MENTIONS — links messages to CRM entities
-- ============================================================
-- When someone says "the Pacific West deal" Houston can detect
-- and link to the actual CRM record for quick-jump navigation.
CREATE TABLE IF NOT EXISTS chat_mentions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('contact', 'company', 'property', 'deal', 'user')),
  entity_id TEXT NOT NULL,                     -- UUID or integer ID depending on entity
  mention_text TEXT,                           -- the text that triggered the mention
  confidence NUMERIC(3,2) DEFAULT 1.00,       -- Houston's confidence in the link
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_mentions_message ON chat_mentions(message_id);
CREATE INDEX idx_chat_mentions_entity ON chat_mentions(entity_type, entity_id);

-- ============================================================
-- CHAT REACTIONS — emoji reactions on messages
-- ============================================================
CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,                         -- '👍', '😂', '🔥', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- ============================================================
-- CHAT TYPING INDICATORS — ephemeral, used by socket layer
-- (No table needed — handled purely in-memory via Socket.io)
-- ============================================================

-- ============================================================
-- HOUSTON INTERJECTION TRACKING — rate limiting + quality
-- ============================================================
CREATE TABLE IF NOT EXISTS houston_interjections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES chat_channels(id),
  message_id UUID REFERENCES chat_messages(id),
  trigger_type TEXT NOT NULL
    CHECK (trigger_type IN (
      'at_mention',        -- someone @houston'd
      'data_question',     -- team asked something Houston can answer from CRM
      'missing_context',   -- deal discussion where Houston has relevant data
      'team_stuck',        -- team going back and forth, Houston has a suggestion
      'morning_briefing',  -- scheduled daily briefing
      'market_alert',      -- convergence signal detected
      'image_analysis'     -- Houston analyzed an uploaded screenshot
    )),
  decision TEXT NOT NULL
    CHECK (decision IN ('interjected', 'suppressed', 'deferred')),
  reason TEXT,                                 -- why Houston did or didn't interject
  context_window JSONB DEFAULT '{}',           -- the messages Houston evaluated
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_houston_interjections_channel ON houston_interjections(channel_id, created_at DESC);
CREATE INDEX idx_houston_interjections_date ON houston_interjections(created_at);

-- ============================================================
-- EXTEND houston_memories FOR CHAT RAG
-- ============================================================
-- Add chat-specific memory categories and a vector-ready content hash
ALTER TABLE houston_memories
  ADD COLUMN IF NOT EXISTS importance NUMERIC(3,2) DEFAULT 0.50,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- Index for RAG lookups by entity
CREATE INDEX IF NOT EXISTS idx_houston_memories_entity
  ON houston_memories(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_houston_memories_category
  ON houston_memories(category, created_at DESC);
