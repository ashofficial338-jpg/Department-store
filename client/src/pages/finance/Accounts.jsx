import { useEffect, useState } from 'react';
import { PageHeader, DataTable, Modal, StatusBadge } from '../../components/ui/index.js';
import { accountService } from '../../services/index.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

export function Accounts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ledger, setLedger] = useState(null);

  useEffect(() => { accountService.listAll().then((r) => setRows(r.data)).finally(() => setLoading(false)); }, []);

  async function openLedger(row) {
    const res = await accountService.ledger(row._id, { limit: 30 });
    setLedger(res);
  }

  return (
    <div>
      <PageHeader title="Chart of Accounts" crumbs={[{ label: 'Finance' }, { label: 'Accounts' }]} />
      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No accounts configured."
        onRowClick={openLedger}
        columns={[
          { key: 'name', header: 'Account', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'type', header: 'Type', render: (r) => <span className="capitalize">{r.type}</span> },
          { key: 'accountGroup', header: 'Group', render: (r) => <span className="capitalize">{r.accountGroup}</span> },
          { key: 'currentBalance', header: 'Balance', render: (r) => formatCurrency(r.currentBalance) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />

      <Modal open={!!ledger} onClose={() => setLedger(null)} title={ledger?.account?.name} size="lg">
        {ledger && (
          <table className="w-full text-sm">
            <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Date</th><th className="text-left">Narration</th><th className="text-right">Debit</th><th className="text-right">Credit</th></tr></thead>
            <tbody>
              {ledger.data.map((e) => (
                <tr key={e._id} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="py-1.5">{formatDate(e.entryDate)}</td>
                  <td>{e.narration}</td>
                  <td className="text-right text-emerald-600">{e.entryType === 'debit' ? formatCurrency(e.amount) : ''}</td>
                  <td className="text-right text-rose-600">{e.entryType === 'credit' ? formatCurrency(e.amount) : ''}</td>
                </tr>
              ))}
              {ledger.data.length === 0 && <tr><td colSpan={4} className="text-center py-6" style={{ color: 'var(--text-muted)' }}>No entries yet.</td></tr>}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}

export default Accounts;
