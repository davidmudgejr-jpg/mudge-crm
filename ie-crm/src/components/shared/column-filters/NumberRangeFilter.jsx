export default function NumberRangeFilter({ min, max, onChange }) {
  return (
    <div className="flex flex-col gap-3" style={{ minWidth: 180 }}>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-crm-muted uppercase tracking-wide">Min</label>
        <input
          type="number"
          value={min ?? ''}
          onChange={e => onChange({ min: e.target.value === '' ? null : Number(e.target.value), max })}
          placeholder="No minimum"
          className="w-full rounded px-2 py-1 text-xs bg-crm-bg border border-crm-border text-crm-text placeholder:text-crm-muted outline-none focus:border-crm-accent [color-scheme:dark]"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-crm-muted uppercase tracking-wide">Max</label>
        <input
          type="number"
          value={max ?? ''}
          onChange={e => onChange({ min, max: e.target.value === '' ? null : Number(e.target.value) })}
          placeholder="No maximum"
          className="w-full rounded px-2 py-1 text-xs bg-crm-bg border border-crm-border text-crm-text placeholder:text-crm-muted outline-none focus:border-crm-accent [color-scheme:dark]"
        />
      </div>
    </div>
  );
}
