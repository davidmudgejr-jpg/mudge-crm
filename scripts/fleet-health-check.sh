#!/bin/bash
# fleet-health-check.sh — Persistent watchdog for the AI fleet
# Runs via launchd every 4 hours on David's work Mac
# SSHes into the 16GB Mac Mini and checks all systems

SSH_KEY="$HOME/.ssh/houston_mini_16gb"
MINI_HOST="houstonmudge@100.64.122.123"
LOG_DIR="$HOME/Desktop/Claude Custom CRM/logs"
LOG_FILE="$LOG_DIR/fleet-health-$(date +%Y-%m-%d).log"
BOT_TOKEN="$(cat "$HOME/.config/iecrm/telegram_bot_token" 2>/dev/null)"
CHAT_ID="$(cat "$HOME/.config/iecrm/telegram_chat_id" 2>/dev/null)"

mkdir -p "$LOG_DIR"

log() { echo "[$(date -Iseconds)] $1" >> "$LOG_FILE"; }

alert() {
    log "ALERT: $1"
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d "chat_id=${CHAT_ID}" -d "text=$(echo "$1" | head -c 4000)" > /dev/null 2>&1
}

log "=== Fleet Health Check Starting ==="

# 1. Can we reach the Mini?
SSH_TEST=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$MINI_HOST" "echo ok" 2>&1)
if [ "$SSH_TEST" != "ok" ]; then
    alert "🚨 FLEET DOWN: Cannot SSH into 16GB Mac Mini. Machine may be offline or network issue."
    log "SSH failed: $SSH_TEST"
    exit 1
fi
log "SSH: connected"

# 2. Check OpenClaw process
OPENCLAW=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_HOST" "ps aux | grep openclaw-gateway | grep -v grep | wc -l" 2>/dev/null)
if [ "$OPENCLAW" -lt 1 ]; then
    alert "🚨 OpenClaw gateway is NOT running on 16GB Mini. Houston Command is down."
else
    log "OpenClaw: running"
fi

# 3. Check OpenClaw session is active (send test message to Telegram bot)
# Houston Command runs via OpenClaw + setup token (1-year validity), NOT Claude CLI
# We verify by checking if the openclaw-gateway process has an active session
OPENCLAW_SESSIONS=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_HOST" "ps aux | grep -E 'node.*openclaw|openclaw' | grep -v grep | wc -l" 2>/dev/null)
if [ "$OPENCLAW_SESSIONS" -lt 1 ]; then
    alert "⚠️ No active OpenClaw sessions on 16GB Mini. Houston Command may need restart."
else
    log "OpenClaw sessions: ${OPENCLAW_SESSIONS} active"
fi

# 4. Check setup token exists (1-year token, not OAuth)
# Note: uses ~ which expands on the REMOTE machine, not $HOME which expands locally
SETUP_TOKEN=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_HOST" '
AUTH_FILE=$(find ~/.openclaw -name "auth-profiles.json" -o -name "credentials.json" -o -name "config.json" 2>/dev/null | head -1)
if [ -n "$AUTH_FILE" ]; then
    if grep -q "sk-ant" "$AUTH_FILE" 2>/dev/null; then
        echo "OK"
    else
        echo "MISSING"
    fi
else
    # Check if openclaw-gateway is running and responding (alternative check)
    if pgrep -f "openclaw-gateway" > /dev/null 2>&1; then
        echo "GATEWAY_RUNNING"
    else
        echo "NO_FILE"
    fi
fi
' 2>/dev/null)

if [ "$SETUP_TOKEN" = "OK" ]; then
    log "Setup token: present (1-year validity)"
elif [ "$SETUP_TOKEN" = "GATEWAY_RUNNING" ]; then
    log "Setup token: config file not found, but OpenClaw gateway is running (likely auth stored elsewhere)"
elif [ "$SETUP_TOKEN" = "MISSING" ]; then
    alert "⚠️ OpenClaw config found but no setup token detected. Houston Command may have auth issues."
elif [ "$SETUP_TOKEN" = "NO_FILE" ]; then
    alert "🚨 No OpenClaw auth config found on 16GB Mini. Houston Command cannot authenticate."
else
    log "Setup token check: $SETUP_TOKEN"
fi

# 5. Check cron jobs exist
CRON_COUNT=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_HOST" "crontab -l 2>/dev/null | grep -v '^#' | grep -v '^$' | wc -l" 2>/dev/null)
if [ "$CRON_COUNT" -lt 5 ]; then
    alert "⚠️ Only ${CRON_COUNT} cron jobs on 16GB Mini (expected 9+). Some may be missing."
else
    log "Cron jobs: ${CRON_COUNT} active"
fi

# 6. Check uptime
UPTIME=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_HOST" "uptime" 2>/dev/null)
log "Uptime: $UPTIME"

log "=== Health Check Complete ==="
