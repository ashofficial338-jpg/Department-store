import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { reportService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }, { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' }, { value: 'previous_month', label: 'Previous Month' },
  { value: 'this_year', label: 'This Year' }, { value: 'previous_year', label: 'Previous Year' },
];

function Row({ label, value, bold, indent, negative }) {
  return (
    <div className={`flex justify-between py-2 ${bold ? 'font-semibold' : ''} ${indent ? 'pl-4' : ''}`} style={{ borderBottom: bold ? '2px solid var(--border-subtle)' : '1px solid var(--border-subtle)' }}>
      <span style={{ color: bold ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
      <span className={negative ? 'text-rose-600' : ''}>{negative ? '-' : ''}{formatCurrency(Math.abs(value))}</span>
    </div>
  );
}

export function ProfitLoss() {
  const [data, setData] = useState(null);
  const [range, setRange] = useState('this_month');

  useEffect(() => { reportService.profitLoss({ range }).then((r) => setData(r.data)); }, [range]);

  return (
    <div>
      <PageHeader title="Profit &amp; Loss" crumbs={[{ label: 'Finance' }, { label: 'Profit & Loss' }]} actions={<FilterSelect value={range} onChange={setRange} options={RANGE_OPTIONS} />} />

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="surface-card rounded-xl2 shadow-premium p-6">
            <h3 className="font-display text-base font-semibold mb-3">Revenue</h3>
            <Row label="Gross Sales" value={data.revenue.grossSales} indent />
            <Row label="Discounts" value={data.revenue.discounts} indent negative />
            <Row label="Returns" value={data.revenue.returns} indent negative />
            <Row label="Net Sales" value={data.revenue.netSales} bold />

            <h3 className="font-display text-base font-semibold mb-3 mt-6">Cost</h3>
            <Row label="Cost of Goods Sold" value={data.cost.costOfGoodsSold} indent />
            <Row label="Purchase Cost (period)" value={data.cost.purchaseCost} indent />
            <Row label="Other Costs (Expenses)" value={data.cost.otherCosts} indent />
          </div>

          <div className="surface-card rounded-xl2 shadow-premium p-6">
            <h3 className="font-display text-base font-semibold mb-3">Profit</h3>
            <Row label="Gross Profit" value={data.profit.grossProfit} bold />
            <Row label="Operating Expenses" value={data.profit.operatingExpenses} indent negative />
            <div className="flex justify-between py-4 mt-2 rounded-xl px-4" style={{ background: 'var(--bg-surface-muted)' }}>
              <span className="font-display text-lg font-semibold">Net Profit</span>
              <span className={`font-display text-lg font-semibold ${data.profit.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(data.profit.netProfit)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfitLoss;
