import React, { useState, useEffect, useRef, useCallback } from 'react';
import { searchContacts, searchCompanies, searchProperties, searchDeals, searchCampaigns } from '../../api/database';
import ENTITY_TYPES from '../../config/entityTypes';

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
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const meta = ENTITY_TYPES[entityType];
  const searchFn = SEARCH_FNS[entityType];

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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
    else if (e.key === 'Escape') { onClose(); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-crm-card/95 border border-crm-border/50 rounded-2xl shadow-2xl glass-modal w-full max-w-md" onClick={(e) => e.stopPropagation()}>
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
          {!loading && term.length >= 2 && results.length === 0 && (
            <p className="text-xs text-crm-muted px-2 py-3 text-center">No results found</p>
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

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-crm-border flex justify-between items-center">
          <span className="text-[10px] text-crm-muted">Type at least 2 characters to search</span>
          <button onClick={onClose} className="text-xs text-crm-muted hover:text-crm-text transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}
