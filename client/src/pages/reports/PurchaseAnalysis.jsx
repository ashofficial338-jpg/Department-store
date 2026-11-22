import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText, FileDown } from 'lucide-react';
import { PageHeader, DataTable, Button, StatusBadge } from '../../components/ui/index.js';
import { FilterPanel, cleanParams } from '../../components/ui/FilterPanel.jsx';
import { purchaseAnalysisService } from '../../services/index.js';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format.js';
import { PAYMENT_STATUS_OPTIONS } from '../../utils/lines.js';

// Purchase Analysis: everything comes live from Purchase Orders -> Invoices -> Inward DCs and stock, so it always
// matches what was entered. All filters combine; exports use exactly the filters on screen.
const TABS = [
  { key: 'lines', label: 'Purchase Register' },
  { key: 'product', label: 'Product-wise' },
  { key: 'brand', label: 'Brand-wise' },
  { key: 'productBrand', label: 'Product + Brand' },
  { key: 'vendor', label: 'Supplier-wise' },
  { key: 'date', label: 'Date-wise' },
  { key: 'category', label: 'Category-wise' },
  { key: 'user', label: 'User-wise' },
  { key: 'rates', label: 'Rate History' },
];
const STOCK_TABS = ['product', 'brand', 'productBrand', 'category'];
const EMPTY = {
  search: '', from: '', to: '', vendor: '', product: '', brand: '', category: '', user: '', status: '', paymentStatus: '',
  minQty: '', maxQty: '', minRate: '', maxRate: '', minAmount: '', maxAmount: '', stock: '', sort: '', order: 'desc',
};
const STATUS_OPTIONS = ['draft', 'approved', 'partially_invoiced', 'invoiced', 'received', 'cancelled'].map((s) => ({ value: s, label: s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }));
const STOCK_OPTIONS = [{ value: 'in', label: 'In stock' }, { value: 'low', label: 'Low stock' }, { value: 'out', label: 'Out of stock' }];
const LINE_SORTS = [{ value: 'date', label: 'Date' }, { value: 'product', label: 'Product' }, { value: 'brand', label: 'Brand' }, { value: 'vendor', label: 'Supplier' }, { value: 'qty', label: 'Quantity' }, { value: 'rate', label: 'Rate' }, { value: 'amount', label: 'Amount' }];
const GROUP_SORTS = [{ value: 'total', label: 'Purchase value' }, { value: 'qty', label: 'Quantity' }, { value: 'label', label: 'Name' }, { value: 'avgRate', label: 'Avg rate' }, { value: 'lastRate', label: 'Last rate' }, { value: 'lastDate', label: 'Last purchase' }, { value: 'stock', label: 'Stock' }, { value: 'orders', label: 'Orders' }];

const money = (v) => (v === null || v === undefined ? '-' : formatCurrency(v));
const STOCK_BADGE = { in: 'active', low: 'warning', out: 'out_of_stock' };

function Stat({ label, value, hint }) {
  return (
    <div className="surface-card rounded-xl p-4">
      <div className="text-[11px] font-semibold uppercase" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums" style={{ color: 'var(--text-primary)' }}>{value}</div>
      {hint && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  );
}

export function PurchaseAnalysis() {
  const [tab, setTab] = useState('lines');
  const [filters, setFilters] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [opts, setOpts] = useState({ vendors: [], products: [], brands: [], categories: [], users: [] });
  const [data, setData] = useState({ rows: [], totals: null, pagination: null });
  const [kpi, setKpi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');

  useEffect(() => { purchaseAnalysisService.options().then((r) => setOpts(r.data)).catch((err) => toast.error(err.message)); }, []);

  const isLines = tab === 'lines' || tab === 'rates';
  const params = useMemo(() => {
    const p = { ...filters };
    if (!STOCK_TABS.includes(tab)) delete p.stock;
    if (tab === 'rates') { p.sort = 'date'; p.order = 'asc'; }
    if (isLines && !LINE_SORTS.some((s) => s.value === p.sort)) p.sort = tab === 'rates' ? 'date' : 'date';
    if (!isLines && !GROUP_SORTS.some((s) => s.value === p.sort)) p.sort = tab === 'date' ? 'label' : 'total';
    return cleanParams(p);
  }, [filters, tab, isLines]);

  useEffect(() => {
    if (tab === 'rates' && !filters.product) { setData({ rows: [], totals: null, pagination: null }); setLoading(false); return undefined; }
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      const req = isLines
        ? purchaseAnalysisService.lines({ ...params, page, limit: tab === 'rates' ? 200 : 50 })
        : purchaseAnalysisService.summary({ ...params, groupBy: tab, page, limit: 50 });
      req.then((r) => { if (live) setData({ rows: r.data, totals: r.totals, pagination: r.pagination }); })
        .catch((err) => toast.error(err.message)).finally(() => live && setLoading(false));
    }, filters.search ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [params, page, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Headline figures for the current filters (independent of the tab): purchases + available stock.
  useEffect(() => {
    const base = { ...params }; delete base.sort; delete base.order; delete base.stock;
    Promise.all([
      purchaseAnalysisService.lines({ ...base, limit: 1 }),
      purchaseAnalysisService.summary({ ...base, groupBy: 'product', limit: 1 }),
    ]).then(([l, s]) => setKpi({ ...l.totals, stock: s.totals.stock })).catch(() => {});
  }, [params]);

  async function doExport(format) {
    setExporting(format);
    try { await purchaseAnalysisService.exportFile({ ...params, view: tab }, format); } catch (err) { toast.error(err.message || 'Export failed.'); } finally { setExporting(''); }
  }

  const list = (xs) => xs.map((x) => ({ value: x._id, label: x.name }));
  const setFilter = (v) => { setFilters(v); setPage(1); };

  const lineColumns = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'poNumber', header: 'PO #', render: (r) => <span className="font-mono text-xs">{r.poNumber}</span> },
    { key: 'vendorName', header: 'Supplier' },
    { key: 'productName', header: 'Product', render: (r) => <span className="font-medium">{r.productName}</span> },
    { key: 'brandName', header: 'Brand' },
    { key: 'quantity', header: 'Qty', render: (r) => `${formatNumber(r.quantity)} ${r.unit || ''}` },
    { key: 'rate', header: 'Rate / unit', render: (r) => money(r.rate) },
    { key: 'amount', header: 'Amount', render: (r) => money(r.amount) },
    { key: 'total', header: 'Total (GST)', render: (r) => money(r.total) },
    { key: 'receivedQty', header: 'Received', render: (r) => r.receivedQty },
    { key: 'paymentStatus', header: 'Payment', render: (r) => <StatusBadge status={r.paymentStatus} label={r.paymentStatus === 'not_billed' ? 'not invoiced' : undefined} /> },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'userName', header: 'Entered by', render: (r) => <span className="text-xs">{r.userName}</span> },
  ];
  const rateColumns = [
    { key: 'date', header: 'Date', render: (r) => formatDate(r.date) },
    { key: 'poNumber', header: 'PO #', render: (r) => <span className="font-mono text-xs">{r.poNumber}</span> },
    { key: 'brandName', header: 'Brand' },
    { key: 'vendorName', header: 'Supplier' },
    { key: 'quantity', header: 'Qty', render: (r) => `${formatNumber(r.quantity)} ${r.unit || ''}` },
    { key: 'rate', header: 'Rate / unit', render: (r) => <strong>{money(r.rate)}{r.unit ? <span className="text-xs font-normal"> / {r.unit}</span> : null}</strong> },
    {
      key: 'change', header: 'Change', render: (r) => {
        const i = data.rows.indexOf(r);
        const prev = data.rows.slice(0, i).reverse().find((x) => String(x.brandId) === String(r.brandId));
        if (!prev || !prev.rate) return '-';
        const d = ((r.rate - prev.rate) / prev.rate) * 100;
        return <span className={d > 0 ? 'text-rose-600' : d < 0 ? 'text-emerald-600' : ''}>{d > 0 ? '+' : ''}{d.toFixed(1)}%</span>;
      },
    },
  ];
  const head = { product: 'Product', brand: 'Brand', productBrand: 'Product - Brand', vendor: 'Supplier', date: 'Date', category: 'Category', user: 'User' }[tab];
  const groupColumns = [
    { key: 'label', header: head, render: (r) => <span className="font-medium">{tab === 'date' ? formatDate(r.label) : r.label}</span> },
    { key: 'orders', header: 'Orders' },
    { key: 'qty', header: 'Qty purchased (stock unit)', render: (r) => `${formatNumber(r.qty)} ${r.unit || ''}` },
    { key: 'total', header: 'Purchase value', render: (r) => money(r.total) },
    { key: 'avgRate', header: 'Avg rate', render: (r) => money(r.avgRate) },
    { key: 'range', header: 'Min - Max rate', render: (r) => <span className="text-xs">{money(r.minRate)} - {money(r.maxRate)}</span> },
    { key: 'lastRate', header: 'Last rate', render: (r) => money(r.lastRate) },
    ...(STOCK_TABS.includes(tab) ? [{ key: 'stock', header: 'Available stock', render: (r) => <span className="inline-flex items-center gap-2 tabular-nums">{formatNumber(r.stock ?? 0)}{r.stockStatus && r.stockStatus !== 'in' && <StatusBadge status={STOCK_BADGE[r.stockStatus]} />}</span> }] : []),
    ...(tab === 'vendor' ? [
      { key: 'billed', header: 'Invoiced', render: (r) => money(r.billed) },
      { key: 'paid', header: 'Paid', render: (r) => money(r.paid) },
      { key: 'balance', header: 'Balance', render: (r) => money(r.balance) },
    ] : []),
    ...(['brand', 'vendor', 'category', 'user', 'date'].includes(tab) ? [{ key: 'productCount', header: 'Products' }] : []),
    ...(['product', 'productBrand', 'brand'].includes(tab) ? [{ key: 'vendorCount', header: 'Suppliers' }, { key: 'lastVendor', header: 'Last supplier' }] : []),
    ...(tab !== 'date' ? [{ key: 'lastDate', header: 'Last purchase', render: (r) => formatDate(r.lastDate) }] : []),
  ];

  const rateStats = tab === 'rates' && data.rows.length ? {
    min: Math.min(...data.rows.map((r) => r.rate)), max: Math.max(...data.rows.map((r) => r.rate)), last: data.rows[data.rows.length - 1].rate,
  } : null;

  return (
    <div>
      <PageHeader title="Purchase Analysis" crumbs={[{ label: 'Reports', to: '/reports' }, { label: 'Purchase Analysis' }]}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={FileSpreadsheet} loading={exporting === 'xlsx'} onClick={() => doExport('xlsx')}>Excel</Button>
            <Button variant="outline" icon={FileText} loading={exporting === 'pdf'} onClick={() => doExport('pdf')}>PDF</Button>
            <Button variant="outline" icon={FileDown} loading={exporting === 'csv'} onClick={() => doExport('csv')}>CSV</Button>
          </div>
        )} />

      {kpi && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <Stat label="Purchase value" value={formatCurrency(kpi.total)} hint={`${formatCurrency(kpi.amount)} before GST`} />
          <Stat label="Quantity purchased" value={formatNumber(kpi.qty)} hint={`${kpi.lines} line(s) on ${kpi.orders} order(s)`} />
          <Stat label="Average rate / piece" value={formatCurrency(kpi.avgRate)} />
          <Stat label="Available stock" value={kpi.stock === null || kpi.stock === undefined ? '-' : formatNumber(kpi.stock)} hint="of the products purchased" />
          <Stat label="Products / Suppliers" value={`${kpi.products} / ${kpi.vendors}`} />
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto mb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }} role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { if (t.key !== tab) setData({ rows: [], totals: null, pagination: null }); setTab(t.key); setPage(1); }}
            className="px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px"
            style={{ borderColor: tab === t.key ? 'var(--gold-600, #4f46e5)' : 'transparent', color: tab === t.key ? 'var(--text-primary)' : 'var(--text-muted)' }}>
            {t.label}
          </button>
        ))}
      </div>

      <FilterPanel value={filters} onChange={setFilter} onReset={() => setFilter(EMPTY)} primary={4}
        searchPlaceholder="Search product, brand, supplier or PO #..."
        sortOptions={tab === 'rates' ? undefined : (isLines ? LINE_SORTS : GROUP_SORTS)}
        fields={[
          { label: 'Purchase date', type: 'dateRange', minKey: 'from', maxKey: 'to' },
          { key: 'product', label: 'Product', type: 'select', options: list(opts.products) },
          { key: 'brand', label: 'Brand', type: 'select', options: [{ value: 'none', label: 'No brand' }, ...list(opts.brands)] },
          { key: 'vendor', label: 'Supplier', type: 'select', options: list(opts.vendors) },
          { key: 'category', label: 'Category', type: 'select', options: list(opts.categories) },
          { key: 'user', label: 'Entered by', type: 'select', options: list(opts.users) },
          { key: 'status', label: 'Order status', type: 'select', options: STATUS_OPTIONS, placeholder: 'All except cancelled' },
          { key: 'paymentStatus', label: 'Payment', type: 'select', options: PAYMENT_STATUS_OPTIONS },
          { label: 'Quantity', type: 'range', minKey: 'minQty', maxKey: 'maxQty' },
          { label: 'Rate per piece', type: 'range', minKey: 'minRate', maxKey: 'maxRate' },
          { label: 'Line amount', type: 'range', minKey: 'minAmount', maxKey: 'maxAmount' },
          ...(STOCK_TABS.includes(tab) ? [{ key: 'stock', label: 'Stock', type: 'select', options: STOCK_OPTIONS }] : []),
        ]} />

      {tab === 'rates' && !filters.product ? (
        <div className="surface-card rounded-xl p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Choose a product in the filters to see how its purchase rate changed over time (per brand and supplier).</div>
      ) : (
        <>
          {rateStats && (
            <div className="flex flex-wrap gap-5 text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              <span>Lowest: <strong>{money(rateStats.min)}</strong></span>
              <span>Highest: <strong>{money(rateStats.max)}</strong></span>
              <span>Latest: <strong>{money(rateStats.last)}</strong></span>
            </div>
          )}
          {!isLines && data.totals && (
            <div className="flex flex-wrap gap-5 text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              <span>{data.totals.groups} row(s)</span>
              <span>Quantity: <strong>{formatNumber(data.totals.qty)}</strong></span>
              <span>Value: <strong>{money(data.totals.total)}</strong></span>
              {data.totals.stock !== null && <span>Available stock: <strong>{formatNumber(data.totals.stock)}</strong></span>}
            </div>
          )}
          <DataTable loading={loading} rows={data.rows}
            emptyTitle="No purchases match these filters."
            columns={tab === 'rates' ? rateColumns : (isLines ? lineColumns : groupColumns)}
            pagination={data.pagination ? { ...data.pagination, onPageChange: setPage } : null} />
        </>
      )}
    </div>
  );
}

export default PurchaseAnalysis;
