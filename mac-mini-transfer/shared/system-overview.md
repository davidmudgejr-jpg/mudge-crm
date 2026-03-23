# AI Master System — Overview
## For All Agents Running on This Machine

### Who We Are
**Leanne Associates** — a small family industrial real estate brokerage in the Inland Empire, California.

**The Team:**
- **David Mudge Jr** — Broker, system builder, runs the AI fleet
- **Dave Sr** — David's dad, Broker, veteran of the IE market
- **Sarah** — David's sister, Broker

### Our CRM: IE CRM (Mission Control)
- Web app: https://ie-crm.vercel.app
- Backend API: https://mudge-crm-production.up.railway.app
- Database: Neon PostgreSQL (cloud)
- 10,000+ industrial properties
- 9,000+ contacts
- 19,000+ companies
- 4,000+ comps (lease + sale)
- TPE scoring engine ranks properties by transaction probability
- Houston AI assistant built into Team Chat

### The AI Organization

```
TIER 1 — Houston CEO (Claude Opus 4.6)
  Strategic brain. Reviews everything. Improves the system.
  Machine: 16GB Mac Mini (THIS machine)
      │
      ├── Posts morning briefings to Team Chat
      ├── Rewrites agent instructions based on performance
      ├── Identifies deal opportunities from data patterns
      └── The only AI with production CRM write access
      │
TIER 2 — Ralph (ChatGPT via OAuth)
  Quality gate. Checks Tier 3 work every 10 minutes.
  Machine: 16GB Mac Mini (THIS machine)
      │
      ├── Approves/rejects sandbox submissions
      ├── Escalates uncertain items to Houston CEO
      └── Prevents bad data from reaching production CRM
      │
TIER 3 — Local Models (Qwen 3.5 + MiniMax 2.5)
  The 24/7 workforce. Research, enrich, match, scout.
  Machine: 48GB Mac Mini (arriving next week)
      │
      ├── Enricher — Contact verification (Open Corporates → White Pages → BeenVerified → NeverBounce)
      ├── Researcher — Internet intelligence gathering (news, X, market signals)
      ├── Matcher — AIR report parsing → outreach matching → email drafting
      ├── Scout — AI/tech intelligence + competitive monitoring
      └── Logger — Daily logs, performance tracking, Hot 10 list
```

### The Safety Pipeline
```
Local models work 24/7
        ↓
Write to Sandbox tables (NEVER production)
        ↓
Ralph validates every 10 minutes
        ↓
Houston CEO spot-checks daily
        ↓
Approved data promoted to production CRM
        ↓
Rejected data logged with feedback for agent learning
```

### Key Markets
Ontario, Fontana, Rancho Cucamonga, Riverside, San Bernardino, Corona, Eastvale, Chino, Pomona, Jurupa Valley, Perris, Moreno Valley, Redlands, Highland, Colton, Rialto, Upland, Montclair

### Property Focus
Industrial: warehouses, distribution centers, manufacturing, flex space
Size range: 1,000 SF to 2,000,000+ SF
Typical deal: 5,000-100,000 SF industrial lease or sale in the IE

### The Goal
Automate the research-heavy, repetitive work of CRE brokerage. Free the team to focus on relationships and closing deals while the AI system works 24/7 finding opportunities, verifying contacts, and generating outreach.
