import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';
import { PageHeader, DataTable, SearchBox, Button } from '../../components/ui/index.js';
import { productService, settingsService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';

export const GST_SLABS = [0, 5, 12, 18, 28];

export const GST_TYPES = [
  { value: 'intra', label: 'Intra-State', hint: 'Customer in the same state. GST is split equally into CGST + SGST.' },
  { value: 'inter', label: 'Inter-State', hint: 'Customer in another state. Full GST is charged as IGST.' },
];

export function splitLabel(rate, gstType) {
  if (!rate) return 'No GST';
  return gstType === 'inter' ? `IGST ${rate}%` : `CGST ${rate / 2}% + SGST ${rate / 2}%`;
}

// Pricing & GST: the GST type used by Billing, and each product's GST %. No prices are kept here -
// the rate per kg is typed on the bill.
export function Pricing() {
  const { user } = useAuth();
  const canManage = isAdmin(user);
  const [gstType, setGstType] = useState('intra');
  const [savedType, setSavedType] = useState('intra');
  const [savingType, setSavingType] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const debounced = useDebounce(search);

  useEffect(() => {
    settingsService.get().then((r) => { const t = r.data.gstType || 'intra'; setGstType(t); setSavedType(t); }).catch((err) => toast.error(err.message));
  }, []);

  function load() {
    setLoading(true);
    productService.list({ search: debounced || undefined, status: 'active', page, limit: 50 })
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .catch((err) => toast.error(err.message))
      .finally(() => setLoading(false));
  }
  useEffect(load, [debounced, page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveType() {
    setSavingType(true);
    try {
      await settingsService.update({ gstType });
      setSavedType(gstType);
      toast.success(`GST type set to ${GST_TYPES.find((t) => t.value === gstType).label}. New bills will use it.`);
    } catch (err) { toast.error(err.message); } finally { setSavingType(false); }
  }

  async function setRate(row, rate) {
    setSavingId(row._id);
    try {
      await productService.update(row._id, { gstRate: Number(rate) });
      setRows((prev) => prev.map((r) => (r._id === row._id ? { ...r, gstRate: Number(rate) } : r)));
      toast.success(`${row.name}: GST ${rate}%`);
    } catch (err) { toast.error(err.message); } finally { setSavingId(null); }
  }

  const offset = pagination ? (pagination.page - 1) * pagination.limit : 0;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Pricing & GST" crumbs={[{ label: 'Products', to: '/products' }, { label: 'Pricing & GST' }]} />

      <div className="mb-5 p-4 rounded-xl border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>GST Type</div>
        <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>Billing uses this automatically for every new bill.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {GST_TYPES.map((t) => (
            <label key={t.value} className={`flex gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${gstType === t.value ? 'border-gold-500 bg-gold-50' : ''}`}
              style={gstType === t.value ? {} : { borderColor: 'var(--border-subtle)' }}>
              <input type="radio" name="gstType" value={t.value} checked={gstType === t.value} disabled={!canManage}
                onChange={() => setGstType(t.value)} className="mt-1 accent-[var(--brand)]" />
              <span>
                <span className="block font-medium" style={{ color: 'var(--text-primary)' }}>{t.label}</span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.hint}</span>
                <span className="block text-xs mt-1 font-medium" style={{ color: 'var(--text-secondary)' }}>e.g. 5% → {splitLabel(5, t.value)}</span>
              </span>
            </label>
          ))}
        </div>
        {canManage && (
          <div className="mt-3 flex justify-end">
            <Button onClick={saveType} loading={savingType} disabled={gstType === savedType}>Save GST Type</Button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mb-3 gap-3">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search products..." className="w-72" />
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Set each product&apos;s GST %</span>
      </div>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No products found. Add product names in Product Master."
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'no', header: '#', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{offset + rows.indexOf(r) + 1}</span> },
          { key: 'name', header: 'Product Name', render: (r) => <span className="font-medium">{r.name}</span> },
          {
            key: 'gstRate', header: 'GST %', render: (r) => (
              <select value={r.gstRate || 0} disabled={!canManage || savingId === r._id} onChange={(e) => setRate(r, e.target.value)}
                className="h-9 rounded-lg border px-2 text-sm bg-[var(--bg-surface)] focus:outline-none focus:!border-gold-500"
                style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }} aria-label={`GST % for ${r.name}`}>
                {GST_SLABS.map((s) => <option key={s} value={s}>{s}%</option>)}
              </select>
            ),
          },
          { key: 'split', header: `On the bill (${GST_TYPES.find((t) => t.value === savedType).label})`, render: (r) => <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{splitLabel(r.gstRate || 0, savedType)}</span> },
        ]}
      />
    </div>
  );
}

export default Pricing;
