import { useEffect, useState } from 'react';
import { PageHeader, DataTable, StatusBadge } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { salesService } from '../../services/index.js';
import { formatCurrency, formatDateTime } from '../../utils/format.js';

const RANGE_OPTIONS = [{ value: '', label: 'All Time' }, { value: 'today', label: 'Today' }, { value: 'this_week', label: 'This Week' }, { value: 'this_month', label: 'This Month' }];

export function SalesHistory() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    setLoading(true);
    salesService.list({ page, limit: 25, status: status || undefined })
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .finally(() => setLoading(false));
  }, [page, status]);

  return (
    <div>
      <PageHeader title="Sales History" crumbs={[{ label: 'Sales' }, { label: 'History' }]} />
      <FilterBar>
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Statuses" options={[{ value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'returned', label: 'Returned' }, { value: 'partially_returned', label: 'Partially Returned' }]} />
      </FilterBar>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No sales history found."
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'invoiceNumber', header: 'Invoice #', render: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
          { key: 'createdAt', header: 'Date & Time', render: (r) => formatDateTime(r.createdAt) },
          { key: 'customer', header: 'Customer', render: (r) => r.customer?.name || 'Walk-in' },
          { key: 'cashier', header: 'Cashier', render: (r) => r.cashier?.name },
          { key: 'items', header: 'Items', render: (r) => r.items?.length },
          { key: 'grandTotal', header: 'Total', render: (r) => formatCurrency(r.grandTotal) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
    </div>
  );
}

export default SalesHistory;
