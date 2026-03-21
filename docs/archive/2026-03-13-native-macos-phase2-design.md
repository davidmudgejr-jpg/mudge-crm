# Native macOS Experience — Phase 2 Design

> **Goal:** Make the IE CRM feel like a native macOS desktop app when running in the browser (Vite dev) or Electron. Finder-style table views, Notes-style detail panels, full keyboard shortcuts, command palette, and right-click context menus.

**Target users:** Power users (Dave, Missy, David Jr) who are comfortable with macOS conventions and expect native behaviors.

**Design target:** Hybrid — Finder for list/table views, Apple Notes for detail editing panels.

**Constraint:** All changes must work in browser preview (localhost:5173). No Electron-only features in this phase. Electron-native features (vibrancy, native menus, system notifications) deferred to Phase 3.

**Branch:** `apple-inspired-ui-overhaul` (safe to revert — main is untouched)

---

## Section 1: Toolbar & Navigation

### Toolbar Row
- Persistent toolbar bar at top of content area (below 32px drag region)
- Left: page title (SF Pro, 20px semibold)
- Right: action buttons — "New [Entity]" pill button, search icon toggle, column toggle
- Toolbar has glass-sidebar treatment (subtle blur, semi-transparent bg)
- Separates cleanly from scrollable content below

### Sidebar Polish
- Keep icon-only sidebar (64px)
- Active item: filled rounded-rect background with accent tint
- Hover: subtle scale(1.05) with 150ms spring ease
- Icons bumped to 22px (from 20px), strokeWidth stays 1.25
- Label text stays at 9px below icon

### Keyboard Shortcuts
All browser-compatible (no Electron IPC needed):
- `Cmd+N` → New record (context-aware to current entity page)
- `Cmd+F` → Focus search bar
- `Cmd+,` → Navigate to Settings
- `Cmd+K` → Open command palette
- `Escape` → Close topmost panel/modal
- `Cmd+1` through `Cmd+8` → Switch between nav items (Properties, Contacts, etc.)
- `Cmd+Backspace` → Delete selected records (with confirmation)

Implementation: single `useKeyboardShortcuts` hook in App.jsx, listens for keydown on document.

## Section 2: Table Views (Finder-style)

### Row Styling
- Alternating row colors: even rows get `rgba(255,255,255,0.02)` dark / `rgba(0,0,0,0.02)` light
- Selected row: blue highlight (`bg-crm-accent/15` dark, `bg-crm-accent/10` light)
- Row height tightened to ~38px (from ~44px) for Finder-like density

### Selection Behavior Change
- **Single click** → select row (highlight, no panel open)
- **Double click** or **Enter** → open detail panel
- Multi-select with `Cmd+click` or `Shift+click`
- This matches Finder behavior and makes bulk operations more natural

### Column Headers
- Thinner separator lines (0.5px border or `border-crm-border/20`)
- Sort indicator: small chevron (▲/▼) instead of arrow icons
- Slightly smaller text: 10px uppercase tracking-wider

### Right-Click Context Menu
New React component `<ContextMenu>`:
- Appears on right-click of any table row
- Items: Open, Edit, Copy Name, Separator, Delete
- Styled as macOS menu: rounded-lg, glass-modal backdrop, `shadow-2xl`
- 8px padding, 28px item height, hover highlight with rounded corners
- Keyboard accessible: arrow keys to navigate, Enter to select, Escape to close
- Dismisses on click outside or scroll

### Inline Edit Focus
- Blue focus ring (`ring-2 ring-crm-accent/40`) on active edit field
- Match macOS text input: subtle inset shadow, rounded-md

## Section 3: Detail Panels (Notes-style)

### Panel Container
- Keep SlideOver architecture (right-side panel)
- Clean card sections with generous padding (px-6 py-5)
- Section dividers: 1px `border-crm-border/30`

### Form Fields
- macOS text input styling: `rounded-md border border-crm-border bg-crm-bg/50`
- Focus state: `ring-2 ring-crm-accent/40 border-crm-accent/50`
- Subtle inset shadow on inputs: `shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)]`
- Labels: 12px medium, `text-crm-muted`, positioned above field

### Section Headers
- Small caps style: 11px, uppercase, tracking-wider, `text-crm-muted`
- Collapse chevron (right-pointing when collapsed, down when expanded)
- Match Apple Notes section pattern

### Action Buttons
- Primary: rounded-lg, `bg-crm-accent`, white text, subtle bottom shadow
- Secondary: rounded-lg, `bg-crm-card border border-crm-border`, text-crm-text
- Destructive: rounded-lg, `bg-red-500/10 text-red-400 border border-red-500/20`

## Section 4: Modals & Sheets

### Sheet-Style Modals
- Modals slide down from top of viewport (macOS sheet pattern)
- Enter: slide down + fade in (300ms spring ease)
- Exit: slide up + fade out (200ms)
- Overlay: `bg-black/20` (subtle, not heavy)
- Modal card: glass-modal, rounded-2xl, max-width 500px

### Popovers
- For dropdown menus (column toggle, filter selects)
- Small arrow tip pointing to trigger element
- Glass backdrop, rounded-xl, shadow-xl
- Dismiss on outside click or Escape

## Section 5: Command Palette (Cmd+K)

### Spotlight-Style Search
- Centered overlay: 560px wide, glass-modal backdrop
- Large search input at top (16px font, magnifying glass icon)
- Results grouped by entity type: Properties, Contacts, Companies, Deals
- Each result shows: icon + name + secondary info (city, type, etc.)
- Arrow key navigation with highlighted active item
- Enter to open, Escape to close
- Shows recent items (last 5 opened) when search is empty

### Implementation
- New component: `<CommandPalette>`
- Triggered by `Cmd+K` from `useKeyboardShortcuts`
- Fetches from existing search APIs across all entity types
- Debounced search (200ms)
- Portal-rendered at document root (avoids overflow clipping)

## Files Changed (Estimated)

### New Files (~4)
- `src/hooks/useKeyboardShortcuts.js` — global keyboard shortcut handler
- `src/components/shared/CommandPalette.jsx` — Spotlight-style search
- `src/components/shared/ContextMenu.jsx` — right-click menu component
- `src/index.css` additions — new utility classes, input styles

### Modified Files (~10-12)
- `src/App.jsx` — add keyboard shortcuts hook, command palette
- `src/components/Sidebar.jsx` — icon size bump, hover animation
- `src/components/shared/CrmTable.jsx` — selection behavior, row striping, context menu, column headers, row density
- `src/components/shared/SlideOver.jsx` — Notes-style section refinements
- `src/components/shared/QuickAddModal.jsx` — sheet-style animation
- `src/components/shared/LinkPickerModal.jsx` — sheet-style animation
- `src/components/shared/InlineField.jsx` — macOS focus ring styling
- `src/index.css` — new CSS tokens, input styles, sheet animations
- `src/tailwind.config.js` — new animation keyframes (sheet-down, sheet-up)
- Various detail pages — section header styling updates (if not handled by shared Section component)

## Out of Scope (Phase 3)
- Electron native vibrancy (`BrowserWindow.vibrancy`)
- Native macOS menu bar (`Menu.buildFromTemplate`)
- System notifications (`Notification` API)
- Touch Bar support
- Auto-updater
- Native file drag-and-drop
