import { useEffect, useState } from 'react';
import { PageHeader, DataTable, StatusBadge } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { inventoryService } from '../../services/index.js';
import { formatDate, formatCurrency } from '../../utils/format.js';

const DAY_OPTIONS = [{ value: '30', label: 'Next 30 days' }, { value: '60', label: 'Next 60 days' }, { value: '90', label: 'Next 90 days' }, { value: '365', label: 'Next 1 year' }];

export function ExpiryManagement() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('60');

  useEffect(() => {
    setLoading(true);
    inventoryService.expiry({ days }).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }, [days]);

  function urgency(date) {
    const d = Math.ceil((new Date(date) - new Date()) / (1000 * 60 * 60 * 24));
    if (d < 0) return { status: 'expired', variant: 'danger' };
    if (d <= 15) return { status: 'critical', variant: 'danger' };
    if (d <= 30) return { status: 'warning', variant: 'warning' };
    return { status: 'ok', variant: 'info' };
  }

  return (
    <div>
      <PageHeader title="Expiry Management" crumbs={[{ label: 'Inventory' }, { label: 'Expiry Management' }]} />
      <FilterBar><FilterSelect value={days} onChange={setDays} options={DAY_OPTIONS} /></FilterBar>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No batches expiring in this window."
        columns={[
          { key: 'batchNumber', header: 'Batch #', render: (r) => <span className="font-mono text-xs">{r.batchNumber}</span> },
          { key: 'product', header: 'Product', render: (r) => r.product?.name },
          { key: 'store', header: 'Store', render: (r) => r.store?.name || '-' },
          { key: 'availableQuantity', header: 'Qty Remaining' },
          { key: 'value', header: 'Stock Value', render: (r) => formatCurrency(r.availableQuantity * r.purchasePrice) },
          { key: 'expiryDate', header: 'Expiry Date', render: (r) => formatDate(r.expiryDate) },
          { key: 'urgency', header: 'Status', render: (r) => { const u = urgency(r.expiryDate); return <StatusBadge status="" variant={u.variant} label={u.status} />; } },
        ]}
      />
    </div>
  );
}

export default ExpiryManagement;
