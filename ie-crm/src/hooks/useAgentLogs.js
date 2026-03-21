import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const POLL_INTERVAL = 15000; // 15s

export default function useAgentLogs(agentName = null, logType = null, limit = 50) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch_ = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (agentName) params.set('agent', agentName);
      if (logType) params.set('type', logType);
      params.set('limit', limit);
      const token = localStorage.getItem('crm-auth-token');
      const res = await fetch(`${API_BASE}/api/ai/logs?${params}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setLogs(json);
      setError(null);
      setLoading(false);
    } catch (err) {
      setError(err.message);
    }
  }, [agentName, logType, limit]);

  useEffect(() => {
    fetch_();
    const interval = setInterval(fetch_, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetch_]);

  return { logs, loading, error, refetch: fetch_ };
}
