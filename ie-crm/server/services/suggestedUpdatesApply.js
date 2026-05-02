'use strict';

const { validateColumn, validateTable, quoteIdentifier } = require('../utils/sqlSafety');

const TIMESTAMP_COL_BY_TABLE = {
  contacts: 'modified',
  companies: 'modified',
  properties: 'last_modified',
  deals: 'modified',
};

function parseUpdatedData(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function getDesiredValue(suggestion) {
  const updatedData = parseUpdatedData(suggestion.updated_data);
  if (
    Object.prototype.hasOwnProperty.call(updatedData, 'applied_value') &&
    updatedData.applied_value !== null &&
    updatedData.applied_value !== undefined
  ) {
    return updatedData.applied_value;
  }
  return suggestion.suggested_value;
}

function isEmptyCrmValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

function normalizeForCompare(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function valuesMatch(currentValue, desiredValue) {
  return normalizeForCompare(currentValue) === normalizeForCompare(desiredValue);
}

function classifySuggestionApply(suggestion, currentValue) {
  const desiredValue = getDesiredValue(suggestion);
  if (isEmptyCrmValue(currentValue)) {
    return { action: 'apply_empty', desiredValue };
  }
  if (valuesMatch(currentValue, desiredValue)) {
    return { action: 'already_applied', desiredValue };
  }
  return { action: 'conflict', desiredValue };
}

function appendReviewNote(existing, note) {
  const current = existing || '';
  if (current.includes(note)) return current;
  return current ? `${current}\n${note}` : note;
}

function compactPreview(value, maxLen = 160) {
  const text = normalizeForCompare(value);
  return text.length > maxLen ? `${text.slice(0, maxLen)}...` : text;
}

async function loadAcceptedSuggestions(pool, { ids = [], limit = 100 } = {}) {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
  if (ids.length > 0) {
    const result = await pool.query(
      `SELECT * FROM suggested_updates
       WHERE id = ANY($1::int[])
         AND status = 'accepted'
         AND COALESCE(applied, false) = false
       ORDER BY reviewed_at ASC NULLS LAST, id ASC`,
      [ids.map((id) => parseInt(id, 10)).filter(Number.isInteger)]
    );
    return result.rows;
  }

  const result = await pool.query(
    `SELECT * FROM suggested_updates
     WHERE status = 'accepted'
       AND COALESCE(applied, false) = false
     ORDER BY reviewed_at ASC NULLS LAST, id ASC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows;
}

async function markSuggestion(pool, suggestion, { applied, applyData, reviewNote }) {
  const mergedData = {
    ...parseUpdatedData(suggestion.updated_data),
    ...applyData,
    apply_checked_at: new Date().toISOString(),
  };
  const nextReviewNotes = reviewNote
    ? appendReviewNote(suggestion.review_notes, reviewNote)
    : suggestion.review_notes;

  await pool.query(
    `UPDATE suggested_updates
     SET applied = CASE WHEN $2::boolean THEN true ELSE applied END,
         applied_at = CASE WHEN $2::boolean THEN COALESCE(applied_at, NOW()) ELSE applied_at END,
         current_value = $3,
         review_notes = $4,
         updated_data = $5::jsonb,
         updated_at = NOW()
     WHERE id = $1`,
    [
      suggestion.id,
      applied,
      applyData.current_value_at_apply === undefined ? null : normalizeForCompare(applyData.current_value_at_apply),
      nextReviewNotes || null,
      JSON.stringify(mergedData),
    ]
  );
}

async function fetchCurrentValue(pool, table, idCol, fieldName, entityId) {
  const result = await pool.query(
    `SELECT ${quoteIdentifier(fieldName)} AS current_value
     FROM ${quoteIdentifier(table)}
     WHERE ${quoteIdentifier(idCol)} = $1`,
    [entityId]
  );
  return result.rows[0];
}

async function updateEmptyTarget(pool, table, idCol, fieldName, entityId, desiredValue) {
  const timestampCol = TIMESTAMP_COL_BY_TABLE[table];
  const timestampClause = timestampCol ? `, ${quoteIdentifier(timestampCol)} = NOW()` : '';
  const result = await pool.query(
    `UPDATE ${quoteIdentifier(table)}
     SET ${quoteIdentifier(fieldName)} = $1${timestampClause}
     WHERE ${quoteIdentifier(idCol)} = $2
       AND (${quoteIdentifier(fieldName)} IS NULL OR BTRIM(${quoteIdentifier(fieldName)}::text) = '')
     RETURNING ${quoteIdentifier(fieldName)} AS applied_value`,
    [desiredValue, entityId]
  );
  return result.rowCount > 0;
}

async function applyOneSuggestion(pool, suggestion, { dryRun = false, actor = 'suggested-update-worker' } = {}) {
  let tableMeta;
  let fieldName;
  try {
    tableMeta = validateTable(suggestion.entity_type);
    fieldName = validateColumn(suggestion.field_name, tableMeta.table);
  } catch (err) {
    const applyData = {
      apply_status: 'error',
      apply_error: err.message,
      apply_actor: actor,
    };
    if (!dryRun) {
      await markSuggestion(pool, suggestion, {
        applied: false,
        applyData,
        reviewNote: `[auto-apply] Error: ${err.message}`,
      });
    }
    return { id: suggestion.id, outcome: 'error', error: err.message };
  }

  const row = await fetchCurrentValue(pool, tableMeta.table, tableMeta.idCol, fieldName, suggestion.entity_id);
  if (!row) {
    const applyData = {
      apply_status: 'target_missing',
      apply_actor: actor,
      table: tableMeta.table,
      field_name: fieldName,
    };
    if (!dryRun) {
      await markSuggestion(pool, suggestion, {
        applied: false,
        applyData,
        reviewNote: '[auto-apply] Target record missing; suggestion left unapplied.',
      });
    }
    return { id: suggestion.id, outcome: 'target_missing', table: tableMeta.table, field_name: fieldName };
  }

  const currentValue = row.current_value;
  const classification = classifySuggestionApply(suggestion, currentValue);
  const desiredValue = classification.desiredValue;
  const baseApplyData = {
    apply_actor: actor,
    table: tableMeta.table,
    field_name: fieldName,
    desired_value: normalizeForCompare(desiredValue),
    current_value_at_apply: currentValue,
  };

  if (classification.action === 'already_applied') {
    if (!dryRun) {
      await markSuggestion(pool, suggestion, {
        applied: true,
        applyData: {
          ...baseApplyData,
          apply_status: 'already_applied',
          apply_reason: 'target_already_had_value',
        },
        reviewNote: '[auto-apply] Marked applied; CRM already had the accepted value.',
      });
    }
    return { id: suggestion.id, outcome: 'already_applied', table: tableMeta.table, field_name: fieldName };
  }

  if (classification.action === 'conflict') {
    const note = `[auto-apply] needs_manual_overwrite_review: CRM has "${compactPreview(currentValue)}"; accepted value is "${compactPreview(desiredValue)}".`;
    if (!dryRun) {
      await markSuggestion(pool, suggestion, {
        applied: false,
        applyData: {
          ...baseApplyData,
          apply_status: 'needs_manual_overwrite_review',
          apply_reason: 'target_field_not_empty',
        },
        reviewNote: note,
      });
    }
    return {
      id: suggestion.id,
      outcome: 'conflict',
      table: tableMeta.table,
      field_name: fieldName,
      current_value: currentValue,
      desired_value: desiredValue,
    };
  }

  if (!dryRun) {
    const updated = await updateEmptyTarget(pool, tableMeta.table, tableMeta.idCol, fieldName, suggestion.entity_id, desiredValue);
    if (!updated) {
      const latest = await fetchCurrentValue(pool, tableMeta.table, tableMeta.idCol, fieldName, suggestion.entity_id);
      const latestValue = latest ? latest.current_value : currentValue;
      const note = `[auto-apply] needs_manual_overwrite_review: CRM changed before apply; current value is "${compactPreview(latestValue)}".`;
      await markSuggestion(pool, suggestion, {
        applied: false,
        applyData: {
          ...baseApplyData,
          current_value_at_apply: latestValue,
          apply_status: 'needs_manual_overwrite_review',
          apply_reason: 'target_changed_before_apply',
        },
        reviewNote: note,
      });
      return {
        id: suggestion.id,
        outcome: 'conflict',
        table: tableMeta.table,
        field_name: fieldName,
        current_value: latestValue,
        desired_value: desiredValue,
      };
    }

    await markSuggestion(pool, suggestion, {
      applied: true,
      applyData: {
        ...baseApplyData,
        apply_status: 'applied',
        apply_reason: 'target_field_empty',
      },
      reviewNote: '[auto-apply] Applied accepted value to empty CRM field.',
    });
  }

  return {
    id: suggestion.id,
    outcome: 'applied',
    table: tableMeta.table,
    field_name: fieldName,
    desired_value: desiredValue,
  };
}

function summarizeResults(results, dryRun) {
  const report = {
    ok: true,
    dry_run: !!dryRun,
    scanned: results.length,
    applied: 0,
    already_applied: 0,
    conflicts: 0,
    target_missing: 0,
    errors: 0,
    results,
  };
  for (const result of results) {
    if (result.outcome === 'applied') report.applied++;
    else if (result.outcome === 'already_applied') report.already_applied++;
    else if (result.outcome === 'conflict') report.conflicts++;
    else if (result.outcome === 'target_missing') report.target_missing++;
    else if (result.outcome === 'error') report.errors++;
  }
  return report;
}

async function applyAcceptedSuggestions(pool, options = {}) {
  const suggestions = await loadAcceptedSuggestions(pool, options);
  const results = [];
  for (const suggestion of suggestions) {
    try {
      results.push(await applyOneSuggestion(pool, suggestion, options));
    } catch (err) {
      results.push({ id: suggestion.id, outcome: 'error', error: err.message });
      if (!options.dryRun) {
        await markSuggestion(pool, suggestion, {
          applied: false,
          applyData: {
            apply_status: 'error',
            apply_error: err.message,
            apply_actor: options.actor || 'suggested-update-worker',
          },
          reviewNote: `[auto-apply] Error: ${err.message}`,
        });
      }
    }
  }
  return summarizeResults(results, options.dryRun);
}

module.exports = {
  applyAcceptedSuggestions,
  applyOneSuggestion,
  classifySuggestionApply,
  getDesiredValue,
  isEmptyCrmValue,
  normalizeForCompare,
  valuesMatch,
};
