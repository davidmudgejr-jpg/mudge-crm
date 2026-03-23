// Claude AI API — dynamic schema, web search, file attachments, citation handling

import { db, claude as claudeBridge } from './bridge';

// ── Schema cache ─────────────────────────────────────────────────
let _schemaCache = null;
let _schemaCacheTime = 0;
const SCHEMA_TTL = 60_000; // refresh every 60 seconds

export async function fetchSchema() {
  const now = Date.now();
  if (_schemaCache && now - _schemaCacheTime < SCHEMA_TTL) return _schemaCache;

  try {
    const schema = await db.schema();
    _schemaCache = schema;
    _schemaCacheTime = now;
    return schema;
  } catch {
    return _schemaCache || null;
  }
}

function formatSchemaForPrompt(schema) {
  if (!schema) return 'Schema unavailable — database not connected.';

  const lines = [];
  const tableNames = Object.keys(schema).sort();

  // Separate main tables from junction/system tables
  const junction = [];
  const system = [];
  const main = [];

  for (const t of tableNames) {
    if (t === 'undo_log' || t === 'formula_columns') system.push(t);
    else if (schema[t].columns.length <= 4 && t.includes('_')) junction.push(t);
    else main.push(t);
  }

  for (const t of main) {
    const info = schema[t];
    const cols = info.columns.map((c) => {
      let s = `${c.name} (${c.type}`;
      if (c.default?.includes('uuid') || c.default?.includes('gen_random')) s += ', PK';
      if (!c.nullable && !c.default) s += ', required';
      s += ')';
      return s;
    });
    lines.push(`${t.toUpperCase()} [~${info.rowCount} rows]: ${cols.join(', ')}`);
  }

  if (junction.length) {
    lines.push(`\nJunction tables: ${junction.join(', ')}`);
    for (const t of junction) {
      const cols = schema[t].columns.map((c) => c.name).join(', ');
      lines.push(`  ${t}: ${cols}`);
    }
  }

  if (system.length) {
    lines.push(`\nSystem tables: ${system.join(', ')}`);
  }

  return lines.join('\n');
}

// ── System prompt ────────────────────────────────────────────────
function buildSystemPrompt(schemaText, context = {}) {
  return `You are an AI assistant built into IE CRM, a commercial real estate database for the Inland Empire market. You have direct read and write access to a PostgreSQL database.

You can execute any SQL against the database. When the user gives you a command:
1. Explain in 1-2 sentences what you're going to do
2. Write the exact SQL to execute inside a \`\`\`sql code block
3. For write operations (UPDATE, INSERT, DELETE), also generate reverse SQL for undo in a separate block marked \`\`\`undo

DATABASE SCHEMA:
${schemaText}

${context.userName ? `CURRENT USER: ${context.userName} (team member of Leanne Associates)` : ''}
${context.currentTable ? `Current view: ${context.currentTable}` : ''}
${context.rowCount ? `Row count: ${context.rowCount}` : ''}

RULES:
- Be concise. Execute confidently. The user trusts you to act directly.
- For SELECT queries, just return the SQL. No undo needed.
- For UPDATE/INSERT/DELETE, always provide undo SQL.
- When creating formula columns, INSERT into formula_columns table with the SQL expression.
- Use ILIKE for text searches (case-insensitive).
- Prefer explicit column names over SELECT *.
- For tags, use array operators: tags @> ARRAY['tag'] to check, array_append(tags, 'tag') to add.
- Always include a row count estimate in your explanation.
- Know CRE terminology: RBA (rentable building area), PSF (price per square foot), FAR (floor area ratio), PLSF (price per land SF), holding period, cap rate, NNN lease, etc.
- For "holding period score": CASE WHEN holding_period_years > 15 THEN 'Hot' WHEN holding_period_years > 8 THEN 'Warm' ELSE 'Cold' END
- For commission estimates: last_sale_price * 0.02 (or whatever rate specified)
- For debt maturity urgency: debt_date - CURRENT_DATE
- Format dates nicely in results.
- When doing bulk updates, state the WHERE clause clearly so the user knows scope.
- If the user uploads a file, analyze its content and suggest relevant database operations.
- If you use web search results, cite your sources.`;
}

// ── Send message ─────────────────────────────────────────────────
export async function sendMessage(messages, context = {}, options = {}) {

  // Build dynamic system prompt with live schema
  const schema = await fetchSchema();
  const schemaText = formatSchemaForPrompt(schema);
  const systemPrompt = buildSystemPrompt(schemaText, context);

  // Build API messages with file attachments
  const apiMessages = messages.map((m) => {
    if (m.role === 'user' && m.attachments?.length) {
      const content = [];
      for (const att of m.attachments) {
        if (att.type === 'document') {
          content.push({
            type: 'document',
            source: { type: 'base64', media_type: att.mediaType, data: att.data },
          });
        } else if (att.type === 'image') {
          content.push({
            type: 'image',
            source: { type: 'base64', media_type: att.mediaType, data: att.data },
          });
        } else if (att.type === 'text') {
          content.push({
            type: 'text',
            text: `[File: ${att.fileName}]\n${att.text}`,
          });
        }
      }
      content.push({ type: 'text', text: m.content });
      return { role: 'user', content };
    }
    // Assistant messages — use rawContent (original API text) if available
    if (m.role === 'assistant') {
      return { role: 'assistant', content: m.rawContent || m.content };
    }
    return { role: m.role, content: m.content };
  });

  const result = await claudeBridge.chat(apiMessages, systemPrompt, {
    enableWebSearch: options.enableWebSearch ?? true,
  });

  return result;
}

// ── Parse response ───────────────────────────────────────────────
export function parseClaudeResponse(text) {
  if (!text) return { explanation: '', sql: null, undoSql: null, fullText: '', isWrite: false };

  const sqlMatch = text.match(/```sql\n([\s\S]*?)```/);
  const undoMatch = text.match(/```undo\n([\s\S]*?)```/);

  // Extract explanation (everything before the first code block)
  const explanation = text.split('```')[0].trim();

  return {
    explanation,
    sql: sqlMatch ? sqlMatch[1].trim() : null,
    undoSql: undoMatch ? undoMatch[1].trim() : null,
    fullText: text,
    isWrite: sqlMatch
      ? /^\s*(UPDATE|INSERT|DELETE|ALTER|CREATE|DROP)/i.test(sqlMatch[1].trim())
      : false,
  };
}

// ── Status ───────────────────────────────────────────────────────
export function getStatus() {
  return claudeBridge.status();
}

// ── Suggested commands ───────────────────────────────────────────
export const SUGGESTED_COMMANDS = [
  'Find properties where debt matures within 2 years',
  'Show me my top 20 targets in Fontana',
  'Mark all uncontacted Riverside owners as Priority 2',
  'Create a holding period score column',
  'Summarize my best opportunities this week',
  'Show contacts linked to Fontana properties over 20k SF',
  'Add a commission estimate column at 2% of last sale price',
  'Standardize all city names to proper case',
  'Find properties with no owner phone number',
  'Show me vacant industrial in San Bernardino',
];
