# IE CRM — Team Chat & Houston Feature Spec

## Overview

A real-time team chat system embedded in the IE CRM Mac app, with a companion iOS app and an AI fourth participant ("Houston") who has full CRM access. Designed to replace the team's iMessage work thread with a purpose-built, searchable, context-aware communication layer.

---

## The Problem Being Solved

The team currently uses a shared iMessage thread for all work communication. The core issues:

- Messages get lost — "I sent that in the chat a week ago" is a recurring problem
- No connection between conversations and CRM records (properties, contacts, deals)
- No way to search or retrieve context efficiently
- No proactive reminders for time-sensitive items

---

## Product Vision

### Mac CRM
A floating chat widget lives at the bottom of the CRM window. It can be minimized to a small badge showing unread count, or expanded to a full chat panel. It never requires navigating away from the current screen.

### iOS App
A stripped-down companion app containing only two things:
1. The team chat (identical thread to the Mac widget)
2. A personal Claude interface for quick database queries

The iOS app is intentionally minimal so it's accessible to all team members regardless of tech comfort level. No full CRM navigation required on mobile.

---

## Participants

| User | Role |
|---|---|
| David | Broker |
| David's Father | Broker (limited tech comfort — UI must be simple) |
| Sarah | Broker |
| Houston | AI participant (Claude API) — fourth team member |

---

## Houston — AI Fourth Team Member

Houston is not a chatbot tab or a query interface. Houston is a participant in the group thread who happens to have full CRM access and memory.

### Behavior Model
**Default: Silent.** Houston does not respond to every message. It speaks when spoken to or when something genuinely time-sensitive surfaces.

**Activated by:**
- Direct address: `@Houston` or `Houston,`
- Time-sensitive CRM triggers (see Proactive Flags below)

**Houston can:**
- Answer questions about any CRM record ("what's the square footage on the Rialto building?")
- Make CRM updates conversationally ("add 951-555-0192 for Martinez")
- Surface relevant context when a record is mentioned in conversation
- Detect task-like language and confirm before creating ("sounds like you want to follow up Friday — want me to add that as a task?")

### Proactive Flags
Houston speaks up unprompted **only** for high-signal events. The goal is that when Houston does chime in, the team pays attention because it's always meaningful.

Examples of proactive flags:
- Lease expiration within 60/30/14 days on a tracked property
- Follow-up task that is overdue
- LOI or deal deadline approaching
- Contact with an active deal that hasn't been touched in 90+ days

Houston delivers a **daily morning briefing** in the group thread: a short summary of what's expiring, what's overdue, and what's on the calendar for the day.

### What Houston Does Not Do
- Chime in on every message
- Offer unsolicited ideas or suggestions
- Auto-create tasks without confirmation
- Auto-tag messages without surfacing the tag for easy correction

---

## AI Auto-Tagging

Because not all team members will manually link messages to CRM records, Houston silently tags messages in the background.

### How It Works
1. Message is sent
2. Houston runs it against active CRM records (properties, contacts, deals) in the background
3. If a match is found with sufficient confidence, a tag is attached to the message
4. Tag appears as a small chip on the message: `📎 Fontana Warehouse · Martinez`
5. One-tap removal if the tag is wrong

### Confidence Threshold
Houston only tags when confident. Ambiguous messages go untagged rather than wrongly tagged. Wrong tags are worse than no tags.

### Where Tags Surface
- On the message itself (chip UI)
- On the linked record's page — a "Chat History" sidebar showing all messages tagged to that property, contact, or deal

---

## Tasks Integration

The chat is the primary interface for task creation.

### Flow
1. Team member types something task-like: *"I need to follow up with the Fontana guy on Friday"*
2. Houston detects the intent and replies: *"Got it — want me to add a follow-up task for Friday with Martinez on the Fontana property?"*
3. Team member confirms (or ignores)
4. Task is created in the Tasks module, linked to the relevant records

Houston **never auto-creates tasks** without confirmation. The confirm step is intentional — it keeps the team in control and makes task creation feel natural rather than surprising.

---

## Real-Time Architecture

### Technology
- **Supabase** — backend database, real-time websockets, presence API
- **Supabase Realtime Presence** — powers the typing indicators (`...` dots)
- The Mac CRM connects via the Supabase JS client
- The iOS app connects to the same Supabase backend

### Why Supabase
- Built-in real-time websockets (no custom socket server needed)
- Presence feature is designed exactly for typing indicators and online status
- Postgres underneath — consistent with the rest of the CRM data model
- Free tier is sufficient for a 3-person team

---

## Data Model

### `messages` table
```
id                  uuid, primary key
sender_id           uuid → users
body                text
created_at          timestamp
edited_at           timestamp (nullable)
```

### `message_tags` table
```
id                  uuid, primary key
message_id          uuid → messages
record_type         enum: 'property' | 'contact' | 'deal' | 'company'
record_id           uuid
confidence          float (Houston's confidence score, for internal use)
created_by          enum: 'houston' | 'user'
```

### `tasks` table (linked to chat)
```
id                  uuid, primary key
body                text
due_date            date (nullable)
assigned_to         uuid → users (nullable)
created_from        enum: 'chat' | 'manual'
source_message_id   uuid → messages (nullable)
linked_record_type  enum (nullable)
linked_record_id    uuid (nullable)
completed           boolean
created_at          timestamp
```

---

## UI Spec

### Mac Widget States

**Minimized:**
- Small pill or circle at bottom corner of CRM window
- Shows unread message count badge
- Click to expand

**Expanded:**
- Slide-up panel, roughly 360px wide × 480px tall
- Thread view: avatar + name + message + timestamp
- Typing indicator row (animated dots) when someone is typing
- Houston messages visually distinct (different avatar/color)
- Message chips for CRM tags
- Input bar at bottom with send button

### iOS App Screens
1. **Chat** — identical thread UI, full screen
2. **Ask Claude** — personal Claude interface, simple prompt + response, no chat history shown

No other screens. No navigation to the full CRM database on mobile.

---

## Build Phases

| Phase | Scope |
|---|---|
| 1 | Supabase setup, real-time chat, typing indicators, 3 users |
| 2 | Houston as fourth participant, @mention activation, basic CRM read queries |
| 3 | CRM write access (Houston can update records from chat) |
| 4 | AI auto-tagging, tag chips on messages |
| 5 | Chat history sidebar on CRM record pages |
| 6 | Task creation from chat (Houston confirmation flow) |
| 7 | Proactive flags + daily morning briefing |
| 8 | iOS companion app |

---

## Key Constraints

- **Father's tech comfort is the design ceiling.** If he can't use it like iMessage, it's too complex. No required steps, no tagging, no forms. He just types.
- **Houston must earn its voice.** Frequency of unsolicited messages should be tuned conservatively. One false positive that interrupts a conversation erodes trust.
- **iOS app stays simple by design.** Feature creep toward a full mobile CRM defeats the purpose. The chat + Ask Claude is the complete feature set.
