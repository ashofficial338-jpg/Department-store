import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { PageHeader, DataTable, Button, Select, StatusBadge } from '../../components/ui/index.js';
import ProductPicker from '../../components/ProductPicker.jsx';
import { inventoryService } from '../../services/index.js';
import { formatDateTime } from '../../utils/format.js';

export function StockTransfer() {
  const [locations, setLocations] = useState({ stores: [], distributionCenters: [] });
  const [sourceType, setSourceType] = useState('Store');
  const [source, setSource] = useState('');
  const [destinationType, setDestinationType] = useState('Store');
  const [destination, setDestination] = useState('');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { inventoryService.locations().then((r) => setLocations(r.data)); load(); }, []);

  function load() {
    setLoading(true);
    inventoryService.transfers({ limit: 20 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }

  function addItem(product) {
    setItems((prev) => prev.some((i) => i.product._id === product._id) ? prev : [...prev, { product, quantity: 1 }]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!source || !destination || !items.length) { toast.error('Select source, destination and at least one item.'); return; }
    setSaving(true);
    try {
      await inventoryService.createTransfer({
        sourceType, source, destinationType, destination,
        items: items.map((i) => ({ product: i.product._id, quantity: Number(i.quantity) })),
      });
      toast.success('Stock transfer initiated.');
      setItems([]); setSource(''); setDestination('');
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function complete(id) {
    try { await inventoryService.completeTransfer(id); toast.success('Transfer completed.'); load(); }
    catch (err) { toast.error(err.message); }
  }

  const locationOptions = (type) => (type === 'Store' ? locations.stores : locations.distributionCenters);

  return (
    <div>
      <PageHeader title="Stock Transfer" crumbs={[{ label: 'Inventory' }, { label: 'Stock Transfer' }]} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <form onSubmit={handleSubmit} className="lg:col-span-1 surface-card rounded-xl2 shadow-premium p-6 space-y-4 h-fit">
          <h3 className="font-display text-base font-semibold">New Transfer</h3>
          <div className="grid grid-cols-2 gap-2">
            <Select label="From" value={sourceType} onChange={(e) => { setSourceType(e.target.value); setSource(''); }}>
              <option value="Store">Store</option><option value="DistributionCenter">DC</option>
            </Select>
            <Select label=" " value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Select</option>
              {locationOptions(sourceType).map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select label="To" value={destinationType} onChange={(e) => { setDestinationType(e.target.value); setDestination(''); }}>
              <option value="Store">Store</option><option value="DistributionCenter">DC</option>
            </Select>
            <Select label=" " value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">Select</option>
              {locationOptions(destinationType).map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </Select>
          </div>

          <div>
            <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Add Product</span>
            <ProductPicker onSelect={addItem} />
          </div>

          <div className="space-y-1.5">
            {items.map((it) => (
              <div key={it.product._id} className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg-surface-muted)' }}>
                <span className="flex-1 truncate">{it.product.name}</span>
                <input
                  type="number" min={1} value={it.quantity}
                  onChange={(e) => setItems((prev) => prev.map((p) => p.product._id === it.product._id ? { ...p, quantity: e.target.value } : p))}
                  className="w-16 rounded border px-1.5 py-1 text-xs" style={{ borderColor: 'var(--border-subtle)' }}
                />
                <button type="button" onClick={() => setItems((prev) => prev.filter((p) => p.product._id !== it.product._id))} className="text-graphite-400 hover:text-rose-500"><X size={14} /></button>
              </div>
            ))}
          </div>

          <Button type="submit" className="w-full" loading={saving}>Initiate Transfer</Button>
        </form>

        <div className="lg:col-span-2">
          <DataTable
            loading={loading}
            rows={rows}
            emptyTitle="No stock transfers yet."
            columns={[
              { key: 'transferNumber', header: 'Transfer #', render: (r) => <span className="font-mono text-xs">{r.transferNumber}</span> },
              { key: 'items', header: 'Items', render: (r) => `${r.items.length} product(s)` },
              { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
              { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'actions', header: '', render: (r) => r.status !== 'completed' && r.status !== 'cancelled' && (
                  <Button size="sm" variant="outline" onClick={() => complete(r._id)}>Mark Received</Button>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default StockTransfer;
