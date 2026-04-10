import React, { useState, useEffect, useRef, useCallback } from 'react';
import { searchContacts, searchCompanies, searchProperties, searchDeals, searchCampaigns } from '../../api/database';
import ENTITY_TYPES from '../../config/entityTypes';
import QuickAddModal from './QuickAddModal';

const SEARCH_FNS = {
  contact: searchContacts,
  company: searchCompanies,
  property: searchProperties,
  deal: searchDeals,
  campaign: searchCampaigns,
};

export default function LinkPickerModal({ entityType, onLink, onClose }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const meta = ENTITY_TYPES[entityType];
  const searchFn = SEARCH_FNS[entityType];

  useEffect(() => {
    if (!showCreate) inputRef.current?.focus();
  }, [showCreate]);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2 || !searchFn) { setResults([]); return; }
    setLoading(true);
    try {
      const rows = await searchFn(q);
      // Defensive: handle both array and {rows} shapes
      const arr = Array.isArray(rows) ? rows : (rows?.rows || []);
      setResults(arr);
      setHighlighted(0);
    } catch (err) {
      console.error(`Link search ${entityType} failed:`, err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchFn]);

  const handleChange = (e) => {
    const val = e.target.value;
    setTerm(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const handleSelect = (row) => {
    if (!row || !meta) return;
    const id = row[meta.idCol];
    if (id) onLink(id);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && results[highlighted]) { e.preventDefault(); handleSelect(results[highlighted]); }
    else if (e.key === 'Escape') { showCreate ? setShowCreate(false) : onClose(); }
  };

  // When QuickAddModal creates a record, link it and close
  const handleCreated = (newId) => {
    if (newId) onLink(newId);
  };

  const noResults = !loading && term.length >= 2 && results.length === 0;

  // If user switched to create mode, show QuickAddModal
  if (showCreate) {
    return <QuickAddModal entityType={entityType} onCreated={handleCreated} onClose={() => setShowCreate(false)} />;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 animate-fade-in" />
      <div className="relative bg-crm-card border border-crm-border/50 rounded-2xl shadow-2xl w-full max-w-md animate-sheet-down" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-crm-border">
          <h3 className="text-sm font-semibold">Link {meta?.label || entityType}</h3>
        </div>

        {/* Search input */}
        <div className="px-4 py-3">
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={term}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={`Search ${meta?.labelPlural || 'records'}...`}
              className="w-full bg-crm-bg border border-crm-border rounded-lg pl-8 pr-3 py-2 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-60 overflow-auto px-2 pb-2">
          {loading && (
            <p className="text-xs text-crm-muted px-2 py-3 text-center">Searching...</p>
          )}
          {noResults && (
            <div className="px-2 py-3 text-center">
              <p className="text-xs text-crm-muted mb-2">No results found</p>
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-crm-accent hover:text-crm-accent-hover border border-crm-accent/30 hover:border-crm-accent/50 rounded-lg transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create New {meta?.label || entityType}
              </button>
            </div>
          )}
          {!loading && results.map((row, i) => {
            const display = row[meta.displayCol] || 'Unnamed';
            const secondary = meta.secondaryCol ? row[meta.secondaryCol] : null;
            return (
              <button
                key={row[meta.idCol] || i}
                onClick={() => handleSelect(row)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between transition-colors ${
                  i === highlighted ? 'bg-crm-accent/10 text-crm-text' : 'text-crm-text hover:bg-crm-hover'
                }`}
              >
                <span className="truncate font-medium">{display}</span>
                {secondary && <span className="text-xs text-crm-muted ml-2 truncate">{secondary}</span>}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-crm-border flex justify-between items-center">
          <button
            onClick={() => setShowCreate(true)}
            className="text-xs text-crm-accent hover:text-crm-accent-hover transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Create New
          </button>
          <button onClick={onClose} className="text-xs text-crm-muted hover:text-crm-text transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}
