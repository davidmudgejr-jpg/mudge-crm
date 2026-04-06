-- 061_knowledge_graph.sql
-- Knowledge Graph: nodes parsed from Houston's markdown vault + edges from wikilinks
-- Supports graph visualization, full-text search, visibility-based access control

BEGIN;

-- ============================================================
-- knowledge_nodes: each markdown file in the vault = one node
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('contact', 'company', 'property', 'deal', 'market', 'decision')),
  title TEXT NOT NULL,
  aliases JSONB DEFAULT '[]'::jsonb,
  crm_id UUID,
  last_verified DATE,
  stale_after DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'stale', 'archive', 'pending-review')),
  visibility TEXT DEFAULT 'business' CHECK (visibility IN ('business', 'david-only', 'internal')),
  source_context TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  frontmatter JSONB DEFAULT '{}'::jsonb,
  content TEXT,
  summary TEXT,
  links_to JSONB DEFAULT '[]'::jsonb,
  -- Inbox merge workflow fields
  merge_requested_at TIMESTAMPTZ,
  merge_target_slug TEXT,
  merged_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- knowledge_edges: wikilink connections between nodes
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_slug TEXT NOT NULL,
  to_slug TEXT NOT NULL,
  context TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_slug, to_slug)
);

-- ============================================================
-- Indexes for graph queries, search, and filtering
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_kn_type ON knowledge_nodes(type);
CREATE INDEX IF NOT EXISTS idx_kn_status ON knowledge_nodes(status);
CREATE INDEX IF NOT EXISTS idx_kn_visibility ON knowledge_nodes(visibility);
CREATE INDEX IF NOT EXISTS idx_kn_crm_id ON knowledge_nodes(crm_id) WHERE crm_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kn_stale_after ON knowledge_nodes(stale_after) WHERE stale_after IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kn_merge_pending ON knowledge_nodes(merge_requested_at) WHERE merge_requested_at IS NOT NULL AND merged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ke_from ON knowledge_edges(from_slug);
CREATE INDEX IF NOT EXISTS idx_ke_to ON knowledge_edges(to_slug);

-- Full-text search index on title + content
CREATE INDEX IF NOT EXISTS idx_kn_fts ON knowledge_nodes
  USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));

COMMIT;
