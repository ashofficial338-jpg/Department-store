import { useEffect, useState } from 'react';
import { PageHeader, ChartCard } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { accountService, reportService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';

const RANGE_OPTIONS = [{ value: 'this_month', label: 'This Month' }, { value: 'this_week', label: 'This Week' }, { value: 'this_year', label: 'This Year' }];

export function CashBank() {
  const [accounts, setAccounts] = useState([]);
  const [movement, setMovement] = useState([]);
  const [range, setRange] = useState('this_month');

  useEffect(() => { accountService.listAll().then((r) => setAccounts(r.data.filter((a) => a.accountGroup === 'cash' || a.accountGroup === 'bank'))); }, []);
  useEffect(() => { reportService.cashBank({ range }).then((r) => setMovement(r.data)); }, [range]);

  return (
    <div>
      <PageHeader title="Cash &amp; Bank" crumbs={[{ label: 'Finance' }, { label: 'Cash & Bank' }]} actions={<FilterSelect value={range} onChange={setRange} options={RANGE_OPTIONS} />} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {accounts.map((a) => (
          <div key={a._id} className="surface-card rounded-xl2 shadow-premium p-5">
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{a.name}</div>
            <div className="text-2xl font-display font-semibold">{formatCurrency(a.currentBalance)}</div>
          </div>
        ))}
      </div>

      <ChartCard title="Movement by Method" height={160}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 h-full items-center">
          {movement.map((m, i) => (
            <div key={i} className="rounded-xl p-4" style={{ background: 'var(--bg-surface-muted)' }}>
              <div className="text-xs capitalize mb-1" style={{ color: 'var(--text-muted)' }}>{m._id.method} &middot; {m._id.direction}</div>
              <div className="font-semibold">{formatCurrency(m.total)}</div>
            </div>
          ))}
          {movement.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No transactions recorded for this period.</p>}
        </div>
      </ChartCard>
    </div>
  );
}

export default CashBank;
