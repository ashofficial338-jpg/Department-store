import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X, CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader, DataTable, Button, Select, StatusBadge, Modal } from '../../components/ui/index.js';
import ProductPicker from '../../components/ProductPicker.jsx';
import { dcService, inventoryService, vendorService } from '../../services/index.js';
import { formatDateTime } from '../../utils/format.js';

export function InwardDC() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dcs, setDcs] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [distributionCenter, setDistributionCenter] = useState('');
  const [vendor, setVendor] = useState('');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [processItems, setProcessItems] = useState({});

  function load() {
    setLoading(true);
    dcService.listInward({ limit: 25 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    inventoryService.locations().then((r) => setDcs(r.data.distributionCenters));
    vendorService.listAll().then((r) => setVendors(r.data));
  }, []);

  function addItem(product) {
    setItems((prev) => prev.some((i) => i.product._id === product._id) ? prev : [...prev, { product, expectedQuantity: 1 }]);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!distributionCenter || !items.length) { toast.error('Select a DC and at least one item.'); return; }
    setSaving(true);
    try {
      await dcService.createInward({
        distributionCenter, vendor: vendor || undefined,
        items: items.map((i) => ({ product: i.product._id, expectedQuantity: Number(i.expectedQuantity) })),
      });
      toast.success('Inward DC document created.');
      setCreateOpen(false); setItems([]); setDistributionCenter(''); setVendor('');
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  function openProcess(row) {
    setProcessing(row);
    const init = {};
    row.items.forEach((it) => { init[it.product._id] = { receivedQuantity: it.expectedQuantity, qualityCheckPassed: true, rejectReason: '' }; });
    setProcessItems(init);
  }

  async function submitProcess() {
    try {
      await dcService.processInward(processing._id, {
        items: processing.items.map((it) => ({ product: it.product._id, ...processItems[it.product._id] })),
      });
      toast.success('Inward DC processed.');
      setProcessing(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div>
      <PageHeader title="Inward DC" crumbs={[{ label: 'DC Management' }, { label: 'Inward DC' }]} actions={<Button onClick={() => setCreateOpen(true)}>New Inward DC</Button>} />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No inward DC documents yet."
        columns={[
          { key: 'docNumber', header: 'Doc #', render: (r) => <span className="font-mono text-xs">{r.docNumber}</span> },
          { key: 'distributionCenter', header: 'DC', render: (r) => r.distributionCenter?.name },
          { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name || '-' },
          { key: 'items', header: 'Items', render: (r) => `${r.items.length} product(s)` },
          { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'actions', header: '', render: (r) => ['pending', 'draft'].includes(r.status) && <Button size="sm" variant="outline" onClick={() => openProcess(r)}>Verify &amp; Receive</Button> },
        ]}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Inward DC"
        footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="inward-form" loading={saving}>Create</Button></>}
      >
        <form id="inward-form" onSubmit={handleCreate} className="space-y-4">
          <Select label="Distribution Center" required value={distributionCenter} onChange={(e) => setDistributionCenter(e.target.value)}>
            <option value="">Select DC</option>
            {dcs.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </Select>
          <Select label="Vendor (optional)" value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">Select vendor</option>
            {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
          </Select>
          <div>
            <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Add Expected Items</span>
            <ProductPicker onSelect={addItem} />
          </div>
          <div className="space-y-1.5">
            {items.map((it) => (
              <div key={it.product._id} className="flex items-center gap-2 text-sm px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--bg-surface-muted)' }}>
                <span className="flex-1 truncate">{it.product.name}</span>
                <input type="number" min={1} value={it.expectedQuantity}
                  onChange={(e) => setItems((prev) => prev.map((p) => p.product._id === it.product._id ? { ...p, expectedQuantity: e.target.value } : p))}
                  className="w-16 rounded border px-1.5 py-1 text-xs" style={{ borderColor: 'var(--border-subtle)' }} />
                <button type="button" onClick={() => setItems((prev) => prev.filter((p) => p.product._id !== it.product._id))} className="text-graphite-400 hover:text-rose-500"><X size={14} /></button>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      <Modal open={!!processing} onClose={() => setProcessing(null)} title={`Verify ${processing?.docNumber || ''}`} size="lg"
        footer={<><Button variant="outline" onClick={() => setProcessing(null)}>Cancel</Button><Button onClick={submitProcess}>Submit Verification</Button></>}
      >
        {processing && (
          <div className="space-y-3">
            {processing.items.map((it) => {
              const val = processItems[it.product._id] || {};
              return (
                <div key={it.product._id} className="p-3 rounded-xl border" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="flex justify-between mb-2">
                    <span className="font-medium text-sm">{it.product.name}</span>
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Expected: {it.expectedQuantity}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input type="number" value={val.receivedQuantity} min={0}
                      onChange={(e) => setProcessItems((s) => ({ ...s, [it.product._id]: { ...val, receivedQuantity: Number(e.target.value) } }))}
                      className="w-24 rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-subtle)' }} />
                    <button type="button" onClick={() => setProcessItems((s) => ({ ...s, [it.product._id]: { ...val, qualityCheckPassed: true } }))}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs ${val.qualityCheckPassed ? 'bg-emerald-100 text-emerald-700' : 'text-graphite-500'}`}>
                      <CheckCircle2 size={14} /> Pass
                    </button>
                    <button type="button" onClick={() => setProcessItems((s) => ({ ...s, [it.product._id]: { ...val, qualityCheckPassed: false } }))}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs ${val.qualityCheckPassed === false ? 'bg-rose-100 text-rose-700' : 'text-graphite-500'}`}>
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default InwardDC;
