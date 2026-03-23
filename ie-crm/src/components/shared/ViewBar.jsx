// Horizontal tab strip for switching between saved views.
// Props come from useViewEngine spread.

import React, { useState, useRef, useEffect } from 'react';

export default function ViewBar({
  entityLabel,
  views,
  activeViewId,
  isDirty,
  activeView,
  filters,
  applyView,
  resetToAll,
  saveView,
  renameView,
  deleteView,
  duplicateView,
  setDefault,
  onNewView,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [naming, setNaming] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const menuRef = useRef(null);
  const nameInputRef = useRef(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setContextMenu(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  // Focus name input when it appears
  useEffect(() => {
    if (naming && nameInputRef.current) nameInputRef.current.focus();
  }, [naming]);

  const handleContextMenu = (e, view) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, view });
  };

  const handleRenameSubmit = async () => {
    if (renaming && renameValue.trim()) {
      await renameView(renaming, renameValue.trim());
    }
    setRenaming(null);
  };

  const handleNewViewSave = async () => {
    if (newViewName.trim()) {
      try {
        await saveView(newViewName.trim());
        setNaming(false);
        setNewViewName('');
      } catch (err) {
        console.error('[ViewBar] Failed to save view:', err);
      }
    }
  };

  const hasUnsavedFilters = !activeViewId && filters && filters.length > 0;

  return (
    <div className="flex items-center gap-1.5 px-5 py-2 border-b border-crm-border overflow-x-auto">
      {/* "All" tab — always first */}
      <button
        onClick={() => { resetToAll(); setNaming(false); }}
        className={`shrink-0 px-3.5 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
          !activeViewId && !hasUnsavedFilters
            ? 'bg-crm-accent/15 text-crm-accent'
            : 'text-crm-muted hover:bg-crm-hover'
        }`}
      >
        All {entityLabel}
      </button>

      {/* Saved view tabs */}
      {views.map((view) => (
        <button
          key={view.view_id}
          onClick={() => { applyView(view.view_id); setNaming(false); }}
          onContextMenu={(e) => handleContextMenu(e, view)}
          className={`shrink-0 px-3.5 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
            activeViewId === view.view_id
              ? 'bg-crm-accent/15 text-crm-accent font-semibold'
              : 'text-crm-muted hover:bg-crm-hover bg-crm-hover/40'
          }`}
        >
          {renaming === view.view_id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setRenaming(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent border-b border-crm-accent text-crm-text text-xs w-32 outline-none"
            />
          ) : (
            <>
              {view.view_name}
              {isDirty && activeViewId === view.view_id && (
                <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-crm-accent inline-block" />
              )}
            </>
          )}
        </button>
      ))}

      {/* Save button when dirty on existing view */}
      {isDirty && activeViewId && (
        <button
          onClick={() => saveView(activeView?.view_name || 'View')}
          className="shrink-0 px-2.5 py-1 rounded-md text-[10px] bg-crm-accent/80 text-white font-medium hover:bg-crm-accent transition-colors"
        >
          Save
        </button>
      )}

      {/* Unsaved new filters — show "Save as View" button */}
      {hasUnsavedFilters && !naming && (
        <button
          onClick={() => setNaming(true)}
          className="shrink-0 px-3 py-1.5 rounded-md text-xs bg-crm-accent/80 text-white font-medium hover:bg-crm-accent transition-colors animate-fade-in"
        >
          Save as View
        </button>
      )}

      {/* Inline naming input for new view */}
      {naming && (
        <div className="shrink-0 inline-flex items-center gap-1 animate-fade-in">
          <input
            ref={nameInputRef}
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNewViewSave();
              if (e.key === 'Escape') { setNaming(false); setNewViewName(''); }
            }}
            placeholder="View name..."
            className="bg-crm-hover/60 border border-crm-accent text-crm-text text-xs px-2.5 py-1 rounded-md w-40 outline-none"
          />
          <button
            onClick={handleNewViewSave}
            disabled={!newViewName.trim()}
            className="text-[11px] bg-crm-accent/80 text-white px-2.5 py-1 rounded-md font-medium hover:bg-crm-accent transition-colors disabled:opacity-40"
          >
            Save
          </button>
          <button
            onClick={() => { setNaming(false); setNewViewName(''); }}
            className="text-[11px] text-crm-muted px-1.5 py-1 hover:text-crm-text transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* + New View */}
      <button
        onClick={onNewView}
        className="shrink-0 px-3.5 py-1.5 rounded-md text-xs text-crm-muted/60 whitespace-nowrap border border-dashed border-crm-border hover:border-crm-muted/40 transition-colors"
      >
        + New View
      </button>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-crm-card border border-crm-border rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-crm-text hover:bg-crm-hover"
            onClick={() => {
              setRenaming(contextMenu.view.view_id);
              setRenameValue(contextMenu.view.view_name);
              setContextMenu(null);
            }}
          >
            Rename
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-crm-text hover:bg-crm-hover"
            onClick={() => { duplicateView(contextMenu.view.view_id); setContextMenu(null); }}
          >
            Duplicate
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-crm-text hover:bg-crm-hover"
            onClick={() => { setDefault(contextMenu.view.view_id); setContextMenu(null); }}
          >
            Set as Default
          </button>
          <div className="border-t border-crm-border my-1" />
          <button
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-crm-hover"
            onClick={() => { deleteView(contextMenu.view.view_id); setContextMenu(null); }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
