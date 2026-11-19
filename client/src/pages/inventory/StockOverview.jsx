import { useEffect, useState } from 'react';
import { PageHeader, DataTable, SearchBox } from '../../components/ui/index.js';
import { FilterBar } from '../../components/ui/FilterBar.jsx';
import { inventoryService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatCurrency, formatDateTime } from '../../utils/format.js';

const TABS = [
  { key: 'stock', label: 'Stock' },
  { key: 'in', label: 'Inward Movements' },
  { key: 'out', label: 'Outward Movements' },
];

const TYPE_LABEL = {
  inward_dc: 'Inward DC', outward_dc: 'Outward DC', purchase_receipt: 'Purchase Receipt', purchase_return: 'Purchase Return',
  sale: 'Sale', sale_return: 'Sales Return', stock_adjustment: 'Stock Adjustment', opening_stock: 'Opening Stock',
  damage: 'Damage', expiry_writeoff: 'Expiry Write-off', stock_transfer_in: 'Transfer In', stock_transfer_out: 'Transfer Out',
};

export function StockOverview() {
  const [tab, setTab] = useState('stock');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const debounced = useDebounce(search);

  useEffect(() => {
    setLoading(true);
    const params = { search: debounced || undefined, page, limit: 20 };
    const req = tab === 'stock' ? inventoryService.overview(params) : inventoryService.ledger({ ...params, direction: tab });
    req.then((r) => { setRows(r.data); setPagination(r.pagination); }).finally(() => setLoading(false));
  }, [debounced, page, tab]);

  const stockColumns = [
    { key: 'product', header: 'Product', render: (r) => <div><div className="font-medium">{r.product?.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.product?.sku}</div></div> },
    { key: 'totalInward', header: 'Total Inward', render: (r) => <span className="text-emerald-700">{r.totalInward ?? 0}</span> },
    { key: 'totalOutward', header: 'Total Outward', render: (r) => <span className="text-rose-600">{r.totalOutward ?? 0}</span> },
    { key: 'currentStock', header: 'Current Stock', render: (r) => <span className={r.currentStock <= (r.product?.reorderLevel || 0) ? 'text-rose-600 font-semibold' : 'font-medium'}>{r.currentStock}</span> },
    { key: 'reservedStock', header: 'Reserved' },
    { key: 'damagedStock', header: 'Damaged' },
    { key: 'availableStock', header: 'Available' },
    { key: 'value', header: 'Stock Value', render: (r) => formatCurrency((r.currentStock || 0) * (r.product?.purchasePrice || 0)) },
  ];

  const movementColumns = [
    { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
    { key: 'product', header: 'Item', render: (r) => <div><div className="font-medium">{r.product?.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.product?.sku}</div></div> },
    { key: 'quantity', header: 'Quantity', render: (r) => <span className={r.quantity > 0 ? 'text-emerald-700 font-medium' : 'text-rose-600 font-medium'}>{Math.abs(r.quantity)}</span> },
    { key: 'type', header: 'Transaction Type', render: (r) => TYPE_LABEL[r.type] || r.type },
    { key: 'referenceNumber', header: 'Reference #', render: (r) => <span className="font-mono text-xs">{r.referenceNumber || '-'}</span> },
    { key: 'notes', header: 'Against', render: (r) => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.notes || '-'}</span> },
  ];

  return (
    <div>
      <PageHeader title="Stock Overview" crumbs={[{ label: 'Inventory' }, { label: 'Stock Overview' }]} />
      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setPage(1); setRows([]); }} className={`px-4 py-1.5 rounded-full text-xs font-medium ${tab === t.key ? 'bg-graphite-900 text-white' : 'border'}`} style={tab === t.key ? {} : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
            {t.label}
          </button>
        ))}
      </div>
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={tab === 'stock' ? 'Search product...' : 'Search product or reference #...'} className="w-72" />
      </FilterBar>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle={tab === 'stock' ? 'No inventory records found.' : `No ${tab === 'in' ? 'inward' : 'outward'} stock movements yet.`}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={tab === 'stock' ? stockColumns : movementColumns}
      />
    </div>
  );
}

export default StockOverview;
