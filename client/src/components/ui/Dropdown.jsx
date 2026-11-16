import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import clsx from 'clsx';

const EASE = [0.22, 1, 0.36, 1];
const MAX_RENDERED = 100;

// Animated replacement for a native <select>. `placeholder` doubles as the "no filter" choice (value '').
// Long lists get a search box automatically; keyboard: ↑ ↓ to move, Enter to pick, Esc to close.
export function Dropdown({
  value, onChange, options = [], placeholder = 'All', label, ariaLabel, icon: Icon,
  searchable, clearable = true, className, buttonClassName, fullWidth = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [alignRight, setAlignRight] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const searchRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  const current = value ?? '';
  const selected = options.find((o) => String(o.value) === String(current));
  const hasValue = current !== '' && !!selected;
  const showSearch = searchable ?? options.length > 8;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = clearable ? [{ value: '', label: placeholder, isPlaceholder: true }, ...options] : options;
    return q ? base.filter((o) => !o.isPlaceholder && String(o.label).toLowerCase().includes(q)) : base;
  }, [options, query, clearable, placeholder]);
  const visible = items.slice(0, MAX_RENDERED);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left + 300 > window.innerWidth && rect.right > 300);
    setActive(Math.max(0, visible.findIndex((o) => String(o.value) === String(current))));
    if (showSearch) requestAnimationFrame(() => searchRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function pick(option) {
    onChange(option.value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(e) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); buttonRef.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
    else if (e.key === 'End') { e.preventDefault(); setActive(visible.length - 1); }
    else if (e.key === 'Enter' && visible[active]) { e.preventDefault(); pick(visible[active]); }
    else if (e.key === 'Tab') setOpen(false);
  }

  return (
    <div ref={rootRef} className={clsx('relative min-w-0', fullWidth ? 'w-full' : 'inline-block', className)} onKeyDown={onKeyDown}>
      {label && <span className="block text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</span>}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel || label || placeholder}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          'group flex items-center gap-2 rounded-xl border pl-3 pr-2.5 py-2 text-sm font-medium text-left transition-all duration-300 ease-luxe',
          'hover:border-gold-400 hover:shadow-[0_0_0_4px_rgba(194,154,86,0.10)] active:scale-[0.985]',
          fullWidth ? 'w-full' : 'max-w-[240px]',
          open && 'shadow-[0_0_0_4px_rgba(194,154,86,0.14)]',
          buttonClassName,
        )}
        style={{
          color: hasValue ? 'var(--text-primary)' : 'var(--text-secondary)',
          background: hasValue ? 'var(--gold-tint)' : 'var(--bg-surface)',
          borderColor: open || hasValue ? '#D2AA6C' : 'var(--border-subtle)',
        }}
      >
        {Icon && <Icon size={15} className="shrink-0 text-gold-600" />}
        <span className="truncate flex-1">{hasValue ? selected.label : placeholder}</span>
        <ChevronDown size={15} className={clsx('shrink-0 transition-transform duration-300 ease-luxe', open && 'rotate-180')} style={{ color: 'var(--text-muted)' }} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: EASE }}
            className={clsx(
              'popover-panel absolute z-40 mt-2 rounded-2xl overflow-hidden min-w-full w-max max-w-[min(20rem,calc(100vw-2rem))]',
              alignRight ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
            )}
          >
            {showSearch && (
              <div className="relative p-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                <Search size={14} className="absolute left-[18px] top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                  placeholder="Search…"
                  aria-label={`Search ${label || placeholder}`}
                  className="w-full rounded-lg border pl-8 pr-7 py-1.5 text-sm bg-transparent focus:outline-none focus:!border-gold-400"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}
                />
                {query && (
                  <button type="button" aria-label="Clear search" onClick={() => { setQuery(''); searchRef.current?.focus(); }} className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-[var(--hover-tint)]" style={{ color: 'var(--text-muted)' }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            )}
            <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel || label || placeholder} className="max-h-64 overflow-y-auto p-1.5">
              {visible.length === 0 && <li className="px-3 py-4 text-sm text-center" style={{ color: 'var(--text-muted)' }}>No matches</li>}
              {visible.map((o, i) => {
                const isSelected = String(o.value) === String(current);
                return (
                  <li
                    key={`${o.value}`}
                    role="option"
                    aria-selected={isSelected}
                    data-active={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => pick(o)}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-xl text-sm cursor-pointer transition-colors duration-150',
                      i === active && 'bg-[var(--gold-tint)]',
                      isSelected ? 'font-semibold' : 'font-medium',
                    )}
                    style={{ color: o.isPlaceholder && !isSelected ? 'var(--text-secondary)' : 'var(--text-primary)' }}
                  >
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="num text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>{o.hint}</span>}
                    <Check size={14} className={clsx('shrink-0 text-gold-600 transition-opacity', isSelected ? 'opacity-100' : 'opacity-0')} />
                  </li>
                );
              })}
              {items.length > MAX_RENDERED && (
                <li className="px-3 py-2 text-xs text-center" style={{ color: 'var(--text-muted)' }}>
                  {items.length - MAX_RENDERED} more — type to narrow down
                </li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Dropdown;
