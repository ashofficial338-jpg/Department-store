import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Eye, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, Button, Modal, Input, Select, SearchBox, StatusBadge, ConfirmDialog } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';
import { customerService } from '../../services/index.js';
import { useDebounce } from '../../hooks/useDebounce.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

const EMPTY = { name: '', phone: '', email: '', address: '', gstin: '', customerType: 'retail', creditLimit: 0 };

export function CustomerMaster() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { user } = useAuth();
  const canManage = isAdmin(user);
  const debounced = useDebounce(search);

  function load() {
    setLoading(true);
    customerService.list({ search: debounced || undefined, page, limit: 20 })
      .then((r) => { setRows(r.data); setPagination(r.pagination); })
      .finally(() => setLoading(false));
  }
  useEffect(load, [debounced, page]); // eslint-disable-line

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, creditLimit: Number(form.creditLimit || 0) };
      if (editing) { await customerService.update(editing._id, payload); toast.success('Customer updated.'); }
      else { await customerService.create(payload); toast.success('Customer created.'); }
      setModalOpen(false); setForm(EMPTY); setEditing(null);
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  function openCreate() { setEditing(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(row) {
    setEditing(row);
    setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, row[k] ?? EMPTY[k]])));
    setModalOpen(true);
  }

  async function handleDelete() {
    try {
      await customerService.remove(deleteTarget._id);
      toast.success('Customer deleted.');
      setDeleteTarget(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  async function openDashboard(row) {
    const res = await customerService.dashboard(row._id);
    setDashboard(res.data);
  }

  return (
    <div>
      <PageHeader title="Customer Master" actions={<Button icon={Plus} onClick={openCreate}>Add Customer</Button>} />
      <div className="mb-4"><SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search by name or phone..." className="w-72" /></div>

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No customers found."
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
        columns={[
          { key: 'customerId', header: 'ID', render: (r) => <span className="font-mono text-xs">{r.customerId}</span> },
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'phone', header: 'Phone' },
          { key: 'customerType', header: 'Type', render: (r) => <span className="capitalize">{r.customerType}</span> },
          { key: 'loyaltyPoints', header: 'Loyalty Pts' },
          { key: 'outstanding', header: 'Outstanding', render: (r) => <span className={r.outstanding > 0 ? 'text-rose-600' : ''}>{formatCurrency(r.outstanding)}</span> },
          {
            key: 'actions', header: '', render: (r) => (
              <div className="flex items-center gap-1 justify-end">
                <button onClick={() => openDashboard(r)} title="View" className="p-1.5 rounded-lg hover:bg-gold-50 text-gold-600"><Eye size={14} /></button>
                {canManage && (
                  <>
                    <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded-lg hover:bg-graphite-100 text-graphite-500"><Pencil size={14} /></button>
                    <button onClick={() => setDeleteTarget(r)} title="Delete" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Customer' : 'Add Customer'}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="cust-form" loading={saving}>Save</Button></>}
      >
        <form id="cust-form" onSubmit={handleSubmit} className="space-y-4">
          <Input label="Name" required value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <Input label="Phone" required value={form.phone} onChange={(e) => setForm((s) => ({ ...s, phone: e.target.value }))} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} />
          <Input label="Address" value={form.address} onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))} />
          <Input label="GSTIN (for corporate)" value={form.gstin} onChange={(e) => setForm((s) => ({ ...s, gstin: e.target.value }))} />
          <Select label="Customer Type" value={form.customerType} onChange={(e) => setForm((s) => ({ ...s, customerType: e.target.value }))}>
            <option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="corporate">Corporate</option>
          </Select>
          <Input label="Credit Limit" type="number" value={form.creditLimit} onChange={(e) => setForm((s) => ({ ...s, creditLimit: e.target.value }))} />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete customer?" description={`"${deleteTarget?.name}" will be removed from lists and billing. Their past invoices are kept.`} confirmLabel="Delete"
      />

      <Modal open={!!dashboard} onClose={() => setDashboard(null)} title={dashboard?.customer?.name} size="lg">
        {dashboard && (
          <div>
            <div className="grid grid-cols-4 gap-3 mb-6">
              <Stat label="Total Purchases" value={formatCurrency(dashboard.totalPurchases)} />
              <Stat label="Orders" value={dashboard.orderCount} />
              <Stat label="Avg Order Value" value={formatCurrency(dashboard.avgOrderValue)} />
              <Stat label="Outstanding" value={formatCurrency(dashboard.outstanding)} accent={dashboard.outstanding > 0} />
            </div>
            <h4 className="text-sm font-semibold mb-2">Recent Purchases</h4>
            <div className="space-y-1.5">
              {dashboard.recentPurchases.map((s) => (
                <div key={s._id} className="flex justify-between text-sm px-3 py-2 rounded-lg" style={{ background: 'var(--bg-surface-muted)' }}>
                  <span className="font-mono text-xs">{s.invoiceNumber}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{formatDate(s.createdAt)}</span>
                  <StatusBadge status={s.status} />
                  <span className="font-medium">{formatCurrency(s.grandTotal)}</span>
                </div>
              ))}
              {dashboard.recentPurchases.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No purchases yet.</p>}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--bg-surface-muted)' }}>
      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className={`text-lg font-display font-semibold ${accent ? 'text-rose-600' : ''}`}>{value}</div>
    </div>
  );
}

export default CustomerMaster;
