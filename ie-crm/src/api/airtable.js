// Airtable Sync Module — pull records from Airtable and upsert into PostgreSQL

import { query } from './database';
import { airtable } from './bridge';

// PostgreSQL column types — used for type-aware value cleaning
const COLUMN_TYPES = {
  // numeric columns
  rba: 'numeric', land_area_ac: 'numeric', land_sf: 'numeric', far: 'numeric',
  ceiling_ht: 'numeric', clear_ht: 'numeric', last_sale_price: 'numeric',
  price_psf: 'numeric', plsf: 'numeric', loan_amount: 'numeric',
  holding_period_years: 'numeric', listing_asking_lease_rate: 'numeric', cap_rate: 'numeric',
  vacancy_pct: 'numeric', percent_leased: 'numeric',
  sf: 'numeric', revenue: 'numeric', rate: 'numeric', price: 'numeric',
  commission_rate: 'numeric', gross_fee_potential: 'numeric', net_potential: 'numeric',
  // integer columns
  year_built: 'integer', year_renovated: 'integer', number_of_loading_docks: 'integer',
  drive_ins: 'integer', num_properties_owned: 'integer',
  employees: 'integer', lease_months_left: 'integer', age: 'integer',
  // date columns
  last_sale_date: 'date', debt_date: 'date', lease_exp: 'date', move_in_date: 'date',
  born: 'date', follow_up: 'date', last_contacted: 'date', close_date: 'date',
  important_date: 'date',
  // boolean columns
  contacted: 'boolean', off_market_deal: 'boolean', data_confirmed: 'boolean',
  contact_verified: 'boolean', priority_deal: 'boolean',
};

/**
 * Clean an Airtable value for insertion into a typed PostgreSQL column.
 * Handles: dollar strings "$79.21", height strings "32'0\"", dimension strings
 * "2/10'0\"w x 14'0\"h", Airtable error objects {error:"#ERROR!"},
 * special value objects {specialValue:"NaN"}, and string-encoded numbers.
 */
function cleanValue(pgCol, value) {
  if (value === null || value === undefined) return null;

  // Handle Airtable error/special objects like {error:"#ERROR!"} or {specialValue:"NaN"}
  if (typeof value === 'object' && !Array.isArray(value)) {
    if (value.error || value.specialValue) return null;
    return null;
  }

  const colType = COLUMN_TYPES[pgCol];
  if (!colType) return value; // text column — pass through as-is

  if (colType === 'numeric') {
    if (typeof value === 'number') return isNaN(value) || !isFinite(value) ? null : value;
    if (typeof value === 'string') {
      const cleaned = value.replace(/[$,]/g, '').trim();
      // Extract leading number from strings like "32'0\"" or "100.0"
      const match = cleaned.match(/^-?(\d+(?:\.\d+)?)/);
      if (match) return parseFloat(match[0]);
      return null;
    }
    return null;
  }

  if (colType === 'integer') {
    if (typeof value === 'number') return isNaN(value) || !isFinite(value) ? null : Math.round(value);
    if (typeof value === 'string') {
      // For strings like "2/10'0\"w x 14'0\"h", extract leading integer
      const match = value.match(/^(\d+)/);
      if (match) return parseInt(match[1], 10);
      return null;
    }
    return null;
  }

  if (colType === 'date') {
    if (typeof value === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
      return null;
    }
    return null;
  }

  if (colType === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === 'yes' || lower === '1') return true;
      if (lower === 'false' || lower === 'no' || lower === '0') return false;
    }
    if (typeof value === 'number') return value !== 0;
    return null;
  }

  return value;
}

const FIELD_MAPS = {
  Properties: {
    tableName: 'properties',
    idField: 'airtable_id',
    fields: {
      'Property Address': 'property_address',
      'Property Name': 'property_name',
      'City': 'city',
      'County': 'county',
      'State': 'state',
      'Zip': 'zip',
      'RBA': 'rba',
      'Land Area (AC)': 'land_area_ac',
      'Land SF': 'land_sf',
      'FAR': 'far',
      'Property Type': 'property_type',
      'Building Class': 'building_class',
      'Building Status': 'building_status',
      'Year Built': 'year_built',
      'Year Renovated': 'year_renovated',
      'Ceiling Ht': 'ceiling_ht',
      'Clear Ht': 'clear_ht',
      'Number of Loading Docks': 'number_of_loading_docks',
      'Drive Ins': 'drive_ins',
      'Column Spacing': 'column_spacing',
      'Sprinklers': 'sprinklers',
      'Power': 'power',
      'Construction Material': 'construction_material',
      'Zoning': 'zoning',
      'Features': 'features',
      'Last Sale Date': 'last_sale_date',
      'Last Sale Price': 'last_sale_price',
      'Price PSF': 'price_psf',
      'PLSF': 'plsf',
      'Loan Amount': 'loan_amount',
      'Debt Date': 'debt_date',
      'Holding Period (Years)': 'holding_period_years',
      'Rent PSF/Mo': 'listing_asking_lease_rate',
      'Cap Rate': 'cap_rate',
      'Vacancy %': 'vacancy_pct',
      '% Leased': 'percent_leased',
      'Owner Name': 'owner_name',
      'Owner Phone': 'owner_phone',
      'Owner Address': 'owner_address',
      'Owner City/State/Zip': 'owner_city_state_zip',
      'Recorded Owner Name': 'recorded_owner_name',
      'True Owner Name': 'true_owner_name',
      'Contacted': 'contacted',
      'Priority': 'priority',
      'Off Market Deal': 'off_market_deal',
      'Target': 'target',
      'Target For': 'target_for',
      'Building Park': 'building_park',
      'Market Name': 'market_name',
      'Submarket Name': 'submarket_name',
      'Submarket Cluster': 'submarket_cluster',
      'Tenancy': 'tenancy',
      'Lease Type': 'lease_type',
      'Notes': 'notes',
      'CoStar URL': 'costar_url',
      '# Properties Owned': 'num_properties_owned',
      'Data Confirmed': 'data_confirmed',
      'Tags': 'tags',
    },
  },
  Contacts: {
    tableName: 'contacts',
    idField: 'airtable_id',
    fields: {
      'Full Name': 'full_name',
      'First Name': 'first_name',
      'Type': 'type',
      'Title': 'title',
      'Email': 'email_1',
      'Email 2': 'email_2',
      'Email 3': 'email_3',
      'Phone 1': 'phone_1',
      'Phone 2': 'phone_2',
      'Phone 3': 'phone_3',
      'Phone Hot': 'phone_hot',
      'Email Hot': 'email_hot',
      'Home Address': 'home_address',
      'Work Address': 'work_address',
      'Work City': 'work_city',
      'Work State': 'work_state',
      'Work Zip': 'work_zip',
      'Born': 'born',
      'Age': 'age',
      'Client Level': 'client_level',
      'Active Need': 'active_need',
      'Notes': 'notes',
      'LinkedIn': 'linkedin',
      'Follow Up': 'follow_up',
      'Last Contacted': 'last_contacted',
      'Contact Verified': 'contact_verified',
      'Data Source': 'data_source',
      'Tags': 'tags',
    },
  },
  Companies: {
    tableName: 'companies',
    idField: 'airtable_id',
    fields: {
      'Company Name': 'company_name',
      'Company Type': 'company_type',
      'Industry Type': 'industry_type',
      'Website': 'website',
      'SF': 'sf',
      'Employees': 'employees',
      'Revenue': 'revenue',
      'Company Growth': 'company_growth',
      'Company HQ': 'company_hq',
      'Lease Exp': 'lease_exp',
      'Lease Months Left': 'lease_months_left',
      'Move In Date': 'move_in_date',
      'Notes': 'notes',
      'City': 'city',
      'Tags': 'tags',
    },
  },
  Deals: {
    tableName: 'deals',
    idField: 'airtable_id',
    fields: {
      'Deal Name': 'deal_name',
      'Deal Type': 'deal_type',
      'Deal Source': 'deal_source',
      'Status': 'status',
      'Repping': 'repping',
      'Term': 'term',
      'Rate': 'rate',
      'SF': 'sf',
      'Price': 'price',
      'Commission Rate': 'commission_rate',
      'Gross Fee Potential': 'gross_fee_potential',
      'Net Potential': 'net_potential',
      'Close Date': 'close_date',
      'Important Date': 'important_date',
      'Deal Dead Reason': 'deal_dead_reason',
      'Notes': 'notes',
      'Priority Deal': 'priority_deal',
    },
  },
  Interactions: {
    tableName: 'interactions',
    idField: 'airtable_id',
    fields: {
      'Type': 'type',
      'Date': 'date',
      'Notes': 'notes',
      'Email Heading': 'email_heading',
      'Email Body': 'email_body',
      'Follow Up': 'follow_up',
      'Follow Up Notes': 'follow_up_notes',
      'Lead Source': 'lead_source',
      'Team Member': 'team_member',
    },
  },
};

function mapRecord(airtableFields, fieldMap) {
  const mapped = {};
  const overflow = {};

  for (const [atField, value] of Object.entries(airtableFields)) {
    const pgCol = fieldMap[atField];
    if (pgCol) {
      // Handle arrays (tags stay as arrays for PostgreSQL, others join to string)
      if (Array.isArray(value)) {
        if (pgCol === 'tags') {
          mapped[pgCol] = value;
        } else {
          // Linked records or multi-select — join to comma-separated string
          mapped[pgCol] = value.join(', ');
        }
      } else if (typeof value === 'object' && value !== null) {
        // Airtable error/special objects — clean for typed columns, else overflow
        const cleaned = cleanValue(pgCol, value);
        if (cleaned !== null) {
          mapped[pgCol] = cleaned;
        } else if (COLUMN_TYPES[pgCol]) {
          // Typed column got an object (error/special) — store null
          mapped[pgCol] = null;
        } else {
          overflow[atField] = value;
        }
      } else {
        mapped[pgCol] = cleanValue(pgCol, value);
      }
    } else {
      overflow[atField] = value;
    }
  }

  return { mapped, overflow };
}

export async function syncTable(airtableTableName, onProgress) {

  const config = FIELD_MAPS[airtableTableName];
  if (!config) throw new Error(`No field map for table: ${airtableTableName}`);

  let offset = null;
  let totalSynced = 0;
  let errors = [];

  do {
    const response = await airtable.fetch(airtableTableName, offset);
    const records = response.records || [];

    for (const record of records) {
      try {
        const { mapped, overflow } = mapRecord(record.fields, config.fields);
        mapped.airtable_id = record.id;
        mapped.overflow = JSON.stringify(overflow);

        // Build upsert SQL — use EXCLUDED for correct ON CONFLICT references
        const cols = Object.keys(mapped);
        const vals = Object.values(mapped);
        const placeholders = cols.map((_, i) => `$${i + 1}`);
        const updates = cols.filter(c => c !== 'airtable_id').map(c => `${c} = EXCLUDED.${c}`);

        const sql = `
          INSERT INTO ${config.tableName} (${cols.join(', ')})
          VALUES (${placeholders.join(', ')})
          ON CONFLICT (airtable_id) DO UPDATE SET ${updates.join(', ')}
        `;

        await query(sql, vals);
        totalSynced++;
      } catch (err) {
        console.error(`[Airtable] Record ${record.id} upsert failed:`, err.message);
        errors.push({ recordId: record.id, error: err.message });
      }
    }

    offset = response.offset;
    if (onProgress) onProgress({ synced: totalSynced, errors: errors.length, hasMore: !!offset });
  } while (offset);

  return { totalSynced, errors };
}

export function getAvailableTables() {
  return Object.keys(FIELD_MAPS);
}

export function getStatus() {
  return airtable.status();
}
