import { useEffect, useState } from 'react';
import { PageHeader, DataTable } from '../../components/ui/index.js';
import { FilterBar, FilterSelect } from '../../components/ui/FilterBar.jsx';
import { gstService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' }, { value: 'this_month', label: 'This Month' },
  { value: 'previous_month', label: 'Previous Month' }, { value: 'this_year', label: 'This Year' },
];

export function GST() {
  const [summary, setSummary] = useState(null);
  const [salesReport, setSalesReport] = useState([]);
  const [purchaseReport, setPurchaseReport] = useState([]);
  const [range, setRange] = useState('this_month');

  useEffect(() => {
    gstService.summary({ range }).then((r) => setSummary(r.data));
    gstService.salesReport({ range }).then((r) => setSalesReport(r.data));
    gstService.purchaseReport({ range }).then((r) => setPurchaseReport(r.data));
  }, [range]);

  return (
    <div>
      <PageHeader title="GST" crumbs={[{ label: 'Finance' }, { label: 'GST' }]} actions={<FilterSelect value={range} onChange={setRange} options={RANGE_OPTIONS} />} />

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat label="Output Tax (Sales)" value={formatCurrency(summary.outputTax)} />
          <Stat label="Input Tax (Purchases)" value={formatCurrency(summary.inputTax)} />
          <Stat label="Net GST Payable" value={formatCurrency(summary.netGstPayable)} accent />
          <Stat label="CGST + SGST + IGST" value={formatCurrency(summary.cgst + summary.sgst + summary.igst)} />
        </div>
      )}

      <h3 className="font-display text-base font-semibold mb-3">GST Sales Report (by Rate)</h3>
      <div className="mb-6">
        <DataTable
          rows={salesReport} loading={false} keyField="_id" emptyTitle="No sales in this period."
          columns={[
            { key: '_id', header: 'GST Rate', render: (r) => `${r._id}%` },
            { key: 'taxableAmount', header: 'Taxable Amount', render: (r) => formatCurrency(r.taxableAmount) },
            { key: 'cgst', header: 'CGST', render: (r) => formatCurrency(r.cgst) },
            { key: 'sgst', header: 'SGST', render: (r) => formatCurrency(r.sgst) },
            { key: 'igst', header: 'IGST', render: (r) => formatCurrency(r.igst) },
            { key: 'totalAmount', header: 'Total', render: (r) => formatCurrency(r.totalAmount) },
          ]}
        />
      </div>

      <h3 className="font-display text-base font-semibold mb-3">GST Purchase Report (by Rate)</h3>
      <DataTable
        rows={purchaseReport} loading={false} keyField="_id" emptyTitle="No purchases in this period."
        columns={[
          { key: '_id', header: 'GST Rate', render: (r) => `${r._id}%` },
          { key: 'taxableAmount', header: 'Taxable Amount', render: (r) => formatCurrency(r.taxableAmount) },
          { key: 'taxAmount', header: 'Tax Amount', render: (r) => formatCurrency(r.taxAmount) },
          { key: 'totalAmount', header: 'Total', render: (r) => formatCurrency(r.totalAmount) },
        ]}
      />
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="surface-card rounded-xl2 shadow-premium p-5">
      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`text-xl font-display font-semibold ${accent ? 'text-gold-700' : ''}`}>{value}</div>
    </div>
  );
}

export default GST;
