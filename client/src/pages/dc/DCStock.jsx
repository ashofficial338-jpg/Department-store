import { useEffect, useState } from 'react';
import { PageHeader, DataTable } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { dcService, inventoryService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';

export function DCStock() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dcs, setDcs] = useState([]);
  const [selected, setSelected] = useState('');

  useEffect(() => { inventoryService.locations().then((r) => setDcs(r.data.distributionCenters)); }, []);

  useEffect(() => {
    setLoading(true);
    dcService.stock(selected || undefined).then((r) => setRows(r.data)).finally(() => setLoading(false));
  }, [selected]);

  return (
    <div>
      <PageHeader title="DC-wise Stock" crumbs={[{ label: 'DC Management' }, { label: 'DC-wise Stock' }]} />
      <FilterBar>
        <FilterSelect value={selected} onChange={setSelected} placeholder="All Distribution Centers" options={dcs.map((d) => ({ value: d._id, label: d.name }))} />
      </FilterBar>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No stock recorded at any distribution center yet."
        columns={[
          { key: 'product', header: 'Product', render: (r) => <div><div className="font-medium">{r.product?.name}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.product?.sku}</div></div> },
          { key: 'distributionCenter', header: 'DC', render: (r) => r.distributionCenter?.name },
          { key: 'currentStock', header: 'Current Stock' },
          { key: 'inTransitStock', header: 'In Transit' },
          { key: 'value', header: 'Stock Value', render: (r) => formatCurrency((r.currentStock || 0) * (r.product?.sellingPrice || 0)) },
        ]}
      />
    </div>
  );
}

export default DCStock;
