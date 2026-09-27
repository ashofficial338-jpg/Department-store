import { useEffect, useState } from 'react';
import { PageHeader, DataTable, SearchBox, StatusBadge } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { batchService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

function expiryStatus(date) {
  if (!date) return null;
  const days = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: 'Expired', variant: 'danger' };
  if (days <= 30) return { label: `${days}d left`, variant: 'warning' };
  return null;
}

export function Batches() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const debounced = useDebounce(search);

  useEffect(() => {
    setLoading(true);
    batchService.list({ search: debounced || undefined, status: status || undefined, page, limit: 20 })
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .finally(() => setLoading(false));
  }, [debounced, status, page]);

  return (
    <div>
      <PageHeader title="Batch Management" crumbs={[{ label: 'Products', to: '/products' }, { label: 'Batches' }]} />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search batch number..." className="w-72" />
        <FilterSelect value={status} onChange={(v) => { setStatus(v); setPage(1); }} placeholder="All Statuses" options={[{ value: 'active', label: 'Active' }, { value: 'expired', label: 'Expired' }, { value: 'exhausted', label: 'Exhausted' }]} />
      </FilterBar>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No batches found."
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'batchNumber', header: 'Batch #', render: (r) => <span className="font-mono text-xs">{r.batchNumber}</span> },
          { key: 'product', header: 'Product', render: (r) => r.product?.name },
          { key: 'supplier', header: 'Supplier', render: (r) => r.supplier?.name || '-' },
          { key: 'store', header: 'Location', render: (r) => r.store?.name || '-' },
          { key: 'availableQuantity', header: 'Available Qty' },
          { key: 'purchasePrice', header: 'Purchase Price', render: (r) => formatCurrency(r.purchasePrice) },
          {
            key: 'expiryDate', header: 'Expiry', render: (r) => (
              <div className="flex items-center gap-2">
                <span>{formatDate(r.expiryDate)}</span>
                {expiryStatus(r.expiryDate) && <StatusBadge status="" variant={expiryStatus(r.expiryDate).variant} label={expiryStatus(r.expiryDate).label} />}
              </div>
            ),
          },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
    </div>
  );
}

export default Batches;
