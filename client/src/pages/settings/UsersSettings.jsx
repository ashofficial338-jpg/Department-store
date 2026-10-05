import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { PageHeader, DataTable, Button, Modal, StatusBadge, Input, Select } from '../../components/ui/index.js';
import { userService, storeService } from '../../services/index.js';
import { formatDateTime } from '../../utils/format.js';
import { useAuth } from '../../context/AuthContext.jsx';

function roleLabel(r) { return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

export function UsersSettings() {
  const [rows, setRows] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', store: '' });
  const [saving, setSaving] = useState(false);
  const [roleOptions, setRoleOptions] = useState([]);
  const { user: me } = useAuth();
  // Only a Super Admin can grant (or change) the Super Admin role; the API enforces this too.
  const assignable = roleOptions.filter((r) => r.role !== 'super_admin' || me?.role === 'super_admin');
  const labelFor = (role) => roleOptions.find((r) => r.role === role)?.label || roleLabel(role);

  async function load() {
    setLoading(true);
    try {
      const res = await userService.list({ limit: 50 });
      setRows(res.data);
      setRoleOptions(res.roleOptions || (res.roles || []).map((r) => ({ role: r, label: roleLabel(r) })));
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); storeService.listAll().then((r) => setStores(r.data)); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await userService.create({ ...form, store: form.store || undefined });
      toast.success('User created.');
      setModalOpen(false);
      setForm({ name: '', email: '', password: '', role: 'cashier', store: '' });
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  async function changeRole(row, role) {
    if (role === row.role) return;
    try {
      await userService.update(row._id, { role });
      toast.success(`${row.name} is now ${labelFor(role)}.`);
      load();
    } catch (err) { toast.error(err.message); }
  }

  async function toggleActive(row) {
    try {
      if (row.isActive) { await userService.remove(row._id); } else { await userService.update(row._id, { isActive: true }); }
      load();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div>
      <PageHeader title="Users" crumbs={[{ label: 'Settings', to: '/settings/system' }, { label: 'Users' }]} actions={<Button icon={Plus} onClick={() => setModalOpen(true)}>Add User</Button>} />

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No users found."
        columns={[
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'email', header: 'Email' },
          {
            key: 'role',
            header: 'Role',
            render: (r) => (r._id === me?._id || (r.role === 'super_admin' && me?.role !== 'super_admin')
              ? labelFor(r.role)
              : (
                <select
                  value={r.role}
                  onChange={(e) => changeRole(r, e.target.value)}
                  aria-label={`Role for ${r.name}`}
                  className="rounded-lg border px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-gold-400"
                  style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-primary)', background: 'var(--bg-surface)' }}
                >
                  {assignable.map((o) => <option key={o.role} value={o.role}>{o.label}</option>)}
                </select>
              )),
          },
          { key: 'store', header: 'Store', render: (r) => r.store?.name || '-' },
          { key: 'lastLoginAt', header: 'Last Login', render: (r) => formatDateTime(r.lastLoginAt) },
          { key: 'isActive', header: 'Status', render: (r) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} /> },
          { key: 'actions', header: '', render: (r) => (r._id === me?._id ? null : <Button size="sm" variant="outline" onClick={() => toggleActive(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</Button>) },
        ]}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add User"
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="user-form" loading={saving}>Create</Button></>}
      >
        <form id="user-form" onSubmit={handleCreate} className="space-y-4">
          <Input label="Full Name" required value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
          <Input label="Password" type="password" required minLength={6} value={form.password} onChange={(e) => setForm((s) => ({ ...s, password: e.target.value }))} />
          <Select label="Role" required value={form.role} onChange={(e) => setForm((s) => ({ ...s, role: e.target.value }))}>
            {assignable.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
          </Select>
          <Select label="Store (optional)" value={form.store} onChange={(e) => setForm((s) => ({ ...s, store: e.target.value }))}>
            <option value="">Not assigned</option>
            {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
        </form>
      </Modal>
    </div>
  );
}

export default UsersSettings;
