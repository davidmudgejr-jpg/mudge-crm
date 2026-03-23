# CRM Notes & Communication Hub — Feature Specification

## Overview

This document defines the complete notes and communication system for IE CRM. The goal is a single unified place where all communication lives — hand-typed notes, emails, and call transcripts — linked across contacts, deals, properties, and companies.

---

## Database Schema

### `notes` Table

```sql
CREATE TABLE IF NOT EXISTS notes (
  note_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content TEXT NOT NULL,
  transcript TEXT,                -- Fireflies full transcript (calls only)
  duration_minutes INTEGER,       -- Call length (calls only)
  type VARCHAR(20) DEFAULT 'note' CHECK (type IN ('note', 'email', 'call')),
  direction VARCHAR(20) CHECK (direction IN ('inbound', 'outbound')),
  subject TEXT,                   -- Email subject line (emails only)
  created_at TIMESTAMP DEFAULT NOW(),

  -- Foreign keys (all nullable — a note can link to multiple record types)
  contact_id UUID REFERENCES contacts(contact_id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(company_id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(property_id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(deal_id) ON DELETE CASCADE
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_notes_contact ON notes(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_company ON notes(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_property ON notes(property_id) WHERE property_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_deal ON notes(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
```

### Field Reference

| Field | Type | Description |
|---|---|---|
| `note_id` | UUID | Primary key, auto-generated |
| `content` | TEXT | Note body, email body, or call summary |
| `transcript` | TEXT | Full Fireflies transcript (calls only) |
| `duration_minutes` | INTEGER | Call length in minutes (calls only) |
| `type` | ENUM | `note`, `email`, or `call` |
| `direction` | ENUM | `inbound` or `outbound` (emails only, null otherwise) |
| `subject` | TEXT | Email subject line (emails only) |
| `created_at` | TIMESTAMP | Auto-set on insert — never entered manually |
| `contact_id` | UUID FK | Links to contacts table |
| `company_id` | UUID FK | Links to companies table |
| `property_id` | UUID FK | Links to properties table |
| `deal_id` | UUID FK | Links to deals table |

---

## Note Types & Rendering

Each note type renders differently in the UI:

### `note` — Hand-typed
- Displays inline, no collapse
- Shows content and relative timestamp (e.g. "2h ago", "Mar 4")
- Simple, clean, scannable

### `email` — Auto-logged via Outlook
- Collapsed by default
- Header line shows: direction icon + subject + date
- Expands on click to show full email body
- 📤 for outbound, 📥 for inbound

### `call` — Auto-logged via Fireflies
- Collapsed by default
- Header line shows: 📞 + duration + date + one-line AI summary
- Expands on click to show full transcript

---

## UI Components

### `NotesSection` Component

Used on every detail page (Contact, Deal, Property, Company).

**Props:**
```jsx
<NotesSection
  entityType="contact"   // "contact" | "deal" | "property" | "company"
  entityId={record.id}
  extraLinks={{}}        // Optional: additional record IDs to tag the note to
/>
```

**Behavior:**
- Loads all notes where the matching FK column equals `entityId`
- Sorted newest first
- Text input at top — no date field (date is automatic)
- On deal pages: shows toggle `Log to Deal / Log to Contact / Log to Both` (default: Log to Both)
- Each note type renders per the rules above

### Activity Detail Panel

When clicking any item in the Activity tab:
- Slide-over panel opens on the right
- Shows: type badge, created date, original content
- Shows linked records (contact, property, deal chips)
- Has "Add follow-up note..." text area at the bottom
- Appending adds a timestamp divider and new content below the original:

```
Original note content here

--- Mar 4, 2026 3:45 PM ---
Follow-up content appended here
```

- Activity list preview shows only the original first line, truncated — never shows appended content in the preview

---

## Deal Page — Two-Section Timeline

The deal detail page shows notes in two clearly labeled sections:

```
─── Deal Notes ─────────────────────────────
Notes tagged directly to this deal, newest first

─── Contact History (Ryan Franklin) ────────
Notes tagged to linked contacts but not this deal
Labeled with contact name
Sorted newest first
```

This preserves pre-deal contact history without mixing it into deal-specific notes.

---

## API Functions (database.js)

### Required functions:

```javascript
// Create a note linked to one or more records
createNote(content, links = {})
// links example: { contact_id: '...', deal_id: '...' }

// Fetch notes for a specific record
getNotesForEntity(entityType, entityId)
// entityType: 'contact' | 'deal' | 'property' | 'company'

// Fetch all notes (Activity tab global feed)
getAllNotes(limit = 200)

// Append follow-up content to existing note
appendToNote(noteId, appendedContent)
// Adds timestamp divider + new content to existing note

// Delete a note
deleteNote(noteId)
```

---

## Webhook Integrations (Future)

### Outlook — Microsoft Graph API

**Endpoint:** `POST /webhooks/outlook`

**Flow:**
1. Webhook fires on sent or received email
2. Match sender/recipient email to contacts table
3. Log as `type: 'email'`, `direction: 'inbound'` or `'outbound'`
4. Store subject, body, direction, created_at
5. If no contact match: log as unmatched in Activity feed for manual linking

**Note:** Do not implement the external API call yet. Build the endpoint handler and database insertion logic so it is ready to connect when credentials are available.

### Fireflies — Call Transcripts

**Endpoint:** `POST /webhooks/fireflies`

**Flow:**
1. Webhook fires after call recording is processed
2. Store AI summary as `content`, full transcript as `transcript`
3. Store call duration as `duration_minutes`
4. Match participants to contacts by email first, then fuzzy name match
5. If no match: log as unmatched in Activity feed for manual linking

**Note:** Do not implement the external API call yet. Build the endpoint handler and database insertion logic so it is ready to connect when credentials are available.

### Matching Logic (both webhooks)

```
1. Try exact email address match → contact_id
2. Fall back to fuzzy name match if no email
3. If no match → save note with all FKs null, flag as unmatched
4. Never silently drop a communication
```

---

## Activity Tab — Global Feed

The Activity tab is the master timeline of all communications.

**Displays:**
- All notes, emails, and calls across every record
- Sorted by `created_at` descending
- Each entry shows: type icon, date, content preview (first line only), linked record chips
- Unmatched items (no linked records) appear flagged at top for manual linking

**Each item is clickable** — opens the detail slide-over panel on the right.

---

## Naming Conventions

To distinguish notes fields from other long text in the codebase:

| Purpose | Convention |
|---|---|
| Notes (running logs) | Stored in `notes` table — never as columns |
| Other long text | Regular columns: `description`, `address`, `details` |
| Note-related components | Prefix with `Notes` — e.g. `NotesSection`, `NoteItem` |
| Note-related DB functions | Prefix with note verb — e.g. `createNote`, `getNotes` |

**Do not store notes as text columns on any table.** All notes live in the `notes` table with foreign keys.

---

## Current Status

| Feature | Status |
|---|---|
| `notes` table schema | ✅ Built |
| `NotesSection` component | ✅ Built — debug save button if blocked |
| Activity tab global feed | ✅ Built |
| Activity detail slide-over | ✅ Built |
| Follow-up note append | ✅ Built |
| Deal page two-section timeline | 🔲 Planned |
| Outlook webhook endpoint | 🔲 Planned |
| Fireflies webhook endpoint | 🔲 Planned |
| Unmatched item flagging | 🔲 Planned |

---

## Known Issues to Fix

1. **Notes Add button** — shows "not allowed" cursor on Contact detail page, note does not save
2. **entityType mismatch** — verify `getNotesForEntity` uses same string as component passes (`contact` not `contacts`)
3. **Activity preview** — truncate to first line only, hide appended timestamp content from list view
4. **New Interaction form** — linking to contact/property/deal crashes Electron; needs stable dropdown implementation
5. **WebSocket errors** — backend and frontend need stable co-launch configuration for Electron
