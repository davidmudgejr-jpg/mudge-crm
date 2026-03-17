# IE CRM — Development Guide

## Overview

Inland Empire CRM — a React + Express web application for commercial real estate contact/deal management. Built with Vite, Tailwind CSS, and PostgreSQL (Neon). Includes an integrated Claude AI assistant for natural-language database queries. Deployed on Vercel (frontend) + Railway (backend).

> **Note:** This app was originally built as an Electron desktop app but has migrated to a web-first architecture. The `electron/` directory remains for potential future desktop packaging but is NOT the primary deployment path.

## Quick Start

```bash
cd ie-crm
npm run dev          # Vite dev server (port 5173)
node server/index.js # Express API server (port 3001)
# Or use the start-servers skill to launch both
```

## Deployment

| Layer | Service | Auto-Deploy |
|-------|---------|-------------|
| Frontend | Vercel | On git push to main |
| Backend | Railway | On git push to main |
| Database | Neon PostgreSQL 17 | Pooled connections (use `-pooler` hostname) |

## Architecture

```
ie-crm/
├── server/
│   ├── index.js              # Express API — all REST endpoints, Claude integration
│   └── utils/
│       ├── addressNormalizer.js  # Address parsing + normalization for imports
│       └── compositeMatcher.js  # Tiered confidence matching for deduplication
├── src/
│   ├── main.jsx              # React entry, HashRouter
│   ├── App.jsx               # Layout: Sidebar + main content + ClaudePanel
│   ├── api/
│   │   ├── database.js       # All DB operations (CRUD, search, links, formulas, undo)
│   │   ├── claude.js         # Claude AI SDK wrapper (schema, messages, parsing)
│   │   └── bridge.js         # HTTP/IPC abstraction layer
│   ├── components/
│   │   ├── ClaudePanel.jsx   # AI chat UI with SQL execution + file attachments
│   │   ├── Sidebar.jsx       # Navigation with entity counts
│   │   └── shared/           # Reusable UI components
│   │       ├── CrmTable.jsx          # Airtable-style data table with inline editing
│   │       ├── InlineTableCellEditor.jsx  # Type-aware cell editors
│   │       ├── SlideOver.jsx         # Slide-in panel wrapper (right side)
│   │       ├── LinkedRecordSection.jsx  # M2M relationship display + link/unlink
│   │       ├── LinkedChips.jsx       # Pill-style linked record chips
│   │       ├── ActivitySection.jsx   # Interaction history per entity
│   │       ├── ActivityCellPreview.jsx # Activity column in table view
│   │       ├── NotesSection.jsx      # Notes per entity
│   │       ├── TasksSection.jsx      # Action items per entity
│   │       ├── QuickAddModal.jsx     # Inline record creation modal
│   │       ├── LinkPickerModal.jsx   # Search + link existing records
│   │       ├── CompManualEntryModal.jsx # Manual comp entry
│   │       ├── CommandPalette.jsx    # Cmd+K command palette
│   │       ├── ColumnToggleMenu.jsx  # Column visibility/rename/delete
│   │       └── ContextMenu.jsx       # Right-click context menu
│   ├── pages/                # Route pages (12 pages)
│   │   ├── Properties.jsx    # Properties with role-specific linked columns
│   │   ├── Contacts.jsx
│   │   ├── Companies.jsx
│   │   ├── Deals.jsx         # Queries deal_formulas VIEW for commission calc
│   │   ├── Interactions.jsx
│   │   ├── Campaigns.jsx
│   │   ├── ActionItems.jsx   # Apple Reminders-style task management
│   │   ├── Comps.jsx         # Lease/Sale toggle with source color-coding
│   │   ├── TPE.jsx           # TPE Living Database — scored properties, tier badges
│   │   ├── TPEEnrichment.jsx # Data gap analysis — missing data pills, projected tiers
│   │   ├── Import.jsx        # CSV import with matching + auto-linking
│   │   └── Settings.jsx
│   ├── hooks/
│   │   ├── useAutoSave.js    # Optimistic inline save with debounce
│   │   ├── useLinkedRecords.js  # Batch-fetch linked records for all rows
│   │   ├── useColumnVisibility.js # Column show/hide persistence
│   │   ├── useCustomFields.js # Formula columns from DB
│   │   ├── useFormulaColumns.js # Formula column integration
│   │   ├── useColumnResize.js # Airtable-style drag resize
│   │   ├── useDetailPanel.js # Detail slide-over state
│   │   └── useKeyboardShortcuts.js # Global keyboard shortcuts
│   ├── config/
│   │   ├── entityTypes.js    # Entity type definitions
│   │   ├── fieldTypes.js     # Field type rendering config
│   │   ├── typeIcons.js      # Icons per entity type
│   │   ├── quickAddFields.js # Fields for quick-add modals
│   │   └── zIndex.js         # Z-index layer system
│   └── index.css             # CSS variables for CRM theme tokens
├── migrations/               # PostgreSQL migration files (001-018)
├── schema.sql                # Base schema (run migrations on top)
└── electron/                 # Legacy Electron packaging (not primary deployment)
```

## Key Patterns

### API Layer (bridge.js)

All database operations route through `bridge.js` which abstracts HTTP calls to the Express backend. The frontend calls `bridge.db.*` methods which map to REST endpoints.

```js
// Frontend
const rows = await bridge.db.getAll('contacts', 'last_name', 'asc');
// → GET /api/db/contacts?sort=last_name&dir=asc
```

### Entity Types

8 entities: **Properties**, **Contacts**, **Companies**, **Deals**, **Interactions**, **Campaigns**, **Action Items**, **Comps** (Lease + Sale)

Many-to-many relationships use junction tables (e.g., `contact_companies`, `deal_contacts`, `property_deals`). Role-specific linking via `role` column on junction tables.

### Detail View Pattern (`isSlideOver` prop)

Detail components accept an `isSlideOver` boolean:
- `true` — rendered inside the shared `SlideOver` wrapper (no overlay needed)
- `false` — renders its own fixed overlay + slide-in panel

### Inline Editing with useAutoSave

Fields use `useAutoSave` hook for optimistic updates with 400ms debounce. The hook calls the DB update and handles error rollback.

### CrmTable

Airtable-style table with:
- Sortable column headers (click to toggle asc/desc)
- Inline cell editing via `InlineTableCellEditor` (type-aware: text, number, date, select, multi-select, tags, boolean, email, tel, url)
- Row click opens detail in SlideOver
- Staggered row-appear animation
- Column resize (drag handles)
- Column visibility toggle + rename/delete
- Activity cell preview (most recent interaction)

### Linked Records

`LinkedRecordSection` handles M2M relationships:
- Displays linked records with click-to-open
- "Link existing" opens `LinkPickerModal` (typeahead search)
- "Quick add" opens `QuickAddModal` (create + link in one step)
- Unlink with confirmation
- Role-specific filtering (owner contacts, broker contacts, etc.)

## Database Layer (`database.js`)

### SQL Injection Prevention

All dynamic column/direction values are sanitized:
- `sanitizeCol(col)` — whitelist of valid column names per table
- `sanitizeDir(dir)` — only allows `asc` or `desc`
- `validateFieldKeys(fields)` — validates field objects before insert/update
- `validateJunction(junction)` — validates junction table operations

User-supplied data always goes through parameterized queries (`$1`, `$2`, etc.).

### SQL VIEWs (computed, not stored)

- `deal_formulas` — Commission calculations: team_gross, jr_gross, jr_net (geometric series for leases)
- `property_tpe_scores` — Transaction Probability Engine: 5-model scoring with configurable weights from `tpe_config` table

### DB Triggers (auto-sync)

- `trg_sync_lease_exp` — AFTER INSERT/UPDATE on `lease_comps`: updates `companies.lease_exp` to MAX(expiration_date) across all comps for that company
- `trg_sync_sale_data` — AFTER INSERT/UPDATE on `sale_comps`: updates `properties.last_sale_date` and `last_sale_price` if the comp is more recent
- `trg_resync_lease_exp_on_delete` — AFTER DELETE on `lease_comps`: recalculates company lease_exp from remaining comps
- `trg_resync_sale_data_on_delete` — AFTER DELETE on `sale_comps`: recalculates property sale data from remaining comps
- `trg_normalize_address` — BEFORE INSERT/UPDATE on `properties`: auto-computes `normalized_address` for import matching

### Formula Columns

Claude can create computed columns stored in a `formula_columns` table. These are evaluated as SQL expressions and appended to queries.

### Undo Log

Write operations (INSERT, UPDATE, DELETE) log inverse operations to `undo_log` table. The Claude panel can undo recent AI-initiated changes.

## Styling

### Tailwind + CSS Variables

Theme colors are defined as CSS variables in `index.css` and mapped in `tailwind.config.js`:

```
crm-bg, crm-sidebar, crm-card, crm-accent, crm-accent-hover,
crm-text, crm-muted, crm-success, crm-border, crm-hover,
crm-deep, crm-overlay, crm-tooltip
```

Always use `crm-*` tokens instead of raw colors. Apple-inspired design: clean, minimal, depth through subtle gradients and spring animations.

### Animations

Defined in tailwind.config.js:
- `animate-slide-in-right` / `animate-slide-out-right` — SlideOver panels
- `animate-fade-in` — overlays, loading states
- `animate-row-appear` — table row stagger
- `animate-shimmer` — skeleton loading bones

## Claude AI Integration

### How It Works

1. `claude.js` fetches the live DB schema (cached 60s) and builds a system prompt with CRE terminology
2. User messages are sent with full schema context
3. Claude responses are parsed for SQL blocks (read/write)
4. Read queries execute immediately; write queries show a 1.5s countdown before auto-execution
5. Write operations are logged to undo_log for reversal

### File Attachments

ClaudePanel supports drag-and-drop or click-to-attach files: PDFs, images, CSVs, Excel, JSON. Files are converted to appropriate content blocks for the Claude API.

## AI Master System

The CRM integrates with a planned 3-tier AI agent fleet (see `ai-system/` directory):
- **Tier 1 (Claude Opus):** Strategic oversight via Chief of Staff ("Houston")
- **Tier 2 (ChatGPT/Gemini):** Validation/QA on agent outputs
- **Tier 3 (Local — Qwen 3.5, MiniMax 2.5):** High-volume research, enrichment, matching

Agent outputs land in `sandbox_*` tables (migration 007) for human review before promotion to production tables.

## Tech Stack

- **React 18** + **Vite 6** (frontend)
- **Express** + **Node.js** (backend API)
- **react-router-dom 6** (HashRouter)
- **Tailwind CSS 3** (custom theme)
- **PostgreSQL 17** via Neon (pooled connections)
- **@anthropic-ai/sdk** for Claude integration
- **xlsx** for Excel file parsing
- **Vercel** (frontend hosting) + **Railway** (backend hosting)
