# Prompt Injection Defense
## Deterministic Sanitization Layer
## IE CRM AI Master System

---

## Overview

Every agent in the IE CRM fleet ingests external data: Open Corporates API responses, White Pages lookups, web scrapes, emails, and X posts. This external data is untrusted by definition — it may contain deliberate attempts to manipulate agent behavior.

A deterministic (non-LLM) pre-processing layer catches and neutralizes injection attempts **before any model ever sees the data**. This layer runs on every record, every time, with no exceptions.

---

## Why Deterministic, Not LLM

Using an LLM to detect prompt injection introduces the exact vulnerability you are defending against. An injection attempt sophisticated enough to fool the detection model has already won.

Regex-based detection is:

- **Predictable** — same input always produces the same output
- **Fast** — microseconds per record, no API call required
- **Immune to social engineering** — cannot be persuaded, confused, or role-played
- **Auditable** — every match is logged with the exact pattern that triggered it
- **Versioned** — rule changes are tracked in git with author and date

---

## Architecture Position

```
External Data (APIs, web scrapes, emails, X posts)
        |
        v
+-----------------------------------------------+
|   INJECTION SANITIZER (deterministic)         |
|   config: ai-system/security/injection-rules.json |
|   actions: strip, flag, log                   |
+-----------------------------------------------+
        |
        v
+-----------------------------------------------+
|   Stage 0 Pre-Filter (data quality)           |
|   config: /AI-Agents/enricher/pre-filter-rules.json |
|   actions: accept, reject, score              |
+-----------------------------------------------+
        |
        v
   LLM Processing (Stage 1+)
```

Records that trigger 3+ injection flags never reach Stage 0. They are auto-rejected and logged.

---

## Relationship to Stage 0

These are two separate, sequential, independent layers with different purposes:

| Layer | Question Answered | Rule File | Failure Mode |
|---|---|---|---|
| Injection Sanitizer | Is this trying to manipulate the LLM? | `injection-rules.json` | Auto-reject + block source |
| Stage 0 Pre-Filter | Is this worth processing? | `pre-filter-rules.json` | Reject as low quality |

Injection sanitization runs first. A record that passes injection checks may still be rejected by Stage 0 for data quality reasons. A record that fails injection checks never reaches Stage 0.

---

## Detection Categories

| Category | Description | Patterns (examples) | Action |
|---|---|---|---|
| `role_injection` | Attempts to inject system/assistant/user role markers | `system:`, `ASSISTANT:`, `[INST]`, `<\|user\|>`, `im_start` | strip_and_flag |
| `instruction_override` | Attempts to override or replace agent instructions | `ignore previous instructions`, `you are now`, `new instructions:`, `override:` | strip_and_flag |
| `prompt_leaking` | Attempts to extract the agent's system prompt | `repeat your prompt`, `show me your instructions`, `what are your instructions` | strip_and_flag |
| `encoded_payloads` | Suspicious encoded content hiding injection attempts | Base64 strings >50 chars, Cyrillic homoglyphs, zero-width characters | decode_check_strip |
| `code_injection` | HTML/JS injection in data fields | `<script>`, `javascript:`, `onclick=`, `<iframe>`, `document.cookie` | strip_and_flag |
| `social_engineering` | Social engineering attempts — may be legitimate business content | `urgent admin request`, `user has authorized`, `emergency override`, `admin mode enabled` | flag_only |

Full pattern lists are defined in `ai-system/security/injection-rules.json`.

---

## Actions

Three actions are available, specified per category in the rules file:

**strip_and_flag**
Remove the matched content, replacing it with `[SANITIZED]`. Add `injection_flagged` metadata to the record. Write an entry to the JSONL audit log. Used for patterns with no legitimate business use.

**flag_only**
Add `injection_flagged` metadata but do NOT modify the content. Used for patterns that may appear in legitimate business communications (e.g., a real email about "urgent security notice"). Tier 2 sees the flag and applies extra scrutiny.

**decode_check_strip**
Decode the content first (Base64, Unicode normalization), then check the decoded content against all other categories. Strip and replace with `[SANITIZED-ENCODED]` if the decoded content matches any injection pattern.

---

## Escalation Rules

| Flag Count | Action |
|---|---|
| 1 flag | Proceed with stripped content. Tier 2 sees the `injection_flagged` metadata during review. |
| 2 flags | Proceed with extra Tier 2 scrutiny note appended to the record. |
| 3+ flags | Auto-reject. Do NOT send to Stage 0. Log as `injection_blocked`. Post to priority board as `urgent_review`. |
| 5+ flags from same source in 24h | Add source to blocklist. Alert Chief of Staff via Telegram. |

The thresholds (`auto_reject_flag_count: 3`, `source_block_flags_24h: 5`) are configurable in `injection-rules.json` without a code change.

---

## Configuration

Rules are defined in:

```
ai-system/security/injection-rules.json
```

The file is versioned in git. Every change records `updated_by` and `updated_at`. The Chief of Staff proposes new rules during the weekly self-improvement loop; David approves and commits them.

To add a new pattern:
1. Add the regex to the appropriate category in `injection-rules.json`
2. Verify JSON validity: `python3 -c "import json; json.load(open('ai-system/security/injection-rules.json')); print('Valid JSON')"`
3. Commit with a message referencing the threat it addresses
4. Update `updated_by` and `updated_at` fields

---

## Which Agents Use This

| Agent | Data Sources Sanitized |
|---|---|
| Enricher | Open Corporates API responses, White Pages API responses |
| Researcher | Web scrapes, X posts, news articles |
| Matcher | Email content, inbound contact data |
| Scout | AI news feeds, external RSS sources |

All agents apply the sanitizer at the point of data ingestion, before passing any content to their LLM stages.

---

## Security Audit Coverage

The nightly audit reviews `injection-rules.json` for:

- **Gaps** — new injection techniques not covered by existing patterns
- **Effectiveness** — patterns that have never triggered (may be obsolete or too narrow)
- **Over-broad rules** — patterns triggering false positives on legitimate business data (candidate for downgrade to `flag_only`)

Audit findings are posted to the priority board. Pattern additions follow the configuration workflow above.
