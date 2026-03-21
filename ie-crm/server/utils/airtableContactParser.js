// Airtable Contacts CSV row parser — converts raw CSV row to canonical shape.
// Reuses cleanStr/cleanDate from rowParsers.js.

const { cleanStr, cleanDate } = require('./rowParsers');

/**
 * Convert any truthy CSV value to JS boolean.
 * Airtable exports checkboxes as "checked", emoji, "true", "1", etc.
 * Any non-empty, non-null value = true.
 */
function cleanBool(val) {
  if (val === null || val === undefined || val === '') return false;
  const s = String(val).trim().toLowerCase();
  if (s === '' || s === '0' || s === 'false' || s === 'no' || s === 'nan') return false;
  return true;
}

/**
 * Clean and normalize a phone number string.
 * Strips non-digit chars except leading +, collapses whitespace.
 */
function cleanPhone(val) {
  const s = cleanStr(val);
  if (!s) return null;
  // Keep digits, parens, hyphens, dots, spaces, plus for international
  const cleaned = s.replace(/[^\d+() .-]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

/**
 * Clean and lowercase an email address.
 */
function cleanEmail(val) {
  const s = cleanStr(val);
  if (!s) return null;
  return s.toLowerCase().trim() || null;
}

/**
 * Split a comma-separated multi-value field into trimmed, non-empty array.
 */
function splitMulti(val) {
  const s = cleanStr(val);
  if (!s) return [];
  return s.split(',').map(v => v.trim()).filter(Boolean);
}

/**
 * Parse a raw Airtable contacts CSV row into canonical shape.
 * @param {Object} raw — key/value from xlsx sheet_to_json
 * @returns {Object} canonical row
 */
function parseAirtableContactRow(raw) {
  // --- Core contact fields ---
  const fullName = cleanStr(raw['Full Name']);
  const firstName = cleanStr(raw['First Name']);
  const type = cleanStr(raw['Type']);
  const title = cleanStr(raw['Title']);
  const born = cleanDate(raw['Born']);
  const workAddress = cleanStr(raw['Work Address']);
  const homeAddress = cleanStr(raw['Home Address']);

  // --- Email fields ---
  const email = cleanEmail(raw['Email']);
  const email2 = cleanEmail(raw['2nd Email']);
  const email3 = cleanEmail(raw['3rd Email']);
  const emailHot = cleanBool(raw['Email HOT']);
  const emailKickback = cleanBool(raw['Email Kickback?']);

  // --- Phone fields ---
  const phone1 = cleanPhone(raw['Phone 1']);
  const phone2 = cleanPhone(raw['Phone 2']);
  const phone3 = cleanPhone(raw['Phone 3']);
  const phoneHot = cleanBool(raw['Phone HOT']);

  // --- URLs & links ---
  const linkedin = cleanStr(raw['LinkedIn']);
  const whitePagesUrl = cleanStr(raw['White Pages Link']);
  const beenVerifiedUrl = cleanStr(raw['Been Verified Link']);
  const zoomInfoUrl = cleanStr(raw['Zoom Info Link']);

  // --- Classification ---
  const propertyTypeInterest = cleanStr(raw['Office/Ind']);
  const clientLevel = cleanStr(raw['Client Level']);
  const dataSource = cleanStr(raw['Data Source']);

  // --- Dates ---
  const lastContacted = cleanDate(raw['Last contacted']);
  const followUp = cleanDate(raw['Follow up']);

  // --- Contact Verified → overflow JSONB (column was dropped in migration 001) ---
  const contactVerified = cleanBool(raw['Contact Verified']);

  // --- Multi-value relationship fields ---
  const companies = splitMulti(raw['Companies']);
  const ownerProperties = splitMulti(raw['Owner Properties']);
  const campaigns = splitMulti(raw['Campaigns']);

  // --- Text fields for interactions/action items ---
  const notes = cleanStr(raw['Notes']);
  const interactions = cleanStr(raw['Interactions']);
  const actionItems = cleanStr(raw['Action Items']);

  return {
    // Core contact
    fullName,
    firstName,
    type,
    title,
    born,
    workAddress,
    homeAddress,

    // Email
    email,
    email2,
    email3,
    emailHot,
    emailKickback,

    // Phone
    phone1,
    phone2,
    phone3,
    phoneHot,

    // URLs
    linkedin,
    whitePagesUrl,
    beenVerifiedUrl,
    zoomInfoUrl,

    // Classification
    propertyTypeInterest,
    clientLevel,
    dataSource,

    // Dates
    lastContacted,
    followUp,

    // Overflow
    contactVerified,

    // Relationships (multi-value)
    companies,
    ownerProperties,
    campaigns,

    // Text blobs → interactions / action_items tables
    notes,
    interactions,
    actionItems,

    // Source tag
    source: 'Airtable',
  };
}

module.exports = {
  parseAirtableContactRow,
  cleanBool,
  cleanPhone,
  cleanEmail,
  splitMulti,
};
