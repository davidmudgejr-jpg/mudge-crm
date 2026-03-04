import { useState, useCallback } from 'react';
import { FIELD_TYPE_MAP } from '../config/fieldTypes';

/**
 * Hook for managing custom (user-added) fields per table.
 *
 * Field definitions and cell values are persisted to localStorage.
 *
 * Field definition shape:
 *   { id, name, type, options?, createdAt }
 *
 * @param {string} tableKey - Unique table identifier (e.g. 'contacts')
 */
export function useCustomFields(tableKey) {
  const fieldsKey = `crm-custom-fields-${tableKey}`;
  const valuesKey = `crm-custom-field-values-${tableKey}`;

  // --- field definitions ---------------------------------------------------

  const [fields, setFields] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(fieldsKey)) || [];
    } catch {
      return [];
    }
  });

  const persistFields = (next) => {
    localStorage.setItem(fieldsKey, JSON.stringify(next));
    setFields(next);
  };

  const addField = useCallback(
    (name, type, options) => {
      const id = `cf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const typeDef = FIELD_TYPE_MAP[type];
      const field = {
        id,
        name: name || typeDef?.label || 'New field',
        type,
        options: options || typeDef?.defaultOptions || undefined,
        createdAt: Date.now(),
      };
      const next = [...fields, field];
      persistFields(next);
      return field;
    },
    [fields, fieldsKey],
  );

  const updateField = useCallback(
    (fieldId, updates) => {
      const next = fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f));
      persistFields(next);
    },
    [fields, fieldsKey],
  );

  const removeField = useCallback(
    (fieldId) => {
      const next = fields.filter((f) => f.id !== fieldId);
      persistFields(next);
      // Clean up values
      try {
        const vals = JSON.parse(localStorage.getItem(valuesKey)) || {};
        Object.keys(vals).forEach((rowId) => {
          delete vals[rowId][fieldId];
        });
        localStorage.setItem(valuesKey, JSON.stringify(vals));
      } catch {
        /* ignore */
      }
    },
    [fields, fieldsKey, valuesKey],
  );

  // --- cell values ---------------------------------------------------------

  const [values, setValues] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(valuesKey)) || {};
    } catch {
      return {};
    }
  });

  const getValue = useCallback(
    (rowId, fieldId) => values[rowId]?.[fieldId] ?? null,
    [values],
  );

  const setValue = useCallback(
    (rowId, fieldId, value) => {
      setValues((prev) => {
        const next = { ...prev, [rowId]: { ...(prev[rowId] || {}), [fieldId]: value } };
        localStorage.setItem(valuesKey, JSON.stringify(next));
        return next;
      });
    },
    [valuesKey],
  );

  // --- build CrmTable-compatible columns -----------------------------------

  const customColumns = fields.map((field) => {
    const typeDef = FIELD_TYPE_MAP[field.type] || {};
    return {
      key: field.id,
      label: field.name,
      defaultWidth: typeDef.defaultWidth || 150,
      format: typeDef.format,
      _custom: true,
      _fieldDef: field,
      _typeDef: typeDef,
    };
  });

  return {
    fields,
    customColumns,
    addField,
    updateField,
    removeField,
    getValue,
    setValue,
    values,
  };
}
