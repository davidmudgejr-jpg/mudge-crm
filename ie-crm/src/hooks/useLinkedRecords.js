import { useState, useEffect, useRef } from 'react';
import {
  batchGetPropertyContacts, batchGetPropertyCompanies, batchGetPropertyDeals,
  batchGetContactProperties, batchGetContactCompanies, batchGetContactDeals, batchGetContactCampaigns,
  batchGetCompanyContacts, batchGetCompanyProperties, batchGetCompanyDeals,
  batchGetDealProperties, batchGetDealContacts, batchGetDealCompanies,
  batchGetActionItemContacts, batchGetActionItemProperties, batchGetActionItemDeals, batchGetActionItemCompanies,
} from '../api/database';

const ENTITY_FETCHERS = {
  properties: {
    idField: 'property_id',
    linked: {
      linked_contacts: batchGetPropertyContacts,
      linked_companies: batchGetPropertyCompanies,
      linked_deals: batchGetPropertyDeals,
    },
  },
  contacts: {
    idField: 'contact_id',
    linked: {
      linked_properties: batchGetContactProperties,
      linked_companies: batchGetContactCompanies,
      linked_deals: batchGetContactDeals,
      linked_campaigns: batchGetContactCampaigns,
    },
  },
  companies: {
    idField: 'company_id',
    linked: {
      linked_contacts: batchGetCompanyContacts,
      linked_properties: batchGetCompanyProperties,
      linked_deals: batchGetCompanyDeals,
    },
  },
  deals: {
    idField: 'deal_id',
    linked: {
      linked_properties: batchGetDealProperties,
      linked_contacts: batchGetDealContacts,
      linked_companies: batchGetDealCompanies,
    },
  },
  action_items: {
    idField: 'action_item_id',
    linked: {
      linked_contacts: batchGetActionItemContacts,
      linked_properties: batchGetActionItemProperties,
      linked_deals: batchGetActionItemDeals,
      linked_companies: batchGetActionItemCompanies,
    },
  },
};

/**
 * Hook that batch-fetches linked records for rows displayed in a CRM table.
 * Returns an object keyed by linked column name, each containing a map of
 * source entity ID -> array of linked records.
 *
 * Usage:
 *   const linked = useLinkedRecords('properties', rows);
 *   // linked.linked_contacts[propertyId] => [{ contact_id, full_name, type }, ...]
 */
export default function useLinkedRecords(entityType, rows) {
  const [data, setData] = useState({});
  const prevIdsRef = useRef('');

  useEffect(() => {
    const config = ENTITY_FETCHERS[entityType];
    if (!config || !rows?.length) {
      setData({});
      return;
    }

    const ids = rows.map((r) => r[config.idField]).filter(Boolean);
    const idsKey = ids.join(',');

    // Skip if same set of IDs
    if (idsKey === prevIdsRef.current) return;
    prevIdsRef.current = idsKey;

    let cancelled = false;

    (async () => {
      const results = {};
      const entries = Object.entries(config.linked);

      // Fetch all linked record types in parallel
      const fetched = await Promise.all(
        entries.map(([, fn]) => fn(ids).catch(() => ({})))
      );

      if (cancelled) return;

      entries.forEach(([key], i) => {
        results[key] = fetched[i];
      });

      setData(results);
    })();

    return () => { cancelled = true; };
  }, [entityType, rows]);

  return data;
}
