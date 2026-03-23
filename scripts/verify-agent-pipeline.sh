#!/bin/bash
# Agent Pipeline Verification — run after deploying agents on 48GB Mini
# Tests the full pipeline: heartbeat → API read → sandbox write → queue check

AGENT_KEY="ak_iecrm_2026_Kx9mWvPqLt7nRjF3hYbZ8dUc"
API="https://mudge-crm-production.up.railway.app"

echo "═══════════════════════════════════════════"
echo "  AGENT PIPELINE VERIFICATION"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "═══════════════════════════════════════════"
echo ""

PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" = "OK" ]; then
    echo "  ✅ $name"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $name — $result"
    FAIL=$((FAIL + 1))
  fi
}

# 1. CRM API Reachable
echo "▸ CRM API"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "X-Agent-Key: $AGENT_KEY" "$API/api/ai/stats")
check "API reachable" "$([ "$STATUS" = "200" ] && echo OK || echo "HTTP $STATUS")"

# 2. Can read contacts
COUNT=$(curl -s -H "X-Agent-Key: $AGENT_KEY" "$API/api/ai/contacts?q=test&limit=1" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK' if isinstance(d,list) else 'FAIL')" 2>/dev/null)
check "Read contacts" "${COUNT:-FAIL}"

# 3. Can read properties
COUNT=$(curl -s -H "X-Agent-Key: $AGENT_KEY" "$API/api/ai/properties?q=test&limit=1" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK' if isinstance(d,list) else 'FAIL')" 2>/dev/null)
check "Read properties" "${COUNT:-FAIL}"

# 4. Can read deals
COUNT=$(curl -s -H "X-Agent-Key: $AGENT_KEY" "$API/api/ai/deals?limit=1" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK' if isinstance(d,list) else 'FAIL')" 2>/dev/null)
check "Read deals" "${COUNT:-FAIL}"

# 5. Can send heartbeat
HB=$(curl -s -X POST "$API/api/ai/agent/heartbeat" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: $AGENT_KEY" \
  -d '{"agent_name":"pipeline_test","tier":99,"status":"testing","current_task":"verification"}' 2>/dev/null)
check "Send heartbeat" "$(echo "$HB" | grep -q '"ok"' && echo OK || echo "$HB")"

# 6. Can write to sandbox
SANDBOX=$(curl -s -X POST "$API/api/ai/sandbox/signal" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: $AGENT_KEY" \
  -H "X-Agent-Name: pipeline_test" \
  -d '{"signal_type":"market_news","headline":"[PIPELINE TEST] Verification signal","body":"This is a test signal from verify-agent-pipeline.sh. Safe to delete.","source":"pipeline_test","confidence_score":10,"agent_name":"pipeline_test"}' 2>/dev/null)
check "Write to sandbox" "$(echo "$SANDBOX" | grep -q '"id"' && echo OK || echo "$SANDBOX")"

# 7. Can read pending queue
QUEUE=$(curl -s -H "X-Agent-Key: $AGENT_KEY" "$API/api/ai/queue/pending" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK')" 2>/dev/null)
check "Read pending queue" "${QUEUE:-FAIL}"

# 8. Can post agent log
LOG=$(curl -s -X POST "$API/api/ai/agent/log" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: $AGENT_KEY" \
  -H "X-Agent-Name: pipeline_test" \
  -d '{"agent_name":"pipeline_test","log_type":"activity","message":"[PIPELINE TEST] Verification log entry"}' 2>/dev/null)
check "Write agent log" "$(echo "$LOG" | grep -q '"id"' && echo OK || echo "$LOG")"

# 9. Ollama check (only if running on agent machine)
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
  MODELS=$(curl -s http://localhost:11434/api/tags | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('models',[])))" 2>/dev/null)
  check "Ollama running" "OK"
  check "Models loaded" "$([ "$MODELS" -ge 2 ] && echo "OK ($MODELS models)" || echo "Only $MODELS models")"
else
  echo "  ℹ️  Ollama not running (expected if running from work Mac)"
fi

# Cleanup test heartbeat
curl -s -X POST "$API/api/ai/agent/heartbeat" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Key: $AGENT_KEY" \
  -d '{"agent_name":"pipeline_test","tier":99,"status":"offline","current_task":"cleanup"}' > /dev/null 2>&1

echo ""
echo "═══════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ PIPELINE READY — all checks passed"
else
  echo "  ⚠️  $FAIL issue(s) found — review above"
fi
echo "═══════════════════════════════════════════"
