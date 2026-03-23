// Row Parsers — source-specific normalization for the lease comp engine.
// Each parser converts raw input (Excel, agent JSON, etc.) into a canonical row shape.

const SKIP_BROKER = new Set(['no broker involved', 'n/a', 'none', '']);

const DESIGNATIONS = /,?\s*\b(SIOR|CCIM|CPA|Esq|Jr|Sr|III|II|MBA|PhD|PE|AIA|LEED\s*AP)\b\.?/gi;

/**
 * Parse a CoStar Excel row into normalized shape.
 * Handles all 3 sheet variants (main, expiring, matched).
 */
function parseCoStarExcelRow(raw, sheetName) {
  const address = cleanStr(raw['Building Address']);
  const city = cleanStr(raw['City']);
  const state = cleanStr(raw['State']) || 'CA';
  const propertyName = cleanStr(raw['Property Name']);
  const propertyType = cleanStr(raw['Property Type      (office, industrial or retail)']
    || raw['Property Type ']
    || raw['Property Type']);
  const rba = cleanNum(raw['RBA']);
  const lastSaleDate = cleanDate(raw['Last Sale Date']);
  const spaceUse = cleanStr(raw['Space Use']);
  const spaceType = cleanStr(raw['Space Type \n(New, Relet, Sublet)']
    || raw['Space Type \r\n(New, Relet, Sublet)']);
  const sf = cleanNum(raw['Square Footage Leased']);
  const floorSuite = cleanStr(raw['Floor/ Suite #']);
  const signDate = cleanDate(raw['Sign Date']);
  const commencementDate = cleanDate(raw['Commencement Date']);
  const moveInDate = cleanDate(raw['Move-In Date']);
  const expirationDate = cleanDate(raw['Expiration Date']);
  const leaseType = cleanStr(raw['New/ Renewal/ Sublease']);
  const concessions = cleanStr(raw['Concessions (Free rent, TI, moving allowance, etc.)']);
  const termRaw = raw['Lease\nTerm'] || raw['Lease\r\nTerm'] || '';
  const termMonths = parseTermMonths(termRaw);
  const rate = cleanNum(raw['Contract Rent']);
  const escalations = cleanStr(raw['Escalations']);
  const rentType = cleanStr(raw['Rent Type (Full Service/ Modified Gross/ NNN)*']
    || raw['Rent Type ']
    || raw['Rent Type']);
  const tenantName = cleanStr(raw['Tenant Name']);
  const tenantRepCompanies = splitAndCleanBrokers(raw['Tenant Rep Company']);
  const landlordRepCompanies = splitAndCleanBrokers(raw['Landlord Rep Company']);
  const tenantRepAgents = splitAndCleanAgents(raw['Tenant Rep Agents']);
  const landlordRepAgents = splitAndCleanAgents(raw['Landlord Rep Agents']);

  return {
    address, city, state, propertyName, propertyType, rba, lastSaleDate,
    spaceUse, spaceType, sf, floorSuite, signDate, commencementDate,
    moveInDate, expirationDate, termMonths, rate, escalations, rentType,
    leaseType, concessions, tenantName,
    tenantRepCompanies, landlordRepCompanies,
    tenantRepAgents, landlordRepAgents,
    source: 'CoStar',
    sheetName,
  };
}

function cleanStr(val) {
  if (val === null || val === undefined || val === '') return null;
  const s = String(val).trim();
  return s === '' || s.toLowerCase() === 'nan' ? null : s;
}

function cleanNum(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isNaN(val) ? null : val;
  const s = String(val).replace(/[$,]/g, '').trim();
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function cleanDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val.toISOString().split('T')[0];
  // Excel serial date: number of days since 1899-12-30
  if (typeof val === 'number' && val > 25000 && val < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + val * 86400000);
    return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function parseTermMonths(raw) {
  if (!raw) return null;
  const s = String(raw).toLowerCase().trim();
  const match = s.match(/^(\d+)\s*months?$/);
  if (match) return parseInt(match[1], 10);
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

function splitAndCleanBrokers(raw) {
  if (!raw) return [];
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const unique = parts.filter(p => {
    const key = p.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.filter(name => !SKIP_BROKER.has(name.toLowerCase().trim()));
}

function splitAndCleanAgents(raw) {
  if (!raw) return [];
  const parts = String(raw).split(',').map(s => s.trim()).filter(Boolean);
  const seen = new Set();
  const result = [];
  for (const original of parts) {
    const cleaned = original
      .replace(DESIGNATIONS, '')
      .replace(/[.,]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned && !seen.has(cleaned.toLowerCase()) && !SKIP_BROKER.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      result.push({ original, cleaned });
    }
  }
  return result;
}

module.exports = {
  parseCoStarExcelRow,
  splitAndCleanBrokers,
  splitAndCleanAgents,
  cleanStr,
  cleanNum,
  cleanDate,
  parseTermMonths,
  SKIP_BROKER,
};
