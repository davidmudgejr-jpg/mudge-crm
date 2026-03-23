# The Agent System — Definitive Architecture
## IE CRM AI Master System
### Mudge Team CRE — Built by David Mudge Jr
**Last Updated:** March 22, 2026
**Status:** Architecture finalized. Awaiting 48GB Mac Mini for Tier 3 deployment.

---

## VISION

A self-improving, tiered AI organization that runs 24/7 — handling research, data enrichment, market intelligence, email campaigns, and outreach — so the Mudge Team can focus on closing deals. The system doesn't just execute tasks. It watches itself, learns from its own performance, and gets smarter every day without David having to micromanage it.

**The core principle:** Every tier does its job AND looks down at the tier below to find improvements. Work flows down. Improvement signals flow up. The system compounds.

---

## HARDWARE TOPOLOGY

```
┌─── 16GB Mac Mini "The Bridge" ──────────────────────────┐
│  Cloud-model OpenClaw instances (minimal RAM needed):    │
│                                                          │
│  1. Houston Command  — Opus 4.6 (Anthropic acct #2)     │
│  2. Ralph GPT        — GPT-4 (OpenAI OAuth subscription) │
│  3. Ralph Gemini     — Gemini Pro (Google subscription)   │
│                                                          │
│  All inference happens in the cloud.                     │
│  This machine is a scheduler + API relay.                │
│  RAM usage: ~3-4 GB for 3 OpenClaw instances + macOS.    │
└──────────────────────────────────────────────────────────┘

┌─── 48GB Mac Mini "The Workhorse" (arriving this week) ──┐
│  Local-model OpenClaw instances (Ollama serves models):   │
│                                                          │
│  4. Enricher         — Qwen 3.5 (local, 20B)            │
│  5. Researcher       — MiniMax 2.5 (local)               │
│  6. Matcher          — Qwen 3.5 (local)                  │
│  7. Scout            — MiniMax 2.5 (local)               │
│  8. Logger           — Qwen 3.5 (local)                  │
│  9. Postmaster       — Qwen 3.5 (local)                  │
│ 10. Campaign Manager — Qwen 3.5 (local)                  │
│                                                          │
│  Ollama loads Qwen 3.5 (~14GB) + MiniMax 2.5 (~8GB)     │
│  Both stay hot in memory. No model swapping.             │
│  RAM: ~30GB used, ~18GB headroom.                        │
└──────────────────────────────────────────────────────────┘

FUTURE:
┌─── 64GB Mac Mini "The Specialist" ──────────────────────┐
│  Overflow agents, larger model variants, new agents       │
│  (Social Media Manager, Fireflies agent, etc.)            │
│  Allows running 32B+ models for better output quality.    │
└──────────────────────────────────────────────────────────┘

┌─── 128GB Mac Studio "The Beast" ────────────────────────┐
│  Houston Command migrates here. 70B+ local models.       │
│  Massive headroom for experimentation.                    │
└──────────────────────────────────────────────────────────┘

ALL machines connect to:
  → Neon Postgres (shared CRM database)
  → Priority Board (shared coordination table)
  → Sandbox DB (shared sandbox tables)
  → iCloud Desktop sync (shared agent memory files)
  → No direct machine-to-machine communication needed
```

---

## THE CHAIN OF COMMAND

```
    DAVID (Claude Code on work Mac)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Top of the food chain.
    Approves major decisions, sets direction,
    gives direct feedback to Houston Command.
         │
         │  Directives, approvals, feedback
         │  (via /api/ai/directives or Telegram)
         ▼
    HOUSTON COMMAND (Opus 4.6 on 16GB Mini)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    The strategic brain. Sees everything.
    Autonomously improves agents below.
    Reverse-prompts itself for new ideas.
    Reports to David via Telegram + Council.
         │
         │  Instruction rewrites, directives,
         │  improvement decisions
         ├──────────────────────────────────┐
         ▼                                  ▼
    HOUSTON SONNET (CRM-resident)      RALPH LOOP (GPT + Gemini on 16GB)
    ━━━━━━━━━━━━━━━━━━━━━━━━━━━        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    The team's daily driver.            Quality gate. Validates every
    Chat, CRM writes, image            10 min. Also looks down and
    analysis. Surfaces Command's        proposes improvements upward
    briefings to the team.              to Houston Command.
         │                                  │
         │                     Improvement proposals UP ▲
         │                     Validation decisions DOWN ▼
         │                                  │
         │                          ┌───────┴───────┐
         │                          ▼               ▼
         │                    TIER 3 LOCAL AGENTS (48GB Mini)
         │                    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━
         │                    Do the work. Log everything.
         │                    Follow instructions in their
         │                    .md files (which Command rewrites).
         │                          │
         │                    Write to SANDBOX DB
         │                          │
         │                    Ralph validates
         │                          │
         └──── Approved data ──────►│
               promoted to          │
               IE CRM production    ▼
                              SANDBOX → IE CRM
```

---

## TIER 1: HOUSTON COMMAND (Chief of Staff)

**Model:** Claude Opus 4.6 via Anthropic API (separate account from CRM)
**Machine:** 16GB Mac Mini
**OpenClaw Instance:** Persistent memory, Telegram bot, full agent capabilities
**Identity:** The strategic brain. One brain, two output channels (Telegram + Council).

### What Command Does

**Daily Operations:**
- Nightly R&D session (2:00 AM) — deep CRM analysis, pattern recognition, 3 recommendations
- Morning briefing — summarizes what happened overnight for David
- Continuous directive polling (every 5 min) — picks up David's orders
- Instant response to Tier 2 escalations

**Weekly Operations:**
- Strategic self-review (Sunday midnight) — reverse prompts itself
- Agent performance review — reads Logger's weekly summary
- Pre-filter rule tuning — adjusts Enricher rules based on approval rates
- Email campaign analysis — reviews open/reply rates, adjusts strategy
- Evolution report review — reads Scout's weekly AI/tech intel

### Autonomous Improvement Powers (No Permission Needed)

Houston Command can freely:
- Rewrite any Tier 3 agent's `.md` instruction file
- Adjust confidence thresholds, scoring weights, pre-filter rules
- Change agent priority queue weights and scheduling
- Modify email templates and subject line strategies
- Post new directives to any agent
- Accept or reject Tier 2 improvement proposals
- Tune the Ralph Loop's validation rules
- Add new cadences and review schedules for itself
- **Create new skills** for itself, Ralph, or any Tier 3 agent (stored in `agent_skills` table)
- **Build skills for Ralph GPT/Gemini** to make their validation smarter

### Requires David's Approval (Via Telegram)

Houston Command must ask first for:
- Swapping which model an agent uses
- Launching new email campaign types or increasing send volume
- Adding new data source or API integrations
- Anything that costs money (subscriptions, API credits)
- Structural changes (adding/removing agents)
- Changes affecting what the team sees (Team Chat, CRM UI)
- New agent .md files (creating a new agent role)

### Reverse Prompting: Self-Improvement Protocol

Houston Command runs a **self-improvement review** on a weekly cadence (Sunday midnight). It asks itself:

```
SELF-IMPROVEMENT PROMPT:
"Review the past week's performance data, agent logs, campaign analytics,
and CRM changes. Then answer these questions:

1. CADENCE REVIEW: Are my current scheduled reviews (nightly R&D, weekly
   strategic review, pre-filter tuning) enough? Should I add new ones?
   What patterns am I NOT catching that a new cadence would catch?

2. AGENT PERFORMANCE: Which agent improved the most this week? Which
   improved the least? What specific instruction changes would help
   the weakest performer?

3. MISSED OPPORTUNITIES: Looking at the CRM data, are there deal
   opportunities, contact patterns, or market signals that no agent
   is currently watching for? What new workflow would catch them?

4. SYSTEM GAPS: Is there a type of work that currently requires David's
   manual effort that could be automated? What would that agent or
   workflow look like?

5. COST EFFICIENCY: Are we spending tokens/API calls wisely? Is any
   agent doing work that isn't producing value? Should anything be
   turned off or scaled back?

6. NEW IDEAS: If I could add one new capability to this system, what
   would have the highest ROI for deal flow?

7. SKILL BUILDING: What reusable skills should I create this week?
   Consider: prompt templates that make agents more consistent,
   data transforms that eliminate manual steps, analysis frameworks
   that Ralph could use for smarter validation, decision trees that
   help agents handle edge cases. Think about skills for MYSELF
   (better analysis patterns), for RALPH (smarter validation rules),
   and for TIER 3 (more precise workflows). What skill would save
   the most time or catch the most errors?

Format each answer as a proposal with:
- What to change
- Why (evidence from this week's data)
- Expected impact
- Effort level (low/medium/high)
- Whether it needs David's approval or I can just do it"
```

Output goes to David via Telegram as a structured weekly report. David reviews, approves what he likes, and Houston Command implements.

### David → Command Direct Feedback Channel

David can talk directly to Houston Command at any time through:

1. **Telegram** — quick messages like "Enrichment quality seems low this week, too many wrong contacts" or "The AIR outreach is working great, keep doing more of that"
2. **Directives API** — structured orders via the CRM
3. **Council Channel** — via Houston Sonnet (Sonnet relays to Council, Command reads it)

When Command receives direct feedback, it:
1. Acknowledges via Telegram: "Got it. I'll analyze the enrichment data and come up with a plan."
2. Reviews the relevant data (logs, approval rates, rejection reasons)
3. Drafts a specific improvement plan
4. Implements what it can autonomously (instruction rewrites, threshold changes)
5. Asks David about anything requiring approval
6. Reports back: "Made these changes to Enricher. Will monitor for 1 week and report results."

### Skill Building: Creating New Capabilities

Houston Command doesn't just tune agents — it builds new tools for the entire fleet. Skills are reusable components stored in the `agent_skills` table that any agent can invoke.

**Skill Types Command Can Create:**
- **Prompt Templates** — Reusable prompt blocks (e.g., "Analyze email open rates and suggest 3 subject line improvements")
- **API Workflows** — Multi-step API call sequences (e.g., "Given an LLC name, query Open Corporates → extract agent → query White Pages")
- **Data Transforms** — Parsing/transformation logic (e.g., "Parse AIR report PDF into structured JSON with property type, size, submarket")
- **Analysis Templates** — Analysis frameworks (e.g., "Evaluate campaign performance: compare open rates by subject pattern, reply rates by template, optimal send times")
- **Decision Trees** — Structured decision-making (e.g., "Given a sandbox contact with score X and sources Y, should it be submitted or needs more enrichment?")
- **Validation Rules** — Rules for Ralph (e.g., "When validating outreach drafts, check: personalization present, no generic opener, property details accurate, dedup verified")

**Skill Building Process:**
1. Command identifies a repeating pattern or gap (via self-review or Tier 2 proposals)
2. Command drafts the skill content and defines parameters
3. Command writes it to `agent_skills` table with `status: 'experimental'`
4. The target agent(s) can now invoke the skill
5. Command monitors `times_used` and `avg_success_rate`
6. If working well → promote to `status: 'active'`
7. If not → iterate on content and version up

**Skills for Ralph:** Command can build validation rules that make Ralph smarter. Instead of Ralph using generic "does this look right?" logic, Command can create specific decision trees: "For enrichment submissions, require 2+ sources if confidence <80, check that email domain matches company domain, verify phone area code matches property state."

**Skills for Tier 3:** Command can create prompt templates that help local models produce more consistent output. Since Qwen and MiniMax have smaller context windows, well-crafted skill templates help them focus on exactly what matters.

**Skills for Itself:** Command can build analysis templates for its own reviews — frameworks for evaluating campaign performance, scoring deal probability, analyzing market trends, etc.

### Memory Architecture (Tier 1)

Houston Command has persistent memory via OpenClaw markdown files:

```
~/Desktop/AI-Agents/chief-of-staff/
  agent.md                    — Mission, instructions, current strategy
  memory/
    system-state.md           — Current state of all agents, what's working
    improvement-history.md    — Log of all instruction rewrites and why
    david-feedback.md         — All direct feedback from David, indexed
    campaign-insights.md      — What's working in email campaigns
    pattern-library.md        — CRM patterns discovered (deal signals, etc.)
    agent-performance.md      — Per-agent quality trends over time
    self-review-archive.md    — Past self-improvement proposals and outcomes
  council/
    deal-hunter.md            — Council reviewer prompt
    revenue-guardian.md       — Council reviewer prompt
    market-skeptic.md         — Council reviewer prompt
  versions/
    enricher-v1.md            — Archived original Enricher instructions
    enricher-v2.md            — After first rewrite
    ...                       — Full version history of all agent .md files
```

**Key principle:** Command never forgets. When it rewrites an agent's instructions, it saves the old version. This creates a version history that Command can reference: "Last time I lowered the threshold, quality dropped. Don't do that again."

---

## HOUSTON SONNET (CRM-Resident Team Interface)

**Model:** Claude Sonnet 4.6 via OAuth (David's main Anthropic account)
**Deployment:** Railway (Node.js server) + Vercel (React frontend)
**Identity:** The team's AI team member. Warm, professional, helpful.

### What Sonnet Does

- Responds to Team Chat (David, Dad, Sister, future team members)
- Responds to Houston DM (1-on-1 with each user)
- Executes CRM write actions (log interactions, create tasks, update records)
- Image analysis (property photos, client screenshots, documents)
- Fuzzy search with close-match suggestions
- NAV commands (drives CRM UI for the user)
- Surfaces Houston Command's briefings and recommendations to the team

### What Sonnet Does NOT Do

- Strategic planning (that's Command)
- Agent oversight (that's Command)
- Direct communication with Tier 2 or Tier 3 agents
- Email campaign decisions
- System configuration changes

### Relationship with Houston Command

- Sonnet reads Council Channel for Command's posts
- Sonnet translates Command's technical recommendations into team-friendly messages
- Sonnet responds to Command in Council (auto-response loop)
- Sonnet executes approved directives that require CRM writes
- Command never talks to the team directly — always through Sonnet

### Memory Architecture (Houston Sonnet)

Sonnet uses RAG memory stored in the CRM database (`houston_memories` table):
- **Team pool** — shared memories visible in Team Chat context
- **Personal pool** — per-user memories for Houston DM context
- **Entity linking** — memories reference specific CRM records

---

## TIER 2: THE RALPH LOOP (Quality Control + Improvement Proposals)

**Agents:** Ralph GPT (GPT-4 via OAuth) + Ralph Gemini (Gemini Pro via subscription)
**Machine:** 16GB Mac Mini
**Cycle:** Every 10 minutes
**OpenClaw Instances:** Each has its own persistent memory

### Primary Job: Validate Sandbox Output

Every 10 minutes:
1. Check agent heartbeats (are all agents running?)
2. Pull pending sandbox items (`GET /api/ai/queue/pending`)
3. Validate each item against rules (see `agent-templates/tier2-validator.md`)
4. Decision: **approve**, **reject** (with feedback), or **escalate** (to Command)
5. Log decisions

### Consensus Rules

| GPT Says | Gemini Says | Result |
|----------|-------------|--------|
| Approve  | Approve     | **Auto-approve** → promote to IE CRM |
| Reject   | Reject      | **Auto-reject** → feedback to agent |
| Approve  | Reject      | **Escalate** → Houston Command decides |
| Reject   | Approve     | **Escalate** → Houston Command decides |

### Secondary Job: Improvement Proposals

While validating, Ralph GPT and Gemini also look for patterns:

**What they watch for:**
- Recurring rejection reasons ("Enricher keeps submitting single-source contacts")
- Quality trends ("Researcher signal quality improved 20% since last instruction rewrite")
- Threshold mismatches ("I'm rejecting 75% of items scoring 50-65 — maybe threshold should be 65")
- Campaign performance patterns ("Subject lines with addresses get 3x more opens")
- Agent drift ("Matcher used to produce 10 outreach drafts/day, now only 2")

**How they propose improvements:**

```json
{
  "source_agent": "ralph_gpt",
  "target_agent": "houston_command",
  "priority_type": "improvement_proposal",
  "payload": {
    "about_agent": "enricher",
    "category": "threshold_adjustment",
    "observation": "12 contacts scored 50-65 this week. Rejected 9 (75%). Approved ones all had 3+ sources.",
    "proposal": "Raise minimum submission threshold from 50 to 65. Add hard rule: never submit with <2 sources.",
    "evidence": {
      "approved_count": 3,
      "rejected_count": 9,
      "time_period": "2026-03-22 to 2026-03-28"
    },
    "confidence": "high"
  },
  "urgency": "normal"
}
```

Houston Command reviews proposals during its nightly R&D session or immediately if marked urgent.

### Memory Architecture (Tier 2)

Each Ralph validator has persistent memory via OpenClaw:

```
~/Desktop/AI-Agents/ralph/
  agent.md                    — Validation rules, cycle instructions
  memory/
    validation-patterns.md    — Patterns in what gets approved/rejected
    agent-quality-trends.md   — Per-agent quality over time
    proposal-history.md       — Past proposals and whether Command accepted
    common-errors.md          — Frequently seen errors by agent
```

**Key principle:** Ralph remembers. "I've seen this type of error from Enricher before — it happened 3 weeks ago and Command fixed it by adjusting the scoring formula. It's happening again, maybe the fix didn't stick."

---

## TIER 3: LOCAL AGENTS (The 24/7 Workforce)

All Tier 3 agents run on the 48GB Mac Mini as separate OpenClaw instances with Ollama-served local models.

### Agent 1: THE ENRICHER
**Model:** Qwen 3.5 (20B, local)
**Primary Job:** LLC contact verification and database enrichment
**Why Qwen:** Excels at structured data processing, following precise multi-step instructions, and producing clean JSON output. The verification pipeline requires precision over creativity.

**Workflow:** New LLC → Pre-filter → Open Corporates → White Pages → BeenVerified → Confidence scoring → NeverBounce email verification → Submit to Sandbox
**Full spec:** `agent-templates/enricher.md`

### Agent 2: THE RESEARCHER
**Model:** MiniMax 2.5 (local)
**Primary Job:** Market intelligence and signal discovery
**Why MiniMax:** Fast at web research, processing lots of text, and pulling out relevant signals. Speed matters when scanning news sources continuously.

**Workflow:** Scan CRE news, IE market activity, X/Twitter, company growth signals → Score confidence → Write to Sandbox signals
**Full spec:** `agent-templates/researcher.md`

### Agent 3: THE MATCHER
**Model:** Qwen 3.5 (20B, local)
**Primary Job:** AIR report parsing and outreach matching
**Why Qwen:** Matching requires structured comparison (property type vs. tenant needs, size ranges, submarkets). Qwen's precision with structured data beats MiniMax here.

**Workflow:** Parse AIR reports → Query CRM for matching contacts → Draft personalized outreach → Submit to Sandbox outreach queue
**Full spec:** `agent-templates/matcher.md`

### Agent 4: THE SCOUT
**Model:** MiniMax 2.5 (local)
**Primary Job:** AI/tech news, evolution reports, system improvement reconnaissance
**Why MiniMax:** Needs to scan lots of content quickly across many sources. MiniMax's speed advantage matters for broad scanning.

**Workflow:** Monitor AI news, model releases, CRE tech → Weekly Evolution Report → Immediate alerts for high-impact discoveries
**Full spec:** `agent-templates/scout.md`

### Agent 5: THE LOGGER
**Model:** Qwen 3.5 (20B, local)
**Primary Job:** Daily activity logs, cost reports, performance metrics
**Why Qwen:** Writes structured summaries and parses JSONL audit data. Needs precision and consistent formatting.

**Workflow:** Read all agent logs → Produce daily .md summary → Generate cost reports → Feed data to Houston Command's review
**Full spec:** `agent-templates/logger.md`

### Agent 6: THE POSTMASTER (NEW)
**Model:** Qwen 3.5 (20B, local)
**Primary Job:** Email monitoring, activity auto-logging, email triage
**Why Qwen:** Email parsing requires structured extraction (sender matching, categorization, CRM contact lookup). Accuracy matters more than speed.

**Workflow:**
```
Houston Gmail inbox (receives all forwarded + BCC emails)
        ↓
Postmaster reads via Gmail API
        ↓
For each email:
  1. Extract sender/recipient, subject, body summary
  2. Match sender to CRM contact (by email address or name)
  3. Check contact's track_emails flag
  4. If tracking ON → create interaction record in Sandbox
     (type: 'email_received' or 'email_sent', with summary)
  5. If email is time-sensitive or high-priority →
     alert David or Dad via Houston Sonnet
  6. If email is from unknown sender matching a CRM company →
     flag as potential new contact for Enricher
        ↓
Tier 2 validates activity logs before CRM promotion
```

**Email Triage for Dad:**
- Categorize emails: deal-relevant, administrative, marketing/spam, personal
- Flag anything deal-relevant that's been unread >2 hours
- Daily summary: "Dad has 5 unread deal-relevant emails — 2 from ABC Logistics about Fontana"
- Push urgent flags via Houston Sonnet to Team Chat

**Full spec:** `agent-templates/postmaster.md`

### Agent 7: THE CAMPAIGN MANAGER (NEW)
**Model:** Qwen 3.5 (20B, local)
**Primary Job:** Outbound email campaigns via Instantly.ai
**Why Qwen:** Campaign logic requires structured decision-making (A/B test analysis, send scheduling, template personalization). Precision prevents embarrassing email mistakes.

**Workflow:**
```
TWO EMAIL STREAMS:

STREAM 1: Drip Campaigns (via Instantly.ai)
  - Manages 12 send addresses (30/day each = 360 max/day)
  - Creates campaign sequences with A/B variants
  - Tracks open rates, reply rates, bounce rates
  - Adjusts strategy based on what's working
  - Houston Command reviews weekly and tunes templates

STREAM 2: AIR-Triggered Outreach (via david@mudgeteam.com)
  - Receives matched opportunities from Matcher
  - For comps: emails all owners within 1-mile radius
  - For availabilities: emails all tenants within 1-mile radius
  - Personalizes using CRM data (name, property, relationship history)
  - Deduplication: never send same person same property twice
  - All drafts go through Tier 2 approval before sending
```

**Campaign Analytics (fed up to Houston Command):**
- Open rates by subject line pattern
- Reply rates by email template
- Best send times by contact type
- Which campaign types generate the most deal conversations
- Unsubscribe/bounce rates by send address

**Full spec:** `agent-templates/campaign-manager.md`

---

## MEMORY ARCHITECTURE BY TIER

### Tier 1 (Houston Command) — Full Persistent Memory
- **Long-term strategic memory** via OpenClaw .md files
- Remembers every instruction rewrite, every proposal outcome, every David feedback
- Version-controls agent instruction files
- Accumulates pattern library from CRM data analysis
- **This is the institutional knowledge of the organization**

### Tier 2 (Ralph GPT + Gemini) — Operational Memory
- **Medium-term pattern memory** via OpenClaw .md files
- Remembers validation patterns, recurring errors, quality trends
- Tracks which agents tend to need correction and why
- Remembers proposal history (what Command accepted/rejected)
- Resets less frequently — focus on operational patterns, not strategy

### Tier 3 (Local Agents) — Minimal Memory
- **Short-term task memory** via OpenClaw .md files (limited by local model context)
- Remembers current queue state, recent work, error recovery
- Does NOT need strategic memory — follows instructions in .md file
- Houston Command handles all strategic thinking for them
- Focus: execute well, log everything, follow instructions exactly

### Memory Sync Across Machines
- All agent machines share `~/Desktop/AI-Agents/` via iCloud Desktop sync
- Houston Command on 16GB can read/write any agent's .md files
- When Command rewrites an instruction file, iCloud syncs it to the 48GB Mini
- Agent on 48GB detects file change and reloads instructions next cycle

---

## THE SELF-IMPROVEMENT LOOP

```
TIER 3 AGENTS (do the work, log everything)
        │
        │  Detailed logs: what worked, what failed, confidence scores,
        │  time spent, errors encountered, items skipped
        │
        ▼
LOGGER (daily summary + weekly rollup)
        │
        │  Structured .md summaries + cost reports
        │
        ▼
RALPH LOOP (validates work every 10 min)
        │
        ├─ Approves/rejects sandbox items
        │
        ├─ Spots patterns in approvals/rejections
        │
        └─ Posts improvement_proposals to Houston Command
                │
                ▼
HOUSTON COMMAND (the improvement engine)
        │
        ├─ Reads Logger summaries (nightly)
        ├─ Reads Ralph proposals (nightly or urgent)
        ├─ Reads Scout evolution reports (weekly)
        ├─ Reads campaign analytics (weekly)
        ├─ Reads CRM data directly (pattern hunting)
        ├─ Reads David's direct feedback (anytime)
        │
        ├─ AUTONOMOUS ACTIONS:
        │  ├─ Rewrites agent .md instruction files
        │  ├─ Adjusts thresholds and scoring rules
        │  ├─ Tunes email templates and strategies
        │  ├─ Changes agent scheduling weights
        │  └─ Adds new cadences to its own schedule
        │
        ├─ PROPOSALS TO DAVID (via Telegram):
        │  ├─ New agent ideas
        │  ├─ Model swap recommendations
        │  ├─ Cost optimization suggestions
        │  └─ New capability proposals
        │
        └─ SELF-IMPROVEMENT (weekly):
           ├─ "What cadences should I add?"
           ├─ "What patterns am I missing?"
           ├─ "What new workflow would catch more deals?"
           └─ "What should I improve about myself?"
                │
                ▼
        Agents run with improved instructions
        Better output → better validation → better improvements
        COMPOUND LOOP — system gets smarter every week
```

---

## INTER-AGENT COMMUNICATION

### The Priority Board (Shared Database Table)

Agents don't call each other. They write notes on a shared board. Every agent checks the board at the start of each work cycle.

**Priority Types:**
- `enrich_company` — Enricher: prioritize this company
- `enrich_contact` — Enricher: prioritize this contact
- `research_company` — Researcher: dig deeper on this company
- `research_property` — Researcher: find intel on this property
- `match_contact` — Matcher: check against AIR listings
- `match_property` — Matcher: check property against contact needs
- `verify_email` — Enricher: re-verify a bounced email
- `flag_for_outreach` — Campaign Manager: this contact looks promising
- `urgent_review` — Ralph: review this ASAP
- `improvement_proposal` — Houston Command: Tier 2 has an idea
- `send_campaign` — Campaign Manager: send this approved outreach
- `log_email_activity` — Postmaster: log this email as CRM activity

### Workflow Chains (Multi-Agent Pipelines)

Some workflows span multiple agents. Track them end-to-end with `workflow_id`:

**Example: AIR Report → Deal Outreach**
```
Step 1: AIR report arrives in Houston Gmail
        → Postmaster detects, categorizes as AIR report
        → Posts to Priority Board: target=matcher, workflow_id=WF-001

Step 2: Matcher picks up WF-001
        → Parses property details from AIR report
        → Queries CRM for matching contacts
        → For each match, posts: target=enricher (verify contact is current)
        → workflow_id=WF-001 on all posts

Step 3: Enricher picks up WF-001 items
        → Verifies/enriches each matched contact
        → Submits to Sandbox with workflow_id=WF-001

Step 4: Ralph validates WF-001 items
        → Approves verified contacts

Step 5: Campaign Manager picks up approved WF-001 contacts
        → Drafts personalized outreach for each
        → Submits to Sandbox outreach queue

Step 6: Ralph validates outreach drafts
        → Approves → email sends via Instantly.ai or david@mudgeteam.com

Entire chain visible in Agent Dashboard via workflow_id filter.
```

---

## THE EMAIL ECOSYSTEM

### Houston Gmail (Command Center Inbox)

One Gmail account sees ALL email traffic:
- David's emails forwarded here automatically
- Dad's emails forwarded here automatically
- All outgoing emails BCC'd here
- AIR report subscriptions delivered here

### Inbound Email Processing (Postmaster)

```
Email arrives in Houston Gmail
        ↓
Postmaster reads via Gmail API (polling or webhook)
        ↓
CLASSIFY:
  → AIR Report? → Forward to Matcher via Priority Board
  → From known CRM contact? → Check track_emails flag
    → If ON: log as activity in Sandbox
    → If time-sensitive: alert via Houston Sonnet
  → From unknown sender at known company? → Flag for Enricher
  → Marketing/spam? → Ignore, log internally
  → Personal/non-CRE? → Ignore
        ↓
For Dad specifically:
  → Categorize all unread emails
  → Flag deal-relevant items unread >2 hours
  → Daily triage summary via Houston Sonnet
```

### Outbound Email Campaigns (Campaign Manager)

**Stream 1: Drip Campaigns (Instantly.ai)**
- 12 sender addresses × 30/day = 360 max sends/day
- Campaign Manager creates/manages campaigns via Instantly.ai API
- A/B tests subject lines, email body variants, send times
- Houston Command reviews analytics weekly, tunes strategy

**Stream 2: AIR-Triggered Outreach**
- Sent from david@mudgeteam.com (not campaign addresses)
- Triggered by Matcher finding AIR report → contact matches
- Personalized: "Hey [name], not sure if you saw this but [property] just hit the market..."
- Dedup: never send same person same property twice
- All drafts approved by Ralph before sending

### Contact Email Tracking

New boolean field on contacts: `track_emails` (default: false)

When ON for a contact:
- Postmaster auto-logs all emails to/from this person as CRM activities
- Activities show in the Activity column on the contacts table
- Full email thread visible in contact detail panel

When OFF:
- Emails from this contact are not logged
- Reduces noise for high-volume/low-relevance contacts

Toggle available in ContactDetail panel UI.

---

## AGENT ROSTER SUMMARY

| # | Agent | Model | Tier | Machine | Primary Job | Improvement Role |
|---|-------|-------|------|---------|-------------|------------------|
| 1 | Houston Command | Opus 4.6 (cloud) | 1 | 16GB | Strategy, oversight, self-improvement | Rewrites all agents, proposes system changes |
| — | Houston Sonnet | Sonnet 4.6 (cloud) | — | Railway | Team chat, CRM writes, daily driver | Surfaces Command's work to team |
| 2 | Ralph GPT | GPT-4 (cloud) | 2 | 16GB | Sandbox validation q10min | Proposes improvements to Command |
| 3 | Ralph Gemini | Gemini Pro (cloud) | 2 | 16GB | Sandbox validation (2nd opinion) | Proposes improvements to Command |
| 4 | Enricher | Qwen 3.5 (local) | 3 | 48GB | LLC → verified contact | Follows instructions, logs everything |
| 5 | Researcher | MiniMax 2.5 (local) | 3 | 48GB | Market intel, signal discovery | Follows instructions, logs everything |
| 6 | Matcher | Qwen 3.5 (local) | 3 | 48GB | AIR → outreach matching | Follows instructions, logs everything |
| 7 | Scout | MiniMax 2.5 (local) | 3 | 48GB | AI/tech news, evolution reports | Follows instructions, logs everything |
| 8 | Logger | Qwen 3.5 (local) | 3 | 48GB | Daily logs, cost reports | Follows instructions, logs everything |
| 9 | Postmaster | Qwen 3.5 (local) | 3 | 48GB | Email monitoring, activity logging | Follows instructions, logs everything |
| 10 | Campaign Mgr | Qwen 3.5 (local) | 3 | 48GB | Instantly.ai, outbound campaigns | Follows instructions, logs everything |

**Future agents (64GB+ machines):**
- Social Media Manager — generates CRE content for X/Twitter, LinkedIn
- Fireflies Agent — watches call transcripts, auto-logs summaries
- Underwriter — automated property valuation and deal analysis

---

## BUILD SEQUENCE

### Phase 0: NOW (Before 48GB Arrives)
- [x] Houston Command running on 16GB Mini
- [ ] Ralph GPT OpenClaw instance on 16GB Mini
- [ ] Ralph Gemini OpenClaw instance on 16GB Mini
- [ ] This document (AGENT-SYSTEM.md) finalized
- [ ] Push directive to Houston Command with full architecture
- [ ] Missing DB tables: improvement_proposals, workflow_chains, email preferences
- [ ] Postmaster + Campaign Manager API endpoints in CRM
- [ ] All 10 agent .md instruction files written
- [ ] Improvement proposal UI in AI Ops dashboard
- [ ] track_emails toggle on ContactDetail

### Phase 1: 48GB Mac Mini Arrives (Week 1-2)
- [ ] Ollama installed, Qwen 3.5 + MiniMax 2.5 pulled
- [ ] Enricher — first agent online, prove full pipeline
- [ ] Postmaster — email monitoring, immediate daily value
- [ ] Researcher — feed signals to Priority Board
- [ ] Logger — start producing daily summaries

### Phase 2: Agents Communicating (Week 3-4)
- [ ] Matcher + Campaign Manager — AIR → outreach pipeline
- [ ] Scout — evolution reports feeding Houston Command
- [ ] Full self-improvement loop running
- [ ] Houston Command autonomously rewriting agent instructions
- [ ] Ralph Loop proposing improvements

### Phase 3: 64GB Mac Mini Arrives
- [ ] Redistribute agents for headroom
- [ ] Test larger model variants (32B+)
- [ ] Social Media Manager agent
- [ ] Fireflies.ai integration agent

### Phase 4: 128GB Mac Studio Arrives
- [ ] Houston Command migrates to 128GB
- [ ] 70B+ local models for premium analysis
- [ ] Full fleet optimization across 4 machines

---

## RELATED DOCUMENTS

| Document | Purpose |
|----------|---------|
| `ARCHITECTURE.md` | Original architecture (superseded by sections of this doc) |
| `ORCHESTRATION.md` | Process management, supervisors, launchd |
| `COORDINATION.md` | Priority Board schema and scenarios |
| `OPERATIONS.md` | Operational procedures, monitoring |
| `ERROR-HANDLING.md` | Error recovery, circuit breakers |
| `INJECTION-DEFENSE.md` | Security against prompt injection |
| `EMAIL-INFRASTRUCTURE.md` | Email sending setup (needs update for Postmaster/Campaign Mgr) |
| `MAC-MINI-16GB-SETUP.md` | Setup guide for the 16GB command center |
| `agent-templates/*.md` | Individual agent instruction files |
