import React from 'react';
import { useNavigate } from 'react-router-dom';
import { setPivot, collectLinkedIds } from '../../utils/pivotNav';

/**
 * "Open as [Entity] →" button that collects linked record IDs from the current
 * displayed rows and navigates to that entity's tab with a pre-filter.
 *
 * Props:
 *   rows       - augmented rows with linked_* arrays
 *   linkedKey  - e.g. 'linked_contacts'
 *   idField    - e.g. 'contact_id'
 *   target     - route path, e.g. 'contacts'
 *   label      - display label, e.g. 'Contacts'
 *   sourceLabel - where these came from, e.g. 'Companies: Lease Expiring'
 */
export default function PivotButton({ rows, linkedKey, idField, target, label, sourceLabel }) {
  const navigate = useNavigate();

  const ids = React.useMemo(
    () => collectLinkedIds(rows, linkedKey, idField),
    [rows, linkedKey, idField]
  );

  if (ids.length === 0) return null;

  return (
    <button
      onClick={() => {
        setPivot(target, ids, sourceLabel || `Linked ${label}`);
        navigate(`/${target}`);
        // Dispatch event so already-mounted pages can pick up the pivot
        setTimeout(() => window.dispatchEvent(new CustomEvent('crm-pivot', { detail: { target } })), 50);
      }}
      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md
        text-crm-accent border border-crm-accent
        hover:bg-crm-accent hover:text-white transition-colors"
      title={`Open ${ids.length} linked ${label.toLowerCase()} in their own tab`}
    >
      Open {ids.length} {label} <span className="opacity-60">→</span>
    </button>
  );
}
