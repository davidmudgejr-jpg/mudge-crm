# Nightly Security Audit
## 4-Perspective Adversarial Security Review
### IE CRM AI Master System

---

## Overview

This system handles sensitive commercial real estate data, sends outreach emails on David's behalf, and runs 24/7 on a Mac Mini with full internet access. A dedicated security review catches what normal error handling and logging miss.

The Scout agent runs a 4-perspective security audit every night at **3:15 AM** using MiniMax 2.5 (local inference, zero API cost). Findings feed into the Chief of Staff's morning briefing and the Logger's daily summary.

---

## How It Works

1. Supervisor cron triggers Scout at 3:15 AM
2. Scout runs 4 parallel analysis passes (one per perspective)
3. Findings are merged, deduplicated, and severity-ranked
4. Results written to `agent_logs` (log_type: `security_audit`) and JSONL audit log
5. Critical findings trigger immediate Telegram alert to David
6. All findings appear in the morning briefing

### Supervisor Cron Definition

```json
{
  "job_name": "security_audit",
  "agent": "scout",
  "schedule": "15 3 * * *",
  "timeout_minutes": 30,
  "priority": "high",
  "description": "4-perspective security audit of entire system"
}
```

---

## The 4 Perspectives

Each perspective reviews the same system through a different security lens:

| Perspective | Focus | Reviews | Example Finding |
|-------------|-------|---------|-----------------|
| **Offensive** | "How would I attack this system?" | Agent templates for injection vectors, API endpoints for auth bypass, email pipeline for spoofing | "Enricher accepts Open Corporates responses without sanitization — attacker could inject via company name field" |
| **Defensive** | "What protections are missing?" | Error handling gaps, missing input validation, unencrypted data at rest, missing rate limits | "No rate limit on sandbox write API — compromised agent could flood the database" |
| **Data Privacy** | "What PII could leak?" | Agent logs for accidental PII, sandbox data retention, email content storage, JSONL audit logs | "Logger daily summary includes full phone numbers — should be masked to last 4 digits" |
| **Operational Realism** | "What breaks at 3 AM on a Sunday?" | Single points of failure, recovery procedures, what happens when Ollama crashes mid-enrichment | "No recovery procedure for partially-written sandbox entries if Enricher crashes mid-batch" |

---

## Scope

Each audit reviews:

- **IE CRM codebase** — API routes, database queries, authentication middleware
- **Agent template files** — `ai-system/agent-templates/*.md` for instruction-level vulnerabilities
- **Environment files** — secrets management, `.env` exposure, API key rotation
- **Agent logs** — past 24 hours for anomalies, unexpected patterns, error spikes
- **Sandbox data** — recent submissions for data integrity, injection artifacts
- **Email outreach queue** — pending emails for content injection, spoofing vectors
- **Git history** — last 7 days for security-relevant changes (new API endpoints, auth changes, dependency updates)
- **Injection rules** — `ai-system/security/injection-rules.json` for coverage gaps, effectiveness, over-broad patterns
- **Prompting guides** — `ai-system/prompting-guides/*.md` for outdated practices
- **Security documentation** — `INJECTION-DEFENSE.md`, this file — for accuracy and completeness

---

## Merge Process

After all 4 perspectives complete their passes:

1. **Collect** all findings from all 4 perspectives into a single list
2. **Deduplicate by target** — if multiple perspectives found the same issue (e.g., both Offensive and Defensive flag the same unvalidated input), merge into one finding with all perspective tags
3. **Highest severity wins** — if Offensive says "High" and Defensive says "Medium" for the same finding, the merged finding is "High"
4. **Number by severity** — assign sequential IDs ordered by severity (all Critical first, then High, then Medium, then Low)
5. **Dispute notes** — if perspectives disagree on severity, include both assessments with reasoning so the Chief of Staff can make the final call

---

## Severity Levels

| Level | Definition | Response |
|-------|-----------|----------|
| **Critical** | Active exploit possible, data breach risk, system compromise | Immediate Telegram alert to David. Pause affected agent if safe to do so. |
| **High** | Significant vulnerability but not immediately exploitable | Morning briefing with "fix today" tag. Chief of Staff prioritizes. |
| **Medium** | Weakness that should be addressed but isn't urgent | Morning briefing. Fix within the week. |
| **Low** | Best practice improvement, hardening opportunity | Logged. Included in weekly summary. |

---

## Output Format

### Primary Output (agent_logs)

```json
{
  "agent_name": "scout",
  "log_type": "security_audit",
  "content": "## Security Audit — YYYY-MM-DD\n\n### Critical\n- [finding]\n\n### High\n- [finding]\n\n### Medium\n- [finding]\n\n### Low\n- [finding]\n\n### Audit Metadata\n- Perspectives run: 4/4\n- Total findings: X\n- Duration: X minutes\n- Tokens used: ~X",
  "findings_count": { "critical": 0, "high": 1, "medium": 3, "low": 2 }
}
```

### JSONL Audit Log

Each finding also gets a structured entry in the JSONL audit log:

```json
{"timestamp": "2026-03-13T03:28:00Z", "agent": "scout", "action": "security_audit", "perspective": "offensive", "severity": "high", "target": "sandbox API", "finding": "No rate limit on POST /api/ai/sandbox/contact", "recommendation": "Add rate limiting middleware"}
```

### Alert Routing

- **Critical findings:** Immediate Telegram message to David via bot API
- **All findings:** Included in Chief of Staff's morning briefing (Telegram full version)
- **Security summary:** Included in Logger's daily summary
- **Weekly rollup:** Chief of Staff includes security trend in Friday weekly review

---

## Integration Points

| Component | Role |
|-----------|------|
| **Supervisor** | Triggers the audit via cron job at 3:15 AM |
| **Scout** | Executes the 4-perspective audit and writes findings |
| **Chief of Staff** | Reviews findings in morning briefing, prioritizes fixes |
| **Logger** | Includes security audit summary in daily log |
| **Telegram** | Receives critical alerts immediately, all findings in morning briefing |

---

## Model and Cost

- **Model:** MiniMax 2.5 (local, via Ollama)
- **Estimated tokens per run:** ~40K (10K per perspective)
- **API cost:** $0.00 (local inference on Mac Mini)
- **Cost tracking:** Each perspective logs findings to JSONL audit log with per-perspective action types (`security_audit_offensive`, `security_audit_defensive`, `security_audit_privacy`, `security_audit_operational`). LLM calls within each perspective also log as `action: llm_call` with `task_type: security_audit`, `model: minimax-2.5`
- **Timeout:** 3:45 AM hard stop — if not complete, submit partial findings and note which perspectives didn't finish

---

*Created: March 2026*
*For: IE CRM AI Master System — Nightly Security Audit*
