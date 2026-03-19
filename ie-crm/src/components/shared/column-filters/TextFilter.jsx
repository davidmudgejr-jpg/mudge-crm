import { useState, useMemo } from 'react';

export default function TextFilter({ values, selected, onChange }) {
  const [search, setSearch] = useState('');

  const sorted = useMemo(() => {
    const unique = [...new Set(values.filter(v => v != null && v !== ''))].sort((a, b) =>
      String(a).localeCompare(String(b))
    );
    return unique;
  }, [values]);

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted.slice(0, 20);
    const q = search.toLowerCase();
    return sorted.filter(v => String(v).toLowerCase().includes(q)).slice(0, 20);
  }, [sorted, search]);

  const selectAll = () => onChange(filtered);
  const clear = () => onChange([]);

  const toggle = (val) => {
    if (selected.includes(val)) {
      onChange(selected.filter(s => s !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  return (
    <div className="flex flex-col gap-2" style={{ minWidth: 200 }}>
      <input
        autoFocus
        type="text"
        placeholder="Search…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full rounded px-2 py-1 text-xs bg-crm-bg border border-crm-border text-crm-text placeholder:text-crm-muted outline-none focus:border-crm-accent [color-scheme:dark]"
      />
      <div className="flex gap-3 text-xs">
        <button onClick={selectAll} className="text-crm-accent hover:underline">Select All</button>
        <button onClick={clear} className="text-crm-muted hover:text-crm-text hover:underline">Clear</button>
      </div>
      <div className="flex flex-col gap-1 overflow-y-auto max-h-48 pr-1">
        {filtered.length === 0 && (
          <p className="text-xs text-crm-muted italic">No options</p>
        )}
        {filtered.map(val => (
          <label key={val} className="flex items-center gap-2 text-xs text-crm-text cursor-pointer hover:text-white">
            <input
              type="checkbox"
              checked={selected.includes(val)}
              onChange={() => toggle(val)}
              className="accent-crm-accent [color-scheme:dark]"
            />
            <span className="truncate">{val}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
