// Editable table for all TPE config weights, grouped by category.
// Fetches from GET /api/ai/tpe-config, saves via PATCH /api/ai/tpe-config.

import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

const CATEGORY_LABELS = {
  lease: 'Lease Scoring',
  ownership: 'Ownership Profile',
  age: 'Owner Age',
  growth: 'Tenant Growth',
  stress: 'Debt & Stress',
  commission: 'Commission Rates',
  blend: 'Blended Weights',
  maturity: 'Loan Maturity',
  distress: 'Distress Signals',
  tiers: 'Tier Thresholds',
};

const CATEGORY_ORDER = ['blend', 'tiers', 'lease', 'ownership', 'age', 'growth', 'stress', 'maturity', 'distress', 'commission'];

export default function TpeWeightsTable() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [resetting, setResetting] = useState(false);

  const token = localStorage.getItem('crm-auth-token');
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ai/tpe-config`, { headers });
      if (!res.ok) throw new Error('Failed to fetch TPE config');
      const data = await res.json();
      setConfigs(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveValue = async (config_key, config_value) => {
    setSaving(config_key);
    try {
      const res = await fetch(`${API_BASE}/api/ai/tpe-config`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ config_key, config_value: parseFloat(config_value) }),
      });
      if (!res.ok) throw new Error('Save failed');
      setConfigs((prev) => prev.map((c) => c.config_key === config_key ? { ...c, config_value } : c));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all TPE weights to defaults? This cannot be undone.')) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/tpe-config/reset`, { method: 'POST', headers });
      if (!res.ok) throw new Error('Reset failed');
      const data = await res.json();
      setConfigs(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
    }
  };

  // Group by category
  const grouped = {};
  for (const c of configs) {
    const cat = c.config_category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(c);
  }

  const sortedCategories = CATEGORY_ORDER.filter((k) => grouped[k]);
  // Add any categories not in the predefined order
  for (const k of Object.keys(grouped)) {
    if (!sortedCategories.includes(k)) sortedCategories.push(k);
  }

  if (loading) {
    return (
      <div className="bg-crm-card border border-crm-border rounded-lg p-6 text-center">
        <div className="animate-pulse text-xs text-crm-muted">Loading TPE weights...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-crm-muted">{configs.length} weights across {sortedCategories.length} categories</p>
        <button
          onClick={handleReset}
          disabled={resetting}
          className="text-xs text-red-400 hover:text-red-300 disabled:opacity-40 transition-colors"
        >
          {resetting ? 'Resetting...' : 'Reset All to Defaults'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      {sortedCategories.map((cat) => (
        <div key={cat} className="bg-crm-card border border-crm-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-crm-border/50 bg-crm-hover/30">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-crm-muted">
              {CATEGORY_LABELS[cat] || cat}
            </h3>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {grouped[cat].map((c) => (
                <ConfigRow
                  key={c.config_key}
                  config={c}
                  saving={saving === c.config_key}
                  onSave={saveValue}
                />
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function ConfigRow({ config, saving, onSave }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(config.config_value));

  const handleSubmit = () => {
    setEditing(false);
    if (value !== String(config.config_value)) {
      onSave(config.config_key, value);
    }
  };

  const displayKey = config.config_key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <tr className="border-b border-crm-border/30 last:border-0 hover:bg-crm-hover/20 transition-colors">
      <td className="px-4 py-2 w-[45%]">
        <div className="font-medium text-crm-text">{displayKey}</div>
        {config.description && (
          <div className="text-[10px] text-crm-muted/70 mt-0.5">{config.description}</div>
        )}
      </td>
      <td className="px-4 py-2 text-right w-[25%]">
        {editing ? (
          <input
            autoFocus
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit();
              if (e.key === 'Escape') { setEditing(false); setValue(String(config.config_value)); }
            }}
            className="w-24 bg-crm-hover border border-crm-accent text-crm-text text-xs px-2 py-1 rounded text-right outline-none [color-scheme:dark]"
          />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className={`font-mono px-2 py-1 rounded hover:bg-crm-hover transition-colors ${
              saving ? 'text-crm-accent animate-pulse' : 'text-crm-text'
            }`}
          >
            {config.config_value}
          </button>
        )}
      </td>
    </tr>
  );
}
