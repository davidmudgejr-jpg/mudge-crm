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

---

## 8. CRE-Specific Prompt Templates

### News Signal Detection Prompt (Researcher)
```
You are a CRE market intelligence analyst for the Inland Empire (San Bernardino & Riverside counties, CA).

Scan the following content and extract any signals relevant to commercial real estate activity.

CONTENT SOURCE: {source_name}
CONTENT:
{trimmed_content_max_5k_tokens}

SIGNAL TYPES (report only these):
- company_expansion: Company growing, hiring, new location
- new_lease: Lease signed or announced
- sale_closed: Property sold or in escrow
- funding: Company raised capital or refinanced
- hiring: Job postings indicating growth
- relocation: Company moving in/out of IE
- lease_expiration: Lease ending, tenant searching
- distress: Foreclosure, NOD, bankruptcy, layoffs
- market_trend: Vacancy rates, rent trends, absorption

RELEVANCE FILTER: Only report signals within or directly affecting the Inland Empire market. National trends only if they specifically impact IE industrial/office/retail.

For each signal found, return JSON:
{"signals": [{"headline": "string", "signal_type": "enum", "relevance": "high|medium|low", "confidence": 0-100, "companies": ["string"], "properties": ["string"], "source_url": "string", "recommended_action": "string"}]}

If no relevant signals found, return: {"signals": []}
```

### Evolution Report Prompt (Scout)
```
You are the Scout agent monitoring AI/ML developments for CRE applications.

SOURCES SCANNED TODAY:
{source_list_with_summaries}

CURRENT SYSTEM CAPABILITIES:
{brief_system_summary}

Generate the weekly evolution report:
1. New tools/models relevant to CRE intelligence (max 3)
2. Techniques that could improve our agents (max 3)
3. Competitive intelligence — what are other CRE tech companies doing? (max 2)
4. Recommended upgrades (must be specific and actionable)

Format as markdown with ## headers per section. Keep total under 500 words.
```

### Daily Summary Prompt (Logger)
```
Summarize the following raw agent activity logs into a structured daily summary.

RAW LOGS:
{agent_logs_last_24h}

Return JSON:
{
  "date": "YYYY-MM-DD",
  "agents": {
    "enricher": {"items_processed": n, "items_approved": n, "items_rejected": n, "avg_confidence": n, "notable": "string"},
    "researcher": {"signals_found": n, "high_relevance": n, "sources_scanned": n, "notable": "string"},
    "matcher": {"matches_attempted": n, "matches_found": n, "emails_drafted": n, "notable": "string"}
  },
  "anomalies": ["string"],
  "system_health": "healthy|degraded|error",
  "recommendations": ["string"]
}
```

---

## 9. Token Budget Guidelines

| Task | Input Budget | Output Budget | Total | Notes |
|---|---|---|---|---|
| News signal scan (per article) | 3K-5K | 500-1K | 4K-6K | Trim articles to first 5K tokens |
| Market trend analysis | 5K-8K | 1K-2K | 7K-10K | Multiple sources aggregated |
| Evolution report | 3K-5K | 1K-2K | 5K-7K | Weekly, not daily |
| Daily summary | 5K-10K | 1K-2K | 7K-12K | Compresses 24h of logs |
| Security audit scan | 3K-5K | 1K-2K | 5K-7K | Per-perspective pass |

**Processing capacity per hour (Mac Mini M4 Pro):**
- Signal detection: ~100-150 articles/hour (at ~3 sec/inference)
- Summarization: ~80-120 documents/hour (at ~4 sec/inference)
- Security scans: ~40-60 scans/hour (at ~6 sec/inference, deeper analysis)

---

## 10. Error Recovery Patterns

### When MiniMax Over-Reports Signals (False Positives)
- Common issue: MiniMax sees signals in generic business news
- Mitigation: Add "CRITICAL: The signal must specifically mention a company, property, or market within San Bernardino or Riverside counties. National news without IE impact is NOT a signal."
- If false positive rate > 30%, tighten relevance filter and add negative examples

### When MiniMax Produces Overconfident Scores
- MiniMax defaults to 70-80 confidence even on single-source signals
- Mitigation: Add "Confidence guidelines: 90+ requires 3+ independent sources. 70-89 requires 2 sources. Below 70 for single source. Below 50 for unverified rumors."
- Chief of Staff should monitor average confidence weekly

### When MiniMax Gets Confused by Long Documents
- Break articles into 2-3K token chunks
- Process each chunk independently for signals
- Deduplicate signals across chunks before submitting

### When Source URLs Are Inaccessible
- Log the failed URL with error code
- Skip the source for this cycle
- If the same source fails 3 days in a row, alert Scout to find alternative
- Never hallucinate content from an inaccessible URL

---

*For: IE CRM AI Master System — Researcher, Scout, and Logger prompting reference*
