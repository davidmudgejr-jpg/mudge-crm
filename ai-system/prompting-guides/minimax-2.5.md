---
version: "1.0"
updated_by: david
updated_at: "2026-03-13"
source: "MiniMax documentation, community benchmarks, Ollama model notes"
---

# Prompting Guide: MiniMax 2.5
## Used by: Researcher, Scout, Logger (Tier 3)

---

## 1. Model Overview

- **Provider:** MiniMax
- **Model size:** Varies by quantization (~6-8 GB RAM)
- **Context window:** 32K tokens
- **Run via:** Ollama on Mac Mini (local inference, zero API cost)
- **Strengths:** Fast inference, good at summarization, web content understanding, signal detection, lightweight
- **Weaknesses:** Less precise than Qwen on structured extraction, weaker at complex reasoning, can be overconfident on thin evidence
- **Best for:** News scanning, signal detection, content summarization, trend analysis, evolution reports

---

## 2. Prompting Best Practices

- **Frame as a research analyst.** MiniMax responds well to role framing: "You are a CRE market research analyst scanning for signals"
- **Use bullet-point output requests.** MiniMax produces cleaner output with bullet lists than free-form prose
- **Provide signal definitions.** Don't say "find interesting things" — define exactly what constitutes a signal: "company expansion, new lease, sale, funding, hiring, relocation"
- **Include relevance criteria.** "Only report signals relevant to the Inland Empire commercial real estate market"
- **Use source attribution prompts.** "For each finding, include the source URL and your confidence level"

---

## 3. Formatting Preferences

- **System prompt:** Short role description + signal definitions + output format. Under 1K tokens
- **Few-shot format:** 1-2 examples of good signal reports with the exact format you want
- **Headers:** Markdown headers for report sections
- **Output:** Bullet-point lists or simple JSON objects (not deeply nested)

---

## 4. Anti-Patterns (What Degrades Performance)

- **Complex multi-step reasoning.** MiniMax is better at "find and report" than "analyze and conclude." For complex analysis, use Opus
- **Deeply nested JSON output.** Keep output structure flat. 1-2 levels of nesting maximum
- **Asking for certainty scores on ambiguous data.** MiniMax tends to overconfidence. Provide calibration guidelines: "Only score above 70 if you have corroborating evidence from 2+ sources"
- **Processing very long documents in one pass.** Break long articles into sections. MiniMax handles 2-5K token chunks best
- **Open-ended exploration.** "What's interesting about this company?" produces inconsistent results. Be specific: "Does this company show signs of expansion in the Inland Empire?"

---

## 5. Structured Output

- **JSON:** Reliable for simple objects. Provide exact schema. Avoid optional fields — include all fields with null defaults
- **Signal reports:** Use a fixed template: headline, source, signal_type, relevance, confidence, recommended_action
- **Summaries:** Works well with "Summarize in exactly 3 bullet points" constraints
- **Comparisons:** Can produce before/after or pros/cons tables but simpler formats are more reliable

---

## 6. Context Window Management

- **32K context but sweet spot is 8-16K.** MiniMax quality is best when input + output fits within 16K tokens
- **System prompt budget:** Under 1K tokens. MiniMax benefits most from concise instructions
- **Chunk web content.** When scanning articles, extract the relevant sections first (headline, first 3 paragraphs, key quotes) rather than feeding the entire page
- **Summarize before storing.** When writing to logs or agent_logs, have MiniMax summarize its findings rather than storing raw source content

---

## 7. Temperature and Sampling Notes

| Task Type | Recommended Temperature | Notes |
|---|---|---|
| News signal detection | 0.1 - 0.2 | Low creativity, high precision for signal classification |
| Market trend analysis | 0.2 - 0.4 | Some creativity for connecting dots between signals |
| Evolution report writing | 0.3 - 0.5 | Needs to synthesize and present findings engagingly |
| Source scanning | 0.0 - 0.1 | Deterministic — is this relevant or not? |
| Deep dive research | 0.2 - 0.4 | Moderate creativity for exploring topics |

---

*For: IE CRM AI Master System — Researcher, Scout, and Logger prompting reference*
