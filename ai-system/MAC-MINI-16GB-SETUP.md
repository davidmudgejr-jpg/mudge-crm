# 16GB Mac Mini Setup Guide — Agent Command Center
## IE CRM AI Master System
**Machine Role:** Cloud AI Command Center (Houston CEO + Ralph Loop)
**Last Updated:** March 22, 2026

---

## WHAT THIS MACHINE DOES

This 16GB Mac Mini is the **command center** for your AI fleet. It runs two cloud-based AI instances 24/7:

1. **Houston CEO** (Claude Opus 4.6 via OAuth) — The strategic brain. Analyzes your CRM database, spots patterns, identifies deals, writes morning briefings, and continuously improves the system.

2. **Ralph** (ChatGPT via OAuth) — The quality gate. Every 10 minutes, checks what the local AI workers have submitted and approves/rejects their work before it touches your CRM.

This machine does NOT run local AI models (not enough RAM). It only makes API calls to Claude and ChatGPT, which use minimal resources.

---

## WHAT THIS MACHINE IS NOT

- It is NOT your personal work computer
- It does NOT share an iCloud account with your work Mac
- It does NOT run local AI models (Qwen, MiniMax) — those go on the 48GB+ machines
- It does NOT have direct write access to your production CRM tables — it goes through the API

---

## STEP 1: INITIAL MAC SETUP

### 1A. Create a Separate Apple ID
- Create a new Apple ID: something like `agents@industrialmudgies.com` or `ai-fleet@yourdomain.com`
- This iCloud account will be shared across ALL agent machines (16GB, 48GB, 64GB, 128GB)
- Sign into this Apple ID on the Mac Mini

### 1B. Enable iCloud Desktop & Documents Sync
- System Settings → Apple ID → iCloud → iCloud Drive → turn ON
- Enable "Desktop & Documents Folders"
- This is how all agent machines share memory files with each other

### 1C. Basic Setup
- Name the machine something identifiable: "AI-Command-Center" or "Agent-HQ"
- Enable Remote Login (System Settings → General → Sharing → Remote Login) so you can SSH in from your work Mac
- Enable Screen Sharing if you want to VNC in
- Set to never sleep (System Settings → Energy → Prevent automatic sleeping)
- Turn off screen saver

---

## STEP 2: CREATE THE AGENT FOLDER STRUCTURE

Open Terminal and run:

```bash
mkdir -p ~/Desktop/AI-Agents/{chief-of-staff/{memory,council,versions},ralph/{memory},enricher/{memory,versions},researcher/{memory,versions},matcher/{memory,versions},scout/{memory,versions},campaign-manager/{memory,versions},logger/{memory},shared,daily-logs,logs/council}
```

This creates:
```
~/Desktop/AI-Agents/
├── chief-of-staff/     ← Houston CEO (THIS machine)
│   ├── memory/         ← Persistent memory files
│   ├── council/        ← Council reviewer prompts
│   └── versions/       ← Instruction version history
├── ralph/              ← Ralph Loop (THIS machine)
│   └── memory/
├── enricher/           ← Enricher (48GB machine, later)
│   ├── memory/
│   └── versions/
├── researcher/         ← Researcher (48GB machine, later)
│   ├── memory/
│   └── versions/
├── matcher/            ← Matcher (48GB machine, later)
│   ├── memory/
│   └── versions/
├── scout/              ← Scout (64GB machine, later)
│   ├── memory/
│   └── versions/
├── campaign-manager/   ← Campaign Manager (future)
│   ├── memory/
│   └── versions/
├── logger/             ← Logger (runs alongside other agents)
│   └── memory/
├── shared/             ← Config files all agents read
├── daily-logs/         ← Daily summary logs
└── logs/
    └── council/        ← Council review traces
```

Because iCloud Desktop sync is ON, this entire folder structure syncs across all machines using the same agent iCloud account.

---

## STEP 3: COPY AGENT INSTRUCTION FILES

Copy these files from your CRM repo to the agent folders:

```bash
# You'll need to transfer these from your work Mac
# Option 1: AirDrop them
# Option 2: Download from GitHub
# Option 3: SCP from your work Mac

# Once you have the ai-system folder, copy:
cp ai-system/agent-templates/chief-of-staff.md ~/Desktop/AI-Agents/chief-of-staff/agent.md
cp ai-system/agent-templates/tier2-validator.md ~/Desktop/AI-Agents/ralph/agent.md
cp ai-system/agent-templates/enricher.md ~/Desktop/AI-Agents/enricher/agent.md
cp ai-system/agent-templates/researcher.md ~/Desktop/AI-Agents/researcher/agent.md
cp ai-system/agent-templates/matcher.md ~/Desktop/AI-Agents/matcher/agent.md
cp ai-system/agent-templates/scout.md ~/Desktop/AI-Agents/scout/agent.md
cp ai-system/agent-templates/logger.md ~/Desktop/AI-Agents/logger/agent.md
```

---

## STEP 4: CREATE SHARED CONFIG

Create `~/Desktop/AI-Agents/shared/crm-connection.md`:

```markdown
# CRM Connection Details

## API Base URL
https://mudge-crm-production.up.railway.app

## Endpoints Available

### Authentication
All requests require an API key in the header:
`X-Agent-Key: [your-agent-api-key]`

### Read Endpoints (All agents)
- GET /api/ai/contacts?search=name&city=Ontario&type=Owner
- GET /api/ai/properties?city=Fontana&type=Industrial&min_sf=10000&max_sf=50000
- GET /api/ai/companies?search=name&city=Corona
- GET /api/ai/comps?city=Ontario&type=lease&min_sf=5000

### Sandbox Write (Tier 3 agents)
- POST /api/ai/sandbox/contact — submit researched contact
- POST /api/ai/sandbox/enrichment — submit enrichment for existing contact
- POST /api/ai/sandbox/signal — submit market intelligence signal
- POST /api/ai/sandbox/outreach — submit draft outreach email

### Operations (All agents)
- POST /api/ai/agent/heartbeat — report status
- POST /api/ai/agent/log — write log entry
- GET /api/ai/queue/pending — items awaiting review
- POST /api/ai/queue/approve/:id — approve sandbox item
- POST /api/ai/queue/reject/:id — reject with feedback

### Chat (Houston CEO only)
- POST /api/chat/houston-post — post message to Team Chat as Houston
- GET /api/chat/messages/:channelId — read recent chat messages

## Database Stats (for context)
- ~10,000 properties (Inland Empire industrial focus)
- ~9,000 contacts
- ~19,000 companies
- ~4,000 comps (lease + sale)
- Active deals tracked with full pipeline
- TPE scoring engine ranks properties by transaction probability
```

Create `~/Desktop/AI-Agents/shared/system-overview.md`:

```markdown
# AI Master System — Overview for All Agents

## Who We Are
Leanne Associates — a small family industrial real estate brokerage in the Inland Empire, CA.
- David Mudge Jr (Broker, system builder)
- Dave Sr (David's dad, Broker)
- Sarah (David's sister, Broker)

## Our CRM: IE CRM (Mission Control)
Web app at ie-crm.vercel.app. Backend on Railway. Database on Neon PostgreSQL.
10,000+ industrial properties, 9,000 contacts, 19,000 companies.

## The AI Organization

### Tier 1 — Houston CEO (Claude Opus 4.6)
- Strategic brain. Reviews everything. Improves the system.
- Runs on: 16GB Mac Mini (command center)
- Posts morning briefings to Team Chat
- Rewrites agent instructions based on performance data
- The only AI that can write directly to production CRM

### Tier 2 — Ralph (ChatGPT via OAuth)
- Quality gate. Checks local model work every 10 minutes.
- Runs on: 16GB Mac Mini (command center)
- Approves/rejects sandbox submissions
- Escalates uncertain items to Houston CEO

### Tier 3 — Local Models (Qwen 3.5 + MiniMax 2.5)
- The 24/7 workforce. Research, enrich, match, scout.
- Runs on: 48GB Mac Mini (arriving next week)
- NEVER writes directly to production CRM
- All output goes to Sandbox tables for Tier 2 review

## The Safety Layer
Local models write to Sandbox → Ralph validates → Houston CEO spot-checks → Approved data promoted to CRM.
Nothing touches the production database without going through this pipeline.

## Key Markets
Ontario, Fontana, Rancho Cucamonga, Riverside, San Bernardino, Corona, Eastvale, Chino, Pomona, Jurupa Valley, Perris, Moreno Valley, Redlands, Highland, Colton, Rialto, Upland, Montclair

## Property Focus
Industrial: warehouses, distribution centers, manufacturing, flex space
Size range: 1,000 SF to 2,000,000+ SF
```

---

## STEP 5: INSTALL OPENCLAW

### 5A. Install Prerequisites
```bash
# Install Homebrew (if not already)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Install Git
brew install git
```

### 5B. Install OpenClaw
Follow the OpenClaw installation guide at: https://github.com/anthropics/claude-code
(or wherever the current OpenClaw install docs are)

```bash
# Install Claude Code (OpenClaw)
npm install -g @anthropic-ai/claude-code
```

### 5C. Create Separate Anthropic Account for Houston CEO
1. Go to console.anthropic.com
2. Create a NEW account (not David's personal account)
3. Subscribe to Claude Pro or Max (for OAuth access to Opus 4.6)
4. This account is ONLY for Houston CEO — keep it separate

### 5D. Create Separate OpenAI Account for Ralph
1. Go to chat.openai.com
2. Create a NEW account
3. Subscribe to ChatGPT Plus or Team ($25/mo)
4. This account is ONLY for Ralph

---

## STEP 6: LAUNCH HOUSTON CEO

### 6A. Start the First OpenClaw Instance
```bash
cd ~/Desktop/AI-Agents/chief-of-staff
claude
```

### 6B. Houston CEO's First Instructions
When OpenClaw starts, give it context by pointing it to the agent.md file:

"Read agent.md — that's your instruction set. You are Houston, the Chief of Staff of our AI fleet. Read shared/system-overview.md and shared/crm-connection.md for context about our CRM and how to connect to it. Your job is to analyze our CRM database 24/7, spot patterns, identify deal opportunities, write morning briefings, and continuously improve our system. Start by connecting to the CRM API and giving me a summary of what you see."

### 6C. What Houston CEO Should Be Doing 24/7

**Every Morning (6 AM):**
- Read overnight agent logs (once Tier 3 is running)
- Query CRM for pipeline changes, new data, anomalies
- Write morning briefing → post to Team Chat via API
- Generate 2-3 strategic recommendations

**Continuously:**
- Scan for deal velocity (companies with multiple recent signals)
- Identify lease expirations approaching in 6-18 months
- Cross-reference contacts with properties (who owns what near whom)
- Look for patterns humans would miss (correlated data points across entities)
- Store insights in memory/ folder for persistent context
- Monitor system health (once Tier 3 is running)

**Weekly (Friday):**
- Deep performance review of agent fleet
- CRM improvement proposals
- Confidence score calibration check
- Council review (adversarial analysis of own recommendations)

---

## STEP 7: LAUNCH RALPH

### 7A. Start the Second OpenClaw Instance (New Terminal Window)
```bash
cd ~/Desktop/AI-Agents/ralph
# Launch with ChatGPT OAuth (follow OpenClaw docs for ChatGPT provider)
claude --provider openai
```

### 7B. Ralph's First Instructions
"Read agent.md — that's your instruction set. You are Ralph, the Tier 2 quality gate. Every 10 minutes, check the CRM sandbox tables for new submissions from local agents. Validate each item against your rules and approve, reject, or escalate. Read shared/crm-connection.md for API details."

### 7C. What Ralph Does Every 10 Minutes
1. Check agent heartbeats (are all agents alive?)
2. Pull pending sandbox items
3. Validate each item against rules in agent.md
4. Approve good items → they get promoted to production CRM
5. Reject bad items → feedback stored for agent learning
6. Escalate uncertain items → Houston CEO reviews
7. Log all decisions

**Note:** Ralph won't have much to do until Tier 3 agents are running on the 48GB machine. For now, he'll mostly be idle. That's fine — he's ready when the workers come online.

---

## STEP 8: VERIFY EVERYTHING WORKS

### Test 1: Houston CEO Can Read CRM
Ask Houston CEO: "How many properties do we have in Ontario?"
Expected: He calls the CRM API and returns the count.

### Test 2: Houston CEO Can Post to Team Chat
Ask Houston CEO: "Post a test message to the Team Chat saying 'Houston CEO is online and monitoring.'"
Expected: Message appears in Team Chat in the CRM.

### Test 3: Houston CEO Stores Memory
Ask Houston CEO: "Remember that we're focusing on industrial properties in Fontana and Corona this quarter."
Expected: He writes this to memory/ folder.

### Test 4: Ralph Can Check Sandbox
Ask Ralph: "Check the sandbox for any pending items."
Expected: He calls the API and reports (likely empty for now).

---

## WHAT HAPPENS WHEN THE 48GB MAC MINI ARRIVES (Next Week)

1. Sign into the SAME agent iCloud account on the 48GB machine
2. Wait for iCloud to sync the AI-Agents folder
3. Install Ollama on the 48GB machine
4. Pull Qwen 3.5 and MiniMax 2.5 models
5. Launch Enricher and Researcher OpenClaw instances
6. They read their agent.md instructions (already synced via iCloud)
7. They start working — writing to Sandbox via the CRM API
8. Ralph (on THIS 16GB machine) starts reviewing their work every 10 minutes
9. Houston CEO (on THIS 16GB machine) monitors everything and writes briefings

The 16GB command center stays running. The 48GB becomes the workhorse.

---

## MONITORING FROM YOUR WORK MAC

You do NOT need to sit at the Mac Mini to monitor the agents. Everything is visible through:

1. **IE CRM Agent Dashboard** (browser) — agent status, approval queue, logs
2. **Team Chat** — Houston CEO posts briefings and insights here
3. **SSH** — `ssh ai-command-center.local` from your work Mac
4. **Screen Sharing** — VNC into the Mac Mini if needed
5. **Future: Telegram** — private ops alerts directly to your phone

---

## COST BREAKDOWN

| Service | Cost | Notes |
|---------|------|-------|
| Claude Max (Opus OAuth) | $100/mo | Houston CEO's brain |
| ChatGPT Plus (Ralph OAuth) | $25/mo | Ralph's brain |
| Electricity | ~$5/mo | Mac Mini uses ~15W idle |
| iCloud+ | $3/mo | Shared agent storage |
| **Total** | **~$133/mo** | For 24/7 strategic AI oversight |

---

## SECURITY NOTES

- Agent API keys are scoped — each agent only has access to what it needs
- Houston CEO is the only AI with production CRM write access
- Local models (Tier 3) can only write to Sandbox tables
- All agent actions are logged in agent_logs table
- If an agent goes rogue, revoke its API key from CRM Settings page
- The Mac Mini should be on your home/office network, not exposed to the internet
- Keep macOS updated for security patches

---

## TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| OpenClaw disconnects | Check internet. Restart the instance. |
| Houston CEO can't reach CRM | Check Railway is running. Verify API URL. |
| Ralph has nothing to review | Normal — Tier 3 agents aren't running yet. |
| iCloud not syncing | Check iCloud settings. Force sync in Finder. |
| Mac Mini goes to sleep | System Settings → Energy → Never sleep. |
| High memory usage | Shouldn't happen with cloud-only instances. Restart if >8GB used. |

---

*Created: March 22, 2026*
*For: IE CRM AI Master System — 16GB Mac Mini Command Center*
*Next: 48GB Mac Mini setup guide when hardware arrives*
