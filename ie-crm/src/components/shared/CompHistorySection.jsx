// Displays lease & sale comp history for a property or lease comps for a company.
// Compact row format inside a collapsible Section.

import React from 'react';
import Section from './Section';
import { formatDatePacific } from '../../utils/timezone';

const TYPE_BADGE = {
  lease: 'bg-blue-500/20 text-blue-400',
  sale: 'bg-emerald-500/20 text-emerald-400',
};

function CompRow({ comp, type }) {
  const isLease = type === 'lease';
  return (
    <div className="flex items-center justify-between py-2 border-b border-crm-border/50 last:border-0 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${TYPE_BADGE[type]}`}>
          {type}
        </span>
        <span className="text-crm-text truncate font-medium">
          {isLease ? (comp.tenant_name || 'Unknown Tenant') : (comp.buyer_name || comp.seller_name || 'Unknown')}
        </span>
        {comp.property_address && (
          <span className="text-crm-muted truncate text-[11px]">@ {comp.property_address}</span>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0 text-crm-muted ml-2">
        {isLease ? (
          <>
            {comp.sf && <span>{Number(comp.sf).toLocaleString()} SF</span>}
            {comp.rate && <span>${Number(comp.rate).toFixed(2)}/SF</span>}
            {comp.expiration_date && <span>Exp {formatDatePacific(comp.expiration_date)}</span>}
          </>
        ) : (
          <>
            {comp.sale_price && <span>${Number(comp.sale_price).toLocaleString()}</span>}
            {comp.sf && <span>{Number(comp.sf).toLocaleString()} SF</span>}
            {comp.sale_date && <span>{formatDatePacific(comp.sale_date)}</span>}
          </>
        )}
      </div>
    </div>
  );
}

export default function CompHistorySection({ leaseComps = [], saleComps = [], title = 'Comp History' }) {
  const total = leaseComps.length + saleComps.length;
  if (total === 0) return null;

  return (
    <Section title={title} badge={total} defaultOpen={total > 0}>
      {leaseComps.map((c) => <CompRow key={`l-${c.id}`} comp={c} type="lease" />)}
      {saleComps.map((c) => <CompRow key={`s-${c.id}`} comp={c} type="sale" />)}
    </Section>
  );
}
