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
│  CRM Messaging App (iOS + Web)      Telegram (David only)   │
│  ┌────────────────────┐             ┌──────────────────┐    │
│  │     HOUSTON         │             │   OPS CHANNEL    │    │
│  │                     │             │                  │    │
│  │ Team sees:          │             │ David only:      │    │
│  │ • Deal intel        │             │ • Fleet status   │    │
│  │ • Market briefings  │             │ • Quick approvals│    │
│  │ • Opportunity alerts│             │ • System alerts  │    │
│  │ • Action items      │             │ • Reverse prompts│    │
│  │                     │             │ • CRM proposals  │    │
│  │ David, Dad, Sister, │             │ • Morning brief  │    │
│  │ and team can see    │             │   (full ops ver) │    │
│  └─────────┬───────────┘             └────────┬─────────┘    │
│            │                                  │              │
└────────────┼──────────────────────────────────┼──────────────┘
             │                                  │
             └────────────┬─────────────────────┘
                          ▼
            ┌──────────────────────────┐
            │   CHIEF OF STAFF         │
            │   (Claude Opus — "Houston") │
            │                          │
            │   ONE brain, TWO mouths  │
            │   • Reviews & evaluates  │
            │   • Reverse prompting    │
            │   • CRM proposals        │
            │   • Instruction rewrites │
            └────────────┬─────────────┘
                         │
              ┌──────────┼──────────┐
              ▼                     ▼
        ┌───────────┐        ┌───────────┐
        │  ChatGPT  │        │  Gemini   │
        │  (Ralph)  │        │ (Ralph 2) │
        │ QA every  │        │ Cross-    │
        │ 10 min    │        │ validates │
        └─────┬─────┘        └─────┬─────┘
              │                    │
              └────────┬───────────┘
                       ▼
        ┌──────────────────────────────┐
        │    LOCAL MODELS (OpenClaw)    │
        │    Mac Mini / Mac Studio     │
        │                              │
        │  Enricher  (Qwen 3.5)       │
        │  Researcher (MiniMax 2.5)   │
        │  Matcher   (Qwen 3.5)       │
        │  Logger    (Qwen 3.5)       │
        └──────────────────────────────┘
```

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

**Access:** Read + Write to IE CRM (trusted tier)
**Cost model:** API, token-efficient — only invoked when worth it
**Full spec:** `agent-templates/chief-of-staff.md`

---

### Tier 2 — Operations Managers (Quality Control Layer)
**Agents:** ChatGPT (via OAuth - $250/mo flat) + Gemini
**Role:** "The Ralph Loop" — periodic check-ins on local model work
**Responsibilities:**
- Check local model output every 10–15 minutes
- Validate contact research results before writing to IE CRM
- Review AIR report matching logic and outreach drafts
- Flag anything that looks off or needs Claude's attention
- Escalate high-confidence opportunities up to Claude

**Access:** Read IE CRM + Read/Write to Sandbox DB
**Cost model:** OAuth flat rate (subsidized tokens — no per-token cost)

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

### Agent 4: "The Logger" (either model)
**Primary job:** Daily activity documentation
- Write detailed .md log files every day summarizing:
  - What each agent did
  - How many contacts were enriched
  - What signals were found
  - What outreach was queued
  - What failed or went off track
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
Local agents work 24/7
        ↓
Write detailed logs (.md files)
        ↓
Tier 2 (Ralph Loop) checks every 10-15 min
        ↓
Daily summary pushed to Claude
        ↓
Claude reviews: what worked? what failed? what patterns?
        ↓
Claude rewrites agent instruction files (.md)
        ↓
Local agents run with improved instructions
        ↓
Repeat → system gets smarter over time
```

---

## 🔐 ACCESS & SECURITY

| Agent | IE CRM | Sandbox DB | Internet | Email |
|-------|--------|------------|----------|-------|
| Claude (Tier 1) | Read + Write | Read | No | Approve only |
| ChatGPT/Gemini (Tier 2) | Read | Read + Write | No | Review only |
| Local Models (Tier 3) | Read only | Read + Write | Yes | No |

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

## 🖥️ HARDWARE PLAN

### Mac Mini (Arriving Mar 17-24, 2026) — Primary Agent Runner
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

**Why this matters for AI:**
- 48GB unified memory = GPU has direct access to all RAM (no PCIe bottleneck like x86)
- Both Qwen 3.5 (20B, ~14GB) and MiniMax 2.5 (~8GB) fit simultaneously with ~26GB to spare
- 16-core GPU accelerates inference — tokens/second will be significantly faster than CPU-only
- M4 Pro memory bandwidth: ~273 GB/s — fast model loading, fast inference
- 1TB SSD is plenty for models, logs, and agent memory files

### Mac Studio (Arriving ~Few Months) — Scale-Up Machine
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

**Why this matters for AI:**
- 128GB unified memory = can run the largest open-source models (70B+ parameter)
- 40-core GPU = 2.5x the inference throughput of the Mac Mini
- M4 Max memory bandwidth: ~546 GB/s — nearly double the Mac Mini
- Could run multiple copies of models for true parallel agent processing
- 10Gb Ethernet for faster data transfer if networking to other machines
- 2TB SSD = room for many model variants cached on disk
- Mac Mini becomes backup/secondary or dedicated to a specific agent role

### Resource Budget (Mac Mini — Day One)
| Component | RAM | Notes |
|-----------|-----|-------|
| macOS + system | ~5 GB | Baseline OS |
| Qwen 3.5 (20B) | ~12-14 GB | Enricher, Matcher, Logger |
| MiniMax 2.5 | ~6-8 GB | Researcher |
| OpenClaw instances (x4) | ~1-2 GB | Lightweight Node.js |
| **Free headroom** | **~24-24 GB** | Room for larger models later |

Both models stay loaded. No swapping. All agents run in true parallel from day one.

### Resource Budget (Mac Studio — Scale Up)
| Component | RAM | Notes |
|-----------|-----|-------|
| macOS + system | ~5 GB | Baseline OS |
| Qwen 3.5 full (30B+) | ~20-25 GB | Larger, more capable variant |
| MiniMax 2.5 full | ~10-15 GB | Larger research model |
| **Free headroom** | **~83-93 GB** | Multiple model copies, experimentation |

128GB is massive overkill for the current 4-agent setup — which means you can run larger models, multiple instances, or experiment with additional model families without ever hitting a ceiling.

---

## 📋 MAC MINI SETUP CHECKLIST (Day One)

- [ ] Install OpenClaw
- [ ] Install Ollama (local model runner)
- [ ] Pull Qwen 3.5 (20GB variant) via Ollama
- [ ] Pull MiniMax 2.5 via Ollama
- [ ] Create /AI-Agents/ folder structure
- [ ] Write agent.md for Researcher (MiniMax)
- [ ] Write agent.md for Enricher (Qwen)
- [ ] Connect ChatGPT via OAuth (Tier 2 — Ralph Loop)
- [ ] Set up dedicated email inbox for AIR reports
- [ ] Set up dedicated White Pages account
- [ ] Set up dedicated BeenVerified account
- [ ] Create read-only API endpoints in IE CRM for local agents
- [ ] Set up Sandbox DB (separate Postgres table or local SQLite)
- [ ] Test Researcher: research one company end to end
- [ ] Test Enricher: run one LLC through full verification workflow
- [ ] Set up daily log rotation (.md files)
- [ ] Schedule first Claude review session (end of week 1)

---

## 🎯 PRIORITY ORDER

1. **Contact Verification Workflow** — immediate ROI, feeds every campaign
2. **AIR Report Matching + Outreach** — direct deal flow generation  
3. **Market Intelligence Monitoring** — ongoing signal gathering
4. **Self-improvement loop** — Claude reviewing logs + refining agents
5. **Voice team member on Zoom** — fun project once foundation is solid

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

---

*Created: March 2026*
*For: IE CRM / Inland Empire Commercial Real Estate*
