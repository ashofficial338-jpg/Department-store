import { useEffect, useState } from 'react';
import { PageHeader, DataTable, StatusBadge } from '../../components/ui/index.js';
import { dcService } from '../../services/index.js';
import { formatDateTime } from '../../utils/format.js';

export function DCHistory() {
  const [inward, setInward] = useState([]);
  const [outward, setOutward] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('inward');

  useEffect(() => {
    Promise.all([dcService.listInward({ limit: 50 }), dcService.listOutward({ limit: 50 })])
      .then(([i, o]) => { setInward(i.data); setOutward(o.data); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="DC History" crumbs={[{ label: 'DC Management' }, { label: 'DC History' }]} />
      <div className="flex gap-2 mb-4">
        {['inward', 'outward'].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-full text-xs font-medium capitalize ${tab === t ? 'bg-graphite-900 text-white' : 'border'}`} style={tab === t ? {} : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
            {t} DC
          </button>
        ))}
      </div>

      {tab === 'inward' ? (
        <DataTable
          loading={loading} rows={inward} emptyTitle="No inward DC history."
          columns={[
            { key: 'docNumber', header: 'Doc #', render: (r) => <span className="font-mono text-xs">{r.docNumber}</span> },
            { key: 'distributionCenter', header: 'DC', render: (r) => r.distributionCenter?.name },
            { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name || '-' },
            { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      ) : (
        <DataTable
          loading={loading} rows={outward} emptyTitle="No outward DC history."
          columns={[
            { key: 'docNumber', header: 'Doc #', render: (r) => <span className="font-mono text-xs">{r.docNumber}</span> },
            { key: 'sourceDC', header: 'From DC', render: (r) => r.sourceDC?.name },
            { key: 'destinationType', header: 'To', render: (r) => r.destinationType },
            { key: 'createdAt', header: 'Date', render: (r) => formatDateTime(r.createdAt) },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      )}
    </div>
  );
}

export default DCHistory;
