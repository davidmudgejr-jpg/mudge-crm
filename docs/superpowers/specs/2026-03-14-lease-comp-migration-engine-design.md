# Lease Comp Migration Engine — Design Spec

> Date: 2026-03-14
> Status: Approved
> Approach: B — Reusable Engine + Migration Runner

## Problem

David has 9,730 rows of CoStar lease comp data in an Excel file (`Lease comps 1.1.18-2.15.26.xlsx`) across 3 sheets. Each row contains data that fans out across 5+ database tables (properties, companies, contacts, lease_comps, junctions). The CRM currently has 461 properties from a test import. This migration is the first step toward making the database production-ready.

Additionally, a CoStar-scraping agent will need to upload fresh lease comp data weekly via API. The engine must be reusable for both the one-time migration and recurring agent uploads.

## Data Source

**File:** `Lease comps 1.1.18-2.15.26.xlsx`

| Sheet | Rows | Unique Cols |
|-------|------|-------------|
| CoStarPowerBrokerLease | 9,139 | Core 24 cols |
| Expiring Leases 18mo | 493 | +Last Sale Date, +Hold Period |
| Matched - 10yr+ Hold & Expiring | 98 | +RBA, +Last Sale Date, +Hold Period |

**Stats:**
- 4,215 unique addresses (sheets 2 & 3 are subsets of sheet 1)
- 5,880 unique tenant names
- 637 tenant rep companies, 811 landlord rep companies
- Rent types: NNN, GRS, MGR, FSG
- All Industrial property type
- Multi-value broker fields (comma-separated, need dedup+split)

## Architecture

One engine, three consumers:

```
┌─────────────────────────────────────────────┐
│         leaseCompEngine.js                  │
│  processLeaseComps(rows, db, { dryRun })    │
│                                             │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Row Parser   │  │ Fuzzy Matcher        │  │
│  │ (per-source) │  │ (address, company,   │  │
│  └─────────────┘  │  contact)             │  │
│                    └──────────────────────┘  │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ Fan-Out      │  │ Gap Report           │  │
│  │ (5-table)    │  │ Generator            │  │
│  └─────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────┘
        │               │              │
        ▼               ▼              ▼
   Migration       Agent API       CRM Import
   Script          Endpoint        UI (later)
```

### File Locations

| File | Purpose |
|------|---------|
| `server/utils/leaseCompEngine.js` | Core engine: processLeaseComps(), fan-out, matching, gap report |
| `server/utils/rowParsers.js` | Source-specific row normalization (CoStar Excel, agent JSON) |
| `scripts/migrate-lease-comps.js` | One-time migration runner (reads Excel, calls engine) |
| `server/index.js` | New endpoints: POST /api/import/lease-comps, GET /api/reports/data-gaps |

## Pre-Migration Schema Fixes (Migration 009)

The spec review identified 3 schema issues that must be fixed before the engine runs:

1. **`lease_comps.escalations` — ALTER from NUMERIC to TEXT.** CoStar escalation data is mixed format ("2.00%", "0.04", "$0.03/sf/yr"). TEXT is the only safe type. Inserting "2.00%" into NUMERIC would throw a Postgres cast error.

2. **`property_companies` PK — ADD `role` to primary key.** Current PK is `(property_id, company_id)`. The fan-out creates two rows for the same property+company pair when a company is both tenant and leasing broker. PK must become `(property_id, company_id, role)` to allow multi-role junctions.

3. **`normalized_address` trigger — ALIGN street abbreviations with JS.** The SQL trigger in migration 002 only handles 3 abbreviations (street→st, avenue→ave, boulevard→blvd). The JS `normalizeAddress()` handles ~20 (drive→dr, road→rd, lane→ln, etc.). This mismatch causes false negatives — "1234 Main Drive" normalizes to "1234 main drive" in DB but "1234 main dr" in JS. The trigger must be updated to match.

## Section 1: Data Flow & Fan-Out

Processing order per row:

```
Excel Row
  │
  ├─→ 1. PROPERTY (find-or-create by normalized address + city)
  │     • Building Address + City + State → find existing or INSERT
  │     • Enrich only: Property Name, Property Type, RBA, Last Sale Date,
  │       holding_period_years (fill blanks, never overwrite)
  │
  ├─→ 2. TENANT COMPANY (find-or-create by normalized name)
  │     • Tenant Name → find existing or INSERT into companies
  │     • Set company_type = 'tenant'
  │     • Enrich: lease_exp from Expiration Date (update if newer expiration)
  │
  ├─→ 3. BROKER COMPANIES (find-or-create, skip "No Broker Involved")
  │     • Tenant Rep Company → find or INSERT, company_type = 'brokerage'
  │     • Landlord Rep Company → same
  │     • Split comma-separated, deduplicate within row
  │
  ├─→ 4. BROKER CONTACTS (find-or-create by name)
  │     • Tenant Rep Agents → strip designations (SIOR, CCIM, etc.), split comma-separated
  │     • Landlord Rep Agents → same
  │     • Link each to their rep company via contact_companies junction
  │
  ├─→ 5. LEASE_COMP (INSERT if no duplicate — see dedup rule below)
  │     • property_id from step 1, company_id from step 2
  │     • All comp fields: sf, commencement_date, term_months, rate,
  │       escalations, rent_type, concessions, lease_type, space_use, etc.
  │     • source = 'CoStar'
  │     • DEDUP: natural key = (property_id, tenant_name, commencement_date, sf)
  │       If match exists, skip (don't create duplicate comp from overlapping sheets)
  │
  └─→ 6. JUNCTION LINKS (idempotent — ON CONFLICT DO NOTHING)
        • property_companies: property ↔ tenant company (role='tenant')
        • property_contacts: property ↔ broker contacts (role='broker')
        • property_companies: property ↔ landlord rep company (role='leasing')
```

### Sheet Merging Strategy

Process sheets in this order: Sheet 3 (98 rows, has RBA + Last Sale Date) → Sheet 2 (493 rows, has Last Sale Date) → Sheet 1 (9,139 rows, most rows, least metadata). This ensures property records are enriched with RBA/last_sale_date before the bulk sheet hits.

### In-Memory Caches

During the run, maintain caches to avoid re-querying and prevent duplicates:
- `normalizedAddress|city → property_id` (pipe delimiter prevents key collisions)
- `normalizedCompanyName → company_id`
- `normalizedContactName → contact_id`
- `property_id|tenant_name|commencement_date|sf → lease_comp_id` (dedup natural key)

Pre-load all existing records into these caches before processing rows.

### Field Parsing Rules

| Field | Parse Rule |
|-------|-----------|
| Lease Term | "360 months" → extract integer 360, store as term_months |
| Contract Rent | "1.05" → NUMERIC, store as rate ($/SF/month) |
| Escalations | "2.00%", "0.04" → store as TEXT (mixed formats — requires migration 009 ALTER to TEXT) |
| Hold Period | SKIP — computed formula from last_sale_date (holding_period_years). Just ensure last_sale_date is populated. |
| Square Footage | Numeric, strip commas |
| Dates | Parse as DATE, handle NaT/NaN as NULL |
| "No Broker Involved" | Skip — do not create company or contact |
| Multi-value companies | "CBRE, CBRE, Daum" → split, dedup → ["CBRE", "Daum"] |
| Agent designations | Strip: SIOR, CCIM, CPA, Esq, Jr, Sr, II, III, MBA, PhD |

## Section 2: Fuzzy Matching Strategy

### Property Matching (by address)

Uses existing `normalizeAddress()` from `server/utils/addressNormalizer.js`.

| Tier | Method | Confidence | Action |
|------|--------|-----------|--------|
| 1 | Exact normalized address + same city | 100% | Auto-match |
| 2 | Normalized address ≥ 90% similarity + same city | 90% | Auto-match |
| 3 | Normalized address ≥ 80% similarity + same city | 80% | Log for review |
| — | Below 80% or different city | — | Create new property |

### Company Matching (by name)

Uses existing `normalizeCompanyName()` from addressNormalizer.js.

| Tier | Method | Confidence | Action |
|------|--------|-----------|--------|
| 1 | Exact normalized name | 100% | Auto-match |
| 2 | ≥ 85% similarity | 85% | Auto-match |
| — | Below 85% | — | Create new company |

Regional offices treated as separate companies (e.g., "Lee & Associates - Ontario" ≠ "Lee & Associates - Riverside").

### Contact Matching (by name)

**New function required:** `normalizeContactName()` — does not exist in current codebase. Must be built in `addressNormalizer.js`. Strips designations (SIOR, CCIM, CPA, Esq, Jr, Sr, II, III, MBA, PhD), lowercases, trims whitespace. The existing `matchContact()` in compositeMatcher.js prioritizes email (which CoStar data lacks) — the engine will use its own name-only matching path.

| Tier | Method | Confidence | Action |
|------|--------|-----------|--------|
| 1 | Exact normalized name (after designation stripping) | 100% | Auto-match |
| 2 | ≥ 85% similarity | 85% | Auto-match |
| — | Below 85% | — | Create new contact |

Additional disambiguation: if contact is already linked to the same brokerage, prefer that match.

### Fuzzy Match Review Log

Every non-exact match is logged:
```
{ type: "property"|"company"|"contact", original, matchedTo, similarity, rowNum }
```

Included in the migration report for manual review.

## Section 3: Engine Interface

### Core Function

```javascript
async function processLeaseComps(rows, db, options = {}) {
  // options: { dryRun: boolean, source: string }
  // Returns: report object
}
```

**Report object:**
```javascript
{
  properties: { created: N, enriched: N, matched: N },
  companies:  { created: N, matched: N },
  contacts:   { created: N, matched: N },
  leaseComps: { created: N },
  junctions:  { created: N, skipped: N },
  fuzzyMatches: [{ type, original, matchedTo, similarity, rowNum }],
  errors: [{ rowNum, message }],
  skipped: [{ rowNum, reason }],
  dataGaps: { /* gap report */ }
}
```

### Row Parsers

```javascript
// CoStar Excel → normalized row
function parseCoStarExcelRow(raw) → { address, city, state, propertyName, ... }

// Future: agent JSON → normalized row
function parseAgentPayload(raw) → { address, city, state, propertyName, ... }
```

### Consumers

**1. Migration Script** (`scripts/migrate-lease-comps.js`)
```
node scripts/migrate-lease-comps.js [--dry-run] [--sheet=all|1|2|3]
```
- Reads Excel via `xlsx` npm package
- Merges sheets (3 → 2 → 1 order)
- Dry-run first, then execute with confirmation

**2. Agent API Endpoint**
```
POST /api/import/lease-comps
Body: { rows: [...], source: "costar-agent", dryRun: false }
Response: { report }
```

**3. Gap Report Endpoint**
```
GET /api/reports/data-gaps
Response: { properties: { total, missing_lat_long, missing_rba, ... }, ... }
```

## Section 4: Data Gap Report

Auto-generated after every migration/import run.

### Property Gaps Tracked

| Field | Why It Matters |
|-------|---------------|
| latitude / longitude | Distance-based comp queries, map views |
| rba | TPE scoring, PLSF calculation |
| last_sale_date / last_sale_price | Holding period, TPE scoring |
| year_built | Age-based analysis |
| cap_rate | Investment analysis |
| noi | Investment analysis, cap rate validation |
| percent_leased | Vacancy analysis |
| costar_star_rating | TPE scoring |

### Auto-Fill Opportunities (done during migration)

- `companies.lease_exp` → set to latest expiration_date from tenant's lease comps
- `properties.property_type` → fill "Industrial" if blank
- `properties.property_name` → fill from comp data if blank

### Export

Gap report can dump a CSV of addresses missing each field — a "CoStar shopping list" for David to take into CoStar and pull the missing data.

## Existing Code Reused

| Module | What We Reuse |
|--------|--------------|
| `server/utils/addressNormalizer.js` | normalizeAddress(), normalizeCompanyName(), similarity(), levenshtein() |
| `server/utils/compositeMatcher.js` | matchProperty(), matchCompany() patterns (NOT matchContact — see note above) |
| `server/index.js` | SAVEPOINT transaction pattern, numeric sanitization |
| `migrations/002_normalized_address.sql` | DB trigger auto-computes normalized_address on INSERT (after 009 alignment fix) |

## New Code Required

| Module | What's New |
|--------|-----------|
| `server/utils/addressNormalizer.js` | `normalizeContactName()` — strip CRE designations from broker names |
| `server/utils/leaseCompEngine.js` | Core engine (entirely new) |
| `server/utils/rowParsers.js` | CoStar Excel parser (entirely new) |
| `scripts/migrate-lease-comps.js` | Migration runner (entirely new) |
| `migrations/009_pre_migration_fixes.sql` | escalations→TEXT, PK fix, trigger alignment |

## Not In Scope

- Authentication on agent endpoint (separate Tier 0 work)
- Rate limiting
- Scheduling/cron (agent handles its own timing)
- Sale comps import (separate future effort, same pattern)
- CRM Import UI integration (low priority — agent endpoint covers recurring case)

## Success Criteria

1. All 9,730 rows processed with per-row SAVEPOINTs (individual row failures don't block others)
2. ~4,215 properties created/enriched
3. ~5,880 tenant companies created
4. ~1,300 broker contacts created with company links
5. 9,730 lease_comp records created with property_id + company_id
6. Junction links created (property↔tenant, property↔broker)
7. Fuzzy match log < 200 entries (most matches should be exact after normalization)
8. Gap report generated showing what to pull from CoStar next
9. Existing 461 properties enriched (not overwritten)
10. Full run completes in < 5 minutes
