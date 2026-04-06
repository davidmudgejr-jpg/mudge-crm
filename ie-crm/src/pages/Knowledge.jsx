import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import useKnowledgeGraph from '../hooks/useKnowledgeGraph';
import KnowledgeGraph from '../components/knowledge/KnowledgeGraph';
import NodePanel from '../components/knowledge/NodePanel';
import KnowledgeToolbar from '../components/knowledge/KnowledgeToolbar';
import KnowledgeSearch from '../components/knowledge/KnowledgeSearch';
import InboxPanel from '../components/knowledge/InboxPanel';
import KnowledgeListView from '../components/knowledge/KnowledgeListView';

export default function Knowledge() {
  const { nodes, edges, stats, loading, error, refetch, filters, updateFilters } =
    useKnowledgeGraph();

  const [selectedSlug, setSelectedSlug] = useState(null);
  const [showInbox, setShowInbox] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [clusterByType, setClusterByType] = useState(false);
  const graphRef = useRef(null);
  const [searchParams] = useSearchParams();

  // Handle ?focus=slug on mount
  useEffect(() => {
    const focusSlug = searchParams.get('focus');
    if (focusSlug && !loading && nodes.length > 0) {
      setSelectedSlug(focusSlug);
      // Allow graph to render before flying
      setTimeout(() => {
        graphRef.current?.flyToNode(focusSlug);
      }, 800);
    }
  }, [searchParams, loading, nodes.length]);

  const handleNodeSelect = useCallback((nodeData) => {
    if (nodeData) {
      setSelectedSlug(nodeData.slug || nodeData.id);
    } else {
      setSelectedSlug(null);
    }
  }, []);

  const handleFocusNode = useCallback((slug) => {
    setSelectedSlug(slug);
    graphRef.current?.flyToNode(slug);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleSearchSelect = useCallback(
    (slug) => {
      setShowSearch(false);
      setSelectedSlug(slug);
      setTimeout(() => graphRef.current?.flyToNode(slug), 200);
    },
    []
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      // Cmd/Ctrl+K for search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
      // Escape to close panels
      if (e.key === 'Escape') {
        if (showSearch) {
          setShowSearch(false);
        } else if (selectedSlug) {
          setSelectedSlug(null);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showSearch, selectedSlug]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-crm-bg">
      {/* Toolbar */}
      <KnowledgeToolbar
        filters={filters}
        onFilterChange={updateFilters}
        stats={stats}
        onRefresh={handleRefresh}
        onToggleInbox={() => setShowInbox((v) => !v)}
        refreshing={refreshing || loading}
        onSearchFocus={() => setShowSearch(true)}
        clusterByType={clusterByType}
        onClusterToggle={() => setClusterByType((v) => !v)}
      />

      {/* Main area: graph + optional panel */}
      <div className="flex flex-1 min-h-0">
        {/* Graph */}
        <div className="flex-1 relative">
          {error && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {loading && nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <svg
                  className="animate-spin text-crm-accent"
                  width="24"
                  height="24"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="8" cy="8" r="6" opacity="0.25" />
                  <path d="M14 8a6 6 0 0 0-6-6" />
                </svg>
                <span className="text-sm text-crm-muted">Loading knowledge graph...</span>
              </div>
            </div>
          )}

          {nodes.length > 0 && (
            <>
              {/* Desktop: graph view */}
              <div className="hidden md:block w-full h-full">
                <KnowledgeGraph
                  ref={graphRef}
                  nodes={nodes}
                  edges={edges}
                  onNodeSelect={handleNodeSelect}
                  selectedSlug={selectedSlug}
                  clusterByType={clusterByType}
                />
              </div>
              {/* Mobile: list view fallback */}
              <div className="block md:hidden w-full h-full">
                <KnowledgeListView
                  nodes={nodes}
                  onNodeSelect={handleNodeSelect}
                />
              </div>
            </>
          )}

          {!loading && nodes.length === 0 && !error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className="text-crm-muted text-sm mb-1">No knowledge nodes found</p>
                <p className="text-crm-muted text-xs">
                  Nodes will appear as the AI system generates knowledge pages.
                </p>
              </div>
            </div>
          )}

          {/* Stats footer */}
          <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[10px] text-crm-muted">
            <span>{nodes.length} nodes</span>
            <span>{edges.length} edges</span>
            {(stats.stale_count || 0) > 0 && (
              <span className="text-yellow-500">{stats.stale_count} stale</span>
            )}
          </div>
        </div>

        {/* Node detail panel */}
        {selectedSlug && (
          <NodePanel
            slug={selectedSlug}
            onClose={() => setSelectedSlug(null)}
            onFocusNode={handleFocusNode}
          />
        )}
      </div>

      {/* Inbox drawer */}
      <InboxPanel isOpen={showInbox} onClose={() => setShowInbox(false)} />

      {/* Search overlay */}
      {showSearch && (
        <KnowledgeSearch
          onSelect={handleSearchSelect}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}
