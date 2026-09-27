import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { PageHeader, DataTable, Button } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { reportService } from '../../services/index.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' }, { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' }, { value: 'this_year', label: 'This Year' },
];

const REPORTS = [
  { key: 'sales', label: 'Sales Report', endpoint: '/reports/sales', csv: true },
  { key: 'purchases', label: 'Purchase Report', endpoint: '/reports/purchases', csv: true },
  { key: 'stock', label: 'Stock Report', endpoint: '/reports/stock', csv: true },
  { key: 'batches', label: 'Batch Report', endpoint: '/reports/batches', csv: false },
  { key: 'vendors', label: 'Vendor Report', endpoint: '/reports/vendors', csv: false },
  { key: 'customers', label: 'Customer Report', endpoint: '/reports/customers', csv: false },
  { key: 'products', label: 'Product Report', endpoint: '/reports/products', csv: false },
  { key: 'dc', label: 'DC Report', endpoint: '/reports/dc', csv: false },
];

const COLUMNS = {
  sales: [
    { key: 'invoiceNumber', header: 'Invoice #', render: (r) => <span className="font-mono text-xs">{r.invoiceNumber}</span> },
    { key: 'createdAt', header: 'Date', render: (r) => formatDate(r.createdAt) },
    { key: 'customer', header: 'Customer', render: (r) => r.customer?.name || 'Walk-in' },
    { key: 'grandTotal', header: 'Total', render: (r) => formatCurrency(r.grandTotal) },
    { key: 'status', header: 'Status' },
  ],
  purchases: [
    { key: 'poNumber', header: 'PO #', render: (r) => <span className="font-mono text-xs">{r.poNumber}</span> },
    { key: 'createdAt', header: 'Date', render: (r) => formatDate(r.createdAt) },
    { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name },
    { key: 'grandTotal', header: 'Total', render: (r) => formatCurrency(r.grandTotal) },
    { key: 'status', header: 'Status' },
  ],
  stock: [
    { key: 'product', header: 'Product', render: (r) => r.product?.name },
    { key: 'location', header: 'Location', render: (r) => r.store?.name || r.distributionCenter?.name },
    { key: 'currentStock', header: 'Stock' },
    { key: 'value', header: 'Value', render: (r) => formatCurrency((r.currentStock || 0) * (r.product?.purchasePrice || 0)) },
  ],
  batches: [
    { key: 'batchNumber', header: 'Batch #', render: (r) => <span className="font-mono text-xs">{r.batchNumber}</span> },
    { key: 'product', header: 'Product', render: (r) => r.product?.name },
    { key: 'availableQuantity', header: 'Available Qty' },
    { key: 'expiryDate', header: 'Expiry', render: (r) => formatDate(r.expiryDate) },
  ],
  vendors: [
    { key: 'name', header: 'Vendor' },
    { key: 'totalPurchases', header: 'Total Purchases', render: (r) => formatCurrency(r.totalPurchases) },
    { key: 'outstanding', header: 'Outstanding', render: (r) => formatCurrency(r.outstanding) },
    { key: 'orders', header: 'Orders' },
  ],
  customers: [
    { key: 'name', header: 'Customer' },
    { key: 'phone', header: 'Phone' },
    { key: 'totalSpend', header: 'Total Spend', render: (r) => formatCurrency(r.totalSpend) },
    { key: 'orders', header: 'Orders' },
  ],
  products: [
    { key: 'name', header: 'Product' },
    { key: 'sku', header: 'SKU' },
    { key: 'unitsSold', header: 'Units Sold' },
    { key: 'revenue', header: 'Revenue', render: (r) => formatCurrency(r.revenue) },
  ],
  dc: [],
};

export function ReportsCenter() {
  const [active, setActive] = useState('sales');
  const [range, setRange] = useState('this_month');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const report = REPORTS.find((r) => r.key === active);

  useEffect(() => {
    setLoading(true);
    const fn = { sales: reportService.sales, purchases: reportService.purchases, stock: reportService.stock, batches: reportService.batches, vendors: reportService.vendors, customers: reportService.customers, products: reportService.products, dc: reportService.dc }[active];
    fn({ range }).then((r) => setRows(active === 'dc' ? [] : (r.data || []))).finally(() => setLoading(false));
  }, [active, range]);

  return (
    <div>
      <PageHeader title="Reports Center" actions={<FilterSelect value={range} onChange={setRange} options={RANGE_OPTIONS} />} />

      <div className="flex flex-wrap gap-2 mb-5">
        {REPORTS.map((r) => (
          <button key={r.key} onClick={() => setActive(r.key)} className={`px-3.5 py-1.5 rounded-full text-xs font-medium ${active === r.key ? 'bg-graphite-900 text-white' : 'border'}`} style={active === r.key ? {} : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
            {r.label}
          </button>
        ))}
      </div>

      {report.csv && (
        <div className="mb-4">
          <a href={reportService.downloadCsvUrl(report.endpoint, { range })} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline" icon={Download}>Export CSV</Button>
          </a>
        </div>
      )}

      {active === 'dc' ? <DCReportView range={range} /> : (
        <DataTable loading={loading} rows={rows} keyField="_id" emptyTitle="No data for this report and period." columns={COLUMNS[active]} />
      )}
    </div>
  );
}

function DCReportView({ range }) {
  const [data, setData] = useState(null);
  useEffect(() => { reportService.dc({ range }).then((r) => setData(r.data)); }, [range]);
  if (!data) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="surface-card rounded-xl2 shadow-premium p-5">
        <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pending Inward DC</div>
        <div className="text-2xl font-display font-semibold">{data.pendingInward}</div>
      </div>
      <div className="surface-card rounded-xl2 shadow-premium p-5">
        <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Pending Outward DC</div>
        <div className="text-2xl font-display font-semibold">{data.pendingOutward}</div>
      </div>
      <div className="md:col-span-2">
        <DataTable
          loading={false} rows={data.stockByDC} keyField="_id" emptyTitle="No DC stock recorded."
          columns={[{ key: 'name', header: 'DC' }, { key: 'code', header: 'Code' }, { key: 'totalStock', header: 'Total Stock' }]}
        />
      </div>
    </div>
  );
}

export default ReportsCenter;
