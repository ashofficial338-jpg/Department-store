import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IndianRupee, ShoppingBag, TrendingUp, Percent, Boxes, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  ShoppingCart, FilePlus2, PackagePlus, UserPlus, ClipboardList, Receipt, FileBarChart, Undo2, ArrowLeftRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { roleHasModule } from '../utils/permissions.js';
import { KPICard, ChartCard, PageHeader } from '../components/ui/index.js';
import { FilterSelect } from '../components/ui/FilterBar.jsx';
import { dashboardService } from '../services/index.js';
import { formatCurrency, formatNumber } from '../utils/format.js';
import SalesTrendChart from '../charts/SalesTrendChart.jsx';
import DonutChart from '../charts/DonutChart.jsx';
import HorizontalBarChart from '../charts/HorizontalBarChart.jsx';

const QUICK_ACTIONS = [
  { label: 'New Bill', hint: 'F2', to: '/pos', icon: ShoppingCart, module: 'pos', primary: true },
  { label: 'Data Entry', to: '/data-entry', icon: FilePlus2, module: 'dashboard' },
  { label: 'Products', to: '/products', icon: PackagePlus, module: 'products' },
  { label: 'Customers', to: '/customers', icon: UserPlus, module: 'customers' },
  { label: 'Sales Return', to: '/sales/returns', icon: Undo2, module: 'sales' },
  { label: 'Low Stock', to: '/inventory/low-stock', icon: AlertTriangle, module: 'inventory' },
  { label: 'Stock Transfer', to: '/inventory/transfer', icon: ArrowLeftRight, module: 'inventory' },
  { label: 'Purchase Order', to: '/purchasing/orders', icon: ClipboardList, module: 'purchasing' },
  { label: 'Expenses', to: '/finance/expenses', icon: Receipt, module: 'finance' },
  { label: 'Reports', to: '/reports', icon: FileBarChart, module: 'reports' },
];

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' }, { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' }, { value: 'this_year', label: 'This Year' },
];

export function Dashboard() {
  const [kpis, setKpis] = useState(null);
  const [topProducts, setTopProducts] = useState([]);
  const [trend, setTrend] = useState([]);
  const [categoryBrand, setCategoryBrand] = useState(null);
  const [range, setRange] = useState('this_month');
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const quickActions = QUICK_ACTIONS.filter((a) => user && roleHasModule(user.role, a.module));

  useEffect(() => {
    dashboardService.kpis().then((r) => setKpis(r.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    dashboardService.topProducts({ range, limit: 5 }).then((r) => setTopProducts(r.data));
    dashboardService.salesTrend({ range, groupBy: range === 'this_year' ? 'month' : 'day' }).then((r) => setTrend(r.data));
    dashboardService.categoryBrandSales({ range }).then((r) => setCategoryBrand(r.data));
  }, [range]);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.name?.split(' ')[0] || 'there'}`}
        actions={<FilterSelect value={range} onChange={setRange} options={RANGE_OPTIONS} />}
      />

      {quickActions.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--text-muted)' }}>Quick actions</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-10 gap-3">
            {quickActions.map((a) => (
              <Link
                key={a.to + a.label}
                to={a.to}
                className={a.primary
                  ? 'flex flex-col items-center justify-center gap-2 rounded-xl py-4 px-2 text-sm font-medium bg-gold-500 hover:bg-gold-400 text-graphite-950 shadow-premium transition-colors'
                  : 'surface-card flex flex-col items-center justify-center gap-2 rounded-xl py-4 px-2 text-sm font-medium shadow-premium border border-transparent hover:border-gold-400 transition-colors'}
                style={a.primary ? undefined : { color: 'var(--text-primary)' }}
              >
                <a.icon size={20} className={a.primary ? '' : 'text-gold-600'} />
                <span className="text-center leading-tight">{a.label}</span>
                {a.hint && <kbd className="text-[10px] px-1 rounded bg-black/10">{a.hint}</kbd>}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPICard label="Today's Sales" value={kpis?.todaySales.value} change={kpis?.todaySales.change} prefix="₹" icon={IndianRupee} loading={loading} />
        <KPICard label="Today's Purchases" value={kpis?.todayPurchases.value} change={kpis?.todayPurchases.change} prefix="₹" icon={ShoppingBag} loading={loading} />
        <KPICard label="Today's Profit" value={kpis?.todayProfit.value} change={kpis?.todayProfit.change} prefix="₹" icon={TrendingUp} loading={loading} />
        <KPICard label="Gross Margin" value={kpis?.grossMargin.value} suffix="%" icon={Percent} loading={loading} />
        <KPICard label="Total Stock Value" value={kpis?.stockValue.value} prefix="₹" icon={Boxes} loading={loading} />
        <KPICard label="Low Stock Items" value={kpis?.lowStockItems.value} icon={AlertTriangle} loading={loading} accent="graphite" />
        <KPICard label="Outstanding Receivables" value={kpis?.outstandingReceivables.value} prefix="₹" icon={ArrowDownCircle} loading={loading} accent="graphite" />
        <KPICard label="Outstanding Payables" value={kpis?.outstandingPayables.value} prefix="₹" icon={ArrowUpCircle} loading={loading} accent="graphite" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <div className="xl:col-span-2">
          <ChartCard title="Sales vs Purchases" subtitle="Trend over the selected period" height={320}>
            {trend.length ? <SalesTrendChart data={trend} /> : <EmptyChart />}
          </ChartCard>
        </div>
        <ChartCard title="Payment Methods" subtitle="Share of collections" height={320}>
          {categoryBrand?.byPayment?.length ? <DonutChart data={categoryBrand.byPayment} /> : <EmptyChart />}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2">
          <ChartCard title="Top 5 Most Selling Products" subtitle="Ranked by revenue for the selected period" height={280}>
            {topProducts.length ? <HorizontalBarChart data={topProducts} /> : <EmptyChart />}
          </ChartCard>
          {topProducts.length > 0 && (
            <div className="mt-4 surface-card rounded-xl2 shadow-premium overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                    {['Product', 'SKU', 'Units Sold', 'Revenue', 'Profit', 'Share'].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((p) => (
                    <tr key={p._id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="px-4 py-2.5">{p.productName}</td>
                      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>{p.sku}</td>
                      <td className="px-4 py-2.5">{formatNumber(p.unitsSold)}</td>
                      <td className="px-4 py-2.5">{formatCurrency(p.revenue)}</td>
                      <td className="px-4 py-2.5 text-emerald-600">{formatCurrency(p.profit)}</td>
                      <td className="px-4 py-2.5">{p.contributionPercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <ChartCard title="Category-wise Sales" height={280}>
          {categoryBrand?.byCategory?.length ? <DonutChart data={categoryBrand.byCategory} /> : <EmptyChart />}
        </ChartCard>
      </div>
    </div>
  );
}

function EmptyChart() {
  return <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>No data recorded for this period.</div>;
}

export default Dashboard;
