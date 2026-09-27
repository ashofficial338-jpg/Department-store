import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Pencil, Save, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';
import { PageHeader, DataTable, SearchBox } from '../../components/ui/index.js';
import { productService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatCurrency } from '../../utils/format.js';

export function Pricing() {
  const { user } = useAuth();
  const canManage = isAdmin(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({});
  const debounced = useDebounce(search);

  function load() {
    setLoading(true);
    productService.list({ search: debounced || undefined, page, limit: 20 })
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .finally(() => setLoading(false));
  }

  useEffect(load, [debounced, page]); // eslint-disable-line

  function startEdit(row) {
    setEditingId(row._id);
    setDraft({ purchasePrice: row.purchasePrice, sellingPrice: row.sellingPrice, mrp: row.mrp, discountPercent: row.discountPercent });
  }

  async function save(id) {
    try {
      await productService.update(id, draft);
      toast.success('Pricing updated.');
      setEditingId(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div>
      <PageHeader title="Pricing & GST" crumbs={[{ label: 'Products', to: '/products' }, { label: 'Pricing' }]} />
      <div className="mb-4"><SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search products..." className="w-72" /></div>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No products found."
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'name', header: 'Product', render: (r) => <div><div className="font-medium">{r.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.sku}</div></div> },
          { key: 'gstRate', header: 'GST %', render: (r) => `${r.gstRate}%` },
          {
            key: 'purchasePrice', header: 'Purchase Price', render: (r) => editingId === r._id
              ? <NumInput value={draft.purchasePrice} onChange={(v) => setDraft((d) => ({ ...d, purchasePrice: v }))} />
              : formatCurrency(r.purchasePrice),
          },
          {
            key: 'sellingPrice', header: 'Selling Price', render: (r) => editingId === r._id
              ? <NumInput value={draft.sellingPrice} onChange={(v) => setDraft((d) => ({ ...d, sellingPrice: v }))} />
              : formatCurrency(r.sellingPrice),
          },
          {
            key: 'mrp', header: 'MRP', render: (r) => editingId === r._id
              ? <NumInput value={draft.mrp} onChange={(v) => setDraft((d) => ({ ...d, mrp: v }))} />
              : formatCurrency(r.mrp),
          },
          {
            key: 'discountPercent', header: 'Discount %', render: (r) => editingId === r._id
              ? <NumInput value={draft.discountPercent} onChange={(v) => setDraft((d) => ({ ...d, discountPercent: v }))} />
              : `${r.discountPercent || 0}%`,
          },
          {
            key: 'actions', header: '', render: (r) => editingId === r._id ? (
              <div className="flex gap-1 justify-end">
                <button onClick={() => save(r._id)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600"><Save size={14} /></button>
                <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-graphite-100 text-graphite-500"><X size={14} /></button>
              </div>
            ) : canManage && (
              <button onClick={() => startEdit(r)} title="Edit" className="p-1.5 rounded-lg hover:bg-graphite-100 text-graphite-500"><Pencil size={14} /></button>
            ),
          },
        ]}
      />
    </div>
  );
}

function NumInput({ value, onChange }) {
  return (
    <input
      type="number" step="0.01" value={value} onChange={(e) => onChange(e.target.value)}
      className="w-24 rounded-lg border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
      style={{ borderColor: 'var(--border-subtle)' }}
    />
  );
}

export default Pricing;
