# Apple UI Polish: Motion, Gradients & Visual Richness

**Date:** 2026-03-13
**Branch:** `apple-inspired-ui-overhaul`
**Status:** Design approved

## Summary

A comprehensive polish pass on the existing Apple-inspired liquid glass UI. Adds visionOS-inspired depth (hover lifts, spring physics, shadow growth), expressive gradient accents on CTAs and status badges, gradient SVG empty states, and micro-interaction refinements. The goal is to make the UI feel alive and tactile — "Expressive everywhere, Dramatic at the moments that matter."

## Design Decisions

- **Motion personality:** visionOS-inspired depth — elements float, lift on hover, cast growing shadows. Spring physics with slight overshoot on all transitions.
- **Gradient intensity:** Expressive baseline — gradients on primary buttons, status badges, and sidebar active icon. Secondary/utility elements stay flat.
- **Dramatic cherry-picks:** "+ New" CTA buttons get full glow treatment (stronger gradient + colored shadow). Active sidebar icon gets ambient glow. Selected table rows get deep shadow elevation.
- **Visual richness:** Gradient-stroke SVG icons for empty states. No illustrations — clean line art that matches the glass aesthetic.

## Scope

### In scope
- Spring animation system (easing curves, timing)
- Hover depth effects (table rows, buttons, sidebar, chips)
- Press/active states (scale depression, shadow contraction)
- Panel animation upgrades (slide-over spring, modal drop-in, toast slide-up)
- Gradient accent system (CTA buttons, status badges, sidebar active)
- Empty state components (per-entity gradient SVG icons + CTA)
- Micro-interactions (focus ring animation, checkbox bounce, tooltip entrance, sort indicator bounce, toast spring)

### Out of scope
- View diversity (kanban, card, map views) — separate future effort
- Mobile/responsive breakpoints — separate future effort
- Dark mode color changes — current palette is already solid
- Dev mode theme changes — stays VS Code Dark+ as-is

## 1. Motion System

### 1.1 Spring Easing Curve

Replace all existing `ease-out` and `cubic-bezier` curves with the Apple spring curve:

```
cubic-bezier(0.175, 0.885, 0.32, 1.275)
```

This curve has a slight overshoot (~5%) that gives transitions a physical, bouncy feel without being cartoonish.

**Important:** Use the spring curve for `transform` transitions (translateY, scale) and `animation` keyframes. For `box-shadow` and `opacity` transitions, use a non-overshooting ease `cubic-bezier(0.25, 0.46, 0.45, 0.94)` — shadow overshoot produces visual artifacts (briefly larger than intended).

**Timing tiers:**
| Interaction type | Duration | Usage |
|---|---|---|
| Micro (hover, press) | 150-200ms | Button hover, row hover, icon scale |
| Standard (open/close) | 300-350ms | Slide-overs, modals, panel transitions |
| Stagger (list items) | 200ms base + 30ms/item | Table row appear, list animations |

### 1.2 Hover Depth Effects

All hover effects use the spring curve. Elements lift toward the viewer with growing shadows.

**Table rows:**
- `transform: translateY(-2px)`
- `box-shadow: 0 4px 16px rgba(0,0,0,0.15)`
- Background subtly brightens
- Transition: 200ms spring
- Note: `border-radius` on `<tr>` requires `border-collapse: separate; border-spacing: 0;` on the `<table>`. Apply this change to CrmTable when adding hover depth. Alternatively, apply the lift effect to individual `<td>` elements if border-collapse cannot be changed without side effects.

**Selected/active table row (Dramatic cherry-pick):**
- `box-shadow: 0 8px 24px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.1)`
- `transform: translateY(-3px)`
- Background: `bg-crm-accent/15` (keep existing) + shadow elevation
- Applied via the existing `selected` state in CrmTable

**Sidebar nav icons:**
- `transform: scale(1.08)`
- Transition: 150ms spring

**Buttons (all types):**
- `transform: translateY(-1px)`
- Shadow intensifies slightly
- Transition: 150ms spring

**Chips/badges (LinkedChips, status):**
- `transform: scale(1.02)`
- Subtle shadow lift
- Transition: 150ms spring

### 1.3 Press/Active States

**All buttons:**
- `transform: scale(0.97)` on `:active`
- Shadow contracts (smaller/closer)
- Transition: 100ms (faster than hover for snappy feedback)

**Table rows on click:**
- Brief `transform: scale(0.995)` before opening detail panel
- Creates a "press then release" tactile moment

**Sidebar icons on press:**
- `transform: scale(0.92)`
- Springs back to `scale(1.0)` on release

### 1.4 Panel Animation Upgrades

**Slide-overs (SlideOver.jsx):**
- Keep `translateX(100% -> 0)` but use spring curve with overshoot
- Panel slightly overshoots its final position then settles back
- Duration: 350ms

**Modals (sheet-down):**
- Change from pure translateY to `scale(0.95) + opacity(0) -> scale(1.0) + opacity(1)`
- Feels like the modal drops in from slightly above and expands
- Duration: 300ms spring

**Toasts:**
- Change from `fade-in` to slide-up from below viewport
- `translateY(100%) -> translateY(0)` with spring bounce at rest position
- Duration: 350ms spring

**Table row stagger:**
- Keep `translateY(-4px) + opacity` but use spring curve
- Set `--row-index` via inline style on each `<tr>`: `style={{ '--row-index': idx }}`
- Add to the `animate-row-appear` Tailwind keyframe: `animation-delay: calc(var(--row-index, 0) * 30ms)`
- This replaces the current `animationDelay` inline style in CrmTable.jsx

## 2. Gradient Accent System

### 2.1 CSS Custom Properties

Add gradient variables to `:root`:

```css
--crm-gradient-primary: linear-gradient(135deg, #007AFF, #AF52DE);
--crm-gradient-primary-shadow: 0 6px 20px rgba(0,122,255,0.4);
--crm-gradient-success: linear-gradient(135deg, #30D158, #34C759);
--crm-gradient-warning: linear-gradient(135deg, #FF9F0A, #FFD60A);
--crm-gradient-info: linear-gradient(135deg, #007AFF, #5AC8FA);
--crm-gradient-purple: linear-gradient(135deg, #AF52DE, #BF5AF2);
```

Light mode uses the same gradients — they work on both backgrounds.

### 2.2 Primary CTA Buttons ("+ New Property", etc.)

```css
.btn-primary {
  background: var(--crm-gradient-primary);
  color: white;
  font-weight: 600;
  box-shadow: var(--crm-gradient-primary-shadow),
              inset 0 1px 0 rgba(255,255,255,0.2);
  border: none;
  border-radius: 8px;
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
```

### 2.3 Status Badge Gradients

Replace flat `bg-color-500/20 text-color-400` badges with gradient fills:

| Status | Gradient | Text | Shadow |
|---|---|---|---|
| Active/Open | `#30D158 -> #34C759` | white | `0 2px 6px rgba(48,209,88,0.3)` |
| Prospect/Lead/Prospecting | `#FF9F0A -> #FFD60A` | white | `0 2px 6px rgba(255,159,10,0.3)` |
| Long Leads | `#FF9F0A -> #FF6B2C` | white | `0 2px 6px rgba(255,107,44,0.3)` |
| Under Contract | `#007AFF -> #5AC8FA` | white | `0 2px 6px rgba(0,122,255,0.3)` |
| Closed/Won | `#AF52DE -> #BF5AF2` | white | `0 2px 6px rgba(175,82,222,0.3)` |
| Dead/Lost/Dead Lead/Deal fell through | `rgba(142,142,147,0.2)` (flat) | `#8e8e93` | none |

**Contact type badges** (Tenant, Landlord, Buyer, Broker, etc.) keep their current flat `bg-color/20 text-color` styling — these are category labels, not status indicators, so gradients would add noise. Similarly, **priority badges** (Hot, Warm, Cold, Dead) in `formatCell.jsx` stay flat.

**Detail view badges** (e.g., status in DealDetail header) get the same gradient treatment as table badges — they should match.

Dead/Lost intentionally stays flat and muted — no gradient energy for dead deals.

**Light mode note:** Gradient badge shadows may need slightly higher opacity in light mode (e.g., `0.4` instead of `0.3`) since colored shadows are less visible on light backgrounds. Test and adjust during implementation.

### 2.4 Sidebar Active Icon

**Active state:**
- Background: `linear-gradient(135deg, #007AFF, #5856D6)` with `border-radius: 12px`
- Ambient glow: `box-shadow: 0 0 20px rgba(0,122,255,0.3)`
- Icon color: white (currently uses accent color)
- Transition: 200ms spring

**Inactive state:**
- No changes — stays `text-crm-muted` with `hover:text-crm-text hover:bg-crm-hover`

### 2.5 Secondary Buttons

No gradients. Stays `bg-crm-card` with `border-crm-border`. Hover gets subtle brightness lift only. These elements stay quiet.

## 3. Empty States

### 3.1 Full-Page Empty States (when table has zero records)

Each entity gets a centered empty state with:
1. 48px gradient-stroke SVG icon (2px stroke, entity-specific gradient via `<linearGradient>`)
2. Title: "No [entity] yet" — 14px, `text-crm-text`, `font-medium`
3. Subtitle: "Add your first [entity] to get started" — 12px, `text-crm-muted`
4. CTA: "+ Add [Entity]" — gradient primary button style
5. Container: centered with `py-16`, `flex flex-col items-center gap-3`

**Entity icons:**
| Entity | Icon | Gradient |
|---|---|---|
| Properties | Building/warehouse | blue -> purple |
| Contacts | Person silhouette | blue -> cyan |
| Companies | Briefcase | purple -> pink |
| Deals | Dollar sign / handshake | green -> teal |
| Interactions | Chat bubble | orange -> amber |
| Campaigns | Megaphone | pink -> red |
| Tasks | Checkbox circle | blue -> green |
| Comps | Bar chart / comparison | teal -> blue |

SVGs are inline (not external files) for gradient support. Each is a clean line-art icon, not illustrated.

### 3.2 Inline Empty States (linked record sections in detail panels)

Lighter treatment for empty linked-record sections:
- 24px gradient-stroke SVG icon (same entity icon, smaller)
- Single line: "No linked [entity]" — 11px, `text-crm-muted`
- Text button: "Link" — accent color, no gradient
- Horizontal layout: icon + text + button in a row

### 3.3 Search No-Results State

- 32px magnifying glass icon with blue->purple gradient stroke
- "No results for '[query]'" — 13px, `text-crm-text`
- "Try a different search term" — 11px, `text-crm-muted`
- No CTA button

## 4. Micro-Interaction Polish

### 4.1 Focus Ring Animation

Replace instant `focus:ring-2 ring-crm-accent/30` with animated expansion:

```css
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 0px rgba(0,122,255,0.4);
  animation: focus-ring-in 150ms cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
}
@keyframes focus-ring-in {
  to { box-shadow: 0 0 0 3px rgba(0,122,255,0.4); }
}
```

### 4.2 Custom Checkbox

- Unchecked: `border-crm-border`, transparent fill
- Checked: gradient fill `#007AFF -> #5856D6`, white checkmark
- Check animation: `scale(1.0 -> 1.15 -> 1.0)` bounce (200ms spring)
- Checkmark SVG: stroke-dashoffset animation draws the check mark

### 4.3 Tooltip Entrance

- Entry: `scale(0.9) opacity(0) -> scale(1.0) opacity(1)` — 150ms spring
- Exit: `opacity(1) -> opacity(0)` — 100ms ease-out (no scale on exit, just fade)

### 4.4 Column Sort Indicator

- Current arrow rotation stays
- Add spring overshoot on rotation end: arrow rotates past target by ~5 degrees then settles
- Duration: 200ms spring curve

### 4.5 Toast Entrance Upgrade

Replace `animate-fade-in` with:

```css
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

Duration: 350ms spring curve. Exit: slide down + fade.

## 5. Files Affected

### CSS (index.css + tailwind.config.js)
- `index.css`: Add gradient variables, utility classes (`.btn-primary`, `.btn-secondary`, focus ring keyframes, toast keyframes)
- `tailwind.config.js`: Update animation definitions with spring curves, add new keyframes

### Components (shared)
- `CrmTable.jsx`: Row hover depth, press state, stagger delay, empty state component, `border-collapse: separate` change
- `SlideOver.jsx`: Spring slide-in animation
- `Sidebar.jsx`: Active icon gradient + glow, press scale, hover scale
- `Toast.jsx`: Slide-up spring animation
- `ActivityModal.jsx`: Modal drop-in animation
- `LinkPickerModal.jsx`: Modal drop-in animation
- `QuickAddModal.jsx`: Modal drop-in animation
- `CommandPalette.jsx`: Modal drop-in animation
- `CompManualEntryModal.jsx`: Modal drop-in animation
- `NewInteractionModal.jsx`: Modal drop-in animation
- `ContextMenu.jsx`: Dropdown entrance animation (scale + fade)
- `AddFieldPanel.jsx`: Panel entrance animation
- `LinkedChips.jsx`: Hover scale effect
- `ColumnToggleMenu.jsx`: Tooltip/dropdown entrance animation
- `formatCell.jsx`: No gradient changes (priority badges stay flat)

### Pages (7 CrmTable pages + Interactions)

**CrmTable pages** (get full treatment: row hover, stagger, empty state, badges, CTA):
- `Properties.jsx`
- `Contacts.jsx`
- `Companies.jsx`
- `Deals.jsx`
- `Campaigns.jsx`
- `ActionItems.jsx`
- `Comps.jsx` (has two sub-tabs: Lease Comps / Sale Comps — both get treatment)

**Non-table page:**
- `Interactions.jsx` — uses a card-based timeline layout, NOT CrmTable. Gets: gradient CTA button, empty state, status badge gradients. Does NOT get: row hover depth, stagger animation, `--row-index`.

All pages: Update "+ New" buttons to `.btn-primary` gradient style
All CrmTable pages: Update status badge rendering to gradient fills
All pages: Add entity-specific empty state with gradient SVG icon
All CrmTable pages: Pass `--row-index` CSS variable for stagger animation

### New components
- `EmptyState.jsx`: Shared empty state component with entity-specific icons
- No other new files needed — all other changes are modifications to existing components

## 6. Implementation Order

1. **Foundation** — Spring curves + gradient variables in CSS/Tailwind config
2. **Buttons** — `.btn-primary` gradient class, apply to all "+ New" buttons
3. **Status badges** — Gradient badge rendering across all pages
4. **Sidebar** — Active icon gradient + glow + hover/press states
5. **Table interactions** — Row hover lift, press state, stagger animation
6. **Panel animations** — Slide-over spring, modal drop-in, toast slide-up
7. **Empty states** — `EmptyState.jsx` component + integration into all pages
8. **Micro-interactions** — Focus rings, checkbox animation, sort indicator bounce
