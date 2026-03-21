// Airtable Campaigns CSV row parser — converts raw CSV row to canonical shape.
// Reuses cleanStr/cleanDate from rowParsers.js.

const { cleanStr, cleanDate } = require('./rowParsers');

/**
 * Split a comma-separated multi-value field into trimmed, non-empty array.
 */
function splitMulti(val) {
  const s = cleanStr(val);
  if (!s) return [];
  return s.split(',').map(v => v.trim()).filter(Boolean);
}

/**
 * Parse a raw Airtable campaigns CSV row into canonical shape.
 * @param {Object} raw — key/value from xlsx sheet_to_json
 * @returns {Object} canonical row
 */
function parseAirtableCampaignRow(raw) {
  const name = cleanStr(raw['Name']);
  const contacts = splitMulti(raw['Contacts']);
  const campaignType = cleanStr(raw['Type']);
  const status = cleanStr(raw['Status']);
  const assignee = cleanStr(raw['Assignee']);
  const sentDate = cleanDate(raw['Sent Date']);
  const notes = cleanStr(raw['Notes']);

  // Overflow: tracking data + file reference
  const overflow = {};
  const day = cleanStr(raw['Day']);
  if (day) overflow.day = day;
  const time = cleanStr(raw['Time']);
  if (time) overflow.time = time;
  const hits = cleanStr(raw['Hits']);
  if (hits) overflow.hits = hits;
  const file = cleanStr(raw['File']);
  if (file) overflow.file = file;

  return {
    name,
    contacts,
    campaignType,
    status,
    assignee,
    sentDate,
    notes,
    overflow: Object.keys(overflow).length > 0 ? overflow : null,
  };
}

module.exports = {
  parseAirtableCampaignRow,
  splitMulti,
};
