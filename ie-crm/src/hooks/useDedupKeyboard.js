import { useEffect, useCallback } from 'react';

/**
 * Keyboard navigation for the dedupe review page.
 *
 * Cluster list mode:
 *   j / ArrowDown — next cluster
 *   k / ArrowUp — previous cluster
 *   Enter — open merge workspace
 *   d — dismiss cluster
 *   l — defer cluster
 *
 * Merge workspace mode (when open):
 *   Tab / Shift+Tab — next/prev field row
 *   1-9 — select column N for current field
 *   Cmd+Enter — confirm merge
 *   Escape — close workspace
 */
export default function useDedupKeyboard({
  clusterCount,
  activeIndex,
  setActiveIndex,
  onOpenCluster,
  onDismissCluster,
  onDeferCluster,
  workspaceOpen,
  onCloseWorkspace,
  onConfirmMerge,
  onSelectColumn,
  fieldCount,
  activeFieldIndex,
  setActiveFieldIndex,
}) {
  const handleKeyDown = useCallback((e) => {
    // Skip if typing in an input
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (workspaceOpen) {
      // Merge workspace mode
      switch (e.key) {
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            setActiveFieldIndex?.(i => Math.max(0, i - 1));
          } else {
            setActiveFieldIndex?.(i => Math.min((fieldCount || 1) - 1, i + 1));
          }
          break;
        case '1': case '2': case '3': case '4': case '5':
        case '6': case '7': case '8': case '9':
          e.preventDefault();
          onSelectColumn?.(parseInt(e.key) - 1);
          break;
        case 'Enter':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            onConfirmMerge?.();
          }
          break;
        case 'Escape':
          e.preventDefault();
          onCloseWorkspace?.();
          break;
      }
    } else {
      // Cluster list mode
      switch (e.key) {
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(i => Math.min((clusterCount || 1) - 1, i + 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(i => Math.max(0, i - 1));
          break;
        case 'Enter':
          e.preventDefault();
          onOpenCluster?.(activeIndex);
          break;
        case 'd':
          e.preventDefault();
          onDismissCluster?.(activeIndex);
          break;
        case 'l':
          e.preventDefault();
          onDeferCluster?.(activeIndex);
          break;
      }
    }
  }, [
    workspaceOpen, clusterCount, activeIndex, fieldCount,
    setActiveIndex, onOpenCluster, onDismissCluster, onDeferCluster,
    onCloseWorkspace, onConfirmMerge, onSelectColumn, setActiveFieldIndex,
  ]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
