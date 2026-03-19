import { useState } from 'react';

const PRESETS = [
  { label: 'Today',        operator: 'today' },
  { label: 'This Week',    operator: 'this_week' },
  { label: 'This Month',   operator: 'this_month' },
  { label: 'Last 30 Days', operator: 'last_30_days' },
  { label: 'Last 90 Days', operator: 'last_90_days' },
  { label: 'This Year',    operator: 'this_year' },
  { label: 'Next 90 Days', operator: 'next_90_days' },
  { label: 'Overdue',      operator: 'overdue' },
];

export default function DateFilter({ value, onChange }) {
  const [showCustom, setShowCustom] = useState(
    value?.operator === 'between' || false
  );
  const [customFrom, setCustomFrom] = useState(
    value?.operator === 'between' ? value.value?.from ?? '' : ''
  );
  const [customTo, setCustomTo] = useState(
    value?.operator === 'between' ? value.value?.to ?? '' : ''
  );

  const activeOperator = value?.operator ?? null;

  const selectPreset = (operator) => {
    setShowCustom(false);
    onChange({ operator, value: null });
  };

  const applyCustom = (from, to) => {
    if (from || to) {
      onChange({ operator: 'between', value: { from, to } });
    }
  };

  const handleFromChange = (e) => {
    const from = e.target.value;
    setCustomFrom(from);
    applyCustom(from, customTo);
  };

  const handleToChange = (e) => {
    const to = e.target.value;
    setCustomTo(to);
    applyCustom(customFrom, to);
  };

  const toggleCustom = () => {
    const next = !showCustom;
    setShowCustom(next);
    if (next) {
      onChange(null);
    }
  };

  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 220 }}>
      <div className="grid grid-cols-2 gap-1">
        {PRESETS.map(p => (
          <button
            key={p.operator}
            onClick={() => selectPreset(p.operator)}
            className={`text-xs px-2 py-1.5 rounded text-left transition-colors ${
              activeOperator === p.operator && !showCustom
                ? 'bg-crm-accent/20 text-crm-accent'
                : 'text-crm-text hover:bg-crm-hover'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        onClick={toggleCustom}
        className={`text-xs px-2 py-1.5 rounded text-left transition-colors ${
          showCustom
            ? 'bg-crm-accent/20 text-crm-accent'
            : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
        }`}
      >
        Custom Range
      </button>

      {showCustom && (
        <div className="flex flex-col gap-2 pt-1 border-t border-crm-border">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-crm-muted uppercase tracking-wide">From</label>
            <input
              type="date"
              value={customFrom}
              onChange={handleFromChange}
              className="w-full rounded px-2 py-1 text-xs bg-crm-bg border border-crm-border text-crm-text outline-none focus:border-crm-accent [color-scheme:dark]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-crm-muted uppercase tracking-wide">To</label>
            <input
              type="date"
              value={customTo}
              onChange={handleToChange}
              className="w-full rounded px-2 py-1 text-xs bg-crm-bg border border-crm-border text-crm-text outline-none focus:border-crm-accent [color-scheme:dark]"
            />
          </div>
        </div>
      )}

      {value && (
        <button
          onClick={() => { onChange(null); setShowCustom(false); }}
          className="text-xs text-crm-muted hover:text-crm-text hover:underline text-left mt-1"
        >
          Clear Filter
        </button>
      )}
    </div>
  );
}
