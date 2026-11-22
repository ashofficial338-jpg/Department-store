import { useEffect, useMemo, useState } from 'react';
import { VendorName } from '../../components/vendors/VendorStatus.jsx';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X, Plus, Pencil, Ban, Copy } from 'lucide-react';
import { PageHeader, DataTable, Button, Select, StatusBadge, Modal, Input, Textarea } from '../../components/ui/index.js';
import { FilterPanel, cleanParams } from '../../components/ui/FilterPanel.jsx';
import ProductPicker from '../../components/ProductPicker.jsx';
import EditRequestDialog from '../../components/EditRequestDialog.jsx';
import RecordActivity from '../../components/RecordActivity.jsx';
import { purchaseService, vendorService, purchaseAnalysisService, editRequestService } from '../../services/index.js';
import { formatCurrency, formatDate } from '../../utils/format.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';
import { idOf, brandName, PAYMENT_STATUS_OPTIONS } from '../../utils/lines.js';
import { productService } from '../../services/index.js';
import { useFieldRules } from '../../hooks/useFieldRules.js';
import { toUnitMap, productUnits, productUnitList, convert, unitRate, allowsDecimal, unitShort, compatible } from '../../utils/units.js';

// Units: a line can be entered in any unit the product converts to (kg, g, box, bundle...). Default = the product's
// purchase unit, else its stock unit. Default rate = the product's own purchase rate for that unit, else its
// purchase price (per selling unit) converted to the unit.
function defaultUnit(product, units) {
  if (!units.size) return '';
  const { baseUnit } = productUnits(product, units);
  return product.purchaseUnit && units.has(product.purchaseUnit) && compatible(product.purchaseUnit, baseUnit, units, product) ? product.purchaseUnit : baseUnit;
}
function defaultRate(product, unit, units) {
  const own = unitRate(product, unit, 'purchasePrice');
  if (own !== null) return own;
  if (!(product.purchasePrice > 0) || !units.size) return '';
  const per = convert(1, unit, productUnits(product, units).sellingUnit, units, product);
  return Number.isNaN(per) ? '' : Math.round(product.purchasePrice * per * 100) / 100;
}

const STATUS_OPTIONS = ['draft', 'approved', 'partially_invoiced', 'invoiced', 'received', 'cancelled'].map((s) => ({ value: s, label: s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }));
const EMPTY_FILTERS = { search: '', vendor: '', status: '', paymentStatus: '', from: '', to: '', product: '', brand: '', category: '', user: '', minAmount: '', maxAmount: '', sort: 'date', order: 'desc' };
const SORTS = [{ value: 'date', label: 'Date' }, { value: 'total', label: 'Total' }, { value: 'paid', label: 'Paid' }, { value: 'poNumber', label: 'PO #' }, { value: 'status', label: 'Status' }];
const EDITABLE = ['draft', 'approved', 'ordered'];

let uidSeq = 0;
const newUid = () => `l${++uidSeq}`;
const n = (v) => Number(v) || 0;
const lineAmount = (l) => n(l.quantity) * n(l.unitPrice);
const lineTotal = (l) => lineAmount(l) * (1 + n(l.gstRate) / 100);
const fmtRate = (v) => (v === null || v === undefined ? '-' : formatCurrency(v));

// Lines editor: product + brand (optional) + quantity + rate per piece; amount = qty x rate (+ GST).
function PurchaseLines({ lines, setLines, units }) {
  const [newBrand, setNewBrand] = useState({}); // uid -> typed brand name

  async function addProduct(product) {
    const uid = newUid();
    const unit = defaultUnit(product, units);
    setLines((prev) => [...prev, { uid, product, brand: '', brandOptions: [], unit, quantity: 1, unitPrice: unit ? defaultRate(product, unit, units) : (product.purchasePrice || ''), gstRate: product.gstRate || 0 }]);
    loadBrands(uid, product._id);
  }

  async function loadBrands(uid, productId) {
    try {
      const res = await purchaseService.productBrands(productId);
      setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, brandOptions: res.data } : l)));
    } catch { /* brand list is optional */ }
  }

  const patch = (uid, p) => setLines((prev) => prev.map((l) => (l.uid === uid ? { ...l, ...p } : l)));

  function pickBrand(line, value) {
    if (value === '__new') { setNewBrand((s) => ({ ...s, [line.uid]: '' })); return; }
    const info = line.brandOptions.find((b) => String(b.brandId) === value);
    // Each brand keeps its own rate: start from the last rate paid for that brand.
    patch(line.uid, { brand: value, ...(info?.lastRate && !n(line.unitPrice) ? { unitPrice: info.lastRate } : {}) });
  }

  async function createBrand(line) {
    const name = (newBrand[line.uid] || '').trim();
    if (!name) return;
    try {
      const res = await purchaseService.quickBrand(name, line.product._id);
      const opt = { brandId: res.data._id, brandName: res.data.name, stock: 0 };
      setLines((prev) => prev.map((l) => (l.uid === line.uid
        ? { ...l, brand: res.data._id, brandOptions: l.brandOptions.some((b) => String(b.brandId) === res.data._id) ? l.brandOptions : [...l.brandOptions, opt] }
        : l)));
      setNewBrand((s) => { const c = { ...s }; delete c[line.uid]; return c; });
      toast.success(res.existing ? `Using existing brand "${res.data.name}".` : `Brand "${res.data.name}" added.`);
    } catch (err) { toast.error(err.message); }
  }

  function anotherBrand(line) {
    const uid = newUid();
    setLines((prev) => {
      const i = prev.findIndex((l) => l.uid === line.uid);
      const copy = { uid, product: line.product, brand: '', brandOptions: line.brandOptions, unit: line.unit, quantity: 1, unitPrice: '', gstRate: line.gstRate };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }

  const subtotal = lines.reduce((s, l) => s + lineAmount(l), 0);
  const total = lines.reduce((s, l) => s + lineTotal(l), 0);
  const inputCls = 'rounded border px-1.5 py-1 text-xs w-full';
  const inputStyle = { borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-2">
      <div>
        <span className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Add Products</span>
        <ProductPicker onSelect={addProduct} allowCreate placeholder="Search a product, or type a new product name..." />
      </div>
      {lines.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[11px] uppercase" style={{ color: 'var(--text-muted)' }}>
                <th className="text-left py-1 font-semibold">Product</th>
                <th className="text-left font-semibold w-40">Brand</th>
                <th className="text-right font-semibold w-20">Qty</th>
                <th className="text-left font-semibold w-28">Unit</th>
                <th className="text-right font-semibold w-24">Rate / unit</th>
                <th className="text-right font-semibold w-16">GST %</th>
                <th className="text-right font-semibold w-28">Amount</th>
                <th className="w-14" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const info = l.brandOptions.find((b) => String(b.brandId) === String(l.brand));
                return (
                  <tr key={l.uid} className="align-top" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-2 pr-2">
                      <div className="font-medium truncate max-w-[280px]" title={l.product.name}>{l.product.name}</div>
                      {info && (
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          Stock {info.stock ?? 0}{info.lastRate ? ` · last ${formatCurrency(info.lastRate)}` : ''}{info.lastVendor ? ` · ${info.lastVendor}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      {newBrand[l.uid] !== undefined ? (
                        <div className="flex gap-1">
                          <input autoFocus value={newBrand[l.uid]} placeholder="Brand name" onChange={(e) => setNewBrand((s) => ({ ...s, [l.uid]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createBrand(l); } if (e.key === 'Escape') setNewBrand((s) => { const c = { ...s }; delete c[l.uid]; return c; }); }}
                            className={inputCls} style={inputStyle} />
                          <button type="button" onClick={() => createBrand(l)} className="px-1.5 rounded border text-xs" style={inputStyle}>Add</button>
                        </div>
                      ) : (
                        <select value={l.brand ? String(l.brand) : ''} onChange={(e) => pickBrand(l, e.target.value)} className={inputCls} style={inputStyle} aria-label="Brand">
                          <option value="">No brand</option>
                          {l.brandOptions.map((b) => <option key={String(b.brandId)} value={String(b.brandId)}>{b.brandName}</option>)}
                          <option value="__new">+ New brand...</option>
                        </select>
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <input type="number" min={0} step={allowsDecimal(units.get(l.unit)) ? 'any' : 1} value={l.quantity} onChange={(e) => patch(l.uid, { quantity: e.target.value })} className={`${inputCls} text-right`} style={inputStyle} aria-label="Quantity" />
                      {(() => {
                        if (!units.size || !l.unit) return null;
                        const base = productUnits(l.product, units).baseUnit;
                        const q = Number(l.quantity);
                        if (base === l.unit || !(q > 0)) return null;
                        const b = convert(q, l.unit, base, units, l.product);
                        return Number.isNaN(b) ? null : <div className="text-[11px] text-right" style={{ color: 'var(--text-muted)' }}>= {b} {unitShort(base, units, b)}</div>;
                      })()}
                    </td>
                    <td className="py-2 pr-2">
                      <select value={l.unit || ''} onChange={(e) => patch(l.uid, { unit: e.target.value, unitPrice: defaultRate(l.product, e.target.value, units) || l.unitPrice })}
                        className={inputCls} style={inputStyle} aria-label="Unit">
                        {(units.size ? productUnitList(l.product, units) : [l.unit]).filter(Boolean).map((u) => <option key={u} value={u}>{units.get(u)?.label || u}</option>)}
                      </select>
                    </td>
                    <td className="py-2 pr-2"><input type="number" min={0} step="0.01" value={l.unitPrice} placeholder="0.00" onChange={(e) => patch(l.uid, { unitPrice: e.target.value })} className={`${inputCls} text-right`} style={inputStyle} aria-label="Rate per piece" /></td>
                    <td className="py-2 pr-2"><input type="number" min={0} max={100} step="any" value={l.gstRate} onChange={(e) => patch(l.uid, { gstRate: e.target.value })} className={`${inputCls} text-right`} style={inputStyle} aria-label="GST %" /></td>
                    <td className="py-2 pr-2 text-right tabular-nums">
                      <div>{formatCurrency(lineAmount(l))}</div>
                      {n(l.gstRate) > 0 && <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatCurrency(lineTotal(l))} incl. GST</div>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      <button type="button" title="Add the same product under another brand" onClick={() => anotherBrand(l)} className="p-1 text-graphite-400 hover:text-gold-700"><Copy size={13} /></button>
                      <button type="button" title="Remove line" onClick={() => setLines((prev) => prev.filter((p) => p.uid !== l.uid))} className="p-1 text-graphite-400 hover:text-rose-500"><X size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {lines.length > 0 && (
        <div className="flex justify-end gap-6 text-sm pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <span>Lines: <strong>{lines.length}</strong></span>
          <span>Amount: <strong>{formatCurrency(subtotal)}</strong></span>
          <span>GST: <strong>{formatCurrency(total - subtotal)}</strong></span>
          <span>Total: <strong>{formatCurrency(total)}</strong></span>
        </div>
      )}
    </div>
  );
}

// Supplier picker with "new supplier" entry (name required; mobile and GSTIN optional).
function VendorField({ vendors, value, onChange, onCreated }) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', gstin: '' });
  const [saving, setSaving] = useState(false);
  const selected = vendors.find((v) => v._id === value);

  async function save() {
    if (!form.name.trim()) { toast.error('Enter the supplier name.'); return; }
    setSaving(true);
    try {
      const res = await vendorService.quick({ name: form.name, phone: form.phone || undefined, gstin: form.gstin || undefined });
      toast.success(res.existing ? res.message : `Supplier "${res.data.name}" added - waiting for admin verification.`);
      onCreated(res.data);
      setAdding(false); setForm({ name: '', phone: '', gstin: '' });
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  if (adding) {
    return (
      <div className="p-3 rounded-lg border space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>New supplier</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input label="Supplier name" required value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} autoFocus />
          <Input label="Mobile (optional)" value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
          <Input label="GSTIN (optional)" value={form.gstin} onChange={(e) => setForm((s) => ({ ...s, gstin: e.target.value }))} />
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="outline" onClick={() => setAdding(false)}>Cancel</Button>
          <Button size="sm" onClick={save} loading={saving}>Save Supplier</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <Select label="Supplier" required value={value} onChange={(e) => onChange(e.target.value)}
          hint={selected && selected.verificationStatus !== 'verified' ? 'Not verified yet: the order is saved as a draft until an admin verifies this supplier.' : undefined}>
          <option value="">Select supplier</option>
          {vendors.map((v) => <option key={v._id} value={v._id}>{v.name}{v.verificationStatus !== 'verified' ? ' (awaiting verification)' : ''}</option>)}
        </Select>
      </div>
      <Button variant="outline" icon={Plus} onClick={() => setAdding(true)}>New Supplier</Button>
    </div>
  );
}

const toPayload = (vendor, lines, notes) => ({
  vendor,
  notes: notes || undefined,
  items: lines.map((l) => ({ product: l.product._id, brand: l.brand || undefined, unit: l.unit || undefined, quantity: Number(l.quantity), unitPrice: l.unitPrice === '' ? 0 : Number(l.unitPrice), gstRate: Number(l.gstRate) || 0 })),
});

export function PurchaseOrders() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [opts, setOpts] = useState({ vendors: [], products: [], brands: [], categories: [], users: [] });
  const [vendors, setVendors] = useState([]);

  // form: { mode: 'create' | 'edit' | 'request', po }
  const [form, setForm] = useState(null);
  const [vendor, setVendor] = useState('');
  const [lines, setLines] = useState([]);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState(null);
  const [payAmount, setPayAmount] = useState('');
  const [cancelReq, setCancelReq] = useState(false);
  const [cancelAsk, setCancelAsk] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [activityKey, setActivityKey] = useState(0);

  const params = useMemo(() => cleanParams({ ...filters, page, limit: 25 }), [filters, page]);

  function load() {
    setLoading(true);
    purchaseService.list(params).then((r) => { setRows(r.data); setPagination(r.pagination); setSummary(r.summary); })
      .catch((err) => toast.error(err.message)).finally(() => setLoading(false));
  }
  useEffect(() => { const t = setTimeout(load, filters.search ? 300 : 0); return () => clearTimeout(t); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  function loadVendors() { return vendorService.forPurchase().then((r) => setVendors(r.data)).catch(() => {}); }
  const [units, setUnits] = useState(new Map());
  const fieldRules = useFieldRules();
  useEffect(() => { productService.units().then((r) => setUnits(toUnitMap(r.data))).catch(() => {}); }, []);
  useEffect(() => {
    loadVendors();
    purchaseAnalysisService.options().then((r) => setOpts(r.data)).catch(() => {});
  }, []);

  const setFilter = (next) => { setFilters(next); setPage(1); };

  function openCreate() {
    setForm({ mode: 'create' }); setVendor(''); setLines([]); setNotes(''); setReason('');
  }

  async function openEdit(po, mode) {
    setDetail(null);
    setForm({ mode, po });
    setVendor(idOf(po.vendor)); setNotes(po.notes || ''); setReason('');
    const initial = po.items.map((it) => ({
      uid: newUid(), product: it.product, brand: idOf(it.brand), brandOptions: it.brand?._id ? [{ brandId: it.brand._id, brandName: it.brand.name }] : [],
      unit: it.unit || '', quantity: it.quantity, unitPrice: it.unitPrice, gstRate: it.gstRate || 0,
    }));
    setLines(initial);
    initial.forEach((l) => purchaseService.productBrands(l.product._id).then((r) => setLines((prev) => prev.map((x) => (x.uid === l.uid ? { ...x, brandOptions: r.data } : x)))).catch(() => {}));
  }

  async function submitForm(approve = true) {
    if (!vendor) { toast.error('Select a supplier (or add a new one).'); return; }
    if (!lines.length) { toast.error('Add at least one product.'); return; }
    if (lines.some((l) => !(Number(l.quantity) > 0))) { toast.error('Every line needs a quantity.'); return; }
    const payload = toPayload(vendor, lines, notes);
    setSaving(true);
    try {
      if (form.mode === 'create') {
        const res = await purchaseService.create({ ...payload, approve });
        if (res.notice) toast(res.notice, { icon: 'ℹ️', duration: 6000 });
        else toast.success(approve ? 'Purchase order saved and approved.' : 'Purchase order saved as draft.');
      } else if (form.mode === 'edit') {
        await purchaseService.update(form.po._id, payload);
        toast.success('Purchase order updated.');
      } else {
        if (fieldRules.req('editRequest', 'reason') && !reason.trim()) { toast.error('Tell the administrator what you changed and why.'); setSaving(false); return; }
        await editRequestService.create({ entity: 'Purchase', entityId: form.po._id, action: 'update', changes: payload, reason: reason.trim() });
        toast.success('Change request sent to the administrator.');
      }
      setForm(null);
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function openDetail(row) {
    try {
      const res = await purchaseService.getOne(row._id);
      setDetail(res.data);
      setPayAmount('');
      setActivityKey((k) => k + 1);
    } catch (err) { toast.error(err.message); }
  }

  async function approve() {
    try {
      await purchaseService.approve(detail._id);
      toast.success('Purchase order approved.');
      await openDetail(detail);
      load();
    } catch (err) { toast.error(err.message); }
  }

  async function cancelPO() {
    try {
      await purchaseService.cancel(detail._id, { reason: cancelReason || undefined });
      toast.success('Purchase order cancelled.');
      setCancelAsk(false); setCancelReason(''); setDetail(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  async function submitPayment() {
    try {
      await purchaseService.pay(detail._id, { amount: Number(payAmount), method: 'bank_transfer' });
      toast.success('Payment recorded.');
      setDetail(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  const editable = detail && EDITABLE.includes(detail.status) && !(detail.invoices?.length) && !(detail.invoicedAmount > 0);
  const optionList = (list, label = (x) => x.name) => list.map((x) => ({ value: x._id, label: label(x) }));

  return (
    <div>
      <PageHeader title="Purchase Orders" actions={<Button icon={Plus} onClick={openCreate}>New Purchase Order</Button>} />

      <FilterPanel
        value={filters} onChange={setFilter} onReset={() => setFilter(EMPTY_FILTERS)}
        searchPlaceholder="Search PO #, supplier or product..." sortOptions={SORTS} primary={4}
        fields={[
          { key: 'vendor', label: 'Supplier', type: 'select', options: optionList(opts.vendors) },
          { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
          { key: 'paymentStatus', label: 'Payment', type: 'select', options: PAYMENT_STATUS_OPTIONS },
          { label: 'Purchase date', type: 'dateRange', minKey: 'from', maxKey: 'to' },
          { key: 'product', label: 'Product', type: 'select', options: optionList(opts.products) },
          { key: 'brand', label: 'Brand', type: 'select', options: optionList(opts.brands) },
          { key: 'category', label: 'Category', type: 'select', options: optionList(opts.categories) },
          { key: 'user', label: 'Entered by', type: 'select', options: optionList(opts.users) },
          { label: 'Order total', type: 'range', minKey: 'minAmount', maxKey: 'maxAmount' },
        ]}
      />

      {summary && (
        <div className="flex flex-wrap gap-5 text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          <span>{pagination?.total ?? 0} order(s)</span>
          <span>Order value: <strong>{formatCurrency(summary.total)}</strong></span>
          <span>Invoiced: <strong>{formatCurrency(summary.billed)}</strong></span>
          <span>Paid: <strong>{formatCurrency(summary.paid)}</strong></span>
          <span>Balance: <strong>{formatCurrency(summary.billed - summary.paid)}</strong></span>
        </div>
      )}

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle={Object.values(cleanParams({ ...filters, sort: '', order: '' })).length ? 'No purchase orders match these filters.' : 'No purchase orders yet.'}
        onRowClick={openDetail}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'poNumber', header: 'PO #', render: (r) => <span className="font-mono text-xs">{r.poNumber}</span> },
          { key: 'vendor', header: 'Supplier', render: (r) => <VendorName vendor={r.vendor} /> },
          { key: 'createdAt', header: 'Date', render: (r) => formatDate(r.createdAt) },
          { key: 'items', header: 'Lines', render: (r) => r.items?.length || 0 },
          { key: 'grandTotal', header: 'Total', render: (r) => formatCurrency(r.grandTotal) },
          { key: 'amountPaid', header: 'Paid', render: (r) => formatCurrency(r.amountPaid) },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          { key: 'orderedBy', header: 'Entered by', render: (r) => <span className="text-xs">{r.orderedBy?.name || '-'}</span> },
        ]}
      />

      <Modal open={!!form} onClose={() => setForm(null)} size="xl"
        title={form?.mode === 'create' ? 'New Purchase Order' : form?.mode === 'edit' ? `Edit ${form?.po?.poNumber}` : `Request change: ${form?.po?.poNumber}`}
        footer={(
          <>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            {form?.mode === 'create' && <Button variant="outline" onClick={() => submitForm(false)} loading={saving}>Save as Draft</Button>}
            <Button onClick={() => submitForm(true)} loading={saving}>
              {form?.mode === 'create' ? `Save & Approve (${formatCurrency(lines.reduce((s, l) => s + lineTotal(l), 0))})` : form?.mode === 'edit' ? 'Save Changes' : 'Send to Admin'}
            </Button>
          </>
        )}
      >
        {form && (
          <div className="space-y-4">
            <VendorField vendors={vendors} value={vendor} onChange={setVendor}
              onCreated={(v) => { loadVendors().then(() => setVendor(v._id)); setVendors((prev) => (prev.some((x) => x._id === v._id) ? prev : [...prev, v])); setVendor(v._id); }} />
            <PurchaseLines lines={lines} setLines={setLines} units={units} />
            <Textarea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
            {form.mode === 'request' && (
              <Textarea label="Reason for the change (for the administrator)" required={fieldRules.req('editRequest', 'reason')} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            )}
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Only supplier, product and quantity are required; everything else is optional unless an administrator made it mandatory. Amount = quantity &times; rate per unit (any unit the product converts to: kg, g, box, bundle...). A purchase order does not change stock; stock comes in on the Inward DC.
            </p>
          </div>
        )}
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.poNumber} size="lg">
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1">Supplier: <strong><VendorName vendor={detail.vendor} always /></strong></span>
              <StatusBadge status={detail.status} />
            </div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Entered by {detail.orderedBy?.name || '-'} on {formatDate(detail.createdAt)}
              {detail.approvedBy ? ` · Approved by ${detail.approvedBy.name}${detail.approvedAt ? ` on ${formatDate(detail.approvedAt)}` : ''}` : ''}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-xs" style={{ color: 'var(--text-muted)' }}><th className="text-left py-1">Product</th><th className="text-left">Brand</th><th className="text-right">Qty</th><th className="text-right">Rate / pc</th><th className="text-right">Amount</th><th className="text-right">Invoiced</th><th className="text-right">Received</th></tr></thead>
                <tbody>
                  {detail.items.map((it, i) => (
                    <tr key={`${idOf(it.product)}-${idOf(it.brand)}-${i}`} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                      <td className="py-1.5">{it.product?.name || idOf(it.product)}</td>
                      <td>{brandName(it) || <span style={{ color: 'var(--text-muted)' }}>-</span>}</td>
                      <td className="text-right">{it.quantity} {it.unit || ''}</td>
                      <td className="text-right">{fmtRate(it.unitPrice)}{it.gstRate ? ` + ${it.gstRate}%` : ''}</td>
                      <td className="text-right">{formatCurrency(it.totalAmount ?? it.quantity * it.unitPrice)}</td>
                      <td className="text-right">{it.invoicedQuantity || 0}</td>
                      <td className="text-right">{it.receivedQuantity || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {detail.notes && <p className="text-sm"><span style={{ color: 'var(--text-muted)' }}>Notes:</span> {detail.notes}</p>}

            {detail.invoices?.length > 0 && (
              <div className="text-sm">
                <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Purchase Invoices</div>
                {detail.invoices.map((inv) => (
                  <div key={inv._id} className="flex justify-between py-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <span className="font-mono text-xs">{inv.invoiceNumber}{inv.vendorInvoiceNumber ? ` (${inv.vendorInvoiceNumber})` : ''}</span>
                    <span>{formatCurrency(inv.grandTotal)}</span>
                    <StatusBadge status={inv.status} />
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {detail.status === 'draft' && <Button onClick={approve}>Approve</Button>}
              {['approved', 'ordered', 'partially_invoiced'].includes(detail.status) && (
                <Button onClick={() => navigate(`/purchasing/invoices?po=${detail._id}`)}>Create Purchase Invoice</Button>
              )}
              {editable && admin && <Button variant="outline" icon={Pencil} onClick={() => openEdit(detail, 'edit')}>Edit</Button>}
              {editable && admin && <Button variant="outline" icon={Ban} onClick={() => setCancelAsk(true)}>Cancel Order</Button>}
              {editable && !admin && <Button variant="outline" icon={Pencil} onClick={() => openEdit(detail, 'request')}>Request Change</Button>}
              {editable && !admin && <Button variant="outline" icon={Ban} onClick={() => setCancelReq(true)}>Request Cancellation</Button>}
            </div>

            <div className="flex flex-wrap justify-between gap-2 text-sm pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <span>Total: <strong>{formatCurrency(detail.grandTotal)}</strong></span>
              <span>Paid: <strong>{formatCurrency(detail.amountPaid)}</strong></span>
              {detail.invoicedAmount !== undefined && <span>Invoiced: <strong>{formatCurrency(detail.invoicedAmount)}</strong></span>}
              <span className="text-rose-600">Balance: <strong>{formatCurrency((detail.invoicedAmount ?? detail.grandTotal) - detail.amountPaid)}</strong></span>
            </div>

            {!['draft', 'cancelled'].includes(detail.status) && detail.amountPaid < (detail.invoicedAmount ?? detail.grandTotal) && (
              <div className="flex items-end gap-3">
                <Input label="Pay Amount" type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                <Button variant="outline" onClick={submitPayment}>Record Payment</Button>
              </div>
            )}

            <RecordActivity key={activityKey} entity="Purchase" id={detail._id} />
          </div>
        )}
      </Modal>

      <Modal open={cancelAsk} onClose={() => setCancelAsk(false)} size="sm" title={`Cancel ${detail?.poNumber || ''}?`}
        footer={<><Button variant="outline" onClick={() => setCancelAsk(false)}>Keep Order</Button><Button variant="danger" onClick={cancelPO}>Cancel Order</Button></>}>
        <div className="space-y-3">
          <p className="text-sm">The order stays in the history as cancelled and can no longer be invoiced.</p>
          <Textarea label="Reason (optional)" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </div>
      </Modal>

      <EditRequestDialog open={cancelReq} onClose={() => setCancelReq(false)} entity="Purchase" record={detail} action="delete"
        title={`Request cancellation: ${detail?.poNumber || ''}`} onSent={() => setActivityKey((k) => k + 1)} />
    </div>
  );
}

export default PurchaseOrders;
