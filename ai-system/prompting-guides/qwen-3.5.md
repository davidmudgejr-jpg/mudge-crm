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

*For: IE CRM AI Master System — Enricher and Matcher prompting reference*
