import { useState } from 'react';
import { SlidersHorizontal, RotateCcw, ArrowDownAZ, ArrowUpAZ, ChevronDown } from 'lucide-react';
import SearchBox from './SearchBox.jsx';

// Combined filter bar used across list pages. Every filter works together with the others.
// fields: [{ key, label, type: 'select' | 'date' | 'number' | 'range' | 'dateRange', options, minKey, maxKey, placeholder }]
// value / onChange: one flat object of filter values (e.g. { vendor, from, to, minQty, sort, order }).
// The first `primary` fields are always visible; the rest open under "More filters".
const control = 'h-10 w-full rounded-lg border px-3 text-sm bg-[var(--bg-surface)] hover:border-[var(--border-strong)] focus:outline-none focus:!border-gold-500 transition-colors duration-200';
const ctlStyle = { color: 'var(--text-primary)', borderColor: 'var(--border-subtle)' };

function FieldControl({ field, value, set }) {
  const v = (k) => value[k] ?? '';
  switch (field.type) {
    case 'select':
      return (
        <select aria-label={field.label} value={v(field.key)} onChange={(e) => set({ [field.key]: e.target.value })} className={`${control} cursor-pointer`} style={ctlStyle}>
          <option value="">{field.placeholder || `All ${field.label.toLowerCase()}`}</option>
          {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'date':
      return <input type="date" aria-label={field.label} value={v(field.key)} onChange={(e) => set({ [field.key]: e.target.value })} className={control} style={ctlStyle} />;
    case 'number':
      return <input type="number" aria-label={field.label} placeholder={field.placeholder} value={v(field.key)} onChange={(e) => set({ [field.key]: e.target.value })} className={control} style={ctlStyle} />;
    case 'dateRange':
      return (
        <div className="flex items-center gap-1.5">
          <input type="date" aria-label={`${field.label} from`} value={v(field.minKey || 'from')} onChange={(e) => set({ [field.minKey || 'from']: e.target.value })} className={control} style={ctlStyle} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>to</span>
          <input type="date" aria-label={`${field.label} to`} value={v(field.maxKey || 'to')} onChange={(e) => set({ [field.maxKey || 'to']: e.target.value })} className={control} style={ctlStyle} />
        </div>
      );
    case 'range':
      return (
        <div className="flex items-center gap-1.5">
          <input type="number" min={0} step="any" aria-label={`${field.label} minimum`} placeholder="Min" value={v(field.minKey)} onChange={(e) => set({ [field.minKey]: e.target.value })} className={control} style={ctlStyle} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>-</span>
          <input type="number" min={0} step="any" aria-label={`${field.label} maximum`} placeholder="Max" value={v(field.maxKey)} onChange={(e) => set({ [field.maxKey]: e.target.value })} className={control} style={ctlStyle} />
        </div>
      );
    default:
      return null;
  }
}

const keysOf = (f) => (f.type === 'range' || f.type === 'dateRange' ? [f.minKey || 'from', f.maxKey || 'to'] : [f.key]);

export function FilterPanel({ fields = [], value, onChange, onReset, searchKey = 'search', searchPlaceholder = 'Search...', sortOptions, primary = 3, extra }) {
  const [open, setOpen] = useState(false);
  const set = (patch) => onChange({ ...value, ...patch });
  const activeCount = fields.reduce((n, f) => n + (keysOf(f).some((k) => value[k] !== undefined && value[k] !== '') ? 1 : 0), 0)
    + (value[searchKey] ? 1 : 0);
  const shown = fields.slice(0, primary);
  const more = fields.slice(primary);

  const cell = (f) => (
    <div key={f.key || f.minKey} className={f.type === 'range' || f.type === 'dateRange' ? 'sm:col-span-2' : ''}>
      <span className="block text-[11px] font-semibold uppercase mb-1" style={{ color: 'var(--text-muted)' }}>{f.label}</span>
      <FieldControl field={f} value={value} set={set} />
    </div>
  );

  return (
    <div className="surface-card rounded-xl p-3 mb-4 space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        {searchKey && <SearchBox value={value[searchKey] || ''} onChange={(v) => set({ [searchKey]: v })} placeholder={searchPlaceholder} className="flex-1 min-w-[200px]" />}
        {sortOptions && (
          <div className="flex items-center gap-1">
            <select aria-label="Sort by" value={value.sort || ''} onChange={(e) => set({ sort: e.target.value })} className={`${control} cursor-pointer w-auto`} style={ctlStyle}>
              {sortOptions.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
            </select>
            <button type="button" title={value.order === 'asc' ? 'Ascending' : 'Descending'} aria-label="Toggle sort order"
              onClick={() => set({ order: value.order === 'asc' ? 'desc' : 'asc' })}
              className="h-10 w-10 inline-flex items-center justify-center rounded-lg border hover:border-[var(--border-strong)]" style={ctlStyle}>
              {value.order === 'asc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
            </button>
          </div>
        )}
        {more.length > 0 && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
            className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium hover:border-[var(--border-strong)]" style={ctlStyle}>
            <SlidersHorizontal size={15} /> More filters <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
          </button>
        )}
        <button type="button" onClick={onReset} disabled={!activeCount}
          className="h-10 px-3 inline-flex items-center gap-1.5 rounded-lg border text-sm font-medium disabled:opacity-40 enabled:hover:border-[var(--border-strong)]" style={ctlStyle}>
          <RotateCcw size={14} /> Reset{activeCount ? ` (${activeCount})` : ''}
        </button>
        {extra}
      </div>
      {shown.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{shown.map(cell)}</div>}
      {open && more.length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">{more.map(cell)}</div>}
    </div>
  );
}

// Drops empty values so only real filters are sent to the server.
export function cleanParams(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== '' && v !== undefined && v !== null));
}

export default FilterPanel;
