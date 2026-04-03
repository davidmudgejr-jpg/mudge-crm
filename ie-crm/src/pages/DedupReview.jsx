import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../components/shared/Toast';
import ClusterCard from '../components/dedup/ClusterCard';
import MergeWorkspace from '../components/dedup/MergeWorkspace';
import MergeHistory from '../components/dedup/MergeHistory';
import useDedupKeyboard from '../hooks/useDedupKeyboard';

const API = import.meta.env.VITE_API_URL || '';

const STATUS_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'merged', label: 'Merged' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'deferred', label: 'Deferred' },
];

const ENTITY_TABS = [
  { key: 'property', label: 'Properties', icon: '🏢', displayCol: 'property_address' },
  { key: 'contact', label: 'Contacts', icon: '👤', displayCol: 'full_name' },
  { key: 'company', label: 'Companies', icon: '🏛', displayCol: 'company_name' },
];

// Old resolve endpoints still used for dismiss/defer
const RESOLVE_API = {
  property: '/api/dedup/resolve',
  contact: '/api/dedup/contact-resolve',
  company: '/api/dedup/company-resolve',
};

export default function DedupReview({ onCountChange }) {
  const { token } = useAuth();
  const { addToast } = useToast();

  const [entityType, setEntityType] = useState('property');
  const [clusters, setClusters] = useState([]);
  const [stats, setStats] = useState({ pending: 0, merged: 0, dismissed: 0, deferred: 0 });
  const [allStats, setAllStats] = useState({ property: 0, contact: 0, company: 0 });
  const [activeTab, setActiveTab] = useState('pending');
  const [loading, setLoading] = useState(true);

  // Workspace state
  const [openCluster, setOpenCluster] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [autoMerging, setAutoMerging] = useState(false);

  // Keyboard navigation state
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeFieldIndex, setActiveFieldIndex] = useState(0);
  const clusterListRef = useRef(null);

  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const entityTab = ENTITY_TABS.find(t => t.key === entityType);

  // Load clusters + stats
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API}/api/dedup/clusters?entityType=${entityType}&status=${activeTab}`,
        { headers }
      );
      const data = await res.json();
      setClusters(data.clusters || []);
      setStats(data.stats || { pending: 0, merged: 0, dismissed: 0, deferred: 0 });
    } catch (err) {
      console.error('Failed to load dedup clusters:', err);
      addToast('Failed to load dedup data', 'error');
    } finally {
      setLoading(false);
    }
  }, [entityType, activeTab, token]);

  // Load all entity pending counts for tabs + sidebar
  const loadAllStats = useCallback(async () => {
    try {
      const results = await Promise.all(
        ['property', 'contact', 'company'].map(et =>
          fetch(`${API}/api/dedup/clusters?entityType=${et}&status=pending`, { headers })
            .then(r => r.json())
            .catch(() => ({ clusters: [], stats: { pending: 0 } }))
        )
      );
      const newAllStats = {
        property: results[0].stats?.pending || 0,
        contact: results[1].stats?.pending || 0,
        company: results[2].stats?.pending || 0,
      };
      setAllStats(newAllStats);
      onCountChange?.(newAllStats.property + newAllStats.contact + newAllStats.company);
    } catch (err) {
      console.error('Failed to load all dedup stats:', err);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadAllStats(); }, [loadAllStats]);

  const refreshAfterAction = () => {
    loadData();
    loadAllStats();
  };

  // Dismiss/defer a cluster (resolves all its candidate pairs)
  const handleResolve = async (clusterIdx, status) => {
    const cluster = clusters[clusterIdx];
    if (!cluster) return;
    try {
      for (const candId of cluster.candidateIds) {
        await fetch(`${API}${RESOLVE_API[entityType]}`, {
          method: 'POST', headers,
          body: JSON.stringify({ candidateId: candId, status }),
        });
      }
      addToast(status === 'dismissed' ? 'Marked as not duplicates' : 'Deferred for later', 'success');
      refreshAfterAction();
    } catch (err) {
      addToast(`Failed: ${err.message}`, 'error');
    }
  };

  // Auto-merge exact matches
  const handleAutoMerge = async () => {
    setAutoMerging(true);
    try {
      const res = await fetch(`${API}/api/dedup/auto-merge`, {
        method: 'POST', headers,
        body: JSON.stringify({ entityType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      addToast(`Auto-merged ${data.autoMerged} exact-match clusters (${data.skipped} skipped)`, 'success');
      refreshAfterAction();
    } catch (err) {
      addToast(`Auto-merge failed: ${err.message}`, 'error');
    } finally {
      setAutoMerging(false);
    }
  };

  // Keyboard navigation
  useDedupKeyboard({
    clusterCount: clusters.length,
    activeIndex,
    setActiveIndex,
    onOpenCluster: (idx) => setOpenCluster(clusters[idx] || null),
    onDismissCluster: (idx) => handleResolve(idx, 'dismissed'),
    onDeferCluster: (idx) => handleResolve(idx, 'deferred'),
    workspaceOpen: !!openCluster,
    onCloseWorkspace: () => setOpenCluster(null),
    onConfirmMerge: null, // handled inside MergeWorkspace
    onSelectColumn: null,
    fieldCount: 0,
    activeFieldIndex,
    setActiveFieldIndex,
  });

  // Scroll active cluster into view
  useEffect(() => {
    if (clusterListRef.current) {
      const cards = clusterListRef.current.children;
      if (cards[activeIndex]) {
        cards[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [activeIndex]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-5 pt-4 pb-3 border-b border-crm-border">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-crm-text">Duplicate Review</h1>
            <p className="text-xs text-crm-muted mt-0.5">
              {stats.pending} pending · {stats.merged} merged · {stats.dismissed} dismissed
              {activeTab === 'pending' && clusters.length > 0 && (
                <span> · {clusters.length} cluster{clusters.length !== 1 ? 's' : ''}</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'pending' && (
              <button
                onClick={handleAutoMerge}
                disabled={autoMerging}
                className="px-3 py-1.5 text-[11px] font-medium text-crm-accent hover:text-crm-accent/80 border border-crm-accent/30 rounded-lg transition-colors disabled:opacity-50"
              >
                {autoMerging ? 'Scanning...' : 'Auto-merge exact matches'}
              </button>
            )}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-colors border ${
                showHistory
                  ? 'text-crm-accent border-crm-accent/30 bg-crm-accent/5'
                  : 'text-crm-muted hover:text-crm-text border-crm-border'
              }`}
            >
              History
            </button>
          </div>
        </div>

        {/* Entity type tabs */}
        <div className="flex gap-1 mb-2">
          {ENTITY_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setEntityType(tab.key); setActiveTab('pending'); setActiveIndex(0); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                entityType === tab.key
                  ? 'bg-crm-accent/15 text-crm-accent border border-crm-accent/30'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover border border-transparent'
              }`}
            >
              {tab.label}
              {allStats[tab.key] > 0 && (
                <span className={`ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full ${
                  entityType === tab.key ? 'bg-crm-accent/20' : 'bg-crm-border'
                }`}>
                  {allStats[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Status tabs */}
        <div className="flex gap-1">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setActiveIndex(0); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.key
                  ? 'bg-crm-accent text-white'
                  : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
              }`}
            >
              {tab.label}
              {stats[tab.key] > 0 && (
                <span className={`ml-1.5 text-[10px] ${activeTab === tab.key ? 'opacity-80' : 'opacity-50'}`}>
                  {stats[tab.key]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Keyboard hint */}
        {activeTab === 'pending' && clusters.length > 0 && !openCluster && (
          <div className="mt-2 text-[10px] text-crm-muted/50">
            j/k navigate · Enter open · d dismiss · l defer
          </div>
        )}
      </div>

      {/* Main content area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Cluster list */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3" ref={clusterListRef}>
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 rounded-xl bg-crm-card border border-crm-border animate-shimmer" />
              ))}
            </div>
          ) : clusters.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-crm-muted text-sm">
                {activeTab === 'pending'
                  ? `No pending ${entityType} duplicates to review.`
                  : `No ${activeTab} clusters.`}
              </p>
            </div>
          ) : (
            clusters.map((cluster, idx) => (
              <ClusterCard
                key={cluster.clusterId}
                cluster={cluster}
                entityType={entityType}
                displayCol={entityTab?.displayCol}
                isActive={idx === activeIndex}
                onOpen={() => { setActiveIndex(idx); setOpenCluster(cluster); }}
                onDismiss={() => handleResolve(idx, 'dismissed')}
                onDefer={() => handleResolve(idx, 'deferred')}
              />
            ))
          )}
        </div>

        {/* History side panel */}
        {showHistory && (
          <div className="w-[320px] border-l border-crm-border bg-crm-card overflow-y-auto shrink-0">
            <div className="px-4 py-3 border-b border-crm-border">
              <h3 className="text-xs font-semibold text-crm-text">Merge History</h3>
            </div>
            <MergeHistory entityType={entityType} onUndone={refreshAfterAction} />
          </div>
        )}
      </div>

      {/* Merge workspace overlay */}
      {openCluster && (
        <>
          <div
            className="fixed inset-0 bg-crm-overlay/60 backdrop-blur-sm z-40 animate-fade-in"
            onClick={() => setOpenCluster(null)}
          />
          <div className="fixed top-0 right-0 h-full w-[900px] max-w-[90vw] bg-crm-bg border-l border-crm-border z-50 animate-slide-in-right shadow-2xl">
            <MergeWorkspace
              cluster={openCluster}
              entityType={entityType}
              onClose={() => setOpenCluster(null)}
              onMerged={refreshAfterAction}
            />
          </div>
        </>
      )}
    </div>
  );
}
