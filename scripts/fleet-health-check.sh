#!/bin/bash
# fleet-health-check.sh — Persistent watchdog for the AI fleet
# Runs via launchd every 4 hours on David's work Mac
# SSHes into the 16GB Mac Mini and checks all systems

SSH_KEY="$HOME/.ssh/houston_mini_16gb"
MINI_HOST="houstonmudge@192.168.1.229"
LOG_DIR="$HOME/Desktop/Claude Custom CRM/logs"
LOG_FILE="$LOG_DIR/fleet-health-$(date +%Y-%m-%d).log"
BOT_TOKEN="7848242490:AAFu5nl9-fO8RDR8kv6QGElK4A_xg00poYo"
CHAT_ID="7938385256"

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

# 3. Check Claude CLI process
CLAUDE_CLI=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_HOST" "ps aux | grep '.local/bin/claude' | grep -v grep | wc -l" 2>/dev/null)
if [ "$CLAUDE_CLI" -lt 1 ]; then
    alert "⚠️ Claude CLI not running on 16GB Mini. Houston Command session may have ended."
else
    log "Claude CLI: running"
fi

# 4. Check Claude OAuth token
TOKEN_MIN=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_HOST" "
security unlock-keychain -p '    ' ~/Library/Keychains/login.keychain-db 2>/dev/null
CREDS=\$(security find-generic-password -s 'Claude Code-credentials' -a 'houstonmudge' -w 2>/dev/null)
if [ -n \"\$CREDS\" ]; then
    echo \"\$CREDS\" | python3 -c \"import json,sys,time; d=json.load(sys.stdin); exp=d.get('claudeAiOauth',{}).get('expiresAt',0); print(int((exp-time.time()*1000)/60000))\" 2>/dev/null
else
    echo 'NO_CREDS'
fi
" 2>/dev/null)

if [ "$TOKEN_MIN" = "NO_CREDS" ]; then
    alert "🚨 No Claude credentials in keychain on 16GB Mini."
elif [ "$TOKEN_MIN" -lt 0 ] 2>/dev/null; then
    alert "🚨 Claude OAuth token EXPIRED (${TOKEN_MIN} min ago). Houston Command is down. Run /login on Mini."
elif [ "$TOKEN_MIN" -lt 60 ] 2>/dev/null; then
    alert "⚠️ Claude OAuth token expires in ${TOKEN_MIN} min. Watch for refresh."
else
    log "Claude token: ${TOKEN_MIN} min remaining"
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
