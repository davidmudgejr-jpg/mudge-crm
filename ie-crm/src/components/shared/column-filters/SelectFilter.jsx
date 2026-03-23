export default function SelectFilter({ options, selected, onChange }) {
  const selectAll = () => onChange([...options]);
  const clear = () => onChange([]);

  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter(s => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 180 }}>
      <div className="flex gap-3 text-xs">
        <button onClick={selectAll} className="text-crm-accent hover:underline">Select All</button>
        <button onClick={clear} className="text-crm-muted hover:text-crm-text hover:underline">Clear</button>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto max-h-48 pr-1">
        {options.length === 0 && (
          <p className="text-xs text-crm-muted italic">No options</p>
        )}
        {options.map(opt => (
          <label key={opt} className="flex items-center gap-2 text-xs text-crm-text cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="accent-crm-accent [color-scheme:dark]"
            />
            <span className="truncate">{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
