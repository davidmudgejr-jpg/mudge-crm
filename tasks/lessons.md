# Lessons Learned

> Updated after each correction. Reviewed at the start of each session.

## 2026-04-04 — Session 1

### Migration Conflicts
**Mistake**: Created migration 060 that `DROP VIEW IF EXISTS deal_formulas` without checking that migration 059 (from a parallel commit) had already redefined the same VIEW with a new `price_computed` column. My migration wiped it out.
**Rule**: Before creating a migration that drops/recreates a VIEW or table, always check ALL existing migrations for the same object — including ones from recent commits that may not be in your local context yet.

### AuthContext Token Not Exposed
**Mistake**: Dedup components destructured `{ token }` from `useAuth()` but the context provider never included `token` in its value. Result: `Bearer undefined` → 401 → force-logout cascade.
**Rule**: When components use a context value, verify the provider actually exposes it. Grep for all destructuring patterns of a context before assuming it provides what you need.

### Schema Column Assumptions
**Mistake**: Merge endpoints used `updated_at = NOW()` for all entity tables, but `contacts` and `companies` don't have that column. `properties` uses `last_modified` instead.
**Rule**: Never assume column names are consistent across tables. Check the actual schema. Use a config object (like `timestampCol`) to make the column name explicit per entity type.

### Stale Data After View Drop
**Mistake**: Applied migration 060 which recreated `deal_formulas` VIEW using an older formula definition, making `price_computed` disappear from the frontend.
**Rule**: After applying any migration that recreates a VIEW, immediately verify the VIEW's column list matches what the frontend expects. Run a quick `SELECT * FROM view LIMIT 1` check.

## 2026-04-14 — Verification Queue Grouping & Schema Drift

### Grouped-by-batch-id Without Checking Entity
**Mistake**: Shipped the verification queue grouping feature with `groupByBatch` keyed on `batch_id` alone. I wrote a comment explicitly claiming "a batch always targets one entity" — and that assumption was false. Agents writing 6 rows under one `batch_id` for two different entities (Walker Stamping + Union Pacific) caused those rows to render as one "Walker Stamping" card with 6 rows. If the user had clicked Approve All, Union Pacific's decision-maker data would have been silently written onto Walker Stamping's record, corrupting both companies.
**Rule**: Before choosing an aggregation/grouping key, verify the assumption against real data. "I assume X is 1-to-1 with Y" is a testable claim — run `SELECT x, COUNT(DISTINCT y) FROM table GROUP BY x HAVING COUNT(DISTINCT y) > 1` to check. The right grouping key is `(batch_id, entity_id)` — BOTH must match for rows to share a card.

### Agents Writing to a Nonexistent Schema
**Mistake**: The AI enrichment agent fleet has been writing `suggested_updates` rows with `field_name='decision_maker_title'` / `'decision_maker_name'` / `'email_1'` and `entity_type='company'` — but none of those columns existed on the `companies` table. `suggested_updates.field_name` is free-text with no check constraint, so the INSERTs succeeded silently. The apply step (batch approve) failed for every such row with "column does not exist" → cascade 500 → user saw generic "Failed to batch review suggestions." This bug was latent for days/weeks until the new batch UI surfaced it.
**Rule**: When agents write to `suggested_updates`, the `field_name` must correspond to a real column on the target table. Either (a) enforce it with a server-side validator on POST that rejects field_names not in the `ALLOWED_COLS` whitelist, or (b) add a trigger that validates field_name against `information_schema.columns` before insert. Don't rely on the apply step as the validation point — by then the data is already in the queue and the pipeline has silently failed.
**Corollary**: Approvals should NEVER cascade-fail — use per-row try/catch in the batch handler so one bad row can't poison the whole batch.
