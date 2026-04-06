import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function authHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

/**
 * Compact button to link an entity to its knowledge graph node.
 * Place in entity detail headers.
 *
 * Props:
 *   table - e.g. 'contacts', 'companies', 'properties', 'deals'
 *   id    - the entity's UUID
 */
export default function KnowledgeButton({ table, id }) {
  const [slug, setSlug] = useState(null);
  const [checked, setChecked] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!table || !id) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/knowledge/entity/${encodeURIComponent(table)}/${encodeURIComponent(id)}`,
          { headers: authHeaders() }
        );
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json();
            setSlug(data.slug || null);
          }
          setChecked(true);
        }
      } catch {
        if (!cancelled) setChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [table, id]);

  if (!checked) return null;

  const handleClick = () => {
    if (slug) {
      navigate(`/knowledge?focus=${encodeURIComponent(slug)}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={!slug}
      title={slug ? 'View knowledge page' : 'No knowledge page'}
      className={`inline-flex items-center justify-center w-7 h-7 rounded text-sm transition-colors ${
        slug
          ? 'hover:bg-crm-hover text-crm-accent cursor-pointer'
          : 'text-crm-muted opacity-40 cursor-not-allowed'
      }`}
    >
      <span role="img" aria-label="knowledge">
        {'\uD83D\uDCD3'}
      </span>
    </button>
  );
}
