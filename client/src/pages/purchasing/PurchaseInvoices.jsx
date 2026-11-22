import { useEffect, useState } from 'react';
import { VendorName } from '../../components/vendors/VendorStatus.jsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, StatusBadge, Modal, Input, SearchBox, Select } from '../../components/ui/index.js';
import { purchaseService, purchaseAnalysisService } from '../../services/index.js';
import { FilterPanel, cleanParams } from '../../components/ui/FilterPanel.jsx';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { lineKey, lineRef, lineLabel } from '../../utils/lines.js';

const INVOICEABLE = ['approved', 'ordered', 'partially_invoiced'];
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY_FILTERS = { search: '', vendor: '', status: '', paymentStatus: '', method: '', from: '', to: '', product: '', brand: '', user: '', minAmount: '', maxAmount: '', sort: 'date', order: 'desc' };
const PAY_METHODS = [['cash', 'Cash'], ['bank_transfer', 'Bank transfer'], ['upi', 'UPI'], ['card', 'Card']];
const INVOICE_STATUS = ['pending_receipt', 'partially_received', 'received', 'cancelled'].map((v) => ({ value: v, label: v.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }));

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
  // Paid now ('' = credit purchase). Full amount = cash purchase.
  const [payNow, setPayNow] = useState('');
  const [payMethod, setPayMethod] = useState('cash');
  const [payAmount, setPayAmount] = useState('');
  const [payLaterMethod, setPayLaterMethod] = useState('bank_transfer');
  const [paying, setPaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(null);

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [opts, setOpts] = useState({ vendors: [], products: [], brands: [], users: [] });
  useEffect(() => { purchaseAnalysisService.options().then((r) => setOpts(r.data)).catch(() => {}); }, []);

  function load() {
    setLoading(true);
    purchaseService.listInvoices(cleanParams({ ...filters, page, limit: 25 }))
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .catch((err) => toast.error(err.message)).finally(() => setLoading(false));
  }
  useEffect(() => { const t = setTimeout(load, filters.search ? 300 : 0); return () => clearTimeout(t); }, [filters, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const setFilter = (next) => { setFilters(next); setPage(1); };
  const optionList = (list) => list.map((x) => ({ value: x._id, label: x.name }));

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
      full.items.forEach((it) => { init[lineKey(it)] = Math.max(0, it.quantity - (it.invoicedQuantity || 0)); });
      setQty(init);
    } catch (err) { toast.error(err.message); }
  }

  function closeCreate() {
    setCreateOpen(false); setPo(null); setPoSearch(''); setVendorInvoiceNumber(''); setInvoiceDate(today()); setAllowOver(false); setPayNow(''); setPayMethod('cash');
  }

  const lineTotal = (it) => (Number(qty[lineKey(it)]) || 0) * it.unitPrice * (1 + (it.gstRate || 0) / 100);
  const total = po ? po.items.reduce((s, it) => s + lineTotal(it), 0) : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    const items = po.items
      .map((it) => ({ ...lineRef(it), quantity: Number(qty[lineKey(it)]) || 0 }))
      .filter((i) => i.quantity > 0);
    if (!items.length) { toast.error('Enter an invoice quantity for at least one item.'); return; }
    setSaving(true);
    try {
      if (payNow !== '' && (Number(payNow) < 0 || Number(payNow) > total + 0.005)) { toast.error('Paid amount must be between 0 and the invoice total.'); setSaving(false); return; }
      const res = await purchaseService.createInvoice({
        purchaseId: po._id, vendorInvoiceNumber: vendorInvoiceNumber || undefined, invoiceDate, allowOverInvoice: allowOver, items,
        ...(Number(payNow) > 0 ? { payNow: { amount: Number(payNow), method: payMethod } } : {}),
      });
      toast.success(res.due > 0 ? `Purchase invoice saved. ${formatCurrency(res.due)} payable to the supplier. Receive the goods on an Inward DC to add stock.` : 'Purchase invoice saved and paid. Receive the goods on an Inward DC to add stock.');
      closeCreate();
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function openDetail(row) {
    try { setDetail((await purchaseService.getInvoice(row._id)).data); } catch (err) { toast.error(err.message); }
  }

  async function recordPayment() {
    const value = Number(payAmount);
    if (!(value > 0)) { toast.error('Enter the amount paid.'); return; }
    setPaying(true);
    try {
      await purchaseService.payInvoice(detail._id, { amount: value, method: payLaterMethod });
      toast.success('Payment recorded.');
      setPayAmount('');
      await openDetail(detail);
      load();
    } catch (err) { toast.error(err.message); } finally { setPaying(false); }
  }

  const receivable = detail && ['pending_receipt', 'partially_received'].includes(detail.status);
  const returnable = detail && detail.items.some((i) => (i.receivedQuantity || 0) > (i.returnedQuantity || 0));

  return (
    <div>
      <PageHeader title="Purchase Invoices" crumbs={[{ label: 'Purchasing', to: '/purchasing/orders' }, { label: 'Purchase Invoices' }]} actions={<Button onClick={() => setCreateOpen(true)}>New Purchase Invoice</Button>} />

      <FilterPanel
        value={filters} onChange={setFilter} onReset={() => setFilter(EMPTY_FILTERS)} primary={4}
        searchPlaceholder="Search invoice #, vendor invoice #, PO # or supplier..."
        sortOptions={[{ value: 'date', label: 'Invoice date' }, { value: 'total', label: 'Total' }, { value: 'invoiceNumber', label: 'Invoice #' }, { value: 'status', label: 'Status' }]}
        fields={[
          { key: 'vendor', label: 'Supplier', type: 'select', options: optionList(opts.vendors) },
          { key: 'paymentStatus', label: 'Payment', type: 'select', options: [{ value: 'unpaid', label: 'Unpaid' }, { value: 'partial', label: 'Partly paid' }, { value: 'paid', label: 'Paid' }] },
          { key: 'status', label: 'Status', type: 'select', options: INVOICE_STATUS },
          { key: 'method', label: 'Paid by', type: 'select', options: PAY_METHODS.map(([value, label]) => ({ value, label })) },
          { label: 'Invoice date', type: 'dateRange', minKey: 'from', maxKey: 'to' },
          { key: 'product', label: 'Product', type: 'select', options: optionList(opts.products) },
          { key: 'brand', label: 'Brand', type: 'select', options: optionList(opts.brands) },
          { key: 'user', label: 'Entered by', type: 'select', options: optionList(opts.users) },
          { label: 'Invoice total', type: 'range', minKey: 'minAmount', maxKey: 'maxAmount' },
        ]}
      />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No purchase invoices found."
        onRowClick={openDetail}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'invoiceNumber', header: 'Invoice #', render: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
          { key: 'vendorInvoiceNumber', header: 'Vendor Inv #', render: (r) => r.vendorInvoiceNumber || '-' },
          { key: 'poNumber', header: 'PO #', render: (r) => <span className="font-mono text-xs">{r.poNumber}</span> },
          { key: 'vendor', header: 'Vendor', render: (r) => <VendorName vendor={r.vendor} /> },
          { key: 'invoiceDate', header: 'Date', render: (r) => formatDate(r.invoiceDate || r.createdAt) },
          { key: 'grandTotal', header: 'Total', render: (r) => formatCurrency(r.grandTotal) },
          { key: 'amountPaid', header: 'Paid', render: (r) => formatCurrency(r.amountPaid || 0) },
          { key: 'due', header: 'Due', render: (r) => (r.due > 0 ? <span className="text-rose-600 font-medium">{formatCurrency(r.due)}</span> : '-') },
          { key: 'pay', header: 'Payment', render: (r) => <StatusBadge status={r.due > 0.005 ? (r.amountPaid > 0 ? 'partial' : 'unpaid') : 'paid'} /> },
          { key: 'status', header: 'Goods', render: (r) => <StatusBadge status={r.status} /> },
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
                  const pid = lineKey(it);
                  const left = it.quantity - (it.invoicedQuantity || 0);
                  return (
                    <tr key={pid} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-1.5">{lineLabel(it) || pid}</td>
                      <td className="text-right">{formatCurrency(it.unitPrice)}{it.gstRate ? ` + ${it.gstRate}%` : ''}</td>
                      <td className="text-right">{it.quantity}</td>
                      <td className="text-right">{it.invoicedQuantity || 0}</td>
                      <td className="text-right">
                        <input type="number" min={0} step="any" max={allowOver ? undefined : Math.max(0, left)} value={qty[pid] ?? ''}
                          onChange={(e) => setQty((s) => ({ ...s, [pid]: e.target.value }))}
                          className="w-20 rounded border px-1.5 py-1 text-xs text-right" style={{ borderColor: 'var(--border-subtle)' }} />
                      </td>
                      <td className="text-right">{formatCurrency(lineTotal(it))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end p-3 rounded-lg" style={{ background: 'var(--bg-surface-muted)' }}>
              <Input label="Paid now (optional)" type="number" min={0} step="0.01" value={payNow} placeholder="0 = credit purchase" onChange={(e) => setPayNow(e.target.value)} />
              <Select label="Paid by" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {PAY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
              <div className="text-sm pb-2">
                <button type="button" className="underline text-xs mr-3" onClick={() => setPayNow(String(Math.round(total * 100) / 100))}>Paid in full (cash purchase)</button>
                <div>Outstanding: <strong className={total - (Number(payNow) || 0) > 0.005 ? 'text-rose-600' : ''}>{formatCurrency(Math.max(0, total - (Number(payNow) || 0)))}</strong></div>
              </div>
            </div>
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
                  <tr key={lineKey(it)} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-1.5">{lineLabel(it)}</td>
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
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>Returned: <strong>{formatCurrency(detail.returnedAmount || 0)}</strong></span>
              <span>Paid: <strong>{formatCurrency(detail.amountPaid || 0)}</strong></span>
              <span className={detail.due > 0 ? 'text-rose-600' : ''}>Supplier outstanding: <strong>{formatCurrency(detail.due || 0)}</strong></span>
            </div>
            {(detail.payments || []).length > 0 && (
              <div className="text-sm">
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Payments</div>
                {detail.payments.map((p) => (
                  <div key={p._id} className="flex justify-between py-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span className="font-mono text-xs">{p.voucherNumber}</span>
                    <span className="capitalize">{String(p.method).replace('_', ' ')}{p.atEntry ? ' (at entry)' : ''}</span>
                    <span>{formatDate(p.paidAt)}</span>
                    <strong>{formatCurrency(p.amount)}</strong>
                  </div>
                ))}
              </div>
            )}
            {detail.due > 0 && detail.status !== 'cancelled' && (
              <div className="flex flex-wrap items-end gap-2">
                <Input label="Pay amount" type="number" min={0} step="0.01" value={payAmount} placeholder={String(detail.due)} onChange={(e) => setPayAmount(e.target.value)} />
                <Select label="Method" value={payLaterMethod} onChange={(e) => setPayLaterMethod(e.target.value)}>
                  {PAY_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
                <Button variant="outline" onClick={() => setPayAmount(String(detail.due))}>Full due</Button>
                <Button onClick={recordPayment} loading={paying}>Record Payment</Button>
              </div>
            )}
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
