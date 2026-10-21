import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  IndianRupee, Receipt, ShoppingBag, TrendingUp, Percent, Landmark, FileText, FileSpreadsheet, RefreshCw, Boxes, AlertTriangle,
  ArrowDownCircle, ArrowUpCircle, Wallet, Scale, Database, Upload, FilePlus2, ShoppingCart, Info, PackageX,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { hasPermission } from '../../utils/permissions.js';
import { KPICard, ChartCard, PageHeader, Button } from '../../components/ui/index.js';
import { advancedReportService, saveBlob } from '../../services/index.js';
import { formatCurrency, formatNumber, formatDate, formatDateTime } from '../../utils/format.js';
import ReportFilterBar, { RANGE_LABELS } from '../../components/reports/ReportFilterBar.jsx';
import SectionExplorer from '../../components/reports/SectionExplorer.jsx';
import ExportDialog from '../../components/reports/ExportDialog.jsx';
import { RevenueExpenseChart, ProfitTrendChart, RankBarChart, ShareDonut, COLORS } from '../../components/reports/ReportCharts.jsx';
import { captureChart } from '../../components/reports/chartCapture.js';

const FILTER_KEYS = ['range', 'from', 'to', 'granularity', 'compare', 'product', 'category', 'brand', 'supplier', 'vendor', 'paymentMethod', 'expenseCategory', 'stockStatus', 'transactionType'];
const AUTO_REFRESH_MS = 60000;

function readFilters(params) {
  const f = { range: params.get('range') || 'this_month', granularity: params.get('granularity') || 'auto' };
  FILTER_KEYS.forEach((k) => { const v = params.get(k); if (v) f[k] = v; });
  return f;
}
// Only send filters the API understands, and drop custom dates until both are chosen.
function apiParams(f) {
  const p = {};
  FILTER_KEYS.forEach((k) => { if (f[k] && !(k === 'granularity' && f[k] === 'auto')) p[k] = f[k]; });
  if (p.range === 'custom' && !(p.from && p.to)) { delete p.range; delete p.from; delete p.to; }
  if (p.range !== 'custom') { delete p.from; delete p.to; }
  return p;
}
const change = (cur, prev, key, { points = false } = {}) => {
  const a = cur?.[key]; const b = prev?.[key];
  if (a === null || a === undefined || b === null || b === undefined) return undefined;
  if (points) return Math.round((a - b) * 10) / 10;
  if (!b) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / Math.abs(b)) * 1000) / 10;
};

function Section({ title, aside, children }) {
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5">
        <div className="flex items-center gap-2.5"><span className="h-px w-6 bg-gold-gradient" /><span className="eyebrow">{title}</span></div>
        {aside && <div className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{aside}</div>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, tone, sub }) {
  return (
    <div className="rounded-xl p-3" style={{ background: 'var(--bg-surface-muted)' }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`text-lg font-display font-semibold mt-0.5 tabular-nums ${tone || ''}`} style={tone ? undefined : { color: 'var(--text-primary)' }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  );
}

function Empty({ children = 'No data recorded for this period.' }) {
  return <div className="h-full min-h-[140px] flex items-center justify-center text-sm text-center px-4" style={{ color: 'var(--text-muted)' }}>{children}</div>;
}

export function AdvancedReports() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);
  const query = useMemo(() => apiParams(filters), [filters]);
  const queryKey = JSON.stringify(query);

  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(() => { try { return localStorage.getItem('aurelia_reports_autorefresh') !== 'off'; } catch { return true; } });
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState(null); // null | 'pdf' | 'xlsx'
  const [quickExport, setQuickExport] = useState(null);
  const refs = { revenue: useRef(null), profit: useRef(null), products: useRef(null), brands: useRef(null), categories: useRef(null), payments: useRef(null) };

  const loadMeta = useCallback(() => advancedReportService.meta().then((r) => setMeta(r.data)).catch((e) => toast.error(e.message)), []);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    advancedReportService.overview(query)
      .then((r) => { if (!cancelled) { setData(r.data); setError(null); setUpdatedAt(new Date()); } })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, tick]);

  // Figures recalculate from the database on every load; auto-refresh keeps an open page current
  // as new bills, purchases and expenses are recorded (only while the tab is visible).
  useEffect(() => {
    try { localStorage.setItem('aurelia_reports_autorefresh', autoRefresh ? 'on' : 'off'); } catch { /* storage unavailable */ }
    if (!autoRefresh) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') setTick((x) => x + 1); }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [autoRefresh]);

  const setFilters = (next) => {
    const p = new URLSearchParams();
    FILTER_KEYS.forEach((k) => { if (next[k] && !(k === 'granularity' && next[k] === 'auto')) p.set(k, next[k]); });
    setParams(p, { replace: true });
  };

  const financial = !!meta?.access?.financial;
  const cur = data?.summary?.current;
  const prev = data?.summary?.previous;
  const compareOn = filters.compare !== 'false';
  const scoped = data?.scope?.scoped;
  const noActivity = data && cur && !cur.revenue && !cur.expenses && !(cur.purchases > 0);
  const periodText = data?.scope ? `${formatDate(data.scope.from)} – ${formatDate(data.scope.effectiveEnd < data.scope.to ? data.scope.effectiveEnd : data.scope.to)}` : '';
  const prevText = data?.scope && compareOn ? `vs ${formatDate(data.scope.prevFrom)} – ${formatDate(data.scope.prevTo)}` : '';
  const canProducts = hasPermission(user, 'products');

  const getCharts = async () => {
    const list = [
      [refs.revenue, 'Revenue vs expenses', [{ label: 'Revenue', color: COLORS.revenue }, { label: 'Expenses', color: COLORS.expenses }, ...(financial ? [{ label: 'Purchases', color: COLORS.purchases }, ...(scoped ? [] : [{ label: 'Net profit', color: COLORS.netProfit }])] : [])]],
      [refs.profit, 'Profit trend', [{ label: 'Gross profit', color: COLORS.grossProfit }, { label: 'Net profit', color: COLORS.netProfit }]],
      [refs.products, 'Top-selling products', []], [refs.brands, 'Best-performing brands', []],
      [refs.categories, 'Category-wise sales', []], [refs.payments, 'Payment methods', []],
    ];
    const out = [];
    for (const [ref, title, legend] of list) {
      if (!ref.current) continue;
      const dataUrl = await captureChart(ref.current, title, legend);
      if (dataUrl) out.push({ title, dataUrl });
    }
    return out;
  };

  const exportSection = async (key, format) => {
    const s = meta?.sections.find((x) => x.key === key);
    setQuickExport(key);
    const t = toast.loading(`Preparing ${s?.title || 'report'}…`);
    try {
      const out = await advancedReportService.exportFile({ format, title: s?.title || 'Report', sections: [key], filters: query, charts: [] });
      saveBlob(out.blob, out.name);
      toast.success(`${out.name} downloaded.`, { id: t });
    } catch (e) {
      toast.error(e.message, { id: t });
    } finally { setQuickExport(null); }
  };

  return (
    <div>
      <PageHeader
        title="Analytics & Reports"
        subtitle={periodText ? `${RANGE_LABELS[filters.range] || 'Custom'} · ${periodText}${prevText ? ` · compared ${prevText}` : ''}` : 'Live figures from your sales, purchases, expenses and stock'}
        crumbs={[{ label: 'Reports' }, { label: 'Analytics & Exports' }]}
        actions={(
          <>
            <button type="button" onClick={() => setTick((x) => x + 1)} title={updatedAt ? `Last updated ${formatDateTime(updatedAt)}` : 'Refresh'}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-semibold hover:border-gold-400" style={{ borderColor: 'var(--border-strong)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            <Button variant="outline" icon={FileSpreadsheet} onClick={() => setDialog('xlsx')} disabled={!meta}>Excel</Button>
            <Button variant="gold" icon={FileText} onClick={() => setDialog('pdf')} disabled={!meta}>PDF report</Button>
          </>
        )}
      />

      <div className="flex flex-wrap items-center justify-between gap-2 -mt-2 mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{updatedAt ? `Updated ${formatDateTime(updatedAt)} from live data` : 'Loading live data…'}</span>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" className="accent-[#C29A56]" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          Auto-refresh every minute
        </label>
      </div>

      <ReportFilterBar value={filters} onChange={setFilters} options={meta?.options} />

      {error && <div className="mb-5 rounded-xl p-4 text-sm bg-rose-50 text-rose-700">{error}</div>}

      {data?.dataStatus?.empty && (
        <div className="surface-card rounded-xl2 p-8 mb-6 text-center">
          <Database size={28} className="mx-auto text-gold-600 mb-3" />
          <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>No business data yet</h3>
          <p className="text-sm mt-2 max-w-xl mx-auto" style={{ color: 'var(--text-muted)' }}>Reports are calculated only from records in your database. Import your product list or start recording sales, purchases and expenses to see figures here.</p>
          <div className="flex flex-wrap justify-center gap-2 mt-5">
            {canProducts && <Link to="/products?import=1"><Button variant="gold" icon={Upload}>Import products</Button></Link>}
            <Link to="/data-entry"><Button variant="outline" icon={FilePlus2}>Add records</Button></Link>
            {hasPermission(user, 'pos') && <Link to="/pos"><Button variant="outline" icon={ShoppingCart}>New bill</Button></Link>}
          </div>
        </div>
      )}

      {!data?.dataStatus?.empty && noActivity && !loading && (
        <div className="mb-5 rounded-xl p-4 text-sm flex flex-wrap items-center gap-3" style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-secondary)' }}>
          <Info size={16} className="text-gold-600" />
          <span className="flex-1 min-w-[200px]">No sales, purchases or expenses are recorded for this period. Choose a different period, or add the missing records.</span>
          <Link to="/data-entry" className="font-semibold text-gold-700 hover:underline">Add records</Link>
        </div>
      )}
      {scoped && (
        <div className="mb-5 rounded-xl p-3 text-xs flex items-start gap-2" style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-secondary)' }}>
          <Info size={14} className="mt-0.5 text-gold-600 shrink-0" />
          Product or payment filters are active: revenue and gross profit cover the matching sales only. Net profit is hidden because expenses are not allocated to individual products.
        </div>
      )}

      <Section title="Key figures" aside={compareOn ? 'Change vs previous period of the same length' : undefined}>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <KPICard label="Revenue (incl. GST)" value={cur?.revenue} prefix="₹" icon={IndianRupee} loading={loading && !data} change={compareOn ? change(cur, prev, 'revenue') : undefined} changeLabel="vs prev." hint={`${formatNumber(cur?.invoices || 0)} invoices`} />
          <KPICard label="Expenses" value={cur?.expenses} prefix="₹" icon={Receipt} accent="graphite" loading={loading && !data} change={compareOn ? change(cur, prev, 'expenses') : undefined} changeLabel="vs prev." hint={`${formatNumber(cur?.expenseCount || 0)} entries`} />
          {financial && <KPICard label="Purchases" value={cur?.purchases} prefix="₹" icon={ShoppingBag} loading={loading && !data} change={compareOn ? change(cur, prev, 'purchases') : undefined} changeLabel="vs prev." hint={`${formatNumber(cur?.purchaseOrders || 0)} purchase orders`} />}
          {financial && <KPICard label="Net profit" value={cur?.netProfit} prefix="₹" icon={TrendingUp} loading={loading && !data} change={compareOn ? change(cur, prev, 'netProfit') : undefined} changeLabel="vs prev." hint={cur?.netProfit === null ? 'Hidden while product filters apply' : 'Gross profit − expenses'} />}
          <KPICard label="Net sales (ex-GST)" value={cur?.netSales} prefix="₹" icon={Scale} loading={loading && !data} change={compareOn ? change(cur, prev, 'netSales') : undefined} changeLabel="vs prev." hint="After discounts and returns" />
          {financial && <KPICard label="Gross profit" value={cur?.grossProfit} prefix="₹" icon={Landmark} loading={loading && !data} change={compareOn ? change(cur, prev, 'grossProfit') : undefined} changeLabel="vs prev." hint={`Margin ${cur?.grossMargin ?? '—'}%`} />}
          {financial && <KPICard label="Net profit margin" value={cur?.netMargin} suffix="%" decimals={1} icon={Percent} loading={loading && !data} change={compareOn ? change(cur, prev, 'netMargin', { points: true }) : undefined} changeLabel="pts vs prev." hint="Net profit ÷ net sales" />}
          <KPICard label="Average bill" value={cur?.averageBill} prefix="₹" icon={Wallet} accent="graphite" loading={loading && !data} change={compareOn ? change(cur, prev, 'averageBill') : undefined} changeLabel="vs prev." hint={`${formatNumber(cur?.unitsSold || 0)} units sold`} />
        </div>
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <div className="xl:col-span-2" ref={refs.revenue}>
          <ChartCard title="Revenue vs expenses" subtitle={`By ${data?.scope?.granularity || 'period'}${financial ? ' · purchases and net profit as lines' : ''}`} height={320}>
            {data?.trend?.some((r) => r.revenue || r.expenses) ? <RevenueExpenseChart data={data.trend} showProfit={financial && !scoped} showPurchases={financial} /> : <Empty />}
          </ChartCard>
        </div>
        <div ref={refs.payments}>
          <ChartCard title="Payment methods" subtitle="Share of collections" height={320}>
            {data?.paymentMix?.length ? <ShareDonut data={data.paymentMix} valueKey="amount" /> : <Empty />}
          </ChartCard>
        </div>
      </div>

      {financial && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
          <div className="xl:col-span-2" ref={refs.profit}>
            <ChartCard title="Profit growth trend" subtitle="Gross and net profit with period-on-period growth" height={300}>
              {data?.trend?.length ? <ProfitTrendChart data={data.trend} profitKey={scoped ? 'grossProfit' : 'netProfit'} /> : <Empty />}
            </ChartCard>
          </div>
          <div ref={refs.categories}>
            <ChartCard title="Category-wise sales" subtitle="Revenue share by category" height={300}>
              {data?.categories?.length ? <ShareDonut data={data.categories} /> : <Empty />}
            </ChartCard>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-6">
        <div ref={refs.products}>
          <ChartCard title="Top-selling products" subtitle="Top 10 by revenue (incl. GST)" height={340}>
            {data?.topProducts?.length ? <RankBarChart data={data.topProducts} /> : <Empty />}
          </ChartCard>
        </div>
        <div ref={refs.brands}>
          <ChartCard title="Best-performing brands" subtitle="Top 10 brands by revenue" height={340}>
            {data?.brands?.length ? <RankBarChart data={data.brands} color={COLORS.grossProfit} /> : <Empty />}
          </ChartCard>
        </div>
      </div>
      {!financial && data?.categories?.length > 0 && (
        <div className="mb-6" ref={refs.categories}>
          <ChartCard title="Category-wise sales" subtitle="Revenue share by category" height={280}><ShareDonut data={data.categories} /></ChartCard>
        </div>
      )}

      <Section title="Inventory & financial intelligence">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="surface-card rounded-xl2 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}><Boxes size={18} className="text-gold-600" /> Stock valuation</h3>
              <Link to="/inventory/low-stock" className="text-xs font-semibold text-gold-700 hover:underline">Low stock page</Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              <Stat label="At cost" value={formatCurrency(data?.stock?.value)} sub={`${formatNumber(data?.stock?.units || 0)} units`} />
              <Stat label="At selling price" value={formatCurrency(data?.stock?.retail)} sub="ex-GST" />
              {financial && <Stat label="Expected profit" value={formatCurrency(data?.stock?.expectedProfit)} tone="text-emerald-600" sub="If all stock sells" />}
              <Stat label="Low / out" value={`${data?.stock?.lowStock ?? 0} / ${data?.stock?.outOfStock ?? 0}`} tone={(data?.stock?.outOfStock || data?.stock?.lowStock) ? 'text-amber-600' : undefined} sub={`${formatNumber(data?.stock?.products || 0)} products`} />
            </div>
            {data?.stock?.alerts?.length ? (
              <ul className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
                {data.stock.alerts.map((a) => (
                  <li key={a.productId} className="flex items-center gap-3 py-2 text-sm">
                    {a.status === 'out_of_stock' ? <PackageX size={15} className="text-rose-600 shrink-0" /> : <AlertTriangle size={15} className="text-amber-500 shrink-0" />}
                    <span className="flex-1 min-w-0 truncate" style={{ color: 'var(--text-primary)' }}>{a.name} <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {a.brand}</span></span>
                    <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{a.stock} left · reorder at {a.reorderLevel}</span>
                    <span className={`text-xs font-semibold whitespace-nowrap ${a.status === 'out_of_stock' ? 'text-rose-600' : 'text-amber-600'}`}>{a.statusLabel}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm" style={{ color: 'var(--text-muted)' }}>All products are above their reorder level.</p>}
          </div>

          {financial ? (
            <div className="surface-card rounded-xl2 p-5">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3" style={{ color: 'var(--text-primary)' }}><Wallet size={18} className="text-gold-600" /> Money position</h3>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <Stat label={<span className="inline-flex items-center gap-1"><ArrowDownCircle size={12} /> Receivables</span>} value={formatCurrency(data?.outstanding?.receivables)} sub={`${data?.outstanding?.receivableCount ?? 0} customers owe you`} />
                <Stat label={<span className="inline-flex items-center gap-1"><ArrowUpCircle size={12} /> Payables</span>} value={formatCurrency(data?.outstanding?.payables)} sub={`${data?.outstanding?.payableCount ?? 0} unpaid vendor bills`} tone="text-rose-600" />
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>Cash flow in this period</div>
              {data?.cashflow?.hasLedger ? (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <Stat label="Money in" value={formatCurrency(data.cashflow.inflow)} tone="text-emerald-600" />
                  <Stat label="Money out" value={formatCurrency(data.cashflow.outflow)} tone="text-rose-600" />
                  <Stat label="Net" value={formatCurrency(data.cashflow.net)} tone={data.cashflow.net >= 0 ? 'text-emerald-600' : 'text-rose-600'} />
                </div>
              ) : <p className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>No ledger postings yet - cash flow appears once payments are recorded.</p>}
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>GST summary</div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Output GST" value={formatCurrency(data?.gst?.output)} sub="Collected on sales" />
                <Stat label="Input credit" value={formatCurrency(data?.gst?.input)} sub="Paid on purchases" />
                <Stat label={(data?.gst?.net ?? 0) >= 0 ? 'Net payable' : 'ITC carry forward'} value={formatCurrency(Math.abs(data?.gst?.net || 0))} tone={(data?.gst?.net ?? 0) >= 0 ? 'text-rose-600' : 'text-emerald-600'} />
              </div>
            </div>
          ) : (
            <div className="surface-card rounded-xl2 p-5 flex items-center justify-center text-sm text-center" style={{ color: 'var(--text-muted)' }}>
              Profit, cash flow, receivables, payables and GST need the Finance permission.
            </div>
          )}
        </div>
      </Section>

      {meta?.sections?.length > 0 && <SectionExplorer sections={meta.sections} filters={query} onExportSection={exportSection} exporting={quickExport} />}

      <ExportDialog
        open={!!dialog} initialFormat={dialog || 'pdf'} onClose={() => setDialog(null)} meta={meta} filters={query}
        onApplyFilters={(f) => setFilters({ granularity: 'auto', ...f })} getCharts={getCharts} onTemplatesChanged={loadMeta}
      />
    </div>
  );
}

export default AdvancedReports;
