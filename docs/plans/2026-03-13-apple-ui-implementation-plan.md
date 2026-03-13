# Apple-Inspired UI Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the IE CRM from its current blue-gray dark theme to a modern macOS Sonoma/Sequoia aesthetic with frosted glass surfaces, Apple Blue accent, and polished light/dark modes.

**Architecture:** All changes are presentation-only — CSS tokens, Tailwind config, and component classNames. No data flow, API, routing, or schema changes. The existing `crm-*` CSS variable system means token changes propagate everywhere automatically.

**Tech Stack:** Tailwind CSS 3 + CSS custom properties + `backdrop-filter` for frosted glass

---

### Task 1: Update CSS Tokens (Dark Mode)

**Files:**
- Modify: `ie-crm/src/index.css:9-37` (`:root` block)

**Step 1: Replace dark mode tokens**

In `index.css`, replace the entire `:root` block with Apple-inspired dark mode values:

```css
:root {
  /* Dark theme — Apple macOS Sonoma-inspired */
  --crm-bg: #000000;
  --crm-sidebar: rgba(44,44,46,0.80);
  --crm-card: #1c1c1e;
  --crm-accent: #007AFF;
  --crm-accent-hover: #0056CC;
  --crm-text: #f5f5f7;
  --crm-muted: #8e8e93;
  --crm-success: #30D158;
  --crm-border: rgba(255,255,255,0.08);
  --crm-hover: rgba(255,255,255,0.06);

  /* Surfaces & overlays */
  --crm-deep: #000000;
  --crm-overlay: rgba(0, 0, 0, 0.3);
  --crm-tooltip: #1c1c1e;

  /* Scrollbar */
  --crm-scroll-track: transparent;
  --crm-scroll-thumb: rgba(255,255,255,0.15);
  --crm-scroll-thumb-hover: rgba(255,255,255,0.25);

  /* SQL syntax (keep existing — these are fine) */
  --crm-sql-keyword: #c084fc;
  --crm-sql-string: #34d399;
  --crm-sql-number: #fbbf24;
  --crm-sql-comment: #64748b;
}
```

**Step 2: Verify dark mode renders**

Visual check: open `localhost:5173` in dark mode. All surfaces should shift from blue-gray to neutral gray/black. Accent elements should be blue instead of orange.

**Step 3: Commit**

```
feat(ui): apple dark mode tokens — neutral grays, blue accent
```

---

### Task 2: Update CSS Tokens (Light Mode)

**Files:**
- Modify: `ie-crm/src/index.css:39-65` (`@media (prefers-color-scheme: light)` block)

**Step 1: Replace light mode tokens**

```css
@media (prefers-color-scheme: light) {
  :root {
    --crm-bg: #f5f5f7;
    --crm-sidebar: rgba(255,255,255,0.70);
    --crm-card: #ffffff;
    --crm-accent: #007AFF;
    --crm-accent-hover: #0056CC;
    --crm-text: #1d1d1f;
    --crm-muted: #8e8e93;
    --crm-success: #34C759;
    --crm-border: rgba(0,0,0,0.06);
    --crm-hover: rgba(0,0,0,0.04);

    --crm-deep: #ececee;
    --crm-overlay: rgba(0, 0, 0, 0.2);
    --crm-tooltip: #1c1c1e;

    --crm-scroll-track: transparent;
    --crm-scroll-thumb: rgba(0,0,0,0.15);
    --crm-scroll-thumb-hover: rgba(0,0,0,0.25);

    --crm-sql-keyword: #7c3aed;
    --crm-sql-string: #059669;
    --crm-sql-number: #d97706;
    --crm-sql-comment: #94a3b8;
  }
}
```

**Step 2: Verify light mode**

Toggle macOS to light mode (System Settings > Appearance). All surfaces should be warm white/gray. Accent still blue.

**Step 3: Commit**

```
feat(ui): apple light mode tokens
```

---

### Task 3: Add Font Stack + Utility Classes

**Files:**
- Modify: `ie-crm/src/index.css` (add after the scrollbar section, before `.drag-region`)

**Step 1: Add global font and utility classes**

After the scrollbar rules (~line 122), add:

```css
/* Apple system font stack */
body {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Frosted glass utility classes */
.glass-sidebar {
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.glass-panel {
  backdrop-filter: blur(30px) saturate(150%);
  -webkit-backdrop-filter: blur(30px) saturate(150%);
}

.glass-modal {
  backdrop-filter: blur(40px) saturate(180%);
  -webkit-backdrop-filter: blur(40px) saturate(180%);
}

.glass-toast {
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
}
```

**Step 2: Commit**

```
feat(ui): apple font stack + frosted glass utility classes
```

---

### Task 4: Update Tailwind Config — Animations + Easing

**Files:**
- Modify: `ie-crm/tailwind.config.js`

**Step 1: Update animation timings and add Apple easing**

Replace the entire `keyframes` and `animation` sections:

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
},
animation: {
  'slide-in-right': 'slide-in-right 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
  'slide-out-right': 'slide-out-right 0.25s cubic-bezier(0.32, 0.72, 0, 1)',
  'fade-in': 'fade-in 0.2s ease-out',
  'row-appear': 'row-appear 0.2s ease-out',
  shimmer: 'shimmer 1.5s ease-in-out infinite',
},
```

**Step 2: Commit**

```
feat(ui): apple spring easing curves, slower transitions
```

---

### Task 5: Sidebar — Frosted Glass + Pill Navigation

**Files:**
- Modify: `ie-crm/src/components/Sidebar.jsx`

**Step 1: Update the `<aside>` element**

Change line 42 from:
```jsx
<aside className="w-16 bg-crm-sidebar border-r border-crm-border flex flex-col items-center pt-10 pb-4 z-10 flex-shrink-0">
```
to:
```jsx
<aside className="w-16 bg-crm-sidebar glass-sidebar flex flex-col items-center pt-10 pb-4 z-10 flex-shrink-0 border-r border-crm-border/50">
```

**Step 2: Update nav button active/hover styles**

Change the button className (lines 54-58) from:
```jsx
className={`no-drag relative group flex flex-col items-center justify-center py-2.5 rounded-lg transition-colors ${
  isActive
    ? 'bg-crm-accent/20 text-crm-accent'
    : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
}`}
```
to:
```jsx
className={`no-drag relative group flex flex-col items-center justify-center py-3 rounded-xl transition-all duration-200 ${
  isActive
    ? 'bg-crm-accent/15 text-crm-accent'
    : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
}`}
```

**Step 3: Remove the left accent bar indicator**

Delete lines 61-63 (the active indicator bar):
```jsx
{isActive && (
  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-crm-accent rounded-r" />
)}
```

**Step 4: Refine icon stroke width**

Change line 64 from:
```jsx
<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
```
to:
```jsx
<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d={item.icon} />
```

**Step 5: Update tooltip style**

Change line 70 from:
```jsx
<div className="absolute left-full ml-2 px-2 py-1 bg-crm-tooltip text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
```
to:
```jsx
<div className="absolute left-full ml-2 px-2.5 py-1 bg-crm-card/95 glass-toast text-crm-text text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 shadow-lg border border-crm-border">
```

**Step 6: Verify and commit**

Visual check: sidebar should have frosted glass effect, active item should be a filled pill (no left bar), icons slightly thinner.

```
feat(ui): sidebar — frosted glass, pill nav, refined icons
```

---

### Task 6: CrmTable — Apple-Style Row Styling

**Files:**
- Modify: `ie-crm/src/components/shared/CrmTable.jsx`

**Step 1: Update table header row**

Change the `<thead>` and header `<tr>` (lines 389-390):

From:
```jsx
<thead className="sticky top-0 bg-crm-sidebar z-10">
  <tr className="border-b border-crm-border">
```
To:
```jsx
<thead className="sticky top-0 bg-crm-bg/95 glass-sidebar z-10">
  <tr className="border-b border-crm-border">
```

**Step 2: Update the header checkbox cell**

Change line 392:
From: `<th className="px-3 py-2 w-10 sticky left-0 bg-crm-sidebar z-20">`
To: `<th className="px-3 py-2.5 w-10 sticky left-0 bg-crm-bg/95 z-20">`

**Step 3: Update data row styling**

Change the `<tr>` for data rows (lines 497-499):

From:
```jsx
<tr
  key={id}
  onClick={() => onRowClick(row)}
  className={`border-b border-crm-border/50 cursor-pointer transition-colors animate-row-appear ${
    isSelected ? 'bg-crm-accent/5' : 'hover:bg-crm-hover/50'
  } ${extraClass}`}
>
```
To:
```jsx
<tr
  key={id}
  onClick={() => onRowClick(row)}
  className={`border-b border-crm-border/30 cursor-pointer transition-colors duration-150 animate-row-appear ${
    isSelected ? 'bg-crm-accent/10' : 'hover:bg-crm-hover'
  } ${extraClass}`}
>
```

**Step 4: Update cell padding for comfortable density**

Change cell padding in data rows. For the checkbox `<td>` (line 502):
From: `className="px-3 py-3.5 sticky left-0 bg-crm-bg z-[5]"`
To: `className="px-3 py-3 sticky left-0 bg-crm-bg z-[5]"`

For regular cells (line 524):
From: `className={`px-3 py-3.5 overflow-hidden text-ellipsis whitespace-nowrap${isEditable && !isEditing ? ' cursor-cell' : ''}`}`
To: `className={`px-3 py-3 overflow-hidden text-ellipsis whitespace-nowrap${isEditable && !isEditing ? ' cursor-cell' : ''}`}`

For custom field cells (line 564):
From: `className="px-3 py-3.5 overflow-hidden text-ellipsis whitespace-nowrap"`
To: `className="px-3 py-3 overflow-hidden text-ellipsis whitespace-nowrap"`

**Step 5: Verify and commit**

Visual check: table header should have glass effect, rows should have fainter dividers, hover should feel softer, row height slightly taller.

```
feat(ui): CrmTable — apple row styling, glass header, softer dividers
```

---

### Task 7: SlideOver Panel — Frosted Glass

**Files:**
- Modify: `ie-crm/src/components/shared/SlideOver.jsx`

**Step 1: Update the panel container**

Change line 24:
From:
```jsx
className={`relative ${width} bg-crm-sidebar border-l border-crm-border h-full overflow-y-auto animate-slide-in-right`}
```
To:
```jsx
className={`relative ${width} bg-crm-sidebar/95 glass-panel border-l border-crm-border/50 h-full overflow-y-auto animate-slide-in-right rounded-tl-xl`}
```

**Step 2: Update the overlay dim**

Change line 21:
From:
```jsx
<div className={`absolute inset-0 ${level === 0 ? 'bg-black/40' : 'bg-black/20'} animate-fade-in`} />
```
To:
```jsx
<div className={`absolute inset-0 ${level === 0 ? 'bg-black/30' : 'bg-black/15'} animate-fade-in`} />
```

**Step 3: Update the sticky header**

Change line 38:
From:
```jsx
<div className="sticky top-0 bg-crm-sidebar border-b border-crm-border px-5 py-4 z-10">
```
To:
```jsx
<div className="sticky top-0 bg-crm-sidebar/95 glass-panel border-b border-crm-border/50 px-5 py-4 z-10">
```

**Step 4: Update close button to circular hover**

Change line 52 close button:
From:
```jsx
className="text-crm-muted hover:text-crm-text w-8 h-8 flex items-center justify-center rounded-md hover:bg-crm-hover transition-colors"
```
To:
```jsx
className="text-crm-muted hover:text-crm-text w-8 h-8 flex items-center justify-center rounded-full hover:bg-crm-hover transition-colors duration-200"
```

Also update the back button (line 42) similarly — change `rounded-md` to `rounded-full`.

**Step 5: Commit**

```
feat(ui): SlideOver — frosted glass, rounded corner, softer overlay
```

---

### Task 8: Modals — QuickAdd + LinkPicker

**Files:**
- Modify: `ie-crm/src/components/shared/QuickAddModal.jsx`
- Modify: `ie-crm/src/components/shared/LinkPickerModal.jsx`

**Step 1: Update QuickAddModal container**

Find the outer modal container div (the fixed overlay + centered card). Update the card to use:
- `rounded-2xl` (12px)
- `shadow-2xl` shadow
- `glass-modal` class
- `bg-crm-card/95` instead of `bg-crm-card`
- `border border-crm-border/50` (subtle border)

**Step 2: Update LinkPickerModal container**

Apply the same treatment — find the modal card div and add `rounded-2xl shadow-2xl glass-modal bg-crm-card/95 border border-crm-border/50`.

**Step 3: Commit**

```
feat(ui): modals — frosted glass, rounded corners, soft shadows
```

---

### Task 9: Toast Notifications — Frosted Glass

**Files:**
- Modify: `ie-crm/src/components/shared/Toast.jsx`

**Step 1: Update ToastItem styling**

Change line 48 from:
```jsx
className={`pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-lg border text-sm animate-fade-in ${colors[toast.type] || colors.info}`}
```
To:
```jsx
className={`pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm animate-fade-in glass-toast shadow-lg ${colors[toast.type] || colors.info}`}
```

**Step 2: Commit**

```
feat(ui): toast — frosted glass, larger radius
```

---

### Task 10: Search Bar Styling (All Pages)

**Files:**
- Modify: `ie-crm/src/pages/Contacts.jsx` (line ~280-281)
- Modify: `ie-crm/src/pages/Campaigns.jsx` (line ~383)
- Modify: `ie-crm/src/pages/Properties.jsx` (line ~321)
- Modify: `ie-crm/src/pages/Deals.jsx` (line ~249)
- Modify: `ie-crm/src/pages/Companies.jsx` (line ~204)
- Modify: `ie-crm/src/pages/ActionItems.jsx` (line ~237)
- Modify: `ie-crm/src/pages/Interactions.jsx` (line ~97)
- Modify: `ie-crm/src/pages/Comps.jsx` (line ~297)

**Step 1: Update search input className across all pages**

The current pattern across pages is:
```
className="w-full bg-crm-card border border-crm-border rounded-lg pl-8 pr-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
```

Replace with Apple Spotlight-style search:
```
className="w-full bg-crm-hover border-0 rounded-[10px] pl-9 pr-3 py-2.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:ring-2 focus:ring-crm-accent/30"
```

Key changes:
- `bg-crm-hover` instead of `bg-crm-card` + border (filled, borderless)
- `rounded-[10px]` (Apple's search radius)
- `py-2.5` (taller, 40px height)
- `pl-9` (more space for icon)
- `focus:ring-2 focus:ring-crm-accent/30` (soft focus ring instead of border change)

**Step 2: Verify one page, then apply to remaining**

Check Contacts page first, then apply same change to all other pages.

**Step 3: Commit**

```
feat(ui): search bars — spotlight-style pill, borderless fill
```

---

### Task 11: Page Headers — Title Sizing

**Files:**
- Check all pages for `<h1>` or heading elements and update to `text-xl font-semibold` (20px, 600 weight)
- Ensure subtitle/record count text uses `text-crm-muted text-sm`

This is a quick pass across pages — most already use similar patterns.

**Step 1: Verify and update any inconsistent page title styling**

**Step 2: Commit**

```
feat(ui): page titles — consistent 20px semibold
```

---

### Task 12: Final Visual QA

**Files:** None (read-only verification)

**Step 1: Dark mode QA**

Take screenshots of:
- Campaigns list (table view)
- A detail panel (SlideOver)
- A modal (QuickAdd or LinkPicker)
- Toast notification

Check for: consistent colors, glass effects working, no broken borders, readable text.

**Step 2: Light mode QA**

Switch macOS to light mode (or use preview_resize with colorScheme: "light"). Take same screenshots. Check for: proper contrast, glass effects visible, no white-on-white issues.

**Step 3: Commit any fixes**

```
fix(ui): visual QA polish
```

---

### Task 13: Final Commit on Branch

**Step 1: Verify git status — all changes committed on `apple-inspired-ui-overhaul` branch**

**Step 2: Take before/after screenshots for comparison**

The branch is now ready for David to review and decide whether to merge to main.
