// Minimal required fields for Quick Add modals per entity type.
// Each field: { key, label, type, required?, placeholder?, options? }

export const QUICK_ADD_FIELDS = {
  property: [
    { key: 'property_address', label: 'Address', type: 'text', required: true, placeholder: '123 Main St' },
    { key: 'city', label: 'City', type: 'text', placeholder: 'Dallas' },
    { key: 'property_type', label: 'Type', type: 'select', options: ['Office', 'Retail', 'Industrial', 'Multifamily', 'Land', 'Mixed-Use', 'Special Purpose'] },
    { key: 'rba', label: 'Building SF', type: 'number', placeholder: '50000' },
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
    { key: 'deal_type', label: 'Type', type: 'select', options: ['Lease', 'Sale', 'Buy', 'Sublease', 'Renewal', 'Investment', 'Other'] },
    { key: 'status', label: 'Status', type: 'select', options: ['Prospecting', 'Active', 'Lead', 'Long Leads', 'Under Contract', 'Closed', 'Deal fell through', 'Dead', 'Dead Lead'] },
    { key: 'repping', label: 'Repping', type: 'select', isArray: true, options: ['Landlord', 'Tenant', 'Buyer', 'Seller', 'Dual'] },
    { key: 'run_by', label: 'Run By', type: 'select', isArray: true, options: ['Dave Mudge', 'David Mudge Jr', 'Missy'] },
    { key: 'deal_source', label: 'Source', type: 'select', isArray: true, options: ['Sarah', 'Mat/Ryan', 'Dave', 'Doorknock', 'Relationship', 'Referral', 'Loopnet', 'Email Campaign', 'Cold Email', 'Cold Call', 'Outside Broker', 'Creativity', 'Snailmail', 'Existing Tenant', 'Previous Deal', 'Sign Call', 'Sent Purchase Offer', 'Walk In', 'Reid', 'Listing', 'BOV', 'Lease vs Buy Analysis'] },
    { key: 'sf', label: 'Square Feet', type: 'number', placeholder: '5000' },
    { key: 'rate', label: 'Rate', type: 'number', placeholder: '1.25' },
    { key: 'term', label: 'Term (months)', type: 'number', placeholder: '60' },
    { key: 'price', label: 'Price', type: 'number', placeholder: '500000' },
    { key: 'close_date', label: 'Close Date', type: 'date' },
    { key: 'deadline', label: 'Deadline', type: 'date' },
    { key: 'other_broker', label: 'Other Broker', type: 'text', placeholder: 'Broker name' },
    { key: 'industry', label: 'Industry', type: 'text', placeholder: 'Manufacturing' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Deal details...' },
  ],

  interaction: [
    { key: 'type', label: 'Type', type: 'select', required: true, options: ['Phone Call', 'Cold Call', 'Voicemail', 'Outbound Email', 'Inbound Email', 'Cold Email', 'Check in Email', 'Email Campaign', 'Text', 'Meeting', 'Tour', 'Door Knock', 'Drive By', 'Snail Mail', 'Offer Sent', 'Survey Sent', 'BOV Sent'] },
    { key: 'subject', label: 'Subject', type: 'text', required: true, placeholder: 'Follow-up call' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Details...' },
  ],

  action_item: [
    { key: 'name', label: 'Task Name', type: 'text', required: true, placeholder: 'Follow up with owner' },
    { key: 'due_date', label: 'Due Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'select', options: ['Todo', 'Reminders', 'In progress', 'Done', 'Dead', 'Email', 'Needs and Wants'] },
    { key: 'high_priority', label: 'High Priority', type: 'checkbox' },
  ],

  lease_comp: [
    { key: 'tenant_name', label: 'Tenant Name', type: 'text', required: true, placeholder: 'Acme Corp' },
    { key: 'property_type', label: 'Property Type', type: 'select', options: ['Industrial', 'Office', 'Retail', 'Multifamily', 'Land', 'Mixed-Use'] },
    { key: 'sf', label: 'Square Feet', type: 'number', placeholder: '50000' },
    { key: 'rate', label: 'Rate ($/SF/mo)', type: 'number', placeholder: '1.25' },
    { key: 'term_months', label: 'Term (months)', type: 'number', placeholder: '60' },
    { key: 'commencement_date', label: 'Commencement Date', type: 'date' },
    { key: 'expiration_date', label: 'Expiration Date', type: 'date' },
  ],

  sale_comp: [
    { key: 'sale_date', label: 'Sale Date', type: 'date' },
    { key: 'property_type', label: 'Property Type', type: 'select', options: ['Industrial', 'Office', 'Retail', 'Multifamily', 'Land', 'Mixed-Use'] },
    { key: 'sale_price', label: 'Sale Price', type: 'number', placeholder: '5000000' },
    { key: 'sf', label: 'Square Feet', type: 'number', placeholder: '100000' },
    { key: 'buyer_name', label: 'Buyer', type: 'text', placeholder: 'ABC Investments' },
    { key: 'seller_name', label: 'Seller', type: 'text', placeholder: 'XYZ Properties' },
  ],

  campaign: [
    { key: 'name', label: 'Campaign Name', type: 'text', required: true, placeholder: 'Q1 Outreach' },
    { key: 'type', label: 'Type', type: 'select', options: ['Email', 'Direct Mail', 'Cold Call', 'Door Knock', 'SMS', 'Social Media', 'Event'] },
    { key: 'status', label: 'Status', type: 'select', options: ['Draft', 'Scheduled', 'Active', 'Sent', 'Completed', 'Paused'] },
    { key: 'sent_date', label: 'Send Date', type: 'date' },
    { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Campaign details...' },
  ],
};
