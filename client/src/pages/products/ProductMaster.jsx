import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, ImageOff } from 'lucide-react';
import { PageHeader, DataTable, Button, Modal, SearchBox, StatusBadge, Input, Select, CurrencyInput, ConfirmDialog } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import AlphabetFilter from '../../components/ui/AlphabetFilter.jsx';
import { productService, categoryService, brandService, gstService, supplierService, vendorService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatCurrency } from '../../utils/format.js';

const EMPTY_FORM = {
  name: '', sku: '', barcode: '', category: '', subcategory: '', brand: '', description: '', hsn: '',
  taxRate: '', purchasePrice: '', sellingPrice: '', mrp: '', discountPercent: 0, unit: 'PCS',
  reorderLevel: 10, maxStock: 1000, minStock: 0, primarySupplier: '', primaryVendor: '',
};

export function ProductMaster() {
  const { user } = useAuth();
  const canManage = isAdmin(user);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [letter, setLetter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');

  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const debouncedSearch = useDebounce(search);

  useEffect(() => {
    categoryService.listAll().then((r) => setCategories(r.data));
    brandService.listAll().then((r) => setBrands(r.data));
    gstService.rates().then((r) => setTaxRates(r.data));
    supplierService.listAll().then((r) => setSuppliers(r.data));
    vendorService.listAll().then((r) => setVendors(r.data));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await productService.list({
        page, limit: 20, search: debouncedSearch || undefined, letter: letter !== 'ALL' ? letter : undefined,
        category: categoryFilter || undefined, brand: brandFilter || undefined, withStock: true,
      });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) { toast.error(err.message); } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [page, debouncedSearch, letter, categoryFilter, brandFilter]); // eslint-disable-line

  function openCreate() { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); }
  function openEdit(row) {
    setEditing(row);
    setForm({
      ...EMPTY_FORM, ...row,
      category: row.category?._id || row.category || '', brand: row.brand?._id || row.brand || '',
      taxRate: row.taxRate?._id || row.taxRate || '',
    });
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, purchasePrice: Number(form.purchasePrice), sellingPrice: Number(form.sellingPrice), mrp: Number(form.mrp) };
      if (editing) { await productService.update(editing._id, payload); toast.success('Product updated.'); }
      else { await productService.create(payload); toast.success('Product created.'); }
      setModalOpen(false);
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function handleDeactivate(row) {
    try { await productService.remove(row._id); toast.success('Product discontinued.'); setDeleteTarget(null); load(); }
    catch (err) { toast.error(err.message); }
  }

  const mainCategories = categories.filter((c) => !c.parent);

  return (
    <div>
      <PageHeader title="Product Master" actions={<Button icon={Plus} onClick={openCreate}>Add Product</Button>} />

      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name, SKU, barcode..." className="w-72" />
        <FilterSelect value={categoryFilter} onChange={(v) => { setCategoryFilter(v); setPage(1); }} placeholder="All Categories" options={mainCategories.map((c) => ({ value: c._id, label: c.name }))} />
        <FilterSelect value={brandFilter} onChange={(v) => { setBrandFilter(v); setPage(1); }} placeholder="All Brands" options={brands.map((b) => ({ value: b._id, label: b.name }))} />
      </FilterBar>

      <AlphabetFilter value={letter} onChange={(l) => { setLetter(l); setPage(1); }} />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No products found."
        emptyDescription="Try a different filter, or add your first product."
        emptyAction={<Button icon={Plus} onClick={openCreate}>Add Product</Button>}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          {
            key: 'product', header: 'Product', render: (r) => (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-graphite-100 flex items-center justify-center overflow-hidden shrink-0">
                  {r.images?.[0]?.url ? <img src={r.images[0].url} alt="" className="w-full h-full object-cover" /> : <ImageOff size={14} className="text-graphite-400" />}
                </div>
                <div>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.sku}</div>
                </div>
              </div>
            ),
          },
          { key: 'category', header: 'Category', render: (r) => r.category?.name || '-' },
          { key: 'brand', header: 'Brand', render: (r) => r.brand?.name || '-' },
          { key: 'sellingPrice', header: 'Price', render: (r) => formatCurrency(r.sellingPrice) },
          { key: 'mrp', header: 'MRP', render: (r) => formatCurrency(r.mrp) },
          { key: 'stock', header: 'Stock', render: (r) => <span className={r.stock <= r.reorderLevel ? 'text-rose-600 font-medium' : ''}>{r.stock ?? 0}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions', header: '', render: (r) => (
              <div className="flex items-center gap-1 justify-end">
                {canManage && (
                  <>
                    <button onClick={(e) => { e.stopPropagation(); openEdit(r); }} title="Edit" className="p-1.5 rounded-lg hover:bg-graphite-100 text-graphite-500"><Pencil size={14} /></button>
                    {r.status !== 'discontinued' && (
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }} title="Delete" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 size={14} /></button>
                    )}
                  </>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)} size="lg" title={editing ? 'Edit Product' : 'Add Product'}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="product-form" loading={saving}>Save Product</Button></>}
      >
        <form id="product-form" onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <Input label="Product Name" required className="col-span-2" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <Input label="SKU" required value={form.sku} onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))} />
          <Input label="Barcode" value={form.barcode} onChange={(e) => setForm((s) => ({ ...s, barcode: e.target.value }))} />

          <Select label="Category" value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}>
            <option value="">Select category</option>
            {mainCategories.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </Select>
          <Select label="Subcategory" value={form.subcategory} onChange={(e) => setForm((s) => ({ ...s, subcategory: e.target.value }))}>
            <option value="">Select subcategory</option>
            {categories.filter((c) => c.parent).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </Select>

          <Select label="Brand" value={form.brand} onChange={(e) => setForm((s) => ({ ...s, brand: e.target.value }))}>
            <option value="">Select brand</option>
            {brands.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
          </Select>
          <Input label="HSN Code" value={form.hsn} onChange={(e) => setForm((s) => ({ ...s, hsn: e.target.value }))} />

          <Select label="GST Rate" required value={form.taxRate} onChange={(e) => setForm((s) => ({ ...s, taxRate: e.target.value }))}>
            <option value="">Select GST rate</option>
            {taxRates.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </Select>
          <Select label="Unit" value={form.unit} onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}>
            {['PCS', 'SET', 'PACK', 'BOX'].map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>

          <CurrencyInput label="Purchase Price" required value={form.purchasePrice} onChange={(e) => setForm((s) => ({ ...s, purchasePrice: e.target.value }))} />
          <CurrencyInput label="Selling Price" required value={form.sellingPrice} onChange={(e) => setForm((s) => ({ ...s, sellingPrice: e.target.value }))} />
          <CurrencyInput label="MRP" required value={form.mrp} onChange={(e) => setForm((s) => ({ ...s, mrp: e.target.value }))} />
          <Input label="Discount %" type="number" value={form.discountPercent} onChange={(e) => setForm((s) => ({ ...s, discountPercent: e.target.value }))} />

          <Input label="Reorder Level" type="number" value={form.reorderLevel} onChange={(e) => setForm((s) => ({ ...s, reorderLevel: e.target.value }))} />
          <Input label="Max Stock" type="number" value={form.maxStock} onChange={(e) => setForm((s) => ({ ...s, maxStock: e.target.value }))} />

          <Select label="Primary Supplier" value={form.primarySupplier} onChange={(e) => setForm((s) => ({ ...s, primarySupplier: e.target.value }))}>
            <option value="">Select supplier</option>
            {suppliers.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
          <Select label="Primary Vendor" value={form.primaryVendor} onChange={(e) => setForm((s) => ({ ...s, primaryVendor: e.target.value }))}>
            <option value="">Select vendor</option>
            {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
          </Select>

          <div className="col-span-2">
            <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Description</span>
            <textarea
              rows={3} value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400 resize-none"
              style={{ borderColor: 'var(--border-subtle)' }}
            />
          </div>

          {editing && (
            <div className="col-span-2 pt-2 border-t flex justify-end" style={{ borderColor: 'var(--border-subtle)' }}>
              <Button type="button" variant="danger" size="sm" onClick={() => handleDeactivate(editing)}>Discontinue Product</Button>
            </div>
          )}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={() => handleDeactivate(deleteTarget)}
        title="Delete product?" description={`"${deleteTarget?.name}" will be marked as discontinued. Past invoices and stock history are kept.`} confirmLabel="Delete"
      />
    </div>
  );
}

export default ProductMaster;
