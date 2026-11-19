import { useEffect, useState } from 'react';
import { VendorName } from '../../components/vendors/VendorStatus.jsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, StatusBadge, Modal, Input, SearchBox } from '../../components/ui/index.js';
import { purchaseService } from '../../services/index.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

const INVOICEABLE = ['approved', 'ordered', 'partially_invoiced'];
const today = () => new Date().toISOString().slice(0, 10);

// Purchase Invoice: raised against an approved Purchase Order (lines and rates come from the order).
// Saving an invoice does not change stock - goods come in on an Inward DC against the invoice.
export function PurchaseInvoices() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [poSearch, setPoSearch] = useState('');
  const [orders, setOrders] = useState([]);
  const [po, setPo] = useState(null);
  const [qty, setQty] = useState({});
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today());
  const [allowOver, setAllowOver] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);

  function load() {
    setLoading(true);
    purchaseService.listInvoices({ limit: 25 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  // Opened from a Purchase Order ("Create Purchase Invoice"): start the form on that order.
  useEffect(() => {
    const id = params.get('po');
    if (!id) return;
    setCreateOpen(true);
    selectPO({ _id: id });
    params.delete('po');
    setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!createOpen || po) return;
    purchaseService.list({ search: poSearch || undefined, limit: 30 })
      .then((r) => setOrders(r.data.filter((o) => INVOICEABLE.includes(o.status))));
  }, [poSearch, createOpen, po]);

  async function selectPO(row) {
    try {
      const res = await purchaseService.getOne(row._id);
      const full = res.data;
      if (!INVOICEABLE.includes(full.status)) toast.error(full.status === 'draft' ? 'Approve this purchase order first.' : `This order is ${full.status.replace(/_/g, ' ')}.`);
      setPo(full);
      const init = {};
      full.items.forEach((it) => { init[it.product._id || it.product] = Math.max(0, it.quantity - (it.invoicedQuantity || 0)); });
      setQty(init);
    } catch (err) { toast.error(err.message); }
  }

  function closeCreate() {
    setCreateOpen(false); setPo(null); setPoSearch(''); setVendorInvoiceNumber(''); setInvoiceDate(today()); setAllowOver(false);
  }

  const lineTotal = (it) => (Number(qty[it.product._id || it.product]) || 0) * it.unitPrice * (1 + (it.gstRate || 0) / 100);
  const total = po ? po.items.reduce((s, it) => s + lineTotal(it), 0) : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    const items = po.items
      .map((it) => ({ product: it.product._id || it.product, quantity: Number(qty[it.product._id || it.product]) || 0 }))
      .filter((i) => i.quantity > 0);
    if (!items.length) { toast.error('Enter an invoice quantity for at least one item.'); return; }
    setSaving(true);
    try {
      await purchaseService.createInvoice({ purchaseId: po._id, vendorInvoiceNumber: vendorInvoiceNumber || undefined, invoiceDate, allowOverInvoice: allowOver, items });
      toast.success('Purchase invoice saved. Receive the goods on an Inward DC to add stock.');
      closeCreate();
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function openDetail(row) {
    try { setDetail((await purchaseService.getInvoice(row._id)).data); } catch (err) { toast.error(err.message); }
  }

  const receivable = detail && ['pending_receipt', 'partially_received'].includes(detail.status);
  const returnable = detail && detail.items.some((i) => (i.receivedQuantity || 0) > (i.returnedQuantity || 0));

  return (
    <div>
      <PageHeader title="Purchase Invoices" crumbs={[{ label: 'Purchasing', to: '/purchasing/orders' }, { label: 'Purchase Invoices' }]} actions={<Button onClick={() => setCreateOpen(true)}>New Purchase Invoice</Button>} />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No purchase invoices yet."
        onRowClick={openDetail}
        columns={[
          { key: 'invoiceNumber', header: 'Invoice #', render: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
          { key: 'vendorInvoiceNumber', header: 'Vendor Inv #', render: (r) => r.vendorInvoiceNumber || '-' },
          { key: 'poNumber', header: 'PO #', render: (r) => <span className="font-mono text-xs">{r.poNumber}</span> },
          { key: 'vendor', header: 'Vendor', render: (r) => <VendorName vendor={r.vendor} /> },
          { key: 'invoiceDate', header: 'Date', render: (r) => formatDate(r.invoiceDate || r.createdAt) },
          { key: 'grandTotal', header: 'Total', render: (r) => formatCurrency(r.grandTotal) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />

      <Modal open={createOpen} onClose={closeCreate} title="New Purchase Invoice" size="lg"
        footer={po && <><Button variant="outline" onClick={() => setPo(null)}>Change PO</Button><Button type="submit" form="pi-form" loading={saving} disabled={!INVOICEABLE.includes(po.status) && !(po.status === 'invoiced' && allowOver)}>Save Invoice ({formatCurrency(total)})</Button></>}
      >
        {!po ? (
          <div>
            <SearchBox value={poSearch} onChange={setPoSearch} placeholder="Search approved PO number..." />
            <div className="mt-3 space-y-1.5">
              {orders.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No approved purchase orders waiting to be invoiced.</p>}
              {orders.map((o) => (
                <button key={o._id} onClick={() => selectPO(o)} className="w-full flex justify-between items-center px-3 py-2.5 rounded-lg hover:bg-gold-50 text-sm text-left border" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="font-mono text-xs">{o.poNumber}</span>
                  <span>{o.vendor?.name}</span>
                  <span>{formatCurrency(o.grandTotal)}</span>
                  <StatusBadge status={o.status} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form id="pi-form" onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm">Invoicing against <strong>{po.poNumber}</strong> ({po.vendor?.name})</p>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Vendor Invoice #" value={vendorInvoiceNumber} onChange={(e) => setVendorInvoiceNumber(e.target.value)} />
              <Input label="Invoice Date" type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Product</th><th className="text-right">Rate</th><th className="text-right">Ordered</th><th className="text-right">Invoiced</th><th className="text-right">Invoice Qty</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {po.items.map((it) => {
                  const pid = it.product._id || it.product;
                  const left = it.quantity - (it.invoicedQuantity || 0);
                  return (
                    <tr key={pid} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-1.5">{it.product.name || pid}</td>
                      <td className="text-right">{formatCurrency(it.unitPrice)}{it.gstRate ? ` + ${it.gstRate}%` : ''}</td>
                      <td className="text-right">{it.quantity}</td>
                      <td className="text-right">{it.invoicedQuantity || 0}</td>
                      <td className="text-right">
                        <input type="number" min={0} max={allowOver ? undefined : Math.max(0, left)} value={qty[pid] ?? ''}
                          onChange={(e) => setQty((s) => ({ ...s, [pid]: e.target.value }))}
                          className="w-20 rounded border px-1.5 py-1 text-xs text-right" style={{ borderColor: 'var(--border-subtle)' }} />
                      </td>
                      <td className="text-right">{formatCurrency(lineTotal(it))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allowOver} onChange={(e) => setAllowOver(e.target.checked)} />
              Allow invoicing beyond ordered quantity
            </label>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Saving the invoice does not change stock. Stock is added when an Inward DC against this invoice is submitted.</p>
          </form>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.invoiceNumber} size="lg">
        {detail && (
          <div className="space-y-5">
            <div className="flex justify-between text-sm">
              <span>PO: <strong className="font-mono">{detail.poNumber}</strong> &middot; Vendor: <strong>{detail.vendor?.name}</strong>{detail.vendorInvoiceNumber ? <> &middot; Vendor Inv: <strong>{detail.vendorInvoiceNumber}</strong></> : null}</span>
              <StatusBadge status={detail.status} />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Product</th><th className="text-right">Invoiced</th><th className="text-right">Received</th><th className="text-right">Returned</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {detail.items.map((it) => (
                  <tr key={it.product?._id || it.product} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-1.5">{it.product?.name}</td>
                    <td className="text-right">{it.quantity}</td>
                    <td className="text-right">{it.receivedQuantity || 0}</td>
                    <td className="text-right">{it.returnedQuantity || 0}</td>
                    <td className="text-right">{formatCurrency(it.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between text-sm pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <span>Taxable: <strong>{formatCurrency(detail.subtotal)}</strong></span>
              <span>GST: <strong>{formatCurrency(detail.taxAmount)}</strong></span>
              <span>Total: <strong>{formatCurrency(detail.grandTotal)}</strong></span>
            </div>
            {(detail.inwardDCs?.length > 0 || detail.returns?.length > 0) && (
              <div className="text-sm">
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Linked Documents</div>
                {detail.inwardDCs.map((d) => (
                  <div key={d._id} className="flex justify-between py-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span>Inward DC <span className="font-mono text-xs">{d.docNumber}</span></span>
                    <span>{formatDate(d.submittedAt || d.createdAt)}</span>
                    <StatusBadge status={d.status} />
                  </div>
                ))}
                {detail.returns.map((r) => (
                  <div key={r._id} className="flex justify-between py-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span>Return <span className="font-mono text-xs">{r.returnNumber}</span></span>
                    <span>{formatCurrency(r.totalAmount)}</span>
                    <StatusBadge status={r.status} />
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-3">
              {receivable && <Button onClick={() => navigate(`/dc/inward?invoice=${detail._id}`)}>Receive on Inward DC</Button>}
              {returnable && <Button variant="outline" onClick={() => navigate(`/purchasing/returns?invoice=${detail._id}`)}>Create Purchase Return</Button>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default PurchaseInvoices;
