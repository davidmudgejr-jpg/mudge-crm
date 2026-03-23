# IE CRM Claude Code Skills Design

**Date:** 2026-03-06
**Status:** Approved
**Skills:** `ie-crm:session-start`, `ie-crm:add-table`

## Problem

Two recurring pain points building IE CRM:

1. **Context loading** — Every new Claude session starts cold. Re-explaining the project architecture, current roadmap phase, and recent work wastes time.
2. **Full-stack roundtrip** — Adding a new entity (e.g., Listings, Brokers) requires touching 5+ files across DB/API/frontend with specific patterns. Easy to miss a layer or deviate from conventions.

## Skill 1: `ie-crm:session-start`

Context loader that runs at the start of every session.

### Workflow

1. **Read project docs** — `CLAUDE.md`, `ARCHITECTURE.md`, `ROADMAP.md`
2. **Check git status** — current branch, uncommitted changes, last 5 commits
3. **Read live schema** — scan `schema.sql` for current tables and columns
4. **Present status card:**

```
IE CRM Status
─────────────
Branch: main (clean)
Last commit: "Add 3-dot menu on built-in columns" (2h ago)
Tables: properties, contacts, companies, deals, interactions, campaigns
Roadmap: Phase 2 — Core CRM Completion
─────────────
What are we working on today?
```

### What it does NOT do

- No environment checks or dependency installs
- No database connections (reads schema.sql only)
- No automatic task suggestions

## Skill 2: `ie-crm:add-table`

Full-stack table scaffolder that creates a complete new entity following established IE CRM patterns.

### Workflow

**Step 1 — Ask 3 questions:**

1. **Fields** — "What columns does this table need? (beyond the standard id/created_at/modified/tags/overflow)" — open-ended
2. **Linked entities** — "Which existing tables should this link to?" — multiple choice from current tables, plus "None"
3. **Polymorphic interactions** — "Should users be able to log calls/emails/notes against these records?" — yes/no

**Step 2 — Scaffold 5 layers:**

| Layer | File | What gets added |
|-------|------|-----------------|
| Schema | `schema.sql` | CREATE TABLE + indexes + junction tables |
| API | `src/api/database.js` | CRUD functions (list/get/create/update/delete) + link/unlink |
| Page | `src/pages/{Entity}.jsx` | Full table page with CrmTable, filters, search, sort |
| Detail | `src/pages/{Entity}Detail.jsx` | SlideOver with InlineField, linked records, notes |
| Nav | `Sidebar.jsx` + `App.jsx` | NAV_ITEMS entry + Route + DETAIL_COMPONENTS entry |

**Step 3 — Present summary for review:**

Show a file-by-file summary of what was created. User reviews before anything is committed.

### Code Patterns Followed

**Standard table columns:**
```sql
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
created_at TIMESTAMP DEFAULT NOW(),
modified TIMESTAMP DEFAULT NOW(),
tags TEXT[],
overflow JSONB DEFAULT '{}'::jsonb
```

**Standard indexes:**
```sql
CREATE INDEX idx_{table}_created ON {table}(created_at DESC);
CREATE INDEX idx_{table}_modified ON {table}(modified DESC);
```

**Junction tables:**
```sql
CREATE TABLE {table1}_{table2} (
  {table1}_id UUID NOT NULL REFERENCES {table1}(id) ON DELETE CASCADE,
  {table2}_id UUID NOT NULL REFERENCES {table2}(id) ON DELETE CASCADE,
  role TEXT,
  PRIMARY KEY ({table1}_id, {table2}_id)
);
```

**API pattern:**
- Parameterized queries with `$1, $2` placeholders
- `ALLOWED_COLS` whitelist per table
- `sanitizeCol()` and `sanitizeDir()` helpers
- 50-record pagination limit
- POST uses `crypto.randomUUID()` for id generation
- PUT uses dynamic SET clause with `modified = NOW()`

**Frontend pattern:**
- `CrmTable` component with `ALL_COLUMNS` array (key, label, defaultWidth, format)
- `SlideOver` + `SlideOverHeader` for detail panels
- `InlineField` with `useAutoSave` hook for click-to-edit
- `useCustomFields` and `useLinkedRecords` hooks
- Column visibility toggles

**Nav pattern:**
- Add entry to `NAV_ITEMS` array in `Sidebar.jsx` (path, label, SVG icon path)
- Add `<Route>` in `App.jsx`
- Add entry to `DETAIL_COMPONENTS` mapping in `App.jsx`

### What it does NOT do

- No auto-migration execution (outputs SQL for manual review)
- No custom cell renderers (uses existing format functions)
- No complex filter logic beyond search + basic dropdowns
- No custom SVG icons (uses a generic icon, user can swap later)

## Tech Stack Reference

- **Frontend:** React 18 + Tailwind CSS + Vite → deployed on Vercel
- **Backend:** Express.js → deployed on Railway
- **Database:** PostgreSQL on Neon (connection pooling, database branching)
- **AI:** Claude API integration
- **Deploy:** GitHub push → auto-deploy to Railway + Vercel
