import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { PageHeader, DataTable, Button, Modal, Input, Select, ConfirmDialog } from '../../components/ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdmin } from '../../utils/permissions.js';
import { expenseService, storeService } from '../../services/index.js';
import { formatCurrency, formatDate } from '../../utils/format.js';

const CATEGORIES = ['rent', 'utilities', 'salaries', 'marketing', 'logistics', 'maintenance', 'supplies', 'other'];
const EMPTY = { category: 'other', description: '', amount: '', paymentMethod: 'cash', store: '', expenseDate: new Date().toISOString().slice(0, 10) };

export function Expenses() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [stores, setStores] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const { user } = useAuth();
  const canManage = isAdmin(user);

  function load() {
    setLoading(true);
    expenseService.list({ limit: 30 }).then((r) => { setRows(r.data); setTotal(r.totalAmount); }).finally(() => setLoading(false));
  }
  useEffect(() => { load(); storeService.listAll().then((r) => setStores(r.data)); }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, amount: Number(form.amount), store: form.store || undefined };
      if (editing) { await expenseService.update(editing._id, payload); toast.success('Expense updated.'); }
      else { await expenseService.create(payload); toast.success('Expense recorded.'); }
      setModalOpen(false); setForm(EMPTY); setEditing(null);
      load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  }

  function openCreate() { setEditing(null); setForm(EMPTY); setModalOpen(true); }
  function openEdit(row) {
    setEditing(row);
    setForm({
      category: row.category, description: row.description, amount: row.amount, paymentMethod: row.paymentMethod,
      store: row.store?._id || row.store || '', expenseDate: (row.expenseDate || '').slice(0, 10),
    });
    setModalOpen(true);
  }

  async function handleDelete() {
    try {
      await expenseService.remove(deleteTarget._id);
      toast.success('Expense deleted.');
      setDeleteTarget(null);
      load();
    } catch (err) { toast.error(err.message); }
  }

  return (
    <div>
      <PageHeader title="Expenses" crumbs={[{ label: 'Finance' }, { label: 'Expenses' }]} actions={<Button icon={Plus} onClick={openCreate}>Add Expense</Button>} />
      <div className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>Total (recent): <strong>{formatCurrency(total)}</strong></div>

      <DataTable
        loading={loading}
        rows={rows}
        emptyTitle="No expenses recorded yet."
        emptyAction={<Button icon={Plus} onClick={openCreate}>Add Expense</Button>}
        columns={[
          { key: 'expenseDate', header: 'Date', render: (r) => formatDate(r.expenseDate) },
          { key: 'category', header: 'Category', render: (r) => <span className="capitalize">{r.category}</span> },
          { key: 'description', header: 'Description' },
          { key: 'paymentMethod', header: 'Method', render: (r) => <span className="capitalize">{r.paymentMethod.replace('_', ' ')}</span> },
          { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount) },
          {
            key: 'actions', header: '', render: (r) => canManage && (
              <div className="flex items-center gap-1 justify-end">
                <button onClick={() => openEdit(r)} title="Edit" className="p-1.5 rounded-lg hover:bg-graphite-100 text-graphite-500"><Pencil size={14} /></button>
                <button onClick={() => setDeleteTarget(r)} title="Delete" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 size={14} /></button>
              </div>
            ),
          },
        ]}
      />

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Expense' : 'Add Expense'}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="expense-form" loading={saving}>Save</Button></>}
      >
        <form id="expense-form" onSubmit={handleSubmit} className="space-y-4">
          <Select label="Category" value={form.category} onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input label="Description" required value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
          <Input label="Amount" type="number" required value={form.amount} onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))} />
          <Select label="Payment Method" value={form.paymentMethod} onChange={(e) => setForm((s) => ({ ...s, paymentMethod: e.target.value }))}>
            <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank_transfer">Bank Transfer</option>
          </Select>
          <Select label="Store (optional)" value={form.store} onChange={(e) => setForm((s) => ({ ...s, store: e.target.value }))}>
            <option value="">Not applicable</option>
            {stores.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
          </Select>
          <Input label="Date" type="date" value={form.expenseDate} onChange={(e) => setForm((s) => ({ ...s, expenseDate: e.target.value }))} />
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title="Delete expense?" description={`"${deleteTarget?.description}" (${formatCurrency(deleteTarget?.amount)}) will be deleted and the amount returned to the cash/bank balance.`} confirmLabel="Delete"
      />
    </div>
  );
}

export default Expenses;
