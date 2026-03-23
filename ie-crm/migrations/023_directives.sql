-- 023_directives.sql — Decision Cascade: Directives system for AI agent fleet
-- Allows admin to issue orders that cascade through the agent hierarchy

CREATE TABLE IF NOT EXISTS directives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
  scope TEXT DEFAULT 'all' CHECK (scope IN ('all', 'command', 'sonnet', 'enricher', 'ralph', 'matcher', 'scout', 'researcher')),
  source TEXT DEFAULT 'admin',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived')),
  acknowledged_by JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_directives_status ON directives(status);
CREATE INDEX IF NOT EXISTS idx_directives_scope ON directives(scope);
CREATE INDEX IF NOT EXISTS idx_directives_created ON directives(created_at DESC);
