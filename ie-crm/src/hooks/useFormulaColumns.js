import { useState, useEffect, useCallback } from 'react';
import { getFormulaColumns, query } from '../api/database';

// Hook to fetch and evaluate formula columns for a given table
// Formula columns are SQL expressions stored in the formula_columns table
// They get evaluated server-side and merged into the row data

export function useFormulaColumns(tableName) {
  const [formulas, setFormulas] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadFormulas = useCallback(async () => {
    if (!tableName) return;
    try {
      setLoading(true);
      const result = await getFormulaColumns(tableName);
      setFormulas(result.rows || []);
    } catch (err) {
      console.error('Failed to load formula columns:', err);
    } finally {
      setLoading(false);
    }
  }, [tableName]);

  useEffect(() => {
    loadFormulas();
  }, [loadFormulas]);

  // Build a SQL fragment that evaluates all formulas as additional columns
  const getFormulaSelect = useCallback(() => {
    if (!formulas.length) return '';
    return formulas
      .map((f) => `(${f.expression}) AS "${f.column_name}"`)
      .join(', ');
  }, [formulas]);

  // Evaluate formulas for a specific set of rows by running a query
  // that adds the formula columns to the base table select
  const evaluateFormulas = useCallback(
    async (baseQuery, params = []) => {
      if (!formulas.length) {
        return query(baseQuery, params);
      }

      // Wrap the base query and add formula columns
      const formulaSelect = formulas
        .map((f) => `(${f.expression}) AS "${f.column_name}"`)
        .join(', ');

      // If baseQuery is a simple SELECT * FROM table, we can modify it directly
      const modifiedQuery = baseQuery.replace(
        /SELECT \*/i,
        `SELECT *, ${formulaSelect}`
      );

      try {
        return await query(modifiedQuery, params);
      } catch (err) {
        // If formula eval fails, fall back to base query
        console.error('Formula evaluation failed:', err);
        return query(baseQuery, params);
      }
    },
    [formulas]
  );

  return {
    formulas,
    loading,
    getFormulaSelect,
    evaluateFormulas,
    refresh: loadFormulas,
  };
}

export default useFormulaColumns;
