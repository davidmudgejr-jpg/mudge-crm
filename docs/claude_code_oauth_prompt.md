# Claude Code Prompt — OAuth API Proxy for IE CRM

Paste this into Claude Code when you're ready to build:

---

## The Prompt

```
I need you to set up an Anthropic API proxy route on my Railway backend so my IE CRM can make Claude API calls using my Max subscription OAuth token instead of a paid API key.

**My stack:**
- Frontend: Vercel (React)
- Backend: Railway (Node.js/Express)
- Database: Neon (Postgres)

**What I need:**

1. Create a new route on my Railway backend: `POST /api/ai/chat`
   - This is the proxy endpoint my CRM frontend will call
   - It should forward requests to `https://api.anthropic.com/v1/messages`
   - Use my OAuth token stored as a Railway environment variable called `ANTHROPIC_OAUTH_TOKEN`
   - Pass it as the `Authorization: Bearer` header (NOT as `x-api-key`)
   - Default model should be `claude-sonnet-4-6` (hardcoded, not user-configurable)
   - Accept a `messages` array and optional `system` prompt from the frontend
   - Set `max_tokens: 4096` as default
   - Stream responses back to the frontend using Server-Sent Events (SSE)

2. Create a non-streaming version too: `POST /api/ai/chat/sync`
   - Same setup but returns the full response as JSON
   - This is for backend automations (hot sheet parser, contact verification, etc.) that don't need streaming

3. Add basic middleware:
   - Auth check — only authenticated CRM users (David, Dad, Sister) can hit these endpoints
   - Rate limiting — nothing crazy, just prevent runaway loops (e.g., 30 requests/minute per user)
   - Error handling — if Anthropic returns a 429 (rate limit) or 529 (overloaded), return a friendly error to the frontend

4. Add a health check route: `GET /api/ai/status`
   - Pings Anthropic with a minimal request to confirm the OAuth token is still valid
   - Returns { status: "connected", model: "claude-sonnet-4-6" } or { status: "error", message: "..." }

**Environment variable I'll set in Railway:**
- `ANTHROPIC_OAUTH_TOKEN` — my OAuth token starting with sk-ant-oat01-

**Important notes:**
- Do NOT use the x-api-key header. OAuth tokens use Authorization: Bearer.
- Do NOT expose the token to the frontend — the backend is the proxy.
- Keep it simple and clean. This is a 3-person team CRM, not enterprise scale.
- Tell me what you're building before you write code. Show me the plan first.
```

---

## Before You Run This

1. Get your OAuth token by running `claude setup-token` in terminal
2. Copy the `sk-ant-oat01-...` token
3. Go to Railway → your backend service → Variables → add `ANTHROPIC_OAUTH_TOKEN`
4. Then paste the prompt above into Claude Code

## After It's Built

Test it with curl:
```bash
curl -X POST https://your-railway-url.up.railway.app/api/ai/chat/sync \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Say hello"}],
    "system": "You are Houston, the AI assistant for IE CRM."
  }'
```
