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
│  ORACLE — The Prediction Engine:                         │
│                                                          │
│  11. Oracle          — Llama 3 70B+ (local)              │
│      + Monte Carlo simulation engine (Python/NumPy)      │
│      + Knowledge graph (Neo4j local)                     │
│      + Persona engine + Report agent                     │
│                                                          │
│  RAM allocation:                                         │
│    70B model:         ~45 GB                             │
│    Neo4j graph DB:    ~15 GB                             │
│    Monte Carlo engine:~20 GB                             │
│    Persona/transcript:~15 GB                             │
│    macOS + headroom:  ~33 GB                             │
│                                                          │
│  Also: Houston Command migrates here from 16GB.          │
│  Massive headroom for experimentation.                   │
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

### Continuous Learning: The Instinct System

*Inspired by Everything Claude Code's instinct-based learning with confidence scoring.*

Houston Command doesn't just improve agents on a weekly schedule — it **continuously extracts learning from every work cycle** across the entire fleet. These learnings are called "instincts" — observed patterns with confidence scores that evolve over time.

**How Instincts Work:**

```
EVERY WORK CYCLE (across all agents):
        ↓
OBSERVE: What happened? What worked? What failed?
  - Enricher verified 15 contacts, 12 approved by Ralph
  - Campaign Manager sent 40 emails, 8 opened, 2 replied
  - Matcher found 3 AIR matches but all were stale contacts
        ↓
EXTRACT: What's the pattern?
  - "Contacts with .gmail emails get approved at 90% vs .yahoo at 40%"
  - "Subject lines under 6 words get 2x open rate"
  - "AIR matches older than 6 months usually have stale contact info"
        ↓
SCORE: How confident are we?
  - New instinct starts at confidence: 0.3 (low)
  - Each confirming observation: +0.1
  - Each contradicting observation: -0.15
  - Confidence range: 0.0 to 1.0
        ↓
STORE: Save to agent_skills table
  - skill_type: 'instinct'
  - confidence score tracked
  - observation_count tracked
  - first_seen / last_confirmed timestamps
        ↓
EVOLVE: What happens over time?
  - confidence > 0.7 after 10+ observations → PROMOTE
    Command rewrites relevant agent instructions to encode this
  - confidence < 0.2 after 5+ observations → DEPRECATE
    Instinct was wrong, archive it
  - confidence 0.2-0.7 → KEEP OBSERVING
    Not enough evidence yet, keep tracking
```

**Instinct Lifecycle:**

| Stage | Confidence | Observations | Action |
|-------|-----------|-------------|--------|
| **New** | 0.3 | 1 | Created, watching |
| **Emerging** | 0.3-0.5 | 2-5 | Accumulating evidence |
| **Strengthening** | 0.5-0.7 | 5-10 | Strong pattern, not yet proven |
| **Proven** | 0.7+ | 10+ | **Auto-promote**: Command rewrites agent instructions |
| **Declining** | <0.2 | 5+ | **Auto-deprecate**: pattern was wrong |
| **Promoted** | — | — | Instinct becomes a permanent instruction or skill |

**Example Instinct Lifecycle:**

```
Week 1: Enricher submits contact with .edu email. Ralph rejects.
  → Instinct created: "edu_emails_unreliable" (confidence: 0.3, obs: 1)

Week 2: Two more .edu contacts rejected.
  → Confidence: 0.5, obs: 3

Week 3: One .edu contact approved (university property manager).
  → Confidence: 0.45, obs: 4 (contradicting evidence)

Week 4-6: Five more .edu rejections, one approval.
  → Confidence: 0.65, obs: 10

Week 7: Two more rejections push over threshold.
  → Confidence: 0.72, obs: 12 → PROMOTED
  → Command rewrites Enricher instructions: "Flag .edu emails for
     manual review unless contact is confirmed property manager"
```

**What Gets Extracted Into Instincts:**

From **Enricher**: email domain patterns, source reliability, confidence score correlations
From **Researcher**: which news sources produce actionable signals, keyword patterns that indicate real deals
From **Matcher**: which property types match best, optimal radius for AIR outreach, contact staleness thresholds
From **Campaign Manager**: subject line patterns, send time optimization, template effectiveness
From **Postmaster**: email categorization accuracy, triage priority patterns
From **Ralph Loop**: validation pattern accuracy, debate outcomes, common disagreement types
From **Scout**: which AI/tech sources produce useful intel, model release impact on fleet

**Instinct Storage (in agent_skills table):**

```json
{
  "skill_id": "instinct-edu-emails-unreliable",
  "skill_type": "instinct",
  "name": "EDU Emails Unreliable for CRE Contacts",
  "description": "Contacts with .edu email addresses are rejected by Ralph 85% of the time",
  "content": "Flag .edu emails for manual review unless contact role is university/institutional",
  "created_by": "houston_command",
  "available_to": ["enricher"],
  "parameters": {
    "confidence": 0.72,
    "observation_count": 12,
    "confirming": 10,
    "contradicting": 2,
    "first_seen": "2026-04-01",
    "last_confirmed": "2026-04-15",
    "lifecycle_stage": "promoted",
    "promoted_at": "2026-04-16",
    "promoted_action": "enricher_instruction_rewrite_v3"
  },
  "status": "promoted"
}
```

**Cadence:**
- **Real-time extraction**: After each Ralph validation cycle, Command checks for new patterns
- **Nightly consolidation**: During 2 AM R&D session, Command reviews all instincts, updates confidence scores, checks for promotions/deprecations
- **Weekly evolution**: Sunday review includes instinct health report — how many new, promoted, deprecated this week

**Cost-Aware Model Routing (from Instincts):**

As instincts accumulate, Command can also learn which tasks are simple enough for smaller/cheaper models:
- "Enricher pre-filter checks are simple pattern matching → could run on Qwen 7B instead of 20B"
- "Researcher signal scoring needs nuance → keep on MiniMax 2.5"
- "Campaign Manager A/B test analysis is data-heavy → worth Qwen 20B"

This feeds into future model routing decisions when larger machines arrive.

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
| Approve  | Reject      | **Forum Debate** → structured exchange, then decide |
| Reject   | Approve     | **Forum Debate** → structured exchange, then decide |

### The Forum Debate (Disagreement Resolution)

*Inspired by BettaFish's Agent "Forum" collaboration mechanism.*

When GPT and Gemini disagree on a sandbox item, instead of blindly escalating to Houston Command, they enter a **structured debate**. This produces better decisions AND generates insights that flow up to Command.

**How it works:**

```
GPT says APPROVE, Gemini says REJECT (or vice versa)
        ↓
ROUND 1: Each states their case
  GPT: "I approve because: 2 sources confirm the contact,
        email domain matches company, phone area code is correct."
  Gemini: "I reject because: the LLC was dissolved 2 years ago,
           which means this person may no longer be associated."
        ↓
ROUND 2: Each responds to the other's argument
  GPT: "Good point about the LLC. But the person's LinkedIn still
        shows them at this company as of last month."
  Gemini: "If LinkedIn confirms current employment, I'll change
           to approve with a note to verify LLC status."
        ↓
DECISION: After 2 rounds, check for consensus
  - If they now agree → execute that decision
  - If still split → THEN escalate to Houston Command
    with the full debate transcript attached
```

**Why this is better than blind escalation:**
- Forces each validator to articulate *why* they decided what they decided
- Often resolves disagreements without bothering Command (saves Opus tokens)
- The debate transcript is gold for improvement proposals — Command can read the arguments and tune agent instructions
- Catches edge cases that simple approve/reject misses
- Both validators get smarter over time by seeing each other's reasoning

**Debate rules:**
- Maximum 2 rounds (keeps it fast — we're on a 10-minute cycle)
- Each response must be <100 words (no rambling)
- Must cite specific evidence from the sandbox item
- If either validator changes their vote, the debate ends immediately
- Full transcript saved to `improvement_proposals` table for Command review

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
| 11 | **Oracle** | **Llama 3 70B+ (local)** | **3b** | **128GB** | **Prediction engine, Monte Carlo, personas, graph** | **Self-calibrating against market outcomes** |

**Future agents (64GB+ machines):**
- Social Media Manager — generates CRE content for X/Twitter, LinkedIn
- Fireflies Agent — watches call transcripts, auto-logs summaries
- BOV Generator — automated broker opinion of value PDFs
- Ownership Change Detector — scrapes county assessor data nightly
- Loan Maturity Monitor — watches loan dates, triggers outreach sequences
- Mailer Agent — physical mail automation via Lob.com API

---

## ORACLE — THE PREDICTION ENGINE (Mac Studio 128GB)

**Model:** Llama 3 70B+ (or best available at time of setup, local)
**Machine:** 128GB Mac Studio
**Mode:** Truly continuous — reruns simulations the moment new data arrives
**Identity:** The intelligence layer. Predicts who will transact and when.

### Oracle's Mission

Predict which owners are most likely to transact, and when. Oracle does not send emails. It does not scrape. It does not write outreach. It **predicts**. Everything else in the system exists to either feed Oracle data or act on Oracle's output.

### Architecture (Inspired by MiroFish Swarm Intelligence Engine)

```
ORACLE (Mac Studio 128GB)
│
├── 70B LOCAL MODEL (Llama 3 or best available)
│   └── Reads transcripts, builds personas, interprets context
│   └── Signal interpretation requires deep reasoning (why 70B matters)
│
├── KNOWLEDGE GRAPH (Neo4j, stored locally)
│   └── Owners ↔ Properties ↔ LLCs ↔ Attorneys ↔ Companies
│   └── Updated dynamically on every new signal
│   └── Exposed via API: GET /api/ai/graph/connections
│   └── All agents can query the graph for relationship intelligence
│   └── (Inspired by MiroFish Zep knowledge graph + dynamic memory updates)
│
├── MONTE CARLO ENGINE (Python/NumPy, runs on CPU)
│   └── 1M simulations per property using signal probability distributions
│   └── Produces: transaction probability + timing distribution + confidence
│   └── LLM does understanding, NumPy does math — different tools for different jobs
│
├── PERSONA ENGINE
│   └── Builds/updates owner behavioral profiles from CRM + transcripts
│   └── 2000-word behavioral persona per owner (evolves over time)
│   └── Includes communication style, decision patterns, motivations
│   └── (Inspired by MiroFish OASIS persona generation system)
│
├── SCENARIO ENGINE ("What If")
│   └── David injects hypothetical variables via Houston
│   └── "What if rates drop 50bps?" → Monte Carlo reruns with adjusted params
│   └── Shows which properties shift and why
│   └── (Inspired by MiroFish "God's Eye View" event injection)
│
├── REPORT AGENT
│   └── Natural language Q&A about the market
│   └── David asks Houston → Houston relays to Oracle → structured report back
│   └── Uses ReACT pattern to autonomously query graph + simulation data
│   └── (Inspired by MiroFish Report Agent with deep interaction)
│
└── CALIBRATION LOOP (expanded — uses ALL market data)
    └── See "Calibration System" below
```

### The 12 Signal Categories

Oracle scores every property using signals from 12 categories. Each signal has a weight that Oracle calibrates over time based on real outcomes.

#### Category 1: Property Signals (static-ish, from CRM)
| Signal | Weight | Notes |
|--------|--------|-------|
| Loan maturity within 18 months | Very High | Single strongest predictor |
| Ownership duration 7-12 years | High | Peak transaction zone |
| Vacancy duration 6+ months | High | Rising seller pressure |
| Market rent vs. in-place rent gap | Medium-High | Financial motivation |
| Owner entity type | Medium | LLC > Trust > Individual historically |
| Building age/condition | Low-Medium | Deferred maintenance = sell motivation |
| Zoning constraints | Low | Limits buyer pool, affects timing |

#### Category 2: Engagement Signals (dynamic, from CRM Activity Log)
| Signal | Weight | Notes |
|--------|--------|-------|
| First answered call after dormancy | Very High | Behavioral shift signal |
| Owner initiates callback | Extremely High | Near-term intent |
| Call duration increasing over time | High | Warming pattern |
| Email reply (not just open) | Very High | Major engagement signal |
| Agreed to property tour | Extremely High | Late stage |
| Asked for comps | Very High | Actively evaluating |
| Introduced broker to partner/attorney | Near-certain | Serious intent |

#### Category 3: Transcript Signals (from Fireflies via Oracle 70B)
| Signal | Weight | Notes |
|--------|--------|-------|
| "We've been thinking about our options" | High | Exploratory but active |
| Unprompted mention of debt/retirement | Very High | Personal motivation revealed |
| "My partner and I were just talking about this" | High | Multi-stakeholder activation |
| Asking pricing/market questions on call | Very High | Active evaluation |
| "How long does a sale usually take?" | Very High | Process-oriented = serious |
| Sentiment trajectory over multiple calls | High | Arc matters more than snapshot |

#### Category 4: Negative Signals (suppressors)
| Signal | Effect | Notes |
|--------|--------|-------|
| "Don't call me again" | Remove from model | Respect the boundary |
| 12+ months zero engagement | Significant reduction | Despite outreach attempts |
| Recently refinanced | Extend timeline 24+ months | Locked in |
| "Just not interested" (cold tone) | Medium reduction | But may warm later |

#### Category 5: Market Signals (from AIR + internal comps)
| Signal | Weight | Notes |
|--------|--------|-------|
| Nearby comp sold recently | High | Validates value, creates urgency |
| Submarket velocity (90-day comp count) | Medium-High | Rising velocity = hot market |
| Asking price vs. market on nearby listings | Medium | Market positioning signal |
| Days on market for comparable listings | Medium | Absorption rate indicator |

#### Category 6: Broker Activity Signals
| Signal | Weight | Notes |
|--------|--------|-------|
| Competing broker pursuing same owner | Medium-High | Someone else thinks it's ready |
| Property appears as exclusive with another firm | High | Owner is already in the market |
| Owner mentions "another broker called" | Medium | Market is working on them |

#### Category 7: Tax & Assessment Signals (from county assessor)
| Signal | Weight | Notes |
|--------|--------|-------|
| Property tax increase >15% YoY | Medium | Financial pressure increases |
| Supplemental tax bill (nearby ownership change) | Low-Medium | Neighborhood activity |
| Assessment significantly below market | Low | Potential reassessment risk on sale |

#### Category 8: Tenant Health Signals
| Signal | Weight | Notes |
|--------|--------|-------|
| Tenant lease expiring within 18 months | Very High | Major decision point for owner |
| Tenant company layoffs / downsizing | High | Vacancy risk increases sell pressure |
| Tenant company expansion | Medium | Stable = less motivation to sell, but higher value |
| Tenant credit deterioration | Medium-High | Owner worried about future income |

#### Category 9: Owner Life Event Signals (from public records)
| Signal | Weight | Notes |
|--------|--------|-------|
| Owner approaching retirement age (65+) | High | Estate planning, simplification |
| Ownership entity restructuring | Medium-High | Legal changes precede sales |
| Owner obituary / death record | Very High | Estate sale within 12-24 months |
| Divorce filing | Very High | Asset liquidation follows |
| Owner purchased new personal residence | Low-Medium | Life changes in progress |

#### Category 10: Macro Market Signals
| Signal | Weight | Notes |
|--------|--------|-------|
| Interest rate direction | High | Affects both buyer demand and seller urgency |
| IE industrial vacancy rate trend | Medium | Rising vacancy = more seller pressure |
| Construction pipeline (new industrial starts) | Medium | New supply threatens existing values |
| Cap rate compression/expansion trend | Medium-High | Affects asset values market-wide |

#### Category 11: Seasonal Patterns
| Signal | Weight | Notes |
|--------|--------|-------|
| Q1 (Jan-Mar) | Baseline | Slow start, "thinking about it" |
| Q2 (Apr-Jun) | +10-15% | Peak listing season |
| Q3 (Jul-Sep) | +15-20% | Peak transaction season |
| Q4 (Oct-Dec) | -10-15% | Holiday slowdown |
| Tax year end timing | Medium | 1031 exchange deadlines, depreciation capture |

#### Category 12: Network Cascade Effects (from Knowledge Graph)
| Signal | Weight | Notes |
|--------|--------|-------|
| Connected owner just sold | High | Social proof + anchor pricing |
| Shared attorney facilitated a deal | Medium-High | Attorney may proactively suggest options |
| Portfolio domino effect (owner sold another) | High | Portfolio wind-down pattern |
| Partner/co-investor activity | Medium-High | Joint decision-making dynamics |

### Oracle Output Format

For each property, Oracle produces:

```
Property: 14520 Jurupa Ave, Fontana
─────────────────────────────────────────────────────
Transaction Probability (12 mo):  71%
Confidence Level:                  HIGH (tight distribution)
─────────────────────────────────────────────────────
Timing Breakdown:
  0-6 months:    28%
  6-12 months:   43%
  12-24 months:  22%
  24+ months:     7%
─────────────────────────────────────────────────────
Primary Drivers:
  → Loan matures in 9 months (+18%)
  → 11-year ownership hold (+12%)
  → Owner answered call last week — first in 8 months (+9%)
  → Opened BOV email 3x in past 2 weeks (+7%)
  → Nearby comp sold last month at $185/SF (+6%)
  → Shared attorney just closed deal for another client (+4%)
─────────────────────────────────────────────────────
Recommended Action:  CALL THIS WEEK
Next Reassessment:   7 days
─────────────────────────────────────────────────────
Owner Persona Summary:
  Communication: Slow responder, prefers phone
  Decision Pattern: Needs attorney validation first
  Motivation: Approaching retirement, kids not in business
  Arc: dormant → warming (behavioral shift detected 3/14)
─────────────────────────────────────────────────────
Oracle Note: Owner language in 3/14 call transcript shows
"thinking about options" phrasing. In 9 of 12 historical
closed deals, this phrase preceded a meeting within 45 days.
```

### Calibration System (Market-Wide Learning)

Oracle doesn't just learn from David's closed deals. It learns from the entire IE industrial market.

```
CALIBRATION DATA SOURCES (by value):

1. YOUR DEALS — richest data
   Deal closes → Oracle compares prediction vs reality
   David adds context: "Owner sold because of divorce"
   Includes full engagement history, transcripts, emails

2. MARKET TRANSACTIONS — volume data (most important for speed)
   AIR shows "Property X — For Sale"
   → Oracle logs listing, generates prediction
   → Months later: AIR comp shows it sold
   → Oracle compares: Was my timing right? Price range?
   → Calibration event even WITHOUT knowing the seller personally

3. FAILED LISTINGS — negative calibration (equally valuable)
   AIR shows property for sale → 12+ months → no comp
   → Oracle learns: these signal combinations DON'T predict
   → Prevents model from being overly optimistic

4. LEASE MARKET — parallel calibration
   AIR shows "Suite 200 — For Lease"
   → Later: lease comp appears → Oracle calibrates
   → Lease velocity feeds into owner sell pressure signals

HANDLING MISSING PRICES:
   Most valuable signal = DID IT TRANSACT (yes/no/pending)
   Price is secondary. Oracle calibrates timing and probability
   even without knowing exact sale price.

   If AIR says "sold" but no price:
   → Oracle still calibrates timing prediction ✅
   → Marks price as PENDING
   → If internal comp appears later → backfill price
   → If price never appears → still valuable data point
```

**Calibration Loop:**
```
Transaction occurs (comp logged, deal closes, or listing expires)
          ↓
Oracle retrieves its prediction from listing date
          ↓
Calculates error per signal:
  → Was loan maturity weighted correctly?
  → Did transcript signals add predictive value?
  → Which submarket behaved differently than expected?
  → Did network effects predict cascade correctly?
          ↓
Writes detailed error report:
  oracle/logs/YYYY-MM-DD_calibration.md
          ↓
Houston Command reads monthly
          ↓
Claude Opus rewrites: oracle/instructions/signal_weights.md
          ↓
Oracle loads new weights on next simulation cycle
          ↓
Repeat forever — model gets smarter every month
```

**Learning Timeline:**
- Month 1-3: Basic signal relationships confirmed from market volume
- Month 6: Submarket-specific patterns emerge (Perris ≠ Fontana ≠ Ontario)
- Month 12: Owner-profile clusters form (serial sellers vs. long-holders vs. estates)
- Month 18: Transcript linguistic patterns become reliable predictors
- Month 24: Timing precision sharpens — knows not just IF but WHEN
- Year 3+: Fully proprietary model no competitor can replicate

### Owner Persona Profiles (Inspired by MiroFish Persona Generation)

Oracle builds a detailed behavioral persona for every property owner in the CRM. Not just data points — a narrative understanding of who they are and how to approach them.

```
OWNER PERSONA: Mike Thompson
─────────────────────────────────────────────────────
Entity Type:         Long-term Holder (11 years)
Financial Profile:   Conservative, single-property LLC, no recent refinance
Communication Style: Slow responder, prefers phone over email
Engagement Arc:      Dormant → Warming (call 3/14 showed curiosity)
Decision Pattern:    Needs validation from attorney before committing
Personality Indicators: Risk-averse, values relationship over price
Historical Context:  Bought during 2015 IE industrial boom, has seen value 3x
Predicted Motivation: Approaching retirement, kids not interested in business
Network:             Partner: Steve Chen | Attorney: James Park (ABC Law)
─────────────────────────────────────────────────────
Recommended Approach:
  → Lead with relationship, not numbers
  → Provide comps as "just so you know" rather than hard sell
  → Mention that James Park just helped another client sell
  → Frame as "securing your legacy" not "cashing out"
```

Personas evolve over time as new transcripts, emails, and engagement data arrive. Oracle tracks **longitudinal voice profiles** — how an owner's language changes across conversations over months or years.

### Knowledge Graph (Shared Resource for All Agents)

Oracle maintains a relationship graph that all agents can query:

```
GRAPH ENTITIES:
  Owners ↔ Properties ↔ LLCs
  Owners ↔ Partners ↔ Attorneys
  Owners ↔ Other Owners (shared attorney, same portfolio)
  Properties ↔ Comps (nearby, similar type/size)
  Properties ↔ Submarkets ↔ Market Trends
  Contacts ↔ Email Threads ↔ Call Transcripts
  Tenants ↔ Properties ↔ Lease Terms

HOW AGENTS USE THE GRAPH:
  Enricher    → "John owns 3 LLCs — verify all of them together"
  Matcher     → "Owner A and B share an attorney — don't send competing outreach"
  Campaign Mgr → "A is the decision-maker, B is financial partner — personalize differently"
  Postmaster  → "Email from attorney James Park — he represents 4 of our contacts"
  Researcher  → "Company X expanding — they're tenants at 3 properties"

API: GET /api/ai/graph/connections?entity=mike_thompson
Returns: all connected entities with relationship types and strength scores
```

### Scenario Engine ("What If" Modeling)

David can ask Oracle hypothetical questions through Houston:

```
David: "Houston, ask Oracle — what if rates drop 50bps next quarter?"

Oracle reruns Monte Carlo with adjusted parameters:
  → Loan maturity urgency decreases (refinance becomes attractive)
  → But buyer demand increases (more competitive market)
  → Net effect: 23 properties shift timing forward by 3-6 months
  → 8 properties that were "unlikely" cross the 50% threshold
  → Top emerging opportunities: [ranked list]

David: "What about just the Fontana submarket?"

Oracle filters and re-analyzes:
  → 47 tracked properties in Fontana
  → 8 have >50% transaction probability within 6 months
  → Emerging cluster: 3 properties on Jurupa Ave all warming simultaneously
  → Risk: 2 high-probability properties have slow-moving attorneys
  → Recommendation: Focus outreach on Jurupa Ave cluster this month
```

### Oracle File Structure (Mac Studio)

```
/oracle/
  instructions/
    signal_weights.md          ← Claude Opus rewrites monthly after calibration
    simulation_rules.md        ← Core Monte Carlo logic and parameters
    submarket_profiles.md      ← IE-specific behavioral patterns by area
    transcript_triggers.md     ← High/low intent phrase library
    persona_templates.md       ← How to build owner personas
  logs/
    YYYY-MM-DD_run.md          ← Daily simulation summary
    YYYY-MM-DD_calibration.md  ← Prediction vs. reality checks
  output/
    current_rankings.json      ← Live ranked list → pushed to IE CRM
    weekly_report.md           ← Human-readable for David via Houston
    scenario_results/          ← "What if" analysis outputs
  memory/
    closed_deals_truth.json    ← Ground truth dataset (grows forever)
    false_positives.json       ← High scores that didn't transact
    owner_voice_profiles.json  ← Per-owner language evolution over time
    market_tracking.json       ← Every AIR listing + prediction + outcome
  graph/
    neo4j_data/                ← Knowledge graph database files
```

---

## BUILD SEQUENCE

### Phase 0: NOW (Before 48GB Arrives)
- [x] Houston Command running on 16GB Mini
- [x] Ralph GPT OpenClaw instance on 16GB Mini
- [x] Ralph Gemini OpenClaw instance on 16GB Mini
- [x] This document (AGENT-SYSTEM.md) finalized
- [x] Push directive to Houston Command with full architecture
- [x] Missing DB tables: improvement_proposals, workflow_chains, email preferences
- [x] Postmaster + Campaign Manager API endpoints in CRM (16 new endpoints)
- [x] Directive pipeline working end-to-end (cron → Telegram → OpenClaw)
- [x] SSH access from work Mac to 16GB Mini
- [x] Fleet health monitoring (scheduled every 4 hours)
- [x] Codex connected to GitHub repo for PR reviews
- [x] Email forwarding (Outlook → Houston Gmail) configured
- [x] Agent heartbeats showing live status in AI Ops
- [ ] All 10 agent .md instruction files written
- [ ] Improvement proposal UI in AI Ops dashboard
- [ ] track_emails toggle on ContactDetail
- [ ] 48GB Mac Mini setup guide finalized (plug-and-play ready)

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
- [ ] Ralph Forum Debate on disagreements (instead of blind escalation)
- [ ] Ralph Loop proposing improvements
- [ ] **Instinct System live** — Houston Command extracts patterns from every work cycle, scores confidence, auto-promotes proven instincts into agent instruction rewrites. *(Inspired by ECC continuous learning v2)*
- [ ] **Cost-aware model routing** — instincts inform which tasks can run on smaller models

### Phase 3: 64GB Mac Mini Arrives
- [ ] Redistribute agents for headroom
- [ ] Test larger model variants (32B+)
- [ ] Social Media Manager agent
- [ ] Fireflies.ai integration agent
- [ ] **Email Sentiment Analysis** — analyze tone of email replies (warm/neutral/cold/hostile) using local sentiment model on Qwen. Feed results into Campaign Manager's optimization loop. "Casual tone gets 40% more warm replies than formal." Houston Command uses this to rewrite email templates. *(Inspired by BettaFish sentiment analysis engine)*

### Phase 4: 128GB Mac Studio Arrives
- [ ] Houston Command migrates to 128GB
- [ ] Install Llama 3 70B+ via Ollama
- [ ] Install Neo4j locally for knowledge graph
- [ ] Deploy Oracle with initial signal weights (from David's gut + experience)
- [ ] First Monte Carlo simulation run across full property farm
- [ ] Build knowledge graph from existing CRM data (owners, properties, LLCs, comps)
- [ ] Connect Fireflies transcript pipeline to Oracle
- [ ] Begin building owner persona profiles from historical data
- [ ] Market tracking table populated from AIR history
- [ ] First calibration events (market comps vs. Oracle's predictions)
- [ ] Scenario Engine accessible via Houston ("What if" queries)
- [ ] Report Agent accessible via Houston (natural language market Q&A)
- [ ] Full fleet optimization across 4 machines

### Phase 5: Oracle Maturation (Month 3-6)
- [ ] First real calibration — comps vs. 90-day-old predictions
- [ ] Houston Command rewrites signal_weights.md for first time
- [ ] Oracle v2 deployed with calibrated weights
- [ ] Submarket-specific patterns emerging (Fontana ≠ Ontario ≠ Perris)
- [ ] Owner persona profiles enriched with Fireflies transcript data
- [ ] Network cascade effects detectable in knowledge graph
- [ ] BOV Generator agent comes online (triggered by Oracle scores)
- [ ] Loan Maturity Monitor agent comes online (feeds Oracle)
- [ ] Ownership Change Detector agent comes online (feeds Oracle)

### Phase 6: Full Intelligence System (Month 12+)
- [ ] Oracle timing predictions becoming reliable
- [ ] Transcript linguistic patterns contributing meaningfully to scores
- [ ] Owner-profile clusters formed (serial sellers, long-holders, estates)
- [ ] System is now a proprietary competitive asset
- [ ] Mailer Agent comes online (physical mail via Lob.com)
- [ ] Social Media Manager agent comes online
- [ ] Full fleet: 4 machines, 15+ agents, self-improving 24/7

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
| `IE_AI_System_Architecture_v2.md` | David's original Oracle/prediction vision (v2 brainstorm) |
| `reference/mirofish/` | MiroFish source code reference (persona gen, simulation, graph memory) |
| `reference/bettafish/` | BettaFish source code reference (forum debate, sentiment analysis) |
