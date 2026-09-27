import { useEffect, useState } from 'react';
import { PageHeader, DataTable, EmptyState } from '../../components/ui/index.js';
import { CheckCircle2 } from 'lucide-react';
import { inventoryService } from '../../services/index.js';

export function LowStock() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { inventoryService.lowStock().then((r) => setRows(r.data)).finally(() => setLoading(false)); }, []);

  return (
    <div>
      <PageHeader title="Low Stock" crumbs={[{ label: 'Inventory' }, { label: 'Low Stock' }]} />
      {!loading && rows.length === 0 ? (
        <div className="surface-card rounded-xl2 shadow-premium">
          <EmptyState icon={CheckCircle2} title="All stock levels are healthy" description="No products are currently at or below their reorder level." />
        </div>
      ) : (
        <DataTable
          loading={loading}
          rows={rows}
          emptyTitle="No low stock items."
          columns={[
            { key: 'product', header: 'Product', render: (r) => <div><div className="font-medium">{r.product?.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.product?.sku}</div></div> },
            { key: 'store', header: 'Store', render: (r) => r.store?.name || '-' },
            { key: 'currentStock', header: 'Current Stock', render: (r) => <span className="text-rose-600 font-semibold">{r.currentStock}</span> },
            { key: 'reorderLevel', header: 'Reorder Level', render: (r) => r.product?.reorderLevel },
            { key: 'shortfall', header: 'Shortfall', render: (r) => Math.max(0, (r.product?.reorderLevel || 0) - r.currentStock) },
          ]}
        />
      )}
    </div>
  );
}

export default LowStock;
