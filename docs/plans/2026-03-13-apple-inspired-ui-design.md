# Apple-Inspired UI Overhaul — Design Document

**Date:** 2026-03-13
**Branch:** `apple-inspired-ui-overhaul`
**Approach:** B — Tokens + Surface Layer Overhaul (presentation-only, no data/logic changes)

## Design Decisions

- **Era:** Modern macOS (Sonoma/Sequoia)
- **Color mode:** Both dark and light equally polished, auto-switching via `prefers-color-scheme`
- **Accent color:** Apple Blue (#007AFF)
- **Data density:** Comfortable — 44px rows, 12-15 visible rows, more breathing room

## 1. Color Tokens

### Dark Mode

| Token | Current | New |
|-------|---------|-----|
| `--crm-bg` | `#0f1117` | `#000000` |
| `--crm-sidebar` | `#1a1d27` | `rgba(44,44,46,0.80)` |
| `--crm-card` | `#1e2130` | `#1c1c1e` |
| `--crm-accent` | `#f97316` | `#007AFF` |
| `--crm-accent-hover` | `#ea580c` | `#0056CC` |
| `--crm-text` | `#e2e8f0` | `#f5f5f7` |
| `--crm-muted` | `#64748b` | `#8e8e93` |
| `--crm-success` | `#22c55e` | `#30D158` (Apple green) |
| `--crm-border` | `#2d3748` | `rgba(255,255,255,0.08)` |
| `--crm-hover` | `#262a3d` | `rgba(255,255,255,0.06)` |
| `--crm-deep` | `#0d0f14` | `#000000` |
| `--crm-overlay` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.3)` |
| `--crm-tooltip` | `#111827` | `#1c1c1e` |
| `--crm-scroll-thumb` | `#2d3748` | `rgba(255,255,255,0.15)` |
| `--crm-scroll-thumb-hover` | `#4a5568` | `rgba(255,255,255,0.25)` |

### Light Mode

| Token | Current | New |
|-------|---------|-----|
| `--crm-bg` | `#f8fafc` | `#f5f5f7` |
| `--crm-sidebar` | `#f1f5f9` | `rgba(255,255,255,0.70)` |
| `--crm-card` | `#ffffff` | `#ffffff` |
| `--crm-accent` | `#ea580c` | `#007AFF` |
| `--crm-accent-hover` | `#dc2626` | `#0056CC` |
| `--crm-text` | `#1e293b` | `#1d1d1f` |
| `--crm-muted` | `#64748b` | `#8e8e93` |
| `--crm-success` | `#16a34a` | `#34C759` |
| `--crm-border` | `#e2e8f0` | `rgba(0,0,0,0.06)` |
| `--crm-hover` | `#f1f5f9` | `rgba(0,0,0,0.04)` |
| `--crm-deep` | `#f1f5f9` | `#ececee` |
| `--crm-overlay` | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.2)` |
| `--crm-tooltip` | `#1e293b` | `#1c1c1e` |
| `--crm-scroll-thumb` | `#cbd5e1` | `rgba(0,0,0,0.15)` |
| `--crm-scroll-thumb-hover` | `#94a3b8` | `rgba(0,0,0,0.25)` |

Key shift: removing blue tint from all neutrals, going warm neutral gray.

## 2. Surfaces & Depth

- **Sidebar:** `backdrop-filter: blur(20px) saturate(180%)`, semi-transparent bg, remove hard border-r
- **Table rows:** no grid lines, horizontal dividers only (faint rgba), hover = rounded inset highlight (8px radius, 4px inset from edges)
- **SlideOver panels:** `backdrop-filter: blur(30px) saturate(150%)`, rounded top-left corner (12px), softer overlay
- **Modals:** centered, `border-radius: 12px`, soft shadow (`0 24px 48px rgba(0,0,0,0.2)`), frosted glass bg
- **Buttons:** primary = solid blue r-8px, secondary = rgba bg with subtle border
- **Selected row:** `rgba(0,122,255,0.15)` background

## 3. Typography & Spacing

- **Font stack:** `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif`
- **Page titles:** 20px, semibold (600)
- **Table headers:** 11px, uppercase, letter-spacing 0.05em, muted
- **Table cells:** 13px, regular (400)
- **Sidebar labels:** 10px, medium (500)
- **Badges/pills:** 11px
- **Row height:** 44px (up from ~36px)
- **Search bar:** 40px tall, border-radius 10px, gray fill (no border)
- **Transitions:** 0.25s ease-in-out (slowed from 0.15-0.2s)
- **Slide-over easing:** `cubic-bezier(0.32, 0.72, 0, 1)` (Apple spring curve)

## 4. Component Scope

| File | Changes |
|------|---------|
| `index.css` | All tokens, font family, scrollbar, new utility classes for blur |
| `tailwind.config.js` | Animation timings, easing curves, default border-radius |
| `Sidebar.jsx` | Frosted glass bg, pill-style active nav (no left bar), thinner icon strokes |
| `CrmTable.jsx` | Row height 44px, rounded hover, faint dividers, no grid, header styling |
| `SlideOver.jsx` | Backdrop blur, rounded corner, softer overlay |
| `QuickAddModal.jsx` | Shadow, 12px radius, frosted glass |
| `LinkPickerModal.jsx` | Same modal treatment |
| `Toast.jsx` | 12px radius, frosted glass |
| Page headers | Search bar pill styling (shared pattern across pages) |

## 5. Out of Scope

- No layout restructuring (sidebar width, page structure stay the same)
- No data flow, API, or routing changes
- No new dependencies
- Dev mode theme left as-is (separate concern)
