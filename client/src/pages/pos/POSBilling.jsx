import { Fragment, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Search, Plus, Minus, Trash2, PauseCircle, PlayCircle, User, X, Printer } from 'lucide-react';
import { Button, Modal, Select, StatusBadge } from '../../components/ui/index.js';
import AlphabetFilter from '../../components/ui/AlphabetFilter.jsx';
import { productService, categoryService, customerService, salesService, storeService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatCurrency } from '../../utils/format.js';
import ReceiptView from './ReceiptView.jsx';

const PAYMENT_METHODS = [{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }, { value: 'bank_transfer', label: 'Bank Transfer' }, { value: 'credit', label: 'Credit' }];

export function POSBilling() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [stores, setStores] = useState([]);
  const [store, setStore] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [letter, setLetter] = useState('ALL');
  const debouncedSearch = useDebounce(search, 250);

  const [cart, setCart] = useState([]); // [{product, quantity, discountPercent}]
  const [customer, setCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState([]);
  const [isInterState, setIsInterState] = useState(false);

  const [payments, setPayments] = useState([{ method: 'cash', amount: 0 }]);
  const [heldBills, setHeldBills] = useState([]);
  const [heldOpen, setHeldOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    categoryService.listAll().then((r) => setCategories(r.data.filter((c) => !c.parent)));
    storeService.listAll().then((r) => { setStores(r.data); if (r.data[0]) setStore(r.data[0]._id); });
  }, []);

  useEffect(() => {
    productService.list({ search: debouncedSearch || undefined, category: category || undefined, letter: letter !== 'ALL' ? letter : undefined, limit: 24, status: 'active', withStock: true })
      .then((r) => setProducts(r.data));
  }, [debouncedSearch, category, letter]);

  useEffect(() => {
    if (!customerSearch.trim()) { setCustomerResults([]); return; }
    customerService.list({ search: customerSearch, limit: 5 }).then((r) => setCustomerResults(r.data));
  }, [customerSearch]);

  function addToCart(product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product._id === product._id);
      if (existing) return prev.map((i) => i.product._id === product._id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product, quantity: 1, discountPercent: product.discountPercent || 0 }];
    });
  }
  function updateQty(id, delta) {
    setCart((prev) => prev.map((i) => i.product._id === id ? { ...i, quantity: Math.max(1, i.quantity + delta) } : i).filter((i) => i.quantity > 0));
  }
  function updateDiscount(id, value) {
    setCart((prev) => prev.map((i) => i.product._id === id ? { ...i, discountPercent: value } : i));
  }
  function removeItem(id) {
    setCart((prev) => prev.filter((i) => i.product._id !== id));
  }

  const summary = useMemo(() => {
    let subtotal = 0, discount = 0, taxable = 0, cgst = 0, sgst = 0, igst = 0;
    const byRate = new Map(); // GST rate -> tax at that rate, for the "CGST @ 9%" rows
    for (const item of cart) {
      const gross = item.quantity * item.product.sellingPrice;
      const disc = (gross * (item.discountPercent || 0)) / 100;
      const net = gross - disc;
      const tax = (net * item.product.gstRate) / 100;
      subtotal += gross; discount += disc; taxable += net;
      byRate.set(item.product.gstRate, (byRate.get(item.product.gstRate) || 0) + tax);
      if (isInterState) igst += tax; else { cgst += tax / 2; sgst += tax / 2; }
    }
    const preRound = taxable + cgst + sgst + igst;
    const grandTotal = Math.round(preRound);
    const roundOff = grandTotal - preRound;
    const gstByRate = [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, tax]) => ({ rate, tax }));
    return { subtotal, discount, taxable, cgst, sgst, igst, roundOff, grandTotal, gstByRate };
  }, [cart, isInterState]);

  const totalPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  useEffect(() => {
    setPayments((prev) => prev.length === 1 ? [{ ...prev[0], amount: summary.grandTotal }] : prev);
  }, [summary.grandTotal]); // eslint-disable-line

  function resetCart() {
    setCart([]); setCustomer(null); setPayments([{ method: 'cash', amount: 0 }]);
  }

  async function holdBill() {
    if (!cart.length) { toast.error('Cart is empty.'); return; }
    try {
      await salesService.create({
        store, customer: customer?._id, isInterState, status: 'held',
        items: cart.map((i) => ({ product: i.product._id, quantity: i.quantity, discountPercent: i.discountPercent })),
      });
      toast.success('Bill held.');
      resetCart();
    } catch (err) { toast.error(err.message); }
  }

  async function openHeld() {
    const res = await salesService.held();
    setHeldBills(res.data);
    setHeldOpen(true);
  }

  async function resumeBill(bill) {
    setCart(bill.items.map((i) => ({ product: { _id: i.product, name: i.productName, sku: i.sku, sellingPrice: i.unitPrice, gstRate: i.gstRate }, quantity: i.quantity, discountPercent: i.discountPercent })));
    setHeldOpen(false);
    toast.success(`Resumed bill (was held). Complete payment to finalize.`);
    setCart((prev) => prev.map((i) => ({ ...i, __heldId: bill._id })));
  }

  async function completeSale() {
    if (!cart.length) { toast.error('Cart is empty.'); return; }
    if (totalPaid < summary.grandTotal && !payments.some((p) => p.method === 'credit')) {
      toast.error('Collected amount is less than the grand total.'); return;
    }
    setCompleting(true);
    try {
      const heldId = cart[0]?.__heldId;
      const payload = {
        store, customer: customer?._id, isInterState,
        items: cart.map((i) => ({ product: i.product._id, quantity: i.quantity, discountPercent: i.discountPercent })),
        payments: payments.filter((p) => Number(p.amount) > 0),
      };
      const res = heldId ? await salesService.resume(heldId, payload) : await salesService.create(payload);
      toast.success(`Invoice ${res.data.invoiceNumber} created.`);
      setReceipt(res.data);
      resetCart();
    } catch (err) { toast.error(err.message); } finally { setCompleting(false); }
  }

  return (
    <div className="h-[calc(100vh-6rem)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-semibold">POS Billing</h1>
        <div className="flex items-center gap-2">
          <Select value={store} onChange={(e) => setStore(e.target.value)} className="text-sm">
            {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
          <Button variant="outline" icon={PauseCircle} onClick={holdBill}>Hold Bill</Button>
          <Button variant="outline" icon={PlayCircle} onClick={openHeld}>Held Bills</Button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr_0.9fr] gap-5 min-h-0">
        {/* LEFT: catalog */}
        <div className="surface-card rounded-xl2 shadow-premium p-4 flex flex-col min-h-0">
          <div className="relative mb-3">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite-400" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Scan barcode or search product..."
              className="w-full rounded-lg border pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
              style={{ borderColor: 'var(--border-subtle)' }}
            />
          </div>
          <div className="flex gap-1.5 flex-wrap mb-2">
            <Chip active={!category} onClick={() => setCategory('')}>All</Chip>
            {categories.map((c) => <Chip key={c._id} active={category === c._id} onClick={() => setCategory(c._id)}>{c.name}</Chip>)}
          </div>
          <AlphabetFilter value={letter} onChange={setLetter} />
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 pr-1">
            {products.map((p) => (
              <button key={p._id} onClick={() => addToCart(p)} className="text-left surface-card rounded-xl p-3 hover:border-gold-400 hover:shadow-premium transition-all" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="text-sm font-medium truncate">{p.name}</div>
                <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>{p.sku} &middot; Stock {p.stock ?? 0}</div>
                <div className="text-sm font-display font-semibold text-gold-700">{formatCurrency(p.sellingPrice)}</div>
              </button>
            ))}
            {products.length === 0 && <p className="col-span-full text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>No products match your search.</p>}
          </div>
        </div>

        {/* CENTER: cart */}
        <div className="surface-card rounded-xl2 shadow-premium p-4 flex flex-col min-h-0">
          <h3 className="font-display text-base font-semibold mb-3">Cart ({cart.length})</h3>
          <div className="flex-1 overflow-y-auto space-y-2">
            {cart.map((item) => (
              <div key={item.product._id} className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--bg-surface-muted)' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{item.product.name}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatCurrency(item.product.sellingPrice)} &times; {item.quantity} &middot; GST {item.product.gstRate}%</div>
                </div>
                <button onClick={() => updateQty(item.product._id, -1)} className="w-6 h-6 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--border-subtle)' }}><Minus size={12} /></button>
                <span className="w-6 text-center text-sm">{item.quantity}</span>
                <button onClick={() => updateQty(item.product._id, 1)} className="w-6 h-6 rounded-full border flex items-center justify-center" style={{ borderColor: 'var(--border-subtle)' }}><Plus size={12} /></button>
                <button onClick={() => removeItem(item.product._id)} className="text-graphite-400 hover:text-rose-500 ml-1"><Trash2 size={14} /></button>
              </div>
            ))}
            {cart.length === 0 && <p className="text-center py-10 text-sm" style={{ color: 'var(--text-muted)' }}>Cart is empty. Click a product to add it.</p>}
          </div>
        </div>

        {/* RIGHT: billing */}
        <div className="surface-card rounded-xl2 shadow-premium p-4 flex flex-col min-h-0">
          <div className="mb-3">
            {customer ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gold-50 text-sm">
                <span className="flex items-center gap-1.5"><User size={13} /> {customer.name}</span>
                <button onClick={() => setCustomer(null)}><X size={14} /></button>
              </div>
            ) : (
              <div className="relative">
                <input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Customer (optional)" className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'var(--border-subtle)' }} />
                {customerResults.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full surface-card rounded-lg shadow-premium-lg max-h-40 overflow-y-auto">
                    {customerResults.map((c) => (
                      <button key={c._id} onClick={() => { setCustomer(c); setCustomerSearch(''); setCustomerResults([]); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gold-50">{c.name} &middot; {c.phone}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={isInterState} onChange={(e) => setIsInterState(e.target.checked)} className="accent-gold-500" /> Interstate sale (apply IGST)
          </label>

          <div className="space-y-1.5 text-sm mb-3 pb-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <SummaryRow label="Subtotal" value={summary.subtotal} />
            <SummaryRow label="Discount" value={-summary.discount} />
            <SummaryRow label="Taxable Amount" value={summary.taxable} />
            {summary.gstByRate.map(({ rate, tax }) => isInterState
              ? <SummaryRow key={rate} label={`IGST @ ${rate}%`} value={tax} />
              : (<Fragment key={rate}><SummaryRow label={`CGST @ ${rate / 2}%`} value={tax / 2} /><SummaryRow label={`SGST @ ${rate / 2}%`} value={tax / 2} /></Fragment>))}
            <SummaryRow label="Round Off" value={summary.roundOff} />
            <div className="flex justify-between font-display text-lg font-semibold pt-1"><span>Grand Total</span><span>{formatCurrency(summary.grandTotal)}</span></div>
          </div>

          <div className="space-y-2 mb-3">
            {payments.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select value={p.method} onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, method: e.target.value } : x))} className="rounded-lg border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--border-subtle)' }}>
                  {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input type="number" value={p.amount} onChange={(e) => setPayments((prev) => prev.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))} className="flex-1 rounded-lg border px-2 py-1.5 text-xs" style={{ borderColor: 'var(--border-subtle)' }} />
                {payments.length > 1 && <button onClick={() => setPayments((prev) => prev.filter((_, i) => i !== idx))}><X size={13} /></button>}
              </div>
            ))}
            <button onClick={() => setPayments((prev) => [...prev, { method: 'cash', amount: 0 }])} className="text-xs text-gold-700 font-medium">+ Split Payment</button>
            <div className="text-xs flex justify-between" style={{ color: totalPaid < summary.grandTotal ? '#C2483C' : 'var(--text-muted)' }}>
              <span>Collected</span><span>{formatCurrency(totalPaid)}</span>
            </div>
          </div>

          <Button className="w-full mt-auto" size="lg" loading={completing} onClick={completeSale}>Complete Sale</Button>
        </div>
      </div>

      <Modal open={heldOpen} onClose={() => setHeldOpen(false)} title="Held Bills">
        <div className="space-y-2">
          {heldBills.map((b) => (
            <button key={b._id} onClick={() => resumeBill(b)} className="w-full flex justify-between px-3 py-2.5 rounded-lg hover:bg-gold-50 text-sm border" style={{ borderColor: 'var(--border-subtle)' }}>
              <span>{b.items.length} item(s)</span>
              <span>{formatCurrency(b.grandTotal)}</span>
            </button>
          ))}
          {heldBills.length === 0 && <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No bills on hold.</p>}
        </div>
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Sale Complete" size="sm"
        footer={<Button icon={Printer} onClick={() => window.print()} className="w-full">Print Receipt</Button>}
      >
        {receipt && <ReceiptView sale={receipt} />}
      </Modal>
    </div>
  );
}

function Chip({ active, children, onClick }) {
  return (
    <button onClick={onClick} className={`px-2.5 py-1 rounded-full text-xs font-medium ${active ? 'bg-graphite-900 text-white' : 'border'}`} style={active ? {} : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
      {children}
    </button>
  );
}

function SummaryRow({ label, value }) {
  return <div className="flex justify-between"><span style={{ color: 'var(--text-muted)' }}>{label}</span><span>{formatCurrency(value, { decimals: 2 })}</span></div>;
}

export default POSBilling;
