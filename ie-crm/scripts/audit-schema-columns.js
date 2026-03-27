const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'migrations');
const AUDIT_PATH = path.join(ROOT, 'docs', 'schema-column-audit.md');
const AUDIT_JSON_PATH = path.join(ROOT, 'docs', 'schema-column-audit.json');

const SCAN_DIRS = [
  path.join(ROOT, 'server'),
  path.join(ROOT, 'src'),
  path.join(ROOT, 'scripts'),
];

const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

const TABLE_LIKE = /^[a-z_][a-z0-9_]*$/i;
const SQL_START = /\b(select|insert|update|delete|with)\b/i;

function stripSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unquoteIdentifier(identifier) {
  return identifier
    .trim()
    .replace(/^"(.*)"$/, '$1')
    .replace(/^`(.*)`$/, '$1')
    .toLowerCase();
}

function normalizeTableIdentifier(identifier) {
  const raw = unquoteIdentifier(identifier);
  const parts = raw.split('.').filter(Boolean);
  return parts[parts.length - 1];
}

function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inDollar = null;

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next2 = sql.slice(i, i + 2);

    if (!inSingle && !inDouble && !inDollar && next2 === '--') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      current += ' ';
      continue;
    }

    if (!inSingle && !inDouble && !inDollar && next2 === '/*') {
      i += 2;
      while (i < sql.length && sql.slice(i, i + 2) !== '*/') i += 1;
      i += 1;
      current += ' ';
      continue;
    }

    if (!inDouble && !inDollar && ch === "'") {
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (!inSingle && !inDollar && ch === '"') {
      inDouble = !inDouble;
      current += ch;
      continue;
    }

    if (!inSingle && !inDouble && ch === '$') {
      const endIdx = sql.indexOf('$', i + 1);
      if (endIdx !== -1) {
        const tag = sql.slice(i, endIdx + 1);
        if (/^\$[a-zA-Z0-9_]*\$$/.test(tag)) {
          if (!inDollar) {
            inDollar = tag;
          } else if (inDollar === tag) {
            inDollar = null;
          }
          current += tag;
          i = endIdx;
          continue;
        }
      }
    }

    if (!inSingle && !inDouble && !inDollar && ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

function buildSchemaFromMigrations() {
  const tableColumns = new Map();
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const statements = splitStatements(content);

    for (const statementRaw of statements) {
      const statement = stripSqlComments(statementRaw);
      if (!statement) continue;

      const createMatch = statement.match(/create\s+table\s+(if\s+not\s+exists\s+)?([\w."`]+)/i);
      if (createMatch) {
        const tableName = normalizeTableIdentifier(createMatch[2]);
        if (!tableColumns.has(tableName)) tableColumns.set(tableName, new Set());

        const firstParen = statement.indexOf('(');
        const lastParen = statement.lastIndexOf(')');
        if (firstParen !== -1 && lastParen > firstParen) {
          const block = statement.slice(firstParen + 1, lastParen);
          for (const line of block.split(',')) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            const lowered = trimmed.toLowerCase();
            if (/^(constraint|primary\s+key|foreign\s+key|unique|check|exclude)\b/.test(lowered)) continue;
            const col = unquoteIdentifier(trimmed.split(/\s+/)[0]);
            if (TABLE_LIKE.test(col)) tableColumns.get(tableName).add(col);
          }
        }
        continue;
      }

      const addColumnMatch = statement.match(/alter\s+table\s+([\w."`]+)\s+add\s+column\s+(if\s+not\s+exists\s+)?([\w."`]+)/i);
      if (addColumnMatch) {
        const tableName = normalizeTableIdentifier(addColumnMatch[1]);
        const columnName = unquoteIdentifier(addColumnMatch[3]);
        if (!tableColumns.has(tableName)) tableColumns.set(tableName, new Set());
        tableColumns.get(tableName).add(columnName);
        continue;
      }

      const dropColumnMatch = statement.match(/alter\s+table\s+([\w."`]+)\s+drop\s+column\s+(if\s+exists\s+)?([\w."`]+)/i);
      if (dropColumnMatch) {
        const tableName = normalizeTableIdentifier(dropColumnMatch[1]);
        const columnName = unquoteIdentifier(dropColumnMatch[3]);
        if (tableColumns.has(tableName)) tableColumns.get(tableName).delete(columnName);
        continue;
      }

      const renameColumnMatch = statement.match(/alter\s+table\s+([\w."`]+)\s+rename\s+column\s+([\w."`]+)\s+to\s+([\w."`]+)/i);
      if (renameColumnMatch) {
        const tableName = normalizeTableIdentifier(renameColumnMatch[1]);
        const oldColumnName = unquoteIdentifier(renameColumnMatch[2]);
        const newColumnName = unquoteIdentifier(renameColumnMatch[3]);
        if (!tableColumns.has(tableName)) tableColumns.set(tableName, new Set());
        tableColumns.get(tableName).delete(oldColumnName);
        tableColumns.get(tableName).add(newColumnName);
      }
    }
  }

  return { tableColumns, migrationFiles };
}

function collectFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    if (SCAN_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function extractSqlBlocks(content) {
  const regex = /`([\s\S]*?)`/g;
  const blocks = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1];
    if (!SQL_START.test(raw)) continue;
    if (!/\b(from|join|insert\s+into|update)\b/i.test(raw)) continue;
    blocks.push({ sql: raw, index: match.index });
  }

  return blocks;
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split('\n').length;
}

function parseAliasMap(sql) {
  const aliasMap = new Map();
  const sourceRegex = /\b(from|join|update|insert\s+into)\s+(["`\w.]+)(?:\s+(?:as\s+)?(["`\w]+))?/gi;
  let match;

  while ((match = sourceRegex.exec(sql)) !== null) {
    const tableName = normalizeTableIdentifier(match[2]);
    if (!TABLE_LIKE.test(tableName)) continue;

    const aliasRaw = match[3] ? unquoteIdentifier(match[3]) : tableName;
    aliasMap.set(aliasRaw, tableName);
    aliasMap.set(tableName, tableName);
  }

  return aliasMap;
}

function findQualifiedReferences(sql) {
  const refs = [];
  const refRegex = /\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/gi;
  let match;
  while ((match = refRegex.exec(sql)) !== null) {
    refs.push({ qualifier: match[1].toLowerCase(), column: match[2].toLowerCase() });
  }
  return refs;
}

function auditSchemaReferences() {
  const { tableColumns, migrationFiles } = buildSchemaFromMigrations();
  const targets = SCAN_DIRS.flatMap(collectFiles);
  const problems = [];

  for (const filePath of targets) {
    const content = fs.readFileSync(filePath, 'utf8');
    const sqlBlocks = extractSqlBlocks(content);

    for (const block of sqlBlocks) {
      const sql = stripSqlComments(block.sql);
      const aliasMap = parseAliasMap(sql);
      const references = findQualifiedReferences(sql);
      const line = lineNumberAt(content, block.index);

      for (const ref of references) {
        if (['old', 'new', 'excluded'].includes(ref.qualifier)) continue;
        const tableName = aliasMap.get(ref.qualifier);
        if (!tableName) continue;

        const knownColumns = tableColumns.get(tableName);
        if (!knownColumns) {
          problems.push({
            type: 'unknown_table',
            filePath,
            line,
            tableName,
            qualifier: ref.qualifier,
            column: ref.column,
            sql,
          });
          continue;
        }

        if (!knownColumns.has(ref.column)) {
          problems.push({
            type: 'unknown_column',
            filePath,
            line,
            tableName,
            qualifier: ref.qualifier,
            column: ref.column,
            sql,
          });
        }
      }
    }
  }

  return {
    migrationFiles,
    tableCount: tableColumns.size,
    targetsScanned: targets.length,
    problems,
  };
}

function buildMarkdownReport(results) {
  const generatedAt = new Date().toISOString();
  const lines = [];
  lines.push('# Schema Column Audit');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push(`- Migrations processed: ${results.migrationFiles.length}`);
  lines.push(`- Tables discovered from migrations: ${results.tableCount}`);
  lines.push(`- Code files scanned for SQL template literals: ${results.targetsScanned}`);
  lines.push(`- Potential invalid qualified column references: ${results.problems.length}`);
  lines.push('');

  if (results.problems.length === 0) {
    lines.push('✅ No invalid qualified `table_or_alias.column` references were detected against migration history.');
    lines.push('');
    lines.push('> Note: this audit validates **qualified** references only. Unqualified columns are not statically attributable to a table.');
    return lines.join('\n');
  }

  const groupedByType = results.problems.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});

  const groupedByTable = results.problems.reduce((acc, item) => {
    acc[item.tableName] = (acc[item.tableName] || 0) + 1;
    return acc;
  }, {});

  const groupedByFile = results.problems.reduce((acc, item) => {
    const relPath = path.relative(ROOT, item.filePath);
    acc[relPath] = (acc[relPath] || 0) + 1;
    return acc;
  }, {});

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Unknown table references: ${groupedByType.unknown_table || 0}`);
  lines.push(`- Unknown column references: ${groupedByType.unknown_column || 0}`);
  lines.push('');

  lines.push('### Top files by finding count');
  lines.push('');
  Object.entries(groupedByFile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([file, count]) => {
      lines.push(`- \`${file}\`: ${count}`);
    });
  lines.push('');

  lines.push('### Top resolved tables by finding count');
  lines.push('');
  Object.entries(groupedByTable)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([table, count]) => {
      lines.push(`- \`${table}\`: ${count}`);
    });
  lines.push('');

  lines.push('## Findings (first 200)');
  lines.push('');

  for (const problem of results.problems.slice(0, 200)) {
    const relPath = path.relative(ROOT, problem.filePath);
    lines.push(`- **${problem.type}**: \`${problem.qualifier}.${problem.column}\` in \`${relPath}:${problem.line}\` (resolved table: \`${problem.tableName}\`).`);
  }
  if (results.problems.length > 200) {
    lines.push('');
    lines.push(`_Showing 200 of ${results.problems.length} findings. Full list is in \`docs/schema-column-audit.json\`._`);
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This audit is static and regex-based; dynamic SQL string assembly may evade detection.');
  lines.push('- False positives are possible in CTE-heavy SQL where aliases shadow table names unexpectedly.');

  return lines.join('\n');
}

function main() {
  const results = auditSchemaReferences();
  const report = buildMarkdownReport(results);

  fs.mkdirSync(path.dirname(AUDIT_PATH), { recursive: true });
  fs.writeFileSync(AUDIT_PATH, `${report}\n`);
  fs.writeFileSync(
    AUDIT_JSON_PATH,
    `${JSON.stringify({
      generatedAt: new Date().toISOString(),
      summary: {
        migrations: results.migrationFiles.length,
        tables: results.tableCount,
        filesScanned: results.targetsScanned,
        problems: results.problems.length,
      },
      problems: results.problems.map((p) => ({
        ...p,
        filePath: path.relative(ROOT, p.filePath),
      })),
    }, null, 2)}\n`
  );

  console.log(`[schema-audit] Wrote report: ${path.relative(ROOT, AUDIT_PATH)}`);
  console.log(`[schema-audit] Wrote JSON: ${path.relative(ROOT, AUDIT_JSON_PATH)}`);
  console.log(`[schema-audit] Problems found: ${results.problems.length}`);

  if (results.problems.length > 0 && process.argv.includes('--strict')) {
    process.exitCode = 1;
  }
}

main();
