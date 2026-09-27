import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import { PageHeader, Button, Input } from '../../components/ui/index.js';
import { settingsService } from '../../services/index.js';

const PAYMENT_METHOD_OPTIONS = ['cash', 'upi', 'card', 'bank_transfer', 'credit'];

export function InvoiceSettings() {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { settingsService.get().then((r) => setForm(r.data)); }, []);

  function toggleMethod(m) {
    setForm((s) => ({ ...s, paymentMethods: s.paymentMethods.includes(m) ? s.paymentMethods.filter((x) => x !== m) : [...s.paymentMethods, m] }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await settingsService.update(form);
      toast.success('Invoice settings updated.');
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  if (!form) return null;

  return (
    <div>
      <PageHeader title="Invoice Settings" crumbs={[{ label: 'Settings', to: '/settings/system' }, { label: 'Invoice Settings' }]}
        actions={<Button icon={Save} form="invoice-settings-form" type="submit" loading={saving}>Save Changes</Button>} />

      <form id="invoice-settings-form" onSubmit={handleSave} className="surface-card rounded-xl2 shadow-premium p-6 max-w-2xl space-y-5">
        <Input label="Invoice Number Prefix" value={form.invoicePrefix} onChange={(e) => setForm((s) => ({ ...s, invoicePrefix: e.target.value }))} hint="Invoice numbers are auto-generated as PREFIX/FY/000001" />

        <div>
          <span className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Accepted Payment Methods</span>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHOD_OPTIONS.map((m) => (
              <button
                key={m} type="button" onClick={() => toggleMethod(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize border transition-colors ${form.paymentMethods.includes(m) ? 'bg-gold-500 border-gold-500 text-graphite-950' : 'border-graphite-300 text-graphite-600'}`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </form>
    </div>
  );
}

export default InvoiceSettings;
