// Minimal required fields for Quick Add modals per entity type.
// Each field: { key, label, type, required?, placeholder?, options? }

export const QUICK_ADD_FIELDS = {
  property: [
    { key: 'property_address', label: 'Address', type: 'text', required: true, placeholder: '123 Main St' },
    { key: 'city', label: 'City', type: 'text', placeholder: 'Dallas' },
    { key: 'property_type', label: 'Type', type: 'select', options: ['Office', 'Retail', 'Industrial', 'Multifamily', 'Land', 'Mixed-Use', 'Special Purpose'] },
    { key: 'building_sqft', label: 'Building SF', type: 'number', placeholder: '50000' },
  ],

  contact: [
    { key: 'full_name', label: 'Name', type: 'text', required: true, placeholder: 'John Smith' },
    { key: 'type', label: 'Type', type: 'select', options: ['Owner', 'Broker', 'Tenant', 'Investor', 'Vendor', 'Attorney', 'Lender', 'Other'] },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'john@example.com' },
    { key: 'phone_1', label: 'Phone', type: 'text', placeholder: '(555) 123-4567' },
  ],

  company: [
    { key: 'company_name', label: 'Company', type: 'text', required: true, placeholder: 'Acme Corp' },
    { key: 'company_type', label: 'Type', type: 'select', options: ['Owner/Operator', 'Tenant', 'Brokerage', 'Developer', 'Investor', 'Lender', 'Vendor', 'Other'] },
    { key: 'industry_type', label: 'Industry', type: 'text', placeholder: 'Technology' },
    { key: 'city', label: 'City', type: 'text', placeholder: 'Dallas' },
  ],

  deal: [
    { key: 'deal_name', label: 'Deal Name', type: 'text', required: true, placeholder: '123 Main St - Lease' },
    { key: 'deal_type', label: 'Type', type: 'select', options: ['Lease', 'Sale', 'Sublease', 'Renewal', 'Expansion', 'Other'] },
    { key: 'status', label: 'Status', type: 'select', options: ['Prospecting', 'Active', 'Under Contract', 'Closed', 'Dead'] },
    { key: 'repping', label: 'Repping', type: 'select', options: ['Landlord', 'Tenant', 'Buyer', 'Seller'] },
  ],

  interaction: [
    { key: 'type', label: 'Type', type: 'select', required: true, options: ['Call', 'Email', 'Meeting', 'Tour', 'Note', 'Text', 'Other'] },
    { key: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'Follow-up call' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Details...' },
  ],

  campaign: [
    { key: 'name', label: 'Campaign Name', type: 'text', required: true, placeholder: 'Q1 Outreach' },
    { key: 'type', label: 'Type', type: 'select', options: ['Email', 'Direct Mail', 'Cold Call', 'Door Knock', 'SMS', 'Social Media', 'Event'] },
    { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Scheduled', 'Active', 'Sent', 'Completed', 'Paused'] },
    { key: 'sent_date', label: 'Send Date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Campaign details...' },
  ],
};
