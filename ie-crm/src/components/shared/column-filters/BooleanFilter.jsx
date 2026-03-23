export default function BooleanFilter({ value, onChange }) {
  const options = [
    { label: 'All', val: null },
    { label: 'Yes', val: true },
    { label: 'No',  val: false },
  ];

  return (
    <div className="flex rounded overflow-hidden border border-crm-border" style={{ minWidth: 150 }}>
      {options.map(({ label, val }) => {
        const isActive = value === val;
        return (
          <button
            key={label}
            onClick={() => onChange(val)}
            className={`flex-1 text-xs py-1.5 px-3 transition-colors ${
              isActive
                ? 'bg-crm-accent/20 text-crm-accent font-medium'
                : 'text-crm-muted hover:text-crm-text hover:bg-crm-hover'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
