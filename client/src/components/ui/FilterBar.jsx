export function FilterBar({ children }) {
  return <div className="flex flex-wrap items-center gap-3 mb-4">{children}</div>;
}

export function FilterSelect({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-xl border px-3.5 py-2 text-sm font-medium bg-[var(--bg-surface)] hover:border-gold-400 focus:outline-none focus:!border-gold-400 cursor-pointer transition-all duration-300"
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
