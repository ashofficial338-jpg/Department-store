import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { PageHeader, DataTable, Button, Select, StatusBadge, Modal, ConfirmDialog } from '../../components/ui/index.js';
import ProductPicker from '../../components/ProductPicker.jsx';
import { dcService, inventoryService } from '../../services/index.js';
import { formatDateTime } from '../../utils/format.js';

const NEXT_LABEL = { draft: 'Approve', approved: 'Start Picking', picking: 'Mark Packed', packed: 'Dispatch', dispatched: 'Mark Received' };

export function OutwardDC() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dcs, setDcs] = useState([]);
  const [stores, setStores] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [sourceDC, setSourceDC] = useState('');
  const [destinationType, setDestinationType] = useState('Store');
  const [destination, setDestination] = useState('');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);

  function load() {
    setLoading(true);
    dcService.listOutward({ limit: 25 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    inventoryService.locations().then((r) => { setDcs(r.data.distributionCenters); setStores(r.data.stores); });
  }, []);

  function addItem(product) {
    setItems((prev) => prev.some((i) => i.product._id === product._id) ? prev : [...prev, { product, quantity: 1 }]);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!sourceDC || !destination || !items.length) { toast.error('Select a source DC, destination and items.'); return; }
    setSaving(true);
    try {
      await dcService.createOutward({
        sourceDC, destinationType, destination,
        items: items.map((i) => ({ product: i.product._id, quantity: Number(i.quantity) })),
      });
      toast.success('Outward DC created.');
      setCreateOpen(false); setItems([]); setSourceDC(''); setDestination('');
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function advance(row) {
    try { await dcService.advanceOutward(row._id); toast.success('Status updated.'); load(); }
    catch (err) { toast.error(err.message); }
  }

  async function cancel() {
    try { await dcService.cancelOutward(cancelTarget._id); toast.success('Outward DC cancelled.'); setCancelTarget(null); load(); }
    catch (err) { toast.error(err.message); }
  }

  const destOptions = destinationType === 'Store' ? stores : dcs;

  return (
    <div>
      <PageHeader title="Outward DC" crumbs={[{ label: 'DC Management' }, { label: 'Outward DC' }]} actions={<Button onClick={() => setCreateOpen(true)}>New Outward DC</Button>} />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No outward DC documents yet."
        columns={[
          { key: 'docNumber', header: 'Doc #', render: (r) => <span className="font-mono text-xs">{r.docNumber}</span> },
          { key: 'sourceDC', header: 'From DC', render: (r) => r.sourceDC?.name },
          { key: 'destinationType', header: 'To', render: (r) => r.destinationType },
          { key: 'items', header: 'Items', render: (r) => `${r.items.length} product(s)` },
          { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions', header: '', render: (r) => (
              <div className="flex gap-1.5 justify-end">
                {NEXT_LABEL[r.status] && <Button size="sm" variant="outline" onClick={() => advance(r)}>{NEXT_LABEL[r.status]}</Button>}
                {!['dispatched', 'received', 'cancelled'].includes(r.status) && <Button size="sm" variant="ghost" onClick={() => setCancelTarget(r)}>Cancel</Button>}
              </div>
            ),
          },
        ]}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Outward DC"
        footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="outward-form" loading={saving}>Create</Button></>}
      >
        <form id="outward-form" onSubmit={handleCreate} className="space-y-4">
          <Select label="Source DC" required value={sourceDC} onChange={(e) => setSourceDC(e.target.value)}>
            <option value="">Select DC</option>
            {dcs.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select label="Destination Type" value={destinationType} onChange={(e) => { setDestinationType(e.target.value); setDestination(''); }}>
              <option value="Store">Store</option><option value="DistributionCenter">DC</option>
            </Select>
            <Select label="Destination" required value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">Select</option>
              {destOptions.map((l) => <option key={l._id} value={l._id}>{l.name}</option>)}
            </Select>
          </div>
          <div>
            <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Add Items</span>
            <ProductPicker onSelect={addItem} />
          </div>
          <div className="space-y-1.5">
            {items.map((it) => (
              <div key={it.product._id} className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg-surface-muted)' }}>
                <span className="flex-1 truncate">{it.product.name}</span>
                <input type="number" min={1} value={it.quantity}
                  onChange={(e) => setItems((prev) => prev.map((p) => p.product._id === it.product._id ? { ...p, quantity: e.target.value } : p))}
                  className="w-16 rounded border px-1.5 py-1 text-xs" style={{ borderColor: 'var(--border-subtle)' }} />
                <button type="button" onClick={() => setItems((prev) => prev.filter((p) => p.product._id !== it.product._id))} className="text-graphite-400 hover:text-rose-500"><X size={14} /></button>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={cancel} title="Cancel Outward DC?" description="This outward DC document will be cancelled and no stock will move." confirmLabel="Cancel Document" />
    </div>
  );
}

export default OutwardDC;
