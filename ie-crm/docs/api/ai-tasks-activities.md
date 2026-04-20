# `/api/ai/tasks` and `/api/ai/activities`

Agent-facing endpoints for team tasks (`action_items`) and deal activities
(`interactions` + `notes`). Specced 2026-04-19 by Houston to unblock Hermes,
Agent M, and Agent 48 so the fleet stops hand-crafting `/api/db/*` writes.

**Base URL:** `https://mudge-crm-production.up.railway.app`
**Auth:** `X-Agent-Key: <AGENT_API_KEY>` header on every request.
Optional `X-Agent-Name: hermes|houston|agent-m|agent-48|...` for audit log.
**Error shape:** `{ "error": "<human-readable message>" }` with status
`400` (validation), `401` (auth), `403` (permission), `404` (not found),
`500` (server).

---

## Team tasks

Backed by `action_items` + four link tables (`action_item_contacts`,
`action_item_companies`, `action_item_deals`, `action_item_properties`).

Allowed `status` values (case-insensitive on input, canonicalized on write):
`Todo`, `Reminders`, `In progress`, `Done`, `Dead`, `Email`, `Needs and Wants`,
`Pending`. Note: the DB CHECK constraint stores `"In progress"` with a
lowercase `p` — spec casing (`"In Progress"`) is accepted and normalized.

### `GET /api/ai/tasks`

List tasks with optional filters. Response:

```json
{ "tasks": [ {...} ], "total": 42, "limit": 100, "offset": 0 }
```

**Query params:**

| Param | Type | Notes |
|-------|------|-------|
| `assignee` | string, repeatable | Case-insensitive match within `responsibility[]`. `?assignee=David&assignee=Sarah` returns tasks assigned to either. |
| `status` | string, repeatable | One or more status values. `?status=open` is an alias for "status NOT IN ('Done','Dead')" and supersedes explicit statuses. |
| `high_priority` | bool | `true`/`1`/`yes` filters to high-priority only. |
| `due_before` | date (ISO-8601 or YYYY-MM-DD) | `due_date <= value`. |
| `due_after` | date | `due_date >= value`. |
| `overdue` | bool | Shortcut for `due_date < CURRENT_DATE AND status NOT IN ('Done','Dead')`. Combines with other filters. |
| `linked_deal_id` / `linked_contact_id` / `linked_company_id` / `linked_property_id` | uuid | Only return tasks linked to the given entity. |
| `limit` | int | Default 100, max 500. |
| `offset` | int | Default 0. |
| `include` | csv | `include=links` inlines `links.{contacts,companies,deals,properties}` on each task. |

Ordering: `high_priority DESC, due_date ASC NULLS LAST, created_at DESC`.

```bash
# Open, high-priority tasks for David, due this week, with linked entities
curl -s "$BASE/api/ai/tasks?assignee=David&status=open&high_priority=true&due_before=2026-04-26&include=links" \
  -H "X-Agent-Key: $KEY" \
  -H "X-Agent-Name: agent-m"
```

### `POST /api/ai/tasks`

Create a task + optional links. All writes in one transaction.

```bash
curl -s -X POST "$BASE/api/ai/tasks" \
  -H "X-Agent-Key: $KEY" \
  -H "X-Agent-Name: hermes" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Follow up with Rivian",
    "notes": "Call Tues 3pm, confirm site tour logistics",
    "responsibility": ["David", "Sarah"],
    "status": "Todo",
    "due_date": "2026-04-22",
    "high_priority": true,
    "source": "hermes",
    "links": {
      "deals": ["<deal_uuid>"],
      "contacts": ["<contact_uuid>"]
    }
  }'
```

Returns `201` with `{ task: {...action_items row..., links: {...}} }`.
All UUIDs are validated up front, and missing entities cause a `400`
*before* the task row is written (no orphan tasks).

### `PATCH /api/ai/tasks/:id`

Partial update. Accepts any subset of:

- Mutable columns: `name`, `notes`, `notes_on_date`, `responsibility`,
  `high_priority`, `due_date`, `status`, `source`, `date_completed`.
- `links_add` / `links_remove` — same shape as `links` in POST.

**Status transition rules:**

- `status` → `Done` with `date_completed IS NULL` ⇒ auto-set `date_completed = NOW()`.
- `status` → any non-Done when previously `Done` ⇒ null `date_completed`.
- Explicit `date_completed` in the body always wins (agents can backdate).

Returns `{ task: {...} }` with inlined `links`.

```bash
curl -s -X PATCH "$BASE/api/ai/tasks/$TASK_ID" \
  -H "X-Agent-Key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"status":"In progress","links_add":{"contacts":["<uuid>"]}}'
```

### `POST /api/ai/tasks/:id/complete`

Shortcut for `PATCH` with `status='Done'`. Optional body:

```json
{ "notes_append": "closed by Hermes after email confirmed" }
```

The appended note gets a `[<ISO-timestamp> <agent-name>]` prefix so the
audit trail stays readable.

### `DELETE /api/ai/tasks/:id`

**Soft delete (default):** sets `status='Dead'` and returns the updated row.
Any agent can do this.

**Hard delete:** pass `{ "hard": true }` in the body. Requires
`X-Agent-Name: houston` — other agents get `403`. Cascades all four link
tables before removing the `action_items` row.

---

## Deal activities

Unified feed of `interactions` + `notes` per deal.

### `GET /api/ai/deals/:deal_id/activities`

Returns interactions and notes merged, sorted by date desc:

```json
{
  "deal_id": "<uuid>",
  "activities": [
    {
      "source": "interaction",
      "interaction_id": "<uuid>",
      "type": "Phone Call",
      "subject": "Rivian site tour recap",
      "date": "2026-04-18T14:30:00Z",
      "notes": "...",
      "team_member": "David",
      "follow_up": "2026-04-22",
      "links": { "contacts": [...], "companies": [...], "deals": [...], "properties": [...] }
    },
    {
      "source": "note",
      "note_id": "<uuid>",
      "date": "2026-04-17T12:00:00Z",
      "content": "Bank flagged concern about escalator clause"
    }
  ],
  "counts": { "interactions": 12, "notes": 3, "total": 15 },
  "limit": 50, "offset": 0
}
```

Query params: `types` (csv of interaction types; `note` includes `notes` rows),
`since` (date), `limit` (default 50, max 200), `offset` (default 0).

### `POST /api/ai/deals/:deal_id/activities`

Log an interaction or a note against a deal.

```bash
# Interaction path
curl -s -X POST "$BASE/api/ai/deals/$DEAL_ID/activities" \
  -H "X-Agent-Key: $KEY" -H "X-Agent-Name: hermes" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "Phone Call",
    "subject": "Rivian site tour recap",
    "date": "2026-04-18T14:30:00Z",
    "notes": "Tour went well, next step tenant rep call Tues",
    "team_member": "David",
    "follow_up": "2026-04-22",
    "links": { "contacts": ["<uuid>"] }
  }'

# Note path (type === "note" routes to the notes table; direct FKs only
# support one contact/company/property per note — extras are dropped)
curl -s -X POST "$BASE/api/ai/deals/$DEAL_ID/activities" \
  -H "X-Agent-Key: $KEY" -H "X-Agent-Name: hermes" \
  -H "Content-Type: application/json" \
  -d '{ "type": "note", "notes": "Owner wants 12-month term, not 7." }'
```

`type` must be one of the values in the `chk_interaction_type` constraint
(see migration 041). Invalid values are rejected by the DB with a `500`
wrapped in `{ "error": "Failed to log activity" }` — future work could
validate client-side first.

### `GET /api/ai/activities/:interaction_id`

Fetch a single interaction with all links inlined. Useful for Hermes
when following a pointer from a prior reply.

### `PATCH /api/ai/activities/:interaction_id`

Update an interaction. **Mutable fields only:** `notes`, `follow_up`,
`follow_up_notes`, `lead_status`, `lead_interest`, `team_member`.

`type`, `date`, and `subject` are **immutable** — attempting to set them
returns `400 "<field> is immutable; delete + recreate the activity to
change it"`. This forces agents to preserve the audit trail instead of
silently rewriting history.

---

## Audit log

Every write hits `agent_logs` with one of these `log_type` values:
`task_create`, `task_update`, `task_complete`, `task_delete`,
`activity_create`, `activity_update`. The `metrics` JSON includes the
entity ID, before/after snapshots (for updates), and link-change counts.

```sql
SELECT agent_name, log_type, content, created_at
  FROM agent_logs
 WHERE log_type LIKE 'task_%' OR log_type LIKE 'activity_%'
 ORDER BY created_at DESC
 LIMIT 20;
```

## Smoke tests

```bash
export KEY="$AGENT_API_KEY"
export BASE="https://mudge-crm-production.up.railway.app"

# Health check — should return { tasks: [...], total: <n>, limit: 1, offset: 0 }
curl -s "$BASE/api/ai/tasks?limit=1" \
  -H "X-Agent-Key: $KEY" -H "X-Agent-Name: claude-code"

# Create a throwaway task, flip it to Done, then hard-delete as Houston
TASK=$(curl -s -X POST "$BASE/api/ai/tasks" \
  -H "X-Agent-Key: $KEY" -H "Content-Type: application/json" \
  -d '{"name":"smoke test task","source":"smoke"}' | jq -r .task.action_item_id)

curl -s -X POST "$BASE/api/ai/tasks/$TASK/complete" \
  -H "X-Agent-Key: $KEY" -H "X-Agent-Name: hermes" \
  -H "Content-Type: application/json" -d '{"notes_append":"smoke complete"}'

curl -s -X DELETE "$BASE/api/ai/tasks/$TASK" \
  -H "X-Agent-Key: $KEY" -H "X-Agent-Name: houston" \
  -H "Content-Type: application/json" -d '{"hard":true}'
```
