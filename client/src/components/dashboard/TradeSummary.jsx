import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { tradeService } from '../../services/index.js';
import { formatCurrency, formatNumber } from '../../utils/format.js';

// Sales & Purchase summary on the Dashboard. Every figure is computed live from bills, purchase invoices,
// payments and stock, so it always matches the Sales, Purchase, Customer / Supplier and Inventory screens.
const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
function periodRange(p) {
  const today = istToday();
  const [y, m] = today.split('-').map(Number);
  if (p === 'today') return { from: today, to: today };
  if (p === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (p === 'fy') { const fy = m >= 4 ? y : y - 1; return { from: `${fy}-04-01`, to: today }; }
  return {};
}
const PERIODS = [['month', 'This month'], ['today', 'Today'], ['fy', 'This financial year'], ['all', 'All time']];
const monthLabel = (k) => new Date(`${k}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

function Tile({ label, value, hint, to, tone }) {
  const body = (
    <div className="surface-card rounded-xl p-4 h-full hover:shadow-premium transition-shadow">
      <div className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`text-lg font-semibold mt-1 tabular-nums ${tone === 'bad' ? 'text-rose-600' : ''}`} style={tone === 'bad' ? undefined : { color: 'var(--text-primary)' }}>{value}</div>
      {hint && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}

export function TradeSummary() {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    tradeService.summary(periodRange(period)).then((r) => setData(r.data)).catch((e) => setError(e.message));
  }, [period]);

  if (error) return null;
  const d = data;
  const maxMonth = d ? Math.max(1, ...d.monthly.map((m) => Math.max(m.sales, m.purchases))) : 1;
  return (
    <section className="mb-6" aria-label="Sales and purchase summary">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Sales &amp; Purchase Summary</h2>
        <select aria-label="Summary period" value={period} onChange={(e) => setPeriod(e.target.value)}
          className="h-9 rounded-lg border px-3 text-sm bg-[var(--bg-surface)]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' }}>
          {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {!d ? (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="surface-card rounded-xl h-20 animate-pulse" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            <Tile label="Total sales" value={formatCurrency(d.sales.total)} hint={`${d.sales.bills} bill(s) · returns ${formatCurrency(d.sales.returns)}`} to="/sales/history" />
            <Tile label="Cash sales" value={formatCurrency(d.sales.cash)} hint="received at billing" to="/sales/history?saleType=cash" />
            <Tile label="Credit sales" value={formatCurrency(d.sales.credit)} hint="left unpaid at billing" to="/sales/history?saleType=credit" />
            <Tile label="Total purchases" value={formatCurrency(d.purchases.total)} hint={`${d.purchases.bills} invoice(s)`} to="/purchasing/invoices" />
            <Tile label="Cash purchases" value={formatCurrency(d.purchases.cash)} hint="paid when entered" to="/purchasing/invoices" />
            <Tile label="Credit purchases" value={formatCurrency(d.purchases.credit)} hint="bought on credit" to="/purchasing/invoices" />
            <Tile label="Today" value={formatCurrency(d.today.sales)} hint={`sales · purchases ${formatCurrency(d.today.purchases)}`} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-3">
            <Tile label="Customer outstanding" value={formatCurrency(d.customerOutstanding.value)} hint={`${d.customerOutstanding.customers} customer(s)`} to="/customers" tone={d.customerOutstanding.value > 0 ? 'bad' : undefined} />
            <Tile label="Supplier outstanding" value={formatCurrency(d.supplierOutstanding.value)} hint={`${d.supplierOutstanding.suppliers} supplier(s)`} to="/finance/payables" tone={d.supplierOutstanding.value > 0 ? 'bad' : undefined} />
            <Tile label="Total stock value" value={formatCurrency(d.stock.value)} hint="at purchase rate" to="/inventory/overview" />
            <Tile label="Available stock" value={formatNumber(d.stock.units)} hint={`${d.stock.inStock} product(s) in stock`} to="/inventory/overview" />
            <Tile label="Low / out of stock" value={`${d.stock.lowStock} / ${d.stock.outOfStock}`} hint="products" to="/inventory/low-stock" tone={d.stock.lowStock + d.stock.outOfStock > 0 ? 'bad' : undefined} />
          </div>
          {d.monthly.length > 0 && (
            <div className="surface-card rounded-xl p-4 mt-3 overflow-x-auto">
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Monthly sales and purchase summary</div>
              <table className="w-full text-sm min-w-[560px]">
                <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Month</th><th className="text-right">Sales</th><th className="text-right">Credit sales</th><th className="text-right">Purchases</th><th className="text-right">Sales - Purchases</th><th className="w-40" /></tr></thead>
                <tbody>
                  {d.monthly.map((m) => (
                    <tr key={m.month} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-1.5">{monthLabel(m.month)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(m.sales)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(m.creditSales)}</td>
                      <td className="text-right tabular-nums">{formatCurrency(m.purchases)}</td>
                      <td className={`text-right tabular-nums ${m.sales - m.purchases < 0 ? 'text-rose-600' : ''}`}>{formatCurrency(m.sales - m.purchases)}</td>
                      <td className="pl-3" aria-hidden>
                        <div className="h-1.5 rounded-full mb-0.5" style={{ width: `${(m.sales / maxMonth) * 100}%`, background: 'var(--brand)' }} title="Sales" />
                        <div className="h-1.5 rounded-full" style={{ width: `${(m.purchases / maxMonth) * 100}%`, background: 'var(--text-muted)' }} title="Purchases" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex gap-4 text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded-full" style={{ background: 'var(--brand)' }} /> Sales</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-1.5 rounded-full" style={{ background: 'var(--text-muted)' }} /> Purchases</span>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default TradeSummary;
