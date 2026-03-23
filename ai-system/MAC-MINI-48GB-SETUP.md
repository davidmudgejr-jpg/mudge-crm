# 48GB Mac Mini Setup Guide — Local AI Agent Fleet
## IE CRM AI Master System
**Machine Role:** Tier 3 Local Agent Workhorse (7 AI agents on Ollama)
**Last Updated:** March 22, 2026

---

## WHAT THIS MACHINE DOES

This 48GB Mac Mini runs **7 local AI agents** 24/7 using locally hosted models via Ollama. No cloud API costs for inference — all processing happens on-device.

**Models loaded simultaneously:**
- **Qwen 3.5 (20B)** — ~14 GB RAM — Used by: Enricher, Matcher, Logger, Postmaster, Campaign Manager
- **MiniMax 2.5** — ~8 GB RAM — Used by: Researcher, Scout

**RAM Budget:**
```
macOS + system:            ~5 GB
Qwen 3.5 (20B):          ~14 GB
MiniMax 2.5:              ~8 GB
7 OpenClaw instances:     ~3 GB (400-500MB each)
─────────────────────────────────
Total:                   ~30 GB
Available headroom:      ~18 GB
```

**Agents on this machine:**
| Agent | Model | Job |
|-------|-------|-----|
| Enricher | Qwen 3.5 | LLC → verified contact pipeline |
| Researcher | MiniMax 2.5 | Market intel, signal discovery |
| Matcher | Qwen 3.5 | AIR reports → outreach matching |
| Scout | MiniMax 2.5 | AI/tech news, evolution reports |
| Logger | Qwen 3.5 | Daily logs, cost reports |
| Postmaster | Qwen 3.5 | Email monitoring, activity logging |
| Campaign Manager | Qwen 3.5 | Instantly.ai campaigns, outreach |

---

## WHAT THIS MACHINE IS NOT

- It is NOT the command center (that's the 16GB Mini with Houston Command)
- It does NOT run cloud models (those run on the 16GB Mini)
- It does NOT have direct write access to production CRM tables — all output goes to sandbox tables
- It does NOT share an Apple ID with your personal machines

---

## STEP 1: INITIAL MAC SETUP

### 1A. Sign In With Fleet Apple ID
- Use the SAME Fleet Apple ID that's on the 16GB Mini (e.g., `ie-ai-fleet@icloud.com`)
- This ensures iCloud Desktop sync shares the `~/Desktop/AI-Agents/` folder across both machines

### 1B. Enable iCloud Desktop & Documents Sync
- System Settings → Apple ID → iCloud → iCloud Drive → turn ON
- Enable "Desktop & Documents Folders"
- **Wait for sync to complete** — verify by checking that `~/Desktop/AI-Agents/shared/` appears with architecture docs

### 1C. Basic Setup
- Name the machine: **"AI-Workhorse-48GB"**
- Enable Remote Login: System Settings → General → Sharing → Remote Login → ON
- Enable Screen Sharing: System Settings → General → Sharing → Screen Sharing → ON
- Set to never sleep: System Settings → Energy → Prevent automatic sleeping when display is off → ON
- Enable auto-login: System Settings → Users & Groups → Automatic login → select fleet user
- Turn off screen saver

### 1D. Set Keychain to Never Auto-Lock
```bash
security set-keychain-settings -t 0 ~/Library/Keychains/login.keychain-db
```

---

## STEP 2: SSH ACCESS FROM WORK MAC

On your **work Mac** (24GB), run:

### 2A. Generate SSH Key
```bash
ssh-keygen -t ed25519 -C "work-mac-to-48gb" -f ~/.ssh/houston_mini_48gb -N ""
```

### 2B. Copy Public Key to 48GB Mini
```bash
# Get the 48GB Mini's IP from System Settings → Wi-Fi on the Mini
ssh-copy-id -i ~/.ssh/houston_mini_48gb.pub [fleet-username]@[48GB-IP-ADDRESS]
```

Or manually on the 48GB Mini:
```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "[PASTE PUBLIC KEY FROM ~/.ssh/houston_mini_48gb.pub]" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 2C. Add SSH Config on Work Mac
```bash
cat >> ~/.ssh/config << 'EOF'
Host mini48
  HostName [48GB-IP-ADDRESS]
  User [fleet-username]
  IdentityFile ~/.ssh/houston_mini_48gb
EOF
```

### 2D. Test Connection
```bash
ssh mini48 'echo "48GB Mini connected" && hostname && uptime'
```

---

## STEP 3: INSTALL DEPENDENCIES

On the **48GB Mini**, open Terminal:

### 3A. Homebrew
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"
```

### 3B. Node.js + Python
```bash
brew install node python3 git
```

### 3C. Claude Code (for OpenClaw)
```bash
npm install -g @anthropic-ai/claude-code
```

Verify: `claude --version`

---

## STEP 4: INSTALL OLLAMA + PULL MODELS

### 4A. Install Ollama
```bash
brew install ollama
```

### 4B. Start Ollama Temporarily (for pulling models)
```bash
ollama serve &
```

### 4C. Pull Models
```bash
# This will take 10-20 minutes depending on internet speed
ollama pull qwen3.5:20b       # ~14 GB download
ollama pull minimax2.5         # ~8 GB download
```

### 4D. Verify Models
```bash
ollama list
# Should show:
# NAME              SIZE
# qwen3.5:20b       ~14 GB
# minimax2.5         ~8 GB
```

### 4E. Test Model Inference
```bash
# Quick smoke test — should respond in <5 seconds
ollama run qwen3.5:20b "Say 'hello world' and nothing else"
ollama run minimax2.5 "Say 'hello world' and nothing else"
```

### 4F. Stop Temporary Ollama
```bash
pkill ollama
```

---

## STEP 5: OLLAMA LAUNCHAGENT (Auto-Start on Boot)

### 5A. Find Ollama Path
```bash
which ollama
# Expected: /opt/homebrew/bin/ollama
```

### 5B. Create LaunchAgent
```bash
cat > ~/Library/LaunchAgents/com.ollama.serve.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ollama.serve</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/ollama</string>
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
    <key>EnvironmentVariables</key>
    <dict>
        <key>OLLAMA_HOST</key>
        <string>0.0.0.0</string>
        <key>OLLAMA_KEEP_ALIVE</key>
        <string>24h</string>
    </dict>
</dict>
</plist>
EOF
```

### 5C. Load LaunchAgent
```bash
launchctl load ~/Library/LaunchAgents/com.ollama.serve.plist
```

### 5D. Verify Ollama is Running
```bash
curl http://localhost:11434/api/tags
# Should return JSON with both models listed
```

---

## STEP 6: CREATE AGENT FOLDER STRUCTURE

iCloud sync should have already created `~/Desktop/AI-Agents/` with shared docs from the 16GB Mini. Create the agent-specific folders:

```bash
mkdir -p ~/Desktop/AI-Agents/{enricher,researcher,matcher,scout,logger,postmaster,campaign-manager}/{memory,logs,versions}
mkdir -p ~/Desktop/AI-Agents/daily-logs
```

Verify the shared folder synced:
```bash
ls ~/Desktop/AI-Agents/shared/
# Should show: ARCHITECTURE.md, crm-connection.md, system-overview.md, etc.
```

---

## STEP 7: DEPLOY AGENT FILES

From your **work Mac**, SCP the pre-staged transfer bundle:

```bash
scp -r -i ~/.ssh/houston_mini_48gb \
  "/Users/davidmudgejr/Desktop/Claude Custom CRM/mac-mini-transfer/"* \
  [fleet-username]@mini48:~/Desktop/AI-Agents/
```

On the **48GB Mini**, verify all agents have their instruction files:
```bash
for agent in enricher researcher matcher scout logger postmaster campaign-manager; do
  echo -n "$agent: "
  [ -f ~/Desktop/AI-Agents/$agent/agent.md ] && echo "✅" || echo "❌ MISSING"
done
```

### Update CRM Connection Details
Edit `~/Desktop/AI-Agents/shared/crm-connection.md` and replace any placeholder with:
```
API Base: https://mudge-crm-production.up.railway.app
Agent Key: ak_iecrm_2026_Kx9mWvPqLt7nRjF3hYbZ8dUc
```

---

## STEP 8: CREATE TELEGRAM BOTS

Go to Telegram, message **@BotFather**, and create 7 bots:

| # | Agent | Bot Name | Suggested Username |
|---|-------|----------|-------------------|
| 1 | Enricher | IE Enricher | @IE_Enricher_bot |
| 2 | Researcher | IE Researcher | @IE_Researcher_bot |
| 3 | Matcher | IE Matcher | @IE_Matcher_bot |
| 4 | Scout | IE Scout | @IE_Scout_bot |
| 5 | Logger | IE Logger | @IE_Logger_bot |
| 6 | Postmaster | IE Postmaster | @IE_Postmaster_bot |
| 7 | Campaign Mgr | IE Campaign Manager | @IE_CampaignMgr_bot |

**Save each bot's API token.** You'll need these when configuring OpenClaw instances.

After creating each bot, message it once to initialize the chat, then note your chat ID.

---

## STEP 9: SET UP CRON JOBS

### 9A. Create Heartbeat Script
```bash
cat > ~/Desktop/AI-Agents/shared/heartbeat-48gb.sh << 'SCRIPT'
#!/bin/bash
# Heartbeat for all 7 Tier 3 agents on 48GB Mini
BASE="https://mudge-crm-production.up.railway.app/api/ai/agent/heartbeat"
KEY="ak_iecrm_2026_Kx9mWvPqLt7nRjF3hYbZ8dUc"

for agent in enricher researcher matcher scout logger postmaster campaign_manager; do
  # Only send heartbeat if agent's OpenClaw process is running
  if pgrep -f "openclaw.*$agent" > /dev/null 2>&1; then
    STATUS="running"
  else
    STATUS="offline"
  fi
  curl -s -X POST "$BASE" \
    -H "Content-Type: application/json" \
    -H "X-Agent-Key: $KEY" \
    -d "{\"agent_name\":\"$agent\",\"tier\":3,\"status\":\"$STATUS\",\"current_task\":\"\"}" \
    > /dev/null 2>&1
done
SCRIPT
chmod +x ~/Desktop/AI-Agents/shared/heartbeat-48gb.sh
```

### 9B. Install Crontab
```bash
crontab -e
# Add these lines:
* * * * * /Users/[fleet-user]/Desktop/AI-Agents/shared/heartbeat-48gb.sh
```

---

## STEP 10: PHASED AGENT DEPLOYMENT

**DO NOT enable all 7 agents at once.** Follow this phased deployment:

### Phase 1 — Day 1: Enricher Only
The Enricher proves the full pipeline works: agent → sandbox → Ralph validates → promote to CRM.

1. Launch OpenClaw for Enricher:
```bash
cd ~/Desktop/AI-Agents/enricher
claude
# In Claude, load the agent.md and start working
```

2. Verify pipeline:
   - [ ] Enricher submits a test contact to sandbox
   - [ ] Heartbeat shows in AI Ops dashboard
   - [ ] Ralph GPT/Gemini can see the pending item
   - [ ] Approval promotes to CRM

3. Run for **24-48 hours**. Review sandbox output. Adjust.

### Phase 2 — Day 3: Add Postmaster
Email monitoring, immediate daily value for David and Dad.

### Phase 3 — Day 5: Add Researcher
Market signals start feeding the Priority Board.

### Phase 4 — Day 7: Add Logger
Daily summaries begin flowing to Houston Command.

### Phase 5 — Week 2: Add Matcher + Campaign Manager
AIR report → outreach pipeline goes live.

### Phase 6 — Week 2+: Add Scout
Evolution reports feeding Houston Command's weekly review.

---

## STEP 11: VERIFICATION CHECKLIST

Run these checks after each agent is enabled:

### Infrastructure
- [ ] Ollama responds: `curl http://localhost:11434/api/tags`
- [ ] Both models loaded: `ollama list` shows both
- [ ] Memory OK: `top` shows <35 GB used
- [ ] SSH from work Mac: `ssh mini48 'echo ok'`
- [ ] CRM API reachable: `curl -s -H "X-Agent-Key: ak_iecrm_2026_Kx9mWvPqLt7nRjF3hYbZ8dUc" https://mudge-crm-production.up.railway.app/api/ai/stats`

### Per-Agent (repeat for each enabled agent)
- [ ] agent.md exists in agent folder
- [ ] OpenClaw instance starts without errors
- [ ] Telegram bot responds to messages
- [ ] Agent sends heartbeat (shows in AI Ops)
- [ ] Agent can read from CRM API (query contacts/properties)
- [ ] Agent can write to sandbox tables
- [ ] Houston Command can see the agent's heartbeat

### Full Pipeline Test (after Enricher is live)
- [ ] Enricher submits sandbox contact
- [ ] Ralph GPT reviews and approves/rejects
- [ ] Approved contact appears in production CRM
- [ ] Houston Command sees the activity in logs

---

## TROUBLESHOOTING

### Ollama won't start
```bash
# Check logs
cat /tmp/ollama-stderr.log
# Restart
launchctl unload ~/Library/LaunchAgents/com.ollama.serve.plist
launchctl load ~/Library/LaunchAgents/com.ollama.serve.plist
```

### Model not loading (OOM)
```bash
# Check memory
top -l 1 | head -10
# If tight, try loading one model at a time
ollama stop qwen3.5:20b
ollama run minimax2.5 "test"
ollama run qwen3.5:20b "test"
```

### Agent can't reach CRM API
```bash
# Test connectivity
curl -s -H "X-Agent-Key: ak_iecrm_2026_Kx9mWvPqLt7nRjF3hYbZ8dUc" \
  https://mudge-crm-production.up.railway.app/api/ai/stats
# If fails, check: internet connection, API key, Railway status
```

### Agent heartbeat not showing in AI Ops
```bash
# Manually send a test heartbeat
curl -s -X POST "https://mudge-crm-production.up.railway.app/api/ai/agent/heartbeat" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: ak_iecrm_2026_Kx9mWvPqLt7nRjF3hYbZ8dUc" \
  -d '{"agent_name":"enricher","tier":3,"status":"testing","current_task":"heartbeat test"}'
# Then check AI Ops page — if it shows, the cron is the issue
```

### Claude Code SSH can fix things remotely
Claude Code on your work Mac has SSH access. If anything breaks:
```bash
# From work Mac (or Claude Code):
ssh mini48 'curl http://localhost:11434/api/tags'     # Check Ollama
ssh mini48 'pgrep -la openclaw'                        # Check agents
ssh mini48 'tail -20 /tmp/ollama-stderr.log'           # Check errors
```

---

## RELATED DOCUMENTS

| Document | Purpose |
|----------|---------|
| `AGENT-SYSTEM.md` | Complete system architecture |
| `MAC-MINI-16GB-SETUP.md` | 16GB command center setup |
| `ORCHESTRATION.md` | Process management, supervisors |
| `OPERATIONS.md` | Operational procedures |
| `ERROR-HANDLING.md` | Error recovery |
| Agent templates in `agent-templates/` | Individual agent instructions |
| Prompting guides in `prompting-guides/` | Model-specific best practices |
