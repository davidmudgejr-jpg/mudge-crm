// TPE Parser — parse all 4 sheets from TPE Master List Excel into canonical rows.
// Each sheet has a different header row index and column mapping.
// Used by: tpeImportEngine.js

const XLSX = require('xlsx');

// ============================================================
// EXCEL DATE HELPER
// Excel stores dates as serial numbers (days since 1899-12-30).
// XLSX.SSF.parse_date_code can handle this, but we use a simpler approach.
// ============================================================

function excelDateToJS(serial) {
  if (serial == null || serial === '' || typeof serial === 'string') {
    // Try parsing as a date string
    if (typeof serial === 'string') {
      const d = new Date(serial);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    return null;
  }
  if (typeof serial === 'number') {
    // Excel serial date: days since 1899-12-30 (with the Lotus 1-2-3 leap year bug)
    const epoch = new Date(1899, 11, 30); // Dec 30, 1899
    const ms = epoch.getTime() + serial * 86400000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }
  return null;
}

function parseNumber(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[$,%\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}

function parseInteger(val) {
  const num = parseNumber(val);
  return num != null ? Math.round(num) : null;
}

function parsePercent(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number') {
    // If value is already a decimal like 0.25, convert to 25
    return val < 1 && val > -1 ? Math.round(val * 10000) / 100 : val;
  }
  if (typeof val === 'string') {
    const cleaned = val.replace(/[%\s]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) return null;
    return num;
  }
  return null;
}

function trimStr(val) {
  if (val == null) return null;
  const s = String(val).trim();
  return s === '' || s === '-' || s === 'N/A' || s === 'n/a' ? null : s;
}

// ============================================================
// SHEET 1: Distressed — Title Rep (header row 3)
// ============================================================

function parseDistressRow(raw) {
  return {
    distressType: trimStr(raw['Distress Type']),
    address: trimStr(raw['Address']),
    city: trimStr(raw['City']),
    apn: trimStr(raw['APN']),
    owner: trimStr(raw['Owner']),
    ownerType: trimStr(raw['Owner Type']),
    salePrice: parseNumber(raw['Sale Price']),
    amount: parseNumber(raw['Mortgage Amount']),
    auctionDate: excelDateToJS(raw['Auction Date']),
    openingBid: parseNumber(raw['Opening Bid']),
    defaultAmount: parseNumber(raw['Default Amount']),
    delinquentTaxYear: parseInteger(raw['Delinquent Tax Yr']),
    delinquentTaxAmount: parseNumber(raw['Delinquent Tax $']),
    notes: trimStr(raw['Notes']),
    source: 'title_rep_distress',
  };
}

// ============================================================
// SHEET 2: Loan Maturity — Title Rep (header row 2)
// ============================================================

function parseLoanMaturityRow(raw) {
  return {
    address: trimStr(raw['Address']),
    city: trimStr(raw['City']),
    propertyName: trimStr(raw['Property Name']),
    sf: parseNumber(raw['SF']),
    yearBuilt: parseInteger(raw['Year Built']),
    ownerBorrower: trimStr(raw['Owner / Borrower']),
    loanAmount: parseNumber(raw['Loan Amount']),
    loanType: trimStr(raw['Loan Type']),
    interestRate: parsePercent(raw['Rate']),
    rateType: trimStr(raw['Rate Type']),
    lender: trimStr(raw['Lender']),
    originationDate: excelDateToJS(raw['Origination Date']),
    maturityDate: excelDateToJS(raw['Maturity Date']),
    monthsPastDue: parseNumber(raw['Months Past Due']),
    ltv: parsePercent(raw['LTV %']),
    loanDurationYears: parseNumber(raw['Loan Dur (Yr)']),
    loanPurpose: trimStr(raw['Loan Purpose']),
    estValue: parseNumber(raw['Est. Price/Value']),
    portfolio: trimStr(raw['Portfolio']),
    source: 'title_rep_rca',
  };
}

// ============================================================
// SHEET 3: Tenant Growth — CoStar (header row 2)
// ============================================================

function parseTenantGrowthRow(raw) {
  return {
    companyName: trimStr(raw['Company Name']),
    address: trimStr(raw['Building Address']),
    city: trimStr(raw['City']),
    headcountCurrent: parseInteger(raw['Current Headcount']),
    headcountPrevious: parseInteger(raw['Headcount 24 Months Ago']),
    growthRate: parsePercent(raw['Headcount Growth %']),
    sfOccupied: parseInteger(raw['SF Occupied']),
    sfPerEmployee: parseNumber(raw['SF / Employee']),
    occupancyType: trimStr(raw['Occupancy Type']),
    timeInBuilding: trimStr(raw['Time in Building']),
    growthScore: parseInteger(raw['Growth Prospect Score (1-10)']),
    source: 'costar_tenant_growth',
  };
}

// ============================================================
// SHEET 4: Debt & Stress — Title Rep (header row 2)
// ============================================================

function parseDebtStressRow(raw) {
  return {
    address: trimStr(raw['Building Address']),
    city: trimStr(raw['City']),
    ownerName: trimStr(raw['Owner Name']),
    ownerUserOrInvestor: trimStr(raw['Owner-User/Investor']),
    lender: trimStr(raw['Lender (Originator)']),
    loanType: trimStr(raw['Loan Type']),
    interestRate: parsePercent(raw['Interest Rate']),
    rateType: trimStr(raw['Rate Type']),
    originationDate: excelDateToJS(raw['Origination Date']),
    originationAmount: parseNumber(raw['Origination Amount']),
    balloon5yr: excelDateToJS(raw['Balloon (5yr)']),
    balloon7yr: excelDateToJS(raw['Balloon (7yr)']),
    balloon10yr: excelDateToJS(raw['Balloon (10yr)']),
    balloonConfidence: trimStr(raw['Balloon Confidence']),
    buildingSf: parseNumber(raw['Building SF (RBA)']),
    source: 'title_rep_debt',
  };
}

// ============================================================
// SHEET LOADING — read workbook, find correct sheets, parse rows
// ============================================================

// Sheet name patterns to find by emoji prefix or partial match
const SHEET_PATTERNS = {
  distress: /distress|🚨/i,
  loans: /loan\s*matur|🏦/i,
  growth: /tenant\s*growth|📈/i,
  debt: /debt.*stress|💰/i,
};

function loadTPESheets(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;

  console.log(`[tpe-parser] Found ${sheetNames.length} sheets: ${sheetNames.join(', ')}`);

  const result = {};

  // Match each sheet pattern to an actual sheet name
  for (const [key, pattern] of Object.entries(SHEET_PATTERNS)) {
    const match = sheetNames.find(name => pattern.test(name));
    if (match) {
      result[key] = match;
    } else {
      console.warn(`[tpe-parser] WARNING: Could not find sheet matching "${key}" pattern`);
    }
  }

  return { workbook, sheetMap: result };
}

function parseSheet(workbook, sheetName, headerRowIndex, parserFn) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];

  // sheet_to_json with header option uses the specified row as headers
  // headerRowIndex is 0-based for the XLSX library's "range" option
  const rawRows = XLSX.utils.sheet_to_json(ws, { range: headerRowIndex });

  const parsed = [];
  for (const raw of rawRows) {
    const row = parserFn(raw);
    // Skip completely empty rows
    if (row.address || row.companyName) {
      parsed.push(row);
    }
  }
  return parsed;
}

function parseAllSheets(filePath) {
  const { workbook, sheetMap } = loadTPESheets(filePath);
  const sheets = {};

  if (sheetMap.distress) {
    sheets.distress = parseSheet(workbook, sheetMap.distress, 3, parseDistressRow);
    console.log(`[tpe-parser] Distress: ${sheets.distress.length} rows`);
  }
  if (sheetMap.loans) {
    sheets.loans = parseSheet(workbook, sheetMap.loans, 2, parseLoanMaturityRow);
    console.log(`[tpe-parser] Loan Maturity: ${sheets.loans.length} rows`);
  }
  if (sheetMap.growth) {
    sheets.growth = parseSheet(workbook, sheetMap.growth, 2, parseTenantGrowthRow);
    console.log(`[tpe-parser] Tenant Growth: ${sheets.growth.length} rows`);
  }
  if (sheetMap.debt) {
    sheets.debt = parseSheet(workbook, sheetMap.debt, 2, parseDebtStressRow);
    console.log(`[tpe-parser] Debt & Stress: ${sheets.debt.length} rows`);
  }

  return sheets;
}

module.exports = {
  parseAllSheets,
  parseDistressRow,
  parseLoanMaturityRow,
  parseTenantGrowthRow,
  parseDebtStressRow,
  loadTPESheets,
  parseSheet,
  excelDateToJS,
  parseNumber,
  parseInteger,
  parsePercent,
  trimStr,
};
