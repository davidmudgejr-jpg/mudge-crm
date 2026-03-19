-- Migration 019: User Authentication + Houston Per-User Memory
-- Adds users table, houston_memories table, and user_id FK to audit tables.

-- Users table (3 family members)
CREATE TABLE IF NOT EXISTS users (
  user_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT DEFAULT 'broker',
  avatar_color TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_login TIMESTAMPTZ
);

-- Houston per-user conversational memory
CREATE TABLE IF NOT EXISTS houston_memories (
  memory_id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(user_id),
  category TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_houston_memories_user ON houston_memories(user_id);

-- Add nullable user_id to audit tables (existing rows stay NULL)
ALTER TABLE undo_log ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id);
ALTER TABLE ai_usage_tracking ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(user_id);
