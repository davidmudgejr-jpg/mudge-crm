// PDF export utility — builds HTML table from CRM data and generates PDF via html2pdf.js

import { query } from '../api/database';
import { LINKED_EXPORT_FIELDS } from '../config/exportFields';

// ── HTML escape (prevent XSS from user-entered data) ────────────────
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
  if (val == null || val === '') return '—';
  switch (format) {
    case 'currency': {
      const n = Number(val);
      return isNaN(n) ? val : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    }
    case 'date': {
      const d = new Date(val);
      return isNaN(d) ? val : d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    }
    case 'number': {
      const n = Number(val);
      return isNaN(n) ? val : n.toLocaleString();
    }
    case 'bool':
      return val === true || val === 'true' || val === 't' ? 'Yes' : 'No';
    case 'tags':
      return Array.isArray(val) ? val.join(', ') : val;
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

// ── Build data matrix ───────────────────────────────────────────────
// Returns { columns: [{key, label, format}], dataRows: [[val, val, ...]] }
export function buildDataMatrix(selectedRows, primaryFields, linkedConfig, linkedRecordMaps) {
  // Primary columns
  const columns = primaryFields.map(f => ({ key: f.key, label: f.label, format: f.format }));

  // Linked columns (prefixed with entity label)
  for (const { entityType, fields } of linkedConfig) {
    const meta = LINKED_EXPORT_FIELDS[entityType];
    if (!meta) continue;
    for (const f of fields) {
      columns.push({
        key: `linked_${entityType}_${f.key}`,
        label: `${meta.label}: ${f.label}`,
        format: f.format,
      });
    }
  }

  // Build rows
  const dataRows = selectedRows.map(row => {
    const cells = primaryFields.map(f => formatValue(row[f.key], f.format));

    // Linked values — comma-separate when multiple
    for (const { entityType, fields, linkedKey } of linkedConfig) {
      const meta = LINKED_EXPORT_FIELDS[entityType];
      if (!meta) {
        fields.forEach(() => cells.push('—'));
        continue;
      }
      const linkedItems = row[linkedKey] || [];
      const recordMap = linkedRecordMaps[entityType] || {};

      for (const f of fields) {
        const values = linkedItems
          .map(item => {
            const fullRecord = recordMap[item[meta.idField] || item.id];
            return fullRecord ? formatValue(fullRecord[f.key], f.format) : null;
          })
          .filter(v => v && v !== '—');
        cells.push(values.length > 0 ? values.join(', ') : '—');
      }
    }

    return cells;
  });

  return { columns, dataRows };
}

// ── Build PDF HTML ──────────────────────────────────────────────────
export function buildPdfHtml({ title, columns, dataRows, logoUrl, date }) {
  const dateStr = date || new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const thCells = columns.map(c =>
    `<th style="background:#f3f4f6;padding:6px 8px;border:1px solid #d1d5db;font-size:9px;font-weight:600;color:#374151;text-align:left;white-space:nowrap;">${esc(c.label)}</th>`
  ).join('');

  const bodyRows = dataRows.map((row, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
    const tds = row.map(val =>
      `<td style="background:${bg};padding:5px 8px;border:1px solid #e5e7eb;font-size:9px;color:#1f2937;max-width:200px;overflow:hidden;text-overflow:ellipsis;">${esc(val)}</td>`
    ).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  const parts = [
    '<div id="pdf-export-root" style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;padding:24px;background:white;color:#1a1a1a;">',
  ];

  if (logoUrl) {
    parts.push(`<div style="display:flex;align-items:center;gap:16px;margin-bottom:8px;">`);
    parts.push(`<img src="${esc(logoUrl)}" style="height:48px;object-fit:contain;" />`);
    parts.push(`<div>`);
    parts.push(`<div style="font-size:20px;font-weight:700;color:#1a1a1a;">${esc(title)}</div>`);
    parts.push(`<div style="font-size:12px;color:#666;">${esc(dateStr)}</div>`);
    parts.push(`</div></div>`);
  } else {
    parts.push(`<div style="margin-bottom:8px;">`);
    parts.push(`<div style="font-size:20px;font-weight:700;color:#1a1a1a;">${esc(title)}</div>`);
    parts.push(`<div style="font-size:12px;color:#666;">${esc(dateStr)}</div>`);
    parts.push(`</div>`);
  }

  parts.push(`<div style="border-bottom:2px solid #e5e7eb;margin-bottom:12px;"></div>`);
  parts.push(`<table style="width:100%;border-collapse:collapse;table-layout:auto;">`);
  parts.push(`<thead><tr>${thCells}</tr></thead>`);
  parts.push(`<tbody>${bodyRows}</tbody>`);
  parts.push(`</table>`);
  parts.push(`<div style="margin-top:16px;font-size:8px;color:#9ca3af;text-align:right;">`);
  parts.push(`${dataRows.length} record${dataRows.length !== 1 ? 's' : ''} exported`);
  parts.push(`</div></div>`);

  return parts.join('\n');
}

// ── Generate PDF ────────────────────────────────────────────────────
export async function generatePdf(htmlString, filename = 'export.pdf') {
  // Render HTML into an off-screen container using safe DOM methods
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-9999px';
  container.style.top = '0';
  // Safe: htmlString is built entirely by buildPdfHtml() from escaped values
  container.insertAdjacentHTML('afterbegin', htmlString);
  document.body.appendChild(container);

  try {
    const { default: html2pdf } = await import('html2pdf.js');
    const element = container.querySelector('#pdf-export-root');

    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
        pagebreak: { mode: 'avoid-all' },
      })
      .from(element)
      .save();
  } finally {
    document.body.removeChild(container);
  }
}
