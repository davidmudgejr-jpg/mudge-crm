# IE Industrial CRM — CSV Import & Smart Lists
## Claude Code Build Prompts

---

## Overview

These six prompts build the CSV import pipeline and smart lists feature for the IE Industrial CRM. Run them **one at a time, in order**. Each prompt is a single Claude Code session. Do not combine prompts or skip steps.

**What this feature set builds:**
- Properties database schema and connection
- Smart filter system with saved lists in the sidebar
- CSV import pipeline for three data sources
- Address normalization and fuzzy duplicate matching
- Auto hot prospect priority flagging

---

## Your Three Data Sources

All three CSVs reference the same properties but use different column names for the address field. The import pipeline maps them automatically.

| Source | Address Column Name | Key Data It Brings In |
|---|---|---|
| CoStar Comps | `Property Address` | Sale date, sale price, buyer, cap rate, CoStar URL |
| Lease Expirations | `Address` | Tenant name, lease expiry date, SF leased |
| Loan Maturities | `Collateral Address` | Lender, loan amount, maturity date |

---

## Stack Context — Paste This at the Top of Every Claude Code Session

```
My CRM is called IE Industrial CRM.
Stack: [React / Electron / Vite / your DB here]

Properties table fields:
  id, address, city, county, property_type, building_sf, lot_sf,
  year_built, far, owner_name, owner_age, last_sale_date,
  last_sale_price, contacted_status, priority (1/2/3), costar_url,
  loan_maturity_date, lease_expiry_date, created_at, updated_at

SavedLists table fields:
  id, name, filters (JSON), is_auto_update (boolean), created_at

DB client is exported from: [path to your db file]
```

---

## The Six Prompts

---

### PROMPT 1 — Schema & Foundation
> Run this first. No UI will appear — this is the database layer everything else depends on.

```
I'm building a CRM for a commercial real estate brokerage focused on
industrial properties in the Inland Empire (Ontario, Fontana, Riverside,
Corona, Chino, Pomona). My stack is [YOUR STACK HERE].

Create the following database tables/schema:

Properties table:
  id, address, city, county, property_type, building_sf, lot_sf,
  year_built, far, owner_name, owner_age, last_sale_date,
  last_sale_price, contacted_status, priority (1/2/3),
  costar_url, loan_maturity_date, lease_expiry_date,
  created_at, updated_at

SavedLists table:
  id, name, filters (JSON), is_auto_update (boolean), created_at

The filters JSON column stores objects like:
  { city: ["Ontario", "Fontana"], last_sale_years_min: 10,
    building_sf_min: 10000, contacted_status: "Not Contacted",
    priority: [1, 2] }

Set up the database connection and export a db client I can use across
the app. No UI yet — just the schema and connection.
```

---

### PROMPT 2 — Properties Table View
> Gets your real data displaying in a table. Keep your existing sidebar and color theme.

```
Build the Properties page that fetches and displays all properties
from the properties table.

The table should show: Address, City, Building SF, Year Built,
Owner Name, Last Sale Date, Contacted Status, Priority.

Keep my existing sidebar navigation and color theme. Add a search
bar at the top that filters by address, owner name, or city as you
type — this should query the database, not just filter what's
already loaded in memory.

Show a record count above the table.
Paginate at 100 records per page.
```

---

### PROMPT 3 — Filter Panel & Filter Pills
> Adds the slide-in filter builder. All filtering happens server-side against your real database.

```
Add a filter system to the Properties page.

Add an "Add Filter" button that opens a slide-in panel from the right.
The panel should have controls for:
  - City (multi-select checkboxes)
  - Building SF (min/max number inputs)
  - Last Sale (inputs for "more than X years ago")
  - Contacted Status (multi-select)
  - Priority (multi-select: 1, 2, 3)
  - Owner Age (min/max)
  - Loan Maturity (within X months)
  - Lease Expiry (within X months)
  - FAR (min/max)

When filters are applied:
  - Each active filter appears as a removable pill above the table
  - The table re-queries the database with a WHERE clause built
    from active filters
  - The record count updates to reflect filtered results
  - Removing a pill re-runs the query without that filter
  - A "Clear All" button removes all filters and shows full results

Build a buildQuery(filters) function that takes the current filter
state object and returns the correct database query.
All filtering happens server-side, not in the browser.
```

---

### PROMPT 4 — Save as List & Sidebar My Lists
> Persists filter combinations to the database and populates the sidebar My Lists section.

```
Add a "Save as List" feature to the Properties page.

When one or more filters are active, show a "Save as List" button
next to "Add Filter". Clicking it opens a modal showing the current
active filters and an input field for the list name.

On save:
  - Write a new row to the SavedLists table with the name and
    current filters serialized as JSON
  - Close the modal
  - The new list immediately appears in the sidebar under "My Lists"

In the sidebar, below the main nav items, add a "My Lists" section
that fetches all rows from the SavedLists table on load.

Each list item shows:
  - List name
  - Live record count (re-queried fresh on load)

Clicking a list loads the Properties page with those saved filters
pre-applied by deserializing the JSON and running buildQuery(filters).
The active list should be highlighted in the sidebar.
```

---

### PROMPT 5 — CSV Import Pipeline
> This is the core data ingestion feature — the direct replacement for Power Query. Handles all three sources, normalizes addresses, and fuzzy-matches duplicates.

```
Build a CSV import system for the Properties page.

Add an "Import CSV" button in the sidebar. Clicking it opens a modal
with:
  - A source type selector: CoStar Comps, Lease Expirations,
    Loan Maturities
  - A drag-and-drop file upload area that accepts CSV files

On upload, run the following pipeline:

1. PARSE
   Read the CSV and map columns to our properties schema based on
   source type. Each source has different column names for the address:
     CoStar uses "Property Address"
     Lease CSV uses "Address"
     Loan CSV uses "Collateral Address"
   Define a columnMap object for each source type.

2. NORMALIZE
   For every address field, run a normalizeAddress(str) function that:
     - Lowercases everything
     - Expands abbreviations:
         St -> Street, Ave -> Avenue, Blvd -> Boulevard,
         Dr -> Drive, Rd -> Road,
         E -> East, W -> West, N -> North, S -> South
     - Strips punctuation and extra whitespace

3. MATCH
   For each imported row, check if a property with a matching
   normalized address already exists in the database.
   Use fuzzy matching with a similarity threshold of 0.85.
     - Match found above threshold: update that existing record
       with the new fields from this source
     - No match found: create a new property record

4. REPORT
   After processing, show a summary:
     X records updated
     Y records created
     Z records skipped
   Display any rows that fell below the match threshold as
   "Needs Review" so I can manually confirm or reject each one.

After import completes, all saved lists reflect updated data
automatically since they re-query on load.
```

---

### PROMPT 6 — Hot Prospect Auto-Flagging
> Adds the intelligence layer. Runs automatically after every import and creates two permanent built-in lists.

```
Add automatic priority flagging logic that runs after every CSV
import and once daily.

Create a function flagHotProspects() that queries all properties
and applies these rules:

Priority 1 (HOT) — property meets 2 or more of:
  - Last sale more than 15 years ago
  - Loan maturity within 18 months
  - Lease expiry within 18 months
  - Owner age over 65
  - Building SF between 10,000–50,000

Priority 2 — property meets exactly 1 of the above criteria

Priority 3 — property meets none of the above criteria

Update the priority field on every property record accordingly.

In the sidebar My Lists section, automatically create and maintain
two built-in lists that cannot be deleted:
  - "Hot Prospects" (Priority 1 + Not Contacted)
  - "Loan + Lease Convergence" (loan maturity AND lease expiry
    both within 18 months)

Show a flame emoji 🔥 next to Priority 1 properties in the table.
Run flagHotProspects() automatically after every CSV import completes.
```

---

## Tips for Working with Claude Code

**Do:**
- Run prompts strictly in order — each builds on the last
- Confirm the feature works before starting the next prompt
- Commit your code after each successful prompt
- Paste the stack context block at the top of each new session

**Avoid:**
- Combining multiple prompts into one session
- Moving to Prompt 6 if Prompt 5 import isn't working yet
- Asking Claude Code to fix bugs from a previous session without pasting the relevant code
