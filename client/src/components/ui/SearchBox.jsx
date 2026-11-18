import { Search, X } from 'lucide-react';

export function SearchBox({ value, onChange, placeholder = 'Search...', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-10 rounded-lg border pl-9 pr-8 text-sm shadow-[0_1px_2px_rgba(15,23,42,0.04)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] focus:outline-none focus:!border-gold-500 transition-colors duration-200"
        style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}
      />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-graphite-400 hover:text-graphite-600">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export default SearchBox;
