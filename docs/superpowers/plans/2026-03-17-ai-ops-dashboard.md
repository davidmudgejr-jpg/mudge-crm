# AI Ops Dashboard — "Mission Control" Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an immersive isometric control room dashboard at `/ai-ops` where AI agents are visualized as Sims-style characters around a holographic sphere, with zoom-through navigation into detail views.

**Architecture:** Single-page React app at `/ai-ops` rendered fullscreen (outside the standard Sidebar+ClaudePanel shell). The room is an SVG scene inside an HTML wrapper div. `framer-motion` handles zoom transitions between the room and detail views. Data flows from existing `/api/ai/*` endpoints + 3 new aggregation endpoints.

**Tech Stack:** React 18, SVG, framer-motion (new dep), Tailwind CSS, Express, PostgreSQL (Neon)

**Spec:** `docs/superpowers/specs/2026-03-17-ai-ops-dashboard-design.md`

---

## File Structure

```
ie-crm/
├── src/
│   ├── pages/
│   │   └── AIOps.jsx                      — Route component: room vs detail state, zoom controller
│   ├── components/
│   │   └── ai-ops/
│   │       ├── MissionControlRoom.jsx      — Full isometric room SVG scene (orchestrator)
│   │       ├── RoomShell.jsx               — Floor grid, walls, ceiling lights, environment
│   │       ├── ControlConsole.jsx          — Central console desk + energy beam
│   │       ├── HolographicSphere.jsx       — Globe with radar, signals, territory
│   │       ├── WallScreen.jsx              — Reusable isometric wall-mounted monitor
│   │       ├── WorkstationDesk.jsx         — Reusable isometric desk + monitor + chair
│   │       ├── AgentCharacter.jsx          — Single agent: body, animation states, movement
│   │       ├── AgentMovementEngine.js      — Path calculation, sporadic movement scheduler
│   │       ├── RoomEnvironment.jsx         — Server racks, cables, plant, water cooler
│   │       ├── LiveFeedTicker.jsx          — Bottom scrolling event feed
│   │       ├── ZoomTransition.jsx          — Camera fly-through animation wrapper
│   │       ├── RoomBreadcrumb.jsx          — Minimal breadcrumb overlay
│   │       └── detail-views/
│   │           ├── PipelineDashboard.jsx   — Pipeline throughput + charts
│   │           ├── AgentDossier.jsx        — Per-agent detail (click character)
│   │           ├── ApprovalQueue.jsx       — Review sandbox items
│   │           ├── LogViewer.jsx           — Filterable log feed
│   │           ├── CostBreakdown.jsx       — Spend tracking
│   │           ├── TerritoryIntel.jsx      — Signal list (map deferred to Phase 2)
│   │           └── SystemHealth.jsx        — Infra status
│   ├── hooks/
│   │   ├── useAgentHeartbeats.js           — Poll heartbeats every 30s
│   │   └── useAgentLogs.js                 — Poll recent logs every 15s
│   └── App.jsx                             — Add /ai-ops route (MODIFY)
│   └── components/Sidebar.jsx              — Add nav entry (MODIFY)
├── server/
│   └── index.js                            — Add 3 new dashboard endpoints (MODIFY)
└── package.json                            — Add framer-motion (MODIFY)
```

---

## Chunk 1: Foundation — Wiring, API, Empty Page

### Task 1: Install framer-motion

**Files:**
- Modify: `ie-crm/package.json`

- [ ] **Step 1: Install the dependency**

```bash
cd ie-crm && npm install framer-motion
```

- [ ] **Step 2: Verify it installed**

```bash
cd ie-crm && node -e "require('framer-motion'); console.log('OK')"
```
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd ie-crm && git add package.json package-lock.json && git commit -m "chore: add framer-motion for AI Ops zoom transitions"
```

---

### Task 2: Add dashboard API endpoints

**Files:**
- Modify: `ie-crm/server/index.js` (add before line ~1310, before SAVED VIEWS section)

- [ ] **Step 1: Add the 3 new endpoints**

Add this section to `server/index.js` before the `// SAVED VIEWS ROUTES` comment:

```js
// ============================================================
// AI OPS DASHBOARD ROUTES
// ============================================================

// Dashboard summary: agent statuses + pending counts
app.get('/api/ai/dashboard/summary', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const [heartbeats, pending, logRecent] = await Promise.all([
      pool.query('SELECT agent_name, tier, status, current_task, items_processed_today, items_in_queue, last_error, metadata, updated_at FROM agent_heartbeats ORDER BY tier, agent_name'),
      pool.query(`
        SELECT 'contacts' as table_name, COUNT(*) as count FROM sandbox_contacts WHERE status = 'pending'
        UNION ALL SELECT 'enrichments', COUNT(*) FROM sandbox_enrichments WHERE status = 'pending'
        UNION ALL SELECT 'signals', COUNT(*) FROM sandbox_signals WHERE status = 'pending'
        UNION ALL SELECT 'outreach', COUNT(*) FROM sandbox_outreach WHERE status = 'pending'
      `),
      pool.query("SELECT agent_name, log_type, content, created_at FROM agent_logs ORDER BY created_at DESC LIMIT 20")
    ]);
    res.json({
      agents: heartbeats.rows,
      pending: pending.rows,
      recentLogs: logRecent.rows
    });
  } catch (err) {
    console.error('[ai/dashboard/summary] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Pipeline: counts per stage
app.get('/api/ai/dashboard/pipeline', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM sandbox_signals WHERE status = 'pending') as scout_queue,
        (SELECT COUNT(*) FROM sandbox_enrichments WHERE status = 'pending') as enricher_queue,
        (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'pending') as matcher_queue,
        (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'approved') as approved_today,
        (SELECT COUNT(*) FROM sandbox_contacts WHERE status = 'rejected') as rejected_today
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('[ai/dashboard/pipeline] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Costs: usage tracking aggregation
app.get('/api/ai/dashboard/costs', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { period = 'day' } = req.query;
    const trunc = period === 'week' ? 'week' : period === 'month' ? 'month' : 'day';
    const result = await pool.query(`
      SELECT
        DATE_TRUNC($1, created_at) as period,
        agent_name,
        SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost,
        COUNT(*) as api_calls
      FROM ai_usage_tracking
      GROUP BY 1, 2
      ORDER BY 1 DESC, 2
      LIMIT 200
    `, [trunc]);
    res.json(result.rows);
  } catch (err) {
    console.error('[ai/dashboard/costs] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 2: Test endpoints**

```bash
# Start server and test (these will return empty data but should not 500)
curl -s http://localhost:3001/api/ai/dashboard/summary | head -c 200
curl -s http://localhost:3001/api/ai/dashboard/pipeline | head -c 200
curl -s http://localhost:3001/api/ai/dashboard/costs | head -c 200
```
Expected: JSON responses (empty arrays/objects are fine — tables have no data yet)

- [ ] **Step 3: Commit**

```bash
cd ie-crm && git add server/index.js && git commit -m "feat: add AI Ops dashboard API endpoints (summary, pipeline, costs)"
```

---

### Task 3: Create data hooks

**Files:**
- Create: `ie-crm/src/hooks/useAgentHeartbeats.js`
- Create: `ie-crm/src/hooks/useAgentLogs.js`

- [ ] **Step 1: Create useAgentHeartbeats hook**

```js
// ie-crm/src/hooks/useAgentHeartbeats.js
import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL = 30000; // 30s

export default function useAgentHeartbeats() {
  const [data, setData] = useState({ agents: [], pending: [], recentLogs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/dashboard/summary`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setStale(false);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setStale(true);
      // Don't clear data — show last known state
    }
  }, []);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { ...data, loading, error, stale, refetch: fetch_ };
}
```

- [ ] **Step 2: Create useAgentLogs hook**

```js
// ie-crm/src/hooks/useAgentLogs.js
import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL = 15000; // 15s

export default function useAgentLogs(agentName = null, logType = null, limit = 50) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (agentName) params.set('agent', agentName);
      if (logType) params.set('type', logType);
      params.set('limit', limit);
      const res = await fetch(`${API_BASE}/api/ai/logs?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setLogs(json);
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err.message);
    }
  }, [agentName, logType, limit]);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { logs, loading, error, refetch: fetch_ };
}
```

- [ ] **Step 3: Add the logs API endpoint to server**

Add to `server/index.js` in the AI OPS DASHBOARD ROUTES section:

```js
// Logs: filterable, paginated
app.get('/api/ai/logs', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not configured' });
  try {
    const { agent, type, limit = 50 } = req.query;
    let where = [];
    let params = [];
    let idx = 1;
    if (agent) { where.push(`agent_name = $${idx++}`); params.push(agent); }
    if (type) { where.push(`log_type = $${idx++}`); params.push(type); }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(Math.min(parseInt(limit) || 50, 500));
    const result = await pool.query(
      `SELECT id, agent_name, log_type, content, metrics, created_at
       FROM agent_logs ${whereClause}
       ORDER BY created_at DESC LIMIT $${idx}`, params
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[ai/logs] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});
```

- [ ] **Step 4: Commit**

```bash
cd ie-crm && git add src/hooks/useAgentHeartbeats.js src/hooks/useAgentLogs.js server/index.js && git commit -m "feat: add agent heartbeat and log polling hooks + logs API endpoint"
```

---

### Task 4: Create page skeleton and wire into app

**Files:**
- Create: `ie-crm/src/pages/AIOps.jsx`
- Modify: `ie-crm/src/App.jsx`
- Modify: `ie-crm/src/components/Sidebar.jsx`

- [ ] **Step 1: Create the AIOps page component**

```jsx
// ie-crm/src/pages/AIOps.jsx
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import useAgentHeartbeats from '../hooks/useAgentHeartbeats';
import RoomBreadcrumb from '../components/ai-ops/RoomBreadcrumb';

// Detail views (lazy-loaded later, stubs for now)
const DETAIL_VIEWS = {};

export default function AIOps() {
  const [activeView, setActiveView] = useState(null); // null = room, string = detail view key
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 }); // % for transform-origin
  const { agents, pending, recentLogs, loading, error, stale } = useAgentHeartbeats();

  const handleZoomIn = (viewKey, originElement) => {
    if (originElement) {
      const rect = originElement.getBoundingClientRect();
      const x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
      const y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
      setZoomOrigin({ x, y });
    }
    setActiveView(viewKey);
  };

  const handleZoomOut = () => {
    setActiveView(null);
  };

  return (
    <div className="fixed inset-0 bg-[#04040a] overflow-hidden">
      {/* Stale data warning */}
      {stale && (
        <div className="absolute top-4 right-4 z-50 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-400 text-xs">
          Connection lost — showing last known state
        </div>
      )}

      {/* Breadcrumb */}
      <RoomBreadcrumb activeView={activeView} onBack={handleZoomOut} />

      {/* Room or Detail View */}
      <AnimatePresence mode="wait">
        {activeView === null ? (
          <motion.div
            key="room"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ duration: 0.4 }}
            className="w-full h-full"
            style={{ transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` }}
          >
            {/* Room placeholder — MissionControlRoom goes here */}
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">🎮</div>
                <h1 className="text-2xl font-bold text-white mb-2">Mission Control</h1>
                <p className="text-crm-muted text-sm mb-6">
                  {loading ? 'Connecting to agents...' : `${agents.length} agents registered`}
                </p>
                {agents.length > 0 && (
                  <div className="flex gap-3 justify-center flex-wrap">
                    {agents.map(a => (
                      <div
                        key={a.agent_name}
                        className="px-3 py-2 rounded-lg border cursor-pointer hover:scale-105 transition-transform"
                        style={{
                          borderColor: a.status === 'running' ? '#10b981' : a.status === 'error' ? '#ef4444' : '#f59e0b',
                          background: 'rgba(255,255,255,0.03)'
                        }}
                        onClick={(e) => handleZoomIn('agent-' + a.agent_name, e.currentTarget)}
                      >
                        <div className="text-xs text-crm-muted">{a.agent_name}</div>
                        <div className="text-sm font-semibold" style={{
                          color: a.status === 'running' ? '#10b981' : a.status === 'error' ? '#ef4444' : '#f59e0b'
                        }}>
                          {a.status}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-crm-muted text-xs mt-6">Room scene coming soon — click an agent to test zoom</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={activeView}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full h-full overflow-auto p-8"
          >
            {/* Detail view placeholder */}
            <div className="max-w-5xl mx-auto">
              <h2 className="text-xl font-bold text-white mb-4">
                {activeView.startsWith('agent-') ? `Agent: ${activeView.replace('agent-', '')}` : activeView}
              </h2>
              <pre className="text-crm-muted text-xs bg-crm-card rounded-lg p-4 overflow-auto">
                {JSON.stringify(
                  activeView.startsWith('agent-')
                    ? agents.find(a => a.agent_name === activeView.replace('agent-', ''))
                    : { view: activeView, pending, recentLogs: recentLogs?.slice(0, 5) },
                  null, 2
                )}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Create the RoomBreadcrumb component**

```jsx
// ie-crm/src/components/ai-ops/RoomBreadcrumb.jsx
import React from 'react';

const VIEW_LABELS = {
  pipeline: 'Pipeline Dashboard',
  'approval-queue': 'Approval Queue',
  logs: 'Log Viewer',
  costs: 'Cost Breakdown',
  territory: 'Territory Intelligence',
  health: 'System Health',
};

export default function RoomBreadcrumb({ activeView, onBack }) {
  const label = activeView?.startsWith('agent-')
    ? `Agent: ${activeView.replace('agent-', '')}`
    : VIEW_LABELS[activeView] || activeView;

  return (
    <div className="absolute top-4 left-4 z-50 flex items-center gap-2 text-sm">
      <button
        onClick={onBack}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
          activeView
            ? 'bg-white/5 hover:bg-white/10 text-white cursor-pointer'
            : 'text-white/40 cursor-default'
        }`}
        disabled={!activeView}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Mission Control
      </button>
      {activeView && (
        <>
          <span className="text-white/20">/</span>
          <span className="text-white/60">{label}</span>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add route to App.jsx**

In `ie-crm/src/App.jsx`, add the import at the top with the other page imports:

```js
import AIOps from './pages/AIOps';
```

Add the route BEFORE the `/import` route (inside the `<Routes>` block). **Important:** AIOps renders outside the normal shell, so we need a separate route outside the shell wrapper:

Actually — looking at the App.jsx structure, all routes are inside `AppShell` which wraps with Sidebar. The spec says AIOps should be fullscreen. The cleanest approach: add the route inside Routes but have AIOps handle its own fullscreen layout (fixed positioning already handles this — the `fixed inset-0` in AIOps.jsx will overlay everything). Add:

```jsx
<Route path="/ai-ops" element={<AIOps />} />
```

Add this line after the `/comps` route and before `/import`.

- [ ] **Step 4: Add Sidebar nav entry**

In `ie-crm/src/components/Sidebar.jsx`, add this entry to the `NAV_ITEMS` array (after the Comps entry, before Import):

```js
{ path: '/ai-ops', label: 'AI Ops', title: 'Mission Control', icon: 'M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714a2.25 2.25 0 0 0 .659 1.591L19 14.5M14.25 3.104c.251.023.501.05.75.082M19 14.5l-2.47 2.47a2.25 2.25 0 0 1-1.59.659H9.06a2.25 2.25 0 0 1-1.591-.659L5 14.5m14 0V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4.5' },
```

This is the Heroicons "beaker" icon — fits the AI lab vibe.

- [ ] **Step 5: Test the page loads**

```bash
# With both servers running, navigate to http://localhost:5173/#/ai-ops
# Should see the placeholder page with "Mission Control" heading
# Should see agent cards if any heartbeat data exists
# Sidebar should show "AI Ops" nav item
# Clicking an agent card should zoom into a detail view
# Breadcrumb should show and clicking back should return to room
```

- [ ] **Step 6: Commit**

```bash
cd ie-crm && git add src/pages/AIOps.jsx src/components/ai-ops/RoomBreadcrumb.jsx src/App.jsx src/components/Sidebar.jsx && git commit -m "feat: add AI Ops page skeleton with route, sidebar nav, zoom prototype"
```

---

## Chunk 2: The Room Scene

### Task 5: Build the isometric room shell

**Files:**
- Create: `ie-crm/src/components/ai-ops/RoomShell.jsx`

This renders the floor with diamond tile grid, walls with panel grooves, ceiling track lights, and the base ambient lighting. It's the background layer everything sits on.

- [ ] **Step 1: Create RoomShell component**

Build the SVG room shell matching the v4 mockup: isometric floor diamond (points at 450,500 / 840,300 / 450,100 / 60,300), left and right walls going up from back edges, floor tile grid lines, wall base moldings, wall panel grooves, and ceiling track lights with ambient glow cones.

Key details:
- SVG `viewBox="0 0 900 640"` to match mockup proportions
- Floor fill: `#0c0c18`, grid stroke: `#14142a` at 0.45 opacity
- Left wall: `#0a0a16`, right wall: `#080814`
- Ceiling lights: 3 cans on a track, each with a radial gradient glow cone
- Export the floor coordinate system constants (FLOOR_CENTER, WALL_LEFT_ANGLE, etc.) for child components to use

- [ ] **Step 2: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/RoomShell.jsx && git commit -m "feat: add isometric room shell — floor grid, walls, ceiling lights"
```

---

### Task 6: Build room environment details

**Files:**
- Create: `ie-crm/src/components/ai-ops/RoomEnvironment.jsx`

Server racks with blinking LEDs, cable conduits, potted plant, water cooler.

- [ ] **Step 1: Create RoomEnvironment component**

Build SVG elements for:
- 2 server racks (back-left corner): isometric boxes with blinking status LEDs at different intervals (CSS `@keyframes` on `opacity`). LEDs: green (healthy), blue (active), red (error), amber (warning).
- Cable conduit: SVG path running from racks toward center console
- Potted plant: back-right corner, isometric pot with leaf ellipses
- Water cooler: right side, isometric box with jug on top

All positioned using absolute coordinates within the room's SVG viewBox.

- [ ] **Step 2: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/RoomEnvironment.jsx && git commit -m "feat: add room environment details — server racks, cables, plant, cooler"
```

---

### Task 7: Build workstation desks

**Files:**
- Create: `ie-crm/src/components/ai-ops/WorkstationDesk.jsx`

Reusable isometric desk component with monitor, keyboard, mouse, and chair.

- [ ] **Step 1: Create WorkstationDesk component**

Props: `{ x, y, monitorColor, screenText, screenGlow, items }` where items is optional array of extra desk objects (coffee mug, notepad).

The desk renders:
- Desk top (isometric diamond), front face, right face, leg details
- Monitor: stand base, neck, isometric box with 3 faces, inset screen with text and glow color
- Keyboard: small isometric diamond
- Mouse: small ellipse
- Chair: isometric seat + back
- Optional items positioned on desk surface

All faces use 3-shade coloring: top (lightest), left (medium), right (darkest).

- [ ] **Step 2: Place 4 desks in the room**

Render WorkstationDesk at these positions:
- Desk 1 (Enricher): `x=160, y=360` — front-left
- Desk 2 (Researcher): `x=590, y=355` — front-right
- Desk 3 (Scout): `x=200, y=250` — back-left
- Desk 4 (Matcher): `x=590, y=245` — back-right

Each with appropriate `monitorColor` matching agent color identity.

- [ ] **Step 3: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/WorkstationDesk.jsx && git commit -m "feat: add isometric workstation desks with monitors"
```

---

### Task 8: Build the control console and holographic sphere

**Files:**
- Create: `ie-crm/src/components/ai-ops/ControlConsole.jsx`
- Create: `ie-crm/src/components/ai-ops/HolographicSphere.jsx`

- [ ] **Step 1: Create ControlConsole**

Center of room at `translate(370,310)`. Hexagonal-ish isometric desk with:
- Top surface, front face, right face
- Control panel insets on front and right faces
- Blinking buttons (various colors, staggered animation timing)
- Small embedded screens on console surface
- This is a clickable target (zooms to System Health)

- [ ] **Step 2: Create HolographicSphere**

Positioned above console, centered at `cx=450, cy=240, r=58`. Includes:
- Sphere with radial gradient (bright center, dark edges)
- Latitude/longitude grid lines (4 ellipses at different ry values)
- IE territory path on sphere surface
- Radar sweep: rotating `<line>` with `animateTransform type="rotate"` over 10s
- Perpendicular orbital rings (tilted ellipses) for 3D depth
- Signal dots: red pulsing (hot leads), amber (warm), green (verified), purple connection lines
- Energy beam connecting console to sphere (vertical line + pulsing ring ellipses)
- Sphere rim glow with blur filter
- Floor light pool (ellipse under sphere)
- Highlight on top-left (subtle white ellipse at low opacity)
- Floating data labels ("Prologis ▲", "Amazon Exp") with leader lines to signal dots

Props: `{ signals, onClickSphere }` — signals array drives dot placement, onClickSphere triggers zoom.

- [ ] **Step 3: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/ControlConsole.jsx src/components/ai-ops/HolographicSphere.jsx && git commit -m "feat: add control console and holographic sphere with radar sweep"
```

---

### Task 9: Build wall-mounted screens

**Files:**
- Create: `ie-crm/src/components/ai-ops/WallScreen.jsx`

- [ ] **Step 1: Create WallScreen component**

Reusable component for isometric wall-mounted monitors. Props:

```jsx
{
  // Position on wall
  points,          // 4 corners as "x1,y1 x2,y2 x3,y3 x4,y4" (parallelogram matching wall angle)
  // Content
  title,           // Screen header text
  children,        // Screen content (SVG elements)
  // Style
  borderColor,     // Screen border glow color (default: #3b82f6)
  flashing,        // Boolean — error screen flash animation
  // Interaction
  onClick,         // Zoom target handler
  zoomKey,         // Detail view key for zoom navigation
}
```

Renders: outer casing (parallelogram), screen inset (slightly smaller parallelogram), bezel, wall mount arm + bracket, power LED, content area, hover highlight glow.

Screen content (text, numbers) should be positioned to match the wall's perspective angle.

- [ ] **Step 2: Place screens on walls**

Left wall screens:
- Pipeline Status (large): points matching left wall perspective, shows stage counts with arrows
- Cost Monitor (small): daily spend + running total

Right wall screens:
- Agent Status (large): per-agent status list (● name — STATUS)
- Alert Screen (small, `flashing` when errors exist): current alerts

Data driven by `useAgentHeartbeats` hook data passed down from AIOps.jsx.

- [ ] **Step 3: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/WallScreen.jsx && git commit -m "feat: add wall-mounted screens with perspective-correct rendering"
```

---

### Task 10: Build the live feed ticker

**Files:**
- Create: `ie-crm/src/components/ai-ops/LiveFeedTicker.jsx`

- [ ] **Step 1: Create LiveFeedTicker**

Bottom of room SVG. Shows recent agent activity as a scrolling horizontal ticker. Props: `{ logs }` — array of recent log entries from `useAgentHeartbeats`.

Renders an SVG group at `translate(130,595)`:
- Background rect with border
- Pulsing red "LIVE" indicator dot
- Log entries color-coded by agent: green (Enricher), blue (Researcher), amber (Scout), purple (Matcher), red (Ralph)
- Each entry: `● {agent} {content} — {time_ago}`
- CSS animation scrolls entries when there are more than fit

- [ ] **Step 2: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/LiveFeedTicker.jsx && git commit -m "feat: add live feed ticker at bottom of room"
```

---

### Task 11: Assemble MissionControlRoom

**Files:**
- Create: `ie-crm/src/components/ai-ops/MissionControlRoom.jsx`

- [ ] **Step 1: Create MissionControlRoom orchestrator**

This component composes all room elements into the complete scene. It renders an HTML `div` wrapper (for CSS 3D transforms) containing an SVG with all child components layered in correct z-order:

```jsx
// Render order (back to front):
// 1. RoomShell (floor, walls, ceiling)
// 2. RoomEnvironment (server racks, plant, cooler — back of room)
// 3. WallScreens (on walls)
// 4. WorkstationDesks (back desks first, then front)
// 5. ControlConsole (center)
// 6. HolographicSphere (above console)
// 7. AgentCharacters (positioned by depth — further from camera renders first)
// 8. LiveFeedTicker (bottom overlay)
```

Props: `{ agents, pending, recentLogs, onZoomIn }` — passes data to child components and wires up click handlers.

- [ ] **Step 2: Wire into AIOps.jsx**

Replace the placeholder room content in AIOps.jsx with `<MissionControlRoom>` component, passing heartbeat data and zoom handlers.

- [ ] **Step 3: Test the room renders**

Navigate to `/#/ai-ops` — should see the full isometric room with:
- Floor grid, walls, ceiling lights
- Server racks with blinking LEDs
- 4 desks with monitors
- Central console with sphere hovering above
- Wall screens showing data (or placeholder if no agent data)
- Live feed ticker at bottom
- Clicking screens/sphere should trigger zoom transitions

- [ ] **Step 4: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/MissionControlRoom.jsx src/pages/AIOps.jsx && git commit -m "feat: assemble full Mission Control room scene"
```

---

## Chunk 3: Agent Characters & Movement

### Task 12: Build the AgentCharacter component

**Files:**
- Create: `ie-crm/src/components/ai-ops/AgentCharacter.jsx`

- [ ] **Step 1: Create AgentCharacter**

Renders a single Sims-style isometric human character in SVG. Props:

```jsx
{
  agentName,        // string — agent identifier
  color,            // string — primary color hex
  status,           // 'running' | 'idle' | 'error' | 'offline'
  position,         // { x, y } — current floor position
  facing,           // 'front-left' | 'front-right' | 'back-left' | 'back-right'
  isWalking,        // boolean — walking animation active
  isSeated,         // boolean — seated at desk
  accessories,      // array — ['headset', 'labcoat', 'clipboard', 'tablet']
  isHouston,        // boolean — larger size, tie, suit
  onClick,          // click handler for zoom
}
```

Character rendering:
- Rounded body using ellipses (torso, shoulders)
- Curved arms/legs using SVG `<path>` with quadratic beziers
- Hands as circles, properly positioned at end of arms
- Head as ellipse with hair volume, eyes (direction based on `facing`), mouth
- Accessories rendered conditionally: headset wraps around head, tablet/clipboard in hand
- Houston variant: 20% larger, tie polygon, suit jacket detail, stronger eyebrows

Animation states:
- **Seated + running:** Arms animate at keyboard (subtle up/down on hands), head faces monitor
- **Seated + idle:** Arms resting, one may hold coffee, half-closed eyes
- **Standing + running:** Looking at sphere/screen, one arm may gesture
- **Standing + error:** Hand on chin (thinking), concerned expression
- **Walking:** Legs alternate stride, arms swing, facing matches movement direction
- **isHouston walking:** Wider stance, confident arm gesture, slow weight shift

All animations use CSS `@keyframes` with class-based activation (`.agent--typing`, `.agent--idle`, `.agent--walking`), not inline SVG `<animate>` elements — this allows better performance control.

Z-ordering: component receives a `zIndex` based on y-position. Characters closer to camera (higher y) render later in SVG to appear in front.

Occlusion behind sphere: if character's position is behind the sphere (y < sphere_y), apply a clip-path or opacity mask where the sphere overlaps.

- [ ] **Step 2: Test character rendering**

Add a test character to MissionControlRoom at a fixed position. Verify:
- Character renders with correct proportions
- Changing `status` prop changes animation
- Changing `facing` prop rotates the character
- Click triggers `onClick`
- Houston variant is visibly larger

- [ ] **Step 3: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/AgentCharacter.jsx && git commit -m "feat: add Sims-style AgentCharacter with state-driven animations"
```

---

### Task 13: Build movement engine

**Files:**
- Create: `ie-crm/src/components/ai-ops/AgentMovementEngine.js`

- [ ] **Step 1: Create AgentMovementEngine**

A pure-logic module (not a React component) that manages agent positions and movement scheduling.

```js
// Key exports:
// - createMovementEngine(agentConfigs) → engine instance
// - engine.tick(deltaMs) → updated positions/states for all agents
// - engine.onHeartbeatUpdate(agentName, newStatus) → triggers movement if status changed
// - engine.getAgentState(agentName) → { position, facing, isWalking, isSeated }
```

Movement rules:
- Each agent has a `homeDesk` position (their workstation)
- Default state: seated at home desk
- When a heartbeat update arrives (status change, task completion), there's a 30% chance the agent gets up and walks somewhere:
  - 40% walk to sphere (examine it for 5-10s, then return)
  - 30% walk to a wall screen (look at it for 3-8s, then return)
  - 20% walk to Houston (brief interaction, then return)
  - 10% walk to another agent's desk
- Only 1-2 agents should be walking at any time (stagger with cooldowns)
- Houston walks more frequently (60% chance on any heartbeat update) and patrols between stations
- Walking speed: ~2 grid units per second
- Path calculation: simple A* or direct line with obstacle avoidance around the console

State machine per agent:
```
SEATED_WORKING → GETTING_UP → WALKING_TO_TARGET → AT_TARGET → WALKING_HOME → SITTING_DOWN → SEATED_WORKING
```

Each state has a duration. Transitions are smooth (no teleporting).

- [ ] **Step 2: Integrate into MissionControlRoom**

- Create the engine in a `useRef` (persists across renders)
- On each heartbeat poll, call `engine.onHeartbeatUpdate()`
- Use `requestAnimationFrame` loop to call `engine.tick()` and update character positions in state
- Pass positions/states to AgentCharacter components

- [ ] **Step 3: Test movement**

With the room running, manually insert a heartbeat update via the API:
```bash
curl -X POST http://localhost:3001/api/ai/heartbeat -H "Content-Type: application/json" -d '{"agent_name":"enricher","tier":3,"status":"running","current_task":"Verifying contacts"}'
```

An agent character should sporadically get up and walk to the sphere or a screen, then return to their desk.

- [ ] **Step 4: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/AgentMovementEngine.js src/components/ai-ops/MissionControlRoom.jsx && git commit -m "feat: add agent movement engine with sporadic walks and pathfinding"
```

---

### Task 14: Place all 7 agents in the room

**Files:**
- Modify: `ie-crm/src/components/ai-ops/MissionControlRoom.jsx`

- [ ] **Step 1: Define agent configurations**

```js
const AGENT_CONFIGS = [
  { name: 'enricher', color: '#10b981', desk: { x: 210, y: 340 }, accessories: ['labcoat'], tier: 3 },
  { name: 'researcher', color: '#3b82f6', desk: { x: 630, y: 335 }, accessories: ['headset'], tier: 3 },
  { name: 'scout', color: '#f59e0b', desk: { x: 248, y: 232 }, accessories: [], tier: 3 },
  { name: 'matcher', color: '#8b5cf6', desk: { x: 620, y: 225 }, accessories: ['tablet'], tier: 3 },
  { name: 'ralph', color: '#ef4444', desk: null, standing: { x: 400, y: 370 }, accessories: ['clipboard'], tier: 2 },
  { name: 'gemini', color: '#06b6d4', desk: null, standing: { x: 440, y: 385 }, accessories: [], tier: 2 },
  { name: 'houston', color: '#fbbf24', desk: null, standing: { x: 370, y: 420 }, accessories: [], tier: 1, isHouston: true },
];
```

- [ ] **Step 2: Render agents with depth sorting**

Sort agents by y-position (ascending) before rendering so that characters further back render first. Map each config to an `<AgentCharacter>` with state from the movement engine.

Ralph, Gemini, and Houston default to standing positions (no desk). The 4 Tier 3 agents default to seated at their desks.

- [ ] **Step 3: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/MissionControlRoom.jsx && git commit -m "feat: place all 7 agent characters in room with depth sorting"
```

---

## Chunk 4: Zoom Navigation & Detail Views

### Task 15: Build ZoomTransition wrapper

**Files:**
- Create: `ie-crm/src/components/ai-ops/ZoomTransition.jsx`

- [ ] **Step 1: Create ZoomTransition**

Wraps the room-to-detail-view camera animation. Uses `framer-motion` for the spring physics.

```jsx
// Props: { isZoomed, zoomOrigin, children }
// When isZoomed transitions from false→true:
//   1. Room dims (overlay fades in)
//   2. Scale transforms from 1→1.5 centered on zoomOrigin
//   3. Opacity transitions from 1→0 on room
//   4. Detail view fades in at scale 0.8→1
// Reverse for true→false
```

Update AIOps.jsx to use ZoomTransition instead of raw AnimatePresence.

- [ ] **Step 2: Add hover effects to clickable room elements**

In MissionControlRoom, add hover state tracking. When mouse enters a clickable target:
- Cursor changes to pointer
- Target gets a subtle glow (CSS filter or stroke-opacity change)
- Small tooltip appears: "View Pipeline →", "View Agent: Enricher →"

Use React `onMouseEnter`/`onMouseLeave` on SVG group elements.

- [ ] **Step 3: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/ZoomTransition.jsx src/pages/AIOps.jsx src/components/ai-ops/MissionControlRoom.jsx && git commit -m "feat: add zoom-through transition with hover effects"
```

---

### Task 16: Build Pipeline Dashboard detail view

**Files:**
- Create: `ie-crm/src/components/ai-ops/detail-views/PipelineDashboard.jsx`

- [ ] **Step 1: Create PipelineDashboard**

Full pipeline visualization that renders when zooming into the Pipeline wall screen.

Layout:
- Header: "Pipeline Dashboard" with live indicator
- 4 stage cards in a horizontal flow: Scout → Enricher → Matcher → Review Queue
- Each card shows: count, items/hour rate, queue depth
- Animated arrows between stages with flowing dots (CSS animation)
- Bottom section: throughput sparkline (simple SVG polyline if no chart library) or table of recent items per stage
- Data from `/api/ai/dashboard/pipeline` endpoint

Keep it simple — use Tailwind + existing CRM color tokens. No external chart library required for v1 (use SVG sparklines).

- [ ] **Step 2: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/detail-views/PipelineDashboard.jsx && git commit -m "feat: add Pipeline Dashboard detail view"
```

---

### Task 17: Build Agent Dossier detail view

**Files:**
- Create: `ie-crm/src/components/ai-ops/detail-views/AgentDossier.jsx`

- [ ] **Step 1: Create AgentDossier**

Renders when clicking an agent character. Shows everything about one agent.

Layout:
- Header: agent name + color badge + status indicator
- Current task section: what they're doing right now (from `current_task`)
- Stats row: items processed today, queue depth, uptime
- Recent activity log: last 20 log entries for this agent (from `useAgentLogs(agentName)`)
- Error section (if any): last error message with timestamp
- Metadata JSON viewer (from heartbeat `metadata` field)

- [ ] **Step 2: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/detail-views/AgentDossier.jsx && git commit -m "feat: add Agent Dossier detail view"
```

---

### Task 18: Build Approval Queue detail view

**Files:**
- Create: `ie-crm/src/components/ai-ops/detail-views/ApprovalQueue.jsx`

- [ ] **Step 1: Create ApprovalQueue**

Renders when clicking the Alert screen or Ralph's clipboard. Shows pending sandbox items for human review.

Layout:
- Tab bar: Contacts | Enrichments | Signals | Outreach (one tab per sandbox table)
- Table of pending items using CrmTable-like styling (reuse Tailwind patterns, not the CrmTable component — that's overkill here)
- Each row: key data preview, confidence score, submitting agent, timestamp
- Action buttons per row: ✅ Approve, ❌ Reject
- Approve calls `POST /api/ai/sandbox/:table/review` with `{ id, action: 'approved' }`
- Reject calls same with `action: 'rejected'`
- Optimistic UI update on action

- [ ] **Step 2: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/detail-views/ApprovalQueue.jsx && git commit -m "feat: add Approval Queue detail view with approve/reject actions"
```

---

### Task 19: Build Log Viewer detail view

**Files:**
- Create: `ie-crm/src/components/ai-ops/detail-views/LogViewer.jsx`

- [ ] **Step 1: Create LogViewer**

Renders when clicking server racks. Filterable log feed.

Layout:
- Filter bar: agent dropdown, log_type dropdown (activity/error/daily_summary/system), date range (today/7d/30d)
- Scrollable log list: reverse-chronological
- Each entry: timestamp, agent badge (colored), log_type badge, content text
- Color-coded by log_type: activity=blue, error=red, daily_summary=green, system=gray
- Auto-refresh with new entries appearing at top (from `useAgentLogs` hook with filters)

- [ ] **Step 2: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/detail-views/LogViewer.jsx && git commit -m "feat: add Log Viewer detail view with filters"
```

---

### Task 20: Build Cost Breakdown detail view

**Files:**
- Create: `ie-crm/src/components/ai-ops/detail-views/CostBreakdown.jsx`

- [ ] **Step 1: Create CostBreakdown**

Renders when clicking cost monitor screen. Shows spend tracking.

Layout:
- Period selector: Day | Week | Month
- Summary cards: total spend, cost per item, avg daily cost
- Agent breakdown: colored bars showing spend per agent (simple SVG bar chart)
- Data table: period, agent, total_tokens, total_cost, api_calls
- Data from `/api/ai/dashboard/costs` endpoint

- [ ] **Step 2: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/detail-views/CostBreakdown.jsx && git commit -m "feat: add Cost Breakdown detail view"
```

---

### Task 21: Build remaining detail views (Territory Intel + System Health)

**Files:**
- Create: `ie-crm/src/components/ai-ops/detail-views/TerritoryIntel.jsx`
- Create: `ie-crm/src/components/ai-ops/detail-views/SystemHealth.jsx`

- [ ] **Step 1: Create TerritoryIntel (Phase 1 — list view)**

Signal list without geographic map (map deferred to Phase 2). Shows all signals from sandbox_signals table in a filterable list: source, content, confidence, date, linked entities.

- [ ] **Step 2: Create SystemHealth**

Infrastructure status dashboard: database connection (call `/api/db/status`), API health, per-agent heartbeat freshness (warn if >5 min stale), simple uptime display.

- [ ] **Step 3: Commit**

```bash
cd ie-crm && git add src/components/ai-ops/detail-views/TerritoryIntel.jsx src/components/ai-ops/detail-views/SystemHealth.jsx && git commit -m "feat: add Territory Intel and System Health detail views"
```

---

### Task 22: Wire all detail views into AIOps zoom navigation

**Files:**
- Modify: `ie-crm/src/pages/AIOps.jsx`

- [ ] **Step 1: Import and register all detail views**

```jsx
import PipelineDashboard from '../components/ai-ops/detail-views/PipelineDashboard';
import AgentDossier from '../components/ai-ops/detail-views/AgentDossier';
import ApprovalQueue from '../components/ai-ops/detail-views/ApprovalQueue';
import LogViewer from '../components/ai-ops/detail-views/LogViewer';
import CostBreakdown from '../components/ai-ops/detail-views/CostBreakdown';
import TerritoryIntel from '../components/ai-ops/detail-views/TerritoryIntel';
import SystemHealth from '../components/ai-ops/detail-views/SystemHealth';

const DETAIL_VIEWS = {
  pipeline: PipelineDashboard,
  'approval-queue': ApprovalQueue,
  logs: LogViewer,
  costs: CostBreakdown,
  territory: TerritoryIntel,
  health: SystemHealth,
  // agent-{name} handled dynamically → AgentDossier
};
```

- [ ] **Step 2: Render the active detail view**

Replace the placeholder detail view content with:
```jsx
{activeView.startsWith('agent-') ? (
  <AgentDossier agentName={activeView.replace('agent-', '')} agents={agents} />
) : DETAIL_VIEWS[activeView] ? (
  React.createElement(DETAIL_VIEWS[activeView], { agents, pending, recentLogs })
) : null}
```

- [ ] **Step 3: Full integration test**

Navigate to `/#/ai-ops`. Test each zoom target:
- Click pipeline screen → Pipeline Dashboard loads
- Click cost monitor → Cost Breakdown loads
- Click agent status screen → AgentDossier for first agent
- Click alert screen → Approval Queue loads
- Click sphere → Territory Intel loads
- Click server rack → Log Viewer loads
- Click console → System Health loads
- Click any agent character → Agent Dossier for that agent
- Click breadcrumb "Mission Control" → returns to room
- ESC key → returns to room

- [ ] **Step 4: Commit**

```bash
cd ie-crm && git add src/pages/AIOps.jsx && git commit -m "feat: wire all detail views into zoom navigation"
```

---

## Chunk 5: Polish & Seed Data

### Task 23: Seed agent heartbeat data for demo

**Files:**
- Create: `ie-crm/scripts/seed-agent-heartbeats.js`

- [ ] **Step 1: Create seed script**

```js
// ie-crm/scripts/seed-agent-heartbeats.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const agents = [
  { name: 'enricher', tier: 3, status: 'running', task: 'Verifying: John Smith (john@prologis.com)', processed: 142, queue: 12 },
  { name: 'researcher', tier: 3, status: 'running', task: 'Scanning IE industrial news feeds', processed: 38, queue: 5 },
  { name: 'scout', tier: 3, status: 'running', task: 'Monitoring HN + Reddit for IE mentions', processed: 247, queue: 18 },
  { name: 'matcher', tier: 3, status: 'idle', task: null, processed: 89, queue: 0 },
  { name: 'ralph', tier: 2, status: 'running', task: 'Reviewing enricher output batch #47', processed: 156, queue: 23 },
  { name: 'gemini', tier: 2, status: 'running', task: 'Cross-validating researcher signals', processed: 34, queue: 8 },
  { name: 'houston', tier: 1, status: 'running', task: 'Overseeing daily operations', processed: 0, queue: 4 },
];

async function seed() {
  for (const a of agents) {
    await pool.query(`
      INSERT INTO agent_heartbeats (agent_name, tier, status, current_task, items_processed_today, items_in_queue, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (agent_name) DO UPDATE SET
        tier = $2, status = $3, current_task = $4,
        items_processed_today = $5, items_in_queue = $6, updated_at = NOW()
    `, [a.name, a.tier, a.status, a.task, a.processed, a.queue]);
  }

  // Seed some logs
  const logs = [
    { agent: 'enricher', type: 'activity', content: 'Verified 3 contacts for Prologis — all emails valid' },
    { agent: 'researcher', type: 'activity', content: 'Found lease signal: Prologis expanding IE footprint (CoStar)' },
    { agent: 'scout', type: 'activity', content: 'Discovered 3 new HN mentions of IE industrial growth' },
    { agent: 'ralph', type: 'activity', content: 'Flagged low-confidence enrichment: catch-all domain detected' },
    { agent: 'matcher', type: 'activity', content: 'Linked John Smith ↔ Prologis lease signal (confidence: 87%)' },
    { agent: 'ralph', type: 'error', content: 'API timeout on OpenAI verification call — retry #3' },
    { agent: 'houston', type: 'daily_summary', content: 'Daily report: 247 scouted, 142 enriched, 89 matched, 23 pending review. Cost: $2.41' },
  ];

  for (const l of logs) {
    await pool.query(
      'INSERT INTO agent_logs (agent_name, log_type, content) VALUES ($1, $2, $3)',
      [l.agent, l.type, l.content]
    );
  }

  console.log('Seeded', agents.length, 'heartbeats and', logs.length, 'logs');
  await pool.end();
}

seed().catch(console.error);
```

- [ ] **Step 2: Run seed script**

```bash
cd ie-crm && node scripts/seed-agent-heartbeats.js
```
Expected: `Seeded 7 heartbeats and 7 logs`

- [ ] **Step 3: Verify data appears in the room**

Navigate to `/#/ai-ops` — agent cards should show real status data. Wall screens should display pipeline counts. Live feed ticker should show recent log entries.

- [ ] **Step 4: Commit**

```bash
cd ie-crm && git add scripts/seed-agent-heartbeats.js && git commit -m "feat: add agent heartbeat seed script for dashboard demo"
```

---

### Task 24: Final polish pass

**Files:**
- Modify: various ai-ops components

- [ ] **Step 1: Add keyboard navigation**

In AIOps.jsx:
- `Escape` key triggers zoom out (if in detail view)
- `Tab` cycles through clickable room targets
- `Enter` zooms into focused target

- [ ] **Step 2: Add reduced motion support**

Check `window.matchMedia('(prefers-reduced-motion: reduce)')` — if true, replace spring animations with instant opacity transitions.

- [ ] **Step 3: Verify dark theme consistency**

All detail views should use `crm-bg`, `crm-card`, `crm-text`, `crm-muted` tokens from the existing theme. No raw color values in detail views.

- [ ] **Step 4: Final commit**

```bash
cd ie-crm && git add -A && git commit -m "feat: AI Ops Dashboard — polish, keyboard nav, accessibility"
```

---

## Execution Notes

**Build order matters:** Chunks 1-2 should be done sequentially (foundation → room). Chunk 3 (characters) depends on the room being visible. Chunk 4 (detail views) can partially overlap with Chunk 3 since detail views are independent components. Chunk 5 is final polish.

**Testing strategy:** Since this is a visual feature, the primary testing method is visual — load the page and verify rendering. The API endpoints can be tested with curl. The seed script provides demo data for visual testing.

**Phase 2 items (not in this plan):**
- Geographic map in Territory Intelligence (requires mapping library)
- Escalation workflow (requires new API endpoint + form design)
- Real agent integration (agents calling heartbeat/log endpoints from actual agent processes)
