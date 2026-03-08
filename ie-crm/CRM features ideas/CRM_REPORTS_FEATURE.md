# IE CRM — Report Generation Feature

## Overview

This document defines the full architecture and build plan for the Report Generation system in the IE CRM (Mudge Team CRE). This is a commercial real estate brokerage CRM built in React/Electron/Vite for the Inland Empire industrial property market.

The report system allows users to **select one or more records** in any CRM module and generate a polished, branded output in one click — PDF, Word, or Excel depending on report type.

---

## Business Context

- **Brokerage:** Mudge Team CRE — small family team (David, his father, sister Sarah)
- **Market:** Industrial CRE in the Inland Empire (Ontario, Fontana, Riverside, Corona, Chino, Pomona)
- **Goal:** Replace manual report-building (30+ min tasks) with one-click generation
- **Brand constraint:** All outputs must look consistent and professional — same logo, colors, fonts, footer

---

## UX: How the Feature Works

### Trigger
When a user selects one or more records in a table view (Properties, Contacts, Companies, or Deals), a **floating action bar** appears at the bottom of the screen — similar to Gmail's bulk action bar.

The action bar shows contextually relevant report buttons based on which module is active.

### Flow
1. User checks one or more records
2. Floating action bar appears with relevant report buttons
3. User clicks a report type
4. System fetches full record data for selected IDs
5. Report is generated and either:
   - Opens in a new window/tab for review before download
   - Downloads directly as PDF/XLSX

### Single vs. Multi-record
- Some reports work on a single record (Fact Sheet, BOV)
- Some require multiple records (Comp Sheet needs 2+)
- Some work either way (Call List, Account Summary)
- Buttons should be disabled with a tooltip if the wrong number of records are selected

---

## Report Types by Module

### Properties Module

| Report | Output | Single/Multi | Description |
|--------|--------|--------------|-------------|
| Property Fact Sheet | PDF | Single | Marketing one-pager: address, SF, zoning, asking price/rate, photos, key specs. Client-facing. |
| Comp Sheet | PDF | Multi (2–6) | Side-by-side comparison of selected properties for buyer/tenant presentation |
| BOV / Opinion of Value | PDF | Single | Broker Opinion of Value — pulls valuation fields, comps, and AI-written narrative |
| Owner Prospecting Letter | PDF/DOCX | Multi | Mail-merge style letter per property, addressed to the owner from the contacts table |

### Contacts Module

| Report | Output | Single/Multi | Description |
|--------|--------|--------------|-------------|
| Call List / Canvassing Sheet | PDF | Multi | Name, phone, company, last interaction date, notes column — for prospecting sessions |
| Relationship Summary | PDF | Single | Full contact profile: associated properties, deals, interaction history, open tasks |

### Companies Module

| Report | Output | Single/Multi | Description |
|--------|--------|--------------|-------------|
| Account Summary | PDF | Single | Company overview: contacts, properties owned/occupied, deal history |
| Portfolio Overview | PDF | Single | All properties associated with a company on one page |

### Deals Module

| Report | Output | Single/Multi | Description |
|--------|--------|--------------|-------------|
| Deal Summary Sheet | PDF | Single | Deal status, parties, key dates, commission breakdown |
| Commission Projection | PDF | Multi | Pipeline view with probability-weighted commission totals |
| Lease vs. Buy Proforma | XLSX | Single | Full Excel analysis (see below) |

---

## Architecture

### Folder Structure

```
/src
  /reports
    /shared
      reportShell.html        ← Master HTML wrapper (header + footer)
      reportStyles.css        ← Brand colors, typography, shared component styles
      mudgeTeamLogo.png       ← Company logo (transparent PNG)
      helpers.js              ← Shared formatters: currency, SF, dates, phone
      pdfGenerator.js         ← Puppeteer/Playwright wrapper for HTML → PDF
    /excel
      excelTheme.js           ← Shared brand colors, fonts, column styles for all XLSX
    /types
      propertyFactSheet.js
      compSheet.js
      bovReport.js
      ownerProspectingLetter.js
      contactCallList.js
      relationshipSummary.js
      accountSummary.js
      portfolioOverview.js
      dealSummary.js
      commissionProjection.js
      leaseVsBuyProforma.js
  /components
    /reports
      ReportActionBar.jsx     ← Floating multi-select action bar
      ReportButton.jsx        ← Individual button with icon + label
      ReportPreviewModal.jsx  ← Optional preview before download
```

---

## Shared Report Shell

Every HTML/PDF report is wrapped in the same shell. Individual report content is injected into the `<main>` section.

### Header (every report)
- Mudge Team CRE logo (top left)
- Report title (center or top right)
- Date generated (top right)

### Footer (every report)
- Agent name | Mudge Team CRE | Phone | Email | CalDRE License #
- "Confidential — Prepared for [Client Name]" (when applicable)
- Page X of Y

### Brand Variables to Define (fill in before first build)
```
PRIMARY_COLOR: [your brand hex — e.g. #1B3A6B]
ACCENT_COLOR: [secondary color — e.g. #C8A951]
FONT_FAMILY: [e.g. 'Inter', sans-serif]
LOGO_PATH: /reports/shared/mudgeTeamLogo.png
BROKERAGE_NAME: Mudge Team CRE
PHONE: [xxx-xxx-xxxx]
EMAIL: [david@mudgeteamcre.com]
DRE_NUMBER: [CA DRE #xxxxxxx]
```

---

## PDF Generation

Use **Puppeteer** (already available in Node/Electron environment).

```js
// pdfGenerator.js pattern
async function generatePDF(htmlContent, options = {}) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.75in', bottom: '0.75in', left: '0.75in', right: '0.75in' }
  });
  await browser.close();
  return pdf;
}
```

Each report type calls this with its rendered HTML and gets back a PDF buffer for download.

---

## AI Narrative Layer (Claude API)

For reports that include written narrative sections (BOV, Property Description, Market Context), use the Claude API to generate the text from structured record data.

### Pattern
```js
async function generateNarrative(recordData, narrativeType) {
  const prompt = buildPrompt(narrativeType, recordData);
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await response.json();
  return data.content[0].text;
}
```

### Narrative Types
- `property_description` — 2–3 paragraph marketing description of a property
- `market_context` — brief Inland Empire industrial market commentary
- `bov_recommendation` — broker recommendation and valuation rationale
- `owner_letter_body` — personalized prospecting letter body

---

## Lease vs. Buy Proforma (Excel)

This is a standalone Excel deliverable — the most complex report but a strong client-facing tool.

### Tabs
1. **Summary** — side-by-side 10-year cost comparison chart + recommendation
2. **Lease Analysis** — monthly/annual lease payments, escalations, TI/LC costs, total occupancy cost
3. **Buy Analysis** — purchase price, down payment, mortgage schedule, property tax, insurance, maintenance
4. **Equity & Tax Benefits** — equity build over time, depreciation schedule, interest deduction estimate
5. **Assumptions** — all input variables in one place (editable by client)

### Excel Theme Object
```js
// excelTheme.js
export const excelTheme = {
  headerFill: 'YOUR_PRIMARY_HEX',
  headerFont: { color: 'FFFFFF', bold: true, name: 'Calibri', size: 11 },
  accentFill: 'YOUR_ACCENT_HEX',
  bodyFont: { name: 'Calibri', size: 10 },
  currencyFormat: '$#,##0.00',
  percentFormat: '0.00%',
  logoCell: 'A1',
  columnWidths: { default: 15, label: 30, currency: 18 }
};
```

Use `openpyxl` (Python) or the `xlsx` npm package depending on what's already in the project stack.

---

## ReportActionBar Component

```jsx
// Appears when selectedRecords.length > 0
// Props: selectedRecords, activeModule

const reportsByModule = {
  properties: [
    { label: 'Fact Sheet', icon: FileText, min: 1, max: 1, type: 'propertyFactSheet' },
    { label: 'Comp Sheet', icon: LayoutGrid, min: 2, max: 6, type: 'compSheet' },
    { label: 'BOV', icon: TrendingUp, min: 1, max: 1, type: 'bov' },
  ],
  contacts: [
    { label: 'Call List', icon: Phone, min: 1, max: null, type: 'callList' },
  ],
  deals: [
    { label: 'Deal Summary', icon: FileText, min: 1, max: 1, type: 'dealSummary' },
    { label: 'Lease vs. Buy', icon: BarChart2, min: 1, max: 1, type: 'leaseVsBuy' },
  ],
  // ...
};
```

---

## Build Order

Build in this sequence so each step teaches you the pattern for the next:

1. **Shared shell + styles** — logo, header, footer, brand CSS. Build a demo HTML to approve visuals before any real report.
2. **PDF generator utility** — Puppeteer wrapper, test with a simple HTML page
3. **Property Fact Sheet** — first real report, single record, validates the full pipeline
4. **Comp Sheet** — introduces multi-record pattern
5. **Contact Call List** — simpler, very useful for prospecting
6. **Lease vs. Buy Excel Proforma** — separate Excel pipeline
7. **AI narrative layer** — add Claude API narrative generation to Fact Sheet and BOV
8. **Remaining report types** — clone and customize from established patterns

---

## First Claude Code Session Prompt (suggested)

> "I want to build the report generation system for my IE CRM. Start by creating the shared report shell. Build a `/reports/shared/` folder with: `reportShell.html` (master wrapper with header and footer placeholders), `reportStyles.css` (brand design system with variables for colors and fonts), and `helpers.js` (formatting functions for currency, square footage, phone numbers, and dates). Then generate a `reportDemo.html` preview file that shows all the shared UI elements — header with logo placeholder, a sample data table, a section header, and the footer — so I can review and approve the visual design before building any actual report types."

---

## Notes

- Father's tech comfort is a key constraint — the UI trigger (action bar) must be obvious and require zero configuration
- All reports should include a "Download" and optionally "Print" button
- Report previews in-app before download are nice-to-have, not required for v1
- Keep all report templates in `/reports/types/` so new report types can be added without touching shared infrastructure
