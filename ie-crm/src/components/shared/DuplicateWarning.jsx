import React from 'react';

const CONFIDENCE_COLORS = {
  high: 'text-green-400',    // 90-100
  medium: 'text-yellow-400', // 70-89
  low: 'text-red-400',       // <70
};

function confidenceColor(c) {
  if (c >= 90) return CONFIDENCE_COLORS.high;
  if (c >= 70) return CONFIDENCE_COLORS.medium;
  return CONFIDENCE_COLORS.low;
}

function candidateLabel(candidate, entityType) {
  if (entityType === 'property') return candidate.address || candidate.name || 'Unknown';
  if (entityType === 'company') return candidate.name || 'Unknown';
  return candidate.name || candidate.email || 'Unknown';
}

function candidateSub(candidate, entityType) {
  if (entityType === 'property') return [candidate.city, candidate.zip].filter(Boolean).join(', ');
  if (entityType === 'company') return candidate.city || '';
  return [candidate.email, candidate.company].filter(Boolean).join(' · ');
}

export default function DuplicateWarning({ match, candidates, level, entityType, onUseExisting, onCreateAnyway, onBack }) {
  // If we have a direct match, show it prominently; otherwise show candidates
  const items = match
    ? [{ ...match, isMatch: true }, ...(candidates || []).filter(c => c.id !== match.id)]
    : (candidates || []);

  return (
    <div className="space-y-3">
      {/* Warning banner */}
      <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
        <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-yellow-300">Possible duplicate{items.length > 1 ? 's' : ''} found</p>
          <p className="text-xs text-crm-muted mt-0.5">
            {match
              ? `${match.confidence}% confidence match`
              : `${items.length} potential match${items.length > 1 ? 'es' : ''}`
            }
          </p>
        </div>
      </div>

      {/* Candidate list */}
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between p-2.5 bg-crm-bg border border-crm-border/50 rounded-lg">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-crm-text truncate">
                {candidateLabel(item, entityType)}
              </p>
              <p className="text-xs text-crm-muted truncate">
                {candidateSub(item, entityType)}
              </p>
              {item.confidence && (
                <span className={`text-xs ${confidenceColor(item.confidence)}`}>
                  {item.confidence}% match
                  {item.level ? ` (${item.level.replace(/_/g, ' ')})` : ''}
                </span>
              )}
            </div>
            <button
              onClick={() => onUseExisting(item.id)}
              className="ml-2 px-2.5 py-1 text-xs bg-crm-accent/20 text-crm-accent border border-crm-accent/30 rounded-md hover:bg-crm-accent/30 transition-colors flex-shrink-0"
            >
              Use This
            </button>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={onBack}
          className="px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text transition-colors"
        >
          Back
        </button>
        <button
          onClick={onCreateAnyway}
          className="px-4 py-1.5 text-sm bg-crm-bg border border-crm-border text-crm-text rounded-lg hover:bg-crm-border/50 transition-colors"
        >
          Create Anyway
        </button>
      </div>
    </div>
  );
}
