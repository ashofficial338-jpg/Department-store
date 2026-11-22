import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Pencil, ArrowLeft, Ban } from 'lucide-react';
import { PageHeader, Button, StatusBadge } from '../../components/ui/index.js';
import PageLoader from '../../components/ui/PageLoader.jsx';
import RecordActivity from '../../components/RecordActivity.jsx';
import EditRequestDialog from '../../components/EditRequestDialog.jsx';
import { productService } from '../../services/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin, hasPermission } from '../../utils/permissions.js';
import { formatCurrency, formatDate, formatNumber } from '../../utils/format.js';

// One product, everything about it: details, pricing, stock (total, per brand, batches), purchase / rate history,
// sales and stock movements. All read live, so it always matches Purchase, Sales and Inventory.
const muted = { color: 'var(--text-muted)' };

function Card({ title, children, right }) {
  return (
    <section className="surface-card rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}
function Stat({ label, value, hint, tone }) {
  return (
    <div className="surface-card rounded-xl p-4">
      <div className="text-[11px] font-semibold uppercase" style={muted}>{label}</div>
      <div className={`text-lg font-semibold mt-1 tabular-nums ${tone === 'bad' ? 'text-rose-600' : ''}`}>{value}</div>
      {hint && <div className="text-xs mt-0.5" style={muted}>{hint}</div>}
    </div>
  );
}
function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <span style={muted}>{label}</span><span className="text-right" style={{ color: 'var(--text-primary)' }}>{children ?? '-'}</span>
    </div>
  );
}
function Table({ head, rows, empty }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[520px]">
        <thead><tr className="text-xs" style={muted}>{head.map((h, i) => <th key={h} className={`py-1 ${i === 0 ? 'text-left' : 'text-right'} font-medium`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={head.length} className="py-3 text-center" style={muted}>{empty}</td></tr>}
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
              {r.map((c, j) => <td key={j} className={`py-1.5 ${j === 0 ? 'text-left' : 'text-right'} tabular-nums`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
const TYPE_LABEL = { inward_dc: 'Inward DC', outward_dc: 'Outward DC', sale: 'Sale', sale_return: 'Sales return', stock_adjustment: 'Adjustment', opening_stock: 'Opening stock', damage: 'Damage', expiry_writeoff: 'Expiry write-off', purchase_receipt: 'Purchase receipt', purchase_return: 'Purchase return' };

export function ProductView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const admin = isAdmin(user);
  // Viewing is open to Inventory / Purchasing / Reports users; changing (or asking to) needs the Products module.
  const canProducts = hasPermission(user, 'products');
  const [data, setData] = useState(null);
  const [removeReq, setRemoveReq] = useState(false);

  useEffect(() => {
    setData(null);
    productService.overview(id).then((r) => setData(r.data)).catch((err) => { toast.error(err.message); navigate('/products'); });
  }, [id, navigate]);

  if (!data) return <PageLoader />;
  const p = data.product;
  const unit = p.baseUnit || p.sellingUnit || p.unit || '';
  const per = p.sellingUnit || p.unit || 'unit';
  const sp = p.sellingPrice || 0;
  const net = sp * (1 - (p.discountPercent || 0) / 100);
  const margin = p.purchasePrice > 0 && sp > 0 ? ((net - p.purchasePrice) / p.purchasePrice) * 100 : null;
  const brands = [...new Set([p.brand?.name, ...(p.brands || []).map((b) => b.name)].filter(Boolean))];
  const lastRate = data.purchases.rows[0];

  return (
    <div className="space-y-4">
      <PageHeader title={p.name} crumbs={[{ label: 'Products', to: '/products' }, { label: 'Product Master', to: '/products' }, { label: p.name }]}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" icon={ArrowLeft} onClick={() => navigate('/products')}>All products</Button>
            {canProducts && <Button icon={Pencil} onClick={() => navigate(`/products/${id}/edit`)}>{admin ? 'Edit' : 'Request change'}</Button>}
            {canProducts && !admin && <Button variant="outline" icon={Ban} onClick={() => setRemoveReq(true)}>Request removal</Button>}
          </div>
        )} />

      <div className="flex flex-wrap items-center gap-2 text-sm" style={muted}>
        <StatusBadge status={p.status} />
        <StatusBadge status={data.stock.status} />
        <span>SKU <span className="font-mono">{p.sku}</span></span>
        {p.barcode && <span>· Barcode <span className="font-mono">{p.barcode}</span></span>}
        {p.category?.name && <span>· {p.category.name}{p.subcategory?.name ? ` › ${p.subcategory.name}` : ''}</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Stat label="Available stock" value={`${formatNumber(data.stock.current)} ${unit}`} hint={`reorder at ${p.reorderLevel ?? 10}`} tone={data.stock.status !== 'in_stock' ? 'bad' : undefined} />
        <Stat label="Stock value" value={formatCurrency(data.stock.value)} hint="at purchase price" />
        <Stat label="Purchased" value={`${formatNumber(data.purchases.totals.qty)} ${unit}`} hint={`${formatCurrency(data.purchases.totals.total)} on ${data.purchases.totals.orders} order(s)`} />
        <Stat label="Sold" value={`${formatNumber(data.sales.qty)} ${unit}`} hint={`${formatCurrency(data.sales.value)} on ${data.sales.bills} bill(s)`} />
        <Stat label="Last purchase rate" value={lastRate ? formatCurrency(lastRate.rate) : '-'} hint={lastRate ? `${lastRate.vendorName} · ${formatDate(lastRate.date)}` : 'not purchased yet'} />
        <Stat label="Margin" value={margin === null ? '-' : `${margin.toFixed(1)}%`} hint="selling vs purchase price" tone={margin !== null && margin < 0 ? 'bad' : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Product details">
          <Row label="Category">{p.category?.name}</Row>
          <Row label="Sub-category">{p.subcategory?.name}</Row>
          <Row label="Brands">{brands.length ? brands.join(', ') : null}</Row>
          <Row label="Main brand">{p.brand?.name}</Row>
          <Row label="HSN">{p.hsn}</Row>
          <Row label="Type">{p.productType ? (p.productType === 'loose' ? 'Loose' : 'Pre-packed') : null}</Row>
          <Row label="Selling / stock unit">{[p.sellingUnit, p.baseUnit].filter(Boolean).join(' / ') || p.unit}</Row>
          <Row label="Purchase unit">{p.purchaseUnit}</Row>
          {p.packUnit && <Row label="Pack content">{`1 ${p.packUnit} = ${p.packQuantity} ${p.packQuantityUnit}`}</Row>}
          <Row label="Preferred supplier">{p.primaryVendor?.name}</Row>
          {p.description && <p className="text-sm pt-2" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}>{p.description}</p>}
        </Card>
        <Card title="Pricing & GST">
          <Row label={`Purchase price / ${per}`}>{formatCurrency(p.purchasePrice || 0)}</Row>
          <Row label={`Selling price / ${per}`}>{sp > 0 ? formatCurrency(sp) : 'Rate at billing'}</Row>
          <Row label="MRP">{p.mrp > 0 ? formatCurrency(p.mrp) : null}</Row>
          <Row label="Discount">{p.discountPercent ? `${p.discountPercent}%` : null}</Row>
          <Row label="GST">{`${p.gstRate || 0}%`}</Row>
          <Row label="Customer pays (incl. GST)">{sp > 0 ? formatCurrency(Math.round(net * (1 + (p.gstRate || 0) / 100) * 100) / 100) : null}</Row>
          <Row label="MRP check">{p.mrp > 0 && sp > 0 ? (sp <= p.mrp ? 'Within MRP' : <span className="text-rose-600">Above MRP</span>) : null}</Row>
        </Card>
        <Card title="Stock settings & additional details">
          <Row label="Reorder level">{p.reorderLevel ?? 10}</Row>
          <Row label="Min / max stock">{`${p.minStock || 0} / ${p.maxStock || '-'}`}</Row>
          <Row label="Shelf life">{p.shelfLifeDays ? `${p.shelfLifeDays} days` : null}</Row>
          <Row label="Reserved / damaged">{`${data.stock.reserved} / ${data.stock.damaged}`}</Row>
          {(p.attributes || []).map((a) => <Row key={a.name} label={a.name}>{a.value}</Row>)}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Stock by brand">
          <Table head={['Brand', `Stock (${unit})`, 'Batches', 'Last rate']} empty="No brand stock yet."
            rows={data.stock.byBrand.map((b) => [b.brandName, formatNumber(b.stock), b.batches, b.lastRate === null ? '-' : formatCurrency(b.lastRate)])} />
        </Card>
        <Card title="Batches" right={<Link to="/products/batches" className="text-xs underline" style={muted}>Batch Management</Link>}>
          <Table head={['Batch', 'Brand', 'Received', 'Available', 'Rate', 'Expiry']} empty="No batches yet - stock arrives on an Inward DC."
            rows={data.batches.slice(0, 12).map((b) => [<span key="n" className="font-mono text-xs">{b.batchNumber}</span>, b.brand || '-', formatNumber(b.quantity), formatNumber(b.available), formatCurrency(b.purchasePrice), b.expiryDate ? formatDate(b.expiryDate) : '-'])} />
        </Card>
      </div>

      <Card title="Purchase & rate history" right={<Link to="/reports/purchase-analysis" className="text-xs underline" style={muted}>Purchase Analysis</Link>}>
        <Table head={['Date', 'PO #', 'Supplier', 'Brand', 'Qty', 'Rate', 'Total', 'Received']} empty="Not purchased yet."
          rows={data.purchases.rows.map((r) => [formatDate(r.date), <span key="po" className="font-mono text-xs">{r.poNumber}</span>, r.vendorName, r.brandName, `${formatNumber(r.quantity)} ${r.unit || ''}`, `${formatCurrency(r.rate)}${r.unit ? ` / ${r.unit}` : ''}`, formatCurrency(r.total), formatNumber(r.receivedQty)])} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Recent sales" right={<Link to={`/sales/history?product=${id}`} className="text-xs underline" style={muted}>Sales History</Link>}>
          <Table head={['Date', 'Bill', 'Customer', 'Qty', 'Amount', 'Due']} empty="Not sold yet."
            rows={data.sales.recent.map((s) => [formatDate(s.date), <span key="b" className="font-mono text-xs">{s.invoiceNumber}</span>, s.customer, `${formatNumber(s.qty)} ${s.unit || ''}`, formatCurrency(s.amount), s.amountDue > 0 ? formatCurrency(s.amountDue) : '-'])} />
        </Card>
        <Card title="Stock movements" right={<Link to="/inventory/ledger" className="text-xs underline" style={muted}>Stock Ledger</Link>}>
          <Table head={['Date', 'Type', 'Reference', 'Qty']} empty="No stock movement yet."
            rows={data.movements.map((m) => [formatDate(m.createdAt), TYPE_LABEL[m.type] || m.type, <span key="r" className="font-mono text-xs">{m.referenceNumber || '-'}</span>, <span key="q" className={m.quantity < 0 ? 'text-rose-600' : 'text-emerald-700'}>{m.quantity > 0 ? '+' : ''}{formatNumber(m.quantity)}</span>])} />
        </Card>
      </div>

      {canProducts && <section className="surface-card rounded-xl p-4"><RecordActivity entity="Product" id={id} /></section>}

      <EditRequestDialog open={removeReq} onClose={() => setRemoveReq(false)} entity="Product" record={p} action="delete" />
    </div>
  );
}

export default ProductView;
