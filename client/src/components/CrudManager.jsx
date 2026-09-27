import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader, DataTable, Button, Modal, SearchBox, ConfirmDialog } from './ui/index.js';
import { useDebounce } from '../hooks/useDebounce.js';
import { useAuth } from '../context/AuthContext.jsx';
import { isAdmin } from '../utils/permissions.js';

// Generic list + create/edit modal + delete for straightforward master-data entities
// (Category, Brand, Store, DistributionCenter, Supplier, TaxRate...).
export function CrudManager({ title, entityLabel, service, columns, fields, defaultValues = {}, searchable = true, extraActions, crumbs }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultValues);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const debouncedSearch = useDebounce(search);
  const { user } = useAuth();
  const canManage = isAdmin(user);

  async function load() {
    setLoading(true);
    try {
      const res = await service.list({ search: debouncedSearch, page, limit: 20 });
      setRows(res.data);
      setPagination(res.pagination);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [debouncedSearch, page]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCreate() {
    setEditing(null);
    setForm(defaultValues);
    setModalOpen(true);
  }
  function openEdit(row) {
    setEditing(row);
    setForm({ ...defaultValues, ...row });
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await service.update(editing._id, form);
        toast.success(`${entityLabel} updated.`);
      } else {
        await service.create(form);
        toast.success(`${entityLabel} created.`);
      }
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await service.remove(deleteTarget._id);
      toast.success(`${entityLabel} removed.`);
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const fullColumns = [
    ...columns,
    {
      key: 'actions', header: '', render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          {extraActions?.(row)}
          {canManage && (
            <>
              <button onClick={() => openEdit(row)} title="Edit" className="p-1.5 rounded-lg hover:bg-graphite-100 text-graphite-500"><Pencil size={14} /></button>
              <button onClick={() => setDeleteTarget(row)} title="Delete" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 size={14} /></button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title={title} crumbs={crumbs} actions={<Button icon={Plus} onClick={openCreate}>Add {entityLabel}</Button>} />

      {searchable && (
        <div className="mb-4"><SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={`Search ${entityLabel.toLowerCase()}s...`} className="max-w-sm" /></div>
      )}

      <DataTable
        columns={fullColumns}
        rows={rows}
        loading={loading}
        emptyTitle={`No ${entityLabel.toLowerCase()}s found.`}
        emptyAction={<Button icon={Plus} onClick={openCreate}>Add {entityLabel}</Button>}
        pagination={pagination ? { ...pagination, onPageChange: setPage } : null}
      />

      <Modal
        open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${entityLabel}` : `Add ${entityLabel}`}
        footer={<><Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" form="crud-form" loading={saving}>Save</Button></>}
      >
        <form id="crud-form" onSubmit={handleSubmit} className="space-y-4">
          {fields.map((f) => (
            <div key={f.name}>
              {f.render ? f.render(form, setForm) : (
                <f.component
                  label={f.label}
                  required={f.required}
                  value={form[f.name] ?? ''}
                  onChange={(e) => setForm((s) => ({ ...s, [f.name]: e.target.value }))}
                  {...(f.props || {})}
                >
                  {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </f.component>
              )}
            </div>
          ))}
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={handleDelete}
        title={`Remove ${entityLabel}?`} description={`This will deactivate "${deleteTarget?.name}". This action can be reversed by an administrator.`} confirmLabel="Remove"
      />
    </div>
  );
}

export default CrudManager;
