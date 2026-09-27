import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, Modal, SearchBox, Select } from '../../components/ui/index.js';
import { salesService } from '../../services/index.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

export function SalesReturns() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [matches, setMatches] = useState([]);
  const [selectedSale, setSelectedSale] = useState(null);
  const [returnQty, setReturnQty] = useState({});
  const [restockStatus, setRestockStatus] = useState({});
  const [refundMethod, setRefundMethod] = useState('cash');
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    salesService.listReturns({ limit: 25 }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  useEffect(() => {
    if (!invoiceSearch.trim()) { setMatches([]); return; }
    salesService.list({ search: invoiceSearch, status: 'completed', limit: 5 }).then((r) => setMatches(r.data));
  }, [invoiceSearch]);

  async function selectSale(sale) {
    const res = await salesService.getOne(sale._id);
    setSelectedSale(res.data);
    setReturnQty({}); setRestockStatus({});
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const items = selectedSale.items
      .filter((it) => Number(returnQty[it.product._id || it.product]) > 0)
      .map((it) => ({ product: it.product._id || it.product, quantity: Number(returnQty[it.product._id || it.product]), restockStatus: restockStatus[it.product._id || it.product] || 'restocked' }));
    if (!items.length) { toast.error('Enter a return quantity for at least one item.'); return; }
    setSaving(true);
    try {
      await salesService.createReturn({ saleId: selectedSale._id, items, refundMethod });
      toast.success('Sales return processed.');
      setCreateOpen(false); setSelectedSale(null); setInvoiceSearch('');
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  return (
    <div>
      <PageHeader title="Sales Returns" crumbs={[{ label: 'Sales' }, { label: 'Returns' }]} actions={<Button onClick={() => setCreateOpen(true)}>New Return</Button>} />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No sales returns yet."
        columns={[
          { key: 'returnNumber', header: 'Return #', render: (r) => <span className="font-mono text-xs">{r.returnNumber}</span> },
          { key: 'sale', header: 'Original Invoice', render: (r) => r.sale?.invoiceNumber },
          { key: 'customer', header: 'Customer', render: (r) => r.customer?.name || 'Walk-in' },
          { key: 'createdAt', header: 'Date', render: (r) => formatDate(r.createdAt) },
          { key: 'totalRefund', header: 'Refund', render: (r) => formatCurrency(r.totalRefund) },
        ]}
      />

      <Modal open={createOpen} onClose={() => { setCreateOpen(false); setSelectedSale(null); }} title="New Sales Return" size="lg"
        footer={selectedSale && <><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" form="sr-form" loading={saving}>Process Return</Button></>}
      >
        {!selectedSale ? (
          <div>
            <SearchBox value={invoiceSearch} onChange={setInvoiceSearch} placeholder="Search invoice number..." />
            <div className="mt-3 space-y-1.5">
              {matches.map((s) => (
                <button key={s._id} onClick={() => selectSale(s)} className="w-full flex justify-between px-3 py-2.5 rounded-lg hover:bg-gold-50 text-sm text-left border" style={{ borderColor: 'var(--border-subtle)' }}>
                  <span className="font-mono text-xs">{s.invoiceNumber}</span>
                  <span>{s.customer?.name || 'Walk-in'}</span>
                  <span>{formatCurrency(s.grandTotal)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <form id="sr-form" onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm">Returning against <strong>{selectedSale.invoiceNumber}</strong></p>
            <table className="w-full text-sm">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Item</th><th className="text-right">Sold Qty</th><th className="text-right">Return Qty</th><th className="text-right">Restock?</th></tr></thead>
              <tbody>
                {selectedSale.items.map((it) => {
                  const pid = it.product._id || it.product;
                  return (
                    <tr key={pid} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-1.5">{it.productName}</td>
                      <td className="text-right">{it.quantity}</td>
                      <td className="text-right">
                        <input type="number" min={0} max={it.quantity} value={returnQty[pid] || ''}
                          onChange={(e) => setReturnQty((s) => ({ ...s, [pid]: e.target.value }))}
                          className="w-16 rounded border px-1.5 py-1 text-xs text-right" style={{ borderColor: 'var(--border-subtle)' }} />
                      </td>
                      <td className="text-right">
                        <select value={restockStatus[pid] || 'restocked'} onChange={(e) => setRestockStatus((s) => ({ ...s, [pid]: e.target.value }))}
                          className="rounded border px-1.5 py-1 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                          <option value="restocked">Restock</option>
                          <option value="damaged">Damaged</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Select label="Refund Method" value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="store_credit">Store Credit</option>
            </Select>
          </form>
        )}
      </Modal>
    </div>
  );
}

export default SalesReturns;
