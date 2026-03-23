# IE CRM Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create two Claude Code skills — `ie-crm:session-start` (context loader) and `ie-crm:add-table` (full-stack table scaffolder) — as a project-local plugin.

**Architecture:** Both skills are Claude Code prompt-driven workflows stored as SKILL.md files inside a plugin directory structure. The plugin lives in the project repo so any developer cloning it gets the skills. Registration happens via `.claude/settings.local.json`.

**Tech Stack:** Claude Code plugin system (SKILL.md with YAML frontmatter), Markdown

---

### Task 1: Create Plugin Directory Structure

**Files:**
- Create: `ie-crm/.claude-plugin/plugin.json`
- Create: `ie-crm/skills/session-start/SKILL.md` (placeholder)
- Create: `ie-crm/skills/add-table/SKILL.md` (placeholder)

**Step 1: Create directory structure**

```bash
mkdir -p ie-crm/.claude-plugin
mkdir -p ie-crm/skills/session-start
mkdir -p ie-crm/skills/add-table
```

**Step 2: Write plugin.json**

Create `ie-crm/.claude-plugin/plugin.json`:

```json
{
  "name": "ie-crm",
  "version": "0.1.0",
  "description": "Custom Claude Code skills for IE CRM development — context loading and full-stack scaffolding.",
  "author": {
    "name": "David Mudge"
  },
  "keywords": ["ie-crm", "crm", "scaffolding", "commercial-real-estate"]
}
```

**Step 3: Create placeholder SKILL.md files**

Create `ie-crm/skills/session-start/SKILL.md`:

```markdown
---
name: session-start
description: Load IE CRM project context at the start of a session
---

Placeholder — implemented in Task 2.
```

Create `ie-crm/skills/add-table/SKILL.md`:

```markdown
---
name: add-table
description: Scaffold a full-stack entity table in IE CRM
---

Placeholder — implemented in Task 3.
```

**Step 4: Commit**

```bash
git add ie-crm/.claude-plugin ie-crm/skills
git commit -m "feat: scaffold ie-crm plugin structure with placeholder skills"
```

---

### Task 2: Write `ie-crm:session-start` Skill

**Files:**
- Modify: `ie-crm/skills/session-start/SKILL.md`

**Step 1: Write the full SKILL.md**

Replace contents of `ie-crm/skills/session-start/SKILL.md` with the prompt below.

The skill must instruct Claude to:
1. Read 3 project docs: `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`
2. Run `git status` and `git log --oneline -5`
3. Read `schema.sql` and extract table names + column names
4. Present a formatted status card showing: branch, last commit, tables, roadmap phase
5. Ask "What are we working on today?"

```markdown
---
name: session-start
description: Load IE CRM project context at the start of a session — reads docs, checks git, scans schema, presents status card
triggers:
  - "session.?start"
  - "start.?session"
  - "load.?context"
  - "ie.?crm.?start"
  - "what.?do.?we.?have"
---

# IE CRM Session Start

Load project context and present a status card so we can hit the ground running.

## Workflow

### Step 1: Read project documentation

Read these files from the project root (`ie-crm/`):

1. `CLAUDE.md` — development guide, architecture, key patterns
2. `docs/ARCHITECTURE.md` — system architecture (if it exists, skip if not)
3. `docs/ROADMAP.md` — development phases and current progress (if it exists, skip if not)

Absorb the content silently. Do NOT summarize these docs to the user.

### Step 2: Check git status

Run these commands:

1. `git status --short` — check for uncommitted changes
2. `git log --oneline -5` — last 5 commits
3. `git branch --show-current` — current branch name

### Step 3: Read live database schema

Read `schema.sql` from the project root. Extract:
- All table names (from CREATE TABLE statements)
- Column names for each table
- Junction tables (tables with composite primary keys)

### Step 4: Present status card

Display this formatted card (fill in actual values):

```
IE CRM Status
─────────────────────────────────────────
Branch:      {branch} ({clean/dirty — N uncommitted files})
Last commit: "{commit message}" ({time ago})
Tables:      {comma-separated table names}
Junctions:   {comma-separated junction table names}
─────────────────────────────────────────
```

If ROADMAP.md exists and contains phase information, add:
```
Roadmap:     {current phase name}
```

### Step 5: Ask what to work on

End with:

> What are we working on today?

## Important

- Do NOT install dependencies or check environment
- Do NOT connect to the database — schema.sql is the source of truth
- Do NOT suggest tasks — just ask what to work on
- Keep the status card compact — no extra commentary
```

**Step 2: Commit**

```bash
git add ie-crm/skills/session-start/SKILL.md
git commit -m "feat: implement ie-crm:session-start skill — context loader"
```

---

### Task 3: Write `ie-crm:add-table` Skill

**Files:**
- Modify: `ie-crm/skills/add-table/SKILL.md`
- Create: `ie-crm/skills/add-table/references/patterns.md`

**Step 1: Write the references/patterns.md file**

Create `ie-crm/skills/add-table/references/patterns.md` with the exact code patterns the skill must follow. This file contains the templates for each layer (schema, API, page, detail, nav) so the skill prompt stays focused on workflow and this file holds the reference code.

The patterns file should contain:

1. **Schema template** — CREATE TABLE with standard columns (id, created_at, modified, tags, overflow), standard indexes, junction table template
2. **API template** — CRUD functions matching the existing `database.js` pattern: ALLOWED_COLS, getAll with pagination/sort/search/filters, getById, create with crypto.randomUUID(), update with dynamic SET, delete, link/unlink for junctions
3. **Page template** — React component matching existing pages: useState hooks, ALL_COLUMNS array, CrmTable with sort/search/filters, detail panel trigger
4. **Detail template** — SlideOver with SlideOverHeader, InlineField with useAutoSave, LinkedRecordSection for each junction, interactions section if polymorphic
5. **Nav template** — NAV_ITEMS entry format, Route entry format, DETAIL_COMPONENTS entry format

To build this file accurately, read these source files first and extract the patterns:
- `ie-crm/schema.sql` — for schema patterns
- `ie-crm/src/api/database.js` — for API patterns (read a properties or contacts section as exemplar)
- `ie-crm/src/pages/PropertiesPage.jsx` or `ContactsPage.jsx` — for page pattern
- `ie-crm/src/details/PropertyDetail.jsx` or `ContactDetail.jsx` — for detail pattern
- `ie-crm/src/components/Sidebar.jsx` — for NAV_ITEMS pattern
- `ie-crm/src/App.jsx` — for Route and DETAIL_COMPONENTS pattern

Extract the patterns into templatized versions using `{EntityName}`, `{entity_name}`, `{tableName}` placeholders.

**Step 2: Write the full SKILL.md**

Replace contents of `ie-crm/skills/add-table/SKILL.md`:

```markdown
---
name: add-table
description: Scaffold a full-stack entity table in IE CRM — schema, API, page, detail panel, and nav entry
triggers:
  - "add.?table"
  - "new.?table"
  - "add.?entity"
  - "new.?entity"
  - "scaffold.?table"
  - "create.?table"
allowed-tools: ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]
---

# IE CRM: Add Table

Scaffold a complete new entity in IE CRM: database table + API CRUD + React page + detail panel + navigation entry.

## Before You Start

Read the reference patterns file at `skills/add-table/references/patterns.md` — it contains the exact code templates for each layer.

Also read these files to understand current state:
1. `schema.sql` — current tables (to know what can be linked)
2. `src/api/database.js` — current API functions (to append new ones)
3. `src/components/Sidebar.jsx` — current NAV_ITEMS (to append new entry)
4. `src/App.jsx` — current routes and DETAIL_COMPONENTS (to append new entries)

## Step 1: Ask 3 Questions

Ask these questions one at a time. Wait for each answer before asking the next.

**Question 1 — Fields:**

> What columns does the `{table}` table need?
>
> Every table automatically gets: `id`, `created_at`, `modified`, `tags`, `overflow`
>
> List the additional columns with their types. Example:
> - `name TEXT NOT NULL`
> - `square_footage INTEGER`
> - `status TEXT DEFAULT 'active'`

**Question 2 — Linked Entities:**

Read `schema.sql` to find current entity tables (exclude junction tables and system tables like `undo_log`, `formula_columns`).

> Which existing entities should `{table}` link to? (select all that apply)
>
> - [ ] Properties
> - [ ] Contacts
> - [ ] Companies
> - [ ] Deals
> - [ ] {any other entity tables found}
> - [ ] None

**Question 3 — Polymorphic Interactions:**

> Should users be able to log calls, emails, and notes against `{table}` records?
>
> (This adds the table to the polymorphic interactions system)
>
> - Yes
> - No

## Step 2: Scaffold 5 Layers

After collecting answers, generate code for all 5 layers using the templates from `references/patterns.md`. Replace all placeholders with the actual entity name and fields.

### Layer 1: Schema (schema.sql)

Append to end of `schema.sql`:
- CREATE TABLE with standard columns + user's custom columns
- Standard indexes (created_at DESC, modified DESC)
- Junction tables for each linked entity (alphabetical order for table name)

### Layer 2: API (src/api/database.js)

Append new CRUD functions to `database.js`:
- ALLOWED_COLS array for the new table
- getAll{Entity}(sortCol, sortDir, search, filters, offset, limit)
- get{Entity}ById(id)
- create{Entity}(fields)
- update{Entity}(id, fields)
- delete{Entity}(id)
- link/unlink functions for each junction table

### Layer 3: Page (src/pages/{Entity}Page.jsx)

Create new page component:
- ALL_COLUMNS array matching the table's columns
- Standard filter bar with search
- CrmTable with sort, row click → detail
- Column visibility toggles

### Layer 4: Detail (src/details/{Entity}Detail.jsx)

Create new detail component:
- SlideOver with SlideOverHeader
- InlineField for each editable column with useAutoSave
- LinkedRecordSection for each junction
- If polymorphic: interactions section

### Layer 5: Nav (Sidebar.jsx + App.jsx)

Edit existing files:
- Add entry to NAV_ITEMS array in Sidebar.jsx (use a generic icon — user can customize later)
- Add Route in App.jsx
- Add entry to DETAIL_COMPONENTS in App.jsx

## Step 3: Present Summary

After scaffolding, present a summary:

> ## {Entity} — Scaffolding Complete
>
> | Layer | File | Status |
> |-------|------|--------|
> | Schema | `schema.sql` | ✓ Table + {N} indexes + {N} junctions |
> | API | `database.js` | ✓ {N} CRUD functions |
> | Page | `{Entity}Page.jsx` | ✓ Created |
> | Detail | `{Entity}Detail.jsx` | ✓ Created |
> | Nav | `Sidebar.jsx` + `App.jsx` | ✓ Updated |
>
> **Next steps:**
> 1. Review the generated code
> 2. Run the schema SQL against your database
> 3. Test the new page in the browser
>
> Want me to commit these changes?

## Important Rules

- Follow existing code patterns EXACTLY — read the reference file
- Use parameterized queries ($1, $2) — never interpolate user data into SQL
- ALLOWED_COLS whitelist must include every column
- 50-record pagination limit on list endpoints
- Use `crm-*` Tailwind tokens for all colors
- Do NOT auto-run migration SQL — present it for review
- Do NOT create custom SVG icons — use a generic one from existing NAV_ITEMS
```

**Step 3: Commit**

```bash
git add ie-crm/skills/add-table/
git commit -m "feat: implement ie-crm:add-table skill — full-stack entity scaffolder"
```

---

### Task 4: Register Plugin in Project Settings

**Files:**
- Modify: `ie-crm/CLAUDE.md` (add skills reference)

**Step 1: Add skills section to CLAUDE.md**

Append to the end of `ie-crm/CLAUDE.md`:

```markdown

## Custom Skills

This project includes custom Claude Code skills in `skills/`:

- **`ie-crm:session-start`** — Run at the start of each session to load project context. Invoke with `/ie-crm:session-start` or "load context".
- **`ie-crm:add-table`** — Scaffold a new full-stack entity. Invoke with `/ie-crm:add-table` or "add table".
```

**Step 2: Commit**

```bash
git add ie-crm/CLAUDE.md
git commit -m "docs: add custom skills reference to CLAUDE.md"
```

---

### Task 5: Test `ie-crm:session-start` Skill

**Step 1: Invoke the skill**

Run: `/ie-crm:session-start`

**Step 2: Verify output**

Expected behavior:
- Reads CLAUDE.md silently (no summary dumped to chat)
- Shows git branch, last commit, clean/dirty status
- Lists all tables from schema.sql
- Lists junction tables separately
- Ends with "What are we working on today?"
- Does NOT suggest tasks or install anything

**Step 3: Fix any issues**

If the status card is wrong or the skill reads files incorrectly, edit `ie-crm/skills/session-start/SKILL.md` to fix.

---

### Task 6: Test `ie-crm:add-table` Skill (Dry Run)

**Step 1: Invoke the skill**

Run: `/ie-crm:add-table`

**Step 2: Answer the 3 questions with test data**

Use this test entity: **Listings**
- Fields: `title TEXT NOT NULL`, `listing_type TEXT DEFAULT 'sale'`, `asking_price NUMERIC`, `listing_date DATE`
- Linked entities: Properties, Contacts
- Polymorphic interactions: Yes

**Step 3: Verify generated code**

Check that:
- Schema SQL has correct CREATE TABLE with standard + custom columns, indexes, 2 junction tables
- API functions follow existing pattern (parameterized queries, ALLOWED_COLS, 50-record limit)
- Page component uses CrmTable with correct ALL_COLUMNS
- Detail component uses SlideOver, InlineField, LinkedRecordSection for properties + contacts, interactions section
- Sidebar.jsx and App.jsx have new entries
- Summary table is presented

**Step 4: Discard test output**

```bash
git checkout -- .
```

Discard all generated files since this was just a test run.

**Step 5: Commit any skill fixes**

If the skill needed corrections during testing:

```bash
git add ie-crm/skills/
git commit -m "fix: refine add-table skill templates after dry-run testing"
```

---

### Task 7: Final Commit and Cleanup

**Step 1: Verify all files are committed**

```bash
git status
git log --oneline -10
```

**Step 2: Verify directory structure**

Expected:
```
ie-crm/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   ├── session-start/
│   │   └── SKILL.md
│   └── add-table/
│       ├── SKILL.md
│       └── references/
│           └── patterns.md
├── docs/plans/
│   ├── 2026-03-06-ie-crm-skills-design.md
│   └── 2026-03-06-ie-crm-skills-impl-plan.md
└── CLAUDE.md (updated with skills reference)
```

**Step 3: Done**

Both skills are implemented, tested, and committed. The user can now:
- Start every session with `/ie-crm:session-start`
- Scaffold new entities with `/ie-crm:add-table`
