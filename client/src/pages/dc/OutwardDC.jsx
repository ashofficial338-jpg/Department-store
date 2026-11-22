import { useEffect, useState } from 'react';
import { VendorName } from '../../components/vendors/VendorStatus.jsx';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, StatusBadge, Modal, ConfirmDialog, SearchBox } from '../../components/ui/index.js';
import { dcService, purchaseService } from '../../services/index.js';
import { lineKey, lineRef, lineLabel } from '../../utils/lines.js';
import { formatDateTime, formatCurrency } from '../../utils/format.js';

// Older outward DCs (not linked to a purchase return) keep their status steps.
const NEXT_LABEL = { draft: 'Approve', approved: 'Start Picking', picking: 'Mark Packed', packed: 'Dispatch', dispatched: 'Mark Received' };

// Outward DC: goods sent back to the vendor against a Purchase Return. Stock goes down only when the DC
// is submitted (Submit Dispatch) with the quantities actually dispatched; each DC can be submitted once.
export function OutwardDC() {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [retSearch, setRetSearch] = useState('');
  const [returns, setReturns] = useState([]);
  const [ret, setRet] = useState(null);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [dispatching, setDispatching] = useState(null);
  const [dispatchQty, setDispatchQty] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    dcService.listOutward({ limit: 25 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    // Opened from a Purchase Return ("Outward DC").
    const id = params.get('return');
    if (id) {
      setCreateOpen(true);
      selectReturn({ _id: id });
      params.delete('return');
      setParams(params, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!createOpen || ret) return;
    purchaseService.listReturns({ search: retSearch || undefined, dispatchable: true, limit: 10 }).then((r) => setReturns(r.data));
  }, [retSearch, createOpen, ret]);

  async function selectReturn(row) {
    try {
      const full = (await purchaseService.getReturn(row._id)).data;
      setRet(full);
      setItems(full.items
        .map((it) => ({ product: it.product, brand: it.brand, unit: it.unit, baseUnit: it.baseUnit, baseFactor: it.baseFactor, returned: it.quantity, dispatched: it.dispatchedQuantity || 0, quantity: it.quantity - (it.dispatchedQuantity || 0) }))
        .filter((it) => it.returned - it.dispatched > 0));
    } catch (err) { toast.error(err.message); }
  }

  function closeCreate() { setCreateOpen(false); setRet(null); setItems([]); setRetSearch(''); }

  async function handleCreate(e) {
    e.preventDefault();
    const lines = items.filter((i) => Number(i.quantity) > 0);
    if (!lines.length) { toast.error('Enter the quantity for at least one item.'); return; }
    setSaving(true);
    try {
      await dcService.createOutward({
        purchaseReturn: ret._id,
        items: lines.map((i) => ({ ...lineRef(i), quantity: Number(i.quantity) })),
      });
      toast.success('Outward DC created. Submit the dispatch to reduce stock.');
      closeCreate();
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  function openDispatch(row) {
    setDispatching(row);
    const init = {};
    row.items.forEach((it) => { init[lineKey(it)] = it.quantity; });
    setDispatchQty(init);
  }

  async function submitDispatch() {
    setSubmitting(true);
    try {
      await dcService.submitOutward(dispatching._id, {
        items: dispatching.items.map((it) => ({ ...lineRef(it), dispatchedQuantity: Number(dispatchQty[lineKey(it)]) || 0 })),
      });
      toast.success('Outward DC submitted - stock updated.');
      setDispatching(null);
      load();
    } catch (err) { toast.error(err.message); } finally { setSubmitting(false); }
  }

  async function advance(row) {
    try { await dcService.advanceOutward(row._id); toast.success('Status updated.'); load(); }
    catch (err) { toast.error(err.message); }
  }

  async function cancel() {
    try { await dcService.cancelOutward(cancelTarget._id); toast.success('Outward DC cancelled.'); setCancelTarget(null); load(); }
    catch (err) { toast.error(err.message); }
  }

  const open = (r) => !['dispatched', 'received', 'cancelled'].includes(r.status) && !r.stockPosted;

  return (
    <div>
      <PageHeader title="Outward DC" crumbs={[{ label: 'DC Management' }, { label: 'Outward DC' }]} actions={<Button onClick={() => setCreateOpen(true)}>New Outward DC</Button>} />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No outward DC documents yet."
        columns={[
          { key: 'docNumber', header: 'Doc #', render: (r) => <span className="font-mono text-xs">{r.docNumber}</span> },
          { key: 'returnNumber', header: 'Purchase Return', render: (r) => (r.returnNumber ? <span className="font-mono text-xs">{r.returnNumber}</span> : '-') },
          { key: 'vendor', header: 'Vendor', render: (r) => <VendorName vendor={r.vendor} /> },
          { key: 'items', header: 'Items', render: (r) => `${r.items.length} product(s)` },
          { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          {
            key: 'actions', header: '', render: (r) => (
              <div className="flex gap-1.5 justify-end">
                {r.purchaseReturn
                  ? open(r) && <Button size="sm" variant="outline" onClick={() => openDispatch(r)}>Submit Dispatch</Button>
                  : NEXT_LABEL[r.status] && <Button size="sm" variant="outline" onClick={() => advance(r)}>{NEXT_LABEL[r.status]}</Button>}
                {open(r) && <Button size="sm" variant="ghost" onClick={() => setCancelTarget(r)}>Cancel</Button>}
              </div>
            ),
          },
        ]}
      />

      <Modal open={createOpen} onClose={closeCreate} title="New Outward DC" size="lg"
        footer={ret && <><Button variant="outline" onClick={() => { setRet(null); setItems([]); }}>Change Return</Button><Button type="submit" form="outward-form" loading={saving}>Create</Button></>}
      >
        {!ret ? (
          <div>
            <SearchBox value={retSearch} onChange={setRetSearch} placeholder="Search purchase return or invoice number..." />
            <div className="mt-3 space-y-1.5">
              {returns.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No purchase returns waiting to be dispatched.</p>}
              {returns.map((r) => (
                <button key={r._id} onClick={() => selectReturn(r)} className="w-full flex justify-between items-center px-3 py-2.5 rounded-lg hover:bg-gold-50 text-sm text-left border" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="font-mono text-xs">{r.returnNumber}</span>
                  <span className="font-mono text-xs">{r.purchaseInvoice?.invoiceNumber || r.invoiceNumber}</span>
                  <span>{r.vendor?.name}</span>
                  <span>{formatCurrency(r.totalAmount)}</span>
                  <StatusBadge status={r.status} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form id="outward-form" onSubmit={handleCreate} className="space-y-4">
            <p className="text-sm">Sending back against <strong>{ret.returnNumber}</strong> ({ret.purchaseInvoice?.invoiceNumber || ret.invoiceNumber}, {ret.vendor?.name})</p>
            <table className="w-full text-sm">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Product</th><th className="text-right">Returned</th><th className="text-right">Dispatched</th><th className="text-right">Dispatch Now</th></tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={lineKey(it)} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-1.5">{lineLabel(it)}</td>
                    <td className="text-right">{it.returned}</td>
                    <td className="text-right">{it.dispatched}</td>
                    <td className="text-right">
                      <input type="number" min={0} step="any" max={it.returned - it.dispatched} value={it.quantity}
                        onChange={(e) => setItems((prev) => prev.map((p) => (lineKey(p) === lineKey(it) ? { ...p, quantity: e.target.value } : p)))}
                        className="w-20 rounded border px-1.5 py-1 text-xs text-right" style={{ borderColor: 'var(--border-subtle)' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Creating the DC does not change stock. Stock is reduced when you submit the dispatch.</p>
          </form>
        )}
      </Modal>

      <Modal open={!!dispatching} onClose={() => setDispatching(null)} title={`Dispatch ${dispatching?.docNumber || ''}`}
        footer={<><Button variant="outline" onClick={() => setDispatching(null)}>Cancel</Button><Button onClick={submitDispatch} loading={submitting}>Submit &amp; Update Stock</Button></>}
      >
        {dispatching && (
          <table className="w-full text-sm">
            <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Product</th><th className="text-right">Planned</th><th className="text-right">Dispatched Qty</th></tr></thead>
            <tbody>
              {dispatching.items.map((it) => (
                <tr key={lineKey(it)} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="py-1.5">{lineLabel(it)}</td>
                  <td className="text-right">{it.quantity}</td>
                  <td className="text-right">
                    <input type="number" min={0} step="any" max={it.quantity} value={dispatchQty[lineKey(it)] ?? ''}
                      onChange={(e) => setDispatchQty((s) => ({ ...s, [lineKey(it)]: e.target.value }))}
                      className="w-20 rounded border px-1.5 py-1 text-xs text-right" style={{ borderColor: 'var(--border-subtle)' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      <ConfirmDialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={cancel} title="Cancel Outward DC?" description="This outward DC document will be cancelled and no stock will move." confirmLabel="Cancel Document" />
    </div>
  );
}

export default OutwardDC;
