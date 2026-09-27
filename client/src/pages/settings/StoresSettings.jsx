import CrudManager from '../../components/CrudManager.jsx';
import { storeService } from '../../services/index.js';
import { Input, Select } from '../../components/ui/index.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

export function StoresSettings() {
  return (
    <CrudManager
      title="Store / Branch"
      entityLabel="Store"
      service={storeService}
      crumbs={[{ label: 'Settings', to: '/settings/system' }, { label: 'Store / Branch' }]}
      defaultValues={{ code: '', name: '', address: '', city: '', state: '', pincode: '', gstin: '', phone: '' }}
      columns={[
        { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
        { key: 'name', header: 'Store', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'city', header: 'City' },
        { key: 'gstin', header: 'GSTIN', render: (r) => <span className="text-xs">{r.gstin || '-'}</span> },
        { key: 'isActive', header: 'Status', render: (r) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} /> },
      ]}
      fields={[
        { name: 'code', label: 'Store Code', required: true, component: Input },
        { name: 'name', label: 'Store Name', required: true, component: Input },
        { name: 'address', label: 'Address', component: Input },
        { name: 'city', label: 'City', component: Input },
        { name: 'state', label: 'State', component: Input },
        { name: 'pincode', label: 'Pincode', component: Input },
        { name: 'gstin', label: 'GSTIN', component: Input },
        { name: 'phone', label: 'Phone', component: Input },
      ]}
    />
  );
}

export default StoresSettings;
