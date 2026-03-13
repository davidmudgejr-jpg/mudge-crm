# Agent Orchestration & Process Management
## How Agents Run, Recover, and Stay Alive on macOS
### IE CRM AI Master System

---

## Overview

Every agent in this system is a **separate OpenClaw instance** — its own process with its own memory, instruction files, and model assignment. They need to:

1. Start automatically when the Mac Mini boots
2. Stay running 24/7 without babysitting
3. Recover from crashes without losing work
4. Not compete for resources on a 48GB machine
5. Be individually controllable (start, stop, restart one agent without touching others)

This document covers the full stack: from macOS process management to resource allocation to the supervisor that watches everything.

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────┐
│  macOS LaunchAgent                                  │
│  (auto-starts on login, restarts on crash)          │
│  └── agent-supervisor.py                            │
│      ├── Enricher (OpenClaw + Qwen 3.5)             │
│      ├── Researcher (OpenClaw + MiniMax 2.5)        │
│      ├── Matcher (OpenClaw + Qwen 3.5 or MiniMax)   │
│      ├── Scout (OpenClaw + MiniMax 2.5)             │
│      ├── Logger (OpenClaw + lightweight)             │
│      └── Tier 2 Scheduler (Ralph Loop cron)         │
├─────────────────────────────────────────────────────┤
│  Ollama (model server)                              │
│  (also runs as LaunchAgent, serves models via API)  │
├─────────────────────────────────────────────────────┤
│  macOS                                              │
│  (Mac Mini 48GB → later Mac Studio 128GB)            │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1: Ollama (Model Server)

Ollama is the foundation — it serves LLM models via a local HTTP API. It must be running before any agent can work.

### Setup
```bash
# Install Ollama
brew install ollama

# Pull models
ollama pull qwen3.5:20b       # Enricher + Matcher (coding/structured tasks)
ollama pull minimax2.5         # Researcher (internet research)
```

### Ollama as LaunchAgent
Create a LaunchAgent so Ollama starts automatically on login and stays running.

**File:** `~/Library/LaunchAgents/com.ollama.serve.plist`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.ollama.serve</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/ollama</string>
    <string>serve</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/ollama-stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/ollama-stderr.log</string>
</dict>
</plist>
```

```bash
# Load it
launchctl load ~/Library/LaunchAgents/com.ollama.serve.plist
```

### Resource Reality: Mac Mini M4 Pro (48GB Unified Memory)

**Exact specs:** M4 Pro, 12-core CPU, 16-core GPU, 16-core Neural Engine, 48GB unified memory, 1TB SSD, Gigabit Ethernet. Arrives Mar 17-24, 2026.

Apple Silicon unified memory is key — the GPU can access all 48GB directly (no PCIe bus bottleneck). LLM inference on Ollama uses the GPU cores, so the 16-core GPU will push tokens significantly faster than CPU-only inference. M4 Pro memory bandwidth is ~273 GB/s.

| Component | RAM Usage | Notes |
|-----------|-----------|-------|
| macOS + system | ~5 GB | Baseline OS overhead |
| Qwen 3.5 (20B) | ~12-14 GB | Enricher, Matcher, Logger |
| MiniMax 2.5 | ~6-8 GB | Researcher |
| OpenClaw instances (x5) | ~1-2 GB total | Lightweight Node.js processes |
| **Available headroom** | **~19-24 GB** | Room for larger models or experimentation |

**Both models stay loaded simultaneously.** No time-slicing. No model swap delays. All 4 agents run 24/7 at full speed from day one.

### Model Strategy (48GB Mac Mini)

```
Qwen 3.5 (20B):   Always loaded — serves Enricher, Matcher, and Logger
MiniMax 2.5:       Always loaded — serves Researcher
Both models hot:   ~20-22 GB combined
Remaining RAM:     ~21-23 GB for OS, OpenClaw instances, and headroom
GPU acceleration:  16-core GPU handles inference — expect 30-50+ tokens/sec on 20B model
```

The 24GB of headroom also means you could experiment with a third smaller model (e.g., a fast 7B model for the Logger, freeing Qwen for heavier tasks) without any resource pressure.

### Mac Studio M4 Max (128GB Unified Memory) — Scale-Up Machine

**Exact specs:** M4 Max, 16-core CPU, 40-core GPU, 16-core Neural Engine, 128GB unified memory, 2TB SSD, 10Gb Ethernet.

```
128GB unified memory + 40-core GPU + ~546 GB/s memory bandwidth
= a completely different class of machine
```

| Component | RAM Usage | Notes |
|-----------|-----------|-------|
| macOS + system | ~5 GB | Baseline OS |
| Qwen 3.5 full (30B+) | ~20-25 GB | Larger, more capable variant |
| MiniMax 2.5 full | ~10-15 GB | Larger research model |
| **Available headroom** | **~83-93 GB** | Massive room for expansion |

What 128GB + 40-core GPU unlocks:
- **70B+ parameter models** — could run Llama 3 70B or Qwen 72B for dramatically better reasoning
- **Multiple model copies** — 2x Qwen instances for parallel enrichment (double throughput)
- **2.5x inference speed** — 40 GPU cores vs 16 = proportionally faster token generation
- **10Gb Ethernet** — if you network the Mac Mini and Studio together, they can share workloads
- **2TB SSD** — cache many model variants on disk, swap between them instantly
- Mac Mini becomes backup/secondary or dedicated to a specific agent role (e.g., always-on Researcher)

---

## Layer 2: The Supervisor (`agent-supervisor.py`)

A Python script that manages all agent processes. It's the single process that macOS keeps alive — everything else is a child of the supervisor.

### Responsibilities
1. **Start agents** — launch each OpenClaw instance with the right config
2. **Monitor health** — check heartbeats, detect hangs, detect crashes
3. **Restart on failure** — if an agent dies, restart it with exponential backoff
4. **Resource awareness** — don't start all agents simultaneously (stagger startup)
5. **Graceful shutdown** — on SIGTERM, shut down agents cleanly before exiting
6. **Status reporting** — expose a simple local API or file for checking system status
7. **Schedule Tier 2** — trigger the Ralph Loop every 10 minutes
8. **Schedule Tier 1** — trigger Claude's daily review at 6 AM

### Supervisor Config File

**File:** `/AI-Agents/supervisor-config.json`
```json
{
  "agents": [
    {
      "name": "enricher",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/enricher",
      "model": "qwen3.5:20b",
      "startup_delay_seconds": 0,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 300,
        "same_task_threshold_seconds": 1800
      },
      "schedule": {
        "type": "continuous",
        "active_hours": null
      }
    },
    {
      "name": "researcher",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/researcher",
      "model": "minimax2.5",
      "startup_delay_seconds": 30,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 300,
        "same_task_threshold_seconds": 3600
      },
      "schedule": {
        "type": "continuous",
        "active_hours": null
      }
    },
    {
      "name": "matcher",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/matcher",
      "model": "qwen3.5:20b",
      "startup_delay_seconds": 60,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 300,
        "same_task_threshold_seconds": 1800
      },
      "schedule": {
        "type": "continuous",
        "active_hours": null
      }
    },
    {
      "name": "scout",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/scout",
      "model": "minimax2.5",
      "startup_delay_seconds": 90,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 600,
        "same_task_threshold_seconds": 3600
      },
      "schedule": {
        "type": "continuous",
        "active_hours": null
      }
    },
    {
      "name": "logger",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/logger",
      "model": "qwen3.5:20b",
      "startup_delay_seconds": 120,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 600,
        "same_task_threshold_seconds": 7200
      },
      "schedule": {
        "type": "continuous",
        "active_hours": null
      }
    }
  ],
  "tier2": {
    "enabled": false,
    "cycle_minutes": 10,
    "provider": "chatgpt",
    "notes": "Disabled until Phase 2. David is the manual Ralph Loop in Phase 1."
  },
  "tier1": {
    "enabled": false,
    "daily_review_time": "06:00",
    "provider": "claude",
    "notes": "Disabled until Phase 3. Daily review triggered manually at first."
  },
  "global": {
    "stagger_startup": true,
    "startup_order": ["enricher", "researcher", "matcher", "scout", "logger"],
    "ollama_health_check_url": "http://localhost:11434/api/tags",
    "crm_health_check_url": "https://your-railway-app.up.railway.app/api/ai/health",
    "log_dir": "/AI-Agents/supervisor-logs",
    "status_file": "/AI-Agents/supervisor-status.json"
  },
  "pricing": {
    "anthropic/opus-4.6":    { "input_per_1m": 15.00, "output_per_1m": 75.00 },
    "anthropic/sonnet-4.6":  { "input_per_1m": 3.00,  "output_per_1m": 15.00 },
    "anthropic/haiku-4.5":   { "input_per_1m": 0.80,  "output_per_1m": 4.00 },
    "openai/gpt-4o":         { "input_per_1m": 2.50,  "output_per_1m": 10.00 },
    "openai/gpt-4o-mini":    { "input_per_1m": 0.15,  "output_per_1m": 0.60 },
    "google/gemini-flash":   { "input_per_1m": 0.30,  "output_per_1m": 1.20 },
    "google/gemini-pro":     { "input_per_1m": 1.25,  "output_per_1m": 5.00 },
    "ollama/*":              { "input_per_1m": 0.00,  "output_per_1m": 0.00 },
    "_default":              { "input_per_1m": 1.00,  "output_per_1m": 3.00 }
  }
}
```

### Supervisor Core Logic (Pseudocode)

```python
class AgentSupervisor:

    def start(self):
        """Main entry point — called by LaunchAgent on boot."""
        self.verify_ollama_running()
        self.verify_crm_reachable()
        self.stagger_start_agents()
        self.run_monitoring_loop()

    def stagger_start_agents(self):
        """Start agents one at a time with delays to avoid RAM spike."""
        for agent in config.agents:
            if agent.enabled:
                sleep(agent.startup_delay_seconds)
                self.start_agent(agent)

    def start_agent(self, agent):
        """Launch one OpenClaw instance as a subprocess."""
        process = subprocess.Popen(
            ["openclaw", "--dir", agent.openclaw_dir, "--model", agent.model],
            stdout=log_file,
            stderr=log_file
        )
        self.processes[agent.name] = {
            "process": process,
            "pid": process.pid,
            "started_at": now(),
            "restart_count": 0
        }
        log(f"Started {agent.name} (PID {process.pid})")

    def run_monitoring_loop(self):
        """Every 60 seconds, check all agents."""
        while True:
            for agent_name, state in self.processes.items():
                self.check_agent_health(agent_name, state)
            self.check_tier2_schedule()
            self.check_tier1_schedule()
            self.write_status_file()
            self.expire_old_priorities()
            sleep(60)

    def check_agent_health(self, name, state):
        """Detect crashes and hangs."""
        process = state["process"]

        # 1. Check if process is still alive
        if process.poll() is not None:
            log(f"CRASH DETECTED: {name} (exit code {process.returncode})")
            self.restart_agent(name)
            return

        # 2. Check heartbeat staleness
        heartbeat = query_db(
            "SELECT updated_at, current_task FROM agent_heartbeats WHERE agent_name = %s",
            name
        )
        if heartbeat:
            age = now() - heartbeat.updated_at
            config = self.get_agent_config(name)

            # Heartbeat too old = agent is probably hung
            if age.seconds > config.hang_detection.heartbeat_stale_threshold_seconds:
                log(f"HANG DETECTED: {name} — no heartbeat for {age.seconds}s")
                self.kill_and_restart(name)
                return

            # Same task for too long = agent is stuck
            if same_task_for(heartbeat, config.hang_detection.same_task_threshold_seconds):
                log(f"STUCK DETECTED: {name} — same task for too long: {heartbeat.current_task}")
                self.kill_and_restart(name)
                return

    def restart_agent(self, name):
        """Restart with exponential backoff."""
        state = self.processes[name]
        config = self.get_agent_config(name)

        if state["restart_count"] >= config.max_restart_attempts:
            log(f"MAX RESTARTS REACHED: {name} — giving up, alerting David")
            self.alert_david(name, "Agent has crashed too many times. Manual intervention needed.")
            return

        backoff = config.restart_backoff_seconds[state["restart_count"]]
        log(f"Restarting {name} in {backoff}s (attempt {state['restart_count'] + 1})")
        sleep(backoff)
        self.start_agent(config)
        state["restart_count"] += 1

    def kill_and_restart(self, name):
        """Force kill a hung agent, then restart."""
        process = self.processes[name]["process"]
        process.terminate()
        try:
            process.wait(timeout=10)
        except TimeoutExpired:
            process.kill()
        self.restart_agent(name)

    def alert_david(self, agent_name, message):
        """Write an alert that shows up in the Agent Dashboard."""
        post_to_api("/api/ai/agent/log", {
            "agent_name": "supervisor",
            "log_type": "error",
            "content": f"ALERT: {agent_name} — {message}",
            "metrics": {"alert": True, "agent": agent_name}
        })
        # Future: push notification, SMS, or email

    def expire_old_priorities(self):
        """Mark expired priority board items (runs every cycle)."""
        query_db("""
            UPDATE agent_priority_board
            SET status = 'expired'
            WHERE status = 'pending'
            AND expires_at < NOW()
        """)

    def write_status_file(self):
        """Write current system status to a JSON file for quick checking."""
        status = {
            "timestamp": now().isoformat(),
            "ollama": "running" if ollama_healthy() else "down",
            "crm_api": "reachable" if crm_healthy() else "unreachable",
            "agents": {}
        }
        for name, state in self.processes.items():
            status["agents"][name] = {
                "pid": state["pid"],
                "status": "running" if state["process"].poll() is None else "stopped",
                "uptime_seconds": (now() - state["started_at"]).seconds,
                "restart_count": state["restart_count"]
            }
        write_json("/AI-Agents/supervisor-status.json", status)
```

### Supervisor as LaunchAgent

**File:** `~/Library/LaunchAgents/com.iecrm.agent-supervisor.plist`
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.iecrm.agent-supervisor</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/python3</string>
    <string>/AI-Agents/supervisor/agent-supervisor.py</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>WorkingDirectory</key>
  <string>/AI-Agents</string>
  <key>StandardOutPath</key>
  <string>/AI-Agents/supervisor-logs/stdout.log</string>
  <key>StandardErrorPath</key>
  <string>/AI-Agents/supervisor-logs/stderr.log</string>
  <!-- Wait for network before starting (agents need Neon Postgres) -->
  <key>Sockets</key>
  <dict/>
</dict>
</plist>
```

---

## Layer 3: CLI Control Tool

A simple command-line tool for David (or Claude) to manage agents without touching launchctl.

**File:** `/AI-Agents/supervisor/agentctl`

```bash
Usage:
  agentctl status                    # Show all agent statuses
  agentctl start <agent>             # Start a specific agent
  agentctl stop <agent>              # Gracefully stop an agent
  agentctl restart <agent>           # Restart an agent
  agentctl logs <agent> [--tail]     # View agent logs
  agentctl pause <agent>             # Pause (stop without restart)
  agentctl resume <agent>            # Resume a paused agent
  agentctl health                    # Full system health check
  agentctl config                    # Show current supervisor config
```

### Example: `agentctl status`
```
AI Agent Fleet — Status
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ollama:       ● Running (2 models loaded)
CRM API:      ● Reachable (latency: 45ms)
Supervisor:   ● Running (uptime: 3d 14h 22m)

Agent         Model          Status     Uptime      Restarts  Today
────────────  ─────────────  ─────────  ──────────  ────────  ─────
enricher      qwen3.5:20b    ● Running  3d 14h 22m  0         47 items
researcher    minimax2.5     ● Running  3d 14h 21m  1         156 scans
matcher       qwen3.5:20b    ● Running  3d 14h 20m  0         12 drafts
logger        qwen3.5:20b    ● Running  3d 14h 19m  0         —

Priority Board: 3 pending | 12 completed today | 0 expired
Sandbox Queue:  8 pending review | 34 approved today
```

---

## Startup Sequence (What Happens When Mac Mini Boots)

```
1. macOS boots → user auto-login (configure in System Settings)
     ↓
2. LaunchAgent starts Ollama
     ↓ (wait ~10 seconds for Ollama to be ready)
3. LaunchAgent starts agent-supervisor.py
     ↓
4. Supervisor checks: is Ollama responding? (retry up to 30 seconds)
     ↓
5. Supervisor checks: is Neon Postgres reachable? (retry up to 60 seconds)
     ↓ (if unreachable, start agents in "offline mode" — queue to disk)
6. Supervisor starts agents with staggered delays:
     t=0s:   enricher starts
     t=30s:  researcher starts
     t=60s:  matcher starts
     t=90s:  logger starts
     ↓
7. Each agent: loads its agent.md, connects to Ollama, sends first heartbeat
     ↓
8. System is fully operational (~2-3 minutes after boot)
```

### Auto-Login Configuration
The Mac Mini should auto-login to a dedicated user account:
- **System Settings → Users & Groups → Login Options → Automatic Login**
- Use a dedicated `ai-agent` user account (not David's personal account)
- This account has access to `/AI-Agents/` and network, nothing else
- Lock the screen after login if needed (agents don't need the GUI)

---

## Hang Detection Deep Dive

Crashes are easy to detect (process exits). Hangs are harder. The supervisor uses two signals:

### Signal 1: Stale Heartbeat
Each agent sends a heartbeat every 60 seconds. If no heartbeat for 5 minutes (300 seconds), the agent is probably hung.

**But:** An agent might be doing a legitimate long-running task (large file download, complex research). So we don't kill immediately — we check Signal 2 first.

### Signal 2: Stuck Task
If the heartbeat's `current_task` field hasn't changed in 30 minutes (1800 seconds for most agents), the agent is stuck in a loop.

**Combined logic:**
```
IF heartbeat is stale (>5 min) AND last known task hasn't changed (>30 min):
    → Kill and restart
ELIF heartbeat is stale (>5 min) BUT task was recently different:
    → Wait one more cycle, then restart if still stale
ELIF heartbeat is fresh BUT task hasn't changed (>60 min):
    → Log a warning but don't restart yet (might be a long task)
    → If same task for >2 hours, restart
```

### Agent Crash Restart Backoff
When an agent crashes, don't immediately restart — it might crash again in a loop:

```
Attempt 1: wait 10 seconds, restart
Attempt 2: wait 30 seconds, restart
Attempt 3: wait 60 seconds, restart
Attempt 4: wait 2 minutes, restart
Attempt 5: wait 5 minutes, restart
Attempt 6: GIVE UP — alert David via Agent Dashboard
```

Reset the restart counter when an agent runs successfully for >10 minutes.

---

## Graceful Shutdown Protocol

When the Mac Mini is shutting down (or David runs `agentctl stop`):

```
1. Supervisor receives SIGTERM
     ↓
2. Supervisor sends SIGTERM to all agent processes
     ↓
3. Each agent: finish current task (or checkpoint), send final heartbeat with status "offline"
     ↓
4. Wait up to 30 seconds for agents to exit cleanly
     ↓
5. If any agent hasn't exited: SIGKILL
     ↓
6. Supervisor writes final status file and exits
```

Agents should be designed to handle SIGTERM gracefully:
- If mid-task: save progress to a checkpoint file
- On restart: check for checkpoint file and resume instead of starting over
- Send heartbeat with status "offline" so the Dashboard shows correct state

---

## Offline Mode (Network Loss)

If the CRM API (Neon Postgres) becomes unreachable:

### Detection
- Supervisor health check fails for CRM API
- Agents' API calls start returning connection errors

### Behavior
1. **Researcher:** Continues gathering signals, writes to local disk buffer (`/AI-Agents/offline-buffer/signals/`)
2. **Enricher:** Pauses — can't read from CRM to know what to enrich. Logs idle state.
3. **Matcher:** Pauses — can't query CRM for matches. Logs idle state.
4. **Logger:** Continues logging to local `.md` files (doesn't need the API)

### Recovery
When network returns:
1. Supervisor detects CRM API is reachable again
2. Flush offline buffer: push buffered signals/logs to the API
3. Resume paused agents
4. Log the outage duration and any buffered items

### Local Buffer Format
```
/AI-Agents/offline-buffer/
  signals/
    2026-03-15T14:30:00Z_researcher.json
    2026-03-15T14:35:00Z_researcher.json
  logs/
    2026-03-15T14:30:00Z_enricher.json
  heartbeats/
    (don't buffer — just resume when back online)
```

---

## Tier 2 Scheduling (Ralph Loop)

The Tier 2 validator runs on a 10-minute cycle. It's NOT a persistent OpenClaw instance — it's an API call that runs and completes.

### Phase 1 (No Tier 2 — David is the Ralph Loop)
- Supervisor has `tier2.enabled = false`
- David manually reviews the sandbox queue in the Agent Dashboard
- This is intentional — David needs to understand what good/bad agent output looks like before automating the check

### Phase 2 (Automated Ralph Loop)
- Supervisor spawns a Tier 2 review every 10 minutes
- Implementation: API call to ChatGPT (via OAuth) with:
  - The Tier 2 validator instructions (from `tier2-validator.md`)
  - The current pending sandbox queue
  - Recent heartbeats
- ChatGPT processes the queue and posts approve/reject/escalate decisions
- Results written to sandbox tables and agent_logs

### Tier 2 Cron (Inside Supervisor)
```python
def check_tier2_schedule(self):
    if not config.tier2.enabled:
        return
    if minutes_since_last_tier2_run() >= config.tier2.cycle_minutes:
        self.run_tier2_cycle()

def run_tier2_cycle(self):
    pending = fetch("/api/ai/queue/pending")
    if not pending:
        return  # nothing to review, skip this cycle

    # Build the prompt with tier2-validator.md instructions + pending items
    prompt = build_tier2_prompt(pending)

    # Call ChatGPT via OAuth
    response = chatgpt_api.complete(prompt)

    # Parse and apply decisions
    apply_tier2_decisions(response)
```

---

## Tier 1 Scheduling (Claude Daily Review)

### Phase 1-2 (Manual)
- David triggers Claude review manually when ready
- Can be done through IE CRM's Claude panel or a dedicated script

### Phase 3+ (Automated — Council Briefing)
- Supervisor triggers at 6 AM daily
- Implementation: **3-phase council briefing** via Anthropic API:

**Phase 1 — Lead Analyst (Opus):**
  - Reads daily logs, escalations, agent instruction versions, system health
  - Produces draft briefing with scored recommendations (impact, confidence, effort)

**Phase 2 — Council Review (3× Sonnet, parallel via `asyncio.gather()`):**
  - DealHunter: "What opportunities are we missing?"
  - RevenueGuardian: "What actually closes this month?"
  - MarketSkeptic: "What's wrong with this data?"
  - Each reviews draft, outputs: support/revise/reject per recommendation + up to 2 new recommendations

**Phase 3 — Reconciliation (Opus):**
  - Merges all reviews, produces final ranked briefing
  - Ranking: `priority = (impact × 0.4) + (confidence × 0.35) + ((100 - effort) × 0.25)`
  - Disagreements noted in output

**Failure modes:** Retry once per reviewer; if 2+ fail, fall back to single-pass briefing.
**Cost:** ~$0.20-0.40/day ($6-12/month)
**Full spec:** `docs/superpowers/specs/2026-03-13-ai-system-enhancements-design.md`

Council reviewer prompts stored in `/AI-Agents/chief-of-staff/council/`:
```
/AI-Agents/chief-of-staff/council/
├── deal-hunter.md
├── revenue-guardian.md
└── market-skeptic.md
```

---

## Folder Structure on Mac Mini

```
/AI-Agents/
├── supervisor/
│   ├── agent-supervisor.py        # Main supervisor script
│   ├── agentctl                   # CLI control tool
│   └── requirements.txt          # Python dependencies
├── supervisor-config.json         # Agent configuration
├── supervisor-status.json         # Current status (written every 60s)
├── supervisor-logs/               # Supervisor's own logs
│   ├── stdout.log
│   ├── stderr.log
│   └── restarts.log
├── enricher/
│   ├── agent.md                   # Instructions (from repo)
│   ├── pre-filter-rules.json     # Stage 0 filter configuration
│   ├── memory/                    # Agent's persistent memory
│   ├── logs/                      # Per-agent daily logs
│   ├── versions/                  # Backed-up previous agent.md versions
│   └── checkpoint.json            # Resume state after crash (if applicable)
├── researcher/
│   ├── agent.md
│   ├── memory/
│   ├── logs/
│   ├── versions/
│   └── checkpoint.json
├── matcher/
│   ├── agent.md
│   ├── memory/
│   ├── logs/
│   └── versions/
├── scout/
│   ├── agent.md
│   ├── memory/
│   ├── logs/
│   └── versions/
├── logger/
│   ├── agent.md
│   ├── memory/
│   └── logs/
├── chief-of-staff/
│   ├── council/                  # Council reviewer prompts
│   │   ├── deal-hunter.md
│   │   ├── revenue-guardian.md
│   │   └── market-skeptic.md
│   └── ...
├── daily-logs/                    # Logger writes daily summaries here
│   ├── 2026-03-10.md
│   ├── 2026-03-11.md
│   └── ...
├── shared/                       # Shared utilities used by all agents
│   ├── cost-tracker.py           # Per-call LLM cost tracking
│   └── audit-log.py              # Structured JSONL audit logging
├── logs/
│   ├── audit/                    # JSONL audit logs (one file per day)
│   │   ├── 2026-03-25.jsonl
│   │   └── ...
│   └── council/                  # Council briefing traces
│       ├── 2026-03-25.json
│       └── ...
├── offline-buffer/                # Buffered data during network outages
│   ├── signals/
│   └── logs/
└── launchagents/                  # LaunchAgent plist files (symlinked)
    ├── com.ollama.serve.plist
    └── com.iecrm.agent-supervisor.plist
```

---

## What Gets Pulled from GitHub vs. Created Locally

| From GitHub (pull on Mac Mini) | Created Locally (not in repo) |
|-------------------------------|-------------------------------|
| `agent-templates/*.md` → copy to `/AI-Agents/*/agent.md` | `/AI-Agents/*/memory/` (agent memory files) |
| `supervisor/agent-supervisor.py` | `supervisor-status.json` (runtime state) |
| `supervisor/agentctl` | `supervisor-logs/` (runtime logs) |
| `supervisor-config.json` (template) | `*/logs/` (agent daily logs) |
| `ORCHESTRATION.md` (this doc) | `offline-buffer/` (network outage buffer) |
| `COORDINATION.md` | `*/checkpoint.json` (crash recovery state) |
| `ARCHITECTURE.md` | `*/versions/` (backed up old agent.md files) |
| `shared/cost-tracker.py` and `shared/audit-log.py` | `logs/audit/` (JSONL audit log files) |
| `enricher/pre-filter-rules.json` (template) | `logs/council/` (council briefing traces) |
| `chief-of-staff/council/*.md` (reviewer prompts) | API keys, connection strings (in env vars) |
| LaunchAgent plist templates | |

---

## Day One Setup Script

A single script that sets up everything on a fresh Mac Mini:

```bash
#!/bin/bash
# setup-ai-agents.sh — Run this once on the Mac Mini

echo "=== IE CRM AI Agent Fleet — Day One Setup ==="

# 1. Install dependencies
echo "Installing Ollama..."
brew install ollama

echo "Installing Python dependencies..."
pip3 install -r /AI-Agents/supervisor/requirements.txt

# 2. Pull models
echo "Pulling Qwen 3.5 (this will take a while)..."
ollama pull qwen3.5:20b

echo "Pulling MiniMax 2.5..."
ollama pull minimax2.5

# 3. Create folder structure
echo "Creating folder structure..."
mkdir -p /AI-Agents/{enricher,researcher,matcher,logger}/{memory,logs,versions}
mkdir -p /AI-Agents/{daily-logs,offline-buffer/{signals,logs},supervisor-logs}
mkdir -p /AI-Agents/{shared,logs/{audit,council}}
mkdir -p /AI-Agents/chief-of-staff/council

# 4. Copy agent templates from repo
echo "Deploying agent instruction files..."
cp ai-system/agent-templates/enricher.md /AI-Agents/enricher/agent.md
cp ai-system/agent-templates/researcher.md /AI-Agents/researcher/agent.md
cp ai-system/agent-templates/matcher.md /AI-Agents/matcher/agent.md
cp ai-system/agent-templates/logger.md /AI-Agents/logger/agent.md

# 4b. Deploy shared utilities
echo "Deploying shared utilities..."
cp ai-system/shared/cost-tracker.py /AI-Agents/shared/cost-tracker.py
cp ai-system/shared/audit-log.py /AI-Agents/shared/audit-log.py
cp ai-system/enricher/pre-filter-rules.json /AI-Agents/enricher/pre-filter-rules.json
cp ai-system/chief-of-staff/council/*.md /AI-Agents/chief-of-staff/council/

# 5. Install LaunchAgents
echo "Installing LaunchAgents..."
cp ai-system/launchagents/*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.ollama.serve.plist
launchctl load ~/Library/LaunchAgents/com.iecrm.agent-supervisor.plist

# 6. Verify
echo "Verifying setup..."
sleep 5
agentctl health

echo "=== Setup complete! ==="
```

---

## Monitoring from IE CRM (Remote)

David isn't sitting at the Mac Mini. He's on his laptop or phone. The Agent Dashboard in IE CRM shows:

- Agent status (from heartbeats table — written by agents to Neon Postgres)
- Supervisor status (supervisor writes to agent_logs table periodically)
- If the Mac Mini goes completely offline, heartbeats go stale → Dashboard shows "offline"

**The Mac Mini doesn't need a monitor, keyboard, or mouse after setup.** It's a headless server. Everything is observable through the IE CRM web interface or SSH.

---

## Fleet Split Strategy (Mac Mini + Mac Studio)

When the Mac Studio arrives, the fleet should be split across both machines for maximum performance. Each machine has a clear role.

### Phase 1: Mac Mini Only (Day One — Weeks 1-8+)

```
Mac Mini (48GB M4 Pro)
├── Ollama serving: Qwen 3.5 (20B) + MiniMax 2.5
├── OpenClaw: Enricher (Qwen)
├── OpenClaw: Researcher (MiniMax)
├── OpenClaw: Matcher (Qwen)
├── OpenClaw: Logger (Qwen)
└── Supervisor process
```

All 4 agents, both models, one machine. Both models stay loaded in memory simultaneously. No swapping needed — 48GB handles this comfortably with ~24GB headroom.

### Phase 2: Mac Studio Arrives — Recommended Split

**Strategy: Studio = Precision, Mini = Volume**

The Mac Studio's 128GB and 40-core GPU unlocks dramatically smarter models. Use that horsepower where accuracy matters most — contact verification and outreach matching. The Mac Mini handles volume work where speed matters more than raw intelligence.

```
Mac Studio (128GB M4 Max) — "The Precision Machine"
├── Ollama serving: Qwen 72B (~45GB) — dramatically smarter than 20B
├── OpenClaw: Enricher (Qwen 72B) — contact verification needs highest accuracy
├── OpenClaw: Matcher (Qwen 72B) — outreach matching needs nuance and judgment
├── Supervisor instance (primary)
└── Headroom: ~70GB free — room for experimentation, larger models, parallel instances

Mac Mini (48GB M4 Pro) — "The Volume Machine"
├── Ollama serving: MiniMax 2.5 + Qwen 3.5 (20B)
├── OpenClaw: Researcher (MiniMax 2.5) — volume scanning, speed over precision
├── OpenClaw: Scout (MiniMax 2.5) — AI/tech intelligence, shares model with Researcher
├── OpenClaw: Logger (Qwen 3.5 20B) — lightweight, doesn't need 72B intelligence
├── Supervisor instance (secondary — reports to primary)
└── Headroom: ~24GB — can add more Researcher instances for parallel scanning
```

### Why This Split

| Factor | Mac Studio | Mac Mini |
|--------|-----------|----------|
| **Model size** | Qwen 72B (~45GB) — 3.6x more parameters = dramatically better reasoning | Qwen 20B + MiniMax 2.5 — good enough for scanning and logging |
| **GPU cores** | 40 — faster inference on large models | 16 — fine for smaller models |
| **Memory bandwidth** | ~546 GB/s — fast token generation even on 72B | ~273 GB/s — half the speed |
| **Critical tasks** | Enrichment (accuracy = money) + Matching (judgment = deal quality) | Research (volume = coverage) + Logging (lightweight) |
| **Inference speed** | Qwen 72B at ~15-25 tok/s (still fast enough for enrichment) | MiniMax at ~40-60 tok/s (speed matters for scanning) |

### Cross-Machine Communication

Both machines talk to the same backend:

```
Mac Studio ──┐
             ├──→ Neon Postgres (IE CRM database)
Mac Mini  ───┘    Railway (IE CRM API)
                  Priority Board (same table)
                  Sandbox DB (same tables)
```

Agents don't need to know which machine the other agents are on. They communicate through the Priority Board — same as before. The Researcher (Mini) posts a priority, the Enricher (Studio) picks it up. No direct machine-to-machine communication needed.

### Alternative Splits (For Different Needs)

**If you want maximum enrichment throughput:**
```
Mac Studio: 2x Enricher instances (both using Qwen 72B) — double the contact verification speed
Mac Mini: Researcher + Matcher + Logger
```

**If you want to experiment with new models:**
```
Mac Studio: Enricher + Matcher (production — Qwen 72B)
Mac Mini: Researcher + Logger (production — MiniMax + Qwen 20B)
           + Experimental model testing (use the 24GB headroom)
```

**If one machine goes down:**
Either machine can run the full fleet solo at reduced performance. The supervisor detects the outage and can redistribute agents. Mac Mini becomes the fallback for everything — models are smaller but the fleet stays alive.

### Migration Procedure (Mini → Studio Split)

```
1. Set up Mac Studio (same setup script as Mac Mini)
2. Pull Qwen 72B on Mac Studio via Ollama (this is a large download — plan ahead)
3. Test: run Enricher on Studio pointing at Qwen 72B, verify output quality
4. Compare: is Qwen 72B producing better enrichment than Qwen 20B?
5. If yes: migrate Enricher + Matcher to Studio permanently
6. Update supervisor-config.json on both machines
7. Mac Mini supervisor switches to "secondary" mode
8. Monitor for 48 hours — verify cross-machine Priority Board works
9. Done — fleet is split
```

---

## Parallel Sub-Agent Spawning (Research Pattern)

When the Researcher agent needs to investigate a topic, company, or market signal, it should **spawn parallel sub-searches** across multiple sources instead of searching sequentially. This dramatically reduces research time and improves coverage.

### Pattern: Fan-Out / Fan-In

```
Researcher receives task: "Research [Company X] growth signals"
        ↓
SPAWN IN PARALLEL (via sub-agent threads or async tasks):
  ├── Sub-agent 1: County records / Open Corporates (LLC filings, recent registrations)
  ├── Sub-agent 2: Commercial listings (LoopNet, CoStar mentions, CREXi)
  ├── Sub-agent 3: News / press releases (Google News, industry publications)
  ├── Sub-agent 4: Social signals (X/Twitter, LinkedIn job postings)
  └── Sub-agent 5: CRM cross-reference (existing contacts, properties, past interactions)
        ↓
WAIT for all to complete (timeout: 5 minutes per sub-search)
        ↓
MERGE results into a single research report:
  - Executive summary
  - Key findings per source (with confidence + freshness)
  - Signals that corroborate across sources (higher confidence)
  - Gaps / sources that returned nothing
  - Recommended follow-up actions
        ↓
Write to sandbox_signals with combined confidence score
```

### Implementation Options

**Option A: OpenClaw Sub-Agents (Preferred)**
Each sub-search runs as a lightweight OpenClaw sub-agent within the Researcher's context. OpenClaw supports spawning child tasks that share the parent's memory but run independently.

**Option B: Python Async Tasks**
If sub-agents aren't practical, the supervisor can spawn parallel Python async tasks:
```python
import asyncio

async def research_company(company_name):
    tasks = [
        search_county_records(company_name),
        search_commercial_listings(company_name),
        search_news(company_name),
        search_social(company_name),
        search_crm(company_name),
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return merge_research_results(results)
```

**Option C: Priority Board Coordination**
The Researcher posts 5 priority items (one per source) to the priority board. If multiple Researcher instances exist (Mac Studio era), they can each pick up a sub-search. Results merge when all complete.

### Timeout & Fallback Rules

- Each sub-search has a 5-minute timeout
- If a source times out, mark it as "unavailable" in the report — don't block the whole research
- If 3+ sources return data, generate the report even if some failed
- If only 1 source returns data, flag as "low coverage — needs manual follow-up"

### When to Use Parallel Search

| Trigger | Sources to Spawn |
|---------|-----------------|
| New company added to CRM | All 5 sources |
| AIR report received | Listings + CRM cross-ref + News |
| Growth signal detected | Social + News + CRM cross-ref |
| Contact verification request | County records + White Pages + BeenVerified |
| Nightly coverage scan | CRM gaps + News + Social |

---

## Nightly Self-Maintenance Cron

Inspired by battle-tested autonomous agent deployments. A nightly cron handles system hygiene automatically.

### Schedule

```
3:00 AM  — Rebuild embedding/search indexes (when semantic search is active)
3:30 AM  — Run data retention cleanup (see OPERATIONS.md #9)
4:00 AM  — Check for Ollama model updates (pull latest if available)
4:15 AM  — Restart Ollama to clear memory fragmentation
4:30 AM  — Backup configs to private Git repo (sanitized — see OPERATIONS.md #11)
5:00 AM  — Generate overnight performance report:
             - Items processed per agent
             - Error rate per agent
             - Average confidence scores
             - API call counts per service
5:15 AM  — Sync daily cost aggregates from JSONL audit log to Postgres ai_usage_tracking table
5:30 AM  — Write performance report to agent_logs (available for Claude's 6 AM review)
```

### Supervisor Cron Implementation

```python
def check_nightly_schedule(self):
    """Run nightly maintenance tasks based on time."""
    hour = datetime.now().hour
    minute = datetime.now().minute

    if hour == 3 and minute == 0 and not self.ran_today('rebuild_indexes'):
        self.rebuild_search_indexes()
        self.mark_ran_today('rebuild_indexes')

    if hour == 3 and minute == 30 and not self.ran_today('data_cleanup'):
        self.run_data_retention_cleanup()
        self.mark_ran_today('data_cleanup')

    if hour == 4 and minute == 0 and not self.ran_today('model_update'):
        self.check_model_updates()
        self.mark_ran_today('model_update')

    if hour == 4 and minute == 30 and not self.ran_today('config_backup'):
        self.backup_configs_to_git()
        self.mark_ran_today('config_backup')

    if hour == 5 and minute == 0 and not self.ran_today('perf_report'):
        self.generate_overnight_report()
        self.mark_ran_today('perf_report')
```

---

*Created: March 2026*
*Updated: March 2026 — Added fleet split strategy for Mac Mini + Mac Studio*
*Updated: March 2026 — Added parallel sub-agent spawning, nightly self-maintenance cron*
*Updated: March 2026 — Added council briefing, cost tracking, audit logging, pre-filter config*
*For: IE CRM AI Master System — Process Management & Orchestration*
