# Native macOS Phase 2 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the IE CRM feel like a native macOS app — Finder-style tables, Notes-style details, keyboard shortcuts, command palette, context menus, sheet-style modals.

**Architecture:** Browser-only changes (no Electron APIs). New hooks and components composed into existing layout. All styling uses existing `crm-*` CSS tokens and Tailwind.

**Tech Stack:** React 18, Tailwind CSS 3, CSS custom properties, react-router-dom 6

**Branch:** `apple-inspired-ui-overhaul`

**Design doc:** `docs/plans/2026-03-13-native-macos-phase2-design.md`

---

### Task 1: New CSS Tokens & Animation Keyframes

**Files:**
- Modify: `ie-crm/src/index.css`
- Modify: `ie-crm/tailwind.config.js`

**Step 1: Add new CSS utilities to index.css**

Add after the existing `.glass-toast` block (around line 150):

```css
/* macOS-style focus ring */
.macos-focus-ring {
  @apply ring-2 ring-crm-accent/40 border-crm-accent/50;
}

/* macOS text input base */
.macos-input {
  @apply rounded-md border border-crm-border bg-crm-bg/50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)];
}

.macos-input:focus {
  @apply ring-2 ring-crm-accent/40 border-crm-accent/50 outline-none;
}
```

**Step 2: Add sheet animation keyframes to tailwind.config.js**

Add to the `keyframes` object:

```js
'sheet-down': {
  '0%': { transform: 'translateY(-20px)', opacity: '0' },
  '100%': { transform: 'translateY(0)', opacity: '1' },
},
'sheet-up': {
  '0%': { transform: 'translateY(0)', opacity: '1' },
  '100%': { transform: 'translateY(-20px)', opacity: '0' },
},
```

Add to the `animation` object:

```js
'sheet-down': 'sheet-down 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
'sheet-up': 'sheet-up 0.2s ease-out',
```

**Step 3: Commit**

```bash
git add ie-crm/src/index.css ie-crm/tailwind.config.js
git commit -m "feat(phase2): add macOS input styles and sheet animation keyframes"
```

---

### Task 2: Keyboard Shortcuts Hook

**Files:**
- Create: `ie-crm/src/hooks/useKeyboardShortcuts.js`
- Modify: `ie-crm/src/App.jsx`

**Step 1: Create useKeyboardShortcuts.js**

```js
import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const NAV_ROUTES = [
  '/properties', '/contacts', '/companies', '/deals',
  '/interactions', '/campaigns', '/action-items', '/comps',
];

export default function useKeyboardShortcuts({
  onNewRecord,
  onFocusSearch,
  onOpenCommandPalette,
  onDeleteSelected,
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const handler = useCallback((e) => {
    // Ignore when typing in inputs/textareas
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // Allow Escape and Cmd+K even in inputs
      if (e.key !== 'Escape' && !(e.metaKey && e.key === 'k')) return;
    }

    // Cmd+N → New record
    if (e.metaKey && e.key === 'n') {
      e.preventDefault();
      onNewRecord?.();
      return;
    }

    // Cmd+F → Focus search
    if (e.metaKey && e.key === 'f') {
      e.preventDefault();
      onFocusSearch?.();
      return;
    }

    // Cmd+K → Command palette
    if (e.metaKey && e.key === 'k') {
      e.preventDefault();
      onOpenCommandPalette?.();
      return;
    }

    // Cmd+, → Settings
    if (e.metaKey && e.key === ',') {
      e.preventDefault();
      navigate('/settings');
      return;
    }

    // Cmd+Backspace → Delete selected
    if (e.metaKey && e.key === 'Backspace') {
      e.preventDefault();
      onDeleteSelected?.();
      return;
    }

    // Cmd+1 through Cmd+8 → Navigate
    if (e.metaKey && e.key >= '1' && e.key <= '8') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      if (NAV_ROUTES[idx]) navigate(NAV_ROUTES[idx]);
      return;
    }

    // Escape → handled by individual panels (SlideOver, CommandPalette, etc.)
  }, [navigate, onNewRecord, onFocusSearch, onOpenCommandPalette, onDeleteSelected]);

  useEffect(() => {
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handler]);
}
```

**Step 2: Wire into App.jsx**

Import the hook at the top of App.jsx. Add state for command palette and search focus in `AppShell`. Wire the hook:

```jsx
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';

// Inside AppShell:
const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
const [searchFocusTrigger, setSearchFocusTrigger] = useState(0);

useKeyboardShortcuts({
  onNewRecord: () => { /* will wire to page-level new record later */ },
  onFocusSearch: () => setSearchFocusTrigger(prev => prev + 1),
  onOpenCommandPalette: () => setCommandPaletteOpen(prev => !prev),
  onDeleteSelected: () => { /* will wire to page-level delete later */ },
});
```

Note: `useKeyboardShortcuts` calls `useNavigate`, so it must be used inside a Router. `AppShell` is already inside `<Router>`.

**Step 3: Commit**

```bash
git add ie-crm/src/hooks/useKeyboardShortcuts.js ie-crm/src/App.jsx
git commit -m "feat(phase2): add global keyboard shortcuts hook (Cmd+N/F/K/,/1-8)"
```

---

### Task 3: Command Palette Component

**Files:**
- Create: `ie-crm/src/components/shared/CommandPalette.jsx`
- Modify: `ie-crm/src/App.jsx`

**Step 1: Create CommandPalette.jsx**

A Spotlight-style search overlay:
- 560px wide, centered, glass-modal backdrop
- Large search input at top with magnifying glass
- Results grouped by entity type (Properties, Contacts, Companies, Deals)
- Arrow key navigation, Enter to open, Escape to close
- Debounced search (200ms)
- Opens detail in SlideOver when a result is selected
- Portal-rendered at document root

Uses existing search APIs: `searchProperties`, `searchContacts`, `searchCompanies`, `searchDeals`, `searchCampaigns` from `../../api/database`.

Uses `useSlideOver` to open results in detail panels.

Key structure:

```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { searchProperties, searchContacts, searchCompanies, searchDeals, searchCampaigns } from '../../api/database';
import { useSlideOver } from './SlideOverContext';

const ENTITY_GROUPS = [
  { key: 'properties', label: 'Properties', searchFn: searchProperties, idCol: 'property_id', entityType: 'property', icon: '🏢', secondary: (r) => r.city },
  { key: 'contacts', label: 'Contacts', searchFn: searchContacts, idCol: 'contact_id', entityType: 'contact', icon: '👤', secondary: (r) => r.email },
  { key: 'companies', label: 'Companies', searchFn: searchCompanies, idCol: 'company_id', entityType: 'company', icon: '🏬', secondary: (r) => r.city },
  { key: 'deals', label: 'Deals', searchFn: searchDeals, idCol: 'deal_id', entityType: 'deal', icon: '💼', secondary: (r) => r.status },
  { key: 'campaigns', label: 'Campaigns', searchFn: searchCampaigns, idCol: 'campaign_id', entityType: 'campaign', icon: '📧', secondary: (r) => r.type },
];

export default function CommandPalette({ isOpen, onClose }) { ... }
```

The component:
- Renders via `createPortal(jsx, document.body)`
- On mount/open: focus input, reset state
- Debounced search calls all 5 search functions in parallel
- Flattens results into grouped list for arrow-key navigation
- Active index tracks keyboard position
- Enter opens the active result via `slideOver.open(entityType, id)`
- Overlay click or Escape closes

**Step 2: Wire into App.jsx**

```jsx
import CommandPalette from './components/shared/CommandPalette';

// In AppShell render, after SlideOverRenderer:
<CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
```

**Step 3: Commit**

```bash
git add ie-crm/src/components/shared/CommandPalette.jsx ie-crm/src/App.jsx
git commit -m "feat(phase2): add Cmd+K command palette with cross-entity search"
```

---

### Task 4: Context Menu Component

**Files:**
- Create: `ie-crm/src/components/shared/ContextMenu.jsx`

**Step 1: Create ContextMenu.jsx**

macOS-style right-click menu:
- Appears at cursor position on right-click
- Items: Open, Edit, Copy Name, Separator, Delete
- Rounded-lg, glass-modal backdrop, shadow-2xl
- 8px padding, 28px item height, hover with rounded corners
- Arrow key navigation, Enter to select, Escape to close
- Dismisses on click outside or scroll
- Portal-rendered

```jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

export default function ContextMenu({ x, y, items, onClose }) { ... }
```

Props:
- `x, y` — position from right-click event
- `items` — array of `{ label, icon?, onClick, danger?, separator? }`
- `onClose` — called when menu should dismiss

Behavior:
- Position adjusted to stay within viewport bounds
- `activeIndex` tracked for keyboard nav
- Each item: `<button>` with hover bg, danger items in red

**Step 2: Commit**

```bash
git add ie-crm/src/components/shared/ContextMenu.jsx
git commit -m "feat(phase2): add macOS-style right-click context menu component"
```

---

### Task 5: CrmTable — Row Selection Behavior Change

**Files:**
- Modify: `ie-crm/src/components/shared/CrmTable.jsx`

This is the biggest change. The current behavior is single-click opens detail. The new Finder-style behavior:

**Step 1: Change row interaction model**

- **Single click** → select row (toggle selection, highlight)
- **Double click** → open detail panel
- This requires changing the `<tr>` event handlers

Current (line ~496):
```jsx
<tr onClick={() => onRowClick(row)} ...>
```

New:
```jsx
<tr
  onClick={(e) => {
    // Single click: toggle selection (Cmd+click for multi, Shift+click for range)
    if (e.metaKey) {
      onToggleSelect(id);
    } else if (e.shiftKey && onShiftSelect) {
      onShiftSelect(id);
    } else {
      // Clear other selections, select this one
      onSelectOnly?.(id);
    }
  }}
  onDoubleClick={() => onRowClick(row)}
  ...
>
```

Add new props: `onSelectOnly` (select just one row), `onShiftSelect` (range select).

**Step 2: Alternating row colors**

Add zebra striping: even rows get subtle alternate color.

```jsx
className={`... ${idx % 2 === 0 ? '' : 'bg-white/[0.02] dark:bg-white/[0.02]'}`}
```

Actually since we use CSS variables, use inline approach or a simple class:
```jsx
style={idx % 2 === 1 ? { backgroundColor: 'rgba(255,255,255,0.02)' } : undefined}
```

**Step 3: Tighten row height**

Change `py-3.5` to `py-2.5` on `<td>` elements (from ~44px to ~38px).

**Step 4: Column header chevrons**

Replace `↑`/`↓` arrows with small chevrons in `ColumnHeader`:

Current (line ~159):
```jsx
<span className="text-crm-accent ml-1">{order === 'ASC' ? '↑' : '↓'}</span>
```

New:
```jsx
<svg className="w-3 h-3 text-crm-accent ml-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={order === 'ASC' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
</svg>
```

**Step 5: Thinner column separator lines**

Change header `border-b border-crm-border` to `border-b border-crm-border/20` for thinner separators.

**Step 6: Selected row styling**

Update the selected row highlight from `bg-crm-accent/10` to `bg-crm-accent/15` and add a left accent border:

```jsx
isSelected ? 'bg-crm-accent/15 border-l-2 border-l-crm-accent' : 'hover:bg-crm-hover'
```

**Step 7: Commit**

```bash
git add ie-crm/src/components/shared/CrmTable.jsx
git commit -m "feat(phase2): Finder-style table — click-select, dblclick-open, row density, chevrons"
```

---

### Task 6: CrmTable — Right-Click Context Menu Integration

**Files:**
- Modify: `ie-crm/src/components/shared/CrmTable.jsx`

**Step 1: Add context menu state and handler**

Add state for context menu position and target row. On `<tr>` `onContextMenu`:

```jsx
const [contextMenu, setContextMenu] = useState(null); // { x, y, row }

// On <tr>:
onContextMenu={(e) => {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, row });
}}
```

**Step 2: Render ContextMenu**

At the end of the CrmTable return, render the context menu:

```jsx
{contextMenu && (
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={[
      { label: 'Open', onClick: () => { onRowClick(contextMenu.row); setContextMenu(null); } },
      { label: 'Copy Name', onClick: () => { /* copy first visible text column */ navigator.clipboard.writeText(...); setContextMenu(null); } },
      { separator: true },
      { label: 'Delete', danger: true, onClick: () => { onDeleteRow?.(contextMenu.row[idField]); setContextMenu(null); } },
    ]}
    onClose={() => setContextMenu(null)}
  />
)}
```

Add new prop `onDeleteRow` for context menu delete action.

**Step 3: Commit**

```bash
git add ie-crm/src/components/shared/CrmTable.jsx
git commit -m "feat(phase2): add right-click context menu to CrmTable rows"
```

---

### Task 7: Page-Level Wiring — Selection & Shortcuts

**Files:**
- Modify: all page files that use CrmTable: `Properties.jsx`, `Contacts.jsx`, `Companies.jsx`, `Deals.jsx`, `Interactions.jsx`, `Campaigns.jsx`, `ActionItems.jsx`, `Comps.jsx`

**Step 1: Add `onSelectOnly` and `onShiftSelect` handlers**

Each page already has `selected` state and `onToggleSelect`. Add:

```js
const handleSelectOnly = (id) => {
  setSelected(new Set([id]));
};
```

Pass `onSelectOnly={handleSelectOnly}` to CrmTable.

**Step 2: Pass `onDeleteRow` to CrmTable**

Wire up the delete handler from each page (most pages already have bulk delete logic — reuse it for single-row context menu delete).

**Step 3: Commit**

```bash
git add ie-crm/src/pages/*.jsx
git commit -m "feat(phase2): wire Finder-style selection and context menu to all entity pages"
```

---

### Task 8: Section.jsx — Apple Notes-Style Collapse

**Files:**
- Modify: `ie-crm/src/components/shared/Section.jsx`

**Step 1: Change chevron direction**

Current: down chevron that rotates 180° when open (always points down/up).
New: right-pointing chevron (collapsed) → down (expanded), like Apple Notes.

Change the SVG path and rotation:

Current:
```jsx
<svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} ...>
  <path ... d="M19 9l-7 7-7-7" />
</svg>
```

New:
```jsx
<svg className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
</svg>
```

This starts as a right-pointing chevron (►) and rotates 90° clockwise to become down-pointing (▼) when open.

**Step 2: Refine styling**

Update the section header to use 11px small-caps style:

```jsx
className="w-full flex items-center justify-between px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-crm-muted hover:text-crm-text transition-colors cursor-pointer"
```

**Step 3: Commit**

```bash
git add ie-crm/src/components/shared/Section.jsx
git commit -m "feat(phase2): Apple Notes-style section collapse with right→down chevron"
```

---

### Task 9: InlineField.jsx — macOS Focus Ring

**Files:**
- Modify: `ie-crm/src/components/shared/InlineField.jsx`

**Step 1: Update all input/textarea/select focus styles**

Replace `focus:outline-none` with macOS-style focus ring on all edit-mode inputs.

For text/number/date inputs (line ~294):
```
border-crm-accent/50 rounded px-2 py-1.5
```
→
```
border-crm-border rounded-md px-2 py-1.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] focus:ring-2 focus:ring-crm-accent/40 focus:border-crm-accent/50 focus:outline-none
```

Apply same pattern to textarea (line ~272) and select (line ~218).

**Step 2: Commit**

```bash
git add ie-crm/src/components/shared/InlineField.jsx
git commit -m "feat(phase2): macOS focus ring styling on InlineField inputs"
```

---

### Task 10: Sheet-Style Modal Animations

**Files:**
- Modify: `ie-crm/src/components/shared/QuickAddModal.jsx`
- Modify: `ie-crm/src/components/shared/LinkPickerModal.jsx` (if it uses same modal pattern)

**Step 1: Update QuickAddModal**

Current: modal is centered at `pt-[15vh]` with no entry animation.
New: slide down from top with `animate-sheet-down`.

Change the modal card div:
```jsx
// Old:
<div className="relative bg-crm-card/95 border border-crm-border/50 rounded-2xl shadow-2xl glass-modal w-full max-w-md" ...>

// New:
<div className="relative bg-crm-card/95 border border-crm-border/50 rounded-2xl shadow-2xl glass-modal w-full max-w-md animate-sheet-down" ...>
```

Also lighten the overlay from `bg-black/50` to `bg-black/20`.

**Step 2: Apply same to LinkPickerModal**

Apply same `animate-sheet-down` and lighter overlay treatment.

**Step 3: Commit**

```bash
git add ie-crm/src/components/shared/QuickAddModal.jsx ie-crm/src/components/shared/LinkPickerModal.jsx
git commit -m "feat(phase2): sheet-style slide-down animation for modals"
```

---

### Task 11: InlineField in CrmTable — macOS Focus Ring

**Files:**
- Modify: `ie-crm/src/components/shared/CrmTable.jsx`
- Modify: `ie-crm/src/components/shared/InlineTableCellEditor.jsx` (if separate)

**Step 1: Update inline cell editor focus styles**

The `InlineCellEditor` inside CrmTable (line ~10-105) uses `border-crm-accent/50` for focus. Update all inputs/selects/textareas to use the macOS focus ring pattern:

```
bg-crm-card border border-crm-border rounded-md shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] focus:ring-2 focus:ring-crm-accent/40 focus:border-crm-accent/50 focus:outline-none
```

**Step 2: Commit**

```bash
git add ie-crm/src/components/shared/CrmTable.jsx ie-crm/src/components/shared/InlineTableCellEditor.jsx
git commit -m "feat(phase2): macOS focus ring on CrmTable inline editors"
```

---

### Task 12: Final Polish & Verification

**Files:**
- Various — visual review only

**Step 1: Start dev servers and screenshot**

```bash
# Servers should already be running, but restart if needed
preview_start express-server
preview_start vite-dev
```

**Step 2: Visual verification checklist**

Using `preview_screenshot` and `preview_snapshot`, verify:
- [ ] Keyboard shortcuts work (Cmd+K opens palette, Cmd+1 navigates, Escape closes)
- [ ] Command palette shows search results grouped by entity
- [ ] Right-click on table row shows context menu
- [ ] Single-click selects row (blue highlight), double-click opens detail
- [ ] Row height is tighter (~38px)
- [ ] Column headers show chevrons instead of arrows
- [ ] Section collapse uses right→down chevron
- [ ] Modal animations slide down from top
- [ ] Input focus rings show blue glow
- [ ] Alternating row colors visible

**Step 3: Fix any issues found**

**Step 4: Commit any polish fixes**

```bash
git add -A
git commit -m "fix(phase2): visual polish from verification pass"
```
