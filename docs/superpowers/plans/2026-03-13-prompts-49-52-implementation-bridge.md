# IE CRM AI Master System — Implementation Bridge: Prompts 49-52
# Agent Runtime, Lifecycle Management, Multi-Mac Coordination, CRM Workflow Pages

**Date:** 2026-03-13
**Status:** Design Spec (Round 5 — Implementation Bridge)
**Scope:** Turn 35 tiers of design into deployable, running systems on Mac Mini M4 Pro
**Depends on:** All prior rounds (Prompts 1-48), OpenClaw agent framework, Ollama local inference
**Hardware:** Mac Mini M4 Pro (36GB RAM) arriving Mar 17-24, 2026; Mac Studio M4 Ultra (128GB) future

---

## What Prompts 49-52 Add

Rounds 1-4 designed WHAT the AI system does. Round 5 designs HOW it actually runs.

| # | Capability | Core Problem | Key Deliverable |
|---|-----------|-------------|----------------|
| 49 | Agent Runtime & OpenClaw Config | Agent templates exist but have no runtime wiring | Complete config files, Ollama/API clients, tool definitions for all 6 agents |
| 50 | Agent Lifecycle Management | No process management, crash recovery, or watchdog | PM2 ecosystem, cycle specs, crash recovery, watchdog daemon |
| 51 | Multi-Mac Coordination & Memory | No protocol for agent distribution or persistent memory | Agent registry, lock tables, memory system, instruction versioning |
| 52 | CRM Workflow Pages | Action Items/Comps pages exist but need enhancement; TPE visualization missing | Enhanced pages, new TPE component, API endpoints, database queries |

---

## Table of Contents

1. [Prompt 49: Agent Runtime & OpenClaw Configuration](#prompt-49)
2. [Prompt 50: Agent Lifecycle Management](#prompt-50)
3. [Prompt 51: Multi-Mac Coordination & Agent Memory System](#prompt-51)
4. [Prompt 52: CRM Workflow Pages](#prompt-52)
5. [Implementation Priority & Dependencies](#priority)

---

<a id="prompt-49"></a>
# PROMPT 49: Agent Runtime & OpenClaw Configuration

## Folder Structure

```
/AI-Agents/
├── config/
│   ├── supervisor-config.json      ← master config (pricing, global settings, model registry)
│   ├── agents/
│   │   ├── enricher.json           ← per-agent runtime config
│   │   ├── researcher.json
│   │   ├── matcher.json
│   │   ├── scout.json
│   │   ├── logger.json
│   │   └── chief-of-staff.json    ← Tier 1 (Claude API, not Ollama)
│   └── keys/
│       └── api-keys.env            ← agent API keys (gitignored)
├── instructions/
│   ├── enricher.md
│   ├── researcher.md
│   ├── matcher.md
│   ├── scout.md
│   ├── logger.md
│   ├── chief-of-staff.md
│   └── archive/                    ← versioned rollbacks
│       ├── enricher/
│       │   ├── enricher-v1.0.0.md
│       │   └── enricher-v1.1.0.md
│       ├── researcher/
│       └── ...
├── memory/
│   ├── enricher/
│   │   ├── cycle-log.jsonl         ← append-only cycle history
│   │   ├── learned-patterns.md     ← Chief of Staff writes these
│   │   ├── error-journal.md        ← errors + resolutions
│   │   └── performance-stats.json  ← rolling metrics
│   ├── researcher/
│   ├── matcher/
│   ├── scout/
│   ├── logger/
│   ├── chief-of-staff/
│   └── shared/
│       ├── entity-cache.json       ← local mirror of entity_context_cache
│       ├── active-bounties.json    ← current data bounties (Tier 25)
│       ├── market-regime.json      ← current market regime per submarket
│       └── priority-board.json     ← priority board assignments
├── shared/
│   ├── audit_log.py                ← JSONL structured audit logger
│   ├── cost_tracker.py             ← per-call cost estimation
│   ├── api_client.py               ← shared CRM API client
│   ├── ollama_client.py            ← shared Ollama wrapper
│   ├── memory_sync.py              ← shared memory pull/push
│   └── telegram_notifier.py        ← alert channel
├── agents/
│   ├── enricher_agent.py           ← agent entry point
│   ├── researcher_agent.py
│   ├── matcher_agent.py
│   ├── scout_agent.py
│   ├── logger_agent.py
│   └── chief_of_staff_agent.py
├── watchdog/
│   ├── watchdog.py                 ← health monitor daemon
│   └── com.iecrm.watchdog.plist    ← LaunchDaemon for watchdog
├── test-harness/
│   ├── mock_server.py              ← mock CRM API for offline testing
│   ├── fixtures/
│   │   ├── sample_llc.json
│   │   ├── sample_air_report.json
│   │   └── sample_signal.json
│   └── assertions/
│       ├── test_enricher.py
│       ├── test_researcher.py
│       └── test_api_client.py
└── ecosystem.config.js             ← PM2 process manager config
```

---

## Master Supervisor Config: `supervisor-config.json`

```json
{
  "version": "1.0.0",
  "environment": "production",
  "crm_api": {
    "base_url": "https://ie-crm-production.up.railway.app",
    "timeout_ms": 30000,
    "max_retries": 3,
    "retry_base_delay_ms": 1000,
    "rate_limit_backoff_ms": 60000
  },
  "ollama": {
    "base_url": "http://localhost:11434",
    "health_check_interval_s": 60,
    "request_timeout_ms": 120000,
    "max_concurrent_requests": 2
  },
  "models": {
    "qwen3.5-32b": {
      "ollama_name": "qwen3.5:32b",
      "context_window": 32768,
      "ram_required_gb": 20,
      "primary_for": ["enricher", "researcher", "matcher"]
    },
    "qwen3.5-14b": {
      "ollama_name": "qwen3.5:14b",
      "context_window": 32768,
      "ram_required_gb": 10,
      "primary_for": ["scout", "logger"],
      "fallback_for": ["enricher", "researcher", "matcher"]
    },
    "minimax2.5-8b": {
      "ollama_name": "minimax2.5:8b",
      "context_window": 16384,
      "ram_required_gb": 6,
      "fallback_for": ["scout", "logger"]
    }
  },
  "pricing": {
    "anthropic/claude-opus-4.6":   { "input_per_1m": 15.00, "output_per_1m": 75.00 },
    "anthropic/claude-sonnet-4.6": { "input_per_1m": 3.00,  "output_per_1m": 15.00 },
    "anthropic/claude-haiku-4.5":  { "input_per_1m": 0.80,  "output_per_1m": 4.00 },
    "openai/gpt-4o":               { "input_per_1m": 2.50,  "output_per_1m": 10.00 },
    "google/gemini-flash":         { "input_per_1m": 0.30,  "output_per_1m": 1.20 },
    "ollama/*":                    { "input_per_1m": 0.00,  "output_per_1m": 0.00 }
  },
  "alerts": {
    "telegram_bot_token_env": "TELEGRAM_BOT_TOKEN",
    "telegram_chat_id_env": "TELEGRAM_CHAT_ID",
    "alert_on": ["agent_crash", "ollama_down", "api_unreachable", "watchdog_timeout"]
  },
  "logging": {
    "audit_log_path": "/AI-Agents/logs/system/audit.jsonl",
    "max_log_size_mb": 100,
    "rotation_count": 10
  },
  "host": {
    "machine_id": "mac-mini-m4-pro",
    "ram_gb": 36,
    "max_concurrent_agents": 3
  }
}
```

---

## Per-Agent Configuration Files

### `config/agents/enricher.json`

```json
{
  "agent_name": "enricher",
  "version": "1.0.0",
  "enabled": true,

  "model": {
    "primary": "qwen3.5-32b",
    "fallback": "qwen3.5-14b",
    "temperature": 0.3,
    "top_p": 0.9,
    "max_tokens": 4096,
    "context_window": 32768,
    "system_prompt_source": "/AI-Agents/instructions/enricher.md"
  },

  "cycle": {
    "type": "interval",
    "interval_minutes": 15,
    "max_items_per_cycle": 5,
    "max_cycle_duration_minutes": 12,
    "jitter_seconds": 30
  },

  "api_permissions": [
    "GET  /api/ai/enrichment-queue",
    "GET  /api/ai/priority-board",
    "GET  /api/ai/feedback-digest/enricher",
    "POST /api/ai/sandbox/contacts",
    "POST /api/ai/sandbox/enrichments",
    "POST /api/ai/heartbeat",
    "POST /api/ai/log",
    "GET  /api/db/query (read-only, parameterized)"
  ],

  "tools": [
    {
      "name": "search_open_corporates",
      "description": "Search Open Corporates for LLC/Corp registration details",
      "type": "web_scrape",
      "url_template": "https://opencorporates.com/companies?q={query}&jurisdiction_code=us_ca",
      "rate_limit": "10/minute"
    },
    {
      "name": "search_white_pages",
      "description": "Look up person by name and location",
      "type": "web_scrape",
      "url_template": "https://www.whitepages.com/name/{name}/{state}",
      "rate_limit": "5/minute"
    },
    {
      "name": "verify_email",
      "description": "Verify email deliverability via NeverBounce API",
      "type": "api_call",
      "requires_key": "NEVERBOUNCE_API_KEY",
      "rate_limit": "100/hour"
    },
    {
      "name": "search_been_verified",
      "description": "Search BeenVerified for person details",
      "type": "web_scrape",
      "requires_key": "BEENVERIFIED_SESSION",
      "rate_limit": "3/minute"
    },
    {
      "name": "submit_to_sandbox",
      "description": "Submit enriched contact to CRM sandbox for Tier 2 review",
      "type": "api_call",
      "endpoint": "POST /api/ai/sandbox/contacts"
    },
    {
      "name": "query_crm",
      "description": "Read-only query against CRM database to check for duplicates",
      "type": "api_call",
      "endpoint": "GET /api/db/query",
      "read_only": true
    }
  ],

  "input_sources": [
    { "type": "api", "endpoint": "/api/ai/priority-board", "priority": 1 },
    { "type": "api", "endpoint": "/api/ai/enrichment-queue", "priority": 2 }
  ],

  "output_destinations": [
    { "type": "api", "endpoint": "/api/ai/sandbox/contacts", "for": "enriched_contacts" },
    { "type": "api", "endpoint": "/api/ai/sandbox/enrichments", "for": "data_updates" },
    { "type": "api", "endpoint": "/api/ai/heartbeat", "for": "health_check" },
    { "type": "file", "path": "/AI-Agents/memory/enricher/cycle-log.jsonl", "for": "cycle_audit" },
    { "type": "file", "path": "/AI-Agents/logs/enricher/", "for": "debug_logs" }
  ],

  "resource_limits": {
    "max_memory_mb": 2048,
    "max_cpu_percent": 40
  }
}
```

### `config/agents/researcher.json`

```json
{
  "agent_name": "researcher",
  "version": "1.0.0",
  "enabled": true,

  "model": {
    "primary": "qwen3.5-32b",
    "fallback": "qwen3.5-14b",
    "temperature": 0.5,
    "top_p": 0.95,
    "max_tokens": 8192,
    "context_window": 32768,
    "system_prompt_source": "/AI-Agents/instructions/researcher.md"
  },

  "cycle": {
    "type": "interval",
    "interval_minutes": 30,
    "max_items_per_cycle": 3,
    "max_cycle_duration_minutes": 25,
    "jitter_seconds": 60
  },

  "api_permissions": [
    "GET  /api/ai/research-queue",
    "GET  /api/ai/priority-board",
    "GET  /api/ai/feedback-digest/researcher",
    "POST /api/ai/sandbox/signals",
    "POST /api/ai/sandbox/enrichments",
    "POST /api/ai/heartbeat",
    "POST /api/ai/log",
    "GET  /api/db/query (read-only, parameterized)"
  ],

  "tools": [
    {
      "name": "web_search",
      "description": "Search the web for CRE market signals, tenant moves, development news",
      "type": "web_search",
      "provider": "serper",
      "requires_key": "SERPER_API_KEY",
      "rate_limit": "30/hour"
    },
    {
      "name": "scrape_url",
      "description": "Fetch and parse a specific URL for content extraction",
      "type": "web_scrape",
      "rate_limit": "20/minute"
    },
    {
      "name": "search_ie_press",
      "description": "Search Inland Empire-specific news sources",
      "type": "web_search",
      "search_domains": [
        "pe.com", "sbsun.com", "inlandempire.us",
        "connectcre.com", "bisnow.com", "costar.com"
      ],
      "rate_limit": "10/hour"
    },
    {
      "name": "submit_signal",
      "description": "Submit a market signal to CRM sandbox",
      "type": "api_call",
      "endpoint": "POST /api/ai/sandbox/signals"
    },
    {
      "name": "query_crm",
      "description": "Read-only CRM query for context on properties/companies",
      "type": "api_call",
      "endpoint": "GET /api/db/query",
      "read_only": true
    }
  ],

  "input_sources": [
    { "type": "api", "endpoint": "/api/ai/priority-board", "priority": 1 },
    { "type": "api", "endpoint": "/api/ai/research-queue", "priority": 2 },
    { "type": "schedule", "sources": ["ie_press", "costar_alerts", "loopnet_rss"], "priority": 3 }
  ],

  "output_destinations": [
    { "type": "api", "endpoint": "/api/ai/sandbox/signals", "for": "market_signals" },
    { "type": "api", "endpoint": "/api/ai/sandbox/enrichments", "for": "property_data" },
    { "type": "api", "endpoint": "/api/ai/heartbeat", "for": "health_check" },
    { "type": "file", "path": "/AI-Agents/memory/researcher/cycle-log.jsonl", "for": "cycle_audit" }
  ],

  "resource_limits": {
    "max_memory_mb": 2048,
    "max_cpu_percent": 40
  }
}
```

### `config/agents/matcher.json`

```json
{
  "agent_name": "matcher",
  "version": "1.0.0",
  "enabled": true,

  "model": {
    "primary": "qwen3.5-32b",
    "fallback": "qwen3.5-14b",
    "temperature": 0.4,
    "top_p": 0.9,
    "max_tokens": 6144,
    "context_window": 32768,
    "system_prompt_source": "/AI-Agents/instructions/matcher.md"
  },

  "cycle": {
    "type": "hybrid",
    "event_trigger": "new_air_report",
    "daily_sweep_cron": "0 8 * * *",
    "max_items_per_cycle": 10,
    "max_cycle_duration_minutes": 20,
    "jitter_seconds": 15
  },

  "api_permissions": [
    "GET  /api/ai/match-queue",
    "GET  /api/ai/air-reports/pending",
    "GET  /api/ai/feedback-digest/matcher",
    "POST /api/ai/sandbox/outreach",
    "POST /api/ai/sandbox/matches",
    "POST /api/ai/heartbeat",
    "POST /api/ai/log",
    "GET  /api/db/query (read-only, parameterized)"
  ],

  "tools": [
    {
      "name": "search_properties",
      "description": "Search CRM properties by type, size, location, availability",
      "type": "api_call",
      "endpoint": "GET /api/db/query",
      "read_only": true
    },
    {
      "name": "search_contacts",
      "description": "Search CRM contacts by active need, type, geography",
      "type": "api_call",
      "endpoint": "GET /api/db/query",
      "read_only": true
    },
    {
      "name": "get_comps",
      "description": "Pull lease/sale comps for a submarket to inform pricing",
      "type": "api_call",
      "endpoint": "GET /api/db/query",
      "read_only": true
    },
    {
      "name": "draft_outreach",
      "description": "Generate personalized outreach draft for a match",
      "type": "llm_call",
      "model_override": null
    },
    {
      "name": "submit_match",
      "description": "Submit property-contact match to sandbox",
      "type": "api_call",
      "endpoint": "POST /api/ai/sandbox/matches"
    },
    {
      "name": "submit_outreach",
      "description": "Submit outreach draft to sandbox for review",
      "type": "api_call",
      "endpoint": "POST /api/ai/sandbox/outreach"
    }
  ],

  "input_sources": [
    { "type": "api", "endpoint": "/api/ai/air-reports/pending", "priority": 1 },
    { "type": "api", "endpoint": "/api/ai/match-queue", "priority": 2 }
  ],

  "output_destinations": [
    { "type": "api", "endpoint": "/api/ai/sandbox/matches", "for": "match_suggestions" },
    { "type": "api", "endpoint": "/api/ai/sandbox/outreach", "for": "outreach_drafts" },
    { "type": "api", "endpoint": "/api/ai/heartbeat", "for": "health_check" },
    { "type": "file", "path": "/AI-Agents/memory/matcher/cycle-log.jsonl", "for": "cycle_audit" }
  ],

  "resource_limits": {
    "max_memory_mb": 2048,
    "max_cpu_percent": 40
  }
}
```

### `config/agents/scout.json`

```json
{
  "agent_name": "scout",
  "version": "1.0.0",
  "enabled": true,

  "model": {
    "primary": "qwen3.5-14b",
    "fallback": "minimax2.5-8b",
    "temperature": 0.6,
    "top_p": 0.95,
    "max_tokens": 8192,
    "context_window": 32768,
    "system_prompt_source": "/AI-Agents/instructions/scout.md"
  },

  "cycle": {
    "type": "hybrid",
    "interval_hours": 6,
    "weekly_evolution_cron": "0 7 * * 0",
    "max_items_per_cycle": 5,
    "max_cycle_duration_minutes": 30,
    "jitter_seconds": 120
  },

  "api_permissions": [
    "GET  /api/ai/feedback-digest/scout",
    "POST /api/ai/sandbox/signals",
    "POST /api/ai/config/pricing",
    "POST /api/ai/heartbeat",
    "POST /api/ai/log"
  ],

  "tools": [
    {
      "name": "web_search",
      "description": "Search for AI/CRE tech news, model releases, pricing changes",
      "type": "web_search",
      "provider": "serper",
      "requires_key": "SERPER_API_KEY",
      "rate_limit": "20/hour"
    },
    {
      "name": "scrape_url",
      "description": "Fetch and parse a URL for tech/model announcement details",
      "type": "web_scrape",
      "rate_limit": "10/minute"
    },
    {
      "name": "update_pricing",
      "description": "Update model pricing in supervisor config when changes detected",
      "type": "api_call",
      "endpoint": "POST /api/ai/config/pricing"
    },
    {
      "name": "submit_evolution_report",
      "description": "Submit weekly system evolution report",
      "type": "api_call",
      "endpoint": "POST /api/ai/sandbox/signals"
    }
  ],

  "input_sources": [
    { "type": "rss", "feeds": [
      "https://huggingface.co/blog/feed.xml",
      "https://openai.com/blog/rss",
      "https://www.anthropic.com/feed.xml"
    ]},
    { "type": "schedule", "sources": ["ai_news", "cre_tech", "model_benchmarks"] }
  ],

  "output_destinations": [
    { "type": "api", "endpoint": "/api/ai/sandbox/signals", "for": "tech_signals" },
    { "type": "api", "endpoint": "/api/ai/heartbeat", "for": "health_check" },
    { "type": "file", "path": "/AI-Agents/memory/scout/cycle-log.jsonl", "for": "cycle_audit" }
  ],

  "resource_limits": {
    "max_memory_mb": 1536,
    "max_cpu_percent": 30
  }
}
```

### `config/agents/logger.json`

```json
{
  "agent_name": "logger",
  "version": "1.0.0",
  "enabled": true,

  "model": {
    "primary": "qwen3.5-14b",
    "fallback": "minimax2.5-8b",
    "temperature": 0.2,
    "top_p": 0.85,
    "max_tokens": 12288,
    "context_window": 32768,
    "system_prompt_source": "/AI-Agents/instructions/logger.md"
  },

  "cycle": {
    "type": "cron",
    "cron": "0 23 * * *",
    "max_cycle_duration_minutes": 30,
    "jitter_seconds": 0
  },

  "api_permissions": [
    "GET  /api/ai/agent-logs/*",
    "GET  /api/ai/sandbox/stats",
    "GET  /api/ai/heartbeats",
    "GET  /api/ai/cost-summary",
    "POST /api/ai/daily-summary",
    "POST /api/ai/feedback-digest/*",
    "POST /api/ai/heartbeat",
    "POST /api/ai/log"
  ],

  "tools": [
    {
      "name": "read_audit_log",
      "description": "Read today's JSONL audit log entries",
      "type": "file_read",
      "path": "/AI-Agents/logs/system/audit.jsonl"
    },
    {
      "name": "read_agent_memory",
      "description": "Read any agent's cycle-log for the day",
      "type": "file_read",
      "path_template": "/AI-Agents/memory/{agent}/cycle-log.jsonl"
    },
    {
      "name": "generate_feedback_digest",
      "description": "Generate and submit feedback digest for an agent",
      "type": "api_call",
      "endpoint": "POST /api/ai/feedback-digest/{agent}"
    },
    {
      "name": "submit_daily_summary",
      "description": "Submit formatted daily summary to CRM",
      "type": "api_call",
      "endpoint": "POST /api/ai/daily-summary"
    },
    {
      "name": "generate_cost_report",
      "description": "Generate cost/usage report from audit log",
      "type": "computation"
    }
  ],

  "input_sources": [
    { "type": "file", "path": "/AI-Agents/logs/system/audit.jsonl" },
    { "type": "file", "path_glob": "/AI-Agents/memory/*/cycle-log.jsonl" },
    { "type": "api", "endpoint": "/api/ai/sandbox/stats" },
    { "type": "api", "endpoint": "/api/ai/heartbeats" }
  ],

  "output_destinations": [
    { "type": "api", "endpoint": "/api/ai/daily-summary", "for": "daily_report" },
    { "type": "api", "endpoint": "/api/ai/feedback-digest/{agent}", "for": "agent_feedback" },
    { "type": "file", "path": "/AI-Agents/memory/logger/cycle-log.jsonl", "for": "cycle_audit" }
  ],

  "resource_limits": {
    "max_memory_mb": 1536,
    "max_cpu_percent": 30
  }
}
```

### `config/agents/chief-of-staff.json`

```json
{
  "agent_name": "chief-of-staff",
  "version": "1.0.0",
  "enabled": true,

  "model": {
    "primary": "claude-opus-4.6",
    "provider": "anthropic",
    "api_key_env": "ANTHROPIC_API_KEY",
    "temperature": 0.4,
    "top_p": 0.95,
    "max_tokens": 16384,
    "context_window": 200000,
    "system_prompt_source": "/AI-Agents/instructions/chief-of-staff.md"
  },

  "cycle": {
    "type": "hybrid",
    "morning_briefing_cron": "0 6 * * *",
    "escalation_trigger": true,
    "max_cycle_duration_minutes": 45,
    "jitter_seconds": 0
  },

  "api_permissions": [
    "GET  /api/ai/daily-summary",
    "GET  /api/ai/agent-logs/*",
    "GET  /api/ai/sandbox/*",
    "GET  /api/ai/feedback-digest/*",
    "GET  /api/ai/escalations",
    "POST /api/ai/morning-briefing",
    "POST /api/ai/instruction-update/*",
    "POST /api/ai/heartbeat",
    "POST /api/ai/log",
    "GET  /api/db/query (read-only, parameterized)",
    "POST /api/ai/council/initiate"
  ],

  "tools": [
    {
      "name": "read_all_agent_memory",
      "description": "Read cycle logs, patterns, and stats for all agents",
      "type": "file_read",
      "path_glob": "/AI-Agents/memory/*/",
      "includes": ["cycle-log.jsonl", "learned-patterns.md", "error-journal.md", "performance-stats.json"]
    },
    {
      "name": "read_daily_summary",
      "description": "Read Logger's daily summary",
      "type": "api_call",
      "endpoint": "GET /api/ai/daily-summary"
    },
    {
      "name": "update_agent_instructions",
      "description": "Update an agent's instruction file (with version control)",
      "type": "file_write",
      "path_template": "/AI-Agents/instructions/{agent}.md",
      "archive_path": "/AI-Agents/instructions/archive/{agent}/"
    },
    {
      "name": "update_learned_patterns",
      "description": "Write learned patterns to an agent's memory",
      "type": "file_write",
      "path_template": "/AI-Agents/memory/{agent}/learned-patterns.md"
    },
    {
      "name": "run_council_briefing",
      "description": "Initiate 3-phase council briefing (DealHunter, RevenueGuardian, MarketSkeptic)",
      "type": "api_call",
      "endpoint": "POST /api/ai/council/initiate"
    },
    {
      "name": "send_telegram",
      "description": "Send morning briefing to David via Telegram",
      "type": "notification",
      "channel": "telegram"
    },
    {
      "name": "query_crm",
      "description": "Read CRM data for briefing context",
      "type": "api_call",
      "endpoint": "GET /api/db/query",
      "read_only": true
    }
  ],

  "input_sources": [
    { "type": "api", "endpoint": "/api/ai/daily-summary", "priority": 1 },
    { "type": "api", "endpoint": "/api/ai/escalations", "priority": 0 },
    { "type": "file", "path_glob": "/AI-Agents/memory/*/", "priority": 2 }
  ],

  "output_destinations": [
    { "type": "api", "endpoint": "/api/ai/morning-briefing", "for": "daily_briefing" },
    { "type": "notification", "channel": "telegram", "for": "david_alert" },
    { "type": "file", "path": "/AI-Agents/memory/chief-of-staff/cycle-log.jsonl", "for": "cycle_audit" },
    { "type": "file", "path_template": "/AI-Agents/memory/{agent}/learned-patterns.md", "for": "agent_guidance" }
  ],

  "resource_limits": {
    "max_memory_mb": 4096,
    "max_cpu_percent": 50
  }
}
```

---

## Agent Model Assignment Summary

| Agent | Primary Model | Fallback | Temperature | Context | Why |
|-------|--------------|----------|-------------|---------|-----|
| Enricher | Qwen 3.5 32B | Qwen 3.5 14B | 0.3 | 32K | Low temp for factual extraction; 32B for entity disambiguation |
| Researcher | Qwen 3.5 32B | Qwen 3.5 14B | 0.5 | 32K | Medium temp for signal discovery; needs reasoning depth |
| Matcher | Qwen 3.5 32B | Qwen 3.5 14B | 0.4 | 32K | Needs full property/contact context for matching |
| Scout | Qwen 3.5 14B | MiniMax 2.5 8B | 0.6 | 32K | Higher temp for creative scanning; lower-stakes task |
| Logger | Qwen 3.5 14B | MiniMax 2.5 8B | 0.2 | 32K | Very low temp for accurate summarization |
| Chief of Staff | Claude Opus 4.6 | Claude Sonnet 4.6 | 0.4 | 200K | Needs cloud API for reasoning depth; reads ALL agent data |

**RAM budget on Mac Mini (36GB):**
- macOS overhead: ~6GB
- Ollama with Qwen 3.5 32B loaded: ~20GB
- Agent Python processes (6x): ~3GB total
- Headroom: ~7GB
- Note: Only one 32B model loaded at a time. Agents queue; Ollama hot-swaps if needed. The 14B model (~10GB) is the fallback when 32B is busy or failed.

---

## Shared API Client: `api_client.py`

```python
"""
IE CRM API Client — shared by all Tier 3 agents.
Handles auth, retries, rate limiting, and audit logging.
"""

import os
import time
import json
import uuid
import logging
import requests
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Any

logger = logging.getLogger("iecrm.api_client")


class CrmApiClient:
    """Thread-safe CRM API client with retry logic and audit logging."""

    def __init__(
        self,
        agent_name: str,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        audit_log_path: Optional[str] = None,
        max_retries: int = 3,
        retry_base_delay: float = 1.0,
        timeout: float = 30.0,
    ):
        self.agent_name = agent_name
        self.base_url = (
            base_url
            or os.environ.get("CRM_API_URL")
            or "https://ie-crm-production.up.railway.app"
        )
        self.api_key = api_key or os.environ.get(f"AGENT_API_KEY_{agent_name.upper()}")
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "X-Agent-Name": agent_name,
            "X-Agent-Key": self.api_key or "",
            "X-Request-ID": "",  # set per-request
        })

        # Audit log — append-only JSONL
        self._audit_path = Path(
            audit_log_path
            or os.environ.get("AUDIT_LOG_PATH")
            or f"/AI-Agents/logs/system/audit.jsonl"
        )
        self._audit_path.parent.mkdir(parents=True, exist_ok=True)

    # ── Core request with retry ──────────────────────────────

    def _request(
        self,
        method: str,
        path: str,
        data: Optional[dict] = None,
        params: Optional[dict] = None,
    ) -> dict:
        url = f"{self.base_url}{path}"
        request_id = str(uuid.uuid4())[:12]
        self.session.headers["X-Request-ID"] = request_id

        last_error = None
        for attempt in range(self.max_retries + 1):
            t0 = time.monotonic()
            try:
                resp = self.session.request(
                    method, url,
                    json=data,
                    params=params,
                    timeout=self.timeout,
                )

                duration_ms = int((time.monotonic() - t0) * 1000)

                # Rate limited — back off
                if resp.status_code == 429:
                    retry_after = int(resp.headers.get("Retry-After", 60))
                    self._audit("rate_limited", path, duration_ms, 429)
                    logger.warning(f"Rate limited on {path}, sleeping {retry_after}s")
                    time.sleep(retry_after)
                    continue

                # Server error — retry with backoff
                if resp.status_code >= 500:
                    delay = self.retry_base_delay * (2 ** attempt)
                    self._audit("server_error", path, duration_ms, resp.status_code)
                    logger.warning(f"Server error {resp.status_code} on {path}, retry in {delay}s")
                    time.sleep(delay)
                    last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    continue

                # Success or client error (no retry)
                self._audit("success" if resp.ok else "client_error", path, duration_ms, resp.status_code)

                if resp.ok:
                    return resp.json()
                else:
                    raise ApiError(f"HTTP {resp.status_code}: {resp.text[:500]}", resp.status_code)

            except requests.exceptions.Timeout:
                duration_ms = int((time.monotonic() - t0) * 1000)
                self._audit("timeout", path, duration_ms, 0)
                last_error = f"Timeout after {self.timeout}s on {path}"
                if attempt < self.max_retries:
                    time.sleep(self.retry_base_delay * (2 ** attempt))

            except requests.exceptions.ConnectionError:
                duration_ms = int((time.monotonic() - t0) * 1000)
                self._audit("connection_error", path, duration_ms, 0)
                last_error = f"Connection error on {path}"
                if attempt < self.max_retries:
                    time.sleep(self.retry_base_delay * (2 ** attempt))

        raise ApiError(f"Exhausted {self.max_retries} retries: {last_error}", 0)

    # ── Audit log writer ─────────────────────────────────────

    def _audit(self, outcome: str, path: str, duration_ms: int, status_code: int):
        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "agent": self.agent_name,
            "action": "api_call",
            "path": path,
            "outcome": outcome,
            "status_code": status_code,
            "duration_ms": duration_ms,
        }
        try:
            with open(self._audit_path, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            logger.error(f"Failed to write audit log: {e}")

    # ── Convenience methods ──────────────────────────────────

    def search_contacts(self, filters: dict, limit: int = 50) -> list:
        """Search contacts with filters (name, email, type, city, etc.)."""
        return self._request("POST", "/api/db/query", data={
            "sql": self._build_contact_search_sql(filters, limit),
            "params": list(filters.values()),
        }).get("rows", [])

    def search_properties(self, filters: dict, limit: int = 50) -> list:
        """Search properties with filters."""
        return self._request("POST", "/api/db/query", data={
            "sql": self._build_property_search_sql(filters, limit),
            "params": list(filters.values()),
        }).get("rows", [])

    def submit_sandbox_contact(self, contact_data: dict) -> dict:
        """Submit enriched contact to sandbox for Tier 2 review."""
        return self._request("POST", "/api/ai/sandbox/contacts", data=contact_data)

    def submit_sandbox_signal(self, signal_data: dict) -> dict:
        """Submit market signal to sandbox."""
        return self._request("POST", "/api/ai/sandbox/signals", data=signal_data)

    def submit_sandbox_outreach(self, outreach_data: dict) -> dict:
        """Submit outreach draft to sandbox."""
        return self._request("POST", "/api/ai/sandbox/outreach", data=outreach_data)

    def submit_heartbeat(self, status: str = "alive", meta: dict = None) -> dict:
        """Submit agent heartbeat."""
        return self._request("POST", "/api/ai/heartbeat", data={
            "agent_name": self.agent_name,
            "status": status,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "meta": meta or {},
        })

    def submit_log(self, level: str, message: str, data: dict = None) -> dict:
        """Submit structured log entry."""
        return self._request("POST", "/api/ai/log", data={
            "agent_name": self.agent_name,
            "level": level,
            "message": message,
            "data": data or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

    def get_enrichment_queue(self, limit: int = 10) -> list:
        """Fetch next items from enrichment queue."""
        return self._request("GET", "/api/ai/enrichment-queue", params={"limit": limit}).get("items", [])

    def get_priority_board(self, agent: str = None) -> list:
        """Fetch priority board items, optionally filtered by agent."""
        params = {"agent": agent or self.agent_name}
        return self._request("GET", "/api/ai/priority-board", params=params).get("items", [])

    def get_feedback_digest(self, agent: str = None) -> dict:
        """Fetch latest feedback digest for this agent."""
        target = agent or self.agent_name
        return self._request("GET", f"/api/ai/feedback-digest/{target}")

    # ── SQL builders (parameterized, read-only) ──────────────

    @staticmethod
    def _build_contact_search_sql(filters: dict, limit: int) -> str:
        clauses = []
        i = 1
        for key in filters:
            if key in ("full_name", "email", "type", "city"):
                clauses.append(f"{key} ILIKE ${i}")
                i += 1
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return f"SELECT * FROM contacts {where} LIMIT {limit}"

    @staticmethod
    def _build_property_search_sql(filters: dict, limit: int) -> str:
        clauses = []
        i = 1
        for key in filters:
            if key in ("city", "property_type", "owner_name", "submarket_name"):
                clauses.append(f"{key} ILIKE ${i}")
                i += 1
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        return f"SELECT * FROM properties {where} LIMIT {limit}"


class ApiError(Exception):
    def __init__(self, message: str, status_code: int):
        super().__init__(message)
        self.status_code = status_code
```

---

## Shared Ollama Client: `ollama_client.py`

```python
"""
IE CRM Ollama Client — shared wrapper for local LLM inference.
Handles model selection, system prompt injection, conversation management,
token tracking, timeouts, and fallback model switching.
"""

import os
import json
import time
import logging
import requests
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Generator

logger = logging.getLogger("iecrm.ollama")


class OllamaClient:
    """Wrapper around Ollama HTTP API with agent-specific configuration."""

    def __init__(
        self,
        agent_name: str,
        agent_config: dict,
        supervisor_config: dict,
        audit_log_path: str = "/AI-Agents/logs/system/audit.jsonl",
    ):
        self.agent_name = agent_name
        self.config = agent_config
        self.supervisor = supervisor_config
        self.base_url = supervisor_config.get("ollama", {}).get("base_url", "http://localhost:11434")
        self.timeout = supervisor_config.get("ollama", {}).get("request_timeout_ms", 120000) / 1000

        # Model config
        model_cfg = agent_config.get("model", {})
        self.primary_model = model_cfg.get("primary", "qwen3.5-14b")
        self.fallback_model = model_cfg.get("fallback", "minimax2.5-8b")
        self.temperature = model_cfg.get("temperature", 0.4)
        self.top_p = model_cfg.get("top_p", 0.9)
        self.max_tokens = model_cfg.get("max_tokens", 4096)
        self.context_window = model_cfg.get("context_window", 32768)

        # Load system prompt from instruction file
        prompt_path = model_cfg.get("system_prompt_source", "")
        self.system_prompt = self._load_system_prompt(prompt_path)

        # Conversation state (per-cycle)
        self.messages = []
        self._cycle_tokens_in = 0
        self._cycle_tokens_out = 0

        # Audit log
        self._audit_path = Path(audit_log_path)
        self._audit_path.parent.mkdir(parents=True, exist_ok=True)

        # Current active model
        self._active_model = self.primary_model
        self._using_fallback = False

    def _load_system_prompt(self, path: str) -> str:
        """Load instruction .md file as system prompt."""
        try:
            p = Path(path)
            if p.exists():
                content = p.read_text(encoding="utf-8")
                logger.info(f"Loaded system prompt from {path} ({len(content)} chars)")
                return content
            else:
                logger.warning(f"Instruction file not found: {path}")
                return f"You are the {self.agent_name} agent for IE CRM."
        except Exception as e:
            logger.error(f"Failed to load system prompt: {e}")
            return f"You are the {self.agent_name} agent for IE CRM."

    def _resolve_ollama_name(self, model_key: str) -> str:
        """Resolve model key to Ollama model name from supervisor config."""
        models = self.supervisor.get("models", {})
        if model_key in models:
            return models[model_key]["ollama_name"]
        return model_key  # assume it's already an Ollama name

    # ── Health check ─────────────────────────────────────────

    def is_healthy(self) -> bool:
        """Check if Ollama is running and responsive."""
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            return resp.status_code == 200
        except Exception:
            return False

    def available_models(self) -> list:
        """List models currently loaded in Ollama."""
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if resp.ok:
                return [m["name"] for m in resp.json().get("models", [])]
        except Exception:
            pass
        return []

    # ── Conversation management ──────────────────────────────

    def reset_conversation(self):
        """Reset conversation state for a new cycle."""
        self.messages = []
        self._cycle_tokens_in = 0
        self._cycle_tokens_out = 0
        self._using_fallback = False
        self._active_model = self.primary_model

    def chat(
        self,
        user_message: str,
        system_override: Optional[str] = None,
        temperature_override: Optional[float] = None,
        max_tokens_override: Optional[int] = None,
        json_mode: bool = False,
    ) -> str:
        """
        Send a message and get a response. Maintains conversation history.
        Falls back to secondary model on failure.
        """
        self.messages.append({"role": "user", "content": user_message})

        try:
            response = self._call_ollama(
                system=system_override or self.system_prompt,
                temperature=temperature_override or self.temperature,
                max_tokens=max_tokens_override or self.max_tokens,
                json_mode=json_mode,
            )
        except OllamaError:
            if not self._using_fallback and self.fallback_model:
                logger.warning(f"Primary model failed, switching to fallback: {self.fallback_model}")
                self._active_model = self.fallback_model
                self._using_fallback = True
                response = self._call_ollama(
                    system=system_override or self.system_prompt,
                    temperature=temperature_override or self.temperature,
                    max_tokens=max_tokens_override or self.max_tokens,
                    json_mode=json_mode,
                )
            else:
                raise

        self.messages.append({"role": "assistant", "content": response})
        return response

    def _call_ollama(
        self,
        system: str,
        temperature: float,
        max_tokens: int,
        json_mode: bool,
    ) -> str:
        """Make the actual Ollama API call."""
        ollama_model = self._resolve_ollama_name(self._active_model)

        payload = {
            "model": ollama_model,
            "messages": [{"role": "system", "content": system}] + self.messages,
            "stream": False,
            "options": {
                "temperature": temperature,
                "top_p": self.top_p,
                "num_predict": max_tokens,
                "num_ctx": self.context_window,
            },
        }
        if json_mode:
            payload["format"] = "json"

        t0 = time.monotonic()
        try:
            resp = requests.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=self.timeout,
            )
        except requests.exceptions.Timeout:
            self._audit("timeout", ollama_model, 0, 0, int((time.monotonic() - t0) * 1000))
            raise OllamaError(f"Ollama timeout after {self.timeout}s")
        except requests.exceptions.ConnectionError:
            self._audit("connection_error", ollama_model, 0, 0, int((time.monotonic() - t0) * 1000))
            raise OllamaError("Cannot connect to Ollama — is it running?")

        duration_ms = int((time.monotonic() - t0) * 1000)

        if not resp.ok:
            self._audit("error", ollama_model, 0, 0, duration_ms)
            raise OllamaError(f"Ollama error {resp.status_code}: {resp.text[:300]}")

        data = resp.json()
        content = data.get("message", {}).get("content", "")

        # Token tracking
        tokens_in = data.get("prompt_eval_count", 0)
        tokens_out = data.get("eval_count", 0)
        self._cycle_tokens_in += tokens_in
        self._cycle_tokens_out += tokens_out

        self._audit("success", ollama_model, tokens_in, tokens_out, duration_ms)

        return content

    # ── Token stats ──────────────────────────────────────────

    @property
    def cycle_token_stats(self) -> dict:
        return {
            "tokens_in": self._cycle_tokens_in,
            "tokens_out": self._cycle_tokens_out,
            "model": self._active_model,
            "using_fallback": self._using_fallback,
        }

    # ── Audit logging ────────────────────────────────────────

    def _audit(self, outcome: str, model: str, tokens_in: int, tokens_out: int, duration_ms: int):
        # Look up cost (always 0.00 for Ollama, but track for comparison)
        pricing = self.supervisor.get("pricing", {}).get("ollama/*", {"input_per_1m": 0, "output_per_1m": 0})
        cost = (tokens_in / 1_000_000) * pricing["input_per_1m"] + \
               (tokens_out / 1_000_000) * pricing["output_per_1m"]

        entry = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "agent": self.agent_name,
            "action": "llm_call",
            "model": model,
            "provider": "ollama_local",
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_estimate": round(cost, 6),
            "duration_ms": duration_ms,
            "outcome": outcome,
        }
        try:
            with open(self._audit_path, "a") as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            logger.error(f"Audit log write failed: {e}")


class OllamaError(Exception):
    pass
```

---

## How OpenClaw Connects Everything

Each agent is a Python script that OpenClaw orchestrates. The agent entry point pattern:

```python
# agents/enricher_agent.py — Enricher entry point

import json
import time
import logging
from pathlib import Path
from datetime import datetime, timezone

from shared.api_client import CrmApiClient
from shared.ollama_client import OllamaClient
from shared.audit_log import append_cycle_log

logger = logging.getLogger("iecrm.enricher")


def load_config():
    with open("/AI-Agents/config/agents/enricher.json") as f:
        agent_cfg = json.load(f)
    with open("/AI-Agents/config/supervisor-config.json") as f:
        supervisor_cfg = json.load(f)
    return agent_cfg, supervisor_cfg


def run_cycle():
    """Execute one enrichment cycle."""
    agent_cfg, supervisor_cfg = load_config()
    api = CrmApiClient("enricher")
    llm = OllamaClient("enricher", agent_cfg, supervisor_cfg)
    llm.reset_conversation()

    cycle_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    cycle_start = time.monotonic()
    items_processed = 0
    items_submitted = 0

    try:
        # 1. Read feedback digest (learning from past rejections)
        try:
            digest = api.get_feedback_digest()
            if digest.get("rejection_reasons"):
                feedback_prompt = format_feedback_for_llm(digest)
                llm.chat(feedback_prompt)  # prime the conversation with feedback
        except Exception as e:
            logger.warning(f"Could not fetch feedback digest: {e}")

        # 2. Check priority board for assigned items
        priority_items = api.get_priority_board()

        # 3. If no priority items, use enrichment queue
        if not priority_items:
            work_items = api.get_enrichment_queue(limit=agent_cfg["cycle"]["max_items_per_cycle"])
        else:
            work_items = priority_items[:agent_cfg["cycle"]["max_items_per_cycle"]]

        # 4. Process each work item
        for item in work_items:
            elapsed = time.monotonic() - cycle_start
            max_duration = agent_cfg["cycle"]["max_cycle_duration_minutes"] * 60
            if elapsed > max_duration:
                logger.info(f"Cycle time limit reached ({max_duration}s)")
                break

            try:
                result = enrich_single_item(item, llm, api)
                items_processed += 1
                if result.get("submitted"):
                    items_submitted += 1
            except Exception as e:
                logger.error(f"Error enriching item {item.get('id')}: {e}")

        # 5. Submit heartbeat
        api.submit_heartbeat("alive", {
            "cycle_id": cycle_id,
            "items_processed": items_processed,
            "items_submitted": items_submitted,
            "token_stats": llm.cycle_token_stats,
        })

        # 6. Log cycle metrics
        append_cycle_log("/AI-Agents/memory/enricher/cycle-log.jsonl", {
            "cycle_id": cycle_id,
            "started_at": datetime.now(timezone.utc).isoformat(),
            "duration_s": round(time.monotonic() - cycle_start, 1),
            "items_processed": items_processed,
            "items_submitted": items_submitted,
            "token_stats": llm.cycle_token_stats,
            "errors": [],
        })

    except Exception as e:
        logger.error(f"Cycle {cycle_id} failed: {e}")
        try:
            api.submit_heartbeat("error", {"error": str(e)})
        except Exception:
            pass


def enrich_single_item(item, llm, api):
    """Run the enrichment pipeline for a single LLC/property owner."""
    # Step 1: Ask LLM to plan the research approach
    plan = llm.chat(
        f"Research plan for: {json.dumps(item)}\n"
        "What data sources should I check? What's the owner entity type? "
        "Is this likely an LLC with a registered agent?",
        json_mode=True,
    )

    # Step 2: Execute research tools based on LLM plan
    # (OpenClaw handles tool dispatch based on plan output)

    # Step 3: Ask LLM to synthesize findings and calculate confidence
    synthesis = llm.chat(
        f"Synthesize the research results and calculate a confidence score (0-100).\n"
        f"Research results: {json.dumps(item.get('research_results', {}))}\n"
        "Output JSON with: full_name, email, phone, confidence_score, sources, notes",
        json_mode=True,
    )

    result = json.loads(synthesis)

    # Step 4: Submit to sandbox if confidence meets threshold
    if result.get("confidence_score", 0) >= 40:
        api.submit_sandbox_contact({
            "agent_name": "enricher",
            "confidence_score": result["confidence_score"],
            "data": result,
            "source_item_id": item.get("id"),
        })
        return {"submitted": True, "confidence": result["confidence_score"]}

    return {"submitted": False, "confidence": result.get("confidence_score", 0)}


def format_feedback_for_llm(digest):
    """Format feedback digest as a learning prompt for the LLM."""
    parts = [f"FEEDBACK FROM YOUR LAST {digest.get('items_submitted', 0)} SUBMISSIONS:"]
    parts.append(f"Approval rate: {digest.get('approval_rate', 'N/A')}%")

    if digest.get("rejection_reasons"):
        parts.append("\nCommon rejection reasons:")
        for reason in digest["rejection_reasons"]:
            parts.append(f"  - {reason['reason']} ({reason['count']}x): {reason.get('guidance', '')}")

    parts.append("\nAdjust your approach based on this feedback. Avoid repeating rejected patterns.")
    return "\n".join(parts)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_cycle()
```

---

<a id="prompt-50"></a>
# PROMPT 50: Agent Lifecycle Management

## Process Manager Selection

**Recommendation: PM2 (Option C)**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| A: LaunchAgents (plist) | Native macOS, survives reboots | No process grouping, no log aggregation, no dashboard, verbose XML config | Too primitive for 6+ agents |
| B: Python supervisor | Full control, custom logic | Must build restart logic, log rotation, monitoring from scratch | Too much custom code |
| **C: PM2** | **Built-in restart, log rotation, monitoring dashboard, ecosystem config, cluster mode, startup hook** | Requires Node.js (already installed for CRM) | **Best fit** |

PM2 is the right tool because:
- Single config file manages all 6 agents
- Built-in `pm2 startup` generates a macOS LaunchDaemon automatically
- `pm2 monit` gives real-time CPU/memory/restart dashboard
- `pm2 logs` aggregates all agent output
- Exponential backoff restart is built-in (`exp_backoff_restart_delay`)
- `max_memory_restart` kills and restarts agents that leak memory
- Cron-style scheduling is built-in (`cron_restart`)

---

## PM2 Ecosystem Config: `ecosystem.config.js`

```javascript
// /AI-Agents/ecosystem.config.js
// PM2 process manager configuration for all IE CRM agents
// Start:   pm2 start ecosystem.config.js
// Stop:    pm2 stop all
// Restart: pm2 restart all
// Logs:    pm2 logs
// Monitor: pm2 monit
// Status:  pm2 status

module.exports = {
  apps: [

    // ── Tier 3 Agents (Ollama-powered, local) ────────────────

    {
      name: 'enricher',
      script: '/AI-Agents/agents/enricher_agent.py',
      interpreter: '/usr/local/bin/python3',
      cwd: '/AI-Agents',
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 5000,   // starts at 5s, doubles each crash, caps at 15min
      max_restarts: 50,                  // per 24h window
      max_memory_restart: '2G',          // kill if exceeds 2GB
      cron_restart: '*/15 * * * *',      // restart every 15 min (triggers new cycle)
      watch: false,
      env: {
        AGENT_NAME: 'enricher',
        CRM_API_URL: 'https://ie-crm-production.up.railway.app',
        OLLAMA_URL: 'http://localhost:11434',
        PYTHONPATH: '/AI-Agents',
        LOG_LEVEL: 'INFO',
      },
      log_file: '/AI-Agents/logs/enricher/combined.log',
      out_file: '/AI-Agents/logs/enricher/out.log',
      error_file: '/AI-Agents/logs/enricher/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    {
      name: 'researcher',
      script: '/AI-Agents/agents/researcher_agent.py',
      interpreter: '/usr/local/bin/python3',
      cwd: '/AI-Agents',
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 5000,
      max_restarts: 30,
      max_memory_restart: '2G',
      cron_restart: '*/30 * * * *',      // every 30 min
      watch: false,
      env: {
        AGENT_NAME: 'researcher',
        CRM_API_URL: 'https://ie-crm-production.up.railway.app',
        OLLAMA_URL: 'http://localhost:11434',
        PYTHONPATH: '/AI-Agents',
        LOG_LEVEL: 'INFO',
      },
      log_file: '/AI-Agents/logs/researcher/combined.log',
      out_file: '/AI-Agents/logs/researcher/out.log',
      error_file: '/AI-Agents/logs/researcher/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    {
      name: 'matcher',
      script: '/AI-Agents/agents/matcher_agent.py',
      interpreter: '/usr/local/bin/python3',
      cwd: '/AI-Agents',
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 5000,
      max_restarts: 30,
      max_memory_restart: '2G',
      cron_restart: '0 8 * * *',         // daily sweep at 8 AM
      watch: false,
      env: {
        AGENT_NAME: 'matcher',
        CRM_API_URL: 'https://ie-crm-production.up.railway.app',
        OLLAMA_URL: 'http://localhost:11434',
        PYTHONPATH: '/AI-Agents',
        LOG_LEVEL: 'INFO',
        MATCHER_MODE: 'sweep',           // 'sweep' or 'event' (event mode via webhook)
      },
      log_file: '/AI-Agents/logs/matcher/combined.log',
      out_file: '/AI-Agents/logs/matcher/out.log',
      error_file: '/AI-Agents/logs/matcher/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    {
      name: 'scout',
      script: '/AI-Agents/agents/scout_agent.py',
      interpreter: '/usr/local/bin/python3',
      cwd: '/AI-Agents',
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 10000,
      max_restarts: 20,
      max_memory_restart: '1536M',
      cron_restart: '0 */6 * * *',       // every 6 hours
      watch: false,
      env: {
        AGENT_NAME: 'scout',
        CRM_API_URL: 'https://ie-crm-production.up.railway.app',
        OLLAMA_URL: 'http://localhost:11434',
        PYTHONPATH: '/AI-Agents',
        LOG_LEVEL: 'INFO',
      },
      log_file: '/AI-Agents/logs/scout/combined.log',
      out_file: '/AI-Agents/logs/scout/out.log',
      error_file: '/AI-Agents/logs/scout/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    {
      name: 'logger',
      script: '/AI-Agents/agents/logger_agent.py',
      interpreter: '/usr/local/bin/python3',
      cwd: '/AI-Agents',
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 5000,
      max_restarts: 10,
      max_memory_restart: '1536M',
      cron_restart: '0 23 * * *',        // daily at 11 PM
      watch: false,
      env: {
        AGENT_NAME: 'logger',
        CRM_API_URL: 'https://ie-crm-production.up.railway.app',
        OLLAMA_URL: 'http://localhost:11434',
        PYTHONPATH: '/AI-Agents',
        LOG_LEVEL: 'INFO',
      },
      log_file: '/AI-Agents/logs/logger/combined.log',
      out_file: '/AI-Agents/logs/logger/out.log',
      error_file: '/AI-Agents/logs/logger/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    // ── Tier 1 Agent (Claude API, not Ollama) ────────────────

    {
      name: 'chief-of-staff',
      script: '/AI-Agents/agents/chief_of_staff_agent.py',
      interpreter: '/usr/local/bin/python3',
      cwd: '/AI-Agents',
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 10000,
      max_restarts: 10,
      max_memory_restart: '4G',
      cron_restart: '0 6 * * *',         // daily at 6 AM (morning briefing)
      watch: false,
      env: {
        AGENT_NAME: 'chief-of-staff',
        CRM_API_URL: 'https://ie-crm-production.up.railway.app',
        PYTHONPATH: '/AI-Agents',
        LOG_LEVEL: 'INFO',
        // ANTHROPIC_API_KEY loaded from /AI-Agents/config/keys/api-keys.env
      },
      log_file: '/AI-Agents/logs/chief-of-staff/combined.log',
      out_file: '/AI-Agents/logs/chief-of-staff/out.log',
      error_file: '/AI-Agents/logs/chief-of-staff/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    // ── Infrastructure ───────────────────────────────────────

    {
      name: 'watchdog',
      script: '/AI-Agents/watchdog/watchdog.py',
      interpreter: '/usr/local/bin/python3',
      cwd: '/AI-Agents',
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 3000,
      max_restarts: 100,                 // watchdog MUST stay alive
      max_memory_restart: '512M',
      watch: false,
      env: {
        PYTHONPATH: '/AI-Agents',
        LOG_LEVEL: 'INFO',
      },
      log_file: '/AI-Agents/logs/system/watchdog.log',
      out_file: '/AI-Agents/logs/system/watchdog-out.log',
      error_file: '/AI-Agents/logs/system/watchdog-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },

    {
      name: 'matcher-webhook',
      script: '/AI-Agents/agents/matcher_webhook.py',
      interpreter: '/usr/local/bin/python3',
      cwd: '/AI-Agents',
      instances: 1,
      autorestart: true,
      exp_backoff_restart_delay: 3000,
      max_restarts: 50,
      max_memory_restart: '256M',
      watch: false,
      env: {
        AGENT_NAME: 'matcher',
        WEBHOOK_PORT: '8765',
        PYTHONPATH: '/AI-Agents',
      },
      log_file: '/AI-Agents/logs/matcher/webhook.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
```

---

## PM2 Commands Reference

```bash
# ── Setup (run once on Mac Mini) ──────────────────────────
npm install -g pm2                        # install PM2
pm2 startup                              # generates LaunchDaemon for auto-start on boot
pm2 install pm2-logrotate                 # log rotation module
pm2 set pm2-logrotate:max_size 50M       # rotate at 50MB
pm2 set pm2-logrotate:retain 10          # keep 10 rotated files
pm2 set pm2-logrotate:compress true      # gzip old logs
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm

# ── Daily operations ─────────────────────────────────────
pm2 start /AI-Agents/ecosystem.config.js  # start all agents
pm2 status                                # see all agent status
pm2 monit                                 # real-time CPU/mem/log dashboard
pm2 logs                                  # tail all agent logs
pm2 logs enricher                         # tail just enricher
pm2 restart enricher                      # restart one agent
pm2 stop scout                            # stop one agent
pm2 restart all                           # restart everything
pm2 save                                  # save current process list (survives reboot)

# ── Debugging ─────────────────────────────────────────────
pm2 describe enricher                     # full process details
pm2 reset enricher                        # reset restart count
pm2 reload ecosystem.config.js            # zero-downtime reload after config change

# ── Emergency ─────────────────────────────────────────────
pm2 stop all                              # stop everything
pm2 kill                                  # kill PM2 daemon entirely
```

---

## Agent Cycle Specifications

### Enricher Cycle (every 15 minutes)

```
ENRICHER CYCLE:
┌─────────────────────────────────────────────────────┐
│ 1. Load config + initialize API & LLM clients       │
│ 2. Read feedback digest from /api/ai/feedback-digest │
│    └─ Prime LLM with rejection patterns to avoid     │
│ 3. Check priority board for assigned items           │
│    └─ Priority items = human-flagged, override queue │
│ 4. If no priority items, pull enrichment queue       │
│    └─ Queue ordered by: data_age DESC, priority ASC  │
│ 5. For each item (max 5 per cycle):                  │
│    a. Ask LLM to classify entity type (LLC vs person)│
│    b. Search Open Corporates for LLC registration    │
│    c. Cross-ref White Pages for person behind LLC    │
│    d. Verify email via NeverBounce                   │
│    e. Calculate confidence score (0-100)             │
│    f. Check CRM for duplicates before submitting     │
│    g. Submit to sandbox if confidence >= 40          │
│ 6. Submit heartbeat with cycle metrics               │
│ 7. Append cycle-log.jsonl                            │
│ 8. Exit (PM2 restarts at next cron interval)         │
└─────────────────────────────────────────────────────┘
Duration: 3-12 minutes typical
```

### Researcher Cycle (every 30 minutes)

```
RESEARCHER CYCLE:
┌─────────────────────────────────────────────────────┐
│ 1. Load config + initialize clients                  │
│ 2. Read feedback digest — learn which signal types   │
│    are getting rejected (low_relevance, wrong_geo)   │
│ 3. Check priority board for research assignments     │
│ 4. If no priority items, run scheduled source scan:  │
│    a. IE press (pe.com, sbsun.com, connectcre.com)   │
│    b. CoStar alerts (if API available)               │
│    c. LoopNet RSS for new IE listings                │
│    d. Public records (county recorder filings)       │
│ 5. For each source hit (max 3 per cycle):            │
│    a. Fetch full article/listing content             │
│    b. Ask LLM: Is this IE-specific? Actionable?     │
│    c. Extract: company, property, signal type        │
│    d. Cross-ref CRM: do we know this entity?         │
│    e. Score signal relevance (0-100)                 │
│    f. Submit to sandbox if relevance >= 50           │
│ 6. Submit heartbeat                                  │
│ 7. Append cycle-log.jsonl                            │
│ 8. Exit                                              │
└─────────────────────────────────────────────────────┘
Duration: 10-25 minutes typical
```

### Matcher Cycle (event-driven + daily sweep at 8 AM)

```
MATCHER CYCLE:
┌─────────────────────────────────────────────────────┐
│ EVENT MODE (triggered by new AIR report webhook):    │
│ 1. Receive AIR report data via webhook               │
│ 2. Parse tenant requirement: type, size, location    │
│ 3. Query CRM properties matching criteria            │
│ 4. Score each match (0-100) using LLM               │
│ 5. Draft personalized outreach for top 3 matches     │
│ 6. Submit matches + outreach to sandbox              │
│ 7. Submit heartbeat                                  │
│                                                      │
│ SWEEP MODE (daily at 8 AM):                          │
│ 1. Pull all contacts with active_need = true         │
│ 2. Pull all properties with availability             │
│ 3. Run matching algorithm (LLM-scored)               │
│ 4. Filter: only suggest new matches (not previously  │
│    matched or rejected)                              │
│ 5. For top 10 matches, draft outreach                │
│ 6. Submit to sandbox                                 │
│ 7. Submit heartbeat + cycle log                      │
└─────────────────────────────────────────────────────┘
Duration: 5-20 minutes (event), 15-30 minutes (sweep)
```

### Scout Cycle (every 6 hours + weekly evolution report)

```
SCOUT CYCLE:
┌─────────────────────────────────────────────────────┐
│ REGULAR (every 6 hours):                             │
│ 1. Scan AI/ML news sources:                          │
│    - Hugging Face blog, OpenAI blog, Anthropic blog  │
│    - AI benchmark leaderboards                       │
│    - CRE proptech news (CREtech, PropTech Today)     │
│ 2. For each finding:                                 │
│    a. Classify: model release, pricing change,       │
│       new tool, CRE-specific, benchmark shift        │
│    b. Assess relevance to IE CRM system              │
│    c. If pricing change detected → update            │
│       supervisor-config.json pricing table            │
│    d. If relevant → submit signal to sandbox         │
│ 3. Submit heartbeat                                  │
│ 4. Append cycle-log.jsonl                            │
│                                                      │
│ WEEKLY EVOLUTION REPORT (Sunday 7 AM):               │
│ 1. Review all signals from past 7 days               │
│ 2. Compile: what changed in AI/CRE landscape         │
│ 3. Recommend: should we swap models? Add tools?      │
│ 4. Submit evolution report to Chief of Staff         │
└─────────────────────────────────────────────────────┘
Duration: 10-30 minutes (regular), 20-45 minutes (weekly)
```

### Logger Cycle (daily at 11 PM)

```
LOGGER CYCLE:
┌─────────────────────────────────────────────────────┐
│ 1. Read all agent cycle-log.jsonl files for today    │
│ 2. Read system audit.jsonl for today                 │
│ 3. Query sandbox stats: submitted, approved,         │
│    rejected, pending — per agent                     │
│ 4. Query heartbeat history: any missed heartbeats?   │
│ 5. Compile daily summary:                            │
│    a. Per-agent scorecard (items, rates, errors)     │
│    b. System health (uptime, restarts, memory)       │
│    c. Cost report (API calls, token usage)           │
│    d. Notable events (crashes, rate limits, etc.)    │
│ 6. Generate feedback digests for each agent          │
│    (approval rate, rejection reasons, guidance)      │
│ 7. Submit daily summary to CRM API                   │
│ 8. Submit feedback digests to CRM API                │
│ 9. Update per-agent performance-stats.json           │
│ 10. Append cycle-log.jsonl                           │
└─────────────────────────────────────────────────────┘
Duration: 10-30 minutes
```

### Chief of Staff Cycle (daily at 6 AM + escalation-triggered)

```
CHIEF OF STAFF CYCLE:
┌─────────────────────────────────────────────────────┐
│ MORNING BRIEFING (6 AM):                             │
│ 1. Read Logger's daily summary                       │
│ 2. Read ALL agent memory files:                      │
│    - cycle-log.jsonl (last 24h entries)              │
│    - learned-patterns.md                             │
│    - error-journal.md                                │
│    - performance-stats.json                          │
│ 3. Read shared memory (market regime, bounties)      │
│ 4. Query CRM: pending sandbox items, stale deals,    │
│    upcoming deadlines, new contacts                  │
│ 5. Phase 1: Draft briefing (Claude Opus)             │
│ 6. Phase 2: Council review (3x Claude Sonnet)        │
│    - DealHunter: revenue opportunities               │
│    - RevenueGuardian: risk/exposure                   │
│    - MarketSkeptic: challenge assumptions             │
│ 7. Phase 3: Reconcile council feedback               │
│ 8. Submit morning briefing to CRM + Telegram         │
│ 9. Review agent performance:                         │
│    - Update learned-patterns.md for each agent       │
│    - If approval rate < 60%: consider instruction    │
│      update (run canary test first)                  │
│ 10. Append cycle-log.jsonl                           │
│                                                      │
│ ESCALATION MODE (triggered):                         │
│ 1. Receive escalation from Tier 2 or watchdog        │
│ 2. Assess severity (info/warning/critical)           │
│ 3. If critical: send Telegram alert immediately      │
│ 4. If warning: queue for next morning briefing       │
│ 5. Log escalation response                           │
└─────────────────────────────────────────────────────┘
Duration: 20-45 minutes (morning), 2-5 minutes (escalation)
```

---

## Crash Recovery Design

### Scenario 1: Agent crashes mid-enrichment

**Problem:** Enricher crashes after researching an LLC but before submitting to sandbox.

**Solution — Idempotency via checkpoint file:**
```python
# Each work item gets a checkpoint file
checkpoint_path = f"/AI-Agents/memory/enricher/checkpoints/{item_id}.json"

# Before starting work:
if Path(checkpoint_path).exists():
    checkpoint = json.loads(Path(checkpoint_path).read_text())
    if checkpoint["status"] == "submitted":
        logger.info(f"Item {item_id} already submitted, skipping")
        continue
    # Resume from checkpoint
    research_results = checkpoint.get("research_results", {})
else:
    research_results = {}

# After each tool call, update checkpoint:
checkpoint = {"item_id": item_id, "status": "researching", "research_results": research_results}
Path(checkpoint_path).write_text(json.dumps(checkpoint))

# After successful submission:
checkpoint["status"] = "submitted"
Path(checkpoint_path).write_text(json.dumps(checkpoint))

# Cleanup: delete checkpoint files older than 24h on cycle start
```

### Scenario 2: Ollama crashes (all agents affected)

**Problem:** Ollama process dies — all Tier 3 agents lose LLM access simultaneously.

**Solution — Watchdog detects + restarts Ollama:**
```python
# In watchdog.py:
def check_ollama_health():
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=5)
        if resp.status_code != 200:
            raise Exception(f"Ollama unhealthy: {resp.status_code}")
        return True
    except Exception as e:
        logger.error(f"Ollama health check failed: {e}")
        # Attempt restart
        subprocess.run(["killall", "ollama"], capture_output=True)
        time.sleep(2)
        subprocess.Popen(["ollama", "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(10)
        # Verify restart
        try:
            resp = requests.get("http://localhost:11434/api/tags", timeout=5)
            if resp.ok:
                send_telegram("Ollama crashed and was auto-restarted successfully.")
                return True
        except Exception:
            pass
        send_telegram("CRITICAL: Ollama crashed and auto-restart FAILED. Manual intervention needed.")
        return False
```

**Agent-side handling:** The `OllamaClient.chat()` method catches connection errors and raises `OllamaError`. The agent's `run_cycle()` catches this, logs it, submits an error heartbeat, and exits. PM2 restarts the agent at next interval. If Ollama is still down, the agent will fail again but PM2's exponential backoff prevents thrashing.

### Scenario 3: CRM API unreachable (Railway down)

**Problem:** Railway deployment is down — agents can't submit results or fetch work items.

**Solution — Offline buffer with retry queue:**
```python
# In api_client.py — add offline buffer
OFFLINE_BUFFER_DIR = Path("/AI-Agents/memory/shared/offline-buffer/")

class CrmApiClient:
    def submit_sandbox_contact(self, contact_data):
        try:
            return self._request("POST", "/api/ai/sandbox/contacts", data=contact_data)
        except ApiError as e:
            if e.status_code == 0:  # connection error
                self._buffer_offline("sandbox_contacts", contact_data)
                return {"buffered": True, "buffer_path": str(self._last_buffer_path)}
            raise

    def _buffer_offline(self, endpoint_key, data):
        OFFLINE_BUFFER_DIR.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        path = OFFLINE_BUFFER_DIR / f"{endpoint_key}_{ts}_{uuid.uuid4().hex[:8]}.json"
        path.write_text(json.dumps({"endpoint": endpoint_key, "data": data, "buffered_at": ts}))
        self._last_buffer_path = path
        logger.warning(f"API offline — buffered to {path}")

    def flush_offline_buffer(self):
        """Called at start of each cycle — retry buffered items."""
        if not OFFLINE_BUFFER_DIR.exists():
            return 0
        flushed = 0
        for path in sorted(OFFLINE_BUFFER_DIR.glob("*.json")):
            try:
                entry = json.loads(path.read_text())
                endpoint_map = {
                    "sandbox_contacts": "/api/ai/sandbox/contacts",
                    "sandbox_signals": "/api/ai/sandbox/signals",
                    "sandbox_outreach": "/api/ai/sandbox/outreach",
                    "heartbeat": "/api/ai/heartbeat",
                }
                api_path = endpoint_map.get(entry["endpoint"])
                if api_path:
                    self._request("POST", api_path, data=entry["data"])
                    path.unlink()
                    flushed += 1
            except Exception as e:
                logger.warning(f"Failed to flush {path.name}: {e}")
                break  # API still down, stop trying
        if flushed:
            logger.info(f"Flushed {flushed} buffered items")
        return flushed
```

### Scenario 4: Mac Mini reboots

**Problem:** Power outage, macOS update, or manual reboot.

**Solution:** PM2 startup hook (LaunchDaemon):
```bash
# Run once during setup:
pm2 startup
# This generates and installs:
# ~/Library/LaunchAgents/com.pm2.davidmudge.plist
# (or /Library/LaunchDaemons/pm2-davidmudge.plist for root)

# After configuring all agents:
pm2 save
# This saves the current process list to ~/.pm2/dump.pm2.json
# On boot, PM2 auto-restores all saved processes
```

On reboot sequence:
1. macOS boots, runs LaunchDaemon
2. PM2 daemon starts
3. PM2 reads `dump.pm2.json`, starts all agents
4. Agents check `is_healthy()` on Ollama — if not ready, they fail and PM2 retries with backoff
5. Ollama starts (also via LaunchAgent), loads default model
6. Next agent restart finds Ollama healthy, begins normal cycles
7. Watchdog starts, begins monitoring

### Scenario 5: Agent stuck in infinite loop (watchdog timeout)

**Problem:** LLM generates a response that causes the agent to loop, or a web scrape hangs.

**Solution — Multi-layer timeout:**

```python
# Layer 1: Per-LLM-call timeout (in ollama_client.py)
# Already handled: requests timeout = 120s

# Layer 2: Per-cycle timeout (in agent entry point)
import signal

class CycleTimeout(Exception):
    pass

def timeout_handler(signum, frame):
    raise CycleTimeout("Cycle exceeded maximum duration")

def run_cycle():
    agent_cfg, _ = load_config()
    max_minutes = agent_cfg["cycle"]["max_cycle_duration_minutes"]
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(max_minutes * 60)
    try:
        # ... cycle logic ...
        pass
    except CycleTimeout:
        logger.error(f"Cycle timed out after {max_minutes} minutes")
        api.submit_heartbeat("timeout", {"reason": "cycle_timeout"})
    finally:
        signal.alarm(0)  # cancel alarm

# Layer 3: PM2 max_memory_restart (kills process if memory exceeds limit)

# Layer 4: Watchdog heartbeat check (see below)
```

---

## Watchdog Design

```python
# /AI-Agents/watchdog/watchdog.py
"""
IE CRM Agent Watchdog — monitors agent health, Ollama status, and system resources.
Runs as a PM2-managed process. Checks every 60 seconds.
"""

import os
import json
import time
import logging
import subprocess
import requests
from datetime import datetime, timezone, timedelta
from pathlib import Path

logger = logging.getLogger("iecrm.watchdog")

# Load config
CONFIG_PATH = "/AI-Agents/config/supervisor-config.json"
HEARTBEAT_API = None  # set from config
CHECK_INTERVAL = 60  # seconds

# Expected heartbeat intervals per agent (in minutes)
HEARTBEAT_EXPECTATIONS = {
    "enricher": 15,
    "researcher": 30,
    "matcher": 60,       # daily sweep, so generous window
    "scout": 360,        # every 6 hours
    "logger": 1440,      # daily
    "chief-of-staff": 1440,
}

# Alert threshold = 2x expected interval
ALERT_MULTIPLIER = 2


class Watchdog:
    def __init__(self):
        with open(CONFIG_PATH) as f:
            self.config = json.load(f)

        self.crm_url = self.config["crm_api"]["base_url"]
        self.telegram_token = os.environ.get(
            self.config["alerts"]["telegram_bot_token_env"], ""
        )
        self.telegram_chat_id = os.environ.get(
            self.config["alerts"]["telegram_chat_id_env"], ""
        )
        self.last_alert_times = {}  # prevent alert spam

    def run(self):
        logger.info("Watchdog started")
        while True:
            try:
                self.check_ollama_health()
                self.check_agent_heartbeats()
                self.check_agent_memory_usage()
                self.check_crm_api_health()
                self.check_disk_space()
            except Exception as e:
                logger.error(f"Watchdog check failed: {e}")
            time.sleep(CHECK_INTERVAL)

    # ── Ollama health ────────────────────────────────────────

    def check_ollama_health(self):
        try:
            resp = requests.get("http://localhost:11434/api/tags", timeout=5)
            if resp.status_code != 200:
                self._handle_ollama_down()
        except Exception:
            self._handle_ollama_down()

    def _handle_ollama_down(self):
        logger.error("Ollama is DOWN — attempting restart")
        subprocess.run(["killall", "ollama"], capture_output=True)
        time.sleep(2)
        subprocess.Popen(
            ["ollama", "serve"],
            stdout=open("/AI-Agents/logs/system/ollama.log", "a"),
            stderr=subprocess.STDOUT,
        )
        time.sleep(15)
        try:
            resp = requests.get("http://localhost:11434/api/tags", timeout=5)
            if resp.ok:
                self.alert("Ollama crashed and was auto-restarted.", level="warning")
                return
        except Exception:
            pass
        self.alert("CRITICAL: Ollama is down and auto-restart failed!", level="critical")

    # ── Agent heartbeats ─────────────────────────────────────

    def check_agent_heartbeats(self):
        """Check PM2 process status + heartbeat recency."""
        try:
            result = subprocess.run(
                ["pm2", "jlist"], capture_output=True, text=True, timeout=10
            )
            processes = json.loads(result.stdout)
        except Exception as e:
            logger.error(f"Cannot read PM2 process list: {e}")
            return

        for proc in processes:
            name = proc.get("name", "")
            if name in ("watchdog", "matcher-webhook"):
                continue

            status = proc.get("pm2_env", {}).get("status", "unknown")
            restarts = proc.get("pm2_env", {}).get("restart_time", 0)

            # Check if agent is stopped or erroring
            if status == "errored":
                self.alert(
                    f"Agent '{name}' is in ERROR state (restarts: {restarts})",
                    level="warning",
                    cooldown_minutes=30,
                )
            elif status == "stopped":
                self.alert(
                    f"Agent '{name}' is STOPPED",
                    level="warning",
                    cooldown_minutes=60,
                )

            # Check restart count (high restarts = crash loop)
            if restarts > 20:
                self.alert(
                    f"Agent '{name}' has restarted {restarts} times — possible crash loop",
                    level="warning",
                    cooldown_minutes=60,
                )

    # ── Memory usage ─────────────────────────────────────────

    def check_agent_memory_usage(self):
        try:
            result = subprocess.run(
                ["pm2", "jlist"], capture_output=True, text=True, timeout=10
            )
            processes = json.loads(result.stdout)
        except Exception:
            return

        for proc in processes:
            name = proc.get("name", "")
            memory = proc.get("monit", {}).get("memory", 0)
            memory_mb = memory / (1024 * 1024)

            # Alert if any process uses more than 3GB
            if memory_mb > 3072:
                self.alert(
                    f"Agent '{name}' using {memory_mb:.0f}MB RAM — exceeds threshold",
                    level="warning",
                    cooldown_minutes=15,
                )

    # ── CRM API health ───────────────────────────────────────

    def check_crm_api_health(self):
        try:
            resp = requests.get(f"{self.crm_url}/api/health", timeout=10)
            if resp.status_code != 200:
                self.alert("CRM API returned non-200", level="warning", cooldown_minutes=15)
        except Exception:
            self.alert(
                "CRM API unreachable — agents will buffer offline",
                level="warning",
                cooldown_minutes=30,
            )

    # ── Disk space ───────────────────────────────────────────

    def check_disk_space(self):
        import shutil
        total, used, free = shutil.disk_usage("/")
        free_gb = free / (1024 ** 3)
        if free_gb < 10:
            self.alert(
                f"Low disk space: {free_gb:.1f}GB free",
                level="warning",
                cooldown_minutes=60,
            )

    # ── Alerting ─────────────────────────────────────────────

    def alert(self, message, level="info", cooldown_minutes=15):
        """Send alert via log + Telegram (with cooldown to prevent spam)."""
        alert_key = f"{level}:{message[:50]}"
        now = datetime.now(timezone.utc)

        if alert_key in self.last_alert_times:
            elapsed = (now - self.last_alert_times[alert_key]).total_seconds() / 60
            if elapsed < cooldown_minutes:
                return  # still in cooldown

        self.last_alert_times[alert_key] = now

        log_fn = {"critical": logger.critical, "warning": logger.warning}.get(level, logger.info)
        log_fn(f"ALERT [{level}]: {message}")

        if level in ("critical", "warning") and self.telegram_token and self.telegram_chat_id:
            self._send_telegram(f"[IE CRM {level.upper()}] {message}")

    def _send_telegram(self, message):
        try:
            requests.post(
                f"https://api.telegram.org/bot{self.telegram_token}/sendMessage",
                json={"chat_id": self.telegram_chat_id, "text": message},
                timeout=10,
            )
        except Exception as e:
            logger.error(f"Telegram send failed: {e}")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )
    Watchdog().run()
```

---

<a id="prompt-51"></a>
# PROMPT 51: Multi-Mac Coordination & Agent Memory System

## Multi-Mac Distribution Strategy

When the Mac Studio M4 Ultra (128GB) arrives, the distribution logic is:

| Agent | Mac Mini M4 Pro (36GB) | Mac Studio M4 Ultra (128GB) | Why |
|-------|----------------------|---------------------------|-----|
| Enricher | Initial home | **Migrate here** | Benefits from larger models (70B+) on 128GB RAM |
| Researcher | Initial home | **Migrate here** | Web research + large context benefits from Ultra |
| Matcher | Initial home | **Migrate here** | Complex matching needs biggest model possible |
| Scout | Initial home | Stay on Mini | Low-stakes, small model is fine |
| Logger | Initial home | Stay on Mini | Summarization, small model is fine |
| Chief of Staff | Either (uses cloud API) | Stay on Mini | Uses Claude API, not local models — doesn't need GPU |
| Watchdog | Both machines | Both machines | Each machine runs its own watchdog instance |

**Key principle:** No direct Mac-to-Mac communication. Both machines talk to the same Neon PostgreSQL database. The database is the coordination layer.

---

## Coordination Tables

### `agent_registry` — Who runs where

```sql
CREATE TABLE IF NOT EXISTS agent_registry (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL UNIQUE,
  host_machine TEXT NOT NULL,              -- 'mac-mini-m4-pro' or 'mac-studio-m4-ultra'
  status TEXT NOT NULL DEFAULT 'stopped',  -- 'running', 'stopped', 'migrating', 'error'
  started_at TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ,
  ollama_model TEXT,                       -- current model assignment
  config_version TEXT,                     -- matches agent config file version
  instruction_version TEXT,                -- matches instruction .md version header
  pid INTEGER,                             -- OS process ID (for debugging)
  memory_mb INTEGER,                       -- last reported memory usage
  cycles_completed INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with initial assignments
INSERT INTO agent_registry (agent_name, host_machine, status) VALUES
  ('enricher', 'mac-mini-m4-pro', 'stopped'),
  ('researcher', 'mac-mini-m4-pro', 'stopped'),
  ('matcher', 'mac-mini-m4-pro', 'stopped'),
  ('scout', 'mac-mini-m4-pro', 'stopped'),
  ('logger', 'mac-mini-m4-pro', 'stopped'),
  ('chief-of-staff', 'mac-mini-m4-pro', 'stopped')
ON CONFLICT (agent_name) DO NOTHING;

CREATE INDEX idx_agent_registry_host ON agent_registry(host_machine);
CREATE INDEX idx_agent_registry_status ON agent_registry(status);
```

### `agent_locks` — Prevent dual-running

```sql
CREATE TABLE IF NOT EXISTS agent_locks (
  id SERIAL PRIMARY KEY,
  agent_name TEXT NOT NULL UNIQUE,
  locked_by_host TEXT NOT NULL,
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lock_expires_at TIMESTAMPTZ NOT NULL,    -- 5x cycle time (e.g., enricher: 75 min)
  lock_token UUID NOT NULL DEFAULT gen_random_uuid(),
  cycle_id TEXT,                           -- current cycle identifier
  CONSTRAINT fk_agent_lock_registry
    FOREIGN KEY (agent_name) REFERENCES agent_registry(agent_name)
);

CREATE INDEX idx_agent_locks_expires ON agent_locks(lock_expires_at);
```

### Lock Protocol

```python
# shared/agent_lock.py
"""
Distributed agent locking via PostgreSQL.
Ensures only one machine runs a given agent at any time.
"""

import uuid
import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("iecrm.lock")


class AgentLock:
    def __init__(self, api_client, agent_name: str, host_machine: str, cycle_minutes: int):
        self.api = api_client
        self.agent_name = agent_name
        self.host = host_machine
        self.lock_duration = timedelta(minutes=cycle_minutes * 5)
        self.lock_token = str(uuid.uuid4())
        self._held = False

    def acquire(self) -> bool:
        """
        Attempt to acquire lock. Returns True if successful.
        Uses INSERT ... ON CONFLICT with expiration check for atomic acquisition.
        """
        now = datetime.now(timezone.utc)
        expires = now + self.lock_duration

        # Atomic: insert if not exists, or update if expired
        result = self.api._request("POST", "/api/db/query", data={
            "sql": """
                INSERT INTO agent_locks (agent_name, locked_by_host, locked_at, lock_expires_at, lock_token)
                VALUES ($1, $2, $3, $4, $5::uuid)
                ON CONFLICT (agent_name) DO UPDATE
                SET locked_by_host = $2,
                    locked_at = $3,
                    lock_expires_at = $4,
                    lock_token = $5::uuid
                WHERE agent_locks.lock_expires_at < $3
                   OR agent_locks.locked_by_host = $2
                RETURNING lock_token
            """,
            "params": [self.agent_name, self.host, now.isoformat(), expires.isoformat(), self.lock_token],
        })

        rows = result.get("rows", [])
        if rows and str(rows[0].get("lock_token")) == self.lock_token:
            self._held = True
            logger.info(f"Lock acquired for {self.agent_name} on {self.host}")
            return True

        logger.warning(f"Lock NOT acquired for {self.agent_name} — another host holds it")
        return False

    def release(self):
        """Release lock only if we hold it (safe release via token check)."""
        if not self._held:
            return

        self.api._request("POST", "/api/db/query", data={
            "sql": "DELETE FROM agent_locks WHERE agent_name = $1 AND lock_token = $2::uuid",
            "params": [self.agent_name, self.lock_token],
        })
        self._held = False
        logger.info(f"Lock released for {self.agent_name}")

    def renew(self):
        """Extend lock expiration (call during long cycles)."""
        if not self._held:
            return False

        now = datetime.now(timezone.utc)
        new_expires = now + self.lock_duration

        result = self.api._request("POST", "/api/db/query", data={
            "sql": """
                UPDATE agent_locks
                SET lock_expires_at = $1
                WHERE agent_name = $2 AND lock_token = $3::uuid
                RETURNING agent_name
            """,
            "params": [new_expires.isoformat(), self.agent_name, self.lock_token],
        })

        return len(result.get("rows", [])) > 0

    def __enter__(self):
        if not self.acquire():
            raise LockNotAcquired(f"Cannot acquire lock for {self.agent_name}")
        return self

    def __exit__(self, *args):
        self.release()


class LockNotAcquired(Exception):
    pass
```

### Agent Migration Protocol (zero-downtime)

```
MIGRATE AGENT FROM MAC MINI → MAC STUDIO:

1. PREPARE (on Mac Studio):
   a. Copy /AI-Agents/ folder (rsync)
   b. Install PM2, Python deps, Ollama
   c. Pull required Ollama models
   d. Update supervisor-config.json: host.machine_id = "mac-studio-m4-ultra"
   e. Test: run agent in dry-run mode (no sandbox submissions)

2. SWITCH (coordinated):
   a. Update agent_registry: SET status = 'migrating'
   b. On Mac Mini: pm2 stop enricher
   c. Wait for current cycle to complete (check lock release)
   d. On Mac Studio: pm2 start enricher
   e. New instance acquires lock (old lock expired or released)
   f. Update agent_registry: SET host_machine = 'mac-studio-m4-ultra', status = 'running'

3. VERIFY:
   a. Watch first 2 cycles on Studio — check heartbeats
   b. If healthy: delete agent from Mini's PM2 ecosystem
   c. If unhealthy: rollback (stop on Studio, start on Mini)

4. CLEANUP:
   a. Remove agent config from Mini's ecosystem.config.js
   b. Move Mini's memory files to archive (keep 7 days)
   c. Update shared priority-board.json with new host info
```

---

## Agent Memory System

### Per-Agent Memory Files

#### `cycle-log.jsonl` — Append-only cycle history

```jsonl
{"cycle_id":"20260315T060000","started_at":"2026-03-15T06:00:00Z","duration_s":342.1,"items_processed":4,"items_submitted":3,"token_stats":{"tokens_in":12400,"tokens_out":3200,"model":"qwen3.5-32b","using_fallback":false},"errors":[]}
{"cycle_id":"20260315T061500","started_at":"2026-03-15T06:15:00Z","duration_s":198.7,"items_processed":2,"items_submitted":1,"token_stats":{"tokens_in":8100,"tokens_out":1900,"model":"qwen3.5-32b","using_fallback":false},"errors":["NeverBounce API timeout on item_id=abc123"]}
```

#### `learned-patterns.md` — Written by Chief of Staff

```markdown
## Version: 1.2.0 | Updated: 2026-03-15 | By: chief-of-staff

### Patterns to Follow
- **CT Corporation = registered agent.** When Open Corporates shows CT Corp, CSC Global,
  National Registered Agents, or InCorp as registered agent, SKIP that name. Search for
  the LLC's Manager/Member instead via California SOS business search.
- **Riverside County LLCs** often have the actual owner listed as "Manager" not "Member."
  Check both fields.
- **Email pattern for IE industrial owners:** Many use firstname@companyname.com format.
  If company website exists, try that pattern before paid lookups.

### Patterns to Avoid
- DO NOT submit contacts where the only source is a 3+ year old White Pages listing
  with no corroborating data. Minimum: 2 sources, at least one < 12 months old.
- DO NOT use BeenVerified "possible associates" as the contact — only use the
  primary person result.

### Confidence Calibration Notes
- Your confidence scores trend 10-15 points too high when only 1 source confirms.
  Aim for: 1 source = max 55, 2 sources = max 75, 3+ sources = up to 95.
```

#### `error-journal.md` — Auto-updated by agent on errors

```markdown
## Error Journal — Enricher

### 2026-03-15
- **NeverBounce timeout** on 2 of 5 items. Cause: NeverBounce API slow (>30s response).
  Resolution: Increased tool timeout to 45s. If persists, will skip email verification
  and note "unverified" in submission.
- **Ollama connection refused** at 06:15. Watchdog restarted Ollama at 06:16. Lost 1 cycle.

### 2026-03-14
- **Duplicate submission** for "Pacific Industrial Holdings LLC" — CRM already had this
  entity. Root cause: duplicate check query was matching on exact name only, not fuzzy.
  Resolution: Added fuzzy name check (first 5 chars + same city).
```

#### `performance-stats.json` — Rolling metrics

```json
{
  "last_updated": "2026-03-15T23:00:00Z",
  "rolling_7d": {
    "cycles_completed": 672,
    "items_processed": 1890,
    "items_submitted": 1245,
    "submission_rate": 0.659,
    "approval_rate": 0.72,
    "avg_confidence_submitted": 68.3,
    "avg_confidence_approved": 74.1,
    "avg_confidence_rejected": 52.8,
    "avg_cycle_duration_s": 285,
    "total_tokens_in": 4200000,
    "total_tokens_out": 890000,
    "errors": 12,
    "timeouts": 3
  },
  "rolling_30d": {
    "cycles_completed": 2880,
    "items_processed": 7800,
    "items_submitted": 5100,
    "approval_rate": 0.74,
    "trend": "improving"
  }
}
```

### Shared Memory Files

#### `entity-cache.json` — Local mirror of entity_context_cache

```json
{
  "last_sync": "2026-03-15T06:00:00Z",
  "sync_source": "api",
  "entities": {
    "prop_abc123": {
      "property_address": "1234 Industrial Way, Fontana, CA 92335",
      "owner_name": "Pacific Industrial Holdings LLC",
      "priority": "Hot",
      "tpe_score": 78,
      "last_enriched": "2026-03-14",
      "active_signals": 2
    }
  },
  "stale": false
}
```

#### `priority-board.json` — Assignments from human/Chief of Staff

```json
{
  "last_sync": "2026-03-15T06:00:00Z",
  "assignments": [
    {
      "id": "pb_001",
      "agent": "enricher",
      "item_type": "llc_lookup",
      "target": "Inland Logistics Partners LLC",
      "property_id": "prop_xyz789",
      "assigned_by": "chief-of-staff",
      "priority": "high",
      "deadline": "2026-03-16T12:00:00Z",
      "notes": "David flagged this — needs owner contact before Friday call"
    }
  ]
}
```

### Memory Sync Protocol

```python
# shared/memory_sync.py
"""
Sync local memory files with CRM API (source of truth).
Called at cycle start (pull) and cycle end (push).
"""

import json
import logging
from pathlib import Path
from datetime import datetime, timezone

logger = logging.getLogger("iecrm.memory_sync")


class MemorySync:
    def __init__(self, api_client, agent_name: str):
        self.api = api_client
        self.agent_name = agent_name
        self.shared_dir = Path("/AI-Agents/memory/shared")
        self.agent_dir = Path(f"/AI-Agents/memory/{agent_name}")

    def pull(self):
        """Pull latest shared memory from CRM API. Called at cycle start."""
        synced = []
        now = datetime.now(timezone.utc).isoformat()

        # Priority board
        try:
            board = self.api._request("GET", "/api/ai/priority-board")
            data = {"last_sync": now, "sync_source": "api", "assignments": board.get("items", [])}
            (self.shared_dir / "priority-board.json").write_text(json.dumps(data, indent=2))
            synced.append("priority-board")
        except Exception as e:
            logger.warning(f"Failed to sync priority board: {e}")
            self._mark_stale("priority-board.json")

        # Entity cache (only entities relevant to this agent)
        try:
            cache = self.api._request("GET", f"/api/ai/entity-cache", params={"agent": self.agent_name})
            data = {"last_sync": now, "sync_source": "api", "entities": cache.get("entities", {}), "stale": False}
            (self.shared_dir / "entity-cache.json").write_text(json.dumps(data, indent=2))
            synced.append("entity-cache")
        except Exception as e:
            logger.warning(f"Failed to sync entity cache: {e}")
            self._mark_stale("entity-cache.json")

        # Market regime
        try:
            regime = self.api._request("GET", "/api/ai/market-regime")
            data = {"last_sync": now, "sync_source": "api", "regimes": regime.get("regimes", {})}
            (self.shared_dir / "market-regime.json").write_text(json.dumps(data, indent=2))
            synced.append("market-regime")
        except Exception as e:
            logger.warning(f"Failed to sync market regime: {e}")

        # Active bounties
        try:
            bounties = self.api._request("GET", "/api/ai/active-bounties")
            data = {"last_sync": now, "sync_source": "api", "bounties": bounties.get("bounties", [])}
            (self.shared_dir / "active-bounties.json").write_text(json.dumps(data, indent=2))
            synced.append("active-bounties")
        except Exception as e:
            logger.warning(f"Failed to sync active bounties: {e}")

        logger.info(f"Memory pull complete: synced {synced}")
        return synced

    def push(self, cycle_stats: dict):
        """Push agent stats and updates to CRM API. Called at cycle end."""
        pushed = []

        # Update agent registry
        try:
            self.api._request("POST", "/api/ai/registry/update", data={
                "agent_name": self.agent_name,
                "status": "running",
                "last_heartbeat": datetime.now(timezone.utc).isoformat(),
                "cycles_completed_increment": 1,
                "memory_mb": cycle_stats.get("memory_mb", 0),
            })
            pushed.append("registry")
        except Exception as e:
            logger.warning(f"Failed to push registry update: {e}")

        # Push performance stats
        try:
            stats_path = self.agent_dir / "performance-stats.json"
            if stats_path.exists():
                stats = json.loads(stats_path.read_text())
                self.api._request("POST", "/api/ai/performance-stats", data={
                    "agent_name": self.agent_name,
                    "stats": stats,
                })
                pushed.append("performance-stats")
        except Exception as e:
            logger.warning(f"Failed to push performance stats: {e}")

        logger.info(f"Memory push complete: pushed {pushed}")
        return pushed

    def _mark_stale(self, filename: str):
        """Mark a shared memory file as stale (API was unreachable)."""
        path = self.shared_dir / filename
        if path.exists():
            try:
                data = json.loads(path.read_text())
                data["stale"] = True
                data["stale_since"] = datetime.now(timezone.utc).isoformat()
                path.write_text(json.dumps(data, indent=2))
            except Exception:
                pass
```

---

## Chief of Staff Instruction Versioning

### Version Header Format

Every instruction file starts with:
```markdown
## Version: 1.3.2 | Updated: 2026-03-15 | By: chief-of-staff
## Previous: 1.3.1 | Reason: Adjusted confidence calibration per feedback digest
```

### Versioning Protocol

```python
# Used by chief_of_staff_agent.py when updating instructions

import re
import shutil
from pathlib import Path
from datetime import datetime

INSTRUCTIONS_DIR = Path("/AI-Agents/instructions")
ARCHIVE_DIR = Path("/AI-Agents/instructions/archive")
MAX_ARCHIVE_VERSIONS = 5


def update_instruction(agent_name: str, new_content: str, reason: str):
    """
    Update an agent's instruction file with version control.
    1. Parse current version
    2. Archive current file
    3. Write new file with incremented version
    4. Prune old archives (keep last 5)
    """
    instruction_path = INSTRUCTIONS_DIR / f"{agent_name}.md"
    archive_path = ARCHIVE_DIR / agent_name
    archive_path.mkdir(parents=True, exist_ok=True)

    # Parse current version
    current_version = "1.0.0"
    if instruction_path.exists():
        content = instruction_path.read_text()
        match = re.search(r"Version:\s*([\d.]+)", content)
        if match:
            current_version = match.group(1)

    # Increment patch version
    parts = current_version.split(".")
    parts[-1] = str(int(parts[-1]) + 1)
    new_version = ".".join(parts)

    # Archive current version
    if instruction_path.exists():
        archive_file = archive_path / f"{agent_name}-v{current_version}.md"
        shutil.copy2(instruction_path, archive_file)

    # Write new version with header
    today = datetime.now().strftime("%Y-%m-%d")
    header = (
        f"## Version: {new_version} | Updated: {today} | By: chief-of-staff\n"
        f"## Previous: {current_version} | Reason: {reason}\n\n"
    )

    # Remove old header from new_content if present
    new_content_clean = re.sub(r"^## Version:.*\n(## Previous:.*\n)?", "", new_content).lstrip()
    instruction_path.write_text(header + new_content_clean)

    # Prune old archives (keep last MAX_ARCHIVE_VERSIONS)
    archives = sorted(archive_path.glob(f"{agent_name}-v*.md"))
    if len(archives) > MAX_ARCHIVE_VERSIONS:
        for old in archives[:-MAX_ARCHIVE_VERSIONS]:
            old.unlink()

    return new_version


def rollback_instruction(agent_name: str, target_version: str = None):
    """
    Rollback to a previous instruction version.
    If target_version is None, rolls back to the most recent archive.
    """
    archive_path = ARCHIVE_DIR / agent_name
    instruction_path = INSTRUCTIONS_DIR / f"{agent_name}.md"

    if target_version:
        target_file = archive_path / f"{agent_name}-v{target_version}.md"
    else:
        archives = sorted(archive_path.glob(f"{agent_name}-v*.md"))
        if not archives:
            raise FileNotFoundError(f"No archive versions found for {agent_name}")
        target_file = archives[-1]

    if not target_file.exists():
        raise FileNotFoundError(f"Archive version not found: {target_file}")

    # Archive current before rollback
    if instruction_path.exists():
        content = instruction_path.read_text()
        match = re.search(r"Version:\s*([\d.]+)", content)
        current_v = match.group(1) if match else "unknown"
        shutil.copy2(instruction_path, archive_path / f"{agent_name}-v{current_v}.md")

    # Restore
    shutil.copy2(target_file, instruction_path)
    return target_version or target_file.stem.split("-v")[-1]
```

### Canary Test Before Instruction Update

Before the Chief of Staff commits an instruction change, it runs a canary test:

```python
def canary_test(agent_name: str, new_instructions: str, test_items: list) -> dict:
    """
    Run the agent with new instructions against known test items.
    Compare output quality before committing the change.
    """
    # Load agent config
    with open(f"/AI-Agents/config/agents/{agent_name}.json") as f:
        agent_cfg = json.load(f)
    with open("/AI-Agents/config/supervisor-config.json") as f:
        supervisor_cfg = json.load(f)

    # Create LLM client with NEW instructions
    llm = OllamaClient(f"{agent_name}-canary", agent_cfg, supervisor_cfg)
    llm.system_prompt = new_instructions
    llm.reset_conversation()

    results = []
    for item in test_items:
        llm.reset_conversation()
        response = llm.chat(
            f"Process this item: {json.dumps(item['input'])}",
            json_mode=True,
        )
        try:
            output = json.loads(response)
            # Compare against known-good output
            score = compare_output(output, item.get("expected", {}))
            results.append({"item_id": item["id"], "score": score, "passed": score >= 0.7})
        except Exception as e:
            results.append({"item_id": item["id"], "score": 0, "passed": False, "error": str(e)})

    pass_rate = sum(1 for r in results if r["passed"]) / len(results) if results else 0
    return {
        "pass_rate": pass_rate,
        "results": results,
        "recommendation": "APPLY" if pass_rate >= 0.8 else "REJECT",
    }
```

---

<a id="prompt-52"></a>
# PROMPT 52: CRM Workflow Pages (Action Items Enhancement, Comps Enhancement, TPE Visualization)

## Current State Assessment

Reading the existing codebase reveals:

- **Action Items** (`ie-crm/src/pages/ActionItems.jsx`): Already exists with a Reminders/Apple-style task list UI, status toggles, assignee tabs (Dave, Missy, David Jr, Houston), and due date filtering. **Not using CrmTable** — uses a custom `TaskRow` component instead. Detail panel exists at `ActionItemDetail.jsx`.

- **Comps** (`ie-crm/src/pages/Comps.jsx`): Already exists with both Lease and Sale tab views using `CrmTable`, full column definitions, linked property/company chips, bulk delete, source color coding. Detail panel at `CompDetail.jsx`.

- **TPE Visualization**: Does not exist. No component, no API endpoint, no database query.

Given this, Prompt 52 focuses on:
1. **Action Items enhancement** — adding AI source attribution, entity linking UI, and Houston filter improvements
2. **Comps enhancement** — adding comp analysis/aggregation panels, submarket filtering
3. **TPE Visualization** — entirely new component + page

---

## 1. Action Items Page Enhancements

### Current Gaps

| Gap | What exists | What's needed |
|-----|-------------|---------------|
| Entity linking display | Junction tables exist (`action_item_contacts`, etc.) | Show linked entities as clickable chips in task rows |
| AI source attribution | `source` field exists, Houston tab exists | Visual badge showing which agent created the item + link to sandbox source |
| Advanced filters | Status filter, assignee tabs | Due date range picker, priority filter, entity type filter |
| Quick snooze | None | One-click "push due_date by 1 day/3 days/1 week" |
| Linked entity detail | None in list view | Inline preview of linked property/contact on hover |

### New API Endpoints

Add to `ie-crm/server/index.js`:

```javascript
// ── Action Items with linked entities ────────────────────
app.get('/api/action-items/enriched', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { limit = 200, offset = 0, orderBy = 'due_date', order = 'ASC',
            status, priority, responsibility, search, due_start, due_end,
            source_type } = req.query;

    let where = [];
    let params = [];
    let i = 1;

    if (status) { where.push(`ai.status = $${i++}`); params.push(status); }
    if (priority === 'high') { where.push(`ai.high_priority = true`); }
    if (responsibility) { where.push(`$${i++} = ANY(ai.responsibility)`); params.push(responsibility); }
    if (search) {
      where.push(`(ai.name ILIKE $${i} OR ai.notes ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (due_start) { where.push(`ai.due_date >= $${i++}`); params.push(due_start); }
    if (due_end) { where.push(`ai.due_date <= $${i++}`); params.push(due_end); }
    if (source_type === 'houston') { where.push(`ai.source LIKE 'houston_%'`); }
    if (source_type === 'manual') { where.push(`(ai.source IS NULL OR ai.source NOT LIKE 'houston_%')`); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Fetch action items with linked entity counts
    const sql = `
      SELECT ai.*,
        (SELECT json_agg(json_build_object(
          'contact_id', c.contact_id, 'full_name', c.full_name, 'type', c.type
        )) FROM action_item_contacts aic
        JOIN contacts c ON c.contact_id = aic.contact_id
        WHERE aic.action_item_id = ai.action_item_id) AS linked_contacts,

        (SELECT json_agg(json_build_object(
          'property_id', p.property_id, 'property_address', p.property_address, 'city', p.city
        )) FROM action_item_properties aip
        JOIN properties p ON p.property_id = aip.property_id
        WHERE aip.action_item_id = ai.action_item_id) AS linked_properties,

        (SELECT json_agg(json_build_object(
          'company_id', co.company_id, 'company_name', co.company_name
        )) FROM action_item_companies aco
        JOIN companies co ON co.company_id = aco.company_id
        WHERE aco.action_item_id = ai.action_item_id) AS linked_companies,

        (SELECT json_agg(json_build_object(
          'deal_id', d.deal_id, 'deal_name', d.deal_name, 'status', d.status
        )) FROM action_item_deals aid
        JOIN deals d ON d.deal_id = aid.deal_id
        WHERE aid.action_item_id = ai.action_item_id) AS linked_deals

      FROM action_items ai
      ${whereClause}
      ORDER BY ${orderBy} ${order}
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(sql, params);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Snooze action item ───────────────────────────────────
app.post('/api/action-items/:id/snooze', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { id } = req.params;
    const { days = 1 } = req.body;

    const result = await pool.query(`
      UPDATE action_items
      SET due_date = COALESCE(due_date, NOW()) + INTERVAL '1 day' * $2,
          updated_at = NOW()
      WHERE action_item_id = $1
      RETURNING *
    `, [id, days]);

    res.json({ row: result.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

### New Database Function

Add to `ie-crm/src/api/database.js`:

```javascript
export async function getActionItemsEnriched(options = {}) {
  const { limit = 200, offset = 0, orderBy = 'due_date', order = 'ASC', filters = {} } = options;
  const params = new URLSearchParams({ limit, offset, orderBy, order });
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.responsibility) params.set('responsibility', filters.responsibility);
  if (filters.search) params.set('search', filters.search);
  if (filters.due_start) params.set('due_start', filters.due_start);
  if (filters.due_end) params.set('due_end', filters.due_end);
  if (filters.source_type) params.set('source_type', filters.source_type);

  return db.fetch(`/api/action-items/enriched?${params}`);
}

export async function snoozeActionItem(id, days = 1) {
  return db.fetch(`/api/action-items/${id}/snooze`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
}
```

### Component Changes for ActionItems.jsx

Key additions to the existing `TaskRow` component:

```jsx
// Add linked entity chips to TaskRow
// After the assignees display, add:

{/* Linked entities */}
{(task.linked_contacts || task.linked_properties) && (
  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
    {task.linked_contacts?.map(c => (
      <span
        key={c.contact_id}
        className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 cursor-pointer hover:brightness-125"
        onClick={(e) => { e.stopPropagation(); slideOver.open('contact', c.contact_id); }}
        title={c.full_name}
      >
        {c.full_name}
      </span>
    ))}
    {task.linked_properties?.map(p => (
      <span
        key={p.property_id}
        className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-400 cursor-pointer hover:brightness-125"
        onClick={(e) => { e.stopPropagation(); slideOver.open('property', p.property_id); }}
        title={p.property_address}
      >
        {p.property_address?.split(',')[0]}
      </span>
    ))}
    {task.linked_companies?.map(co => (
      <span
        key={co.company_id}
        className="text-[10px] px-1.5 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 cursor-pointer hover:brightness-125"
        onClick={(e) => { e.stopPropagation(); slideOver.open('company', co.company_id); }}
        title={co.company_name}
      >
        {co.company_name}
      </span>
    ))}
  </div>
)}

// Add snooze quick action menu (in TaskRow or ActionItemDetail):
const SNOOZE_OPTIONS = [
  { label: 'Tomorrow', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
  { label: 'Next Monday', days: null },  // calculate dynamically
];
```

---

## 2. Comps Page Enhancements

### Comp Analysis Panel

The existing Comps page has full list views. What's missing is an **analytics summary panel** that shows aggregate statistics.

### New Component: `CompAnalyticsPanel.jsx`

**File path:** `ie-crm/src/components/shared/CompAnalyticsPanel.jsx`

```jsx
// CompAnalyticsPanel — shows aggregate comp stats above the table
// Rendered in Comps.jsx between the filter bar and the CrmTable

import React, { useMemo } from 'react';

export default function CompAnalyticsPanel({ rows, activeTab }) {
  const stats = useMemo(() => {
    if (!rows.length) return null;

    if (activeTab === 'lease') {
      const rates = rows.filter(r => r.rate).map(r => parseFloat(r.rate));
      const sizes = rows.filter(r => r.sf).map(r => parseInt(r.sf));
      const terms = rows.filter(r => r.term_months).map(r => parseInt(r.term_months));

      // Group by submarket (using linked property city as proxy)
      const byCity = {};
      rows.forEach(r => {
        const city = r.linked_property_city || 'Unknown';
        if (!byCity[city]) byCity[city] = [];
        if (r.rate) byCity[city].push(parseFloat(r.rate));
      });

      return {
        type: 'lease',
        count: rows.length,
        avgRate: rates.length ? (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2) : null,
        medianRate: rates.length ? rates.sort((a, b) => a - b)[Math.floor(rates.length / 2)].toFixed(2) : null,
        avgSf: sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length).toLocaleString() : null,
        avgTerm: terms.length ? Math.round(terms.reduce((a, b) => a + b, 0) / terms.length) : null,
        byCity: Object.entries(byCity).map(([city, rates]) => ({
          city,
          count: rates.length,
          avgRate: (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2),
        })).sort((a, b) => b.count - a.count).slice(0, 5),
      };
    }

    // Sale comps
    const prices = rows.filter(r => r.sale_price).map(r => parseFloat(r.sale_price));
    const ppsf = rows.filter(r => r.price_psf).map(r => parseFloat(r.price_psf));
    const caps = rows.filter(r => r.cap_rate).map(r => parseFloat(r.cap_rate));

    return {
      type: 'sale',
      count: rows.length,
      avgPrice: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null,
      avgPpsf: ppsf.length ? (ppsf.reduce((a, b) => a + b, 0) / ppsf.length).toFixed(2) : null,
      avgCapRate: caps.length ? (caps.reduce((a, b) => a + b, 0) / caps.length).toFixed(2) : null,
      medianCapRate: caps.length ? caps.sort((a, b) => a - b)[Math.floor(caps.length / 2)].toFixed(2) : null,
    };
  }, [rows, activeTab]);

  if (!stats) return null;

  return (
    <div className="flex gap-3 px-4 py-2 overflow-x-auto">
      <StatCard label="Total Comps" value={stats.count} />
      {stats.type === 'lease' ? (
        <>
          <StatCard label="Avg Rate" value={stats.avgRate ? `$${stats.avgRate}/SF/mo` : '--'} />
          <StatCard label="Median Rate" value={stats.medianRate ? `$${stats.medianRate}/SF/mo` : '--'} />
          <StatCard label="Avg Size" value={stats.avgSf ? `${stats.avgSf} SF` : '--'} />
          <StatCard label="Avg Term" value={stats.avgTerm ? `${stats.avgTerm} mo` : '--'} />
        </>
      ) : (
        <>
          <StatCard label="Avg Price" value={stats.avgPrice ? `$${stats.avgPrice.toLocaleString()}` : '--'} />
          <StatCard label="Avg $/SF" value={stats.avgPpsf ? `$${stats.avgPpsf}` : '--'} />
          <StatCard label="Avg Cap Rate" value={stats.avgCapRate ? `${stats.avgCapRate}%` : '--'} />
          <StatCard label="Median Cap Rate" value={stats.medianCapRate ? `${stats.medianCapRate}%` : '--'} />
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-crm-card/60 backdrop-blur-md border border-crm-border/30 rounded-xl px-4 py-2 min-w-[120px]">
      <div className="text-[11px] text-crm-muted uppercase tracking-wider">{label}</div>
      <div className="text-lg font-semibold text-crm-text mt-0.5">{value}</div>
    </div>
  );
}
```

### Additional Filters for Comps

Add submarket/city filter and date range filter to the existing Comps.jsx filter bar:

```jsx
// Add to Comps.jsx filter bar (alongside existing property_type filter):

// City/Submarket filter
const [filterCity, setFilterCity] = useState('');
const cities = useMemo(() => {
  const set = new Set(rows.map(r => r.linked_property_city).filter(Boolean));
  return [...set].sort();
}, [rows]);

// Date range filter
const [dateStart, setDateStart] = useState('');
const [dateEnd, setDateEnd] = useState('');

// Add to fetchData filters:
if (filterCity) filters.city = filterCity;
if (dateStart) filters.date_start = dateStart;
if (dateEnd) filters.date_end = dateEnd;
```

---

## 3. TPE Visualization Component (New)

### Overview

The Transaction Probability Engine (TPE) score is a 0-100 composite score for each property, calculated from 6 weighted categories. This component visualizes that score with drill-down capability.

### TPE Score Categories (from Prompt 35 design)

| Category | Weight | Factors |
|----------|--------|---------|
| Owner Profile | 20% | Holding period, out-of-area owner, entity type, owner age |
| Financial Signals | 25% | Loan maturity, NOI trend, cap rate vs market, distress indicators |
| Market Context | 15% | Submarket vacancy trend, absorption, rent growth, new supply |
| Property Attributes | 15% | Building age, deferred maintenance, functional obsolescence |
| Engagement History | 15% | Contact frequency, response rate, meeting history |
| External Triggers | 10% | Lease expirations, tenant news, zoning changes |

### Component File: `ie-crm/src/components/shared/TpeScoreCard.jsx`

```jsx
import React, { useState, useMemo } from 'react';

const CATEGORIES = [
  { key: 'owner_profile', label: 'Owner Profile', color: '#3b82f6', weight: 0.20 },
  { key: 'financial_signals', label: 'Financial Signals', color: '#10b981', weight: 0.25 },
  { key: 'market_context', label: 'Market Context', color: '#f59e0b', weight: 0.15 },
  { key: 'property_attributes', label: 'Property Attrs', color: '#8b5cf6', weight: 0.15 },
  { key: 'engagement_history', label: 'Engagement', color: '#ec4899', weight: 0.15 },
  { key: 'external_triggers', label: 'External Triggers', color: '#ef4444', weight: 0.10 },
];

function scoreColor(score) {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBg(score) {
  if (score >= 70) return 'bg-green-500/15';
  if (score >= 40) return 'bg-yellow-500/15';
  return 'bg-red-500/15';
}

export default function TpeScoreCard({ tpeData, compact = false }) {
  const [expanded, setExpanded] = useState(false);

  if (!tpeData || tpeData.overall_score === null || tpeData.overall_score === undefined) {
    return (
      <div className="bg-crm-card/60 backdrop-blur-md border border-crm-border/30 rounded-xl p-4">
        <div className="text-sm text-crm-muted">TPE Score not calculated</div>
        <div className="text-xs text-crm-muted mt-1">
          Missing data prevents score calculation.
          {tpeData?.missing_data && (
            <span> Needed: {tpeData.missing_data.join(', ')}</span>
          )}
        </div>
      </div>
    );
  }

  const { overall_score, category_scores, top_factors, improvement_suggestions,
          previous_score, calculated_at } = tpeData;

  const trend = previous_score !== null && previous_score !== undefined
    ? overall_score - previous_score
    : null;

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg cursor-pointer ${scoreBg(overall_score)}`}
        onClick={() => setExpanded(!expanded)}
        title="Transaction Probability Engine score"
      >
        <span className={`text-sm font-bold ${scoreColor(overall_score)}`}>
          {overall_score}
        </span>
        {trend !== null && (
          <span className={`text-[10px] ${trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-crm-muted'}`}>
            {trend > 0 ? '+' : ''}{trend}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="bg-crm-card/60 backdrop-blur-md border border-crm-border/30 rounded-xl p-4">
      {/* Header: Overall score */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-xs text-crm-muted uppercase tracking-wider">TPE Score</div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${scoreColor(overall_score)}`}>
              {overall_score}
            </span>
            <span className="text-crm-muted text-sm">/100</span>
            {trend !== null && (
              <span className={`text-sm font-medium ${trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-crm-muted'}`}>
                {trend > 0 ? '\u2191' : trend < 0 ? '\u2193' : '\u2192'}{' '}
                {Math.abs(trend)} pts
              </span>
            )}
          </div>
          {calculated_at && (
            <div className="text-[10px] text-crm-muted mt-0.5">
              Calculated {new Date(calculated_at).toLocaleDateString()}
            </div>
          )}
        </div>

        {/* Donut chart */}
        <DonutChart categoryScores={category_scores} size={80} />
      </div>

      {/* Category breakdown bars */}
      <div className="space-y-2 mb-4">
        {CATEGORIES.map(cat => {
          const score = category_scores?.[cat.key] ?? 0;
          return (
            <div key={cat.key} className="flex items-center gap-2">
              <div className="w-[100px] text-xs text-crm-muted truncate">{cat.label}</div>
              <div className="flex-1 h-2 bg-crm-border/30 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${score}%`, backgroundColor: cat.color }}
                />
              </div>
              <div className={`w-8 text-right text-xs font-medium ${scoreColor(score)}`}>
                {score}
              </div>
            </div>
          );
        })}
      </div>

      {/* Top factors driving this score */}
      {top_factors?.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-crm-muted uppercase tracking-wider mb-1">
            What's driving this score
          </div>
          <ul className="space-y-1">
            {top_factors.slice(0, 3).map((factor, i) => (
              <li key={i} className="text-xs text-crm-text flex items-start gap-1.5">
                <span className={factor.impact > 0 ? 'text-green-400' : 'text-red-400'}>
                  {factor.impact > 0 ? '+' : ''}{factor.impact}
                </span>
                <span>{factor.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvement suggestions */}
      {improvement_suggestions?.length > 0 && (
        <div>
          <div className="text-xs text-crm-muted uppercase tracking-wider mb-1">
            What would improve this score
          </div>
          <ul className="space-y-1">
            {improvement_suggestions.slice(0, 3).map((suggestion, i) => (
              <li key={i} className="text-xs text-crm-muted flex items-start gap-1.5">
                <span className="text-blue-400">+{suggestion.potential_impact}</span>
                <span>{suggestion.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


function DonutChart({ categoryScores, size = 80 }) {
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background circle */}
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="var(--crm-border)" strokeWidth="6" opacity="0.3"
      />
      {/* Category arcs */}
      {CATEGORIES.map(cat => {
        const score = categoryScores?.[cat.key] ?? 0;
        const arcLength = (cat.weight * score / 100) * circumference;
        const offset = circumference - cumulativeOffset;
        cumulativeOffset += cat.weight * circumference;

        return (
          <circle
            key={cat.key}
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={cat.color} strokeWidth="6"
            strokeDasharray={`${arcLength} ${circumference - arcLength}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
      })}
    </svg>
  );
}
```

### TPE Dashboard Page: `ie-crm/src/pages/TpeDashboard.jsx`

```jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getTpeScores } from '../api/database';
import CrmTable from '../components/shared/CrmTable';
import TpeScoreCard from '../components/shared/TpeScoreCard';
import useColumnVisibility from '../hooks/useColumnVisibility';
import ColumnToggleMenu from '../components/shared/ColumnToggleMenu';
import { useSlideOver } from '../components/shared/SlideOverContext';

const TPE_COLUMNS = [
  {
    key: 'property_address', label: 'Property', defaultWidth: 200,
    renderCell: (val, row) => (
      <span className="text-crm-text truncate">{val || '--'}</span>
    ),
  },
  { key: 'city', label: 'City', defaultWidth: 100 },
  { key: 'property_type', label: 'Type', defaultWidth: 100 },
  {
    key: 'tpe_score', label: 'TPE Score', defaultWidth: 90,
    renderCell: (val) => {
      if (val === null || val === undefined) return <span className="text-crm-muted">--</span>;
      const color = val >= 70 ? 'text-green-400 bg-green-500/15'
                  : val >= 40 ? 'text-yellow-400 bg-yellow-500/15'
                  : 'text-red-400 bg-red-500/15';
      return (
        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${color}`}>{val}</span>
      );
    },
  },
  {
    key: 'tpe_trend', label: 'Trend', defaultWidth: 60,
    renderCell: (val) => {
      if (!val) return <span className="text-crm-muted">--</span>;
      return (
        <span className={val > 0 ? 'text-green-400' : val < 0 ? 'text-red-400' : 'text-crm-muted'}>
          {val > 0 ? '+' : ''}{val}
        </span>
      );
    },
  },
  { key: 'owner_name', label: 'Owner', defaultWidth: 140 },
  { key: 'submarket_name', label: 'Submarket', defaultWidth: 120 },
  { key: 'rba', label: 'Bldg SF', defaultWidth: 80, format: 'number' },
  {
    key: 'top_factor', label: 'Top Factor', defaultWidth: 200,
    renderCell: (val) => (
      <span className="text-xs text-crm-muted truncate">{val || '--'}</span>
    ),
  },
  { key: 'calculated_at', label: 'Last Calculated', defaultWidth: 110, format: 'date' },
  { key: 'priority', label: 'Priority', defaultWidth: 80, format: 'priority' },
];

export default function TpeDashboard() {
  const { open } = useSlideOver();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterScoreRange, setFilterScoreRange] = useState('');
  const [orderBy, setOrderBy] = useState('tpe_score');
  const [order, setOrder] = useState('DESC');
  const [selectedProperty, setSelectedProperty] = useState(null);
  const vis = useColumnVisibility('tpe_dashboard', TPE_COLUMNS);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {};
      if (search) filters.search = search;
      if (filterType) filters.property_type = filterType;
      if (filterScoreRange) {
        const [min, max] = filterScoreRange.split('-').map(Number);
        filters.score_min = min;
        filters.score_max = max;
      }
      const result = await getTpeScores({ limit: 500, orderBy, order, filters });
      setRows(result.rows || []);
    } catch (err) {
      console.error('Failed to fetch TPE scores:', err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [search, filterType, filterScoreRange, orderBy, order]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Summary stats
  const stats = useMemo(() => {
    if (!rows.length) return null;
    const scores = rows.filter(r => r.tpe_score !== null).map(r => r.tpe_score);
    return {
      total: rows.length,
      scored: scores.length,
      avg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      hot: scores.filter(s => s >= 70).length,
      warm: scores.filter(s => s >= 40 && s < 70).length,
      cold: scores.filter(s => s < 40).length,
    };
  }, [rows]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pt-4 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-crm-text">TPE Dashboard</h1>
          <p className="text-xs text-crm-muted mt-0.5">
            Transaction Probability Engine — ranked property opportunities
          </p>
        </div>
        <ColumnToggleMenu columns={TPE_COLUMNS} {...vis} />
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="flex gap-3 px-5 py-2 overflow-x-auto">
          <StatCard label="Total Properties" value={stats.total} />
          <StatCard label="Avg Score" value={stats.avg} />
          <StatCard label="Hot (70+)" value={stats.hot} accent="green" />
          <StatCard label="Warm (40-69)" value={stats.warm} accent="yellow" />
          <StatCard label="Cold (<40)" value={stats.cold} accent="red" />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 px-5 py-2">
        <input
          type="text"
          placeholder="Search properties..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-crm-card/60 border border-crm-border/30 rounded-lg px-3 py-1.5 text-sm text-crm-text placeholder-crm-muted w-64"
        />
        <select
          value={filterScoreRange}
          onChange={(e) => setFilterScoreRange(e.target.value)}
          className="bg-crm-card/60 border border-crm-border/30 rounded-lg px-3 py-1.5 text-sm text-crm-text"
        >
          <option value="">All Scores</option>
          <option value="70-100">Hot (70-100)</option>
          <option value="40-69">Warm (40-69)</option>
          <option value="0-39">Cold (0-39)</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-5">
        <CrmTable
          columns={vis.visibleColumns}
          rows={rows}
          loading={loading}
          orderBy={orderBy}
          order={order}
          onSort={(key) => {
            if (orderBy === key) setOrder(order === 'ASC' ? 'DESC' : 'ASC');
            else { setOrderBy(key); setOrder('DESC'); }
          }}
          onRowClick={(row) => {
            setSelectedProperty(row);
            open('property', row.property_id);
          }}
        />
      </div>

      {/* Detail panel: TPE breakdown for selected property */}
      {selectedProperty?.tpe_data && (
        <div className="fixed right-0 top-0 w-[360px] h-full bg-crm-sidebar border-l border-crm-border overflow-y-auto p-4 z-30">
          <button
            onClick={() => setSelectedProperty(null)}
            className="text-crm-muted hover:text-crm-text mb-3"
          >
            Close
          </button>
          <h2 className="text-sm font-semibold text-crm-text mb-3">
            {selectedProperty.property_address}
          </h2>
          <TpeScoreCard tpeData={selectedProperty.tpe_data} />
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, accent }) {
  const accentClass = accent === 'green' ? 'text-green-400'
                    : accent === 'yellow' ? 'text-yellow-400'
                    : accent === 'red' ? 'text-red-400'
                    : 'text-crm-text';
  return (
    <div className="bg-crm-card/60 backdrop-blur-md border border-crm-border/30 rounded-xl px-4 py-2 min-w-[100px]">
      <div className="text-[11px] text-crm-muted uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-semibold mt-0.5 ${accentClass}`}>{value}</div>
    </div>
  );
}
```

### TPE API Endpoint

Add to `ie-crm/server/index.js`:

```javascript
// ── TPE Scores ───────────────────────────────────────────
app.get('/api/tpe/scores', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });
  try {
    const { limit = 200, offset = 0, orderBy = 'tpe_score', order = 'DESC',
            search, property_type, score_min, score_max } = req.query;

    let where = [];
    let params = [];
    let i = 1;

    if (search) {
      where.push(`(p.property_address ILIKE $${i} OR p.owner_name ILIKE $${i} OR p.city ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (property_type) { where.push(`p.property_type = $${i++}`); params.push(property_type); }
    if (score_min) { where.push(`ps.overall_score >= $${i++}`); params.push(parseInt(score_min)); }
    if (score_max) { where.push(`ps.overall_score <= $${i++}`); params.push(parseInt(score_max)); }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Join properties with predictive_scores (TPE data)
    const sql = `
      SELECT
        p.property_id,
        p.property_address,
        p.city,
        p.property_type,
        p.owner_name,
        p.submarket_name,
        p.rba,
        p.priority,
        ps.overall_score AS tpe_score,
        ps.previous_score,
        (ps.overall_score - COALESCE(ps.previous_score, ps.overall_score)) AS tpe_trend,
        ps.category_scores,
        ps.top_features AS top_factors,
        ps.improvement_suggestions,
        ps.calculated_at,
        json_build_object(
          'overall_score', ps.overall_score,
          'previous_score', ps.previous_score,
          'category_scores', ps.category_scores,
          'top_factors', ps.top_features,
          'improvement_suggestions', ps.improvement_suggestions,
          'calculated_at', ps.calculated_at,
          'missing_data', ps.missing_data
        ) AS tpe_data,
        (SELECT description FROM unnest(ps.top_features) WITH ORDINALITY AS t(description, impact, ord)
         LIMIT 1) AS top_factor
      FROM properties p
      LEFT JOIN predictive_scores ps ON ps.property_id = p.property_id
        AND ps.score_type = 'tpe'
        AND ps.is_latest = true
      ${whereClause}
      ORDER BY ${orderBy === 'tpe_score' ? 'ps.overall_score' : `p.${orderBy}`} ${order} NULLS LAST
      LIMIT $${i++} OFFSET $${i++}
    `;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(sql, params);
    res.json({ rows: result.rows, rowCount: result.rowCount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

### TPE Database Function

Add to `ie-crm/src/api/database.js`:

```javascript
export async function getTpeScores(options = {}) {
  const { limit = 200, offset = 0, orderBy = 'tpe_score', order = 'DESC', filters = {} } = options;
  const params = new URLSearchParams({ limit, offset, orderBy, order });
  if (filters.search) params.set('search', filters.search);
  if (filters.property_type) params.set('property_type', filters.property_type);
  if (filters.score_min) params.set('score_min', filters.score_min);
  if (filters.score_max) params.set('score_max', filters.score_max);

  return db.fetch(`/api/tpe/scores?${params}`);
}
```

### Embedding TPE in PropertyDetail

Add to `ie-crm/src/pages/PropertyDetail.jsx` — a new Section for TPE score:

```jsx
// Import at top:
import TpeScoreCard from '../components/shared/TpeScoreCard';

// Add as a new Section in the detail panel (after the header, before notes):
<Section title="Transaction Probability" defaultOpen={true}>
  <TpeScoreCard tpeData={property.tpe_data} />
</Section>
```

This requires the property detail query to include TPE data. Add to the property fetch endpoint:

```javascript
// In the GET /api/properties/:id endpoint, add TPE join:
const tpeResult = await pool.query(`
  SELECT overall_score, previous_score, category_scores,
         top_features, improvement_suggestions, calculated_at, missing_data
  FROM predictive_scores
  WHERE property_id = $1 AND score_type = 'tpe' AND is_latest = true
  LIMIT 1
`, [id]);

// Merge into response:
if (tpeResult.rows.length) {
  property.tpe_data = tpeResult.rows[0];
}
```

### Router Integration

Add to `ie-crm/src/App.jsx`:

```jsx
import TpeDashboard from './pages/TpeDashboard';

// In the Routes:
<Route path="/tpe" element={<TpeDashboard />} />
```

Add to `ie-crm/src/components/Sidebar.jsx`:

```jsx
// Add TPE Dashboard nav item (after Properties, before Contacts):
{ path: '/tpe', label: 'TPE Dashboard', icon: TpeIcon }
```

---

<a id="priority"></a>
# Implementation Priority & Dependencies

## Phase 1: Foundation (Week of Mar 17-24 — Mac Mini arrives)

| Task | Effort | Depends On |
|------|--------|------------|
| Install Ollama + pull Qwen 3.5 32B model | 1 hour | Mac Mini hardware |
| Install PM2 + Node.js on Mac Mini | 30 min | Mac Mini hardware |
| Create `/AI-Agents/` folder structure | 30 min | Mac Mini hardware |
| Deploy `supervisor-config.json` | 30 min | Folder structure |
| Deploy `api_client.py` + `ollama_client.py` | 2 hours | Config files |
| Deploy `ecosystem.config.js` | 1 hour | Shared libraries |
| Run `pm2 startup` + `pm2 save` | 15 min | PM2 installed |
| **Total Phase 1:** | **~6 hours** | |

## Phase 2: Agent API Endpoints (Week 2)

| Task | Effort | Depends On |
|------|--------|------------|
| Add `/api/ai/*` endpoints to server/index.js | 4 hours | Phase 1 |
| Add agent_registry + agent_locks tables (migration) | 1 hour | DB access |
| Deploy enricher_agent.py (first agent) | 3 hours | API endpoints |
| Test enricher end-to-end (mock then live) | 2 hours | Enricher deployed |
| Deploy remaining 5 agents | 4 hours | Enricher validated |
| Deploy watchdog | 2 hours | All agents running |
| **Total Phase 2:** | **~16 hours** | |

## Phase 3: CRM Pages (Week 2-3)

| Task | Effort | Depends On |
|------|--------|------------|
| Action Items: entity linking + snooze | 3 hours | Existing page |
| Comps: analytics panel + filters | 2 hours | Existing page |
| TPE: TpeScoreCard component | 3 hours | None |
| TPE: TpeDashboard page | 3 hours | TpeScoreCard |
| TPE: API endpoint + database function | 2 hours | predictive_scores table |
| TPE: embed in PropertyDetail | 1 hour | TpeScoreCard |
| Router + Sidebar integration | 30 min | All pages |
| **Total Phase 3:** | **~14.5 hours** | |

## Phase 4: Memory & Coordination (Week 3-4)

| Task | Effort | Depends On |
|------|--------|------------|
| Memory sync protocol (pull/push) | 3 hours | API endpoints |
| Agent lock protocol | 2 hours | agent_locks table |
| Instruction versioning + archive | 2 hours | Chief of Staff agent |
| Canary test framework | 3 hours | Instruction versioning |
| Offline buffer + flush | 2 hours | API client |
| **Total Phase 4:** | **~12 hours** | |

## Phase 5: Mac Studio Migration (When hardware arrives)

| Task | Effort | Depends On |
|------|--------|------------|
| Replicate /AI-Agents/ to Studio | 1 hour | Mac Studio hardware |
| Install Ollama + pull 70B+ models | 2 hours | Mac Studio hardware |
| Migrate enricher/researcher/matcher | 3 hours | Lock protocol working |
| Validate + monitor for 48 hours | Ongoing | Migration complete |
| **Total Phase 5:** | **~6 hours + monitoring** | |

---

## Summary

**Total implementation effort: ~55 hours across 4-5 weeks**

This document provides the complete runtime architecture for 6 AI agents operating on local Mac hardware, managed by PM2, connected to the IE CRM via Railway API, using Ollama for local LLM inference. The design prioritizes:

1. **Reliability** — PM2 auto-restart, exponential backoff, watchdog monitoring
2. **Observability** — JSONL audit logs, heartbeats, performance stats, Telegram alerts
3. **Idempotency** — checkpoint files, offline buffers, lock protocol
4. **Scalability** — multi-Mac coordination via database locks, zero-downtime migration
5. **Learning** — feedback digests, instruction versioning, canary tests, Chief of Staff oversight
