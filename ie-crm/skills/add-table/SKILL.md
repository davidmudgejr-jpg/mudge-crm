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
> Every table automatically gets: `{entity}_id UUID`, `created_at`, `modified`, `tags`, `overflow`
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
- CREATE TABLE with `{entity}_id UUID PRIMARY KEY DEFAULT uuid_generate_v4()` + standard columns (created_at, modified, tags, overflow) + user's custom columns
- Standard indexes (created_at DESC, modified DESC, GIN on tags)
- Junction tables for each linked entity (alphabetical order for table name)

### Layer 2: API (src/api/database.js)

Append new CRUD functions to `database.js`:
- Add new entry to `ALLOWED_COLS` object with `new Set()` of all columns
- Add junction table names to `ALLOWED_JUNCTION_TABLES` Set
- Add junction column names to `ALLOWED_JUNCTION_COLS` Set
- `getAll{Entities}(sortCol, sortDir, search, filters, offset, limit)` — default limit 200
- `get{Entity}ById(id)`
- `create{Entity}(fields)`
- `update{Entity}(id, fields)`
- `delete{Entity}(id)`
- Linked record getter function for each junction table

Note: Generic `linkRecords` and `unlinkRecords` functions already exist — just add to the ALLOWED Sets.

### Layer 3: Page (src/pages/{Entities}.jsx)

Create new page component:
- ALL_COLUMNS array matching the table's columns (key, label, defaultWidth, format, defaultVisible, renderCell)
- Standard filter bar with search
- CrmTable with sort, row click → detail
- Column visibility toggles via useColumnVisibility
- useFormulaColumns, useCustomFields, useLinkedRecords hooks

### Layer 4: Detail (src/pages/{Entity}Detail.jsx)

Create new detail component:
- SlideOverHeader with entity name
- Section blocks with InlineField for each editable column using useAutoSave
- LinkedRecordSection for each junction
- If polymorphic: NotesSection and NewInteractionModal
- Promise.allSettled for loading all data

### Layer 5: Nav (Sidebar.jsx + App.jsx)

Edit existing files:
- Add entry to NAV_ITEMS array in `src/components/Sidebar.jsx` (use generic clipboard icon from patterns.md)
- Add import + Route in `src/App.jsx`
- Add entry to DETAIL_COMPONENTS mapping in `src/App.jsx`

## Step 3: Present Summary

After scaffolding, present a summary:

> ## {Entity} — Scaffolding Complete
>
> | Layer | File | Status |
> |-------|------|--------|
> | Schema | `schema.sql` | ✓ Table + {N} indexes + {N} junctions |
> | API | `database.js` | ✓ {N} CRUD functions |
> | Page | `{Entities}.jsx` | ✓ Created |
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
- ALLOWED_COLS whitelist must include every column as a `new Set()`
- 200-record default pagination limit on list endpoints
- Use `crm-*` Tailwind tokens for all colors
- Primary keys are `{entity}_id UUID` not just `id`
- Standard columns: `created_at`, `modified`, `tags`, `overflow`
- Do NOT auto-run migration SQL — present it for review
- Do NOT create custom SVG icons — use the generic clipboard icon from patterns.md
- Page files go in `src/pages/{Entities}.jsx` (plural, no "Page" suffix)
- Detail files go in `src/pages/{Entity}Detail.jsx` (singular + Detail)
