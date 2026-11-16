import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Loader2, Search, X } from 'lucide-react';
import clsx from 'clsx';
import { useDebounce } from '../hooks/useDebounce.js';
import { searchService } from '../services/index.js';
import NAV_SECTIONS from '../routes/navConfig.js';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../utils/permissions.js';

const EASE = [0.22, 1, 0.36, 1];

const ROUTE_MAP = {
  product: (id) => `/products?highlight=${id}`,
  customer: (id) => `/customers?highlight=${id}`,
  vendor: (id) => `/purchasing/vendors?highlight=${id}`,
  supplier: (id) => `/purchasing/suppliers?highlight=${id}`,
  sale: (id) => `/sales/invoices?highlight=${id}`,
  purchase: (id) => `/purchasing/orders?highlight=${id}`,
  batch: (id) => `/products/batches?highlight=${id}`,
};

const titleCase = (s) => String(s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Search bar that lives in the header: pages match instantly, records (products, customers,
// invoices…) arrive from the API. Ctrl/⌘+K focuses it, ↑ ↓ + Enter navigate, X or Esc closes.
export function HeaderSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false); // phone: the bar unfolds over the header
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const debounced = useDebounce(query, 300);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();

  const allPages = useMemo(() => NAV_SECTIONS.flatMap((section) => section.items
    .filter((item) => !user || hasPermission(user, item.module))
    .map((item) => ({ ...item, section: section.label }))), [user]);

  const q = query.trim().toLowerCase();
  const pages = q
    ? allPages.filter((p) => `${p.section || ''} ${p.label}`.toLowerCase().includes(q)).slice(0, 6)
    : allPages.slice(0, 6);

  const groups = useMemo(() => (q && results ? Object.entries(results).filter(([, list]) => list?.length) : []), [results, q]);

  // One flat list drives keyboard navigation across every group.
  const flat = useMemo(() => [
    ...pages.map((p) => ({ key: `page:${p.to}`, to: p.to })),
    ...groups.flatMap(([, list]) => list.map((item) => ({ key: `${item.type}:${item.id}`, to: ROUTE_MAP[item.type]?.(item.id) || '/dashboard' }))),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [q, groups, allPages]);

  function close() {
    setOpen(false);
    setExpanded(false);
    inputRef.current?.blur();
  }
  function clearAndClose() { setQuery(''); setResults(null); close(); }
  function go(to) { navigate(to); clearAndClose(); }
  function focusSearch() {
    setExpanded(true);
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  useEffect(() => {
    const term = debounced.trim();
    if (!term) { setResults(null); setLoading(false); return undefined; }
    let cancelled = false;
    setLoading(true);
    searchService.global(term)
      .then((res) => { if (!cancelled) setResults(res.data); })
      .catch(() => { if (!cancelled) setResults(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  useEffect(() => { setActive(0); }, [q, results]);
  useEffect(() => { setOpen(false); setExpanded(false); }, [pathname]);

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearch(); }
    }
    function onDown(e) { if (rootRef.current && !rootRef.current.contains(e.target)) { setOpen(false); setExpanded(false); } }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, []);

  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (query) { setQuery(''); setResults(null); } else close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active].to); }
  }

  const nothingFound = q && !loading && debounced.trim().toLowerCase() === q && flat.length === 0;
  let index = -1;
  const rowClass = (isActive) => clsx(
    'w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-sm transition-colors duration-150',
    isActive && 'bg-[var(--gold-tint)]',
  );

  return (
    <>
      <button
        type="button" onClick={focusSearch} aria-label="Search"
        className={clsx('sm:hidden w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 hover:bg-[var(--hover-tint)] active:scale-95', expanded && 'invisible')}
      >
        <Search size={18} style={{ color: 'var(--text-secondary)' }} />
      </button>

      <div
        ref={rootRef}
        className={clsx(
          expanded ? 'absolute inset-x-0 top-0 z-20 h-16 px-3 flex items-center bg-[var(--bg-surface)]' : 'hidden',
          'sm:relative sm:inset-auto sm:z-auto sm:flex sm:items-center sm:h-auto sm:px-0 sm:bg-transparent sm:flex-1 sm:max-w-xl min-w-0',
        )}
      >
        <div className="relative w-full" role="search">
          <Search size={16} className={clsx('absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-300', open ? 'text-gold-600' : '')} style={open ? undefined : { color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, products, customers, invoices…"
            aria-label="Search"
            role="combobox"
            aria-expanded={open}
            aria-controls="header-search-results"
            autoComplete="off"
            className="w-full rounded-xl border pl-10 pr-24 py-2.5 text-sm font-medium placeholder:font-normal focus:outline-none transition-all duration-300 ease-luxe hover:border-gold-400/70"
            style={{
              color: 'var(--text-primary)', background: 'var(--bg-surface)',
              borderColor: open ? '#D2AA6C' : 'var(--border-subtle)',
              boxShadow: open ? '0 0 0 4px rgba(194,154,86,0.14), 0 12px 28px -18px rgba(17,18,24,0.4)' : 'none',
            }}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {loading && <Loader2 size={15} className="animate-spin text-gold-600" />}
            {!query && !expanded && (
              <kbd className="hidden md:inline text-[10px] font-semibold px-1.5 py-0.5 rounded-md border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-muted)', color: 'var(--text-muted)' }}>Ctrl K</kbd>
            )}
            {(query || expanded || open) && (
              <button
                type="button" onClick={clearAndClose} aria-label="Clear and close search" title="Close (Esc)"
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-300 ease-luxe hover:bg-[var(--hover-tint)] hover:rotate-90 active:scale-90"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <AnimatePresence>
            {open && (
              <motion.div
                id="header-search-results"
                ref={listRef}
                initial={{ opacity: 0, y: -8, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.99 }}
                transition={{ duration: 0.22, ease: EASE }}
                className="popover-panel absolute left-0 right-0 top-full mt-2 rounded-2xl overflow-hidden origin-top"
              >
                <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2 space-y-2">
                  {pages.length > 0 && (
                    <div>
                      <div className="eyebrow px-3 pt-1.5 pb-1 !text-[10px]">{q ? 'Go to page' : 'Quick links'}</div>
                      {pages.map((page) => {
                        index += 1;
                        const i = index;
                        return (
                          <button key={page.to} type="button" data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(page.to)} className={rowClass(i === active)}>
                            <span className="w-7 h-7 rounded-lg bg-gold-50 text-gold-700 flex items-center justify-center shrink-0"><page.icon size={14} /></span>
                            <span className="flex-1 truncate font-medium" style={{ color: 'var(--text-primary)' }}>{page.label}</span>
                            {page.section && <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{page.section}</span>}
                            {i === active && <CornerDownLeft size={13} className="shrink-0 text-gold-600" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {groups.map(([type, list]) => (
                    <div key={type}>
                      <div className="eyebrow px-3 pt-1.5 pb-1 !text-[10px]">{titleCase(type)}</div>
                      {list.map((item) => {
                        index += 1;
                        const i = index;
                        return (
                          <button key={`${item.type}:${item.id}`} type="button" data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(ROUTE_MAP[item.type]?.(item.id) || '/dashboard')} className={rowClass(i === active)}>
                            <span className="flex-1 truncate font-medium" style={{ color: 'var(--text-primary)' }}>{item.label}</span>
                            {item.sub && <span className="num text-xs shrink-0 max-w-[45%] truncate" style={{ color: 'var(--text-muted)' }}>{item.sub}</span>}
                            {i === active && <CornerDownLeft size={13} className="shrink-0 text-gold-600" />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {nothingFound && (
                    <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No matches for &ldquo;{query.trim()}&rdquo;.</p>
                  )}
                </div>
                <div className="hidden sm:flex items-center gap-3 px-4 py-2 border-t text-[11px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-muted)', background: 'var(--bg-surface-muted)' }}>
                  <span><kbd className="font-semibold">↑↓</kbd> navigate</span>
                  <span><kbd className="font-semibold">Enter</kbd> open</span>
                  <span><kbd className="font-semibold">Esc</kbd> close</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}

export default HeaderSearch;
