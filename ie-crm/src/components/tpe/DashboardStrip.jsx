import React, { useState } from 'react';
import TierBadge from './TierBadge';

function formatCurrency(val) {
  if (!val || val === 0) return '$0';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val.toFixed(0)}`;
}

export default function DashboardStrip({ rows, onTierFilter, activeTier }) {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('crm_tpe_dashboard_collapsed') === 'true'
  );

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('crm_tpe_dashboard_collapsed', String(next));
  };

  const tiers = { A: 0, B: 0, C: 0, D: 0 };
  let totalScore = 0;
  let totalPipeline = 0;
  let scored = 0;

  rows.forEach((r) => {
    const tier = r.tpe_tier || 'C';
    tiers[tier] = (tiers[tier] || 0) + 1;
    if (r.blended_priority) {
      totalScore += parseFloat(r.blended_priority) || 0;
      scored++;
    }
    const commission = Math.max(
      parseFloat(r.sale_commission_est) || 0,
      parseFloat(r.lease_commission_est) || 0
    ) * (parseFloat(r.time_multiplier) || 1);
    totalPipeline += commission;
  });

  const avgScore = scored > 0 ? Math.round(totalScore / scored) : 0;
  const total = tiers.A + tiers.B + tiers.C + tiers.D;

  if (collapsed) {
    return (
      <div className="flex items-center gap-3 px-6 py-2 border-b border-crm-border bg-crm-card/30">
        <button onClick={toggle} className="text-crm-muted hover:text-crm-text transition-colors" title="Expand dashboard">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {['A', 'B', 'C', 'D'].map((t) => (
          <button
            key={t}
            onClick={() => onTierFilter(activeTier === t ? null : t)}
            className={`text-xs font-medium px-2 py-0.5 rounded-full transition-colors ${activeTier === t ? 'ring-1 ring-crm-accent' : ''}`}
          >
            <TierBadge tier={t} /> <span className="ml-1 text-crm-muted">{tiers[t]}</span>
          </button>
        ))}
        <span className="text-xs text-crm-muted ml-auto">Pipeline: <strong className="text-crm-success">{formatCurrency(totalPipeline)}</strong></span>
      </div>
    );
  }

  return (
    <div className="px-6 py-4 border-b border-crm-border bg-crm-card/30">
      <div className="flex items-center gap-6">
        {/* Tier cards */}
        <div className="flex gap-3">
          {[
            { tier: 'A', color: 'text-emerald-400' },
            { tier: 'B', color: 'text-yellow-400' },
            { tier: 'C', color: 'text-orange-400' },
            { tier: 'D', color: 'text-zinc-400' },
          ].map(({ tier, color }) => (
            <button
              key={tier}
              onClick={() => onTierFilter(activeTier === tier ? null : tier)}
              className={`flex flex-col items-center px-4 py-2 rounded-lg transition-all hover:bg-crm-hover ${activeTier === tier ? 'ring-1 ring-crm-accent bg-crm-hover' : 'bg-crm-bg/50'}`}
            >
              <TierBadge tier={tier} size="lg" />
              <span className={`text-lg font-bold mt-1 ${color}`}>{tiers[tier]}</span>
            </button>
          ))}
        </div>

        {/* Distribution bar */}
        <div className="flex-1 px-4">
          <div className="flex h-3 rounded-full overflow-hidden bg-crm-bg">
            {total > 0 && (
              <>
                <div className="bg-emerald-500 transition-all" style={{ width: `${(tiers.A / total) * 100}%` }} />
                <div className="bg-yellow-500 transition-all" style={{ width: `${(tiers.B / total) * 100}%` }} />
                <div className="bg-orange-500 transition-all" style={{ width: `${(tiers.C / total) * 100}%` }} />
                <div className="bg-zinc-500 transition-all" style={{ width: `${(tiers.D / total) * 100}%` }} />
              </>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="flex gap-6 text-right">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-crm-muted">Avg Score</div>
            <div className="text-lg font-bold">{avgScore}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-crm-muted">Est. Pipeline</div>
            <div className="text-lg font-bold text-crm-success">{formatCurrency(totalPipeline)}</div>
          </div>
        </div>

        {/* Collapse toggle */}
        <button onClick={toggle} className="text-crm-muted hover:text-crm-text transition-colors ml-2" title="Collapse dashboard">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
