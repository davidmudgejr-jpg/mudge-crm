import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useColumnResize } from '../../hooks/useColumnResize';
import defaultFormatCell from './formatCell';
import AddFieldPanel from './AddFieldPanel';
import { FIELD_TYPE_MAP } from '../../config/fieldTypes';
import InlineTableCellEditor from './InlineTableCellEditor';
import ContextMenu from './ContextMenu';

/* ── Inline cell editor for custom fields ───────────────────────────── */

function InlineCellEditor({ value, fieldDef, typeDef, onSave, onCancel }) {
  const [draft, setDraft] = useState(value ?? '');
  const [valid, setValid] = useState(true);
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  const commit = () => {
    if (!valid) return;
    const parsed = typeDef.parse ? typeDef.parse(draft) : draft;
    onSave(parsed);
  };

  const handleChange = (raw) => {
    setDraft(raw);
    if (typeDef.validate) setValid(typeDef.validate(raw));
  };

  // Checkbox — toggle immediately
  if (typeDef.inputType === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onSave(e.target.checked)}
        className="rounded border-crm-border accent-crm-accent"
      />
    );
  }

  // Select
  if (typeDef.inputType === 'select') {
    const options = fieldDef.options || typeDef.defaultOptions || [];
    return (
      <select
        ref={inputRef}
        value={draft}
        onChange={(e) => { setDraft(e.target.value); }}
        onBlur={() => { onSave(draft || null); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { onSave(draft || null); }
          if (e.key === 'Escape') onCancel();
        }}
        className="w-full bg-crm-card border border-crm-border rounded-md shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] focus:ring-2 focus:ring-crm-accent/40 focus:border-crm-accent/50 px-1.5 py-0.5 text-sm text-crm-text focus:outline-none"
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  // Textarea (long text) — auto-sizes to content
  if (typeDef.inputType === 'textarea') {
    const autoSize = (el) => {
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    };
    return (
      <textarea
        ref={(el) => { inputRef.current = el; autoSize(el); }}
        value={draft}
        rows={1}
        onChange={(e) => { handleChange(e.target.value); autoSize(e.target); }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
        }}
        className={`w-full bg-crm-card border ${valid ? 'border-crm-border' : 'border-red-500'} rounded-md shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] focus:ring-2 focus:ring-crm-accent/40 focus:border-crm-accent/50 px-1.5 py-0.5 text-sm text-crm-text focus:outline-none resize-none overflow-hidden`}
      />
    );
  }

  // Standard input (text, number, date, email, url, tel)
  return (
    <input
      ref={inputRef}
      type={typeDef.inputType || 'text'}
      value={draft}
      step={typeDef.inputType === 'number' ? 'any' : undefined}
      placeholder={typeDef.placeholder}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') onCancel();
      }}
      className={`w-full bg-crm-card border ${valid ? 'border-crm-border' : 'border-red-500'} rounded-md shadow-[inset_0_1px_2px_rgba(0,0,0,0.06)] focus:ring-2 focus:ring-crm-accent/40 focus:border-crm-accent/50 px-1.5 py-0.5 text-sm text-crm-text focus:outline-none`}
    />
  );
}

/* ── Column header with rename / delete or hide ──────────────────────── */

function ColumnHeader({ col, onSort, orderBy, order, onRename, onDelete, onHide, onResizeStart, deleteDisabled }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameVal, setNameVal] = useState(col.label);
  const menuRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming && inputRef.current) inputRef.current.focus();
  }, [renaming]);

  useEffect(() => { setNameVal(col.label); }, [col.label]);

  const commitRename = () => {
    if (nameVal.trim()) onRename(col.key, nameVal.trim());
    setRenaming(false);
    setMenuOpen(false);
  };

  if (renaming) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setRenaming(false); setMenuOpen(false); } }}
          className="w-full bg-crm-card border border-crm-accent/50 rounded px-1 py-0.5 text-xs text-crm-text focus:outline-none"
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-0.5 min-w-0">
        <div
          className="cursor-pointer hover:text-crm-text transition-colors truncate"
          onClick={() => onSort(col.key)}
        >
          <span className="truncate">{col.label}</span>
          {orderBy === col.key && (
            <svg className="w-3 h-3 text-crm-accent ml-1 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={order === 'ASC' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
            </svg>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 hover:text-crm-text transition-all p-0.5 rounded hover:bg-crm-hover"
        >
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
            <circle cx="8" cy="2.5" r="1.5" />
            <circle cx="8" cy="8" r="1.5" />
            <circle cx="8" cy="13.5" r="1.5" />
          </svg>
        </button>
      </div>

      {menuOpen && (
        <div ref={menuRef} className="absolute top-full left-0 mt-1 w-36 bg-crm-sidebar border border-crm-border rounded-lg shadow-xl z-50 overflow-hidden animate-fade-in">
          <button
            onClick={() => setRenaming(true)}
            className="w-full text-left px-3 py-1.5 text-xs text-crm-text hover:bg-crm-hover transition-colors"
          >
            Rename field
          </button>
          <button
            onClick={() => { onHide?.(col.key); setMenuOpen(false); }}
            className="w-full text-left px-3 py-1.5 text-xs text-crm-text hover:bg-crm-hover transition-colors"
          >
            Hide field
          </button>
          {deleteDisabled ? (
            <div
              className="w-full text-left px-3 py-1.5 text-xs text-crm-muted/40 cursor-not-allowed"
              title="System fields cannot be deleted"
            >
              Delete field
            </div>
          ) : (
            <button
              onClick={() => { onDelete?.(col.key); setMenuOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              Delete field
            </button>
          )}
        </div>
      )}

      {/* Resize handle — offset right so it doesn't overlap the ••• menu */}
      <div
        className="absolute top-0 bottom-0 cursor-col-resize z-20 group/resize"
        style={{ right: '-9px', width: '18px' }}
        onMouseDown={(e) => onResizeStart(col.key, e)}
      >
        <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-[3px] rounded bg-transparent group-hover/resize:bg-crm-accent transition-colors" />
      </div>
    </div>
  );
}

/* ── Expandable text cell for long_text display mode ─────────────── */

function ExpandableTextCell({ value, onStartEdit }) {
  const [expanded, setExpanded] = useState(false);
  const hasMultiLine = String(value).includes('\n') || String(value).length > 40;

  if (expanded) {
    return (
      <div>
        <div
          className="whitespace-pre-wrap break-words text-sm text-crm-text cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
        >
          {value}
        </div>
        <span
          onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
          className="text-crm-muted hover:text-crm-accent cursor-pointer text-xs select-none"
          title="Collapse"
        >▲ less</span>
      </div>
    );
  }

  return (
    <div
      className="text-sm text-crm-text cursor-pointer overflow-hidden whitespace-nowrap text-ellipsis"
      style={{ lineHeight: '1.25rem', maxHeight: '1.25rem' }}
      onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
    >
      {String(value).replace(/\n/g, ' ')}
      {hasMultiLine && (
        <span
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); setExpanded(true); }}
          className="text-crm-muted hover:text-crm-accent text-xs ml-1 select-none"
          title="Show more"
        >…▼</span>
      )}
    </div>
  );
}

/* ── Main CrmTable ──────────────────────────────────────────────────── */

/**
 * Airtable-style table with resizable columns, row selection, sorting,
 * custom field support, and an Add Field button.
 */
export default function CrmTable({
  tableKey,
  columns,
  rows,
  idField,
  loading,
  onRowClick,
  onSort,
  orderBy,
  order,
  selected,
  onToggleSelect,
  onToggleAll,
  rowClassName,
  formatCell: customFormatCell,
  emptyMessage = 'No records found',
  emptySubMessage = 'Try adjusting your filters',
  // Built-in column actions
  onRenameColumn,
  onHideColumn,
  // Custom fields support
  customColumns = [],
  customValues = {},
  onCustomCellChange,
  onAddField,
  onRenameField,
  onDeleteField,
  onHideCustomField,
  // Inline cell editing for native (DB) columns
  onCellSave,
  // Finder-style selection
  onSelectOnly,
  onShiftSelect,
  // Context menu
  onDeleteRow,
}) {
  /* ── Column order: drag-to-reorder with localStorage persistence ─── */
  const colOrderKey = `crm_column_order_${tableKey}`;

  const [columnOrder, setColumnOrder] = useState(() => {
    try { const s = localStorage.getItem(colOrderKey); return s ? JSON.parse(s) : null; }
    catch { return null; }
  });
  const [dragCol, setDragCol] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const orderedColumns = React.useMemo(() => {
    if (!columnOrder) return columns;
    const map = new Map(columns.map(c => [c.key, c]));
    const out = [];
    for (const k of columnOrder) {
      if (map.has(k)) { out.push(map.get(k)); map.delete(k); }
    }
    for (const c of map.values()) out.push(c);
    return out;
  }, [columns, columnOrder]);

  const handleColDragStart = useCallback((e, key) => {
    setDragCol(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
  }, []);

  const handleColDragEnd = useCallback(() => {
    setDragCol(null);
    setDragOverCol(null);
  }, []);

  const handleColDragOver = useCallback((e, key) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCol(key);
  }, []);

  const handleColDragLeave = useCallback(() => setDragOverCol(null), []);

  const handleColDrop = useCallback((e, targetKey) => {
    e.preventDefault();
    if (!dragCol || dragCol === targetKey) { setDragCol(null); setDragOverCol(null); return; }
    const keys = orderedColumns.map(c => c.key);
    const si = keys.indexOf(dragCol), ti = keys.indexOf(targetKey);
    if (si === -1 || ti === -1) return;
    keys.splice(si, 1);
    keys.splice(ti, 0, dragCol);
    setColumnOrder(keys);
    localStorage.setItem(colOrderKey, JSON.stringify(keys));
    setDragCol(null);
    setDragOverCol(null);
  }, [dragCol, orderedColumns, colOrderKey]);
  /* ─────────────────────────────────────────────────────────────────── */

  const allColumns = [...orderedColumns, ...customColumns];
  const { widths, onResizeStart } = useColumnResize(tableKey, allColumns);
  const fmt = customFormatCell || defaultFormatCell;

  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [editingCell, setEditingCell] = useState(null); // { rowId, colKey }
  const [contextMenu, setContextMenu] = useState(null); // { x, y, row }
  const addBtnRef = useRef(null);

  const allSelected = selected.size === rows.length && rows.length > 0;

  const noColumnsVisible = allColumns.length === 0;

  const emptyBody = loading ? (
    <tr>
      <td colSpan={allColumns.length + 2} className="py-16 text-center text-crm-muted text-sm">
        Loading...
      </td>
    </tr>
  ) : noColumnsVisible ? (
    <tr>
      <td colSpan={2} className="py-16 text-center text-crm-muted">
        <p className="text-sm">No columns visible</p>
        <p className="text-xs mt-1">Use the Columns menu to show columns</p>
      </td>
    </tr>
  ) : rows.length === 0 ? (
    <tr>
      <td colSpan={allColumns.length + 2} className="py-16 text-center text-crm-muted">
        <p className="text-sm">{emptyMessage}</p>
        <p className="text-xs mt-1">{emptySubMessage}</p>
      </td>
    </tr>
  ) : null;

  return (
    <div className="relative w-full h-full overflow-auto">
      <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', minWidth: 'max-content' }}>
        <thead className="sticky top-0 bg-crm-bg/95 glass-sidebar z-10">
          <tr className="border-b border-crm-border/30">
            {/* Checkbox column */}
            <th className="px-3 py-2.5 w-10 sticky left-0 bg-crm-bg/95 z-20">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                className="rounded border-crm-border"
              />
            </th>

            {/* Regular columns (draggable for reorder) */}
            {orderedColumns.map((col) => (
              <th
                key={col.key}
                draggable
                onDragStart={(e) => handleColDragStart(e, col.key)}
                onDragEnd={handleColDragEnd}
                onDragOver={(e) => handleColDragOver(e, col.key)}
                onDragLeave={handleColDragLeave}
                onDrop={(e) => handleColDrop(e, col.key)}
                className={`group relative px-3 py-2 text-left text-xs font-medium text-crm-muted uppercase tracking-wider select-none cursor-grab active:cursor-grabbing transition-colors ${
                  dragCol === col.key ? 'opacity-30' : ''
                } ${dragOverCol === col.key && dragCol !== col.key ? 'bg-crm-accent/10' : ''}`}
                style={{
                  width: widths[col.key] || col.defaultWidth || 150,
                  minWidth: widths[col.key] || col.defaultWidth || 150,
                  maxWidth: widths[col.key] || col.defaultWidth || 150,
                  overflow: 'visible',
                  ...(dragOverCol === col.key && dragCol !== col.key
                    ? { boxShadow: 'inset 3px 0 0 0 #818cf8' }
                    : {}),
                }}
              >
                <ColumnHeader
                  col={col}
                  onSort={onSort}
                  orderBy={orderBy}
                  order={order}
                  onRename={onRenameColumn}
                  onHide={onHideColumn}
                  deleteDisabled
                  onResizeStart={onResizeStart}
                />
              </th>
            ))}

            {/* Custom columns */}
            {customColumns.map((col) => (
              <th
                key={col.key}
                className="group relative px-3 py-2 text-left text-xs font-medium text-crm-muted uppercase tracking-wider select-none"
                style={{
                  width: widths[col.key] || col.defaultWidth || 150,
                  minWidth: widths[col.key] || col.defaultWidth || 150,
                  maxWidth: widths[col.key] || col.defaultWidth || 150,
                  overflow: 'visible',
                }}
              >
                <ColumnHeader
                  col={col}
                  onSort={onSort}
                  orderBy={orderBy}
                  order={order}
                  onRename={onRenameField}
                  onHide={onHideCustomField}
                  onDelete={onDeleteField}
                  onResizeStart={onResizeStart}
                />
              </th>
            ))}

            {/* Add field button column */}
            {onAddField && (
              <th className="relative px-2 py-2 w-10" ref={addBtnRef}>
                <button
                  onClick={() => setAddFieldOpen(!addFieldOpen)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-crm-hover text-crm-muted hover:text-crm-accent transition-colors border border-transparent hover:border-crm-border"
                  title="Add field"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
                {addFieldOpen && (
                  <AddFieldPanel
                    onAdd={(name, type, options) => {
                      onAddField(name, type, options);
                      setAddFieldOpen(false);
                    }}
                    onClose={() => setAddFieldOpen(false)}
                  />
                )}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {emptyBody}
          {!noColumnsVisible && rows.map((row, idx) => {
            const id = row[idField];
            const isSelected = selected.has(id);
            const extraClass = rowClassName ? rowClassName(row) : '';
            return (
              <tr
                key={id}
                onClick={(e) => {
                  if (e.metaKey) {
                    onToggleSelect(id);
                  } else if (e.shiftKey && onShiftSelect) {
                    onShiftSelect(id);
                  } else {
                    onSelectOnly ? onSelectOnly(id) : onToggleSelect(id);
                  }
                }}
                onDoubleClick={() => onRowClick(row)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, row });
                }}
                className={`border-b border-crm-border/30 cursor-pointer transition-colors duration-150 animate-row-appear ${
                  isSelected ? 'bg-crm-accent/15' : 'hover:bg-crm-hover'
                } ${extraClass}`}
                style={idx % 2 === 1 ? { backgroundColor: 'rgba(255,255,255,0.02)' } : undefined}
              >
                <td
                  className="px-3 py-2.5 sticky left-0 bg-crm-bg z-[5]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(id)}
                    className="rounded border-crm-border"
                  />
                </td>

                {/* Regular cells (matching header order) — with inline editing */}
                {orderedColumns.map((col) => {
                  const cellValue = row[col.key];
                  const isEditable = col.editable !== false
                    && !col.key.startsWith('linked_')
                    && !!onCellSave;
                  const isEditing = editingCell?.rowId === id && editingCell?.colKey === col.key;

                  return (
                    <td
                      key={col.key}
                      className={`px-3 py-2.5 overflow-hidden text-ellipsis whitespace-nowrap${isEditable && !isEditing ? ' cursor-cell' : ''}`}
                      style={{
                        width: widths[col.key] || col.defaultWidth || 150,
                        minWidth: widths[col.key] || col.defaultWidth || 150,
                        maxWidth: widths[col.key] || col.defaultWidth || 150,
                      }}
                      onClick={isEditable ? (e) => {
                        e.stopPropagation();
                        if (!isEditing) setEditingCell({ rowId: id, colKey: col.key });
                      } : undefined}
                    >
                      {isEditing ? (
                        <InlineTableCellEditor
                          value={cellValue}
                          column={col}
                          onSave={(val) => {
                            onCellSave(id, col.key, val);
                            setEditingCell(null);
                          }}
                          onCancel={() => setEditingCell(null)}
                        />
                      ) : (
                        col.renderCell
                          ? col.renderCell(cellValue, row)
                          : fmt(cellValue, col.format)
                      )}
                    </td>
                  );
                })}

                {/* Custom field cells */}
                {customColumns.map((col) => {
                  const cellValue = customValues?.[id]?.[col.key] ?? null;
                  const isEditing =
                    editingCell?.rowId === id && editingCell?.colKey === col.key;
                  const typeDef = col._typeDef || FIELD_TYPE_MAP[col._fieldDef?.type] || {};

                  return (
                    <td
                      key={col.key}
                      className="px-3 py-2.5 overflow-hidden text-ellipsis whitespace-nowrap"
                      style={{
                        width: widths[col.key] || col.defaultWidth || 150,
                        minWidth: widths[col.key] || col.defaultWidth || 150,
                        maxWidth: widths[col.key] || col.defaultWidth || 150,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isEditing) setEditingCell({ rowId: id, colKey: col.key });
                      }}
                    >
                      {isEditing ? (
                        <InlineCellEditor
                          value={cellValue}
                          fieldDef={col._fieldDef}
                          typeDef={typeDef}
                          onSave={(val) => {
                            onCustomCellChange?.(id, col.key, val);
                            setEditingCell(null);
                          }}
                          onCancel={() => setEditingCell(null)}
                        />
                      ) : (
                        // Display mode
                        typeDef.inputType === 'checkbox' ? (
                          <span
                            className="cursor-pointer select-none"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCustomCellChange?.(id, col.key, !cellValue);
                            }}
                          >
                            {cellValue ? (
                              <span className="text-crm-accent text-base">✓</span>
                            ) : (
                              <span className="w-4 h-4 inline-block border border-crm-border rounded" />
                            )}
                          </span>
                        ) : cellValue != null && cellValue !== '' ? (
                          typeDef.inputType === 'textarea' ? (
                            <ExpandableTextCell
                              value={cellValue}
                              onStartEdit={() => setEditingCell({ rowId: id, colKey: col.key })}
                            />
                          ) : (
                            fmt(cellValue, col.format)
                          )
                        ) : (
                          <span className="text-crm-muted text-xs opacity-50 hover:opacity-100 transition-opacity">
                            {typeDef.placeholder || 'Click to edit'}
                          </span>
                        )
                      )}
                    </td>
                  );
                })}

                {/* Empty cell for add-field column */}
                {onAddField && <td className="px-2 py-2.5 w-10" />}
              </tr>
            );
          })}
        </tbody>
      </table>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            { label: 'Open', onClick: () => { onRowClick(contextMenu.row); setContextMenu(null); } },
            { label: 'Copy Name', onClick: () => {
              const firstCol = orderedColumns[0];
              const val = firstCol ? contextMenu.row[firstCol.key] : '';
              navigator.clipboard.writeText(String(val || ''));
              setContextMenu(null);
            }},
            { separator: true },
            { label: 'Delete', danger: true, onClick: () => { onDeleteRow?.(contextMenu.row[idField]); setContextMenu(null); } },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
