---
version: "1.0"
updated_by: david
updated_at: "2026-03-13"
source: "Anthropic documentation, Claude model card, prompting best practices"
---

# Prompting Guide: Claude Opus 4.6
## Used by: Chief of Staff (Houston) — Tier 1

---

## 1. Model Overview

- **Provider:** Anthropic
- **Model ID:** claude-opus-4-6
- **Context window:** 200K tokens
- **Strengths:** Complex reasoning, nuanced judgment, long-form analysis, instruction following, structured output, multilingual
- **Weaknesses:** Most expensive model in the system, slower than smaller models, can be verbose if not constrained
- **Best for:** Strategic analysis, instruction rewriting, council briefing, morning briefing synthesis, multi-step reasoning

---

## 2. Prompting Best Practices

- **Be explicit about format.** Opus follows instructions precisely — specify exactly what format you want (JSON, markdown table, numbered list)
- **Use XML tags for structure.** Opus responds extremely well to XML-delimited sections: `<context>`, `<task>`, `<output_format>`, `<constraints>`
- **Give role context.** "You are the Chief of Staff for a commercial real estate AI fleet" immediately frames responses correctly
- **Chain reasoning.** For complex decisions, ask Opus to "think step by step" or "consider these factors in order: ..."
- **Set constraints explicitly.** "Maximum 3 recommendations" or "respond in under 200 words" — Opus respects these precisely
- **Use examples for calibration.** One or two examples of desired output quality sets the bar

---

## 3. Formatting Preferences

- **System prompt:** XML tags work best. Wrap major sections in `<role>`, `<context>`, `<instructions>`, `<output_format>`
- **Few-shot format:** Provide examples wrapped in `<example>` tags with `<input>` and `<ideal_output>` sub-tags
- **Headers:** Markdown headers within prompts work well for organizing long instructions
- **Lists:** Numbered lists for sequential tasks, bullet lists for parallel options

---

## 4. Anti-Patterns (What Degrades Performance)

- **Vague instructions.** "Make it better" produces inconsistent results. Be specific: "Increase the confidence threshold from city-level to ZIP-level matching"
- **Overly long system prompts without structure.** Wall-of-text instructions cause drift. Use sections and XML tags
- **Asking for creativity AND precision simultaneously.** Choose one tone per task. Strategic recommendations = creative. Data analysis = precise
- **Redundant instructions.** Stating the same constraint multiple ways doesn't help — it wastes tokens
- **Not specifying output length.** Without constraints, Opus defaults to thorough (verbose) responses

---

## 5. Structured Output

- **JSON:** Opus produces valid JSON reliably. Provide a schema or example. Use `<output_format>JSON matching this schema: {...}</output_format>`
- **Tables:** Markdown tables work well. Specify columns explicitly
- **Scored lists:** Opus handles multi-criteria scoring well. Provide the scoring formula and let it show work
- **Decision trees:** Can produce if/then logic chains when asked to "outline the decision logic"

---

## 6. Context Window Management

- **200K tokens is generous** but not infinite. For daily reviews with extensive logs, summarize historical data and include raw data only for the current day
- **Front-load the most important context.** Opus weighs early context slightly more than late context
- **Use section headers** so the model can mentally "index" where different information lives
- **Don't repeat the same data in multiple formats.** One representation is enough

---

## 7. Temperature and Sampling Notes

| Task Type | Recommended Temperature | Notes |
|---|---|---|
| Daily review analysis | 0.0 - 0.2 | Precision matters — factual analysis of logs |
| Strategic recommendations | 0.3 - 0.5 | Some creativity useful for novel suggestions |
| Instruction rewrites | 0.1 - 0.3 | Precision with slight flexibility for better wording |
| Council briefing synthesis | 0.2 - 0.4 | Balance between faithful merging and insightful synthesis |
| CRM improvement proposals | 0.4 - 0.6 | Creative thinking about new features |

---

*For: IE CRM AI Master System — Chief of Staff prompting reference*
