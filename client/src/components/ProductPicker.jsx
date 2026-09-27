import { useEffect, useState, useRef } from 'react';
import { Search } from 'lucide-react';
import { productService } from '../services/index.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { formatCurrency } from '../utils/format.js';

export function ProductPicker({ onSelect, placeholder = 'Search product by name, SKU or barcode...' }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(query, 250);
  const ref = useRef(null);

  useEffect(() => {
    if (!debounced.trim()) { setResults([]); return; }
    productService.list({ search: debounced, limit: 8, status: 'active', withStock: true }).then((r) => { setResults(r.data); setOpen(true); });
  }, [debounced]);

  useEffect(() => {
    function onClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-lg border pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
        />
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full surface-card rounded-xl shadow-premium-lg max-h-72 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p._id}
              type="button"
              onClick={() => { onSelect(p); setQuery(''); setResults([]); setOpen(false); }}
              className="w-full flex items-center justify-between px-3.5 py-2.5 hover:bg-gold-50 text-left"
            >
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.sku} &middot; Stock: {p.stock ?? 0}</div>
              </div>
              <span className="text-sm font-medium">{formatCurrency(p.sellingPrice)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductPicker;
