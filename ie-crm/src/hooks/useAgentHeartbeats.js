import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL = 30000; // 30s

export default function useAgentHeartbeats() {
  const [data, setData] = useState({ agents: [], pending: [], recentLogs: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stale, setStale] = useState(false);

  const fetch_ = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/dashboard/summary`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
      setStale(false);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setStale(true);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { ...data, loading, error, stale, refetch: fetch_ };
}
