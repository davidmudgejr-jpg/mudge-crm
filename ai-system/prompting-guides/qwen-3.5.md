---
version: "1.0"
updated_by: david
updated_at: "2026-03-13"
source: "Alibaba Qwen documentation, community benchmarks, Ollama model notes"
---

# Prompting Guide: Qwen 3.5 (20B)
## Used by: Enricher, Matcher (Tier 3)

---

## 1. Model Overview

- **Provider:** Alibaba Cloud (Qwen team)
- **Model size:** ~20B parameters
- **Context window:** 32K tokens (128K with YaRN extension, but quality degrades beyond 32K)
- **Run via:** Ollama on Mac Mini (local inference, zero API cost)
- **Strengths:** Structured data extraction, JSON output, code understanding, multilingual, strong on classification tasks
- **Weaknesses:** Weaker at creative writing and nuanced reasoning vs. Opus, can hallucinate on ambiguous inputs, shorter effective context than Opus
- **Best for:** Contact verification scoring, data extraction from API responses, structured classification, email draft scoring

---

## 2. Prompting Best Practices

- **Be direct and task-specific.** Qwen performs best with clear, single-task prompts. Avoid multi-part instructions in one prompt
- **Provide explicit schemas.** When asking for JSON output, include the exact schema with field names and types
- **Use "Extract the following fields:" pattern.** Qwen excels at field extraction when given a clear list
- **Keep system prompts concise.** Qwen's 32K context means every token of system prompt reduces data processing capacity
- **Use numeric scoring when possible.** "Score confidence 0-100" produces more consistent results than "rate as high/medium/low"

---

## 3. Formatting Preferences

- **System prompt:** Short, direct role description. No XML tags needed — plain markdown works fine
- **Few-shot format:** Input/output pairs separated by `---` or `###` markers
- **Headers:** Simple markdown `##` headers for section breaks
- **JSON output:** Wrap requested format in triple backticks with `json` language tag

---

## 4. Anti-Patterns (What Degrades Performance)

- **Long preambles.** "You are an advanced AI assistant that..." — skip this. Go straight to the task
- **Nested instructions.** "If X, then do Y, but if Z within X, then do W" — flatten into separate prompts
- **Asking for explanations alongside structured output.** Request data extraction OR reasoning, not both in one call
- **Context beyond 32K.** Quality drops noticeably beyond 32K tokens. Chunk large inputs
- **Ambiguous field names.** "Address" could mean home, work, registered. Be explicit: "registered_agent_address"

---

## 5. Structured Output

- **JSON:** Very reliable with explicit schemas. Always provide an example output
- **Confidence scores:** Provide the scoring rubric inline: "Score 0-100 where: address match = +30, phone match = +25, ..."
- **Classification:** Works well with enumerated options: "Classify as one of: high_confidence, medium_confidence, low_confidence, insufficient_data"
- **Tables:** Can produce markdown tables but JSON arrays are more reliable for downstream processing

---

## 6. Context Window Management

- **32K effective context.** This is the hard limit for reliable output
- **System prompt budget:** Keep system prompts under 2K tokens. Every token reduces processing capacity
- **Batch processing:** When processing multiple records, send them one at a time rather than batching. Qwen produces better per-record results than batch results
- **Trim source data.** When forwarding API responses (Open Corporates, White Pages), strip irrelevant fields before sending to Qwen

---

## 7. Temperature and Sampling Notes

| Task Type | Recommended Temperature | Notes |
|---|---|---|
| Contact data extraction | 0.0 | Pure extraction — no creativity needed |
| Confidence scoring | 0.0 - 0.1 | Deterministic scoring produces consistent results |
| Email draft generation | 0.3 - 0.5 | Some personality needed for David's voice |
| Data classification | 0.0 | Classification should be deterministic |
| Match reasoning | 0.1 - 0.2 | Slight flexibility for explaining match logic |

---

---

## 8. CRE-Specific Prompt Templates

### Contact Enrichment Prompt (Enricher)
```
You are a CRE data enrichment specialist. Given LLC filing data from Open Corporates and contact data from public sources, extract and score the following fields.

INPUT:
Company Name: {llc_name}
Registered Agent: {agent_name}
Filing Address: {address}
API Response Data: {trimmed_api_response}

EXTRACT these fields (use null if not found):
- full_name: string
- email: string or null
- phone_1: string or null
- home_address: string or null
- work_address: string or null
- title: string or null (e.g. "Owner", "Managing Member", "Partner")
- linkedin: url or null

SCORE confidence 0-100 using this rubric:
- Address match (filing vs public records): +30
- Phone match (verified callable): +25
- Email match (valid domain, not generic): +20
- Name consistency across sources: +15
- LinkedIn profile exists and matches: +10
- Subtract 15 for each unverified field

Return JSON: {"fields": {...}, "confidence": number, "sources": [...], "notes": "string"}
```

### Property Matching Prompt (Matcher)
```
You are a CRE property matcher. Given an AIR listing and the IE CRM property database, determine if this listing matches an existing property or is new.

AIR LISTING:
{listing_json}

CRM PROPERTIES (top 5 by address similarity):
{candidate_properties_json}

MATCH RULES:
- Exact normalized address = 100% match (auto-approve)
- Same street + same city + similar SF (±20%) = 90% match (review)
- Same street + different city = 50% match (manual review)
- No address similarity = new property

Return JSON: {"match_type": "exact|strong|weak|new", "matched_property_id": uuid|null, "confidence": number, "reasoning": "string"}
```

### Email Draft Scoring Prompt (Matcher)
```
Score this outreach email draft on 4 criteria (0-25 each, total 0-100):

EMAIL:
Subject: {subject}
Body: {body}
Recipient: {contact_name} at {company_name}

CRITERIA:
1. Personalization (0-25): Does it reference specific property/company details?
2. Value proposition (0-25): Does it offer something useful (market data, comp, insight)?
3. Tone (0-25): Professional but warm? Appropriate for {contact_type}?
4. Call to action (0-25): Clear, low-friction next step?

Return JSON: {"scores": {"personalization": n, "value": n, "tone": n, "cta": n}, "total": n, "improvement": "string"}
```

---

## 9. Token Budget Guidelines

| Task | Input Budget | Output Budget | Total | Notes |
|---|---|---|---|---|
| Contact enrichment (per LLC) | 2K-4K | 500-800 | 3K-5K | Trim API responses to relevant fields |
| Property matching | 1K-3K | 300-500 | 2K-4K | Include only top 5 candidates |
| Email draft scoring | 500-1K | 300-500 | 1K-1.5K | Short input, short output |
| Confidence scoring | 1K-2K | 200-400 | 1.5K-2.5K | Scoring rubric + data |
| Data classification | 500-1K | 100-200 | 700-1.2K | Simple enum output |

**Processing capacity per hour (Mac Mini M4 Pro):**
- Enrichment: ~120-180 LLCs/hour (at ~3 sec/inference)
- Matching: ~200-300 matches/hour (at ~2 sec/inference)
- Email scoring: ~300-400 drafts/hour (at ~1.5 sec/inference)

---

## 10. Error Recovery Patterns

### When Qwen Produces Invalid JSON
1. Re-prompt with: "Your previous output was not valid JSON. Return ONLY the JSON object, no markdown, no explanation."
2. If still invalid, use regex to extract JSON from the response
3. After 3 failures on the same item, mark as `poison_pill` and skip

### When Qwen Over-Scores Confidence
- Common issue: Qwen tends to score 75-85 on thin evidence
- Mitigation: Add "You MUST score below 50 if fewer than 2 independent sources confirm the data" to system prompt
- Monitor weekly: if average confidence > 75, recalibrate instruction

### When Qwen Hallucinates Contact Details
- Always verify extracted emails with a regex format check
- Phone numbers must match standard formats (10-11 digits)
- If LinkedIn URL doesn't contain a `/in/` path, it's likely hallucinated
- Flag any field where source_url is missing

### When Qwen Gets Stuck in Loops
- Limit to 3 retries per item with exponential backoff
- On 3rd failure, log error details and move to next item
- Add failed item to daily summary for Chief of Staff review

---

*For: IE CRM AI Master System — Enricher and Matcher prompting reference*
