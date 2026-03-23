-- Migration 021: RAG Memory Pools — separate personal/team memories, decay/pruning
-- Adds channel_type column, makes user_id nullable for shared team memories,
-- and adds index for pool-based lookups.

-- Add channel_type to distinguish personal vs team memories
ALTER TABLE houston_memories
  ADD COLUMN IF NOT EXISTS channel_type VARCHAR(20) DEFAULT 'personal';

-- Make user_id nullable so team memories can be shared (user_id = NULL)
ALTER TABLE houston_memories
  ALTER COLUMN user_id DROP NOT NULL;

-- Index for pool-based memory retrieval
CREATE INDEX IF NOT EXISTS idx_houston_memories_pool
  ON houston_memories(channel_type, user_id, importance DESC, created_at DESC);
