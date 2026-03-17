# AI Ops Dashboard — "Mission Control" Design Spec

> **Date:** 2026-03-17
> **Status:** Approved
> **Author:** David Mudge Jr + Claude

## Goal

Build an immersive AI agent monitoring dashboard at `/ai-ops` that visualizes the 3-tier agent fleet as an isometric control room. Users monitor agent activity, review flagged items, and navigate through the room by clicking objects — no separate pages, just one continuous spatial interface with zoom-through transitions.

## Design Direction

**Visual style:** Isometric pixel-art control room inspired by The Sims / RollerCoaster Tycoon, crossed with Dune's Harkonnen war room holographic aesthetic. Apple UI design polish on all chrome elements (frosted glass, clean typography, subtle gradients).

**Navigation model:** Spatial zoom-through. Click any screen, agent, or object in the room → camera flies from 45° isometric to 0° head-on → detail view fills viewport. Click back → reverse animation returns to room. One URL, one experience.

### New Dependencies

- `framer-motion` — Required for zoom-through transitions (`AnimatePresence`, `layoutId`, spring physics). Install before starting implementation.

### Deferred / Phase 2

- **Territory Intelligence map** (Section 3.10) — Requires a mapping library (`react-map-gl` or `leaflet`). Build as a placeholder in Phase 1 (signal list without geographic rendering), add real map in Phase 2.
- **Escalate action** (Section 3.7) — Needs a new `/api/ai/escalations` endpoint and form fields (urgency, reason). Stub the button in Phase 1, implement in Phase 2 with the escalation workflow.

---

## 1. The Room (Default View)

### 1.1 Camera & Perspective

- Isometric top-down view at ~45° (classic Sims dollhouse angle)
- You see tops of heads, floor tile grid in diamond pattern, furniture as 3D isometric boxes
- Room rendered as SVG or Canvas within a React component
- CSS `transform: perspective() rotateX() rotateY()` enables zoom transitions

### 1.2 Layout

```
        ┌─────────── Back Wall ───────────┐
        │  [Pipeline Screen]  [Agent Screen] │
        │  [Cost Monitor]     [Alert Screen]  │
        │                                      │
  Left  │   [Server]  [Desk3]    [Desk4]       │  Right
  Wall  │   [Racks ]                           │  Wall
        │            ┌─────────┐               │
        │   [Desk1]  │ CONSOLE │  [Desk2]      │
        │            │ SPHERE  │               │
        │            └─────────┘               │
        │      [Agent] [Houston] [Agent]       │
        │                                      │
        └──────────── Front ──────────────┘
```

- **Center:** Control console (hexagonal desk with buttons, small screens, panel details) with holographic sphere hovering above it via energy beam
- **Perimeter:** 4 workstation desks (one per Tier 3 agent) with monitors, keyboards, mice, coffee mugs
- **Walls:** Multiple mounted screens showing real-time data
- **Details:** Server racks with blinking LEDs, cable conduits on floor, ceiling track lights, water cooler, potted plant

### 1.3 The Sphere

- Holographic globe hovering over the console
- IE territory mapped on surface
- 3D radar sweep with orbital rings creating depth
- Signal dots: red (hot leads, pulsing), amber (warm), green (verified), purple connection lines (matched)
- Energy beam + pulsing rings connecting sphere to console
- Casts blue ambient light across the room and onto agent faces
- **Clickable:** Zooms into Territory Intelligence detail view

### 1.4 Wall Screens

All screens conform to wall perspective (parallelogram matching isometric angle). Each has:
- Monitor bezel and wall mount arm
- Power LED indicator
- Screen content matching the 3D surface angle (text/data skewed to perspective)

**Screens:**

| Screen | Wall | Content | Zoom Target |
|--------|------|---------|-------------|
| Pipeline Status | Left (large) | Scout→Enrich→Match→Review flow with counts | Pipeline Dashboard |
| Cost Monitor | Left (small) | Daily spend, running total | Cost Breakdown |
| Agent Status | Right (large) | Per-agent status: active/idle/error | Agent Detail Cards |
| Alert Screen | Right (small, flashing on error) | Current alerts, error messages | Approval Queue |
| Console Screens | Center console | System health, DB stats | System Health |

Additional screens can be added to walls as more data sources come online.

### 1.5 Room Environment Details

- **Server racks:** Back-left corner, 2 racks with blinking status LEDs (green=healthy, blue=active, red=error, amber=warning). Animated at different intervals for realism.
- **Cable conduits:** Running across floor from racks to console, subtle glow on active cables
- **Ceiling track lights:** Strip with light cans casting soft pools of light
- **Water cooler:** Right side of room, environmental detail
- **Potted plant:** Corner detail, adds life to the space
- **Floor:** Diamond tile grid with subtle blue glow pool under the sphere

---

## 2. Agent Characters

### 2.1 Visual Style

- Sims/RCT-style human characters viewed from isometric top-down angle
- Rounded bodies (ellipses, not boxes), curved arms and legs (SVG paths)
- Human proportions: visible hair volume, skin tones, distinct clothing per agent
- Each agent has a unique color identity matching their role

### 2.2 Agent Roster

| Agent | Color | Role | Accessories | Default Position |
|-------|-------|------|-------------|-----------------|
| Enricher | `#10b981` (green) | Contact verification | Lab coat collar | Desk 1 (front-left) |
| Researcher | `#3b82f6` (blue) | Signal discovery | Headset | Desk 2 (front-right) |
| Scout | `#f59e0b` (amber) | Lead sourcing | — | Desk 3 (back-left) |
| Matcher | `#8b5cf6` (purple) | Record linking | Tablet | Desk 4 (back-right) |
| Ralph | `#ef4444` (red) | QA / validation | Clipboard | Standing near console |
| Gemini | `#06b6d4` (cyan) | QA partner | — | Standing near Ralph |
| Houston | `#fbbf24` (gold) | Boss / oversight | Tie, suit, larger size | Center-front, commanding |

### 2.3 Movement & Animation

**Stationary states (at desk):**
- Typing: arms move at keyboard, head faces monitor (no body bounce)
- Reading: head tilted slightly down toward screen
- Idle: leaned back, one hand on coffee mug, relaxed posture

**Movement behaviors (sporadic, data-driven):**
- Agent gets up from desk → walks to sphere → examines it → walks back
- Agent walks to a wall screen → looks up at it → returns to desk
- Agent walks to Houston → brief interaction → returns
- Ralph and Gemini occasionally walk together to inspect something
- Houston walks between stations, checks on agents

**Movement mechanics:**
- Characters face the direction they're walking (side view, back view visible)
- Head tilts: down when looking at tablet/desk, up when looking at sphere/screens
- Objects (tablets, clipboards) attached to hands — move with arm animations
- Walking animation: legs alternate, arms swing naturally
- No bouncing or floating — feet stay on the floor plane
- Stationary characters have subtle idle animation only (breathing, slight weight shift)

**Triggering movement:**
- Driven by `agent_heartbeats` table data — when an agent completes a task, processes an item, or changes state, the corresponding character may get up and walk
- Movement is sporadic and staggered — never all agents moving at once
- Houston walks more frequently than others (oversight role)

### 2.4 Z-Ordering & Occlusion

- Characters walking behind the sphere are partially occluded (sphere renders on top)
- Characters behind desks show upper body only
- Proper depth sorting: characters further from camera (higher in the room) render behind characters closer to camera
- Isometric depth calculated by y-position on the floor grid

### 2.5 Interaction

- **Hover:** Subtle highlight glow on character, cursor → pointer
- **Click:** Zoom-through into Agent Dossier detail view (see Section 3.6)
- No floating thought bubbles or speech bubbles in default view

---

## 3. Zoom-Through Navigation

### 3.1 Mechanism

The entire room is one React component. Clicking a target triggers a camera transition:

1. **Click target** — room elements dim except the target, which highlights
2. **Camera animate** (~600ms, spring easing via framer-motion):
   - CSS transform interpolates from isometric (45° rotateX, -45° rotateY) to flat (0°, 0°)
   - `transform-origin` set to the clicked element's position so zoom converges correctly
3. **Target scales** to fill viewport width
4. **Detail content** fades in as zoom completes (React component mounts)
5. **Vignette overlay** at edges subtly reminds user they're "inside" the room

### 3.2 Zoom-Out (Return to Room)

1. "Return to Room" button in top-left corner (Apple-style back chevron)
2. Reverse animation: detail fades, target shrinks, room rebuilds, camera pulls to 45°
3. Agent positions and animations continue from where they were (no reset)

### 3.3 Breadcrumb

Minimal breadcrumb in top-left: `Mission Control > Pipeline Dashboard`
- Always shows current location
- "Mission Control" is always clickable to return to room

### 3.4 Clickable Targets in Room

| Target | Hover Effect | Zooms Into |
|--------|-------------|------------|
| Pipeline screen (left wall) | Screen brightens, glow | Pipeline Dashboard |
| Cost monitor (left wall) | Screen brightens | Cost Breakdown |
| Agent status screen (right wall) | Screen brightens | Agent Overview |
| Alert screen (right wall) | Screen pulses | Approval Queue |
| Console screens | Buttons brighten | System Health |
| Holographic sphere | Sphere glows brighter | Territory Intelligence |
| Any agent character | Character highlights | Agent Dossier |
| Server racks | LEDs brighten | Log Viewer |

### 3.5 Detail View: Pipeline Dashboard

- Full-width pipeline visualization: Scout → Enricher → Matcher → Review Queue
- Throughput charts (items/hour, items/day) per stage
- Bottleneck detection: which stage has the largest queue
- Historical trend sparklines
- Conversion funnel: how many leads survive each stage

### 3.6 Detail View: Agent Dossier (click any agent)

- Agent identity: name, role, color, current status
- Current task: what they're working on right now
- Recent activity: last N items processed with timestamps
- Performance: items/hour, accuracy rate, uptime
- Error log: recent failures with details
- Queue depth: how many items waiting for this agent

### 3.7 Detail View: Approval Queue

- Table of items awaiting human review (from `sandbox_contacts`, `sandbox_enrichments`, `sandbox_signals`)
- Grouped by submitting agent
- Each item shows: data preview, confidence score, agent notes
- Actions: Approve (promote to production tables), Reject (with reason), Escalate
- Uses existing CrmTable component patterns for consistency

### 3.8 Detail View: Log Viewer

- Reverse-chronological feed from `agent_logs` table
- Filterable by: agent, log_type (activity/error/daily_summary/system), date range
- Color-coded by log_type
- Search within logs
- Auto-refresh with new entries appearing at top

### 3.9 Detail View: Cost Breakdown

- Daily/weekly/monthly spend from `ai_usage_tracking` table
- Bar chart: spend per agent per day
- Running total vs budget (if configured)
- Cost per item processed (efficiency metric)
- Trend line showing cost trajectory

### 3.10 Detail View: Territory Intelligence (click sphere)

- Full-screen map of IE territory
- All signals plotted with filters: hot/warm/cold, by source, by date
- Signal detail on click: source, date discovered, linked records
- Cluster analysis: where signals concentrate
- Timeline slider: watch signals appear over time

### 3.11 Detail View: System Health (click console)

- Database connection status, query latency
- API endpoint health (all `/api/ai/*` routes, dynamically discovered)
- Agent heartbeat status (last check-in time per agent)
- Memory/CPU if available
- Uptime percentage

---

## 4. Data Architecture

### 4.1 Existing Backend (Ready to Use)

**Sandbox tables (migration 007):**
- `sandbox_contacts`, `sandbox_enrichments`, `sandbox_signals`, `sandbox_outreach`
- `agent_heartbeats`, `agent_logs`
- `ai_api_keys`, `agent_priority_board`, `agent_escalations`
- `outbound_email_queue`, `ai_usage_tracking`

**API endpoints (14 deployed at `/api/ai/*`):**
- Agent heartbeat CRUD
- Log ingestion and retrieval
- Sandbox item CRUD
- Approval/rejection actions
- Usage tracking
- Priority board management

### 4.2 New API Endpoints Needed

| Endpoint | Purpose |
|----------|---------|
| `GET /api/ai/dashboard/summary` | Aggregated stats for room display (counts, status per agent) |
| `GET /api/ai/dashboard/pipeline` | Pipeline stage counts and throughput |
| `GET /api/ai/dashboard/costs` | Cost aggregation by agent and time period |

### 4.3 Real-Time Updates

- Poll `agent_heartbeats` every 30s for agent status changes
- Poll `agent_logs` every 15s for live feed ticker
- Agent character behavior reacts to heartbeat data:
  - Status change → character animation change
  - Task completion → character may walk to sphere
  - Error → character shows distress, alert screen flashes

---

## 5. Technical Approach

### 5.1 Room Rendering

- **SVG** for the room scene (scalable, CSS-animatable, accessible)
- Room is a single React component (`MissionControlRoom.jsx`)
- Agent characters are sub-components with state-driven animations
- CSS `@keyframes` for idle animations, JavaScript-driven for movement paths
- `requestAnimationFrame` for smooth walking path interpolation

### 5.2 Zoom Transitions

- `framer-motion` `AnimatePresence` + `layoutId` for shared element transitions
- Room scene rendered inside an HTML `div` wrapper (not a top-level SVG) so CSS 3D transforms work correctly
- The wrapper `div` has CSS `transform` animated between isometric and flat states
- Detail views are separate React components that mount/unmount with transitions
- `transform-origin` dynamically set via `element.getBoundingClientRect()` converted to wrapper-relative coordinates
- Spring easing for organic feel, `prefers-reduced-motion` falls back to instant transition

### 5.3 Component Structure

```
src/pages/AIOps.jsx              — Route component, manages room vs detail state
src/components/ai-ops/
  MissionControlRoom.jsx         — The isometric room scene
  HolographicSphere.jsx          — Central sphere with radar, signals
  ControlConsole.jsx              — Console desk under sphere
  AgentCharacter.jsx              — Reusable agent with state-driven animation
  WallScreen.jsx                  — Isometric wall-mounted monitor
  RoomEnvironment.jsx             — Server racks, furniture, details
  ZoomTransition.jsx              — Camera fly-through animation wrapper
  detail-views/
    PipelineDashboard.jsx         — Pipeline throughput detail
    AgentDossier.jsx              — Per-agent detail view
    ApprovalQueue.jsx             — Review + approve/reject sandbox items
    LogViewer.jsx                 — Filterable log feed
    CostBreakdown.jsx             — Spend charts and tracking
    TerritoryIntelligence.jsx     — Full map with signal plotting
    SystemHealth.jsx              — Infra status dashboard
```

### 5.4 Styling

- Uses existing CRM theme tokens (`crm-bg`, `crm-card`, `crm-accent`, etc.)
- Detail views use existing component patterns (CrmTable, SlideOver patterns)
- Room uses custom dark palette that's darker than standard CRM pages
- Apple UI polish: `backdrop-filter: blur()` on overlays, SF-style typography, generous spacing on detail views

### 5.5 App Integration

- Add route to `App.jsx`: `<Route path="/ai-ops" element={<AIOps />} />`
- `AIOps` renders **outside** the standard `Sidebar + ClaudePanel` shell layout — the immersive room needs the full viewport. Provide a minimal back-to-CRM button in the top corner.
- Add entry to `Sidebar.jsx` navigation: label "Mission Control", icon matching the AI/robot theme, positioned above Settings
- The room view is fullscreen (100vw × 100vh), dark background bleeds to edges

### 5.6 Error Handling

- If polling requests fail (backend unreachable), show a subtle "Connection Lost" indicator overlaying the room — agents freeze in their last known state
- Stale data indicator: if `agent_heartbeats` data is >5 minutes old, show amber warning badge
- Retry mechanism: exponential backoff on failed polls, auto-reconnect

### 5.7 Accessibility

- Tab bar / keyboard navigation as fallback for zoom-through
- Screen reader: room described as "AI Operations Dashboard" with agent status summary
- Keyboard: Arrow keys to select targets, Enter to zoom in, Escape to zoom out
- Reduced motion: instant transition instead of animated zoom for `prefers-reduced-motion`

---

## 6. Design Principles

1. **The room is the interface** — every piece of data is an object you can approach and inspect
2. **Never leave the room** — zoom in and out, but conceptually you're always in Mission Control
3. **Data drives behavior** — agent animations reflect real heartbeat data, not random loops
4. **Apple meets Dune** — premium, clean UI chrome wrapping a cinematic 3D scene
5. **Progressive disclosure** — room shows status at a glance, zoom reveals full detail
6. **Performance first** — SVG with CSS animations, no heavy 3D libraries, lazy-load detail views
