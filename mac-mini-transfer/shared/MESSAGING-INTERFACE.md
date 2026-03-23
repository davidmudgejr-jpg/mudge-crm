# Messaging Interface
## Telegram Ops Channel + Houston CRM Integration
### IE CRM AI Master System

---

## Overview

The AI system communicates through **two channels** — each serving a different audience and purpose. Both are powered by the same Chief of Staff (Claude Opus) brain.

| Channel | Platform | Audience | Purpose |
|---------|----------|----------|---------|
| **Houston** | CRM Messaging App (iOS + Web) | David + Dad + Sister + Team | Team-visible intelligence, deal recs, market briefings |
| **Ops Channel** | Telegram | David only | Fleet management, approvals, system alerts, reverse prompts |

---

## Channel 1: Telegram Ops Channel (David's Private Command Center)

### Why Telegram

- **Free** — no cost, no token limits for messaging
- **API-friendly** — clean Bot API, easy to set up
- **Threading** — messages can be chunked and threaded (looks like a real conversation)
- **Mobile-first** — works great on iPhone, notifications are reliable
- **Rich formatting** — supports markdown, buttons, inline keyboards
- **No team visibility** — this is David's private ops channel, nobody else sees it

### Setup

1. Create a Telegram Bot via @BotFather
2. Get the bot token
3. Store token in supervisor environment variables (NOT in code or markdown files)
4. Configure the Chief of Staff to post via Telegram Bot API
5. David's Telegram chat ID is the only authorized recipient

### What Gets Posted to Telegram

#### Morning Briefing (Full Ops Version) — Daily at 6:30 AM
```
📋 Morning Briefing — March 15, 2026

OVERNIGHT:
• 47 contacts verified (12 high-confidence)
• 8 market signals found (3 with CRM matches)
• 5 outreach drafts ready for review

REVERSE PROMPTS:
1. Pacific West Holdings has 3 convergent signals this week. Direct outreach? (yes/no)
2. Enricher spends 35% of time on dissolved LLCs. Add pre-filter? (yes/no)
3. Ontario submarket had 5 signals this week vs 1 last week. Deep dive? (yes/no)

APPROVALS:
• 5 enrichments pending (3 high-confidence)
  /approve_all_high or /review

FLEET:
• All 4 agents running ✅
• Enricher: 2 rate-limit pauses on White Pages
• Uptime: 4d 12h
```

#### Quick Approval Requests
```
🔔 Enrichment Ready — High Confidence

Contact: John Martinez
Company: ABC Logistics (VP Operations)
Sources: Open Corp ✅ White Pages ✅ BeenVerified ✅
Email: john.martinez@abclogistics.com (NeverBounce: valid)
Confidence: 92

/approve_47 or /reject_47 or /details_47
```

#### System Alerts
```
⚠️ ALERT: Enricher Rate Limited

Service: White Pages
Status: Daily limit reached (50/50)
Impact: Enricher pausing White Pages lookups until midnight
Other work: Continuing with BeenVerified + Open Corporates only

No action needed — will resume automatically at midnight.
```

#### CRM Improvement Proposals (Weekly — Friday)
```
💡 CRM Proposal — Week of March 15

PROPOSAL: Auto-Approve Threshold
Observation: You approve 94% of enrichments with confidence > 85
Suggestion: Add auto-approve setting in Agent Dashboard
Impact: Save ~15 min/day of manual review
Effort: Low (1 API endpoint + 1 toggle in Dashboard)

Build this? (yes/no/discuss)
```

### Telegram Commands David Can Send

| Command | What It Does |
|---------|-------------|
| `/status` | Fleet status — all agents, uptime, items processed today |
| `/approve_[id]` | Approve a specific sandbox item |
| `/approve_all_high` | Approve all pending items with confidence > 85 |
| `/reject_[id]` | Reject a specific sandbox item |
| `/details_[id]` | Get full details on a sandbox item |
| `/brief` | Get current morning briefing (if you missed it) |
| `/research [company]` | Ad-hoc: tell Researcher to investigate a specific company |
| `/enrich [llc name]` | Ad-hoc: tell Enricher to prioritize a specific LLC |
| `/pause [agent]` | Pause a specific agent |
| `/resume [agent]` | Resume a paused agent |
| `/health` | Full system health check |
| `/costs` | This month's cost breakdown |
| `/yes` or `/no` | Quick response to the most recent reverse prompt |

### Implementation

The Telegram bot runs as a lightweight component of the supervisor:

```python
# telegram_bot.py — runs inside the supervisor process

import telebot

bot = telebot.TeleBot(TELEGRAM_BOT_TOKEN)
DAVID_CHAT_ID = "..."  # David's personal Telegram chat ID

# Only respond to David — ignore all other messages
@bot.message_handler(func=lambda msg: str(msg.chat.id) != DAVID_CHAT_ID)
def ignore_others(message):
    pass  # Security: no response to unauthorized users

@bot.message_handler(commands=['status'])
def handle_status(message):
    status = get_fleet_status()
    bot.reply_to(message, format_status(status))

@bot.message_handler(commands=['approve'])
def handle_approve(message):
    item_id = parse_id(message.text)
    result = approve_sandbox_item(item_id, reviewed_by='david_telegram')
    bot.reply_to(message, f"✅ Approved #{item_id}")

# Chief of Staff posts proactively:
def post_morning_briefing(briefing_text):
    bot.send_message(DAVID_CHAT_ID, briefing_text, parse_mode='Markdown')

def post_approval_request(item):
    bot.send_message(DAVID_CHAT_ID, format_approval_request(item), parse_mode='Markdown')

def post_alert(alert):
    bot.send_message(DAVID_CHAT_ID, format_alert(alert), parse_mode='Markdown')
```

### Security Rules for Telegram

1. **Only David's chat ID is authorized** — all other messages are silently ignored
2. **Bot token stored in environment variable** — never in code, never in markdown
3. **No sensitive data in messages** — no API keys, no passwords, no full email addresses
4. **Approval actions are logged** — every `/approve` and `/reject` creates an audit trail
5. **Bot cannot modify supervisor config** — it can pause/resume agents but not change settings
6. **Rate limit commands** — max 10 commands per minute (prevent accidental spam)

---

## Channel 2: Houston (CRM Messaging App — Team Channel)

### How Houston Integrates with CRM Messaging

Houston is NOT a separate service — it's the Chief of Staff posting messages through the CRM's existing messaging infrastructure. When the CRM messaging feature is built (planned for the iOS app), Houston will be a participant in team conversations.

### What Houston Posts

**Market Intelligence (when signals are verified and team-actionable):**
```
Houston: Pacific West Holdings is expanding — they just
announced a new warehouse operation in Fontana. They're
already in our CRM with 2 properties. Might be worth
a call to see if they need additional space.
```

**Opportunity Alerts (convergence events):**
```
Houston: Heads up — XYZ Corp has 3 signals this week:
hiring warehouse workers, lease expiring Q3, and a
funding round. They're in our system with a contact
(John Smith, VP Ops). This looks hot.
```

**Morning Team Briefing (lighter version):**
```
Houston: Good morning team — March 15

📊 12 new verified contacts overnight
📬 5 outreach emails ready to review
🔥 2 companies with convergent signals (see above)
📋 Ontario submarket trending — 5 new signals this week

Have a great day!
```

**Weekly Market Summary (Friday):**
```
Houston: Weekly Market Roundup — March 10-14

Top submarkets by signal volume:
1. Ontario (12 signals) — industrial demand strong
2. Fontana (8 signals) — warehouse expansion activity
3. Rancho Cucamonga (5 signals) — steady

Notable: 3 new companies entered our radar this week.
4 contacts verified that are portfolio owners (3+ LLCs).

Full details in the Agent Dashboard.
```

### What Houston Does NOT Post

- Technical errors or system alerts (that's Telegram)
- Agent status or heartbeat info (that's Telegram)
- CRM improvement proposals (that's Telegram — David decides what to build)
- Low-confidence unverified signals (wait for Tier 2 approval)
- Anything operational the team doesn't need to act on

### Houston's Personality

Houston should feel like a knowledgeable team member, not a bot:
- **Professional but warm** — "Heads up" not "ALERT: Signal detected"
- **Concise** — max 4-5 sentences per message unless asked for detail
- **Action-oriented** — every message should imply what someone should do
- **Contextual** — reference what the team already knows ("They're already in our CRM")
- **Not annoying** — max 3-4 Houston posts per day to the team channel. Quality over frequency.

---

## Routing Decision Tree

When the Chief of Staff generates output, it decides which channel (or both, or neither):

```
Chief of Staff generates output
        │
        ├── Is this team-actionable intelligence?
        │   ├── YES → Houston (CRM Messaging)
        │   │         AND if it's high-value → ALSO Telegram (so David sees it immediately)
        │   └── NO  → continue below
        │
        ├── Is this an approval request?
        │   └── YES → Telegram only (David approves, team doesn't need to see pending items)
        │
        ├── Is this a system alert or fleet status?
        │   └── YES → Telegram only (ops channel)
        │
        ├── Is this a reverse prompt or CRM proposal?
        │   └── YES → Telegram only (David decides, then Houston announces if relevant)
        │
        ├── Is this the morning briefing?
        │   └── YES → BOTH channels (team version to Houston, full ops version to Telegram)
        │
        └── Is this just internal logging?
            └── YES → Neither channel (write to agent_logs table only)
```

---

## Build Phases

### Phase 0 (Before Mac Mini): Design Only
- Finalize this spec
- Design Telegram bot command structure
- Plan Houston's integration points in CRM messaging architecture

### Phase 1 (Mac Mini Arrives): Telegram First
- Set up Telegram bot
- Connect supervisor to post alerts and status
- David uses Telegram for quick approvals while Agent Dashboard is the primary interface
- Houston waits until CRM messaging feature is built

### Phase 2 (CRM Messaging Built): Houston Goes Live
- Houston starts posting to team channel
- Morning briefing splits across both channels
- Team starts seeing market intelligence from the AI system

### Phase 3 (iOS App): Mobile Everything
- Telegram: David approves from phone (already works)
- Houston: Team sees intelligence on iOS app
- Push notifications for high-value convergence alerts

---

## Dependencies

| Component | Depends On |
|-----------|-----------|
| Telegram bot | Supervisor running + Telegram bot token |
| Telegram approvals | Sandbox API endpoints (Phase 0B of ROADMAP) |
| Houston team posts | CRM messaging feature (separate build project) |
| Houston iOS | iOS app (separate build project) |

Telegram can be set up immediately once the supervisor is running. Houston integration waits for the CRM messaging feature.

---

*Created: March 2026*
*For: IE CRM AI Master System — Messaging Interface Specification*
