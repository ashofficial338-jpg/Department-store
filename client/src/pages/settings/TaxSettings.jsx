import CrudManager from '../../components/CrudManager.jsx';
import { gstService } from '../../services/index.js';
import { Input, Select } from '../../components/ui/index.js';
import StatusBadge from '../../components/ui/StatusBadge.jsx';

const taxRateAdapter = {
  list: async () => { const res = await gstService.rates(); return { data: res.data, pagination: null }; },
  create: gstService.createRate,
  update: gstService.updateRate,
  remove: gstService.removeRate,
};

export function TaxSettings() {
  return (
    <CrudManager
      title="Tax Settings"
      entityLabel="GST Rate"
      service={taxRateAdapter}
      searchable={false}
      crumbs={[{ label: 'Settings', to: '/settings/system' }, { label: 'Tax Settings' }]}
      defaultValues={{ name: '', ratePercent: 0, hsnCodes: '', status: 'active' }}
      columns={[
        { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
        { key: 'ratePercent', header: 'Rate', render: (r) => `${r.ratePercent}%` },
        { key: 'hsnCodes', header: 'HSN/SAC Codes', render: (r) => (r.hsnCodes || []).join(', ') || '-' },
        { key: 'isDefault', header: 'Default', render: (r) => r.isDefault ? <StatusBadge status="active" label="Default" /> : '-' },
        { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      ]}
      fields={[
        { name: 'name', label: 'Rate Name', required: true, component: Input, props: { placeholder: 'GST 18%' } },
        { name: 'ratePercent', label: 'Rate (%)', required: true, component: Input, props: { type: 'number', step: '0.01' } },
        {
          name: 'hsnCodes', label: 'HSN/SAC Codes (comma separated)', component: Input,
          render: (form, setForm) => (
            <Input
              label="HSN/SAC Codes (comma separated)"
              value={Array.isArray(form.hsnCodes) ? form.hsnCodes.join(', ') : (form.hsnCodes || '')}
              onChange={(e) => setForm((s) => ({ ...s, hsnCodes: e.target.value.split(',').map((v) => v.trim()).filter(Boolean) }))}
            />
          ),
        },
        { name: 'status', label: 'Status', component: Select, options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
      ]}
    />
  );
}

export default TaxSettings;
