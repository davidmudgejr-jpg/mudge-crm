# IE CRM — Development Guide

## Overview

Inland Empire CRM — an Electron + React desktop app for commercial real estate contact/deal management. Built with Vite, Tailwind CSS, and PostgreSQL. Includes an integrated Claude AI assistant for natural-language database queries.

## Quick Start

```bash
npm run dev          # Vite dev server (port 5173) + Electron
npm run build        # Production build
npm run dist         # Package macOS DMG via electron-builder
```

## Architecture

```
ie-crm/
├── electron/main.js          # Electron main process, IPC handlers, DB + Claude setup
├── src/
│   ├── main.jsx              # React entry, HashRouter
│   ├── App.jsx               # Layout: Sidebar + main content + ClaudePanel
│   ├── api/
│   │   ├── database.js       # All DB operations (CRUD, search, links, formulas, undo)
│   │   └── claude.js         # Claude AI SDK wrapper (schema, messages, parsing)
│   ├── components/
│   │   ├── ClaudePanel.jsx   # AI chat UI with SQL execution + file attachments
│   │   ├── Sidebar.jsx       # Navigation with entity counts
│   │   ├── shared/           # Reusable UI components
│   │   │   ├── SlideOver.jsx         # Slide-in panel wrapper (right side)
│   │   │   ├── CrmTable.jsx          # Airtable-style data table with inline editing
│   │   │   ├── InlineField.jsx       # Click-to-edit field component
│   │   │   ├── Section.jsx           # Collapsible detail section
│   │   │   ├── LinkedRecordSection.jsx  # M2M relationship display + link/unlink
│   │   │   ├── QuickAddModal.jsx     # Inline record creation modal
│   │   │   ├── LinkPickerModal.jsx   # Search + link existing records
│   │   │   └── DetailSkeleton.jsx    # Shimmer loading skeleton
│   │   └── contexts/
│   │       ├── SlideOverContext.jsx   # Manages slide-over panel state
│   │       └── ToastContext.jsx       # Toast notification system
│   ├── pages/                # Route pages (list views with CrmTable)
│   │   ├── PropertiesPage.jsx
│   │   ├── ContactsPage.jsx
│   │   ├── CompaniesPage.jsx
│   │   ├── DealsPage.jsx
│   │   ├── InteractionsPage.jsx
│   │   ├── CampaignsPage.jsx
│   │   └── SettingsPage.jsx
│   ├── details/              # Detail views (slide-over or standalone overlay)
│   │   ├── PropertyDetail.jsx
│   │   ├── ContactDetail.jsx
│   │   ├── CompanyDetail.jsx
│   │   ├── DealDetail.jsx
│   │   └── InteractionDetail.jsx
│   ├── hooks/
│   │   └── useAutoSave.js    # Optimistic inline save with debounce
│   └── index.css             # CSS variables for CRM theme tokens
```

## Key Patterns

### IPC Bridge

All database and Claude operations go through Electron IPC. The renderer accesses them via `window.iecrm.db` and `window.iecrm.claude`, exposed in `electron/main.js` via `contextBridge`.

```js
// Renderer side
const rows = await window.iecrm.db.getAll('contacts', 'last_name', 'asc');
```

### Entity Types

6 entities: **Properties**, **Contacts**, **Companies**, **Deals**, **Interactions**, **Campaigns**

Many-to-many relationships use junction tables (e.g., `contact_companies`, `deal_contacts`, `property_deals`).

### Detail View Pattern (`isSlideOver` prop)

Detail components accept an `isSlideOver` boolean:
- `true` — rendered inside the shared `SlideOver` wrapper (no overlay needed)
- `false` — renders its own fixed overlay + slide-in panel

```jsx
if (isSlideOver) return <DetailSkeleton />;
return (
  <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
    <div className="absolute inset-0 bg-crm-overlay animate-fade-in" />
    <div className="w-[500px] bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right"
         onClick={(e) => e.stopPropagation()}>
      <DetailSkeleton />
    </div>
  </div>
);
```

### Inline Editing with useAutoSave

Fields use `useAutoSave` hook for optimistic updates with 400ms debounce. The hook calls the DB update and handles error rollback.

### CrmTable

Airtable-style table with:
- Sortable column headers (click to toggle asc/desc)
- Inline cell editing via `InlineField`
- Row click opens detail in SlideOver
- Staggered row-appear animation
- Column resize support

### Linked Records

`LinkedRecordSection` handles M2M relationships:
- Displays linked records with click-to-open
- "Link existing" opens `LinkPickerModal` (typeahead search)
- "Quick add" opens `QuickAddModal` (create + link in one step)
- Unlink with confirmation

## Database Layer (`database.js`)

### SQL Injection Prevention

All dynamic column/direction values are sanitized:
- `sanitizeCol(col)` — whitelist of valid column names
- `sanitizeDir(dir)` — only allows `asc` or `desc`
- `validateFieldKeys(fields)` — validates field objects before insert/update
- `validateJunction(junction)` — validates junction table operations

User-supplied data always goes through parameterized queries (`$1`, `$2`, etc.).

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

Always use `crm-*` tokens instead of raw colors.

### Animations

Defined in tailwind.config.js:
- `animate-slide-in-right` / `animate-slide-out-right` — SlideOver panels
- `animate-fade-in` — overlays, loading states
- `animate-row-appear` — table row stagger
- `animate-shimmer` — skeleton loading bones

## Claude AI Integration

### How It Works

1. `claude.js` fetches the live DB schema and builds a system prompt
2. User messages are sent with full schema context
3. Claude responses are parsed for SQL blocks (read/write)
4. Read queries execute immediately; write queries show a 1.5s countdown before auto-execution
5. Write operations are logged to undo_log for reversal

### File Attachments

ClaudePanel supports drag-and-drop or click-to-attach files: PDFs, images, CSVs, Excel, JSON. Files are converted to appropriate content blocks for the Claude API.

## Tech Stack

- **Electron 33** + **React 18** + **Vite 6**
- **react-router-dom 6** (HashRouter)
- **Tailwind CSS 3** (custom theme)
- **PostgreSQL** via `pg` driver
- **@anthropic-ai/sdk** for Claude integration
- **xlsx** for Excel file parsing
- **electron-builder** for macOS packaging
