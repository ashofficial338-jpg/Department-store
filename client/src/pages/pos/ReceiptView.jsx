import { formatCurrency, formatDateTime } from '../../utils/format.js';

const money = (v) => formatCurrency(v, { decimals: 2 });

// Group line taxes by GST rate so the receipt can print "CGST @ 9%" etc.
function gstBreakup(items) {
  const byRate = new Map();
  for (const it of items) {
    const rate = Number(it.gstRate) || 0;
    const g = byRate.get(rate) || { rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
    g.taxable += it.taxableAmount || 0;
    g.cgst += it.cgst || 0;
    g.sgst += it.sgst || 0;
    g.igst += it.igst || 0;
    byRate.set(rate, g);
  }
  return [...byRate.values()].sort((a, b) => a.rate - b.rate);
}

export function ReceiptView({ sale }) {
  const breakup = gstBreakup(sale.items);
  return (
    <div className="font-mono text-xs space-y-2" id="receipt">
      <div className="text-center mb-3">
        <div className="font-display text-base font-semibold">AURELIA</div>
        <div style={{ color: 'var(--text-muted)' }}>Department Store</div>
      </div>
      <div className="flex justify-between"><span>Invoice</span><span>{sale.invoiceNumber}</span></div>
      <div className="flex justify-between"><span>Date</span><span>{formatDateTime(sale.createdAt || new Date())}</span></div>
      <div className="border-t border-dashed my-2" style={{ borderColor: 'var(--border-subtle)' }} />
      {sale.items.map((it, i) => (
        <div key={i} className="flex justify-between">
          <span className="truncate max-w-[140px]">{it.productName} x{it.quantity}</span>
          <span style={{ color: 'var(--text-muted)' }}>GST {it.gstRate}%</span>
          <span>{money(it.totalAmount)}</span>
        </div>
      ))}
      <div className="border-t border-dashed my-2" style={{ borderColor: 'var(--border-subtle)' }} />
      <div className="flex justify-between"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
      {breakup.map((g) => sale.isInterState ? (
        <div key={g.rate} className="flex justify-between"><span>IGST @ {g.rate}%</span><span>{money(g.igst)}</span></div>
      ) : (
        <div key={g.rate}>
          <div className="flex justify-between"><span>CGST @ {g.rate / 2}%</span><span>{money(g.cgst)}</span></div>
          <div className="flex justify-between"><span>SGST @ {g.rate / 2}%</span><span>{money(g.sgst)}</span></div>
        </div>
      ))}
      {sale.roundOff ? <div className="flex justify-between"><span>Round Off</span><span>{money(sale.roundOff)}</span></div> : null}
      <div className="flex justify-between font-semibold text-sm pt-1"><span>Total</span><span>{money(sale.grandTotal)}</span></div>
      <div className="text-center pt-3" style={{ color: 'var(--text-muted)' }}>Thank you for shopping with us!</div>
    </div>
  );
}

export default ReceiptView;
