import CrudManager from '../../components/CrudManager.jsx';
import { supplierService } from '../../services/index.js';
import { Input, Textarea, Select } from '../../components/ui/index.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

export function Suppliers() {
  return (
    <CrudManager
      title="Suppliers"
      entityLabel="Supplier"
      service={supplierService}
      crumbs={[{ label: 'Purchasing', to: '/purchasing/orders' }, { label: 'Suppliers' }]}
      defaultValues={{ name: '', contactPerson: '', phone: '', email: '', address: '', paymentTerms: 'Net 30', rating: 3, status: 'active' }}
      columns={[
        { key: 'name', header: 'Supplier', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'contactPerson', header: 'Contact', render: (r) => r.contactPerson || '-' },
        { key: 'phone', header: 'Phone' },
        { key: 'rating', header: 'Rating', render: (r) => '★'.repeat(r.rating || 0) || '-' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'name', label: 'Supplier Name', required: true, component: Input },
        { name: 'contactPerson', label: 'Contact Person', component: Input },
        { name: 'phone', label: 'Phone', component: Input },
        { name: 'email', label: 'Email', component: Input, props: { type: 'email' } },
        { name: 'address', label: 'Address', component: Textarea },
        { name: 'paymentTerms', label: 'Payment Terms', component: Input },
        { name: 'rating', label: 'Rating (0-5)', component: Input, props: { type: 'number', min: 0, max: 5 } },
        { name: 'status', label: 'Status', component: Select, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
      ]}
    />
  );
}

export default Suppliers;
