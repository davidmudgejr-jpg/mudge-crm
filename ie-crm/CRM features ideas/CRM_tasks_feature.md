# IE CRM — Tasks & Reminders Feature Plan

## Overview

A shared team task module built into the CRM, serving as the central list of everything the Mudge Team needs to do. Tasks are first-class records — not a sub-feature of Deals or Contacts — but they can be linked to any CRM record. Houston reads from and writes to this module, and surfaces relevant tasks in the daily morning briefing posted to the team chat.

---

## Data Model

### `tasks` Table

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `title` | TEXT | Short description of the task |
| `body` | TEXT | Optional longer notes or context |
| `status` | ENUM | `open`, `in_progress`, `done`, `cancelled` |
| `priority` | ENUM | `low`, `normal`, `high`, `urgent` |
| `due_date` | DATE | When it needs to be done |
| `created_at` | TIMESTAMP | Auto-set |
| `completed_at` | TIMESTAMP | Set when status → done |
| `assigned_to` | TEXT | `david`, `dad`, `sarah`, `team` (default: `team`) |
| `created_by` | TEXT | Who created the task |
| `source` | ENUM | `manual`, `houston` (created by chat detection) |
| `linked_deal_id` | UUID FK | Optional — links to Deals |
| `linked_contact_id` | UUID FK | Optional — links to Contacts |
| `linked_property_id` | UUID FK | Optional — links to Properties |
| `linked_company_id` | UUID FK | Optional — links to Companies |
| `houston_note` | TEXT | Optional — Houston's reason for flagging or creating |

> A task can link to multiple record types simultaneously (e.g., a task about a lease renewal may link to both a deal and a contact).

---

## UI — Tasks Tab

### Layout

- **Left sidebar:** Filter panel
  - View: All Tasks / My Tasks / Dad's Tasks / Sarah's Tasks
  - Status filter: Open / In Progress / Done / All
  - Priority filter
  - Linked record filter (e.g., "Tasks for Deal: XYZ Warehouse")
  - Date filter: Due Today / Overdue / This Week / All

- **Main area:** Task list
  - Default view: Open tasks, sorted by due date (overdue first)
  - Grouped view option: Group by assignee (David / Dad / Sarah / Unassigned)
  - Rows show: checkbox, title, due date, priority badge, linked record chip(s), assignee

- **Task detail panel:** Slide-in from right (or inline expand)
  - Full title + body/notes
  - Status, priority, assignee, due date — all editable
  - Linked record(s) with clickable chips to jump to that record
  - `source` badge if created by Houston
  - Houston's note (if applicable)
  - Created by / created at / completed at timestamps

### Interactions

- **Check to complete:** Clicking the checkbox marks the task `done` with a completion timestamp
- **Quick add:** A persistent "+ New Task" button at the top opens a lightweight inline creation row (title, due date, assignee — nothing else required)
- **Full task creation:** Modal/panel for all fields including linked records
- **Overdue indicator:** Tasks past due date shown with red date label
- **Bulk actions:** Mark done, delete, reassign

---

## Houston Integration

### Daily Morning Briefing

Houston posts a structured message in the team group chat every morning (configurable time, default 7:30 AM). The briefing pulls from tasks, deals, and any other time-sensitive CRM data.

**Briefing structure:**

```
Good morning team ☀️ Here's your day — March 8

📋 TASKS DUE TODAY
• [David] Call Mike Chen re: Fontana renewal — linked: Deal #412
• [Team] Submit LOI for Ontario cold storage — linked: Deal #389

⚠️ OVERDUE (3)
• Follow up with JLL on comp request — 2 days overdue
• Send lease abstract to ownership group — 5 days overdue
• [Sarah] Return call to escrow officer — 1 day overdue

📅 COMING UP THIS WEEK
• LOI expiration: 4650 Jurupa Ave deal — expires Friday
• Lease expiration: Corona tenant (National Freight) — in 6 days

🤫 Nothing else pressing. Good luck out there.
```

- Houston only includes items relevant to each person if on iOS (personal context); in the group chat, all three team members' items are shown
- Sections with no items are omitted to keep the message clean
- Houston's tone is direct, brief, and occasionally dry — not corporate

### Chat Task Detection

Houston passively monitors the group chat. When it detects language that implies a task or commitment, it surfaces a confirmation prompt rather than auto-creating.

**Detection triggers:**
- "we need to...", "don't forget to...", "someone should...", "I'll...", "can you..."
- Time language: "tomorrow", "by Friday", "this week", "before the call"
- Action verbs: call, send, follow up, submit, review, email, check

**Houston's response pattern:**

```
[Houston] Heads up — sounds like a task:
"Call escrow officer re: Ontario deal by tomorrow"
Assign to: [David] [Sarah] [Dad] [Team]   Due: [Tomorrow] [Edit]
[✓ Create Task]   [Skip]
```

One tap creates the task. "Skip" dismisses without creating. Houston does not ask follow-up questions — if it guessed wrong, the person ignores or dismisses.

### Houston Manual Task Creation

Anyone can create a task by addressing Houston directly in chat:

```
@Houston add a task: send lease comps to Brad at Prologis, due Thursday, link to the Fontana deal
```

Houston confirms creation and posts a summary. The task appears immediately in the Tasks tab.

---

## Integration with Other CRM Modules

### Deals Page

- A **Tasks** section on each deal's detail page shows all tasks linked to that deal
- A **Critical Dates** panel (to be designed in the Deals planning session) will feed into the morning briefing separately — but may also auto-generate tasks when a critical date is approaching (e.g., 7 days before LOI expiration → task auto-created by Houston)

### Contacts Page

- Tasks linked to a contact appear in the contact's activity timeline
- Completing a task linked to a contact logs it as an interaction

### Properties Page

- Tasks linked to a property appear in the property's notes/activity section

---

## iPhone App Scope

The iOS companion app includes:
- Full team chat with Houston as fourth member
- Morning briefing visible in group chat on wake-up
- Task confirmation prompts from Houston (tap to create/skip)
- Personal 1:1 with Houston for task queries ("What do I have due today?")

Tasks tab is **not** included in the iPhone app. Task management (editing, creating manually, bulk actions) stays on desktop. The iPhone is for awareness and quick confirmations only.

---

## Build Phases

### Phase 1 — Core Module
- [ ] `tasks` table with all fields
- [ ] Tasks tab UI: list view, filters, quick add, detail panel
- [ ] Link tasks to deals, contacts, properties, companies
- [ ] Mark complete / status transitions

### Phase 2 — Houston Integration
- [ ] Daily briefing logic: query overdue + due-today tasks, format message, post to team chat at scheduled time
- [ ] Chat task detection: pattern matching on team chat messages, confirmation prompt UI
- [ ] `@Houston add task` command parsing

### Phase 3 — Deal Critical Dates (separate Deals planning session)
- [ ] Critical date fields on deals
- [ ] Houston briefing section for upcoming deal dates
- [ ] Auto-task creation from approaching critical dates

---

## Open Questions

1. **Recurring tasks** — Do any tasks repeat (e.g., "send weekly pipeline update")? If so, add a `recurrence` field in a later phase.
2. **Task comments** — Should tasks support threaded notes/comments, or is the `body` field sufficient?
3. **Notifications** — Beyond the morning briefing, should Houston ever send mid-day nudges for urgent/overdue tasks?
4. **Dad's mobile comfort** — The morning briefing in the chat is probably enough for him. Worth confirming he won't need to interact with Tasks on desktop directly.
