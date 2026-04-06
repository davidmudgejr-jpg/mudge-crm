import React, { useState, useCallback } from 'react';

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'contact', label: 'Contact' },
  { value: 'company', label: 'Company' },
  { value: 'property', label: 'Property' },
  { value: 'deal', label: 'Deal' },
  { value: 'market', label: 'Market' },
  { value: 'decision', label: 'Decision' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'stale', label: 'Stale' },
  { value: 'archive', label: 'Archive' },
];

function SelectDropdown({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1.5 text-xs rounded border border-crm-border bg-crm-card text-crm-text
                 focus:outline-none focus:border-crm-accent appearance-none cursor-pointer"
      style={{ minWidth: 100 }}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export default function KnowledgeToolbar({
  filters,
  onFilterChange,
  stats,
  onRefresh,
  onToggleInbox,
  refreshing,
  onSearchFocus,
}) {
  const [searchValue, setSearchValue] = useState(filters?.search || '');

  const handleSearchChange = useCallback(
    (e) => {
      const val = e.target.value;
      setSearchValue(val);
      // Debounce is handled by the parent via filter updates
      if (onFilterChange) onFilterChange({ search: val });
    },
    [onFilterChange]
  );

  const handleSearchFocus = useCallback(() => {
    if (onSearchFocus) onSearchFocus();
  }, [onSearchFocus]);

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-crm-border bg-crm-card flex-shrink-0">
      {/* Search input */}
      <div className="relative flex-shrink-0" style={{ width: 220 }}>
        <input
          type="text"
          value={searchValue}
          onChange={handleSearchChange}
          onFocus={handleSearchFocus}
          placeholder="Search knowledge..."
          className="w-full pl-8 pr-3 py-1.5 text-xs rounded border border-crm-border bg-crm-bg text-crm-text
                     placeholder:text-crm-muted focus:outline-none focus:border-crm-accent"
        />
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
        </svg>
      </div>

      {/* Type filter */}
      <SelectDropdown
        value={filters?.type || ''}
        options={TYPE_OPTIONS}
        onChange={(val) => onFilterChange({ type: val })}
      />

      {/* Status filter */}
      <SelectDropdown
        value={filters?.status || ''}
        options={STATUS_OPTIONS}
        onChange={(val) => onFilterChange({ status: val })}
      />

      {/* Show Stale toggle */}
      <label className="flex items-center gap-1.5 text-xs text-crm-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filters?.status === 'stale'}
          onChange={(e) => onFilterChange({ status: e.target.checked ? 'stale' : '' })}
          className="w-3.5 h-3.5 rounded border-crm-border bg-crm-bg accent-crm-accent"
        />
        Stale
      </label>

      <div className="flex-1" />

      {/* Refresh */}
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="p-1.5 rounded hover:bg-crm-hover text-crm-muted hover:text-crm-text transition-colors disabled:opacity-50"
        title="Refresh graph"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="currentColor"
          className={refreshing ? 'animate-spin' : ''}
        >
          <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 1 1 .908-.418A6 6 0 1 1 8 2v1z" />
          <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z" />
        </svg>
      </button>

      {/* Inbox */}
      <button
        onClick={onToggleInbox}
        className="relative p-1.5 rounded hover:bg-crm-hover text-crm-muted hover:text-crm-text transition-colors"
        title="Review inbox"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4.98 4a.5.5 0 0 0-.39.188L1.54 8H6a.5.5 0 0 1 .5.5 1.5 1.5 0 1 0 3 0A.5.5 0 0 1 10 8h4.46l-3.05-3.812A.5.5 0 0 0 11.02 4H4.98zm9.954 5H10.45a2.5 2.5 0 0 1-4.9 0H1.066l.32 2.562a.5.5 0 0 0 .497.438h12.234a.5.5 0 0 0 .496-.438L14.933 9zM3.809 3.563A1.5 1.5 0 0 1 4.981 3h6.038a1.5 1.5 0 0 1 1.172.563l3.7 4.625a.5.5 0 0 1 .105.374l-.39 3.124A1.5 1.5 0 0 1 14.117 13H1.883a1.5 1.5 0 0 1-1.489-1.314l-.39-3.124a.5.5 0 0 1 .106-.375l3.7-4.624z" />
        </svg>
        {stats?.pending > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {stats.pending > 99 ? '99+' : stats.pending}
          </span>
        )}
      </button>
    </div>
  );
}
