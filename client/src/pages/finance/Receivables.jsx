import { useEffect, useState } from 'react';
import { PageHeader, DataTable } from '../../components/ui/index.js';
import { reportService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';

export function Receivables() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { reportService.outstanding().then((r) => setRows(r.data.receivables)).finally(() => setLoading(false)); }, []);

  const total = rows.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div>
      <PageHeader title="Accounts Receivable" crumbs={[{ label: 'Finance' }, { label: 'Receivables' }]} />
      <div className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>Total receivable: <strong className="text-rose-600">{formatCurrency(total)}</strong></div>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No outstanding receivables."
        columns={[
          { key: 'name', header: 'Customer', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'phone', header: 'Phone' },
          { key: 'outstanding', header: 'Amount Due', render: (r) => <span className="text-rose-600 font-semibold">{formatCurrency(r.outstanding)}</span> },
        ]}
      />
    </div>
  );
}

export default Receivables;
