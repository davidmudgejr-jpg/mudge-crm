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

        {/* Call Reason */}
        {p.call_reason && (
          <div className="bg-crm-accent/10 border border-crm-accent/20 rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wider text-crm-accent font-semibold mb-1">Call Reason</div>
            <div className="text-sm">{p.call_reason}</div>
          </div>
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
