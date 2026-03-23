# IE CRM — Deep Feature Review & Ideas Report
## Date: March 21, 2026
## Author: Claude Code (deep codebase analysis)
## Context: 3 days before production launch (Monday March 24)

---

## Section 1: UX Quick Wins (implement in <30 min each)

### 1.1 — Keyboard shortcut for Team Chat toggle
**What:** Add Cmd+Shift+C (or similar) to open/close Team Chat. Currently only `useKeyboardShortcuts` wires Cmd+K for command palette, but chat has no shortcut.
**Why:** Dave Sr and Sarah will live in chat talking to Houston. One-key access removes friction.
**Effort:** Quick
**Priority:** P1

### 1.2 — "Last Contact" column as relative time ("3 days ago")
**What:** The LAST CONTACT auto-compute subquery returns a date, but showing "3d ago" or "2 weeks ago" in the table cell would be instantly scannable vs reading "03/18/2026".
**Why:** Brokers scan for stale contacts. Relative time makes cold leads jump off the page.
**Effort:** Quick (formatCell.js change)
**Priority:** P1

### 1.3 — Empty state guidance for non-technical users
**What:** The `EmptyState` component exists but pages load with a generic message. Add contextual tips: "Try creating a saved view to filter Active deals" or "Ask Houston to find properties with expiring leases."
**Why:** Dave Sr and Sarah need hand-holding on first use. Contextual tips reduce the "what do I do?" blank stare.
**Effort:** Quick
**Priority:** P0 (before Monday)

### 1.4 — Double-click row to open detail (in addition to single-click)
**What:** Currently single-click opens the SlideOver detail panel. Consider adding a visual distinction: single click selects (highlight row), double-click opens detail. Or keep current behavior but add a row hover preview tooltip showing key fields.
**Why:** Accidental clicks opening the detail panel can be disorienting for new users. At minimum, make the click target obvious.
**Effort:** Quick
**Priority:** P2

### 1.5 — "Copy address" button on property rows
**What:** Small clipboard icon on property address cells. One click copies the full address for pasting into Google Maps, emails, or documents.
**Why:** CRE brokers constantly copy addresses to look up properties on CoStar, Google Maps, and county records. This saves ~5 seconds per lookup, dozens of times per day.
**Effort:** Quick
**Priority:** P1

### 1.6 — Toast notification for successful inline edits
**What:** The inline editing system does optimistic updates but only shows toasts on errors. Add a subtle success indicator (green flash on the cell border, or a micro checkmark animation) so the user knows the save landed.
**Why:** Dave Sr will not trust the system if edits appear to silently "do nothing." Visual confirmation builds confidence.
**Effort:** Quick
**Priority:** P0 (before Monday)

### 1.7 — Sidebar badge counts for key entities
**What:** Show small count badges on sidebar nav items: active deals count on Deals, overdue tasks on Tasks, unread messages on chat (already done for chat toggle button, but not sidebar).
**Why:** Glanceable status without navigating to each page. Standard CRM pattern.
**Effort:** Quick
**Priority:** P2

### 1.8 — "Cmd+K" search should include Houston as an action
**What:** The CommandPalette already exists. Add a "Ask Houston..." action that opens the chat with the search text pre-filled as a message.
**Why:** Power users (David) will want to go from keyboard straight to AI. "Cmd+K > ask houston about lease expirations in Ontario" is a killer flow.
**Effort:** Quick
**Priority:** P2

---

## Section 2: Houston AI Enhancements

### 2.1 — Morning Briefing (daily digest in chat)
**What:** Houston posts a daily summary at 8 AM Pacific in the Team general channel: active deal count, any tasks overdue, lease expirations coming up in 30/60/90 days, any TPE score changes.
**Why:** This is on the roadmap and is THE feature that makes Houston feel alive. Dave Sr opens the CRM, sees Houston already talking about the day's priorities. No other CRM does this.
**Effort:** Medium (cron job on Railway + houstonRAG query)
**Priority:** P1 (first week)

### 2.2 — Houston proactive alerts on TPE tier changes
**What:** When a property's TPE score crosses a tier boundary (e.g., C to B), Houston posts in chat: "Heads up - 1234 Main St just moved from C-tier to B-tier. The owner's lease is expiring in 4 months. Want me to create a call task?"
**Why:** This turns TPE from a passive dashboard into an active deal-finding engine. Proactive alerts are the competitive moat.
**Effort:** Medium (background job comparing snapshots)
**Priority:** P1

### 2.3 — Houston "create a task" from chat
**What:** Users say "@Houston create a task to call the owner of 1234 Main St by Friday" and Houston parses it, creates an action_item, and links it to the property and contact.
**Why:** Non-technical users (Dave Sr, Sarah) will never click through the UI to create tasks. Natural language task creation via chat is how they'll actually use the system.
**Effort:** Medium (intent parsing + action_items API call)
**Priority:** P1

### 2.4 — Houston "what should I work on today?" response
**What:** When any user asks "what should I work on?" or "what's my priority?", Houston queries: overdue tasks assigned to that user, hot/warm deals with no recent activity, upcoming lease expirations, and returns a prioritized action list.
**Why:** Sarah and Dave Sr need direction. Houston becomes a personal assistant, not just a chatbot.
**Effort:** Medium
**Priority:** P1

### 2.5 — Houston memory of user preferences per person
**What:** The RAG memory system (houstonRAG.js) currently stores preferences globally. Extend it to track per-user preferences: "Dave Sr prefers phone calls over emails", "Sarah focuses on retail properties", "David handles the tech side."
**Why:** Personalized responses make Houston feel like a real team member who knows each person.
**Effort:** Medium (add user_id to RAG memory table)
**Priority:** P2

### 2.6 — Houston conversation threading
**What:** Currently Houston responds to all messages in a flat channel. Add the ability for Houston to reference previous messages: "Following up on what Sarah said earlier about the Ontario deal..."
**Why:** With 3 humans + Houston in one channel, context gets lost. Threading or at minimum conversation memory within a session makes Houston's responses more coherent.
**Effort:** Medium
**Priority:** P2

### 2.7 — Houston image analysis: auto-link to CRM records
**What:** The image analysis (5-category classification) is built but only auto-creates interactions for client_conversation screenshots. Extend it so property_listing screenshots automatically search by address AND create/update the property record if confirmed.
**Why:** Sarah takes photos of listings in the field. Snap a photo, Houston matches it to a property, updates the record. Zero data entry.
**Effort:** Medium
**Priority:** P2

### 2.8 — Houston deal probability narration
**What:** When viewing a deal detail, Houston can narrate: "This deal has been active for 45 days. Similar deals in your pipeline close in an average of 60 days. The tenant hasn't responded in 2 weeks which is unusual. Consider a follow-up call."
**Why:** Combines TPE data with deal history to give strategic advice. This is Chief-of-Staff behavior.
**Effort:** Large
**Priority:** P3

---

## Section 3: Data & Analytics

### 3.1 — Deal pipeline Kanban board
**What:** Visual Kanban view of deals by status (Lead > Prospect > Active > Under Contract > Closed). Drag cards between columns to update status.
**Why:** Every broker thinks in terms of pipeline stages. A visual board is more intuitive than a table for deal management. This is the most-requested CRM feature across all industries.
**Effort:** Medium
**Priority:** P1

### 3.2 — Commission forecast chart
**What:** Bar chart on the Deals page showing projected commission by month (close_date). Use the deal_formulas VIEW (team_gross_computed, jr_gross_computed) to project revenue.
**Why:** David needs to see "how much money is coming in this quarter?" at a glance. The commission formula is already computed in SQL — just needs visualization.
**Effort:** Medium (add recharts or chart.js)
**Priority:** P1

### 3.3 — Activity heatmap (interactions over time)
**What:** Calendar heatmap showing days with interactions color-coded by count (like GitHub contribution graph). Shows at the top of the Activity page.
**Why:** Makes it obvious when the team goes quiet. "We haven't logged any calls in 5 days" is a wake-up call.
**Effort:** Medium
**Priority:** P2

### 3.4 — TPE score distribution histogram
**What:** Simple histogram on the TPE page showing how many properties are in each tier (A/B/C/D). Currently there are stat cards but no visual distribution.
**Why:** Shows at a glance how much opportunity exists. "We have 12 A-tier properties and 150 C-tiers" motivates data enrichment work.
**Effort:** Quick
**Priority:** P2

### 3.5 — Lease expiration timeline
**What:** Timeline visualization showing upcoming lease expirations over the next 12 months. Companies plotted on a timeline, color-coded by property type.
**Why:** Lease expirations are THE primary lead source for CRE brokers. A visual timeline makes it impossible to miss opportunities.
**Effort:** Medium
**Priority:** P1

### 3.6 — Dashboard home page
**What:** Replace the default "/" route (currently Properties) with a dashboard: active deals count, overdue tasks, recent activity feed, upcoming lease expirations, TPE score summary, team activity.
**Why:** Every morning Dave Sr opens the CRM. A dashboard gives him instant situational awareness without clicking through 5 pages.
**Effort:** Large
**Priority:** P2

---

## Section 4: Competitive Moat Features

### 4.1 — Screenshot-to-CRM pipeline (already partially built)
**What:** Extend the Houston image analysis to handle: CoStar screenshots (extract property data), email screenshots (create interactions), contract screenshots (extract deal terms). The classification system is built; the data extraction per category needs deepening.
**Why:** No CRE CRM lets you take a screenshot and have AI extract the data into your database. This alone is a demo-worthy feature.
**Effort:** Large
**Priority:** P2

### 4.2 — Lease expiration prospecting engine
**What:** Combine TPE scores + lease expiration data + owner contact info into a single "Prospecting Queue" view. Sorted by TPE score, filtered by lease months remaining (3-12 months), with one-click "Call" or "Email" actions that auto-log interactions.
**Why:** This is the core workflow of a CRE prospecting broker. No other CRM builds this specific flow. It turns the CRM from a database into a deal-finding machine.
**Effort:** Medium
**Priority:** P1

### 4.3 — Auto-generated BOV (Broker's Opinion of Value) reports
**What:** Select a property, click "Generate BOV", and the system pulls comparable lease/sale comps from the comps tables, calculates value estimates, and generates a PDF report.
**Why:** BOVs are how brokers win listings. Auto-generating them from CRM data (instead of manually building in Excel) saves 2-4 hours per report. This is on the roadmap (Phase 3) and should be a top priority post-launch.
**Effort:** Large
**Priority:** P2

### 4.4 — "Deal DNA" — pattern matching across closed deals
**What:** Analyze all closed deals to find patterns: average time from lead to close by deal type, common deal sources for successful deals, which property types close fastest. Surface these patterns to Houston for deal coaching.
**Why:** After 6 months of data, this becomes the team's institutional memory. "Deals sourced from doorknocking close 2x faster than cold calls" is actionable intelligence.
**Effort:** Large
**Priority:** P3

### 4.5 — Owner contact enrichment via public records
**What:** Use the AI agent fleet to look up property owners from county assessor records (San Bernardino and Riverside counties), match to contacts in the CRM, and auto-populate phone/email from public records and skip tracing APIs.
**Why:** 9,902 properties are missing owner DOB (per ROADMAP.md). Automated enrichment via the planned Mac Mini agents turns the TPE from partially-blind to fully-functional. This is the data moat.
**Effort:** Large (agent fleet work)
**Priority:** P1 (first agent to deploy)

### 4.6 — "Who else is calling this owner?" competitive intelligence
**What:** Track when multiple team members contact the same owner. Houston alerts: "David and Sarah both called the owner of 1234 Main St this week. Want to coordinate?"
**Why:** With 3 brokers working the same territory, avoiding duplicate outreach is critical. This prevents embarrassing double-calls and shows professionalism.
**Effort:** Medium
**Priority:** P2

### 4.7 — Market pulse: track local CRE transactions
**What:** Ingest CoStar or public sale/lease comp data on a regular basis to show: "3 industrial deals closed in Ontario this month averaging $0.85/SF NNN." Surface in Houston's morning briefing.
**Why:** Market awareness is how brokers win conversations with owners. "Did you know 3 deals closed on your street this quarter?" is a powerful cold-call opener.
**Effort:** Large (data pipeline)
**Priority:** P3

---

## Section 5: Technical Debt & Code Quality

### 5.1 — Duplicate file: `useHoustonVoice 2.js`
**What:** There is a file at `src/hooks/useHoustonVoice 2.js` (with a space in the name) that appears to be an accidental duplicate of `useHoustonVoice.js`. It is 272+ lines of identical code.
**Why:** This will cause confusion and potential bugs if someone edits the wrong file. The space in the filename is also a cross-platform hazard.
**Effort:** Quick (delete the file)
**Priority:** P0 (before Monday)

### 5.2 — Inconsistent auth token retrieval pattern
**What:** Auth tokens are retrieved via `localStorage.getItem('crm-auth-token')` in at least 8 different files (TPE.jsx, TPEEnrichment.jsx, bridge.js, views.js, useChat.js, useAgentLogs.js, useHoustonVoice.js). Each file independently reads from localStorage.
**Why:** If the token key name changes, you have to update 8+ files. Extract a single `getAuthToken()` utility or use the existing bridge.js pattern consistently.
**Effort:** Quick
**Priority:** P2

### 5.3 — Silent error swallowing in catch blocks
**What:** There are 16+ instances of empty `catch {}` blocks (App.jsx line 89, useColumnResize.js, useHoustonVoice.js cleanup, TeamChat.jsx). These silently swallow errors with no logging.
**Why:** In production, silent failures make debugging impossible. At minimum, add `console.warn` to these blocks so errors appear in browser devtools.
**Effort:** Quick
**Priority:** P1

### 5.4 — No global error boundary
**What:** The App.jsx has no React Error Boundary component. If any page component throws during render, the entire app white-screens.
**Why:** With non-technical users, a white screen = "the app is broken, call David." An error boundary with a friendly message and retry button prevents panic.
**Effort:** Quick (React ErrorBoundary component, ~30 lines)
**Priority:** P0 (before Monday)

### 5.5 — schema.sql is stale
**What:** Per HANDOFF.md: "schema.sql doesn't include migration 001-008 tables/columns. Fresh install from schema.sql alone would be incomplete."
**Why:** If the Neon database ever needs to be rebuilt, schema.sql won't produce a working database. Generate a fresh `pg_dump --schema-only` and commit it.
**Effort:** Quick
**Priority:** P1

### 5.6 — Missing indexes on filtered/searched columns
**What:** Per HANDOFF.md: "Add indexes on all filtered/searched columns" is listed as incomplete. The View Engine queries filter by status, property_type, priority, contacted, lease_exp, etc. — all without declared indexes.
**Why:** With 10,000+ properties, unindexed WHERE clauses on text columns will get slow. Not critical at 3 users, but will bite when data grows.
**Effort:** Quick (one migration file with CREATE INDEX statements)
**Priority:** P1

### 5.7 — No zero-TODO/FIXME/HACK comments in source
**What:** The grep for TODO/FIXME/HACK returned zero results. This is actually suspicious — it means known issues are tracked only in HANDOFF.md and ROADMAP.md, not inline with the code.
**Why:** This is fine for now but as the codebase grows, inline TODOs help future developers (including Claude) find known issues when working in a specific file.
**Effort:** N/A (observation)
**Priority:** P3

### 5.8 — Console.error pattern is good but inconsistent
**What:** 60+ console.error calls exist across the codebase. Most follow a good pattern (prefixed with context like `[chat]`, `[import]`), but some in shared components lack prefixes or structured context.
**Why:** When debugging production issues, being able to grep Railway logs by prefix is invaluable. Standardize all error logging with `[module:function]` prefixes.
**Effort:** Quick
**Priority:** P2

### 5.9 — Import batch endpoint has unsanitized junction table name
**What:** In server/index.js around line 1306, the import batch endpoint builds an INSERT with `${notesJunction}` and `${notesFk}` interpolated directly into SQL. While these values come from server-side mapping (not user input), this breaks the pattern of parameterized queries used everywhere else.
**Why:** Defense in depth. If the mapping logic ever changes or a bug introduces user-controlled values, this becomes a SQL injection vector.
**Effort:** Quick (validate against a whitelist before interpolation)
**Priority:** P1

### 5.10 — Airtable routes still present
**What:** server/index.js still has `/api/airtable/fetch` and `/api/airtable/test` routes. The Airtable migration is complete and these are no longer needed.
**Why:** Dead code that could be a minor security surface (exposes Airtable API key if set). Clean removal.
**Effort:** Quick
**Priority:** P2

---

## Section 6: Production Readiness Gaps

### 6.1 — Password reset flow is missing
**What:** Per ROADMAP.md, this is a known gap. If Dave Sr forgets his password Monday morning, there's no way to reset it without David running SQL.
**Why:** This WILL happen. Build a simple admin-reset endpoint: David (admin role) can reset any user's password from Settings page. Email-based reset is nice-to-have but admin-reset is the MVP.
**Effort:** Quick (admin endpoint + Settings UI button)
**Priority:** P0 (before Monday)

### 6.2 — No PWA manifest or service worker
**What:** Per ROADMAP.md, PWA setup is unchecked. Dave Sr and Sarah will want to "install" the CRM on their phones via Safari Add to Home Screen.
**Why:** Without manifest.json and proper meta tags, the home screen icon will be a generic Safari bookmark. With PWA, it looks and feels like a real app.
**Effort:** Quick (manifest.json + meta tags + basic service worker)
**Priority:** P0 (before Monday)

### 6.3 — No production smoke test has been run
**What:** Per ROADMAP.md, "run full testing protocol on Vercel URL" is unchecked. The app has been tested locally but not on the actual production deployment.
**Why:** CORS issues, environment variable mismatches, and Railway/Vercel networking quirks WILL surface. Test before Monday, not on Monday.
**Effort:** Medium (run the 26-phase TESTING-PROMPT.md)
**Priority:** P0 (before Monday)

### 6.4 — No error reporting service
**What:** Errors go to console.error and Railway logs only. No Sentry, LogRocket, or similar service captures frontend errors.
**Why:** When Dave Sr hits a bug, he'll say "it's broken" with no useful context. A frontend error reporter captures the exact error, stack trace, and user context automatically. Even the free Sentry tier would be a massive improvement.
**Effort:** Quick (npm install @sentry/react, wrap App in Sentry.ErrorBoundary)
**Priority:** P1

### 6.5 — No loading skeletons on initial page loads
**What:** Pages show "Loading..." text while fetching data. Replace with skeleton/shimmer animations (the animation is already defined in tailwind.config.js as `animate-shimmer` but is not widely used).
**Why:** Shimmer skeletons feel faster than text loading indicators. First impressions matter on launch day.
**Effort:** Quick (the animation exists, just needs to be applied)
**Priority:** P1

### 6.6 — Socket.io reconnection handling
**What:** The Socket.io client in TeamChat connects on mount. If the WebSocket drops (network switch, Railway restart, phone sleep/wake), there's no visible reconnection indicator or retry logic beyond Socket.io's built-in reconnect.
**Why:** Dave Sr on his phone will experience dropped connections frequently. A "Reconnecting..." indicator prevents confusion.
**Effort:** Quick
**Priority:** P1

### 6.7 — No audit logging
**What:** Per ROADMAP.md auth section: "Missing: audit logging." There's no record of who changed what data and when.
**Why:** With 3 users editing the same records, "who changed this?" will come up within the first week. Even a simple audit_log table (user_id, action, entity_type, entity_id, timestamp, old_value, new_value) is enough.
**Effort:** Medium
**Priority:** P1

### 6.8 — JWT expiration handling
**What:** AuthContext validates the token on mount via `/api/auth/me`, but there's no handling of token expiration during an active session. If the JWT expires while Dave Sr has the CRM open, API calls will start failing with 401s silently.
**Why:** A 401 interceptor in bridge.js that auto-redirects to login (or refreshes the token) prevents "the app stopped working" confusion.
**Effort:** Quick (add response interceptor in bridge.js)
**Priority:** P0 (before Monday)

### 6.9 — Uploads directory on Railway is ephemeral
**What:** Chat image uploads go to the `uploads/` directory on the Railway filesystem. Railway uses ephemeral containers — files are lost on every deploy or restart.
**Why:** Images shared in Team Chat will disappear after the next git push. Need to move to a persistent storage solution (S3, Cloudflare R2, or Supabase Storage) before users start relying on image sharing.
**Effort:** Medium
**Priority:** P0 (before Monday — or disable image upload until fixed)

### 6.10 — CORS allowlist may not cover Vercel preview deployments
**What:** The CORS allowlist has 3 Vercel URLs hardcoded. Vercel generates unique preview URLs for each push (e.g., `ie-crm-abc123.vercel.app`). These won't be in the allowlist.
**Why:** If you push a fix on Monday and test the preview deployment, CORS will block it. Consider allowing `*.vercel.app` origins in development or adding a regex match for the project slug.
**Effort:** Quick
**Priority:** P1

---

## Summary: P0 Items (Do Before Monday March 24)

| # | Item | Section | Effort |
|---|------|---------|--------|
| 1 | Password reset (admin-reset at minimum) | 6.1 | Quick |
| 2 | PWA manifest + service worker + app icon | 6.2 | Quick |
| 3 | Production smoke test on Vercel URL | 6.3 | Medium |
| 4 | React Error Boundary (prevent white screens) | 5.4 | Quick |
| 5 | JWT 401 interceptor (auto-redirect to login) | 6.8 | Quick |
| 6 | Fix ephemeral uploads on Railway | 6.9 | Medium |
| 7 | Delete duplicate `useHoustonVoice 2.js` | 5.1 | Quick |
| 8 | Empty state guidance for new users | 1.3 | Quick |
| 9 | Inline edit success indicator | 1.6 | Quick |

## Summary: P1 Items (First Week Post-Launch)

| # | Item | Section | Effort |
|---|------|---------|--------|
| 1 | Houston morning briefing | 2.1 | Medium |
| 2 | Houston proactive TPE alerts | 2.2 | Medium |
| 3 | Houston "create a task" from chat | 2.3 | Medium |
| 4 | Houston "what should I work on?" | 2.4 | Medium |
| 5 | Deal pipeline Kanban board | 3.1 | Medium |
| 6 | Commission forecast chart | 3.2 | Medium |
| 7 | Lease expiration timeline | 3.5 | Medium |
| 8 | Lease expiration prospecting engine | 4.2 | Medium |
| 9 | Owner contact enrichment agent | 4.5 | Large |
| 10 | Database indexes on filtered columns | 5.6 | Quick |
| 11 | Import batch junction table sanitization | 5.9 | Quick |
| 12 | Stale schema.sql regeneration | 5.5 | Quick |
| 13 | Silent catch block logging | 5.3 | Quick |
| 14 | Error reporting service (Sentry) | 6.4 | Quick |
| 15 | Loading skeletons | 6.5 | Quick |
| 16 | Socket.io reconnection indicator | 6.6 | Quick |
| 17 | Audit logging | 6.7 | Medium |
| 18 | CORS for Vercel previews | 6.10 | Quick |
| 19 | Keyboard shortcut for chat | 1.1 | Quick |
| 20 | Relative time for Last Contact | 1.2 | Quick |
| 21 | Copy address button | 1.5 | Quick |

---

*Report generated from analysis of: ROADMAP.md, HANDOFF.md, App.jsx, Sidebar.jsx, server/index.js, Properties.jsx, Deals.jsx, CrmTable.jsx, useViewEngine.js, TeamChat.jsx, chat.js, houstonRAG.js, database.js, AuthContext.jsx, and pattern scans across the full ie-crm/src/ directory.*
