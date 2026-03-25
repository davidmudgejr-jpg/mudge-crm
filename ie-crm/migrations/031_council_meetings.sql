-- Migration 031: Council of Minds Meeting System
-- Reddit-style threaded meetings between Houston Command, Ralph GPT, and Ralph Gemini
-- Each meeting = a thread with posts from each participant
-- Best ideas get promoted to improvement_proposals

-- ============================================================
-- Council Meetings (the thread itself)
-- ============================================================
CREATE TABLE IF NOT EXISTS council_meetings (
  id SERIAL PRIMARY KEY,
  meeting_id TEXT UNIQUE NOT NULL,  -- e.g. 'council-2026-03-24'
  title TEXT NOT NULL,               -- e.g. 'Council of Minds — March 24 — Enrichment Quality Review'
  topic TEXT,                        -- Primary topic for this session
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN (
    'scheduled', 'in_progress', 'completed', 'cancelled'
  )),
  -- Participants
  participants TEXT[] DEFAULT '{houston_command,ralph_gpt,ralph_gemini}',
  -- Summary (written by Houston Command at the end)
  summary TEXT,
  -- Key outcomes
  proposals_generated INTEGER DEFAULT 0,
  proposals_accepted INTEGER DEFAULT 0,
  action_items JSONB DEFAULT '[]',
  -- Top recommendations (sent to David)
  top_recommendations JSONB DEFAULT '[]',
  -- Timing
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  -- Metadata
  meeting_number INTEGER,  -- Sequential count (1st, 2nd, 3rd meeting...)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_council_meetings_status ON council_meetings(status);
CREATE INDEX IF NOT EXISTS idx_council_meetings_created ON council_meetings(created_at DESC);

-- ============================================================
-- Council Meeting Posts (individual messages within a thread)
-- ============================================================
CREATE TABLE IF NOT EXISTS council_meeting_posts (
  id SERIAL PRIMARY KEY,
  meeting_id TEXT NOT NULL REFERENCES council_meetings(meeting_id) ON DELETE CASCADE,
  -- Who posted
  author TEXT NOT NULL,  -- 'houston_command', 'ralph_gpt', 'ralph_gemini', 'david', 'system'
  author_display_name TEXT,  -- 'Houston Command', 'Ralph GPT', etc.
  author_model TEXT,         -- 'Opus 4.6', 'GPT-4', 'Gemini Pro'
  -- Content
  round TEXT CHECK (round IN (
    'opening_brief', 'independent_analysis', 'debate', 'proposals', 'final_report', 'follow_up'
  )),
  round_number INTEGER,  -- 1-5 per the protocol
  body TEXT NOT NULL,
  -- Reactions / engagement
  upvotes INTEGER DEFAULT 0,
  downvotes INTEGER DEFAULT 0,
  david_reaction TEXT CHECK (david_reaction IN ('agree', 'disagree', 'interesting', 'implement', NULL)),
  -- If this post contains a proposal
  has_proposal BOOLEAN DEFAULT false,
  proposal_id INTEGER REFERENCES improvement_proposals(id),
  -- Metadata
  word_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_council_posts_meeting ON council_meeting_posts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_council_posts_author ON council_meeting_posts(author);
CREATE INDEX IF NOT EXISTS idx_council_posts_round ON council_meeting_posts(round);
CREATE INDEX IF NOT EXISTS idx_council_posts_has_proposal ON council_meeting_posts(has_proposal) WHERE has_proposal = true;

-- ============================================================
-- Add david_approved field to improvement_proposals
-- So David can approve/disapprove directly from the UI
-- ============================================================
ALTER TABLE improvement_proposals
  ADD COLUMN IF NOT EXISTS david_decision TEXT CHECK (david_decision IN ('approved', 'rejected', 'needs_discussion', NULL)),
  ADD COLUMN IF NOT EXISTS david_decision_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS david_notes TEXT,
  ADD COLUMN IF NOT EXISTS meeting_id TEXT,  -- Which council meeting generated this proposal
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;  -- 0=normal, 1=high, 2=urgent
