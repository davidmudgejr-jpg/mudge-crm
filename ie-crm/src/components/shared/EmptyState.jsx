import React from 'react';

const ENTITY_ICONS = {
  properties: {
    gradient: ['#007AFF', '#AF52DE'],
    path: 'M3 21V7l9-4 9 4v14M3 21h18M9 21v-6h6v6M7 11h2m6 0h2M7 15h2m6 0h2',
  },
  contacts: {
    gradient: ['#007AFF', '#5AC8FA'],
    path: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  companies: {
    gradient: ['#AF52DE', '#BF5AF2'],
    path: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  deals: {
    gradient: ['#30D158', '#5AC8FA'],
    path: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  interactions: {
    gradient: ['#FF9F0A', '#FFD60A'],
    path: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
  campaigns: {
    gradient: ['#FF375F', '#FF6482'],
    path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  },
  tasks: {
    gradient: ['#007AFF', '#30D158'],
    path: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  comps: {
    gradient: ['#5AC8FA', '#007AFF'],
    path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  search: {
    gradient: ['#007AFF', '#AF52DE'],
    path: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  },
};

function GradientIcon({ entity, size = 48 }) {
  const { gradient, path } = ENTITY_ICONS[entity] || ENTITY_ICONS.properties;
  const gradientId = `gradient-${entity}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={gradient[0]} />
          <stop offset="100%" stopColor={gradient[1]} />
        </linearGradient>
      </defs>
      <path
        d={path}
        stroke={`url(#${gradientId})`}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function EmptyState({ entity, entityLabel, onAdd, addLabel }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <GradientIcon entity={entity} size={48} />
      <p className="text-sm font-medium text-crm-text">No {entityLabel} yet</p>
      <p className="text-xs text-crm-muted">Add your first {entityLabel.toLowerCase()} to get started</p>
      {onAdd && (
        <button onClick={onAdd} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 mt-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {addLabel || `Add ${entityLabel}`}
        </button>
      )}
    </div>
  );
}

export function InlineEmptyState({ entity, entityLabel, onLink }) {
  return (
    <div className="flex items-center gap-2 py-2 px-1">
      <GradientIcon entity={entity} size={24} />
      <span className="text-[11px] text-crm-muted">No linked {entityLabel.toLowerCase()}</span>
      {onLink && (
        <button onClick={onLink} className="text-[11px] text-crm-accent hover:underline ml-auto">
          Link
        </button>
      )}
    </div>
  );
}

export function SearchEmptyState({ query }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-2">
      <GradientIcon entity="search" size={32} />
      <p className="text-[13px] text-crm-text">No results for &lsquo;{query}&rsquo;</p>
      <p className="text-[11px] text-crm-muted">Try a different search term</p>
    </div>
  );
}

export { GradientIcon, ENTITY_ICONS };
