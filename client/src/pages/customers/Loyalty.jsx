import { useEffect, useState } from 'react';
import { PageHeader, DataTable, StatusBadge } from '../../components/ui/index.js';
import { customerService } from '../../services/index.js';

const TIER_STYLE = { bronze: 'neutral', silver: 'info', gold: 'gold', platinum: 'success' };

export function Loyalty() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    customerService.list({ limit: 100 }).then((r) => setRows([...r.data].sort((a, b) => b.loyaltyPoints - a.loyaltyPoints))).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Customer Loyalty" crumbs={[{ label: 'Customers', to: '/customers' }, { label: 'Loyalty' }]} />
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No customers found."
        columns={[
          { key: 'name', header: 'Customer', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'phone', header: 'Phone' },
          { key: 'loyaltyPoints', header: 'Points', render: (r) => <span className="font-display font-semibold text-gold-700">{r.loyaltyPoints}</span> },
          { key: 'loyaltyTier', header: 'Tier', render: (r) => <StatusBadge status="" variant={TIER_STYLE[r.loyaltyTier]} label={r.loyaltyTier} /> },
        ]}
      />
    </div>
  );
}

export default Loyalty;
