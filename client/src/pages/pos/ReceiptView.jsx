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

const row = { display: 'flex', justifyContent: 'space-between', gap: 8 };
const sep = { borderTop: '1px dashed #94a3b8', margin: '6px 0' };

// Simple bill: Product, Quantity + Unit, Rate per kg, Amount, Total. Inline styles so it prints the same
// in the print window as on screen.
function SimpleReceipt({ sale }) {
  return (
    <div id="receipt" style={{ fontFamily: "'Courier New', monospace", fontSize: 12, lineHeight: 1.5 }}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>ARKA MART</div>
        <div>Department Store</div>
      </div>
      <div style={row}><span>Bill No</span><span>{sale.invoiceNumber}</span></div>
      <div style={row}><span>Date</span><span>{formatDateTime(sale.createdAt || new Date())}</span></div>
      <div style={row}><span>GST</span><span>{sale.isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)'}</span></div>
      <div style={sep} />
      <div style={{ ...row, fontWeight: 700 }}><span>Item</span><span>Amount</span></div>
      {sale.items.map((it, i) => (
        <div key={i} style={{ marginBottom: 4 }}>
          <div style={{ fontWeight: 700 }}>{it.productName}</div>
          <div style={row}>
            <span>{Number(it.quantity).toLocaleString('en-IN', { maximumFractionDigits: 3 })} {it.unit} x {money(it.unitPrice)}/kg{it.gstRate ? ` (GST ${it.gstRate}%)` : ''}</span>
            <span>{money(it.taxableAmount ?? it.totalAmount)}</span>
          </div>
        </div>
      ))}
      <div style={sep} />
      <div style={row}><span>Taxable Amount</span><span>{money(sale.taxableAmount ?? sale.subtotal)}</span></div>
      {gstBreakup(sale.items).filter((g) => g.rate > 0).map((g) => (sale.isInterState ? (
        <div key={g.rate} style={row}><span>IGST @ {g.rate}%</span><span>{money(g.igst)}</span></div>
      ) : (
        <div key={g.rate}>
          <div style={row}><span>CGST @ {g.rate / 2}%</span><span>{money(g.cgst)}</span></div>
          <div style={row}><span>SGST @ {g.rate / 2}%</span><span>{money(g.sgst)}</span></div>
        </div>
      )))}
      <div style={row}><span>Total GST</span><span>{money(sale.taxAmount || 0)}</span></div>
      <div style={sep} />
      <div style={{ ...row, fontWeight: 700, fontSize: 14 }}><span>TOTAL</span><span>{money(sale.grandTotal)}</span></div>
      {(sale.payments || []).map((p, i) => (
        <div key={i} style={{ ...row, textTransform: 'capitalize' }}><span>Paid by {String(p.method).toUpperCase() === 'UPI' ? 'UPI' : p.method}</span><span>{money(p.amount)}</span></div>
      ))}
      <div style={{ textAlign: 'center', paddingTop: 10 }}>Thank you! Visit again.</div>
    </div>
  );
}

export function ReceiptView({ sale }) {
  if (sale.billType === 'simple') return <SimpleReceipt sale={sale} />;
  const breakup = gstBreakup(sale.items);
  return (
    <div className="font-mono text-xs space-y-2" id="receipt">
      <div className="text-center mb-3">
        <div className="font-display text-base font-semibold">ARKA MART</div>
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
      {(sale.payments || []).map((p, i) => (
        <div key={i}>
          <div className="flex justify-between capitalize"><span>Paid by {String(p.method).replace('_', ' ')}</span><span>{money(p.cashReceived ?? p.amount)}</span></div>
          {p.changeReturned > 0 && <div className="flex justify-between"><span>Change returned</span><span>{money(p.changeReturned)}</span></div>}
        </div>
      ))}
      <div className="text-center pt-3" style={{ color: 'var(--text-muted)' }}>Thank you for shopping with us!</div>
    </div>
  );
}

export default ReceiptView;
