import { useEffect, useState } from 'react';
import { PageHeader, DataTable } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { inventoryService } from '../../services/index.js';
import { formatDateTime } from '../../utils/format.js';

const TYPES = [
  'purchase_receipt', 'sale', 'sale_return', 'purchase_return', 'stock_adjustment',
  'stock_transfer_out', 'stock_transfer_in', 'inward_dc', 'outward_dc', 'opening_stock', 'damage', 'expiry_writeoff',
];

export function StockLedger() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    setLoading(true);
    inventoryService.ledger({ type: type || undefined, page, limit: 25 })
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .finally(() => setLoading(false));
  }, [type, page]);

  return (
    <div>
      <PageHeader title="Stock Ledger" crumbs={[{ label: 'Inventory' }, { label: 'Stock Ledger' }]} />
      <FilterBar>
        <FilterSelect value={type} onChange={(v) => { setType(v); setPage(1); }} placeholder="All Transaction Types" options={TYPES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))} />
      </FilterBar>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No stock movements found."
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
          { key: 'product', header: 'Product', render: (r) => r.product?.name },
          { key: 'batch', header: 'Batch', render: (r) => r.batch?.batchNumber || '-' },
          { key: 'type', header: 'Type', render: (r) => <span className="capitalize text-xs px-2 py-1 rounded bg-graphite-100">{r.type.replace(/_/g, ' ')}</span> },
          { key: 'quantity', header: 'Qty', render: (r) => <span className={r.quantity < 0 ? 'text-rose-600' : 'text-emerald-600'}>{r.quantity > 0 ? '+' : ''}{r.quantity}</span> },
          { key: 'referenceNumber', header: 'Reference', render: (r) => r.referenceNumber || '-' },
          { key: 'user', header: 'User', render: (r) => r.user?.name || 'System' },
        ]}
      />
    </div>
  );
}

export default StockLedger;
