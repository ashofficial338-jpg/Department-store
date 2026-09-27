import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { PageHeader, DataTable, Button, Modal, StatusBadge, Input, Select } from '../../components/ui/index.js';
import { userService, storeService } from '../../services/index.js';
import { formatDateTime } from '../../utils/format.js';

const ROLES = ['super_admin', 'admin', 'store_manager', 'dc_manager', 'cashier', 'accountant', 'purchase_manager', 'inventory_manager', 'sales_manager', 'auditor'];

function roleLabel(r) { return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()); }

export function UsersSettings() {
  const [rows, setRows] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'cashier', store: '' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await userService.list({ limit: 50 });
      setRows(res.data);
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
          { key: 'role', header: 'Role', render: (r) => roleLabel(r.role) },
          { key: 'store', header: 'Store', render: (r) => r.store?.name || '-' },
          { key: 'lastLoginAt', header: 'Last Login', render: (r) => formatDateTime(r.lastLoginAt) },
          { key: 'isActive', header: 'Status', render: (r) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} /> },
          { key: 'actions', header: '', render: (r) => <Button size="sm" variant="outline" onClick={() => toggleActive(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</Button> },
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
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
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
