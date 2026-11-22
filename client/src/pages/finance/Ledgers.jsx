import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Select } from '../../components/ui/index.js';
import PartyLedger from '../../components/PartyLedger.jsx';
import { customerService, vendorService } from '../../services/index.js';
import { formatCurrency } from '../../utils/format.js';

// Customer Ledger and Supplier Ledger in one place (running balance, period, Excel / PDF export).
export function Ledgers() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('kind') === 'vendor' ? 'vendor' : 'customer';
  const id = params.get('id') || '';
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    customerService.list({ limit: 200 }).then((r) => setCustomers(r.data)).catch(() => {});
    vendorService.listAll().then((r) => setVendors(r.data)).catch(() => {});
  }, []);

  const set = (next) => setParams(Object.fromEntries(Object.entries({ kind, id, ...next }).filter(([, v]) => v)), { replace: true });
  const parties = kind === 'customer' ? customers : vendors;
  return (
    <div>
      <PageHeader title="Customer & Supplier Ledgers" crumbs={[{ label: 'Finance' }, { label: 'Ledgers' }]} />
      <div className="surface-card rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Select label="Ledger" value={kind} onChange={(e) => set({ kind: e.target.value, id: '' })}>
          <option value="customer">Customer ledger</option>
          <option value="vendor">Supplier ledger</option>
        </Select>
        <div className="sm:col-span-2">
          <Select label={kind === 'customer' ? 'Customer' : 'Supplier'} value={id} onChange={(e) => set({ id: e.target.value })}>
            <option value="">Select {kind === 'customer' ? 'a customer' : 'a supplier'}</option>
            {parties.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}{p.phone ? ` (${p.phone})` : ''}{kind === 'customer' && p.outstanding > 0 ? ` - owes ${formatCurrency(p.outstanding)}` : ''}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {id ? (
        <div className="surface-card rounded-xl p-4"><PartyLedger kind={kind} id={id} /></div>
      ) : (
        <div className="surface-card rounded-xl p-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          Choose a {kind === 'customer' ? 'customer' : 'supplier'} to see every bill, payment and return with the running balance.
        </div>
      )}
    </div>
  );
}

export default Ledgers;
