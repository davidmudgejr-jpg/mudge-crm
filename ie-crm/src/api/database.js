// Database API — all PostgreSQL operations go through Electron IPC

const db = window.iecrm?.db;

export async function query(sql, params = []) {
  if (!db) throw new Error('Database bridge not available');
  return db.query(sql, params);
}

export async function getStatus() {
  if (!db) return { connected: false, error: 'Not in Electron' };
  return db.status();
}

// ============================================================
// SQL INJECTION PREVENTION — Column & table whitelists
// ============================================================
const IDENTIFIER_RE = /^[a-z_][a-z0-9_]*$/;

const ALLOWED_COLS = {
  properties: new Set([
    'property_id', 'property_address', 'property_name', 'city', 'county', 'zip', 'apn',
    'property_type', 'zoning', 'building_sqft', 'lot_sqft', 'year_built', 'units', 'stories',
    'parking_spaces', 'asking_price', 'price_per_sqft', 'rba', 'far', 'cap_rate', 'noi',
    'owner_name', 'owner_phone', 'owner_email', 'owner_mailing_address',
    'priority', 'contacted', 'notes', 'created_at', 'last_modified',
  ]),
  contacts: new Set([
    'contact_id', 'full_name', 'first_name', 'email', 'email_2', 'phone_1', 'phone_2',
    'phone_hot', 'email_hot', 'type', 'title', 'linkedin', 'client_level',
    'home_address', 'work_address', 'work_city', 'work_state', 'work_zip',
    'active_need', 'follow_up', 'last_contacted', 'data_source', 'notes',
    'created_at', 'modified',
  ]),
  companies: new Set([
    'company_id', 'company_name', 'company_type', 'industry_type', 'website', 'company_hq',
    'city', 'sf', 'employees', 'revenue', 'company_growth',
    'lease_exp', 'lease_months_left', 'move_in_date', 'notes',
    'created_at', 'modified',
  ]),
  deals: new Set([
    'deal_id', 'deal_name', 'deal_type', 'status', 'deal_source', 'repping', 'term',
    'sf', 'rate', 'price', 'commission_rate', 'gross_fee_potential', 'net_potential',
    'close_date', 'important_date', 'priority_deal', 'deal_dead_reason', 'notes',
    'created_at', 'modified',
  ]),
  interactions: new Set([
    'interaction_id', 'type', 'subject', 'date', 'email_heading', 'email_body', 'notes',
    'team_member', 'lead_source', 'follow_up', 'follow_up_notes',
    'created_at', 'modified',
  ]),
  campaigns: new Set([
    'campaign_id', 'name', 'type', 'status', 'sent_date', 'notes',
    'created_at', 'modified',
  ]),
};

const ALLOWED_JUNCTION_TABLES = new Set([
  'property_contacts', 'property_companies', 'contact_companies',
  'deal_properties', 'deal_contacts', 'deal_companies',
  'interaction_contacts', 'interaction_properties', 'interaction_deals', 'interaction_companies',
]);

const ALLOWED_JUNCTION_COLS = new Set([
  'property_id', 'contact_id', 'company_id', 'deal_id', 'interaction_id', 'role',
]);

function sanitizeCol(col, table, fallback) {
  if (ALLOWED_COLS[table]?.has(col)) return col;
  return fallback;
}

function sanitizeDir(dir) {
  return dir?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
}

function validateFieldKeys(keys, table) {
  const allowed = ALLOWED_COLS[table];
  if (!allowed) throw new Error(`Unknown table: ${table}`);
  for (const k of keys) {
    if (!allowed.has(k)) throw new Error(`Disallowed column "${k}" for table "${table}"`);
  }
}

function validateJunction(table, cols) {
  if (!ALLOWED_JUNCTION_TABLES.has(table)) throw new Error(`Disallowed junction table: ${table}`);
  for (const c of cols) {
    if (!ALLOWED_JUNCTION_COLS.has(c)) throw new Error(`Disallowed junction column: ${c}`);
  }
}

// ============================================================
// PROPERTIES
// ============================================================
export async function getProperties({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.city) { where.push(`city ILIKE $${i++}`); params.push(`%${filters.city}%`); }
  if (filters.property_type) { where.push(`property_type = $${i++}`); params.push(filters.property_type); }
  if (filters.priority) { where.push(`priority = $${i++}`); params.push(filters.priority); }
  if (filters.contacted !== undefined) { where.push(`contacted = $${i++}`); params.push(filters.contacted); }
  if (filters.search) {
    where.push(`(property_address ILIKE $${i} OR owner_name ILIKE $${i} OR city ILIKE $${i} OR property_name ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'properties', 'created_at');
  const safeDir = sanitizeDir(order);
  const sql = `SELECT * FROM properties ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getProperty(id) {
  return query('SELECT * FROM properties WHERE property_id = $1', [id]);
}

export async function updateProperty(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'properties');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const sql = `UPDATE properties SET ${sets.join(', ')}, last_modified = NOW() WHERE property_id = $1 RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

export async function getPropertyContacts(propertyId) {
  return query(`
    SELECT c.*, pc.role FROM contacts c
    JOIN property_contacts pc ON c.contact_id = pc.contact_id
    WHERE pc.property_id = $1
    ORDER BY c.full_name
  `, [propertyId]);
}

export async function getPropertyCompanies(propertyId) {
  return query(`
    SELECT co.*, pc.role FROM companies co
    JOIN property_companies pc ON co.company_id = pc.company_id
    WHERE pc.property_id = $1
    ORDER BY co.company_name
  `, [propertyId]);
}

export async function getPropertyDeals(propertyId) {
  return query(`
    SELECT d.* FROM deals d
    JOIN deal_properties dp ON d.deal_id = dp.deal_id
    WHERE dp.property_id = $1
    ORDER BY d.created_at DESC
  `, [propertyId]);
}

export async function getPropertyInteractions(propertyId) {
  return query(`
    SELECT i.* FROM interactions i
    JOIN interaction_properties ip ON i.interaction_id = ip.interaction_id
    WHERE ip.property_id = $1
    ORDER BY i.date DESC
  `, [propertyId]);
}

// ============================================================
// CONTACTS
// ============================================================
export async function getContacts({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.type) { where.push(`type = $${i++}`); params.push(filters.type); }
  if (filters.search) {
    where.push(`(full_name ILIKE $${i} OR email ILIKE $${i} OR phone_1 ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'contacts', 'created_at');
  const safeDir = sanitizeDir(order);
  const sql = `SELECT * FROM contacts ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getContact(id) {
  return query('SELECT * FROM contacts WHERE contact_id = $1', [id]);
}

export async function updateContact(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'contacts');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const sql = `UPDATE contacts SET ${sets.join(', ')}, modified = NOW() WHERE contact_id = $1 RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

// ============================================================
// COMPANIES
// ============================================================
export async function getCompanies({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.search) {
    where.push(`(company_name ILIKE $${i} OR city ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'companies', 'created_at');
  const safeDir = sanitizeDir(order);
  const sql = `SELECT * FROM companies ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getCompany(id) {
  return query('SELECT * FROM companies WHERE company_id = $1', [id]);
}

export async function updateCompany(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'companies');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const sql = `UPDATE companies SET ${sets.join(', ')}, modified = NOW() WHERE company_id = $1 RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

// ============================================================
// DEALS
// ============================================================
export async function getDeals({ limit = 200, offset = 0, orderBy = 'created_at', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.status) { where.push(`status = $${i++}`); params.push(filters.status); }
  if (filters.search) {
    where.push(`(deal_name ILIKE $${i} OR deal_type ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'deals', 'created_at');
  const safeDir = sanitizeDir(order);
  const sql = `SELECT * FROM deals ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

export async function getDeal(id) {
  return query('SELECT * FROM deals WHERE deal_id = $1', [id]);
}

export async function updateDeal(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'deals');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const sql = `UPDATE deals SET ${sets.join(', ')}, modified = NOW() WHERE deal_id = $1 RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

// ============================================================
// INTERACTIONS
// ============================================================
export async function getInteractions({ limit = 200, offset = 0, orderBy = 'date', order = 'DESC', filters = {} } = {}) {
  let where = [];
  let params = [];
  let i = 1;

  if (filters.type) { where.push(`type = $${i++}`); params.push(filters.type); }
  if (filters.search) {
    where.push(`(notes ILIKE $${i} OR email_heading ILIKE $${i})`);
    params.push(`%${filters.search}%`);
    i++;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const safeOrder = sanitizeCol(orderBy, 'interactions', 'date');
  const safeDir = sanitizeDir(order);
  const sql = `SELECT * FROM interactions ${whereClause} ORDER BY ${safeOrder} ${safeDir} LIMIT $${i++} OFFSET $${i++}`;
  params.push(limit, offset);

  return query(sql, params);
}

// ============================================================
// INTERACTION — single record + reverse lookups
// ============================================================
export async function getInteraction(id) {
  return query('SELECT * FROM interactions WHERE interaction_id = $1', [id]);
}

export async function updateInteraction(id, fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'interactions');
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const sql = `UPDATE interactions SET ${sets.join(', ')}, modified = NOW() WHERE interaction_id = $1 RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

export async function getInteractionContacts(interactionId) {
  return query(`
    SELECT c.* FROM contacts c
    JOIN interaction_contacts ic ON c.contact_id = ic.contact_id
    WHERE ic.interaction_id = $1
    ORDER BY c.full_name
  `, [interactionId]);
}

export async function getInteractionProperties(interactionId) {
  return query(`
    SELECT p.* FROM properties p
    JOIN interaction_properties ip ON p.property_id = ip.property_id
    WHERE ip.interaction_id = $1
    ORDER BY p.property_address
  `, [interactionId]);
}

export async function getInteractionDeals(interactionId) {
  return query(`
    SELECT d.* FROM deals d
    JOIN interaction_deals id ON d.deal_id = id.deal_id
    WHERE id.interaction_id = $1
    ORDER BY d.deal_name
  `, [interactionId]);
}

// ============================================================
// REVERSE RELATIONSHIP QUERIES
// ============================================================
export async function getContactProperties(contactId) {
  return query(`
    SELECT p.*, pc.role FROM properties p
    JOIN property_contacts pc ON p.property_id = pc.property_id
    WHERE pc.contact_id = $1
    ORDER BY p.property_address
  `, [contactId]);
}

export async function getContactCompanies(contactId) {
  return query(`
    SELECT co.* FROM companies co
    JOIN contact_companies cc ON co.company_id = cc.company_id
    WHERE cc.contact_id = $1
    ORDER BY co.company_name
  `, [contactId]);
}

export async function getContactDeals(contactId) {
  return query(`
    SELECT d.* FROM deals d
    JOIN deal_contacts dc ON d.deal_id = dc.deal_id
    WHERE dc.contact_id = $1
    ORDER BY d.created_at DESC
  `, [contactId]);
}

export async function getContactInteractions(contactId) {
  return query(`
    SELECT i.* FROM interactions i
    JOIN interaction_contacts ic ON i.interaction_id = ic.interaction_id
    WHERE ic.contact_id = $1
    ORDER BY i.date DESC
  `, [contactId]);
}

export async function getCompanyInteractions(companyId) {
  return query(`
    SELECT i.* FROM interactions i
    JOIN interaction_companies ic ON i.interaction_id = ic.interaction_id
    WHERE ic.company_id = $1
    ORDER BY i.date DESC
  `, [companyId]);
}

export async function getDealInteractions(dealId) {
  return query(`
    SELECT i.* FROM interactions i
    JOIN interaction_deals id ON i.interaction_id = id.interaction_id
    WHERE id.deal_id = $1
    ORDER BY i.date DESC
  `, [dealId]);
}

export async function getCompanyContacts(companyId) {
  return query(`
    SELECT c.* FROM contacts c
    JOIN contact_companies cc ON c.contact_id = cc.contact_id
    WHERE cc.company_id = $1
    ORDER BY c.full_name
  `, [companyId]);
}

export async function getCompanyProperties(companyId) {
  return query(`
    SELECT p.*, pc.role FROM properties p
    JOIN property_companies pc ON p.property_id = pc.property_id
    WHERE pc.company_id = $1
    ORDER BY p.property_address
  `, [companyId]);
}

export async function getCompanyDeals(companyId) {
  return query(`
    SELECT d.* FROM deals d
    JOIN deal_companies dc ON d.deal_id = dc.deal_id
    WHERE dc.company_id = $1
    ORDER BY d.created_at DESC
  `, [companyId]);
}

export async function getDealProperties(dealId) {
  return query(`
    SELECT p.* FROM properties p
    JOIN deal_properties dp ON p.property_id = dp.property_id
    WHERE dp.deal_id = $1
    ORDER BY p.property_address
  `, [dealId]);
}

export async function getDealContacts(dealId) {
  return query(`
    SELECT c.* FROM contacts c
    JOIN deal_contacts dc ON c.contact_id = dc.contact_id
    WHERE dc.deal_id = $1
    ORDER BY c.full_name
  `, [dealId]);
}

export async function getDealCompanies(dealId) {
  return query(`
    SELECT co.* FROM companies co
    JOIN deal_companies dc ON co.company_id = dc.company_id
    WHERE dc.deal_id = $1
    ORDER BY co.company_name
  `, [dealId]);
}

// ============================================================
// GENERIC LINK / UNLINK
// ============================================================
export async function linkRecords(junctionTable, col1, id1, col2, id2, extras = {}) {
  const cols = [col1, col2];
  const vals = [id1, id2];
  const extraKeys = Object.keys(extras);
  extraKeys.forEach((k) => { cols.push(k); vals.push(extras[k]); });
  validateJunction(junctionTable, cols);
  const placeholders = vals.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO ${junctionTable} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING RETURNING *`;
  return query(sql, vals);
}

export async function unlinkRecords(junctionTable, col1, id1, col2, id2) {
  validateJunction(junctionTable, [col1, col2]);
  const sql = `DELETE FROM ${junctionTable} WHERE ${col1} = $1 AND ${col2} = $2 RETURNING *`;
  return query(sql, [id1, id2]);
}

// ============================================================
// CREATE FUNCTIONS
// ============================================================
export async function createProperty(fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'properties');
  const cols = ['property_id', ...keys];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const id = crypto.randomUUID();
  const sql = `INSERT INTO properties (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

export async function createContact(fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'contacts');
  const cols = ['contact_id', ...keys];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const id = crypto.randomUUID();
  const sql = `INSERT INTO contacts (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

export async function createCompany(fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'companies');
  const cols = ['company_id', ...keys];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const id = crypto.randomUUID();
  const sql = `INSERT INTO companies (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

export async function createDeal(fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'deals');
  const cols = ['deal_id', ...keys];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const id = crypto.randomUUID();
  const sql = `INSERT INTO deals (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

export async function createInteraction(fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'interactions');
  const cols = ['interaction_id', ...keys];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const id = crypto.randomUUID();
  const sql = `INSERT INTO interactions (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

export async function createCampaign(fields) {
  const keys = Object.keys(fields);
  validateFieldKeys(keys, 'campaigns');
  const cols = ['campaign_id', ...keys];
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const id = crypto.randomUUID();
  const sql = `INSERT INTO campaigns (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return query(sql, [id, ...Object.values(fields)]);
}

// ============================================================
// SEARCH FUNCTIONS (for link picker typeahead)
// ============================================================
export async function searchContacts(term) {
  const result = await query(
    `SELECT contact_id, full_name, email, phone_1, type FROM contacts
     WHERE full_name ILIKE $1 OR email ILIKE $1 OR phone_1 ILIKE $1
     ORDER BY full_name LIMIT 20`,
    [`%${term}%`]
  );
  return result.rows;
}

export async function searchCompanies(term) {
  const result = await query(
    `SELECT company_id, company_name, city FROM companies
     WHERE company_name ILIKE $1 OR city ILIKE $1
     ORDER BY company_name LIMIT 20`,
    [`%${term}%`]
  );
  return result.rows;
}

export async function searchProperties(term) {
  const result = await query(
    `SELECT property_id, property_address, property_name, city FROM properties
     WHERE property_address ILIKE $1 OR property_name ILIKE $1 OR city ILIKE $1
     ORDER BY property_address LIMIT 20`,
    [`%${term}%`]
  );
  return result.rows;
}

export async function searchDeals(term) {
  const result = await query(
    `SELECT deal_id, deal_name, deal_type, status FROM deals
     WHERE deal_name ILIKE $1 OR deal_type ILIKE $1
     ORDER BY deal_name LIMIT 20`,
    [`%${term}%`]
  );
  return result.rows;
}

// ============================================================
// CAMPAIGNS
// ============================================================
export async function getCampaigns({ limit = 200, offset = 0 } = {}) {
  return query('SELECT * FROM campaigns ORDER BY modified DESC LIMIT $1 OFFSET $2', [limit, offset]);
}

// ============================================================
// FORMULA COLUMNS
// ============================================================
export async function getFormulaColumns(tableName) {
  return query('SELECT * FROM formula_columns WHERE table_name = $1 ORDER BY created_at', [tableName]);
}

export async function createFormulaColumn(tableName, columnName, displayName, expression, columnType = 'text') {
  return query(
    `INSERT INTO formula_columns (table_name, column_name, display_name, expression, column_type)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [tableName, columnName, displayName, expression, columnType]
  );
}

// ============================================================
// UNDO LOG
// ============================================================
export async function logUndo(description, sqlExecuted, reverseSql, rowsAffected) {
  return query(
    `INSERT INTO undo_log (action_description, sql_executed, reverse_sql, rows_affected)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [description, sqlExecuted, reverseSql, rowsAffected]
  );
}

export async function executeUndo(undoId) {
  const result = await query('SELECT * FROM undo_log WHERE undo_id = $1 AND undone = FALSE', [undoId]);
  if (!result.rows.length) throw new Error('Nothing to undo');
  const undo = result.rows[0];
  await query(undo.reverse_sql);
  await query('UPDATE undo_log SET undone = TRUE WHERE undo_id = $1', [undoId]);
  return undo;
}

export async function getLastUndo() {
  return query('SELECT * FROM undo_log WHERE undone = FALSE ORDER BY executed_at DESC LIMIT 1');
}

// ============================================================
// NOTES
// ============================================================
const NOTE_FK_COLS = new Set(['contact_id', 'company_id', 'property_id', 'deal_id', 'interaction_id', 'campaign_id']);

export async function createNote(content, links = {}) {
  const id = (window.crypto || crypto).randomUUID();
  const cols = ['note_id', 'content'];
  const vals = [id, content];
  for (const [k, v] of Object.entries(links)) {
    if (!NOTE_FK_COLS.has(k)) throw new Error(`Invalid note link column: ${k}`);
    if (v) { cols.push(k); vals.push(v); }
  }
  const placeholders = vals.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO notes (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  return query(sql, vals);
}

export async function getNotesForEntity(entityType, entityId) {
  const colMap = {
    contact: 'contact_id', company: 'company_id', property: 'property_id',
    deal: 'deal_id', interaction: 'interaction_id', campaign: 'campaign_id',
  };
  const col = colMap[entityType];
  if (!col) throw new Error(`Invalid entity type: ${entityType}`);
  return query(`SELECT * FROM notes WHERE ${col} = $1 ORDER BY created_at DESC`, [entityId]);
}

export async function getAllNotes(limit = 200) {
  return query(`
    SELECT n.*,
      c.full_name AS contact_name,
      co.company_name,
      p.property_address,
      d.deal_name,
      i.type AS interaction_type,
      i.email_heading AS interaction_heading,
      ca.name AS campaign_name
    FROM notes n
    LEFT JOIN contacts c ON n.contact_id = c.contact_id
    LEFT JOIN companies co ON n.company_id = co.company_id
    LEFT JOIN properties p ON n.property_id = p.property_id
    LEFT JOIN deals d ON n.deal_id = d.deal_id
    LEFT JOIN interactions i ON n.interaction_id = i.interaction_id
    LEFT JOIN campaigns ca ON n.campaign_id = ca.campaign_id
    ORDER BY n.created_at DESC
    LIMIT $1
  `, [limit]);
}

export async function deleteNote(noteId) {
  return query('DELETE FROM notes WHERE note_id = $1', [noteId]);
}

// Migrate old notes columns into the notes table
export async function migrateOldNotes() {
  const migrations = [
    { table: 'contacts', fk: 'contact_id', col: 'notes' },
    { table: 'companies', fk: 'company_id', col: 'notes' },
    { table: 'properties', fk: 'property_id', col: 'notes' },
    { table: 'deals', fk: 'deal_id', col: 'notes' },
    { table: 'interactions', fk: 'interaction_id', col: 'notes' },
    { table: 'interactions', fk: 'interaction_id', col: 'follow_up_notes', prefix: '[Follow Up] ' },
    { table: 'campaigns', fk: 'campaign_id', col: 'notes' },
  ];
  let migrated = 0;
  for (const m of migrations) {
    const prefix = m.prefix || '';
    const res = await query(
      `SELECT ${m.fk}, ${m.col} FROM ${m.table} WHERE ${m.col} IS NOT NULL AND TRIM(${m.col}) != ''`
    );
    for (const row of (res.rows || [])) {
      const content = prefix + row[m.col];
      await createNote(content, { [m.fk]: row[m.fk] });
      migrated++;
    }
  }
  return { migrated };
}

// Drop old notes columns after migration
export async function dropOldNotesColumns() {
  const drops = [
    'ALTER TABLE contacts DROP COLUMN IF EXISTS notes',
    'ALTER TABLE companies DROP COLUMN IF EXISTS notes',
    'ALTER TABLE properties DROP COLUMN IF EXISTS notes',
    'ALTER TABLE deals DROP COLUMN IF EXISTS notes',
    'ALTER TABLE interactions DROP COLUMN IF EXISTS notes',
    'ALTER TABLE interactions DROP COLUMN IF EXISTS follow_up_notes',
    'ALTER TABLE campaigns DROP COLUMN IF EXISTS notes',
  ];
  for (const sql of drops) {
    await query(sql);
  }
  return { dropped: true };
}

// Ensure notes table has interaction_id and campaign_id FK columns
export async function ensureNotesFKColumns() {
  await query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS interaction_id UUID REFERENCES interactions(interaction_id)`);
  await query(`ALTER TABLE notes ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES campaigns(campaign_id)`);
  return { success: true };
}

// ============================================================
// TABLE COUNTS
// ============================================================
const ALLOWED_COUNT_TABLES = new Set(['properties', 'contacts', 'companies', 'deals', 'interactions', 'campaigns']);

export async function getTableCounts() {
  const tables = ['properties', 'contacts', 'companies', 'deals', 'interactions', 'campaigns'];
  const results = {};
  for (const t of tables) {
    if (!ALLOWED_COUNT_TABLES.has(t)) throw new Error(`Disallowed table: ${t}`);
    const r = await query(`SELECT COUNT(*) as count FROM ${t}`);
    results[t] = parseInt(r.rows[0].count, 10);
  }
  return results;
}
