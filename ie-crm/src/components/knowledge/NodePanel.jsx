import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSlideOver } from '../shared/SlideOverContext';

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

const STATUS_COLORS = {
  active: '#10B981',
  stale: '#F59E0B',
  archive: '#6B7280',
  pending: '#3B82F6',
};

const ENTITY_MAP = {
  contact: 'contacts',
  company: 'companies',
  property: 'properties',
  deal: 'deals',
};

const TABS = ['Context', 'History', 'Open Questions', 'Decisions', 'CRM Data', 'Connections'];

// Simple markdown section parser: splits by ## headers
function parseSections(content) {
  if (!content) return {};
  const sections = {};
  let currentKey = '_intro';
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^##\s+(.+)$/);
    if (match) {
      currentKey = match[1].trim();
      sections[currentKey] = '';
    } else {
      sections[currentKey] = (sections[currentKey] || '') + line + '\n';
    }
  }
  // Trim trailing whitespace from each section
  for (const k of Object.keys(sections)) {
    sections[k] = sections[k].trim();
  }
  return sections;
}

function Badge({ label, color }) {
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-xs font-medium"
      style={{ backgroundColor: color + '22', color }}
    >
      {label}
    </span>
  );
}

function TagChip({ tag }) {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-crm-hover text-crm-muted border border-crm-border">
      {tag}
    </span>
  );
}

function ShimmerLine({ width = '100%' }) {
  return (
    <div
      className="h-4 rounded bg-crm-hover animate-pulse mb-2"
      style={{ width }}
    />
  );
}

function SectionBlock({ title, content }) {
  if (!content) return null;
  return (
    <div className="mb-4">
      <h4 className="text-xs font-semibold text-crm-muted uppercase tracking-wider mb-1">
        {title}
      </h4>
      <div className="text-sm text-crm-text whitespace-pre-wrap leading-relaxed">
        {content}
      </div>
    </div>
  );
}

export default function NodePanel({ slug, onClose, onFocusNode }) {
  const [node, setNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('Context');
  const navigate = useNavigate();
  const { open: openSlideOver } = useSlideOver();

  const fetchNode = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/knowledge/node/${slug}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Failed to load node: ${res.status}`);
      const data = await res.json();
      setNode(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchNode();
  }, [fetchNode]);

  const sections = useMemo(() => parseSections(node?.content), [node?.content]);

  const tags = useMemo(() => {
    if (!node?.tags) return [];
    if (Array.isArray(node.tags)) return node.tags;
    return String(node.tags)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }, [node?.tags]);

  const connections = node?.connections || [];
  const crmData = node?.crmData || null;

  const handleOpenInCRM = () => {
    if (!node?.crm_id || !node?.type) return;
    const entityType = ENTITY_MAP[node.type];
    if (entityType) {
      openSlideOver(entityType, node.crm_id);
    }
  };

  const handleConnectionClick = (connSlug) => {
    if (onFocusNode) onFocusNode(connSlug);
  };

  // Loading state
  if (loading) {
    return (
      <div className="w-[400px] h-full bg-crm-card border-l border-crm-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-crm-border flex items-center justify-between">
          <ShimmerLine width="60%" />
          <button onClick={onClose} className="text-crm-muted hover:text-crm-text p-1">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        </div>
        <div className="p-4 flex-1">
          <ShimmerLine width="80%" />
          <ShimmerLine width="50%" />
          <ShimmerLine width="90%" />
          <ShimmerLine width="70%" />
          <ShimmerLine width="60%" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-[400px] h-full bg-crm-card border-l border-crm-border flex flex-col items-center justify-center p-4">
        <p className="text-red-400 text-sm mb-2">Failed to load node</p>
        <p className="text-crm-muted text-xs">{error}</p>
        <button
          onClick={fetchNode}
          className="mt-3 px-3 py-1 text-xs bg-crm-accent text-white rounded hover:bg-crm-accent-hover"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!node) return null;

  return (
    <div className="w-[400px] h-full bg-crm-card border-l border-crm-border flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-crm-border flex-shrink-0">
        <div className="flex items-start justify-between mb-2">
          <h2 className="text-base font-semibold text-crm-text leading-tight pr-2">
            {node.title}
          </h2>
          <button
            onClick={onClose}
            className="text-crm-muted hover:text-crm-text p-1 flex-shrink-0"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={node.type} color={TYPE_COLORS[node.type] || '#9CA3AF'} />
          {node.status && (
            <Badge label={node.status} color={STATUS_COLORS[node.status] || '#6B7280'} />
          )}
          {tags.map((t) => (
            <TagChip key={t} tag={t} />
          ))}
        </div>

        {node.crm_id && ENTITY_MAP[node.type] && (
          <button
            onClick={handleOpenInCRM}
            className="mt-3 text-xs text-crm-accent hover:text-crm-accent-hover underline"
          >
            Open in CRM
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-crm-border flex-shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-crm-accent text-crm-accent'
                : 'border-transparent text-crm-muted hover:text-crm-text'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'Context' && (
          <div>
            <SectionBlock title="Key Facts" content={sections['Key Facts']} />
            <SectionBlock title="Observations" content={sections['Observations']} />
            <SectionBlock title="Hypotheses" content={sections['Hypotheses']} />
            {/* Fallback: show intro text if no structured sections */}
            {!sections['Key Facts'] && !sections['Observations'] && !sections['Hypotheses'] && (
              <SectionBlock title="Context" content={sections['_intro'] || node.content} />
            )}
          </div>
        )}

        {activeTab === 'History' && (
          <div>
            <SectionBlock title="History" content={sections['History']} />
            <SectionBlock title="Timeline" content={sections['Timeline']} />
            {!sections['History'] && !sections['Timeline'] && (
              <p className="text-sm text-crm-muted">No history recorded.</p>
            )}
          </div>
        )}

        {activeTab === 'Open Questions' && (
          <div>
            {sections['Open Questions'] ? (
              <div className="text-sm text-crm-text whitespace-pre-wrap leading-relaxed">
                {sections['Open Questions']}
              </div>
            ) : (
              <p className="text-sm text-crm-muted">No open questions.</p>
            )}
          </div>
        )}

        {activeTab === 'Decisions' && (
          <div>
            {sections['Decisions'] || sections['Decision History'] ? (
              <div className="text-sm text-crm-text whitespace-pre-wrap leading-relaxed">
                {sections['Decisions'] || sections['Decision History']}
              </div>
            ) : (
              <p className="text-sm text-crm-muted">No decisions recorded.</p>
            )}
          </div>
        )}

        {activeTab === 'CRM Data' && (
          <div>
            {crmData ? (
              <div className="space-y-2">
                {Object.entries(crmData).map(([key, value]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-crm-muted">{key}</span>
                    <span className="text-crm-text text-right max-w-[200px] truncate">
                      {value != null ? String(value) : '--'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-crm-muted">No CRM data linked.</p>
            )}
          </div>
        )}

        {activeTab === 'Connections' && (
          <div className="space-y-2">
            {connections.length === 0 && (
              <p className="text-sm text-crm-muted">No connections.</p>
            )}
            {connections.map((conn) => (
              <button
                key={conn.slug}
                onClick={() => handleConnectionClick(conn.slug)}
                className="w-full flex items-center gap-2 p-2 rounded hover:bg-crm-hover text-left transition-colors"
              >
                <Badge label={conn.type} color={TYPE_COLORS[conn.type] || '#9CA3AF'} />
                <span className="text-sm text-crm-text truncate">{conn.title}</span>
                {conn.relation && (
                  <span className="text-xs text-crm-muted ml-auto flex-shrink-0">
                    {conn.relation}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
