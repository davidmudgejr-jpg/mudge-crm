-- Migration 022: Houston Command Council — strategic AI coordination channel
-- Adds 'council' channel type, council channel, and council_proposals table

-- ============================================================
-- EXTEND channel_type CHECK to include 'council'
-- ============================================================
-- The existing CHECK constraint on chat_channels.channel_type only allows
-- 'group', 'dm', 'houston_dm'. We need to add 'council'.
-- PostgreSQL CHECK constraints can't be altered in-place, so we drop and recreate.
ALTER TABLE chat_channels DROP CONSTRAINT IF EXISTS chat_channels_channel_type_check;
ALTER TABLE chat_channels ADD CONSTRAINT chat_channels_channel_type_check
  CHECK (channel_type IN ('group', 'dm', 'houston_dm', 'council'));

-- ============================================================
-- EXTEND message_type CHECK to include council message types
-- ============================================================
ALTER TABLE chat_messages DROP CONSTRAINT IF EXISTS chat_messages_message_type_check;
ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_message_type_check
  CHECK (message_type IN (
    'text', 'image', 'file', 'system', 'houston_insight',
    'council_analysis', 'council_strategy', 'council_action_request',
    'council_insight', 'council_status'
  ));

-- ============================================================
-- SEED THE COUNCIL CHANNEL
-- ============================================================
INSERT INTO chat_channels (name, channel_type)
VALUES ('Houston Council', 'council')
ON CONFLICT DO NOTHING;

-- ============================================================
-- COUNCIL PROPOSALS — action requests that need admin approval
-- ============================================================
CREATE TABLE IF NOT EXISTS council_proposals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES chat_channels(id) ON DELETE CASCADE,
  proposal_text TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT 'Houston Command',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by UUID REFERENCES users(user_id),
  approval_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_council_proposals_status ON council_proposals(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_council_proposals_message ON council_proposals(message_id);
