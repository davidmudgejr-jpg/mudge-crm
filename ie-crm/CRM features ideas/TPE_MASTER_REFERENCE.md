# TPE Master List — Complete Technical Reference

> **Transaction Probability Engine v2.20** — Mudge Team CRE
> Last updated: February 27, 2026
> File: `TPE_Master_List_v2_20.xlsx`

---

## What This Is

The TPE is an Excel-based prospecting prioritization engine for a 3-person commercial real estate brokerage team (David, his father, and his sister Sarah) at Lee & Associates — Riverside. It scores 3,700 industrial properties in California's Inland Empire (10,000–100,000 SF) by transaction probability, then ranks them for outbound calling.

The file is a **read-only scored report** generated on demand. All data entry happens in Airtable. The Excel file is never manually edited (except the two status columns used during live calling).

---

## Tab Inventory (9 tabs)

| Tab | Purpose | Data Source |
|---|---|---|
| ⭐ MASTER SCORED LIST | Primary output — ranked call list with all scores and formulas | Merged from all tabs below |
| 📋 REFRESH PROTOCOL | Documentation — field mapping, Airtable IDs, refresh workflow | Internal reference |
| ⚖️ Score Weights | Scoring model configuration — point values, tier thresholds, market assumptions | Internal reference |
| 🚨 Distressed — Title Rep | 59 properties: NOD (13), Auction (15), REO (31) | Title rep distress reports |
| 🏦 Loan Maturity — Title Rep | 98 properties with confirmed loan maturity dates, enhanced scoring | Title rep RCA loan export |
| 📅 Lease Expiry — Company DB | Lease expiration dates and broker rep data | Company internal lease comp database |
| 📈 Tenant Growth — CoStar | 92 properties with tenant headcount growth signals | CoStar analytics + Vibe Prospecting |
| 👤 Ownership — Airtable | Owner names, ages, entity types, hold durations | Airtable CRM pull |
| 💰 Debt & Stress — Title Rep | SBA loans, deeds of trust, UCC filings, balloon estimates | Title rep data |

---

## Master Scored List — Column Map (v2.20)

### Call Status (Columns A–B) — Manual entry during calling

| Col | Header | Purpose |
|---|---|---|
| A | 🏠 Owner Status | Blank = not started. "A" = attempted, "C" = connected, "S" = skip |
| B | 🏢 Tenant Status | Same system. Separate tracking for owner and tenant sides |

### Property Data (Columns C–S) — Static data from source tabs

| Col | Header | Source |
|---|---|---|
| C | RANK | Sequential 1–3700, reflects sort order at time of generation |
| D | Building Address | CoStar / Airtable |
| E | City | CoStar / Airtable |
| F | SF Leased | CoStar |
| G | Building SF (RBA) | CoStar |
| H | Tenant Name | Airtable (Properties → Companies link) |
| I | Expiration Date | Lease Expiry tab |
| J | Months to Expiry | Calculated from I |
| K | Owner Name | Airtable (Properties → Owner Contact → Contacts.Full Name) |
| L | Owner Entity Type | CoStar / Airtable — "Individual", "Private", "Trust", etc. Only ~6% populated |
| M | Owner-User / Investor | CoStar — "Owner" or "Investor" |
| N | Hold Duration (Yrs) | CoStar / Airtable — years since last sale |
| O | Owner Age (Est.) | Airtable Contacts.Age — only ~3% populated, highest-leverage research task |
| P | Out of Area? | CoStar — owner address vs property address |
| Q | Tenant Growth % | CoStar / Vibe Prospecting — headcount change percentage |
| R | Balloon Confidence | Debt & Stress tab — "HIGH", "MEDIUM", "LOW" estimate |
| S | Lien/Delinquency? | Distressed tab — mechanic's liens, tax liens, delinquencies |

### Scoring Formulas (Columns T–Y) — Five scoring categories

| Col | Header | Max | Formula Logic |
|---|---|---|---|
| T | Lease Score | 30 | ≤12mo=30, 12-18mo=22, 18-24mo=15, 24-36mo=8, else=0 |
| U | Ownership Score | 25 | Entity type (Indiv/Private/Partnership=8, Trust=10) + Hold duration (20yr+=10, 15-20=7, 10-15=4) + Owner-occupied bonus (+7). Capped at 25. |
| V | Age Score | 20 | 70+=20, 65-70=15, 60-65=10, 55-60=5, else=0 |
| W | Growth Score | 15 | 30%+=15, 20-30%=10, 10-20%=5, else=0 |
| X | Stress Score | 10 | Balloon HIGH=10, MED=7, LOW=4 + Lien=5. Capped at 10. |
| Y | TOTAL SCORE | 100 | =T+U+V+W+X |

### Transaction & Commission Model (Columns Z–AC)

| Col | Header | Formula Logic |
|---|---|---|
| Z | TIER & ACTION | ≥85=🔴 CALL THIS WEEK, ≥70=🟠 CALL THIS MONTH, ≥50=🟡 CALL THIS QUARTER, else=🟢 NURTURE |
| AA | Likely Transaction | Owner-side (U+V+X) vs Tenant-side (T+W). Diff >5 → SALE or LEASE. Else → BLENDED. |
| AB | Est. Gross Commission | SALE: SF×$250×tiered rate (3%/2%/1%). LEASE: SF×tiered lease rate×60mo×4%. BLENDED: 40% sale + 60% lease. |
| AC | Time Multiplier | Lease ≤6mo=1.2x, 6-12mo=1.1x, 12-24mo=1.0x, Sale/no deadline=0.85x |

**Commission rate tiers (sale):** ≤$5M value = 3%, $5-10M = 2%, >$10M = 1%
**Lease rate tiers:** ≤30K SF = $1.15/SF/mo, 30-50K = $1.00, 50K+ = $0.90

### Blended Priority — The Primary Sort (Column AD)

| Col | Header | Formula |
|---|---|---|
| AD | Blended Priority | `=0.7 × MIN(TotalScore + MaturityScore, 100) + 0.3 × MIN(100, CommissionNormalized)` |
| AE | PRIORITY ACTION | ≥50=🔴 HIGH PRIORITY, ≥40=🟠 SOLID, ≥30=🟡 MODERATE, <30=🟢 LOW |

**Key design decision (v2.20):** The list is sorted by Blended Priority, NOT by ECV. This weights 70% on transaction probability and 30% on commission potential. A 15K SF building with a maturing loan and aging owner ranks above a 50K SF building with only a long hold. This optimizes for deal volume (critical at current career stage — targeting 20 deals × $75K avg = $1.5M gross team revenue) rather than maximum expected dollar return per call.

The commission component in the 30% weight is normalized so that a $250K+ sale commission = 100 points, scaling linearly below that.

**Blended Priority is displayed as a raw 0–100 number, no symbol.** It is NOT a literal probability of closing. It's a composite priority index.

### Confirmed Maturity Model (Columns AF–AJ)

| Col | Header | Source/Logic |
|---|---|---|
| AF | Confirmed Maturity Score | 0–35 points. Base: matured=25, ≤1mo=22, 1-3mo=18, 3-6mo=15, 6-9mo=12, 9-12mo=10. Bonuses: LTV (0-5), Duration (0-3), Purpose (0-2). |
| AG | Maturity Date | From title rep RCA export |
| AH | Loan Amount | From title rep RCA export |
| AI | Lender | From title rep RCA export |
| AJ | ECV w/ Maturity Boost | `=((MIN(TotalScore + MaturityScore, 100)/100) × SaleCommission × 1.2)` — forces sale calc, max time multiplier |

**98 properties** have maturity data. Enhanced scoring adds LTV bonus (≥85%=+5, 75-84%=+3, 65-74%=+1), loan duration bonus (≤2.5yr bridge=+3, 2.5-4yr=+1), and loan purpose bonus (acquisition/construction=+2).

### Courtesy & Workflow (Columns AK–AM)

| Col | Header | Purpose |
|---|---|---|
| AK | 🤝 Office Courtesy | Flags 136 properties where a Lee & Associates Riverside broker represented landlord or tenant |
| AL | 📞 ACTION — Who to Call & Why | Detailed call script/action — 15-tier priority cascade |
| AM | 🔍 RESEARCH PRIORITY — For Backend Team | Tells Sarah what data to find for each property |

**Office Courtesy rules:**
- ⚠️ OWNER flagged (Lee Riv was LL rep) → don't call owner, tenant side may be clear
- ⚠️ TENANT flagged (Lee Riv was TR rep) → don't call tenant, owner side may be clear
- Double-ended (same agent both sides) → owner blocked but tenant is fair game (was unrepresented)
- Different agents on each side → both sides blocked (two real relationships)
- 136 total flagged: 56 owner-only, 45 tenant-only, 28 double-ended, 7 different-agent

### Owner Classification (Columns AN–AO)

| Col | Header | Formula Logic |
|---|---|---|
| AN | 🏢 Owner Entity | Extracts entity names (LLC, Inc, Corp, Trust, LP) from Owner Name |
| AO | 👤 Owner Contact Name | If owner name is a person (not an entity), shows it as the contact |

---

## Scoring Model — Deep Dive

### Total Score (0–100) — Five Categories

```
LEASE EXPIRATION (30 pts max)
  ≤12 months      → 30 pts   Hard deadline, highest urgency
  12–18 months     → 22 pts   Inside decision window
  18–24 months     → 15 pts   Approaching window
  24–36 months     →  8 pts   Long runway but tracked
  >36 months / NA  →  0 pts

OWNERSHIP PROFILE (25 pts max, capped)
  Entity: Individual/Private/Partnership → 8 pts, Trust → 10 pts
  Hold: 20+ yrs → 10 pts, 15-20 → 7, 10-15 → 4
  Owner-occupied bonus → +7 pts
  Out-of-area → +5 pts

OWNER AGE (20 pts max)
  70+  → 20 pts   Estate/succession pressure
  65–70 → 15 pts   Retirement planning
  60–65 → 10 pts   Beginning to think about exit
  55–60 →  5 pts   On the horizon

TENANT GROWTH (15 pts max)
  30%+ headcount growth → 15 pts
  20–30%               → 10 pts
  10–20%               →  5 pts

DEBT / STRESS (10 pts max, capped)
  SBA balloon ≤24mo    →  7 pts
  Mechanic's/tax lien   →  5 pts
  Property tax delinquent →  5 pts
```

### Blended Priority Formula (v2.20)

```
BlendedPriority = 0.7 × MIN(TotalScore + ConfirmedMaturityScore, 100)
                + 0.3 × MIN(100, NormalizedCommission)

Where NormalizedCommission:
  SF × $250 × commission_rate / 2500
  (scales so ~$250K commission = 100 points)
```

### Confirmed Maturity Scoring (0–35 pts)

```
BASE TIMING SCORE:
  Loan already matured (past due)  → 25 pts
  Maturing ≤ 1 month              → 22 pts
  Maturing 1–3 months             → 18 pts
  Maturing 3–6 months             → 15 pts
  Maturing 6–9 months             → 12 pts
  Maturing 9–12 months            → 10 pts

BONUSES:
  LTV ≥ 85%           → +5 pts
  LTV 75–84%          → +3 pts
  LTV 65–74%          → +1 pt
  Loan duration ≤ 2.5yr → +3 pts (bridge loan)
  Loan duration 2.5–4yr → +1 pt
  Purpose: Acquisition  → +2 pts
  Purpose: Construction → +2 pts

DISTRESS CATEGORIES (from Distressed tab):
  AUCTION → 25 pts base
  NOD     → 20 pts base
  REO     → 0 pts (bank-owned, different opp type)
```

### Likely Transaction Logic

```
owner_side  = Ownership_Score + Age_Score + Stress_Score
tenant_side = Lease_Score + Growth_Score

IF owner_side > tenant_side + 5  → "SALE"
IF tenant_side > owner_side + 5  → "LEASE"
ELSE                             → "BLENDED"
```

### Commission Calculation

```
SALE:
  value = SF × $250/SF
  commission = value × rate
    rate: ≤$5M → 3%, $5-10M → 2%, >$10M → 1%

LEASE:
  consideration = SF × lease_rate × 60 months
    lease_rate: ≤30K SF → $1.15/mo, 30-50K → $1.00, 50K+ → $0.90
  commission = consideration × 4% (tenant rep)

BLENDED:
  commission = 0.4 × sale_commission + 0.6 × lease_commission
```

---

## Action Column Logic (AL — 📞 Who to Call & Why)

15-tier priority cascade, evaluated top-to-bottom (first match wins):

1. Maturity ≥25 + Investor with tenant → 🔴 CALL OWNER (default/auction) + TENANT (may relocate)
2. Maturity ≥25 → 🔴 CALL OWNER (default/auction, pre-foreclosure)
3. Maturity ≥15 + Investor with tenant → 🔴 CALL OWNER (refi stress, 1031) + TENANT (property may trade)
4. Maturity ≥15 → 🔴 CALL OWNER (loan maturing, sale-leaseback/1031)
5. Maturity ≥10 → 🟠 CALL OWNER (maturing 6-12mo, consultative)
6. Lease score ≥22 + Owner-user → 🔴 CALL OWNER (renewal/relocation)
7. Lease score ≥22 + Tenant exists → 🔴 CALL OWNER + CALL TENANT (dual opp)
8. Lease score ≥22 → 🔴 CALL OWNER (re-leasing/disposition)
9. Lease score ≥15 + Tenant → 🟠 CALL OWNER + CALL TENANT (space planning)
10. Lease score ≥15 → 🟠 CALL OWNER (12-18mo)
11. Lease score ≥8 → 🟡 CALL OWNER (2-3yr, relationship building)
12. Growth score >0 + Tenant → 🟠 CALL TENANT (expansion/relocation)
13. Hold ≥15yr + Age ≥60 → 🟠 CALL OWNER (1031/estate planning)
14. Hold ≥15yr + Owner-user → 🟡 CALL OWNER (equity unlock)
15. Stress ≥7 → 🟡 CALL OWNER (problem-solving outreach)
16. Fallback → 🟢 Low priority / Nurture only / ⬜ No signals

---

## Research Priority Logic (AM — 🔍 For Backend Team)

Tells Sarah what data to research, in priority order:

1. Maturity ≥15 + no contact → 🔴 OWNER: Get phone + find contact behind [entity] — loan maturing
2. Maturity ≥15 + has contact → 🔴 OWNER: Get phone for [contact] — time sensitive
3. Entity exists + no contact + score ≥30 → ⭐ OWNER: SOS lookup — who is behind [entity]?
4. No owner name + SF ≥10K → GET OWNER from assessor records
5. Has contact + no age + hold ≥15yr → ⭐ OWNER: Get age for [contact] (+15-20pts potential)
6. Has contact + no age + hold ≥7yr → GET AGE for [contact] (+10pts potential)
7. Entity exists + no contact + SF ≥10K → Find contact name behind [entity]
8. Investor + no tenant + SF ≥10K → TENANT: ID tenant + get lease term (dual-commission opp)
9. Not owner/investor + SF ≥10K → VERIFY: Owner-occupied or investor?
10. Score ≥20 → ✅ Ready to call — data sufficient
11. SF <10K → Below target SF — low priority
12. Else → Low score — monitor only

All outputs include explicit **OWNER:** or **TENANT:** prefixes so backend team knows which side to research.

---

## Data Pipeline — Refresh Protocol

### Architecture

```
Airtable (Source of Truth) → Claude processes → TPE Excel (Scored Report)
```

All data entry by the team happens in Airtable. The TPE file is regenerated on demand — never manually edited.

### Airtable Connection

| Resource | ID |
|---|---|
| Base | CRM (appQaZNM0Mt4Zul3q) |
| Properties Table | tbl0TXP17Z8h7q8ku |
| Contacts Table | tblpF0pOtdHVsxvVT |
| Companies Table | tblCsi6auHFAbnPNl |

**Key linked field:** Properties.Owner Contact → Contacts (live, connected data)
**Stale fields to ignore:** Properties.Owner Name, Recorded Owner Name, True Owner Name (old CoStar dump)
**Live fields to use:** Properties.Owner Contact → Contacts.Full Name, Age, Phone, Email

### Refresh Workflow

1. User says "Refresh the TPE" (optionally uploads new source files)
2. Pull from Airtable: Properties + linked Contacts + linked Companies
3. Merge external data: any new uploaded files into appropriate source tabs
4. Flag new additions: "47 new owner names, 12 ages since last refresh"
5. Re-run all scoring formulas
6. Re-sort by Blended Priority descending
7. Deliver fresh Excel file

### Data Completeness (as of v2.20)

| Data Point | Count | % of 3,700 | Notes |
|---|---|---|---|
| Owner Names | 1,094 | 29.6% | Rest need Airtable sync or research |
| Owner Ages | 120 | 3.2% | Highest-leverage research task (+15-20pts per fill) |
| Hold Duration | 1,784 | 48.2% | |
| Entity Types | 219 | 5.9% | |
| Lease Expirations | varies | — | From company DB |
| Confirmed Maturities | 98 | 2.6% | From title rep |
| Distressed Properties | 59 | 1.6% | NOD (13), Auction (15), REO (31) |
| Tenant Growth | 92 | 2.5% | From CoStar/Vibe |

64% of properties lack enrichment beyond basic CoStar data. Most properties score based on only 1-2 variables.

---

## Version History

| Version | Key Changes |
|---|---|
| v2.15 | Added Confirmed Loan Maturity model (62 properties, 25pt max) |
| v2.16 | Enhanced maturity scoring with LTV/duration/purpose bonuses (35pt max), integrated distress data (59 properties), expanded maturity tab to 98 entries |
| v2.17 | Added Action/Research Priority columns, split Owner Entity vs Contact, added OWNER:/TENANT: prefixes |
| v2.18 | Discovered VLOOKUP architecture was backwards |
| v2.19 | Declared Airtable as source of truth, removed all 5,710 VLOOKUPs (resolved to static values), created Refresh Protocol doc, added emoji tab names with data source annotations |
| v2.20 | Shifted from ECV sort to Blended Priority (70% probability / 30% commission), added Office Courtesy flags for Lee Riverside (136 properties), added Owner/Tenant Status columns for call tracking, converted blended priority from % to raw 0-100 |

---

## Known Issues & Pending Decisions

- **8 Vibe Prospecting companies** — awaiting decision on adding to Tenant Growth tab
- **22 unmatched Q1 maturity properties** — not in current 10K-100K SF TPE universe, available in Loan Maturity tab
- **Stress score cap too low** — A property with NOD + tax lien + SBA balloon gets only 10 points. Distress from Distressed Properties tab flows through regular stress score (capped at 10) while loan maturity gets its own enhanced model (up to 35). Inconsistency to address in future version.
- **Likely Transaction logic on sparse data** — Properties with only hold duration (no lease/tenant data) default to "SALE" prediction, which may be overconfident

---

## Excel Technical Notes

### Merged Cells (Rows 1-3)

| Range | Content |
|---|---|
| A1:AO1 | Title bar |
| A2:B2 | CALL STATUS |
| C2:Z2 | Data sources description |
| AA2:AE2 | COMMISSION & PRIORITY MODEL |
| AF2:AJ2 | CONFIRMED MATURITY MODEL |
| AK2:AM2 | COURTESY & WORKFLOW |
| AN2:AO2 | OWNER CLASSIFICATION |

### Row Heights

- Row 1 (title): 36
- Row 2 (group headers): 22
- Row 3 (column headers): 45
- Rows 4+ (data): 30

### Font Standards

- All headers: Arial
- Row 1: Arial 14pt bold white on navy (#1F3864)
- Row 2: Arial 10pt bold white on section colors
- Row 3: Arial 9pt bold white
- Data rows: Arial 9pt

### Formula Column References (v2.20 — after status column insert)

All formulas reference the current column positions. Key mappings:
- J = Months to Expiry (Lease Score input)
- L = Owner Entity Type (Ownership Score input)
- N = Hold Duration (Ownership Score input)
- O = Owner Age (Age Score input)
- Q = Tenant Growth % (Growth Score input)
- R = Balloon Confidence (Stress Score input)
- S = Lien/Delinquency (Stress Score input)
- Y = Total Score (sum of T through X)
- AF = Confirmed Maturity Score (Blended Priority input)
- G = Building SF RBA (Commission calculation input)
- AN = Owner Entity (Research Priority output)
- AO = Owner Contact Name (Research Priority output)

### Office Courtesy Column (AK) — Lease Expiry Tab Cross-Reference

Source columns from Lease Expiry tab: P (Landlord Rep Company), Q (Landlord Rep Agents), R (Tenant Rep Company), S (Tenant Rep Agents). Agent names parsed from comma-separated lists, normalized to lowercase. If same agent appears on both LL and TR sides → double-ended deal (only owner blocked). If different agents → two real relationships (both sides blocked).
