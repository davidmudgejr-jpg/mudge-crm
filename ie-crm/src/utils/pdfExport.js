// PDF export utility — Apple-inspired card layout with CRM accent colors

import { query } from '../api/database';
import { LINKED_EXPORT_FIELDS } from '../config/exportFields';

// ── HTML escape ─────────────────────────────────────────────────────
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Value formatters ────────────────────────────────────────────────
function formatValue(val, format) {
  if (val == null || val === '') return null;
  switch (format) {
    case 'currency': {
      const n = Number(val);
      return isNaN(n) ? String(val) : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    case 'date': {
      const d = new Date(val);
      return isNaN(d) ? String(val) : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    }
    case 'number': {
      const n = Number(val);
      return isNaN(n) ? String(val) : n.toLocaleString();
    }
    case 'bool':
      return val === true || val === 'true' || val === 't' ? 'Yes' : 'No';
    case 'tags':
      return Array.isArray(val) ? val.join(', ') : String(val);
    default:
      return Array.isArray(val) ? val.join(', ') : String(val);
  }
}

// ── Fetch full records by IDs ───────────────────────────────────────
export async function fetchFullRecords(table, idColumn, ids) {
  if (!ids || ids.length === 0) return {};
  const result = await query(
    `SELECT * FROM ${table} WHERE ${idColumn} = ANY($1)`,
    [ids]
  );
  const map = {};
  for (const row of result.rows || result) {
    map[row[idColumn]] = row;
  }
  return map;
}

// ── Design tokens ───────────────────────────────────────────────────
const PHOTO_FIELDS = new Set(['photo_url', 'building_image_path']);

// Entity chip colors (matching CRM's dark-mode chips, adapted for light PDF)
const CHIP_COLORS = {
  contacts:   { bg: '#F3EAFC', color: '#7C3AED', border: '#E0D0F5' },
  companies:  { bg: '#FEF9E7', color: '#92400E', border: '#FDE68A' },
  properties: { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  deals:      { bg: '#FFF7ED', color: '#C2410C', border: '#FED7AA' },
  campaigns:  { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0' },
};

// ── Build card HTML for one record ──────────────────────────────────
function buildCard(row, primaryFields, linkedConfig, linkedRecordMaps, titleKey, cardIndex) {
  const titleVal = row[titleKey] || 'Untitled';
  const p = [];

  const photoField = primaryFields.find(f => PHOTO_FIELDS.has(f.key));
  const photoUrl = photoField ? row[photoField.key] : null;

  // Card wrapper — white card with soft shadow + rounded corners
  p.push(`<div style="
    background: #ffffff;
    border-radius: 14px;
    margin-bottom: 20px;
    page-break-inside: avoid;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04);
  ">`);

  // ─── Card header: gradient bar + title (+ optional photo) ───
  p.push(`<div style="
    background: linear-gradient(135deg, #1a1a2e 0%, #2d2b55 100%);
    padding: ${photoUrl ? '16px 22px' : '18px 22px'};
    display: flex;
    align-items: center;
    gap: 16px;
  ">`);

  if (photoUrl) {
    p.push(`<img src="${esc(photoUrl)}" style="
      width: 140px; height: 95px;
      object-fit: cover;
      border-radius: 10px;
      border: 2px solid rgba(255,255,255,0.15);
    " />`);
  }

  p.push(`<div>`);
  p.push(`<div style="font-size: 17px; font-weight: 700; color: #ffffff; letter-spacing: -0.2px;">${esc(titleVal)}</div>`);
  // Subtitle: first non-null field value as context
  const subtitleField = primaryFields.find(f => f.key !== titleKey && !PHOTO_FIELDS.has(f.key) && formatValue(row[f.key], f.format) !== null);
  if (subtitleField) {
    p.push(`<div style="font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 3px;">${esc(subtitleField.label)}: ${esc(formatValue(row[subtitleField.key], subtitleField.format))}</div>`);
  }
  p.push(`</div>`);
  p.push(`</div>`);

  // ─── Primary fields: 2-column key:value grid ───
  const fieldPairs = primaryFields
    .filter(f => f.key !== titleKey && !PHOTO_FIELDS.has(f.key) && f !== subtitleField)
    .map(f => ({ label: f.label, value: formatValue(row[f.key], f.format) }))
    .filter(pair => pair.value !== null);

  if (fieldPairs.length > 0) {
    p.push(`<div style="padding: 16px 22px 12px 22px;">`);
    p.push(`<table style="width: 100%; border-collapse: collapse;"><tbody>`);
    for (let i = 0; i < fieldPairs.length; i += 2) {
      p.push(`<tr>`);
      // Left pair
      p.push(`<td style="padding: 5px 0; width: 14%; vertical-align: top;">
        <span style="font-size: 8.5px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px;">${esc(fieldPairs[i].label)}</span>
      </td>`);
      p.push(`<td style="padding: 5px 16px 5px 0; width: 36%; vertical-align: top;">
        <span style="font-size: 11px; color: #1f2937; font-weight: 500;">${esc(fieldPairs[i].value)}</span>
      </td>`);
      // Right pair
      if (i + 1 < fieldPairs.length) {
        p.push(`<td style="padding: 5px 0; width: 14%; vertical-align: top;">
          <span style="font-size: 8.5px; font-weight: 600; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px;">${esc(fieldPairs[i + 1].label)}</span>
        </td>`);
        p.push(`<td style="padding: 5px 0; width: 36%; vertical-align: top;">
          <span style="font-size: 11px; color: #1f2937; font-weight: 500;">${esc(fieldPairs[i + 1].value)}</span>
        </td>`);
      } else {
        p.push(`<td></td><td></td>`);
      }
      p.push(`</tr>`);
    }
    p.push(`</tbody></table>`);
    p.push(`</div>`);
  }

  // ─── Linked record sections with colored pills ───
  for (const { entityType, fields, linkedKey } of linkedConfig) {
    const meta = LINKED_EXPORT_FIELDS[entityType];
    if (!meta) continue;
    const linkedItems = row[linkedKey] || [];
    if (linkedItems.length === 0) continue;

    const recordMap = linkedRecordMaps[entityType] || {};
    const chip = CHIP_COLORS[entityType] || CHIP_COLORS.contacts;
    const renderedItems = [];

    for (const item of linkedItems) {
      const fullRecord = recordMap[item[meta.idField] || item.id];
      if (!fullRecord) continue;

      const vals = fields
        .map(f => ({ label: f.label, value: formatValue(fullRecord[f.key], f.format) }))
        .filter(v => v.value !== null);

      if (vals.length > 0) renderedItems.push(vals);
    }

    if (renderedItems.length === 0) continue;

    p.push(`<div style="padding: 0 22px 16px 22px;">`);
    // Section header
    p.push(`<div style="
      font-size: 9px; font-weight: 700; color: ${chip.color};
      text-transform: uppercase; letter-spacing: 1.2px;
      margin-bottom: 8px; padding-top: 10px;
      border-top: 1px solid #f3f4f6;
    ">${esc(meta.label)}</div>`);

    // Each linked record as a pill row
    for (const vals of renderedItems) {
      p.push(`<div style="
        display: inline-flex; align-items: center; gap: 6px;
        background: ${chip.bg}; border: 1px solid ${chip.border};
        border-radius: 8px; padding: 5px 10px; margin: 0 6px 6px 0;
        font-size: 10px; color: ${chip.color};
      ">`);
      p.push(vals.map(v =>
        `<span><strong style="font-weight: 600;">${esc(v.value)}</strong></span>`
      ).join(`<span style="color: ${chip.border}; margin: 0 2px;">&middot;</span>`));
      p.push(`</div>`);
    }
    p.push(`</div>`);
  }

  p.push(`</div>`); // close card
  return p.join('\n');
}

// ── Build full PDF HTML ─────────────────────────────────────────────
export function buildCardPdfHtml({ title, selectedRows, primaryFields, linkedConfig, linkedRecordMaps, logoUrl, date, titleKey }) {
  const dateStr = date || new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const p = [
    `<div id="pdf-export-root" style="
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;
      padding: 32px 36px;
      background: linear-gradient(180deg, #f8f9fb 0%, #f0f1f4 100%);
      color: #1f2937;
      min-height: 100%;
    ">`,
  ];

  // ─── Header: logo + title ───
  p.push(`<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">`);
  p.push(`<div style="display: flex; align-items: center; gap: 18px;">`);
  if (logoUrl) {
    p.push(`<img src="${esc(logoUrl)}" style="height: 48px; object-fit: contain;" />`);
  }
  p.push(`<div>`);
  p.push(`<div style="font-size: 26px; font-weight: 800; color: #1a1a2e; letter-spacing: -0.5px;">${esc(title)}</div>`);
  p.push(`<div style="font-size: 12px; color: #9ca3af; font-weight: 500; margin-top: 2px;">${esc(dateStr)}</div>`);
  p.push(`</div>`);
  p.push(`</div>`);
  // Record count badge
  p.push(`<div style="
    background: linear-gradient(135deg, #007AFF, #AF52DE);
    color: white; font-size: 11px; font-weight: 700;
    padding: 6px 14px; border-radius: 20px;
    letter-spacing: 0.3px;
  ">${selectedRows.length} Record${selectedRows.length !== 1 ? 's' : ''}</div>`);
  p.push(`</div>`);

  // Accent divider (Lee & Associates red → CRM gradient)
  p.push(`<div style="
    height: 3px; border-radius: 2px; margin-bottom: 24px;
    background: linear-gradient(90deg, #c7191a 0%, #007AFF 50%, #AF52DE 100%);
  "></div>`);

  // ─── Cards ───
  for (let i = 0; i < selectedRows.length; i++) {
    p.push(buildCard(selectedRows[i], primaryFields, linkedConfig, linkedRecordMaps, titleKey, i));
  }

  // ─── Footer ───
  p.push(`<div style="
    margin-top: 12px; padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    display: flex; justify-content: space-between; align-items: center;
  ">`);
  p.push(`<div style="font-size: 8px; color: #9ca3af;">Lee &amp; Associates — Commercial Real Estate Services</div>`);
  p.push(`<div style="font-size: 8px; color: #9ca3af;">${selectedRows.length} record${selectedRows.length !== 1 ? 's' : ''} exported &middot; ${esc(dateStr)}</div>`);
  p.push(`</div>`);

  p.push(`</div>`);
  return p.join('\n');
}

// ── Generate PDF ────────────────────────────────────────────────────
export async function generatePdf(htmlString, filename = 'export.pdf') {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '800px';
  container.insertAdjacentHTML('afterbegin', htmlString);
  document.body.appendChild(container);

  try {
    const { default: html2pdf } = await import('html2pdf.js');
    const element = container.querySelector('#pdf-export-root');

    await html2pdf()
      .set({
        margin: [12, 12, 12, 12],
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css'] },
      })
      .from(element)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
