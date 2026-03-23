# Agent Orchestration & Process Management
## How Agents Run, Recover, and Stay Alive on macOS
### IE CRM AI Master System

---

## Overview

Every agent in this system is a **separate OpenClaw instance** — its own process with its own memory, instruction files, model assignment, and Telegram bot. They need to:

1. Start automatically when each Mac boots
2. Stay running 24/7 without babysitting
3. Recover from crashes without losing work
4. Not compete for resources on their host machine
5. Be individually controllable (start, stop, restart one agent without touching others)

**The fleet runs across 3 machines** (arriving in phases):
- **Mac Mini 48GB** — "The Starter" — Tier 3 worker agents (arrives first)
- **Mac Mini 64GB** — "The Specialist" — Tier 2 QA validators + support agents (arrives second)
- **Mac Studio 128GB** — "The Beast" — Houston (Commander) + premium models (arrives third)

This document covers the full stack: from macOS process management to resource allocation to the supervisor that watches everything across the fleet.

---

## Architecture Layers

```
┌─── MAC MINI 48GB "The Starter" ─────────────────────┐
│  macOS LaunchAgent                                   │
│  └── agent-supervisor.py                             │
│      ├── Enricher  (OpenClaw + Qwen 3.5 local)      │
│      ├── Researcher(OpenClaw + MiniMax 2.5 local)    │
│      └── Matcher   (OpenClaw + Qwen 3.5 local)      │
│  Ollama (serves Qwen 3.5 + MiniMax 2.5)             │
└──────────────────────────────────────────────────────┘

┌─── MAC MINI 64GB "The Specialist" ──────────────────┐
│  macOS LaunchAgent                                   │
│  └── agent-supervisor.py                             │
│      ├── Scout         (OpenClaw + MiniMax 2.5 local)│
│      ├── Logger        (OpenClaw + Qwen 3.5 local)   │
│      ├── GPT Validator (OpenClaw + GPT-4 API cloud)  │
│      └── Gemini Valid. (OpenClaw + Gemini API cloud)  │
│  Ollama (serves Qwen 3.5 + MiniMax 2.5)             │
└──────────────────────────────────────────────────────┘

┌─── MAC STUDIO 128GB "The Beast" ────────────────────┐
│  macOS LaunchAgent                                   │
│  └── agent-supervisor.py                             │
│      ├── Houston   (OpenClaw + Claude Opus API cloud)│
│      └── Analyst   (OpenClaw + Llama 70B local)      │
│  Ollama (serves Llama 70B + Qwen 3.5 + more)        │
└──────────────────────────────────────────────────────┘

All 3 machines connect to:
  → Neon Postgres (shared CRM database)
  → Priority Board (shared coordination table)
  → Sandbox DB (shared sandbox tables)
  → No direct machine-to-machine communication needed
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

### Resource Reality: 3-Machine Fleet

Apple Silicon unified memory is key — the GPU can access all RAM directly (no PCIe bus bottleneck). LLM inference on Ollama uses the GPU cores, pushing tokens significantly faster than CPU-only inference.

**All 3 machines use the same Fleet Apple ID** (separate from David's personal Apple ID). See ARCHITECTURE.md for full Apple ID strategy.

#### Mac Mini 48GB — "The Starter" (Arrives First)

**Specs:** M4 Pro, 12-core CPU, 16-core GPU, 48GB unified memory, 1TB SSD, Gigabit Ethernet. ~273 GB/s bandwidth.

**Role:** Tier 3 worker agents — Enricher, Researcher, Matcher

| Component | RAM Usage | Notes |
|-----------|-----------|-------|
| macOS + system | ~5 GB | Baseline OS overhead |
| Qwen 3.5 (20B) | ~12-14 GB | Enricher, Matcher (shared model) |
| MiniMax 2.5 | ~6-8 GB | Researcher |
| OpenClaw instances (x3) | ~1-2 GB total | ~300-600MB each |
| **Available headroom** | **~19-26 GB** | Room for larger models or experimentation |

Both models stay loaded simultaneously. No time-slicing. No model swap delays.

#### Mac Mini 64GB — "The Specialist" (Arrives Second)

**Specs:** M4 Pro, 12-core CPU, 16-core GPU, 64GB unified memory, 1TB SSD, Gigabit Ethernet. ~273 GB/s bandwidth.

**Role:** Tier 2 QA validators (GPT + Gemini) + Scout + Logger

| Component | RAM Usage | Notes |
|-----------|-----------|-------|
| macOS + system | ~5 GB | Baseline OS overhead |
| Qwen 3.5 (20B) | ~12-14 GB | Logger (local) |
| MiniMax 2.5 | ~6-8 GB | Scout (local) |
| OpenClaw instances (x4) | ~1.5-2.5 GB | GPT/Gemini validators use cloud APIs — minimal local RAM |
| **Available headroom** | **~34-40 GB** | Room for a 30B+ specialist model |

GPT Validator and Gemini Validator use cloud APIs (GPT-4, Gemini Pro), so they barely touch local RAM. The 64GB gives massive headroom for future specialist models.

#### Mac Studio 128GB — "The Beast" (Arrives Third)

**Specs:** M4 Max, 16-core CPU, 40-core GPU, 128GB unified memory, 2TB SSD, 10Gb Ethernet. ~546 GB/s bandwidth.

**Role:** Houston (Commander / Chief of Staff) + premium large model inference

| Component | RAM Usage | Notes |
|-----------|-----------|-------|
| macOS + system | ~8 GB | Baseline OS |
| Llama 3 70B (Q4) | ~36 GB | Premium local analysis |
| Qwen 3.5 (20B) | ~14 GB | Backup / secondary tasks |
| OpenClaw instances (x2) | ~1 GB | Houston uses cloud API — lightweight locally |
| **Available headroom** | **~69 GB** | Massive room for experimentation |

What 128GB + 40-core GPU unlocks:
- **70B+ parameter models** — dramatically better reasoning than 20B
- **2.5x inference speed** — 40 GPU cores vs 16
- **2TB SSD** — cache many model variants on disk
- Houston + premium analysis on the most powerful machine

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

### Supervisor Config Files

Each machine has its own `supervisor-config.json` with only the agents that run on that machine. All machines share the same pricing config and CRM health check URL.

**File:** `/AI-Agents/supervisor-config.json` — Mac Mini 48GB "The Starter"
```json
{
  "machine": {
    "name": "starter",
    "role": "Tier 3 Workers",
    "hardware": "Mac Mini M4 Pro 48GB"
  },
  "agents": [
    {
      "name": "enricher",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/enricher",
      "openclaw_port": 3001,
      "model": "qwen3.5:20b",
      "model_provider": "ollama_local",
      "telegram_bot": "@IE_Enricher_bot",
      "startup_delay_seconds": 0,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 300,
        "same_task_threshold_seconds": 1800
      }
    },
    {
      "name": "researcher",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/researcher",
      "openclaw_port": 3002,
      "model": "minimax2.5",
      "model_provider": "ollama_local",
      "telegram_bot": "@IE_Researcher_bot",
      "startup_delay_seconds": 30,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 300,
        "same_task_threshold_seconds": 3600
      }
    },
    {
      "name": "matcher",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/matcher",
      "openclaw_port": 3003,
      "model": "qwen3.5:20b",
      "model_provider": "ollama_local",
      "telegram_bot": "@IE_Matcher_bot",
      "startup_delay_seconds": 60,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 300,
        "same_task_threshold_seconds": 1800
      }
    }
  ],
  "global": {
    "stagger_startup": true,
    "startup_order": ["enricher", "researcher", "matcher"],
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

**File:** `/AI-Agents/supervisor-config.json` — Mac Mini 64GB "The Specialist"
```json
{
  "machine": {
    "name": "specialist",
    "role": "Tier 2 QA + Support Agents",
    "hardware": "Mac Mini M4 Pro 64GB"
  },
  "agents": [
    {
      "name": "scout",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/scout",
      "openclaw_port": 3001,
      "model": "minimax2.5",
      "model_provider": "ollama_local",
      "telegram_bot": "@IE_Scout_bot",
      "startup_delay_seconds": 0,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 600,
        "same_task_threshold_seconds": 3600
      }
    },
    {
      "name": "logger",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/logger",
      "openclaw_port": 3002,
      "model": "qwen3.5:20b",
      "model_provider": "ollama_local",
      "telegram_bot": "@IE_Logger_bot",
      "startup_delay_seconds": 30,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 600,
        "same_task_threshold_seconds": 7200
      }
    },
    {
      "name": "gpt_validator",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/gpt-validator",
      "openclaw_port": 3003,
      "model": "gpt-4o",
      "model_provider": "openai_api",
      "telegram_bot": "@IE_GPT_Val_bot",
      "startup_delay_seconds": 60,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 300,
        "same_task_threshold_seconds": 1800
      },
      "tier2_config": {
        "cycle_minutes": 10,
        "role": "qa_validator",
        "notes": "Full OpenClaw instance with persistent memory — remembers validation patterns"
      }
    },
    {
      "name": "gemini_validator",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/gemini-validator",
      "openclaw_port": 3004,
      "model": "gemini-pro",
      "model_provider": "google_api",
      "telegram_bot": "@IE_Gemini_Val_bot",
      "startup_delay_seconds": 90,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 300,
        "same_task_threshold_seconds": 1800
      },
      "tier2_config": {
        "cycle_minutes": 10,
        "role": "qa_validator",
        "notes": "Cross-validates alongside GPT Validator — different perspective, different LLM"
      }
    }
  ],
  "cron_jobs": [
    {
      "job_name": "security_audit",
      "agent": "scout",
      "schedule": "15 3 * * *",
      "timeout_minutes": 30,
      "priority": "high",
      "description": "4-perspective security audit of entire system"
    }
  ],
  "global": {
    "stagger_startup": true,
    "startup_order": ["scout", "logger", "gpt_validator", "gemini_validator"],
    "ollama_health_check_url": "http://localhost:11434/api/tags",
    "crm_health_check_url": "https://your-railway-app.up.railway.app/api/ai/health",
    "log_dir": "/AI-Agents/supervisor-logs",
    "status_file": "/AI-Agents/supervisor-status.json"
  }
}
```

**File:** `/AI-Agents/supervisor-config.json` — Mac Studio 128GB "The Beast"
```json
{
  "machine": {
    "name": "beast",
    "role": "Commander + Premium Analysis",
    "hardware": "Mac Studio M4 Max 128GB"
  },
  "agents": [
    {
      "name": "houston",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/chief-of-staff",
      "openclaw_port": 3001,
      "model": "claude-opus-4-6",
      "model_provider": "anthropic_api",
      "telegram_bot": "@IE_Houston_bot",
      "startup_delay_seconds": 0,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 600,
        "same_task_threshold_seconds": 3600
      },
      "tier1_config": {
        "daily_review_time": "06:00",
        "council_briefing": true,
        "dual_channel_output": true,
        "notes": "Commander — delegates to all agents, runs council briefings, morning Telegram briefings"
      }
    },
    {
      "name": "analyst",
      "enabled": true,
      "openclaw_dir": "/AI-Agents/analyst",
      "openclaw_port": 3002,
      "model": "llama3:70b-q4",
      "model_provider": "ollama_local",
      "telegram_bot": "@IE_Analyst_bot",
      "startup_delay_seconds": 30,
      "restart_policy": "always",
      "max_restart_attempts": 5,
      "restart_backoff_seconds": [10, 30, 60, 120, 300],
      "hang_detection": {
        "heartbeat_stale_threshold_seconds": 600,
        "same_task_threshold_seconds": 3600
      }
    }
  ],
  "global": {
    "stagger_startup": true,
    "startup_order": ["houston", "analyst"],
    "ollama_health_check_url": "http://localhost:11434/api/tags",
    "crm_health_check_url": "https://your-railway-app.up.railway.app/api/ai/health",
    "log_dir": "/AI-Agents/supervisor-logs",
    "status_file": "/AI-Agents/supervisor-status.json"
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

### Example: `agentctl status` (Full Fleet — Phase 3)
```
AI Agent Fleet — Status (3 machines)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MAC MINI 48GB "The Starter" (192.168.1.50)
  Ollama:     ● Running (2 models loaded)
  Supervisor: ● Running (uptime: 14d 6h 12m)

  Agent         Model           Port  Status     Uptime      Today
  ────────────  ──────────────  ────  ─────────  ──────────  ─────
  enricher      qwen3.5:20b     3001  ● Running  14d 6h 12m  47 items
  researcher    minimax2.5      3002  ● Running  14d 6h 11m  156 scans
  matcher       qwen3.5:20b     3003  ● Running  14d 6h 10m  12 drafts

MAC MINI 64GB "The Specialist" (192.168.1.51)
  Ollama:     ● Running (2 models loaded)
  Supervisor: ● Running (uptime: 7d 2h 45m)

  Agent            Model           Port  Status     Uptime     Today
  ───────────────  ──────────────  ────  ─────────  ─────────  ─────
  scout            minimax2.5      3001  ● Running  7d 2h 45m  23 scans
  logger           qwen3.5:20b     3002  ● Running  7d 2h 44m  —
  gpt_validator    gpt-4o (API)    3003  ● Running  7d 2h 43m  34 reviews
  gemini_validator gemini-pro(API) 3004  ● Running  7d 2h 42m  34 reviews

MAC STUDIO 128GB "The Beast" (192.168.1.52)
  Ollama:     ● Running (2 models loaded)
  Supervisor: ● Running (uptime: 3d 8h 15m)

  Agent       Model              Port  Status     Uptime     Today
  ──────────  ─────────────────  ────  ─────────  ─────────  ─────
  houston     opus-4.6 (API)     3001  ● Running  3d 8h 15m  1 briefing
  analyst     llama3:70b-q4      3002  ● Running  3d 8h 14m  5 analyses

CRM API:        ● Reachable (latency: 45ms)
Priority Board: 3 pending | 12 completed today | 0 expired
Sandbox Queue:  8 pending review | 34 approved today
Ralph Loop:     ● GPT + Gemini agree on 31/34 items (3 escalated to Houston)
```

---

## Startup Sequence (What Happens When Any Fleet Machine Boots)

This sequence is the same on all 3 machines — only the agents listed in that machine's `supervisor-config.json` differ.

```
1. macOS boots → user auto-login (configure in System Settings)
     ↓
2. LaunchAgent starts Ollama
     ↓ (wait ~10 seconds for Ollama to be ready)
3. LaunchAgent starts agent-supervisor.py
     ↓
4. Supervisor reads its local supervisor-config.json
     ↓
5. Supervisor checks: is Ollama responding? (retry up to 30 seconds)
     ↓
6. Supervisor checks: is Neon Postgres reachable? (retry up to 60 seconds)
     ↓ (if unreachable, start agents in "offline mode" — queue to disk)
7. Supervisor starts THIS machine's agents with staggered delays
     (e.g., on 48GB Mini: enricher → researcher → matcher)
     (e.g., on 64GB Mini: scout → logger → gpt_validator → gemini_validator)
     (e.g., on Studio: houston → analyst)
     ↓
8. Each agent: loads its agent.md, connects to model, sends first heartbeat
     ↓
9. Machine is fully operational (~2-3 minutes after boot)
```

### Auto-Login Configuration
All fleet machines auto-login to the same dedicated user account:
- **System Settings → Users & Groups → Login Options → Automatic Login**
- Use the Fleet Apple ID user account `ai-fleet` (NOT David's personal account)
- This account has access to `/AI-Agents/` and network, nothing else
- Lock the screen after login if needed (agents don't need the GUI)
- All machines signed into the same Fleet Apple ID (ie-ai-fleet@icloud.com)

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

Tier 2 validators are **persistent OpenClaw instances** running on the 64GB Mac Mini. Each validator has its own memory, Telegram bot, and cloud LLM backend. They actively monitor the sandbox queue and validate agent output.

### Phase 1 (No Tier 2 — David is the Ralph Loop)
- 48GB Mac Mini only — no validators yet
- David manually reviews the sandbox queue in the Agent Dashboard
- This is intentional — David needs to understand what good/bad agent output looks like before automating the check

### Phase 2 (64GB Mac Mini arrives — Automated Ralph Loop)
- GPT Validator and Gemini Validator are full OpenClaw instances on the 64GB Mini
- Each runs continuously, checking the sandbox queue every 10 minutes
- Each has **persistent memory** — remembers past validation patterns, common errors, what David approves/rejects
- Each has its own Telegram bot — David can text them directly for ad-hoc validation

### How the Ralph Loop Works Now

```
Every 10 minutes, BOTH validators check the sandbox queue:

GPT Validator (OpenClaw + GPT-4 API):
  → Reads pending sandbox items
  → Validates against its learned patterns + quality rules
  → Posts: approve / reject / escalate for each item
  → Remembers: "Enricher tends to get phone numbers wrong for LLC entities"

Gemini Validator (OpenClaw + Gemini Pro API):
  → Same queue, different perspective
  → Cross-validates independently
  → Remembers: "Australian contact data needs extra verification"

AGREEMENT LOGIC:
  → Both approve → auto-promote to production
  → Both reject → auto-reject, log reason
  → DISAGREE → escalate to Houston
  → Houston can't decide → escalate to David via Telegram
```

### Validator Memory Example
Because they're full OpenClaw instances (not one-shot API calls), they accumulate knowledge:

```
GPT Validator memory/patterns.md:
  "Enricher false positive pattern: When company name contains 'LLC'
   and registered agent is CSC/CT Corp, the person name is often the
   agent service, not the actual owner. Flag these for manual review."

Gemini Validator memory/patterns.md:
  "Matcher outreach drafts mentioning 'recent expansion' should be
   cross-checked with Researcher signals. 3 times this month the
   expansion was >6 months old. Require signal freshness <90 days."
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

## Folder Structure (Same Layout on Every Machine)

Each machine has the same `/AI-Agents/` structure, but only the agents that run on that machine have populated directories. The supervisor only starts agents listed in its local `supervisor-config.json`.

```
/AI-Agents/
├── supervisor/
│   ├── agent-supervisor.py        # Main supervisor script
│   ├── agentctl                   # CLI control tool
│   └── requirements.txt          # Python dependencies
├── supervisor-config.json         # THIS machine's agent configuration
├── supervisor-status.json         # Current status (written every 60s)
├── supervisor-logs/
│
│── # TIER 3 WORKERS (Mac Mini 48GB)
├── enricher/
│   ├── agent.md                   # Instructions
│   ├── pre-filter-rules.json     # Stage 0 filter configuration
│   ├── memory/                    # Persistent memory (OpenClaw)
│   ├── logs/
│   ├── versions/                  # Backed-up previous agent.md versions
│   └── checkpoint.json            # Resume state after crash
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
│
│── # TIER 2 QA + SUPPORT (Mac Mini 64GB)
├── scout/
│   ├── agent.md
│   ├── memory/
│   ├── logs/
│   └── versions/
├── logger/
│   ├── agent.md
│   ├── memory/
│   └── logs/
├── gpt-validator/                 # NEW — Tier 2 OpenClaw instance
│   ├── agent.md                   # Validation instructions + learned patterns
│   ├── memory/                    # Remembers validation patterns over time
│   └── logs/
├── gemini-validator/              # NEW — Tier 2 OpenClaw instance
│   ├── agent.md
│   ├── memory/
│   └── logs/
│
│── # TIER 1 COMMANDER + PREMIUM (Mac Studio 128GB)
├── chief-of-staff/                # Houston's home
│   ├── agent.md
│   ├── memory/
│   ├── council/                   # Council reviewer prompts
│   │   ├── deal-hunter.md
│   │   ├── revenue-guardian.md
│   │   └── market-skeptic.md
│   └── logs/
├── analyst/                       # NEW — Premium analysis agent
│   ├── agent.md
│   ├── memory/
│   └── logs/
│
│── # SHARED ACROSS ALL MACHINES
├── daily-logs/
├── security/
│   └── injection-rules.json
├── prompting-guides/
│   ├── opus-4.6.md
│   ├── qwen-3.5.md
│   └── minimax-2.5.md
├── shared/
│   ├── cost-tracker.py
│   └── audit-log.py
├── logs/
│   ├── audit/                     # JSONL audit logs (one file per day)
│   └── council/                   # Council briefing traces
├── offline-buffer/
│   ├── signals/
│   └── logs/
└── launchagents/
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
| `security/injection-rules.json` | GitHub → Mac Mini | Injection sanitizer pattern definitions |
| `prompting-guides/*.md` | GitHub → Mac Mini | Model-specific prompting best practices |
| `SECURITY-AUDIT.md` | GitHub only (reference) | Security audit process documentation |
| `INJECTION-DEFENSE.md` | GitHub only (reference) | Injection defense layer documentation |
| LaunchAgent plist templates | |

---

## Day One Setup Script

A single script that sets up the base stack on any fleet machine (Mac Mini or Mac Studio). Run once per machine. The supervisor-config.json is the only file that differs per machine — it determines which agents start.

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

# Deploy security and prompting guide files
mkdir -p /AI-Agents/security
cp ai-system/security/injection-rules.json /AI-Agents/security/injection-rules.json
mkdir -p /AI-Agents/prompting-guides
cp ai-system/prompting-guides/*.md /AI-Agents/prompting-guides/

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

## Fleet Strategy — 3-Machine Phased Deployment

The fleet grows as machines arrive. Each phase adds capability without disrupting what's already running.

### Phase 1: Mac Mini 48GB Only (Weeks 1-2)

**Everything starts on one machine.** All agents, all tiers (with Tier 1 & 2 running as simple API calls initially).

```
Mac Mini 48GB "The Starter"
├── Ollama: Qwen 3.5 (20B) + MiniMax 2.5
├── OpenClaw: Enricher   (port 3001) → @IE_Enricher_bot
├── OpenClaw: Researcher (port 3002) → @IE_Researcher_bot
├── OpenClaw: Matcher    (port 3003) → @IE_Matcher_bot
├── OpenClaw: Scout      (port 3004) → @IE_Scout_bot
├── OpenClaw: Logger     (port 3005) → @IE_Logger_bot
├── Tier 2: David reviews sandbox manually (Ralph Loop = David)
├── Tier 1: Houston via API call (no dedicated instance yet)
└── Supervisor process
```

All 5 agents, both models, one machine. Both models stay loaded in memory simultaneously. No swapping — 48GB handles this with ~18-24GB headroom.

### Phase 2: Mac Mini 64GB Arrives (Weeks 3-4)

**Scout and Logger migrate. Tier 2 validators become full agents.**

```
Mac Mini 48GB "The Starter" — now JUST the heavy workers
├── Ollama: Qwen 3.5 (20B) + MiniMax 2.5
├── OpenClaw: Enricher   (port 3001) → @IE_Enricher_bot
├── OpenClaw: Researcher (port 3002) → @IE_Researcher_bot
├── OpenClaw: Matcher    (port 3003) → @IE_Matcher_bot
└── Headroom: ~28-34 GB free (faster inference, room to grow)

Mac Mini 64GB "The Specialist" — QA + support
├── Ollama: Qwen 3.5 (20B) + MiniMax 2.5
├── OpenClaw: Scout          (port 3001) → @IE_Scout_bot
├── OpenClaw: Logger         (port 3002) → @IE_Logger_bot
├── OpenClaw: GPT Validator  (port 3003, GPT-4 API) → @IE_GPT_Val_bot
├── OpenClaw: Gemini Valid.  (port 3004, Gemini API) → @IE_Gemini_Val_bot
└── Headroom: ~34-40 GB free (room for 30B+ specialist model)
```

**What's new in Phase 2:**
- GPT and Gemini validators are now full OpenClaw instances with persistent memory
- They learn validation patterns over time — get smarter, not just check-and-forget
- Both agree → auto-promote. Both disagree → escalate to Houston → escalate to David
- David can text either validator directly on Telegram for ad-hoc checks

### Phase 3: Mac Studio 128GB Arrives (Month 2+)

**Houston gets a dedicated home. Premium models come online.**

```
Mac Mini 48GB "The Starter" — Tier 3 Workers
├── Ollama: Qwen 3.5 (20B) + MiniMax 2.5
├── OpenClaw: Enricher   (port 3001) → @IE_Enricher_bot
├── OpenClaw: Researcher (port 3002) → @IE_Researcher_bot
├── OpenClaw: Matcher    (port 3003) → @IE_Matcher_bot
└── Supervisor

Mac Mini 64GB "The Specialist" — Tier 2 QA + Support
├── Ollama: Qwen 3.5 (20B) + MiniMax 2.5
├── OpenClaw: Scout          (port 3001) → @IE_Scout_bot
├── OpenClaw: Logger         (port 3002) → @IE_Logger_bot
├── OpenClaw: GPT Validator  (port 3003) → @IE_GPT_Val_bot
├── OpenClaw: Gemini Valid.  (port 3004) → @IE_Gemini_Val_bot
└── Supervisor

Mac Studio 128GB "The Beast" — Commander + Premium
├── Ollama: Llama 3 70B (Q4) + Qwen 3.5 (20B)
├── OpenClaw: Houston  (port 3001, Claude Opus API) → @IE_Houston_bot
├── OpenClaw: Analyst  (port 3002, Llama 70B local) → @IE_Analyst_bot
└── Supervisor

TOTAL: 9 OpenClaw instances across 3 machines
```

### Cross-Machine Communication

All 3 machines talk to the same cloud backend — no direct machine-to-machine communication needed:

```
Mac Mini 48GB  ──┐
Mac Mini 64GB  ──┼──→ Neon Postgres (IE CRM database)
Mac Studio 128 ──┘    Railway (IE CRM API)
                      Priority Board (same table)
                      Sandbox DB (same tables)
                      Agent heartbeats (same table)
```

Agents don't need to know which machine the other agents are on. The Researcher (48GB Mini) posts a priority, the Enricher (48GB Mini) picks it up. The GPT Validator (64GB Mini) reads sandbox items, Houston (Studio) reads escalations. All through the shared database.

### If One Machine Goes Down

| Machine Down | Impact | Recovery |
|---|---|---|
| 48GB Mini (workers) | No new enrichment/research/matching | 64GB Mini can run worker agents temporarily |
| 64GB Mini (QA) | No automated validation — David reviews manually | Workers still produce, just piles up for review |
| 128GB Studio (Houston) | No morning briefings, no commander | Validators and workers continue independently |

Any single machine can run the full fleet solo at reduced performance if needed.

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
3:15 AM  — Scout: Run 4-perspective security audit (see SECURITY-AUDIT.md). Timeout: 3:45 AM.
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
*Updated: March 2026 — 3-machine fleet architecture (48GB Mini + 64GB Mini + 128GB Studio)*
*Updated: March 2026 — Tier 2 validators as full OpenClaw instances with persistent memory*
*Updated: March 2026 — Per-machine supervisor configs, phased deployment, fleet Apple ID*
*Updated: March 2026 — Added parallel sub-agent spawning, nightly self-maintenance cron*
*Updated: March 2026 — Added council briefing, cost tracking, audit logging, pre-filter config*
*For: IE CRM AI Master System — Process Management & Orchestration*
