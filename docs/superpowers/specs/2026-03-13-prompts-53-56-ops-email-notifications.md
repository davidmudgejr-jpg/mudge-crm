# Prompts 53-56: AI Ops Dashboard, Search/Bulk Ops, Email Pipeline & Notifications

**Round 5 — Implementation Bridge**
**Date:** 2026-03-13
**Scope:** Operational visibility, advanced search and bulk operations, inbound/outbound email automation via Postmark, and multi-channel notification infrastructure (Telegram, in-app, push).
**Depends on:** Prompts 49-52 (agent runtime, lifecycle, coordination, CRM pages), Prompt 57 (RBAC for permission scoping)
**Hardware:** Mac Mini M4 Pro (36GB RAM), Express backend on Railway, React frontend on Vercel, PostgreSQL on Neon

---

## Table of Contents

1. [Prompt 53 — AI Ops Dashboard](#prompt-53--ai-ops-dashboard)
2. [Prompt 54 — Search, Bulk Operations & Document Attachments](#prompt-54--search-bulk-operations--document-attachments)
3. [Prompt 55 — Email Pipeline via Postmark](#prompt-55--email-pipeline-via-postmark)
4. [Prompt 56 — Notification & Alerting Infrastructure](#prompt-56--notification--alerting-infrastructure)
5. [New Tables Summary](#new-tables-summary)
6. [Implementation Priority & Dependencies](#implementation-priority--dependencies)

---

<a id="prompt-53--ai-ops-dashboard"></a>
## Prompt 53 — AI Ops Dashboard

### 53.1 The Problem

Six AI agents (Enricher, Researcher, Matcher, Scout, Logger, Chief of Staff) run autonomously on the Mac Mini. David currently has **zero visibility** into what they're doing, whether they're healthy, how much they cost, or what they've accomplished. Without a dashboard:
- Agent crashes go unnoticed until David wonders why no new data appeared
- Cost overruns from Claude API calls are invisible until the monthly bill arrives
- There's no way to see agent output quality without SSH-ing into the Mac Mini
- Sandbox items pile up with no visual queue for approval/rejection
- The Chief of Staff's instruction updates happen in a black box

### 53.2 Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  AI Ops Dashboard                                    [Live] [24h]  │
├──────────────────┬──────────────────────────────────────────────────┤
│                  │                                                  │
│  AGENT FLEET     │  SELECTED AGENT: Enricher                       │
│  ─────────────   │  ──────────────────────────────────────────────  │
│                  │                                                  │
│  🟢 Enricher     │  Status: Running  │  Last cycle: 3m ago         │
│  🟢 Researcher   │  Model: qwen3.5-32b  │  Cycles today: 47       │
│  🟡 Matcher      │  Items processed: 142  │  Success rate: 94%     │
│  🟢 Scout        │                                                  │
│  🟢 Logger       │  ┌─ RECENT CYCLES ──────────────────────────┐   │
│  🔴 Chief of Stf │  │ 10:42 AM  5 contacts enriched (4 ✓ 1 ✗) │   │
│                  │  │ 10:27 AM  5 contacts enriched (5 ✓ 0 ✗) │   │
│  ─────────────   │  │ 10:12 AM  4 contacts enriched (3 ✓ 1 ✗) │   │
│  COST TODAY      │  │ 09:57 AM  5 contacts enriched (5 ✓ 0 ✗) │   │
│  $0.00 (Ollama)  │  └──────────────────────────────────────────┘   │
│  $2.14 (Claude)  │                                                  │
│                  │  ┌─ SANDBOX QUEUE (3 pending) ──────────────┐   │
│  ITEMS TODAY     │  │ ABC Logistics — phone + email found       │   │
│  Enriched: 142   │  │ XYZ Holdings — owner name updated        │   │
│  Signals: 23     │  │ 1234 Industrial — vacancy data proxy     │   │
│  Matches: 8      │  │                    [Approve All] [Review] │   │
│  Alerts: 2       │  └──────────────────────────────────────────┘   │
│                  │                                                  │
├──────────────────┴──────────────────────────────────────────────────┤
│  ACTIVITY TIMELINE                                                  │
│  ───────────────────────────────────────────────────────────────── │
│  10:42  Enricher  Enriched 5 contacts (4 approved, 1 flagged)      │
│  10:38  Scout     New model alert: Qwen 3.5 released on Ollama     │
│  10:35  Researcher  3 market signals: Fontana vacancy down 2%      │
│  10:27  Enricher  Enriched 5 contacts (5 approved)                 │
│  10:15  Matcher   Matched XYZ Corp to 2 properties (score: 87, 73) │
└─────────────────────────────────────────────────────────────────────┘
```

### 53.3 Database Schema

#### Migration: `XXX_ai_ops_dashboard.sql`

```sql
-- ============================================================
-- AGENT STATUS (real-time fleet health)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_status (
  agent_name TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'stopped'
    CHECK (status IN ('running', 'idle', 'error', 'stopped', 'paused')),
  last_heartbeat TIMESTAMPTZ,
  last_cycle_start TIMESTAMPTZ,
  last_cycle_end TIMESTAMPTZ,
  last_cycle_items_processed INT DEFAULT 0,
  last_cycle_items_succeeded INT DEFAULT 0,
  last_cycle_items_failed INT DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  current_model TEXT,
  uptime_seconds BIGINT DEFAULT 0,
  total_cycles_today INT DEFAULT 0,
  total_items_today INT DEFAULT 0,
  host_machine TEXT DEFAULT 'mac-mini-m4-pro',
  config_version TEXT,
  instruction_version TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AGENT CYCLE LOG (per-cycle audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_cycle_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  cycle_number INT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds NUMERIC,
  items_attempted INT DEFAULT 0,
  items_succeeded INT DEFAULT 0,
  items_failed INT DEFAULT 0,
  items_skipped INT DEFAULT 0,
  model_used TEXT,
  input_tokens INT DEFAULT 0,
  output_tokens INT DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) DEFAULT 0,
  error_summary TEXT,
  cycle_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_cycle_log_agent ON agent_cycle_log(agent_name);
CREATE INDEX idx_agent_cycle_log_started ON agent_cycle_log(started_at DESC);
CREATE INDEX idx_agent_cycle_log_agent_date ON agent_cycle_log(agent_name, started_at DESC);

-- ============================================================
-- AGENT COST TRACKING (daily aggregates)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_cost_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  model TEXT NOT NULL,
  total_input_tokens BIGINT DEFAULT 0,
  total_output_tokens BIGINT DEFAULT 0,
  total_cost_usd NUMERIC(10, 4) DEFAULT 0,
  cycle_count INT DEFAULT 0,
  items_processed INT DEFAULT 0,
  UNIQUE(agent_name, date, model)
);

CREATE INDEX idx_agent_cost_daily_date ON agent_cost_daily(date DESC);

-- ============================================================
-- SANDBOX QUEUE (pending AI changes for human review)
-- ============================================================
-- Note: sandbox tables from Prompt 49 already exist. This adds
-- a unified view and quick-action endpoints.

CREATE OR REPLACE VIEW sandbox_queue_summary AS
SELECT
  'contact' AS entity_type,
  sc.id AS sandbox_id,
  sc.entity_id,
  c.full_name AS entity_name,
  sc.changes AS proposed_changes,
  sc.source_agent,
  sc.confidence,
  sc.status,
  sc.created_at,
  sc.reviewed_at,
  sc.reviewed_by
FROM sandbox_contacts sc
LEFT JOIN contacts c ON c.id = sc.entity_id
WHERE sc.status = 'pending'

UNION ALL

SELECT
  'enrichment' AS entity_type,
  se.id AS sandbox_id,
  se.entity_id,
  COALESCE(p.property_address, c2.full_name, co.company_name) AS entity_name,
  se.changes AS proposed_changes,
  se.source_agent,
  se.confidence,
  se.status,
  se.created_at,
  se.reviewed_at,
  se.reviewed_by
FROM sandbox_enrichments se
LEFT JOIN properties p ON p.id = se.entity_id AND se.entity_type = 'property'
LEFT JOIN contacts c2 ON c2.id = se.entity_id AND se.entity_type = 'contact'
LEFT JOIN companies co ON co.id = se.entity_id AND se.entity_type = 'company'
WHERE se.status = 'pending'

ORDER BY created_at DESC;

-- ============================================================
-- AGENT ACTIVITY FEED (unified timeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_activity_feed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name TEXT NOT NULL,
  activity_type TEXT NOT NULL
    CHECK (activity_type IN (
      'cycle_complete', 'item_enriched', 'signal_found', 'match_found',
      'alert_raised', 'instruction_updated', 'error', 'model_switched',
      'sandbox_submitted', 'sandbox_approved', 'sandbox_rejected',
      'heartbeat_missed', 'agent_started', 'agent_stopped', 'agent_paused'
    )),
  summary TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'info'
    CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_activity_feed_created ON agent_activity_feed(created_at DESC);
CREATE INDEX idx_agent_activity_feed_agent ON agent_activity_feed(agent_name, created_at DESC);
CREATE INDEX idx_agent_activity_feed_severity ON agent_activity_feed(severity)
  WHERE severity IN ('warning', 'error', 'critical');

COMMENT ON TABLE agent_status IS 'Real-time agent fleet health — one row per agent, updated every heartbeat';
COMMENT ON TABLE agent_cycle_log IS 'Per-cycle audit log — what each agent did in each cycle with token/cost tracking';
COMMENT ON TABLE agent_cost_daily IS 'Daily cost aggregates per agent per model — drives cost chart in dashboard';
COMMENT ON TABLE agent_activity_feed IS 'Unified activity timeline across all agents — drives the dashboard activity feed';
```

### 53.4 API Endpoints

```
GET  /api/ai/ops/fleet-status         → agent_status rows (all agents)
GET  /api/ai/ops/cycle-log/:agent     → agent_cycle_log (paginated, last 50)
GET  /api/ai/ops/costs                → agent_cost_daily (date range filter)
GET  /api/ai/ops/costs/summary        → aggregated costs: today, this week, this month
GET  /api/ai/ops/activity-feed        → agent_activity_feed (paginated, severity filter)
GET  /api/ai/ops/sandbox-queue        → sandbox_queue_summary view
POST /api/ai/ops/sandbox/:id/approve  → approve sandbox item, apply changes to live table
POST /api/ai/ops/sandbox/:id/reject   → reject sandbox item with optional reason
POST /api/ai/ops/sandbox/bulk-approve → approve multiple sandbox items at once
POST /api/ai/ops/agent/:name/pause    → set agent status to 'paused'
POST /api/ai/ops/agent/:name/resume   → set agent status to 'running'
```

### 53.5 React Components

```
src/pages/AiOpsPage.jsx               ← Main page (sidebar nav: "AI Ops")
src/components/ai-ops/
├── AgentFleetPanel.jsx                ← Left sidebar: agent list with status indicators
├── AgentDetailPanel.jsx               ← Right panel: selected agent details
├── CycleLogTable.jsx                  ← Recent cycles table with expand for details
├── SandboxQueuePanel.jsx              ← Pending sandbox items with approve/reject
├── CostSummaryCard.jsx                ← Cost badges: today, week, month
├── CostChart.jsx                      ← 30-day cost trend chart (simple SVG bars)
├── ActivityTimeline.jsx               ← Unified activity feed with severity icons
└── AgentControlButtons.jsx            ← Pause/Resume/Restart controls
```

### 53.6 Auto-Refresh & Real-Time

The dashboard polls for updates rather than requiring WebSockets (keeping the stack simple):

| Data | Refresh Interval | Method |
|------|-------------------|--------|
| Fleet status | 15 seconds | `setInterval` + `fetch` |
| Sandbox queue | 30 seconds | `setInterval` + `fetch` |
| Activity feed | 30 seconds | `setInterval` + `fetch` |
| Cost summary | 5 minutes | `setInterval` + `fetch` |
| Cycle log | On agent select | Manual fetch |

A `[Live]` toggle in the header enables/disables auto-refresh. Default: on.

### 53.7 Permission Scoping (links to Prompt 57 RBAC)

| Role | Access |
|------|--------|
| Admin | Full — view, approve/reject sandbox, pause/resume agents, view costs |
| Agent | View only — can see status and activity but cannot approve or control agents |
| Observer | No access — AI Ops tab hidden |
| AI Agent | Write only — POST heartbeat/cycle-log/activity, cannot read dashboard |

---

<a id="prompt-54--search-bulk-operations--document-attachments"></a>
## Prompt 54 — Search, Bulk Operations & Document Attachments

### 54.1 The Problem

The CRM currently has:
- **No global search** — you must navigate to each tab and use individual column filters
- **Limited bulk operations** — only bulk delete exists (via `POST /api/bulk-delete`)
- **No file attachments** — CoStar reports, LOIs, lease abstracts, property photos all live outside the CRM in scattered folders and email threads

### 54.2 Global Search

#### Architecture

```
┌──────────────────────────────────────────────────┐
│  ⌘K  Search everything...                  [×]  │
├──────────────────────────────────────────────────┤
│  CONTACTS                                        │
│  ├─ John Smith — CFO, XYZ Holdings          📞   │
│  ├─ John Anderson — Owner, ABC Logistics    📧   │
│                                                  │
│  PROPERTIES                                      │
│  ├─ 1234 Industrial Way, Fontana            🏭   │
│  ├─ 1250 Industrial Way, Fontana            🏭   │
│                                                  │
│  COMPANIES                                       │
│  ├─ XYZ Holdings LLC                        🏢   │
│                                                  │
│  DEALS                                           │
│  ├─ XYZ Holdings — 1234 Industrial Lease    💰   │
│                                                  │
│  DOCUMENTS                                       │
│  ├─ LOI — XYZ Holdings.pdf                  📄   │
│  └─ CoStar Report — 1234 Industrial.pdf     📄   │
└──────────────────────────────────────────────────┘
```

#### Search Implementation

**Phase 1 — SQL `ILIKE` search (immediate, no new dependencies):**

```sql
-- Unified search endpoint: /api/search?q=xyz&limit=5
-- Returns top 5 results per entity type

SELECT 'contact' AS entity_type, id, full_name AS title,
  COALESCE(title, '') || ' ' || COALESCE(email, '') AS subtitle
FROM contacts
WHERE full_name ILIKE $1 OR email ILIKE $1 OR title ILIKE $1
ORDER BY full_name
LIMIT 5

UNION ALL

SELECT 'property', id, property_address,
  COALESCE(city, '') || ' ' || COALESCE(property_type, '')
FROM properties
WHERE property_address ILIKE $1 OR property_name ILIKE $1
  OR city ILIKE $1 OR owner_name ILIKE $1
ORDER BY property_address
LIMIT 5

UNION ALL

SELECT 'company', id, company_name,
  COALESCE(industry_type, '') || ' ' || COALESCE(city, '')
FROM companies
WHERE company_name ILIKE $1 OR industry_type ILIKE $1
ORDER BY company_name
LIMIT 5

UNION ALL

SELECT 'deal', id, deal_name,
  COALESCE(status, '') || ' ' || COALESCE(deal_type, '')
FROM deals
WHERE deal_name ILIKE $1
ORDER BY deal_name
LIMIT 5;
```

**Phase 2 — `pg_trgm` + GIN index (after 1000+ records):**

```sql
-- Add trigram extension and indexes for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_contacts_search_trgm ON contacts
  USING GIN ((full_name || ' ' || COALESCE(email, '') || ' ' || COALESCE(title, '')) gin_trgm_ops);

CREATE INDEX idx_properties_search_trgm ON properties
  USING GIN ((property_address || ' ' || COALESCE(city, '') || ' ' || COALESCE(owner_name, '')) gin_trgm_ops);

CREATE INDEX idx_companies_search_trgm ON companies
  USING GIN ((company_name || ' ' || COALESCE(industry_type, '')) gin_trgm_ops);

CREATE INDEX idx_deals_search_trgm ON deals
  USING GIN (deal_name gin_trgm_ops);
```

**Phase 3 — Full-text search with `tsvector` (future, if needed):**

```sql
-- Add generated tsvector columns for weighted full-text search
ALTER TABLE contacts ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', COALESCE(full_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(email, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(title, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(notes, '')), 'D')
  ) STORED;

CREATE INDEX idx_contacts_fts ON contacts USING GIN(search_vector);
```

#### React Components

The existing `CommandPalette.jsx` component already handles ⌘K — extend it to include search results from the API:

```
src/components/shared/CommandPalette.jsx  ← Extend with search API integration
src/components/shared/SearchResult.jsx    ← Individual search result row
```

### 54.3 Bulk Operations

#### Existing: Bulk Delete ✅
Already implemented via `POST /api/bulk-delete` with parameterized `DELETE FROM table WHERE id = ANY($1::uuid[])`.

#### New: Bulk Update

```
POST /api/bulk-update
Body: {
  "table": "contacts",
  "ids": ["uuid1", "uuid2", ...],
  "updates": {
    "client_level": "A",
    "tags": ["hot-lead", "industrial"]
  }
}
```

**Server-side validation:**
- Table must be in allowlist: `contacts`, `properties`, `companies`, `deals`, `action_items`, `campaigns`
- Column names validated against schema (no arbitrary SQL injection)
- Maximum 500 IDs per request
- Array columns (`TEXT[]`) handled via `$N::text[]` casting
- Audit log entry created per bulk operation (links to Prompt 58)

```sql
-- Parameterized bulk update (generated server-side)
UPDATE contacts
SET client_level = $1, tags = $2::text[], updated_at = NOW()
WHERE id = ANY($3::uuid[]);
```

#### New: Bulk Reassign

For action items — reassign responsibility in bulk:

```
POST /api/bulk-reassign
Body: {
  "table": "action_items",
  "ids": ["uuid1", "uuid2"],
  "responsibility": ["David Mudge Jr"]
}
```

#### New: Bulk Tag

Add tags without replacing existing ones:

```
POST /api/bulk-tag
Body: {
  "table": "properties",
  "ids": ["uuid1", "uuid2"],
  "tags_to_add": ["portfolio-review-q2"]
}
```

```sql
-- Array append without duplicates
UPDATE properties
SET tags = array_cat(
  COALESCE(tags, ARRAY[]::text[]),
  $1::text[]
)
WHERE id = ANY($2::uuid[]);

-- Then deduplicate:
UPDATE properties
SET tags = (SELECT ARRAY(SELECT DISTINCT unnest(tags)))
WHERE id = ANY($2::uuid[]);
```

#### UI: Bulk Action Bar

When rows are selected in any CrmTable, a floating action bar appears at the bottom:

```
┌────────────────────────────────────────────────────────────────┐
│  12 selected    [Update Field ▾]  [Add Tags]  [Reassign]  [Delete]  [× Clear] │
└────────────────────────────────────────────────────────────────┘
```

### 54.4 Document Attachments

#### Storage Architecture

**Phase 1: Local filesystem** (Mac Mini serves files, Vercel proxies)

```
~/ie-crm-files/
├── properties/
│   └── {uuid}/
│       ├── costar-report-2026-03.pdf
│       ├── aerial-photo.jpg
│       └── loi-draft.docx
├── contacts/
│   └── {uuid}/
│       └── business-card.jpg
├── deals/
│   └── {uuid}/
│       ├── lease-abstract.pdf
│       └── commission-agreement.pdf
└── companies/
    └── {uuid}/
        └── financial-statement.pdf
```

**Phase 2: S3-compatible storage** (Cloudflare R2 — $0.015/GB/month, no egress fees)

#### Database Schema

```sql
-- ============================================================
-- DOCUMENT ATTACHMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL
    CHECK (entity_type IN ('property', 'contact', 'company', 'deal', 'campaign', 'interaction')),
  entity_id UUID NOT NULL,
  filename TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,          -- relative path: properties/{uuid}/filename.pdf
  storage_backend TEXT NOT NULL DEFAULT 'local'
    CHECK (storage_backend IN ('local', 's3')),
  category TEXT DEFAULT 'general'
    CHECK (category IN (
      'general', 'costar_report', 'loi', 'lease', 'lease_abstract',
      'commission_agreement', 'photo', 'aerial', 'survey', 'brochure',
      'financial', 'tax', 'appraisal', 'inspection', 'title', 'environmental'
    )),
  description TEXT,
  uploaded_by UUID REFERENCES users(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  file_hash TEXT                       -- SHA-256 for dedup detection
);

CREATE INDEX idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_uploaded ON documents(uploaded_at DESC);

COMMENT ON TABLE documents IS 'File attachments for any CRM entity — CoStar reports, LOIs, photos, leases';
```

#### API Endpoints

```
POST   /api/documents/upload          → Multipart upload, returns document record
GET    /api/documents/:entity_type/:entity_id  → List documents for entity
GET    /api/documents/:id/download    → Stream file download
DELETE /api/documents/:id             → Soft delete (move to trash)
```

#### Upload Flow

```
1. User drags file onto detail panel → POST /api/documents/upload
2. Server:
   a. Validate file type (PDF, JPG, PNG, DOCX, XLSX, CSV — max 25MB)
   b. Generate unique filename: {uuid}-{sanitized-original-name}
   c. Compute SHA-256 hash for dedup check
   d. Write to ~/ie-crm-files/{entity_type}/{entity_id}/{filename}
   e. Insert document record into DB
   f. Return document metadata
3. React updates document list in detail panel
```

#### React Components

```
src/components/shared/DocumentSection.jsx     ← Drop zone + file list in detail views
src/components/shared/DocumentPreview.jsx     ← Inline PDF/image preview
src/components/shared/DocumentUploadZone.jsx  ← Drag-and-drop upload area
```

The `DocumentSection` component is added to all detail views (PropertyDetail, ContactDetail, DealDetail, CompanyDetail) as a collapsible section, similar to `LinkedRecordSection`.

---

<a id="prompt-55--email-pipeline-via-postmark"></a>
## Prompt 55 — Email Pipeline via Postmark

### 55.1 The Problem

David and Missy currently:
- Send CRE emails from Outlook/Gmail manually
- Manually log important emails as Interactions in the CRM
- Have no way to track email opens or clicks
- Cannot send email campaigns from within the CRM
- Lose email history when it lives only in the email client

### 55.2 Why Postmark

| Provider | Transactional | Marketing | Inbound | Price | IE CRM Fit |
|----------|--------------|-----------|---------|-------|------------|
| **Postmark** | Excellent | Adequate (Message Streams) | Yes (webhooks) | $1.25/1K emails | Best deliverability, inbound parsing built in |
| SendGrid | Good | Good | Yes | $0.65/1K | More complex, lower deliverability |
| Resend | Good | Basic | No | $0.50/1K | No inbound webhook |
| Amazon SES | Good | No | Yes (complex) | $0.10/1K | Raw — requires building everything |

**Decision: Postmark** — best deliverability (critical for cold outreach to property owners/brokers), built-in inbound processing, simple webhook setup, and Postmark's dedicated IP reputation is ideal for low-volume but high-importance CRE emails.

### 55.3 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        OUTBOUND FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CRM UI (Compose)                                               │
│       │                                                         │
│       ▼                                                         │
│  POST /api/email/send                                           │
│       │                                                         │
│       ├── Validate: sender authorized (RBAC)                    │
│       ├── Resolve recipient from contact.email                  │
│       ├── Render template (if campaign) or pass raw HTML        │
│       ├── Track: insert into email_messages (status: queued)    │
│       │                                                         │
│       ▼                                                         │
│  Postmark API: POST /email                                      │
│       │                                                         │
│       ├── Update email_messages (status: sent, message_id)      │
│       │                                                         │
│       ▼                                                         │
│  Postmark Webhooks → POST /api/webhooks/postmark                │
│       │                                                         │
│       ├── Open  → email_events (type: opened, timestamp, geo)   │
│       ├── Click → email_events (type: clicked, url, timestamp)  │
│       ├── Bounce → email_events + mark contact.email_kickback   │
│       └── Spam  → email_events + mark contact for suppression   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        INBOUND FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Reply arrives at crm@mudgeteamcre.com                          │
│       │                                                         │
│       ▼                                                         │
│  Postmark Inbound Webhook → POST /api/webhooks/postmark/inbound│
│       │                                                         │
│       ├── Parse: From, Subject, TextBody, HtmlBody, Headers     │
│       ├── Match sender to contact (by email address)            │
│       ├── Thread: match In-Reply-To header to original message  │
│       │                                                         │
│       ├── Insert email_messages (direction: inbound)            │
│       ├── Create interaction (type: Inbound Email)              │
│       ├── Link interaction to matched contact                   │
│       │                                                         │
│       ├── If no contact match:                                  │
│       │   └── Create unmatched_emails record for manual review  │
│       │                                                         │
│       └── Notify David via Telegram (if high-priority contact)  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 55.4 Database Schema

```sql
-- ============================================================
-- EMAIL MESSAGES (both outbound and inbound)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),

  -- Addressing
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  cc TEXT[],
  bcc TEXT[],
  reply_to TEXT,

  -- Content
  subject TEXT NOT NULL,
  text_body TEXT,
  html_body TEXT,

  -- Threading
  postmark_message_id TEXT,           -- Postmark's unique ID
  in_reply_to TEXT,                   -- References header for threading
  thread_id UUID,                     -- Groups conversation threads

  -- CRM linking
  contact_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),
  campaign_id UUID REFERENCES campaigns(id),
  interaction_id UUID REFERENCES interactions(id),  -- auto-created interaction
  sent_by UUID REFERENCES users(id),  -- CRM user who sent (outbound only)

  -- Status
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'queued', 'sent', 'delivered', 'opened', 'clicked',
                       'bounced', 'spam_complaint', 'failed')),

  -- Template
  template_id UUID REFERENCES email_templates(id),
  template_variables JSONB,

  -- Timestamps
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  first_opened_at TIMESTAMPTZ,
  open_count INT DEFAULT 0,
  click_count INT DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_messages_contact ON email_messages(contact_id);
CREATE INDEX idx_email_messages_thread ON email_messages(thread_id);
CREATE INDEX idx_email_messages_postmark ON email_messages(postmark_message_id);
CREATE INDEX idx_email_messages_status ON email_messages(status);
CREATE INDEX idx_email_messages_sent ON email_messages(sent_at DESC);

-- ============================================================
-- EMAIL EVENTS (webhook-driven tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked',
                          'bounced', 'spam_complaint', 'unsubscribed',
                          'link_clicked', 'subscription_changed')),
  occurred_at TIMESTAMPTZ NOT NULL,

  -- Event-specific data
  recipient_email TEXT,
  link_url TEXT,                      -- for click events
  bounce_type TEXT,                   -- hard, soft, transient
  bounce_description TEXT,
  geo_ip TEXT,                        -- approximate location from open
  user_agent TEXT,                    -- email client info

  raw_payload JSONB,                  -- full Postmark webhook payload
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_email_events_message ON email_events(email_message_id);
CREATE INDEX idx_email_events_type ON email_events(event_type);
CREATE INDEX idx_email_events_occurred ON email_events(occurred_at DESC);

-- ============================================================
-- EMAIL TEMPLATES (reusable message templates)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT DEFAULT 'general'
    CHECK (category IN ('general', 'cold_outreach', 'follow_up', 'campaign',
                         'bov', 'listing_pitch', 'tenant_rep', 'lease_renewal')),
  subject_template TEXT NOT NULL,     -- Supports {{contact.full_name}} variables
  html_template TEXT NOT NULL,
  text_template TEXT,

  -- Usage tracking
  times_used INT DEFAULT 0,
  avg_open_rate NUMERIC(5, 2),
  avg_click_rate NUMERIC(5, 2),

  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- UNMATCHED INBOUND EMAILS (no contact match found)
-- ============================================================
CREATE TABLE IF NOT EXISTS unmatched_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'matched', 'ignored', 'new_contact_created')),
  matched_contact_id UUID REFERENCES contacts(id),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id),
  raw_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_unmatched_emails_status ON unmatched_emails(status) WHERE status = 'pending';

-- ============================================================
-- EMAIL SUPPRESSION LIST (do not email)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL
    CHECK (reason IN ('hard_bounce', 'spam_complaint', 'unsubscribed', 'manual')),
  contact_id UUID REFERENCES contacts(id),
  suppressed_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT                         -- 'postmark_webhook', 'manual', 'import'
);

COMMENT ON TABLE email_messages IS 'All outbound and inbound emails with Postmark integration and threading';
COMMENT ON TABLE email_events IS 'Webhook-driven email tracking events — opens, clicks, bounces, complaints';
COMMENT ON TABLE email_templates IS 'Reusable email templates with variable interpolation and performance tracking';
COMMENT ON TABLE unmatched_emails IS 'Inbound emails that could not be matched to a CRM contact';
COMMENT ON TABLE email_suppressions IS 'Global suppression list — hard bounces, spam complaints, manual blocks';
```

### 55.5 API Endpoints

```
-- Sending
POST   /api/email/send                → Send email via Postmark (single recipient)
POST   /api/email/send-campaign       → Send to campaign contact list (batched)
POST   /api/email/draft               → Save draft without sending

-- Templates
GET    /api/email/templates            → List templates
POST   /api/email/templates            → Create template
PUT    /api/email/templates/:id        → Update template
DELETE /api/email/templates/:id        → Delete template
POST   /api/email/templates/:id/preview → Preview with sample contact data

-- History
GET    /api/email/messages             → Paginated message list (filters: contact_id, status, direction)
GET    /api/email/messages/:id         → Single message with events
GET    /api/email/thread/:thread_id    → Thread view (conversation)

-- Webhooks (Postmark calls these)
POST   /api/webhooks/postmark          → Outbound event webhook (opens, clicks, bounces)
POST   /api/webhooks/postmark/inbound  → Inbound email webhook

-- Suppressions
GET    /api/email/suppressions         → List suppressed emails
DELETE /api/email/suppressions/:email  → Remove from suppression list (re-enable sending)

-- Unmatched
GET    /api/email/unmatched            → List unmatched inbound emails
POST   /api/email/unmatched/:id/match  → Match to existing contact
POST   /api/email/unmatched/:id/create → Create new contact from email
POST   /api/email/unmatched/:id/ignore → Mark as ignored
```

### 55.6 Postmark Configuration

```
Account Setup:
  1. Create Postmark server: "IE CRM"
  2. Add sender signature: david@mudgeteamcre.com
  3. Add sender signature: missy@mudgeteamcre.com (if she sends from CRM)
  4. Set up inbound address: crm@mudgeteamcre.com
  5. Configure webhook URL: https://ie-crm-production.up.railway.app/api/webhooks/postmark

Message Streams:
  - "outbound" (default) — transactional: individual sends, replies
  - "broadcast" — marketing: campaigns, mass emails (separate reputation)

Webhook Events to Enable:
  - Delivery, Bounce, SpamComplaint, Open, Click, SubscriptionChange

Environment Variables (Railway):
  POSTMARK_SERVER_TOKEN=xxxx
  POSTMARK_INBOUND_ADDRESS=crm@mudgeteamcre.com
  POSTMARK_WEBHOOK_SECRET=xxxx    (for webhook signature verification)
```

### 55.7 Webhook Security

```javascript
// Verify Postmark webhook authenticity
function verifyPostmarkWebhook(req) {
  // Postmark doesn't sign webhooks with HMAC — instead, verify by:
  // 1. Check source IP against Postmark's published IP ranges
  // 2. Verify the webhook contains a valid MessageID that exists in our DB
  // 3. Rate limit: max 100 webhook events per minute
  // Alternative: Use a secret URL path as a shared secret
  //   e.g., /api/webhooks/postmark/{WEBHOOK_SECRET}
}
```

### 55.8 React Components

```
src/components/email/
├── EmailComposer.jsx              ← Rich text compose modal (slide-over or modal)
│   ├── Contact autocomplete for To field
│   ├── Template selector dropdown
│   ├── Variable preview ({contact.full_name} → "John Smith")
│   ├── Attach files from documents table
│   └── Send / Save Draft buttons
├── EmailThread.jsx                ← Conversation view in contact/deal detail
│   ├── Threaded messages with direction indicators (→ outbound, ← inbound)
│   ├── Open/click tracking badges
│   └── Quick reply at bottom
├── EmailTrackingBadge.jsx         ← Small badge: "Opened 3x" / "Bounced" / "No opens"
├── CampaignSendModal.jsx          ← Send to campaign contacts with template
│   ├── Preview per-contact personalization
│   ├── Suppress bounced/unsubscribed contacts
│   └── Estimated send count
└── UnmatchedEmailQueue.jsx        ← Admin view for unmatched inbound emails
```

### 55.9 Auto-Interaction Creation

When an email is sent or received, the system automatically creates an `interactions` record:

```javascript
// After successful Postmark send:
const interaction = {
  type: 'Outbound Email',
  subject: email.subject,
  date: new Date(),
  notes: `Sent to ${email.to_email}. Template: ${email.template_name || 'none'}.`,
  email_heading: email.subject,
  email_body: email.text_body,
  email_id: email.to_email,
  team_member: currentUser.name,
};
// Insert interaction, link to contact via interaction_contacts junction
// Store interaction.id back on email_messages.interaction_id for cross-reference
```

For inbound emails, `type` = `'Inbound Email'` and the interaction is linked to the matched contact.

### 55.10 Campaign Email Flow

```
1. David selects Campaign (e.g., "Q2 2026 Industrial Outreach")
2. CRM loads campaign_contacts with contact email addresses
3. David selects template ("Cold Outreach — Industrial Owner")
4. Preview: shows personalized version for first 3 contacts
5. Pre-send check:
   - Remove contacts with email_kickback = true
   - Remove contacts in email_suppressions
   - Remove contacts with no email
   - Show: "Sending to 47 of 52 contacts (5 suppressed)"
6. Send: batch via Postmark broadcast stream (max 500/batch)
7. Each email:
   - Inserted into email_messages (campaign_id set)
   - Postmark Message-ID stored for webhook matching
8. Webhooks update status over time: delivered → opened → clicked
9. Campaign tab shows aggregate: 47 sent, 38 delivered, 12 opened (32%), 3 clicked
```

---

<a id="prompt-56--notification--alerting-infrastructure"></a>
## Prompt 56 — Notification & Alerting Infrastructure

### 56.1 The Problem

The system generates events — agent cycles, sandbox items, matches, bounced emails, stale data warnings — but David has **no way to know about them** unless he's actively looking at the CRM. He needs:
- **Telegram alerts** for urgent, time-sensitive events (agent crash, hot match, competitor listing expired)
- **In-app notifications** for routine events (sandbox items ready, email opened, task due)
- **Daily/weekly digest emails** for trends and summaries
- **Quiet hours** so his phone doesn't buzz at 3 AM during agent maintenance windows

### 56.2 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    NOTIFICATION PIPELINE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Event Source                                                    │
│  (agent, webhook, CRM action, scheduled)                        │
│       │                                                         │
│       ▼                                                         │
│  POST /api/notifications/emit                                    │
│       │                                                         │
│       ├── Insert into notification_events                        │
│       ├── Look up user notification_preferences                  │
│       ├── Check quiet hours                                      │
│       ├── Check throttle rules (no duplicate alerts within N min)│
│       │                                                         │
│       ├─── Channel Router ────────────────────────────┐         │
│       │                                               │         │
│       ▼                   ▼                  ▼        │         │
│  [Telegram]          [In-App]          [Email Digest]  │         │
│  Bot API POST       notification_inbox  Batch at 7 AM  │         │
│  to chat_id         (DB table)          via Postmark   │         │
│                     + badge count                      │         │
│                     + bell icon                        │         │
│                                                       │         │
└───────────────────────────────────────────────────────┘         │
                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 56.3 Notification Categories & Channel Mapping

| Category | Events | Telegram | In-App | Digest |
|----------|--------|----------|--------|--------|
| **Critical** | Agent crash, Ollama down, API unreachable, DB connection lost | ✅ Immediate | ✅ | ✅ |
| **Hot Match** | Matcher found >80 score match, prediction >70% with recent activity | ✅ Immediate | ✅ | ✅ |
| **Competitive** | Competitor listing expired, competitor price reduction >10% | ✅ Immediate | ✅ | ✅ |
| **Email** | Inbound email from hot contact, bounce on important email | ✅ If high-priority | ✅ | ✅ |
| **Sandbox** | New sandbox items ready for review (batched — max 1 alert per hour) | ✅ Batched | ✅ | ✅ |
| **Task** | Action item due today, overdue task | ❌ | ✅ | ✅ |
| **Data** | Data bounty completed, prediction moved >15%, data freshness warning | ❌ | ✅ | ✅ |
| **System** | Instruction version updated, model switched, cost budget 80% reached | ✅ If budget | ✅ | ✅ |
| **Activity** | New interaction logged, record updated by team member | ❌ | ✅ | ❌ |

### 56.4 Database Schema

```sql
-- ============================================================
-- NOTIFICATION EVENTS (all emitted events)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL
    CHECK (category IN ('critical', 'hot_match', 'competitive', 'email',
                         'sandbox', 'task', 'data', 'system', 'activity')),
  event_type TEXT NOT NULL,           -- specific event: 'agent_crash', 'match_found', etc.
  title TEXT NOT NULL,                -- short: "Hot Match: XYZ Corp → 1234 Industrial"
  body TEXT,                          -- longer description

  -- Context linking
  entity_type TEXT,                   -- 'contact', 'property', 'deal', etc.
  entity_id UUID,                     -- link to the relevant CRM record
  source_agent TEXT,                  -- which agent generated this (null for CRM events)

  -- Delivery tracking
  channels_targeted TEXT[] DEFAULT '{}',  -- ['telegram', 'in_app', 'digest']
  telegram_sent BOOLEAN DEFAULT FALSE,
  telegram_sent_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',        -- event-specific payload
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_events_created ON notification_events(created_at DESC);
CREATE INDEX idx_notification_events_category ON notification_events(category);
CREATE INDEX idx_notification_events_entity ON notification_events(entity_type, entity_id);

-- ============================================================
-- NOTIFICATION INBOX (per-user in-app notifications)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_inbox_user ON notification_inbox(user_id, read, created_at DESC);
CREATE INDEX idx_notification_inbox_unread ON notification_inbox(user_id)
  WHERE read = FALSE AND dismissed = FALSE;

-- ============================================================
-- NOTIFICATION PREFERENCES (per-user channel settings)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  telegram_enabled BOOLEAN DEFAULT FALSE,
  in_app_enabled BOOLEAN DEFAULT TRUE,
  digest_enabled BOOLEAN DEFAULT TRUE,

  -- Throttle
  min_interval_minutes INT DEFAULT 0,  -- 0 = immediate, 60 = max 1 per hour

  PRIMARY KEY (user_id, category)
);

-- ============================================================
-- QUIET HOURS (suppress non-critical notifications)
-- ============================================================
CREATE TABLE IF NOT EXISTS quiet_hours (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN DEFAULT TRUE,
  start_time TIME NOT NULL DEFAULT '22:00',    -- 10 PM Pacific
  end_time TIME NOT NULL DEFAULT '07:00',      -- 7 AM Pacific
  timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles',
  allow_critical BOOLEAN DEFAULT TRUE          -- critical alerts bypass quiet hours
);

-- ============================================================
-- TELEGRAM CONFIG (per-user bot configuration)
-- ============================================================
CREATE TABLE IF NOT EXISTS telegram_config (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,              -- Telegram chat ID (from /start command)
  bot_username TEXT DEFAULT 'IECRMBot',
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ
);

-- ============================================================
-- NOTIFICATION DIGEST (batch tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest_type TEXT NOT NULL CHECK (digest_type IN ('daily', 'weekly')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  event_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  email_message_id UUID REFERENCES email_messages(id),  -- links to email pipeline
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notification_digests_user ON notification_digests(user_id, digest_type, period_start DESC);

COMMENT ON TABLE notification_events IS 'All emitted notification events from agents, webhooks, and CRM actions';
COMMENT ON TABLE notification_inbox IS 'Per-user in-app notification inbox — drives bell icon and badge count';
COMMENT ON TABLE notification_preferences IS 'Per-user notification channel preferences by category';
COMMENT ON TABLE quiet_hours IS 'Per-user quiet hours — suppress non-critical notifications during sleep';
COMMENT ON TABLE telegram_config IS 'Per-user Telegram bot chat configuration';
COMMENT ON TABLE notification_digests IS 'Tracking table for daily/weekly digest email batches';
```

### 56.5 Telegram Bot Setup

```
1. Create bot via @BotFather:
   - Bot name: IE CRM Alerts
   - Username: @IECRMBot
   - Token → store as TELEGRAM_BOT_TOKEN env var on Railway

2. David messages /start to @IECRMBot
   - Bot responds with a verification code
   - David enters code in CRM Settings → Notifications → Telegram
   - CRM stores chat_id in telegram_config table

3. Sending alerts:
   POST https://api.telegram.org/bot{TOKEN}/sendMessage
   {
     "chat_id": "{CHAT_ID}",
     "text": "🔴 *Agent Crash*\nEnricher crashed at 10:42 AM\nError: Ollama timeout after 120s\n\n[View in CRM](https://ie-crm.vercel.app/ai-ops)",
     "parse_mode": "Markdown",
     "disable_web_page_preview": true
   }
```

#### Telegram Message Formats

```
🔴 CRITICAL
━━━━━━━━━━━━━━━━━━━
Enricher crashed at 10:42 AM
Error: Ollama connection refused
Last successful cycle: 10:27 AM
━━━━━━━━━━━━━━━━━━━

🟢 HOT MATCH (Score: 87)
━━━━━━━━━━━━━━━━━━━
XYZ Corp → 1234 Industrial Way
Requirements: 50K SF, industrial, Fontana
Property: 52K SF, industrial, Fontana
Lease expires: Aug 2026 (5 months)
Action: Call CFO John Smith — (909) 555-0123
━━━━━━━━━━━━━━━━━━━

📧 INBOUND EMAIL
━━━━━━━━━━━━━━━━━━━
From: John Smith (XYZ Holdings)
Subject: Re: 1234 Industrial — Interested
Client Level: A
━━━━━━━━━━━━━━━━━━━

⚡ COMPETITIVE ALERT
━━━━━━━━━━━━━━━━━━━
Competitor listing EXPIRED
5678 Arrow Hwy, Ontario
Listed 210 days — 2 price reductions
Owner may be frustrated — call today
━━━━━━━━━━━━━━━━━━━
```

### 56.6 In-App Notification Bell

```
┌────────────────────────────────────────────────────┐
│  IE CRM    Properties  Contacts  ...   🔔 (3)  ⚙  │
└────────────────────────────────────────────────────┘
                                         │
                                         ▼
                              ┌─────────────────────┐
                              │ Notifications    ✓ All│
                              ├─────────────────────┤
                              │ 🟢 Hot Match         │
                              │ XYZ Corp → 1234 Ind  │
                              │ Score: 87 · 3m ago   │
                              ├─────────────────────┤
                              │ 📧 Email opened      │
                              │ John Smith opened     │
                              │ "RE: 1234 Ind" · 15m  │
                              ├─────────────────────┤
                              │ 📋 Sandbox ready     │
                              │ 5 items need review   │
                              │ From: Enricher · 1h   │
                              ├─────────────────────┤
                              │ View all →           │
                              └─────────────────────┘
```

### 56.7 API Endpoints

```
-- Emit (internal — agents and server-side code call this)
POST   /api/notifications/emit        → Create notification event + route to channels

-- Inbox (frontend)
GET    /api/notifications/inbox        → User's notifications (paginated, unread first)
GET    /api/notifications/inbox/count  → Unread count (for badge)
POST   /api/notifications/inbox/:id/read   → Mark as read
POST   /api/notifications/inbox/read-all   → Mark all as read
POST   /api/notifications/inbox/:id/dismiss → Dismiss notification

-- Preferences
GET    /api/notifications/preferences  → Current user's notification preferences
PUT    /api/notifications/preferences  → Update preferences

-- Quiet Hours
GET    /api/notifications/quiet-hours  → Current quiet hours config
PUT    /api/notifications/quiet-hours  → Update quiet hours

-- Telegram
POST   /api/notifications/telegram/verify   → Verify Telegram chat_id with code
POST   /api/notifications/telegram/test     → Send test message to user's Telegram
GET    /api/notifications/telegram/status   → Check bot connection status

-- Digests
GET    /api/notifications/digests      → Past digest history
POST   /api/notifications/digests/send-now  → Force send today's digest immediately
```

### 56.8 React Components

```
src/components/notifications/
├── NotificationBell.jsx           ← Header bell icon with unread badge count
├── NotificationDropdown.jsx       ← Dropdown panel from bell click
├── NotificationItem.jsx           ← Single notification row with icon/text/time
├── NotificationSettings.jsx       ← Settings page section for preferences
├── TelegramSetup.jsx              ← Telegram verification flow in Settings
├── QuietHoursConfig.jsx           ← Quiet hours start/end time picker
└── DigestPreview.jsx              ← Preview of what the daily digest looks like
```

### 56.9 Throttle & Dedup Rules

To prevent alert fatigue:

| Rule | Logic |
|------|-------|
| **Sandbox batching** | Max 1 Telegram alert per hour for sandbox items. Group: "5 new sandbox items ready" |
| **Heartbeat dedup** | Don't alert for missed heartbeat unless 3 consecutive misses (45 seconds for 15s intervals) |
| **Email open dedup** | Only alert on first open per email, not re-opens |
| **Bounce batching** | If campaign causes 5+ bounces, send 1 summary alert, not 5 individual |
| **Cost budget** | Alert at 80% and 100% of daily budget, not per-dollar |
| **Prediction movement** | Only alert if probability moves >15 percentage points in 24 hours |
| **Same-entity cooldown** | Max 1 Telegram alert per entity per 4 hours (prevents spam for active properties) |

### 56.10 Daily Digest Email (7:00 AM Pacific)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  IE CRM DAILY DIGEST — March 13, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 PIPELINE SNAPSHOT
  Active deals: 47 ($3.2M potential)
  Hot leads: 8 (3 new this week)
  Predictions >70%: 12

🤖 AI AGENTS (24h summary)
  Enricher: 142 items processed (94% success)
  Researcher: 23 market signals found
  Matcher: 8 matches (3 hot, 5 warm)
  Scout: 1 alert (new Ollama model)
  Cost: $2.14 (all Ollama except 1 Claude call)

📧 EMAIL ACTIVITY
  Sent: 12 | Delivered: 12 | Opened: 7 (58%)
  Inbound: 3 (2 matched, 1 unmatched)
  Bounced: 0

📋 ACTION ITEMS
  Due today: 3
  Overdue: 1 (⚠️ "Follow up with ABC Logistics" — 2 days)
  Completed yesterday: 5

🏭 DATA BOUNTIES
  Top 3 for today (est. value: $127K):
  1. Lease expirations — 8 Fontana properties (45 min)
  2. Phone verification — 5 high-TPE contacts (20 min)
  3. Ownership changes — 12 Ontario office (35 min)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  [Open CRM](https://ie-crm.vercel.app)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The digest is generated by a scheduled function (cron or PM2 scheduled task on Mac Mini) that queries the database and sends via the Postmark email pipeline (Prompt 55).

---

<a id="new-tables-summary"></a>
## New Tables Summary (Prompts 53-56)

| Table | Prompt | Purpose |
|-------|--------|---------|
| `agent_status` | 53 | Real-time agent fleet health (one row per agent) |
| `agent_cycle_log` | 53 | Per-cycle audit trail with token/cost tracking |
| `agent_cost_daily` | 53 | Daily cost aggregates per agent per model |
| `agent_activity_feed` | 53 | Unified timeline of all agent activities |
| `documents` | 54 | File attachments for any CRM entity |
| `email_messages` | 55 | All outbound and inbound emails with threading |
| `email_events` | 55 | Webhook-driven email tracking (opens, clicks, bounces) |
| `email_templates` | 55 | Reusable email templates with variable interpolation |
| `unmatched_emails` | 55 | Inbound emails with no contact match |
| `email_suppressions` | 55 | Global do-not-email list |
| `notification_events` | 56 | All emitted notification events |
| `notification_inbox` | 56 | Per-user in-app notification queue |
| `notification_preferences` | 56 | Per-user channel settings by category |
| `quiet_hours` | 56 | Per-user quiet hours configuration |
| `telegram_config` | 56 | Per-user Telegram bot setup |
| `notification_digests` | 56 | Digest email batch tracking |

**16 new tables in Prompts 53-56.** Plus 1 VIEW (`sandbox_queue_summary`).

---

<a id="implementation-priority--dependencies"></a>
## Implementation Priority & Dependencies

```
DEPENDENCY GRAPH:

  Prompt 57 (RBAC/Users)  ──────────────────────────┐
       │                                             │
       │  users table needed for:                    │
       ▼                                             ▼
  Prompt 53 (AI Ops)    Prompt 55 (Email)    Prompt 56 (Notifications)
       │                     │                       │
       │                     │                       │
       │                     ▼                       │
       │               Prompt 54 (Search/Docs)       │
       │                     │                       │
       └─────────────────────┴───────────────────────┘
                             │
                             ▼
                    Prompt 58 (Audit Trail)
```

### Recommended Build Order

| Phase | What | Dependencies | Effort |
|-------|------|-------------|--------|
| **1** | Prompt 53 — AI Ops Dashboard (without RBAC) | Prompts 49-52 (agent runtime) | 2-3 days |
| **2** | Prompt 54 — Global Search + Bulk Ops | Existing CRM tables | 1-2 days |
| **3** | Prompt 54 — Document Attachments | Users table (uploaded_by) | 1-2 days |
| **4** | Prompt 55 — Email Pipeline (outbound + templates) | Postmark account, users table | 2-3 days |
| **5** | Prompt 55 — Email Pipeline (inbound + webhooks) | Phase 4 complete | 1-2 days |
| **6** | Prompt 56 — In-App Notifications | Users table, notification_events | 1-2 days |
| **7** | Prompt 56 — Telegram Bot | Telegram @BotFather setup | 1 day |
| **8** | Prompt 56 — Daily Digest | Email pipeline (Phase 4-5) | 1 day |

**Total estimated effort: 10-16 days** (after Prompts 49-52 and 57 are in place).

### Cost Estimates

| Service | Monthly Cost | Notes |
|---------|-------------|-------|
| Postmark | ~$10/mo | 10K emails/mo included at $1.25/1K |
| Telegram Bot API | $0 | Free for bots |
| Cloudflare R2 (Phase 2) | ~$1-5/mo | $0.015/GB, no egress |
| Additional Railway compute | $0 | Within existing plan |

---

*Prompt 53 gives David eyes on the AI fleet. Prompt 54 makes CRM data findable and actionable in bulk. Prompt 55 connects the CRM to the email world. Prompt 56 brings the CRM to David — wherever he is.*

*Created: March 13, 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
