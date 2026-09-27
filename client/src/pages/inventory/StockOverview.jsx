import { useEffect, useState } from 'react';
import { PageHeader, DataTable, SearchBox } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { inventoryService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatCurrency } from '../../utils/format.js';

export function StockOverview() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [store, setStore] = useState('');
  const [locations, setLocations] = useState({ stores: [], distributionCenters: [] });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const debounced = useDebounce(search);

  useEffect(() => { inventoryService.locations().then((r) => setLocations(r.data)); }, []);

  useEffect(() => {
    setLoading(true);
    inventoryService.overview({ search: debounced || undefined, store: store || undefined, page, limit: 20 })
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .finally(() => setLoading(false));
  }, [debounced, store, page]);

  return (
    <div>
      <PageHeader title="Stock Overview" crumbs={[{ label: 'Inventory' }, { label: 'Stock Overview' }]} />
      <FilterBar>
        <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search product..." className="w-72" />
        <FilterSelect value={store} onChange={(v) => { setStore(v); setPage(1); }} placeholder="All Stores" options={locations.stores.map((s) => ({ value: s._id, label: s.name }))} />
      </FilterBar>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No inventory records found."
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'product', header: 'Product', render: (r) => <div><div className="font-medium">{r.product?.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.product?.sku}</div></div> },
          { key: 'location', header: 'Location', render: (r) => r.store?.name || r.distributionCenter?.name || '-' },
          { key: 'currentStock', header: 'Current Stock', render: (r) => <span className={r.currentStock <= (r.product?.reorderLevel || 0) ? 'text-rose-600 font-semibold' : 'font-medium'}>{r.currentStock}</span> },
          { key: 'reservedStock', header: 'Reserved' },
          { key: 'damagedStock', header: 'Damaged' },
          { key: 'availableStock', header: 'Available' },
          { key: 'value', header: 'Stock Value', render: (r) => formatCurrency((r.currentStock || 0) * (r.product?.purchasePrice || 0)) },
        ]}
      />
    </div>
  );
}

export default StockOverview;
