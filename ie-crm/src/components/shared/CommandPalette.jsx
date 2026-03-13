import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { searchProperties, searchContacts, searchCompanies, searchDeals, searchCampaigns } from '../../api/database';
import { useSlideOver } from './SlideOverContext';

const GROUPS = [
  { key: 'properties', label: 'Properties', searchFn: searchProperties, idCol: 'property_id', nameCol: 'property_address', entityType: 'property', secondary: (r) => [r.property_name, r.city].filter(Boolean).join(' \u00b7 ') },
  { key: 'contacts', label: 'Contacts', searchFn: searchContacts, idCol: 'contact_id', nameCol: 'full_name', entityType: 'contact', secondary: (r) => r.email || r.phone_1 || '' },
  { key: 'companies', label: 'Companies', searchFn: searchCompanies, idCol: 'company_id', nameCol: 'company_name', entityType: 'company', secondary: (r) => r.city || '' },
  { key: 'deals', label: 'Deals', searchFn: searchDeals, idCol: 'deal_id', nameCol: 'deal_name', entityType: 'deal', secondary: (r) => [r.deal_type, r.status].filter(Boolean).join(' \u00b7 ') },
  { key: 'campaigns', label: 'Campaigns', searchFn: searchCampaigns, idCol: 'campaign_id', nameCol: 'name', entityType: 'campaign', secondary: (r) => [r.type, r.status].filter(Boolean).join(' \u00b7 ') },
];

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const slideOver = useSlideOver();

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const allResults = await Promise.all(
          GROUPS.map(async (g) => {
            try {
              const rows = await g.searchFn(query.trim());
              return { ...g, rows: rows || [] };
            } catch {
              return { ...g, rows: [] };
            }
          })
        );
        // Flatten into a list with group headers
        const flat = [];
        for (const group of allResults) {
          if (group.rows.length === 0) continue;
          flat.push({ type: 'header', label: group.label, key: group.key });
          for (const row of group.rows.slice(0, 5)) {
            flat.push({
              type: 'result',
              id: row[group.idCol],
              name: row[group.nameCol] || 'Untitled',
              secondary: group.secondary(row),
              entityType: group.entityType,
            });
          }
        }
        setResults(flat);
        setActiveIndex(flat.length > 0 ? (flat[0].type === 'header' ? 1 : 0) : -1);
      } catch (err) {
        console.error('Command palette search error:', err);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => {
        let next = prev + 1;
        while (next < results.length && results[next]?.type === 'header') next++;
        return next < results.length ? next : prev;
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => {
        let next = prev - 1;
        while (next >= 0 && results[next]?.type === 'header') next--;
        return next >= 0 ? next : prev;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = results[activeIndex];
      if (item && item.type === 'result') {
        slideOver.open(item.entityType, item.id);
        onClose();
      }
      return;
    }
  }, [results, activeIndex, onClose, slideOver]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current && activeIndex >= 0) {
      const el = listRef.current.children[activeIndex];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 animate-fade-in" />
      <div
        className="relative w-[560px] max-h-[60vh] bg-crm-card/95 glass-modal border border-crm-border/50 rounded-2xl shadow-2xl animate-sheet-down overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-crm-border/30">
          <svg className="w-5 h-5 text-crm-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search properties, contacts, companies, deals..."
            className="flex-1 bg-transparent text-base text-crm-text placeholder-crm-muted focus:outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-crm-accent/30 border-t-crm-accent rounded-full animate-spin" />
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto max-h-[calc(60vh-56px)]">
          {results.length === 0 && query.trim() && !loading && (
            <div className="px-4 py-8 text-center text-crm-muted text-sm">
              No results found
            </div>
          )}
          {results.length === 0 && !query.trim() && (
            <div className="px-4 py-8 text-center text-crm-muted text-sm">
              Type to search across all records...
            </div>
          )}
          {results.map((item, idx) => {
            if (item.type === 'header') {
              return (
                <div key={`${item.key}-header`} className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-crm-muted">
                  {item.label}
                </div>
              );
            }
            const isActive = idx === activeIndex;
            return (
              <button
                key={`${item.entityType}-${item.id}`}
                onClick={() => {
                  slideOver.open(item.entityType, item.id);
                  onClose();
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full text-left px-4 py-2 flex items-center justify-between transition-colors ${
                  isActive ? 'bg-crm-accent/15' : 'hover:bg-crm-hover'
                }`}
              >
                <span className={`text-sm truncate ${isActive ? 'text-crm-accent' : 'text-crm-text'}`}>
                  {item.name}
                </span>
                {item.secondary && (
                  <span className="text-xs text-crm-muted ml-3 truncate flex-shrink-0 max-w-[200px]">
                    {item.secondary}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-crm-border/30 flex items-center gap-4 text-[10px] text-crm-muted">
          <span><kbd className="px-1 py-0.5 bg-crm-bg rounded text-[9px]">&uarr;&darr;</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 bg-crm-bg rounded text-[9px]">&crarr;</kbd> open</span>
          <span><kbd className="px-1 py-0.5 bg-crm-bg rounded text-[9px]">esc</kbd> close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
