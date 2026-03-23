-- Migration 026: Call Transcripts (Fireflies Integration)
-- Stores full call transcripts separately from interactions/activities.
-- Activities get a short AI summary; full transcript lives here for
-- Oracle signal extraction and deep analysis.
--
-- Date: 2026-03-23

-- ============================================================
-- 1. CALL TRANSCRIPTS TABLE
-- Full transcripts from Fireflies (phone + Zoom calls)
-- Linked to interaction records via interaction_id
-- ============================================================

CREATE TABLE IF NOT EXISTS call_transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Links to CRM records
    interaction_id UUID REFERENCES interactions(interaction_id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(contact_id) ON DELETE SET NULL,
    property_id UUID REFERENCES properties(property_id) ON DELETE SET NULL,
    company_id UUID REFERENCES companies(company_id) ON DELETE SET NULL,

    -- Fireflies metadata
    fireflies_meeting_id TEXT UNIQUE,              -- Fireflies unique ID (for dedup)
    fireflies_title TEXT,                           -- Meeting title from Fireflies
    recording_url TEXT,                             -- Link back to Fireflies recording
    audio_url TEXT,                                 -- Direct audio link if available

    -- Call metadata
    call_date TIMESTAMPTZ NOT NULL,                -- When the call happened
    duration_seconds INT,                           -- Call length
    call_type TEXT DEFAULT 'phone',                 -- 'phone', 'zoom', 'teams', 'meet', 'in_person'
    caller TEXT,                                    -- Who initiated (david, dad, contact)
    speakers JSONB DEFAULT '[]',                    -- Array of {name, email, talk_time_pct}

    -- Transcript content
    transcript_text TEXT,                           -- FULL transcript (can be 10,000+ words)
    transcript_segments JSONB DEFAULT '[]',         -- Timestamped segments: [{speaker, text, start_ms, end_ms}]

    -- AI-generated content
    ai_summary TEXT,                                -- 3-5 sentence summary (this goes into the interaction record)
    ai_key_points JSONB DEFAULT '[]',              -- Bullet points: ["Discussed Jurupa Ave pricing", "Mike mentioned partner Steve"]
    ai_action_items JSONB DEFAULT '[]',            -- Detected action items: ["Follow up in 2 weeks", "Send BOV"]
    ai_topics JSONB DEFAULT '[]',                  -- Topics discussed: ["pricing", "market conditions", "lease terms"]

    -- Oracle signal extraction
    oracle_signals JSONB DEFAULT '[]',             -- Detected intent/engagement signals
    -- Example: [
    --   {"phrase": "thinking about options", "signal": "thinking_about_options",
    --    "category": "transcript", "weight": 75, "timestamp_ms": 154000},
    --   {"phrase": "what are cap rates", "signal": "asking_market_questions",
    --    "category": "transcript", "weight": 80, "timestamp_ms": 312000}
    -- ]
    oracle_signal_count INT DEFAULT 0,             -- Quick count for dashboard display

    -- Sentiment analysis
    sentiment_score NUMERIC,                       -- Overall call sentiment (-1.0 to 1.0)
    sentiment_label TEXT,                           -- 'very_positive', 'positive', 'neutral', 'negative', 'very_negative'
    sentiment_trajectory TEXT,                      -- vs. last call with same contact: 'improving', 'stable', 'declining'

    -- Processing status
    processing_status TEXT DEFAULT 'pending',       -- 'pending', 'processing', 'completed', 'failed'
    processed_by TEXT,                              -- 'houston_sonnet', 'postmaster', 'oracle'
    processed_at TIMESTAMPTZ,
    oracle_ingested BOOLEAN DEFAULT false,          -- Has Oracle processed this for scoring?
    oracle_ingested_at TIMESTAMPTZ,

    -- Who made/received the call
    our_caller TEXT,                                -- 'david', 'dad', 'sister', 'unknown'

    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_transcripts_contact ON call_transcripts(contact_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_property ON call_transcripts(property_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_interaction ON call_transcripts(interaction_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_fireflies ON call_transcripts(fireflies_meeting_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_date ON call_transcripts(call_date DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_status ON call_transcripts(processing_status);
CREATE INDEX IF NOT EXISTS idx_transcripts_oracle ON call_transcripts(oracle_ingested) WHERE oracle_ingested = false;
CREATE INDEX IF NOT EXISTS idx_transcripts_sentiment ON call_transcripts(sentiment_label);
CREATE INDEX IF NOT EXISTS idx_transcripts_our_caller ON call_transcripts(our_caller);

-- ============================================================
-- 2. ADD transcript_id TO INTERACTIONS
-- So activities can link back to their full transcript
-- ============================================================

ALTER TABLE interactions ADD COLUMN IF NOT EXISTS transcript_id UUID REFERENCES call_transcripts(id) ON DELETE SET NULL;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS has_transcript BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_interactions_transcript ON interactions(transcript_id) WHERE transcript_id IS NOT NULL;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New table: call_transcripts (full Fireflies transcripts with AI analysis)
-- New columns on interactions: transcript_id, has_transcript
--
-- FLOW:
-- 1. Fireflies webhook → POST /api/ai/transcripts/ingest
-- 2. Full transcript stored in call_transcripts
-- 3. AI generates summary → creates interaction record with summary
-- 4. interaction.transcript_id links back to full transcript
-- 5. Oracle extracts signals for prediction scoring
