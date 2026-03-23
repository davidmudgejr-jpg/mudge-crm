# Lead Tracking Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated Leads section to Deal detail views so brokers can log, categorize, and filter incoming leads on listings.

**Architecture:** Leads are stored as interactions with `type = 'Lead'` plus 2 new columns (`lead_status`, `lead_interest`). A new `LeadsSection` component renders on DealDetail with filtering by interest level. One new API endpoint fetches leads for a deal.

**Tech Stack:** React, Tailwind CSS, Express, PostgreSQL (Neon)

**Spec:** `docs/superpowers/specs/2026-03-16-lead-tracking-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `ie-crm/migrations/012_lead_tracking.sql` | Create | Add `lead_status`, `lead_interest` columns + partial index |
| `ie-crm/src/config/typeIcons.js` | Modify (line 119) | Add 'Lead' to `INTERACTION_TYPES` array |
| `ie-crm/src/components/shared/NewInteractionModal.jsx` | Modify (lines 133-172) | Add lead fields when type='Lead' |
| `ie-crm/src/components/shared/LeadsSection.jsx` | Create | Dedicated leads display with interest filters |
| `ie-crm/src/api/database.js` | Modify | Add `getDealLeads()` function |
| `ie-crm/server/index.js` | Modify | Add `GET /api/deals/:id/leads` endpoint |
| `ie-crm/src/pages/DealDetail.jsx` | Modify (line 173) | Import and render `LeadsSection` |
| `ie-crm/src/pages/Deals.jsx` | Modify | Add `lead_count` column to deals table |

---

## Chunk 1: Schema + Config + Backend

### Task 1: Migration — Add lead columns

**Files:**
- Create: `ie-crm/migrations/012_lead_tracking.sql`

- [ ] **Step 1: Create migration file**

```sql
BEGIN;
-- lead_source already exists on interactions table
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS lead_status TEXT;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS lead_interest TEXT;
-- Partial index for fast lead queries
CREATE INDEX IF NOT EXISTS idx_interactions_lead_type ON interactions(type) WHERE type = 'Lead';
COMMIT;
```

- [ ] **Step 2: Apply migration to Neon DB**

```bash
cd ie-crm && node -e "
const {Pool} = require('pg');
const fs = require('fs');
const pool = new Pool({connectionString: process.env.DATABASE_URL});
(async () => {
  const sql = fs.readFileSync('migrations/012_lead_tracking.sql', 'utf8');
  await pool.query(sql);
  console.log('Migration 012 applied');
  // Verify
  const {rows} = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='interactions' AND column_name IN ('lead_status','lead_interest') ORDER BY column_name\");
  console.log('New columns:', rows.map(r => r.column_name));
  await pool.end();
})();
"
```

Expected: `Migration 012 applied` + `New columns: ['lead_interest', 'lead_status']`

- [ ] **Step 3: Commit**

```bash
git add ie-crm/migrations/012_lead_tracking.sql
git commit -m "feat: add lead_status and lead_interest columns to interactions (migration 012)"
```

---

### Task 2: Add 'Lead' to interaction types

**Files:**
- Modify: `ie-crm/src/config/typeIcons.js:119-125`

- [ ] **Step 1: Add 'Lead' to INTERACTION_TYPES array**

In `ie-crm/src/config/typeIcons.js`, change line 119-125 from:

```js
export const INTERACTION_TYPES = [
  'Phone Call', 'Cold Call', 'Voicemail',
  'Outbound Email', 'Inbound Email', 'Cold Email', 'Check in Email', 'Email Campaign',
  'Text', 'Meeting', 'Tour',
  'Door Knock', 'Drive By',
  'Snail Mail', 'Offer Sent', 'Survey Sent', 'BOV Sent',
];
```

To:

```js
export const INTERACTION_TYPES = [
  'Lead',
  'Phone Call', 'Cold Call', 'Voicemail',
  'Outbound Email', 'Inbound Email', 'Cold Email', 'Check in Email', 'Email Campaign',
  'Text', 'Meeting', 'Tour',
  'Door Knock', 'Drive By',
  'Snail Mail', 'Offer Sent', 'Survey Sent', 'BOV Sent',
];
```

Also add a Lead entry to the TYPE_ICONS object (find the object near the top of the file):

```js
Lead: { icon: '🎯', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/src/config/typeIcons.js
git commit -m "feat: add Lead to interaction types with icon"
```

---

### Task 3: Backend — GET /api/deals/:id/leads endpoint

**Files:**
- Modify: `ie-crm/server/index.js` — add new route
- Modify: `ie-crm/src/api/database.js` — add `getDealLeads()` function

- [ ] **Step 1: Add API endpoint to server/index.js**

Find where other GET routes are defined (near the `/api/db/` routes) and add:

```js
// --- Lead tracking ---
app.get('/api/deals/:id/leads', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(`
      SELECT i.interaction_id, i.type, i.subject, i.notes, i.date,
             i.lead_source, i.lead_status, i.lead_interest,
             c.contact_id, c.full_name AS contact_name
      FROM interactions i
      JOIN interaction_deals id ON id.interaction_id = i.interaction_id
      LEFT JOIN interaction_contacts ic ON ic.interaction_id = i.interaction_id
      LEFT JOIN contacts c ON c.contact_id = ic.contact_id
      WHERE id.deal_id = $1 AND i.type = 'Lead'
      ORDER BY i.date DESC, i.created_at DESC
    `, [id]);
    res.json({ leads: rows });
  } catch (err) {
    console.error('GET /api/deals/:id/leads error:', err);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Add getDealLeads to database.js**

In `ie-crm/src/api/database.js`, add this function and export it:

```js
export async function getDealLeads(dealId) {
  const res = await fetch(`${API}/deals/${dealId}/leads`);
  if (!res.ok) throw new Error('Failed to fetch leads');
  const data = await res.json();
  return data.leads || [];
}
```

- [ ] **Step 3: Verify endpoint**

```bash
cd ie-crm && node -e "
const {Pool} = require('pg');
const pool = new Pool({connectionString: process.env.DATABASE_URL});
(async () => {
  // Test query directly
  const {rows} = await pool.query(\"SELECT COUNT(*) FROM interactions WHERE type = 'Lead'\");
  console.log('Lead interactions:', rows[0].count);
  await pool.end();
})();
"
```

- [ ] **Step 4: Commit**

```bash
git add ie-crm/server/index.js ie-crm/src/api/database.js
git commit -m "feat: add GET /api/deals/:id/leads endpoint and getDealLeads client function"
```

---

## Chunk 2: Frontend — LeadsSection + Modal + Integration

### Task 4: Extend NewInteractionModal with lead fields

**Files:**
- Modify: `ie-crm/src/components/shared/NewInteractionModal.jsx`

- [ ] **Step 1: Add lead field state variables**

After line 136 (`const [notes, setNotes] = useState('');`), add:

```js
const [leadSource, setLeadSource] = useState('');
const [leadStatus, setLeadStatus] = useState('New');
const [leadInterest, setLeadInterest] = useState('Warm');
```

- [ ] **Step 2: Add lead field constants**

After the LINK_TYPES constant (line 12), add:

```js
const LEAD_SOURCES = ['CoStar', 'Loopnet', 'Sign Call', 'Referral', 'Website', 'Other'];
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Dead'];
const LEAD_INTERESTS = ['Hot', 'Warm', 'Cold'];
```

- [ ] **Step 3: Include lead fields in handleSubmit**

In `handleSubmit`, change line 171-172 from:

```js
const fields = { type, subject: subject.trim(), date };
if (notes.trim()) fields.notes = notes.trim();
```

To:

```js
const fields = { type, subject: subject.trim(), date };
if (notes.trim()) fields.notes = notes.trim();
if (type === 'Lead') {
  if (leadSource) fields.lead_source = leadSource;
  fields.lead_status = leadStatus;
  fields.lead_interest = leadInterest;
}
```

- [ ] **Step 4: Add lead fields UI (conditional on type='Lead')**

After the Notes textarea section (after line 270, before the Divider), add:

```jsx
{/* Lead-specific fields */}
{type === 'Lead' && (
  <div className="grid grid-cols-3 gap-2">
    <div>
      <label className="block text-xs text-crm-muted mb-1">Source</label>
      <select
        value={leadSource}
        onChange={(e) => setLeadSource(e.target.value)}
        className="w-full bg-crm-bg border border-crm-border rounded-lg px-2 py-1.5 text-xs text-crm-text focus:outline-none focus:border-crm-accent/50"
      >
        <option value="">Select...</option>
        {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-xs text-crm-muted mb-1">Status</label>
      <select
        value={leadStatus}
        onChange={(e) => setLeadStatus(e.target.value)}
        className="w-full bg-crm-bg border border-crm-border rounded-lg px-2 py-1.5 text-xs text-crm-text focus:outline-none focus:border-crm-accent/50"
      >
        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
    <div>
      <label className="block text-xs text-crm-muted mb-1">Interest</label>
      <select
        value={leadInterest}
        onChange={(e) => setLeadInterest(e.target.value)}
        className="w-full bg-crm-bg border border-crm-border rounded-lg px-2 py-1.5 text-xs text-crm-text focus:outline-none focus:border-crm-accent/50"
      >
        {LEAD_INTERESTS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  </div>
)}
```

- [ ] **Step 5: Commit**

```bash
git add ie-crm/src/components/shared/NewInteractionModal.jsx
git commit -m "feat: add lead source/status/interest fields to NewInteractionModal when type=Lead"
```

---

### Task 5: Create LeadsSection component

**Files:**
- Create: `ie-crm/src/components/shared/LeadsSection.jsx`

- [ ] **Step 1: Create LeadsSection.jsx**

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { getDealLeads } from '../../api/database';
import Section from './Section';

const INTEREST_COLORS = {
  Hot: { border: 'border-l-yellow-400', bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: '🔥' },
  Warm: { border: 'border-l-green-400', bg: 'bg-green-500/10', text: 'text-green-400', icon: '🟢' },
  Cold: { border: 'border-l-blue-400', bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '❄️' },
};

const STATUS_COLORS = {
  New: 'bg-blue-500/15 text-blue-400',
  Contacted: 'bg-green-500/15 text-green-400',
  Qualified: 'bg-purple-500/15 text-purple-400',
  Dead: 'bg-gray-500/15 text-gray-400',
};

const SOURCE_COLORS = {
  CoStar: 'bg-blue-500/15 text-blue-400',
  Loopnet: 'bg-orange-500/15 text-orange-400',
  'Sign Call': 'bg-yellow-500/15 text-yellow-400',
  Referral: 'bg-purple-500/15 text-purple-400',
  Website: 'bg-cyan-500/15 text-cyan-400',
  Other: 'bg-gray-500/15 text-gray-400',
};

export default function LeadsSection({ dealId, onAddLead }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null); // null = all, 'Hot'/'Warm'/'Cold'

  const loadLeads = useCallback(async () => {
    if (!dealId) return;
    try {
      const data = await getDealLeads(dealId);
      setLeads(data);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const filtered = filter ? leads.filter((l) => l.lead_interest === filter) : leads;

  // Count by interest
  const counts = { Hot: 0, Warm: 0, Cold: 0 };
  leads.forEach((l) => { if (counts[l.lead_interest] !== undefined) counts[l.lead_interest]++; });

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
  };

  return (
    <Section
      title="Leads"
      count={leads.length}
      defaultOpen={leads.length > 0}
      action={
        <button
          onClick={onAddLead}
          className="text-xs text-crm-accent hover:text-crm-accent-hover transition-colors"
        >
          + Lead
        </button>
      }
    >
      {/* Interest filter pills */}
      {leads.length > 0 && (
        <div className="flex gap-1.5 mb-3">
          {Object.entries(INTEREST_COLORS).map(([level, style]) => {
            const count = counts[level];
            const active = filter === level;
            return (
              <button
                key={level}
                onClick={() => setFilter(active ? null : level)}
                className={`text-[10px] font-medium px-2.5 py-1 rounded-full transition-all ${
                  active
                    ? `${style.bg} ${style.text} ring-1 ring-current`
                    : 'bg-crm-hover text-crm-muted hover:text-crm-text'
                }`}
              >
                {style.icon} {level} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Lead cards */}
      {loading && (
        <p className="text-xs text-crm-muted py-3 text-center">Loading leads...</p>
      )}

      {!loading && leads.length === 0 && (
        <p className="text-xs text-crm-muted py-3 text-center">No leads yet</p>
      )}

      {!loading && filtered.map((lead) => {
        const interest = INTEREST_COLORS[lead.lead_interest] || INTEREST_COLORS.Warm;
        const statusColor = STATUS_COLORS[lead.lead_status] || STATUS_COLORS.New;
        const sourceColor = SOURCE_COLORS[lead.lead_source] || SOURCE_COLORS.Other;

        return (
          <div
            key={lead.interaction_id}
            className={`bg-crm-hover/50 rounded-lg p-3 mb-2 border-l-[3px] ${interest.border}`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-crm-text">
                {lead.contact_name || 'Unknown Contact'}
              </span>
              <span className="text-[10px] text-crm-muted">{formatDate(lead.date)}</span>
            </div>

            {lead.notes && (
              <p className="text-xs text-crm-muted mb-2 line-clamp-2">{lead.notes}</p>
            )}

            <div className="flex flex-wrap gap-1.5">
              <span className={`text-[9px] font-medium px-2 py-0.5 rounded ${interest.bg} ${interest.text}`}>
                {interest.icon} {lead.lead_interest || 'Warm'}
              </span>
              <span className={`text-[9px] font-medium px-2 py-0.5 rounded ${statusColor}`}>
                {lead.lead_status || 'New'}
              </span>
              {lead.lead_source && (
                <span className={`text-[9px] font-medium px-2 py-0.5 rounded ${sourceColor}`}>
                  {lead.lead_source}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </Section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/src/components/shared/LeadsSection.jsx
git commit -m "feat: create LeadsSection component with interest filtering and lead cards"
```

---

### Task 6: Wire LeadsSection into DealDetail

**Files:**
- Modify: `ie-crm/src/pages/DealDetail.jsx`

- [ ] **Step 1: Add imports**

At the top of DealDetail.jsx, after line 14 (`import TasksSection...`), add:

```js
import LeadsSection from '../components/shared/LeadsSection';
```

- [ ] **Step 2: Add LeadsSection after ActivitySection**

In the content JSX, after line 173 (`<ActivitySection ...`), add:

```jsx
<LeadsSection dealId={resolvedId} onAddLead={() => setShowNewInteraction(true)} />
```

Note: This reuses the existing `showNewInteraction` state and `NewInteractionModal`. The user selects "Lead" from the type dropdown to get the lead-specific fields.

- [ ] **Step 3: Verify the full render order is now:**

1. Deal Info (Section)
2. Status (Section)
3. ActivitySection
4. **LeadsSection** ← new
5. TasksSection
6. NewInteractionModal (conditional)
7. NotesSection
8. LinkedRecordSection (Properties)
9. LinkedRecordSection (Contacts)
10. LinkedRecordSection (Companies)

- [ ] **Step 4: Commit**

```bash
git add ie-crm/src/pages/DealDetail.jsx
git commit -m "feat: add LeadsSection to DealDetail between Activity and Tasks"
```

---

### Task 7: Add lead_count to Deals table

**Files:**
- Modify: `ie-crm/src/pages/Deals.jsx` — add lead count column

- [ ] **Step 1: Find the columns definition in Deals.jsx**

Look for the `columns` array or `COLUMNS` constant. Add a new column entry:

```js
{ key: 'lead_count', label: 'Leads', type: 'number', width: 70 },
```

- [ ] **Step 2: Modify the deals list query in server/index.js**

Find where deals are queried (likely the generic `/api/db/query` or `/api/db/deals` route). If it uses the `deal_formulas` VIEW, add the lead_count subquery. If it uses the generic getAll handler, add a computed column.

The simplest approach: add a database VIEW or modify the query in database.js `getDeals` to include:

```sql
(SELECT COUNT(*) FROM interaction_deals id2
 JOIN interactions i2 ON i2.interaction_id = id2.interaction_id
 WHERE id2.deal_id = d.deal_id AND i2.type = 'Lead') AS lead_count
```

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/pages/Deals.jsx ie-crm/server/index.js
git commit -m "feat: add lead_count column to deals table view"
```

---

### Task 8: Smoke test — end to end

- [ ] **Step 1: Start servers**

Use `start-servers` skill to launch both Express + Vite.

- [ ] **Step 2: Navigate to Deals page**

Open a deal in the CRM.

- [ ] **Step 3: Verify LeadsSection appears**

Confirm the "LEADS" section shows between Activity and Tasks with "No leads yet" message and "+ Lead" button.

- [ ] **Step 4: Create a test lead**

Click "+ Lead" → Select type "Lead" → Verify source/status/interest dropdowns appear → Fill in Subject, pick a contact, add a note → Create.

- [ ] **Step 5: Verify lead appears**

Confirm the lead card shows in the LeadsSection with correct interest color, source tag, and status pill.

- [ ] **Step 6: Test interest filters**

Click Hot/Warm/Cold filter pills and verify filtering works.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: lead tracking for deals — complete feature"
```
