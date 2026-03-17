import React, { useState, useEffect, useCallback } from 'react';
import TierBadge from '../components/tpe/TierBadge';
import { useSlideOver } from '../components/shared/SlideOverContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const GAP_TYPES = [
  { key: null, label: 'All Gaps' },
  { key: 'age', label: 'Missing Owner DOB' },
  { key: 'growth', label: 'Missing Tenant Growth' },
  { key: 'stress', label: 'Missing Loan Data' },
  { key: 'ownership', label: 'Missing Owner Link' },
];

const GAP_LABELS = {
  age_gap_pts: 'Owner DOB',
  growth_gap_pts: 'Tenant Growth',
  stress_gap_pts: 'Loan Data',
  ownership_gap_pts: 'Owner Link',
};

function StatCard({ value, label, color }) {
  const colorMap = {
    yellow: 'text-yellow-400',
    blue: 'text-blue-400',
    green: 'text-emerald-400',
    purple: 'text-purple-400',
    muted: 'text-crm-muted',
  };
  return (
    <div className="bg-crm-card rounded-lg p-4 text-center flex-1 min-w-[120px]">
      <div className={`text-2xl font-bold tabular-nums ${colorMap[color] || 'text-crm-text'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-[10px] text-crm-muted uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

export default function TPEEnrichment() {
  const { open: openSlideOver } = useSlideOver();
  const [stats, setStats] = useState(null);
  const [gaps, setGaps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = filter
        ? `${API_BASE}/api/ai/tpe-gaps?gap_type=${filter}&limit=500`
        : `${API_BASE}/api/ai/tpe-gaps?limit=500`;
      const check = (r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
      const [gapsRes, statsRes] = await Promise.all([
        fetch(url).then(check),
        fetch(`${API_BASE}/api/ai/tpe-gaps/stats`).then(check),
      ]);
      setGaps(gapsRes);
      setStats(statsRes);
    } catch (err) {
      console.error('Failed to fetch gap data:', err);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Identify the gap types present for each row
  function getGapTypes(row) {
    return Object.entries(GAP_LABELS)
      .filter(([key]) => parseFloat(row[key]) > 0)
      .map(([key, label]) => label);
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-crm-border flex-shrink-0">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-lg font-bold">Data Enrichment</h1>
          <span className="text-[10px] uppercase tracking-widest text-crm-muted bg-crm-card px-2 py-0.5 rounded-full">
            TPE Intelligence
          </span>
        </div>
        <p className="text-sm text-crm-muted">
          Properties with missing data that would have the biggest impact on TPE scores. Fill these gaps to unlock higher tiers.
        </p>
      </div>

      {/* Stats Strip */}
      {stats && (
        <div className="px-6 py-3 border-b border-crm-border flex-shrink-0">
          <div className="flex gap-3 flex-wrap">
            <StatCard value={parseInt(stats.missing_owner_dob) || 0} label="Missing Owner DOB" color="yellow" />
            <StatCard value={parseInt(stats.missing_tenant_growth) || 0} label="Missing Tenant Growth" color="blue" />
            <StatCard value={parseInt(stats.missing_loan_data) || 0} label="Missing Loan Data" color="green" />
            <StatCard value={parseInt(stats.missing_owner_link) || 0} label="Missing Owner Link" color="purple" />
            <StatCard value={parseInt(stats.total_properties_with_gaps) || 0} label="Total With Gaps" color="muted" />
          </div>
        </div>
      )}

      {/* Filter Pills */}
      <div className="px-6 py-2.5 border-b border-crm-border flex-shrink-0 flex gap-2">
        {GAP_TYPES.map((gt) => (
          <button
            key={gt.key || 'all'}
            onClick={() => setFilter(gt.key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === gt.key
                ? 'bg-crm-accent text-white'
                : 'bg-crm-card text-crm-muted hover:text-crm-text'
            }`}
          >
            {gt.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-2">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-crm-muted text-sm animate-pulse">Loading gap analysis...</div>
          </div>
        ) : gaps.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-crm-muted text-sm">No data gaps found. Your data is fully enriched!</div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-crm-muted border-b border-crm-border">
                <th className="text-left py-2.5 px-2 font-medium">Property</th>
                <th className="text-left py-2.5 px-2 font-medium w-20">Current</th>
                <th className="text-left py-2.5 px-2 font-medium">Missing Data</th>
                <th className="text-right py-2.5 px-2 font-medium w-20">Potential</th>
                <th className="text-center py-2.5 px-2 font-medium w-20">New Tier</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((row, idx) => {
                const gapTypes = getGapTypes(row);
                const totalPts = parseFloat(row.total_gap_pts) || 0;
                const currentTier = row.tpe_tier || 'D';
                const projTier = row.projected_tier || currentTier;
                const tierChanged = projTier !== currentTier;
                return (
                  <tr
                    key={row.property_id || idx}
                    className="border-b border-crm-border/50 hover:bg-crm-hover/50 cursor-pointer transition-colors"
                    onClick={() => openSlideOver('property', row.property_id)}
                  >
                    <td className="py-2.5 px-2">
                      <div className="font-medium text-crm-text">{row.address}</div>
                      <div className="text-[11px] text-crm-muted">{[row.city, row.property_type].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <TierBadge tier={currentTier} />
                        <span className="text-crm-muted tabular-nums">{Math.round(parseFloat(row.blended_priority) || 0)}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <div className="flex gap-1 flex-wrap">
                        {gapTypes.map((gt) => (
                          <span key={gt} className="bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded text-[11px]">
                            {gt}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right">
                      <span className="text-emerald-400 font-bold tabular-nums">+{Math.round(totalPts)}</span>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {tierChanged ? (
                        <span className="bg-emerald-500/15 text-emerald-400 px-2 py-0.5 rounded text-[11px] font-medium">
                          → {projTier}
                        </span>
                      ) : (
                        <span className="text-crm-muted text-[11px]">{currentTier}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && gaps.length > 0 && (
          <div className="text-center text-[11px] text-crm-muted py-3">
            Showing {gaps.length} properties · Sorted by potential point gain × tier proximity
          </div>
        )}
      </div>
    </div>
  );
}
