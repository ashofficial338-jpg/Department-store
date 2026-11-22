import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, StatusBadge, Modal } from '../../components/ui/index.js';
import { FilterPanel, cleanParams } from '../../components/ui/FilterPanel.jsx';
import SalePaymentPanel from '../../components/sales/SalePaymentPanel.jsx';
import { salesService, customerService, productService, brandService } from '../../services/index.js';
import { formatCurrency, formatDateTime } from '../../utils/format.js';

// Sales register: every bill with what was received and what is still due. All filters combine.
const EMPTY = {
  search: '', from: '', to: '', customer: '', product: '', brand: '', method: '', paymentStatus: '', saleType: '', status: '',
  minQty: '', maxQty: '', minRate: '', maxRate: '', minAmount: '', maxAmount: '', sort: 'date', order: 'desc',
};
const opt = (pairs) => pairs.map(([value, label]) => ({ value, label }));

export function SalesHistory() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [searchParams] = useSearchParams();
  // Opened from a Dashboard tile (e.g. ?saleType=credit): start with that filter.
  const [filters, setFilters] = useState(() => ({ ...EMPTY, ...Object.fromEntries([...searchParams].filter(([k]) => k in EMPTY)) }));
  const [lists, setLists] = useState({ customers: [], products: [], brands: [] });
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    Promise.all([
      customerService.list({ limit: 200 }).catch(() => ({ data: [] })),
      productService.names().catch(() => ({ data: [] })),
      brandService.listAll().catch(() => ({ data: [] })),
    ]).then(([c, p, b]) => setLists({ customers: c.data, products: p.data, brands: b.data }));
  }, []);

  const params = useMemo(() => cleanParams({ ...filters, page, limit: 25 }), [filters, page]);
  function load() {
    setLoading(true);
    salesService.list(params)
      .then((r) => { setRows(r.data); setPagination(r.pagination); setSummary(r.summary); })
      .catch((err) => toast.error(err.message)).finally(() => setLoading(false));
  }
  useEffect(() => { const t = setTimeout(load, filters.search ? 300 : 0); return () => clearTimeout(t); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFilter = (v) => { setFilters(v); setPage(1); };
  const list = (xs) => xs.map((x) => ({ value: x._id, label: x.phone ? `${x.name} (${x.phone})` : x.name }));

  async function openDetail(row) {
    try { setDetail((await salesService.getOne(row._id)).data); } catch (err) { toast.error(err.message); }
  }

  return (
    <div>
      <PageHeader title="Sales History" crumbs={[{ label: 'Sales' }, { label: 'History' }]} />
      <FilterPanel value={filters} onChange={setFilter} onReset={() => setFilter(EMPTY)} primary={4}
        searchPlaceholder="Search invoice #, customer name / mobile or product..."
        sortOptions={[{ value: 'date', label: 'Date' }, { value: 'total', label: 'Total' }, { value: 'due', label: 'Balance due' }, { value: 'invoiceNumber', label: 'Invoice #' }]}
        fields={[
          { label: 'Sale date', type: 'dateRange', minKey: 'from', maxKey: 'to' },
          { key: 'customer', label: 'Customer', type: 'select', options: list(lists.customers) },
          { key: 'paymentStatus', label: 'Payment status', type: 'select', options: opt([['paid', 'Paid'], ['partial', 'Partly paid'], ['unpaid', 'Unpaid (full credit)']]) },
          { key: 'product', label: 'Product', type: 'select', options: list(lists.products) },
          { key: 'brand', label: 'Brand', type: 'select', options: list(lists.brands) },
          { key: 'method', label: 'Payment method', type: 'select', options: opt([['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['bank_transfer', 'Bank'], ['credit', 'Credit']]) },
          { key: 'saleType', label: 'Sale type', type: 'select', options: opt([['cash', 'Cash sale'], ['credit', 'Credit sale']]) },
          { key: 'status', label: 'Status', type: 'select', options: opt([['completed', 'Completed'], ['partially_returned', 'Partly returned'], ['returned', 'Returned'], ['cancelled', 'Cancelled']]), placeholder: 'All (not held)' },
          { label: 'Quantity (any line)', type: 'range', minKey: 'minQty', maxKey: 'maxQty' },
          { label: 'Rate (any line)', type: 'range', minKey: 'minRate', maxKey: 'maxRate' },
          { label: 'Bill total', type: 'range', minKey: 'minAmount', maxKey: 'maxAmount' },
        ]} />

      {summary && (
        <div className="flex flex-wrap gap-5 text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          <span>{pagination?.total ?? 0} bill(s)</span>
          <span>Total sales: <strong>{formatCurrency(summary.total)}</strong></span>
          <span>Cash sales: <strong>{formatCurrency(summary.cash)}</strong></span>
          <span>Credit sales: <strong>{formatCurrency(summary.credit)}</strong></span>
          <span>Received: <strong>{formatCurrency(summary.received)}</strong></span>
          <span className="text-rose-600">Due: <strong>{formatCurrency(summary.due)}</strong></span>
        </div>
      )}

      <DataTable
        loading={loading}
        rows={rows}
        onRowClick={openDetail}
        emptyTitle="No sales match these filters."
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'invoiceNumber', header: 'Invoice #', render: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
          { key: 'createdAt', header: 'Date & Time', render: (r) => formatDateTime(r.createdAt) },
          { key: 'customer', header: 'Customer', render: (r) => r.customer?.name || 'Walk-in' },
          { key: 'items', header: 'Items', render: (r) => r.items?.length },
          { key: 'grandTotal', header: 'Total', render: (r) => formatCurrency(r.grandTotal) },
          { key: 'amountPaid', header: 'Received', render: (r) => formatCurrency(r.amountPaid || 0) },
          { key: 'amountDue', header: 'Due', render: (r) => (r.amountDue > 0 ? <span className="text-rose-600 font-medium">{formatCurrency(r.amountDue)}</span> : '-') },
          { key: 'pay', header: 'Payment', render: (r) => <StatusBadge status={r.amountDue > 0 ? (r.amountPaid > 0 ? 'partial' : 'unpaid') : 'paid'} /> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'cashier', header: 'Cashier', render: (r) => <span className="text-xs">{r.cashier?.name}</span> },
        ]}
      />

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.invoiceNumber} size="lg">
        {detail && (
          <div className="space-y-4">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>Customer: <strong>{detail.customer?.name || 'Walk-in'}</strong>{detail.customer?.phone ? ` (${detail.customer.phone})` : ''} &middot; {formatDateTime(detail.createdAt)}</span>
              <StatusBadge status={detail.status} />
            </div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {detail.items.map((it, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-1.5">{it.productName}{it.brandName ? <span style={{ color: 'var(--text-muted)' }}> - {it.brandName}</span> : null}</td>
                    <td className="text-right">{it.quantity} {it.unit || ''}</td>
                    <td className="text-right">{formatCurrency(it.unitPrice)}</td>
                    <td className="text-right">{formatCurrency(it.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end gap-5 text-sm">
              <span>Taxable: <strong>{formatCurrency(detail.taxableAmount ?? detail.subtotal)}</strong></span>
              <span>GST: <strong>{formatCurrency(detail.taxAmount || 0)}</strong></span>
              <span>Total: <strong>{formatCurrency(detail.grandTotal)}</strong></span>
            </div>
            <div className="pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <SalePaymentPanel sale={detail} onChange={(s) => { setDetail({ ...detail, ...s, customer: detail.customer }); load(); }} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default SalesHistory;
