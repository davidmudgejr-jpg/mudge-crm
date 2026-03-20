# David's AI System Architecture
## Commercial Real Estate Intelligence & Automation
### Built for the Inland Empire Market

---

## 🎯 VISION

A tiered, self-improving AI organization that runs 24/7 — handling research, data enrichment, market intelligence, and outreach — so David can focus on closing deals while the system feeds him better information than any competitor has access to.

The system doesn't just execute tasks — it **advises**. Through reverse prompting, it proposes opportunities, questions its own workflows, and recommends improvements. It gets smarter every day.

---

## 📱 COMMUNICATION ARCHITECTURE

The AI system speaks through **two channels** — one for the team, one for David's private operations.

```
┌─────────────────────────────────────────────────────────────┐
│                      DAVID'S DEVICES                         │
│                                                              │
│  CRM Messaging App (iOS + Web)      Telegram (9 agent bots) │
│  ┌────────────────────┐             ┌──────────────────┐    │
│  │     HOUSTON         │             │ AGENT BOTS:      │    │
│  │                     │             │                  │    │
│  │ Team sees:          │             │ @IE_Houston_bot  │    │
│  │ • Deal intel        │             │ @IE_Enricher_bot │    │
│  │ • Market briefings  │             │ @IE_Researcher_bot│   │
│  │ • Opportunity alerts│             │ @IE_Matcher_bot  │    │
│  │ • Action items      │             │ @IE_Scout_bot    │    │
│  │                     │             │ @IE_Logger_bot   │    │
│  │ David, Dad, Sister, │             │ @IE_GPT_Val_bot  │    │
│  │ and team can see    │             │ @IE_Gemini_Val_bot│   │
│  └─────────┬───────────┘             │ @IE_Analyst_bot  │    │
│            │                         └────────┬─────────┘    │
└────────────┼──────────────────────────────────┼──────────────┘
             │                                  │
             └────────────┬─────────────────────┘
                          ▼
     ┌─────────────── MAC STUDIO 128GB ───────────────────┐
     │  HOUSTON — OpenClaw Instance (Claude Opus API)      │
     │  Commander / Chief of Staff                         │
     │  ONE brain, TWO mouths (CRM App + Telegram)         │
     │  Delegates tasks to all agents below                │
     │                                                     │
     │  ANALYST — OpenClaw Instance (Llama 70B local)      │
     │  Premium analysis tasks using massive local model   │
     └────────────────────┬────────────────────────────────┘
                          │
              ┌───────────┼───────────┐
              ▼                       ▼
     ┌── MAC MINI 64GB ──┐   ┌── MAC MINI 48GB ──┐
     │  Tier 2 QA + Support│   │  Tier 3 Workers    │
     │                     │   │                     │
     │  GPT Validator      │   │  Enricher (Qwen)   │
     │    OpenClaw → GPT-4 │   │    OpenClaw → local │
     │  Gemini Validator   │   │  Researcher (MiniMax)│
     │    OpenClaw → Gemini│   │    OpenClaw → local │
     │  Scout (MiniMax)    │   │  Matcher (Qwen)     │
     │    OpenClaw → local │   │    OpenClaw → local │
     │  Logger (Qwen)      │   │                     │
     │    OpenClaw → local │   │                     │
     └─────────┬───────────┘   └──────────┬──────────┘
               │                          │
               └────────────┬─────────────┘
                            ▼
              ALL agents write to Sandbox DB
              Tier 2 validates → promotes to IE CRM
              Houston reviews daily at 6 AM
```

**Every agent is its own OpenClaw instance** — with its own persistent memory, its own Telegram bot, and its own skills. Each is model-agnostic: local agents use Ollama, QA validators use cloud APIs (GPT-4, Gemini), Houston uses Claude Opus API.

**Channel routing rule:** Is this team-actionable intelligence? → Houston. Is this operations/approvals/system? → Telegram. Is this not worth sending? → Log internally and skip.

**See:** `MESSAGING-INTERFACE.md` for full Telegram bot spec and Houston integration details.

---

## 🏗️ SYSTEM ARCHITECTURE

### Tier 1 — Chief of Staff / Houston (Strategic Brain + Proactive Advisor)
**Agent:** Claude (Opus 4.6 via API)
**Identity:** Houston — the team's AI team member
**Role:** Architect, quality controller, decision-maker, and **proactive advisor**
**Responsibilities:**
- Reviews daily logs and markdown summaries from lower tiers
- Refines agent instructions and workflows based on results
- Makes final judgment calls on high-confidence opportunities
- Approves outreach before it goes out (at least initially)
- Rewrites agent `.md` memory/instruction files to improve performance
- Acts as the self-improvement loop — sees what's working, changes what isn't
- **Reverse prompting:** Proactively recommends opportunities, strategies, and workflow improvements
- **CRM proposals:** Weekly suggestions for new CRM features based on patterns observed
- **Dual-channel output:** Posts team intel to Houston (CRM Messaging) and ops updates to Telegram
- **Council briefing:** Runs a 3-phase adversarial review each morning — Lead Analyst draft (Opus), 3 Council reviewers in parallel (Sonnet: DealHunter, RevenueGuardian, MarketSkeptic), then reconciliation (Opus). See spec: `docs/superpowers/specs/2026-03-13-ai-system-enhancements-design.md`
- **Pre-filter rule tuning:** Reviews Enricher pre-filter effectiveness weekly and adjusts rules in `pre-filter-rules.json`

**Access:** Read + Write to IE CRM (trusted tier)
**Cost model:** API, token-efficient — only invoked when worth it
**Full spec:** `agent-templates/chief-of-staff.md`

---

### Tier 2 — Operations Managers (Quality Control Layer)
**Agents:** ChatGPT (GPT-4 API) + Gemini (Gemini Pro API)
**Role:** "The Ralph Loop" — periodic check-ins on local model work
**Deployment:** Each validator runs as its **own OpenClaw instance** with persistent memory, its own Telegram bot, and full agent capabilities. This means they don't just check work once and forget — they remember patterns, learn what usually fails, and get smarter over time.

**Responsibilities:**
- Check local model output every 10–15 minutes
- Validate contact research results before writing to IE CRM
- Review AIR report matching logic and outreach drafts
- Flag anything that looks off or needs Claude's attention
- Escalate high-confidence opportunities up to Claude
- **Remember validation patterns** — learns which agent outputs tend to need correction
- **Cross-reference history** — "I've seen this type of error before from Enricher"
- When GPT and Gemini **agree** → auto-approve to production
- When GPT and Gemini **disagree** → escalate to Houston → Houston escalates to David if needed

**OpenClaw Config:**
```
# GPT Validator instance
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-xxxxx
MODEL=gpt-4
PORT=3004

# Gemini Validator instance
LLM_PROVIDER=google
GOOGLE_API_KEY=AIza-xxxxx
MODEL=gemini-pro
PORT=3005
```

**Access:** Read IE CRM + Read/Write to Sandbox DB
**Cost model:** GPT-4 API (~$5-10/mo), Gemini Pro API (~$3-8/mo)

**Key insight from Alex Finn:** "It doesn't take a lot of tokens to check every 10 minutes — and then you can have all the hard work done locally."

---

### Tier 3 — Workers (The 24/7 Workforce)
**Hardware:** Mac Mini (arriving soon) → Mac Studio (arriving in a few months)
**Models:**
- **Qwen 3.5** — Coding, data processing, structured tasks
- **MiniMax 2.5** — Internet research, scraping, finding signals

**Each agent is a separate OpenClaw instance with its own:**
- Memory files (markdown .md files stored locally)
- Instruction set (agent.md)
- Skill set tailored to its role
- Separate device when possible (don't mix researcher context with developer context)

---

## 🤖 AGENT ROSTER (Tier 3 — Local Models)

### Agent 1: "The Researcher" (MiniMax)
**Primary job:** Constant internet intelligence gathering + proactive opportunity discovery
- Monitor commercial real estate news, Inland Empire market activity
- Follow top CRE accounts on X, surface high-signal tweets
- Scan for company growth signals (hiring, funding, expansion, relocation)
- Read and parse AIR reports forwarded via email
- Write findings to Sandbox DB with confidence score + timestamp
- **Proactive (idle-cycle):** When no priority tasks, actively seek coverage gaps, stale contacts, emerging submarkets, competitor activity, lease expiry intel, and new data sources
- **Full spec:** `agent-templates/researcher.md`

### Agent 2: "The Enricher" (Qwen)
**Primary job:** Contact verification & database enrichment
- When new LLC/company added to IE CRM → trigger enrichment workflow
- **Stage 0 Pre-Filter:** Before any paid API calls, evaluate record against rule-based filters (`pre-filter-rules.json`): required fields, property type relevance, geography, duplicate detection, junk entity detection. Records that fail are skipped and logged. See full spec in design doc.
- Hit Open Corporates → extract registered person name
- Cross-reference White Pages + BeenVerified → match addresses, phones, emails
- Score confidence: "If address matches AND two email sources agree = high confidence"
- Queue high-confidence emails for NeverBounce verification
- Write verified contacts to Sandbox DB (NOT directly to IE CRM — Tier 2 approves)

### Agent 3: "The Matcher" (Qwen or MiniMax)
**Primary job:** AIR report → outreach matching
- Monitor designated email inbox for forwarded AIR reports
- Parse property details: size, type, location, price range
- Query IE CRM for owners/tenants matching size range + submarket
- Draft personalized outreach emails
- Queue drafts for Tier 2 review before any email sends

### Agent 4: "The Scout" (MiniMax — AI & Tech Intelligence)
**Primary job:** Scan AI/tech news across multiple platforms and recommend system improvements
- Monitor AI news sources: Hacker News, Reddit (r/LocalLLaMA, r/MachineLearning, r/OpenClaw), X/Twitter (AI influencers, open-source model releases), ArXiv summaries
- Track new model releases (Ollama model registry, HuggingFace trending)
- Watch for new tools, MCP servers, OpenClaw skills, and integrations relevant to CRE or agent orchestration
- Monitor competitor approaches (other CRE tech, proptech AI products)
- Search for CRE-specific AI use cases (automated underwriting, lease abstraction, market forecasting)
- **Output: Weekly "Evolution Report"** written to agent_logs with type `evolution_report`:
  - New models worth testing (with benchmarks vs current models)
  - New tools/integrations that could improve our workflows
  - Techniques spotted in the wild that we could adopt
  - Competitor intelligence (who's building what in CRE AI)
  - Specific, actionable recommendations ranked by effort vs impact
- **Output: Immediate alerts** for high-impact discoveries:
  - Major model release that significantly outperforms our current models
  - Security vulnerability in a tool we use
  - New free/cheap API that replaces a paid service
- **Idle-cycle behavior:** When no priority scans queued, deep-dive into one topic from the backlog (e.g., "How are other teams doing lease abstraction with local models?")
- **Pricing table maintenance:** Monitor model pricing changes from Anthropic, OpenAI, Google, and update the pricing table in `supervisor-config.json` when changes are announced
- **Full spec:** `agent-templates/scout.md`

### Agent 5: "The Logger" (either model)
**Primary job:** Daily activity documentation
- Write detailed .md log files every day summarizing:
  - What each agent did
  - How many contacts were enriched
  - What signals were found
  - What outreach was queued
  - What failed or went off track
- Generate cost reports from JSONL audit log data (by model, by task type, by agent, routing suggestions)
- Read from `/AI-Agents/logs/audit/` to produce both daily `.md` summaries AND cost analysis reports
- These logs are what Claude reads to improve the system

---

## 🧠 MEMORY SYSTEM

**Key insight from Alex Finn:** "OpenClaw is just a bunch of markdown files on your computer. That's it. Memory, soul, instructions — it's all just markdown files."

**Folder Structure:**
```
/AI-Agents/
  /chief-of-staff/             ← Claude's context files
    agent.md                   ← Mission + instructions
    memory/
  /researcher/
    agent.md
    memory/
    logs/
  /enricher/
    agent.md
    memory/
    logs/
  /matcher/
    agent.md
    memory/
    logs/
  /shared/                     ← Shared utilities used by all agents
    cost-tracker.py
    audit-log.py
  /logs/
    /audit/                    ← JSONL structured audit logs (daily files)
    /council/                  ← Council briefing traces (daily JSON)
  /chief-of-staff/
    council/                   ← Council reviewer prompts
      deal-hunter.md
      revenue-guardian.md
      market-skeptic.md
  /enricher/
    pre-filter-rules.json      ← Stage 0 filter configuration
  /sandbox-db/                 ← Local agent write zone (NOT IE CRM)
  /daily-logs/                 ← What Claude reads each morning
```

**Sandbox DB = Safety Layer**
- Local agents write ONLY to Sandbox DB
- Tier 2 (ChatGPT/Gemini) validates and approves
- Approved data gets pushed to IE CRM
- Claude never burns tokens on raw noise — only reviewed signals

**Backup:** Local markdown files are precious. Back up /AI-Agents/ folder to a separate drive. Do NOT put on cloud unless encrypted.

---

## 🔄 THE SELF-IMPROVEMENT LOOP

```
TWO FEEDBACK STREAMS INTO CLAUDE:

STREAM 1: Internal Performance (daily)          STREAM 2: External Intelligence (weekly)
─────────────────────────────────                ────────────────────────────────────────
Local agents work 24/7                           Scout scans AI news, model releases,
        ↓                                        tools, CRE tech, competitor activity
Write detailed logs (.md files)                          ↓
        ↓                                        Weekly "Evolution Report" posted to
Tier 2 (Ralph Loop) checks every 10-15 min      agent_logs (type: evolution_report)
        ↓                                                ↓
Daily summary pushed to Claude                   ─────────┐
        ↓                                                 │
        └────────── MERGE ──────────────────────────────┘
                         ↓
              Claude reviews BOTH streams:
              • What worked? What failed? What patterns? (internal)
              • What's new? What should we try? What's cheaper/better? (external)
                         ↓
              Claude produces TWO outputs:
              1. Agent instruction rewrites (.md files) — based on performance data
              2. "System Evolution Proposals" — based on Scout discoveries
                 (new model to test, new tool to integrate, workflow change)
                         ↓
              Instruction rewrites → agents run with improved instructions
              Evolution proposals → David reviews in morning briefing
                         ↓
              Repeat → system gets smarter AND stays current with AI advances
```

### Evolution Proposal Format

When Claude identifies an actionable improvement from the Scout's report:

```json
{
  "type": "evolution_proposal",
  "title": "Switch Enricher from Qwen 3.5 (20B) to Qwen 4 (25B)",
  "source": "Scout weekly report — 2026-03-20",
  "category": "model_upgrade",
  "effort": "low",
  "impact": "medium",
  "rationale": "Qwen 4 (25B) released March 18. Benchmarks show 12% improvement on structured data extraction tasks. Same RAM footprint as current model. Ollama pull available.",
  "action_plan": [
    "Pull qwen4:25b via Ollama on Mac Mini",
    "Run Level 1 unit tests with new model",
    "Compare enrichment accuracy: 50 items with Qwen 3.5 vs Qwen 4",
    "If accuracy improves: update supervisor-config.json"
  ],
  "risk": "Low — can always rollback to Qwen 3.5",
  "decision": "defer_to_david"
}
```

Categories: `model_upgrade`, `new_tool`, `workflow_change`, `cost_optimization`, `security_patch`, `competitor_intel`, `new_data_source`

---

## 🔐 ACCESS & SECURITY

| Agent | IE CRM | Sandbox DB | Internet | Email |
|-------|--------|------------|----------|-------|
| Claude (Tier 1) | Read + Write | Read | No | Approve only |
| ChatGPT/Gemini (Tier 2) | Read | Read + Write | No | Review only |
| Researcher (Tier 3) | Read only | Read + Write | Yes | No |
| Enricher (Tier 3) | Read only | Read + Write | Yes (APIs only) | No |
| Matcher (Tier 3) | Read only | Read + Write | No | Read (inbox) |
| Scout (Tier 3) | Read only | Write (logs only) | Yes | No |
| Logger (Tier 3) | Read only | Read + Write | No | No |

**Dedicated accounts for local models:**
- Separate White Pages account
- Separate BeenVerified account
- Separate email inbox (forward AIR reports here)
- API keys scoped per agent (can revoke individually)
- NEVER use personal accounts for automated access

**Why local > VPS (Alex Finn):**
- Faster
- More customizable (any Mac app = potential agent tool)
- Secure by default (VPS is exposed by default)
- Scalable without astronomical cloud costs

---

## 📬 THE AIR REPORT WORKFLOW

```
David forwards AIR report to dedicated inbox
        ↓
Matcher agent reads + parses (size, type, submarket, price)
        ↓
Queries IE CRM: owners/tenants in same size range + submarket
        ↓
Drafts personalized outreach for each match
        ↓
Queues drafts → Tier 2 reviews tone + accuracy
        ↓
Claude spot-checks (optional, high-value sends)
        ↓
Email goes out (deduplication check first)
```

---

## 🔍 CONTACT VERIFICATION WORKFLOW

```
New LLC added to IE CRM (or batch run nightly)
        ↓
Stage 0: Pre-Filter (rule-based, instant, free)
  - Required fields present? Property type relevant? Geography in target? Not a duplicate? Not junk entity?
  - SKIP → log reason to audit log, move to next
  - PASS ↓
Open Corporates → extract registered person name + address
        ↓
White Pages + BeenVerified → look up name
        ↓
Score: address match? phone match? email agreement?
        ↓
High confidence (2+ sources agree) → NeverBounce verify email
        ↓
Write to Sandbox DB with confidence score
        ↓
Tier 2 approves → push to IE CRM contacts
```

---

## 🖥️ HARDWARE PLAN — 3-MACHINE FLEET

### Fleet Overview
```
ARRIVAL ORDER:
  1st → Mac Mini 48GB    "The Starter"     — gets everything running
  2nd → Mac Mini 64GB    "The Specialist"   — QA validators + overflow
  3rd → Mac Studio 128GB "The Beast"        — Houston + premium models
```

### Network & Accounts
- **All 3 machines connect to your home network via standard WiFi or Gigabit Ethernet** — no special networking needed
- They all talk to cloud services (Neon DB, APIs) over the internet — not to each other directly
- 10Gb Ethernet on the Mac Studio is nice-to-have but NOT required for this setup

**Apple ID Strategy:**
```
YOUR PERSONAL APPLE ID (davidmudge@...)
  → Your MacBook ONLY
  → All your personal data stays here
  → NEVER goes on the agent machines

FLEET APPLE ID (ie-ai-fleet@icloud.com — create this new)
  → Shared across ALL 3 agent machines
  → DISABLE everything except:
    ✓ Find My Mac (locate/wipe if stolen)
    ✓ Software Updates
  → DISABLE:
    ✗ iCloud Drive, iCloud Keychain, Photos, Mail, Safari sync
    ✗ Everything else — these are headless servers, not personal computers
```

**Why a separate Apple ID?** These machines run 24/7 with AI agents making network calls. If anything ever gets compromised, your personal passwords, photos, and messages must NOT be accessible. Keep that wall up.

**Remote Access (no iCloud needed):**
- SSH: `ssh ai-fleet@192.168.1.XX` from your MacBook
- Screen Sharing: Enable in System Settings > General > Sharing
- Both work over your local network without iCloud

---

### Machine 1: Mac Mini 48GB — "The Starter" (Arrives First)
| Spec | Detail |
|------|--------|
| **Chip** | Apple M4 Pro |
| **CPU** | 12-core (10 performance + 2 efficiency) |
| **GPU** | 16-core |
| **Neural Engine** | 16-core |
| **Unified Memory** | 48GB |
| **Storage** | 1TB SSD |
| **Network** | Gigabit Ethernet |
| **Connectivity** | 3x Thunderbolt 5, 2x USB-C, HDMI |

**Role:** Primary agent runner — ALL 5 Tier 3 worker agents start here.

**Why this matters for AI:**
- 48GB unified memory = GPU has direct access to all RAM (no PCIe bottleneck like x86)
- Both Qwen 3.5 (20B, ~14GB) and MiniMax 2.5 (~8GB) fit simultaneously with ~26GB to spare
- 16-core GPU accelerates inference — tokens/second will be significantly faster than CPU-only
- M4 Pro memory bandwidth: ~273 GB/s — fast model loading, fast inference
- 1TB SSD is plenty for models, logs, and agent memory files

**OpenClaw instances on this machine:**
| Instance | Port | LLM | Telegram Bot |
|----------|------|-----|-------------|
| Enricher | 3001 | Qwen 3.5 (local Ollama) | @IE_Enricher_bot |
| Researcher | 3002 | MiniMax 2.5 (local Ollama) | @IE_Researcher_bot |
| Matcher | 3003 | Qwen 3.5 (local Ollama) | @IE_Matcher_bot |
| Scout | 3004 | MiniMax 2.5 (local Ollama) | @IE_Scout_bot |
| Logger | 3005 | Qwen 3.5 (local Ollama) | @IE_Logger_bot |

**Resource Budget:**
| Component | RAM | Notes |
|-----------|-----|-------|
| macOS + system | ~5 GB | Baseline OS |
| Qwen 3.5 (20B) | ~12-14 GB | Enricher, Matcher, Logger share model |
| MiniMax 2.5 | ~6-8 GB | Researcher, Scout share model |
| OpenClaw instances (x5) | ~1.5-3 GB | ~300-600MB each |
| **Free headroom** | **~18-24 GB** | Room for larger models later |

Both models stay loaded. No swapping. All agents run in true parallel from day one.

---

### Machine 2: Mac Mini 64GB — "The Specialist" (Arrives Second)
| Spec | Detail |
|------|--------|
| **Chip** | Apple M4 Pro |
| **CPU** | 12-core |
| **GPU** | 16-core |
| **Neural Engine** | 16-core |
| **Unified Memory** | 64GB |
| **Storage** | 1TB SSD |
| **Network** | Gigabit Ethernet |

**Role:** Tier 2 QA validators (GPT + Gemini as full OpenClaw agents) + overflow capacity.

**What changes when this arrives:**
- GPT and Gemini validators move from simple API calls to **full OpenClaw agents with persistent memory**
- Scout and Logger migrate here from the 48GB Mini (frees up resources on the Starter)
- 48GB Mini now runs only the 3 heavy-duty workers (Enricher, Researcher, Matcher) with tons of headroom

**OpenClaw instances on this machine:**
| Instance | Port | LLM | Telegram Bot |
|----------|------|-----|-------------|
| Scout | 3001 | MiniMax 2.5 (local Ollama) | @IE_Scout_bot |
| Logger | 3002 | Qwen 3.5 (local Ollama) | @IE_Logger_bot |
| GPT Validator (Tier 2) | 3003 | GPT-4 API (cloud) | @IE_GPT_Val_bot |
| Gemini Validator (Tier 2) | 3004 | Gemini Pro API (cloud) | @IE_Gemini_Val_bot |

**Resource Budget:**
| Component | RAM | Notes |
|-----------|-----|-------|
| macOS + system | ~5 GB | Baseline OS |
| Qwen 3.5 (20B) | ~12-14 GB | Logger (local) |
| MiniMax 2.5 | ~6-8 GB | Scout (local) |
| OpenClaw instances (x4) | ~1.5-2.5 GB | GPT/Gemini validators barely use local RAM (cloud LLMs) |
| **Free headroom** | **~34-40 GB** | Room for a 30B+ model for harder tasks |

**Why the 64GB is perfect for Tier 2:** The GPT and Gemini validators use cloud APIs, so they barely touch local RAM. The extra headroom lets you also run a bigger local model (30B+) for specialist tasks or failover.

---

### Machine 3: Mac Studio 128GB — "The Beast" (Arrives Third)
| Spec | Detail |
|------|--------|
| **Chip** | Apple M4 Max |
| **CPU** | 16-core |
| **GPU** | 40-core |
| **Neural Engine** | 16-core |
| **Unified Memory** | 128GB |
| **Storage** | 2TB SSD |
| **Network** | 10Gb Ethernet |
| **Connectivity** | 4x Thunderbolt 5, 2x USB-A, 2x USB-C, HDMI, SDXC |

**Role:** Houston (Commander / Chief of Staff) + premium large model inference.

**What changes when this arrives:**
- Houston (Claude Opus) gets its own dedicated OpenClaw instance on the most powerful machine
- Houston can now run the adversarial council briefings faster (40-core GPU)
- Can run 70B+ parameter models locally for premium analysis tasks
- 48GB and 64GB Minis become pure worker/QA machines, fully dedicated to their roles

**OpenClaw instances on this machine:**
| Instance | Port | LLM | Telegram Bot |
|----------|------|-----|-------------|
| Houston (Commander) | 3001 | Claude Opus API (cloud) | @IE_Houston_bot |
| Premium Analyst | 3002 | Llama 3 70B (local Ollama) | @IE_Analyst_bot |

**Resource Budget:**
| Component | RAM | Notes |
|-----------|-----|-------|
| macOS + system | ~8 GB | Baseline OS |
| Llama 3 70B (Q4 quantized) | ~36 GB | Premium local analysis |
| Qwen 3.5 (20B) | ~14 GB | Backup / secondary tasks |
| CodeLlama 34B | ~20 GB | Future: code generation tasks |
| OpenClaw instances (x2) | ~1 GB | Houston uses cloud API, lightweight locally |
| **Free headroom** | **~49 GB** | Massive room for experimentation |

**Why this matters for AI:**
- 128GB unified memory = can run the largest open-source models (70B+ parameter)
- 40-core GPU = 2.5x the inference throughput of the Mac Mini
- M4 Max memory bandwidth: ~546 GB/s — nearly double the Mac Mini
- 2TB SSD = room for many model variants cached on disk

---

### Full Fleet Summary — All OpenClaw Instances

```
MAC MINI 48GB — "The Starter" (3 worker agents)
  ├── Enricher      → Qwen 3.5 (local)    → port 3001 → @IE_Enricher_bot
  ├── Researcher    → MiniMax 2.5 (local)  → port 3002 → @IE_Researcher_bot
  └── Matcher       → Qwen 3.5 (local)    → port 3003 → @IE_Matcher_bot

MAC MINI 64GB — "The Specialist" (2 workers + 2 QA validators)
  ├── Scout         → MiniMax 2.5 (local)  → port 3001 → @IE_Scout_bot
  ├── Logger        → Qwen 3.5 (local)    → port 3002 → @IE_Logger_bot
  ├── GPT Validator → GPT-4 API (cloud)    → port 3003 → @IE_GPT_Val_bot
  └── Gemini Valid. → Gemini Pro (cloud)   → port 3004 → @IE_Gemini_Val_bot

MAC STUDIO 128GB — "The Beast" (Commander + premium)
  ├── Houston       → Claude Opus (cloud)  → port 3001 → @IE_Houston_bot
  └── Analyst       → Llama 70B (local)    → port 3002 → @IE_Analyst_bot

TOTAL: 9 OpenClaw instances, 9 Telegram bots
       4 use local Ollama models (FREE inference)
       2 use local large models (FREE inference)
       3 use cloud APIs (Claude ~$15-30/mo, GPT ~$5-10/mo, Gemini ~$3-8/mo)
       Estimated total API cost: ~$25-50/month
```

### Phased Arrival Plan

**PHASE 1: Mac Mini 48GB arrives (Week 1-2)**
- Set up ALL agents on this one machine temporarily
- All 5 Tier 3 workers + Houston (via API) + Tier 2 validators (via API)
- Everything works on one box — just a bit more crowded on RAM
- Goal: Get the full pipeline running end-to-end

**PHASE 2: Mac Mini 64GB arrives (Week 3-4)**
- Migrate Scout + Logger to the 64GB
- Set up GPT Validator and Gemini Validator as full OpenClaw instances on 64GB
- 48GB Mini now has more headroom for the 3 heavy workers
- Goal: Tier 2 validators become full persistent agents with memory

**PHASE 3: Mac Studio 128GB arrives (Month 2+)**
- Houston gets its own dedicated OpenClaw instance on the Studio
- Pull 70B models for premium analysis
- Studio becomes the brain, Minis become the muscle
- Goal: Full fleet operational — each machine has a clear role

---

## 📋 SETUP CHECKLISTS — PHASED BY MACHINE ARRIVAL

### Phase 1: Mac Mini 48GB "The Starter" (Day One)

**macOS & Account Setup:**
- [ ] Unbox, plug in, connect to monitor/keyboard for initial setup
- [ ] Create new Fleet Apple ID (ie-ai-fleet@icloud.com) during setup
- [ ] Sign in with Fleet Apple ID
- [ ] Disable ALL iCloud services except Find My Mac + Software Updates
- [ ] Enable SSH: System Settings > General > Sharing > Remote Login
- [ ] Enable Screen Sharing: System Settings > General > Sharing > Screen Sharing
- [ ] Set static IP on your router (e.g., 192.168.1.50) so SSH address never changes
- [ ] Test SSH from your MacBook: `ssh ai-fleet@192.168.1.50`
- [ ] Set machine to never sleep: System Settings > Energy > Never
- [ ] Disconnect monitor/keyboard — it's now a headless server

**Software Installation (all via SSH from your MacBook):**
- [ ] Install Homebrew: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`
- [ ] Install Python 3.11+: `brew install python`
- [ ] Install Node.js: `brew install node`
- [ ] Install Ollama: `curl -fsSL https://ollama.com/install.sh | sh`
- [ ] Pull Qwen 3.5 (20GB variant): `ollama pull qwen3.5:20b`
- [ ] Pull MiniMax 2.5: `ollama pull minimax2.5`
- [ ] Install OpenClaw: `pip install openclaw` (or clone from GitHub)
- [ ] Optional: Install Claude Code for maintenance: `npm install -g @anthropic-ai/claude-code`

**OpenClaw Agent Setup:**
- [ ] Create /AI-Agents/ folder structure (see Memory System section)
- [ ] Create 5 Telegram bots via @BotFather (Enricher, Researcher, Matcher, Scout, Logger)
- [ ] Configure OpenClaw instance for Enricher (port 3001, Qwen 3.5, Telegram bot token)
- [ ] Configure OpenClaw instance for Researcher (port 3002, MiniMax 2.5, Telegram bot token)
- [ ] Configure OpenClaw instance for Matcher (port 3003, Qwen 3.5, Telegram bot token)
- [ ] Configure OpenClaw instance for Scout (port 3004, MiniMax 2.5, Telegram bot token)
- [ ] Configure OpenClaw instance for Logger (port 3005, Qwen 3.5, Telegram bot token)
- [ ] Set API keys: ANTHROPIC_API_KEY (for Houston calls), OPENAI_API_KEY, GOOGLE_API_KEY
- [ ] Set up LaunchAgents so all instances auto-start on boot
- [ ] Write agent.md for each agent (copy from agent-templates/)

**External Services:**
- [ ] Set up dedicated email inbox for AIR reports
- [ ] Set up dedicated White Pages account
- [ ] Set up dedicated BeenVerified account
- [ ] Create read-only API endpoints in IE CRM for local agents
- [ ] Verify Sandbox DB tables exist in Neon (sandbox_contacts, sandbox_enrichments, etc.)

**Testing (do these one at a time):**
- [ ] Test Enricher: run one LLC through full verification workflow
- [ ] Test Researcher: research one company end to end
- [ ] Test Matcher: forward one AIR report and check output
- [ ] Test Scout: verify it can scan news sources
- [ ] Test Logger: verify it generates a daily summary
- [ ] Let it all run for one full week, watch the logs
- [ ] Schedule first Houston review (Claude API call with log data)

---

### Phase 2: Mac Mini 64GB "The Specialist" (When It Arrives)

**macOS & Account Setup:**
- [ ] Same Fleet Apple ID setup as Phase 1
- [ ] Same SSH/Screen Sharing/static IP setup (e.g., 192.168.1.51)
- [ ] Same headless server configuration

**Software Installation:**
- [ ] Same stack: Homebrew, Python, Node, Ollama, OpenClaw

**Agent Migration & New Setup:**
- [ ] Migrate Scout from 48GB Mini → 64GB Mini (port 3001)
- [ ] Migrate Logger from 48GB Mini → 64GB Mini (port 3002)
- [ ] Create 2 NEW Telegram bots: @IE_GPT_Val_bot, @IE_Gemini_Val_bot
- [ ] Set up GPT Validator OpenClaw instance (port 3003, GPT-4 API, Telegram bot)
- [ ] Set up Gemini Validator OpenClaw instance (port 3004, Gemini Pro API, Telegram bot)
- [ ] Configure shared memory directory so validators can read Tier 3 agent outputs
- [ ] Set up LaunchAgents for all 4 instances
- [ ] Pull Ollama models: Qwen 3.5 (for Logger), MiniMax 2.5 (for Scout)

**Update 48GB Mini:**
- [ ] Remove Scout and Logger instances from 48GB Mini
- [ ] 48GB Mini now runs only: Enricher (3001), Researcher (3002), Matcher (3003)
- [ ] Verify extra headroom allows faster inference

**Testing:**
- [ ] Test GPT Validator: send it a batch of Enricher output, verify it validates correctly
- [ ] Test Gemini Validator: same test, compare its opinion to GPT's
- [ ] Test disagreement handling: find a case where they disagree, verify escalation works
- [ ] Run both validators for a week alongside the 48GB Mini workers

---

### Phase 3: Mac Studio 128GB "The Beast" (When It Arrives)

**macOS & Account Setup:**
- [ ] Same Fleet Apple ID setup (e.g., 192.168.1.52)
- [ ] Same headless server configuration

**Software Installation:**
- [ ] Same stack + pull larger models
- [ ] Pull Llama 3 70B (Q4): `ollama pull llama3:70b-q4`
- [ ] Pull CodeLlama 34B: `ollama pull codellama:34b` (future use)

**Houston Setup:**
- [ ] Create Telegram bot: @IE_Houston_bot
- [ ] Set up Houston OpenClaw instance (port 3001, Claude Opus API, Telegram bot)
- [ ] Configure Houston's agent.md with Chief of Staff instructions
- [ ] Set up council briefing (3-phase adversarial review) as a scheduled skill
- [ ] Configure dual-channel output: CRM Messaging App + Telegram
- [ ] Set up 6 AM daily trigger for morning briefing
- [ ] Optional: Set up Premium Analyst instance (port 3002, Llama 70B local)

**Fleet Integration:**
- [ ] Houston can now coordinate all agents across all 3 machines
- [ ] Test: Text Houston on Telegram → Houston delegates to worker agents → results come back
- [ ] Test: Full morning briefing cycle (overnight work → Houston review → Telegram summary)
- [ ] Test: Escalation path (Tier 3 output → Tier 2 disagree → Houston → David)

**Final Fleet Verification:**
- [ ] All 9 OpenClaw instances running across 3 machines
- [ ] All 9 Telegram bots responding
- [ ] All LaunchAgents configured (survives reboots)
- [ ] SSH access working to all 3 machines from MacBook
- [ ] Houston morning briefing arriving on Telegram at 6 AM
- [ ] Agents running 24/7 without intervention

---

## 🎯 PRIORITY ORDER

1. **Contact Verification Workflow** — immediate ROI, feeds every campaign
2. **AIR Report Matching + Outreach** — direct deal flow generation  
3. **Market Intelligence Monitoring** — ongoing signal gathering
4. **Self-improvement loop** — Claude reviewing logs + refining agents
5. **Voice team member on Zoom** — fun project once foundation is solid

---

## 🔗 CRM ↔ AI INTEGRATION POINTS

The CRM and AI system are designed independently but must connect seamlessly. These are the integration points that make the full system greater than the sum of its parts.

### TPE ↔ Researcher Pipeline
The Transaction Probability Engine (TPE) scores properties based on multiple weighted factors. The Researcher finds signals that should update TPE inputs, but currently there's no automated pipeline. The integration:
- When Researcher finds a growth signal for a company → update `tenant_growth` TPE input
- When Researcher finds lease expiry data → update `lease_expiry_proximity` TPE input
- When signals are approved and promoted, Chief of Staff checks if TPE inputs should be recalculated
- TPE weight adjustments based on which signals actually correlate with closed deals

### Action Items ↔ AI Recommendations
The CRM's Action Items feature (Apple Reminders-style) should be fed by AI recommendations:
- Chief of Staff's reverse prompts create action items in IE CRM with: assignee, due date, priority, source
- Example: "Call John Martinez — lease expiring in 6 months, 3 convergent signals this week" → action item for David, due today, high priority
- Track completion rate of AI-generated action items to measure recommendation quality

### Claude Panel ↔ Chief of Staff
The CRM has a stubbed Claude Panel in the UI. This should become the primary interface for David to interact with Chief of Staff *in context*:
- Viewing a property → ask "What do we know about this owner?"
- Viewing a contact → ask "What signals have we found for their company?"
- Viewing a deal → ask "What comparable deals have closed recently?"
- Panel sends context (current record type + ID) to Chief of Staff for grounded responses

### Comps ↔ Matcher Outreach
The CRM's Comps feature (lease & sale comps with CSV import) should feed Matcher's outreach:
- Matcher queries `/api/ai/comps` when drafting outreach
- Includes 1-2 relevant comps in email body for credibility: "Similar space at [address] leased for $X.XX/SF"
- Comps make outreach feel market-informed, not generic

### Hot 10 ↔ Dashboard
Logger's velocity-based Hot 10 list should be a first-class panel in the CRM:
- Agent Dashboard shows the Hot 10 updated daily
- Each entry links to the company/contact in IE CRM
- Click to see all signals, interactions, and enrichment data
- Team visibility via Houston channel morning briefing

### Feedback Loop ↔ Instruction Improvement
Every approval/rejection David makes in the CRM Dashboard feeds the feedback loop:
- Override patterns are tracked in `feedback_loop` table
- Chief of Staff reviews weekly and adjusts agent instructions
- The CRM UI shows: "Your feedback has improved Enricher accuracy from 78% to 91%"

---

## 💡 KEY PRINCIPLES

- **Ambient beats genius** — A less-smart model running 24/7 outperforms a brilliant model used occasionally
- **Hybrid is the sweet spot** — Local models do the work, cloud models check it (the "Ralph Loop")
- **Separate agents for separate skills** — Don't mix researcher context with developer context
- **Sandbox everything** — Local models never write directly to production IE CRM
- **Log everything** — Logs are what makes the system self-improve
- **Start narrow** — One workflow working perfectly beats ten half-baked ones
- **Your process is your moat** — Teaching the system your contact research logic is not replicable by competitors
- **Markdown is memory** — Back it up, protect it, it's the soul of your agents
- **Reverse prompt everything** — The system should propose, not just execute. Ask it "what should we do?" more than telling it what to do
- **One brain, two mouths** — Houston speaks to the team; Telegram speaks to David. Same intelligence, different audiences
- **Idle cycles are gold** — When agents have nothing assigned, they should look for things nobody asked about. That's where competitive advantage lives
- **The system should improve itself** — Not just agent instructions, but propose CRM features, workflow changes, and new data sources
- **Close the feedback loops** — A system that doesn't learn from its mistakes is just expensive automation
- **Detect velocity, not just signals** — Acceleration matters more than any single data point
- **Calibrate or it's theater** — Confidence scores mean nothing if they're not validated against reality

---

## 47-Tier Evolution Roadmap Reference

This architecture document describes the foundational 3-tier (Local → QA → Claude) agent system. A 5-round deep audit (60 prompts, March 2026) expanded this into a **47-tier evolution system** that adds:

- **Tiers 0-7 (Plumbing):** Schema fixes, auth, sandbox promotion, pagination, email pipeline, AI testing
- **Tiers 8-15 (Nervous System):** Agent feedback loops, cross-agent learning, calibration, innovation
- **Tiers 16-23 (Brain):** Relationship graphs, temporal intelligence, simulation, market theory, antifragility
- **Tiers 24-35 (Foresight):** Data gap awareness, predictions, proxy signals, calibration, portfolio intelligence
- **Tiers 36-47 (Body):** Agent runtime (PM2), AI Ops dashboard, email (Postmark), notifications (Telegram), RBAC, CI/CD, DR

**Evolution roadmaps:** `docs/plans/2026-03-13-evolution-roadmap*.md` (5 docs, one per round)
**Detailed specs:** `docs/superpowers/specs/2026-03-13-prompts-*.md` and `docs/superpowers/plans/2026-03-13-prompts-*.md`

---

---

## 💰 MONTHLY COST ESTIMATE (Full Fleet)

| Agent | LLM | Cost | Machine |
|-------|-----|------|---------|
| Enricher | Qwen 3.5 (local Ollama) | **Free** | 48GB Mini |
| Researcher | MiniMax 2.5 (local Ollama) | **Free** | 48GB Mini |
| Matcher | Qwen 3.5 (local Ollama) | **Free** | 48GB Mini |
| Scout | MiniMax 2.5 (local Ollama) | **Free** | 64GB Mini |
| Logger | Qwen 3.5 (local Ollama) | **Free** | 64GB Mini |
| GPT Validator | GPT-4 API (cloud) | ~$5-10/mo | 64GB Mini |
| Gemini Validator | Gemini Pro API (cloud) | ~$3-8/mo | 64GB Mini |
| Houston | Claude Opus API (cloud) | ~$15-30/mo | 128GB Studio |
| Analyst | Llama 70B (local Ollama) | **Free** | 128GB Studio |
| **Electricity** | 3 machines 24/7 | ~$15-25/mo | All |
| **TOTAL** | | **~$40-75/month** | |

The big win: 6 out of 9 agents run on FREE local models. You already paid for the hardware — the ongoing cost is just electricity + cloud API calls for the 3 brains that need it (Houston, GPT, Gemini).

---

*Created: March 2026*
*Updated: March 2026 — Added OpenClaw fleet architecture, 3-machine phased setup, fleet Apple ID, Tier 2 as full OpenClaw agents, monthly cost estimate*
*For: IE CRM / Inland Empire Commercial Real Estate*
