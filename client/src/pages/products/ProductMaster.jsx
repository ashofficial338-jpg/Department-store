import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, ListPlus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, DataTable, Button, Input, ConfirmDialog } from '../../components/ui/index.js';
import { FilterPanel, cleanParams } from '../../components/ui/FilterPanel.jsx';
import EditRequestDialog from '../../components/EditRequestDialog.jsx';
import { toUnitMap, productUnits, fmtQty, unitShort } from '../../utils/units.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';
import { productService, categoryService, brandService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatDate, formatCurrency } from '../../utils/format.js';

// Product Master = the product list used by Billing. A product can be just a name (quick add; the rate is typed
// at billing) or fully set up in Add / Edit Product: units, price, GST and discount.
const EMPTY_FILTERS = { search: '', category: '', brand: '', stock: '', status: 'active', sort: 'name', order: 'asc' };
const STOCK_OPTIONS = [{ value: 'in', label: 'In stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }];
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'discontinued', label: 'Removed' }];

export function ProductMaster() {
  const { user } = useAuth();
  const canManage = isAdmin(user);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const search = filters.search;
  const debouncedSearch = useDebounce(search);
  const [cats, setCats] = useState([]);
  const [brands, setBrands] = useState([]);
  const [requestRemove, setRequestRemove] = useState(null);
  useEffect(() => {
    categoryService.listAll().then((r) => setCats(r.data)).catch(() => {});
    brandService.listAll().then((r) => setBrands(r.data)).catch(() => {});
  }, []);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [units, setUnits] = useState(new Map());
  useEffect(() => { productService.units().then((r) => setUnits(toUnitMap(r.data))).catch(() => {}); }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await productService.list(cleanParams({ ...filters, search: debouncedSearch, page, limit: 50, withStock: 'true' }));
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }
  const filterKey = JSON.stringify({ ...filters, search: undefined });
  useEffect(() => { load(); }, [page, debouncedSearch, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <Button type="button" variant="outline" icon={ListPlus} onClick={() => navigate('/products/new')}>New Product (all details)</Button>
      </form>

      <FilterPanel
        value={filters} onChange={(v) => { setFilters(v); setPage(1); }} onReset={() => { setFilters(EMPTY_FILTERS); setPage(1); }}
        searchPlaceholder="Search product name, SKU or barcode..." primary={4}
        sortOptions={[{ value: 'name', label: 'Name' }, { value: 'createdAt', label: 'Added on' }, { value: 'sellingPrice', label: 'Selling price' }, { value: 'purchasePrice', label: 'Purchase price' }]}
        fields={[
          { key: 'category', label: 'Category', type: 'select', options: cats.map((c) => ({ value: c._id, label: c.name })) },
          { key: 'brand', label: 'Brand', type: 'select', options: brands.map((b) => ({ value: b._id, label: b.name })) },
          { key: 'stock', label: 'Stock', type: 'select', options: STOCK_OPTIONS },
          { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS, placeholder: 'Any status' },
        ]}
        extra={pagination && <span className="text-sm ml-auto" style={{ color: 'var(--text-muted)' }}>{pagination.total} product(s)</span>}
      />

      <DataTable
        loading={loading}
        rows={rows}
        onRowClick={(r) => navigate(`/products/${r._id}`)}
        emptyTitle={search || filters.category || filters.brand || filters.stock ? 'No product matches these filters.' : 'No products yet. Add your first product name above.'}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'no', header: '#', render: (r) => <span style={{ color: 'var(--text-muted)' }}>{offset + rows.indexOf(r) + 1}</span> },
          { key: 'name', header: 'Product Name', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'category', header: 'Category', render: (r) => <span className="text-xs">{r.category?.name || '-'}</span> },
          {
            key: 'price', header: 'Unit Price', render: (r) => (r.sellingPrice > 0 && units.size
              ? <span className="tabular-nums">{formatCurrency(r.sellingPrice)} / {unitShort(productUnits(r, units).sellingUnit, units, 1)}</span>
              : <span style={{ color: 'var(--text-muted)' }}>Rate at billing</span>),
          },
          {
            key: 'brands', header: 'Brands', render: (r) => {
              const unique = [...new Set([r.brand?.name, ...(r.brands || []).map((b) => b.name)].filter(Boolean))];
              return unique.length
                ? <span className="text-xs" title={unique.join(', ')}>{unique.slice(0, 3).join(', ')}{unique.length > 3 ? ` +${unique.length - 3}` : ''}</span>
                : <span style={{ color: 'var(--text-muted)' }}>-</span>;
            },
          },
          { key: 'stock', header: 'Stock', render: (r) => <span className="tabular-nums">{units.size ? fmtQty(r.stock || 0, productUnits(r, units).baseUnit, units) : r.stock || 0}</span> },
          { key: 'createdAt', header: 'Added On', render: (r) => formatDate(r.createdAt) },
          {
            key: 'actions', header: '', render: (r) => (canManage ? (
              <div className="flex gap-1 justify-end">
                <button type="button" title="View" onClick={(e) => { e.stopPropagation(); navigate(`/products/${r._id}`); }} className="p-1.5 rounded-lg hover:bg-gold-50 text-graphite-500 hover:text-gold-700"><Eye size={15} /></button>
                <button type="button" title="Edit" onClick={(e) => { e.stopPropagation(); navigate(`/products/${r._id}/edit`); }} className="p-1.5 rounded-lg hover:bg-gold-50 text-graphite-500 hover:text-gold-700"><Pencil size={15} /></button>
                <button type="button" title="Delete" onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }} className="p-1.5 rounded-lg hover:bg-rose-50 text-graphite-500 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
            ) : (
              <div className="flex gap-1 justify-end">
                <button type="button" title="View" onClick={(e) => { e.stopPropagation(); navigate(`/products/${r._id}`); }} className="p-1.5 rounded-lg hover:bg-gold-50 text-graphite-500 hover:text-gold-700"><Eye size={15} /></button>
                <button type="button" title="Request a change (admin approval)" onClick={(e) => { e.stopPropagation(); navigate(`/products/${r._id}/edit`); }} className="p-1.5 rounded-lg hover:bg-gold-50 text-graphite-500 hover:text-gold-700"><Pencil size={15} /></button>
                <button type="button" title="Request removal (admin approval)" onClick={(e) => { e.stopPropagation(); setRequestRemove(r); }} className="p-1.5 rounded-lg hover:bg-rose-50 text-graphite-500 hover:text-rose-600"><Trash2 size={15} /></button>
              </div>
            )),
          },
        ]}
      />


      <EditRequestDialog open={!!requestRemove} onClose={() => setRequestRemove(null)} entity="Product" record={requestRemove} action="delete" />

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete product?" description={`"${deleteTarget?.name || ''}" will be removed from the product list and the Billing dropdown. Old bills keep the name.`}
        confirmLabel="Delete" />
    </div>
  );
}

export default ProductMaster;
