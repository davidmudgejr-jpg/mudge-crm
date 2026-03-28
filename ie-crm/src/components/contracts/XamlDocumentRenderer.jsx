/**
 * XamlDocumentRenderer.jsx
 *
 * Converts Telerik RadDocument XAML into an interactive HTML document
 * with editable fields for AIR CRE contracts.
 *
 * The renderer parses XAML as XML using DOMParser, then recursively
 * walks the tree producing React elements. Editable fields (marked by
 * FieldRangeStart/End) become contentEditable spans or checkboxes.
 */

import React, { useMemo, useCallback, useRef, useState, useEffect } from 'react';
import './contracts.css';

// Style name → CSS class mapping
const PARA_STYLE_MAP = {
  // Indent levels
  Level1Paragraph: 'air-indent-1', 'L1Par': 'air-indent-1', 'L1ParNoSpace': 'air-indent-1',
  Level2Paragraph: 'air-indent-2', 'L2Par': 'air-indent-2', 'L2ParNoSpace': 'air-indent-2',
  Level3Paragraph: 'air-indent-3', 'L3Par': 'air-indent-3', 'L3ParNoSpace': 'air-indent-3',
  Level4Paragraph: 'air-indent-4', 'L4Par': 'air-indent-4',
  Level5Paragraph: 'air-indent-5', 'L5Par': 'air-indent-5',
  Level6Paragraph: 'air-indent-6', 'L6Par': 'air-indent-6',
  Level7Paragraph: 'air-indent-7', 'L7Par': 'air-indent-7',
  // Spaced variants
  L0ParWithSpace: 'air-para-spaced',
  L1ParWithSpace: 'air-indent-1 air-para-spaced',
  L2ParWithSpace: 'air-indent-2 air-para-spaced',
  L3ParWithSpace: 'air-indent-3 air-para-spaced',
  L4ParWithSpace: 'air-indent-4 air-para-spaced',
  L5ParWithSpace: 'air-indent-5 air-para-spaced',
  L6ParWithSpace: 'air-indent-6 air-para-spaced',
  L7ParWithSpace: 'air-indent-7 air-para-spaced',
  // Alignment
  HeaderPar: 'air-align-center',
  // Footer
  Footer2TabsPar: '',
  Footer3TabsPar: '',
};

/**
 * Parse XAML string into a navigable DOM tree.
 */
/**
 * Determine if the quote at position `pos` in `str` closes an XML attribute value.
 * A " is a closing delimiter only if the next non-whitespace is:
 *   /  (self-closing tag)
 *   >  (tag close)
 *   an attribute name followed by = (next attribute)
 * Otherwise the " is a literal quote inside the value (AIR CRE XAML convention).
 */
function isClosingQuote(str, pos) {
  let j = pos + 1;
  while (j < str.length && (str[j] === ' ' || str[j] === '\t' || str[j] === '\r' || str[j] === '\n')) j++;
  if (j >= str.length) return true;
  const ch = str[j];
  if (ch === '/' || ch === '>') return true;
  if (/[a-zA-Z_]/.test(ch)) {
    let k = j;
    while (k < str.length && /[\w:.]/.test(str[k])) k++;
    if (str[k] === '=') return true;
  }
  return false;
}

/**
 * Sanitize AIR CRE XAML so it parses as standard XML.
 *
 * AIR CRE's .NET XAML serializer writes literal " inside attribute values
 * without XML-escaping (e.g. Text=", ("Buyer")"). Standard XML requires
 * &quot; for quotes inside attribute values. This walker escapes any " that
 * isn't a true attribute delimiter, using context (what follows) to decide.
 */
function sanitizeXamlForXml(xaml) {
  let out = '';
  let i = 0;
  while (i < xaml.length) {
    if (xaml[i] === '=' && xaml[i + 1] === '"') {
      out += '="';
      i += 2;
      while (i < xaml.length) {
        if (xaml[i] === '"') {
          if (isClosingQuote(xaml, i)) {
            out += '"';
            i++;
            break;
          } else {
            out += '&quot;';
            i++;
          }
        } else {
          out += xaml[i];
          i++;
        }
      }
    } else {
      out += xaml[i];
      i++;
    }
  }
  return out;
}

function parseXaml(xamlString) {
  const sanitized = sanitizeXamlForXml(xamlString);
  const parser = new DOMParser();
  const doc = parser.parseFromString(sanitized, 'text/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.warn('XAML parse error:', parseError.textContent?.substring(0, 200));
    return null;
  }
  return doc.documentElement;
}

/**
 * Get the local name of an XML node (strip namespace prefix).
 */
function localName(node) {
  return node.localName || node.nodeName?.split(':').pop() || '';
}

/**
 * Get full prefixed name for custom elements.
 */
function fullName(node) {
  return node.nodeName || '';
}

/**
 * Main renderer component.
 *
 * Props:
 *   xamlContent   — raw XAML string from parsed template
 *   fieldValues   — { [annotationId]: value } object
 *   onFieldChange — (annotationId, newValue) => void
 *   editable      — whether fields can be edited (false for Final/export)
 *   zoom          — scale factor (0.35–1.0, default 0.5 for 2-up spread)
 */
export default function XamlDocumentRenderer({ xamlContent, fieldValues = {}, onFieldChange, editable = true, zoom = 0.5 }) {
  const docRef = useRef(null);

  // Page dimensions at full size (8.5in × 11in at 96dpi)
  const PAGE_W = 816; // 8.5 * 96
  const PAGE_H = 1056; // 11 * 96

  // Parse XAML once (memoized)
  const xmlRoot = useMemo(() => {
    if (!xamlContent) return null;
    return parseXaml(xamlContent);
  }, [xamlContent]);

  const handleFieldBlur = useCallback((annotationId, e) => {
    const newValue = e.target.textContent?.trim() || '';
    if (onFieldChange) {
      onFieldChange(String(annotationId), newValue);
    }
  }, [onFieldChange]);

  const handleCheckboxChange = useCallback((annotationId, e) => {
    if (onFieldChange) {
      onFieldChange(String(annotationId), String(e.target.checked));
    }
  }, [onFieldChange]);

  if (!xmlRoot) {
    return <div className="text-crm-muted p-8 text-center">No document content to display</div>;
  }

  // Continuous scroll with zoom — scale the content and adjust the outer
  // wrapper's height so the scrollbar reflects the visual (scaled) size.
  const contentRef = useRef(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    const measure = () => setContentHeight(contentRef.current.scrollHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [xmlRoot, fieldValues]);

  const scaledHeight = contentHeight * zoom;

  return (
    <div className="air-zoom-outer" style={{ height: scaledHeight || 'auto', position: 'relative' }}>
      <div
        ref={(el) => { contentRef.current = el; docRef.current = el; }}
        className="air-document"
        id="air-document-root"
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'top center',
          position: 'absolute',
          left: '50%',
          marginLeft: `${-PAGE_W / 2}px`,
        }}
      >
        {renderNode(xmlRoot, { fieldValues, onFieldBlur: handleFieldBlur, onCheckboxChange: handleCheckboxChange, editable, key: 'root' })}
      </div>
    </div>
  );
}

/**
 * Recursively render an XML node as React elements.
 */
function renderNode(node, ctx, index = 0) {
  if (!node) return null;
  if (node.nodeType === 3) return null; // text nodes handled via Text attribute

  const name = localName(node);
  const full = fullName(node);
  const key = `${ctx.key}-${index}`;

  // Skip non-visual elements
  if (name === 'Captions' || name === 'ProtectionSettings' || name === 'Styles' ||
      name === 'RadDocument.Captions' || name === 'RadDocument.ProtectionSettings' ||
      name === 'RadDocument.Styles' || name === 'CaptionDefinition' ||
      name === 'Section.OriginalProperties' || name === 'RevisionInfo' ||
      name === 'Section.RevisionInfo' || name === 'Paragraph.ParagraphSymbolPropertiesStyle' ||
      name === 'ParagraphSymbolPropertiesStyle' || name === 'Header.WatermarkSettings' ||
      name === 'Table.TableLook' || name === 'TableLook') {
    return null;
  }

  // RadDocument — root wrapper
  if (name === 'RadDocument') {
    // Check if this is a nested RadDocument (in header/footer)
    const isNested = node.parentElement && localName(node.parentElement) !== '';
    if (isNested) {
      return renderChildren(node, { ...ctx, key });
    }
    return renderChildren(node, { ...ctx, key });
  }

  // Section — page with footer
  if (name === 'Section') {
    const margin = node.getAttribute('PageMargin') || '48,48,48,48';
    const [top, right, bottom, left] = margin.split(',').map(v => (parseFloat(v) / 96).toFixed(2) + 'in');

    // Extract footer content from Section.Footers → Footers → Footers.Default → Footer → Footer.Body → RadDocument → Section
    let footerNode = null;
    const footersEl = Array.from(node.childNodes).find(c => localName(c) === 'Section.Footers');
    if (footersEl) {
      // Walk: Footers → Footers.Default → Footer → Footer.Body → RadDocument → Section
      const walk = (n, names) => {
        if (!names.length) return n;
        for (const child of n.childNodes) {
          if (child.nodeType === 1 && localName(child) === names[0]) {
            return walk(child, names.slice(1));
          }
        }
        return null;
      };
      footerNode = walk(footersEl, ['Footers', 'Footers.Default', 'Footer', 'Footer.Body', 'RadDocument', 'Section']);
    }

    return (
      <div key={key} className="air-page">
        <div className="air-page-body" style={{ padding: `${top} ${right} ${bottom} ${left}` }}>
          {renderChildren(node, { ...ctx, key }, /* skipHeaders */ true)}
        </div>
        {footerNode && (
          <div className="air-page-footer" style={{ padding: `0 ${left} 0.15in ${left}` }}>
            {renderChildren(footerNode, { ...ctx, key: key + '-footer' })}
          </div>
        )}
      </div>
    );
  }

  // Headers — skip (AIR logo, mostly visual)
  if (name === 'Section.Headers' || name === 'Headers' || name === 'Headers.Default' ||
      name === 'Header' || name === 'Header.Body') {
    return null;
  }
  // Footers — handled above in Section renderer
  if (name === 'Section.Footers' || name === 'Footers' || name === 'Footers.Default' ||
      name === 'Footer' || name === 'Footer.Body') {
    return null;
  }

  // Paragraph
  if (name === 'Paragraph') {
    const styleName = node.getAttribute('StyleName') || '';
    const textAlign = node.getAttribute('TextAlignment');
    const spacingBefore = node.getAttribute('SpacingBefore');

    let classes = 'air-para';
    if (PARA_STYLE_MAP[styleName]) {
      classes += ' ' + PARA_STYLE_MAP[styleName];
    }
    if (textAlign === 'Center') classes += ' air-align-center';
    else if (textAlign === 'Right') classes += ' air-align-right';
    else if (textAlign === 'Justify') classes += ' air-align-justify';

    const style = {};
    if (spacingBefore && parseFloat(spacingBefore) > 0) {
      style.marginTop = parseFloat(spacingBefore) + 'pt';
    }

    const children = renderParagraphChildren(node, { ...ctx, key });

    return (
      <p key={key} className={classes} style={Object.keys(style).length ? style : undefined}>
        {children}
      </p>
    );
  }

  // Table
  if (name === 'Table') {
    const gridInfo = node.getAttribute('GridColumnWidthsSerializationInfo') || '';
    const colWidths = parseGridColumns(gridInfo);
    const hasBorder = !(node.getAttribute('Borders') || '').startsWith('0');

    return (
      <table key={key} className={`air-table ${hasBorder ? 'air-table-bordered' : ''}`}>
        <tbody>
          {renderChildren(node, { ...ctx, key, colWidths })}
        </tbody>
      </table>
    );
  }

  // TableRow
  if (name === 'TableRow') {
    return (
      <tr key={key}>
        {renderChildren(node, { ...ctx, key })}
      </tr>
    );
  }

  // TableCell
  if (name === 'TableCell') {
    const colSpan = parseInt(node.getAttribute('ColumnSpan') || '1', 10);
    const rowSpan = parseInt(node.getAttribute('RowSpan') || '1', 10);
    const padding = node.getAttribute('Padding');
    const style = {};
    if (padding) {
      const [l, t, r, b] = padding.split(',').map(v => parseFloat(v));
      style.padding = `${t}pt ${r}pt ${b}pt ${l}pt`;
    }

    return (
      <td key={key} colSpan={colSpan > 1 ? colSpan : undefined} rowSpan={rowSpan > 1 ? rowSpan : undefined} style={Object.keys(style).length ? style : undefined}>
        {renderChildren(node, { ...ctx, key })}
      </td>
    );
  }

  // Recurse into unknown container elements
  return renderChildren(node, { ...ctx, key });
}

/**
 * Render paragraph children — handles the field range pattern:
 * FieldRangeStart → Span(FieldContentStyle) → FieldRangeEnd
 */
function renderParagraphChildren(paraNode, ctx) {
  const children = [];
  const nodes = Array.from(paraNode.childNodes);
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i];
    if (node.nodeType !== 1) { i++; continue; } // skip text nodes

    const name = localName(node);
    const full = fullName(node);

    // ── Field range: FieldRangeStart → content → FieldRangeEnd ──
    if (full.includes('FieldRangeStart') || full.includes('DigitalSignatureBodyRangeStart') || full.includes('DigitalSignatureFooterRangeStart')) {
      const annotationId = node.getAttribute('AnnotationID');
      const fieldName = node.getAttribute('Name') || '';
      const dataType = node.getAttribute('FieldDataType');
      const isSignature = full.includes('DigitalSignature');

      if (isSignature) {
        // Signature placeholder
        children.push(
          <span key={`${ctx.key}-sig-${annotationId}`} className="air-signature-placeholder">
            {fieldName}
          </span>
        );
        // Skip to matching RangeEnd
        i++;
        while (i < nodes.length && !fullName(nodes[i]).includes('RangeEnd')) i++;
        i++; // skip the RangeEnd itself
        continue;
      }

      if (dataType === '3') {
        // Checkbox field
        const value = ctx.fieldValues[String(annotationId)];
        children.push(
          <input
            key={`${ctx.key}-cb-${annotationId}`}
            type="checkbox"
            className="air-field-checkbox"
            checked={value === 'true' || value === 'True'}
            onChange={(e) => ctx.onCheckboxChange(annotationId, e)}
            disabled={!ctx.editable}
            title={fieldName}
          />
        );
        // Skip to matching RangeEnd
        i++;
        while (i < nodes.length && !fullName(nodes[i]).includes('RangeEnd')) i++;
        i++;
        continue;
      }

      // Text field — render as editable span
      const value = ctx.fieldValues[String(annotationId)] || '';
      if (ctx.editable) {
        children.push(
          <span
            key={`${ctx.key}-field-${annotationId}`}
            className="air-field-editable"
            contentEditable
            suppressContentEditableWarning
            data-annotation-id={annotationId}
            data-field-name={fieldName}
            onBlur={(e) => ctx.onFieldBlur(annotationId, e)}
            title={fieldName}
          >
            {value}
          </span>
        );
      } else {
        children.push(
          <span key={`${ctx.key}-field-${annotationId}`} className="air-field-readonly" title={fieldName}>
            {value || '\u00A0\u00A0\u00A0\u00A0\u00A0'}
          </span>
        );
      }

      // Skip to matching RangeEnd
      i++;
      while (i < nodes.length && !fullName(nodes[i]).includes('RangeEnd')) i++;
      i++;
      continue;
    }

    // Skip standalone RangeEnd (orphaned)
    if (full.includes('RangeEnd') || full.includes('ReadOnlyRangeStart') || full.includes('ReadOnlyRangeEnd')) {
      i++;
      continue;
    }

    // ── Span — regular text ──
    if (name === 'Span') {
      const text = node.getAttribute('Text') || '';
      const styleName = node.getAttribute('StyleName') || '';
      const fontWeight = node.getAttribute('FontWeight');
      const fontStyle = node.getAttribute('FontStyle');
      const fontSize = node.getAttribute('FontSize');
      const strikethrough = node.getAttribute('Strikethrough');
      const foreColor = node.getAttribute('ForeColor');

      if (!text && !node.childNodes.length) { i++; continue; }

      // Decode tab characters
      const decoded = text.replace(/&#x9;/g, '\t').replace(/&#xA;/g, '\n');

      let classes = 'air-span';
      if (styleName === 'OriginalContentStyle' || styleName === 'FieldBeforeAfterStyle') {
        classes += ' air-span-original';
      }
      if (fontWeight === 'Bold') classes += ' air-span-bold';
      if (fontStyle === 'Italic') classes += ' air-span-italic';
      if (strikethrough === 'True') classes += ' air-span-strikethrough';

      const style = {};
      if (fontSize) {
        const pt = parseFloat(fontSize);
        if (pt > 14) style.fontSize = pt + 'pt'; // Only override for larger text
      }
      // Red text (AIR CRE addendum/rider text is typically red)
      if (foreColor && foreColor !== '#FF000000') {
        // Convert #AARRGGBB to CSS rgba
        const hex = foreColor.replace('#', '');
        if (hex.length === 8) {
          const a = parseInt(hex.substring(0, 2), 16) / 255;
          const r = parseInt(hex.substring(2, 4), 16);
          const g = parseInt(hex.substring(4, 6), 16);
          const b = parseInt(hex.substring(6, 8), 16);
          style.color = `rgba(${r},${g},${b},${a})`;
        }
      }

      children.push(
        <span key={`${ctx.key}-span-${i}`} className={classes} style={Object.keys(style).length ? style : undefined}>
          {decoded}
        </span>
      );
      i++;
      continue;
    }

    // ── ImageInline ──
    if (name === 'ImageInline') {
      const rawData = node.getAttribute('RawData');
      const ext = node.getAttribute('Extension') || 'png';
      const height = parseFloat(node.getAttribute('Height') || '48');
      if (rawData) {
        children.push(
          <img
            key={`${ctx.key}-img-${i}`}
            className="air-logo"
            src={`data:image/${ext};base64,${rawData}`}
            style={{ height: Math.min(height, 64) + 'px' }}
            alt="AIR CRE"
          />
        );
      }
      i++;
      continue;
    }

    // ── InlineUIContainer (wraps checkboxes) — already handled above ──
    if (name === 'InlineUIContainer') {
      // This is inside a field range and already handled
      i++;
      continue;
    }

    // ── FieldRangeStart for WAF fields (page number, last edit date) ──
    if (name === 'FieldRangeStart') {
      // System fields — skip to RangeEnd
      i++;
      while (i < nodes.length && localName(nodes[i]) !== 'FieldRangeEnd') i++;
      i++;
      continue;
    }

    // Recurse into any other element
    const rendered = renderNode(node, { ...ctx, key: `${ctx.key}-${i}` }, i);
    if (rendered) children.push(rendered);
    i++;
  }

  return children.length > 0 ? children : null;
}

/**
 * Render all child elements of a node.
 */
function renderChildren(node, ctx, skipHeaders = false) {
  const results = [];
  let childIndex = 0;
  for (const child of node.childNodes) {
    if (child.nodeType !== 1) continue; // skip text/comment nodes
    const name = localName(child);

    // Optionally skip header/footer sub-elements
    if (skipHeaders && (name === 'Section.Headers' || name === 'Section.Footers')) continue;

    const rendered = renderNode(child, ctx, childIndex);
    if (rendered) results.push(rendered);
    childIndex++;
  }
  return results;
}

/**
 * Parse GridColumnWidthsSerializationInfo into an array of widths.
 * Format: "Fixed,200;Fixed,70;Fixed,200"
 */
function parseGridColumns(info) {
  if (!info) return [];
  return info.split(';').map(col => {
    const parts = col.split(',');
    return parts.length >= 2 ? parseFloat(parts[1]) : 100;
  });
}
