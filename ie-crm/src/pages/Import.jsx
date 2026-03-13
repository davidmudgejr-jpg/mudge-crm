import React, { useState, useRef, useCallback, useEffect } from 'react';
import { importApi } from '../api/bridge';
import { useToast } from '../components/shared/Toast';

// ============================================================
// SEARCHABLE SELECT — filterable dropdown for column mapping
// ============================================================
function SearchableSelect({ value, onChange, options, linkOptions, matchOptions, placeholder = '-- Skip --' }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Build all items with group labels
  const allItems = [];
  // Regular fields
  options.forEach(f => allItems.push({ value: f, label: f, group: 'fields' }));
  // Matching-only
  if (matchOptions) matchOptions.forEach(m => allItems.push({ ...m, group: 'matching' }));
  // Auto-link
  if (linkOptions) linkOptions.forEach(l => allItems.push({ ...l, group: 'linking' }));

  const q = search.toLowerCase();
  const filtered = q
    ? allItems.filter(item => item.label.toLowerCase().includes(q) || item.value.toLowerCase().includes(q))
    : allItems;

  const selectedItem = value ? allItems.find(i => i.value === value) : null;
  const selectedLabel = selectedItem?.label || value || null;
  const selectedGroup = selectedItem?.group || (value?.startsWith('_link_') || value === '_notes_to_activity' ? 'linking' : value?.startsWith('_') ? 'matching' : 'fields');

  const select = (val) => {
    onChange(val);
    setSearch('');
    setOpen(false);
  };

  // Color-code the button based on field type
  const btnColor = !value ? 'border-crm-border text-crm-muted'
    : selectedGroup === 'linking' ? 'border-cyan-500/30 text-cyan-400 bg-cyan-500/5'
    : selectedGroup === 'matching' ? 'border-amber-500/30 text-amber-400 bg-amber-500/5'
    : 'border-green-500/30 text-green-400';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); setTimeout(() => inputRef.current?.focus(), 50); }}
        className={`w-full text-left bg-transparent border rounded px-2 py-1 text-xs focus:outline-none truncate ${btnColor}`}
      >
        {selectedLabel || placeholder}
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 w-64 bg-crm-sidebar border border-crm-border rounded-lg shadow-xl overflow-hidden">
          {/* Search input */}
          <div className="p-1.5 border-b border-crm-border/50">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fields..."
              className="w-full bg-crm-bg border border-crm-border rounded px-2 py-1 text-xs text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent"
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setOpen(false); setSearch(''); }
                if (e.key === 'Enter' && filtered.length === 1) select(filtered[0].value);
              }}
            />
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {/* Skip option */}
            {(!q || 'skip'.includes(q)) && (
              <button
                onClick={() => select('')}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-crm-hover transition-colors ${
                  !value ? 'text-crm-accent' : 'text-crm-muted'
                }`}
              >
                {placeholder}
              </button>
            )}

            {/* Group: Regular fields */}
            {filtered.filter(i => i.group === 'fields').length > 0 && (
              <>
                {q && <div className="px-3 py-1 text-[10px] text-crm-muted uppercase tracking-wider">Fields</div>}
                {filtered.filter(i => i.group === 'fields').map(item => (
                  <button
                    key={item.value}
                    onClick={() => select(item.value)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-crm-hover transition-colors ${
                      value === item.value ? 'text-green-400 bg-green-500/10' : 'text-crm-text'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </>
            )}

            {/* Group: Matching Only */}
            {filtered.filter(i => i.group === 'matching').length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] text-amber-400/80 uppercase tracking-wider border-t border-crm-border/30 mt-1">Matching Only</div>
                {filtered.filter(i => i.group === 'matching').map(item => (
                  <button
                    key={item.value}
                    onClick={() => select(item.value)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-crm-hover transition-colors ${
                      value === item.value ? 'text-amber-400 bg-amber-500/10' : 'text-amber-400/70'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </>
            )}

            {/* Group: Auto-Link */}
            {filtered.filter(i => i.group === 'linking').length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] text-cyan-400/80 uppercase tracking-wider border-t border-crm-border/30 mt-1">Auto-Link (find or create)</div>
                {filtered.filter(i => i.group === 'linking').map(item => (
                  <button
                    key={item.value}
                    onClick={() => select(item.value)}
                    className={`w-full text-left px-3 py-1.5 text-xs hover:bg-crm-hover transition-colors ${
                      value === item.value ? 'text-cyan-400 bg-cyan-500/10' : 'text-cyan-400/70'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </>
            )}

            {filtered.length === 0 && (
              <div className="px-3 py-3 text-xs text-crm-muted text-center">No matches</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

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
    'actual rate': 'rate', 'asking rate': 'rate',
    'cam expenses': 'cam_expenses', cam: 'cam_expenses', 'cam/nnn': 'cam_expenses',
    zoning: 'zoning',
    '#gl/did': 'doors_with_lease', 'gl did': 'doors_with_lease', 'doors with lease': 'doors_with_lease', 'gl/did': 'doors_with_lease',
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
    'phone hot': 'phone_hot', phone_hot: 'phone_hot',
    'email hot': 'email_hot', email_hot: 'email_hot',
    'email kickback': 'email_kickback', email_kickback: 'email_kickback',
    'home address': 'home_address', home_address: 'home_address',
    'work address': 'work_address', work_address: 'work_address',
    'work city': 'work_city', work_city: 'work_city',
    'work state': 'work_state', work_state: 'work_state',
    'work zip': 'work_zip', work_zip: 'work_zip',
    born: 'born', birthday: 'born', 'date of birth': 'born',
    age: 'age',
    notes: 'notes', linkedin: 'linkedin',
    'follow up': 'follow_up', follow_up: 'follow_up',
    'last contacted': 'last_contacted', last_contacted: 'last_contacted',
    tags: 'tags', 'data source': 'data_source', data_source: 'data_source',
    'client level': 'client_level', client_level: 'client_level',
    'active need': 'active_need', active_need: 'active_need',
    // Prospect intelligence
    'white pages url': 'white_pages_url', white_pages_url: 'white_pages_url',
    'been verified url': 'been_verified_url', been_verified_url: 'been_verified_url',
    'zoom info url': 'zoom_info_url', zoom_info_url: 'zoom_info_url',
    'property type interest': 'property_type_interest', property_type_interest: 'property_type_interest',
    'lease months left': 'lease_months_left', lease_months_left: 'lease_months_left',
    'tenant space fit': 'tenant_space_fit', tenant_space_fit: 'tenant_space_fit',
    'tenant ownership intent': 'tenant_ownership_intent', tenant_ownership_intent: 'tenant_ownership_intent',
    'business trajectory': 'business_trajectory', business_trajectory: 'business_trajectory',
    'last call outcome': 'last_call_outcome', last_call_outcome: 'last_call_outcome',
    'follow up behavior': 'follow_up_behavior', follow_up_behavior: 'follow_up_behavior',
    'decision authority': 'decision_authority', decision_authority: 'decision_authority',
    'price cost awareness': 'price_cost_awareness', price_cost_awareness: 'price_cost_awareness',
    'frustration signals': 'frustration_signals', frustration_signals: 'frustration_signals',
    'exit trigger events': 'exit_trigger_events', exit_trigger_events: 'exit_trigger_events',
    'airtable id': 'airtable_id', airtable_id: 'airtable_id',
    overflow: 'overflow',
    // Auto-link fields (find-or-create company and create junction link)
    '_link_company': '_link_company',
    // Notes → Activity (split notes into interaction records)
    '_notes_to_activity': '_notes_to_activity',
  },
  properties: {
    // Address & location
    address: 'property_address', 'property address': 'property_address', property_address: 'property_address', 'street address': 'property_address',
    'property name': 'property_name', property_name: 'property_name', 'building name': 'property_name',
    city: 'city', state: 'state', zip: 'zip', 'zip code': 'zip', county: 'county',
    latitude: 'latitude', lat: 'latitude',
    longitude: 'longitude', lng: 'longitude', lon: 'longitude',

    // Size & physical
    rba: 'rba', 'building sf': 'rba', 'building sqft': 'rba', 'rentable building area': 'rba',
    'land sf': 'land_sf', land_sf: 'land_sf', 'land area sf': 'land_sf',
    'land area ac': 'land_area_ac', land_area_ac: 'land_area_ac', 'land acres': 'land_area_ac',
    far: 'far', 'floor area ratio': 'far',
    stories: 'stories', 'number of stories': 'stories', floors: 'stories',
    units: 'units', 'number of units': 'units',
    'parking spaces': 'parking_spaces', parking_spaces: 'parking_spaces',
    'parking ratio': 'parking_ratio', parking_ratio: 'parking_ratio',

    // Type & classification
    'property type': 'property_type', property_type: 'property_type', type: 'property_type',
    'building class': 'building_class', building_class: 'building_class', class: 'building_class',
    'building status': 'building_status', building_status: 'building_status', status: 'building_status',
    tenancy: 'tenancy', 'tenancy type': 'tenancy',
    'lease type': 'lease_type', lease_type: 'lease_type',

    // Construction details
    'year built': 'year_built', year_built: 'year_built',
    'year renovated': 'year_renovated', year_renovated: 'year_renovated',
    'ceiling height': 'ceiling_ht', ceiling_ht: 'ceiling_ht', 'ceiling ht': 'ceiling_ht',
    'clear height': 'clear_ht', clear_ht: 'clear_ht', 'clear ht': 'clear_ht',
    'loading docks': 'number_of_loading_docks', number_of_loading_docks: 'number_of_loading_docks',
    'drive ins': 'drive_ins', drive_ins: 'drive_ins', 'drive-ins': 'drive_ins',
    'column spacing': 'column_spacing', column_spacing: 'column_spacing',
    sprinklers: 'sprinklers', power: 'power',
    'construction material': 'construction_material', construction_material: 'construction_material',
    'number of cranes': 'number_of_cranes', number_of_cranes: 'number_of_cranes', cranes: 'number_of_cranes',
    'rail lines': 'rail_lines', rail_lines: 'rail_lines', rail: 'rail_lines',
    sewer: 'sewer', water: 'water', gas: 'gas', heating: 'heating',
    zoning: 'zoning', features: 'features',

    // Financial
    'last sale date': 'last_sale_date', last_sale_date: 'last_sale_date',
    'last sale price': 'last_sale_price', last_sale_price: 'last_sale_price',
    'price psf': 'price_psf', price_psf: 'price_psf', 'price per sf': 'price_psf',
    'price per sqft': 'price_per_sqft', price_per_sqft: 'price_per_sqft',
    plsf: 'plsf', 'price land sf': 'plsf',
    'loan amount': 'loan_amount', loan_amount: 'loan_amount',
    'debt date': 'debt_date', debt_date: 'debt_date',
    'holding period years': 'holding_period_years', holding_period_years: 'holding_period_years', 'holding period': 'holding_period_years',
    'rent psf mo': 'rent_psf_mo', rent_psf_mo: 'rent_psf_mo', 'rent/sf/mo': 'rent_psf_mo', 'rent per sf': 'rent_psf_mo',
    'cap rate': 'cap_rate', cap_rate: 'cap_rate',
    'vacancy pct': 'vacancy_pct', vacancy_pct: 'vacancy_pct', vacancy: 'vacancy_pct', 'vacancy %': 'vacancy_pct',
    'percent leased': 'percent_leased', percent_leased: 'percent_leased', '% leased': 'percent_leased',
    noi: 'noi', 'net operating income': 'noi',
    'for sale price': 'for_sale_price', for_sale_price: 'for_sale_price', 'asking price': 'for_sale_price',
    'ops expense psf': 'ops_expense_psf', ops_expense_psf: 'ops_expense_psf',
    'building tax': 'building_tax', building_tax: 'building_tax',
    'building opex': 'building_opex', building_opex: 'building_opex',
    'avg weighted rent': 'avg_weighted_rent', avg_weighted_rent: 'avg_weighted_rent',

    // Availability
    'total available sf': 'total_available_sf', total_available_sf: 'total_available_sf',
    'direct available sf': 'direct_available_sf', direct_available_sf: 'direct_available_sf',
    'direct vacant space': 'direct_vacant_space', direct_vacant_space: 'direct_vacant_space',

    // Owner info
    'owner name': 'owner_name', owner_name: 'owner_name', owner: 'owner_name',
    'owner phone': 'owner_phone', owner_phone: 'owner_phone',
    'owner email': 'owner_email', owner_email: 'owner_email',
    'owner address': 'owner_address', owner_address: 'owner_address',
    'owner city state zip': 'owner_city_state_zip', owner_city_state_zip: 'owner_city_state_zip',
    'owner mailing address': 'owner_mailing_address', owner_mailing_address: 'owner_mailing_address',
    'recorded owner name': 'recorded_owner_name', recorded_owner_name: 'recorded_owner_name',
    'true owner name': 'true_owner_name', true_owner_name: 'true_owner_name',
    'owner type': 'owner_type', owner_type: 'owner_type',
    'owner entity type': 'owner_entity_type', owner_entity_type: 'owner_entity_type',
    'owner user or investor': 'owner_user_or_investor', owner_user_or_investor: 'owner_user_or_investor',
    'out of area owner': 'out_of_area_owner', out_of_area_owner: 'out_of_area_owner',
    'num properties owned': 'num_properties_owned', num_properties_owned: 'num_properties_owned', 'properties owned': 'num_properties_owned',
    'owner call status': 'owner_call_status', owner_call_status: 'owner_call_status',
    'tenant call status': 'tenant_call_status', tenant_call_status: 'tenant_call_status',
    'has lien or delinquency': 'has_lien_or_delinquency', has_lien_or_delinquency: 'has_lien_or_delinquency',

    // Status & flags
    contacted: 'contacted', priority: 'priority',
    'off market deal': 'off_market_deal', off_market_deal: 'off_market_deal', 'off market': 'off_market_deal',
    target: 'target', 'target for': 'target_for', target_for: 'target_for',
    'data confirmed': 'data_confirmed', data_confirmed: 'data_confirmed',
    'office courtesy': 'office_courtesy', office_courtesy: 'office_courtesy',
    tags: 'tags',

    // Market / location context
    'building park': 'building_park', building_park: 'building_park',
    'market name': 'market_name', market_name: 'market_name', market: 'market_name',
    'submarket name': 'submarket_name', submarket_name: 'submarket_name', submarket: 'submarket_name',
    'submarket cluster': 'submarket_cluster', submarket_cluster: 'submarket_cluster',

    // Reference / contacts
    'leasing company': 'leasing_company', leasing_company: 'leasing_company',
    'broker contact': 'broker_contact', broker_contact: 'broker_contact',
    'owner contact': 'owner_contact', owner_contact: 'owner_contact',

    // URLs & IDs
    'costar url': 'costar_url', costar_url: 'costar_url',
    'landvision url': 'landvision_url', landvision_url: 'landvision_url',
    'sb county zoning': 'sb_county_zoning', sb_county_zoning: 'sb_county_zoning',
    'google maps url': 'google_maps_url', google_maps_url: 'google_maps_url',
    'zoning map url': 'zoning_map_url', zoning_map_url: 'zoning_map_url',
    'listing url': 'listing_url', listing_url: 'listing_url',
    'building image path': 'building_image_path', building_image_path: 'building_image_path',
    'parcel number': 'parcel_number', parcel_number: 'parcel_number', apn: 'parcel_number',
    'airtable id': 'airtable_id', airtable_id: 'airtable_id',

    // Notes & misc
    notes: 'notes',
    overflow: 'overflow',

    // Auto-link fields (find-or-create contact/company and create junction link with role)
    '_link_owner_contact': '_link_owner_contact',
    '_link_broker_contact': '_link_broker_contact',
    '_link_company_owner': '_link_company_owner',
    '_link_company_tenant': '_link_company_tenant',
    '_link_leasing_company': '_link_leasing_company',
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
    'lease months left': 'lease_months_left', lease_months_left: 'lease_months_left',
    'move in date': 'move_in_date', move_in_date: 'move_in_date',
    city: 'city', notes: 'notes',
    'tenant sic': 'tenant_sic', tenant_sic: 'tenant_sic', sic: 'tenant_sic',
    'tenant naics': 'tenant_naics', tenant_naics: 'tenant_naics', naics: 'tenant_naics',
    suite: 'suite',
    tags: 'tags',
    'airtable id': 'airtable_id', airtable_id: 'airtable_id',
    overflow: 'overflow',
    // Auto-link fields (find-or-create contact and create junction link)
    '_link_contact': '_link_contact',
  },
  deals: {
    'deal name': 'deal_name', deal_name: 'deal_name', name: 'deal_name', deal: 'deal_name',
    'deal type': 'deal_type', deal_type: 'deal_type', type: 'deal_type',
    'deal source': 'deal_source', deal_source: 'deal_source', source: 'deal_source',
    status: 'status', repping: 'repping',
    term: 'term', rate: 'rate', sf: 'sf',
    price: 'price', 'commission rate': 'commission_rate', commission_rate: 'commission_rate',
    'gross fee potential': 'gross_fee_potential', gross_fee_potential: 'gross_fee_potential',
    'net potential': 'net_potential', net_potential: 'net_potential',
    'close date': 'close_date', close_date: 'close_date',
    'important date': 'important_date', important_date: 'important_date',
    'deal dead reason': 'deal_dead_reason', deal_dead_reason: 'deal_dead_reason',
    'fell through reason': 'fell_through_reason', fell_through_reason: 'fell_through_reason',
    notes: 'notes', 'priority deal': 'priority_deal', priority_deal: 'priority_deal',
    'run by': 'run_by', run_by: 'run_by',
    'other broker': 'other_broker', other_broker: 'other_broker',
    industry: 'industry', deadline: 'deadline',
    increases: 'increases',
    'escrow url': 'escrow_url', escrow_url: 'escrow_url',
    'surveys brochures url': 'surveys_brochures_url', surveys_brochures_url: 'surveys_brochures_url',
    'airtable id': 'airtable_id', airtable_id: 'airtable_id',
    overflow: 'overflow',
    // Auto-link fields (find-or-create contact/company/property and create junction link)
    '_link_contact': '_link_contact',
    '_link_company': '_link_company',
    '_link_property': '_link_property',
    // Notes → Activity (split notes into interaction records)
    '_notes_to_activity': '_notes_to_activity',
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
    // Auto-link fields
    '_link_contact': '_link_contact',
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
    // Auto-link fields
    '_link_contact': '_link_contact',
    '_link_company': '_link_company',
    '_link_deal': '_link_deal',
    '_link_property': '_link_property',
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
// Tables that support auto-linking contacts/companies via _link_* fields
const NEEDS_RECORD_LINKING = new Set(['properties', 'contacts', 'companies', 'deals', 'campaigns', 'interactions']);

const NUMERIC_FIELDS = new Set([
  'sf', 'building_rba', 'rate', 'escalations', 'free_rent_months', 'ti_psf', 'term_months', 'cam_expenses', 'doors_with_lease',
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
      const needsRecordLinking = NEEDS_RECORD_LINKING.has(selectedTarget);

      // Remove matching-only fields before sending to batch endpoint
      const cleanRows = processedRows.map(row => {
        const clean = { ...row };
        // Keep property_address/city/zip for matching but they'll be stripped server-side
        // Keep _link_* fields for auto-linking on the server
        return clean;
      });

      const result = await importApi.batch(selectedTarget, cleanRows, {
        source: source || undefined,
        matchProperties: needsPropertyMatch,
        matchCompanies: needsCompanyMatch,
        linkRecords: needsRecordLinking,
        onDuplicate: 'skip',
      });

      setImportResult(result);
      setStep(6);
      const linkMsg = result.linked ? ` (${result.linked} links created)` : '';
      addToast(`Imported ${result.inserted} records into ${TABLE_LABELS[selectedTarget]}${linkMsg}`);
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
                        <SearchableSelect
                          value={mapped || ''}
                          onChange={(val) => updateMapping(idx, val)}
                          options={uniqueFields}
                          matchOptions={[
                            { value: '_address', label: 'Address (for matching)' },
                            { value: '_city', label: 'City (for matching)' },
                            { value: '_state', label: 'State (for matching)' },
                            { value: '_zip', label: 'ZIP (for matching)' },
                            { value: '_company_name', label: 'Company (for matching)' },
                          ]}
                          linkOptions={
                            selectedTarget === 'properties' ? [
                              { value: '_link_owner_contact', label: 'Owner Contact → link' },
                              { value: '_link_broker_contact', label: 'Broker Contact → link' },
                              { value: '_link_company_owner', label: 'Company Owner → link' },
                              { value: '_link_company_tenant', label: 'Company Tenant → link' },
                              { value: '_link_leasing_company', label: 'Leasing Company → link' },
                            ] : selectedTarget === 'contacts' ? [
                              { value: '_link_company', label: 'Company → link' },
                              { value: '_notes_to_activity', label: 'Notes → Activity' },
                            ] : selectedTarget === 'companies' ? [
                              { value: '_link_contact', label: 'Contact → link' },
                            ] : selectedTarget === 'deals' ? [
                              { value: '_link_contact', label: 'Contact → link' },
                              { value: '_link_company', label: 'Company → link' },
                              { value: '_link_property', label: 'Property → link' },
                              { value: '_notes_to_activity', label: 'Notes → Activity' },
                            ] : selectedTarget === 'campaigns' ? [
                              { value: '_link_contact', label: 'Contact → link' },
                            ] : selectedTarget === 'interactions' ? [
                              { value: '_link_contact', label: 'Contact → link' },
                              { value: '_link_company', label: 'Company → link' },
                              { value: '_link_deal', label: 'Deal → link' },
                              { value: '_link_property', label: 'Property → link' },
                            ] : null
                          }
                        />
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
                {importResult.linked > 0 && (
                  <ResultStat label="Links Created" value={importResult.linked} color="text-cyan-400" />
                )}
                {importResult.errors > 0 && (
                  <ResultStat label="Errors" value={importResult.errors} color="text-red-400" />
                )}
              </div>

              {importResult.firstError && (
                <div className="bg-red-500/10 rounded-lg p-3 mb-4 text-left">
                  <p className="text-xs text-red-400 font-medium mb-1">First error detail:</p>
                  <p className="text-[10px] text-crm-muted font-mono break-all">{importResult.firstError.message}</p>
                  <p className="text-[10px] text-crm-muted mt-1">Columns: {importResult.firstError.columns?.join(', ')}</p>
                </div>
              )}

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
