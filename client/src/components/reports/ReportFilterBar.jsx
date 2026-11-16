import { useState } from 'react';
import { CalendarRange, SlidersHorizontal, RotateCcw, GitCompareArrows } from 'lucide-react';

export const RANGE_LABELS = {
  today: 'Today', yesterday: 'Yesterday', this_week: 'This week', previous_week: 'Previous week', last_7_days: 'Last 7 days',
  this_month: 'This month', last_30_days: 'Last 30 days', previous_month: 'Previous month', this_quarter: 'This quarter',
  previous_quarter: 'Previous quarter', last_12_months: 'Last 12 months', this_year: 'This financial year', previous_year: 'Previous financial year', custom: 'Custom range',
};
const GRANULARITY = [
  { value: 'auto', label: 'Auto' }, { value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' }, { value: 'quarter', label: 'Quarterly' }, { value: 'year', label: 'Yearly' },
];
const nice = (s) => String(s).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const ADVANCED_KEYS = ['product', 'category', 'brand', 'supplier', 'vendor', 'paymentMethod', 'expenseCategory', 'stockStatus', 'transactionType'];

function Select({ label, value, onChange, options, placeholder = 'All' }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border px-3 py-2 text-sm bg-[var(--bg-surface)] hover:border-gold-400 focus:outline-none focus:!border-gold-400 cursor-pointer"
        style={{ color: 'var(--text-primary)', borderColor: value ? 'var(--color-gold-400, #D9B97A)' : 'var(--border-subtle)' }}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// Date range, bucket size, previous-period comparison and the advanced filters (product, brand,
// category, manufacturer, vendor, payment method, expense category, stock status, transaction type).
export function ReportFilterBar({ value, onChange, options }) {
  const activeAdvanced = ADVANCED_KEYS.filter((k) => value[k]).length;
  const [open, setOpen] = useState(activeAdvanced > 0);
  const set = (patch) => onChange({ ...value, ...patch });
  const o = options || {};

  return (
    <div className="surface-card rounded-xl2 p-4 mb-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Period</span>
          <div className="relative">
            <CalendarRange size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-600 pointer-events-none" />
            <select
              value={value.range}
              onChange={(e) => set({ range: e.target.value, ...(e.target.value !== 'custom' ? { from: '', to: '' } : {}) })}
              className="rounded-xl border pl-9 pr-3 py-2 text-sm font-medium bg-[var(--bg-surface)] hover:border-gold-400 focus:outline-none cursor-pointer"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }}
            >
              {(o.ranges || Object.keys(RANGE_LABELS)).map((r) => <option key={r} value={r}>{RANGE_LABELS[r] || nice(r)}</option>)}
            </select>
          </div>
        </label>
        {value.range === 'custom' && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>From</span>
              <input type="date" value={value.from || ''} max={value.to || undefined} onChange={(e) => set({ from: e.target.value })} className="rounded-xl border px-3 py-2 text-sm bg-[var(--bg-surface)]" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>To</span>
              <input type="date" value={value.to || ''} min={value.from || undefined} onChange={(e) => set({ to: e.target.value })} className="rounded-xl border px-3 py-2 text-sm bg-[var(--bg-surface)]" style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' }} />
            </label>
          </>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Chart by</span>
          <div className="flex flex-wrap rounded-xl border p-0.5" style={{ borderColor: 'var(--border-subtle)' }} role="radiogroup" aria-label="Chart granularity">
            {GRANULARITY.map((g) => (
              <button
                key={g.value} type="button" role="radio" aria-checked={(value.granularity || 'auto') === g.value}
                onClick={() => set({ granularity: g.value })}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${(value.granularity || 'auto') === g.value ? 'bg-graphite-900 text-white' : 'hover:bg-[var(--hover-tint)]'}`}
                style={(value.granularity || 'auto') === g.value ? undefined : { color: 'var(--text-secondary)' }}
              >{g.label}</button>
            ))}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none py-2" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" className="accent-[#C29A56] w-4 h-4" checked={value.compare !== 'false'} onChange={(e) => set({ compare: e.target.checked ? '' : 'false' })} />
          <GitCompareArrows size={15} className="text-gold-600" /> Compare with previous period
        </label>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button" onClick={() => setOpen((x) => !x)} aria-expanded={open}
            className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold hover:border-gold-400"
            style={{ borderColor: activeAdvanced ? '#D9B97A' : 'var(--border-subtle)', color: 'var(--text-primary)' }}
          >
            <SlidersHorizontal size={15} /> Filters{activeAdvanced ? ` (${activeAdvanced})` : ''}
          </button>
          <button
            type="button" onClick={() => onChange({ range: 'this_month', granularity: 'auto' })}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[var(--hover-tint)]" style={{ color: 'var(--text-muted)' }}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <Select label="Product" value={value.product} onChange={(v) => set({ product: v })} options={o.products || []} />
          <Select label="Category" value={value.category} onChange={(v) => set({ category: v })} options={o.categories || []} />
          <Select label="Brand" value={value.brand} onChange={(v) => set({ brand: v })} options={o.brands || []} />
          <Select label="Manufacturer" value={value.supplier} onChange={(v) => set({ supplier: v })} options={o.suppliers || []} />
          <Select label="Vendor (purchases)" value={value.vendor} onChange={(v) => set({ vendor: v })} options={o.vendors || []} />
          <Select label="Payment method" value={value.paymentMethod} onChange={(v) => set({ paymentMethod: v })} options={(o.paymentMethods || []).map((m) => ({ value: m, label: nice(m) }))} />
          <Select label="Expense category" value={value.expenseCategory} onChange={(v) => set({ expenseCategory: v })} options={(o.expenseCategories || []).map((m) => ({ value: m, label: nice(m) }))} />
          <Select label="Stock status" value={value.stockStatus} onChange={(v) => set({ stockStatus: v })} options={['in_stock', 'low_stock', 'out_of_stock'].map((m) => ({ value: m, label: nice(m) }))} />
          <Select label="Transaction type" value={value.transactionType} onChange={(v) => set({ transactionType: v })} options={(o.transactionTypes || []).map((m) => ({ value: m, label: nice(m) }))} />
        </div>
      )}
    </div>
  );
}

export default ReportFilterBar;
