# AI System Brainstorm Session
## Full Ideas & Concepts from Planning Conversation
### March 2026

---

## 🎯 THE BIG PICTURE

David is building a tiered, hybrid AI system that combines locally-run open-source models (running 24/7 for free) with premium cloud models (Claude, ChatGPT, Gemini) used strategically. The goal is to automate the research-heavy, repetitive work of commercial real estate brokerage in the Inland Empire — freeing David to focus on relationships and closing deals while the system works around the clock.

The full architecture document lives at: `AI Master System/AI_System_Architecture.md`

---

## 🏗️ THE TIERED STRUCTURE

Inspired by Alex Finn's setup on the Moonshots Podcast (#237 — "OpenClaw Explained"):

### Tier 1 — Claude (Chief of Staff / CFO)
- The strategic brain at the top
- Reviews what lower tiers are doing
- Refines agent instructions and workflows
- Makes final judgment calls
- Spot-checks outreach before it sends
- Acts as the self-improvement engine — reads daily logs, rewrites agent instructions

### Tier 2 — ChatGPT + Gemini (Operations Managers)
- The "Ralph Loop" — check in every 10-15 minutes on local model work
- Validate outputs before anything touches IE CRM
- Review outreach drafts for tone and accuracy
- Escalate high-value signals up to Claude
- ChatGPT via OAuth ($250/mo flat, subsidized tokens — not per-token API)

### Tier 3 — Local Open-Source Models (The 24/7 Workforce)
- Run on Mac Mini (arriving ~1 week) and Mac Studio (arriving in a few months)
- **Qwen 3.5** — coding, data processing, structured tasks (spectacular coder)
- **MiniMax 2.5** — internet research, scraping, finding signals (fast at finding things)
- Cost: essentially $0 to run 24/7 once hardware is purchased
- Key insight: "Ambient beats genius" — always-on beats occasionally brilliant

---

## 💡 SPECIFIC USE CASES DISCUSSED

### 1. Contact Verification Workflow (PRIORITY #1)
David's existing manual process, now automated:
- New LLC added → Open Corporates → extract registered person
- Cross-reference White Pages + BeenVerified → match addresses, phones, emails
- If 2+ sources agree → high confidence → NeverBounce email verification
- Write to Sandbox DB with confidence score → Tier 2 approves → push to IE CRM
- **Why it matters:** Feeds every email campaign. Immediate ROI.

### 2. AIR Report → Outreach Matching (PRIORITY #2)
- David forwards daily AIR reports (comps, market activity) to a dedicated inbox
- Local model parses: property size, type, submarket, price
- Queries IE CRM for owners/tenants in matching size range + submarket
- Drafts personalized outreach: "Hey [name], not sure if you saw this but [property] just hit the market..."
- Tier 2 reviews → Claude spot-checks → email sends
- **Why it matters:** Turns market data into same-day deal flow. Market intel loses value fast.
- Deduplication logic needed so same person doesn't get multiple emails about same property

### 3. 24/7 Internet Intelligence Gathering
- Constantly monitor CRE news and Inland Empire market activity
- Follow top real estate accounts on X, surface high-signal tweets
- Scan for company growth signals: hiring sprees, funding rounds, expansions, relocations
- Flag signals that match contacts/companies already in IE CRM
- Write findings to Sandbox DB with confidence score + timestamp

### 4. Database Enrichment (Background, Always Running)
- When new contacts or companies enter IE CRM → auto-enrich with public data
- Standardize formatting, fill missing fields
- Flag anomalies: contact changed companies, property vacant too long, pricing off

### 5. Relationship Mapping
- Analyze interaction history to surface connections
- Flag which contacts know each other, which companies share decision-makers
- Surfaces hidden deal potential David might not see manually

### 6. Lead Scoring
- Score inbound opportunities automatically
- Rank by likelihood of deal based on size, submarket, contact history

### 7. Anomaly Detection
- Flag unusual patterns: contact suddenly changes companies, property vacant longer than expected, pricing that seems off market

### 8. Automated Meeting Prep
- Before a call: pull relevant context from IE CRM
- What was discussed last time, what's happening in their market, open action items
- Delivered as a brief summary before David picks up the phone

### 9. Market Intelligence Summaries
- Pull and aggregate data on comps, absorption rates, lease rates over time
- Specific to submarkets David is actively tracking
- Daily or weekly briefing format

---

## 🧠 THE SELF-IMPROVEMENT LOOP

This is what makes the system get smarter over time rather than staying static:

```
Local agents work 24/7
        ↓
Write detailed .md log files daily
(not just "found contact" — full detail: "checked Open Corporates, found John Smith,
address matched White Pages, email confirmed NeverBounce")
        ↓
Tier 2 validates outputs periodically
        ↓
Claude reviews daily logs
        ↓
Claude asks: what worked? what failed? what patterns?
        ↓
Claude rewrites agent instruction files (.md)
        ↓
Local agents run with improved instructions
        ↓
Repeat → system compounds over time
```

---

## 🗂️ THE SANDBOX SAFETY LAYER

- Local models NEVER write directly to IE CRM
- They write to a separate Sandbox DB (separate Postgres table or local SQLite)
- Tier 2 validates before anything gets promoted to IE CRM
- Claude has a duplicate "work folder" it can also read/write
- Only clean, approved data makes it into production
- This protects IE CRM from noise, errors, and runaway agent behavior

---

## 🔐 ACCOUNT & ACCESS STRATEGY

- Local models get **dedicated accounts** for each service (not David's personal accounts)
  - Separate White Pages account
  - Separate BeenVerified account
  - Dedicated email inbox for AIR reports
- IE CRM exposes **read-only API endpoints** for local models
- API keys scoped per agent — can revoke individually if something goes wrong
- Local > VPS for security: local hardware is secure by default, VPS is exposed by default

---

## 🎙️ VOICE TEAM MEMBER (FUTURE PROJECT)

- Idea: have a local model with voice capability sit on Zoom calls with David, his dad, and sister
- Listens to the conversation, chimes in with ideas, connections, relevant data from IE CRM
- Would need: speech-to-text (local), LLM processing, text-to-speech output
- Key challenge: prompt engineering so it knows WHEN to speak up, not just constantly interrupting
- David uses Claude voice and finds it excellent — goal is something that feels that natural
- **Hold this until the foundation is solid first**

---

## 🔑 KEY INSIGHTS FROM ALEX FINN (Moonshots Podcast #237)

- **His setup:** 1 Mac Mini + 3 Mac Studios (512GB each), running Qwen 3.5 + MiniMax 2.5
- **His org structure:** Himself → Henry (Claude Opus, chief of staff) → Ralph (ChatGPT, engineering manager) → local models (workers)
- **The Ralph Loop:** ChatGPT checks every 10 minutes to make sure local models are on track. Doesn't cost many tokens. Keeps everything from going off the rails.
- **OAuth vs API:** He uses ChatGPT via OAuth ($250/mo flat) not API (pay-per-token) — gets subsidized tokens
- **Why Opus:** Only model that "feels human" to him. Says things like "damn straight." Won't switch even though Anthropic discourages OpenClaw use.
- **Memory = markdown files:** OpenClaw is just .md files on your computer. That's it.
- **Separate OpenClaw instances for separate roles:** Don't make one agent wear multiple hats — give researcher and developer separate instances with separate memory and context
- **Sub-agents vs separate instances:** Sub-agents = same OpenClaw wearing different hats. Separate instances = completely different memory, skills, context. Use separate instances for distinct roles.
- **Software factory model:** 5 OpenClaw instances working together autonomously to build and improve software. Qwen codes 24/7, MiniMax researches 24/7.
- **The business opportunity:** "CRM for a very specific niche = $5M company overnight." David is already building this.
- **Local > VPS:** Speed, customization, scalability, security — local wins on every metric
- **48GB Mac Mini can run:** Qwen 3.5 (20B) + MiniMax 2.5 both loaded simultaneously — no time-slicing needed

---

## 📋 HARDWARE PLAN

| Device | Timing | Role |
|--------|--------|------|
| Mac Mini (48GB) | ~1 week | Full agent fleet — all 4 agents, both models in parallel |
| Mac Studio (128GB) | Few months | Scale up — larger model variants, parallel instances |

48GB is enough to run both models hot in memory. All 4 agents from day one. Mac Studio adds room for larger models and experimentation.

---

## 🚀 PRIORITY ORDER FOR IMPLEMENTATION

1. **Contact Verification Workflow** — automates David's existing manual research process
2. **AIR Report → Outreach Matching** — turns daily market data into deal flow
3. **24/7 Market Intelligence** — ongoing signal gathering from web + X
4. **Self-improvement loop** — Claude reading logs and refining agent instructions
5. **Relationship mapping + anomaly detection** — deeper CRM intelligence
6. **Meeting prep automation** — context briefs before calls
7. **Voice Zoom team member** — future fun project

---

## 🧩 HOW THIS CONNECTS TO IE CRM

- IE CRM is the source of truth — all verified data lives there
- Local models get **read-only API access** to query properties, contacts, companies
- Nothing writes to IE CRM until it's been validated through the Sandbox → Tier 2 → approval pipeline
- Claude is already being built into IE CRM as a "14th team member" always listening
- Consider routing that IE CRM chat listener through local models first (they flag, Claude responds) to save Claude API tokens
- IE CRM backend on Railway/Neon = the data layer the whole system runs on top of

---

## 📁 FILES IN THIS FOLDER

- `AI_System_Architecture.md` — Full technical architecture, agent roster, workflows, setup checklist
- `AI_Brainstorm_Session_March2026.md` — This file. All ideas, context, and concepts from the planning session.

---

## 🎬 NEXT STEPS BEFORE MAC MINI ARRIVES

1. Watch Alex Finn's top 5 OpenClaw how-to videos (linked in Moonshots #237 show notes)
2. Decide on Sandbox DB approach (separate Postgres table in Neon, or local SQLite on Mac Mini)
3. Draft the first `agent.md` instruction files for Researcher and Enricher
4. Set up dedicated email inbox for AIR reports
5. Create dedicated accounts for White Pages + BeenVerified
6. Plan IE CRM read-only API endpoints needed by local agents
7. Have a focused Claude Code session to design those API endpoints

---

*Session date: March 2026*
*Context: Planning conversation between David and Claude ahead of Mac Mini arrival*
