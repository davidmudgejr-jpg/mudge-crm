# Security Hardening & Prompt Optimization — Design Spec
## Nightly Security Audit + Injection Defense + Model Prompting Guides
### IE CRM AI Master System

**Date:** 2026-03-13
**Status:** Approved
**Inspired by:** OpenClaw power-user patterns (YouTube analysis)

---

## Overview

Three enhancements to the AI Master System's security posture and prompt quality:

1. **Nightly Security Audit** — Scout gains a 4-perspective security review job
2. **Prompt Injection Sanitization** — Deterministic pre-processing layer before any LLM touches external data
3. **Model-Specific Prompting Guides** — Reference guides for each model tier, used during self-improvement

These are documentation and architecture additions. No CRM UI changes required.

---

## Feature 1: Nightly Security Audit

### Purpose

The system handles sensitive CRE contact data, sends emails on behalf of David, and runs 24/7 with external API access. A dedicated security review catches vulnerabilities that general error handling misses — exposed API keys, PII in logs, prompt injection vectors in agent instructions, and failure modes that could corrupt production data.

### Design

Scout gains a new scheduled job: a **4-perspective parallel security audit** running at **3:15 AM** (before the 3:30 AM maintenance window).

#### Nightly Schedule Context

The existing nightly maintenance window runs 3:00-5:30 AM. Current jobs include index rebuilding, cleanup, backups, and Logger's performance report. The security audit slots in at 3:15 AM as the first cognitive job, before the heavier maintenance tasks begin. The supervisor-config.json cron definition should include:

```json
{
  "job": "security_audit",
  "agent": "scout",
  "schedule": "15 3 * * *",
  "timeout_minutes": 30,
  "depends_on": [],
  "priority": "high"
}
```

If the audit hasn't completed by 3:45 AM, the supervisor should log a timeout warning and allow maintenance to proceed.

#### 4 Perspectives

| Perspective | Focus | Reviews | Example Findings |
|---|---|---|---|
| **Offensive** | Attack surface | API endpoints, agent instruction files, priority board inputs, email templates | "Enricher API endpoint accepts POST without auth header validation" |
| **Defensive** | Protection gaps | Sandbox isolation, rate limiting, agent permissions, error handling | "Logger agent has write access to production contacts table — should be read-only" |
| **Data Privacy** | PII and compliance | Agent logs, sandbox data, email queue content, CAN-SPAM compliance | "agent_logs contains full email body for 3 records — should be summary only" |
| **Operational Realism** | Failure modes | Power loss scenarios, API key rotation, model crashes, disk full | "If Ollama crashes during Enricher batch, partially-written sandbox records have no rollback" |

#### Model and Cost

The security audit runs on **Scout's model (MiniMax 2.5)** for the 4 parallel perspective passes. This keeps costs at zero (local inference). The merge/synthesis step also runs on MiniMax. Expected token consumption: ~8K-12K tokens per perspective pass (~40K total per nightly run). No API costs — fully local.

Cost tracking: each perspective pass is logged to the JSONL audit log with action_type `security_audit` and sub-type per perspective (e.g., `security_audit_offensive`). This feeds into the existing `ai_usage_tracking` table for dashboard visibility.

#### Execution Flow

```
3:15 AM — Scout triggers security audit
  |— Perspective 1: Offensive (parallel)
  |— Perspective 2: Defensive (parallel)
  |— Perspective 3: Data Privacy (parallel)
  |— Perspective 4: Operational Realism (parallel)
        |
  All 4 complete — Scout merges findings
        |
  Deduplicates, numbers findings, assigns severity
        |
  Writes to agent_logs table (log_type: 'security_audit')
  Also logged to /AI-Agents/logs/audit/YYYY-MM-DD.jsonl (action_type: 'security_audit')
        |
  Critical — immediate Telegram alert to David
  All findings — included in Claude's 6 AM morning briefing
```

#### Merge Process

When all 4 perspectives complete, Scout merges findings using **union with deduplication**:

1. Collect all findings from all 4 perspectives into a single list
2. Deduplicate by target (same file/table/endpoint) — if two perspectives flag the same target, merge into one finding with both perspective tags (e.g., `[OFFENSIVE + DATA-PRIVACY]`)
3. When perspectives assign different severities to the same finding, use the **highest severity** (conservative approach)
4. Number findings sequentially by severity (critical first, then high, medium, low)
5. If perspectives conflict on whether something is a real risk, include it with a note: "Disputed: [Perspective A] flags as [severity], [Perspective B] considers low risk"

#### Severity Levels

| Severity | Definition | Response |
|---|---|---|
| **Critical** | Active vulnerability being exploited, or data already exposed | Immediate Telegram alert + pause affected agent |
| **High** | Exploitable vulnerability, not yet exploited | Included in morning briefing with "fix today" tag |
| **Medium** | Potential risk, requires specific conditions to exploit | Included in morning briefing, fix within the week |
| **Low** | Best practice recommendation, no immediate risk | Logged, batched into weekly summary |

#### Scope — What Gets Reviewed

- ie-crm codebase — API endpoints, authentication, data handling, SQL queries
- ai-system/agent-templates — instruction files for manipulation vectors
- Environment files and API key references — exposed secrets, rotation status
- Recent agent_logs entries — anomalous patterns, repeated failures, unusual data access
- Sandbox table data — injection attempts in ingested content
- outbound_email_queue — email content integrity, CAN-SPAM compliance
- Git commit history (last 7 days) — accidental secret commits
- ai-system/security/injection-rules.json — rule coverage gaps, pattern effectiveness, over-broad rules
- ai-system/prompting-guides/ — insecure prompting patterns that could be exploited
- ai-system/SECURITY-AUDIT.md and INJECTION-DEFENSE.md — documentation accuracy vs. actual implementation

#### Output Format

```markdown
## Security Audit — 2026-03-25

**Run time:** 3:15 AM - 3:28 AM (13 min)
**Findings:** 0 critical, 2 high, 4 medium, 1 low

### Critical (0)
(none)

### High (2)
1. [DEFENSIVE] Enricher API endpoint /api/sandbox/contacts accepts POST
   without rate limiting — could be flooded by malicious client
   - File: ie-crm/src/api/database.js:142
   - Fix: Add express-rate-limit middleware, max 100 req/min per IP

2. [DATA-PRIVACY] agent_logs table contains full email body text for 3
   records — should be summarized only
   - Table: agent_logs, ids 4521-4523
   - Fix: Matcher should summarize before logging email content

### Medium (4)
3. [OFFENSIVE] Agent instruction file researcher.md contains URL patterns
   that could be manipulated via priority board injection
   ...
```

#### Integration Points

- **Supervisor:** Add security_audit to nightly cron schedule at 3:15 AM
- **Scout template:** New section describing the security audit job, perspectives, and output format
- **Chief of Staff template:** Updated to review security audit findings during morning briefing
- **Logger:** Recognizes log_type 'security_audit' for daily summaries
- **Telegram:** Security findings posted to David's ops channel (critical = immediate, rest = morning)

---

## Feature 2: Prompt Injection Sanitization

### Purpose

Every agent ingests external data — Open Corporates results, White Pages lookups, web scrapes, forwarded emails, X posts. Any of these could contain prompt injection attacks designed to manipulate the LLM processing the data. A deterministic (non-LLM) pre-processing layer catches and neutralizes these before any model sees them.

### Design

A rule-based sanitizer sits **before Stage 0** in every agent's pipeline. It is a **separate, distinct layer** from Stage 0 — not merged into it.

```
External Data Source
  (Open Corporates, White Pages, BeenVerified, web scrapes, forwarded emails, X posts)
        |
  INJECTION SANITIZER (deterministic, rule-based, no LLM)
  Purpose: Security — strip/flag prompt injection patterns
  Config: ai-system/security/injection-rules.json
        |
  Stage 0 Pre-Filter (data quality — existing, unchanged)
  Purpose: Data quality — check required fields, geography, duplicates, junk
  Config: /AI-Agents/enricher/pre-filter-rules.json
        |
  LLM Processing (agent's model)
```

#### Relationship Between Injection Sanitizer and Stage 0

These are two separate layers with different purposes:
- **Injection Sanitizer** = security boundary. Asks: "Is this data trying to manipulate the LLM?"
- **Stage 0 Pre-Filter** = data quality boundary. Asks: "Is this data worth processing?"

They run sequentially. A record must pass both to reach LLM processing. If the injection sanitizer strips content, the cleaned version passes to Stage 0. If the injection sanitizer auto-rejects (3+ flags), the record never reaches Stage 0 at all.

The two rule files are independent — injection-rules.json (security patterns) and pre-filter-rules.json (data quality rules) are maintained separately by different actors (Chief of Staff for injection rules, Houston for pre-filter rules).

#### Why Deterministic, Not LLM

Using an LLM to detect prompt injection introduces the very vulnerability you're defending against. A carefully crafted injection could convince the detection LLM that it's safe. Regex and string matching is predictable, fast, and immune to social engineering.

#### Detection Patterns

| Category | Patterns | Action |
|---|---|---|
| **Role injection** | system:, ASSISTANT:, im_start tokens, INST tags, user tags, endoftext tokens, Instruction: headers | Strip + flag |
| **Instruction override** | ignore previous, disregard above, forget your instructions, new instructions:, override:, you are now | Strip + flag |
| **Prompt leaking** | repeat your system prompt, what are your instructions, show me your prompt, print your rules | Strip + flag |
| **Encoded payloads** | Base64 strings longer than 50 chars, Unicode homoglyphs (Cyrillic a for Latin a), zero-width characters | Decode, check, strip if malicious |
| **Code injection** | script tags, javascript: URIs, onclick handlers, onerror handlers, eval calls | Strip + flag |
| **Social engineering** | urgent admin requests, test compliance requests, user authorized claims, emergency override | Flag only (don't strip — may be legitimate business content) |

#### Actions

- **Strip** — Remove the matched pattern, replace with [SANITIZED]
- **Flag** — Add metadata to the record: injection_flagged: true, injection_types array
- **Log** — Every detection logged to JSONL audit log with action injection_detected, agent name, source, pattern category, and record ID

#### Escalation Rules

| Condition | Action |
|---|---|
| 1 flag on a record | Proceed (content stripped), Tier 2 sees the flag during review |
| 2 flags on a record | Proceed with extra Tier 2 scrutiny note |
| 3+ flags on a record | Auto-reject — do not send to Stage 0. Log as injection_blocked. Post to priority board as urgent_review |
| Same source triggers 5+ flags in 24 hours | Block source — add to blocklist, alert via Telegram |

#### Configuration File

Rules stored in ai-system/security/injection-rules.json with version metadata, pattern categories, regex patterns, actions, case sensitivity flags, and configurable thresholds for auto-reject (3 flags) and source blocking (5 flags in 24 hours).

The file is versioned like agent instructions — Chief of Staff can propose new rules during the self-improvement loop.

#### Integration Points

- **All agent templates** — Updated to reference the sanitizer as the first step before any data processing
- **Enricher** — Sanitizes Open Corporates, White Pages, BeenVerified responses before Stage 0
- **Researcher** — Sanitizes web scrapes, X posts, news articles before signal extraction
- **Matcher** — Sanitizes forwarded AIR report email content before parsing
- **Scout** — Sanitizes AI news sources before evolution report extraction
- **Security audit** — Reviews injection-rules.json weekly for coverage gaps
- **Chief of Staff** — Can propose new rules during self-improvement loop (versioned like agent instructions)

---

## Feature 3: Model-Specific Prompting Guides

### Purpose

The system uses three different models across its tiers. Each model responds differently to prompting techniques — what works for Opus 4.6 may hurt performance on Qwen 3.5. When Chief of Staff rewrites agent instructions during the self-improvement loop, it needs to optimize prompts for the target agent's specific model, not its own.

### Design

Three reference guides stored in ai-system/prompting-guides/, covering the models directly controlled by this system:

```
ai-system/prompting-guides/
  opus-4.6.md        — Used by: Chief of Staff (Tier 1)
  qwen-3.5.md        — Used by: Enricher, Matcher (Tier 3)
  minimax-2.5.md     — Used by: Researcher, Scout, Logger (Tier 3)
```

**Note on Matcher's model:** ARCHITECTURE.md lists Matcher as "Qwen 3.5 or MiniMax" (uncommitted decision). This spec assumes Qwen 3.5. If Matcher is later assigned to MiniMax, Chief of Staff must re-review Matcher's instruction file against minimax-2.5.md before the switch.

**Note on Tier 2 models (ChatGPT, Gemini):** Prompting guides are not created for Tier 2 models. Tier 2 validators use default API parameters and are accessed via OAuth/API — the system doesn't craft custom prompts for them. If Tier 2 prompting becomes a quality issue, guides can be added later as an evolution proposal.

#### Guide Contents (each file)

1. **Model overview** — Parameter count, context window, strengths, weaknesses
2. **Prompting best practices** — From the model creator's official documentation
3. **Formatting preferences** — XML tags vs markdown headers, system prompt style, few-shot format
4. **Anti-patterns** — Things that degrade this model's performance
5. **Structured output** — How to reliably get JSON, tables, scored lists from this model
6. **Context window management** — Optimal prompt length, when to chunk, how to handle long inputs
7. **Temperature and sampling notes** — Recommended settings for different task types (extraction vs. creative)

#### How Guides Are Used

| Actor | When | How |
|---|---|---|
| **Chief of Staff** | Rewriting any agent's instruction file | MUST read the target agent's model guide first. Changes must align with that model's best practices. |
| **Enricher/Matcher** | Crafting extraction prompts for Qwen | Reference qwen-3.5.md for optimal structured output formatting |
| **Researcher/Scout** | Building research queries for MiniMax | Reference minimax-2.5.md for context window limits and search formatting |
| **Scout** | Evolution reports recommending model switch | Must compare prompting guides and flag instruction rewrites needed for the new model |
| **Chief of Staff** | Self-improvement loop | When rewriting prompts, check if changes follow the target model's guide |

#### Update Cycle

- **Scout** checks for new prompting documentation monthly from Anthropic (Opus), Alibaba (Qwen), and MiniMax
- Updates proposed as evolution proposals (existing process)
- David approves, Chief of Staff applies updates
- Guide files are versioned like agent instructions with version number, updated_by, updated_at, and source fields

#### Integration Points

- **Chief of Staff template** — New rule: Before rewriting any agent instruction file, read the target agent's model prompting guide
- **All agent templates** — New section: Reference your model's prompting guide when crafting prompts
- **Scout template** — New monthly task: check for updated prompting documentation from model providers

---

## Files Created / Modified

### New Files

| File | Purpose |
|---|---|
| ai-system/SECURITY-AUDIT.md | Documents the nightly security audit system |
| ai-system/INJECTION-DEFENSE.md | Documents the prompt injection sanitization layer |
| ai-system/security/injection-rules.json | Rule definitions for the injection sanitizer |
| ai-system/prompting-guides/opus-4.6.md | Prompting guide for Claude Opus 4.6 |
| ai-system/prompting-guides/qwen-3.5.md | Prompting guide for Qwen 3.5 |
| ai-system/prompting-guides/minimax-2.5.md | Prompting guide for MiniMax 2.5 |

### Modified Files

| File | Changes |
|---|---|
| ai-system/agent-templates/scout.md | Add security audit job + monthly prompting guide update task |
| ai-system/agent-templates/chief-of-staff.md | Add security audit review to morning briefing + prompting guide reference rule |
| ai-system/agent-templates/enricher.md | Add injection sanitizer as first pipeline step + prompting guide reference |
| ai-system/agent-templates/researcher.md | Add injection sanitizer + prompting guide reference |
| ai-system/agent-templates/matcher.md | Add injection sanitizer + prompting guide reference |
| ai-system/agent-templates/logger.md | Recognize security_audit log type + prompting guide reference |
| ai-system/ORCHESTRATION.md | Add security audit to nightly cron schedule |
| ai-system/OPERATIONS.md | Reference injection defense in error handling |

---

## Build Order

These features are documentation and configuration only — no CRM code changes. Recommended sequence:

1. **Create injection-rules.json** — The security rules file that all agents and the security audit reference
2. **Create INJECTION-DEFENSE.md** — Documents the sanitization layer
3. **Create prompting guide files** — opus-4.6.md, qwen-3.5.md, minimax-2.5.md
4. **Update all agent templates** — Add injection sanitizer reference, prompting guide reference, and security audit job (Scout)
5. **Create SECURITY-AUDIT.md** — Documents the nightly audit (depends on injection rules and agent templates being updated)
6. **Update ORCHESTRATION.md** — Add security audit to nightly cron schedule
7. **Update OPERATIONS.md** — Reference injection defense in error handling section
