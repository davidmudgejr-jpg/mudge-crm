#!/usr/bin/env node
/**
 * parse-air-templates.js
 *
 * Extracts AIR CRE form templates from the decrypted MasterForms XML
 * into lightweight per-form JSON files for the Contracts module.
 *
 * Run once: node scripts/parse-air-templates.js
 * Output:   air-cre-data/parsed/{FormCode}.json + index.json
 */

const fs = require('fs');
const path = require('path');

// Target form codes for v1
const TARGET_FORMS = new Set([
  'OFA',   // Commercial/Industrial Purchase (Improved)
  'OFAL',  // Vacant Land Purchase
  'STN',   // Single Tenant Net Lease
  'STG',   // Single Tenant Gross Lease
  'MTN',   // Multi-Tenant Net Lease
  'MTG',   // Multi-Tenant Gross Lease
  'BBE',   // Buyer-Broker Exclusive Rep
  'OA',    // Exclusive Right to Represent Owner
  'AD',    // Agency Disclosure
  'ATL',   // Amendment to Lease
  'ATPA',  // Amendment to Purchase Agreement
]);

const INPUT_PATH = path.join(__dirname, '..', 'air-cre-data', 'MasterForms_California.xml');
const OUTPUT_DIR = path.join(__dirname, '..', 'air-cre-data', 'parsed');

// Simple XML text extraction helpers (no heavy XML parser needed)
function getTagContent(xml, tagName) {
  const re = new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`);
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}

// Extract all AireaDocTemplate blocks from the master forms XML
function extractTemplates(xml) {
  const templates = [];
  const re = /<AireaDocTemplate>([\s\S]*?)<\/AireaDocTemplate>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[1];
    const formCode = getTagContent(block, 'FormCode');
    if (!TARGET_FORMS.has(formCode)) continue;

    const templateId = parseInt(getTagContent(block, 'AireaDocTemplateID'), 10);
    const name = getTagContent(block, 'Name');
    const description = getTagContent(block, 'Description');
    const keywords = getTagContent(block, 'KeyWords');
    const revisionDate = getTagContent(block, 'RevisionDate');
    const revisionVersion = getTagContent(block, 'RevisionVersion');
    const category = getTagContent(block, 'Category');
    const credits = parseInt(getTagContent(block, 'Credits'), 10);

    // Content is HTML-encoded XAML
    const contentMatch = block.match(/<Content>([\s\S]*?)<\/Content>/);
    let xamlContent = '';
    if (contentMatch) {
      xamlContent = decodeHtmlEntities(contentMatch[1].trim());
    }

    // Extract field definitions from the XAML
    const fields = extractFields(xamlContent);

    templates.push({
      formCode,
      templateId,
      name,
      description,
      keywords,
      revisionDate: revisionDate.split('T')[0],
      revisionVersion,
      category,
      credits,
      fieldCount: fields.length,
      fields,
      xamlContent,
    });

    console.log(`  [${formCode}] ${name} — ${fields.length} fields, ${Math.round(xamlContent.length / 1024)}KB XAML`);
  }
  return templates;
}

// Decode HTML entities
function decodeHtmlEntities(str) {
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Extract field definitions from Telerik XAML
function extractFields(xaml) {
  const fields = [];
  const seen = new Set();

  // Match custom1:FieldRangeStart elements (text/checkbox fields)
  const fieldRe = /<custom1:FieldRangeStart\s+([^>]*?)\/?\s*>/g;
  let match;
  while ((match = fieldRe.exec(xaml)) !== null) {
    const attrs = parseAttributes(match[1]);
    const annotationId = parseInt(attrs.AnnotationID, 10);
    const key = String(annotationId);
    if (seen.has(key)) continue;
    seen.add(key);

    fields.push({
      annotationId,
      name: attrs.Name || '',
      fieldTypeId: parseInt(attrs.FieldTypeID || '0', 10),
      dataType: parseInt(attrs.FieldDataType || '0', 10),
      isRequired: attrs.IsRequired === 'True',
      isLinked: attrs.IsLinked === 'True',
      section: attrs.SectionName || '',
      minLength: parseInt(attrs.MinLength || '0', 10),
    });
  }

  // Match DigitalSignatureBodyRangeStart (signature fields)
  const sigRe = /<custom1:DigitalSignatureBodyRangeStart\s+([^>]*?)\/?\s*>/g;
  while ((match = sigRe.exec(xaml)) !== null) {
    const attrs = parseAttributes(match[1]);
    const annotationId = parseInt(attrs.AnnotationID, 10);
    const key = `sig-${annotationId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    fields.push({
      annotationId,
      name: attrs.Name || '',
      fieldTypeId: 0,
      dataType: 99, // signature
      isRequired: attrs.IsRequired === 'True',
      isLinked: false,
      section: 'Signatures',
      role: attrs.Role || '',
      signatureType: attrs.SignatureType || '',
    });
  }

  // Match DigitalSignatureFooterRangeStart (footer initials)
  const footSigRe = /<custom1:DigitalSignatureFooterRangeStart\s+([^>]*?)\/?\s*>/g;
  while ((match = footSigRe.exec(xaml)) !== null) {
    const attrs = parseAttributes(match[1]);
    const annotationId = parseInt(attrs.AnnotationID, 10);
    const key = `footsig-${annotationId}`;
    if (seen.has(key)) continue;
    seen.add(key);

    fields.push({
      annotationId,
      name: attrs.Name || '',
      fieldTypeId: 0,
      dataType: 98, // footer signature/initial
      isRequired: attrs.IsRequired === 'True',
      isLinked: false,
      section: 'Footer Signatures',
      role: attrs.Role || '',
      signatureType: attrs.SignatureType || '',
    });
  }

  return fields;
}

// Parse XML attributes from a string like 'Key1="Val1" Key2="Val2"'
function parseAttributes(attrStr) {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = re.exec(attrStr)) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

// Main
function main() {
  console.log('AIR CRE Template Parser');
  console.log('=======================\n');

  if (!fs.existsSync(INPUT_PATH)) {
    console.error('Master forms not found at: ' + INPUT_PATH);
    console.error('Run the decrypter first to generate this file.');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Reading ' + INPUT_PATH + '...');
  const xml = fs.readFileSync(INPUT_PATH, 'utf-8');
  console.log('  ' + Math.round(xml.length / 1024 / 1024) + 'MB read\n');

  console.log('Extracting ' + TARGET_FORMS.size + ' target forms:\n');
  const templates = extractTemplates(xml);

  if (templates.length === 0) {
    console.error('\nNo matching templates found! Check form codes.');
    process.exit(1);
  }

  console.log('\nWriting ' + templates.length + ' parsed templates to ' + OUTPUT_DIR + '/\n');
  const catalog = [];

  for (const t of templates) {
    const outPath = path.join(OUTPUT_DIR, t.formCode + '.json');
    fs.writeFileSync(outPath, JSON.stringify(t, null, 2));
    const sizeKB = Math.round(fs.statSync(outPath).size / 1024);
    console.log('  ' + t.formCode + '.json (' + sizeKB + 'KB)');

    catalog.push({
      formCode: t.formCode,
      templateId: t.templateId,
      name: t.name,
      description: t.description,
      category: t.category,
      revisionDate: t.revisionDate,
      revisionVersion: t.revisionVersion,
      fieldCount: t.fieldCount,
      credits: t.credits,
    });
  }

  const indexPath = path.join(OUTPUT_DIR, 'index.json');
  fs.writeFileSync(indexPath, JSON.stringify(catalog, null, 2));
  console.log('\n  index.json (catalog of ' + catalog.length + ' forms)');
  console.log('\nDone! Templates ready for the Contracts module.');
}

main();
