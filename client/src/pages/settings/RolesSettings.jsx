import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, Plus, Trash2, ShieldCheck, Lock, Users } from 'lucide-react';
import { PageHeader, Button, Modal, Input, Select, ConfirmDialog } from '../../components/ui/index.js';
import { settingsService } from '../../services/index.js';

const MODULE_LABELS = {
  dashboard: 'Dashboard', pos: 'POS Billing', sales: 'Sales', products: 'Products', inventory: 'Inventory', dc: 'DC Management',
  purchasing: 'Purchasing', vendors: 'Vendors & Suppliers', customers: 'Customers', finance: 'Finance', reports: 'Reports', audit: 'Audit Log',
};

function CheckRow({ checked, disabled, onChange, label, description }) {
  return (
    <label className={`flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-colors ${disabled ? 'opacity-60' : 'cursor-pointer hover:border-gold-400'}`} style={{ borderColor: 'var(--border-subtle)' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} className="mt-0.5 w-4 h-4 accent-gold-500" />
      <span>
        <span className="block text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        {description && <span className="block text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</span>}
      </span>
    </label>
  );
}

export function RolesSettings() {
  const [catalog, setCatalog] = useState(null);
  const [roles, setRoles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ label: '', copyFrom: '' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function load(selectRole) {
    const [c, r] = await Promise.all([settingsService.permissions(), settingsService.roles()]);
    setCatalog(c.data);
    setRoles(r.data);
    const pick = r.data.find((x) => x.role === selectRole) || r.data.find((x) => !x.fullAccess) || r.data[0];
    setSelected(pick?.role || null);
    setDraft(pick ? { label: pick.label, permissions: pick.permissions } : null);
  }

  useEffect(() => { load().catch((e) => toast.error(e.message)).finally(() => setLoading(false)); }, []);

  const current = roles.find((r) => r.role === selected);
  const dirty = current && draft && (draft.label !== current.label
    || [...draft.permissions].sort().join() !== [...current.permissions].sort().join());

  const select = (role) => {
    if (dirty && !window.confirm('Discard unsaved changes to this role?')) return;
    const r = roles.find((x) => x.role === role);
    setSelected(role);
    setDraft({ label: r.label, permissions: r.permissions });
  };

  const toggle = (key) => setDraft((d) => {
    let perms = d.permissions.includes(key) ? d.permissions.filter((p) => p !== key) : [...d.permissions, key];
    // Dashboard sub-permissions are meaningless without the dashboard itself.
    if (key === 'dashboard' && !perms.includes('dashboard')) perms = perms.filter((p) => !p.startsWith('dashboard.'));
    if (key.startsWith('dashboard.') && perms.includes(key) && !perms.includes('dashboard')) perms = [...perms, 'dashboard'];
    return { ...d, permissions: perms };
  });

  async function save() {
    setSaving(true);
    try {
      await settingsService.updateRole(selected, { label: draft.label, permissions: draft.permissions });
      toast.success(`Saved permissions for ${draft.label}. Signed-in users get them within seconds.`);
      await load(selected);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function create(e) {
    e.preventDefault();
    try {
      const source = roles.find((r) => r.role === newRole.copyFrom);
      const permissions = source && !source.fullAccess ? source.permissions : ['dashboard'];
      const res = await settingsService.createRole({ label: newRole.label, permissions });
      toast.success(`Role "${res.data.label}" created.`);
      setCreateOpen(false);
      setNewRole({ label: '', copyFrom: '' });
      await load(res.data.role);
    } catch (err) { toast.error(err.message); }
  }

  async function remove() {
    try {
      await settingsService.deleteRole(selected);
      toast.success('Role deleted.');
      setConfirmDelete(false);
      await load();
    } catch (err) { toast.error(err.message); setConfirmDelete(false); }
  }

  const has = (k) => !!draft && (draft.permissions.includes('*') || draft.permissions.includes(k));
  const locked = !!current?.fullAccess;
  const dashboardOff = !has('dashboard');
  const grouped = useMemo(() => ({
    view: catalog?.dashboard.filter((p) => ['dashboard.sales', 'dashboard.expenses', 'dashboard.inventory', 'dashboard.financials'].includes(p.key)) || [],
    interact: catalog?.dashboard.filter((p) => ['dashboard.details', 'dashboard.filters', 'dashboard.export'].includes(p.key)) || [],
  }), [catalog]);

  if (loading) return null;

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        crumbs={[{ label: 'Settings', to: '/settings/system' }, { label: 'Roles & Permissions' }]}
        actions={<Button variant="gold" icon={Plus} onClick={() => setCreateOpen(true)}>New role</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-5">
        <div className="surface-card rounded-xl2 shadow-premium p-2 h-fit">
          {roles.map((r) => (
            <button
              key={r.role}
              type="button"
              onClick={() => select(r.role)}
              className={`w-full flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm text-left transition-colors ${selected === r.role ? 'bg-gold-500/10 text-gold-700' : 'hover:bg-gold-500/5'}`}
              style={selected === r.role ? undefined : { color: 'var(--text-primary)' }}
            >
              <span className="flex items-center gap-2 min-w-0">
                {r.fullAccess ? <ShieldCheck size={15} className="text-gold-600 shrink-0" /> : <span className="w-[15px]" />}
                <span className="truncate">{r.label}</span>
              </span>
              <span className="flex items-center gap-1 text-xs shrink-0" style={{ color: 'var(--text-muted)' }}><Users size={12} />{r.userCount}</span>
            </button>
          ))}
        </div>

        {current && draft && (
          <div className="surface-card rounded-xl2 shadow-premium p-5">
            <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
              <div className="flex-1 min-w-[220px] max-w-sm">
                <Input label="Role name" value={draft.label} disabled={locked} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Key: <code>{current.role}</code>{current.isSystem ? ' · built-in role' : ' · custom role'}</p>
              </div>
              {!locked && (
                <div className="flex gap-2">
                  {!current.isSystem && <Button variant="outline" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete</Button>}
                  <Button icon={Save} loading={saving} disabled={!dirty} onClick={save}>Save changes</Button>
                </div>
              )}
            </div>

            {locked ? (
              <div className="flex items-start gap-3 rounded-xl px-4 py-4 text-sm" style={{ background: 'var(--bg-surface-muted)', color: 'var(--text-secondary)' }}>
                <Lock size={16} className="text-gold-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Full access</div>
                  Administrators can view all dashboard data and detail pages, use filters and exports, and manage users, settings, and roles &amp; permissions.
                  This role can&apos;t be restricted, so the system can&apos;t be locked out.
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <section>
                  <h3 className="font-display text-base font-semibold mb-1">Dashboard: what this role can view</h3>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>View-only. Without a section, its cards, charts and data are hidden and blocked by the API.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <CheckRow checked={has('dashboard')} onChange={() => toggle('dashboard')} label="Dashboard" description="Open the dashboard page" />
                    {grouped.view.map((p) => <CheckRow key={p.key} checked={has(p.key)} disabled={dashboardOff} onChange={() => toggle(p.key)} label={p.label} description={p.description} />)}
                  </div>
                </section>
                <section>
                  <h3 className="font-display text-base font-semibold mb-1">Dashboard: interactions</h3>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>Off by default for non-admin roles. Detail pages and exports only include sections the role can view.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {grouped.interact.map((p) => <CheckRow key={p.key} checked={has(p.key)} disabled={dashboardOff} onChange={() => toggle(p.key)} label={p.label} description={p.description} />)}
                  </div>
                </section>
                <section>
                  <h3 className="font-display text-base font-semibold mb-1">Modules</h3>
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    Pages and APIs this role can use. Users, Settings and Roles &amp; Permissions are always restricted to administrators.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                    {catalog.modules.filter((m) => m !== 'dashboard').map((m) => (
                      <CheckRow key={m} checked={has(m)} onChange={() => toggle(m)} label={MODULE_LABELS[m] || m} />
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New role">
        <form onSubmit={create} className="space-y-4">
          <Input label="Role name" required value={newRole.label} onChange={(e) => setNewRole((s) => ({ ...s, label: e.target.value }))} placeholder="e.g. Pharmacist" />
          <Select label="Start with permissions from" value={newRole.copyFrom} onChange={(e) => setNewRole((s) => ({ ...s, copyFrom: e.target.value }))}>
            <option value="">Dashboard only</option>
            {roles.filter((r) => !r.fullAccess).map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
          </Select>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="gold">Create role</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete role?"
        confirmLabel="Delete role"
        description={`Delete the "${current?.label}" role? Roles that are still assigned to users can't be deleted.`}
      />
    </div>
  );
}

export default RolesSettings;
