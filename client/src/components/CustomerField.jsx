import { useEffect, useRef, useState } from 'react';
import { UserRound, X, Plus } from 'lucide-react';
import { customerService } from '../services/index.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { formatCurrency } from '../utils/format.js';
import { useFieldRules } from '../hooks/useFieldRules.js';

// Customer on a bill (optional - walk-in cash bills need none; a credit / part-paid bill needs one).
// Search by name or mobile, or add a new customer (name + mobile). The server re-uses an existing customer
// with the same mobile, so this never creates duplicates.
// value: null | { _id, name, phone, outstanding } | { isNew: true, name, phone }
export function CustomerField({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const debounced = useDebounce(query, 250);
  const { req } = useFieldRules();
  const phoneNeeded = req('customer', 'phone');
  const ref = useRef(null);

  useEffect(() => {
    if (!debounced.trim()) { setResults([]); return; }
    customerService.list({ search: debounced, limit: 6 }).then((r) => { setResults(r.data); setOpen(true); }).catch(() => {});
  }, [debounced]);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const inputCls = 'h-9 rounded-lg border px-3 text-sm bg-[var(--bg-surface)] focus:outline-none focus:!border-gold-500';
  const inputStyle = { borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };

  if (value) {
    return (
      <div className="flex items-center gap-2 text-sm rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border-subtle)' }}>
        <UserRound size={15} style={{ color: 'var(--text-muted)' }} />
        <span className="font-medium truncate">{value.name}</span>
        <span style={{ color: 'var(--text-muted)' }}>{value.phone}</span>
        {value.isNew && <span className="text-xs px-1.5 rounded" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>new</span>}
        {value.outstanding > 0 && <span className="text-xs text-rose-600">owes {formatCurrency(value.outstanding)}</span>}
        <button type="button" aria-label="Remove customer" onClick={() => onChange(null)} className="ml-auto p-1 text-graphite-400 hover:text-rose-600"><X size={14} /></button>
      </div>
    );
  }
  if (adding) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input autoFocus placeholder="Customer name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={`${inputCls} flex-1 min-w-[140px]`} style={inputStyle} aria-label="New customer name" />
        <input placeholder={phoneNeeded ? 'Mobile (10 digits)' : 'Mobile (optional)'} inputMode="numeric" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className={`${inputCls} w-40`} style={inputStyle} aria-label="New customer mobile" />
        <button type="button" className="h-9 px-3 rounded-lg text-sm font-medium bg-gold-600 text-white disabled:opacity-50" disabled={!form.name.trim() || (phoneNeeded && !form.phone.trim())}
          onClick={() => { onChange({ isNew: true, name: form.name.trim(), phone: form.phone.trim() }); setAdding(false); setForm({ name: '', phone: '' }); }}>Use</button>
        <button type="button" className="h-9 px-2 text-sm" style={{ color: 'var(--text-muted)' }} onClick={() => setAdding(false)}>Cancel</button>
      </div>
    );
  }
  return (
    <div className="relative flex items-center gap-2" ref={ref}>
      <input value={query} onChange={(e) => setQuery(e.target.value)} onFocus={() => results.length && setOpen(true)}
        placeholder="Customer (optional) - search name or mobile" className={`${inputCls} flex-1`} style={inputStyle} aria-label="Customer" />
      <button type="button" onClick={() => setAdding(true)} className="h-9 px-3 rounded-lg border text-sm font-medium inline-flex items-center gap-1" style={inputStyle}><Plus size={14} /> New</button>
      {open && results.length > 0 && (
        <div className="absolute z-20 top-full mt-1 left-0 right-0 surface-card rounded-xl shadow-premium-lg max-h-64 overflow-y-auto">
          {results.map((c) => (
            <button key={c._id} type="button" className="w-full flex justify-between gap-2 px-3 py-2 hover:bg-gold-50 text-left text-sm"
              onClick={() => { onChange(c); setQuery(''); setResults([]); setOpen(false); }}>
              <span><span className="font-medium">{c.name}</span> <span style={{ color: 'var(--text-muted)' }}>{c.phone}</span></span>
              {c.outstanding > 0 && <span className="text-xs text-rose-600">owes {formatCurrency(c.outstanding)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default CustomerField;
