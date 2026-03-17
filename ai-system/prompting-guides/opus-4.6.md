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

---

## 8. CRE-Specific Prompt Templates

### Daily Review Prompt Structure
```xml
<role>You are Houston, Chief of Staff for the IE CRM AI fleet. You oversee 5 agents operating in the Inland Empire commercial real estate market.</role>

<context>
Today's date: {date}
Agent fleet status: {heartbeat_summary}
Yesterday's metrics: {metrics_json}
</context>

<daily_logs>
{concatenated_agent_logs_last_24h}
</daily_logs>

<task>
Conduct your 8-step daily review:
1. Read all agent logs from the last 24 hours
2. Identify patterns, anomalies, or concerning trends
3. Check confidence calibration (are agents over/under-confident?)
4. Review any escalated items awaiting your decision
5. Evaluate agent instruction effectiveness
6. Draft instruction updates if needed (provide exact diff)
7. Compose the morning briefing (team version + ops version)
8. Generate 1-3 reverse prompts for David
</task>

<output_format>
Return a JSON object with keys: review_summary, instruction_updates[], morning_briefing_team, morning_briefing_ops, reverse_prompts[], anomalies[], confidence_notes
</output_format>
```

### Council Briefing Prompt Structure
```xml
<role>You are {perspective_name} — one of three council reviewers.</role>

<perspectives>
- DealHunter: Maximize revenue opportunity. Ask "What deals could we close?"
- RevenueGuardian: Protect against costly errors. Ask "What could go wrong?"
- MarketSkeptic: Challenge assumptions. Ask "Is the data strong enough?"
</perspectives>

<item_under_review>
{sandbox_item_json}
</item_under_review>

<task>
Review this item from your perspective. Score 1-10 on: data_quality, confidence_warranted, action_readiness, risk_level. Provide 2-3 sentence reasoning.
</task>
```

### Instruction Rewrite Prompt
```xml
<current_instruction>
{agent_name}.md content
</current_instruction>

<feedback_data>
Approval rate last 7 days: {rate}%
Common rejection reasons: {reasons}
False positive examples: {examples}
David's manual overrides: {overrides}
</feedback_data>

<task>
Rewrite the agent instruction to address the feedback. Keep the same structure. Only change sections that need improvement. Mark each change with a comment: <!-- CHANGED: reason -->
</task>
```

---

## 9. Token Budget Guidelines

| Task | Input Budget | Output Budget | Total | Notes |
|---|---|---|---|---|
| Daily review (full) | 50K-80K | 5K-10K | 60K-90K | Logs can be large; summarize history |
| Council briefing (per reviewer) | 5K-10K | 1K-2K | 8K-12K | Item + context, short review |
| Instruction rewrite | 10K-15K | 8K-12K | 20K-25K | Full agent.md + feedback data |
| Morning briefing | 5K-10K | 2K-3K | 8K-13K | Synthesis from daily review |
| Escalation decision | 3K-5K | 500-1K | 4K-6K | Quick judgment call |
| CRM improvement proposal | 10K-20K | 3K-5K | 15K-25K | Needs codebase context |

**Monthly cost estimate at current rates:**
- Daily review: ~$3.50/day × 30 = ~$105/mo
- Council briefings: ~$0.50 each × 10/mo = ~$5/mo
- Instruction rewrites: ~$1.50 each × 8/mo = ~$12/mo
- Ad hoc: ~$30/mo buffer
- **Total Opus budget: ~$150-180/mo**

---

## 10. Error Recovery Patterns

### When Opus Produces Invalid JSON
1. Retry once with `temperature: 0.0` and explicit schema
2. If still invalid, parse partial JSON and fill gaps with defaults
3. Log the failure for instruction improvement

### When Opus Over-Recommends (Too Many Actions)
- Add constraint: "Maximum 3 highest-impact recommendations. Ruthlessly prioritize."
- If persistent, lower temperature to 0.1

### When Opus Under-Explains (Too Terse)
- Add: "For each recommendation, explain: what, why, expected impact, and risk"
- Provide an example of the desired depth

### When Opus Hallucinates Data
- Always cross-reference Opus claims against `agent_logs` and `sandbox_*` tables
- If a cited metric doesn't exist in logs, flag as hallucination and re-prompt with explicit data only
- Add to system prompt: "Only reference data present in the logs. Do not infer or estimate metrics not provided."

---

*For: IE CRM AI Master System — Chief of Staff prompting reference*
