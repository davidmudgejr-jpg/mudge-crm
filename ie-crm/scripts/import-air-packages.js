/**
 * import-air-packages.js — Import decrypted WAFPKG XML files into CRM
 *
 * Parses each .wafpkg.xml, extracts forms + field values, creates
 * contract_packages + contracts records in the database.
 *
 * Usage: node scripts/import-air-packages.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const PACKAGES_DIR = path.join(__dirname, '..', 'air-cre-data', 'packages');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

function extractFieldValues(xamlContent) {
  const values = {};
  const pattern = /(?:FieldRangeStart|DigitalSignatureBodyRangeStart)[^>]*AnnotationID="(\d+)"[^>]*\/>[\s\S]*?StyleName="FieldContentStyle"[^>]*Text="([^"]*)"/g;
  let match;
  while ((match = pattern.exec(xamlContent)) !== null) {
    const value = match[2].trim();
    if (value && value.trim().length > 0 && !/^\s+$/.test(value)) {
      values[match[1]] = value;
    }
  }
  return values;
}

function parseWafpkg(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const name = content.match(/<PackageInfo>[\s\S]*?<Name>([^<]+)<\/Name>/)?.[1] || path.basename(filePath, '.wafpkg.xml');
  const author = content.match(/<Author>([^<]+)<\/Author>/)?.[1] || 'david mudge';
  const status = content.match(/<PackageInfo>[\s\S]*?<Status>([^<]+)<\/Status>/)?.[1] || 'Draft';
  const created = content.match(/<CreatedDateTime>([^<]+)<\/CreatedDateTime>/)?.[1];

  const forms = [];
  const formPattern = /<AireaDocTemplate>([\s\S]*?)<\/AireaDocTemplate>/g;
  let formMatch;
  let order = 0;

  while ((formMatch = formPattern.exec(content)) !== null) {
    const formXml = formMatch[1];
    const formCode = formXml.match(/<FormCode>([^<]+)<\/FormCode>/)?.[1];
    const templateId = parseInt(formXml.match(/<AireaDocTemplateID>(\d+)<\/AireaDocTemplateID>/)?.[1] || '0');
    const formName = formXml.match(/<Name>([^<]+)<\/Name>/)?.[1] || formCode;
    const formStatus = formXml.match(/<Status>([^<]+)<\/Status>/)?.[1] || status;

    const encodedContent = formXml.match(/<Content>([\s\S]*?)<\/Content>/)?.[1] || '';
    const xamlContent = encodedContent
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');

    forms.push({
      formCode, templateId, name: formName, status: formStatus,
      fieldValues: extractFieldValues(xamlContent), order: order++,
    });
  }

  return { name, author, status, created, forms };
}

async function importPackages() {
  const files = fs.readdirSync(PACKAGES_DIR).filter(f => f.endsWith('.xml'));
  console.log('Found ' + files.length + ' packages to import\n');

  for (const file of files) {
    const filePath = path.join(PACKAGES_DIR, file);
    console.log('=== ' + file + ' ===');

    try {
      const pkg = parseWafpkg(filePath);
      console.log('  Name: ' + pkg.name);
      console.log('  Forms: ' + pkg.forms.map(f => f.formCode).join(' + '));

      // Find deal by searching package name in deal_name
      const searchName = pkg.name.split(' ').slice(0, 3).join(' ');
      const { rows: dealRows } = await pool.query(
        'SELECT deal_id FROM deals WHERE deal_name ILIKE $1 LIMIT 1',
        ['%' + searchName + '%']
      );

      let linkedDealId;
      if (dealRows.length > 0) {
        linkedDealId = dealRows[0].deal_id;
        console.log('  Linked to existing deal');
      } else {
        const { rows: newDeal } = await pool.query(
          "INSERT INTO deals (deal_name, status) VALUES ($1, 'Active') RETURNING deal_id",
          [pkg.name + ' (Imported)']
        );
        linkedDealId = newDeal[0].deal_id;
        console.log('  Created placeholder deal');
      }

      // Skip if already imported
      const { rows: existing } = await pool.query(
        'SELECT package_id FROM contract_packages WHERE name = $1', [pkg.name]
      );
      if (existing.length > 0) {
        console.log('  SKIPPED — already exists\n');
        continue;
      }

      // Create package
      const { rows: pkgRows } = await pool.query(
        'INSERT INTO contract_packages (deal_id, name, status, author) VALUES ($1, $2, $3, $4) RETURNING package_id',
        [linkedDealId, pkg.name, pkg.status, pkg.author]
      );
      const packageId = pkgRows[0].package_id;

      // Create forms
      for (const form of pkg.forms) {
        await pool.query(
          'INSERT INTO contracts (package_id, deal_id, form_code, template_id, name, status, field_values, strikeouts, author, form_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [packageId, linkedDealId, form.formCode, form.templateId, form.name, form.status,
           JSON.stringify(form.fieldValues), '{}', pkg.author, form.order]
        );
        console.log('  + ' + form.formCode + ': ' + Object.keys(form.fieldValues).length + ' field values');
      }

      console.log('  OK: package_id ' + packageId + '\n');
    } catch (err) {
      console.error('  ERROR: ' + err.message + '\n');
    }
  }

  await pool.end();
  console.log('Done.');
}

importPackages();
