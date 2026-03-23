// Entity type registry + junction table mappings
// Used by LinkedRecord, SlideOver, QuickAdd, and search pickers

const ENTITY_TYPES = {
  property: {
    label: 'Property',
    labelPlural: 'Properties',
    table: 'properties',
    idCol: 'property_id',
    displayCol: 'property_address',
    secondaryCol: 'city',
    chipColor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    route: '/properties',
  },
  contact: {
    label: 'Contact',
    labelPlural: 'Contacts',
    table: 'contacts',
    idCol: 'contact_id',
    displayCol: 'full_name',
    secondaryCol: 'email',
    chipColor: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    route: '/contacts',
  },
  company: {
    label: 'Company',
    labelPlural: 'Companies',
    table: 'companies',
    idCol: 'company_id',
    displayCol: 'company_name',
    secondaryCol: 'city',
    chipColor: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    route: '/companies',
  },
  deal: {
    label: 'Deal',
    labelPlural: 'Deals',
    table: 'deals',
    idCol: 'deal_id',
    displayCol: 'deal_name',
    secondaryCol: 'status',
    chipColor: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    route: '/deals',
  },
  interaction: {
    label: 'Interaction',
    labelPlural: 'Interactions',
    table: 'interactions',
    idCol: 'interaction_id',
    displayCol: 'type',
    secondaryCol: 'date',
    chipColor: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    route: '/interactions',
  },
  campaign: {
    label: 'Campaign',
    labelPlural: 'Campaigns',
    table: 'campaigns',
    idCol: 'campaign_id',
    displayCol: 'name',
    secondaryCol: 'type',
    chipColor: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    route: '/campaigns',
  },
  action_item: {
    label: 'Action Item',
    labelPlural: 'Action Items',
    table: 'action_items',
    idCol: 'action_item_id',
    displayCol: 'name',
    secondaryCol: 'status',
    chipColor: 'bg-red-500/15 text-red-400 border-red-500/30',
    route: '/action-items',
  },
  lease_comp: {
    label: 'Lease Comp',
    labelPlural: 'Lease Comps',
    table: 'lease_comps',
    idCol: 'id',
    displayCol: 'tenant_name',
    secondaryCol: 'property_type',
    chipColor: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    route: '/comps',
  },
  sale_comp: {
    label: 'Sale Comp',
    labelPlural: 'Sale Comps',
    table: 'sale_comps',
    idCol: 'id',
    displayCol: 'buyer_name',
    secondaryCol: 'sale_date',
    chipColor: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    route: '/comps',
  },
};

// Junction table definitions: maps "entityA-entityB" to junction config
export const JUNCTIONS = {
  'property-contact': { table: 'property_contacts', col1: 'property_id', col2: 'contact_id' },
  'property-company': { table: 'property_companies', col1: 'property_id', col2: 'company_id' },
  'contact-company': { table: 'contact_companies', col1: 'contact_id', col2: 'company_id' },
  'deal-property': { table: 'deal_properties', col1: 'deal_id', col2: 'property_id' },
  'deal-contact': { table: 'deal_contacts', col1: 'deal_id', col2: 'contact_id' },
  'deal-company': { table: 'deal_companies', col1: 'deal_id', col2: 'company_id' },
  'interaction-contact': { table: 'interaction_contacts', col1: 'interaction_id', col2: 'contact_id' },
  'interaction-property': { table: 'interaction_properties', col1: 'interaction_id', col2: 'property_id' },
  'interaction-deal': { table: 'interaction_deals', col1: 'interaction_id', col2: 'deal_id' },
  'interaction-company': { table: 'interaction_companies', col1: 'interaction_id', col2: 'company_id' },
  'campaign-contact': { table: 'campaign_contacts', col1: 'campaign_id', col2: 'contact_id' },
  'action_item-contact': { table: 'action_item_contacts', col1: 'action_item_id', col2: 'contact_id' },
  'action_item-property': { table: 'action_item_properties', col1: 'action_item_id', col2: 'property_id' },
  'action_item-deal': { table: 'action_item_deals', col1: 'action_item_id', col2: 'deal_id' },
  'action_item-company': { table: 'action_item_companies', col1: 'action_item_id', col2: 'company_id' },
};

// Helper: get junction config for two entity types (order-independent)
export function getJunction(typeA, typeB) {
  return JUNCTIONS[`${typeA}-${typeB}`] || JUNCTIONS[`${typeB}-${typeA}`] || null;
}

export default ENTITY_TYPES;
