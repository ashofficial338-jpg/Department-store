import { useEffect, useState } from 'react';
import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { dashboardService } from '../../services/index.js';
import { RANGE_OPTIONS, humanize } from './filters.js';

const selectClass = 'rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 cursor-pointer max-w-[220px]';
const fieldStyle = { color: 'var(--text-primary)', borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' };

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  );
}

function Select({ label, value, onChange, children }) {
  return (
    <Field label={label}>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={selectClass} style={fieldStyle}>{children}</select>
    </Field>
  );
}

// Filter controls for users with the dashboard.filters permission. `value` is the current filter object.
export function DashboardFilters({
  value, onChange, defaultRange = 'this_month',
  show = ['range', 'product', 'category', 'stockStatus', 'paymentMethod', 'expenseCategory'],
}) {
  const [options, setOptions] = useState(null);
  const [custom, setCustom] = useState({ from: value.from || '', to: value.to || '' });

  useEffect(() => { dashboardService.filterOptions().then((r) => setOptions(r.data)).catch(() => setOptions(null)); }, []);
  useEffect(() => { setCustom({ from: value.from || '', to: value.to || '' }); }, [value.from, value.to]);

  const set = (patch) => {
    const next = { ...value, ...patch };
    Object.keys(next).forEach((k) => { if (!next[k]) delete next[k]; });
    onChange(next);
  };
  const range = value.range || defaultRange;
  const active = Object.keys(value).length > 0;

  return (
    <div className="surface-card rounded-xl2 shadow-premium p-4 mb-6">
      <div className="flex items-center gap-2 mb-3 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        <SlidersHorizontal size={14} className="text-gold-600" /> Filters
        {active && (
          <button type="button" onClick={() => onChange({})} className="ml-auto flex items-center gap-1 normal-case tracking-normal font-medium text-gold-600 hover:text-gold-500">
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {show.includes('range') && (
          <Select label="Date range" value={range} onChange={(v) => set(v === 'custom' ? { range: 'custom' } : { range: v, from: '', to: '' })}>
            {RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        )}
        {show.includes('range') && range === 'custom' && ['from', 'to'].map((k) => (
          <Field key={k} label={k === 'from' ? 'From' : 'To'}>
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
              className={selectClass}
              style={fieldStyle}
            />
          </Field>
        ))}
        {show.includes('product') && (
          <Select label="Product" value={value.product} onChange={(v) => set({ product: v })}>
            <option value="">All products</option>
            {options?.products.map((p) => <option key={p._id} value={p._id}>{p.name} ({p.sku})</option>)}
          </Select>
        )}
        {show.includes('category') && (
          <Select label="Category" value={value.category} onChange={(v) => set({ category: v })}>
            <option value="">All categories</option>
            {options?.categories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </Select>
        )}
        {show.includes('stockStatus') && (
          <Select label="Stock status" value={value.stockStatus} onChange={(v) => set({ stockStatus: v })}>
            <option value="">Any stock status</option>
            {(options?.stockStatuses || []).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
        )}
        {show.includes('paymentMethod') && (
          <Select label="Revenue by payment" value={value.paymentMethod} onChange={(v) => set({ paymentMethod: v })}>
            <option value="">All payment methods</option>
            {(options?.paymentMethods || []).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
        )}
        {show.includes('expenseCategory') && (
          <Select label="Expense category" value={value.expenseCategory} onChange={(v) => set({ expenseCategory: v })}>
            <option value="">All expenses</option>
            {(options?.expenseCategories || []).map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
        )}
      </div>
    </div>
  );
}

export default DashboardFilters;
