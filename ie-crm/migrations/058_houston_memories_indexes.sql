-- Indexes for houston_memories — hit 4x per chat message, previously under-indexed.
-- Covers the 4 retrieval strategies in chat.js: keyword, entity, high-importance, recent.

-- Composite for channel_type + importance (strategies 3 & 4: high-importance + recent)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hm_channel_importance
  ON houston_memories(channel_type, importance DESC, created_at DESC);

-- Composite for channel_type + entity_type (strategy 2: entity-linked memories)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hm_channel_entity
  ON houston_memories(channel_type, entity_type, importance DESC);

-- Composite for user_id + channel_type (pool filter for personal chats)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hm_user_channel
  ON houston_memories(user_id, channel_type, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Partial index for non-expired memories (all 4 strategies filter on this)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hm_active
  ON houston_memories(channel_type, created_at DESC)
  WHERE expires_at IS NULL OR expires_at > NOW();

-- Index for pruning queries (DELETE WHERE created_at < X AND importance < Y)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hm_prune
  ON houston_memories(created_at, importance);
