import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { Button } from './ui/index.js';
import { tradeService } from '../services/index.js';
import { formatCurrency, formatDate } from '../utils/format.js';

// Customer or supplier ledger with running balance, date range and Excel / PDF export.
// Customer: balance = what the customer owes (sales - received - returns).
// Supplier: balance = what we owe the supplier (purchases - returns - paid).
export function PartyLedger({ kind, id }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    tradeService.ledger(kind, id, { from: from || undefined, to: to || undefined })
      .then((r) => setData(r.data)).catch((err) => toast.error(err.message)).finally(() => setLoading(false));
  }, [kind, id, from, to]);

  const params = { from: from || undefined, to: to || undefined };
  const dateCls = 'h-9 rounded-lg border px-2 text-sm bg-[var(--bg-surface)]';
  const dateStyle = { borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' };
  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className={dateCls} style={dateStyle} />
        <span style={{ color: 'var(--text-muted)' }}>to</span>
        <input type="date" aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} className={dateCls} style={dateStyle} />
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={() => tradeService.exportLedger(kind, id, params, 'xlsx').catch((e) => toast.error(e.message))}>Excel</Button>
          <Button size="sm" variant="outline" icon={FileText} onClick={() => tradeService.exportLedger(kind, id, params, 'pdf').catch((e) => toast.error(e.message))}>PDF</Button>
        </div>
      </div>
      {loading && !data && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {data && (
        <>
          <div className="flex flex-wrap gap-5">
            <span>Opening: <strong>{formatCurrency(data.opening)}</strong></span>
            <span>{data.labels.debit}: <strong>{formatCurrency(data.totals.debit)}</strong></span>
            <span>{data.labels.credit}: <strong>{formatCurrency(data.totals.credit)}</strong></span>
            <span className={data.closing > 0 ? 'text-rose-600' : ''}>{data.labels.balance}: <strong>{formatCurrency(data.closing)}</strong></span>
          </div>
          <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
            <table className="w-full text-sm min-w-[620px]">
              <thead className="sticky top-0" style={{ background: 'var(--bg-surface)' }}>
                <tr className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  <th className="text-left py-1">Date</th><th className="text-left">Type</th><th className="text-left">Reference</th>
                  <th className="text-right">{data.labels.debit}</th><th className="text-right">{data.labels.credit}</th><th className="text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={6} className="py-3 text-center" style={{ color: 'var(--text-muted)' }}>No entries in this period.</td></tr>}
                {data.rows.map((r, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <td className="py-1.5 whitespace-nowrap">{formatDate(r.date)}</td>
                    <td>{r.type}{r.note ? <span style={{ color: 'var(--text-muted)' }}> ({r.note})</span> : null}</td>
                    <td className="font-mono text-xs">{r.reference}</td>
                    <td className="text-right tabular-nums">{r.debit ? formatCurrency(r.debit) : ''}</td>
                    <td className="text-right tabular-nums">{r.credit ? formatCurrency(r.credit) : ''}</td>
                    <td className="text-right tabular-nums font-medium">{formatCurrency(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export default PartyLedger;
