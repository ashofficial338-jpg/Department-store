import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, Select, Textarea } from '../../components/ui/index.js';
import ProductPicker from '../../components/ProductPicker.jsx';
import { inventoryService } from '../../services/index.js';
import { formatDateTime } from '../../utils/format.js';

const TYPE_OPTIONS = [
  { value: 'stock_adjustment', label: 'Stock Count Correction' },
  { value: 'damage', label: 'Damage' },
];

export function StockAdjustment() {
  const [locations, setLocations] = useState({ stores: [], distributionCenters: [] });
  const [product, setProduct] = useState(null);
  const [store, setStore] = useState('');
  const [quantity, setQuantity] = useState('');
  const [type, setType] = useState('stock_adjustment');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [recent, setRecent] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => { inventoryService.locations().then((r) => setLocations(r.data)); loadRecent(); }, []);

  function loadRecent() {
    setLoadingRecent(true);
    inventoryService.ledger({ type: 'stock_adjustment', limit: 15 }).then((r) => setRecent(r.data)).finally(() => setLoadingRecent(false));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!product || !store || !quantity) { toast.error('Select a product, location and quantity.'); return; }
    setSaving(true);
    try {
      await inventoryService.adjust({ product: product._id, store, quantity: Number(quantity), type, notes });
      toast.success('Stock adjustment recorded.');
      setProduct(null); setQuantity(''); setNotes('');
      loadRecent();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Stock Adjustment" crumbs={[{ label: 'Inventory' }, { label: 'Stock Adjustment' }]} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={handleSubmit} className="lg:col-span-1 surface-card rounded-xl2 shadow-premium p-6 space-y-4 h-fit">
          <h3 className="font-display text-base font-semibold mb-1">New Adjustment</h3>
          <div>
            <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Product</span>
            <ProductPicker onSelect={setProduct} />
            {product && <div className="mt-2 text-xs px-3 py-2 rounded-lg bg-gold-50 text-gold-800">{product.name} ({product.sku})</div>}
          </div>
          <Select label="Store" required value={store} onChange={(e) => setStore(e.target.value)}>
            <option value="">Select store</option>
            {locations.stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
          <Select label="Adjustment Type" value={type} onChange={(e) => setType(e.target.value)}>
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <div>
            <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Quantity (use negative to reduce)</span>
            <input
              type="number" required value={quantity} onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              style={{ borderColor: 'var(--border-subtle)' }}
            />
          </div>
          <Textarea label="Notes / Reason" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <Button type="submit" className="w-full" loading={saving}>Record Adjustment</Button>
        </form>

        <div className="lg:col-span-2">
          <DataTable
            loading={loadingRecent}
            rows={recent}
            emptyTitle="No stock adjustments recorded yet."
            columns={[
              { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
              { key: 'product', header: 'Product', render: (r) => r.product?.name },
              { key: 'quantity', header: 'Qty', render: (r) => <span className={r.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}>{r.quantity > 0 ? '+' : ''}{r.quantity}</span> },
              { key: 'notes', header: 'Notes', render: (r) => r.notes || '-' },
              { key: 'user', header: 'By', render: (r) => r.user?.name || '-' },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default StockAdjustment;
