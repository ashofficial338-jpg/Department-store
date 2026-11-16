import { useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SlidersHorizontal, RotateCcw, CalendarDays, CalendarRange, X, Package, Tags, Boxes, CreditCard, Receipt, FilterX } from 'lucide-react';
import clsx from 'clsx';
import { dashboardService } from '../../services/index.js';
import { Dropdown } from '../ui/Dropdown.jsx';
import { RANGE_OPTIONS, humanize } from './filters.js';

const EASE = [0.22, 1, 0.36, 1];
// The everyday ranges get their own tab; the rest sit in the "More" menu.
const TAB_RANGES = ['today', 'yesterday', 'this_week', 'this_month', 'custom'];
const TAB_LABELS = { custom: 'Custom Date' };
const MORE_RANGES = RANGE_OPTIONS.filter((o) => !TAB_RANGES.includes(o.value));
const RANGE_LABEL = Object.fromEntries(RANGE_OPTIONS.map((o) => [o.value, TAB_LABELS[o.value] || o.label]));
const NON_DATE_KEYS = ['product', 'category', 'stockStatus', 'paymentMethod', 'expenseCategory'];

const fmtDay = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const parseYmd = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };

// The dates a range covers, worked out locally so the label updates the instant a tab is clicked.
function describeRange(range, from, to, now) {
  if (range === 'today') return fmtDay(now);
  if (range === 'yesterday') { const y = new Date(now); y.setDate(y.getDate() - 1); return fmtDay(y); }
  if (range === 'this_month') return `${fmtShort(new Date(now.getFullYear(), now.getMonth(), 1))} – ${fmtShort(now)}`;
  if (range === 'previous_month') return `${fmtShort(new Date(now.getFullYear(), now.getMonth() - 1, 1))} – ${fmtShort(new Date(now.getFullYear(), now.getMonth(), 0))}`;
  if (range === 'custom') return from && to ? `${fmtShort(parseYmd(from))} – ${fmtShort(parseYmd(to))}` : 'Pick a start and end date';
  return null;
}

const dateInputClass = 'num rounded-xl border px-3 py-2 text-sm font-medium bg-[var(--bg-surface)] hover:border-gold-400 focus:outline-none focus:!border-gold-400 cursor-pointer transition-all duration-300';

// Filter controls for users with the dashboard.filters permission. `value` is the current filter object
// (it mirrors the URL query string, so every change re-queries the dashboard immediately).
export function DashboardFilters({
  value, onChange, defaultRange = 'this_month', periodLabel,
  show = ['range', 'product', 'category', 'stockStatus', 'paymentMethod', 'expenseCategory'],
}) {
  const [options, setOptions] = useState(null);
  const [custom, setCustom] = useState({ from: value.from || '', to: value.to || '' });
  const [customOpen, setCustomOpen] = useState(value.range === 'custom');
  const tabsId = useId();

  useEffect(() => { dashboardService.filterOptions().then((r) => setOptions(r.data)).catch(() => setOptions(null)); }, []);
  useEffect(() => { setCustom({ from: value.from || '', to: value.to || '' }); }, [value.from, value.to]);
  useEffect(() => { if (value.range === 'custom') setCustomOpen(true); }, [value.range]);

  const set = (patch) => {
    const next = { ...value, ...patch };
    Object.keys(next).forEach((k) => { if (!next[k]) delete next[k]; });
    onChange(next);
  };

  const now = new Date();
  const showRange = show.includes('range');
  // "Custom" is selected as soon as its tab is clicked, before both dates are chosen.
  const range = customOpen ? 'custom' : (value.range || defaultRange);
  const resolved = describeRange(range, value.from, value.to, now) || periodLabel;

  function pickRange(r) {
    if (r === 'custom') { setCustomOpen(true); return; }
    setCustomOpen(false);
    set({ range: r === defaultRange ? '' : r, from: '', to: '' });
  }

  const lists = useMemo(() => ({
    product: (options?.products || []).map((p) => ({ value: p._id, label: p.name, hint: p.sku })),
    category: (options?.categories || []).map((c) => ({ value: c._id, label: c.name })),
    stockStatus: (options?.stockStatuses || []).map((s) => ({ value: s, label: humanize(s) })),
    paymentMethod: (options?.paymentMethods || []).map((s) => ({ value: s, label: humanize(s) })),
    expenseCategory: (options?.expenseCategories || []).map((s) => ({ value: s, label: humanize(s) })),
  }), [options]);

  const FIELDS = [
    { key: 'product', label: 'Product', placeholder: 'All products', icon: Package },
    { key: 'category', label: 'Category', placeholder: 'All categories', icon: Tags },
    { key: 'stockStatus', label: 'Stock status', placeholder: 'Any status', icon: Boxes },
    { key: 'paymentMethod', label: 'Payment method', placeholder: 'All methods', icon: CreditCard },
    { key: 'expenseCategory', label: 'Expense category', placeholder: 'All expenses', icon: Receipt },
  ].filter((f) => show.includes(f.key));

  const chips = FIELDS.filter((f) => value[f.key]).map((f) => ({
    key: f.key,
    text: `${f.label}: ${lists[f.key].find((o) => String(o.value) === String(value[f.key]))?.label || humanize(value[f.key])}`,
    clear: () => set({ [f.key]: '' }),
  }));
  const dateChanged = showRange && (!!value.range || customOpen);
  const anyActive = chips.length > 0 || dateChanged;

  function clearFilters() {
    const next = { ...value };
    NON_DATE_KEYS.forEach((k) => delete next[k]);
    onChange(next);
  }
  function resetAll() { setCustomOpen(false); onChange({}); }

  return (
    <div className="surface-card rounded-xl2 p-4 md:p-5 mb-6 relative z-20">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <span className="w-8 h-8 rounded-xl bg-gold-50 text-gold-700 flex items-center justify-center shrink-0"><SlidersHorizontal size={15} /></span>
        <div className="mr-auto">
          <div className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Filters</div>
          <div className="text-xs mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
            <CalendarDays size={12} className="text-gold-600" />
            <span>Today is <span className="num font-semibold" style={{ color: 'var(--text-secondary)' }}>{fmtDay(now)}</span></span>
          </div>
        </div>
        <AnimatePresence initial={false}>
          {chips.length > 0 && (
            <motion.button
              key="clear" type="button" onClick={clearFilters}
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.2 }}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-[var(--hover-tint)]"
              style={{ color: 'var(--text-secondary)' }}
              title="Remove product, category and other filters; keep the date range"
            >
              <FilterX size={13} /> Clear filters
            </motion.button>
          )}
        </AnimatePresence>
        <button
          type="button" onClick={resetAll} disabled={!anyActive}
          className="group inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all duration-300 enabled:hover:border-gold-400 enabled:hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
          title="Reset every filter, including the date range"
        >
          <RotateCcw size={13} className="transition-transform duration-500 ease-luxe group-enabled:group-hover:-rotate-180" /> Reset
        </button>
      </div>

      {showRange && (
        <div className="mb-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
            <div
              role="tablist" aria-label="Date range"
              className="no-scrollbar flex items-center gap-0.5 p-1 rounded-2xl border overflow-x-auto max-w-full"
              style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface-muted)' }}
            >
              {TAB_RANGES.map((r) => {
                const selected = range === r;
                return (
                  <button
                    key={r} type="button" role="tab" aria-selected={selected} onClick={() => pickRange(r)}
                    className={clsx(
                      'relative px-3.5 py-1.5 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors duration-300',
                      selected ? 'text-graphite-950' : 'hover:text-[var(--text-primary)]',
                    )}
                    style={selected ? undefined : { color: 'var(--text-secondary)' }}
                  >
                    {selected && (
                      <motion.span
                        layoutId={`${tabsId}-pill`}
                        className="absolute inset-0 rounded-xl bg-gold-gradient shadow-gold"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                      />
                    )}
                    <span className="relative inline-flex items-center gap-1.5">
                      {r === 'custom' && <CalendarRange size={13} />}
                      {TAB_LABELS[r] || RANGE_LABEL[r]}
                    </span>
                  </button>
                );
              })}
            </div>
            <Dropdown
              ariaLabel="More date ranges"
              placeholder="More ranges"
              clearable={false}
              searchable={false}
              value={MORE_RANGES.some((o) => o.value === range) ? range : ''}
              onChange={pickRange}
              options={MORE_RANGES}
            />
            <AnimatePresence mode="wait" initial={false}>
              {resolved && (
                <motion.div
                  key={resolved}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }}
                  className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}
                >
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inset-0 rounded-full bg-gold-500 animate-pulse-ring" />
                    <span className="relative w-2 h-2 rounded-full bg-gold-500" />
                  </span>
                  <span>Showing <span className="num font-semibold" style={{ color: 'var(--text-primary)' }}>{resolved}</span></span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <AnimatePresence initial={false}>
            {range === 'custom' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden"
              >
                <div className="flex flex-wrap items-end gap-3 pt-3.5">
                  {['from', 'to'].map((k) => (
                    <label key={k} className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em] mb-1.5" style={{ color: 'var(--text-muted)' }}>{k === 'from' ? 'From' : 'To'}</span>
                      <input
                        type="date"
                        value={custom[k]}
                        max={k === 'from' ? custom.to || undefined : undefined}
                        min={k === 'to' ? custom.from || undefined : undefined}
                        onChange={(e) => {
                          const next = { ...custom, [k]: e.target.value };
                          setCustom(next);
                          if (next.from && next.to && next.from <= next.to) set({ range: 'custom', ...next });
                        }}
                        className={dateInputClass}
                        style={{ color: 'var(--text-primary)', borderColor: custom[k] ? '#D2AA6C' : 'var(--border-subtle)' }}
                      />
                    </label>
                  ))}
                  {custom.from && custom.to && custom.from > custom.to && (
                    <span className="text-xs font-medium text-rose-600 pb-2.5">The start date must be on or before the end date.</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {FIELDS.length > 0 && (
        <div className={clsx('grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3', showRange && 'pt-4 border-t')} style={{ borderColor: 'var(--border-subtle)' }}>
          {FIELDS.map((f) => (
            <Dropdown
              key={f.key} fullWidth label={f.label} placeholder={f.placeholder} icon={f.icon}
              value={value[f.key] || ''} onChange={(v) => set({ [f.key]: v })} options={lists[f.key]}
            />
          ))}
        </div>
      )}

      <AnimatePresence initial={false}>
        {(chips.length > 0 || dateChanged) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }} className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 pt-4">
              <span className="eyebrow !text-[10px] mr-1">Active</span>
              <AnimatePresence initial={false} mode="popLayout">
                {dateChanged && (
                  <motion.span key="range" layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.2 }} className="filter-chip">
                    {RANGE_LABEL[range] || humanize(range)}
                    <button type="button" aria-label="Remove date filter" onClick={() => { setCustomOpen(false); set({ range: '', from: '', to: '' }); }}><X size={12} /></button>
                  </motion.span>
                )}
                {chips.map((c) => (
                  <motion.span key={c.key} layout initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} transition={{ duration: 0.2 }} className="filter-chip">
                    <span className="truncate max-w-[220px]">{c.text}</span>
                    <button type="button" aria-label={`Remove ${c.text}`} onClick={c.clear}><X size={12} /></button>
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default DashboardFilters;
