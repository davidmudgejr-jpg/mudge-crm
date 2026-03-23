import React, { useState, useEffect, useCallback } from 'react';
import SlideOver, { SlideOverHeader } from '../shared/SlideOver';
import { useToast } from '../shared/Toast';

const API_BASE = import.meta.env.VITE_API_URL || '';
function authHeaders(extra = {}) {
  const token = localStorage.getItem('crm-auth-token');
  return { ...(token ? { 'Authorization': `Bearer ${token}` } : {}), ...extra };
}

async function fetchConfig() {
  const res = await fetch(`${API_BASE}/api/ai/tpe-config`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function patchConfig(key, value) {
  const res = await fetch(`${API_BASE}/api/ai/tpe-config`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ config_key: key, config_value: value }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function resetConfig() {
  const res = await fetch(`${API_BASE}/api/ai/tpe-config/reset`, { method: 'POST', headers: authHeaders() });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function SliderControl({ label, description, value, min, max, step, configKey, onSave }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium">{label}</label>
        <span className="text-xs text-crm-accent font-mono tabular-nums">{local}</span>
      </div>
      {description && <div className="text-[10px] text-crm-muted">{description}</div>}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        onChange={(e) => setLocal(parseFloat(e.target.value))}
        onMouseUp={() => onSave(configKey, local)}
        onTouchEnd={() => onSave(configKey, local)}
        className="w-full accent-crm-accent"
      />
      <div className="flex justify-between text-[10px] text-crm-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function NumberControl({ label, description, value, configKey, onSave }) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">{label}</label>
      {description && <div className="text-[10px] text-crm-muted">{description}</div>}
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(parseFloat(e.target.value) || 0)}
        onBlur={() => onSave(configKey, local)}
        className="w-full bg-crm-card border border-crm-border rounded-lg px-3 py-2 text-sm text-crm-text focus:outline-none focus:border-crm-accent/50"
      />
    </div>
  );
}

export default function QuickTuneDrawer({ onClose, onConfigChanged }) {
  const { addToast } = useToast();
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async () => {
    try {
      const rows = await fetchConfig();
      const map = {};
      (rows || []).forEach((r) => { map[r.config_key] = parseFloat(r.config_value); });
      setConfig(map);
    } catch (err) {
      addToast('Failed to load config', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = useCallback(async (key, value) => {
    const prev = config[key];
    setConfig((c) => ({ ...c, [key]: value }));
    try {
      await patchConfig(key, value);
      onConfigChanged?.();
    } catch (err) {
      setConfig((c) => ({ ...c, [key]: prev }));
      addToast(`Save failed: ${err.message}`, 'error');
    }
  }, [config, onConfigChanged, addToast]);

  const handleReset = useCallback(async () => {
    if (!window.confirm('Reset all TPE weights to defaults?')) return;
    try {
      await resetConfig();
      await loadConfig();
      onConfigChanged?.();
      addToast('Weights reset to defaults', 'success');
    } catch (err) {
      addToast(`Reset failed: ${err.message}`, 'error');
    }
  }, [loadConfig, onConfigChanged, addToast]);

  // Blend slider: single slider controls both tpe_weight and ecv_weight
  const tpeWeight = Math.round((config.tpe_weight || 0.7) * 100);
  const handleBlendChange = (_, val) => {
    const tpe = val / 100;
    const ecv = 1 - tpe;
    setConfig((c) => ({ ...c, tpe_weight: tpe, ecv_weight: ecv }));
  };
  const handleBlendSave = async () => {
    const tpe = (config.tpe_weight || 0.7);
    const ecv = (config.ecv_weight || 0.3);
    try {
      // Send both weights atomically in a single batch PATCH
      const res = await fetch(`${API_BASE}/api/ai/tpe-config`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify([
          { config_key: 'tpe_weight', config_value: tpe },
          { config_key: 'ecv_weight', config_value: ecv },
        ]),
      });
      if (!res.ok) throw new Error(await res.text());
      onConfigChanged?.();
    } catch (err) {
      addToast(`Save failed: ${err.message}`, 'error');
    }
  };

  if (loading) {
    return (
      <SlideOver onClose={onClose} width="w-[380px]">
        <SlideOverHeader title="Tune Weights" onClose={onClose} />
        <div className="px-5 py-8 text-center text-crm-muted text-sm">Loading config...</div>
      </SlideOver>
    );
  }

  return (
    <SlideOver onClose={onClose} width="w-[380px]">
      <SlideOverHeader title="Tune Weights" subtitle="Adjust scoring parameters" onClose={onClose} />

      <div className="px-5 py-4 space-y-6">
        {/* 1. TPE / ECV Blend */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium">TPE / ECV Blend</label>
            <span className="text-xs text-crm-accent font-mono">{tpeWeight}/{100 - tpeWeight}</span>
          </div>
          <div className="text-[10px] text-crm-muted">Balance between property signals and commission value</div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={tpeWeight}
            onChange={(e) => handleBlendChange(null, parseInt(e.target.value))}
            onMouseUp={handleBlendSave}
            onTouchEnd={handleBlendSave}
            className="w-full accent-crm-accent"
          />
          <div className="flex justify-between text-[10px] text-crm-muted">
            <span>100% ECV</span>
            <span>100% TPE</span>
          </div>
        </div>

        {/* 2. A-Tier Threshold */}
        <NumberControl
          label="A-Tier Threshold"
          description="Minimum blended score for A classification"
          value={config.tier_a_threshold || 50}
          configKey="tier_a_threshold"
          onSave={handleSave}
        />

        {/* 3. B-Tier Threshold */}
        <NumberControl
          label="B-Tier Threshold"
          description="Minimum blended score for B classification"
          value={config.tier_b_threshold || 40}
          configKey="tier_b_threshold"
          onSave={handleSave}
        />

        {/* 3b. C-Tier Threshold */}
        <NumberControl
          label="C-Tier Threshold"
          description="Minimum blended score for C classification"
          value={config.tier_c_threshold || 30}
          configKey="tier_c_threshold"
          onSave={handleSave}
        />

        {/* 4. Lease 12-Month Points */}
        <SliderControl
          label="Lease ≤12mo Points"
          description="Weight for leases expiring within 12 months"
          value={config.lease_12mo_points || 30}
          min={0}
          max={30}
          step={1}
          configKey="lease_12mo_points"
          onSave={handleSave}
        />

        {/* 5. Time Multiplier (≤6mo) */}
        <SliderControl
          label="Time Multiplier (≤6mo)"
          description="Boost for near-term opportunities"
          value={config.time_mult_6mo || 1.20}
          min={0.5}
          max={2.0}
          step={0.05}
          configKey="time_mult_6mo"
          onSave={handleSave}
        />

        {/* 6. Commission Divisor */}
        <NumberControl
          label="Commission Divisor ($)"
          description="ECV scaling divisor — lower = more generous scoring"
          value={config.commission_divisor || 2500}
          configKey="commission_divisor"
          onSave={handleSave}
        />

        {/* Reset */}
        <div className="pt-4 border-t border-crm-border">
          <button
            onClick={handleReset}
            className="w-full text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-500/50 rounded-lg px-3 py-2 transition-colors"
          >
            Reset All to Defaults
          </button>
          <div className="text-[10px] text-crm-muted mt-2 text-center">
            All other weights can be adjusted via Claude chat
          </div>
        </div>
      </div>
    </SlideOver>
  );
}
