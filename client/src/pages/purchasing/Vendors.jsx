import { useState } from 'react';
import { Eye } from 'lucide-react';
import CrudManager from '../../components/CrudManager.jsx';
import { vendorService } from '../../services/index.js';
import { Input, Textarea, Select, Modal } from '../../components/ui/index.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { formatCurrency, formatDate } from '../../utils/format.js';

export function Vendors() {
  const [dashboard, setDashboard] = useState(null);

  async function openDashboard(row) {
    const res = await vendorService.dashboard(row._id);
    setDashboard(res.data);
  }

  return (
    <>
      <CrudManager
        title="Vendors"
        entityLabel="Vendor"
        service={vendorService}
        crumbs={[{ label: 'Purchasing', to: '/purchasing/orders' }, { label: 'Vendors' }]}
        defaultValues={{ name: '', companyName: '', gstin: '', pan: '', contactPerson: '', phone: '', email: '', address: '', paymentTerms: 'Net 30', creditLimit: 0, status: 'active' }}
        columns={[
          { key: 'name', header: 'Vendor', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'companyName', header: 'Company' },
          { key: 'gstin', header: 'GSTIN', render: (r) => <span className="text-xs">{r.gstin || '-'}</span> },
          { key: 'phone', header: 'Phone' },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
        extraActions={(row) => (
          <button onClick={(e) => { e.stopPropagation(); openDashboard(row); }} className="p-1.5 rounded-lg hover:bg-gold-50 text-gold-600">
            <Eye size={14} />
          </button>
        )}
        fields={[
          { name: 'name', label: 'Vendor Name', required: true, component: Input },
          { name: 'companyName', label: 'Company Name', component: Input },
          { name: 'gstin', label: 'GSTIN', component: Input },
          { name: 'pan', label: 'PAN', component: Input },
          { name: 'contactPerson', label: 'Contact Person', component: Input },
          { name: 'phone', label: 'Phone', component: Input },
          { name: 'email', label: 'Email', component: Input, props: { type: 'email' } },
          { name: 'address', label: 'Address', component: Textarea },
          { name: 'paymentTerms', label: 'Payment Terms', component: Input },
          { name: 'creditLimit', label: 'Credit Limit', component: Input, props: { type: 'number' } },
          { name: 'status', label: 'Status', component: Select, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
        ]}
      />

      <Modal open={!!dashboard} onClose={() => setDashboard(null)} title={dashboard?.vendor?.name || 'Vendor'} size="lg">
        {dashboard && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Stat label="Total Purchases" value={formatCurrency(dashboard.totalPurchases)} />
              <Stat label="Paid" value={formatCurrency(dashboard.paidAmount)} />
              <Stat label="Outstanding" value={formatCurrency(dashboard.outstandingAmount)} accent />
            </div>
            <h4 className="text-sm font-semibold mb-2">Recent Purchases</h4>
            <div className="space-y-1.5">
              {dashboard.recentPurchases.map((p) => (
                <div key={p._id} className="flex justify-between text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--bg-surface-muted)' }}>
                  <span>{p.poNumber}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatDate(p.createdAt)}</span>
                  <span className="font-medium">{formatCurrency(p.grandTotal)}</span>
                </div>
              ))}
              {dashboard.recentPurchases.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No purchases recorded yet.</p>}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface-muted)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`text-lg font-display font-semibold ${accent ? 'text-rose-600' : ''}`}>{value}</div>
    </div>
  );
}

export default Vendors;
