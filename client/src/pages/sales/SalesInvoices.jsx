import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, StatusBadge, SearchBox, Modal, Button, ConfirmDialog } from '../../components/ui/index.js';
import { salesService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatCurrency, formatDateTime } from '../../utils/format.js';

export function SalesInvoices() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [detail, setDetail] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const debounced = useDebounce(search);

  function load() {
    setLoading(true);
    salesService.list({ search: debounced || undefined, page, limit: 20 })
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .finally(() => setLoading(false));
  }
  useEffect(load, [debounced, page]); // eslint-disable-line

  async function openDetail(row) {
    const res = await salesService.getOne(row._id);
    setDetail(res.data);
  }

  async function handleCancel() {
    try { await salesService.cancel(cancelTarget._id); toast.success('Invoice cancelled.'); setCancelTarget(null); setDetail(null); load(); }
    catch (err) { toast.error(err.message); }
  }

  return (
    <div>
      <PageHeader title="Sales Invoices" crumbs={[{ label: 'Sales' }, { label: 'Invoices' }]} />
      <div className="mb-4"><SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search invoice number..." className="w-72" /></div>

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No invoices found."
        onRowClick={openDetail}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'invoiceNumber', header: 'Invoice #', render: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
          { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
          { key: 'customer', header: 'Customer', render: (r) => r.customer?.name || 'Walk-in' },
          { key: 'cashier', header: 'Cashier', render: (r) => r.cashier?.name },
          { key: 'grandTotal', header: 'Total', render: (r) => formatCurrency(r.grandTotal) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.invoiceNumber} size="lg"
        footer={detail?.status === 'completed' && <Button variant="danger" size="sm" onClick={() => setCancelTarget(detail)}>Cancel Invoice</Button>}
      >
        {detail && (
          <div>
            <div className="flex justify-between text-sm mb-4">
              <span>Customer: <strong>{detail.customer?.name || 'Walk-in'}</strong></span>
              <StatusBadge status={detail.status} />
            </div>
            <table className="w-full text-sm mb-4">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
              <tbody>
                {detail.items.map((it, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-1.5">{it.productName}</td>
                    <td className="text-right">{it.quantity}</td>
                    <td className="text-right">{formatCurrency(it.unitPrice)}</td>
                    <td className="text-right">{formatCurrency(it.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-1 text-sm max-w-xs ml-auto">
              <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>Subtotal</span><span>{formatCurrency(detail.subtotal)}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>CGST</span><span>{formatCurrency(detail.cgst)}</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>SGST</span><span>{formatCurrency(detail.sgst)}</span></div>
              <div className="flex justify-between font-semibold pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}><span>Grand Total</span><span>{formatCurrency(detail.grandTotal)}</span></div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog open={!!cancelTarget} onClose={() => setCancelTarget(null)} onConfirm={handleCancel} title="Cancel Invoice?" description="Stock will be restored for all items on this invoice." confirmLabel="Cancel Invoice" />
    </div>
  );
}

export default SalesInvoices;
