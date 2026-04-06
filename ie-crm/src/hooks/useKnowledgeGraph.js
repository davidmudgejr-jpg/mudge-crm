import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function authHeaders() {
  const token = localStorage.getItem('crm-auth-token');
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

/**
 * Fetches knowledge-graph data (nodes, edges) and inbox stats.
 * Supports filter state: { type, status, tags, search }.
 */
export default function useKnowledgeGraph(initialFilters = {}) {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [stats, setStats] = useState({ pending: 0, total: 0, stale: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    tags: '',
    search: '',
    ...initialFilters,
  });
  const abortRef = useRef(null);

  const fetchGraph = useCallback(async (currentFilters) => {
    // Abort previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      // Build query params from filters
      const params = new URLSearchParams();
      if (currentFilters.type) params.set('type', currentFilters.type);
      if (currentFilters.status) params.set('status', currentFilters.status);
      if (currentFilters.tags) params.set('tags', currentFilters.tags);
      if (currentFilters.search) params.set('q', currentFilters.search);

      const qs = params.toString();
      const graphUrl = `${API_BASE}/api/knowledge/graph${qs ? '?' + qs : ''}`;
      const statsUrl = `${API_BASE}/api/knowledge/stats`;

      const [graphRes, statsRes] = await Promise.all([
        fetch(graphUrl, { headers: authHeaders(), signal: controller.signal }),
        fetch(statsUrl, { headers: authHeaders(), signal: controller.signal }),
      ]);

      if (!graphRes.ok) throw new Error(`Graph fetch failed: ${graphRes.status}`);
      const graphData = await graphRes.json();

      setNodes(graphData.nodes || []);
      setEdges(graphData.edges || []);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch when filters change
  useEffect(() => {
    fetchGraph(filters);
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [filters, fetchGraph]);

  const refetch = useCallback(() => {
    fetchGraph(filters);
  }, [filters, fetchGraph]);

  const updateFilters = useCallback((patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  }, []);

  return { nodes, edges, stats, loading, error, refetch, filters, updateFilters };
}
