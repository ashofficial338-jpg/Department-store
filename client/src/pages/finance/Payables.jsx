import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, Modal, Input } from '../../components/ui/index.js';
import { reportService, purchaseService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';

export function Payables() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payTarget, setPayTarget] = useState(null);
  const [amount, setAmount] = useState('');

  function load() {
    setLoading(true);
    reportService.outstanding().then((r) => setRows(r.data.payables)).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function submitPay() {
    try {
      await purchaseService.pay(payTarget._id, { amount: Number(amount), method: 'bank_transfer' });
      toast.success('Payment recorded.');
      setPayTarget(null); setAmount('');
      load();
    } catch (err) { toast.error(err.message); }
  }

  const total = rows.reduce((s, r) => s + r.balance, 0);

  return (
    <div>
      <PageHeader title="Accounts Payable" crumbs={[{ label: 'Finance' }, { label: 'Payables' }]} />
      <div className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>Total payable: <strong className="text-rose-600">{formatCurrency(total)}</strong></div>
      <DataTable
        loading={loading}
        rows={rows}
        keyField="_id"
        emptyTitle="No outstanding payables."
        columns={[
          { key: 'poNumber', header: 'PO #', render: (r) => <span className="font-mono text-xs">{r.poNumber}</span> },
          { key: 'vendor', header: 'Vendor', render: (r) => r.vendor?.name },
          { key: 'balance', header: 'Balance Due', render: (r) => <span className="text-rose-600 font-semibold">{formatCurrency(r.balance)}</span> },
          { key: 'actions', header: '', render: (r) => <Button size="sm" variant="outline" onClick={() => { setPayTarget(r); setAmount(r.balance); }}>Pay</Button> },
        ]}
      />

      <Modal open={!!payTarget} onClose={() => setPayTarget(null)} title={`Pay ${payTarget?.poNumber || ''}`}
        footer={<><Button variant="outline" onClick={() => setPayTarget(null)}>Cancel</Button><Button onClick={submitPay}>Record Payment</Button></>}
      >
        <Input label="Amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Modal>
    </div>
  );
}

export default Payables;
