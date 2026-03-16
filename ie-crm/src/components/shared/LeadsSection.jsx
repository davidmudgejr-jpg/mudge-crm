import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getDealLeads, updateInteraction, searchContacts, linkRecords } from '../../api/database';
import Section from './Section';
import { useSlideOver } from './SlideOverContext';

const LEAD_SOURCES = ['CoStar', 'Loopnet', 'Sign Call', 'Referral', 'Website', 'Other'];
const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Dead'];
const LEAD_INTERESTS = ['Hot', 'Warm', 'Cold'];

const INTEREST_COLORS = {
  Hot: { border: 'border-l-yellow-400', bg: 'bg-yellow-500/10', text: 'text-yellow-400', icon: '🔥' },
  Warm: { border: 'border-l-green-400', bg: 'bg-green-500/10', text: 'text-green-400', icon: '🟢' },
  Cold: { border: 'border-l-blue-400', bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '❄️' },
};

const STATUS_COLORS = {
  New: 'bg-blue-500/15 text-blue-400',
  Contacted: 'bg-green-500/15 text-green-400',
  Qualified: 'bg-purple-500/15 text-purple-400',
  Dead: 'bg-gray-500/15 text-gray-400',
};

const SOURCE_COLORS = {
  CoStar: 'bg-blue-500/15 text-blue-400',
  Loopnet: 'bg-orange-500/15 text-orange-400',
  'Sign Call': 'bg-yellow-500/15 text-yellow-400',
  Referral: 'bg-purple-500/15 text-purple-400',
  Website: 'bg-cyan-500/15 text-cyan-400',
  Other: 'bg-gray-500/15 text-gray-400',
};

/* Mini inline contact search for linking a contact to a lead */
function ContactLinker({ interactionId, onLinked }) {
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setSearching(false);
        setTerm('');
        setResults([]);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const doSearch = async (q) => {
    if (!q || q.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await searchContacts(q);
      const arr = Array.isArray(res) ? res : (res?.rows || []);
      setResults(arr);
    } catch (err) {
      console.error('Contact search failed:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setTerm(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 250);
  };

  const handleSelect = async (contact) => {
    setLinking(true);
    try {
      await linkRecords('interaction_contacts', 'interaction_id', interactionId, 'contact_id', contact.contact_id);
      onLinked(contact.contact_id, contact.full_name);
      setSearching(false);
      setTerm('');
      setResults([]);
    } catch (err) {
      console.error('Failed to link contact:', err);
    } finally {
      setLinking(false);
    }
  };

  if (!searching) {
    return (
      <div>
        <label className="text-[10px] uppercase tracking-wider text-crm-muted mb-1 block">Contact</label>
        <button
          onClick={(e) => { e.stopPropagation(); setSearching(true); }}
          className="text-xs text-crm-accent hover:text-crm-accent-hover transition-colors flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Link Contact
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} onClick={(e) => e.stopPropagation()}>
      <label className="text-[10px] uppercase tracking-wider text-crm-muted mb-1 block">Contact</label>
      <div className="relative">
        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-crm-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={term}
          onChange={handleChange}
          autoFocus
          placeholder="Search contacts..."
          className="w-full bg-crm-card border border-crm-border rounded-md pl-7 pr-3 py-1.5 text-xs text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50"
        />
      </div>
      {term.length >= 2 && (
        <div className="mt-1 bg-crm-card border border-crm-border rounded-md shadow-xl max-h-32 overflow-auto">
          {loading && <p className="text-[10px] text-crm-muted px-3 py-2 text-center">Searching...</p>}
          {!loading && results.length === 0 && <p className="text-[10px] text-crm-muted px-3 py-2 text-center">No results</p>}
          {!loading && results.map((c) => (
            <button
              key={c.contact_id}
              type="button"
              disabled={linking}
              onClick={() => handleSelect(c)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-crm-hover transition-colors flex items-center justify-between"
            >
              <span className="font-medium truncate">{c.full_name}</span>
              {c.company_name && <span className="text-[10px] text-crm-muted ml-2 truncate">{c.company_name}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead, onUpdate, onRefresh }) {
  const { open } = useSlideOver();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const interest = INTEREST_COLORS[lead.lead_interest] || INTEREST_COLORS.Warm;
  const statusColor = STATUS_COLORS[lead.lead_status] || STATUS_COLORS.New;
  const sourceColor = SOURCE_COLORS[lead.lead_source] || SOURCE_COLORS.Other;

  const handleFieldChange = async (field, value) => {
    setSaving(true);
    try {
      await updateInteraction(lead.interaction_id, { [field]: value });
      onUpdate(lead.interaction_id, { ...lead, [field]: value });
    } catch (err) {
      console.error('Failed to update lead:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleContactLinked = (contactId, contactName) => {
    onUpdate(lead.interaction_id, { ...lead, contact_id: contactId, contact_name: contactName });
    onRefresh?.();
  };

  const formatDate = (d) => {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' });
  };

  return (
    <div
      className={`bg-crm-hover/50 rounded-lg border-l-[3px] ${interest.border} mb-2 transition-all duration-200 ${expanded ? 'ring-1 ring-crm-border' : 'hover:bg-crm-hover/80 cursor-pointer'}`}
    >
      {/* Collapsed summary — always visible */}
      <div
        className="p-3"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-crm-text truncate">
              {lead.contact_name || lead.subject || 'Unknown Contact'}
            </span>
            {expanded ? (
              <svg className="w-3 h-3 text-crm-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-3 h-3 text-crm-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>
          <span className="text-[10px] text-crm-muted flex-shrink-0 ml-2">{formatDate(lead.date)}</span>
        </div>

        {!expanded && lead.notes && (
          <p className="text-xs text-crm-muted mb-2 line-clamp-2">{lead.notes}</p>
        )}

        {!expanded && (
          <div className="flex flex-wrap gap-1.5">
            <span className={`text-[9px] font-medium px-2 py-0.5 rounded ${interest.bg} ${interest.text}`}>
              {interest.icon} {lead.lead_interest || 'Warm'}
            </span>
            <span className={`text-[9px] font-medium px-2 py-0.5 rounded ${statusColor}`}>
              {lead.lead_status || 'New'}
            </span>
            {lead.lead_source && (
              <span className={`text-[9px] font-medium px-2 py-0.5 rounded ${sourceColor}`}>
                {lead.lead_source}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded detail — editable fields */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-crm-border/30 pt-3 space-y-3">
          {/* Contact — clickable if linked, search to link if not */}
          {lead.contact_name && lead.contact_id ? (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-crm-muted mb-1 block">Contact</label>
              <button
                onClick={(e) => { e.stopPropagation(); open('contact', lead.contact_id); }}
                className="text-sm text-crm-accent hover:text-crm-accent-hover transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                {lead.contact_name}
              </button>
            </div>
          ) : (
            <ContactLinker
              interactionId={lead.interaction_id}
              onLinked={handleContactLinked}
            />
          )}

          {/* Editable dropdowns in 3-column grid */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-crm-muted mb-1 block">Interest</label>
              <select
                value={lead.lead_interest || 'Warm'}
                onChange={(e) => handleFieldChange('lead_interest', e.target.value)}
                onClick={(e) => e.stopPropagation()}
                disabled={saving}
                className="w-full bg-crm-card border border-crm-border rounded-md px-2 py-1.5 text-xs text-crm-text focus:outline-none focus:border-crm-accent/50"
              >
                {LEAD_INTERESTS.map((i) => (
                  <option key={i} value={i}>{INTEREST_COLORS[i]?.icon} {i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-crm-muted mb-1 block">Status</label>
              <select
                value={lead.lead_status || 'New'}
                onChange={(e) => handleFieldChange('lead_status', e.target.value)}
                onClick={(e) => e.stopPropagation()}
                disabled={saving}
                className="w-full bg-crm-card border border-crm-border rounded-md px-2 py-1.5 text-xs text-crm-text focus:outline-none focus:border-crm-accent/50"
              >
                {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-crm-muted mb-1 block">Source</label>
              <select
                value={lead.lead_source || ''}
                onChange={(e) => handleFieldChange('lead_source', e.target.value)}
                onClick={(e) => e.stopPropagation()}
                disabled={saving}
                className="w-full bg-crm-card border border-crm-border rounded-md px-2 py-1.5 text-xs text-crm-text focus:outline-none focus:border-crm-accent/50"
              >
                <option value="">--</option>
                {LEAD_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* Subject */}
          {lead.subject && (
            <div>
              <label className="text-[10px] uppercase tracking-wider text-crm-muted mb-1 block">Subject</label>
              <p className="text-xs text-crm-text">{lead.subject}</p>
            </div>
          )}

          {/* Notes — editable textarea */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-crm-muted mb-1 block">Notes</label>
            <textarea
              defaultValue={lead.notes || ''}
              onBlur={(e) => {
                if (e.target.value !== (lead.notes || '')) {
                  handleFieldChange('notes', e.target.value);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              placeholder="Add notes about this lead..."
              rows={3}
              className="w-full bg-crm-card border border-crm-border rounded-md px-2.5 py-2 text-xs text-crm-text placeholder-crm-muted focus:outline-none focus:border-crm-accent/50 resize-none"
            />
          </div>

          {saving && (
            <p className="text-[10px] text-crm-accent animate-pulse">Saving...</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function LeadsSection({ dealId, onAddLead, onRefresh }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);

  const loadLeads = useCallback(async () => {
    if (!dealId) return;
    try {
      const data = await getDealLeads(dealId);
      const arr = Array.isArray(data) ? data : (data?.rows || []);
      setLeads(arr);
    } catch (err) {
      console.error('Failed to load leads:', err);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const handleLeadUpdate = (id, updatedLead) => {
    setLeads((prev) => prev.map((l) => l.interaction_id === id ? updatedLead : l));
  };

  const filtered = filter ? leads.filter((l) => l.lead_interest === filter) : leads;

  const counts = { Hot: 0, Warm: 0, Cold: 0 };
  leads.forEach((l) => { if (counts[l.lead_interest] !== undefined) counts[l.lead_interest]++; });

  return (
    <Section
      title="Leads"
      badge={leads.length}
      defaultOpen={leads.length > 0}
      actions={
        <button
          onClick={onAddLead}
          className="text-xs text-crm-accent hover:text-crm-accent-hover transition-colors"
        >
          + Lead
        </button>
      }
    >
      {/* Interest filter pills */}
      {leads.length > 0 && (
        <div className="flex gap-1.5 mb-3">
          {Object.entries(INTEREST_COLORS).map(([level, style]) => {
            const count = counts[level];
            const active = filter === level;
            return (
              <button
                key={level}
                onClick={() => setFilter(active ? null : level)}
                className={`text-[10px] font-medium px-2.5 py-1 rounded-full transition-all ${
                  active
                    ? `${style.bg} ${style.text} ring-1 ring-current`
                    : 'bg-crm-hover text-crm-muted hover:text-crm-text'
                }`}
              >
                {style.icon} {level} ({count})
              </button>
            );
          })}
        </div>
      )}

      {loading && (
        <p className="text-xs text-crm-muted py-3 text-center">Loading leads...</p>
      )}

      {!loading && leads.length === 0 && (
        <p className="text-xs text-crm-muted py-3 text-center">No leads yet</p>
      )}

      {!loading && filtered.map((lead) => (
        <LeadCard
          key={lead.interaction_id}
          lead={lead}
          onUpdate={handleLeadUpdate}
          onRefresh={() => { loadLeads(); onRefresh?.(); }}
        />
      ))}
    </Section>
  );
}
