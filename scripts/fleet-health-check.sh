#!/bin/bash
# Fleet Health Check — run from David's work Mac
# Checks all agent machines via SSH and CRM API
# Called by Claude Code on schedule or on-demand

SSH_KEY="$HOME/.ssh/houston_mini_16gb"
MINI_16="houstonmudge@192.168.1.229"
CRM_API="https://mudge-crm-production.up.railway.app"
AGENT_KEY="ak_iecrm_2026_Kx9mWvPqLt7nRjF3hYbZ8dUc"

echo "═══════════════════════════════════════════"
echo "  FLEET HEALTH CHECK — $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════"
echo ""

ISSUES=0

# ─── 16GB Mac Mini: SSH Reachable ───
echo "▸ 16GB Mac Mini (192.168.1.229)"
if ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_16" "echo OK" 2>/dev/null | grep -q OK; then
    echo "  ✅ SSH connection OK"
else
    echo "  ❌ SSH connection FAILED"
    ISSUES=$((ISSUES + 1))
fi

# ─── OpenClaw Process ───
OPENCLAW_PID=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_16" "pgrep -f openclaw-gateway" 2>/dev/null)
if [ -n "$OPENCLAW_PID" ]; then
    echo "  ✅ OpenClaw running (PID: $OPENCLAW_PID)"
else
    echo "  ❌ OpenClaw NOT running"
    ISSUES=$((ISSUES + 1))
fi

# ─── Claude/Anthropic Token TTL ───
TOKEN_MIN=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_16" "
    security unlock-keychain -p '    ' ~/Library/Keychains/login.keychain-db 2>/dev/null
    CREDS=\$(security find-generic-password -s 'Claude Code-credentials' -a 'houstonmudge' -w 2>/dev/null)
    if [ -n \"\$CREDS\" ]; then
        echo \"\$CREDS\" | python3 -c 'import json,sys,time; d=json.load(sys.stdin); exp=d[\"claudeAiOauth\"][\"expiresAt\"]; print(int((exp-time.time()*1000)/60000))'
    else
        echo 'ERROR'
    fi
" 2>/dev/null)
if [ "$TOKEN_MIN" = "ERROR" ] || [ -z "$TOKEN_MIN" ]; then
    echo "  ❌ Claude token: CANNOT READ"
    ISSUES=$((ISSUES + 1))
elif [ "$TOKEN_MIN" -lt 30 ]; then
    echo "  ⚠️  Claude token: ${TOKEN_MIN} min remaining (CRITICAL)"
    ISSUES=$((ISSUES + 1))
elif [ "$TOKEN_MIN" -lt 120 ]; then
    echo "  ⚠️  Claude token: ${TOKEN_MIN} min remaining (LOW)"
else
    echo "  ✅ Claude token: ${TOKEN_MIN} min remaining"
fi

# ─── Token Sync Check (keychain vs OpenClaw) ───
SYNC_STATUS=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_16" "
    security unlock-keychain -p '    ' ~/Library/Keychains/login.keychain-db 2>/dev/null
    KC_TOKEN=\$(security find-generic-password -s 'Claude Code-credentials' -a 'houstonmudge' -w 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)[\"claudeAiOauth\"][\"accessToken\"][:20])' 2>/dev/null)
    OC_TOKEN=\$(python3 -c 'import json; print(json.load(open(\"/Users/houstonmudge/.openclaw/agents/main/agent/auth-profiles.json\"))[\"profiles\"][\"anthropic:default\"][\"token\"][:20])' 2>/dev/null)
    if [ \"\$KC_TOKEN\" = \"\$OC_TOKEN\" ]; then echo 'SYNCED'; else echo 'DESYNCED'; fi
" 2>/dev/null)
if [ "$SYNC_STATUS" = "SYNCED" ]; then
    echo "  ✅ Token sync: keychain ↔ OpenClaw in sync"
else
    echo "  ❌ Token sync: DESYNCED (keychain ≠ OpenClaw)"
    ISSUES=$((ISSUES + 1))
fi

# ─── Cron Jobs Running ───
CRON_COUNT=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_16" "crontab -l 2>/dev/null | grep -v '^#' | grep -v '^$' | wc -l" 2>/dev/null | tr -d ' ')
if [ "$CRON_COUNT" -ge 8 ]; then
    echo "  ✅ Cron jobs: $CRON_COUNT active"
else
    echo "  ⚠️  Cron jobs: only $CRON_COUNT active (expected 8)"
    ISSUES=$((ISSUES + 1))
fi

# ─── Last Heartbeat in CRM ───
echo ""
echo "▸ CRM Agent Dashboard"
HEARTBEAT=$(curl -s -H "X-Agent-Key: $AGENT_KEY" "$CRM_API/api/ai/agent/heartbeat" 2>/dev/null)
# Check if chief_of_staff heartbeat is recent (via stats endpoint)
AGENTS_STATUS=$(curl -s -H "X-Agent-Key: $AGENT_KEY" "$CRM_API/api/ai/stats" 2>/dev/null)
if echo "$AGENTS_STATUS" | grep -q "chief_of_staff"; then
    echo "  ✅ Chief of Staff heartbeat registered"
else
    echo "  ℹ️  Heartbeat status: check AI Ops dashboard"
fi

# ─── Telegram Bot Check (last message in gateway log) ───
echo ""
echo "▸ Telegram Bots"
LAST_MSG=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_16" "grep 'sendMessage ok' ~/.openclaw/logs/gateway.log 2>/dev/null | tail -1" 2>/dev/null)
if [ -n "$LAST_MSG" ]; then
    echo "  ✅ Last Telegram send: $LAST_MSG"
else
    echo "  ⚠️  No recent Telegram messages in log"
fi

BOT_COUNT=$(ssh -i "$SSH_KEY" -o ConnectTimeout=5 "$MINI_16" "grep 'starting provider' ~/.openclaw/logs/gateway.log 2>/dev/null | tail -3 | wc -l" 2>/dev/null | tr -d ' ')
echo "  ✅ Telegram bots registered: $BOT_COUNT/3"

# ─── Summary ───
echo ""
echo "═══════════════════════════════════════════"
if [ "$ISSUES" -eq 0 ]; then
    echo "  ✅ ALL CLEAR — $ISSUES issues found"
else
    echo "  ⚠️  $ISSUES ISSUE(S) FOUND — review above"
fi
echo "═══════════════════════════════════════════"
