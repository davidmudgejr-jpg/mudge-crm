// Airtable Properties CSV row parser — converts raw CSV row to canonical shape.
// Reuses cleanStr/cleanNum/cleanDate from rowParsers.js.

const { cleanStr, cleanNum, cleanDate } = require('./rowParsers');

/**
 * Parse a raw Airtable properties CSV row into canonical shape.
 * @param {Object} raw — key/value from xlsx sheet_to_json
 * @returns {Object} canonical row
 */
function parseAirtableRow(raw) {
  // --- Properties fields ---
  const address = cleanStr(raw['Property Address']);
  const city = cleanStr(raw['City']);
  const state = cleanStr(raw['State']) || 'CA';
  const zip = cleanStr(raw['Zip']);
  const propertyType = cleanStr(raw['PropertyType']);
  const propertyName = cleanStr(raw['Property Name']);
  const buildingStatus = cleanStr(raw['Building Status']);
  const buildingClass = cleanStr(raw['Building Class']);
  const yearBuilt = cleanNum(raw['Year Built']);
  const yearRenovated = cleanNum(raw['Year Renovated']);
  const rba = cleanNum(raw['RBA']);
  const stories = cleanNum(raw['Number Of Stories']);
  const landAreaAc = cleanNum(raw['Land Area (AC)']);
  const landSf = cleanNum(raw['Land SF']);
  const far = cleanNum(raw['FAR']);
  const zoning = cleanStr(raw['Zoning']);
  const power = cleanStr(raw['Power']);
  const ceilingHt = cleanNum(raw['Ceiling Ht']);
  const clearHt = cleanNum(raw['Clear Ht']);
  const loadingDocks = cleanNum(raw['Number Of Loading Docks']);
  const driveIns = cleanNum(raw['Drive Ins']);
  const columnSpacing = cleanStr(raw['Column Spacing']);
  const sprinklers = cleanStr(raw['Sprinklers']);
  const cranes = cleanNum(raw['Number Of Cranes']);
  const constructionMaterial = cleanStr(raw['Construction Material']);
  const railLines = cleanStr(raw['Rail Lines']);
  const parkingSpaces = cleanNum(raw['Number Of Parking Spaces']);
  const parkingRatio = cleanNum(raw['Parking Ratio']);
  const features = cleanStr(raw['Features']);
  const lastSaleDate = cleanDate(raw['Last Sale Date']);
  const lastSalePrice = cleanNum(raw['Last Sale Price']);
  const pricePsf = cleanNum(raw['Price PSF']);
  const rentPsfMo = cleanNum(raw['Rent/SF/Mo']);
  const debtDate = cleanDate(raw['Debt Date']);
  const loanAmount = cleanNum(raw['Loan Amount']);
  const buildingPark = cleanStr(raw['Building Park']);
  const county = cleanStr(raw['County']);
  const ownerType = cleanStr(raw['Owner Type']);
  const costarUrl = cleanStr(raw['Costar']);
  const landvisionUrl = cleanStr(raw['Landvision']);
  const heating = cleanStr(raw['Heating']);
  const sewer = cleanStr(raw['Sewer']);
  const water = cleanStr(raw['Water']);
  const gas = cleanStr(raw['Gas']);

  // Contacted? — comma-separated multi-select → array
  const contactedRaw = cleanStr(raw['Contacted?']);
  const contacted = contactedRaw
    ? contactedRaw.split(',').map(s => s.trim()).filter(Boolean)
    : null;

  // Overflow JSONB fields (no dedicated column)
  const overflow = {};
  const rateType = cleanStr(raw['Rate Type']);
  if (rateType) overflow.rate_type = rateType;
  const maxContiguous = cleanNum(raw['Max Building Contiguous Space']);
  if (maxContiguous) overflow.max_contiguous_sf = maxContiguous;

  // --- Contacts ---
  const ownerContact = cleanStr(raw['Owner Contact']);
  const brokerContact = cleanStr(raw['Broker Contact']);

  // --- Companies ---
  const companyOwner = cleanStr(raw['(Company) Owner']);

  // (Company) Tenants — may be comma-separated
  const tenantsRaw = cleanStr(raw['(Company) Tenants']);
  const companyTenants = tenantsRaw
    ? tenantsRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const industryType = cleanStr(raw['Industry Type (from (Company) Tenants) 2']);

  // --- Notes ---
  const notes = cleanStr(raw['Notes']);

  // --- Reference (logged but not auto-linked) ---
  const jrDealsCopy = cleanStr(raw['Jr Deals copy']);

  return {
    // Properties
    address, city, state, zip, propertyType, propertyName,
    buildingStatus, buildingClass, yearBuilt, yearRenovated,
    rba, stories, landAreaAc, landSf, far, zoning, power,
    ceilingHt, clearHt, loadingDocks, driveIns, columnSpacing,
    sprinklers, cranes, constructionMaterial, railLines,
    parkingSpaces, parkingRatio, features,
    lastSaleDate, lastSalePrice, pricePsf, rentPsfMo,
    debtDate, loanAmount, buildingPark, county, ownerType,
    costarUrl, landvisionUrl, heating, sewer, water, gas,
    contacted, overflow,
    // Contacts
    ownerContact, brokerContact,
    // Companies
    companyOwner, companyTenants, industryType,
    // Notes
    notes,
    // Reference
    jrDealsCopy,
    // Source
    source: 'Airtable',
  };
}

/**
 * Parse free-text notes into individual interaction entries.
 * Splits on newlines/semicolons and extracts embedded dates.
 * @param {string} rawNotes
 * @returns {Array<{date: string|null, text: string}>}
 */
function parseNotes(rawNotes) {
  if (!rawNotes || typeof rawNotes !== 'string') return [];

  const DATE_RE = /(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{1,2},?\s*\d{2,4})/gi;

  // Split on newlines and semicolons
  const segments = rawNotes
    .split(/[\n;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (segments.length === 0) return [];

  return segments.map(segment => {
    const dateMatch = segment.match(DATE_RE);
    let date = null;

    if (dateMatch) {
      date = parseFreeTextDate(dateMatch[0]);
      // Remove the date from the text
      const text = segment.replace(dateMatch[0], '').replace(/^\s*[-–—:]\s*/, '').trim();
      return { date, text: text || segment };
    }

    return { date: null, text: segment };
  });
}

/**
 * Parse a date string from free text, handling 2-digit years.
 * @param {string} raw
 * @returns {string|null} ISO date string (YYYY-MM-DD)
 */
function parseFreeTextDate(raw) {
  if (!raw) return null;

  // Handle M/D/YY or MM/DD/YYYY
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    let [, month, day, year] = slashMatch;
    year = parseInt(year, 10);
    // 2-digit year expansion
    if (year < 100) {
      year = year >= 50 ? 1900 + year : 2000 + year;
    }
    const d = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }

  // Fallback to Date constructor
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

module.exports = {
  parseAirtableRow,
  parseNotes,
  parseFreeTextDate,
};
