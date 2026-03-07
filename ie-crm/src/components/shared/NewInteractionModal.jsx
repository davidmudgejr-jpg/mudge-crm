import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createInteraction, linkRecords, searchContacts, searchCompanies, searchProperties, searchDeals } from '../../api/database';
import ENTITY_TYPES from '../../config/entityTypes';
import { INTERACTION_TYPES } from '../../config/typeIcons';
import { todayPacific } from '../../utils/timezone';

const LINK_TYPES = [
  { key: 'contact', label: 'Contact', searchFn: searchContacts },
  { key: 'property', label: 'Property', searchFn: searchProperties },
  { key: 'company', label: 'Company', searchFn: searchCompanies },
  { key: 'deal', label: 'Deal', searchFn: searchDeals },
];

function InlineSearch({ entityType, searchFn, selected, onSelect, onRemove }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);
  const meta = ENTITY_TYPES[entityType];

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const rows = await searchFn(q);
      // Ensure we always have an array — handle both array and {rows} shapes
      const arr = Array.isArray(rows) ? rows : (rows?.rows || []);
      setResults(arr);
      setHighlighted(0);
    } catch (err) {
      console.error(`Search ${entityType} failed:`, err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [searchFn, entityType]);

  const handleChange = (e) => {
    const val = e.target.value;
    setTerm(val);
    setOpen(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const handleSelect = (row) => {
    if (!row || !meta) return;
    onSelect({ id: row[meta.idCol], label: row[meta.displayCol] || 'Unnamed' });
    setTerm('');
    setResults([]);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlighted((h) => Math.min(h + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlighted((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && results[highlighted]) { e.preventDefault(); handleSelect(results[highlighted]); }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-xs text-crm-muted mb-1">{meta?.label || entityType}</label>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map((s) => (
            <span key={s.id} className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border ${meta.chipColor}`}>
              {s.label}
              <button type="button" onClick={() => onRemove(s.id)} className="hover:opacity-70">&times;</button>
            </span>
          ))}
        </div>
      )}
      {/* Search input */}
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={term}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (term.length >= 2) setOpen(true); }}
          placeholder={`Search ${meta?.labelPlural || 'records'}...`}
          className="w-full bg-crm-bg border border-crm-border rounded-lg pl-7 pr-3 py-1.5 text-xs text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
        />
      </div>
      {/* Dropdown */}
      {open && (term.length >= 2) && (
        <div className="absolute z-10 mt-1 w-full bg-crm-card border border-crm-border rounded-lg shadow-xl max-h-40 overflow-auto">
          {loading && <p className="text-[10px] text-crm-muted px-3 py-2 text-center">Searching...</p>}
          {!loading && results.length === 0 && <p className="text-[10px] text-crm-muted px-3 py-2 text-center">No results</p>}
          {!loading && results.map((row, i) => {
            const id = row[meta.idCol];
            const display = row[meta.displayCol] || 'Unnamed';
            const secondary = meta.secondaryCol ? row[meta.secondaryCol] : null;
            const alreadyLinked = selected.some((s) => s.id === id);
            return (
              <button
                key={id || i}
                type="button"
                disabled={alreadyLinked}
                onClick={() => handleSelect(row)}
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${
                  alreadyLinked ? 'opacity-40 cursor-not-allowed' : i === highlighted ? 'bg-crm-accent/10' : 'hover:bg-crm-hover'
                }`}
              >
                <span className="truncate font-medium">{display}</span>
                {secondary && <span className="text-[10px] text-crm-muted ml-2 truncate">{secondary}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function NewInteractionModal({ onCreated, onClose, initialLinks }) {
  const [type, setType] = useState('');
  const [subject, setSubject] = useState('');
  const [date, setDate] = useState(todayPacific());
  const [notes, setNotes] = useState('');
  const [links, setLinks] = useState(() => {
    const base = { contact: [], property: [], company: [], deal: [] };
    if (initialLinks) {
      for (const [key, items] of Object.entries(initialLinks)) {
        if (base[key] && Array.isArray(items)) base[key] = items;
      }
    }
    return base;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const firstRef = useRef(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  const totalLinks = Object.values(links).reduce((sum, arr) => sum + arr.length, 0);

  const handleLinkSelect = (entityKey, item) => {
    setLinks((prev) => ({ ...prev, [entityKey]: [...prev[entityKey], item] }));
    setError(null);
  };

  const handleLinkRemove = (entityKey, id) => {
    setLinks((prev) => ({ ...prev, [entityKey]: prev[entityKey].filter((l) => l.id !== id) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!type) { setError('Type is required'); return; }
    if (!subject.trim()) { setError('Subject is required'); return; }

    setSaving(true);
    setError(null);
    try {
      const fields = { type, subject: subject.trim(), date };
      if (notes.trim()) fields.notes = notes.trim();

      const result = await createInteraction(fields);
      const row = result?.rows?.[0] || result;
      const interactionId = row?.interaction_id;
      if (!interactionId) throw new Error('Failed to get interaction ID');

      // Create junction links (if any selected)
      const linkPromises = [];
      for (const item of links.contact) {
        linkPromises.push(linkRecords('interaction_contacts', 'interaction_id', interactionId, 'contact_id', item.id));
      }
      for (const item of links.property) {
        linkPromises.push(linkRecords('interaction_properties', 'interaction_id', interactionId, 'property_id', item.id));
      }
      for (const item of links.company) {
        linkPromises.push(linkRecords('interaction_companies', 'interaction_id', interactionId, 'company_id', item.id));
      }
      for (const item of links.deal) {
        linkPromises.push(linkRecords('interaction_deals', 'interaction_id', interactionId, 'deal_id', item.id));
      }
      if (linkPromises.length > 0) {
        await Promise.all(linkPromises);
      }

      onCreated(interactionId);
    } catch (err) {
      console.error('Create interaction failed:', err);
      setError(err.message || 'Failed to create interaction');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative bg-crm-card border border-crm-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-4 py-3 border-b border-crm-border flex items-center justify-between flex-shrink-0">
          <h3 className="text-sm font-semibold">New Interaction</h3>
          <button onClick={onClose} className="text-crm-muted hover:text-crm-text transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {/* Type */}
            <div>
              <label className="block text-xs text-crm-muted mb-1">Type <span className="text-red-400">*</span></label>
              <select
                ref={firstRef}
                value={type}
                onChange={(e) => { setType(e.target.value); setError(null); }}
                className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
              >
                <option value="">Select...</option>
                {INTERACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-xs text-crm-muted mb-1">Subject <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={subject}
                onChange={(e) => { setSubject(e.target.value); setError(null); }}
                placeholder="Follow-up call"
                className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs text-crm-muted mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs text-crm-muted mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Details..."
                rows={3}
                className="w-full bg-crm-bg border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50 resize-none"
              />
            </div>

            {/* Divider */}
            <div className="border-t border-crm-border pt-3">
              <p className="text-xs font-medium text-crm-text mb-0.5">Linked Records</p>
              <p className="text-[10px] text-crm-muted mb-3">Optional — link to contacts, properties, companies, or deals</p>
            </div>

            {/* Link pickers */}
            {LINK_TYPES.map((lt) => (
              <InlineSearch
                key={lt.key}
                entityType={lt.key}
                searchFn={lt.searchFn}
                selected={links[lt.key]}
                onSelect={(item) => handleLinkSelect(lt.key, item)}
                onRemove={(id) => handleLinkRemove(lt.key, id)}
              />
            ))}
          </div>

          {/* Error + Footer */}
          <div className="px-4 py-3 border-t border-crm-border flex-shrink-0">
            {error && <p className="text-xs text-red-400 mb-2">{error}</p>}
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-crm-muted">
                {totalLinks > 0 ? `${totalLinks} linked record${totalLinks > 1 ? 's' : ''}` : 'No records linked'}
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-crm-muted hover:text-crm-text transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-1.5 text-sm bg-crm-accent text-white rounded-lg hover:bg-crm-accent/90 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
