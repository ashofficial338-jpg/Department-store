import { useEffect, useState } from 'react';
import { VendorName } from '../../components/vendors/VendorStatus.jsx';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, Modal, Input, SearchBox, StatusBadge } from '../../components/ui/index.js';
import { purchaseService } from '../../services/index.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

// Purchase Return: raised against the original Purchase Invoice. It does not change stock - the goods
// leave when an Outward DC against the return is submitted.
export function PurchaseReturns() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [returnQty, setReturnQty] = useState({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    purchaseService.listReturns({ limit: 25 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  // Opened from a Purchase Invoice ("Create Purchase Return").
  useEffect(() => {
    const id = params.get('invoice');
    if (!id) return;
    setCreateOpen(true);
    selectInvoice({ _id: id });
    params.delete('invoice');
    setParams(params, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!createOpen || selected) return;
    purchaseService.listInvoices({ search: search || undefined, returnable: true, limit: 10 }).then((r) => setInvoices(r.data));
  }, [search, createOpen, selected]);

  async function selectInvoice(inv) {
    try {
      const res = await purchaseService.getInvoice(inv._id);
      setSelected(res.data);
      setReturnQty({});
    } catch (err) { toast.error(err.message); }
  }

  function close() { setCreateOpen(false); setSelected(null); setSearch(''); setReason(''); }

  async function handleSubmit(e) {
    e.preventDefault();
    const items = selected.items
      .filter((it) => Number(returnQty[it.product._id || it.product]) > 0)
      .map((it) => ({ product: it.product._id || it.product, quantity: Number(returnQty[it.product._id || it.product]), reason }));
    if (!items.length) { toast.error('Enter a return quantity for at least one item.'); return; }
    setSaving(true);
    try {
      await purchaseService.createReturn({ purchaseInvoiceId: selected._id, items });
      toast.success('Purchase return saved. Send the goods back on an Outward DC to reduce stock.');
      close();
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Purchase Returns" crumbs={[{ label: 'Purchasing', to: '/purchasing/orders' }, { label: 'Purchase Returns' }]} actions={<Button onClick={() => setCreateOpen(true)}>New Return</Button>} />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No purchase returns yet."
        columns={[
          { key: 'returnNumber', header: 'Return #', render: (r) => <span className="font-mono text-xs">{r.returnNumber}</span> },
          { key: 'invoice', header: 'Purchase Invoice', render: (r) => r.purchaseInvoice?.invoiceNumber || r.invoiceNumber || '-' },
          { key: 'purchase', header: 'Original PO', render: (r) => r.purchase?.poNumber },
          { key: 'vendor', header: 'Vendor', render: (r) => <VendorName vendor={r.vendor} /> },
          { key: 'createdAt', header: 'Date', render: (r) => formatDate(r.createdAt) },
          { key: 'totalAmount', header: 'Amount', render: (r) => formatCurrency(r.totalAmount) },
          { key: 'status', header: 'Status', render: (r) => (r.status ? <StatusBadge status={r.status} /> : <StatusBadge status="completed" />) },
          { key: 'actions', header: '', render: (r) => ['pending_dispatch', 'partially_dispatched'].includes(r.status) && <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); navigate(`/dc/outward?return=${r._id}`); }}>Outward DC</Button> },
        ]}
      />

      <Modal open={createOpen} onClose={close} title="New Purchase Return" size="lg"
        footer={selected && <><Button variant="outline" onClick={() => setSelected(null)}>Change Invoice</Button><Button type="submit" form="pr-form" loading={saving}>Submit Return</Button></>}
      >
        {!selected ? (
          <div>
            <SearchBox value={search} onChange={setSearch} placeholder="Search purchase invoice, vendor invoice or PO number..." />
            <div className="mt-3 space-y-1.5">
              {invoices.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No purchase invoices with received goods to return.</p>}
              {invoices.map((inv) => (
                <button key={inv._id} onClick={() => selectInvoice(inv)} className="w-full flex justify-between px-3 py-2.5 rounded-lg hover:bg-gold-50 text-sm text-left border" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="font-mono text-xs">{inv.invoiceNumber}</span>
                  <span className="font-mono text-xs">{inv.poNumber}</span>
                  <span>{inv.vendor?.name}</span>
                  <span>{formatCurrency(inv.grandTotal)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form id="pr-form" onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm">Returning against <strong>{selected.invoiceNumber}</strong> (PO {selected.poNumber}, {selected.vendor?.name})</p>
            <table className="w-full text-sm">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Product</th><th className="text-right">Received</th><th className="text-right">Returned</th><th className="text-right">Return Qty</th></tr></thead>
              <tbody>
                {selected.items.map((it) => {
                  const pid = it.product._id || it.product;
                  const left = (it.receivedQuantity || 0) - (it.returnedQuantity || 0);
                  return (
                    <tr key={pid} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-1.5">{it.product.name || pid}</td>
                      <td className="text-right">{it.receivedQuantity || 0}</td>
                      <td className="text-right">{it.returnedQuantity || 0}</td>
                      <td className="text-right">
                        <input type="number" min={0} max={left} disabled={left <= 0} value={returnQty[pid] || ''}
                          onChange={(e) => setReturnQty((s) => ({ ...s, [pid]: e.target.value }))}
                          className="w-20 rounded border px-1.5 py-1 text-xs text-right" style={{ borderColor: 'var(--border-subtle)' }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>The return does not change stock. Stock is reduced when the Outward DC for this return is submitted.</p>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default PurchaseReturns;
