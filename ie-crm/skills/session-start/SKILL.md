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
