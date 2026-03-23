// Airtable Companies CSV row parser — converts raw CSV row to canonical shape.
// Reuses cleanStr/cleanNum/cleanDate from rowParsers.js.

const { cleanStr, cleanNum, cleanDate } = require('./rowParsers');

/**
 * Split a comma-separated multi-value field into trimmed, non-empty array.
 */
function splitMulti(val) {
  const s = cleanStr(val);
  if (!s) return [];
  return s.split(',').map(v => v.trim()).filter(Boolean);
}

/**
 * Parse a raw Airtable companies CSV row into canonical shape.
 * @param {Object} raw — key/value from xlsx sheet_to_json
 * @returns {Object} canonical row
 */
function parseAirtableCompanyRow(raw) {
  // --- Core company fields ---
  const companyName = cleanStr(raw['Company Name']);
  const contacts = splitMulti(raw['Contacts']);
  const website = cleanStr(raw['Website']);
  const companyType = cleanStr(raw['Company Type']);
  const industryType = cleanStr(raw['Industry Type']);
  const sf = cleanNum(raw['SF']);
  const tenantProperties = splitMulti(raw['Property (TENANT)']);
  const ownerProperties = splitMulti(raw['Property (OWNER)']);
  const notes = cleanStr(raw['Notes']);
  const sicCode = cleanStr(raw['Tenant SIC']);
  const employees = cleanNum(raw['Employees']);
  const suite = cleanStr(raw['Suite']);
  const leaseExp = cleanDate(raw['Lease exp']);
  const leaseMonthsLeft = cleanNum(raw['Lease Months Left']);
  const city = cleanStr(raw['City']);
  const moveInDate = cleanDate(raw['Move In Date']);
  const deals = splitMulti(raw['Jr Deals']);
  const interactions = cleanStr(raw['Interactions']);
  const propertyTypeInterest = cleanStr(raw['Office/Ind (from Contacts)']);

  // --- Overflow: sparse columns ---
  const overflow = {};
  const companyHq = cleanStr(raw['Company HQ']);
  if (companyHq) overflow.company_hq = companyHq;
  const assignee = cleanStr(raw['Assignee']);
  if (assignee) overflow.assignee = assignee;
  const leaseComp = cleanStr(raw['Lease Comp']);
  if (leaseComp) overflow.lease_comp = leaseComp;
  const type = cleanStr(raw['Type']);
  if (type) overflow.type = type;

  return {
    companyName,
    contacts,
    website,
    companyType,
    industryType,
    sf,
    tenantProperties,
    ownerProperties,
    notes,
    sicCode,
    employees,
    suite,
    leaseExp,
    leaseMonthsLeft,
    city,
    moveInDate,
    deals,
    interactions,
    propertyTypeInterest,
    overflow: Object.keys(overflow).length > 0 ? overflow : null,
  };
}

module.exports = {
  parseAirtableCompanyRow,
  splitMulti,
};
