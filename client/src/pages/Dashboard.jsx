import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  IndianRupee, ShoppingBag, TrendingUp, Percent, Boxes, AlertTriangle, ArrowDownCircle, ArrowUpCircle,
  ShoppingCart, FilePlus2, PackagePlus, UserPlus, ClipboardList, Receipt, FileBarChart, Undo2, ArrowLeftRight,
  Wallet, RefreshCw, Hourglass, Landmark, Target, Lock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { hasPermission } from '../utils/permissions.js';
import { KPICard, ChartCard, PageHeader } from '../components/ui/index.js';
import DashboardFilters from '../components/dashboard/DashboardFilters.jsx';
import ExportMenu from '../components/dashboard/ExportMenu.jsx';
import { readFilters, toQueryString } from '../components/dashboard/filters.js';
import { dashboardService } from '../services/index.js';
import { formatCurrency, formatNumber, formatDate } from '../utils/format.js';
import SalesTrendChart from '../charts/SalesTrendChart.jsx';
import DonutChart from '../charts/DonutChart.jsx';
import HorizontalBarChart from '../charts/HorizontalBarChart.jsx';

const QUICK_ACTIONS = [
  { label: 'New Bill', hint: 'F2', to: '/pos', icon: ShoppingCart, module: 'pos', primary: true },
  { label: 'Data Entry', to: '/data-entry', icon: FilePlus2, module: 'dashboard' },
  { label: 'ITR Analysis', to: '/analytics/itr', icon: RefreshCw, module: 'dashboard.inventory' },
  { label: 'Products', to: '/products', icon: PackagePlus, module: 'products' },
  { label: 'Customers', to: '/customers', icon: UserPlus, module: 'customers' },
  { label: 'Sales Return', to: '/sales/returns', icon: Undo2, module: 'sales' },
  { label: 'Low Stock', to: '/inventory/low-stock', icon: AlertTriangle, module: 'inventory' },
  { label: 'Stock Transfer', to: '/inventory/transfer', icon: ArrowLeftRight, module: 'inventory' },
  { label: 'Purchase Order', to: '/purchasing/orders', icon: ClipboardList, module: 'purchasing' },
  { label: 'Expenses', to: '/finance/expenses', icon: Receipt, module: 'finance' },
  { label: 'Reports', to: '/reports', icon: FileBarChart, module: 'reports' },
];

const DATE_KEYS = ['range', 'from', 'to'];
const EASE = [0.22, 1, 0.36, 1];

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function SectionTitle({ children, aside }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
      <div className="flex items-center gap-2.5">
        <span className="h-px w-6 bg-gold-gradient" />
        <span className="eyebrow">{children}</span>
      </div>
      {aside && <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{aside}</div>}
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const can = (k) => hasPermission(user, k);
  const allow = {
    sales: can('dashboard.sales'), expenses: can('dashboard.expenses'),
    inventory: can('dashboard.inventory'), financials: can('dashboard.financials'),
  };
  const canDetails = can('dashboard.details');
  const canFilter = can('dashboard.filters');
  const canExport = can('dashboard.export');

  const filters = useMemo(() => readFilters(searchParams, canFilter), [searchParams, canFilter]);
  const filterKey = JSON.stringify(filters);
  const quickActions = QUICK_ACTIONS.filter((a) => user && hasPermission(user, a.module));

  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState([]);
  const [trend, setTrend] = useState({ data: [], showPurchases: false });
  const [categoryBrand, setCategoryBrand] = useState(null);
  const [roi, setRoi] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = filters;
    const jobs = [dashboardService.kpis(params).then((r) => { if (!cancelled) setKpis(r.data); })];
    if (allow.sales) {
      jobs.push(dashboardService.topProducts({ ...params, limit: 5 }).then((r) => !cancelled && setTopProducts(r.data)));
      jobs.push(dashboardService.salesTrend(params).then((r) => !cancelled && setTrend({ data: r.data, showPurchases: r.showPurchases })));
      jobs.push(dashboardService.categoryBrandSales(params).then((r) => !cancelled && setCategoryBrand(r.data)));
    }
    if (allow.financials) jobs.push(dashboardService.productRoi({ ...params, limit: 8 }).then((r) => !cancelled && setRoi(r.data)));
    Promise.allSettled(jobs).then((results) => {
      if (cancelled) return;
      const failed = results.find((r) => r.status === 'rejected');
      if (failed) toast.error(failed.reason?.message || 'Some dashboard data could not be loaded.');
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, refreshTick, allow.sales, allow.financials]);

  // Detail pages are opened only with the dashboard.details permission (also enforced by the API).
  // "Today" metrics drop the date filter so they always open on today's data.
  const opener = (metric, { daily = false, extra = {} } = {}) => {
    if (!canDetails) return undefined;
    const f = { ...filters, ...extra };
    if (daily) DATE_KEYS.forEach((k) => delete f[k]);
    return () => navigate(`/dashboard/details/${metric}${toQueryString(f)}`);
  };

  const t = kpis?.today || {};
  const p = kpis?.period || {};
  const scope = kpis?.scope;
  const periodLabel = scope ? `${formatDate(scope.from)} – ${formatDate(scope.to)} · ${scope.days} day${scope.days === 1 ? '' : 's'}` : '';
  const nothingVisible = !allow.sales && !allow.expenses && !allow.inventory && !allow.financials;

  return (
    <div>
      <PageHeader
        title={<>{greeting()}, <span className="text-gold-gradient italic">{user?.name?.split(' ')[0] || 'there'}</span></>}
        subtitle={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        actions={(
          <>
            <button
              type="button"
              onClick={() => setRefreshTick((x) => x + 1)}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all duration-300 hover:border-gold-400 hover:-translate-y-px"
              style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
              title="Recalculate with the latest data"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            {canExport && <ExportMenu metric="summary" filters={filters} label="Export dashboard" />}
          </>
        )}
      />

      {quickActions.length > 0 && (
        <div className="mb-6">
          <SectionTitle>Quick actions</SectionTitle>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-11 gap-2.5 sm:gap-3">
            {quickActions.map((a, i) => (
              <motion.div
                key={a.to + a.label}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.05 + i * 0.035 }}
              >
                <Link
                  to={a.to}
                  className={a.primary
                    ? 'sheen group h-full flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-2 text-sm font-semibold bg-gold-gradient text-graphite-950 shadow-gold lift'
                    : 'group h-full surface-card gold-ring lift flex flex-col items-center justify-center gap-2.5 rounded-2xl py-4 px-2 text-sm font-medium'}
                  style={a.primary ? undefined : { color: 'var(--text-primary)' }}
                >
                  <span className={a.primary
                    ? 'relative z-[2] w-10 h-10 rounded-xl bg-black/10 flex items-center justify-center'
                    : 'w-10 h-10 rounded-xl bg-gold-50 text-gold-700 flex items-center justify-center transition-all duration-500 ease-luxe group-hover:bg-gold-gradient group-hover:text-graphite-950 group-hover:shadow-gold group-hover:-rotate-6 group-hover:scale-110'}
                  >
                    <a.icon size={19} />
                  </span>
                  <span className="relative z-[2] text-center leading-tight">{a.label}</span>
                  {a.hint && <kbd className="relative z-[2] text-[10px] px-1.5 rounded-md bg-black/10 font-semibold">{a.hint}</kbd>}
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {canFilter && <DashboardFilters value={filters} onChange={(next) => setSearchParams(next, { replace: true })} />}

      {nothingVisible && (
        <div className="surface-card rounded-xl2 shadow-premium p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          <Lock size={20} className="mx-auto mb-2 text-gold-600" />
          Your role doesn&apos;t include any dashboard information yet. Ask an administrator to grant access in Roles &amp; Permissions.
        </div>
      )}

      {(allow.sales || allow.expenses || allow.financials) && (
        <div className="mb-6">
          <SectionTitle aside={canDetails ? 'Click any card for details' : undefined}>Today</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {allow.sales && <KPICard delay={0.1} label="Today's Revenue" value={t.sales?.value} change={t.sales?.change} prefix="₹" icon={IndianRupee} loading={loading} onClick={opener('daily-sales', { daily: true })} />}
            {allow.expenses && <KPICard delay={0.15} label="Today's Expenses" value={t.expenses?.value} change={t.expenses?.change} prefix="₹" icon={Wallet} loading={loading} accent="graphite" onClick={opener('daily-expenses', { daily: true })} />}
            {allow.financials && <KPICard delay={0.2} label="Today's Purchases" value={t.purchases?.value} change={t.purchases?.change} prefix="₹" icon={ShoppingBag} loading={loading} onClick={opener('daily-purchases', { daily: true })} />}
            {allow.financials && <KPICard delay={0.25} label="Today's Profit" value={t.profit?.value} change={t.profit?.change} prefix="₹" icon={TrendingUp} loading={loading} onClick={opener('daily-profit', { daily: true })} />}
          </div>
        </div>
      )}

      {!nothingVisible && (
        <div className="mb-6">
          <SectionTitle aside={periodLabel}>{scope?.filtersApplied ? 'Selected period · filters applied' : 'This month'}</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {allow.sales && <KPICard delay={0.1} label="Revenue" value={p.revenue?.value} prefix="₹" icon={IndianRupee} loading={loading} hint={p.revenue?.invoices != null ? `${formatNumber(p.revenue.invoices)} invoices` : 'Selected products'} onClick={opener('sales')} />}
            {allow.expenses && <KPICard delay={0.15} label="Expenses" value={p.expenses?.value} prefix="₹" icon={Receipt} loading={loading} accent="graphite" hint={`${formatNumber(p.expenses?.count || 0)} entries`} onClick={opener('expenses')} />}
            {allow.financials && (
              <KPICard delay={0.2}
                label="EBITDA" value={p.ebitda?.value} prefix="₹" icon={Landmark} loading={loading}
                hint="Net profit + interest + taxes + D&A" onClick={opener('ebitda')}
                title={p.ebitda ? `Net profit ${formatCurrency(p.ebitda.netProfit)} + interest ${formatCurrency(p.ebitda.interest)} + taxes ${formatCurrency(p.ebitda.taxes)} + depreciation ${formatCurrency(p.ebitda.depreciation)} + amortization ${formatCurrency(p.ebitda.amortization)}` : undefined}
              />
            )}
            {allow.financials && <KPICard delay={0.25} label="Product ROI" value={p.productRoi?.value} suffix="%" decimals={1} icon={Target} loading={loading} hint="(Revenue − COGS) ÷ COGS" onClick={opener('product-roi')} />}
            {allow.inventory && (
              <KPICard delay={0.3}
                label="Inventory Turnover (ITR)" value={p.itr?.value} suffix="×" decimals={3} icon={RefreshCw} loading={loading}
                hint="COGS ÷ average inventory" onClick={opener('itr')}
                title={p.itr ? `COGS ${formatCurrency(p.itr.cogs)} ÷ average inventory ${formatCurrency(p.itr.averageInventory)} (opening ${formatCurrency(p.itr.openingInventory)}, closing ${formatCurrency(p.itr.closingInventory)})` : undefined}
              />
            )}
            {allow.inventory && (
              <KPICard delay={0.35}
                label="Inventory Holding Period" value={p.holdingPeriod?.value} suffix=" days" decimals={1} icon={Hourglass} loading={loading}
                hint={p.holdingPeriod?.value == null ? 'No sales in period' : 'Days current stock will last'} onClick={opener('holding-period')}
                title={p.holdingPeriod ? `Current inventory ${formatCurrency(p.holdingPeriod.currentInventory)} ÷ average daily consumption ${formatCurrency(p.holdingPeriod.avgDailyConsumption)}` : undefined}
              />
            )}
            {allow.financials && <KPICard delay={0.4} label="Gross Margin" value={p.grossMargin?.value} suffix="%" decimals={1} icon={Percent} loading={loading} hint="On sales excluding GST" onClick={opener('gross-margin')} />}
            {allow.inventory && <KPICard delay={0.45} label="Total Stock Value" value={p.stockValue?.value} prefix="₹" icon={Boxes} loading={loading} hint="At purchase price" onClick={opener('stock-value')} />}
            {allow.inventory && <KPICard delay={0.5} label="Low / Out of Stock" value={p.lowStockItems?.value} icon={AlertTriangle} loading={loading} accent="graphite" hint={`${formatNumber(p.lowStockItems?.outOfStock || 0)} out of stock`} onClick={opener('low-stock')} />}
            {allow.financials && <KPICard delay={0.55} label="Outstanding Receivables" value={p.receivables?.value} prefix="₹" icon={ArrowDownCircle} loading={loading} accent="graphite" hint={`${formatNumber(p.receivables?.count || 0)} customers`} onClick={opener('receivables')} />}
            {allow.financials && <KPICard delay={0.6} label="Outstanding Payables" value={p.payables?.value} prefix="₹" icon={ArrowUpCircle} loading={loading} accent="graphite" hint={`${formatNumber(p.payables?.count || 0)} open bills`} onClick={opener('payables')} />}
          </div>
        </div>
      )}

      {allow.sales && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
            <div className="xl:col-span-2">
              <ChartCard title={trend.showPurchases ? 'Sales vs Purchases' : 'Sales Trend'} subtitle="Trend over the selected period" height={320} onOpen={opener('revenue-trend')}>
                {trend.data.length ? <SalesTrendChart data={trend.data} showPurchases={trend.showPurchases} /> : <EmptyChart />}
              </ChartCard>
            </div>
            <ChartCard title="Payment Methods" subtitle="Share of collections" height={320} onOpen={opener('payment-methods')}>
              {categoryBrand?.byPayment?.length ? <DonutChart data={categoryBrand.byPayment} /> : <EmptyChart />}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
            <div className="xl:col-span-2">
              <ChartCard title="Top 5 Most Selling Products" subtitle="Ranked by revenue for the selected period" height={280} onOpen={opener('top-products')}>
                {topProducts.length ? <HorizontalBarChart data={topProducts} /> : <EmptyChart />}
              </ChartCard>
              {topProducts.length > 0 && (
                <DataGrid
                  headers={['Product', 'SKU', 'Units Sold', 'Revenue', 'Profit', 'Share']}
                  rows={topProducts.map((r) => ({
                    key: r._id,
                    onClick: canFilter ? opener('product-roi', { extra: { product: r._id } }) : opener('top-products'),
                    cells: [r.productName, <Muted key="s">{r.sku}</Muted>, formatNumber(r.unitsSold), formatCurrency(r.revenue),
                      <span key="p" className={r.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatCurrency(r.profit)}</span>, `${r.contributionPercent}%`],
                  }))}
                />
              )}
            </div>
            <ChartCard title="Category-wise Sales" height={280} onOpen={opener('category-sales')}>
              {categoryBrand?.byCategory?.length ? <DonutChart data={categoryBrand.byCategory} /> : <EmptyChart />}
            </ChartCard>
          </div>
        </>
      )}

      {allow.financials && roi && (
        <ChartCard
          title="Product ROI"
          subtitle={`ROI = (Revenue ex-GST − COGS) ÷ COGS · overall ${roi.totals.roiPercent ?? '—'}% across ${formatNumber(roi.count)} products`}
          height="auto"
          onOpen={opener('product-roi')}
        >
          {roi.products.length ? (
            <DataGrid
              flush
              headers={['Product', 'Category', 'Units', 'Revenue', 'COGS', 'Profit', 'ROI']}
              rows={roi.products.map((r) => ({
                key: r.productId,
                onClick: canFilter ? opener('product-roi', { extra: { product: r.productId } }) : undefined,
                cells: [r.name, <Muted key="c">{r.category}</Muted>, formatNumber(r.units), formatCurrency(r.revenue), formatCurrency(r.cogs),
                  <span key="p" className={r.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatCurrency(r.profit)}</span>,
                  r.roiPercent == null ? '—' : `${r.roiPercent}%`],
              }))}
            />
          ) : <EmptyChart />}
        </ChartCard>
      )}
    </div>
  );
}

function Muted({ children }) {
  return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{children}</span>;
}

// Row clicks are only wired when the user may open details; the parent ChartCard handles the rest.
function DataGrid({ headers, rows, flush = false }) {
  return (
    <div className={flush ? 'overflow-x-auto' : 'mt-4 surface-card rounded-xl2 shadow-premium overflow-x-auto'}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            {headers.map((h) => (
              <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold uppercase whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.key}
              onClick={r.onClick ? (e) => { e.stopPropagation(); r.onClick(); } : undefined}
              className={r.onClick ? 'cursor-pointer hover:bg-gold-500/5' : undefined}
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              {r.cells.map((c, i) => <td key={i} className="px-4 py-2.5 whitespace-nowrap">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyChart() {
  return <div className="h-full min-h-[120px] flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>No data recorded for this period.</div>;
}

export default Dashboard;
