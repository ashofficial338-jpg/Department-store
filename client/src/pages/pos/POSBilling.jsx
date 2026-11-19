import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Trash2, Printer, RotateCcw } from 'lucide-react';
import { Button, Modal } from '../../components/ui/index.js';
import { productService, salesService, settingsService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';
import ReceiptView from './ReceiptView.jsx';

// Simple billing: pick a product name, type the quantity in g or kg and the rate per kg (before GST).
// Amount = quantity (in kg) x rate = taxable value. GST comes from Products > Pricing & GST: each product's
// GST % and the GST type (Intra-State -> CGST + SGST, Inter-State -> IGST). Total = taxable + GST.
// The server recalculates the same way when the bill is saved.

const newRequestId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
let seq = 0;
const blankLine = () => ({ key: ++seq, product: '', quantity: '', unit: 'kg', rate: '' });
const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
const PAYMENT_MODES = [['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']];

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
    settingsService.get().then((r) => setGstType(r.data.gstType || 'intra')).catch(() => {});
  }, []);

  // "Save & Print": print as soon as the saved bill is on screen.
  useEffect(() => { if (receipt) setTimeout(printReceipt, 200); }, [receipt]);

  const interState = gstType === 'inter';
  // Taxable value, GST grouped by rate (for "CGST @ 2.5%" rows) and the final total.
  const summary = useMemo(() => {
    const rateOf = new Map(products.map((p) => [p._id, Number(p.gstRate) || 0]));
    const groups = new Map();
    let taxable = 0;
    for (const l of lines) {
      const amt = lineAmount(l);
      if (!amt || !l.product) continue;
      const rate = rateOf.get(l.product) || 0;
      const g = lineGst(amt, rate, interState);
      taxable += amt;
      const grp = groups.get(rate) || { rate, cgst: 0, sgst: 0, igst: 0 };
      grp.cgst += g.cgst; grp.sgst += g.sgst; grp.igst += g.igst;
      groups.set(rate, grp);
    }
    const rows = [...groups.values()].filter((g) => g.rate > 0).sort((a, b) => a.rate - b.rate)
      .map((g) => ({ rate: g.rate, cgst: round2(g.cgst), sgst: round2(g.sgst), igst: round2(g.igst) }));
    const tax = round2(rows.reduce((t, g) => t + g.cgst + g.sgst + g.igst, 0));
    taxable = round2(taxable);
    return { taxable, rows, tax, total: round2(taxable + tax) };
  }, [lines, products, interState]);
  const { total } = summary;

  function update(key, patch) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
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
    const filled = lines.filter((l) => l.product || l.quantity !== '' || l.rate !== '');
    if (!filled.length) { toast.error('Add at least one product to the bill.'); return; }
    for (const [i, l] of filled.entries()) {
      if (!l.product) { toast.error(`Row ${i + 1}: select a product.`); return; }
      if (!(Number(l.quantity) > 0)) { toast.error(`Row ${i + 1}: enter the quantity.`); return; }
      if (l.rate === '' || !(Number(l.rate) >= 0)) { toast.error(`Row ${i + 1}: enter the rate.`); return; }
    }
    if (!(total > 0)) { toast.error('The bill total must be more than zero.'); return; }
    setSaving(true);
    try {
      const res = await salesService.createSimple({
        items: filled.map((l) => ({ product: l.product, quantity: Number(l.quantity), unit: l.unit, rate: Number(l.rate) })),
        paymentMethod: payment,
        clientRequestId: requestId.current,
      });
      setReceipt(res.data);
      clearBill();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  const inputCls = 'w-full h-10 rounded-lg border px-3 text-sm bg-[var(--bg-surface)] focus:outline-none focus:!border-gold-500';
  const inputStyle = { borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Billing</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select a product, enter the quantity in g or kg and the rate per kg (before GST).</p>
        </div>
        <span className="ml-auto mr-3 px-3 h-8 inline-flex items-center rounded-full text-xs font-semibold" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
          title="Change in Products > Pricing & GST">
          GST: {interState ? 'Inter-State (IGST)' : 'Intra-State (CGST + SGST)'}
        </span>
        <Button variant="outline" icon={RotateCcw} onClick={clearBill}>New Bill</Button>
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-muted)' }}>
                <th className="px-3 py-2.5 font-semibold">Product Name</th>
                <th className="px-3 py-2.5 font-semibold w-32">Quantity</th>
                <th className="px-3 py-2.5 font-semibold w-32">Unit</th>
                <th className="px-3 py-2.5 font-semibold w-36">Rate (₹ / kg)</th>
                <th className="px-3 py-2.5 font-semibold w-36 text-right">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  <td className="px-3 py-2">
                    <select id={`product-${l.key}`} value={l.product} onChange={(e) => update(l.key, { product: e.target.value })} className={inputCls} style={inputStyle} aria-label={`Row ${i + 1} product`}>
                      <option value="">{loadingProducts ? 'Loading…' : products.length ? 'Select product' : 'No products – add in Product Master'}</option>
                      {products.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" inputMode="decimal" min="0" step="any" placeholder="0" value={l.quantity}
                      onChange={(e) => update(l.key, { quantity: e.target.value })} className={`${inputCls} text-right`} style={inputStyle} aria-label={`Row ${i + 1} quantity`} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--border-subtle)' }} role="group" aria-label={`Row ${i + 1} unit`}>
                      {['g', 'kg'].map((u) => (
                        <button key={u} type="button" onClick={() => update(l.key, { unit: u })}
                          className={`px-3.5 h-8 rounded-md text-sm font-medium transition-colors ${l.unit === u ? 'bg-gold-600 text-white' : 'text-graphite-600 hover:bg-gold-50'}`}>
                          {u}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" inputMode="decimal" min="0" step="any" placeholder="0.00" value={l.rate}
                      onChange={(e) => update(l.key, { rate: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter' && i === lines.length - 1) { e.preventDefault(); addLine(); } }}
                      className={`${inputCls} text-right`} style={inputStyle} aria-label={`Row ${i + 1} rate per kg`} />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>{formatCurrency(lineAmount(l))}</td>
                  <td className="pr-2 py-2 text-center">
                    <button type="button" onClick={() => removeLine(l.key)} title="Remove row" className="p-1.5 rounded-lg text-graphite-400 hover:text-rose-600 hover:bg-rose-50"><Trash2 size={15} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2.5" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <Button variant="ghost" size="sm" icon={Plus} onClick={addLine}>Add Item</Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border p-4" style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Payment</span>
          {PAYMENT_MODES.map(([m, label]) => (
            <button key={m} type="button" onClick={() => setPayment(m)}
              className={`px-3.5 h-9 rounded-full text-sm font-medium border transition-colors ${payment === m ? 'bg-gold-600 text-white border-transparent' : 'hover:bg-gold-50'}`}
              style={payment === m ? {} : { borderColor: 'var(--border-subtle)', color: 'var(--text-secondary)' }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-5">
          <div className="text-sm tabular-nums min-w-[240px]" style={{ color: 'var(--text-secondary)' }}>
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
              <span className="text-xs uppercase tracking-wide self-center" style={{ color: 'var(--text-muted)' }}>Total Amount</span>
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
