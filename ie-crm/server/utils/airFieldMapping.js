/**
 * airFieldMapping.js
 *
 * Maps AIR CRE FieldTypeIDs to CRM data paths for auto-populating
 * contract fields from deal/contact/property records.
 *
 * FieldTypeIDs are semantic identifiers assigned by AIR CRE to common
 * field types across all their forms. For example, FieldTypeID 100
 * always means "Property Address" regardless of which form it appears in.
 *
 * When a user creates a contract linked to a deal, we load the deal's
 * linked contacts (with roles) and properties, then populate matching
 * fields automatically.
 */

// Maps FieldTypeID → { source, field }
// source: 'deal', 'property', 'buyer_contact', 'seller_contact', 'static'
const FIELD_TYPE_MAP = {
  // ── Property fields ──
  100:  { source: 'property', field: 'property_address' },
  101:  { source: 'property', field: 'county' },
  109:  { source: 'property', field: 'legal_description' },
  111:  { source: 'property', field: 'property_type' },
  115:  { source: 'property', field: 'apn' },

  // ── Buyer / Lessee fields ──
  1200: { source: 'buyer_contact', field: 'full_name' },
  1201: { source: 'buyer_contact', field: 'full_name' },  // Name Printed - Signer 1
  1202: { source: 'buyer_contact', field: 'title' },       // Title - Signer 1
  1203: { source: 'buyer_contact', field: 'phone' },       // Phone - Signer 1
  1204: { source: 'buyer_contact', field: 'fax' },         // Fax - Signer 1
  1205: { source: 'buyer_contact', field: 'email' },       // Email - Signer 1
  1211: { source: 'buyer_contact', field: 'mailing_address' }, // Buyer Address

  // ── Seller / Lessor fields ──
  1300: { source: 'seller_contact', field: 'full_name' },
  1301: { source: 'seller_contact', field: 'full_name' },  // Name Printed - Signer 1
  1302: { source: 'seller_contact', field: 'title' },       // Title - Signer 1
  1303: { source: 'seller_contact', field: 'phone' },       // Phone - Signer 1
  1304: { source: 'seller_contact', field: 'fax' },         // Fax - Signer 1
  1305: { source: 'seller_contact', field: 'email' },       // Email - Signer 1
  1311: { source: 'seller_contact', field: 'mailing_address' }, // Seller Address

  // ── Deal / Financial fields ──
  20014: { source: 'deal', field: 'price' },                // Purchase Price
  20023: { source: 'deal', field: 'cash_down' },            // Cash Down Payment
  20034: { source: 'deal', field: 'price' },                // Total Purchase Price

  // ── Date fields ──
  20201: { source: 'static', field: 'today' },              // Agreement Date
  20202: { source: 'static', field: 'today' },              // Buyer Signing Date
  20203: { source: 'static', field: 'today' },              // Seller Signing Date
};

// Fallback: match by field Name when FieldTypeID is 0 or unrecognized
// These are case-insensitive partial matches
const FIELD_NAME_MAP = {
  'property address':   { source: 'property', field: 'property_address' },
  'property county':    { source: 'property', field: 'county' },
  'property apn':       { source: 'property', field: 'apn' },
  'purchase price':     { source: 'deal', field: 'price' },
  'buyer':              { source: 'buyer_contact', field: 'full_name' },
  'seller':             { source: 'seller_contact', field: 'full_name' },
  'lessee':             { source: 'buyer_contact', field: 'full_name' },
  'lessor':             { source: 'seller_contact', field: 'full_name' },
  'agreement date':     { source: 'static', field: 'today' },
};

/**
 * Auto-populate field values from CRM data.
 *
 * @param {Array} fieldDefs - Field definitions from the parsed template
 * @param {Object} crmData - { deal, property, buyerContact, sellerContact }
 * @returns {Object} fieldValues keyed by AnnotationID string
 */
function autoFillFields(fieldDefs, crmData) {
  const { deal, property, buyerContact, sellerContact } = crmData;
  const values = {};

  const sourceMap = {
    deal: deal || {},
    property: property || {},
    buyer_contact: buyerContact || {},
    seller_contact: sellerContact || {},
  };

  for (const field of fieldDefs) {
    // Skip signature/initial fields
    if (field.dataType === 98 || field.dataType === 99) continue;

    let mapping = null;

    // Try FieldTypeID first
    if (field.fieldTypeId && FIELD_TYPE_MAP[field.fieldTypeId]) {
      mapping = FIELD_TYPE_MAP[field.fieldTypeId];
    }

    // Fallback to name matching
    if (!mapping && field.name) {
      const nameLower = field.name.toLowerCase().trim();
      for (const [pattern, map] of Object.entries(FIELD_NAME_MAP)) {
        if (nameLower === pattern || nameLower.includes(pattern)) {
          mapping = map;
          break;
        }
      }
    }

    if (!mapping) continue;

    let value = null;
    if (mapping.source === 'static') {
      if (mapping.field === 'today') {
        value = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
    } else {
      const source = sourceMap[mapping.source];
      if (source && source[mapping.field]) {
        value = String(source[mapping.field]);
      }
    }

    if (value) {
      values[String(field.annotationId)] = value;
    }
  }

  return values;
}

module.exports = { autoFillFields, FIELD_TYPE_MAP, FIELD_NAME_MAP };
