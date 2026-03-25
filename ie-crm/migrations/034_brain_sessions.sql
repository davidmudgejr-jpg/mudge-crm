-- Migration 034: Brain Sessions (Team Sessions)
-- Extends council_meetings to support both Council of Minds (AI-only)
-- and Brain Sessions (David + Houston Command + Claude Code)

-- Add meeting_type to distinguish session types
ALTER TABLE council_meetings
  ADD COLUMN IF NOT EXISTS meeting_type TEXT DEFAULT 'council_of_minds'
    CHECK (meeting_type IN ('council_of_minds', 'team_session'));

-- Expand the round options for team_session posts
-- (team sessions don't follow the 5-round protocol — they're freeform conversation)
ALTER TABLE council_meeting_posts
  DROP CONSTRAINT IF EXISTS council_meeting_posts_round_check;

ALTER TABLE council_meeting_posts
  ADD CONSTRAINT council_meeting_posts_round_check CHECK (round IN (
    -- Council of Minds rounds (existing)
    'opening_brief', 'independent_analysis', 'debate', 'proposals', 'final_report', 'follow_up',
    -- Team Session rounds (new)
    'discussion', 'decision', 'action_item', 'summary'
  ));

-- Index on meeting_type for filtering
CREATE INDEX IF NOT EXISTS idx_council_meetings_type ON council_meetings(meeting_type);
