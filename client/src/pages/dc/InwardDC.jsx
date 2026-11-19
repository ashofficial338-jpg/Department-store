import { useEffect, useState } from 'react';
import { VendorName } from '../../components/vendors/VendorStatus.jsx';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, XCircle } from 'lucide-react';
import { PageHeader, DataTable, Button, StatusBadge, Modal, SearchBox } from '../../components/ui/index.js';
import { dcService, purchaseService } from '../../services/index.js';
import { formatDateTime, formatCurrency } from '../../utils/format.js';

// Inward DC: goods arriving against a Purchase Invoice. Stock goes up only when the DC is submitted
// (Verify & Receive), with the quantities actually received; each DC can be submitted once.
export function InwardDC() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [invSearch, setInvSearch] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(null);
  const [processItems, setProcessItems] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    dcService.listInward({ limit: 25 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // Opened from a Purchase Invoice ("Receive on Inward DC").
    const id = params.get('invoice');
    if (id) {
      setCreateOpen(true);
      selectInvoice({ _id: id });
      params.delete('invoice');
      setParams(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!createOpen || invoice) return;
    purchaseService.listInvoices({ search: invSearch || undefined, receivable: true, limit: 10 }).then((r) => setInvoices(r.data));
  }, [invSearch, createOpen, invoice]);

  async function selectInvoice(row) {
    try {
      const full = (await purchaseService.getInvoice(row._id)).data;
      setInvoice(full);
      setItems(full.items
        .map((it) => ({ product: it.product, invoiced: it.quantity, received: it.receivedQuantity || 0, expectedQuantity: it.quantity - (it.receivedQuantity || 0) }))
        .filter((it) => it.invoiced - it.received > 0));
    } catch (err) { toast.error(err.message); }
  }

  function closeCreate() { setCreateOpen(false); setInvoice(null); setItems([]); setInvSearch(''); }

  async function handleCreate(e) {
    e.preventDefault();
    const lines = items.filter((i) => Number(i.expectedQuantity) > 0);
    if (!lines.length) { toast.error('Enter the expected quantity for at least one item.'); return; }
    setSaving(true);
    try {
      await dcService.createInward({
        purchaseInvoice: invoice._id,
        items: lines.map((i) => ({ product: i.product._id, expectedQuantity: Number(i.expectedQuantity) })),
      });
      toast.success('Inward DC created. Submit it with the received quantities to add stock.');
      closeCreate();
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  function openProcess(row) {
    setProcessing(row);
    const init = {};
    row.items.forEach((it) => {
      init[it.product._id] = { receivedQuantity: it.expectedQuantity, qualityCheckPassed: true, rejectReason: '', expiryDate: it.expiryDate ? String(it.expiryDate).slice(0, 10) : '' };
    });
    setProcessItems(init);
  }

  async function submitProcess() {
    setSubmitting(true);
    try {
      await dcService.processInward(processing._id, {
        items: processing.items.map((it) => {
          const v = processItems[it.product._id] || {};
          return { product: it.product._id, receivedQuantity: Number(v.receivedQuantity) || 0, qualityCheckPassed: v.qualityCheckPassed, rejectReason: v.rejectReason, expiryDate: v.expiryDate || undefined };
        }),
      });
      toast.success('Inward DC submitted - stock updated.');
      setProcessing(null);
      load();
    } catch (err) { toast.error(err.message); } finally { setSubmitting(false); }
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
          { key: 'invoiceNumber', header: 'Purchase Invoice', render: (r) => (r.invoiceNumber ? <span className="font-mono text-xs">{r.invoiceNumber}</span> : '-') },
          { key: 'vendor', header: 'Vendor', render: (r) => <VendorName vendor={r.vendor} /> },
          { key: 'items', header: 'Items', render: (r) => `${r.items.length} product(s)` },
          { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'actions', header: '', render: (r) => ['pending', 'draft'].includes(r.status) && !r.stockPosted && <Button size="sm" variant="outline" onClick={() => openProcess(r)}>Verify &amp; Receive</Button> },
        ]}
      />

      <Modal open={createOpen} onClose={closeCreate} title="New Inward DC" size="lg"
        footer={invoice && <><Button variant="outline" onClick={() => { setInvoice(null); setItems([]); }}>Change Invoice</Button><Button type="submit" form="inward-form" loading={saving}>Create</Button></>}
      >
        {!invoice ? (
          <div>
            <SearchBox value={invSearch} onChange={setInvSearch} placeholder="Search purchase invoice, vendor invoice or PO number..." />
            <div className="mt-3 space-y-1.5">
              {invoices.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No purchase invoices waiting for goods.</p>}
              {invoices.map((inv) => (
                <button key={inv._id} onClick={() => selectInvoice(inv)} className="w-full flex justify-between items-center px-3 py-2.5 rounded-lg hover:bg-gold-50 text-sm text-left border" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="font-mono text-xs">{inv.invoiceNumber}</span>
                  <span className="font-mono text-xs">{inv.poNumber}</span>
                  <span>{inv.vendor?.name}</span>
                  <span>{formatCurrency(inv.grandTotal)}</span>
                  <StatusBadge status={inv.status} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form id="inward-form" onSubmit={handleCreate} className="space-y-4">
            <p className="text-sm">Receiving against <strong>{invoice.invoiceNumber}</strong> (PO {invoice.poNumber}, {invoice.vendor?.name})</p>
            <table className="w-full text-sm">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Product</th><th className="text-right">Invoiced</th><th className="text-right">Received</th><th className="text-right">Expected Now</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.product._id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-1.5">{it.product.name}</td>
                    <td className="text-right">{it.invoiced}</td>
                    <td className="text-right">{it.received}</td>
                    <td className="text-right">
                      <input type="number" min={0} max={it.invoiced - it.received} value={it.expectedQuantity}
                        onChange={(e) => setItems((prev) => prev.map((p) => (p.product._id === it.product._id ? { ...p, expectedQuantity: e.target.value } : p)))}
                        className="w-20 rounded border px-1.5 py-1 text-xs text-right" style={{ borderColor: 'var(--border-subtle)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Creating the DC does not change stock. Stock is added when you submit it with the quantities actually received.</p>
          </form>
        )}
      </Modal>

      <Modal open={!!processing} onClose={() => setProcessing(null)} title={`Verify ${processing?.docNumber || ''}`} size="lg"
        footer={<><Button variant="outline" onClick={() => setProcessing(null)}>Cancel</Button><Button onClick={submitProcess} loading={submitting}>Submit &amp; Update Stock</Button></>}
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
                  <div className="flex items-center gap-3 flex-wrap">
                    <input type="number" value={val.receivedQuantity} min={0} max={it.expectedQuantity}
                      onChange={(e) => setProcessItems((s) => ({ ...s, [it.product._id]: { ...val, receivedQuantity: e.target.value } }))}
                      className="w-24 rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-subtle)' }} />
                    <button type="button" onClick={() => setProcessItems((s) => ({ ...s, [it.product._id]: { ...val, qualityCheckPassed: true } }))}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs ${val.qualityCheckPassed ? 'bg-emerald-100 text-emerald-700' : 'text-graphite-500'}`}>
                      <CheckCircle2 size={14} /> Pass
                    </button>
                    <button type="button" onClick={() => setProcessItems((s) => ({ ...s, [it.product._id]: { ...val, qualityCheckPassed: false } }))}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs ${val.qualityCheckPassed === false ? 'bg-rose-100 text-rose-700' : 'text-graphite-500'}`}>
                      <XCircle size={14} /> Reject
                    </button>
                    <label className="flex items-center gap-1.5 text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                      Expiry
                      <input type="date" value={val.expiryDate || ''}
                        onChange={(e) => setProcessItems((s) => ({ ...s, [it.product._id]: { ...val, expiryDate: e.target.value } }))}
                        className="rounded-lg border px-2 py-1 text-xs" style={{ borderColor: 'var(--border-subtle)' }} />
                    </label>
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
