export function FilterBar({ children }) {
  return <div className="flex flex-wrap items-center gap-3 mb-4">{children}</div>;
}

export function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer"
      style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export default FilterBar;
