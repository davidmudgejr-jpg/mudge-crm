-- Migration 007: AI Master System — Sandbox Tables & Agent Infrastructure
-- Creates the data layer for the tiered AI agent fleet (local models → Sandbox → Tier 2 review → production)
-- Full architecture: ai-system/ARCHITECTURE.md

-- ============================================================
-- SANDBOX TABLES — Where local agents write (NEVER to production)
-- ============================================================

-- Sandbox: Researched contacts pending review
CREATE TABLE IF NOT EXISTS sandbox_contacts (
  id SERIAL PRIMARY KEY,
  -- Contact data (mirrors contacts table structure)
  full_name TEXT,
  first_name TEXT,
  email TEXT,
  email_2 TEXT,
  email_3 TEXT,
  phone_1 TEXT,
  phone_2 TEXT,
  phone_3 TEXT,
  home_address TEXT,
  work_address TEXT,
  work_city TEXT,
  work_state TEXT,
  work_zip TEXT,
  title TEXT,
  type TEXT,
  company_name TEXT,
  linkedin TEXT,
  data_source TEXT,
  -- Sandbox metadata
  agent_name TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  sources TEXT[], -- e.g. {'open_corporates','white_pages','been_verified','neverbounce'}
  source_urls JSONB DEFAULT '{}',
  notes TEXT,
  -- Review workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'promoted')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  promoted_at TIMESTAMPTZ,
  promoted_to_id INTEGER, -- contacts.id after promotion
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sandbox_contacts_status ON sandbox_contacts(status);
CREATE INDEX idx_sandbox_contacts_agent ON sandbox_contacts(agent_name);
CREATE INDEX idx_sandbox_contacts_confidence ON sandbox_contacts(confidence_score);
CREATE INDEX idx_sandbox_contacts_created ON sandbox_contacts(created_at);

-- Sandbox: Enrichment data for existing contacts
CREATE TABLE IF NOT EXISTS sandbox_enrichments (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  -- Enrichment fields (any field that can be updated on a contact)
  field_name TEXT NOT NULL, -- which contact field this enriches (e.g. 'email', 'phone_1', 'work_address')
  old_value TEXT, -- current value in contacts table (for review context)
  new_value TEXT NOT NULL, -- proposed new value
  -- Sandbox metadata
  agent_name TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  source TEXT, -- e.g. 'white_pages', 'been_verified'
  source_url TEXT,
  notes TEXT,
  -- Review workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'promoted')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  promoted_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sandbox_enrichments_status ON sandbox_enrichments(status);
CREATE INDEX idx_sandbox_enrichments_contact ON sandbox_enrichments(contact_id);
CREATE INDEX idx_sandbox_enrichments_agent ON sandbox_enrichments(agent_name);
CREATE INDEX idx_sandbox_enrichments_created ON sandbox_enrichments(created_at);

-- Sandbox: Market intelligence signals
CREATE TABLE IF NOT EXISTS sandbox_signals (
  id SERIAL PRIMARY KEY,
  signal_type TEXT NOT NULL CHECK (signal_type IN (
    'company_expansion', 'new_lease', 'sale_closed', 'funding',
    'hiring', 'relocation', 'market_trend', 'lease_expiration',
    'distress', 'other'
  )),
  headline TEXT NOT NULL,
  details TEXT,
  source_url TEXT,
  source_name TEXT, -- e.g. 'CoStar', 'GlobeSt', 'X', 'LinkedIn'
  -- CRM cross-references
  companies_mentioned TEXT[],
  properties_mentioned TEXT[],
  crm_company_ids INTEGER[], -- matched company IDs in IE CRM
  crm_property_ids INTEGER[], -- matched property IDs in IE CRM
  crm_match BOOLEAN DEFAULT FALSE,
  relevance TEXT DEFAULT 'medium' CHECK (relevance IN ('high', 'medium', 'low')),
  -- Sandbox metadata
  agent_name TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  notes TEXT,
  -- Review workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'promoted')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  promoted_at TIMESTAMPTZ,
  -- What was created on promotion (interaction, action_item, or both)
  promoted_interaction_id INTEGER,
  promoted_action_item_id INTEGER,
  -- Timestamps
  timestamp_found TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sandbox_signals_status ON sandbox_signals(status);
CREATE INDEX idx_sandbox_signals_type ON sandbox_signals(signal_type);
CREATE INDEX idx_sandbox_signals_agent ON sandbox_signals(agent_name);
CREATE INDEX idx_sandbox_signals_relevance ON sandbox_signals(relevance);
CREATE INDEX idx_sandbox_signals_crm_match ON sandbox_signals(crm_match);
CREATE INDEX idx_sandbox_signals_created ON sandbox_signals(created_at);

-- Sandbox: Draft outreach emails
CREATE TABLE IF NOT EXISTS sandbox_outreach (
  id SERIAL PRIMARY KEY,
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  contact_name TEXT,
  email TEXT NOT NULL,
  -- Email content
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  -- Context
  property_address TEXT,
  property_details JSONB DEFAULT '{}', -- {sf, rate, type, etc.}
  match_reason TEXT, -- why this contact was matched to this property
  air_report_source TEXT, -- which AIR report triggered this
  -- Deduplication
  dedup_key TEXT, -- hash of contact_id + property_address for dedup checks
  -- Sandbox metadata
  agent_name TEXT NOT NULL,
  confidence_score INTEGER DEFAULT 0 CHECK (confidence_score >= 0 AND confidence_score <= 100),
  notes TEXT,
  -- Review workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'sent')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  sent_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sandbox_outreach_status ON sandbox_outreach(status);
CREATE INDEX idx_sandbox_outreach_contact ON sandbox_outreach(contact_id);
CREATE INDEX idx_sandbox_outreach_agent ON sandbox_outreach(agent_name);
CREATE INDEX idx_sandbox_outreach_dedup ON sandbox_outreach(dedup_key);
CREATE INDEX idx_sandbox_outreach_created ON sandbox_outreach(created_at);

-- ============================================================
-- AGENT INFRASTRUCTURE — Health monitoring & logging
-- ============================================================

-- Agent heartbeats — latest status per agent
CREATE TABLE IF NOT EXISTS agent_heartbeats (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('running', 'idle', 'error', 'offline')),
  current_task TEXT,
  items_processed_today INTEGER DEFAULT 0,
  items_in_queue INTEGER DEFAULT 0,
  last_error TEXT,
  metadata JSONB DEFAULT '{}', -- flexible agent-specific metrics
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint so we can UPSERT on heartbeat
CREATE UNIQUE INDEX idx_agent_heartbeats_name ON agent_heartbeats(agent_name);
CREATE INDEX idx_agent_heartbeats_status ON agent_heartbeats(status);

-- Agent logs — structured activity log
CREATE TABLE IF NOT EXISTS agent_logs (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  log_type TEXT NOT NULL DEFAULT 'activity' CHECK (log_type IN ('activity', 'error', 'daily_summary', 'system')),
  content TEXT NOT NULL,
  metrics JSONB DEFAULT '{}', -- flexible metrics per log entry
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_logs_agent ON agent_logs(agent_name);
CREATE INDEX idx_agent_logs_type ON agent_logs(log_type);
CREATE INDEX idx_agent_logs_created ON agent_logs(created_at);

-- ============================================================
-- API KEY MANAGEMENT — Per-agent authentication
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_api_keys (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL,
  api_key TEXT NOT NULL UNIQUE, -- hashed key stored here
  key_prefix TEXT NOT NULL, -- first 8 chars of key for display (e.g. "ak_enr_...")
  tier INTEGER NOT NULL CHECK (tier IN (1, 2, 3)),
  permissions TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'read_contacts','write_sandbox','heartbeat'}
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  rate_limit_per_minute INTEGER DEFAULT 60,
  notes TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_ai_api_keys_key ON ai_api_keys(api_key);
CREATE INDEX idx_ai_api_keys_agent ON ai_api_keys(agent_name);
CREATE INDEX idx_ai_api_keys_active ON ai_api_keys(active);

-- ============================================================
-- INTER-AGENT COORDINATION — Priority Board
-- ============================================================
-- Lightweight event bus for cross-agent coordination.
-- Agents post priorities for other agents; targets check at start of each cycle.
-- Full design doc: ai-system/COORDINATION.md

CREATE TABLE IF NOT EXISTS agent_priority_board (
  id SERIAL PRIMARY KEY,
  -- Who posted this
  source_agent TEXT NOT NULL,
  source_context TEXT,                 -- what triggered it (e.g. "signal #47")
  -- Who should act on it
  target_agent TEXT NOT NULL,
  -- What to do
  priority_type TEXT NOT NULL CHECK (priority_type IN (
    'enrich_company', 'enrich_contact',
    'research_company', 'research_property',
    'match_contact', 'match_property',
    'verify_email', 'flag_for_outreach',
    'urgent_review'
  )),
  payload JSONB NOT NULL DEFAULT '{}', -- flexible data: company_name, contact_id, etc.
  reason TEXT NOT NULL,                -- human-readable: why this priority was created
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low', 'normal', 'high')),
  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'picked_up', 'completed', 'expired', 'skipped')),
  picked_up_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  result_notes TEXT,
  -- Auto-expiry (default 72 hours)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '72 hours'),
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_priority_board_target ON agent_priority_board(target_agent, status);
CREATE INDEX idx_priority_board_urgency ON agent_priority_board(urgency, status);
CREATE INDEX idx_priority_board_created ON agent_priority_board(created_at);
CREATE INDEX idx_priority_board_expires ON agent_priority_board(expires_at);

-- ============================================================
-- ESCALATION QUEUE — Tier 2 → Tier 1
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_escalations (
  id SERIAL PRIMARY KEY,
  -- What's being escalated
  sandbox_table TEXT NOT NULL,         -- which sandbox table the item is in
  sandbox_id INTEGER NOT NULL,         -- row ID in that sandbox table
  -- Who escalated and why
  escalated_by TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'high', 'critical')),
  reason TEXT NOT NULL,
  recommendation TEXT,                 -- Tier 2's suggested action
  context JSONB DEFAULT '{}',
  -- Tier 1 response
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  decision TEXT CHECK (decision IN ('approve', 'reject', 'investigate', 'defer_to_david')),
  decision_reasoning TEXT,
  action_taken TEXT,
  instruction_update TEXT,             -- if an agent.md was changed as a result
  resolved_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_escalations_status ON agent_escalations(status);
CREATE INDEX idx_escalations_urgency ON agent_escalations(urgency, status);
CREATE INDEX idx_escalations_created ON agent_escalations(created_at);

-- ============================================================
-- COMMENTS
-- ============================================================

COMMENT ON TABLE sandbox_contacts IS 'AI agent researched contacts — pending Tier 2 review before promotion to contacts table';
COMMENT ON TABLE sandbox_enrichments IS 'AI agent enrichment proposals for existing contacts — pending review';
COMMENT ON TABLE sandbox_signals IS 'AI agent market intelligence signals — pending review and promotion to interactions/action_items';
COMMENT ON TABLE sandbox_outreach IS 'AI agent draft outreach emails — pending review before sending';
COMMENT ON TABLE agent_heartbeats IS 'Latest health status per AI agent — updated every 60 seconds';
COMMENT ON TABLE agent_logs IS 'Structured activity logs from all AI agents — feeds the self-improvement loop';
COMMENT ON TABLE ai_api_keys IS 'API key management for AI agent authentication — scoped per agent and tier';
COMMENT ON TABLE agent_priority_board IS 'Cross-agent coordination — agents post priorities for other agents to pick up';
COMMENT ON TABLE agent_escalations IS 'Tier 2 → Tier 1 escalation queue with decision tracking';

-- ============================================================
-- EMAIL INFRASTRUCTURE — Outbound queue + engagement tracking
-- ============================================================
-- Full design doc: ai-system/EMAIL-INFRASTRUCTURE.md

CREATE TABLE IF NOT EXISTS outbound_email_queue (
  id SERIAL PRIMARY KEY,
  sandbox_outreach_id INTEGER REFERENCES sandbox_outreach(id),
  -- Email details
  to_email TEXT NOT NULL,
  to_name TEXT,
  from_email TEXT NOT NULL DEFAULT 'david@mudgeteamcre.com',
  from_name TEXT NOT NULL DEFAULT 'David Mudge',
  reply_to TEXT NOT NULL DEFAULT 'david@mudgeteamcre.com',
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  -- Sending metadata
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'sending', 'sent', 'failed', 'cancelled'
  )),
  scheduled_for TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  -- Email service response (Postmark)
  postmark_message_id TEXT,
  postmark_error TEXT,
  -- Engagement tracking (updated via webhooks)
  opened_at TIMESTAMPTZ,
  opened_count INTEGER DEFAULT 0,
  clicked_at TIMESTAMPTZ,
  clicked_count INTEGER DEFAULT 0,
  replied_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  bounce_type TEXT CHECK (bounce_type IN ('hard', 'soft', 'spam_complaint')),
  unsubscribed_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_queue_status ON outbound_email_queue(status);
CREATE INDEX idx_email_queue_scheduled ON outbound_email_queue(scheduled_for);
CREATE INDEX idx_email_queue_postmark ON outbound_email_queue(postmark_message_id);
CREATE INDEX idx_email_queue_sandbox ON outbound_email_queue(sandbox_outreach_id);

-- Do-not-email support on contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email_reason TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email_at TIMESTAMPTZ;

CREATE INDEX idx_contacts_do_not_email ON contacts(do_not_email) WHERE do_not_email = TRUE;

COMMENT ON TABLE outbound_email_queue IS 'Outbound email delivery queue with full engagement tracking via Postmark webhooks';

-- ============================================================
-- COST & USAGE TRACKING — Per-agent, per-service usage logging
-- ============================================================
-- Full design doc: ai-system/OPERATIONS.md

CREATE TABLE IF NOT EXISTS ai_usage_tracking (
  id SERIAL PRIMARY KEY,
  -- What was used
  service TEXT NOT NULL,              -- 'claude_api', 'chatgpt', 'neverbounce', 'white_pages', etc.
  agent_name TEXT,                    -- which agent triggered the usage
  -- Usage details
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_cost DECIMAL(10, 6),
  -- CRM cross-references (optional — tracks which record triggered the cost)
  contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  -- Metadata
  request_details JSONB DEFAULT '{}', -- request/response summary for debugging
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_service ON ai_usage_tracking(service);
CREATE INDEX idx_ai_usage_agent ON ai_usage_tracking(agent_name);
CREATE INDEX idx_ai_usage_created ON ai_usage_tracking(created_at);
CREATE INDEX idx_ai_usage_cost ON ai_usage_tracking(total_cost);

COMMENT ON TABLE ai_usage_tracking IS 'Per-agent per-service usage and cost tracking — feeds the Cost & ROI dashboard panel';
