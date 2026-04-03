import React from 'react';

const CONFIDENCE_COLORS = {
  high: 'bg-red-500/15 text-red-400 border-red-500/30',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  low: 'bg-green-500/15 text-green-400 border-green-500/30',
};

const MATCH_TYPE_LABELS = {
  exact_normalized: 'Exact Address',
  fuzzy_address_sf: 'Fuzzy Address',
  same_name_city: 'Same Name + City',
  same_parcel: 'Same Parcel',
  exact_email: 'Exact Email',
  same_name_company: 'Same Name + Company',
  same_name_phone: 'Same Name + Phone',
  exact_normalized_name: 'Exact Name',
  fuzzy_name: 'Fuzzy Name',
};

/**
 * Compact card showing a cluster of duplicate records.
 * Clicking opens the MergeWorkspace in a SlideOver.
 */
export default function ClusterCard({ cluster, entityType, displayCol, isActive, onOpen, onDismiss, onDefer }) {
  const { entities, confidence, matchTypes } = cluster;
  const isPending = true; // clusters only shown for pending

  return (
    <div
      className={`rounded-xl border p-4 transition-all cursor-pointer ${
        isActive
          ? 'border-crm-accent bg-crm-accent/5 ring-1 ring-crm-accent/30'
          : 'border-crm-border bg-crm-card hover:border-crm-accent/40'
      }`}
      onClick={onOpen}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${CONFIDENCE_COLORS[confidence] || CONFIDENCE_COLORS.medium}`}>
            {(confidence || 'medium').toUpperCase()}
          </span>
          {matchTypes.map(mt => (
            <span key={mt} className="text-[10px] text-crm-muted bg-crm-deep/50 px-1.5 py-0.5 rounded">
              {MATCH_TYPE_LABELS[mt] || mt}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-crm-muted font-medium">
          {entities.length} records
        </span>
      </div>

      {/* Entity pills */}
      <div className="flex flex-wrap gap-2 mb-3">
        {entities.map((entity, i) => (
          <div
            key={entity[entityType === 'property' ? 'property_id' : entityType === 'contact' ? 'contact_id' : 'company_id']}
            className="flex items-center gap-2 bg-crm-deep/40 border border-crm-border/50 rounded-lg px-3 py-2 text-xs flex-1 min-w-[200px]"
          >
            <span className="text-crm-muted text-[10px] font-bold shrink-0">
              {String.fromCharCode(65 + i)}
            </span>
            <div className="truncate">
              <div className="text-crm-text font-medium truncate">
                {entity[displayCol] || 'No name'}
              </div>
              {entityType === 'property' && entity.city && (
                <div className="text-crm-muted text-[10px] truncate">
                  {[entity.city, entity.property_type].filter(Boolean).join(' · ')}
                  {entity.rba ? ` · ${Number(entity.rba).toLocaleString()} SF` : ''}
                </div>
              )}
              {entityType === 'contact' && (
                <div className="text-crm-muted text-[10px] truncate">
                  {[entity.title, entity.email].filter(Boolean).join(' · ')}
                </div>
              )}
              {entityType === 'company' && (
                <div className="text-crm-muted text-[10px] truncate">
                  {[entity.company_type, entity.city].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            {entity._linkedCounts?.total > 0 && (
              <span className="text-[10px] text-crm-muted bg-crm-card px-1.5 py-0.5 rounded shrink-0">
                {entity._linkedCounts.total} linked
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Action buttons */}
      {isPending && (
        <div className="flex items-center gap-2 pt-1">
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="text-[11px] font-medium text-crm-accent hover:text-crm-accent/80 transition-colors"
          >
            Review & merge
          </button>
          <span className="text-crm-border">|</span>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="text-[11px] text-crm-muted hover:text-crm-text transition-colors"
          >
            Not dupes
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDefer(); }}
            className="text-[11px] text-crm-muted hover:text-crm-text transition-colors"
          >
            Later
          </button>
        </div>
      )}
    </div>
  );
}
