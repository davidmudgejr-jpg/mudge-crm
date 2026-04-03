/**
 * Curated field definitions for dedupe merge workspace.
 * Controls which fields appear by default vs expanded, grouping, and display formatting.
 */

// Fields to always hide in merge UI (system columns)
const SYSTEM_FIELDS = new Set([
  'property_id', 'contact_id', 'company_id',
  'airtable_id', 'created_at', 'updated_at', 'modified', 'last_modified',
  'normalized_address', 'overflow',
]);

// --- Property fields ---
const PROPERTY_CURATED = [
  { key: 'property_address', label: 'Address', group: 'Identity' },
  { key: 'property_name', label: 'Name', group: 'Identity' },
  { key: 'city', label: 'City', group: 'Location' },
  { key: 'state', label: 'State', group: 'Location' },
  { key: 'zip', label: 'Zip', group: 'Location' },
  { key: 'property_type', label: 'Type', group: 'Classification' },
  { key: 'building_class', label: 'Class', group: 'Classification' },
  { key: 'rba', label: 'RBA (SF)', group: 'Physical', format: 'sf' },
  { key: 'owner_name', label: 'Owner', group: 'Ownership' },
  { key: 'owner_phone', label: 'Owner Phone', group: 'Ownership' },
  { key: 'price_psf', label: 'Price/SF', group: 'Financial', format: 'currency' },
  { key: 'rent_psf_mo', label: 'Rent/SF/Mo', group: 'Financial', format: 'currency' },
  { key: 'cap_rate', label: 'Cap Rate', group: 'Financial', format: 'percent' },
  { key: 'vacancy_pct', label: 'Vacancy', group: 'Financial', format: 'percent' },
  { key: 'year_built', label: 'Year Built', group: 'Physical' },
  { key: 'notes', label: 'Notes', group: 'Other' },
];

// --- Contact fields ---
const CONTACT_CURATED = [
  { key: 'full_name', label: 'Full Name', group: 'Identity' },
  { key: 'first_name', label: 'First Name', group: 'Identity' },
  { key: 'title', label: 'Title', group: 'Identity' },
  { key: 'email', label: 'Email', group: 'Contact Info' },
  { key: 'email_2', label: 'Email 2', group: 'Contact Info' },
  { key: 'email_3', label: 'Email 3', group: 'Contact Info' },
  { key: 'phone_1', label: 'Phone', group: 'Contact Info' },
  { key: 'phone_2', label: 'Phone 2', group: 'Contact Info' },
  { key: 'phone_3', label: 'Phone 3', group: 'Contact Info' },
  { key: 'work_address', label: 'Work Address', group: 'Location' },
  { key: 'work_city', label: 'City', group: 'Location' },
  { key: 'client_level', label: 'Client Level', group: 'Classification' },
  { key: 'linkedin', label: 'LinkedIn', group: 'Contact Info' },
  { key: 'notes', label: 'Notes', group: 'Other' },
];

// --- Company fields ---
const COMPANY_CURATED = [
  { key: 'company_name', label: 'Company Name', group: 'Identity' },
  { key: 'company_type', label: 'Type', group: 'Classification' },
  { key: 'industry_type', label: 'Industry', group: 'Classification' },
  { key: 'city', label: 'City', group: 'Location' },
  { key: 'website', label: 'Website', group: 'Contact Info' },
  { key: 'employees', label: 'Employees', group: 'Details', format: 'number' },
  { key: 'revenue', label: 'Revenue', group: 'Details', format: 'currency' },
  { key: 'sf', label: 'SF', group: 'Details', format: 'sf' },
  { key: 'lease_exp', label: 'Lease Exp', group: 'Details', format: 'date' },
  { key: 'notes', label: 'Notes', group: 'Other' },
];

const CURATED_FIELDS = {
  property: PROPERTY_CURATED,
  contact: CONTACT_CURATED,
  company: COMPANY_CURATED,
};

/**
 * Format a value for display in the merge grid.
 */
function formatFieldValue(value, format) {
  if (value == null || value === '') return null;
  switch (format) {
    case 'currency':
      return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'sf':
      return `${Number(value).toLocaleString()} SF`;
    case 'percent':
      return `${Number(value).toFixed(1)}%`;
    case 'number':
      return Number(value).toLocaleString();
    case 'date': {
      const d = new Date(value);
      return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
    }
    default:
      return String(value);
  }
}

/**
 * Get all displayable fields for an entity type from a sample record.
 * Returns curated fields first, then remaining non-system fields.
 */
function getAllMergeFields(entityType, sampleRecord) {
  const curated = CURATED_FIELDS[entityType] || [];
  const curatedKeys = new Set(curated.map(f => f.key));

  const extraFields = [];
  if (sampleRecord) {
    for (const key of Object.keys(sampleRecord)) {
      if (SYSTEM_FIELDS.has(key)) continue;
      if (curatedKeys.has(key)) continue;
      if (key === 'tags') continue; // tags handled separately
      extraFields.push({ key, label: key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), group: 'Additional' });
    }
  }

  return { curated, extra: extraFields };
}

export { CURATED_FIELDS, SYSTEM_FIELDS, formatFieldValue, getAllMergeFields };
