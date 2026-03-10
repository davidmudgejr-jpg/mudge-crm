# Error Handling & Recovery
## What Goes Wrong and How Every Agent Deals With It
### IE CRM AI Master System

---

## Design Philosophy

Errors are normal. In a 24/7 system hitting external APIs, scraping websites, and processing messy real-world data, things WILL break. The question isn't "will errors happen" — it's "does the system handle them gracefully, recover automatically, and learn from them?"

Three rules:
1. **Never fail silently** — every error gets logged with full context
2. **Never corrupt production data** — the sandbox exists for this reason
3. **Never get stuck** — if something fails, move on and come back later

---

## Error Categories

### Category 1: Rate Limiting (External Services)

The Enricher hits multiple paid services. Each has rate limits. Hitting them is inevitable.

#### Services and Known Limits
| Service | Expected Limit | Tier |
|---------|---------------|------|
| Open Corporates | ~100 req/hour (free) or higher on paid plan | Enricher |
| White Pages | Varies by plan — typically 50-100 lookups/day | Enricher |
| BeenVerified | Varies by plan — typically 50-100 lookups/day | Enricher |
| NeverBounce | API rate limit + per-credit cost | Enricher |
| CoStar / GlobeSt | Scraping — no formal API, watch for blocks | Researcher |
| X (Twitter) | API limits depend on tier — can be aggressive | Researcher |

**NOTE:** Exact limits depend on the plan David signs up for. Update this table with real numbers once accounts are created.

#### Rate Limit Handling Protocol

Every agent that hits external services MUST implement this:

```
1. Make API request
2. If response is 429 (Too Many Requests) or rate limit header exceeded:
   a. Log: "Rate limited by [service]. Backing off."
   b. Read Retry-After header if present
   c. If no header: use exponential backoff
      - 1st hit: wait 60 seconds
      - 2nd hit: wait 2 minutes
      - 3rd hit: wait 5 minutes
      - 4th hit: wait 15 minutes
      - 5th hit: pause this service for 1 hour, switch to other work
   d. Update heartbeat: "current_task: Rate limited by [service], backing off"
   e. After backoff: retry the SAME request (don't skip it)
3. If response is 403 (Forbidden) or account blocked:
   a. Log ERROR: "Account may be blocked by [service]"
   b. Stop hitting that service entirely
   c. Escalate to supervisor (log_type: 'error')
   d. Continue processing items that don't need that service
```

#### Daily Budget Tracking

Each agent tracks how many requests it's made to each service today:

```json
{
  "daily_usage": {
    "open_corporates": { "requests": 47, "limit": 100, "remaining": 53 },
    "white_pages": { "requests": 23, "limit": 50, "remaining": 27 },
    "been_verified": { "requests": 31, "limit": 50, "remaining": 19 },
    "neverbounce": { "requests": 38, "credits_used": 38, "credits_remaining": 962 }
  },
  "reset_time": "2026-03-11T00:00:00Z"
}
```

When remaining < 20% of daily limit:
- Switch to "conservation mode" — only process high-priority items
- Log a warning: "Approaching daily limit on [service]"
- Include in heartbeat metadata so Dashboard shows the constraint

When remaining = 0:
- Stop hitting that service until reset
- Process items that don't need that service
- Log: "Daily limit reached for [service]. Pausing until reset."

---

### Category 2: External API Failures (Service Down)

Services go down. APIs change. Responses come back malformed.

#### Failure Types and Responses

**Timeout (no response within 30 seconds):**
```
- Log: "Timeout calling [service] for [item]"
- Retry once after 30 seconds
- If second timeout: mark item as "deferred" and move on
- Deferred items go into a retry queue (processed at end of cycle)
```

**5xx errors (server-side failure):**
```
- Log: "Server error from [service]: [status code]"
- Do NOT retry immediately — the service is having problems
- Add to retry queue with 10-minute delay
- If 3 consecutive 5xx from same service: activate circuit breaker (see below)
```

**4xx errors (client-side — our problem):**
```
- 400 Bad Request: Log the full request + response. Likely a data formatting issue.
  → Skip this item, flag for manual review
- 401 Unauthorized: API key expired or invalid
  → STOP all requests to this service
  → Log ERROR + escalate immediately
  → This needs David to update the credentials
- 404 Not Found: Normal — the entity doesn't exist in that service
  → Not an error. Log as "not found" and continue
- 422 Unprocessable: Bad data format
  → Log the request payload for debugging
  → Skip this item, flag for review
```

**Malformed response (unexpected data structure):**
```
- Log: "Unexpected response format from [service]" + full response body
- Do NOT try to parse it — garbage in = garbage out
- Skip this item, add to retry queue
- If 5+ malformed responses from same service in 1 hour: circuit breaker
```

#### Circuit Breaker Pattern

When a service is consistently failing, stop hammering it:

```
CLOSED (normal):
  → All requests go through
  → Track failure count

OPEN (service is down):
  → Triggered after 5 consecutive failures OR 3 failures in 5 minutes
  → ALL requests to this service are immediately skipped (no network call)
  → Log: "Circuit breaker OPEN for [service]. Skipping requests."
  → Wait 5 minutes, then move to HALF-OPEN

HALF-OPEN (testing):
  → Allow ONE request through
  → If it succeeds: close the circuit (back to normal)
  → If it fails: re-open for another 5 minutes (increase to 10, then 15, max 30)
```

Each agent tracks circuit breaker state per service:
```json
{
  "circuit_breakers": {
    "open_corporates": { "state": "closed", "failure_count": 0 },
    "white_pages": { "state": "open", "opened_at": "2026-03-10T14:30:00Z", "retry_at": "2026-03-10T14:35:00Z", "consecutive_opens": 2 },
    "been_verified": { "state": "closed", "failure_count": 1 }
  }
}
```

---

### Category 3: Bad / Ambiguous Data

Real-world data is messy. Names are common. Addresses are incomplete. LLCs are shell companies.

#### Common Data Problems and How to Handle Them

**1. Common name, multiple matches (e.g., "John Smith" returns 50 White Pages results)**
```
- Do NOT pick the first result
- Apply address filtering: does any result match the Open Corporates registered address?
  - Match within same ZIP code → confidence +30
  - Match within same city → confidence +15
  - No address match → confidence stays low
- If still ambiguous (3+ results in same ZIP): submit with low confidence + note explaining ambiguity
- NEVER guess. Low confidence is better than wrong data.
```

**2. LLC is a registered agent service (e.g., "CSC - Lawyers Incorporating Service")**
```
- Detect common registered agent names:
  "CSC", "CT Corporation", "Cogency Global", "Registered Agents Inc",
  "National Registered Agents", "Northwest Registered Agent", "InCorp"
- If detected: the registered person is NOT the actual owner
- Log: "Registered agent detected. Looking for managing member instead."
- Search Open Corporates for managing member / officer filings
- If no real person found: submit with low confidence + note
```

**3. Dissolved / inactive LLC**
```
- Open Corporates shows status: "dissolved" or "inactive"
- Still process — the owner may still own other active LLCs
- Flag in notes: "LLC is [status] as of [date]"
- Lower confidence by 15 points (data may be stale)
```

**4. PO Box as registered address**
```
- PO Boxes don't help with address matching
- Skip the address match component of confidence scoring
- Note: "Registered address is PO Box — cannot cross-reference with residential records"
- Still attempt name-based lookups on White Pages / BeenVerified
```

**5. Foreign / out-of-state entity**
```
- LLC registered in Delaware, Nevada, or Wyoming but property is in California
- This is common — not an error
- Look for California qualification filing (foreign entity registered to do business in CA)
- Note: "Foreign entity registered in [state], qualified in CA"
```

**6. Multiple LLCs with the same registered person**
```
- This is GOLD — indicates a portfolio owner
- Submit the contact with HIGH confidence
- In notes: "Person is registered agent for [N] LLCs: [list]"
- Post to priority board: flag_for_outreach with all associated properties
```

**7. Email address looks suspicious**
```
- Detect patterns that indicate low quality:
  - noreply@, info@, admin@, support@ → generic, not personal
  - Very long random strings → likely auto-generated
  - Domain doesn't match company name → possible wrong person
- Do NOT discard — still submit, but lower confidence by 10
- Note which patterns were detected
```

---

### Category 4: CRM API / Database Failures

The IE CRM backend runs on Railway + Neon Postgres. Both can have issues.

**Connection timeout to Neon Postgres:**
```
- Agent can't reach the CRM API
- Retry 3 times with 10-second gaps
- If still failing: switch to offline mode (see ORCHESTRATION.md)
  - Buffer writes to local disk
  - Pause agents that need read access (Enricher, Matcher)
  - Continue agents that can work offline (Researcher writing to buffer)
- Supervisor monitors and flushes buffer when connection returns
```

**Railway app not responding (CRM backend down):**
```
- Same as database failure from the agent's perspective
- The agent doesn't know or care if it's Railway or Neon — the API is unreachable
- Follow offline mode protocol
```

**Slow queries (API responds but takes >5 seconds):**
```
- Log: "Slow API response: [endpoint] took [N]ms"
- Don't retry — the data is coming, just slowly
- If consistently slow (>5s for 10+ consecutive calls):
  - Log warning: "CRM API consistently slow. Possible database performance issue."
  - Reduce request frequency (add 2-second pause between API calls)
  - This could indicate Neon Postgres needs scaling or query optimization
```

**Write conflict (two agents try to approve the same sandbox item):**
```
- Use optimistic locking: check status before updating
  UPDATE sandbox_contacts SET status = 'approved' WHERE id = $1 AND status = 'pending'
- If 0 rows affected: someone else already handled it
- Log: "Item already processed by another agent. Skipping."
- Not an error — just concurrency. Move on.
```

---

### Category 5: Runaway Loops

The most dangerous failure mode: an agent gets stuck processing the same thing over and over, or generates infinite work.

#### Runaway Scenarios and Safeguards

**1. Same item processed repeatedly**
```
Safeguard: Track processed items with a local "seen" set
- Before processing an item, check: "Have I processed this ID in the last 24 hours?"
- If yes: skip and log "Already processed [item_id] today. Skipping."
- Reset the seen set daily
```

**2. Agent generates infinite priority board items**
```
Safeguard: Rate limit priority board writes
- Max 50 priority board posts per agent per hour
- If limit hit: log warning, stop posting, continue normal work
- The supervisor also monitors: if priority board has >200 pending items → alert
```

**3. Enricher keeps retrying a failed lookup**
```
Safeguard: Max 3 retries per item per day
- Track retry count per item: { "llc_123": { "retries": 2, "last_retry": "..." } }
- After 3rd failure: mark as "failed" and move on
- Failed items get a daily retry (once per day, not continuously)
- After 3 days of daily failures: mark as "permanently_failed" and stop trying
```

**4. Researcher generates thousands of low-quality signals**
```
Safeguard: Quality gate before submission
- Before submitting a signal, check:
  - confidence_score >= 20 (don't submit obvious noise)
  - source_url is present (no unverifiable signals)
  - Not a duplicate of an existing signal (check last 48 hours by source_url)
- Max 100 signals per day per agent
- If hitting the limit: the agent is probably scraping too broadly. Log a warning.
```

**5. Matcher drafts outreach for every contact in the CRM**
```
Safeguard: Scope limits per AIR report
- Max 20 outreach drafts per AIR report
- If more than 20 matches found: only submit the top 20 by confidence score
- Log: "Found [N] matches, submitting top 20"
- Max 100 outreach drafts per day total
```

---

### Category 6: Model Hallucination / Confabulation

Local models can be confidently wrong. They might invent phone numbers, fabricate email addresses, or misread data.

#### Hallucination Detection

**Agent-level checks (built into each agent's workflow):**

```
1. NEVER trust model output without source verification
   - If the model says "email is john@company.com" — WHERE did it get that?
   - Every data point must trace back to a specific source URL or API response
   - If a data point has no source: discard it, do not submit

2. Format validation (catch obvious fabrications)
   - Phone: must be 10 digits (US), starts with valid area code
   - Email: must match standard format, domain must actually exist (DNS check)
   - Address: must contain street number, street name, city, state, zip
   - ZIP code: must be 5 digits and valid for the stated city/state
   - Names: flag if name contains numbers, special characters, or is a known company name

3. Cross-reference sanity checks
   - If Open Corporates says "John Smith" but White Pages says "Jane Doe"
     → Don't average them. Flag the mismatch and lower confidence.
   - If an email domain doesn't match the company name
     → Still submit but note the mismatch
   - If a phone number appears in results for multiple different people
     → It's probably a business line, not personal. Note it.

4. Confidence calibration
   - Model says it's "very confident" → ignore the model's self-assessment
   - Only trust the structured scoring rubric (address match, phone match, etc.)
   - Confidence comes from data agreement between sources, not model feelings
```

**Tier 2 checks (catches what agents miss):**
```
- Spot-check source URLs — do they actually exist?
- Does the submitted data match what the source URL shows?
- If Tier 2 sees a pattern of mismatches: escalate + request instruction update
```

---

### Category 7: Poison Pill Items

Some items always fail — a specific LLC name crashes the parser, a specific website infinite-loops, a specific contact has data that breaks validation.

#### Detection
```
Track failures per item:
{
  "item_id": "llc_456",
  "failures": [
    { "attempt": 1, "error": "Parser crash on Unicode character", "timestamp": "..." },
    { "attempt": 2, "error": "Parser crash on Unicode character", "timestamp": "..." },
    { "attempt": 3, "error": "Parser crash on Unicode character", "timestamp": "..." }
  ]
}

If same item fails 3+ times with the same error → it's a poison pill
```

#### Handling
```
1. Mark the item as "poison_pill" in agent logs
2. STOP retrying — this item will not succeed without code changes
3. Move to a separate "failed_items" list
4. Log full error details so Claude (Tier 1) can diagnose
5. In daily review, Claude sees: "3 poison pill items this week. Errors: [details]"
6. Claude may update agent instructions or request David to handle manually
```

---

## Error Logging Standard

Every error, regardless of category, follows this format:

```json
POST /api/ai/agent/log
{
  "agent_name": "enricher",
  "log_type": "error",
  "content": "Rate limited by White Pages while enriching 'Pacific West Holdings LLC'",
  "metrics": {
    "error_category": "rate_limit",
    "service": "white_pages",
    "item_id": "llc_789",
    "item_name": "Pacific West Holdings LLC",
    "retry_count": 2,
    "will_retry": true,
    "retry_at": "2026-03-10T14:35:00Z",
    "circuit_breaker_state": "closed",
    "daily_usage": { "requests": 48, "limit": 50 }
  }
}
```

Required fields for every error log:
- **error_category**: `rate_limit`, `api_failure`, `bad_data`, `db_failure`, `runaway`, `hallucination`, `poison_pill`, `auth_failure`
- **service**: which external service was involved (if applicable)
- **item_id** + **item_name**: what was being processed when it failed
- **retry_count**: how many times this has been retried
- **will_retry**: whether the agent will try again
- **circuit_breaker_state**: current state for the relevant service

---

## Recovery Priorities

When multiple things go wrong simultaneously, handle in this order:

```
1. AUTH FAILURES (credentials expired/blocked)
   → Stop all requests to that service immediately
   → Escalate — David needs to fix this

2. DATABASE FAILURES (CRM API unreachable)
   → Switch to offline mode
   → Buffer what you can, pause what you can't

3. CIRCUIT BREAKERS OPEN (external service down)
   → Skip that service, continue with others
   → Half-open test every 5 minutes

4. RATE LIMITS HIT
   → Back off and continue other work
   → Respect the limits — don't try to circumvent

5. BAD DATA / POISON PILLS
   → Skip and continue — these don't block other work
   → Log for daily review

6. SLOW RESPONSES
   → Tolerate — slow data is better than no data
   → Log the pattern for performance review
```

---

## Agent Dashboard Error View

The Agent Dashboard in IE CRM should show:

### "System Health" Panel
- Circuit breaker status per service (green/yellow/red)
- Rate limit usage bars (% of daily limit consumed)
- Error count by category (last 24 hours)
- Poison pill count (items permanently failed)

### Error Feed
- Live stream of error logs, filterable by agent and category
- Click to expand: full error context + retry history
- Highlight pattern: "White Pages rate limit hit 5 times today" → suggest plan upgrade

---

## What Agents Should NEVER Do on Error

1. **NEVER retry infinitely** — max 3 retries per item, then move on
2. **NEVER skip logging** — silent failures are the worst failures
3. **NEVER write bad data to sandbox** — if you're not sure, don't submit
4. **NEVER try to circumvent rate limits** — rotating IPs, spoofing headers, etc. will get accounts banned
5. **NEVER continue after an auth failure** — credentials problems need human intervention
6. **NEVER assume an error is transient** — if it happens 3 times, it's a pattern

---

*Created: March 2026*
*For: IE CRM AI Master System — Error Handling & Recovery*
