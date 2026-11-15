import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
import { PageHeader, DataTable, Button, Select, StatusBadge, Modal, Input } from '../../components/ui/index.js';
import ProductPicker from '../../components/ProductPicker.jsx';
import { purchaseService, vendorService, inventoryService } from '../../services/index.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

export function PurchaseOrders() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState([]);
  const [stores, setStores] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [vendor, setVendor] = useState('');
  const [store, setStore] = useState('');
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [receiveDraft, setReceiveDraft] = useState({});
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [payAmount, setPayAmount] = useState('');

  function load() {
    setLoading(true);
    purchaseService.list({ limit: 25 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    vendorService.listAll().then((r) => setVendors(r.data));
    inventoryService.locations().then((r) => setStores(r.data.stores));
  }, []);

  function addItem(product) {
    setItems((prev) => prev.some((i) => i.product._id === product._id) ? prev : [...prev, { product, quantity: 1, unitPrice: product.purchasePrice, gstRate: product.gstRate }]);
  }

  const total = items.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0) * (1 + (Number(i.gstRate) || 0) / 100), 0);

  async function handleCreate(e) {
    e.preventDefault();
    if (!vendor || !items.length) { toast.error('Select a vendor and add items.'); return; }
    setSaving(true);
    try {
      await purchaseService.create({
        vendor, store: store || undefined,
        items: items.map((i) => ({ product: i.product._id, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), gstRate: Number(i.gstRate) })),
      });
      toast.success('Purchase order created.');
      setCreateOpen(false); setItems([]); setVendor(''); setStore('');
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function openDetail(row) {
    const res = await purchaseService.getOne(row._id);
    const full = res.data;
    setDetail(full);
    const init = {};
    full.items.forEach((it) => { init[it.product._id || it.product] = it.quantity - (it.receivedQuantity || 0); });
    setReceiveDraft(init);
    setInvoiceNumber(full.invoiceNumber || '');
    setPayAmount('');
  }

  async function submitReceive() {
    try {
      await purchaseService.receive(detail._id, {
        items: detail.items.map((it) => ({
          product: it.product._id || it.product,
          receivedQuantity: Number(receiveDraft[it.product._id || it.product] || 0),
          batchNumber: undefined, manufacturingDate: undefined, expiryDate: undefined,
        })).filter((i) => i.receivedQuantity > 0),
        invoiceNumber: invoiceNumber || undefined,
      });
      toast.success('Goods receipt recorded.');
      setDetail(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  async function submitPayment() {
    try {
      await purchaseService.pay(detail._id, { amount: Number(payAmount), method: 'bank_transfer' });
      toast.success('Payment recorded.');
      setDetail(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div>
      <PageHeader title="Purchase Orders" actions={<Button onClick={() => setCreateOpen(true)}>New Purchase Order</Button>} />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No purchase orders yet."
        onRowClick={openDetail}
        columns={[
          { key: 'poNumber', header: 'PO #', render: (r) => <span className="font-mono text-xs">{r.poNumber}</span> },
          { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name },
          { key: 'createdAt', header: 'Date', render: (r) => formatDate(r.createdAt) },
          { key: 'grandTotal', header: 'Total', render: (r) => formatCurrency(r.grandTotal) },
          { key: 'amountPaid', header: 'Paid', render: (r) => formatCurrency(r.amountPaid) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Purchase Order" size="lg"
        footer={<><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="po-form" loading={saving}>Create PO ({formatCurrency(total)})</Button></>}
      >
        <form id="po-form" onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Select label="Vendor" required value={vendor} onChange={(e) => setVendor(e.target.value)}>
              <option value="">Select vendor</option>
              {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}</option>)}
            </Select>
            <Select label="Receiving Store" value={store} onChange={(e) => setStore(e.target.value)}>
              <option value="">Select store</option>
              {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </Select>
          </div>
          <div>
            <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Add Products</span>
            <ProductPicker onSelect={addItem} />
          </div>
          <div className="space-y-1.5">
            {items.map((it) => (
              <div key={it.product._id} className="flex items-center gap-2 text-sm px-2.5 py-2 rounded-lg" style={{ background: 'var(--bg-surface-muted)' }}>
                <span className="flex-1 truncate">{it.product.name}</span>
                <input type="number" min={1} value={it.quantity} placeholder="Qty"
                  onChange={(e) => setItems((prev) => prev.map((p) => p.product._id === it.product._id ? { ...p, quantity: e.target.value } : p))}
                  className="w-16 rounded border px-1.5 py-1 text-xs" style={{ borderColor: 'var(--border-subtle)' }} />
                <input type="number" step="0.01" value={it.unitPrice} placeholder="Price"
                  onChange={(e) => setItems((prev) => prev.map((p) => p.product._id === it.product._id ? { ...p, unitPrice: e.target.value } : p))}
                  className="w-24 rounded border px-1.5 py-1 text-xs" style={{ borderColor: 'var(--border-subtle)' }} />
                <span className="text-xs w-12" style={{ color: 'var(--text-muted)' }}>{it.gstRate}% GST</span>
                <button type="button" onClick={() => setItems((prev) => prev.filter((p) => p.product._id !== it.product._id))} className="text-graphite-400 hover:text-rose-500"><X size={14} /></button>
              </div>
            ))}
          </div>
        </form>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.poNumber} size="lg">
        {detail && (
          <div className="space-y-5">
            <div className="flex justify-between text-sm">
              <span>Vendor: <strong>{detail.vendor?.name}</strong></span>
              <StatusBadge status={detail.status} />
            </div>

            <table className="w-full text-sm">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Product</th><th className="text-right">Ordered</th><th className="text-right">Received</th><th className="text-right">Receive Now</th></tr></thead>
              <tbody>
                {detail.items.map((it) => {
                  const pid = it.product._id || it.product;
                  return (
                    <tr key={pid} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-1.5">{it.product.name || pid}</td>
                      <td className="text-right">{it.quantity}</td>
                      <td className="text-right">{it.receivedQuantity || 0}</td>
                      <td className="text-right">
                        <input type="number" min={0} value={receiveDraft[pid] ?? 0}
                          onChange={(e) => setReceiveDraft((s) => ({ ...s, [pid]: e.target.value }))}
                          className="w-20 rounded border px-1.5 py-1 text-xs text-right" style={{ borderColor: 'var(--border-subtle)' }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {!['invoiced', 'cancelled'].includes(detail.status) && (
              <div className="flex items-end gap-3">
                <Input label="Vendor Invoice # (optional, marks as invoiced)" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
                <Button onClick={submitReceive}>Receive Goods</Button>
              </div>
            )}

            <div className="flex justify-between text-sm pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <span>Total: <strong>{formatCurrency(detail.grandTotal)}</strong></span>
              <span>Paid: <strong>{formatCurrency(detail.amountPaid)}</strong></span>
              <span className="text-rose-600">Balance: <strong>{formatCurrency(detail.grandTotal - detail.amountPaid)}</strong></span>
            </div>

            {detail.status !== 'draft' && detail.amountPaid < detail.grandTotal && (
              <div className="flex items-end gap-3">
                <Input label="Pay Amount" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                <Button variant="outline" onClick={submitPayment}>Record Payment</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default PurchaseOrders;
