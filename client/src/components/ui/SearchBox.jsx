import { Search, X } from 'lucide-react';

export function SearchBox({ value, onChange, placeholder = 'Search...', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border pl-9 pr-8 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-gold-400 focus:border-gold-400 transition-colors"
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
