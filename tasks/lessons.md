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
