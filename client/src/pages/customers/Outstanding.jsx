import { useEffect, useState } from 'react';
import { PageHeader, DataTable, EmptyState } from '../../components/ui/index.js';
import { CheckCircle2 } from 'lucide-react';
import { customerService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';

export function Outstanding() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { customerService.outstanding().then((r) => setRows(r.data)).finally(() => setLoading(false)); }, []);

  const total = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div>
      <PageHeader title="Outstanding Payments" crumbs={[{ label: 'Customers', to: '/customers' }, { label: 'Outstanding Payments' }]} />
      {!loading && rows.length === 0 ? (
        <div className="surface-card rounded-xl2 shadow-premium">
          <EmptyState icon={CheckCircle2} title="No outstanding payments" description="All customer accounts are settled." />
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>Total outstanding: <strong className="text-rose-600">{formatCurrency(total)}</strong></div>
          <DataTable
            loading={loading}
            rows={rows}
            emptyTitle="No outstanding payments."
            columns={[
              { key: 'name', header: 'Customer', render: (r) => <span className="font-medium">{r.name}</span> },
              { key: 'phone', header: 'Phone' },
              { key: 'outstanding', header: 'Outstanding', render: (r) => <span className="text-rose-600 font-semibold">{formatCurrency(r.outstanding)}</span> },
            ]}
          />
        </>
      )}
    </div>
  );
}

export default Outstanding;
