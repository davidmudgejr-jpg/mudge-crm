import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function authHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

const TYPE_COLORS = {
  contact: '#3B82F6',
  company: '#10B981',
  property: '#F59E0B',
  deal: '#8B5CF6',
  market: '#6B7280',
  decision: '#EF4444',
};

export default function KnowledgeSearch({ onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const listRef = useRef(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Debounced search
  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/knowledge/search?q=${encodeURIComponent(q)}`,
        { headers: authHeaders() }
      );
      if (res.ok) {
        const data = await res.json();
        setResults(data.results || data || []);
        setActiveIndex(0);
      }
    } catch {
      // Silently fail on network errors during typeahead
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (e) => {
      const val = e.target.value;
      setQuery(val);
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(val), 300);
    },
    [doSearch]
  );

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  const handleSelect = useCallback(
    (item) => {
      if (onSelect) onSelect(item.slug);
      onClose();
    },
    [onSelect, onClose]
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results.length > 0) {
        e.preventDefault();
        handleSelect(results[activeIndex]);
      }
    },
    [results, activeIndex, handleSelect]
  );

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.children[activeIndex];
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  return (
    <div className="absolute inset-x-0 top-0 z-50 flex justify-center pt-16 px-4">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Search panel */}
      <div
        className="relative w-full max-w-lg bg-crm-card border border-crm-border rounded-lg shadow-xl overflow-hidden"
        style={{ maxHeight: '70vh' }}
      >
        {/* Input */}
        <div className="flex items-center px-4 py-3 border-b border-crm-border">
          <svg
            className="text-crm-muted mr-2 flex-shrink-0"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search knowledge nodes..."
            className="flex-1 bg-transparent text-sm text-crm-text placeholder:text-crm-muted focus:outline-none"
          />
          {loading && (
            <svg className="animate-spin text-crm-muted ml-2" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="8" cy="8" r="6" opacity="0.25" />
              <path d="M14 8a6 6 0 0 0-6-6" />
            </svg>
          )}
        </div>

        {/* Results */}
        <div ref={listRef} className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 56px)' }}>
          {results.length === 0 && query.length >= 2 && !loading && (
            <div className="px-4 py-6 text-center text-sm text-crm-muted">
              No results found
            </div>
          )}
          {results.map((item, idx) => (
            <button
              key={item.slug}
              onClick={() => handleSelect(item)}
              className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors ${
                idx === activeIndex ? 'bg-crm-hover' : 'hover:bg-crm-hover'
              }`}
            >
              {/* Type badge */}
              <span
                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 mt-0.5"
                style={{
                  backgroundColor: (TYPE_COLORS[item.type] || '#9CA3AF') + '22',
                  color: TYPE_COLORS[item.type] || '#9CA3AF',
                }}
              >
                {item.type}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-crm-text font-medium truncate">
                  {item.title}
                </div>
                {item.summary && (
                  <div className="text-xs text-crm-muted truncate mt-0.5">
                    {item.summary}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-crm-border flex items-center gap-4 text-[10px] text-crm-muted">
          <span>
            <kbd className="px-1 py-0.5 rounded bg-crm-hover text-crm-muted">Up</kbd> /{' '}
            <kbd className="px-1 py-0.5 rounded bg-crm-hover text-crm-muted">Down</kbd> navigate
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-crm-hover text-crm-muted">Enter</kbd> select
          </span>
          <span>
            <kbd className="px-1 py-0.5 rounded bg-crm-hover text-crm-muted">Esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
