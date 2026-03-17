import React, { useState } from 'react';
import SlideOver, { SlideOverHeader } from '../shared/SlideOver';
import { useSlideOver } from '../shared/SlideOverContext';
import ScoreBar from './ScoreBar';
import TierBadge from './TierBadge';
import NewInteractionModal from '../shared/NewInteractionModal';
import { formatDateCompact } from '../../utils/timezone';

const CALL_STATUS_OPTIONS = [
  'Not Called', 'Called — No Answer', 'Called — Left VM',
  'Called — Contacted', 'Scheduled Follow-up', 'Not Interested', 'Do Not Call',
];

function formatCurrency(val) {
  const n = parseFloat(val) || 0;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString()}K`;
  if (n > 0) return `$${Math.round(n).toLocaleString()}`;
  return '—';
}

export default function TpeDetailPanel({ property: p, onClose, onCallStatusChange, onRefresh }) {
  const { open: openSlideOver } = useSlideOver();
  const [showNewInteraction, setShowNewInteraction] = useState(false);

  const sale = parseFloat(p.sale_commission_est) || 0;
  const lease = parseFloat(p.lease_commission_est) || 0;
  const mult = parseFloat(p.time_multiplier) || 1;
  const finalEcv = Math.max(sale, lease) * mult;

  // Inline gap calculations (no extra API call)
  // Color map avoids Tailwind JIT purge of dynamic class names
  const GAP_COLORS = {
    yellow: 'bg-yellow-500/15 text-yellow-400',
    blue: 'bg-blue-500/15 text-blue-400',
    red: 'bg-red-500/15 text-red-400',
    purple: 'bg-purple-500/15 text-purple-400',
  };
  const gaps = [
    { key: 'age', pts: (parseFloat(p.age_score) || 0) === 0 && !p.owner_age_years ? 20 : 0, action: 'Get owner date of birth', context: 'If owner is 65+, age signal activates', label: 'Age Signal', color: 'yellow' },
    { key: 'growth', pts: (parseFloat(p.growth_score) || 0) === 0 && !p.growth_rate ? 15 : 0, action: 'Get tenant headcount data', context: '30%+ growth adds full growth signal', label: 'Growth Signal', color: 'blue' },
    { key: 'stress', pts: (parseFloat(p.stress_score) || 0) === 0 && !p.balloon_confidence && !p.has_lien_or_delinquency ? 15 : 0, action: 'Get loan/debt stress data', context: 'Balloon or lien info adds stress signal', label: 'Stress Signal', color: 'red' },
    { key: 'ownership', pts: (parseFloat(p.ownership_score) || 0) < 10 && !p.owner_name ? 30 : 0, action: 'Link owner contact', context: 'Owner entity + hold period activates ownership signal', label: 'Ownership', color: 'purple' },
  ];
  const activeGaps = gaps.filter(g => g.pts > 0);
  const totalGapPts = activeGaps.reduce((sum, g) => sum + g.pts, 0);
  const blended = parseFloat(p.blended_priority) || 0;
  const projectedScore = blended + totalGapPts * 0.7;
  const projectedTier = projectedScore >= 50 ? 'A' : projectedScore >= 40 ? 'B' : projectedScore >= 30 ? 'C' : 'D';

  // Score breakdown annotations
  const annotations = {
    lease: p.lease_expiration ? `Expires ${formatDateCompact(p.lease_expiration)}` : 'No lease data',
    ownership: [
      p.owner_entity_type || '',
      p.hold_years ? `${Math.round(p.hold_years)}yr hold` : '',
      p.owner_user_or_investor || '',
    ].filter(Boolean).join(', ') || 'No ownership data',
    age: p.owner_age_years ? `Owner age ${Math.round(p.owner_age_years)}` : 'No age data',
    growth: p.growth_rate ? `${Math.round(p.growth_rate)}% growth` : 'No growth data',
    stress: [
      p.balloon_confidence ? `Balloon: ${p.balloon_confidence}` : '',
      p.has_lien_or_delinquency ? 'Lien/delinquency' : '',
    ].filter(Boolean).join(', ') || 'No stress signals',
  };

  return (
    <SlideOver onClose={onClose}>
      <SlideOverHeader
        title={p.address || 'Property'}
        subtitle={[p.city, p.property_type].filter(Boolean).join(' · ')}
        onClose={onClose}
      />

      <div className="px-5 py-4 space-y-6">
        {/* Score header */}
        <div className="flex items-center gap-4">
          <TierBadge tier={p.tpe_tier || 'C'} size="lg" />
          <div>
            <div className="text-3xl font-bold tabular-nums">{Math.round(parseFloat(p.blended_priority) || 0)}</div>
            <div className="text-[10px] uppercase tracking-wider text-crm-muted">Blended Score</div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="space-y-3">
          <h3 className="text-[11px] uppercase tracking-wider text-crm-muted font-semibold">Score Breakdown</h3>
          <ScoreBar label="Lease Expiration" score={parseFloat(p.lease_score) || 0} max={30} color="blue" annotation={annotations.lease} />
          <ScoreBar label="Ownership Profile" score={parseFloat(p.ownership_score) || 0} max={30} color="purple" annotation={annotations.ownership} />
          <ScoreBar label="Owner Age" score={parseFloat(p.age_score) || 0} max={20} color="amber" annotation={annotations.age} />
          <ScoreBar label="Tenant Growth" score={parseFloat(p.growth_score) || 0} max={15} color="green" annotation={annotations.growth} />
          <ScoreBar label="Debt/Stress" score={parseFloat(p.stress_score) || 0} max={15} color="red" annotation={annotations.stress} />
          {(parseFloat(p.maturity_boost) > 0 || parseFloat(p.distress_score) > 0) && (
            <>
              <ScoreBar label="Maturity Boost" score={parseFloat(p.maturity_boost) || 0} max={35} color="blue" annotation={p.maturity_date ? `Matures ${formatDateCompact(p.maturity_date)}` : 'No maturity data'} />
              <ScoreBar label="Distress Signal" score={parseFloat(p.distress_score) || 0} max={25} color="red" annotation={p.distress_type || 'No distress signals'} />
            </>
          )}
        </div>

        {/* Gap Hints — Unlock Points */}
        {totalGapPts > 0 && (
          <div className="bg-gradient-to-br from-crm-card to-crm-deep border border-yellow-500/30 rounded-lg p-3.5">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[10px] uppercase tracking-widest text-yellow-400 font-semibold">
                Unlock Up To +{totalGapPts} Points
              </span>
              {projectedTier !== (p.tpe_tier || 'D') && (
                <span className="text-[10px] text-crm-muted">
                  Could reach {projectedTier}-tier
                </span>
              )}
            </div>
            {activeGaps.map((gap) => (
              <div key={gap.key} className="flex items-center gap-2.5 py-2 border-b border-crm-border/50 last:border-0">
                <span className={`${GAP_COLORS[gap.color]} text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap`}>
                  +{gap.pts} pts
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-crm-text">{gap.action}</div>
                  <div className="text-[11px] text-crm-muted">{gap.context}</div>
                </div>
                <span className="text-[10px] text-crm-muted whitespace-nowrap">{gap.label}</span>
              </div>
            ))}
            {gaps.filter(g => g.pts === 0).map((gap) => (
              <div key={gap.key} className="flex items-center gap-2.5 py-2 border-b border-crm-border/50 last:border-0 opacity-40">
                <span className="bg-emerald-500/15 text-emerald-400 text-[11px] font-bold px-2 py-0.5 rounded whitespace-nowrap">
                  +0 pts
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-crm-text">{gap.label} data loaded</div>
                </div>
                <span className="text-[10px] text-emerald-400 whitespace-nowrap">✓ Complete</span>
              </div>
            ))}
          </div>
        )}

        {/* Commission Estimate */}
        <div className="space-y-2">
          <h3 className="text-[11px] uppercase tracking-wider text-crm-muted font-semibold">Commission Estimate</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-crm-card rounded-lg p-3 text-center">
              <div className="text-[10px] text-crm-muted uppercase">Sale</div>
              <div className="text-sm font-bold">{formatCurrency(sale)}</div>
            </div>
            <div className="bg-crm-card rounded-lg p-3 text-center">
              <div className="text-[10px] text-crm-muted uppercase">Lease</div>
              <div className="text-sm font-bold">{formatCurrency(lease)}</div>
            </div>
            <div className="bg-crm-card rounded-lg p-3 text-center">
              <div className="text-[10px] text-crm-muted uppercase">Time ×</div>
              <div className="text-sm font-bold">{mult.toFixed(2)}</div>
            </div>
          </div>
          <div className="text-center py-2">
            <span className="text-[10px] text-crm-muted uppercase">Final ECV: </span>
            <span className="text-lg font-bold text-crm-success">{formatCurrency(finalEcv)}</span>
          </div>
        </div>

        {/* Owner/Tenant Outreach Cards */}
        {(p.owner_call_reason || p.tenant_call_reason) ? (
          <div className="space-y-2.5">
            <h3 className="text-[11px] uppercase tracking-wider text-crm-muted font-semibold">Outreach Signals</h3>

            {/* Owner Card */}
            {p.owner_call_reason && (
              <div className="bg-crm-card border border-emerald-500/40 rounded-lg p-3.5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-semibold">👤 Owner Outreach</span>
                  <span className="text-[11px] font-bold text-emerald-400">{Math.round(parseFloat(p.owner_signal_pts) || 0)} pts</span>
                </div>
                <div className="text-sm text-crm-text mb-2.5">{p.owner_call_reason}</div>
                <div className="flex gap-1.5 flex-wrap">
                  {p.owner_contact_id ? (
                    <button
                      onClick={() => { onClose(); openSlideOver('contact', p.owner_contact_id); }}
                      className="bg-crm-deep border border-emerald-500/40 text-emerald-400 px-2.5 py-1 rounded-full text-[11px] hover:bg-emerald-500/10 transition-colors cursor-pointer"
                    >
                      🔗 {p.owner_name || 'Owner'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-crm-muted italic">No owner contact linked</span>
                  )}
                  {p.owner_phone && (
                    <span className="bg-crm-deep border border-crm-border text-crm-muted px-2.5 py-1 rounded-full text-[11px]">
                      {p.owner_phone}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Tenant Card */}
            {p.tenant_call_reason && (
              <div className="bg-crm-card border border-blue-400/40 rounded-lg p-3.5">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase tracking-widest text-blue-400 font-semibold">🏢 Tenant Outreach</span>
                  <span className="text-[11px] font-bold text-blue-400">{Math.round(parseFloat(p.tenant_signal_pts) || 0)} pts</span>
                </div>
                <div className="text-sm text-crm-text mb-2.5">{p.tenant_call_reason}</div>
                <div className="flex gap-1.5 flex-wrap">
                  {p.tenant_company_id ? (
                    <button
                      onClick={() => { onClose(); openSlideOver('company', p.tenant_company_id); }}
                      className="bg-crm-deep border border-blue-400/40 text-blue-400 px-2.5 py-1 rounded-full text-[11px] hover:bg-blue-500/10 transition-colors cursor-pointer"
                    >
                      🔗 {p.tenant_name || 'Tenant'}
                    </button>
                  ) : (
                    <span className="text-[11px] text-crm-muted italic">No tenant company linked</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-crm-muted italic py-2">No active outreach signals</div>
        )}

        {/* Quick Info */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div>
            <div className="text-[10px] text-crm-muted uppercase">Owner</div>
            <div className="text-sm">{p.owner_name || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-crm-muted uppercase">Bldg SF</div>
            <div className="text-sm">{p.rba ? parseInt(p.rba).toLocaleString() : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-crm-muted uppercase">Year Built</div>
            <div className="text-sm">{p.year_built || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-crm-muted uppercase">CoStar Rating</div>
            <div className="text-sm">{p.costar_star_rating ? '★'.repeat(p.costar_star_rating) + '☆'.repeat(5 - p.costar_star_rating) : '—'}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-crm-border">
          <button
            onClick={() => { onClose(); openSlideOver('property', p.property_id); }}
            className="text-xs text-crm-accent hover:text-crm-accent-hover font-medium flex items-center gap-1"
          >
            View Full Property →
          </button>
          <div className="flex-1" />
          <select
            value={p.owner_call_status || ''}
            onChange={(e) => onCallStatusChange(e.target.value)}
            className="text-xs bg-crm-card border border-crm-border rounded-lg px-2 py-1.5 text-crm-text focus:outline-none focus:border-crm-accent/50"
          >
            <option value="">Call Status</option>
            {CALL_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            onClick={() => setShowNewInteraction(true)}
            className="text-xs btn-primary px-3 py-1.5"
          >
            Log Interaction
          </button>
        </div>
      </div>

      {showNewInteraction && (
        <NewInteractionModal
          initialLinks={{ property: [{ id: p.property_id, label: p.address || 'Untitled Property' }] }}
          onClose={() => setShowNewInteraction(false)}
          onCreated={() => { setShowNewInteraction(false); onRefresh?.(); }}
        />
      )}
    </SlideOver>
  );
}
