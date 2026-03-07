import React, { useState, useRef, useCallback } from 'react';
import { importApi } from '../api/bridge';
import { useToast } from '../components/shared/Toast';

// ============================================================
// CSV PARSER (same as Comps.jsx but extracted)
// ============================================================
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let insideQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (insideQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else insideQuotes = !insideQuotes;
    } else if (ch === ',' && !insideQuotes) {
      row.push(field.trim());
      field = '';
    } else if ((ch === '\n' || ch === '\r') && !insideQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((f) => f)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field.trim());
    if (row.some((f) => f)) rows.push(row);
  }
  return rows;
}

// ============================================================
// COLUMN MAPS — fuzzy header → DB field name per table
// ============================================================
const COLUMN_MAPS = {
  lease_comps: {
    tenant: 'tenant_name', 'tenant name': 'tenant_name', tenant_name: 'tenant_name',
    'property type': 'property_type', property_type: 'property_type', type: 'property_type',
    'space use': 'space_use', space_use: 'space_use',
    'space type': 'space_type', space_type: 'space_type',
    sf: 'sf', 'square feet': 'sf', 'square footage': 'sf', 'sq ft': 'sf', 'square footage leased': 'sf',
    rba: 'building_rba', 'building rba': 'building_rba', 'lease rba': 'building_rba',
    'floor/suite': 'floor_suite', floor_suite: 'floor_suite', suite: 'floor_suite', 'floor suite': 'floor_suite',
    'sign date': 'sign_date', sign_date: 'sign_date', signed: 'sign_date',
    'commencement date': 'commencement_date', commencement: 'commencement_date', commenced: 'commencement_date',
    'move in date': 'move_in_date', 'move in': 'move_in_date',
    'expiration date': 'expiration_date', expiration: 'expiration_date', expires: 'expiration_date',
    'lease term': 'term_months', term: 'term_months', 'term (months)': 'term_months', term_months: 'term_months',
    'contract rent': 'rate', rate: 'rate', rent: 'rate', 'asking rent': 'rate',
    escalations: 'escalations', escalation: 'escalations',
    'rent type': 'rent_type', rent_type: 'rent_type',
    'lease type': 'lease_type', lease_type: 'lease_type',
    concessions: 'concessions',
    'tenant rep company': 'tenant_rep_company', 'tenant rep': 'tenant_rep_company',
    'tenant rep agents': 'tenant_rep_agents', 'tenant agents': 'tenant_rep_agents',
    'landlord rep company': 'landlord_rep_company', 'landlord rep': 'landlord_rep_company',
    'landlord rep agents': 'landlord_rep_agents', 'landlord agents': 'landlord_rep_agents',
    notes: 'notes', source: 'source',
    // Address fields for matching (not stored in lease_comps but used for property linking)
    address: '_address', 'property address': '_address', 'building address': '_address', 'street address': '_address',
    city: '_city', state: '_state', zip: '_zip', 'zip code': '_zip',
  },
  sale_comps: {
    'sale date': 'sale_date', sale_date: 'sale_date', date: 'sale_date',
    'sale price': 'sale_price', sale_price: 'sale_price', price: 'sale_price',
    'price psf': 'price_psf', price_psf: 'price_psf', 'price/sf': 'price_psf', '$/sf': 'price_psf',
    'price plsf': 'price_plsf', price_plsf: 'price_plsf', 'price/land sf': 'price_plsf',
    'cap rate': 'cap_rate', cap_rate: 'cap_rate', cap: 'cap_rate',
    sf: 'sf', 'square feet': 'sf', 'building sf': 'sf',
    'land sf': 'land_sf', land_sf: 'land_sf', 'land area': 'land_sf',
    buyer: 'buyer_name', buyer_name: 'buyer_name', 'buyer name': 'buyer_name',
    seller: 'seller_name', seller_name: 'seller_name', 'seller name': 'seller_name',
    'property type': 'property_type', property_type: 'property_type', type: 'property_type',
    notes: 'notes', source: 'source',
    address: '_address', 'property address': '_address', 'building address': '_address',
    city: '_city', state: '_state', zip: '_zip', 'zip code': '_zip',
  },
  contacts: {
    'full name': 'full_name', full_name: 'full_name', name: 'full_name',
    'first name': 'first_name', first_name: 'first_name',
    type: 'type', 'contact type': 'type',
    title: 'title', 'job title': 'title',
    email: 'email', 'email address': 'email', 'primary email': 'email',
    'email 2': 'email_2', 'secondary email': 'email_2', email_2: 'email_2',
    'email 3': 'email_3', email_3: 'email_3',
    'phone 1': 'phone_1', phone: 'phone_1', 'phone number': 'phone_1', phone_1: 'phone_1',
    'phone 2': 'phone_2', phone_2: 'phone_2',
    'phone 3': 'phone_3', phone_3: 'phone_3',
    'home address': 'home_address', home_address: 'home_address',
    'work address': 'work_address', work_address: 'work_address',
    born: 'born', birthday: 'born', 'date of birth': 'born',
    age: 'age',
    notes: 'notes', linkedin: 'linkedin',
    'follow up': 'follow_up', follow_up: 'follow_up',
    'last contacted': 'last_contacted', last_contacted: 'last_contacted',
    tags: 'tags', 'data source': 'data_source', data_source: 'data_source',
    'client level': 'client_level', client_level: 'client_level',
    'active need': 'active_need', active_need: 'active_need',
  },
  properties: {
    address: 'property_address', 'property address': 'property_address', property_address: 'property_address', 'street address': 'property_address',
    'property name': 'property_name', property_name: 'property_name', 'building name': 'property_name',
    city: 'city', state: 'state', zip: 'zip', 'zip code': 'zip', county: 'county',
    rba: 'rba', 'building sf': 'rba', 'building sqft': 'rba', 'rentable building area': 'rba',
    'land sf': 'land_sf', land_sf: 'land_sf', 'land area sf': 'land_sf',
    'land area ac': 'land_area_ac', land_area_ac: 'land_area_ac', 'land acres': 'land_area_ac',
    'property type': 'property_type', property_type: 'property_type', type: 'property_type',
    'building class': 'building_class', building_class: 'building_class', class: 'building_class',
    'year built': 'year_built', year_built: 'year_built',
    'ceiling height': 'ceiling_ht', ceiling_ht: 'ceiling_ht', 'clear height': 'clear_ht',
    'loading docks': 'number_of_loading_docks', number_of_loading_docks: 'number_of_loading_docks',
    zoning: 'zoning', features: 'features',
    'last sale date': 'last_sale_date', last_sale_date: 'last_sale_date',
    'last sale price': 'last_sale_price', last_sale_price: 'last_sale_price',
    'owner name': 'owner_name', owner_name: 'owner_name', owner: 'owner_name',
    'percent leased': 'percent_leased', percent_leased: 'percent_leased', '% leased': 'percent_leased',
    notes: 'notes', 'costar url': 'costar_url', costar_url: 'costar_url',
    'market name': 'market_name', market_name: 'market_name', market: 'market_name',
    'submarket name': 'submarket_name', submarket_name: 'submarket_name', submarket: 'submarket_name',
    'parcel number': 'parcel_number', parcel_number: 'parcel_number', apn: 'parcel_number',
    latitude: 'latitude', lat: 'latitude',
    longitude: 'longitude', lng: 'longitude', lon: 'longitude',
  },
  companies: {
    'company name': 'company_name', company_name: 'company_name', company: 'company_name', name: 'company_name',
    'company type': 'company_type', company_type: 'company_type', type: 'company_type',
    'industry type': 'industry_type', industry_type: 'industry_type', industry: 'industry_type',
    website: 'website', url: 'website',
    sf: 'sf', 'square feet': 'sf',
    employees: 'employees', 'employee count': 'employees',
    revenue: 'revenue',
    'company growth': 'company_growth', company_growth: 'company_growth', growth: 'company_growth',
    'company hq': 'company_hq', company_hq: 'company_hq', hq: 'company_hq', headquarters: 'company_hq',
    'lease exp': 'lease_exp', lease_exp: 'lease_exp', 'lease expiration': 'lease_exp',
    'move in date': 'move_in_date', move_in_date: 'move_in_date',
    city: 'city', notes: 'notes',
    'tenant sic': 'tenant_sic', tenant_sic: 'tenant_sic', sic: 'tenant_sic',
    'tenant naics': 'tenant_naics', tenant_naics: 'tenant_naics', naics: 'tenant_naics',
    suite: 'suite',
  },
  deals: {
    'deal name': 'deal_name', deal_name: 'deal_name', name: 'deal_name', deal: 'deal_name',
    'deal type': 'deal_type', deal_type: 'deal_type', type: 'deal_type',
    'deal source': 'deal_source', deal_source: 'deal_source',
    status: 'status', repping: 'repping',
    term: 'term', rate: 'rate', sf: 'sf',
    price: 'price', 'commission rate': 'commission_rate', commission_rate: 'commission_rate',
    'close date': 'close_date', close_date: 'close_date',
    notes: 'notes', 'priority deal': 'priority_deal', priority_deal: 'priority_deal',
    'run by': 'run_by', run_by: 'run_by',
    'other broker': 'other_broker', other_broker: 'other_broker',
    industry: 'industry', deadline: 'deadline',
  },
  loan_maturities: {
    lender: 'lender', 'loan amount': 'loan_amount', loan_amount: 'loan_amount',
    'maturity date': 'maturity_date', maturity_date: 'maturity_date', maturity: 'maturity_date',
    ltv: 'ltv', 'loan to value': 'ltv',
    'loan purpose': 'loan_purpose', loan_purpose: 'loan_purpose', purpose: 'loan_purpose',
    'loan duration': 'loan_duration_years', loan_duration_years: 'loan_duration_years',
    'interest rate': 'interest_rate', interest_rate: 'interest_rate',
    notes: 'notes', source: 'source',
    address: '_address', 'property address': '_address',
    city: '_city', state: '_state', zip: '_zip',
  },
  property_distress: {
    'distress type': 'distress_type', distress_type: 'distress_type',
    'filing date': 'filing_date', filing_date: 'filing_date',
    amount: 'amount', trustee: 'trustee',
    notes: 'notes', source: 'source',
    address: '_address', 'property address': '_address',
    city: '_city', state: '_state', zip: '_zip',
  },
  tenant_growth: {
    'headcount current': 'headcount_current', headcount_current: 'headcount_current',
    'headcount previous': 'headcount_previous', headcount_previous: 'headcount_previous',
    'growth rate': 'growth_rate', growth_rate: 'growth_rate',
    'revenue current': 'revenue_current', revenue_current: 'revenue_current',
    'revenue previous': 'revenue_previous', revenue_previous: 'revenue_previous',
    'data date': 'data_date', data_date: 'data_date',
    source: 'source', notes: 'notes',
    company: '_company_name', 'company name': '_company_name',
    city: '_city',
  },
  action_items: {
    name: 'name', task: 'name', description: 'name',
    notes: 'notes', 'notes on date': 'notes_on_date', notes_on_date: 'notes_on_date',
    responsibility: 'responsibility', assignee: 'responsibility', 'assigned to': 'responsibility',
    'high priority': 'high_priority', high_priority: 'high_priority', priority: 'high_priority',
    status: 'status', 'due date': 'due_date', due_date: 'due_date',
    'date completed': 'date_completed', date_completed: 'date_completed',
    source: 'source',
  },
  campaigns: {
    name: 'name', 'campaign name': 'name',
    type: 'type', status: 'status', notes: 'notes',
    'sent date': 'sent_date', sent_date: 'sent_date',
    assignee: 'assignee', 'day time hits': 'day_time_hits', day_time_hits: 'day_time_hits',
  },
  interactions: {
    type: 'type', subject: 'subject', date: 'date',
    notes: 'notes', 'email heading': 'email_heading', email_heading: 'email_heading',
    'email body': 'email_body', email_body: 'email_body',
    'follow up': 'follow_up', follow_up: 'follow_up',
    'follow up notes': 'follow_up_notes', follow_up_notes: 'follow_up_notes',
    'lead source': 'lead_source', lead_source: 'lead_source',
    'team member': 'team_member', team_member: 'team_member',
    'email url': 'email_url', email_url: 'email_url',
    'email id': 'email_id', email_id: 'email_id',
  },
};

const TABLE_LABELS = {
  lease_comps: 'Lease Comps',
  sale_comps: 'Sale Comps',
  contacts: 'Contacts',
  properties: 'Properties',
  companies: 'Companies',
  deals: 'Deals',
  loan_maturities: 'Loan Maturities',
  property_distress: 'Property Distress',
  tenant_growth: 'Tenant Growth',
  action_items: 'Action Items',
  campaigns: 'Campaigns',
  interactions: 'Interactions',
};

// Tables that need property matching
const NEEDS_PROPERTY_MATCH = new Set(['lease_comps', 'sale_comps', 'loan_maturities', 'property_distress']);
const NEEDS_COMPANY_MATCH = new Set(['lease_comps', 'tenant_growth']);

const NUMERIC_FIELDS = new Set([
  'sf', 'building_rba', 'rate', 'escalations', 'free_rent_months', 'ti_psf', 'term_months',
  'sale_price', 'price_psf', 'price_plsf', 'cap_rate', 'land_sf', 'rba', 'land_area_ac',
  'far', 'last_sale_price', 'plsf', 'loan_amount', 'vacancy_pct', 'percent_leased',
  'parking_ratio', 'for_sale_price', 'ops_expense_psf', 'total_available_sf',
  'direct_available_sf', 'direct_vacant_space', 'avg_weighted_rent', 'latitude', 'longitude',
  'ltv', 'interest_rate', 'headcount_current', 'headcount_previous', 'growth_rate',
  'revenue_current', 'revenue_previous', 'amount', 'employees', 'revenue',
  'increases', 'commission_rate', 'gross_fee_potential', 'net_potential', 'price',
  'number_of_loading_docks', 'drive_ins', 'number_of_cranes', 'age', 'lease_months_left',
]);

const DATE_FIELDS = new Set([
  'sign_date', 'commencement_date', 'move_in_date', 'expiration_date', 'sale_date',
  'last_sale_date', 'debt_date', 'maturity_date', 'filing_date', 'data_date',
  'born', 'follow_up', 'last_contacted', 'lease_exp', 'due_date', 'date_completed',
  'close_date', 'important_date', 'deadline', 'sent_date',
]);

function parseNumeric(val) {
  if (!val) return null;
  const cleaned = String(val).replace(/[$,%\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

function parseConcessions(text) {
  const result = {};
  if (!text) return result;
  const freeRentMatch = text.match(/([\d.]+)\s*months?\s*free/i);
  if (freeRentMatch) result.free_rent_months = parseFloat(freeRentMatch[1]);
  const tiMatch = text.match(/\$?([\d.]+)\s*TI/i) || text.match(/TI.*?\$?([\d.]+)/i);
  if (tiMatch) result.ti_psf = parseFloat(tiMatch[1]);
  return result;
}

function mapHeaders(headers, csvMap) {
  return headers.map((h) => {
    const normalized = h.toLowerCase().replace(/[_\-#]/g, ' ').trim();
    return csvMap[normalized] || null;
  });
}

// ============================================================
// IMPORT PAGE COMPONENT
// ============================================================
export default function Import() {
  const { addToast } = useToast();
  const fileInputRef = useRef(null);

  // Wizard state
  const [step, setStep] = useState(1); // 1=upload, 2=detect, 3=mapping, 4=preview, 5=flagged, 6=results
  const [fileName, setFileName] = useState('');
  const [rawHeaders, setRawHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [detections, setDetections] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('');
  const [columnMapping, setColumnMapping] = useState([]); // array of DB field names (or null) per header
  const [processedRows, setProcessedRows] = useState([]);
  const [previewData, setPreviewData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [source, setSource] = useState('');

  // Step 1: Upload CSV
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target.result;
        const parsed = parseCSV(text);
        if (parsed.length < 2) {
          addToast('CSV must have a header row and at least one data row', 'error');
          return;
        }
        setFileName(file.name);
        setRawHeaders(parsed[0]);
        setRawRows(parsed.slice(1));
        runDetection(parsed[0]);
      } catch (err) {
        console.error('CSV parse error:', err);
        addToast('Failed to parse CSV file', 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Step 2: Auto-detection
  const runDetection = async (headers) => {
    try {
      const res = await importApi.detect(headers);
      setDetections(res.detections || []);
      if (res.detections?.length > 0) {
        const best = res.detections[0];
        setSelectedTarget(best.table);
        // Auto-map columns using the best match
        const csvMap = COLUMN_MAPS[best.table] || {};
        setColumnMapping(mapHeaders(headers, csvMap));
      }
      setStep(2);
    } catch (err) {
      console.error('Detection error:', err);
      addToast('Detection failed — select table manually', 'error');
      setStep(2);
    }
  };

  // Step 2 → 3: Confirm target and proceed to mapping
  const confirmTarget = (table) => {
    setSelectedTarget(table);
    const csvMap = COLUMN_MAPS[table] || {};
    setColumnMapping(mapHeaders(rawHeaders, csvMap));
    setStep(3);
  };

  // Step 3: Update a single column mapping
  const updateMapping = (headerIdx, dbField) => {
    setColumnMapping(prev => {
      const next = [...prev];
      next[headerIdx] = dbField || null;
      return next;
    });
  };

  // Step 3 → 4: Process rows and show preview
  const processAndPreview = async () => {
    const csvMap = COLUMN_MAPS[selectedTarget] || {};
    const needsPropertyMatch = NEEDS_PROPERTY_MATCH.has(selectedTarget);
    const needsCompanyMatch = NEEDS_COMPANY_MATCH.has(selectedTarget);

    // Convert raw rows to objects using column mapping
    const processed = rawRows.map(row => {
      const obj = {};
      columnMapping.forEach((field, idx) => {
        if (!field) return;
        let val = row[idx] || '';
        if (!val) return;

        // Handle matching-only fields (prefixed with _)
        if (field.startsWith('_')) {
          obj[field] = val.trim();
          return;
        }

        if (NUMERIC_FIELDS.has(field)) val = parseNumeric(val);
        else if (DATE_FIELDS.has(field)) val = parseDate(val);
        else val = val.trim() || null;

        if (val != null) obj[field] = val;
      });

      // Parse concessions for lease comps
      if (obj.concessions && selectedTarget === 'lease_comps') {
        const parsed = parseConcessions(obj.concessions);
        if (parsed.free_rent_months && !obj.free_rent_months) obj.free_rent_months = parsed.free_rent_months;
        if (parsed.ti_psf && !obj.ti_psf) obj.ti_psf = parsed.ti_psf;
      }

      // Copy address matching fields into expected keys for the matcher
      if (obj._address) { obj.property_address = obj._address; delete obj._address; }
      if (obj._city) { obj.city = obj._city; delete obj._city; }
      if (obj._state) { obj.state = obj._state; delete obj._state; }
      if (obj._zip) { obj.zip = obj._zip; delete obj._zip; }
      if (obj._company_name) { obj.company_name = obj._company_name; delete obj._company_name; }

      return obj;
    }).filter(obj => Object.keys(obj).filter(k => !k.startsWith('_')).length > 0);

    setProcessedRows(processed);

    // Run server-side preview for matching
    try {
      const res = await importApi.preview(selectedTarget, processed.slice(0, 50), {
        matchProperties: needsPropertyMatch,
        matchCompanies: needsCompanyMatch,
      });
      setPreviewData(res);
    } catch (err) {
      console.error('Preview error:', err);
      // Still show preview without matching
      setPreviewData({
        preview: processed.slice(0, 50).map((row, i) => ({ index: i, row, matches: {} })),
        stats: { total: processed.length, previewed: Math.min(50, processed.length), autoLinked: 0, flagged: 0, newRecords: 0 },
      });
    }

    setStep(4);
  };

  // Step 4/5 → 6: Execute import
  const executeImport = async () => {
    setImporting(true);
    try {
      const needsPropertyMatch = NEEDS_PROPERTY_MATCH.has(selectedTarget);
      const needsCompanyMatch = NEEDS_COMPANY_MATCH.has(selectedTarget);

      // Remove matching-only fields before sending to batch endpoint
      const cleanRows = processedRows.map(row => {
        const clean = { ...row };
        // Keep property_address/city/zip for matching but they'll be stripped server-side
        return clean;
      });

      const result = await importApi.batch(selectedTarget, cleanRows, {
        source: source || undefined,
        matchProperties: needsPropertyMatch,
        matchCompanies: needsCompanyMatch,
        onDuplicate: 'skip',
      });

      setImportResult(result);
      setStep(6);
      addToast(`Imported ${result.inserted} records into ${TABLE_LABELS[selectedTarget]}`);
    } catch (err) {
      console.error('Import error:', err);
      addToast(`Import failed: ${err.message}`, 'error');
    } finally {
      setImporting(false);
    }
  };

  // Reset everything for a new import
  const resetImport = () => {
    setStep(1);
    setFileName('');
    setRawHeaders([]);
    setRawRows([]);
    setDetections([]);
    setSelectedTarget('');
    setColumnMapping([]);
    setProcessedRows([]);
    setPreviewData(null);
    setImportResult(null);
    setSource('');
  };

  // Get available DB fields for the selected target
  const availableFields = selectedTarget ? Object.values(COLUMN_MAPS[selectedTarget] || {}).filter(f => !f.startsWith('_')) : [];
  const uniqueFields = [...new Set(availableFields)].sort();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-crm-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Import</h1>
            <p className="text-xs text-crm-muted">
              {step === 1 && 'Upload a CSV file to import data into any CRM table'}
              {step === 2 && `Detected: ${TABLE_LABELS[selectedTarget] || 'Unknown'} — ${rawRows.length} rows`}
              {step === 3 && `Map columns for ${TABLE_LABELS[selectedTarget]}`}
              {step === 4 && `Preview — ${processedRows.length} rows ready`}
              {step === 5 && 'Review flagged rows'}
              {step === 6 && 'Import complete'}
            </p>
          </div>
          {step > 1 && step < 6 && (
            <button
              onClick={resetImport}
              className="text-xs text-crm-muted hover:text-crm-text transition-colors"
            >
              Start Over
            </button>
          )}
        </div>

        {/* Step indicator */}
        {step > 1 && step < 6 && (
          <div className="flex items-center gap-1 mt-3">
            {['Upload', 'Detect', 'Map', 'Preview', 'Import'].map((label, idx) => {
              const stepNum = idx + 1;
              const adjustedStep = step >= 5 ? 5 : step;
              return (
                <React.Fragment key={label}>
                  <div className={`text-[10px] px-2 py-0.5 rounded ${
                    stepNum < adjustedStep ? 'bg-green-500/20 text-green-400' :
                    stepNum === adjustedStep ? 'bg-crm-accent/20 text-crm-accent font-medium' :
                    'text-crm-muted'
                  }`}>
                    {label}
                  </div>
                  {idx < 4 && <div className="w-3 h-px bg-crm-border" />}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">

        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="max-w-lg mx-auto mt-16">
            <div
              className="border-2 border-dashed border-crm-border rounded-xl p-12 text-center hover:border-crm-accent/50 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-crm-accent'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('border-crm-accent'); }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-crm-accent');
                const file = e.dataTransfer.files?.[0];
                if (file) {
                  const input = fileInputRef.current;
                  const dt = new DataTransfer();
                  dt.items.add(file);
                  input.files = dt.files;
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }}
            >
              <svg className="w-12 h-12 mx-auto text-crm-muted mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <p className="text-sm text-crm-text font-medium">Drop CSV file here or click to browse</p>
              <p className="text-xs text-crm-muted mt-1">Supports .csv, .tsv, .txt files</p>
            </div>
            <input ref={fileInputRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileSelect} />

            <div className="mt-8 text-xs text-crm-muted space-y-1">
              <p className="font-medium text-crm-text mb-2">Supported imports:</p>
              {Object.entries(TABLE_LABELS).map(([key, label]) => (
                <p key={key}>- {label}</p>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Detection */}
        {step === 2 && (
          <div className="max-w-lg mx-auto">
            {/* Detection result banner */}
            {detections.length > 0 && (
              <div className="bg-crm-accent/10 border border-crm-accent/30 rounded-lg p-4 mb-6">
                <p className="text-sm font-medium text-crm-accent">
                  Auto-detected: {TABLE_LABELS[detections[0].table]}
                </p>
                <p className="text-xs text-crm-muted mt-1">
                  {detections[0].totalMatched} of {rawHeaders.length} columns matched.
                  {' '}{rawRows.length} data rows found.
                </p>
                <button
                  onClick={() => confirmTarget(detections[0].table)}
                  className="mt-3 px-4 py-1.5 text-sm bg-crm-accent text-white rounded-lg hover:bg-crm-accent/90 transition-colors"
                >
                  Continue with {TABLE_LABELS[detections[0].table]}
                </button>
              </div>
            )}

            {/* Other matches or manual selection */}
            <div>
              <p className="text-xs text-crm-muted mb-3">
                {detections.length > 1 ? 'Or select a different table:' : 'Select target table:'}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(TABLE_LABELS).map(([key, label]) => {
                  const detection = detections.find(d => d.table === key);
                  return (
                    <button
                      key={key}
                      onClick={() => confirmTarget(key)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        selectedTarget === key
                          ? 'border-crm-accent bg-crm-accent/10'
                          : 'border-crm-border hover:border-crm-accent/30 bg-crm-card'
                      }`}
                    >
                      <p className="text-sm font-medium">{label}</p>
                      {detection && (
                        <p className="text-[10px] text-crm-accent mt-0.5">
                          {detection.totalMatched} columns matched
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Column Mapping */}
        {step === 3 && (
          <div className="max-w-2xl mx-auto">
            <div className="mb-4 flex items-center gap-3">
              <label className="text-xs text-crm-muted">Data Source:</label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="e.g. Company DB, CoStar, Title Rep..."
                className="flex-1 max-w-xs bg-crm-card border border-crm-border rounded-lg px-3 py-1.5 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
              />
            </div>

            <div className="bg-crm-card border border-crm-border rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-0 text-xs">
                <div className="px-3 py-2 bg-crm-hover font-medium text-crm-muted border-b border-crm-border">CSV Column</div>
                <div className="px-3 py-2 bg-crm-hover border-b border-crm-border" />
                <div className="px-3 py-2 bg-crm-hover font-medium text-crm-muted border-b border-crm-border">Maps To</div>
                <div className="px-3 py-2 bg-crm-hover font-medium text-crm-muted border-b border-crm-border">Sample</div>

                {rawHeaders.map((header, idx) => {
                  const mapped = columnMapping[idx];
                  const sampleVal = rawRows[0]?.[idx] || '';
                  return (
                    <React.Fragment key={idx}>
                      <div className="px-3 py-2 border-b border-crm-border/50 text-crm-text font-mono">
                        {header}
                      </div>
                      <div className="px-2 py-2 border-b border-crm-border/50 text-crm-muted flex items-center">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </div>
                      <div className="px-3 py-1.5 border-b border-crm-border/50">
                        <select
                          value={mapped || ''}
                          onChange={(e) => updateMapping(idx, e.target.value)}
                          className={`w-full bg-transparent border rounded px-2 py-1 text-xs focus:outline-none ${
                            mapped ? 'border-green-500/30 text-green-400' :
                            'border-crm-border text-crm-muted'
                          }`}
                        >
                          <option value="">-- Skip --</option>
                          {uniqueFields.map(f => (
                            <option key={f} value={f}>{f}</option>
                          ))}
                          {/* Also include matching fields */}
                          <optgroup label="Matching Only">
                            <option value="_address">Address (for matching)</option>
                            <option value="_city">City (for matching)</option>
                            <option value="_state">State (for matching)</option>
                            <option value="_zip">ZIP (for matching)</option>
                            <option value="_company_name">Company (for matching)</option>
                          </optgroup>
                        </select>
                      </div>
                      <div className="px-3 py-2 border-b border-crm-border/50 text-crm-muted truncate max-w-[150px]" title={sampleVal}>
                        {sampleVal || '—'}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-crm-muted">
                {columnMapping.filter(Boolean).length} of {rawHeaders.length} columns mapped
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setStep(2)}
                  className="px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={processAndPreview}
                  disabled={columnMapping.filter(Boolean).length === 0}
                  className="px-4 py-1.5 text-sm bg-crm-accent text-white rounded-lg hover:bg-crm-accent/90 transition-colors disabled:opacity-50"
                >
                  Preview Import
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Preview */}
        {step === 4 && (
          <div className="max-w-4xl mx-auto">
            {/* Stats bar */}
            {previewData?.stats && (
              <div className="flex gap-4 mb-4">
                <Stat label="Total Rows" value={previewData.stats.total} />
                <Stat label="Auto-linked" value={previewData.stats.autoLinked} color="text-green-400" />
                <Stat label="Flagged" value={previewData.stats.flagged} color="text-amber-400" />
                <Stat label="New Records" value={previewData.stats.newRecords} color="text-blue-400" />
              </div>
            )}

            {/* Preview table */}
            <div className="bg-crm-card border border-crm-border rounded-lg overflow-auto max-h-[50vh]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-crm-card z-10">
                  <tr className="border-b border-crm-border">
                    <th className="text-left py-2 px-3 text-crm-muted font-medium w-8">#</th>
                    <th className="text-left py-2 px-3 text-crm-muted font-medium w-16">Status</th>
                    {columnMapping.filter(Boolean).slice(0, 6).map((field, idx) => (
                      <th key={idx} className="text-left py-2 px-3 text-crm-muted font-medium">{field}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(previewData?.preview || []).slice(0, 20).map((item, idx) => {
                    const pMatch = item.matches?.property;
                    let status = 'new';
                    let statusColor = 'text-blue-400 bg-blue-500/10';
                    if (pMatch?.match?.confidence >= 85) { status = 'linked'; statusColor = 'text-green-400 bg-green-500/10'; }
                    else if (pMatch?.candidates?.length > 0) { status = 'flagged'; statusColor = 'text-amber-400 bg-amber-500/10'; }

                    return (
                      <tr key={idx} className="border-b border-crm-border/30 hover:bg-crm-hover/50">
                        <td className="py-1.5 px-3 text-crm-muted">{idx + 1}</td>
                        <td className="py-1.5 px-3">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColor}`}>
                            {status === 'linked' ? `${pMatch.match.confidence}%` : status}
                          </span>
                        </td>
                        {columnMapping.filter(Boolean).slice(0, 6).map((field, fIdx) => {
                          const displayField = field.startsWith('_') ? field.slice(1) : field;
                          const val = item.row[displayField] ?? item.row[field];
                          return (
                            <td key={fIdx} className="py-1.5 px-3 text-crm-text truncate max-w-[150px]">
                              {val != null ? String(val) : <span className="text-crm-muted">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {processedRows.length > 20 && (
              <p className="text-xs text-crm-muted mt-2">
                Showing first 20 of {processedRows.length} rows
              </p>
            )}

            {/* Flagged rows summary */}
            {previewData?.stats?.flagged > 0 && (
              <div className="mt-4 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-xs text-amber-400 font-medium">
                  {previewData.stats.flagged} rows need review — addresses matched multiple properties
                </p>
                <p className="text-[10px] text-crm-muted mt-1">
                  These rows will be imported without property links. You can link them manually after import.
                </p>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setStep(3)}
                className="px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text transition-colors"
              >
                Back to Mapping
              </button>
              <button
                onClick={executeImport}
                disabled={importing || processedRows.length === 0}
                className="px-4 py-1.5 text-sm bg-crm-accent text-white rounded-lg hover:bg-crm-accent/90 transition-colors disabled:opacity-50 flex items-center gap-1"
              >
                {importing ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Importing...
                  </>
                ) : (
                  `Import ${processedRows.length} Records`
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 6: Results */}
        {step === 6 && importResult && (
          <div className="max-w-md mx-auto mt-12">
            <div className="bg-crm-card border border-crm-border rounded-xl p-6 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-4">Import Complete</h2>

              <div className="grid grid-cols-2 gap-3 text-left mb-6">
                <ResultStat label="Inserted" value={importResult.inserted} color="text-green-400" />
                <ResultStat label="Skipped" value={importResult.skipped} color="text-crm-muted" />
                <ResultStat label="Updated" value={importResult.updated} color="text-blue-400" />
                <ResultStat label="Flagged" value={importResult.flagged} color="text-amber-400" />
                {importResult.errors > 0 && (
                  <ResultStat label="Errors" value={importResult.errors} color="text-red-400" />
                )}
              </div>

              {importResult.flaggedRows?.length > 0 && (
                <div className="bg-amber-500/10 rounded-lg p-3 mb-4 text-left">
                  <p className="text-xs text-amber-400 font-medium mb-1">
                    {importResult.flaggedRows.length} rows imported without property links:
                  </p>
                  <div className="max-h-24 overflow-auto space-y-1">
                    {importResult.flaggedRows.slice(0, 10).map((f, i) => (
                      <p key={i} className="text-[10px] text-crm-muted">
                        Row {f.rowIndex + 1}: {f.address} ({f.reason})
                      </p>
                    ))}
                    {importResult.flaggedRows.length > 10 && (
                      <p className="text-[10px] text-crm-muted">...and {importResult.flaggedRows.length - 10} more</p>
                    )}
                  </div>
                </div>
              )}

              <button
                onClick={resetImport}
                className="px-4 py-2 text-sm bg-crm-accent text-white rounded-lg hover:bg-crm-accent/90 transition-colors"
              >
                Import Another File
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'text-crm-text' }) {
  return (
    <div className="bg-crm-card border border-crm-border rounded-lg px-4 py-2">
      <p className="text-[10px] text-crm-muted uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-semibold ${color}`}>{value?.toLocaleString?.() ?? value}</p>
    </div>
  );
}

function ResultStat({ label, value, color }) {
  return (
    <div className="bg-crm-hover/50 rounded-lg px-3 py-2">
      <p className="text-[10px] text-crm-muted">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}
