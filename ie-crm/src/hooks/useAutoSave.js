import { useCallback, useRef } from 'react';
import { useToast } from '../components/shared/Toast';

/**
 * Hook wrapping a database update function with optimistic UI + toast notifications.
 *
 * Usage:
 *   const saveField = useAutoSave(updateProperty, resolvedId, setRecord, onRefresh);
 *   // In InlineField: onSave={saveField}
 *   // saveField(fieldKey, newValue) → updates local state optimistically, calls DB, shows toast
 *
 * @param {Function} updateFn - DB update function: (id, fields) => Promise
 * @param {string} entityId - Record ID
 * @param {Function} setRecord - State setter for the record object
 * @param {Function} [onAfterSave] - Optional callback fired after successful save (e.g. refresh parent list)
 * @returns {Function} (field, value) => Promise<void>
 */
export default function useAutoSave(updateFn, entityId, setRecord, onAfterSave) {
  const { addToast } = useToast();
  const prevValues = useRef({});

  return useCallback(
    async (field, value) => {
      // Store previous value for rollback
      setRecord((prev) => {
        prevValues.current[field] = prev?.[field];
        return { ...prev, [field]: value };
      });

      try {
        await updateFn(entityId, { [field]: value });
        addToast('Saved', 'success', 1500);
        if (onAfterSave) onAfterSave();
      } catch (err) {
        // Rollback on failure
        setRecord((prev) => ({ ...prev, [field]: prevValues.current[field] }));
        addToast(`Save failed: ${err.message || 'Unknown error'}`, 'error', 4000);
        throw err;
      }
    },
    [updateFn, entityId, setRecord, addToast, onAfterSave]
  );
}
