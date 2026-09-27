import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, Modal, Select, Input, SearchBox } from '../../components/ui/index.js';
import { purchaseService } from '../../services/index.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

export function PurchaseReturns() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [poSearch, setPoSearch] = useState('');
  const [purchases, setPurchases] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [returnQty, setReturnQty] = useState({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    purchaseService.listReturns({ limit: 25 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  useEffect(() => {
    if (!poSearch.trim()) { setPurchases([]); return; }
    purchaseService.list({ search: poSearch, status: 'received', limit: 5 }).then((r) => setPurchases(r.data));
  }, [poSearch]);

  async function selectPO(po) {
    const res = await purchaseService.getOne(po._id);
    setSelectedPO(res.data);
    setReturnQty({});
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const items = selectedPO.items
      .filter((it) => Number(returnQty[it.product._id || it.product]) > 0)
      .map((it) => ({ product: it.product._id || it.product, quantity: Number(returnQty[it.product._id || it.product]), reason }));
    if (!items.length) { toast.error('Enter a return quantity for at least one item.'); return; }
    setSaving(true);
    try {
      await purchaseService.createReturn({ purchaseId: selectedPO._id, items });
      toast.success('Purchase return recorded.');
      setCreateOpen(false); setSelectedPO(null); setPoSearch(''); setReason('');
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
          { key: 'purchase', header: 'Original PO', render: (r) => r.purchase?.poNumber },
          { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name },
          { key: 'createdAt', header: 'Date', render: (r) => formatDate(r.createdAt) },
          { key: 'totalAmount', header: 'Amount', render: (r) => formatCurrency(r.totalAmount) },
        ]}
      />

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setSelectedPO(null); }} title="New Purchase Return" size="lg"
        footer={selectedPO && <><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="pr-form" loading={saving}>Submit Return</Button></>}
      >
        {!selectedPO ? (
          <div>
            <SearchBox value={poSearch} onChange={setPoSearch} placeholder="Search PO number..." />
            <div className="mt-3 space-y-1.5">
              {purchases.map((po) => (
                <button key={po._id} onClick={() => selectPO(po)} className="w-full flex justify-between px-3 py-2.5 rounded-lg hover:bg-gold-50 text-sm text-left border" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="font-mono text-xs">{po.poNumber}</span>
                  <span>{po.vendor?.name}</span>
                  <span>{formatCurrency(po.grandTotal)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form id="pr-form" onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm">Returning against <strong>{selectedPO.poNumber}</strong> ({selectedPO.vendor?.name})</p>
            <table className="w-full text-sm">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Product</th><th className="text-right">Received</th><th className="text-right">Return Qty</th></tr></thead>
              <tbody>
                {selectedPO.items.map((it) => {
                  const pid = it.product._id || it.product;
                  return (
                    <tr key={pid} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-1.5">{it.product.name || pid}</td>
                      <td className="text-right">{it.receivedQuantity || 0}</td>
                      <td className="text-right">
                        <input type="number" min={0} max={it.receivedQuantity || 0} value={returnQty[pid] || ''}
                          onChange={(e) => setReturnQty((s) => ({ ...s, [pid]: e.target.value }))}
                          className="w-20 rounded border px-1.5 py-1 text-xs text-right" style={{ borderColor: 'var(--border-subtle)' }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </form>
        )}
      </Modal>
    </div>
  );
}

export default PurchaseReturns;
