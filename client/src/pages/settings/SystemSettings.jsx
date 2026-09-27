import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { PageHeader, Button, Input, Textarea } from '../../components/ui/index.js';
import { settingsService } from '../../services/index.js';

export function SystemSettings() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { settingsService.get().then((r) => setForm(r.data)); }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsService.update(form);
      toast.success('Settings updated.');
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  if (!form) return null;

  return (
    <div>
      <PageHeader title="System Settings" crumbs={[{ label: 'Settings', to: '/settings/system' }, { label: 'System Settings' }]}
        actions={<Button icon={Save} form="settings-form" type="submit" loading={saving}>Save Changes</Button>} />

      <form id="settings-form" onSubmit={handleSave} className="surface-card rounded-xl2 shadow-premium p-6 max-w-2xl space-y-5">
        <h3 className="font-display text-base font-semibold">Company Information</h3>
        <Input label="Company Name" value={form.companyName} onChange={(e) => setForm((s) => ({ ...s, companyName: e.target.value }))} />
        <Textarea label="Address" value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="GSTIN" value={form.gstin} onChange={(e) => setForm((s) => ({ ...s, gstin: e.target.value }))} />
          <Input label="PAN" value={form.pan} onChange={(e) => setForm((s) => ({ ...s, pan: e.target.value }))} />
        </div>

        <h3 className="font-display text-base font-semibold pt-2">Regional Settings</h3>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Currency Code" value={form.currency} onChange={(e) => setForm((s) => ({ ...s, currency: e.target.value }))} />
          <Input label="Currency Symbol" value={form.currencySymbol} onChange={(e) => setForm((s) => ({ ...s, currencySymbol: e.target.value }))} />
        </div>
        <Input
          label="Financial Year Start Month (1-12, default 4 = April)" type="number" min={1} max={12}
          value={form.financialYearStartMonth} onChange={(e) => setForm((s) => ({ ...s, financialYearStartMonth: Number(e.target.value) }))}
        />
        <Input
          label="Default Low Stock Threshold" type="number"
          value={form.lowStockThresholdDefault} onChange={(e) => setForm((s) => ({ ...s, lowStockThresholdDefault: Number(e.target.value) }))}
        />
      </form>
    </div>
  );
}

export default SystemSettings;
