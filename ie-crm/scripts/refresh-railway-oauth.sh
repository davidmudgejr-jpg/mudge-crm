#!/bin/bash
# Auto-refresh Railway ANTHROPIC_OAUTH_TOKEN from local Claude Code keychain
# Runs via scheduled task every 12 hours

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
CRM_DIR="$HOME/Desktop/Claude Custom CRM/ie-crm"
LOG_FILE="$CRM_DIR/scripts/oauth-refresh.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
  echo "$1"
}

# 1. Get current token from keychain
CREDS=$(security find-generic-password -s "Claude Code-credentials" -a "davidmudgejr" -w 2>/dev/null)
if [ -z "$CREDS" ]; then
  log "❌ ERROR: Could not read keychain credentials"
  exit 1
fi

# 2. Extract access token and expiry
NEW_TOKEN=$(echo "$CREDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['claudeAiOauth']['accessToken'])")
EXPIRES_AT=$(echo "$CREDS" | python3 -c "import sys,json; print(json.load(sys.stdin)['claudeAiOauth']['expiresAt'])")
NOW_MS=$(python3 -c "import time; print(int(time.time()*1000))")
HOURS_LEFT=$(python3 -c "print(round(($EXPIRES_AT - $NOW_MS) / 3600000, 1))")

log "Token expires in ${HOURS_LEFT}h"

# 3. Get current Railway token
cd "$CRM_DIR"
CURRENT_TOKEN=$(railway vars list 2>/dev/null | grep ANTHROPIC_OAUTH_TOKEN | awk -F'│' '{print $2}' | tr -d ' ' | tr -d '\n' | head -c 108)

# 4. Compare and update if different
SHORT_NEW=$(echo "$NEW_TOKEN" | head -c 40)
SHORT_CUR=$(echo "$CURRENT_TOKEN" | head -c 40)

if [ "$SHORT_NEW" != "$SHORT_CUR" ]; then
  log "🔄 Token changed — updating Railway..."
  railway vars set "ANTHROPIC_OAUTH_TOKEN=$NEW_TOKEN" 2>&1 | tail -1
  if [ $? -eq 0 ]; then
    log "✅ Railway ANTHROPIC_OAUTH_TOKEN updated. Railway will auto-redeploy."
  else
    log "❌ Failed to update Railway"
    exit 1
  fi

  # Also update local .env
  sed -i '' "s|ANTHROPIC_OAUTH_TOKEN=.*|ANTHROPIC_OAUTH_TOKEN=$NEW_TOKEN|" "$CRM_DIR/.env"
  log "✅ Local .env updated too"
else
  log "✅ Token unchanged — no update needed"
fi
