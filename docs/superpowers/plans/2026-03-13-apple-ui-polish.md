# Apple UI Polish: Motion, Gradients & Visual Richness — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visionOS-inspired depth effects, gradient accents, empty states, and micro-interaction polish to the existing Apple liquid glass CRM UI.

**Architecture:** Pure CSS + React changes — no new dependencies. Spring easing curves and gradient variables go into `index.css` and `tailwind.config.js`. Component changes are additive (new classes, inline styles for `--row-index`). One new shared component (`EmptyState.jsx`).

**Tech Stack:** React 18, Tailwind CSS 3, CSS custom properties, CSS animations/transitions

---

## Chunk 1: Foundation + Buttons + Status Badges

### Task 1: Spring Curves + Gradient Variables in CSS

**Files:**
- Modify: `ie-crm/src/index.css` (lines 1–206)
- Modify: `ie-crm/tailwind.config.js` (lines 1–66)

- [ ] **Step 1: Add gradient CSS custom properties to `:root` in index.css**

After line 38 (closing the dark theme `:root` block's SQL variables), add gradient variables just before the closing `}`:

```css
  /* Gradient accents */
  --crm-gradient-primary: linear-gradient(135deg, #007AFF, #AF52DE);
  --crm-gradient-primary-shadow: 0 6px 20px rgba(0,122,255,0.4);
  --crm-gradient-success: linear-gradient(135deg, #30D158, #34C759);
  --crm-gradient-warning: linear-gradient(135deg, #FF9F0A, #FFD60A);
  --crm-gradient-info: linear-gradient(135deg, #007AFF, #5AC8FA);
  --crm-gradient-purple: linear-gradient(135deg, #AF52DE, #BF5AF2);

  /* Spring easing curves */
  --spring: cubic-bezier(0.175, 0.885, 0.32, 1.275);
  --spring-smooth: cubic-bezier(0.25, 0.46, 0.45, 0.94);
```

These same variables work for both dark and light mode — no need to duplicate in the `@media (prefers-color-scheme: light)` block.

- [ ] **Step 2: Add utility classes to index.css**

Append these after the existing `.sql-comment` block (after line 205):

```css
/* ============================================================
   MOTION: Spring easing + gradient utilities
   ============================================================ */

/* Primary CTA button — gradient with glow */
.btn-primary {
  background: var(--crm-gradient-primary);
  color: white;
  font-weight: 600;
  box-shadow: var(--crm-gradient-primary-shadow),
              inset 0 1px 0 rgba(255,255,255,0.2);
  border: none;
  border-radius: 8px;
  transition: transform 150ms var(--spring),
              box-shadow 150ms var(--spring-smooth);
}
.btn-primary:hover {
  box-shadow: 0 8px 24px rgba(0,122,255,0.5),
              inset 0 1px 0 rgba(255,255,255,0.2);
  transform: translateY(-1px);
}
.btn-primary:active {
  transform: scale(0.97);
  box-shadow: 0 2px 8px rgba(0,122,255,0.3);
}

/* Focus ring animation */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 0px rgba(0,122,255,0.4);
  animation: focus-ring-in 150ms var(--spring) forwards;
}
@keyframes focus-ring-in {
  to { box-shadow: 0 0 0 3px rgba(0,122,255,0.4); }
}

/* Toast slide-up */
@keyframes toast-slide-up {
  from {
    transform: translateY(20px) scale(0.95);
    opacity: 0;
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
  }
}
```

- [ ] **Step 3: Update tailwind.config.js keyframes and animations to use spring curves**

Replace only the `keyframes` and `animation` objects inside `theme.extend` in `tailwind.config.js` (keep the `colors` block intact):

```js
keyframes: {
  'slide-in-right': {
    '0%': { transform: 'translateX(100%)', opacity: '0' },
    '100%': { transform: 'translateX(0)', opacity: '1' },
  },
  'slide-out-right': {
    '0%': { transform: 'translateX(0)', opacity: '1' },
    '100%': { transform: 'translateX(100%)', opacity: '0' },
  },
  'fade-in': {
    '0%': { opacity: '0' },
    '100%': { opacity: '1' },
  },
  'row-appear': {
    '0%': { opacity: '0', transform: 'translateY(-4px)' },
    '100%': { opacity: '1', transform: 'translateY(0)' },
  },
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
  'sheet-down': {
    '0%': { transform: 'scale(0.95)', opacity: '0' },
    '100%': { transform: 'scale(1)', opacity: '1' },
  },
  'sheet-up': {
    '0%': { transform: 'scale(1)', opacity: '1' },
    '100%': { transform: 'scale(0.95)', opacity: '0' },
  },
},
animation: {
  'slide-in-right': 'slide-in-right 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  'slide-out-right': 'slide-out-right 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  'fade-in': 'fade-in 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  'row-appear': 'row-appear 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) both',
  shimmer: 'shimmer 1.5s ease-in-out infinite',
  'sheet-down': 'sheet-down 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  'sheet-up': 'sheet-up 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
},
```

Key changes:
- `slide-in-right`: 0.3s → 0.35s, uses spring curve (overshoot on panel entrance)
- `slide-out-right`: uses smooth spring (no overshoot on exit)
- `fade-in`: uses smooth spring
- `row-appear`: uses spring curve with `both` fill mode for stagger delay support
- `sheet-down`: changed from translateY to scale (modal drops in from slightly above and expands)
- `sheet-up`: changed to match (scale reverse)

- [ ] **Step 4: Verify dev server is running and check for CSS errors**

Run: Open http://localhost:5173 and check the browser console for CSS parse errors. The app should still look and function normally since we only added new variables and classes — nothing existing was removed.

- [ ] **Step 5: Commit**

```bash
git add ie-crm/src/index.css ie-crm/tailwind.config.js
git commit -m "feat(ui): add spring curves, gradient variables, and btn-primary class"
```

---

### Task 2: Apply Gradient CTA Buttons to All Pages

**Files:**
- Modify: `ie-crm/src/pages/Properties.jsx:323-330`
- Modify: `ie-crm/src/pages/Contacts.jsx` (same pattern)
- Modify: `ie-crm/src/pages/Companies.jsx` (same pattern)
- Modify: `ie-crm/src/pages/Deals.jsx` (same pattern)
- Modify: `ie-crm/src/pages/Interactions.jsx:69-77`
- Modify: `ie-crm/src/pages/Campaigns.jsx` (same pattern)
- Modify: `ie-crm/src/pages/ActionItems.jsx` (same pattern)
- Modify: `ie-crm/src/pages/Comps.jsx` (same pattern)

- [ ] **Step 1: Update Properties.jsx "+ New" button**

Find the button with class `bg-crm-accent hover:bg-crm-accent-hover text-white font-medium` and replace its className with the `btn-primary` utility class.

Before:
```jsx
className="text-xs bg-crm-accent hover:bg-crm-accent-hover text-white font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
```

After:
```jsx
className="text-xs btn-primary px-3 py-1.5 flex items-center gap-1"
```

- [ ] **Step 2: Repeat for all other pages**

Apply the same change to the "+ New" button in each page file:
- `Contacts.jsx`
- `Companies.jsx`
- `Deals.jsx`
- `Interactions.jsx` — button says "New Activity"
- `Campaigns.jsx`
- `ActionItems.jsx`
- `Comps.jsx` — may have two buttons (Lease Comp / Sale Comp tabs)

Search pattern to find buttons: `bg-crm-accent hover:bg-crm-accent-hover text-white font-medium`

- [ ] **Step 3: Verify visually**

Open each tab in the browser. The "+ New" buttons should now show a blue-to-purple gradient with a glow shadow. Hover should lift the button 1px. Press should scale it down to 0.97.

- [ ] **Step 4: Commit**

```bash
git add ie-crm/src/pages/*.jsx
git commit -m "feat(ui): apply gradient CTA buttons across all pages"
```

---

### Task 3: Gradient Status Badges

**Files:**
- Modify: `ie-crm/src/pages/Deals.jsx:19-30` (STATUS_COLORS)
- Modify: `ie-crm/src/pages/Deals.jsx:57-59` (renderCell)
- Modify: `ie-crm/src/components/shared/formatCell.jsx:46-58` (status case)
- Modify: `ie-crm/src/pages/Campaigns.jsx` (if it has status badges — check)
- Modify: `ie-crm/src/pages/ActionItems.jsx` (if it has status/priority — check)

- [ ] **Step 1: Update Deals.jsx STATUS_COLORS to gradient styles**

Replace the `STATUS_COLORS` object at line 19:

```jsx
const STATUS_COLORS = {
  Active: 'bg-gradient-to-r from-[#30D158] to-[#34C759] text-white shadow-[0_2px_6px_rgba(48,209,88,0.3)]',
  Lead: 'bg-gradient-to-r from-[#FF9F0A] to-[#FFD60A] text-white shadow-[0_2px_6px_rgba(255,159,10,0.3)]',
  Prospect: 'bg-gradient-to-r from-[#FF9F0A] to-[#FFD60A] text-white shadow-[0_2px_6px_rgba(255,159,10,0.3)]',
  Prospecting: 'bg-gradient-to-r from-[#FF9F0A] to-[#FFD60A] text-white shadow-[0_2px_6px_rgba(255,159,10,0.3)]',
  'Long Leads': 'bg-gradient-to-r from-[#FF9F0A] to-[#FF6B2C] text-white shadow-[0_2px_6px_rgba(255,107,44,0.3)]',
  'Under Contract': 'bg-gradient-to-r from-[#007AFF] to-[#5AC8FA] text-white shadow-[0_2px_6px_rgba(0,122,255,0.3)]',
  Closed: 'bg-gradient-to-r from-[#AF52DE] to-[#BF5AF2] text-white shadow-[0_2px_6px_rgba(175,82,222,0.3)]',
  'Deal fell through': 'bg-[rgba(142,142,147,0.2)] text-[#8e8e93]',
  Dead: 'bg-[rgba(142,142,147,0.2)] text-[#8e8e93]',
  'Dead Lead': 'bg-[rgba(142,142,147,0.2)] text-[#8e8e93]',
};
```

Dead/Lost/Deal-fell-through intentionally stay flat — no gradient energy for dead deals.

- [ ] **Step 2: Update Deals.jsx renderCell to remove border class**

The current renderCell uses `rounded-full` with no border — keep that, but since gradients are opaque fills now, we don't need the border. The renderCell at line 57 should stay as-is (it only uses `STATUS_COLORS[val]` which now contains the gradient classes).

- [ ] **Step 3: Update formatCell.jsx status case for gradient badges**

Replace the `status` case (lines 46-58):

```jsx
case 'status': {
  const statusGradients = {
    Active: 'bg-gradient-to-r from-[#30D158] to-[#34C759] text-white shadow-[0_2px_6px_rgba(48,209,88,0.3)]',
    Closed: 'bg-gradient-to-r from-[#AF52DE] to-[#BF5AF2] text-white shadow-[0_2px_6px_rgba(175,82,222,0.3)]',
    Pending: 'bg-gradient-to-r from-[#FF9F0A] to-[#FFD60A] text-white shadow-[0_2px_6px_rgba(255,159,10,0.3)]',
    'Under Contract': 'bg-gradient-to-r from-[#007AFF] to-[#5AC8FA] text-white shadow-[0_2px_6px_rgba(0,122,255,0.3)]',
    Lost: 'bg-[rgba(142,142,147,0.2)] text-[#8e8e93]',
    Won: 'bg-gradient-to-r from-[#AF52DE] to-[#BF5AF2] text-white shadow-[0_2px_6px_rgba(175,82,222,0.3)]',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${statusGradients[value] || 'bg-crm-card text-crm-muted'}`}>
      {value}
    </span>
  );
}
```

Note: Changed `rounded` + `border` to `rounded-full` + `font-medium` with no border (gradient fills don't need borders). Priority badges (`case 'priority'`) and type badges (`case 'type'`) stay flat as specified in the design doc.

- [ ] **Step 4: Check Campaigns.jsx and ActionItems.jsx for status badges**

Search each file for `renderCell` or `status` columns. If they use custom `renderCell` with their own color maps, update those too. If they rely on `formatCell.jsx`'s `status` case, no changes needed.

- [ ] **Step 5: Update detail view status badges**

Per the spec: "Detail view badges (e.g., status in DealDetail header) get the same gradient treatment as table badges — they should match."

Search for status badge rendering in detail views:
```bash
grep -rn "bg-.*500/.*text-.*400\|statusColors\|STATUS_COLORS" ie-crm/src/pages/*Detail.jsx
```

For each detail view that renders a status badge (at minimum `DealDetail.jsx`), update the badge styling to match the gradient fills from Step 1. Apply the same `STATUS_COLORS` gradient map or import it from the page file.

- [ ] **Step 6: Verify visually**

Open Deals tab. Status badges should now show gradient fills with colored shadows. Dead/Deal fell through should be flat gray. Check other tabs that show status badges. Open a Deal detail panel and verify the status badge matches the table badge.

- [ ] **Step 7: Commit**

```bash
git add ie-crm/src/pages/Deals.jsx ie-crm/src/components/shared/formatCell.jsx ie-crm/src/pages/DealDetail.jsx
git commit -m "feat(ui): gradient status badges on deals, formatCell, and detail views"
```

---

## Chunk 2: Sidebar + Table Interactions

### Task 4: Sidebar Active Icon Gradient + Glow

**Files:**
- Modify: `ie-crm/src/components/Sidebar.jsx:51-66`

- [ ] **Step 1: Update active state styling**

In `Sidebar.jsx`, find the button's className (line 54). Replace the active/inactive ternary:

Before:
```jsx
className={`no-drag relative group flex flex-col items-center justify-center py-3 rounded-xl transition-all duration-200 ${
  isActive
    ? 'bg-crm-accent/15 text-crm-accent'
    : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
}`}
```

After:
```jsx
className={`no-drag relative group flex flex-col items-center justify-center py-3 rounded-xl transition-all duration-200 ${
  isActive
    ? 'text-white shadow-[0_0_20px_rgba(0,122,255,0.3)]'
    : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover hover:scale-[1.08] active:scale-[0.92]'
}`}
style={isActive ? { background: 'linear-gradient(135deg, #007AFF, #5856D6)', borderRadius: '12px' } : undefined}
```

The active state gets a gradient background with ambient glow shadow and white icon. Inactive gets hover scale (1.08) and press scale (0.92) for visionOS-style depth.

- [ ] **Step 2: Verify visually**

Click through sidebar items. Active icon should have a blue-to-indigo gradient background with a soft blue glow. Inactive icons should scale up slightly on hover and press down on click.

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/components/Sidebar.jsx
git commit -m "feat(ui): sidebar active icon gradient + hover/press depth"
```

---

### Task 5: Table Row Hover Depth + Press State + Stagger

**Files:**
- Modify: `ie-crm/src/components/shared/CrmTable.jsx:397` (table element)
- Modify: `ie-crm/src/components/shared/CrmTable.jsx:498-521` (row rendering)

- [ ] **Step 1: Change table to `border-collapse: separate`**

In CrmTable.jsx, find the `<table>` element at line 397:

Before:
```jsx
<table className="text-sm border-collapse" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
```

After:
```jsx
<table className="text-sm" style={{ tableLayout: 'fixed', minWidth: 'max-content', borderCollapse: 'separate', borderSpacing: 0 }}>
```

This enables `border-radius` on `<tr>` elements which is required for the hover lift shadow to look correct.

- [ ] **Step 2: Add hover depth + press state + stagger delay to rows**

Find the `<tr>` element for data rows (line 503). Update its className and style:

Before:
```jsx
<tr
  key={id}
  onClick={(e) => { /* ... */ }}
  onContextMenu={(e) => { /* ... */ }}
  className={`border-b border-crm-border/30 cursor-pointer transition-colors duration-150 animate-row-appear ${
    isSelected ? 'bg-crm-accent/15' : 'hover:bg-crm-hover'
  } ${extraClass}`}
  style={idx % 2 === 1 ? { backgroundColor: 'rgba(255,255,255,0.02)' } : undefined}
>
```

After:
```jsx
<tr
  key={id}
  onClick={(e) => { /* ... */ }}
  onContextMenu={(e) => { /* ... */ }}
  className={`border-b border-crm-border/30 cursor-pointer animate-row-appear ${
    isSelected
      ? 'bg-crm-accent/15 shadow-[0_8px_24px_rgba(0,0,0,0.35),inset_0_0_0_1px_rgba(255,255,255,0.1)] -translate-y-[3px]'
      : 'hover:bg-crm-hover hover:-translate-y-[2px] hover:shadow-[0_4px_16px_rgba(0,0,0,0.15)] active:scale-[0.995]'
  } ${extraClass}`}
  style={{
    '--row-index': idx,
    animationDelay: `calc(var(--row-index, 0) * 30ms)`,
    transition: 'transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94), background-color 150ms ease',
    borderRadius: '8px',
    ...(idx % 2 === 1 ? { backgroundColor: 'rgba(255,255,255,0.02)' } : {}),
  }}
>
```

Key details:
- **Hover**: rows lift 2px with a soft shadow (spring curve for transform, smooth for shadow)
- **Selected**: deeper lift (3px) with stronger shadow + inset border highlight (Dramatic cherry-pick)
- **Press**: brief scale(0.995) compression before opening detail panel
- **Stagger**: `--row-index` CSS variable drives `animation-delay` at 30ms per row
- **border-radius: 8px**: subtle rounding on rows for the lifted shadow effect
- Removed `transition-colors duration-150` from className (now in inline style for full control)

- [ ] **Step 3: Verify visually**

Hover over table rows — they should lift 2px with a growing shadow. Click a row and see the brief press compression. Selected rows should have a deeper shadow. On page load, rows should stagger in with 30ms delay between each.

- [ ] **Step 4: Commit**

```bash
git add ie-crm/src/components/shared/CrmTable.jsx
git commit -m "feat(ui): table row hover depth, press state, and stagger animation"
```

---

## Chunk 3: Panel Animations + Linked Chips

### Task 6: Panel Animation Upgrades

**Files:**
- Modify: `ie-crm/src/components/shared/SlideOver.jsx:24` (panel class)
- Modify: `ie-crm/src/components/shared/ActivityModal.jsx` (modal animation)
- Modify: `ie-crm/src/components/shared/LinkPickerModal.jsx` (modal animation)
- Modify: `ie-crm/src/components/shared/QuickAddModal.jsx` (modal animation)
- Modify: `ie-crm/src/components/shared/CompManualEntryModal.jsx` (modal animation)
- Modify: `ie-crm/src/components/shared/NewInteractionModal.jsx` (modal animation)
- Modify: `ie-crm/src/components/shared/CommandPalette.jsx` (already uses `animate-sheet-down` — no change needed)
- Modify: `ie-crm/src/components/shared/Toast.jsx:48` (toast animation)

- [ ] **Step 1: SlideOver spring animation is already handled**

The `animate-slide-in-right` animation was updated in Task 1 (tailwind.config.js) to use the spring curve at 350ms. SlideOver.jsx uses this class at line 24 — no code change needed in the component itself. Verify the panel slides in with a slight overshoot.

- [ ] **Step 2: Ensure all modals use `animate-sheet-down` (scale entrance)**

The `animate-sheet-down` class was updated in Task 1 to use `scale(0.95) → scale(1)` instead of `translateY(-20px) → translateY(0)`.

**Already using `animate-sheet-down`** (auto-updated, no changes needed):
- `LinkPickerModal.jsx`
- `QuickAddModal.jsx`
- `CommandPalette.jsx`

**Need `animate-sheet-down` added** (currently missing or using different animation):
- `ActivityModal.jsx` — Find the modal container div and add `animate-sheet-down` to its className
- `NewInteractionModal.jsx` — Find the modal container div and add `animate-sheet-down` to its className
- `CompManualEntryModal.jsx` — Replace `animate-fade-in` with `animate-sheet-down` on the modal container div

For each file, locate the inner modal panel div (the one with `bg-crm-*` styling, NOT the overlay). Add or replace the animation class:

```jsx
// Add to className:
className="... animate-sheet-down ..."
```

- [ ] **Step 3: Update Toast animation**

In `ie-crm/src/components/shared/Toast.jsx`, find the ToastItem div (line 48):

Before:
```jsx
className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm animate-fade-in glass-toast shadow-lg ${colors[toast.type] || colors.info}`}
```

After:
```jsx
className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm glass-toast shadow-lg ${colors[toast.type] || colors.info}`}
style={{ animation: 'toast-slide-up 350ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both' }}
```

This replaces the generic `animate-fade-in` with the spring slide-up keyframe defined in Task 1.

- [ ] **Step 4: Verify visually**

- Open a detail panel (SlideOver) — should spring in with slight overshoot
- Open any modal (QuickAdd, LinkPicker) — should scale in from 0.95 to 1.0
- Trigger a toast (e.g., save a record) — should slide up from below with spring bounce

- [ ] **Step 5: Commit**

```bash
git add ie-crm/src/components/shared/Toast.jsx ie-crm/src/components/shared/ActivityModal.jsx ie-crm/src/components/shared/NewInteractionModal.jsx ie-crm/src/components/shared/CompManualEntryModal.jsx
git commit -m "feat(ui): spring panel animations, modal drop-in, and toast slide-up"
```

---

### Task 7: LinkedChips Hover Scale + ContextMenu/AddFieldPanel Entrance

**Files:**
- Modify: `ie-crm/src/components/shared/LinkedChips.jsx`
- Modify: `ie-crm/src/components/shared/ContextMenu.jsx`
- Modify: `ie-crm/src/components/shared/AddFieldPanel.jsx`
- Modify: `ie-crm/src/components/shared/ColumnToggleMenu.jsx`

- [ ] **Step 1: Add hover scale to LinkedChips**

In `LinkedChips.jsx`, find each chip element (the clickable span/button for each linked record). Add hover scale:

Add to each chip's className: `hover:scale-[1.02] transition-transform duration-150`

Add inline style: `style={{ transitionTimingFunction: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}`

- [ ] **Step 2: Add entrance animation to ContextMenu**

In `ContextMenu.jsx`, find the menu container div. It should already have `animate-fade-in` or similar. Update to use scale entrance:

Add to the menu container's style:
```jsx
style={{ animation: 'sheet-down 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
```

- [ ] **Step 3: Add entrance animation to AddFieldPanel and ColumnToggleMenu**

Same pattern — find the dropdown/panel container and add the scale entrance animation:

```jsx
style={{ animation: 'sheet-down 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}
```

- [ ] **Step 4: Verify visually**

- Hover over linked record chips — should subtly scale up
- Right-click a table row — context menu should scale in
- Click the "+" Add Field button — panel should scale in
- Click the Columns button — toggle menu should scale in

- [ ] **Step 5: Commit**

```bash
git add ie-crm/src/components/shared/LinkedChips.jsx ie-crm/src/components/shared/ContextMenu.jsx ie-crm/src/components/shared/AddFieldPanel.jsx ie-crm/src/components/shared/ColumnToggleMenu.jsx
git commit -m "feat(ui): hover scale on chips, entrance animations on menus"
```

---

## Chunk 4: Empty States

### Task 8: Create EmptyState Component

**Files:**
- Create: `ie-crm/src/components/shared/EmptyState.jsx`

- [ ] **Step 1: Create the EmptyState component with inline gradient SVG icons**

```jsx
import React from 'react';

const ENTITY_ICONS = {
  properties: {
    gradient: ['#007AFF', '#AF52DE'],
    // Building/warehouse icon
    path: 'M3 21V7l9-4 9 4v14M3 21h18M9 21v-6h6v6M7 11h2m6 0h2M7 15h2m6 0h2',
  },
  contacts: {
    gradient: ['#007AFF', '#5AC8FA'],
    // Person silhouette
    path: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  companies: {
    gradient: ['#AF52DE', '#BF5AF2'],
    // Briefcase
    path: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  deals: {
    gradient: ['#30D158', '#5AC8FA'],
    // Dollar sign (green -> teal per spec)
    path: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  interactions: {
    gradient: ['#FF9F0A', '#FFD60A'],
    // Chat bubble
    path: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
  campaigns: {
    gradient: ['#FF375F', '#FF6482'],
    // Megaphone / mail
    path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  tasks: {
    gradient: ['#007AFF', '#30D158'],
    // Checkbox circle
    path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  comps: {
    gradient: ['#5AC8FA', '#007AFF'],
    // Bar chart
    path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  search: {
    gradient: ['#007AFF', '#AF52DE'],
    // Magnifying glass
    path: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  },
};

function GradientIcon({ entity, size = 48 }) {
  const { gradient, path } = ENTITY_ICONS[entity] || ENTITY_ICONS.properties;
  const gradientId = `gradient-${entity}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={gradient[0]} />
          <stop offset="100%" stopColor={gradient[1]} />
        </linearGradient>
      </defs>
      <path
        d={path}
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Full-page empty state — centered with icon, title, subtitle, and CTA */
export default function EmptyState({ entity, entityLabel, onAdd, addLabel }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <GradientIcon entity={entity} size={48} />
      <p className="text-sm font-medium text-crm-text">No {entityLabel} yet</p>
      <p className="text-xs text-crm-muted">Add your first {entityLabel.toLowerCase()} to get started</p>
      {onAdd && (
        <button onClick={onAdd} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 mt-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {addLabel || `Add ${entityLabel}`}
        </button>
      )}
    </div>
  );
}

/** Inline empty state — for linked record sections in detail panels */
export function InlineEmptyState({ entity, entityLabel, onLink }) {
  return (
    <div className="flex items-center gap-2 py-2 px-1">
      <GradientIcon entity={entity} size={24} />
      <span className="text-[11px] text-crm-muted">No linked {entityLabel.toLowerCase()}</span>
      {onLink && (
        <button onClick={onLink} className="text-[11px] text-crm-accent hover:underline ml-auto">
          Link
        </button>
      )}
    </div>
  );
}

/** Search no-results state */
export function SearchEmptyState({ query }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <GradientIcon entity="search" size={32} />
      <p className="text-[13px] text-crm-text">No results for &lsquo;{query}&rsquo;</p>
      <p className="text-[11px] text-crm-muted">Try a different search term</p>
    </div>
  );
}

export { GradientIcon, ENTITY_ICONS };
```

- [ ] **Step 2: Commit**

```bash
git add ie-crm/src/components/shared/EmptyState.jsx
git commit -m "feat(ui): create EmptyState component with gradient SVG icons"
```

---

### Task 9: Integrate Empty States into All Pages

**Files:**
- Modify: `ie-crm/src/pages/Properties.jsx`
- Modify: `ie-crm/src/pages/Contacts.jsx`
- Modify: `ie-crm/src/pages/Companies.jsx`
- Modify: `ie-crm/src/pages/Deals.jsx`
- Modify: `ie-crm/src/pages/Interactions.jsx`
- Modify: `ie-crm/src/pages/Campaigns.jsx`
- Modify: `ie-crm/src/pages/ActionItems.jsx`
- Modify: `ie-crm/src/pages/Comps.jsx`

- [ ] **Step 1: Integrate EmptyState into CrmTable pages**

For each CrmTable-based page (Properties, Contacts, Companies, Deals, Campaigns, ActionItems, Comps), update the `emptyMessage` and `emptySubMessage` props OR add an empty state check before CrmTable.

The cleanest approach: add a conditional render before CrmTable. When `!loading && rows.length === 0 && !search && !filterType`, show `<EmptyState>` instead of the table.

Example for Properties.jsx:

```jsx
import EmptyState from '../components/shared/EmptyState';
// ... in the return, before or instead of CrmTable when empty:
{!loading && augmentedRows.length === 0 && !search && !filterType && !filterPriority ? (
  <EmptyState
    entity="properties"
    entityLabel="Properties"
    onAdd={() => setShowQuickAdd(true)}
    addLabel="+ New Property"
  />
) : (
  <CrmTable ... />
)}
```

Repeat for each page with the correct entity key and label:
- `Contacts.jsx`: `entity="contacts"` `entityLabel="Contacts"`
- `Companies.jsx`: `entity="companies"` `entityLabel="Companies"`
- `Deals.jsx`: `entity="deals"` `entityLabel="Deals"`
- `Campaigns.jsx`: `entity="campaigns"` `entityLabel="Campaigns"`
- `ActionItems.jsx`: `entity="tasks"` `entityLabel="Tasks"`
- `Comps.jsx`: `entity="comps"` `entityLabel="Comps"`

- [ ] **Step 2: Integrate EmptyState into Interactions.jsx**

Interactions uses a timeline layout, not CrmTable. Add the same conditional:

```jsx
import EmptyState from '../components/shared/EmptyState';
// When rows is empty and no filters active:
{!loading && rows.length === 0 && !search && !filterType ? (
  <EmptyState
    entity="interactions"
    entityLabel="Activity"
    onAdd={() => setShowQuickAdd(true)}
    addLabel="+ New Activity"
  />
) : (
  // existing timeline rendering
)}
```

- [ ] **Step 3: Verify visually**

To test: temporarily set an impossible filter value so the table returns zero rows. The empty state should show the gradient SVG icon, title, subtitle, and gradient CTA button.

- [ ] **Step 4: Commit**

```bash
git add ie-crm/src/pages/*.jsx
git commit -m "feat(ui): integrate empty states with gradient icons across all pages"
```

---

## Chunk 5: Micro-Interactions

### Task 10: Tooltip Entrance Animation

**Files:**
- Modify: `ie-crm/src/index.css` (add tooltip animation keyframes)

- [ ] **Step 1: Add tooltip animation CSS**

Tooltips in the app use the `title` attribute on HTML elements (native browser tooltips). If the app has custom tooltip components, add the spring entrance to them. If using only native `title` attributes, this task is a no-op.

Search for custom tooltip implementations:
```bash
grep -rn "tooltip\|Tooltip" ie-crm/src/ --include="*.jsx"
```

If a custom tooltip component exists, add entrance animation to it:

```css
/* Tooltip entrance — spring scale */
.tooltip-enter {
  animation: tooltip-in 150ms cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
}
@keyframes tooltip-in {
  from {
    transform: scale(0.9);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
```

Exit: `opacity: 1 → 0` at 100ms ease-out (no scale on exit).

If only native `title` tooltips are used, skip this task — native tooltips can't be animated.

- [ ] **Step 2: Commit (if changes made)**

```bash
git add ie-crm/src/index.css
git commit -m "feat(ui): tooltip spring entrance animation"
```

---

### Task 11: Custom Checkbox Animation

**Files:**
- Modify: `ie-crm/src/index.css` (add checkbox styles)

- [ ] **Step 1: Add custom checkbox CSS to index.css**

Append after the existing utility classes:

```css
/* Custom checkbox — gradient fill with bounce */
input[type="checkbox"].rounded {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--crm-border);
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  transition: all 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
  position: relative;
}
input[type="checkbox"].rounded:checked {
  background: linear-gradient(135deg, #007AFF, #5856D6);
  border-color: transparent;
  animation: checkbox-bounce 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
input[type="checkbox"].rounded:checked::after {
  content: '';
  position: absolute;
  left: 4.5px;
  top: 1.5px;
  width: 5px;
  height: 9px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
@keyframes checkbox-bounce {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
```

This targets checkboxes with the `rounded` class (which CrmTable already applies to its row checkboxes at line 407 and 529).

- [ ] **Step 2: Verify visually**

Check/uncheck rows in CrmTable. The checkbox should fill with a blue-purple gradient and bounce briefly on check.

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/index.css
git commit -m "feat(ui): custom gradient checkbox with bounce animation"
```

---

### Task 12: Sort Indicator Spring Bounce

**Files:**
- Modify: `ie-crm/src/components/shared/CrmTable.jsx:160-163` (sort arrow SVG)

- [ ] **Step 1: Add spring rotation to sort indicator**

In the ColumnHeader component, find the sort arrow SVG (line 160):

Before:
```jsx
{orderBy === col.key && (
  <svg className="w-3 h-3 text-crm-accent ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={order === 'ASC' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
  </svg>
)}
```

After:
```jsx
{orderBy === col.key && (
  <svg
    className="w-3 h-3 text-crm-accent ml-1 inline-block"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    style={{
      transition: 'transform 200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      transform: order === 'ASC' ? 'rotate(0deg)' : 'rotate(180deg)',
    }}
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
  </svg>
)}
```

Instead of swapping the `d` path, we use a single up-arrow path and rotate it 180deg for DESC. The spring curve creates a slight overshoot on the rotation (~5 degrees past target, then settling back).

- [ ] **Step 2: Verify visually**

Click a column header to sort. The arrow should smoothly rotate with a spring bounce at the end, rather than instantly swapping.

- [ ] **Step 3: Commit**

```bash
git add ie-crm/src/components/shared/CrmTable.jsx
git commit -m "feat(ui): sort indicator spring bounce rotation"
```

---

### Task 13: Final Visual QA Pass

**Files:** None — this is a verification task.

- [ ] **Step 1: Full walkthrough**

Open the app and verify each enhancement works correctly:

1. **Buttons**: All "+ New" CTAs show gradient with glow. Hover lifts. Press scales down.
2. **Status badges**: Deals shows gradient fills (Active=green, Lead/Prospect=gold, Under Contract=blue, Closed=purple, Dead=flat gray).
3. **Sidebar**: Active icon has gradient background + ambient glow. Inactive icons scale on hover/press.
4. **Table rows**: Hover lifts 2px with shadow. Selected rows have deep shadow. Rows stagger in on load.
5. **Panels**: SlideOver springs in with overshoot. Modals scale in. Toasts slide up with spring.
6. **Empty states**: Each tab shows entity-specific gradient icon when zero records.
7. **Checkboxes**: Gradient fill with bounce on check.
8. **Sort arrows**: Spring rotation with overshoot.
9. **Linked chips**: Subtle scale on hover.
10. **Menus**: Context menu, AddField, ColumnToggle all scale in.
11. **Focus rings**: Animated expansion on focus-visible.

- [ ] **Step 2: Light mode check**

Switch macOS to light mode. Verify:
- Gradient badges are visible against white backgrounds (may need shadow opacity bump)
- CTA buttons look good on light backgrounds
- Focus rings are visible
- Sidebar gradient still pops

- [ ] **Step 3: Fix any issues found**

Address any visual issues discovered during QA.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix(ui): polish pass — address visual QA findings"
```
