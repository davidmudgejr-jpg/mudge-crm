// Canonical field definitions for PDF export — linked entity types.
// Primary entity fields come from each page's ALL_COLUMNS prop.
// These define what linked-record fields are available in the export modal.

export const LINKED_EXPORT_FIELDS = {
  contacts: {
    idField: 'contact_id',
    label: 'Contacts',
    labelKey: 'full_name',
    fields: [
      { key: 'full_name', label: 'Name' },
      { key: 'type', label: 'Type' },
      { key: 'title', label: 'Title' },
      { key: 'email_1', label: 'Email', format: 'email' },
      { key: 'phone_1', label: 'Phone', format: 'phone' },
      { key: 'client_level', label: 'Level' },
      { key: 'last_contacted', label: 'Last Contact', format: 'date' },
      { key: 'active_need', label: 'Active Need' },
      { key: 'tags', label: 'Tags' },
    ],
  },
  companies: {
    idField: 'company_id',
    label: 'Companies',
    labelKey: 'company_name',
    fields: [
      { key: 'company_name', label: 'Company' },
      { key: 'company_type', label: 'Type' },
      { key: 'industry_type', label: 'Industry' },
      { key: 'city', label: 'City' },
      { key: 'sf', label: 'SF', format: 'number' },
      { key: 'employees', label: 'Employees', format: 'number' },
      { key: 'revenue', label: 'Revenue', format: 'currency' },
      { key: 'lease_exp', label: 'Lease Exp', format: 'date' },
      { key: 'website', label: 'Website' },
    ],
  },
  properties: {
    idField: 'property_id',
    label: 'Properties',
    labelKey: 'property_address',
    fields: [
      { key: 'property_address', label: 'Address' },
      { key: 'city', label: 'City' },
      { key: 'property_type', label: 'Type' },
      { key: 'rba', label: 'Bldg SF', format: 'number' },
      { key: 'land_sf', label: 'Lot SF', format: 'number' },
      { key: 'year_built', label: 'Year Built' },
      { key: 'owner_name', label: 'Entity Name' },
      { key: 'last_sale_price', label: 'Last Sale Price', format: 'currency' },
      { key: 'last_sale_date', label: 'Last Sale Date', format: 'date' },
      { key: 'listing_status', label: 'Listing Status' },
    ],
  },
  deals: {
    idField: 'deal_id',
    label: 'Deals',
    labelKey: 'deal_name',
    fields: [
      { key: 'deal_name', label: 'Deal' },
      { key: 'deal_type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'sf', label: 'SF', format: 'number' },
      { key: 'rate', label: 'Rate', format: 'currency' },
      { key: 'close_date', label: 'Close Date', format: 'date' },
      { key: 'team_gross_computed', label: 'Team Gross', format: 'currency' },
      { key: 'jr_gross_computed', label: 'Jr Gross', format: 'currency' },
    ],
  },
  campaigns: {
    idField: 'campaign_id',
    label: 'Campaigns',
    labelKey: 'campaign_name',
    fields: [
      { key: 'campaign_name', label: 'Campaign' },
      { key: 'status', label: 'Status' },
    ],
  },
};

// Which linked types are available per primary entity
export const ENTITY_LINKED_TYPES = {
  properties: ['contacts', 'companies', 'deals'],
  contacts:   ['properties', 'companies', 'deals', 'campaigns'],
  companies:  ['contacts', 'properties', 'deals'],
  deals:      ['properties', 'contacts', 'companies', 'campaigns'],
  campaigns:  [],        // no linked record export for campaigns
  lease_comps: [],       // comps don't have linked records
  sale_comps:  [],
  tpe:         [],       // TPE is property-based but no linked record hook
};
