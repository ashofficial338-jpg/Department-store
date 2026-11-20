import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Printer, RotateCcw } from 'lucide-react';
import { Button, Modal } from '../../components/ui/index.js';
import { productService, salesService, settingsService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';
import {
  toUnitMap, productUnits, billingUnits, quickSizes, pricedLine, wholeError, fmtQty, unitShort, isMeasure, round, round2, parseOption,
} from '../../utils/units.js';
import ReceiptView from './ReceiptView.jsx';

// Billing. Two kinds of lines:
// * Priced products (Product Master has a selling price): the cashier picks the quantity in any unit that
//   converts to the product's selling unit (500 g of Rs 60/kg rice = Rs 30, 500 ml of Rs 60/L milk = Rs 30,
//   6 pcs of Rs 5/pc banana = Rs 30). Price, discount % and GST come from Product Master; stock is checked
//   here and again by the server, which takes it from the central stock (in the product's base unit).
// * Name-only products (no selling price): quantity in g or kg and the rate per kg typed by the cashier, as before;
//   no stock movement.
// GST from Products > Pricing & GST: Intra-State -> CGST + SGST, Inter-State -> IGST. Total = taxable + GST.
// The server recalculates everything when the bill is saved.

const newRequestId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
let seq = 0;
const blankLine = () => ({ key: ++seq, product: '', quantity: '', unit: 'kg', rate: '', info: null, step: null });
const PAYMENT_MODES = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']];
// Built-in units, used until GET /products/units answers (and if it fails).
const FALLBACK_UNITS = toUnitMap([
  { code: 'mg', short: 'mg', family: 'mass', factor: 0.001 }, { code: 'g', short: 'g', family: 'mass', factor: 1 },
  { code: 'kg', short: 'kg', family: 'mass', factor: 1000 }, { code: 'ml', short: 'ml', family: 'volume', factor: 1 },
  { code: 'l', short: 'L', family: 'volume', factor: 1000 }, { code: 'pcs', short: 'pc', family: 'each', factor: 1 },
  { code: 'dozen', short: 'dozen', family: 'each', factor: 12 },
]);

// Name-only line: g -> quantity / 1000 x rate per kg; kg -> quantity x rate per kg.
export function lineAmount(line) {
  const q = Number(line.quantity);
  const r = Number(line.rate);
  if (!(q > 0) || !(r >= 0)) return 0;
  return round2((line.unit === 'g' ? q / 1000 : q) * r);
}

// GST on one line, rounded the same way as the server: tax to paise, CGST = half, SGST = the rest.
export function lineGst(taxable, gstRate, interState) {
  const tax = round2((taxable * (Number(gstRate) || 0)) / 100);
  const cgst = interState ? 0 : round2(tax / 2);
  return { tax, cgst, sgst: interState ? 0 : round2(tax - cgst), igst: interState ? tax : 0 };
}

function printReceipt() {
  const node = document.getElementById('receipt');
  if (!node) return;
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bill</title><style>
    body{font-family:'Courier New',monospace;font-size:12px;margin:8px;width:280px;color:#000}
    .row{display:flex;justify-content:space-between;gap:8px}.center{text-align:center}.b{font-weight:700}
    .sep{border-top:1px dashed #000;margin:6px 0}.muted{color:#444}
  </style></head><body>${node.innerHTML}</body></html>`);
  doc.close();
  setTimeout(() => { frame.contentWindow.focus(); frame.contentWindow.print(); setTimeout(() => frame.remove(), 1000); }, 150);
}

export function POSBilling() {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [units, setUnits] = useState(FALLBACK_UNITS);
  const [lines, setLines] = useState([blankLine()]);
  const [payment, setPayment] = useState('cash');
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [gstType, setGstType] = useState('intra');
  const requestId = useRef(newRequestId());
  useEffect(() => {
    productService.names()
      .then((r) => setProducts(r.data))
      .catch((err) => toast.error(err.message))
      .finally(() => setLoadingProducts(false));
    productService.units().then((r) => setUnits(toUnitMap(r.data))).catch(() => {});
    settingsService.get().then((r) => setGstType(r.data.gstType || 'intra')).catch(() => {});
  }, []);

  // "Save & Print": print as soon as the saved bill is on screen.
  useEffect(() => { if (receipt) setTimeout(printReceipt, 200); }, [receipt]);

  const interState = gstType === 'inter';
  const calcOf = (l) => (l.info ? pricedLine(l, l.info, units) : null);

  // Taxable value, discount, GST grouped by rate (for "CGST @ 2.5%" rows) and the final total.
  const summary = useMemo(() => {
    const rateOf = new Map(products.map((p) => [p._id, Number(p.gstRate) || 0]));
    const groups = new Map();
    let taxable = 0; let discount = 0;
    for (const l of lines) {
      if (!l.product) continue;
      const c = l.info ? pricedLine(l, l.info, units) : null;
      const amt = c ? c.taxable : lineAmount(l);
      if (!amt) continue;
      const rate = l.info ? Number(l.info.gstRate) || 0 : rateOf.get(l.product) || 0;
      const g = lineGst(amt, rate, interState);
      taxable += amt;
      discount += c?.discount || 0;
      const grp = groups.get(rate) || { rate, cgst: 0, sgst: 0, igst: 0 };
      grp.cgst += g.cgst; grp.sgst += g.sgst; grp.igst += g.igst;
      groups.set(rate, grp);
    }
    const rows = [...groups.values()].filter((g) => g.rate > 0).sort((a, b) => a.rate - b.rate)
      .map((g) => ({ rate: g.rate, cgst: round2(g.cgst), sgst: round2(g.sgst), igst: round2(g.igst) }));
    const tax = round2(rows.reduce((t, g) => t + g.cgst + g.sgst + g.igst, 0));
    taxable = round2(taxable);
    return { taxable, discount: round2(discount), rows, tax, total: round2(taxable + tax) };
  }, [lines, products, interState, units]);
  const { total } = summary;

  // Stock needed (in the product's base unit) by all priced lines of one product.
  function stockNeeded(list, productId) {
    return round(list.filter((l) => l.info && l.product === productId)
      .reduce((t, l) => t + (pricedLine(l, l.info, units).baseQty || 0), 0), 6);
  }

  function update(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  const focusQty = (key) => setTimeout(() => document.getElementById(`qty-${key}`)?.focus(), 0);
  const isBlank = (l) => !l.product && l.quantity === '' && l.rate === '';

  // First quantity / unit for a priced product: 1 piece / pack; a pre-packed item sold by weight or volume
  // gets its first size (1 L milk); a loose item waits for the weight to be entered.
  function defaultsFor(p) {
    const { sellingUnit } = productUnits(p, units);
    if (!isMeasure(units.get(sellingUnit))) return { quantity: '1', unit: sellingUnit, step: 1 };
    const sizes = quickSizes(p, units);
    if (p.productType === 'packed' && sizes.length) return { quantity: String(sizes[0].quantity), unit: sizes[0].unit, step: sizes[0].quantity };
    const plain = (p.unitOptions || []).map((t) => parseOption(t, units)).find((o) => o && !o.quantity && billingUnits(p, units).includes(o.unit));
    return { quantity: '', unit: plain?.unit || sellingUnit, step: null };
  }

  // The product picked in a row's dropdown.
  async function pickProduct(key, id) {
    const p = products.find((x) => x._id === id);
    if (!p || !(p.sellingPrice > 0)) { update(key, { product: id, info: null, step: null, unit: 'kg' }); return; }
    update(key, { product: id, info: { ...p, stock: null }, ...defaultsFor(p), rate: '' });
    focusQty(key);
    try {
      const full = (await productService.getOne(id)).data;
      setLines((prev) => prev.map((l) => (l.key === key && l.product === id ? { ...l, info: { ...l.info, stock: full.stock ?? 0 } } : l)));
    } catch { /* stock is checked again when the bill is saved */ }
  }

  function addLine() {
    const line = blankLine();
    setLines((prev) => [...prev, line]);
    setTimeout(() => document.getElementById(`product-${line.key}`)?.focus(), 0);
  }

  function removeLine(key) {
    setLines((prev) => (prev.length === 1 ? [blankLine()] : prev.filter((l) => l.key !== key)));
  }

  function clearBill() {
    setLines([blankLine()]);
    setPayment('cash');
    requestId.current = newRequestId();
  }

  async function saveBill() {
    const filled = lines.filter((l) => !isBlank(l));
    if (!filled.length) { toast.error('Add at least one product to the bill.'); return; }
    for (const [i, l] of filled.entries()) {
      if (!l.product) { toast.error(`Row ${i + 1}: select a product.`); return; }
      if (!(Number(l.quantity) > 0)) { toast.error(`Row ${i + 1}: enter the quantity.`); return; }
      if (l.info) {
        const whole = wholeError(l, units);
        if (whole) { toast.error(`Row ${i + 1}: quantity ${whole}.`); return; }
        if (l.info.stock !== null && stockNeeded(filled, l.product) > l.info.stock + 1e-9) {
          toast.error(`Row ${i + 1}: only ${fmtQty(l.info.stock, productUnits(l.info, units).baseUnit, units)} of ${l.info.name} in stock.`); return;
        }
      } else if (l.rate === '' || !(Number(l.rate) >= 0)) { toast.error(`Row ${i + 1}: enter the rate.`); return; }
    }
    if (!(total > 0)) { toast.error('The bill total must be more than zero.'); return; }
    setSaving(true);
    try {
      const res = await salesService.createSimple({
        items: filled.map((l) => (l.info
          ? { product: l.product, quantity: Number(l.quantity), unit: l.unit }
          : { product: l.product, quantity: Number(l.quantity), unit: l.unit, rate: Number(l.rate), rateUnit: 'kg' })),
        paymentMethod: payment,
        clientRequestId: requestId.current,
      });
      setReceipt(res.data);
      clearBill();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  const inputCls = 'w-full h-10 rounded-lg border px-3 text-sm bg-[var(--bg-surface)] focus:outline-none focus:!border-gold-500';
  const inputStyle = { borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };
  const muted = { color: 'var(--text-muted)' };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Billing</h1>
          <p className="text-sm" style={muted}>Select a product and choose the quantity. Name-only products: enter the quantity in g or kg and the rate per kg (before GST).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <span className="px-3 h-8 inline-flex items-center rounded-full text-xs font-semibold" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
            title="Change in Products > Pricing & GST">
            GST: {interState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}
          </span>
          <Button variant="outline" icon={RotateCcw} onClick={clearBill}>New Bill</Button>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-muted)' }}>
                <th className="px-3 py-2.5 font-semibold">Product Name</th>
                <th className="px-3 py-2.5 font-semibold w-44">Quantity</th>
                <th className="px-3 py-2.5 font-semibold w-32">Unit</th>
                <th className="px-3 py-2.5 font-semibold w-36">Rate</th>
                <th className="px-3 py-2.5 font-semibold w-36 text-right">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const c = calcOf(l);
                const pu = l.info ? productUnits(l.info, units) : null;
                const whole = l.info ? wholeError(l, units) : '';
                const over = l.info && l.info.stock !== null && stockNeeded(lines, l.product) > l.info.stock + 1e-9;
                return (
                  <tr key={l.key} className="align-top" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="px-3 py-2">
                      <select id={`product-${l.key}`} value={l.product} onChange={(e) => pickProduct(l.key, e.target.value)} className={inputCls} style={inputStyle} aria-label={`Row ${i + 1} product`}>
                        <option value="">{loadingProducts ? 'Loading…' : products.length ? 'Select product' : 'No products – add in Product Master'}</option>
                        {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                      </select>
                      {l.info && (
                        <div className="text-[11px] mt-1 flex flex-wrap gap-x-2" style={muted}>
                          {l.info.productType && <span className="capitalize">{l.info.productType === 'loose' ? 'Loose' : 'Pre-packed'}</span>}
                          <span>GST {l.info.gstRate || 0}%</span>
                          <span className={over ? 'text-rose-600 font-semibold' : ''}>Stock {l.info.stock === null ? '…' : fmtQty(l.info.stock, pu.baseUnit, units)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input id={`qty-${l.key}`} type="number" inputMode="decimal" min="0" step="any" placeholder="0" value={l.quantity}
                        onChange={(e) => update(l.key, { quantity: e.target.value })} className={`${inputCls} text-right ${whole || over ? '!border-rose-400' : ''}`} style={inputStyle} aria-label={`Row ${i + 1} quantity`} />
                      {l.info && quickSizes(l.info, units).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {quickSizes(l.info, units).map((o) => {
                            const on = Number(l.quantity) === o.quantity && l.unit === o.unit;
                            return (
                              <button key={`${o.quantity}${o.unit}`} type="button" onClick={() => update(l.key, { quantity: String(o.quantity), unit: o.unit, step: o.quantity })}
                                className={`px-1.5 h-6 rounded text-[11px] font-medium border transition-colors ${on ? 'bg-gold-600 text-white border-transparent' : 'hover:bg-gold-50'}`}
                                style={on ? {} : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
                                {fmtQty(o.quantity, o.unit, units)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {(whole || over) && <div className="text-[11px] mt-0.5 text-rose-600">{whole || 'More than the stock'}</div>}
                    </td>
                    <td className="px-3 py-2">
                      {l.info ? (
                        <select value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value, step: units.get(e.target.value)?.family === 'mass' || units.get(e.target.value)?.family === 'volume' ? null : 1 })}
                          className={inputCls} style={inputStyle} aria-label={`Row ${i + 1} unit`}>
                          {billingUnits(l.info, units).map((code) => <option key={code} value={code}>{units.get(code)?.label || code}</option>)}
                        </select>
                      ) : (
                        <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }} role="group" aria-label={`Row ${i + 1} unit`}>
                          {['g', 'kg'].map((u) => (
                            <button key={u} type="button" onClick={() => update(l.key, { unit: u })}
                              className={`px-3.5 h-8 rounded-md text-sm font-medium transition-colors ${l.unit === u ? 'bg-gold-600 text-white' : 'text-graphite-600 hover:bg-gold-50'}`}>
                              {u}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {l.info ? (
                        <div className="tabular-nums pt-2" title="Selling price from Product Master">
                          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(l.info.sellingPrice)}<span className="text-xs font-normal" style={muted}> / {unitShort(pu.sellingUnit, units, 1)}</span></div>
                          {l.info.mrp > l.info.sellingPrice && <div className="text-[11px] line-through" style={muted}>MRP {formatCurrency(l.info.mrp)}</div>}
                        </div>
                      ) : (
                        <input type="number" inputMode="decimal" min="0" step="any" placeholder="₹ / kg" value={l.rate}
                          onChange={(e) => update(l.key, { rate: e.target.value })}
                          onKeyDown={(e) => { if (e.key === 'Enter' && i === lines.length - 1) { e.preventDefault(); addLine(); } }}
                          className={`${inputCls} text-right`} style={inputStyle} aria-label={`Row ${i + 1} rate per kg`} />
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <div className="font-semibold pt-2" style={{ color: 'var(--text-primary)' }}>{formatCurrency(c ? c.taxable : lineAmount(l))}</div>
                      {c?.discount > 0 && <div className="text-[11px] text-emerald-700">−{formatCurrency(c.discount)} ({l.info.discountPercent}% off)</div>}
                    </td>
                    <td className="pr-2 py-2 text-center">
                      <button type="button" onClick={() => removeLine(l.key)} title="Remove row" className="mt-1 p-1.5 rounded-lg text-graphite-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <Button variant="ghost" size="sm" icon={Plus} onClick={addLine}>Add Item</Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={muted}>Payment</span>
          {PAYMENT_MODES.map(([m, label]) => (
            <button key={m} type="button" onClick={() => setPayment(m)}
              className={`px-3.5 h-9 rounded-full text-sm font-medium border transition-colors ${payment === m ? 'bg-gold-600 text-white border-transparent' : 'hover:bg-gold-50'}`}
              style={payment === m ? {} : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-5">
          <div className="text-sm tabular-nums sm:min-w-[240px]" style={{ color: 'var(--text-secondary)' }}>
            {summary.discount > 0 && <div className="flex justify-between gap-6"><span>Discount</span><span className="text-emerald-700">−{formatCurrency(summary.discount)}</span></div>}
            <div className="flex justify-between gap-6"><span>Taxable Amount</span><span>{formatCurrency(summary.taxable)}</span></div>
            {summary.rows.map((g) => (interState ? (
              <div key={g.rate} className="flex justify-between gap-6"><span>IGST @ {g.rate}%</span><span>{formatCurrency(g.igst)}</span></div>
            ) : (
              <div key={g.rate}>
                <div className="flex justify-between gap-6"><span>CGST @ {g.rate / 2}%</span><span>{formatCurrency(g.cgst)}</span></div>
                <div className="flex justify-between gap-6"><span>SGST @ {g.rate / 2}%</span><span>{formatCurrency(g.sgst)}</span></div>
              </div>
            )))}
            <div className="flex justify-between gap-6"><span>Total GST</span><span>{formatCurrency(summary.tax)}</span></div>
            <div className="flex justify-between gap-6 mt-1 pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              <span className="text-xs uppercase tracking-wide self-center" style={muted}>Total Amount</span>
              <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{formatCurrency(total)}</span>
            </div>
          </div>
          <Button icon={Printer} onClick={saveBill} loading={saving} disabled={!(total > 0)}>Save &amp; Print</Button>
        </div>
      </div>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Bill Saved" size="sm"
        footer={<Button icon={Printer} onClick={printReceipt} className="w-full">Print Bill</Button>}
      >
        {receipt && <ReceiptView sale={receipt} />}
      </Modal>
    </div>
  );
}

export default POSBilling;
