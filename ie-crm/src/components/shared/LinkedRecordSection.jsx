import React, { useState, useRef, useEffect } from 'react';
import Section from './Section';
import LinkedRecord from './LinkedRecord';
import LinkPickerModal from './LinkPickerModal';
import QuickAddModal from './QuickAddModal';
import { linkRecords, unlinkRecords } from '../../api/database';
import { getJunction } from '../../config/entityTypes';
import ENTITY_TYPES from '../../config/entityTypes';

// Wraps a list of linked records inside a collapsible Section with count badge.
// Includes "+" dropdown with "Link Existing" / "Create New" options,
// rendering LinkPickerModal or QuickAddModal and handling junction table operations.

export default function LinkedRecordSection({
  title,
  entityType,
  records = [],
  sourceType,
  sourceId,
  onRefresh,
  defaultOpen = true,
  role,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [modal, setModal] = useState(null); // 'link' | 'create' | null
  const menuRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const junction = sourceType ? getJunction(sourceType, entityType) : null;
  const sourceIdCol = sourceType ? ENTITY_TYPES[sourceType]?.idCol : null;
  const targetIdCol = entityType ? ENTITY_TYPES[entityType]?.idCol : null;

  // Determine which junction column maps to source vs target
  const getColMapping = () => {
    if (!junction || !sourceIdCol || !targetIdCol) return null;
    if (junction.col1 === sourceIdCol) return { srcCol: junction.col1, tgtCol: junction.col2 };
    if (junction.col2 === sourceIdCol) return { srcCol: junction.col2, tgtCol: junction.col1 };
    return null;
  };

  const handleLink = async (targetId) => {
    const mapping = getColMapping();
    console.log('[handleLink]', { sourceType, entityType, sourceId, targetId, junction, mapping });
    if (!mapping || !sourceId) {
      console.warn('[handleLink] Aborted — missing mapping or sourceId', { mapping, sourceId });
      return;
    }
    try {
      const extras = role ? { role } : {};
      const result = await linkRecords(junction.table, mapping.srcCol, sourceId, mapping.tgtCol, targetId, extras);
      console.log('[handleLink] linkRecords returned:', result);
      setModal(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[handleLink] Failed to link record:', err);
      alert(`Failed to link: ${err.message || err}`);
    }
  };

  const handleCreate = async (newId) => {
    const mapping = getColMapping();
    if (!mapping || !sourceId || !newId) return;
    try {
      const extras = role ? { role } : {};
      await linkRecords(junction.table, mapping.srcCol, sourceId, mapping.tgtCol, newId, extras);
      setModal(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('[handleCreate] Failed to link new record:', err);
      alert(`Failed to link: ${err.message || err}`);
    }
  };

  const handleUnlink = async (targetId) => {
    const mapping = getColMapping();
    if (!mapping || !sourceId) return;
    try {
      await unlinkRecords(junction.table, mapping.srcCol, sourceId, mapping.tgtCol, targetId);
    } catch (err) {
      console.error('Failed to unlink record:', err);
    }
    if (onRefresh) onRefresh();
  };

  const canAdd = sourceType && sourceId && junction;

  const addButton = canAdd ? (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setShowMenu((v) => !v)}
        className="text-crm-accent hover:text-crm-accent-hover text-xs flex items-center gap-0.5 transition-colors"
        title={`Add ${title}`}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add
      </button>
      {showMenu && (
        <div className="absolute right-0 top-full mt-1 bg-crm-card border border-crm-border rounded-lg shadow-xl z-50 py-1 min-w-[140px]">
          <button
            onClick={() => { setShowMenu(false); setModal('link'); }}
            className="w-full text-left px-3 py-1.5 text-xs text-crm-text hover:bg-crm-hover transition-colors flex items-center gap-2"
          >
            <svg className="w-3 h-3 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
            </svg>
            Link Existing
          </button>
          <button
            onClick={() => { setShowMenu(false); setModal('create'); }}
            className="w-full text-left px-3 py-1.5 text-xs text-crm-text hover:bg-crm-hover transition-colors flex items-center gap-2"
          >
            <svg className="w-3 h-3 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New
          </button>
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <Section title={title} badge={records.length} actions={addButton} defaultOpen={defaultOpen}>
        {records.length === 0 ? (
          <p className="text-xs text-crm-muted">No linked {title.toLowerCase()}</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {records.map((r) => (
              <LinkedRecord
                key={r.id}
                entityType={entityType}
                entityId={r.id}
                label={r.label}
                secondary={r.secondary}
                onUnlink={canAdd ? handleUnlink : undefined}
              />
            ))}
          </div>
        )}
      </Section>

      {modal === 'link' && (
        <LinkPickerModal
          entityType={entityType}
          onLink={handleLink}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'create' && (
        <QuickAddModal
          entityType={entityType}
          onCreated={handleCreate}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}
