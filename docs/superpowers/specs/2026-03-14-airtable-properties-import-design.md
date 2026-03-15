# Airtable Properties CSV Import — Design Spec

**Date:** 2026-03-14
**Source:** `/Users/davidmudgejr/Downloads/Properties-All (DONT DELETE).csv`
**Estimated rows:** ~12,000
**Purpose:** Import Airtable property records into IE CRM, enriching the 3,465 properties from the lease comp migration and creating new ones with owner, tenant, zoning, and notes data.

---

## 1. Architecture

Same pattern as the lease comp migration engine:

- **`airtablePropertyParser.js`** — CSV row → canonical shape
- **`airtablePropertyEngine.js`** — Core engine (cache, match, fan-out, enrich)
- **`migrate-airtable-properties.js`** — CLI runner with `--dry-run` / `--live`

One CSV row fans out across up to 6 tables:

```
CSV Row → properties       (create or enrich)
        → contacts          (Owner Contact → role='owner')
        → contacts          (Broker Contact → role='broker')
        → companies         ((Company) Owner → role='owner')
        → companies         ((Company) Tenants → role='tenant', may be multi-value)
        → interactions      (Notes → date-parsed activity entries)
```

SAVEPOINT-per-row transactions. One bad row doesn't kill the batch.

Reusable: the engine function can be called from the CLI script, agent API endpoint, or CRM UI.

---

## 2. Column Mapping

### → Properties table

| CSV Column | DB Field | Transform |
|-----------|----------|-----------|
| Property Address | property_address | Primary match key, normalize |
| City | city | cleanStr |
| State | state | cleanStr, default 'CA' |
| Zip | zip | cleanStr |
| PropertyType | property_type | As-is: "Industrial", "Office", etc. |
| Property Name | property_name | cleanStr |
| Building Status | building_status | cleanStr |
| Building Class | building_class | cleanStr |
| Year Built | year_built | cleanNum → int |
| Year Renovated | year_renovated | cleanNum → int |
| RBA | square_footage / rba | cleanNum |
| Number Of Stories | number_of_stories | cleanNum → int |
| Land Area (AC) | land_area_ac | cleanNum |
| Land SF | land_sf | cleanNum |
| FAR | far | cleanNum |
| Zoning | zoning | cleanStr |
| Power | power | cleanStr |
| Ceiling Ht | ceiling_ht | cleanNum |
| Clear Ht | clear_ht | cleanNum |
| Number Of Loading Docks | number_of_loading_docks | cleanNum → int |
| Drive Ins | drive_ins | cleanNum → int |
| Column Spacing | column_spacing | cleanStr |
| Sprinklers | sprinklers | cleanStr |
| Number Of Cranes | number_of_cranes | cleanNum → int |
| Construction Material | construction_material | cleanStr |
| Rail Lines | rail_lines | cleanStr |
| Number Of Parking Spaces | number_of_parking_spaces | cleanNum → int |
| Parking Ratio | parking_ratio | cleanNum |
| Features | features | cleanStr |
| Last Sale Date | last_sale_date | cleanDate |
| Last Sale Price | last_sale_price | cleanNum (strip $, commas) |
| Price PSF | price_psf | cleanNum |
| For Sale Status | for_sale_status | cleanStr |
| Rent/SF/Mo | rent_sf_mo | cleanNum |
| Rate Type | rate_type | cleanStr |
| Debt Date | debt_date | cleanDate |
| Loan Amount | loan_amount | cleanNum |
| Contacted? | contacted | parse as array |
| Building Park | building_park | cleanStr |
| County | county | cleanStr |
| Owner Type | owner_type | cleanStr |
| Costar | costar_id | cleanStr (reference link) |
| Landvision | landvision_id | cleanStr (reference link) |
| Heating | heating | overflow JSONB |
| Sewer | sewer | overflow JSONB |
| Water | water | overflow JSONB |
| Gas | gas | overflow JSONB |
| Max Building Contiguous Space | max_contiguous_sf | cleanNum |

### → Contacts table

| CSV Column | DB Role | Transform |
|-----------|---------|-----------|
| Owner Contact | role='owner' | Split "First Last" → first_name + last_name |
| Broker Contact | role='broker' | Split "First Last" → first_name + last_name |

**Skipped phone fields** (deferred to contacts CSV import):
- Owner Phone, True Owner Phone, Recorded Owner Phone

### → Companies table

| CSV Column | DB Role | Transform |
|-----------|---------|-----------|
| (Company) Owner | role='owner' | normalizeCompanyName, single value |
| (Company) Tenants | role='tenant' | May be comma-separated → split, match/create each |

### → Interactions table (from Notes)

| CSV Column | Transform |
|-----------|-----------|
| Notes | Parse into individual interactions |

Parsing rules:
1. Split on newlines, semicolons, or `" - "` preceded by a date pattern
2. Date patterns: `M/D/YY`, `MM/DD/YYYY`, `YYYY-MM-DD`, `Mon DD, YYYY`
3. If date found → use as `interaction_date`; otherwise use import timestamp
4. `interaction_type` = `'note'`
5. `source` = `'airtable_import'`
6. Link via `interaction_properties` junction (property_id)
7. Link via `interaction_contacts` junction (contact_id) if owner contact matched

### → Skipped columns

| Column | Reason |
|--------|--------|
| Owner Name (col BI / Recorded Owner Name) | Old CoStar data, unreliable |
| Owner Phone, True Owner Phone | Deferred to contacts CSV import |
| Owner Address, Owner City State Zip | Owner mailing address, low priority |
| True Owner Address, True Owner City State Zip | Same |
| Recorded Owner Address, Recorded Owner City State Zip | Same |
| Recorded Owner Contact | Redundant with Owner Contact |
| True Owner Name, True Owner Contact | Redundant |
| Jr Deals copy | Linked field reference — logged but not auto-linked |
| Industry Type (from (Company) Tenants) 2 | Derived field |
| Target for.. | UI-only field |
| Zoning map | Link/image, not importable |

---

## 3. Matching & Dedup

### Property Matching
- Normalize address via `normalizeAddress()` + city
- **Exact match**: Cache lookup by `"${normalized}|${city}"`
- **Fuzzy ≥95%**: Auto-match
- **Fuzzy 90-94%**: Auto-match + flag ⚠️ REVIEW
- **<90%**: Create new property
- Cross-city guard: fuzzy match requires same city or zip prefix

### Company Matching
- `normalizeCompanyName()` strips Inc/LLC/Corp/Ltd
- Exact cache lookup first
- Fuzzy ≥85%: match
- <85%: create new

### Contact Matching
- `normalizeContactName()` strips designations
- Exact cache lookup first
- Fuzzy ≥85%: match
- <85%: create new

### Enrich-Only Rule
- Fill blank fields only, never overwrite existing data
- Cache entries updated in-memory after enrichment (for later rows referencing same entity)
- Conditional: `if (!existing.field && newValue) → update`

### Row Dedup
- Natural key: normalized_address + city
- If property already exists (from lease comp migration or earlier CSV row), enrich only
- Track processed addresses in a Set to prevent self-duplication within the CSV

---

## 4. Notes → Interactions

### Parsing Strategy

```javascript
function parseNotes(rawNotes) {
  // 1. Try splitting on date-prefixed segments
  //    "Called owner 1/15/24 - interested; Met 2/3/24 - needs roof"
  //    → [{date: '2024-01-15', text: 'Called owner - interested'},
  //       {date: '2024-02-03', text: 'Met - needs roof'}]

  // 2. If no dates found, split on semicolons or newlines
  //    "Good building; Owner wants $5M"
  //    → [{date: now, text: 'Good building'},
  //       {date: now, text: 'Owner wants $5M'}]

  // 3. If no delimiters, single interaction
  //    "Prime location near freeway"
  //    → [{date: now, text: 'Prime location near freeway'}]
}
```

### Interaction Record Shape
```javascript
{
  type: 'note',
  subject: 'Airtable Import Note',
  date: parsedDate || importTimestamp,
  notes: cleanedText,
  lead_source: 'airtable_import',
  // Linked via junction tables:
  // interaction_properties (property_id)
  // interaction_contacts (contact_id) — if owner contact exists
}
```

### Dedup
- Before inserting, check if an interaction with the same `notes` text already exists for this property
- Prevents duplicates if the import is run multiple times

---

## 5. Engine Flow

```
processAirtableProperties(rows, pool, { dryRun })
  │
  ├── loadCaches(pool)          // properties, companies, contacts
  │
  ├── for each row:
  │     ├── SAVEPOINT row_N
  │     ├── parseAirtableRow(raw)
  │     ├── findOrCreateProperty()    // fuzzy match, enrich-only
  │     ├── findOrCreateCompany()     // (Company) Owner → role='owner'
  │     ├── findOrCreateCompany()     // (Company) Tenants → split, each role='tenant'
  │     ├── findOrCreateContact()     // Owner Contact → role='owner'
  │     ├── findOrCreateContact()     // Broker Contact → role='broker'
  │     ├── upsertJunctions()         // property_companies, property_contacts
  │     ├── parseAndInsertNotes()     // Notes → interactions + junction links
  │     └── RELEASE row_N
  │
  ├── generateReport()
  │     ├── counts: created, matched, enriched, skipped, errors
  │     ├── fuzzyMatches: flagged for review
  │     └── gapReport: missing lat/long, RBA, etc.
  │
  └── return report
```

### CLI Interface
```bash
node scripts/migrate-airtable-properties.js --dry-run   # preview, no writes
node scripts/migrate-airtable-properties.js --live       # commit to DB
```

---

## 6. Gap Report

After import, report missing fields critical for CRM features:

| Field | Why It Matters |
|-------|---------------|
| Latitude/Longitude | Map display |
| RBA | Size filtering |
| Year Built | Age analysis |
| Last Sale Date/Price | Hold period computation |
| Owner Contact | Outreach |
| Zoning | Use analysis |

Format: counts + percentages, same as lease comp gap report.
