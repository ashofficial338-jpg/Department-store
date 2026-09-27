import { useEffect, useState } from 'react';
import { PageHeader, DataTable, SearchBox } from '../components/ui/index.js';
import { auditLogService } from '../services/index.js';
import { formatDateTime } from '../utils/format.js';
import { useDebounce } from '../hooks/useDebounce.js';

export function AuditLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [action, setAction] = useState('');
  const debounced = useDebounce(action);

  useEffect(() => {
    setLoading(true);
    auditLogService.list({ page, limit: 25, action: debounced || undefined })
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .finally(() => setLoading(false));
  }, [page, debounced]);

  return (
    <div>
      <PageHeader title="Audit Log" />
      <div className="mb-4"><SearchBox value={action} onChange={(v) => { setAction(v); setPage(1); }} placeholder="Filter by action (e.g. product.create, sale.cancel)..." className="max-w-md" /></div>
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No audit records found."
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'createdAt', header: 'Timestamp', render: (r) => formatDateTime(r.createdAt) },
          { key: 'user', header: 'User', render: (r) => r.user?.name || r.userName || 'System' },
          { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs px-2 py-1 rounded bg-graphite-100">{r.action}</span> },
          { key: 'entity', header: 'Entity' },
          { key: 'ip', header: 'IP Address', render: (r) => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.ip || '-'}</span> },
        ]}
      />
    </div>
  );
}

export default AuditLog;
