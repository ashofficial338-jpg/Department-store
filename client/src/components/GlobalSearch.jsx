import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import Modal from './ui/Modal.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import { searchService } from '../services/index.js';
import NAV_SECTIONS from '../routes/navConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../utils/permissions.js';

const ROUTE_MAP = {
  product: (id) => `/products?highlight=${id}`,
  customer: (id) => `/customers?highlight=${id}`,
  vendor: (id) => `/purchasing/vendors?highlight=${id}`,
  supplier: (id) => `/purchasing/suppliers?highlight=${id}`,
  sale: (id) => `/sales/invoices?highlight=${id}`,
  purchase: (id) => `/purchasing/orders?highlight=${id}`,
  batch: (id) => `/products/batches?highlight=${id}`,
};

export function GlobalSearch({ open, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(query, 300);
  const navigate = useNavigate();
  const { user } = useAuth();

  const q = query.trim().toLowerCase();
  const pages = q
    ? NAV_SECTIONS.flatMap((section) => section.items
      .filter((item) => (!user || hasPermission(user, item.module))
        && `${section.label || ''} ${item.label}`.toLowerCase().includes(q))
      .map((item) => ({ ...item, section: section.label })))
      .slice(0, 6)
    : [];

  function go(to) { navigate(to); onClose(); }

  useEffect(() => {
    if (!debounced.trim()) { setResults(null); return; }
    setLoading(true);
    searchService.global(debounced).then((res) => setResults(res.data)).finally(() => setLoading(false));
  }, [debounced]);

  useEffect(() => { if (!open) { setQuery(''); setResults(null); } }, [open]);

  const groups = results ? Object.entries(results).filter(([, list]) => list.length) : [];
  const nothingFound = !loading && q && groups.length === 0 && pages.length === 0;

  return (
    <Modal open={open} onClose={onClose} title="Global Search" size="lg">
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && pages.length) go(pages[0].to); }}
          placeholder="Type a page (e.g. low stock) or a product, customer, invoice..."
          className="w-full rounded-xl border pl-9 pr-4 py-3 text-sm focus:outline-none focus:!border-brand-400"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', background: 'var(--bg-surface-muted)' }}
        />
      </div>

      {loading && <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Searching...</p>}

      {nothingFound && (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No matches for &ldquo;{query}&rdquo;.</p>
      )}

      {!q && (
        <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>Search pages, products, customers, vendors, invoices and purchase orders.</p>
      )}

      <div className="space-y-4 max-h-[50vh] overflow-y-auto">
        {pages.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Go to page</div>
            <div className="space-y-1">
              {pages.map((page) => (
                <button
                  key={page.to}
                  onClick={() => go(page.to)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-brand-50 text-left text-sm transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><page.icon size={14} /></span>
                  <span className="flex-1" style={{ color: 'var(--text-primary)' }}>{page.label}</span>
                  {page.section && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{page.section}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        {groups.map(([type, list]) => (
          <div key={type}>
            <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>{type}</div>
            <div className="space-y-1">
              {list.map((item) => (
                <button
                  key={item.id}
                  onClick={() => go(ROUTE_MAP[item.type]?.(item.id) || '/dashboard')}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-50 text-left text-sm transition-colors"
                >
                  <span style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                  {item.sub && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{item.sub}</span>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

export default GlobalSearch;
