-- 024_agent_system_expansion.sql — Agent System Expansion
-- Adds: improvement_proposals, workflow_chains, agent_skills, email tracking on contacts
-- Updates: directives scope + priority_board types for new agents (Postmaster, Campaign Manager)
-- Full architecture: ai-system/AGENT-SYSTEM.md

-- ============================================================
-- 1. IMPROVEMENT PROPOSALS — Tier 2 → Tier 1 improvement ideas
-- ============================================================
-- Ralph GPT/Gemini spot patterns and propose improvements to Houston Command.
-- Command reviews, accepts/rejects, and implements by rewriting agent instructions.

CREATE TABLE IF NOT EXISTS improvement_proposals (
  id SERIAL PRIMARY KEY,
  -- Who proposed it
  source_agent TEXT NOT NULL,            -- e.g. 'ralph_gpt', 'ralph_gemini', 'houston_command'
  -- What agent/system it's about
  about_agent TEXT,                       -- e.g. 'enricher', 'campaign_manager', 'system'
  category TEXT NOT NULL CHECK (category IN (
    'threshold_adjustment',    -- Change scoring/confidence thresholds
    'instruction_rewrite',     -- Rewrite agent .md instructions
    'workflow_change',         -- Change how a workflow operates
    'new_cadence',             -- Add a new scheduled review/task
    'template_update',         -- Update email templates or outreach patterns
    'cost_optimization',       -- Reduce spend without losing quality
    'new_capability',          -- Add a new feature or agent skill
    'performance_fix',         -- Fix a performance issue
    'self_improvement',        -- Houston Command's own self-review proposals
    'skill_creation',          -- Proposal to build a new reusable skill
    'other'
  )),
  -- The proposal
  observation TEXT NOT NULL,              -- What was noticed (evidence)
  proposal TEXT NOT NULL,                 -- What to change
  expected_impact TEXT,                   -- What improvement is expected
  effort_level TEXT DEFAULT 'medium' CHECK (effort_level IN ('low', 'medium', 'high')),
  evidence JSONB DEFAULT '{}',            -- Structured evidence (counts, rates, examples)
  confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  -- Review workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',       -- Awaiting Houston Command review
    'accepted',      -- Command accepted, will implement
    'rejected',      -- Command rejected with reason
    'implemented',   -- Change was made
    'needs_david'    -- Requires David's approval (cost/structural change)
  )),
  reviewed_by TEXT,                       -- 'houston_command' or 'david'
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,                      -- Why accepted/rejected
  -- Implementation tracking
  implemented_at TIMESTAMPTZ,
  implementation_notes TEXT,              -- What was actually changed
  version_before TEXT,                    -- Reference to old instruction file version
  version_after TEXT,                     -- Reference to new instruction file version
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_improvement_proposals_status ON improvement_proposals(status);
CREATE INDEX IF NOT EXISTS idx_improvement_proposals_source ON improvement_proposals(source_agent);
CREATE INDEX IF NOT EXISTS idx_improvement_proposals_about ON improvement_proposals(about_agent);
CREATE INDEX IF NOT EXISTS idx_improvement_proposals_category ON improvement_proposals(category);
CREATE INDEX IF NOT EXISTS idx_improvement_proposals_created ON improvement_proposals(created_at DESC);

-- ============================================================
-- 2. WORKFLOW CHAINS — End-to-end multi-agent pipeline tracking
-- ============================================================
-- When a task spans multiple agents (e.g., AIR report → Matcher → Enricher → Campaign Manager),
-- this table tracks the entire chain so you can see the full pipeline in the dashboard.

CREATE TABLE IF NOT EXISTS workflow_chains (
  id SERIAL PRIMARY KEY,
  workflow_id TEXT NOT NULL UNIQUE,       -- e.g. 'WF-20260322-001' (human-readable)
  -- What kind of workflow
  workflow_type TEXT NOT NULL CHECK (workflow_type IN (
    'air_to_outreach',         -- AIR report → parse → match → enrich → send
    'signal_to_research',      -- Market signal → research → prioritize → enrich
    'enrichment_pipeline',     -- Batch enrichment → verify → promote
    'campaign_sequence',       -- Campaign creation → A/B test → analyze → optimize
    'email_to_activity',       -- Inbound email → match contact → log activity
    'directive_execution',     -- David's directive → Command breaks down → agents execute
    'self_improvement',        -- Improvement proposal → review → implement → monitor
    'custom'
  )),
  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',       -- In progress, agents working
    'completed',    -- All steps done successfully
    'failed',       -- A step failed, chain broken
    'stalled',      -- No progress for >24 hours
    'cancelled'     -- Manually cancelled
  )),
  -- Chain definition
  steps JSONB NOT NULL DEFAULT '[]',      -- Array of step objects (see below)
  current_step INTEGER DEFAULT 0,         -- Index into steps array
  -- Context
  trigger_source TEXT,                     -- What started this chain (e.g. 'air_report', 'directive:uuid', 'signal:id')
  trigger_data JSONB DEFAULT '{}',         -- Context data from the trigger
  -- Results
  result_summary TEXT,                     -- Final outcome summary
  items_produced INTEGER DEFAULT 0,        -- How many CRM records/emails/etc were produced
  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  -- Directive link (if this chain was triggered by a directive)
  directive_id UUID REFERENCES directives(id) ON DELETE SET NULL
);

-- Steps JSONB structure:
-- [
--   {
--     "step": 0,
--     "agent": "matcher",
--     "action": "parse_air_report",
--     "status": "completed",         -- pending, in_progress, completed, failed, skipped
--     "started_at": "2026-03-22T...",
--     "completed_at": "2026-03-22T...",
--     "items_in": 1,                 -- items received from previous step
--     "items_out": 5,                -- items produced for next step
--     "notes": "Parsed 5 matching contacts from AIR report #47"
--   },
--   { "step": 1, "agent": "enricher", ... }
-- ]

CREATE INDEX IF NOT EXISTS idx_workflow_chains_status ON workflow_chains(status);
CREATE INDEX IF NOT EXISTS idx_workflow_chains_type ON workflow_chains(workflow_type);
CREATE INDEX IF NOT EXISTS idx_workflow_chains_workflow_id ON workflow_chains(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_chains_last_activity ON workflow_chains(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_chains_directive ON workflow_chains(directive_id);

-- ============================================================
-- 3. AGENT SKILLS — Reusable tools/scripts that agents can invoke
-- ============================================================
-- Houston Command can create new skills for itself, Ralph, or Tier 3 agents.
-- Skills are versioned and trackable. This is how the system builds new capabilities.

CREATE TABLE IF NOT EXISTS agent_skills (
  id SERIAL PRIMARY KEY,
  skill_id TEXT NOT NULL UNIQUE,          -- e.g. 'parse-air-report', 'geocode-radius-search'
  -- Metadata
  name TEXT NOT NULL,                      -- Human-readable: "AIR Report Parser"
  description TEXT NOT NULL,               -- What this skill does
  created_by TEXT NOT NULL,                -- Which agent created it: 'houston_command', 'david'
  -- Who can use it
  available_to TEXT[] DEFAULT '{all}',     -- e.g. '{matcher,campaign_manager}' or '{all}'
  -- The skill itself
  skill_type TEXT NOT NULL CHECK (skill_type IN (
    'prompt_template',     -- A reusable prompt/instruction block
    'api_workflow',         -- A multi-step API call sequence
    'data_transform',      -- Data parsing/transformation logic
    'analysis_template',   -- An analysis framework (e.g. "evaluate email performance")
    'decision_tree',       -- A structured decision-making framework
    'validation_rule'      -- A validation check for Ralph to apply
  )),
  content TEXT NOT NULL,                   -- The actual skill content (prompt, code, template)
  parameters JSONB DEFAULT '{}',           -- Input parameters the skill expects
  -- Versioning
  version INTEGER DEFAULT 1,
  previous_version_id INTEGER REFERENCES agent_skills(id) ON DELETE SET NULL,
  -- Performance tracking
  times_used INTEGER DEFAULT 0,
  avg_success_rate NUMERIC(5,2),           -- 0.00-100.00
  last_used_at TIMESTAMPTZ,
  last_used_by TEXT,
  -- Lifecycle
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'experimental', 'archived')),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_skill_id ON agent_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_agent_skills_status ON agent_skills(status);
CREATE INDEX IF NOT EXISTS idx_agent_skills_created_by ON agent_skills(created_by);
CREATE INDEX IF NOT EXISTS idx_agent_skills_type ON agent_skills(skill_type);

-- ============================================================
-- 4. EMAIL TRACKING ON CONTACTS — track_emails toggle
-- ============================================================
-- When ON, Postmaster auto-logs all emails to/from this contact as CRM activities.
-- Default OFF to keep noise down (especially for Dad's high-volume contacts).

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS track_emails BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS track_emails_since TIMESTAMPTZ;

-- ============================================================
-- 5. UPDATE DIRECTIVES SCOPE — Add new agent targets
-- ============================================================
-- The original CHECK constraint only included the original agents.
-- Need to add: postmaster, campaign_manager, logger, gemini

ALTER TABLE directives DROP CONSTRAINT IF EXISTS directives_scope_check;
ALTER TABLE directives ADD CONSTRAINT directives_scope_check
  CHECK (scope IN (
    'all', 'command', 'sonnet',
    'enricher', 'ralph', 'ralph_gpt', 'ralph_gemini',
    'matcher', 'scout', 'researcher', 'logger',
    'postmaster', 'campaign_manager'
  ));

-- ============================================================
-- 6. UPDATE PRIORITY BOARD — Add new priority types
-- ============================================================
-- Add types for: improvement proposals, email operations, campaign sends, skill creation

ALTER TABLE agent_priority_board DROP CONSTRAINT IF EXISTS agent_priority_board_priority_type_check;
ALTER TABLE agent_priority_board ADD CONSTRAINT agent_priority_board_priority_type_check
  CHECK (priority_type IN (
    -- Original types
    'enrich_company', 'enrich_contact',
    'research_company', 'research_property',
    'match_contact', 'match_property',
    'verify_email', 'flag_for_outreach',
    'urgent_review',
    -- New types for expanded agent system
    'improvement_proposal',    -- Tier 2 → Houston Command improvement idea
    'send_campaign',           -- Campaign Manager: send approved outreach
    'log_email_activity',      -- Postmaster: log email as CRM activity
    'parse_air_report',        -- Postmaster → Matcher: AIR report detected
    'triage_email',            -- Postmaster: flag urgent email for team
    'create_skill',            -- Houston Command → agent: build a new skill
    'review_skill',            -- Agent → Ralph: review a newly created skill
    'workflow_step'            -- Generic: next step in a workflow chain
  ));

-- ============================================================
-- 7. ADD workflow_id TO EXISTING TABLES — Chain tracking
-- ============================================================
-- So sandbox items and priority board entries can reference their parent workflow.

ALTER TABLE sandbox_contacts ADD COLUMN IF NOT EXISTS workflow_id TEXT;
ALTER TABLE sandbox_enrichments ADD COLUMN IF NOT EXISTS workflow_id TEXT;
ALTER TABLE sandbox_signals ADD COLUMN IF NOT EXISTS workflow_id TEXT;
ALTER TABLE sandbox_outreach ADD COLUMN IF NOT EXISTS workflow_id TEXT;
ALTER TABLE agent_priority_board ADD COLUMN IF NOT EXISTS workflow_id TEXT;
ALTER TABLE outbound_email_queue ADD COLUMN IF NOT EXISTS workflow_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sandbox_contacts_workflow ON sandbox_contacts(workflow_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_enrichments_workflow ON sandbox_enrichments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_signals_workflow ON sandbox_signals(workflow_id);
CREATE INDEX IF NOT EXISTS idx_sandbox_outreach_workflow ON sandbox_outreach(workflow_id);
CREATE INDEX IF NOT EXISTS idx_priority_board_workflow ON agent_priority_board(workflow_id);
CREATE INDEX IF NOT EXISTS idx_outbound_email_workflow ON outbound_email_queue(workflow_id);
