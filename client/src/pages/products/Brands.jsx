import CrudManager from '../../components/CrudManager.jsx';
import { brandService } from '../../services/index.js';
import { Input, Textarea, Select } from '../../components/ui/index.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

export function Brands() {
  return (
    <CrudManager
      title="Brands"
      entityLabel="Brand"
      service={brandService}
      crumbs={[{ label: 'Products', to: '/products' }, { label: 'Brands' }]}
      defaultValues={{ name: '', description: '', status: 'active' }}
      columns={[
        { key: 'name', header: 'Brand', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'description', header: 'Description', render: (r) => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.description || '-'}</span> },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'name', label: 'Brand Name', required: true, component: Input },
        { name: 'description', label: 'Description', component: Textarea },
        { name: 'status', label: 'Status', component: Select, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
      ]}
    />
  );
}

export default Brands;
