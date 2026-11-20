import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, ListPlus } from 'lucide-react';
import { PageHeader, DataTable, Button, SearchBox, Input, ConfirmDialog } from '../../components/ui/index.js';
import ProductFormDialog from '../../components/products/ProductFormDialog.jsx';
import { toUnitMap, productUnits, fmtQty, unitShort } from '../../utils/units.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';
import { productService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatDate, formatCurrency } from '../../utils/format.js';

// Product Master = the product list used by Billing. A product can be just a name (quick add; the rate is typed
// at billing) or fully set up in Add / Edit Product: units, price, GST and discount.
export function ProductMaster() {
  const { user } = useAuth();
  const canManage = isAdmin(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // product being edited, {} = new product with details
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [units, setUnits] = useState(new Map());
  useEffect(() => { productService.units().then((r) => setUnits(toUnitMap(r.data))).catch(() => {}); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await productService.list({ page, limit: 50, status: 'active', withStock: 'true', search: debouncedSearch || undefined });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [page, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAdd(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { toast.error('Type a product name.'); return; }
    setAdding(true);
    try {
      await productService.create({ name });
      toast.success(`"${name}" added.`);
      setNewName('');
      load();
      document.getElementById('new-product-name')?.focus();
    } catch (err) { toast.error(err.message); } finally { setAdding(false); }
  }

  async function handleDelete() {
    try {
      await productService.remove(deleteTarget._id);
      toast.success(`"${deleteTarget.name}" removed from the list.`);
      setDeleteTarget(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  const offset = pagination ? (pagination.page - 1) * pagination.limit : 0;

  return (
    <div className="max-w-5xl">
      <PageHeader title="Product Master" crumbs={[{ label: 'Products' }, { label: 'Product Master' }]} />

      <form onSubmit={handleAdd} className="flex items-end gap-2 mb-4 p-4 rounded-xl border" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="flex-1">
          <Input id="new-product-name" label="Product name" placeholder="e.g. Ponni Rice" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} autoFocus />
        </div>
        <Button type="submit" icon={Plus} loading={adding}>Add Product</Button>
        {canManage && <Button type="button" variant="outline" icon={ListPlus} onClick={() => setEditing({})}>Add with details</Button>}
      </form>

      <div className="flex items-center justify-between mb-3 gap-3">
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search product..." className="w-72" />
        {pagination && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{pagination.total} product(s)</span>}
      </div>

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle={search ? 'No product matches your search.' : 'No products yet. Add your first product name above.'}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'no', header: '#', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{offset + rows.indexOf(r) + 1}</span> },
          { key: 'name', header: 'Product Name', render: (r) => <span className="font-medium">{r.name}</span> },
          {
            key: 'price', header: 'Unit Price', render: (r) => (r.sellingPrice > 0 && units.size
              ? <span className="tabular-nums">{formatCurrency(r.sellingPrice)} / {unitShort(productUnits(r, units).sellingUnit, units, 1)}</span>
              : <span style={{ color: 'var(--text-muted)' }}>Rate at billing</span>),
          },
          { key: 'stock', header: 'Stock', render: (r) => <span className="tabular-nums">{units.size ? fmtQty(r.stock || 0, productUnits(r, units).baseUnit, units) : r.stock || 0}</span> },
          { key: 'createdAt', header: 'Added On', render: (r) => formatDate(r.createdAt) },
          {
            key: 'actions', header: '', render: (r) => canManage && (
              <div className="flex gap-1 justify-end">
                <button type="button" title="Edit" onClick={() => setEditing(r)} className="p-1.5 rounded-lg hover:bg-gold-50 text-graphite-500 hover:text-gold-700"><Pencil size={15} /></button>
                <button type="button" title="Delete" onClick={() => setDeleteTarget(r)} className="p-1.5 rounded-lg hover:bg-rose-50 text-graphite-500 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
            ),
          },
        ]}
      />

      <ProductFormDialog open={!!editing} product={editing?._id ? editing : null} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }} />

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete product?" description={`"${deleteTarget?.name || ''}" will be removed from the product list and the Billing dropdown. Old bills keep the name.`}
        confirmLabel="Delete" />
    </div>
  );
}

export default ProductMaster;
