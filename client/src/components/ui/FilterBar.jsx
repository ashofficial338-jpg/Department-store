export function FilterBar({ children }) {
  return <div className="flex flex-wrap items-center gap-3 mb-4">{children}</div>;
}

export function FilterSelect({ value, onChange, options, placeholder, label }) {
  return (
    <select
      aria-label={label || placeholder || 'Filter'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-lg border px-3 text-sm font-medium bg-[var(--bg-surface)] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:border-[var(--border-strong)] focus:outline-none focus:!border-gold-500 cursor-pointer transition-colors duration-200 max-w-full"
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
