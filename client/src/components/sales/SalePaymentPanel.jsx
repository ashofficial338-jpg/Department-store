import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Input, Select } from '../ui/index.js';
import { tradeService } from '../../services/index.js';
import { formatCurrency, formatDateTime } from '../../utils/format.js';

// Paid / due on a bill, its receipts, and "Receive payment" (several part-payments allowed).
// Customer outstanding = total - amount received (receipts and returns reduce it).
export function SalePaymentPanel({ sale, onChange }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [saving, setSaving] = useState(false);
  const due = Number(sale.amountDue) || 0;
  const credit = Number(sale.creditAmount) || 0;

  async function receive() {
    const value = Number(amount);
    if (!(value > 0)) { toast.error('Enter the amount received.'); return; }
    if (value > due + 0.001) { toast.error(`Only ${formatCurrency(due)} is due.`); return; }
    setSaving(true);
    try {
      const res = await tradeService.receive(sale._id, { amount: value, method });
      toast.success('Payment received.');
      setAmount('');
      onChange?.(res.data);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  return (
    <div className="text-sm space-y-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        <span>Sale type: <strong>{credit > 0 ? 'Credit' : 'Cash'}</strong></span>
        <span>Received: <strong>{formatCurrency(sale.amountPaid || 0)}</strong></span>
        <span className={due > 0 ? 'text-rose-600' : ''}>Balance due: <strong>{formatCurrency(due)}</strong></span>
      </div>
      {(sale.receipts || []).length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Payments received later</div>
          {sale.receipts.map((r) => (
            <div key={r._id} className="flex justify-between py-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <span className="font-mono text-xs">{r.voucherNumber}</span>
              <span className="capitalize">{String(r.method).replace('_', ' ')}</span>
              <span>{formatDateTime(r.receivedAt)}</span>
              <strong>{formatCurrency(r.amount)}</strong>
            </div>
          ))}
        </div>
      )}
      {due > 0 && !['cancelled', 'held'].includes(sale.status) && (
        <div className="flex flex-wrap items-end gap-2 pt-1">
          <Input label="Receive amount" type="number" min={0} step="0.01" value={amount} placeholder={String(due)} onChange={(e) => setAmount(e.target.value)} />
          <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option>
          </Select>
          <Button variant="outline" onClick={() => setAmount(String(due))}>Full due</Button>
          <Button onClick={receive} loading={saving}>Receive Payment</Button>
        </div>
      )}
    </div>
  );
}

export default SalePaymentPanel;
